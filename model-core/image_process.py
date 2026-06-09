"""
image_process.py
================
Preprocessing, 3D augmentation, and 2.5D slice-view transforms for MRI volumes.

This module implements the deterministic preprocessing pipeline that converts
raw DCE-MRI .mha files into normalised, fixed-size volumes, plus the stochastic
3D augmentation applied during training, and the slice-view transform that
formats volumes for the 2D backbones (DINOv2 / ConvNeXt).

Preprocessing pipeline (deterministic, cacheable):
    Input .mha     : arbitrary size (typically ~300×512×512 D×H×W)
    After normalize: same shape, values in [0, 1]
    After center_crop: (150, 380, 380)   — removes empty borders
    After resize_3d:  (64, 128, 128)     — final model input volume

Function summary:
    preprocess_raw(path)      : deterministic, cacheable (load → normalize → crop → resize)
    augment_volume_3d(vol)    : stochastic, called every __getitem__ (never cached)
    slice_view_transform(vol) : convert (D,H,W) volume to (D,3,224,224) for DINOv2
    make_two_views(vol)       : two independently augmented views for consistency loss

Pipeline position:
    raw .mha files → THIS MODULE → data_loader.py (Dataset classes)

Reproducibility: stochastic augmentation uses numpy.random, seeded globally
(seed=42) at startup in main.py and fl_train.py.

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
from typing import Tuple, Optional
import numpy as np
import SimpleITK as sitk
import torch
import torch.nn.functional as F

DEFAULT_TARGET_SHAPE = (64, 128, 128)          # final model input: D × H × W
IMAGENET_MEAN = (0.485, 0.456, 0.406)          # ImageNet RGB mean (backbone pretrain stats)
IMAGENET_STD = (0.229, 0.224, 0.225)           # ImageNet RGB std

_MONAI_OPS = None   # lazily-initialised MONAI transform cache (built on first use)


def _get_monai_ops():
    """
    Lazily build MONAI random transforms (affine, elastic, bias field).

    Cached in the module-global _MONAI_OPS to avoid rebuilding on every call.
    Returns an empty tuple if MONAI is not installed (augmentation degrades
    gracefully to numpy-only flips/rotations).

    Returns:
        tuple: (affine, elastic, bias) MONAI transforms, or () if unavailable.
    """
    global _MONAI_OPS
    if _MONAI_OPS is not None:
        return _MONAI_OPS
    try:
        from monai.transforms import (
            RandAffine, RandBiasField, Rand3DElastic,
        )
        affine = RandAffine(
            prob=0.5, rotate_range=(0.175, 0.175, 0.175),
            scale_range=(0.1, 0.1, 0.1), translate_range=(0.05, 0.05, 0.05),
            mode="bilinear", padding_mode="zeros",
        )
        elastic = Rand3DElastic(
            prob=0.2, sigma_range=(3, 5), magnitude_range=(20, 40),
            mode="bilinear", padding_mode="zeros",
        )
        bias = RandBiasField(prob=0.3, degree=3, coeff_range=(0.0, 0.1))
        _MONAI_OPS = (affine, elastic, bias)
    except Exception:
        _MONAI_OPS = tuple()
    return _MONAI_OPS


# ------------------------------------------------------------------
# Deterministic preprocessing (cacheable)
# ------------------------------------------------------------------
def load_mha(path: str) -> np.ndarray:
    """
    Load a .mha volume with SimpleITK as a float32 numpy array.

    Args:
        path (str): Path to the .mha file.

    Returns:
        np.ndarray: Volume of shape (D, H, W), raw intensities.
    """
    image = sitk.ReadImage(path, sitk.sitkFloat32)
    return sitk.GetArrayFromImage(image)   # (D, H, W)


def normalize(volume: np.ndarray) -> np.ndarray:
    """
    Percentile-clip and min-max normalise a volume to [0, 1].

    Uses the 1st/99th percentiles of the foreground (intensity > 5th percentile)
    to clip outliers before scaling, making normalisation robust to bright
    artefacts and contrast variation across scanners.

    Args:
        volume (np.ndarray): Raw volume (D, H, W). Modified in-place to avoid a
            large temporary copy on ~200 MB raw volumes.

    Returns:
        np.ndarray: Same shape, values in [0, 1].
    """
    threshold = np.percentile(volume, 5)   # foreground threshold (exclude dark background)
    mask = volume > threshold
    if mask.sum() > 0:
        p1 = float(np.percentile(volume[mask], 1))
        p99 = float(np.percentile(volume[mask], 99))
    else:
        p1, p99 = float(volume.min()), float(volume.max())
    # in-place to avoid a 200 MB temporary on raw (200,512,512) volumes
    np.clip(volume, p1, p99, out=volume)
    if p99 - p1 > 1e-8:
        volume -= p1
        volume /= (p99 - p1)
    else:
        volume[:] = 0.0
    return volume


def center_crop(volume: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
    """
    Centre-crop a volume to target_shape (no padding if volume is smaller).

    Args:
        volume (np.ndarray): Input volume (D, H, W).
        target_shape (Tuple[int, int, int]): Desired (D, H, W) after cropping.

    Returns:
        np.ndarray: Cropped volume, at most target_shape on each axis.
    """
    d, h, w    = volume.shape
    td, th, tw = target_shape
    # Compute centred start indices on each axis (clamped to >= 0)
    sd = max((d - td) // 2, 0); sh = max((h - th) // 2, 0); sw = max((w - tw) // 2, 0)
    ed = sd + min(td, d); eh = sh + min(th, h); ew = sw + min(tw, w)
    return volume[sd:ed, sh:eh, sw:ew]


def resize_3d(volume: np.ndarray, target_shape: Tuple[int, int, int]) -> np.ndarray:
    """
    Trilinearly resize a 3D volume to target_shape using PyTorch.

    Args:
        volume (np.ndarray): Input volume (D, H, W).
        target_shape (Tuple[int, int, int]): Output (D, H, W).

    Returns:
        np.ndarray: Resized volume of shape target_shape.
    """
    t = torch.from_numpy(volume).unsqueeze(0).unsqueeze(0)   # (D,H,W) → (1,1,D,H,W)
    r = F.interpolate(t, size=target_shape, mode="trilinear", align_corners=False)
    return r.squeeze(0).squeeze(0).numpy()                   # (1,1,D,H,W) → (D,H,W)


def preprocess_raw(path: str, target_shape=DEFAULT_TARGET_SHAPE) -> np.ndarray:
    """
    Full deterministic preprocessing pipeline for a single .mha volume.

    Pipeline:
        load_mha      → (D, H, W) raw intensities (typically ~300×512×512)
        normalize     → same shape, values in [0, 1]
        center_crop   → (150, 380, 380), removes empty borders
        resize_3d     → (64, 128, 128), final model input

    This function is deterministic and therefore safe to cache (see data_loader.py).

    Args:
        path (str): Path to the .mha file.
        target_shape (Tuple[int, int, int]): Final volume shape. Default (64, 128, 128).

    Returns:
        np.ndarray: Preprocessed volume of shape target_shape, values in [0, 1].
    """
    v = load_mha(path)                  # (D, H, W) raw
    v = normalize(v)                    # → [0, 1]
    v = center_crop(v, (150, 380, 380))  # → (150, 380, 380)
    v = resize_3d(v, target_shape)      # → (64, 128, 128)
    return v


# Back-compat alias
preprocess = preprocess_raw


# ------------------------------------------------------------------
# Stochastic 3D augmentation (never cached)
# ------------------------------------------------------------------
def augment_volume_3d(volume: np.ndarray, use_monai: bool = False) -> np.ndarray:
    """
    Apply strong stochastic 3D augmentation to a volume.

    Augmentations (each applied with its own probability):
        - Random flips along each of the 3 axes
        - Random 90° axial rotations
        - Optional MONAI affine / elastic / bias-field warps (use_monai=True)
        - Intensity scale + shift, Gaussian noise, gamma correction
        - 3D cutout (random cuboid zeroed out)

    This function is stochastic and must NOT be cached — it is called fresh on
    every __getitem__ to produce a different view each epoch.

    Args:
        volume (np.ndarray): Input volume (D, H, W), values in [0, 1].
        use_monai (bool): Apply MONAI spatial transforms if available. Default False.

    Returns:
        np.ndarray: Augmented volume, same shape, values clipped to [0, 1].
    """
    rng = np.random
    # flips
    if rng.rand() < 0.5:
        volume = np.flip(volume, axis=2)
    if rng.rand() < 0.5:
        volume = np.flip(volume, axis=1)
    if rng.rand() < 0.2:
        volume = np.flip(volume, axis=0)
    # 90-deg axial rotations
    if rng.rand() < 0.3:
        k = int(rng.choice([1, 2, 3]))
        volume = np.rot90(volume, k=k, axes=(1, 2))
    volume = np.ascontiguousarray(volume)

    # MONAI affine/elastic/bias — operate on (1, D, H, W) tensor
    if use_monai:
        ops = _get_monai_ops()
        if ops:
            affine, elastic, bias = ops
            t = torch.from_numpy(volume).unsqueeze(0)  # (1, D, H, W)
            try:
                t = affine(t)
                t = elastic(t)
                t = bias(t)
                volume = t.squeeze(0).numpy().astype(np.float32)
                volume = np.clip(volume, 0.0, 1.0)
            except Exception:
                pass

    # intensity scale + shift
    if rng.rand() < 0.3:
        scale = rng.uniform(0.85, 1.15); shift = rng.uniform(-0.1, 0.1)
        volume = np.clip(volume * scale + shift, 0.0, 1.0)
    # Gaussian noise
    if rng.rand() < 0.2:
        sigma = rng.uniform(0.01, 0.04)
        volume = np.clip(volume + rng.normal(0, sigma, volume.shape).astype(np.float32),
                         0.0, 1.0)
    # gamma
    if rng.rand() < 0.2:
        g = rng.uniform(0.7, 1.4)
        volume = np.power(np.clip(volume, 1e-8, 1.0), g).astype(np.float32)
    # 3D cutout
    if rng.rand() < 0.15:
        d, h, w = volume.shape
        cd = rng.randint(4, max(5, d // 4))
        ch = rng.randint(4, max(5, h // 4))
        cw = rng.randint(4, max(5, w // 4))
        sd = rng.randint(0, max(1, d - cd))
        sh = rng.randint(0, max(1, h - ch))
        sw = rng.randint(0, max(1, w - cw))
        volume = volume.copy()
        volume[sd:sd + cd, sh:sh + ch, sw:sw + cw] = 0.0
    return volume.astype(np.float32, copy=False)


# Back-compat alias
augment_volume = augment_volume_3d


def make_two_views(volume: np.ndarray):
    """
    Produce two independently augmented views of the same preprocessed volume.

    Used for the optional consistency KL loss (currently disabled). The two
    views differ because augment_volume_3d is stochastic.

    Args:
        volume (np.ndarray): Preprocessed volume (D, H, W).

    Returns:
        Tuple[np.ndarray, np.ndarray]: Two independently augmented volumes.
    """
    return augment_volume_3d(volume), augment_volume_3d(volume)


# ------------------------------------------------------------------
# 2.5D slice-view transform for DINOv2-S/14 (224x224 RGB)
# ------------------------------------------------------------------
_MEAN_T = None
_STD_T = None


def _mean_std(device, dtype):
    """
    Return cached ImageNet mean/std tensors on the requested device and dtype.

    Rebuilds the cached tensors only when device or dtype changes, avoiding
    repeated allocations during the hot training loop.

    Args:
        device: Target torch device.
        dtype: Target torch dtype.

    Returns:
        Tuple[torch.Tensor, torch.Tensor]: (mean, std), each shape (1, 3, 1, 1).
    """
    global _MEAN_T, _STD_T
    if _MEAN_T is None or _MEAN_T.device != device or _MEAN_T.dtype != dtype:
        _MEAN_T = torch.tensor(IMAGENET_MEAN, device=device, dtype=dtype).view(1, 3, 1, 1)
        _STD_T  = torch.tensor(IMAGENET_STD,  device=device, dtype=dtype).view(1, 3, 1, 1)
    return _MEAN_T, _STD_T


def slice_view_transform(volume: torch.Tensor, size: int = 224) -> torch.Tensor:
    """
    Convert a single volume to a stack of ImageNet-normalised RGB slices.

    Transformation:
        (D, H, W) volume in [0, 1]
          → unsqueeze       → (D, 1, H, W): add channel dimension
          → bilinear resize → (D, 1, size, size)
          → expand to RGB   → (D, 3, size, size): replicate grey channel ×3
          → ImageNet norm   → (x - mean) / std

    Args:
        volume (torch.Tensor): Shape (D, H, W) or (1, D, H, W), values in [0, 1].
        size (int): Output spatial size. Default 224 (ImageNet standard).

    Returns:
        torch.Tensor: Shape (D, 3, size, size), ImageNet-normalised.

    Raises:
        AssertionError: If the input is not 3-D after squeezing.
    """
    if volume.dim() == 4 and volume.size(0) == 1:
        volume = volume.squeeze(0)   # (1, D, H, W) → (D, H, W)
    assert volume.dim() == 3, f"expected (D,H,W), got {volume.shape}"
    D, H, W = volume.shape
    x = volume.unsqueeze(1)                            # (D, H, W) → (D, 1, H, W)
    x = F.interpolate(x, size=(size, size), mode="bilinear", align_corners=False)
    x = x.expand(-1, 3, -1, -1).contiguous()          # grey → RGB: (D, 3, size, size)
    mean, std = _mean_std(x.device, x.dtype)
    x = (x - mean) / std                               # ImageNet normalisation
    return x


def slice_view_transform_batch(volumes: torch.Tensor, size: int = 224) -> torch.Tensor:
    """
    Batched version of slice_view_transform.

    Args:
        volumes (torch.Tensor): Shape (B, 1, D, H, W) or (B, D, H, W), [0, 1].
        size (int): Output spatial size. Default 224.

    Returns:
        torch.Tensor: Shape (B, D, 3, size, size), ImageNet-normalised.

    Raises:
        AssertionError: If the input is not 4-D after squeezing.
    """
    if volumes.dim() == 5:
        volumes = volumes.squeeze(1)   # (B, 1, D, H, W) → (B, D, H, W)
    assert volumes.dim() == 4, f"expected (B,D,H,W), got {volumes.shape}"
    B, D, H, W = volumes.shape
    x = volumes.reshape(B * D, 1, H, W)                # flatten batch+depth for resize
    x = F.interpolate(x, size=(size, size), mode="bilinear", align_corners=False)
    x = x.expand(-1, 3, -1, -1).contiguous()           # grey → RGB
    mean, std = _mean_std(x.device, x.dtype)
    x = (x - mean) / std
    return x.view(B, D, 3, size, size)                 # restore (B, D, 3, size, size)
