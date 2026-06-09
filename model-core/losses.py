"""
losses.py
=========
Loss functions for long-tailed (class-imbalanced) classification.

The breast MRI dataset has severe class imbalance: Luminal A accounts for
approximately 11.6× more samples than HER2.  Standard cross-entropy assigns
equal penalty to all misclassifications, which causes the model to ignore rare
classes.  These loss functions address the imbalance at the objective level.

Loss schedule in Stage 2:
    Epochs 0–39  : LDAMLoss  — per-class additive margins (push minority classes apart)
    Epochs 40–79 : ClassBalancedCE — effective-number re-weighting (smooth fine-tune)

    CBFocalLoss and ConsistencyKL are available but not used by default.

Pipeline position:
    config.py (class counts) → THIS MODULE → main.py (Stage 2 training loop)

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


# ── Utility: Effective-Number Class Weights ────────────────────────────────────

def effective_num_weights(
    class_counts: list,
    beta: float = 0.9999,
) -> torch.Tensor:
    """
    Compute class weights using the Effective Number of Samples method.

    The effective number of samples E_j accounts for marginal diminishing
    returns as more samples of class j are added:

        Effective number (Cui et al. CVPR 2019, Eq. 1):
            E_j = (1 - beta^n_j) / (1 - beta)

        Class weight (normalised to sum to num_classes):
            w_j = (1 - beta) / E_j   then   w ← w * C / sum(w)

    As beta → 1, E_j → n_j (recovers standard inverse-frequency weighting).

    Reference:
        Cui Y. et al. "Class-Balanced Loss Based on Effective Number of
        Samples." CVPR 2019. arXiv:1901.05555

    Args:
        class_counts (list): Sample count per class, e.g. [441, 138, 38, 78].
        beta (float): Hyperparameter controlling diminishing returns.
            Typical values: 0.9, 0.99, 0.999, 0.9999. Default 0.9999.

    Returns:
        torch.Tensor: Float32 weight tensor of shape (num_classes,), normalised
            so that weights sum to num_classes.
    """
    counts = np.asarray(class_counts, dtype=np.float64)
    eff    = 1.0 - np.power(beta, counts)                         # E_j = 1 - beta^n_j
    w      = (1.0 - beta) / np.maximum(eff, 1e-12)               # w_j = (1-beta) / E_j
    w      = w / w.sum() * len(counts)                            # normalise to sum = C
    return torch.tensor(w, dtype=torch.float32)


# ── LDAM Loss ─────────────────────────────────────────────────────────────────

class LDAMLoss(nn.Module):
    """
    Label-Distribution-Aware Margin (LDAM) loss for long-tailed classification.

    LDAM adds a per-class additive margin Δ_j to the true-class logit before
    softmax, forcing the model to achieve a larger margin for rare classes:

        LDAM margin (Cao et al. NeurIPS 2019, Theorem 2):
            Δ_j = C / (n_j ^ (1/4))
        normalised so that max_j(Δ_j) = max_m.

        Modified logit for class j on sample (x, y=j):
            f̃_j(x) = f_j(x) - Δ_j
            Loss = CE( s * f̃(x), y )
        where s is a temperature scale factor (s=15.0 default).

    For MixUp soft labels (target.dim() == 2), falls back to weighted soft CE
    because the class index is ambiguous when the label is a distribution.

    Reference:
        Cao K. et al. "Learning Imbalanced Datasets with Label-Distribution-Aware
        Margin Loss." NeurIPS 2019. arXiv:1906.07413

    Args:
        class_counts (list): Per-class sample counts.
        max_m (float): Maximum additive margin (normalisation ceiling). Default 0.3.
        s (float): Logit temperature scale. Default 30.0.
        weight (Optional[torch.Tensor]): Additional class weights. Default None.
        label_smoothing (float): Label smoothing coefficient. Default 0.0.
    """

    def __init__(
        self,
        class_counts: list,
        max_m: float = 0.3,
        s: float = 30.0,
        weight: torch.Tensor | None = None,
        label_smoothing: float = 0.0,
    ):
        super().__init__()
        counts = np.asarray(class_counts, dtype=np.float64)

        # Compute per-class margins: m_j = C / n_j^(1/4), scaled to max_m
        m         = 1.0 / np.power(counts, 0.25)   # m_j ∝ n_j^(-1/4)
        m         = m * (max_m / m.max())           # normalise: max margin = max_m
        self.register_buffer("m_list", torch.tensor(m, dtype=torch.float32))

        self.s              = s               # temperature scale
        self.label_smoothing = label_smoothing
        # Default weight = uniform; caller can pass effective-number weights
        self.register_buffer(
            "weight", weight if weight is not None else torch.ones(len(counts))
        )

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """
        Compute LDAM loss.

        Args:
            logits (torch.Tensor): Shape (B, C) — unnormalised class scores.
            target (torch.Tensor): Shape (B,) integer labels OR (B, C) soft labels
                (produced by MixUp). Soft labels trigger the soft-CE fallback.

        Returns:
            torch.Tensor: Scalar loss value.
        """
        # MixUp produces 2-D soft targets; LDAM margin is class-specific and
        # undefined for a label distribution, so fall back to soft CE.
        if target.dim() == 2:
            return _soft_ce(logits * self.s, target, self.weight)

        # Build margin mask: subtract Δ_j only at the true-class position
        index   = torch.zeros_like(logits, dtype=torch.bool)
        index.scatter_(1, target.unsqueeze(1), True)   # True at column y_i

        # Batch-wise margin: m_list[y_i] for each sample in the batch
        batch_m = self.m_list[target].unsqueeze(1)     # (B, 1) → broadcasts to (B, C)
        logits_m = logits - batch_m * index.float()    # f̃_j(x) = f_j(x) - Δ_j·𝟏[j=y]

        return F.cross_entropy(
            self.s * logits_m, target,
            weight=self.weight.to(logits.device),
            label_smoothing=self.label_smoothing,
        )


# ── Soft Cross-Entropy Helper ─────────────────────────────────────────────────

def _soft_ce(
    logits: torch.Tensor,
    soft_targets: torch.Tensor,
    weight: torch.Tensor | None = None,
) -> torch.Tensor:
    """
    Weighted soft cross-entropy for MixUp / CutMix soft labels.

    Standard CE requires integer class indices; MixUp produces distributions.
    This helper computes: Loss = -Σ_c w_c * q_c * log p_c
    where q is the soft target distribution and p = softmax(logits).

    Args:
        logits (torch.Tensor): Shape (B, C).
        soft_targets (torch.Tensor): Shape (B, C) — soft label distributions.
        weight (Optional[torch.Tensor]): Per-class weights (C,).

    Returns:
        torch.Tensor: Scalar mean cross-entropy.
    """
    logp = F.log_softmax(logits, dim=-1)   # (B, C) — log probability
    if weight is not None:
        w          = weight.to(logits.device)   # (C,)
        per_sample = -(soft_targets * logp * w.unsqueeze(0)).sum(dim=-1)
    else:
        per_sample = -(soft_targets * logp).sum(dim=-1)
    return per_sample.mean()


# ── Class-Balanced Cross-Entropy ──────────────────────────────────────────────

class ClassBalancedCE(nn.Module):
    """
    Cross-entropy with effective-number class re-weighting (Cui et al. 2019).

    Used in Stage 2 epochs 40–79 after LDAM has established minority-class
    margins.  CB-CE provides a smoother fine-tuning phase: the effective-number
    weights are less aggressive than LDAM margins.

    Soft-label fallback (MixUp compatible): if ``target.dim() == 2``, uses
    the weighted soft CE helper instead of standard F.cross_entropy.

    Args:
        class_counts (list): Per-class sample counts.
        beta (float): Effective-number hyperparameter. Default 0.9999.
        label_smoothing (float): Label smoothing coefficient. Default 0.0.
    """

    def __init__(
        self,
        class_counts: list,
        beta: float = 0.9999,
        label_smoothing: float = 0.0,
    ):
        super().__init__()
        self.register_buffer("weight", effective_num_weights(class_counts, beta))
        self.label_smoothing = label_smoothing

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """
        Compute class-balanced CE loss.

        Args:
            logits (torch.Tensor): Shape (B, C).
            target (torch.Tensor): Shape (B,) integer OR (B, C) soft labels.

        Returns:
            torch.Tensor: Scalar loss.
        """
        if target.dim() == 2:
            return _soft_ce(logits, target, self.weight)
        return F.cross_entropy(
            logits, target,
            weight=self.weight.to(logits.device),
            label_smoothing=self.label_smoothing,
        )


# ── CB Focal Loss (fallback) ──────────────────────────────────────────────────

class CBFocalLoss(nn.Module):
    """
    Class-balanced focal loss (fallback if LDAM destabilises training).

    Combines focal loss (Lin et al. 2017) with CB re-weighting (Cui et al. 2019):
        Loss = -w_j * (1 - p_j)^gamma * log(p_j)
    where p_j is the predicted probability for the true class j,
    and gamma down-weights easy examples (high p_j).

    Not used by default. Activate by replacing LDAMLoss in main.py if training
    diverges during Stage 2.

    Args:
        class_counts (list): Per-class sample counts.
        beta (float): CB effective-number parameter. Default 0.9999.
        gamma (float): Focal loss focusing parameter. Default 2.0.
    """

    def __init__(self, class_counts: list, beta: float = 0.9999, gamma: float = 2.0):
        super().__init__()
        self.register_buffer("weight", effective_num_weights(class_counts, beta))
        self.gamma = gamma

    def forward(self, logits: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        """
        Compute CB-focal loss.

        Args:
            logits (torch.Tensor): Shape (B, C).
            target (torch.Tensor): Shape (B,) integer OR (B, C) soft labels.

        Returns:
            torch.Tensor: Scalar loss.
        """
        if target.dim() == 2:
            target_idx = target.argmax(dim=-1)   # use majority class for focal weight
        else:
            target_idx = target

        logp  = F.log_softmax(logits, dim=-1)
        p     = logp.exp()
        w     = self.weight.to(logits.device)[target_idx]   # (B,) per-sample CB weights
        pt    = p.gather(1, target_idx.unsqueeze(1)).squeeze(1).clamp(1e-8, 1.0)
        logpt = logp.gather(1, target_idx.unsqueeze(1)).squeeze(1)

        # Focal: -w_j * (1 - p_j)^gamma * log(p_j)
        loss  = -w * ((1 - pt) ** self.gamma) * logpt
        return loss.mean()


# ── Consistency KL Loss (disabled by default) ─────────────────────────────────

class ConsistencyKL(nn.Module):
    """
    Symmetric KL divergence between logit sets from two augmented views.

    Used to encourage prediction consistency across augmentations (self-distillation).
    Symmetric KL: L = 0.5 * (KL(p1 || p2) + KL(p2 || p1))

    CURRENTLY DISABLED (consistency_weight=0.0 in Stage2Config).
    Rationale: with batch_size=2, a 2-sample estimate of KL divergence has
    extremely high variance and degrades training.  Re-enable if effective
    batch size (batch × accum_steps) reaches >= 8.
    """

    def forward(self, logits1: torch.Tensor, logits2: torch.Tensor) -> torch.Tensor:
        """
        Compute symmetric KL loss between two augmented view predictions.

        Args:
            logits1 (torch.Tensor): Shape (B, C) — logits for view 1.
            logits2 (torch.Tensor): Shape (B, C) — logits for view 2.

        Returns:
            torch.Tensor: Scalar symmetric KL divergence.
        """
        p1   = F.log_softmax(logits1, dim=-1)   # log P(y | x_aug1)
        p2   = F.log_softmax(logits2, dim=-1)   # log P(y | x_aug2)
        q1   = p1.exp()
        q2   = p2.exp()
        # KL(p1 || p2) = Σ q1 * (log q1 - log q2)
        kl12 = (q1 * (p1 - p2)).sum(-1)
        # KL(p2 || p1) = Σ q2 * (log q2 - log q1)
        kl21 = (q2 * (p2 - p1)).sum(-1)
        return 0.5 * (kl12 + kl21).mean()   # symmetric: 0.5 * (KL12 + KL21)
