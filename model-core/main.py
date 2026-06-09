"""
main.py
=======
Three-stage training pipeline for breast MRI molecular subtype classification.

This is the central training entry point for the CENTRALISED model (all data on
one machine).  The resulting Stage 2 / Stage 3 checkpoint is later reused as the
shared backbone for the federated learning experiments in fl_train.py.

Three-stage pipeline:

    Stage 1 — Head-only warmup: backbone + LoRA frozen; GatedAttentionMIL + linear
              head trained for cfg.s1.epochs.  Gives the attention aggregator
              ~5,900 optimizer steps to converge before backbone gradients flow.

    Stage 2 — Joint fine-tune: LoRA adapters + MIL + head trained together.
              LDAM loss for first cfg.s2.epochs_ldam_only epochs, then CB-CE.
              ASAM (adaptive SAM) activated at cfg.s2.sam_start_epoch.
              SWA averaging starts at cfg.s2.swa_start_epoch.
              EMA shadow model used for all validation.

    Stage 3 — cRT (Kang et al., ICLR 2020): backbone re-frozen, linear head
              retrained on class-balanced cached MIL features, 10 seeds.

Pipeline position:
    build_npy_cache.py → THIS MODULE → run_crt_only.py / fl_train.py → evaluate.py

Reproducibility: all random seeds fixed to 42
    torch.manual_seed(42), numpy.random.seed(42), cuda.manual_seed_all(42)

Usage:
    python main.py --arch dinov2_mil --fold 0 --stage all --n-splits 5

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
from contextlib import nullcontext
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold
try:
    from torch.amp import GradScaler, autocast
except ImportError:
    from torch.cuda.amp import GradScaler, autocast
from torch.optim.swa_utils import AveragedModel
from torch.utils.data import DataLoader, WeightedRandomSampler

from config import CFG
from crt import train_crt
from data_loader import MRI25DSliceDataset, load_samples
from ema import ModelEMA
from losses import ClassBalancedCE, LDAMLoss
from mixup import volume_cutmix, volume_mixup, within_class_mixup
from model import ConvNeXtMILClassifier, Dinov2MILClassifier, R3D18Classifier
from sam import ASAM

import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

NUM_WORKERS = 0 if os.name == "nt" else 2


# ──────────────────────────────────────────────────────────────────────────────
# Utilities
# ──────────────────────────────────────────────────────────────────────────────

def setup_file_logger(fold: int, results_dir: str = "./logs") -> None:
    """
    Configure logging to write training output to both a file and stdout.

    Args:
        fold (int): Fold index, used to name the log file.
        results_dir (str): Directory for log files. Default "./logs".
    """
    os.makedirs(results_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(results_dir, f"fold{fold}_{timestamp}.log")
    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    print = logging.info  # redirect print to logger
    logging.info(f"[LOG] Saving training log to {log_path}")


def _seed_everything(seed: int) -> None:
    """
    Fix all random seeds for reproducibility (seed=42 by default).

    Args:
        seed (int): Random seed applied to torch, numpy, and CUDA.
    """
    torch.manual_seed(seed)
    np.random.seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.benchmark = True   # autotune conv algorithms for speed


def _make_weighted_sampler(samples: List[Tuple], num_classes: int,
                            alpha: float = 1.0) -> WeightedRandomSampler:
    """
    Build a class-balanced WeightedRandomSampler to oversample minority classes.

    Per-sample weight: w_i = 1 / count(class_i)^alpha.
    alpha=1.0 gives full inverse-frequency balancing; alpha=0.5 gives softer
    balancing (square-root sampling).

    Args:
        samples (List[Tuple]): List of (path, label, pid) samples.
        num_classes (int): Number of classes.
        alpha (float): Balancing exponent. Default 1.0 (full balancing).

    Returns:
        WeightedRandomSampler: Sampler with replacement for class balancing.
    """
    labels      = np.array([s[1] for s in samples])
    counts      = np.maximum(np.bincount(labels, minlength=num_classes).astype(float), 1.0)
    per_class_w = 1.0 / (counts ** alpha)   # w_c = 1 / n_c^alpha
    sample_w    = per_class_w[labels]        # broadcast class weight to each sample
    return WeightedRandomSampler(
        weights=torch.as_tensor(sample_w, dtype=torch.double),
        num_samples=len(sample_w),
        replacement=True,   # required to oversample rare classes
    )


def _cosine_with_warmup(optimizer: torch.optim.Optimizer,
                         warmup_epochs: int, total_epochs: int,
                         min_lr_ratio: float = 1e-7) -> torch.optim.lr_scheduler.LambdaLR:
    """
    Build a cosine-decay LR scheduler with linear warmup.

    LR schedule:
        epoch < warmup     : linear ramp from ~0 to base LR
        epoch >= warmup    : cosine decay from base LR to min_lr_ratio * base LR

    Args:
        optimizer (Optimizer): Wrapped optimizer.
        warmup_epochs (int): Number of linear warmup epochs.
        total_epochs (int): Total training epochs (for cosine period).
        min_lr_ratio (float): Final LR as a fraction of base LR. Default 1e-7.

    Returns:
        LambdaLR: Scheduler to call once per epoch via scheduler.step().
    """
    def _lr_lambda(epoch: int) -> float:
        if epoch < warmup_epochs:
            return max(1e-6, (epoch + 1) / max(1, warmup_epochs))
        progress = (epoch - warmup_epochs) / max(1, total_epochs - warmup_epochs)
        return min_lr_ratio + (1.0 - min_lr_ratio) * 0.5 * (1.0 + math.cos(math.pi * min(progress, 1.0)))
    return torch.optim.lr_scheduler.LambdaLR(optimizer, _lr_lambda)


@torch.no_grad()
def _evaluate(model: nn.Module, loader: DataLoader,
              device: torch.device, amp_enabled: bool,
              num_classes: int) -> Tuple[float, np.ndarray, np.ndarray]:
    """
    Evaluate a model and return macro F1, confusion matrix, and prediction distribution.

    Args:
        model (nn.Module): Model to evaluate.
        loader (DataLoader): Validation DataLoader (no augmentation).
        device (torch.device): Compute device.
        amp_enabled (bool): Use automatic mixed precision during forward pass.
        num_classes (int): Number of classes.

    Returns:
        Tuple[float, np.ndarray, np.ndarray]:
            f1   — macro F1 score.
            cm   — confusion matrix, shape (num_classes, num_classes).
            dist — predicted-class distribution (count per class).
    """
    model.eval()
    all_preds: list = []
    all_labels: list = []
    for batch in loader:
        x, y = batch[0].to(device, non_blocking=True), batch[-1]
        try:
            ctx = autocast(device_type='cuda') if amp_enabled else nullcontext()
        except TypeError:
            ctx = autocast() if amp_enabled else nullcontext()
        with ctx:
            logits = model(x)
        all_preds.extend(logits.argmax(1).cpu().numpy())
        all_labels.extend(y.numpy())
    f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0)
    cm = confusion_matrix(all_labels, all_preds, labels=list(range(num_classes)))
    dist = np.bincount(np.array(all_preds, dtype=int), minlength=num_classes)
    return f1, cm, dist


# ──────────────────────────────────────────────────────────────────────────────
# Model factory
# ──────────────────────────────────────────────────────────────────────────────

def build_model(arch: str, device: torch.device,
                ssl_ckpt: Optional[str] = None) -> nn.Module:
    """
    Model factory: instantiate a classifier and optionally load SSL weights.

    Args:
        arch (str): Architecture — 'dinov2_mil', 'convnext_mil', or 'r3d18'.
        device (torch.device): Target device for the model.
        ssl_ckpt (Optional[str]): Path to an SSL pre-training checkpoint to
            load into the backbone. If None or missing, ImageNet weights are kept.

    Returns:
        nn.Module: Instantiated model moved to ``device``.
    """
    mc = CFG.model
    s2 = CFG.s2
    if arch == "dinov2_mil":
        model = Dinov2MILClassifier(
            num_classes=mc.num_classes,
            lora_rank=mc.lora_rank,
            freeze_backbone=True,
            proj_dim=mc.proj_dim,
            attn_dim=mc.attn_dim,
            dropout=s2.dropout,
            drop_path=s2.drop_path,
        )
    elif arch == "convnext_mil":
        model = ConvNeXtMILClassifier(
            num_classes=mc.num_classes,
            proj_dim=mc.proj_dim,
            attn_dim=mc.attn_dim,
            dropout=s2.dropout,
            drop_path=s2.drop_path,
        )
    else:
        model = R3D18Classifier(num_classes=mc.num_classes, freeze_backbone=True)

    if ssl_ckpt and Path(ssl_ckpt).exists():
        sd = torch.load(ssl_ckpt, map_location="cpu")
        missing, unexpected = model.backbone.load_state_dict(sd, strict=False)
        print(f"[SSL] loaded {ssl_ckpt}  missing={len(missing)}  unexpected={len(unexpected)}")
    elif ssl_ckpt:
        print(f"[SSL] checkpoint not found at {ssl_ckpt}; using ImageNet-pretrained weights")

    return model.to(device)


# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — Head-only warmup (backbone + LoRA frozen)
# ──────────────────────────────────────────────────────────────────────────────

def run_stage1(model: nn.Module, tr_loader: DataLoader, va_loader: DataLoader,
               device: torch.device, class_counts: List[int],
               cfg=None, ckpt_path: Optional[str] = None) -> float:
    """
    Stage 1 — Head-only warmup (backbone and LoRA frozen).

    Purpose: train only the GatedAttentionMIL aggregator and the linear head
    while the backbone stays frozen. This gives the attention pooling time to
    converge (~5,900 steps) before backbone gradients start flowing in Stage 2,
    preventing unstable attention weights.

    Args:
        model (nn.Module): Model to train (modified in-place).
        tr_loader (DataLoader): Training DataLoader (augmented, balanced sampler).
        va_loader (DataLoader): Validation DataLoader.
        device (torch.device): Compute device.
        class_counts (List[int]): Per-class training sample counts (for CB-CE).
        cfg: Stage1Config. Defaults to CFG.s1.
        ckpt_path (Optional[str]): Path to save the best checkpoint.

    Returns:
        float: Best validation macro F1 over all epochs.
    """
    if cfg is None:
        cfg = CFG.s1

    # Freeze backbone + LoRA; keep GatedAttentionMIL + linear head trainable.
    # Dinov2MILClassifier: freeze_all_but_head freezes everything including MIL,
    # then unfreeze_mil re-enables MIL + head.
    # ConvNeXtMILClassifier: freeze_all_but_head already includes MIL + head.
    # R3D18Classifier: created with freeze_backbone=True (head-only), skip.
    if hasattr(model, "freeze_all_but_head"):
        model.freeze_all_but_head()
    if hasattr(model, "unfreeze_mil"):
        model.unfreeze_mil()

    n_tr = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[Stage 1] trainable params: {n_tr:,}")

    if hasattr(model, "get_param_groups"):
        pg = model.get_param_groups(lr_backbone=0.0, lr_head=cfg.lr_head,
                                     wd_head=cfg.weight_decay, wd_backbone=cfg.weight_decay)
    else:
        pg = [{"params": [p for p in model.parameters() if p.requires_grad],
               "lr": cfg.lr_head, "weight_decay": cfg.weight_decay}]

    optimizer = torch.optim.AdamW(pg)
    scheduler = _cosine_with_warmup(optimizer, warmup_epochs=3, total_epochs=cfg.epochs)
    criterion = ClassBalancedCE(class_counts, label_smoothing=cfg.label_smoothing).to(device)

    scaler = GradScaler() if device.type == "cuda" else None
    amp = device.type == "cuda"
    nc = CFG.model.num_classes
    best_f1 = 0.0
    best_state: Optional[dict] = None

    print(f"\n{'='*60}")
    print(f" Stage 1 — Head warmup  ({cfg.epochs} epochs, "
          f"batch={cfg.batch_size}×{cfg.accumulation_steps}={cfg.batch_size*cfg.accumulation_steps})")
    print(f"{'='*60}")

    for epoch in range(cfg.epochs):
        model.train()
        optimizer.zero_grad(set_to_none=True)
        total_loss = 0.0
        n_steps = 0

        lrs = [f"{g['lr']:.2e}" for g in optimizer.param_groups]
        print(f"\nEpoch {epoch+1}/{cfg.epochs}  LRs: {' / '.join(lrs)}")

        for step, batch in enumerate(tr_loader):
            x = batch[0].to(device, non_blocking=True)
            y = batch[-1].to(device, non_blocking=True)

            try:
                ctx = autocast(device_type='cuda') if amp else nullcontext()
            except TypeError:
                ctx = autocast() if amp else nullcontext()
            with ctx:
                logits = model(x)
                loss = criterion(logits, y) / cfg.accumulation_steps

            if torch.isnan(loss) or torch.isinf(loss):
                print(f"  [WARN] NaN/Inf loss at Stage 1 — skipping batch")
                optimizer.zero_grad(set_to_none=True)
                continue

            if scaler:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            total_loss += loss.item() * cfg.accumulation_steps
            n_steps += 1

            is_update = ((step + 1) % cfg.accumulation_steps == 0 or
                         (step + 1) == len(tr_loader))
            if is_update:
                if scaler:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(
                        [p for p in model.parameters() if p.requires_grad], max_norm=1.0
                    )
                    scaler.step(optimizer)
                    scaler.update()
                else:
                    torch.nn.utils.clip_grad_norm_(
                        [p for p in model.parameters() if p.requires_grad], max_norm=1.0
                    )
                    optimizer.step()
                optimizer.zero_grad(set_to_none=True)

        scheduler.step()

        val_f1, val_cm, val_dist = _evaluate(model, va_loader, device, amp, nc)
        avg_loss = total_loss / max(1, n_steps)
        print(f"  loss={avg_loss:.4f}  val_F1={val_f1:.4f}")
        print(f"  val CM:\n{val_cm}")
        print(f"  val dist: {val_dist.tolist()}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            if ckpt_path:
                Path(ckpt_path).parent.mkdir(parents=True, exist_ok=True)
                torch.save({"epoch": epoch, "model_state": best_state,
                            "val_f1": best_f1}, ckpt_path)
                print(f"  [SAVED] {ckpt_path}  (F1={best_f1:.4f})")

    if best_state is not None:
        model.load_state_dict(best_state)
    print(f"\n[Stage 1] done.  Best val F1={best_f1:.4f}")
    return best_f1


# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — Joint fine-tune (LoRA + MIL + head, LDAM/ASAM/SWA/EMA)
# ──────────────────────────────────────────────────────────────────────────────

def run_stage2(model: nn.Module, tr_loader: DataLoader, va_loader: DataLoader,
               device: torch.device, class_counts: List[int],
               cfg=None, ckpt_path: Optional[str] = None) -> float:
    """
    Stage 2 — Joint fine-tune of LoRA adapters + MIL + head.

    Purpose: fine-tune the full trainable model end-to-end with an advanced
    regularisation schedule designed to maximise minority-class recall on the
    imbalanced dataset:
        - LDAM loss (epochs 0–39): per-class margins separate rare classes.
        - CB-CE loss (epochs 40–79): smooth fine-tune after margins established.
        - ASAM (epoch 55+): flattens the loss landscape for better generalisation.
        - SWA  (epoch 65+): averages weights over the final epochs.
        - EMA shadow model: used for all validation (smoother signal).
        - MixUp / CutMix / within-class mixup: volume-level augmentation each step.

    Note:
        AMP is disabled when ASAM activates, because the two-step ASAM update is
        incompatible with GradScaler's double-unscale logic.

    Args:
        model (nn.Module): Model to fine-tune (modified in-place).
        tr_loader (DataLoader): Training DataLoader (augmented, balanced sampler).
        va_loader (DataLoader): Validation DataLoader.
        device (torch.device): Compute device.
        class_counts (List[int]): Per-class training sample counts.
        cfg: Stage2Config. Defaults to CFG.s2.
        ckpt_path (Optional[str]): Path to save the best (EMA) checkpoint.

    Returns:
        float: Best validation macro F1 (EMA or SWA, whichever is higher).
    """
    if cfg is None:
        cfg = CFG.s2

    # Unfreeze LoRA adapters on top of the already-trainable MIL + head.
    if hasattr(model, "unfreeze_lora"):
        model.unfreeze_lora()
    elif hasattr(model, "unfreeze_all"):
        model.unfreeze_all()

    n_tr = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[Stage 2] trainable params: {n_tr:,}")

    if hasattr(model, "get_param_groups"):
        pg = model.get_param_groups(lr_backbone=cfg.lr_backbone, lr_head=cfg.lr_head,
                                     wd_head=cfg.wd_head, wd_backbone=cfg.wd_backbone)
    else:
        pg = [{"params": [p for p in model.parameters() if p.requires_grad],
               "lr": cfg.lr_head, "weight_decay": cfg.wd_head}]

    base_opt = torch.optim.AdamW(pg)
    scheduler = _cosine_with_warmup(base_opt, warmup_epochs=cfg.warmup_epochs,
                                     total_epochs=cfg.epochs)

    ldam_loss = LDAMLoss(class_counts, max_m=cfg.ldam_max_m, s=cfg.ldam_scale).to(device)
    cb_ce_loss = ClassBalancedCE(class_counts, beta=cfg.cb_beta).to(device)

    ema = ModelEMA(model, decay=cfg.ema_decay)
    swa_model = AveragedModel(model)
    swa_started = False

    amp = device.type == "cuda"
    scaler = GradScaler() if amp else None
    nc = CFG.model.num_classes

    best_f1 = 0.0
    best_state: Optional[dict] = None

    use_asam = False
    asam: Optional[ASAM] = None
    amp_active = amp  # disabled when ASAM activates to avoid double-unscale

    print(f"\n{'='*60}")
    print(f" Stage 2 — Joint fine-tune  ({cfg.epochs} epochs, "
          f"batch={cfg.batch_size}×{cfg.accumulation_steps}={cfg.batch_size*cfg.accumulation_steps})")
    print(f"  LDAM first {cfg.epochs_ldam_only} epochs -> CB-CE after")
    print(f"  ASAM start: epoch {cfg.sam_start_epoch} / "
          f"SWA start: epoch {cfg.swa_start_epoch}")
    print(f"{'='*60}")

    # Buffers for ASAM second-forward pass (last micro-batch of each update step)
    last_x: Optional[torch.Tensor] = None
    last_y: Optional[torch.Tensor] = None

    for epoch in range(cfg.epochs):
        criterion = ldam_loss if epoch < cfg.epochs_ldam_only else cb_ce_loss

        # Activate ASAM: disable AMP to avoid GradScaler double-unscale
        if epoch == cfg.sam_start_epoch and not use_asam:
            asam = ASAM(base_opt, rho=cfg.sam_rho, adaptive=True)
            use_asam = True
            amp_active = False  # ASAM two-step is incompatible with GradScaler
            print(f"\n>>> [epoch {epoch}] ASAM activated  (AMP disabled for ASAM compat)")

        if epoch == cfg.swa_start_epoch and not swa_started:
            swa_started = True
            print(f">>> [epoch {epoch}] SWA started")

        model.train()
        base_opt.zero_grad(set_to_none=True)
        total_loss = 0.0
        n_steps = 0

        try:
            ctx = autocast(device_type='cuda') if amp_active else nullcontext()
        except TypeError:
            ctx = autocast() if amp_active else nullcontext()
        lrs = [f"{g['lr']:.2e}" for g in base_opt.param_groups]
        print(f"\nEpoch {epoch+1}/{cfg.epochs}  "
              f"{'LDAM' if epoch < cfg.epochs_ldam_only else 'CB-CE'}  "
              f"{'ASAM' if use_asam else 'AdamW'}  "
              f"{'SWA' if swa_started else ''}  "
              f"LRs: {' / '.join(lrs)}")

        for step, batch in enumerate(tr_loader):
            x = batch[0].to(device, non_blocking=True)
            y = batch[-1].to(device, non_blocking=True)

            # Volume-level augmentation: mixup / cutmix / within-class mixup
            r = np.random.rand()
            if r < 0.4:
                x, y = volume_mixup(x, y, nc, alpha=cfg.mixup_alpha)
            elif r < 0.7:
                x, y = volume_cutmix(x, y, nc, alpha=cfg.cutmix_alpha)
            else:
                x, y = within_class_mixup(x, y, nc,
                                           minority_classes=cfg.minority_classes,
                                           alpha=cfg.mixup_alpha)

            with ctx:
                logits = model(x)
                loss = criterion(logits, y) / cfg.accumulation_steps

            if amp_active and scaler:
                scaler.scale(loss).backward()
            else:
                loss.backward()

            total_loss += loss.item() * cfg.accumulation_steps
            n_steps += 1
            last_x = x.detach()
            last_y = y.detach()

            is_update = ((step + 1) % cfg.accumulation_steps == 0 or
                         (step + 1) == len(tr_loader))
            if not is_update:
                continue

            if use_asam:
                # ASAM two-step: no GradScaler (amp_active=False)
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
                asam.first_step(zero_grad=True)

                # Second forward at perturbed weights using last micro-batch
                with nullcontext():
                    logits2 = model(last_x)
                    loss2 = criterion(logits2, last_y)
                loss2.backward()
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
                asam.second_step(zero_grad=True)

            elif amp_active and scaler:
                scaler.unscale_(base_opt)
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
                scaler.step(base_opt)
                scaler.update()
                base_opt.zero_grad(set_to_none=True)
            else:
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
                base_opt.step()
                base_opt.zero_grad(set_to_none=True)

            ema.update(model)

        scheduler.step()

        if swa_started:
            swa_model.update_parameters(model)

        # Validate using EMA shadow model
        val_f1, val_cm, val_dist = _evaluate(ema.module(), va_loader, device, amp_active, nc)
        avg_loss = total_loss / max(1, n_steps)
        print(f"  loss={avg_loss:.4f}  val_F1 (EMA)={val_f1:.4f}")
        print(f"  val CM:\n{val_cm}")
        print(f"  val dist: {val_dist.tolist()}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            best_state = {k: v.clone() for k, v in ema.module().state_dict().items()}
            if ckpt_path:
                Path(ckpt_path).parent.mkdir(parents=True, exist_ok=True)
                torch.save({"epoch": epoch, "model_state": best_state,
                            "val_f1": best_f1}, ckpt_path)
                print(f"  [SAVED] {ckpt_path}  (F1={best_f1:.4f})")

    # Optional: evaluate SWA model and compare against EMA best
    if swa_started:
        try:
            # Apply averaged weights; for ViT (no BN) this is the complete picture.
            # For ConvNeXt, BN stats would ideally be updated but skip to avoid
            # a full dataset pass that may exceed time budget.
            swa_sd = {
                (k[len("module."):] if k.startswith("module.") else k): v
                for k, v in swa_model.state_dict().items()
            }
            model.load_state_dict(swa_sd, strict=False)
            swa_f1, swa_cm, swa_dist = _evaluate(model, va_loader, device, False, nc)
            print(f"\n[Stage 2] SWA model val F1={swa_f1:.4f}")
            print(f"  SWA CM:\n{swa_cm}\n  SWA dist: {swa_dist.tolist()}")
            if swa_f1 > best_f1:
                best_f1 = swa_f1
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
                print(f"  [Stage 2] SWA model is better — using SWA weights")
        except Exception as e:
            print(f"[Stage 2] SWA evaluation skipped: {e}")

    if best_state is not None:
        model.load_state_dict(best_state)
    print(f"\n[Stage 2] done.  Best val F1={best_f1:.4f}")
    return best_f1


# ──────────────────────────────────────────────────────────────────────────────
# Per-fold runner
# ──────────────────────────────────────────────────────────────────────────────

def run_fold(fold_idx: int, train_samples: List[Tuple], val_samples: List[Tuple],
             args: argparse.Namespace, device: torch.device) -> dict:
    """
    Run the full multi-stage pipeline for a single cross-validation fold.

    Executes the stages requested by args.stage ('all', '1', '2', or '3').
    Checkpoints are saved per stage; later stages can resume from earlier ones.

    Args:
        fold_idx (int): Fold index being run.
        train_samples (List[Tuple]): Training samples for this fold.
        val_samples (List[Tuple]): Validation samples for this fold.
        args (argparse.Namespace): Parsed CLI arguments (arch, stage, etc.).
        device (torch.device): Compute device.

    Returns:
        dict: Fold results with per-stage validation F1 scores.
    """
    cfg = CFG
    nc = cfg.model.num_classes
    ckpt_dir = Path(cfg.ckpt_dir)
    results_dir = Path(cfg.results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)

    class_counts = np.bincount([s[1] for s in train_samples], minlength=nc).tolist()
    print(f"\n{'#'*65}")
    print(f"# Fold {fold_idx}  —  train={len(train_samples)}  val={len(val_samples)}")
    print(f"# Class counts (train): {class_counts}")
    print(f"{'#'*65}")

    # Use stride=1 for all architectures; stride=2 discards central tumour slices
    # and disproportionately hurts minority class recall.
    slice_stride = 1
    slice_size = cfg.model.slice_size

    tr_ds_aug = MRI25DSliceDataset(
        train_samples, augment=True, slice_stride=slice_stride, slice_size=slice_size)
    tr_ds_plain = MRI25DSliceDataset(
        train_samples, augment=False, slice_stride=slice_stride, slice_size=slice_size)
    va_ds = MRI25DSliceDataset(
        val_samples, augment=False, slice_stride=slice_stride, slice_size=slice_size)

    sampler = _make_weighted_sampler(train_samples, nc, alpha=1.0)

    s1_cfg = cfg.s1
    s2_cfg = cfg.s2
    s3_cfg = cfg.s3

    pin = device.type == "cuda"
    tr_loader_s1 = DataLoader(tr_ds_aug, batch_size=s1_cfg.batch_size, sampler=sampler,
                               num_workers=NUM_WORKERS, pin_memory=pin)
    tr_loader_s2 = DataLoader(tr_ds_aug, batch_size=s2_cfg.batch_size, sampler=sampler,
                               num_workers=NUM_WORKERS, pin_memory=pin)
    va_loader = DataLoader(va_ds, batch_size=s1_cfg.batch_size, shuffle=False,
                           num_workers=NUM_WORKERS, pin_memory=pin)

    ssl_ckpt = cfg.ssl_ckpt if args.stage in ("all", "1") else None
    model = build_model(args.arch, device, ssl_ckpt=ssl_ckpt)

    fold_results: dict = {"fold": fold_idx, "arch": args.arch}

    # ── Stage 1 ──────────────────────────────────────────────────────────────
    s1_ckpt = str(ckpt_dir / f"fold{fold_idx}_stage1_best.pt")
    if args.stage in ("all", "1"):
        f1_s1 = run_stage1(model, tr_loader_s1, va_loader, device, class_counts,
                            cfg=s1_cfg, ckpt_path=s1_ckpt)
        fold_results["stage1_val_f1"] = f1_s1
    elif args.stage in ("2", "3"):
        if Path(s1_ckpt).exists():
            sd = torch.load(s1_ckpt, map_location=device)
            model.load_state_dict(sd["model_state"])
            print(f"[Fold {fold_idx}] Loaded Stage 1 ckpt  (F1={sd.get('val_f1', '?')})")
        else:
            print(f"[Fold {fold_idx}] WARNING: Stage 1 ckpt not found; proceeding with fresh model")

    # ── Stage 2 ──────────────────────────────────────────────────────────────
    s2_ckpt = str(ckpt_dir / f"fold{fold_idx}_stage2_best.pt")
    if args.stage in ("all", "2"):
        # Rebuild sampler so Stage 2 gets an independent draw sequence
        sampler_s2 = _make_weighted_sampler(train_samples, nc, alpha=1.0)
        tr_loader_s2 = DataLoader(tr_ds_aug, batch_size=s2_cfg.batch_size,
                                   sampler=sampler_s2, num_workers=NUM_WORKERS, pin_memory=pin)
        f1_s2 = run_stage2(model, tr_loader_s2, va_loader, device, class_counts,
                            cfg=s2_cfg, ckpt_path=s2_ckpt)
        fold_results["stage2_val_f1"] = f1_s2
    elif args.stage == "3":
        if Path(s2_ckpt).exists():
            sd = torch.load(s2_ckpt, map_location=device)
            model.load_state_dict(sd["model_state"])
            print(f"[Fold {fold_idx}] Loaded Stage 2 ckpt  (F1={sd.get('val_f1', '?')})")
        else:
            print(f"[Fold {fold_idx}] WARNING: Stage 2 ckpt not found; running cRT on current model")

    # ── Stage 3 — cRT ────────────────────────────────────────────────────────
    if args.stage in ("all", "3"):
        sampler_crt = _make_weighted_sampler(train_samples, nc, alpha=1.0)
        tr_loader_crt = DataLoader(tr_ds_plain, batch_size=s3_cfg.batch_size,
                                    sampler=sampler_crt, num_workers=NUM_WORKERS)
        va_loader_crt = DataLoader(va_ds, batch_size=s3_cfg.batch_size,
                                    shuffle=False, num_workers=NUM_WORKERS)
        f1_s3 = train_crt(model, tr_loader_crt, va_loader_crt, device,
                           cfg=s3_cfg, n_seeds=10)
        fold_results["stage3_val_f1"] = f1_s3

        final_ckpt = str(ckpt_dir / f"fold{fold_idx}_final.pt")
        ckpt_dir.mkdir(parents=True, exist_ok=True)
        torch.save({"fold": fold_idx, "arch": args.arch,
                    "model_state": model.state_dict(), "val_f1": f1_s3}, final_ckpt)
        print(f"[Fold {fold_idx}] Final model saved: {final_ckpt}")

    return fold_results


# ──────────────────────────────────────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    """
    Parse arguments, run cross-validation folds, and print the CV summary.

    Loads the dataset, performs stratified group k-fold splitting (no patient
    leakage), optionally remaps to binary, runs the requested fold(s), and saves
    aggregated results to results/cv_results.json.
    """
    parser = argparse.ArgumentParser(
        description="Breast MRI molecular subtype classification — multi-stage training")
    parser.add_argument("--arch", default=CFG.model.arch,
                        choices=["dinov2_mil", "convnext_mil", "r3d18"],
                        help="Model architecture (default: %(default)s)")
    parser.add_argument("--fold", type=int, default=None,
                        help="Run a single fold index (0-indexed). "
                             "Omit to run all folds.")
    parser.add_argument("--stage", default="all",
                        choices=["all", "1", "2", "3"],
                        help="Which stage(s) to run (default: all)")
    parser.add_argument("--n-splits", type=int, default=CFG.n_splits,
                        help="Number of CV splits (default: %(default)s)")
    args = parser.parse_args()

    setup_file_logger(fold=args.fold if args.fold is not None else 0)

    _seed_everything(CFG.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nPyTorch {torch.__version__}  |  CUDA build: {torch.version.cuda}")
    print(f"Device: {device}")
    if device.type == "cuda":
        p = torch.cuda.get_device_properties(0)
        print(f"GPU: {p.name}  |  VRAM: {p.total_memory/1024**3:.1f} GB")
    else:
        print("WARNING: CUDA unavailable — training on CPU (will be very slow)")

    print(f"\nConfig summary")
    print(f"  arch={args.arch}  stage={args.stage}  n_splits={args.n_splits}")
    print(f"  Stage1: epochs={CFG.s1.epochs}  lr_head={CFG.s1.lr_head}")
    print(f"  Stage2: epochs={CFG.s2.epochs}  ldam={CFG.s2.epochs_ldam_only}  "
          f"sam_start={CFG.s2.sam_start_epoch}  swa_start={CFG.s2.swa_start_epoch}  "
          f"kl_w={CFG.s2.consistency_weight}")
    print(f"  Stage3: epochs={CFG.s3.epochs}  seeds=10")

    print(f"\nLoading samples from {CFG.data_json} ...")
    samples = load_samples(CFG.data_json, CFG.data_root)
    print(f"  {len(samples)} volumes loaded")

    if CFG.model.num_classes == 2:
        # Luminal A(0)+B(1) -> 0, HER2(2)+TN(3) -> 1
        remap = {0: 0, 1: 0, 2: 1, 3: 1}
        samples = [(p, remap[lbl], g) for p, lbl, g in samples]

    labels = [s[1] for s in samples]
    class_counts = [labels.count(c) for c in range(CFG.model.num_classes)]
    print(f"  Global class dist: {class_counts}")

    groups = np.array([s[2] for s in samples])

    skf = StratifiedGroupKFold(n_splits=args.n_splits, shuffle=True, random_state=CFG.seed)
    splits = list(skf.split(samples, labels, groups))

    folds_to_run = [args.fold] if args.fold is not None else list(range(args.n_splits))
    all_results: List[dict] = []

    for fold_idx in folds_to_run:
        train_idx, val_idx = splits[fold_idx]
        train_samples = [samples[i] for i in train_idx]
        val_samples   = [samples[i] for i in val_idx]
        result = run_fold(fold_idx, train_samples, val_samples, args, device)
        all_results.append(result)

    # ── Cross-validation summary ──────────────────────────────────────────────
    print(f"\n{'='*65}")
    print(f" Cross-validation summary")
    print(f"{'='*65}")
    for r in all_results:
        parts = [f"fold={r['fold']}"]
        for k in ("stage1_val_f1", "stage2_val_f1", "stage3_val_f1"):
            if k in r:
                stage_name = k.split("_")[0]
                parts.append(f"{stage_name}={r[k]:.4f}")
        print("  " + "  ".join(parts))

    for stage_key in ("stage3_val_f1", "stage2_val_f1", "stage1_val_f1"):
        vals = [r[stage_key] for r in all_results if stage_key in r]
        if vals:
            print(f"\n  Mean {stage_key}: {np.mean(vals):.4f} ± {np.std(vals):.4f}")
            break

    results_dir = Path(CFG.results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    out_path = results_dir / "cv_results.json"
    with open(out_path, "w") as fh:
        json.dump(all_results, fh, indent=2)
    print(f"\n  Results saved to {out_path}")


if __name__ == "__main__":
    main()
