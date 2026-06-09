"""
model.py
========
Neural network architectures for breast MRI molecular subtype classification.

This module defines three classifiers built on the 2.5D Multiple Instance
Learning (MIL) paradigm: each MRI volume is decomposed into axial slices,
a 2D backbone encodes each slice independently, and a Gated Attention MIL
head pools the slice-level features into a single volume-level representation.

Primary model:
    Dinov2MILClassifier — DINOv2 ViT-S/14 backbone (LVD-142M pretrained)
    with optional LoRA adapters on the last 2 transformer blocks.
    Designed for 6 GB VRAM via gradient checkpointing and chunked inference.

Fallback model:
    ConvNeXtMILClassifier — ConvNeXt-Nano (in12k_ft_in1k) backbone, fully
    trainable. Activates when timm or peft are unavailable.

Legacy model:
    R3D18Classifier — R3D-18 Kinetics 3D video backbone. Retained for
    backward compatibility with checkpoints from v1.x.

Forward pass dimensions (primary model):
    Input:    (B, S, 3, H, W)   — B volumes, S=64 axial slices each
    Backbone: (B*S, 3, H, W) → (B*S, 384)   DINOv2 CLS features
    Reshape:  (B, S, 384)
    MIL pool: (B, 384) → attention-weighted → (B, 256)
    Head:     (B, 256) → (B, num_classes)

Pipeline position:
    config.py (hyperparameters) → THIS MODULE → main.py / fl_train.py

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations

from typing import List, Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Gated Attention MIL Head ──────────────────────────────────────────────────

class GatedAttentionMIL(nn.Module):
    """
    Gated Attention Multiple Instance Learning pooling (Ilse et al., 2018).

    Aggregates a bag of ``S`` instance features into a single bag-level
    representation using learned attention weights.  Two parallel linear
    paths produce an element-wise gated attention score:

        Gated attention score (Ilse et al. 2018, Eq. 5):
            score = w^T * ( tanh(V * h)  ⊙  sigmoid(U * h) )
        where:
            h : (S, proj_dim) — projected instance features
            V : (attn_dim, proj_dim) — tanh branch (feature content)
            U : (attn_dim, proj_dim) — sigmoid gate (feature selection)
            w : (attn_dim, 1) — final scalar score

        Attention weights:  a = softmax(score)         — (B, S)
        Pooled output:      z = Σ_s a_s * h_s          — (B, proj_dim)

    Reference:
        Ilse M. et al. "Attention-based Deep Multiple Instance Learning."
        ICML 2018. arXiv:1802.04712

    Args:
        in_dim (int): Dimensionality of input instance features (backbone output).
        proj_dim (int): Hidden projection dimension. Default 256.
        attn_dim (int): Attention bottleneck dimension. Default 128.
        dropout (float): Dropout on the pooled output. Default 0.3.
        drop_path (float): Stochastic depth rate on projected features. Default 0.1.
    """

    def __init__(
        self,
        in_dim: int,
        proj_dim: int = 256,
        attn_dim: int = 128,
        dropout: float = 0.3,
        drop_path: float = 0.1,
    ):
        super().__init__()
        self.proj   = nn.Linear(in_dim, proj_dim)   # instance projection
        nn.init.normal_(self.proj.weight, mean=0.0, std=0.02)

        # Gated attention branches (Ilse et al. 2018):
        self.attn_V = nn.Linear(proj_dim, attn_dim)   # tanh branch V
        self.attn_U = nn.Linear(proj_dim, attn_dim)   # sigmoid gate U
        self.attn_w = nn.Linear(attn_dim, 1)           # scalar score

        nn.init.normal_(self.attn_w.weight, mean=0.0, std=0.01)
        nn.init.zeros_(self.attn_w.bias)
        nn.init.normal_(self.attn_V.weight, mean=0.0, std=0.01)
        nn.init.normal_(self.attn_U.weight, mean=0.0, std=0.01)

        self.norm           = nn.LayerNorm(proj_dim)
        self.dropout        = nn.Dropout(dropout)
        self.drop_path_rate = drop_path

    def _drop_path(self, x: torch.Tensor) -> torch.Tensor:
        """
        Apply stochastic depth (drop-path) regularisation to instance features.

        Randomly zeroes entire instances during training (not individual elements),
        scaled by 1/(1 - p) to maintain expected values.  Has no effect at eval.

        Args:
            x (torch.Tensor): Shape (B, S, proj_dim).

        Returns:
            torch.Tensor: Same shape, with random instances zeroed during training.
        """
        if not self.training or self.drop_path_rate <= 0.0:
            return x
        keep = 1.0 - self.drop_path_rate
        # Mask shape (B, 1, 1) broadcasts over (S, proj_dim) — drops entire slices
        mask = x.new_empty(x.size(0), 1, 1).bernoulli_(keep) / keep
        return x * mask

    def forward(
        self, slice_features: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Compute attention-weighted pooling over slice features.

        Args:
            slice_features (torch.Tensor): Shape (B, S, in_dim) — per-slice
                backbone features for a batch of B volumes with S slices each.

        Returns:
            Tuple[torch.Tensor, torch.Tensor]:
                pooled   — (B, proj_dim): attention-weighted volume embedding.
                attn     — (B, S): attention weights summing to 1 over slices.
        """
        h = self.proj(slice_features)        # (B, S, in_dim) → (B, S, proj_dim)
        h = self._drop_path(h)               # stochastic depth regularisation

        # Gated attention: score = w^T * (tanh(V*h) ⊙ sigmoid(U*h))
        v      = torch.tanh(self.attn_V(h))          # (B, S, attn_dim)
        u      = torch.sigmoid(self.attn_U(h))       # (B, S, attn_dim)
        scores = self.attn_w(v * u).squeeze(-1)      # (B, S, 1) → (B, S)
        attn   = F.softmax(scores, dim=1)            # (B, S) — sums to 1

        pooled = (h * attn.unsqueeze(-1)).sum(dim=1)  # (B, proj_dim) weighted sum
        pooled = self.norm(pooled)
        pooled = self.dropout(pooled)
        return pooled, attn


