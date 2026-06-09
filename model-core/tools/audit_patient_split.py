"""
Audit patient-level leakage and the StratifiedGroupKFold split.

Run from the repo root:
    python -m tools.audit_patient_split
"""
from __future__ import annotations
import sys
from collections import Counter
from pathlib import Path

# allow running as a script
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
from sklearn.model_selection import StratifiedGroupKFold

from config import CFG
from data_loader import load_samples


def main():
    samples = load_samples(CFG.data_json, CFG.data_root)
    y = np.array([s[1] for s in samples])
    g = np.array([s[2] for s in samples])

    print(f"total samples : {len(samples)}")
    print(f"unique patients: {len(set(g.tolist()))}")
    print(f"class counts   : {dict(Counter(y.tolist()))}")

    # patients per class
    per_class_patients = {c: len({gi for yi, gi in zip(y, g) if yi == c})
                          for c in sorted(set(y.tolist()))}
    print(f"patients per class: {per_class_patients}")

    skf = StratifiedGroupKFold(n_splits=CFG.n_splits, shuffle=True,
                               random_state=CFG.seed)
    for fi, (tr, va) in enumerate(skf.split(np.zeros(len(y)), y, g)):
        tr_p = set(g[tr].tolist()); va_p = set(g[va].tolist())
        overlap = tr_p & va_p
        tr_counts = dict(Counter(y[tr].tolist()))
        va_counts = dict(Counter(y[va].tolist()))
        print(f"fold {fi}  train={len(tr)} val={len(va)}  "
              f"patient_overlap={len(overlap)}  "
              f"tr_cls={tr_counts}  va_cls={va_counts}")
        assert not overlap, f"patient leakage in fold {fi}: {overlap}"
    print("OK: no patient overlap across folds.")


if __name__ == "__main__":
    main()
