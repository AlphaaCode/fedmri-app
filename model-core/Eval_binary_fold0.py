"""
Eval_binary_fold0.py
====================
Standalone evaluation script for the binary classification checkpoint on fold 0.

This is the CORRECT evaluation script for a single checkpoint.  It evaluates
the ConvNeXt-MIL model trained for binary subtype classification (Luminal vs
Non-Luminal) on the held-out fold 0 validation set and reports macro F1,
AUC-ROC, accuracy, and a class-wise confusion matrix.

Why this script (not evaluate.py):
    evaluate.py requires ALL 5 fold checkpoints to build out-of-fold predictions.
    This script evaluates a single checkpoint (fold0_stage2_best_crt.pt) in
    isolation, which is appropriate for thesis table reporting (Table 4.5).

Prerequisites:
    - conda activate mri_thesis
    - Set MRI_NUM_CLASSES=2 (done automatically at startup)
    - checkpoints/fold0_stage2_best_crt.pt must exist

Pipeline position:
    main.py Stage 3 → THIS SCRIPT → thesis Table 4.5 (centralised model results)

Usage:
    conda activate mri_thesis
    $env:MRI_NUM_CLASSES=2
    python Eval_binary_fold0.py

Output:
    Macro F1, AUC-ROC, Accuracy printed to stdout.
    Confusion matrix in (Luminal / Non-Luminal) format for copy-paste into thesis.
    LaTeX table row fragment printed at end.

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
# Reproducibility: all random seeds fixed to 42
# torch.manual_seed(42), numpy.random.seed(42)

import os, sys, torch, numpy as np

# Override to binary before any config import
os.environ.setdefault("MRI_NUM_CLASSES", "2")
sys.path.insert(0, ".")

from main import build_model
from data_loader import MRI25DSliceDataset, load_samples
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import f1_score, roc_auc_score, confusion_matrix
from torch.utils.data import DataLoader

# ── Constants ─────────────────────────────────────────────────────────────────

CKPT  = "checkpoints/fold0_stage2_best_crt.pt"   # Stage 3 (cRT) checkpoint
# Binary remap: Luminal A(0)+B(1) → 0, HER2(2)+TN(3) → 1
REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
SEED  = 42    # must match the seed used in main.py for fold reproducibility
FOLD  = 0     # fold index to evaluate

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")

# ── Load fold 0 validation samples ───────────────────────────────────────────
from config import FullConfig
cfg     = FullConfig()
samples = load_samples(cfg.data_json, cfg.data_root)
labels  = [s[1] for s in samples]   # original 4-class labels for stratification
groups  = [s[2] for s in samples]   # patient IDs for group constraint

# Reproduce the exact same fold 0 split used during training
skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
    if fi == FOLD:
        # Apply binary remap after fold split (same order as in main.py)
        val_samples = [
            (samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va
        ]
        break

print(f"Validation: {len(val_samples)} patients")
vals = [s[1] for s in val_samples]
print(f"  Luminal={vals.count(0)}  Non-Luminal={vals.count(1)}")

# ── Load model ────────────────────────────────────────────────────────────────
model = build_model("convnext_mil", device)
ck    = torch.load(CKPT, map_location=device)

# Support checkpoints saved with different key conventions
state = ck.get("model_state") or ck.get("state_dict") or ck
model.load_state_dict(state, strict=False)
model.eval()
print(f"Loaded: {CKPT}")

# ── Evaluate ──────────────────────────────────────────────────────────────────
# No augmentation: deterministic evaluation for reproducible numbers
ds     = MRI25DSliceDataset(val_samples, augment=False, slice_size=224)
loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)

preds: list = []   # predicted class indices
probs: list = []   # P(Non-Luminal) for AUC-ROC
labs:  list = []   # ground-truth labels

with torch.no_grad():
    for x, y in loader:
        logits = model(x.to(device))                             # (B, 2)
        probs.extend(torch.softmax(logits, -1)[:, 1].cpu().numpy())  # P(Non-Luminal)
        preds.extend(logits.argmax(-1).cpu().numpy())
        labs.extend(y.numpy())

f1  = f1_score(labs, preds, average="macro", zero_division=0)
auc = roc_auc_score(labs, probs)
acc = float(np.mean(np.array(preds) == np.array(labs)))
cm  = confusion_matrix(labs, preds)   # rows=true, cols=predicted

print(f"\n{'='*40}")
print(f"  Macro F1  : {f1:.4f}")
print(f"  AUC-ROC   : {auc:.4f}")
print(f"  Accuracy  : {acc:.4f}")
print(f"{'='*40}")

print(f"\nConfusion matrix:")
print(f"  [[{cm[0,0]:3d} {cm[0,1]:3d}]   Luminal: {cm[0,0]} correct, {cm[0,1]} missed")
print(f"   [{cm[1,0]:3d} {cm[1,1]:3d}]]  Non-Lum: {cm[1,1]} correct, {cm[1,0]} missed")
print(f"\n  Luminal recall    : {cm[0,0]/max(cm[0].sum(), 1):.3f}")
print(f"  Non-Luminal recall: {cm[1,1]/max(cm[1].sum(), 1):.3f}")

# LaTeX table row for thesis Table 4.5
print(f"\nFor Table 4.6 row 1:")
print(f"  Binary centralised (fold~0) & {f1:.4f} & {auc:.4f} & {acc:.4f} \\\\")
