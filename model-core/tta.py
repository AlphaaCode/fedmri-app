"""
8-view test-time augmentation for 3D volumes of shape (1, D, H, W).

Views: identity + 3 axis flips + 4 axial 90-deg rotations.
"""
from __future__ import annotations
from typing import Iterable
import torch
import torch.nn.functional as F


def tta_views(x: torch.Tensor) -> Iterable[torch.Tensor]:
    # x: (B, 1, D, H, W)
    yield x
    yield torch.flip(x, dims=[-1])                   # H-W flip (L-R)
    yield torch.flip(x, dims=[-2])                   # vertical
    yield torch.flip(x, dims=[-3])                   # depth flip
    for k in (1, 2, 3):
        yield torch.rot90(x, k=k, dims=(-2, -1))      # axial rotations


@torch.no_grad()
def tta_predict(model, x: torch.Tensor) -> torch.Tensor:
    """Return averaged softmax probabilities over 8 views."""
    probs = []
    for v in tta_views(x):
        logits = model(v)
        probs.append(F.softmax(logits, dim=-1))
    return torch.stack(probs, dim=0).mean(dim=0)