# ── DINOv2 Backbone Loader ────────────────────────────────────────────────────

def _load_dinov2_small() -> Tuple[nn.Module, int]:
    """
    Load DINOv2 ViT-S/14 backbone (LVD-142M pretrained) via timm or torch.hub.

    Attempts timm first (recommended: provides set_input_size and
    set_grad_checkpointing).  Falls back to torch.hub on failure.
    Gradient checkpointing is enabled automatically to halve VRAM during
    LoRA backward passes (~45 MB activations per slice → ~720 MB for 16 slices).

    Returns:
        Tuple[nn.Module, int]: (backbone, feature_dim).
            feature_dim is 384 for DINOv2 ViT-S/14.

    Raises:
        RuntimeError: If both timm and torch.hub loading fail.
    """
    try:
        import timm
        m = timm.create_model(
            "vit_small_patch14_dinov2.lvd142m",
            pretrained=True, num_classes=0, global_pool="token",
        )
        # DINOv2 default img_size is 518; our slice transform produces 224x224
        if hasattr(m, "set_input_size"):
            m.set_input_size(img_size=224)
        # Gradient checkpointing on backbone halves VRAM during LoRA backward
        if hasattr(m, "set_grad_checkpointing"):
            m.set_grad_checkpointing(enable=True)
            print("[OK] Gradient checkpointing enabled on DINOv2 backbone")
        feat = m.num_features   # 384 for ViT-S/14
        print(f"[OK] Loaded DINOv2-S via timm (feat_dim={feat}, img_size=224)")
        return m, feat
    except Exception as e:
        print(f"[WARN] timm DINOv2 load failed: {e}; trying torch.hub")

    # Fallback to facebookresearch/dinov2 hub (no gradient checkpointing)
    m    = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14", pretrained=True)
    feat = 384   # ViT-S/14 always outputs 384-dim CLS tokens
    return m, feat


def _fallback_convnext_nano() -> Tuple[nn.Module, int]:
    """
    Load ConvNeXt-Nano (in12k_ft_in1k) as a fallback backbone via timm.

    Used when DINOv2 is unavailable.  ConvNeXt-Nano outputs 640-dim features.

    Returns:
        Tuple[nn.Module, int]: (backbone, feature_dim=640).
    """
    import timm
    m    = timm.create_model(
        "convnext_nano.in12k_ft_in1k",
        pretrained=True, num_classes=0, global_pool="avg",
    )
    feat = m.num_features   # 640 for ConvNeXt-Nano
    print(f"[OK] Loaded ConvNeXt-Nano fallback (feat_dim={feat})")
    return m, feat


