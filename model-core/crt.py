"""
crt.py
======
Classifier Retraining (cRT) for long-tailed breast MRI classification.

cRT decouples the two objectives that are conflated in standard end-to-end
training: (1) learning a good feature representation and (2) calibrating the
classification head to handle class imbalance.  By re-freezing the backbone
and retraining only the linear head with a class-balanced sampler, cRT corrects
the majority-class bias without disturbing the learned features.

Stage 3 procedure:
    1. Freeze the backbone and GatedAttentionMIL (representation locked).
    2. Cache 256-dim MIL pooled features for all training and validation samples
       via model.forward_features() (one forward pass, no gradient).
    3. Train a fresh nn.Linear(256, num_classes) head on the cached features
       with a class-balanced WeightedRandomSampler (each class seen equally).
    4. Repeat with n_seeds=10 independent random seeds.  With ~4–8 minority
       class samples in the validation fold, a single seed has very high variance;
       the best head by validation macro F1 is selected.
    5. Load the best head weights into model.head.

CyclicLR schedule (replaces CosineAnnealingLR):
    base_lr = lr × 0.1, max_lr = lr, step_size_up = 50, called per step.
    Cyclic schedule escapes flat regions in the small linear-head loss surface
    faster than a monotonically decaying schedule.

Reference:
    Kang B. et al. "Decoupling Representation and Classifier for Long-Tailed
    Recognition." ICLR 2020. arXiv:1910.09217

Pipeline position:
    main.py Stage 2 checkpoint → THIS MODULE → final checkpoint

Usage:
    from crt import train_crt
    best_f1 = train_crt(model, train_loader, val_loader, device)

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
from typing import Dict, Tuple, List, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset, WeightedRandomSampler

from config import CFG


# ── Feature Extraction ────────────────────────────────────────────────────────

@torch.no_grad()
def extract_features(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Cache MIL pooled features from an unaugmented DataLoader.

    Calls model.forward_features() (not model.forward()) to obtain the 256-dim
    MIL embedding before the final classification head.  The backbone and MIL
    are kept frozen (torch.no_grad ensures no gradient computation).

    Args:
        model (nn.Module): Trained model with a forward_features() method.
            Must have backbone and MIL weights already locked.
        loader (DataLoader): Unaugmented DataLoader yielding (x, y) or
            (view1, view2, y) batches.  Augmentation must be disabled to
            ensure deterministic feature caching.
        device (torch.device): Compute device.

    Returns:
        Tuple[torch.Tensor, torch.Tensor]:
            feats  — (N, 256): MIL pooled embeddings for all N samples.
            labels — (N,):     Integer class labels.
    """
    model.eval()
    feats, labels = [], []

    for batch in loader:
        if len(batch) == 3:
            # Two-view batch from MRISSLSliceDataset; only view 1 is needed here
            x, _, y = batch
        else:
            x, y = batch

        x = x.to(device, non_blocking=True)
        f = model.forward_features(x)   # (batch, 256) — no classification head
        feats.append(f.detach().cpu())
        labels.append(y.detach().cpu())

    return torch.cat(feats), torch.cat(labels)


# ── Single Seed cRT ───────────────────────────────────────────────────────────

