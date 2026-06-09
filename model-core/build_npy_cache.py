"""
build_npy_cache.py
==================
Pre-processes all 737 MRI volumes and caches them as .npy files.

Run this ONCE before training to make data loading ~30× faster. Without the
cache, every epoch re-loads and re-preprocesses raw .mha files (~1.5 s each);
with the cache, each volume is a ~50 ms binary read.

Cache format:
    {patient_id}.npy → float32 array of shape (64, 128, 128)
    Preprocessing: normalize → center_crop(150, 380, 380) → resize(64, 128, 128)
    Location: the CACHE_DIR constant below (consumed via the NPY_CACHE_DIR env var
              in data_loader.py — set NPY_CACHE_DIR to this path before training).

Pipeline position:
    raw .mha files → THIS MODULE → npy_cache/ → data_loader.py (fast loads)

This is a standalone preprocessing script: it re-implements the preprocessing
steps (rather than importing image_process.py) so it can run without the full
training environment, and pads instead of cropping when a volume is smaller
than the crop target.

Usage:
    python build_npy_cache.py

Output:
    D:\\study\\BioInfo M2 (2026)\\Memoir\\Federated-Learning-for-healthcare-applications-thesis\\npy_cache\\

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""

import sys
import os
import json
import time
import pathlib
import numpy as np

# ── paths (edit if different) ──────────────────────────────────────────────
DATASET_JSON = r"D:\study\BioInfo M2 (2026)\Memoir\Datasets\breast-mri-molecular-cancer-subtype\dataset.json"
DATA_DIR     = r"D:\study\BioInfo M2 (2026)\Memoir\Datasets\breast-mri-molecular-cancer-subtype\imagesTr"
CACHE_DIR    = r"D:\study\BioInfo M2 (2026)\Memoir\Federated-Learning-for-healthcare-applications-thesis\npy_cache"

# ── target volume shape (must match training pipeline) ────────────────────
TARGET_SHAPE = (64, 128, 128)   # D × H × W


def load_mha(path: str) -> np.ndarray:
    """Load a .mha volume with SimpleITK and return as float32 numpy array."""
    import SimpleITK as sitk
    img = sitk.ReadImage(path, sitk.sitkFloat32)
    return sitk.GetArrayFromImage(img)  # shape: (D, H, W)


def normalize(volume: np.ndarray) -> np.ndarray:
    """Percentile clip then min-max scale to [0, 1]."""
    mask = volume > 0
    if mask.sum() == 0:
        return volume.astype(np.float32)
    p1  = float(np.percentile(volume[mask], 1))
    p99 = float(np.percentile(volume[mask], 99))
    if p99 <= p1:
        return np.zeros_like(volume, dtype=np.float32)
    volume = np.clip(volume, p1, p99)
    volume = (volume - p1) / (p99 - p1)
    return volume.astype(np.float32)


def center_crop(volume: np.ndarray,
                target: tuple = (150, 380, 380)) -> np.ndarray:
    """Centre-crop or zero-pad each axis to target (D, H, W)."""
    td, th, tw = target
    d, h, w = volume.shape
    # depth
    sd = max(0, (d - td) // 2); ed = sd + min(d, td)
    pd0 = max(0, (td - d) // 2); pd1 = td - min(d, td) - pd0
    # height
    sh = max(0, (h - th) // 2); eh = sh + min(h, th)
    ph0 = max(0, (th - h) // 2); ph1 = th - min(h, th) - ph0
    # width
    sw = max(0, (w - tw) // 2); ew = sw + min(w, tw)
    pw0 = max(0, (tw - w) // 2); pw1 = tw - min(w, tw) - pw0
    cropped = volume[sd:ed, sh:eh, sw:ew]
    return np.pad(cropped, ((pd0, pd1), (ph0, ph1), (pw0, pw1)))


def resize_3d(volume: np.ndarray,
              target: tuple = (64, 128, 128)) -> np.ndarray:
    """Trilinear resize with PyTorch."""
    import torch
    import torch.nn.functional as F
    t = torch.from_numpy(volume).float().unsqueeze(0).unsqueeze(0)
    t = F.interpolate(t, size=target, mode="trilinear", align_corners=False)
    return t.squeeze().numpy()


def preprocess(mha_path: str) -> np.ndarray:
    """
    Full preprocessing pipeline for a single .mha volume.

    Steps: load → normalize([0,1]) → center_crop(150,380,380) → resize(64,128,128).
    Mirrors image_process.preprocess_raw but pads (not just crops) to the
    intermediate shape.

    Args:
        mha_path (str): Path to the .mha file.

    Returns:
        np.ndarray: Float32 volume of shape (64, 128, 128).
    """
    vol = load_mha(mha_path)                  # (D, H, W) raw
    vol = normalize(vol)                       # → [0, 1]
    vol = center_crop(vol, (150, 380, 380))   # → (150, 380, 380) with padding
    vol = resize_3d(vol, TARGET_SHAPE)         # → (64, 128, 128)
    return vol.astype(np.float32)


def main():
    """
    Build the NPY cache for all volumes listed in DATASET_JSON.

    Skips volumes already cached (idempotent). Prints per-volume progress and a
    final summary of saved / skipped / errored counts.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)

    with open(DATASET_JSON) as f:
        data = json.load(f)

    items = data["training"]
    total = len(items)
    print(f"Building NPY cache for {total} volumes")
    print(f"  Source : {DATA_DIR}")
    print(f"  Cache  : {CACHE_DIR}")
    print()

    done = skipped = errors = 0
    t_start = time.time()

    for i, item in enumerate(items):
        rel = str(item["image"]).replace("\\", "/")
        if rel.startswith("imagesTr/"):
            rel = rel.split("imagesTr/", 1)[1]

        mha_path = str(pathlib.Path(DATA_DIR) / rel)
        if not pathlib.Path(mha_path).exists():
            alt = mha_path.replace(".mha", "_0000.mha")
            if pathlib.Path(alt).exists():
                mha_path = alt

        stem = pathlib.Path(mha_path).stem
        out_path = os.path.join(CACHE_DIR, f"{stem}.npy")

        if pathlib.Path(out_path).exists():
            skipped += 1
            print(f"  [{i+1}/{total}] {stem} — already cached", end="\r")
            continue

        try:
            t0 = time.time()
            arr = preprocess(mha_path)
            np.save(out_path, arr)
            elapsed = time.time() - t0
            done += 1
            print(f"  [{i+1}/{total}] {stem} — {elapsed:.1f}s  "
                  f"({done} saved, {skipped} skipped)       ", end="\r")
        except Exception as e:
            errors += 1
            print(f"\n  [{i+1}/{total}] ERROR {stem}: {e}")

    total_time = time.time() - t_start
    print(f"\n\nDone in {total_time/60:.1f} min")
    print(f"  Saved:   {done}")
    print(f"  Skipped: {skipped} (already existed)")
    print(f"  Errors:  {errors}")
    print(f"\nCache ready at: {CACHE_DIR}")


if __name__ == "__main__":
    main()