def _apply_lora(
    backbone: nn.Module,
    rank: int = 4,
    target_substrings: Tuple[str, ...] = ("attn.qkv", "mlp.fc1", "mlp.fc2"),
    last_n_blocks: int = 2,
) -> int:
    """
    Attach LoRA (Low-Rank Adaptation) adapters to the last N ViT blocks.

    LoRA (Hu et al., ICLR 2022) decomposes weight updates as W + BA where
    B ∈ R^{d×r} and A ∈ R^{r×k} with rank r ≪ min(d,k).  Only A and B are
    trained, reducing trainable parameters from ~22M to ~150K for ViT-S.

    LoRA configuration:
        rank (r) = 4
        alpha = 2 * rank = 8  (scaling factor for the low-rank update)
        bias  = "none"        (bias terms not modified)
        Targets: qkv, fc1, fc2 in the last 2 transformer blocks

    Silently skips if peft is not installed or module naming does not match
    (e.g. ConvNeXt backbone which has no .blocks attribute).

    Args:
        backbone (nn.Module): Transformer backbone with a .blocks attribute.
        rank (int): LoRA rank r. Default 4.
        target_substrings (Tuple[str,...]): Submodule name fragments to target.
        last_n_blocks (int): Number of final blocks to apply LoRA to. Default 2.

    Returns:
        int: Number of trainable LoRA parameters added (0 if skipped).
    """
    try:
        from peft import LoraConfig, get_peft_model
    except Exception as e:
        print(f"[WARN] peft unavailable ({e}); running without LoRA")
        return 0

    blocks = getattr(backbone, "blocks", None)
    if blocks is None:
        print("[WARN] backbone has no .blocks; skipping LoRA")
        return 0

    n        = len(blocks)
    keep_idx = set(range(max(0, n - last_n_blocks), n))   # e.g. {10, 11} for 12-block ViT

    # Build fully-qualified target names, e.g. "blocks.10.attn.qkv"
    targets = []
    for i in keep_idx:
        for sub in target_substrings:
            targets.append(f"blocks.{i}.{sub}")

    try:
        cfg = LoraConfig(
            r=rank, lora_alpha=2 * rank,   # alpha = 2r → scaling = 1.0
            lora_dropout=0.0, bias="none",
            target_modules=targets,
        )
        get_peft_model(backbone, cfg)   # modifies backbone in-place
        n_trainable = sum(p.numel() for p in backbone.parameters() if p.requires_grad)
        print(
            f"[OK] Applied LoRA r={rank} on {len(targets)} linears "
            f"({n_trainable:,} trainable)"
        )
        return n_trainable
    except Exception as e:
        print(f"[WARN] LoRA injection failed: {e}; continuing fully frozen")
        return 0


# ── Primary Model: DINOv2 MIL Classifier ─────────────────────────────────────