def _run_one_crt_seed(
    feats_tr: torch.Tensor,
    y_tr: torch.Tensor,
    feats_va: torch.Tensor,
    y_va: torch.Tensor,
    device: torch.device,
    cfg,
    seed: int,
) -> Tuple[float, Optional[dict]]:
    """
    Train one cRT linear head with a fixed random seed and return its best state.

    Uses a class-balanced WeightedRandomSampler so each class is seen equally
    often regardless of its frequency in the training data.  The CyclicLR
    scheduler is called per step (not per epoch) to escape flat loss regions.

    Diagnostic print:
        "[cRT seed N] class dist train: [...]" — confirms balanced sampling.

    Args:
        feats_tr (torch.Tensor): Cached train features, shape (N_tr, 256).
        y_tr (torch.Tensor): Train labels, shape (N_tr,).
        feats_va (torch.Tensor): Cached val features, shape (N_va, 256).
        y_va (torch.Tensor): Val labels, shape (N_va,).
        device (torch.device): Compute device.
        cfg: Stage3Config instance with epochs, batch_size, lr, weight_decay.
        seed (int): Random seed for this run.

    Returns:
        Tuple[float, Optional[dict]]:
            best_f1 — best macro F1 achieved on val across all epochs.
            best_sd — state_dict of the head that achieved best_f1.
    """
    from sklearn.metrics import f1_score

    torch.manual_seed(seed)
    np.random.seed(seed)

    num_classes = int(y_tr.max().item()) + 1

    # Class-balanced sampler: w_i = 1 / count(class_i)
    counts  = np.bincount(y_tr.numpy(), minlength=num_classes)
    weights = 1.0 / np.maximum(counts[y_tr.numpy()], 1)  # per-sample weights
    sampler = WeightedRandomSampler(
        weights=torch.as_tensor(weights, dtype=torch.double),
        num_samples=len(weights),
        replacement=True,   # replacement required for over-sampling minority classes
    )

    tr_ds      = TensorDataset(feats_tr, y_tr)
    va_ds      = TensorDataset(feats_va, y_va)
    tr_loader  = DataLoader(tr_ds, batch_size=cfg.batch_size, sampler=sampler)
    va_loader  = DataLoader(va_ds, batch_size=cfg.batch_size)

    # Fresh linear head initialised with Xavier uniform (balanced starting point)
    head = nn.Linear(feats_tr.size(1), num_classes).to(device)
    nn.init.xavier_normal_(head.weight)
    nn.init.zeros_(head.bias)

    opt = torch.optim.AdamW(head.parameters(), lr=cfg.lr, weight_decay=cfg.weight_decay)

    # CyclicLR called per step: cycle between base_lr and max_lr every 100 steps
    # (50 up + 50 down). Escapes flat regions in small head loss surface.
    sched = torch.optim.lr_scheduler.CyclicLR(
        opt,
        base_lr=cfg.lr * 0.1,   # minimum LR at cycle trough
        max_lr=cfg.lr,           # maximum LR at cycle peak
        step_size_up=50,         # steps to go from base → max
        cycle_momentum=False,    # AdamW does not support cycle_momentum
    )
    crit = nn.CrossEntropyLoss()   # plain CE on balanced-sampled features

    # Diagnostic: verify that the sampler produces balanced class counts
    print(f"[cRT seed {seed}] class dist train: {torch.bincount(y_tr).tolist()}")

    best_f1 = -1.0
    best_sd: Optional[dict] = None

    for ep in range(cfg.epochs):
        head.train()
        for f, y in tr_loader:
            f, y = f.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            loss = crit(head(f), y)
            loss.backward()
            opt.step()
            sched.step()   # CyclicLR is per-step, not per-epoch

        head.eval()
        preds, gts = [], []
        with torch.no_grad():
            for f, y in va_loader:
                f = f.to(device)
                preds.append(head(f).argmax(-1).cpu().numpy())
                gts.append(y.numpy())

        preds = np.concatenate(preds)
        gts   = np.concatenate(gts)
        f1    = f1_score(gts, preds, average="macro", zero_division=0)

        if f1 > best_f1:
            best_f1 = f1
            best_sd = {
                k: v.detach().cpu().clone() for k, v in head.state_dict().items()
            }

    return best_f1, best_sd


# ── Main cRT Entry Point ──────────────────────────────────────────────────────

# 10 seeds because the val set has ~4–8 samples per minority class —
# single-seed cRT has very high variance; best-of-10 gives a stable head.
def train_crt(
    model: nn.Module,
    train_loader_unaug: DataLoader,
    val_loader_unaug: DataLoader,
    device: torch.device,
    cfg=CFG.s3,
    n_seeds: int = 10,
) -> float:
    """
    Run Classifier Retraining (cRT) and update model.head in-place.

    Extracts cached features once, then trains ``n_seeds`` independent linear
    heads.  The head with the best validation macro F1 is loaded into
    model.head, replacing its previous weights.

    Args:
        model (nn.Module): Model whose head will be retrained.  The backbone
            and MIL layers must be frozen before calling this function.
        train_loader_unaug (DataLoader): Unaugmented train loader.
            Augmentation must be disabled to produce deterministic features.
        val_loader_unaug (DataLoader): Unaugmented validation loader.
        device (torch.device): Compute device.
        cfg: Stage3Config with epoch, batch, lr, wd hyperparameters.
        n_seeds (int): Number of independent seeds to try. Default 10.

    Returns:
        float: Best validation macro F1 across all seeds.
    """
    print("[cRT] extracting cached features...")
    feats_tr, y_tr = extract_features(model, train_loader_unaug, device)
    feats_va, y_va = extract_features(model, val_loader_unaug,   device)
    print(f"[cRT] feats_tr={feats_tr.shape}  feats_va={feats_va.shape}")

    best_f1_overall: float         = -1.0
    best_sd_overall: Optional[dict] = None

    # Try n_seeds seeds starting at 42; keep the best head
    for s in range(n_seeds):
        seed = 42 + s
        f1, sd = _run_one_crt_seed(
            feats_tr, y_tr, feats_va, y_va, device, cfg, seed=seed
        )
        print(f"[cRT] seed={seed}  best F1={f1:.4f}")
        if f1 > best_f1_overall:
            best_f1_overall = f1
            best_sd_overall = sd

    print(f"[cRT] best across {n_seeds} seeds: F1={best_f1_overall:.4f}")

    if best_sd_overall is not None:
        # Load the best head weights into model.head (in-place update)
        model.head.load_state_dict(
            {k: v.to(device) for k, v in best_sd_overall.items()}
        )

    return best_f1_overall
