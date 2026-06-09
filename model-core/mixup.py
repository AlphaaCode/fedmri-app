"""
Volume-level Mixup/CutMix and feature-space Manifold Mixup.

Soft labels (one-hot) are returned; loss functions in losses.py accept them.
"""
from __future__ import annotations
import numpy as np
import torch


def _one_hot(y: torch.Tensor, num_classes: int) -> torch.Tensor:
    return torch.nn.functional.one_hot(y, num_classes=num_classes).float()


def volume_mixup(x: torch.Tensor, y: torch.Tensor, num_classes: int,
                 alpha: float = 0.2):
    """Mixup on (B, S, C, H, W) or (B, 1, D, H, W) inputs."""
    if alpha <= 0:
        return x, _one_hot(y, num_classes)
    lam = float(np.random.beta(alpha, alpha))
    idx = torch.randperm(x.size(0), device=x.device)
    x_mix = lam * x + (1.0 - lam) * x[idx]
    y1 = _one_hot(y, num_classes)
    y_mix = lam * y1 + (1.0 - lam) * y1[idx]
    return x_mix, y_mix


def volume_cutmix(x: torch.Tensor, y: torch.Tensor, num_classes: int,
                  alpha: float = 1.0):
    """
    CutMix on the spatial axes of the last two dims of x.
    Supports (B, S, C, H, W) — slices share the same cut — or (B, 1, D, H, W).
    """
    if alpha <= 0:
        return x, _one_hot(y, num_classes)
    lam = float(np.random.beta(alpha, alpha))
    idx = torch.randperm(x.size(0), device=x.device)
    H, W = x.shape[-2], x.shape[-1]
    cut_h = int(H * np.sqrt(1.0 - lam))
    cut_w = int(W * np.sqrt(1.0 - lam))
    if cut_h < 2 or cut_w < 2:
        return x, _one_hot(y, num_classes)
    cy = np.random.randint(H)
    cx = np.random.randint(W)
    y1_, y2_ = max(0, cy - cut_h // 2), min(H, cy + cut_h // 2)
    x1_, x2_ = max(0, cx - cut_w // 2), min(W, cx + cut_w // 2)
    x = x.clone()
    x[..., y1_:y2_, x1_:x2_] = x[idx][..., y1_:y2_, x1_:x2_]
    lam_eff = 1.0 - ((y2_ - y1_) * (x2_ - x1_)) / float(H * W)
    y1 = _one_hot(y, num_classes)
    y_mix = lam_eff * y1 + (1.0 - lam_eff) * y1[idx]
    return x, y_mix


def feature_mixup(feat: torch.Tensor, y: torch.Tensor, num_classes: int,
                  alpha: float = 0.2):
    """Manifold Mixup on (B, F)."""
    if alpha <= 0:
        return feat, _one_hot(y, num_classes)
    lam = float(np.random.beta(alpha, alpha))
    idx = torch.randperm(feat.size(0), device=feat.device)
    f_mix = lam * feat + (1.0 - lam) * feat[idx]
    y1 = _one_hot(y, num_classes)
    y_mix = lam * y1 + (1.0 - lam) * y1[idx]
    return f_mix, y_mix


def within_class_mixup(x: torch.Tensor, y: torch.Tensor, num_classes: int,
                       minority_classes, alpha: float = 0.2):
    """
    Mixup only pairs of same-class minority samples present in the batch.
    Returns original x, y (one-hot) if no mix is possible.
    """
    y_oh = _one_hot(y, num_classes)
    if alpha <= 0:
        return x, y_oh
    x_out = x.clone()
    y_out = y_oh.clone()
    lam = float(np.random.beta(alpha, alpha))
    for c in minority_classes:
        idx = (y == c).nonzero(as_tuple=True)[0]
        if idx.numel() < 2:
            continue
        perm = idx[torch.randperm(idx.numel(), device=x.device)]
        x_out[idx] = lam * x[idx] + (1.0 - lam) * x[perm]
        # labels unchanged since same class
    return x_out, y_out
