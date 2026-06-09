"""
run_crt_only.py
===============
Re-run Stage 3 (cRT) on an existing Stage 2 checkpoint without re-training.

Useful for hyperparameter search on the classifier-retraining stage only: the
expensive Stage 2 backbone fine-tuning is skipped entirely, and only the cheap
linear head is retrained on cached features. Saves a new checkpoint with the
"_crt" suffix.

Pipeline position:
    main.py (Stage 2 ckpt) → THIS MODULE → {ckpt}_crt.pt → evaluate.py

Usage:
    python run_crt_only.py --ckpt checkpoints/best_fold0.pt

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import numpy as np
import torch
from torch.utils.data import DataLoader
from sklearn.metrics import f1_score, accuracy_score
from sklearn.model_selection import StratifiedGroupKFold

from config import CFG
from data_loader import MRI25DSliceDataset, load_samples
from crt import train_crt


def main():
    """
    Parse arguments, load a Stage 2 checkpoint, and re-run cRT on its head.

    Rebuilds the model, loads only the backbone weights (head removed to avoid
    size mismatch), reconstructs the matching fold split, then runs train_crt
    and saves the result with a "_crt" filename suffix.
    """
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", type=str, default="checkpoints/best_fold0.pt")
    ap.add_argument("--json", type=str, default=CFG.data_json)
    ap.add_argument("--root", type=str, default=CFG.data_root)
    ap.add_argument("--fold", type=int, default=0)
    ap.add_argument("--seed", type=int, default=CFG.seed)
    ap.add_argument("--arch", type=str, default=None)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[ENV] device={device}")

    # Load data and split
    samples = load_samples(args.json, args.root)
    y = np.array([s[1] for s in samples])
    g = np.array([s[2] for s in samples])

    skf = StratifiedGroupKFold(n_splits=CFG.n_splits, shuffle=True,
                               random_state=args.seed)
    for fi, (tr_idx, va_idx) in enumerate(skf.split(np.zeros(len(y)), y, g)):
        if fi != args.fold:
            continue
        train_samples = [samples[i] for i in tr_idx]
        val_samples = [samples[i] for i in va_idx]
        break

    if int(os.environ.get('MRI_NUM_CLASSES', 4)) == 2:
        remap = {0: 0, 1: 0, 2: 1, 3: 1}
        train_samples = [(p, remap[lbl], g)
                         for p, lbl, g in train_samples]
        val_samples   = [(p, remap[lbl], g)
                         for p, lbl, g in val_samples]

    print(f"[SPLIT] fold={args.fold}  train={len(train_samples)} val={len(val_samples)}")

    # Rebuild model and load checkpoint
    ckpt = torch.load(args.ckpt, map_location="cpu")
    arch = args.arch if hasattr(args, "arch") and args.arch else ckpt.get("arch", "convnext_mil")
    print(f"[MODEL] Loading arch={arch} from {args.ckpt}")

    from main import build_model
    model = build_model(arch, device)
    state = ckpt.get("model_state") or ckpt.get("state_dict") or ckpt.get("model_state_dict") or ckpt
    # Remove classifier head weights to avoid size mismatch
    backbone_state = {k: v for k, v in state.items()
                      if 'classifier' not in k}
    model.load_state_dict(backbone_state, strict=False)
    model.eval()

    # Create unaugmented loaders for deterministic feature caching.
    # ConvNeXt uses slice stride 2 here to halve feature-extraction time;
    # stride 1 (used in main.py) retains all central tumour slices.
    sstride = 2 if arch == "convnext_mil" else 1
    tr_eval = MRI25DSliceDataset(train_samples, augment=False, return_two_views=False,
                                 slice_size=CFG.model.slice_size, slice_stride=sstride)
    va_ds = MRI25DSliceDataset(val_samples, augment=False, return_two_views=False,
                               slice_size=CFG.model.slice_size, slice_stride=sstride)
    tr_loader = DataLoader(tr_eval, batch_size=2, shuffle=False,
                           num_workers=0, pin_memory=True)
    va_loader = DataLoader(va_ds, batch_size=2, shuffle=False,
                           num_workers=0, pin_memory=True)

    # Run cRT with original working params
    print(f"\n[cRT] lr={CFG.s3.lr}, wd={CFG.s3.weight_decay}, epochs={CFG.s3.epochs}")
    best_f1 = train_crt(model, tr_loader, va_loader, device)
    print(f"\n*** cRT BEST F1 = {best_f1:.4f} ***")

    print(f"\n*** cRT complete — best F1 = {best_f1:.4f} ***")
    save_path = Path(args.ckpt).parent / (Path(args.ckpt).stem + "_crt.pt")
    torch.save({
        "epoch": "crt",
        "model_state": model.state_dict(),
        "val_f1": best_f1,
        "arch": arch,
    }, save_path)
    print(f"[SAVED] {save_path}")


if __name__ == "__main__":
    main()
