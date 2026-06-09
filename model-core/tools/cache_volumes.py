"""
One-time pre-processing: load every .mha volume, preprocess to (64,128,128)
float32, and save as .npy.  Subsequent training/SSL reads take ~50 ms instead
of ~1.5 s per volume.

Usage:
    python -m tools.cache_volumes --out D:/npy_cache
    # then set env var before training:
    $env:NPY_CACHE_DIR = "D:/npy_cache"
    python ssl_pretrain.py --epochs 50
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from tqdm import tqdm

from config import CFG
from data_loader import load_samples
from image_process import preprocess_raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=str, required=True,
                    help="Directory to write .npy files into")
    ap.add_argument("--json", type=str, default=CFG.data_json)
    ap.add_argument("--root", type=str, default=CFG.data_root)
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    samples = load_samples(args.json, args.root)
    print(f"Pre-caching {len(samples)} volumes → {out_dir}")
    skipped = 0
    for path, _, _ in tqdm(samples):
        stem = Path(path).stem
        npy = out_dir / f"{stem}.npy"
        if npy.exists():
            skipped += 1
            continue
        vol = preprocess_raw(path)
        np.save(str(npy), vol)

    total = len(samples) - skipped
    print(f"Done. Wrote {total} new files ({skipped} already existed).")
    size_gb = sum(f.stat().st_size for f in out_dir.glob("*.npy")) / 1e9
    print(f"Cache size on disk: {size_gb:.2f} GB")
    print(f"\nNow set the env var before training:")
    print(f'  $env:NPY_CACHE_DIR = "{out_dir}"')


if __name__ == "__main__":
    main()
