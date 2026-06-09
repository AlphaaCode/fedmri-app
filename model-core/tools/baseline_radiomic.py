"""
Sanity-check baselines that every new model must beat.

1. Majority-class predictor.
2. Logistic regression on 12 simple radiomic features
   (volume mean/std/skew/kurtosis across 3 intensity bands).

Uses the same StratifiedGroupKFold as main.py for apples-to-apples comparison.

Run:
    python -m tools.baseline_radiomic
"""
from __future__ import annotations
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from scipy.stats import skew, kurtosis
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, balanced_accuracy_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

import gc
from config import CFG
from data_loader import load_samples
from image_process import preprocess_raw


def radiomic_features(vol: np.ndarray) -> np.ndarray:
    """12 features: mean/std/skew/kurtosis on 3 intensity bands (low/mid/high)."""
    feats = []
    for lo, hi in [(0.0, 0.33), (0.33, 0.66), (0.66, 1.01)]:
        m = (vol >= lo) & (vol < hi)
        vals = vol[m] if m.any() else np.array([0.0])
        feats.append(float(vals.mean()))
        feats.append(float(vals.std()))
        feats.append(float(skew(vals)) if vals.size > 1 else 0.0)
        feats.append(float(kurtosis(vals)) if vals.size > 1 else 0.0)
    return np.array(feats, dtype=np.float32)


def main():
    samples = load_samples(CFG.data_json, CFG.data_root)
    y = np.array([s[1] for s in samples])
    g = np.array([s[2] for s in samples])

    print("Extracting radiomic features (one-time preprocessing)...")
    X = np.zeros((len(samples), 12), dtype=np.float32)
    for i, (path, _, _) in enumerate(tqdm(samples)):
        vol = preprocess_raw(path)
        X[i] = radiomic_features(vol)
        del vol
        if i % 50 == 0:
            gc.collect()

    # Majority baseline
    maj = int(np.bincount(y).argmax())
    maj_pred = np.full_like(y, maj)
    print(f"\n[MAJORITY] class={maj}  "
          f"macroF1={f1_score(y, maj_pred, average='macro', zero_division=0):.4f}  "
          f"balAcc={balanced_accuracy_score(y, maj_pred):.4f}")

    # Radiomic LR CV
    skf = StratifiedGroupKFold(n_splits=CFG.n_splits, shuffle=True,
                               random_state=CFG.seed)
    f1s, bas = [], []
    for fi, (tr, va) in enumerate(skf.split(np.zeros(len(y)), y, g)):
        sc = StandardScaler().fit(X[tr])
        Xtr = sc.transform(X[tr]); Xva = sc.transform(X[va])
        clf = LogisticRegression(max_iter=2000, class_weight="balanced", C=1.0)
        clf.fit(Xtr, y[tr])
        p = clf.predict(Xva)
        f1 = f1_score(y[va], p, average="macro", zero_division=0)
        ba = balanced_accuracy_score(y[va], p)
        f1s.append(f1); bas.append(ba)
        print(f"[LR] fold {fi}  macroF1={f1:.4f}  balAcc={ba:.4f}")
    print(f"\n[LR] mean macroF1={np.mean(f1s):.4f}±{np.std(f1s):.4f}  "
          f"balAcc={np.mean(bas):.4f}±{np.std(bas):.4f}")


if __name__ == "__main__":
    main()
