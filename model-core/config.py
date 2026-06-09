"""
config.py
=========
Centralised hyperparameter configuration for the breast MRI classification pipeline.

All hyperparameters are grouped into dataclass blocks by training stage.  Every
value can be overridden at runtime via an environment variable with the prefix
``MRI_`` (e.g. ``MRI_STAGE2_EPOCHS=40``), enabling reproducible experiment
sweeps without modifying source code.

Configuration hierarchy:

    FullConfig
    ├── ModelConfig      — architecture selection and MIL dimensions
    ├── SSLConfig        — SimMIM self-supervised pre-training (optional)
    ├── Stage1Config     — head-only warmup (backbone frozen)
    ├── Stage2Config     — joint fine-tuning (LoRA + MIL + head)
    ├── Stage3Config     — classifier retraining / cRT
    └── TTAConfig        — test-time augmentation

Pipeline position:
    THIS MODULE → model.py, main.py, fl_train.py, crt.py (all consumers)

Usage:
    from config import CFG          # singleton instance
    from config import FullConfig   # construct a fresh instance

    # Override via environment:
    $env:MRI_STAGE2_EPOCHS = "40"
    python main.py

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
import os
from dataclasses import dataclass, field, asdict
from typing import Tuple


# ── Environment variable helpers ──────────────────────────────────────────────

def _env_str(key: str, default: str) -> str:
    """Read a string environment variable with MRI_ prefix."""
    return os.environ.get(f"MRI_{key}", default)


def _env_int(key: str, default: int) -> int:
    """Read an integer environment variable with MRI_ prefix."""
    return int(os.environ.get(f"MRI_{key}", default))


def _env_float(key: str, default: float) -> float:
    """Read a float environment variable with MRI_ prefix."""
    return float(os.environ.get(f"MRI_{key}", default))


def _env_bool(key: str, default: bool) -> bool:
    """Read a boolean environment variable with MRI_ prefix."""
    v = os.environ.get(f"MRI_{key}")
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


# ── Global Data Constants ─────────────────────────────────────────────────────

# Volume is downsampled to (64 slices, 128×128 px) — GPU memory fits on 6 GB
DEFAULT_TARGET_SHAPE: Tuple[int, int, int] = (64, 128, 128)

# Dataset paths (override via MRI_JSON_PATH / MRI_DATA_DIR)
JSON_PATH: str = _env_str(
    "JSON_PATH",
    r"D:\study\BioInfo M2 (2026)\Memoir\Datasets"
    r"\breast-mri-molecular-cancer-subtype\dataset.json",
)
DATA_DIR: str = _env_str(
    "DATA_DIR",
    r"D:\study\BioInfo M2 (2026)\Memoir\Datasets"
    r"\breast-mri-molecular-cancer-subtype\imagesTr",
)

# 4 molecular subtypes: Luminal A (0), Luminal B (1), HER2 (2), Triple Negative (3)
# Override to 2 for binary (Luminal vs Non-Luminal) experiments
NUM_CLASSES: int = _env_int("NUM_CLASSES", 4)
CLASS_NAMES  = ("Luminal A", "Luminal B", "HER2", "Triple Negative")


# ── Cross-Validation ──────────────────────────────────────────────────────────

# 5-fold stratified group CV: ensures no patient leakage and preserves class ratios
N_SPLITS: int  = _env_int("N_SPLITS",  5)
N_REPEATS: int = _env_int("N_REPEATS", 1)   # no repeated CV by default

# Reproducibility: all random seeds fixed to 42
# torch.manual_seed(42), numpy.random.seed(42)
RANDOM_SEED: int = _env_int("RANDOM_SEED", 42)


# ── File Paths ────────────────────────────────────────────────────────────────

CHECKPOINT_DIR: str = _env_str("CHECKPOINT_DIR", "./checkpoints")
RESULTS_DIR:    str = _env_str("RESULTS_DIR",    "./results")

# SSL checkpoint: output of ssl_pretrain.py; Stage 1 falls back to ImageNet
# if this file does not exist (has not been run)
SSL_CKPT: str = _env_str("SSL_CKPT", "./checkpoints/dinov2s_simmim_lora.pt")


# ── Stage-Specific Hyperparameter Dataclasses ─────────────────────────────────

@dataclass
class SSLConfig:
    """
    Hyperparameters for optional SimMIM self-supervised pre-training (ssl_pretrain.py).

    Pre-trains DINOv2-S on all 737 unlabelled MRI slices using masked patch
    reconstruction.  The resulting checkpoint improves Stage 1 initialisation.
    This stage is optional: Stage 1 falls back to ImageNet-pretrained weights.

    Reference:
        Xie et al. "SimMIM: A Simple Framework for Masked Image Modeling."
        CVPR 2022. arXiv:2111.09886
    """
    epochs:      int   = _env_int(  "SSL_EPOCHS",      50)   # 50 epochs over all slices
    batch_size:  int   = _env_int(  "SSL_BATCH",        32)
    lr:          float = _env_float("SSL_LR",          2e-4)  # ViT SSL standard
    weight_decay: float = _env_float("SSL_WD",         0.05)
    mask_ratio:  float = _env_float("SSL_MASK_RATIO",  0.4)   # 40% patches masked
    lora_rank:   int   = _env_int(  "SSL_LORA_RANK",   4)
    slice_size:  int   = _env_int(  "SSL_SLICE_SIZE",  224)   # ImageNet input size
    bg_thresh:   float = _env_float("SSL_BG_THRESH",   0.05)  # exclude near-black slices
    num_workers: int   = _env_int(
        "SSL_NUM_WORKERS", 0 if os.name == "nt" else 2
    )   # Windows requires num_workers=0


@dataclass
class Stage1Config:
    """
    Hyperparameters for Stage 1: head-only warmup (backbone and LoRA frozen).

    The backbone is completely frozen.  Only GatedAttentionMIL and the linear
    classifier head are trained.

    Rationale for 20 epochs:
        Estimated optimizer steps = 20 epochs × batch=2 × accum=8 × ~150 train
        volumes / 5 folds ≈ 5,900 effective updates.  The MIL head requires this
        many steps to converge before backbone gradients start flowing in Stage 2.
        Starting Stage 2 too early results in unstable attention weights.
    """
    epochs:             int   = _env_int(  "STAGE1_EPOCHS", 20)   # raised from 5
    batch_size:         int   = _env_int(  "STAGE1_BATCH",  2)
    accumulation_steps: int   = _env_int(  "STAGE1_ACCUM",  8)    # effective batch=16
    lr_head:            float = _env_float("STAGE1_LR_HEAD", 1e-3)
    weight_decay:       float = _env_float("STAGE1_WD",     0.05)
    label_smoothing:    float = _env_float("STAGE1_LS",     0.1)   # slight smoothing


@dataclass
class Stage2Config:
    """
    Hyperparameters for Stage 2: joint fine-tuning of LoRA + MIL + head.

    Uses a progressive training schedule:
        Epochs 0–39  : LDAM loss with per-class additive margins
        Epochs 40–79 : Class-balanced cross-entropy (CB-CE)
        Epoch 55+    : ASAM optimizer (adaptive sharpness-aware minimisation)
        Epoch 65+    : SWA weight averaging (last 15 epochs)

    The EMA shadow model (decay=0.99) is used for all validation throughout.
    """
    epochs:             int   = _env_int(  "STAGE2_EPOCHS",      80)   # raised from 25
    # Switch from LDAM to CB-CE after epoch 40: 40 LDAM epochs forces
    # minority-class separation before the model has converged; CB-CE then
    # provides a cleaner fine-tune phase on the margin-aware representation.
    epochs_ldam_only:   int   = _env_int(  "STAGE2_LDAM_EPOCHS", 80)   # raised from 12

    batch_size:         int   = _env_int(  "STAGE2_BATCH",        2)
    accumulation_steps: int   = _env_int(  "STAGE2_ACCUM",        8)   # effective batch=16

    # Separate LR for backbone (LoRA) vs head (MIL + classifier)
    lr_backbone:        float = _env_float("STAGE2_LR_BB",    5e-5)   # conservative LoRA LR
    lr_head:            float = _env_float("STAGE2_LR_HEAD",  1e-3)
    wd_backbone:        float = _env_float("STAGE2_WD_BB",    0.05)
    wd_head:            float = _env_float("STAGE2_WD_HEAD",  0.1)

    warmup_epochs:      int   = _env_int(  "STAGE2_WARMUP",    3)   # cosine warmup

    # LDAM loss parameters (Cao et al. 2019):
    # Margin Δ_j = max_m * (C / n_j^(1/4)) — larger margins for rare classes
    ldam_max_m:         float = _env_float("STAGE2_LDAM_M",   0.2)  # max additive margin
    ldam_scale:         float = _env_float("STAGE2_LDAM_S",  15.0)  # logit temperature s

    # Class-balanced CE (Cui et al. CVPR 2019):
    # Effective number E_j = (1 - beta^n_j) / (1 - beta)
    # w_j = (1 - beta) / E_j  (normalised to sum to num_classes)
    cb_beta:            float = _env_float("STAGE2_CB_BETA", 0.9999)

    # MixUp and CutMix augmentation parameters
    mixup_alpha:        float = _env_float("STAGE2_MIXUP_A",    0.2)   # Beta distribution alpha
    cutmix_alpha:       float = _env_float("STAGE2_CUTMIX_A",   1.0)   # uniform volume patch
    manifold_alpha:     float = _env_float("STAGE2_MANIFOLD_A", 0.2)   # feature-space mixup
    manifold_prob:      float = _env_float("STAGE2_MANIFOLD_P", 0.3)   # apply probability

    # KL consistency loss DISABLED: with batch_size=2 a 2-sample estimate of a
    # distribution divergence is statistically meaningless. Re-enable at batch >= 8.
    consistency_weight: float = _env_float("STAGE2_KL_W", 0.0)

    # ASAM (Adaptive Sharpness-Aware Minimisation, Kwon et al. ICML 2021):
    # Flattens the loss landscape; applied in final 25 of 80 epochs.
    # Starting too early destabilises early convergence.
    sam_rho:            float = _env_float("STAGE2_SAM_RHO",   0.05)  # perturbation radius
    sam_start_epoch:    int   = _env_int(  "STAGE2_SAM_START", 55)    # ASAM starts at 55/80

    # SWA (Stochastic Weight Averaging, Izmailov et al. 2018):
    # Averages weights over the last 15 epochs for improved generalisation.
    # SWA at 65/80 → 15 epoch average window.
    swa_start_epoch:    int   = _env_int(  "STAGE2_SWA_START", 65)    # SWA starts at 65/80

    # EMA shadow model: decay=0.99 → smooth validation signal less affected by
    # noisy single-epoch updates. Used for ALL validation in Stage 2.
    ema_decay:          float = _env_float("STAGE2_EMA",       0.99)

    drop_path:          float = _env_float("STAGE2_DROP_PATH", 0.1)   # MIL stochastic depth
    dropout:            float = _env_float("STAGE2_DROPOUT",   0.3)   # MIL pooling dropout
    grad_clip:          float = _env_float("STAGE2_GRAD_CLIP", 1.0)   # gradient clipping

    # Luminal B (1) and HER2 (2) are the minority classes requiring extra attention
    minority_classes:   Tuple[int, ...] = (1, 2)


@dataclass
class Stage3Config:
    """
    Hyperparameters for Stage 3: Classifier Retraining (cRT).

    The backbone is re-frozen.  Pooled 256-dim MIL features are cached from
    the training set, then a fresh linear head is trained on a class-balanced
    sampler.  This stage is cheap (linear model on cached features) and highly
    effective at correcting the majority-class bias in the learned head.

    Reference:
        Kang B. et al. "Decoupling Representation and Classifier for Long-Tailed
        Recognition." ICLR 2020. arXiv:1910.09217

    Rationale for 300 epochs:
        Small linear head on cached features converges slowly. 300 epochs
        ensures reliable convergence. The CyclicLR scheduler helps escape flat
        regions in the small head loss surface.

    Rationale for n_seeds=10 (in crt.py):
        With ~4–8 minority class samples in the validation fold, a single cRT
        seed has very high variance. Best-of-10 gives a stable head selection.
    """
    epochs:      int   = _env_int(  "STAGE3_EPOCHS", 300)   # raised from 20
    batch_size:  int   = _env_int(  "STAGE3_BATCH",   32)   # larger: linear head
    lr:          float = _env_float("STAGE3_LR",      1e-3)
    weight_decay: float = _env_float("STAGE3_WD",    0.01)


@dataclass
class TTAConfig:
    """Test-time augmentation (TTA) settings."""
    n_views:  int  = _env_int( "TTA_VIEWS",   8)      # 8 views: identity + 3 flips + 4 rotations
    enabled:  bool = _env_bool("TTA_ENABLED", True)   # enabled by default for evaluation


@dataclass
class ModelConfig:
    """Architecture selection and shared model dimensions."""
    arch:        str   = _env_str("MODEL_ARCH",       "dinov2_mil")  # primary architecture
    num_classes: int   = NUM_CLASSES
    lora_rank:   int   = _env_int("MODEL_LORA_RANK",  4)    # LoRA rank r; 0 disables LoRA
    proj_dim:    int   = _env_int("MODEL_PROJ_DIM",   256)  # MIL projection dim
    attn_dim:    int   = _env_int("MODEL_ATTN_DIM",   128)  # attention bottleneck dim
    slice_size:  int   = _env_int("MODEL_SLICE_SIZE", 224)  # ImageNet standard — DINOv2 input


@dataclass
class FullConfig:
    """
    Complete pipeline configuration.

    Aggregates all stage-specific configs under one object.  Passed through
    the training pipeline to ensure a single source of truth for all
    hyperparameters.

    Attributes:
        data_json (str): Path to nnUNet-format dataset.json.
        data_root (str): Root directory containing .mha volumes.
        ckpt_dir  (str): Directory for model checkpoints.
        results_dir (str): Directory for metrics JSON and figures.
        ssl_ckpt (str): Path to SSL pre-training checkpoint (optional).
        n_splits (int): Number of cross-validation folds.
        n_repeats (int): Number of CV repetitions.
        seed (int): Global random seed.
    """
    data_json:   str         = JSON_PATH
    data_root:   str         = DATA_DIR
    ckpt_dir:    str         = CHECKPOINT_DIR
    results_dir: str         = RESULTS_DIR
    ssl_ckpt:    str         = SSL_CKPT
    n_splits:    int         = N_SPLITS
    n_repeats:   int         = N_REPEATS
    seed:        int         = RANDOM_SEED
    model:       ModelConfig = field(default_factory=ModelConfig)
    ssl:         SSLConfig   = field(default_factory=SSLConfig)
    s1:          Stage1Config = field(default_factory=Stage1Config)
    s2:          Stage2Config = field(default_factory=Stage2Config)
    s3:          Stage3Config = field(default_factory=Stage3Config)
    tta:         TTAConfig   = field(default_factory=TTAConfig)

    def to_dict(self) -> dict:
        """Serialise configuration to a plain dict (for JSON logging)."""
        return asdict(self)


# ── Singleton Instance ────────────────────────────────────────────────────────

# CFG is the default singleton imported throughout the pipeline.
# It reads the current environment at import time.
CFG = FullConfig()