class Dinov2MILClassifier(nn.Module):
    """
    Primary classifier: DINOv2-S/14 per-slice backbone + Gated Attention MIL.

    Architecture (2.5D Multiple Instance Learning):

        Input:  (B, S, 3, H, W)  — B volumes, S axial slices, H=W=224
          ↓  DINOv2 ViT-S/14 (LoRA on last 2 blocks)
        Slice features: (B, S, 384)
          ↓  GatedAttentionMIL (proj 384→256, attn_dim=128)
        Volume embedding: (B, 256)   + attention weights stored in last_attn
          ↓  Linear(256, num_classes)
        Logits: (B, num_classes)

    VRAM budget on GTX 1660 Ti (6 GB):
        - DINOv2 weights:        ~90 MB
        - LoRA adapters:         ~5 MB
        - Activations per slice: ~45 MB (with gradient checkpointing)
        - 16 slices × batch=2:  ~1.5 GB
        - Optimizer (AdamW):     ~200 MB
        - Total:                 ~3–4 GB

    Attributes:
        last_attn (Optional[torch.Tensor]): Attention weights from the last
            forward pass, shape (B, S). Used for interpretability / visualisation.

    Args:
        num_classes (int): Output classes. 4 for subtype, 2 for binary.
        lora_rank (int): LoRA rank r. 0 disables LoRA. Default 4.
        freeze_backbone (bool): Freeze backbone (train only LoRA). Default True.
        proj_dim (int): MIL projection dimension. Default 256.
        attn_dim (int): Attention bottleneck dimension. Default 128.
        dropout (float): Dropout on pooled MIL output. Default 0.3.
        drop_path (float): Stochastic depth rate. Default 0.1.
        fallback (bool): Force ConvNeXt-Nano backbone. Default False.
    """

    def __init__(
        self,
        num_classes: int = 4,
        lora_rank: int = 4,
        freeze_backbone: bool = True,
        proj_dim: int = 256,
        attn_dim: int = 128,
        dropout: float = 0.3,
        drop_path: float = 0.1,
        fallback: bool = False,
    ):
        super().__init__()

        if fallback:
            self.backbone, feat = _fallback_convnext_nano()
        else:
            try:
                self.backbone, feat = _load_dinov2_small()
            except Exception as e:
                print(f"[WARN] DINOv2 load failed: {e}; using ConvNeXt-Nano fallback")
                self.backbone, feat = _fallback_convnext_nano()

        if freeze_backbone:
            for p in self.backbone.parameters():
                p.requires_grad_(False)   # freeze all backbone weights
            if lora_rank > 0:
                _apply_lora(self.backbone, rank=lora_rank)  # unfreeze LoRA adapters

        self.mil = GatedAttentionMIL(
            in_dim=feat, proj_dim=proj_dim, attn_dim=attn_dim,
            dropout=dropout, drop_path=drop_path,
        )
        self.head = nn.Linear(proj_dim, num_classes)
        nn.init.xavier_normal_(self.head.weight)
        nn.init.zeros_(self.head.bias)

        self.last_attn: Optional[torch.Tensor] = None   # for interpretability
        self.feat_dim  = feat
        self.proj_dim  = proj_dim

        tot = sum(p.numel() for p in self.parameters())
        tr  = sum(p.numel() for p in self.parameters() if p.requires_grad)
        print(f"  Dinov2MILClassifier params: {tot:,} total, {tr:,} trainable")

    def _encode_slices(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Extract per-slice backbone features, chunked to stay within VRAM budget.

        Processes slices in chunks of 16 to keep activation footprint low.
        ViT-S/14 at 224×224 with gradient checkpointing uses ~45 MB/slice.
        16 slices × 2 batch ≈ 1.44 GB, safely below 6 GB.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, H, W).

        Returns:
            torch.Tensor: Shape (B, S, feat_dim) — per-slice CLS features.
        """
        B, S, C, H, W = slices.shape
        flat  = slices.reshape(B * S, C, H, W)   # (B*S, 3, H, W) — batch all slices
        chunk = 16                                # process 16 slices at a time
        outs: List[torch.Tensor] = []
        for i in range(0, flat.size(0), chunk):
            outs.append(self.backbone(flat[i:i + chunk]))   # (chunk, feat)
        feats = torch.cat(outs, dim=0)            # (B*S, feat)
        return feats.view(B, S, -1)               # (B, S, feat) — restore volume structure

    def forward(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Full forward pass: slices → logits.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, H, W), ImageNet-normalised.

        Returns:
            torch.Tensor: Shape (B, num_classes) — unnormalised logits.
        """
        feats          = self._encode_slices(slices)      # (B, S, feat_dim)
        pooled, attn   = self.mil(feats)                  # (B, proj_dim), (B, S)
        self.last_attn = attn.detach()                    # store for visualisation
        return self.head(pooled)                          # (B, num_classes)

    def forward_features(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Return the pooled MIL embedding (pre-head) for use in cRT.

        Used by Stage 3 (cRT) and FedSCRT to extract 256-dim features without
        passing through the final classification head.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, H, W).

        Returns:
            torch.Tensor: Shape (B, proj_dim=256) — volume-level embedding.
        """
        feats          = self._encode_slices(slices)
        pooled, attn   = self.mil(feats)
        self.last_attn = attn.detach()
        return pooled

    def get_param_groups(
        self,
        lr_backbone: float = 3e-5,
        lr_head: float = 3e-4,
        wd_head: float = 0.1,
        wd_backbone: float = 0.05,
    ) -> List[dict]:
        """
        Build optimizer parameter groups with different LR/WD per component.

        Separates trainable parameters into:
          - Backbone (LoRA adapters): lower LR and WD
          - Head/MIL weights: higher LR and WD
          - No-WD group: biases, LayerNorm, and 1-D params (no weight decay)

        Args:
            lr_backbone (float): Learning rate for backbone LoRA adapters.
            lr_head (float): Learning rate for MIL head and classifier.
            wd_head (float): Weight decay for head weights.
            wd_backbone (float): Weight decay for backbone LoRA weights.

        Returns:
            List[dict]: Optimizer parameter groups for torch.optim.AdamW.
        """
        backbone_params, head_params, no_wd = [], [], []
        for name, p in self.named_parameters():
            if not p.requires_grad:
                continue
            if "backbone" in name:
                backbone_params.append(p)
            elif (
                p.ndim == 1
                or name.endswith(".bias")
                or "LayerNorm" in name
                or "norm" in name
            ):
                no_wd.append(p)   # biases and norms: no weight decay
            else:
                head_params.append(p)

        groups = []
        if backbone_params:
            groups.append({"params": backbone_params, "lr": lr_backbone,
                           "weight_decay": wd_backbone})
        if head_params:
            groups.append({"params": head_params, "lr": lr_head,
                           "weight_decay": wd_head})
        if no_wd:
            groups.append({"params": no_wd, "lr": lr_head, "weight_decay": 0.0})
        return groups

    def freeze_all_but_head(self) -> None:
        """Freeze all parameters except the linear classifier head."""
        for p in self.parameters():
            p.requires_grad_(False)
        for p in self.head.parameters():
            p.requires_grad_(True)

    def unfreeze_mil(self) -> None:
        """Unfreeze GatedAttentionMIL and classifier head (Stage 1 target)."""
        for p in self.mil.parameters():
            p.requires_grad_(True)
        for p in self.head.parameters():
            p.requires_grad_(True)

    def unfreeze_lora(self) -> None:
        """Unfreeze LoRA adapter parameters in backbone (Stage 2 activation)."""
        for n, p in self.backbone.named_parameters():
            if "lora" in n.lower():
                p.requires_grad_(True)


# ── Fallback Model: ConvNeXt-Nano MIL Classifier ─────────────────────────────

class ConvNeXtMILClassifier(nn.Module):
    """
    Fallback classifier: ConvNeXt-Nano per-slice backbone + Gated Attention MIL.

    Fully trainable (no LoRA) — backbone weights are updated end-to-end.
    Used when DINOv2 or peft are unavailable, and in the FL experiments
    (fl_train.py) which use this architecture by default.

    Architecture:

        Input:  (B, S, 3, 224, 224)  — S=64 axial slices, H=W=224
          ↓  ConvNeXt-Nano (in12k_ft_in1k, fully trainable)
        Slice features: (B*S, 640) → (B, S, 640)
          ↓  GatedAttentionMIL (proj 640→256, attn_dim=128)
        Volume embedding: (B, 256)
          ↓  Linear(256, num_classes)
        Logits: (B, num_classes)

    Designed for 6 GB VRAM via:
        - Gradient checkpointing on ConvNeXt backbone
        - Chunked slice processing (32 per chunk)
        - AMP mixed precision (handled by the training loop in main.py)

    Args:
        num_classes (int): Output classes. Default 4.
        proj_dim (int): MIL projection dimension. Default 256.
        attn_dim (int): Attention bottleneck dimension. Default 128.
        dropout (float): Dropout on pooled output. Default 0.3.
        drop_path (float): Stochastic depth rate in MIL. Default 0.1.
        grad_checkpoint (bool): Enable backbone gradient checkpointing. Default True.
    """

    def __init__(
        self,
        num_classes: int = 4,
        proj_dim: int = 256,
        attn_dim: int = 128,
        dropout: float = 0.3,
        drop_path: float = 0.1,
        grad_checkpoint: bool = True,
    ):
        super().__init__()
        import timm
        self.backbone = timm.create_model(
            "convnext_nano.in12k_ft_in1k",
            pretrained=True, num_classes=0, global_pool="avg",
            drop_path_rate=0.1,   # stochastic depth in ConvNeXt itself
        )
        feat = self.backbone.num_features   # 640 for ConvNeXt-Nano
        print(f"[OK] Loaded ConvNeXt-Nano (feat_dim={feat}, fully trainable)")

        if grad_checkpoint and hasattr(self.backbone, "set_grad_checkpointing"):
            self.backbone.set_grad_checkpointing(enable=True)
            print("[OK] Gradient checkpointing enabled on backbone")

        self.mil = GatedAttentionMIL(
            in_dim=feat, proj_dim=proj_dim, attn_dim=attn_dim,
            dropout=dropout, drop_path=drop_path,
        )
        self.head = nn.Linear(proj_dim, num_classes)
        nn.init.xavier_normal_(self.head.weight)
        nn.init.zeros_(self.head.bias)

        self.last_attn: Optional[torch.Tensor] = None
        self.feat_dim  = feat
        self.proj_dim  = proj_dim

        tot = sum(p.numel() for p in self.parameters())
        tr  = sum(p.numel() for p in self.parameters() if p.requires_grad)
        print(f"  ConvNeXtMILClassifier params: {tot:,} total, {tr:,} trainable")

    def _encode_slices(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Extract ConvNeXt per-slice features in chunks of 32.

        ConvNeXt retains more activations than ViT during the backward pass,
        so a smaller chunk size (32 vs 16 for DINOv2) is used.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, 224, 224).

        Returns:
            torch.Tensor: Shape (B, S, 640) — per-slice feature vectors.
        """
        B, S, C, H, W = slices.shape
        flat  = slices.reshape(B * S, C, H, W)   # (B*S, 3, 224, 224)
        chunk = 32                                 # 32 ConvNeXt slices per chunk
        outs: List[torch.Tensor] = []
        for i in range(0, flat.size(0), chunk):
            outs.append(self.backbone(flat[i:i + chunk]))
        feats = torch.cat(outs, dim=0)             # (B*S, 640)
        return feats.view(B, S, -1)                # (B, S, 640)

    def forward(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Full forward pass: slices → logits.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, 224, 224), ImageNet-normalised.

        Returns:
            torch.Tensor: Shape (B, num_classes) — unnormalised logits.
        """
        feats          = self._encode_slices(slices)   # (B, S, 640)
        pooled, attn   = self.mil(feats)               # (B, 256), (B, S)
        self.last_attn = attn.detach()
        return self.head(pooled)                       # (B, num_classes)

    def forward_features(self, slices: torch.Tensor) -> torch.Tensor:
        """
        Return the pooled MIL embedding for cRT feature extraction.

        Args:
            slices (torch.Tensor): Shape (B, S, 3, 224, 224).

        Returns:
            torch.Tensor: Shape (B, 256) — volume-level MIL embedding.
        """
        feats          = self._encode_slices(slices)
        pooled, attn   = self.mil(feats)
        self.last_attn = attn.detach()
        return pooled

    def get_param_groups(
        self,
        lr_backbone: float = 5e-5,
        lr_head: float = 1e-3,
        wd_head: float = 0.1,
        wd_backbone: float = 0.05,
    ) -> List[dict]:
        """
        Build optimizer parameter groups for the ConvNeXt backbone and MIL head.

        Backbone biases and norms are placed in the no-weight-decay group to
        follow standard ConvNeXt training conventions.

        Args:
            lr_backbone (float): LR for ConvNeXt backbone weights.
            lr_head (float): LR for MIL head and linear classifier.
            wd_head (float): Weight decay for head weights.
            wd_backbone (float): Weight decay for backbone weights.

        Returns:
            List[dict]: Parameter groups for torch.optim.AdamW.
        """
        backbone_params, head_params, no_wd = [], [], []
        for name, p in self.named_parameters():
            if not p.requires_grad:
                continue
            if "backbone" in name:
                if p.ndim == 1 or name.endswith(".bias"):
                    no_wd.append(p)   # backbone biases/norms: no weight decay
                else:
                    backbone_params.append(p)
            elif p.ndim == 1 or name.endswith(".bias") or "norm" in name.lower():
                no_wd.append(p)
            else:
                head_params.append(p)

        groups = []
        if backbone_params:
            groups.append({"params": backbone_params, "lr": lr_backbone,
                           "weight_decay": wd_backbone})
        if head_params:
            groups.append({"params": head_params, "lr": lr_head,
                           "weight_decay": wd_head})
        if no_wd:
            groups.append({"params": no_wd, "lr": lr_head, "weight_decay": 0.0})
        return groups

    def freeze_all_but_head(self) -> None:
        """Freeze all backbone weights; keep MIL head and classifier trainable."""
        for p in self.parameters():
            p.requires_grad_(False)
        for p in self.mil.parameters():
            p.requires_grad_(True)
        for p in self.head.parameters():
            p.requires_grad_(True)

    def unfreeze_all(self) -> None:
        """Unfreeze all parameters (backbone + MIL + head) for joint fine-tuning."""
        for p in self.parameters():
            p.requires_grad_(True)


# ── Legacy Model: R3D-18 Classifier ──────────────────────────────────────────

class R3D18Classifier(nn.Module):
    """
    Legacy R3D-18 3D video backbone classifier (v1.x baseline).

    Adapts the Kinetics-pretrained R3D-18 backbone (Tran et al., 2018) for
    greyscale MRI volumes by replacing the 3-channel input convolution with a
    1-channel version (weights averaged over the RGB dimension).

    This model processes the full 3D volume at once — unlike the 2.5D MIL
    approach it does not decompose into slices.  Its 3D convolutions conflate
    depth with time, which is inappropriate for DCE-MRI, but it is retained
    as a legacy fallback for backward compatibility with v1.x checkpoints.

    Note:
        Val macro F1 ≈ 0.38–0.42 on this dataset (see CLAUDE.md v1.2).
        The ConvNeXt-MIL architecture significantly outperforms this model.

    Args:
        num_classes (int): Output classes. Default 4.
        freeze_backbone (bool): Freeze all layers except the classifier head.
            Default True. Set False to fine-tune deeper layers.
    """

    def __init__(self, num_classes: int = 4, freeze_backbone: bool = True):
        super().__init__()
        try:
            from torchvision.models.video import r3d_18, R3D_18_Weights
            backbone = r3d_18(weights=R3D_18_Weights.DEFAULT)
        except Exception:
            from torchvision.models.video import r3d_18
            backbone = r3d_18(pretrained=False)

        # Replace the first Conv3d from 3 → 1 channels for greyscale MRI
        old = backbone.stem[0]   # original Conv3d(3, 64, ...)
        new = nn.Conv3d(
            1, 64,
            kernel_size=old.kernel_size,
            stride=old.stride,
            padding=old.padding,
            bias=False,
        )
        with torch.no_grad():
            if old.weight.shape[1] == 3:
                # Average RGB weights: preserves signal energy for greyscale input
                new.weight.copy_(old.weight.mean(dim=1, keepdim=True))
            else:
                nn.init.kaiming_normal_(new.weight, mode="fan_out", nonlinearity="relu")
        backbone.stem[0] = new

        self.stem       = backbone.stem
        self.layer1     = backbone.layer1
        self.layer2     = backbone.layer2
        self.layer3     = backbone.layer3
        self.layer4     = backbone.layer4
        self.avgpool    = nn.AdaptiveAvgPool3d(1)   # global spatio-temporal pooling
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.LayerNorm(512),
            nn.Dropout(0.6),
            nn.Linear(512, num_classes),
        )

        for m in self.classifier.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

        if freeze_backbone:
            for n, p in self.named_parameters():
                if "classifier" not in n:
                    p.requires_grad_(False)   # freeze all layers except head

    def train(self, mode: bool = True) -> "R3D18Classifier":
        """
        Override train() to keep BatchNorm layers in eval mode.

        R3D-18 was pretrained with large batches; our batch_size=2 produces
        unstable BN statistics.  Keeping BN frozen prevents training divergence.

        Args:
            mode (bool): True to set training mode, False for eval. Default True.

        Returns:
            R3D18Classifier: self.
        """
        super().train(mode)
        if mode:
            for m in self.modules():
                if isinstance(m, nn.modules.batchnorm._BatchNorm):
                    m.eval()   # keep BN in eval mode to use running statistics
        return self

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for a 3D volume.

        Args:
            x (torch.Tensor): Shape (B, 1, D, H, W) — greyscale volume batch.

        Returns:
            torch.Tensor: Shape (B, num_classes) — class logits.
        """
        x = self.stem(x)       # (B, 64, D/2, H/4, W/4)
        x = self.layer1(x)     # (B, 64, ...)
        x = self.layer2(x)     # (B, 128, ...)
        x = self.layer3(x)     # (B, 256, ...)
        x = self.layer4(x)     # (B, 512, ...)
        x = self.avgpool(x)    # (B, 512, 1, 1, 1)
        return self.classifier(x)   # (B, num_classes)


# Back-compat alias: old checkpoints reference BreastMRIClassifier
BreastMRIClassifier = R3D18Classifier
