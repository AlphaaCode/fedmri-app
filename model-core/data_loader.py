"""
data_loader.py
==============
Dataset classes and sample loading utilities for the breast MRI pipeline.

This module provides PyTorch Dataset implementations that handle the full data
ingestion pipeline: loading raw .mha volumes, applying deterministic preprocessing
(normalise → centre crop → resize), applying stochastic 3D augmentation, and
returning per-slice tensors formatted for the DINOv2 / ConvNeXt MIL backbones.

Three-tier data loading system (fastest to slowest):
    1. In-memory LRU cache (_RawVolumeCache): ~0 ms per volume after first load.
    2. Pre-built .npy cache (NPY_CACHE_DIR env var): ~50 ms per volume read.
    3. Raw .mha via SimpleITK + preprocess_raw: ~1.5 s per volume load.
    Set NPY_CACHE_DIR before training to enable disk caching.

Datasets provided:
    MRI25DSliceDataset  — primary: returns (S, 3, 224, 224) per volume (DINOv2 input)
    MRIDatasetFromJSON  — legacy back-compat: returns (1, D, H, W) 3D volume
    MRISSLSliceDataset  — SSL pre-training: flat list of 2D slices
    MRITTADataset       — test-time augmentation: 8 views per volume

Binary label remap (for fl_train.py and binary experiments):
    REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
    Luminal A (0) + Luminal B (1) → 0 (Luminal)
    HER2 (2) + Triple Negative (3) → 1 (Non-Luminal)

Pipeline position:
    build_npy_cache.py (cache) → THIS MODULE → main.py, fl_train.py

Reproducibility: random seeds for augmentation are controlled by numpy.random,
seeded globally at startup in main.py and fl_train.py.

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import json
import os
import re
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from image_process import (
    preprocess_raw,
    augment_volume_3d,
    make_two_views,
    slice_view_transform,
)

# Regex to extract patient ID integer from filenames like "Breast_MRI_0237_0000.mha"
_PID_RE = re.compile(r"Breast_MRI_(\d+)")


def parse_patient_id(path_or_name: str) -> Optional[int]:
    """
    Extract the integer patient ID from a filename in the Breast MRI dataset.

    Patient filenames follow the convention "Breast_MRI_XXXX[_0000].mha".
    The extracted ID is used as the grouping variable in StratifiedGroupKFold
    to prevent the same patient appearing in both train and validation splits.

    Args:
        path_or_name (str): File path or filename string.

    Returns:
        Optional[int]: Integer patient ID, or None if the pattern is not found
            (e.g. for custom filenames outside the standard convention).
    """
    m = _PID_RE.search(str(path_or_name))
    return int(m.group(1)) if m else None


# ── Sample Parsing ────────────────────────────────────────────────────────────

def load_samples(json_path: str, root_dir: str) -> List[Tuple[str, int, int]]:
    """
    Parse dataset.json into a list of (abs_path, label, patient_id) tuples.

    The dataset.json follows the nnUNet format with a top-level "training" list.
    Each entry has keys "image" (relative path to .mha file) and
    "Molecular_subtype" (integer 0–3).

    Fallback logic:
        - Relative paths are resolved against root_dir.
        - If the resolved path does not exist, appends "_0000" suffix and retries
          (some files are named Breast_MRI_XXXX_0000.mha, not Breast_MRI_XXXX.mha).
        - If no patient ID is found in the filename, a hash of the filename is used
          as a pseudo-ID (ensures group CV still works without leakage).

    Args:
        json_path (str): Absolute path to dataset.json.
        root_dir (str): Root directory containing the .mha volume files.

    Returns:
        List[Tuple[str, int, int]]: Each tuple is (absolute_path, label, patient_id).

    Raises:
        FileNotFoundError: If root_dir does not exist.
    """
    root = Path(root_dir).expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Data directory does not exist: {root}")

    with open(json_path, "r") as f:
        data: Dict[str, Any] = json.load(f)

    out: List[Tuple[str, int, int]] = []
    for item in data["training"]:
        rel = str(item["image"]).replace("\\", "/")
        if rel.startswith("imagesTr/"):
            rel = rel.split("imagesTr/", 1)[1]   # strip redundant prefix

        p    = Path(rel)
        path = p.resolve() if p.is_absolute() else (root / p).resolve()

        # Fallback: try appending _0000 suffix if canonical path does not exist
        if not path.exists() and not path.name.endswith("_0000.mha"):
            alt = path.with_name(path.stem + "_0000" + path.suffix)
            if alt.exists():
                path = alt

        label = int(item["Molecular_subtype"])   # 0=Luminal A, 1=Luminal B, 2=HER2, 3=TN
        pid   = parse_patient_id(path.name)
        if pid is None:
            # Hash fallback: guarantees unique integer without leakage risk
            pid = hash(path.name) & 0x7FFFFFFF

        out.append((str(path), label, pid))
    return out


# ── NPY Cache Utilities ───────────────────────────────────────────────────────

def _npy_path_for(mha_path: str) -> Optional[Path]:
    """
    Return the pre-cached .npy file path for a given .mha volume.

    The NPY cache stores preprocessed volumes as float32 numpy arrays to
    avoid re-running the expensive SimpleITK load + preprocessing on every epoch.

    Cache format:
        {NPY_CACHE_DIR}/{patient_stem}.npy → float32 array of shape (64, 128, 128)
        Preprocessing: normalize → center_crop(150,380,380) → resize(64,128,128)

    Args:
        mha_path (str): Absolute path to the .mha file.

    Returns:
        Optional[Path]: Path to the .npy cache file, or None if NPY_CACHE_DIR
            is not set.
    """
    cache_dir = os.environ.get("NPY_CACHE_DIR", "")
    if not cache_dir:
        return None
    stem = Path(mha_path).stem   # e.g. "Breast_MRI_0237" from "Breast_MRI_0237_0000.mha"
    return Path(cache_dir) / f"{stem}.npy"


class _RawVolumeCache:
    """
    LRU in-memory cache for deterministically preprocessed volumes.

    Accelerates data loading by caching preprocessed (64, 128, 128) float32
    arrays in memory.  The preprocessing pipeline (normalise → centre crop →
    resize) is deterministic, so caching does not affect reproducibility.

    Load priority (fastest first):
        1. In-memory LRU dict.
        2. Pre-cached .npy on disk (NPY_CACHE_DIR env var, ~50 ms/load).
        3. Raw .mha via SimpleITK + preprocess_raw (~1.5 s/load).

    The cache is capped at ``max_size`` volumes (~4 MB each for float32
    64×128×128) to avoid silent out-of-memory on machines with limited RAM.

    Args:
        max_size (int): Maximum number of volumes to keep in memory. Default 200
            (~800 MB RAM — safe for 16 GB systems).
    """

    def __init__(self, max_size: int = 200):
        self._d:     Dict[str, np.ndarray] = {}   # volume cache dict
        self._order: list                  = []   # LRU insertion order
        self._max    = max_size

    def _load(self, path: str) -> np.ndarray:
        """Load a volume from NPY cache or raw .mha (fallback)."""
        npy = _npy_path_for(path)
        if npy is not None and npy.exists():
            return np.load(str(npy))   # ~50 ms: fast binary load
        return preprocess_raw(path).astype(np.float32, copy=False)  # ~1.5 s: slow path

    def get(self, path: str) -> np.ndarray:
        """
        Retrieve a volume from cache, loading and caching it if not present.

        On cache miss, the oldest entry is evicted if the cache is full (LRU).

        Args:
            path (str): Absolute path to the .mha volume file.

        Returns:
            np.ndarray: Float32 array of shape (64, 128, 128), values in [0, 1].
        """
        v = self._d.get(path)
        if v is None:
            v = self._load(path)
            if len(self._d) >= self._max:
                evict = self._order.pop(0)   # evict oldest (LRU policy)
                del self._d[evict]
            self._d[path]  = v
            self._order.append(path)
        else:
            # Move to end of order list (most recently used)
            self._order.remove(path)
            self._order.append(path)
        return v


# Global shared cache: all Dataset instances share one LRU cache to minimise
# duplicate disk reads when multiple DataLoaders are active simultaneously.
_SHARED_CACHE = _RawVolumeCache()


# ── Legacy 3D Dataset ─────────────────────────────────────────────────────────

class MRIDatasetFromJSON(Dataset):
    """
    Legacy 3D volume dataset for the R3D-18 backbone (v1.x back-compat).

    Returns volumes in (1, D, H, W) format suitable for 3D convolution.
    Superseded by MRI25DSliceDataset for the 2.5D MIL pipeline.

    Args:
        json_path (str): Path to dataset.json.
        root_dir (str): Root directory for .mha files.
        transform: Optional volume transform (applied after preprocessing).
        augment (bool): Apply 3D augmentation. Default True.
        cache_preprocessed (bool): Use in-memory volume cache. Default True.
    """

    def __init__(
        self,
        json_path: str,
        root_dir: str,
        transform=None,
        augment: bool = True,
        cache_preprocessed: bool = True,
    ):
        self.samples           = load_samples(json_path, root_dir)
        self.augment           = augment
        self.cache_preprocessed = cache_preprocessed
        self.transform         = transform

    def __len__(self) -> int:
        return len(self.samples)

    def _load_raw(self, path: str) -> np.ndarray:
        if self.cache_preprocessed:
            return _SHARED_CACHE.get(path)   # LRU cache path
        return preprocess_raw(path)           # direct disk read

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor]:
        path, label, _ = self.samples[idx]
        base = self._load_raw(path)
        vol  = np.array(base, dtype=np.float32, copy=True)   # defensive copy

        if self.transform is not None:
            vol = self.transform(vol)
        if self.augment:
            vol = augment_volume_3d(vol)

        vol = np.ascontiguousarray(vol)
        vol = np.expand_dims(vol, 0)    # (D, H, W) → (1, D, H, W): add channel dim
        return torch.from_numpy(vol).float(), torch.tensor(label, dtype=torch.long)


# ── Primary 2.5D Slice Dataset ────────────────────────────────────────────────

class MRI25DSliceDataset(Dataset):
    """
    Primary dataset for DINOv2 / ConvNeXt MIL training.

    Converts each 3D MRI volume (64, 128, 128) into a stack of 2D slices
    formatted for ImageNet-pretrained backbones:

        Volume preprocessing (deterministic, cached):
            .mha  → normalize → center_crop(150,380,380) → resize(64,128,128)
            → float32 numpy array in [0, 1]

        Slice formatting (per __getitem__):
            (D, H, W) volume  →  augment_volume_3d  →  slice_view_transform
            → (S, 3, 224, 224) ImageNet-normalized tensor

        where S = D // slice_stride (all slices by default, stride=1).

    If return_two_views=True, returns (view1, view2, label) for the optional
    consistency KL loss (currently disabled; batch_size too small).

    Args:
        samples (List[Tuple]): List of (path, label, patient_id).
        augment (bool): Apply stochastic 3D augmentation. Default True.
            Set False for validation, cRT feature extraction, and evaluation.
        return_two_views (bool): Return two independently augmented views.
            Default False.
        slice_size (int): Output spatial size in pixels. Default 224
            (ImageNet standard — DINOv2 and ConvNeXt expect 224×224).
        slice_stride (int): Step between selected slices. Default 1 (all slices).
            Stride 2 reduces memory but discards central tumour slices —
            use stride 1 for best minority class recall.
        cache (Optional[_RawVolumeCache]): Volume cache. Uses _SHARED_CACHE
            by default.
    """

    def __init__(
        self,
        samples: List[Tuple[str, int, int]],
        *,
        augment: bool = True,
        return_two_views: bool = False,
        slice_size: int = 224,   # ImageNet standard — ConvNeXt/DINOv2 input size
        slice_stride: int = 1,
        cache: Optional[_RawVolumeCache] = None,
    ):
        self.samples          = list(samples)
        self.augment          = augment
        self.return_two_views = return_two_views
        self.slice_size       = slice_size
        self.slice_stride     = max(1, int(slice_stride))
        self.cache            = cache or _SHARED_CACHE

    def __len__(self) -> int:
        return len(self.samples)

    def _subsample(self, vol_np: np.ndarray) -> np.ndarray:
        """
        Apply slice subsampling with the configured stride.

        Args:
            vol_np (np.ndarray): Shape (D, H, W).

        Returns:
            np.ndarray: Shape (D // stride, H, W).
        """
        if self.slice_stride <= 1:
            return vol_np                          # no subsampling (default)
        return vol_np[::self.slice_stride]         # every nth slice along depth

    def _to_slices(self, vol_np: np.ndarray) -> torch.Tensor:
        """
        Convert a preprocessed volume to an ImageNet-normalised slice tensor.

        Steps:
            1. Subsample slices (no-op if stride=1).
            2. Convert to contiguous float32 tensor.
            3. Apply slice_view_transform: resize to 224×224, replicate to RGB,
               apply ImageNet normalisation (mean=[0.485, 0.456, 0.406],
               std=[0.229, 0.224, 0.225]).

        Args:
            vol_np (np.ndarray): Shape (D, H, W), values in [0, 1].

        Returns:
            torch.Tensor: Shape (S, 3, slice_size, slice_size), normalised.
        """
        vol_np = self._subsample(vol_np)
        t      = torch.from_numpy(np.ascontiguousarray(vol_np)).float()
        return slice_view_transform(t, size=self.slice_size)   # (S, 3, H, W)

    def __getitem__(self, idx: int):
        """
        Load, augment, and format a single volume.

        Returns:
            If return_two_views=False (default):
                (slices, label): slices shape (S, 3, 224, 224), label is int64.
            If return_two_views=True:
                (view1, view2, label): two independently augmented slice tensors.
        """
        path, label, _ = self.samples[idx]
        base = self.cache.get(path)                        # (64, 128, 128) float32
        lbl  = torch.tensor(label, dtype=torch.long)

        if self.return_two_views and self.augment:
            v1, v2 = make_two_views(base)                  # two random augmentations
            return self._to_slices(v1), self._to_slices(v2), lbl

        vol = np.array(base, dtype=np.float32, copy=True)  # defensive copy
        if self.augment:
            vol = augment_volume_3d(vol)                   # stochastic 3D augmentation
        return self._to_slices(vol), lbl                   # (S, 3, 224, 224), int64


# ── SSL Slice Dataset ─────────────────────────────────────────────────────────

class MRISSLSliceDataset(Dataset):
    """
    Flat list of individual 2D axial slices for SimMIM SSL pre-training.

    Unlike MRI25DSliceDataset (which groups slices by volume), this dataset
    treats each slice as an independent sample.  Near-background slices
    (mean intensity < bg_thresh) are discarded to avoid training on empty images.

    This dataset is used by ssl_pretrain.py and has no impact on the supervised
    training pipeline.

    Args:
        samples (List[Tuple]): List of (path, label, patient_id).
        bg_thresh (float): Minimum mean intensity to include a slice. Default 0.05.
        slice_size (int): Output spatial size. Default 224.
        cache (Optional[_RawVolumeCache]): Volume cache.
        augment (bool): Apply horizontal/vertical flips and intensity jitter.
    """

    def __init__(
        self,
        samples: List[Tuple[str, int, int]],
        *,
        bg_thresh: float = 0.05,    # discard slices with mean < 0.05 (background)
        slice_size: int = 224,      # ImageNet standard
        cache: Optional[_RawVolumeCache] = None,
        augment: bool = True,
    ):
        self.cache      = cache or _SHARED_CACHE
        self.slice_size = slice_size
        self.augment    = augment

        # Pre-build flat index: (volume_path, slice_depth_index) for each valid slice
        self.index: List[Tuple[str, int]] = []
        for path, _, _ in samples:
            vol = self.cache.get(path)
            for d in range(vol.shape[0]):                   # iterate over depth slices
                if float(vol[d].mean()) >= bg_thresh:       # skip near-background slices
                    self.index.append((path, d))

    def __len__(self) -> int:
        return len(self.index)

    def __getitem__(self, idx: int) -> torch.Tensor:
        """
        Return a single 2D slice as an ImageNet-normalised (3, H, W) tensor.

        Args:
            idx (int): Index into the flat slice list.

        Returns:
            torch.Tensor: Shape (3, slice_size, slice_size), ImageNet-normalised.
        """
        path, d = self.index[idx]
        vol     = self.cache.get(path)
        sl      = vol[d]   # (H, W) — single axial slice

        if self.augment:
            if np.random.rand() < 0.5:
                sl = np.flip(sl, axis=-1)   # horizontal flip
            if np.random.rand() < 0.15:
                sl = np.flip(sl, axis=-2)   # vertical flip (less common in MRI)
            if np.random.rand() < 0.3:
                scale = np.random.uniform(0.85, 1.15)
                shift = np.random.uniform(-0.1, 0.1)
                sl    = np.clip(sl * scale + shift, 0.0, 1.0)  # intensity jitter
            sl = np.ascontiguousarray(sl)

        # (H, W) → (1, 1, H, W) → bilinear resize → (1, 3, S, S) → (3, S, S)
        t = torch.from_numpy(np.ascontiguousarray(sl)).float().unsqueeze(0).unsqueeze(0)
        t = torch.nn.functional.interpolate(
            t, size=(self.slice_size, self.slice_size),
            mode="bilinear", align_corners=False,
        )
        t = t.expand(-1, 3, -1, -1).contiguous().squeeze(0)   # (3, S, S): grey → RGB

        # ImageNet normalisation: (x - mean) / std
        mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
        std  = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)
        return (t - mean) / std


# ── TTA Dataset Wrapper ───────────────────────────────────────────────────────

class MRITTADataset(Dataset):
    """
    Test-time augmentation dataset: returns 8 augmented views per volume.

    Each view is a (1, D, H, W) tensor (3D volume format).  The 8 views are:
    identity + 3 axis flips + 4 axial 90° rotations.  Softmax probabilities
    are averaged over views at inference time (see tta.py).

    Args:
        samples (List[Tuple]): List of (path, label, patient_id).
        cache (Optional[_RawVolumeCache]): Volume cache.
    """

    def __init__(
        self,
        samples: List[Tuple],
        cache: Optional[_RawVolumeCache] = None,
    ):
        self.samples = list(samples)
        self.cache   = cache or _SHARED_CACHE

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[List[torch.Tensor], torch.Tensor]:
        """
        Return 8 TTA views and the label for a single volume.

        Args:
            idx (int): Dataset index.

        Returns:
            Tuple[List[torch.Tensor], torch.Tensor]:
                views — list of 8 tensors, each shape (1, D, H, W).
                label — int64 scalar label.
        """
        from tta import tta_views
        path, label, _ = self.samples[idx]
        vol   = np.array(self.cache.get(path), dtype=np.float32, copy=True)
        x     = torch.from_numpy(np.ascontiguousarray(vol)).float().unsqueeze(0).unsqueeze(0)
        # tta_views returns list of (1, 1, D, H, W) tensors; squeeze batch dim
        views = [v.squeeze(0) for v in tta_views(x)]   # each: (1, D, H, W)
        return views, torch.tensor(label, dtype=torch.long)
