"""
fusion_eval.py
==============
Evaluates Deep + Radiomics late-fusion for binary classification on fold 0.

Compares two classifiers on the same fold 0 split:
    1. Deep features only       — 256-dim MIL embeddings → MLP
    2. Deep + Radiomics fusion  — [256 deep ‖ N radiomics] → MLP

The 256-dim MIL embeddings (NOT the 2-dim logits) are extracted via a forward
hook on model.head, then concatenated with PyRadiomics features for the fusion
classifier.

IMPORTANT — DATA LEAKAGE WARNING:
    results/radiomics_features.csv contains a 'label' column. This column is
    excluded explicitly via .drop(columns=['label']). Including the label as a
    feature causes the fusion classifier to learn the trivial identity mapping,
    producing an artificially perfect F1=1.0. Never remove the drop() call.

Pipeline position:
    extract_radiomics.py (CSV) + main.py (ckpt) → THIS MODULE → thesis Table 4.6

Run:
    conda activate mri_thesis
    $env:MRI_NUM_CLASSES=2
    $env:HF_HUB_OFFLINE=1
    python fusion_eval.py

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
# Reproducibility: all random seeds fixed to 42
# torch.manual_seed(42), numpy.random.seed(42)

import os, sys, torch, numpy as np, pandas as pd
os.environ.setdefault("MRI_NUM_CLASSES", "2")   # binary mode before config import
sys.path.insert(0, ".")

from main import build_model
from data_loader import MRI25DSliceDataset, load_samples
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import f1_score, roc_auc_score, confusion_matrix
from torch.utils.data import DataLoader
from config import FullConfig

# Binary remap: Luminal A(0)+B(1) → 0, HER2(2)+TN(3) → 1
REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
SEED  = 42

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")

# ── Fold 0 split ─────────────────────────────────────────────────────────────
cfg     = FullConfig()
samples = load_samples(cfg.data_json, cfg.data_root)
labels  = [s[1] for s in samples]
groups  = [s[2] for s in samples]

skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
    if fi == 0:
        tr_s   = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
        va_s   = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va]
        tr_idx = list(tr)
        va_idx = list(va)
        break

print(f"Fold 0: train={len(tr_s)}, val={len(va_s)}")

# ── load model ────────────────────────────────────────────────────────────────
model = build_model("convnext_mil", device)
ck    = torch.load("checkpoints/fold0_stage2_best_crt.pt", map_location=device)
model.load_state_dict(ck.get("model_state", ck), strict=False)
model.eval()
print("Loaded: checkpoints/fold0_stage2_best_crt.pt")

# ── feature extraction using forward hook on model.head ──────────────────────
# model.head is Linear(256→2). Its INPUT is the 256-dim MIL embedding.
# Hooking the input captures the correct intermediate representation.

def get_feats(sample_list):
    """
    Extract 256-dim MIL embeddings for a list of samples via a forward hook.

    Registers a forward hook on model.head to capture its INPUT (the 256-dim
    MIL embedding) rather than its output (the 2-dim logits).

    Args:
        sample_list (list): List of (path, binary_label, patient_id) tuples.

    Returns:
        Tuple[np.ndarray, np.ndarray]: (features [N, 256], labels [N]).
    """
    ds     = MRI25DSliceDataset(sample_list, augment=False, slice_size=224)
    loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)

    all_feats, all_labs = [], []
    store = {}

    # Forward hook: capture input to the final head (256-dim MIL embedding)
    handle = model.head.register_forward_hook(
        lambda m, inp, out: store.update({"feat": inp[0].detach().cpu()})
    )

    with torch.no_grad():
        for x, y in loader:
            _ = model(x.to(device))          # triggers hook
            all_feats.append(store["feat"])
            all_labs.extend(y.numpy())

    handle.remove()
    return torch.cat(all_feats).numpy(), np.array(all_labs)

print("Extracting 256-dim train features...")
tr_deep, tr_y = get_feats(tr_s)
print(f"  Train features shape: {tr_deep.shape}")

print("Extracting 256-dim val features...")
va_deep, va_y = get_feats(va_s)
print(f"  Val features shape:   {va_deep.shape}")

# ── Load and align radiomics ──────────────────────────────────────────────────
# CRITICAL: drop the 'label' column to prevent data leakage (see module warning).
# select_dtypes(number) further excludes the non-numeric patient_id column.
rad    = pd.read_csv("results/radiomics_features.csv")
rad_tr = rad.iloc[tr_idx].drop(columns=["label"], errors="ignore").select_dtypes(include="number").values
rad_va = rad.iloc[va_idx].drop(columns=["label"], errors="ignore").select_dtypes(include="number").values
print(f"Radiomics shape — train: {rad_tr.shape}, val: {rad_va.shape}")

# ── concatenate deep + radiomics ──────────────────────────────────────────────
sc    = StandardScaler()
X_tr  = np.hstack([tr_deep, sc.fit_transform(rad_tr)])
X_va  = np.hstack([va_deep, sc.transform(rad_va)])
print(f"Fusion feature dim: {X_tr.shape[1]} (256 deep + {rad_tr.shape[1]} radiomics)")

# ── deep features only (baseline for comparison) ─────────────────────────────
mlp_deep = MLPClassifier(hidden_layer_sizes=(256, 128),
                         max_iter=300, random_state=SEED)
mlp_deep.fit(tr_deep, tr_y)
preds_d  = mlp_deep.predict(va_deep)
probs_d  = mlp_deep.predict_proba(va_deep)[:, 1]
f1_deep  = f1_score(va_y, preds_d, average="macro", zero_division=0)
auc_deep = roc_auc_score(va_y, probs_d)
acc_deep = np.mean(preds_d == va_y)

# ── deep + radiomics fusion ───────────────────────────────────────────────────
mlp_fus = MLPClassifier(hidden_layer_sizes=(256, 128),
                        max_iter=300, random_state=SEED)
mlp_fus.fit(X_tr, tr_y)
preds_f  = mlp_fus.predict(X_va)
probs_f  = mlp_fus.predict_proba(X_va)[:, 1]
f1_fus   = f1_score(va_y, preds_f, average="macro", zero_division=0)
auc_fus  = roc_auc_score(va_y, probs_f)
acc_fus  = np.mean(preds_f == va_y)
cm_fus   = confusion_matrix(va_y, preds_f)

# ── results ───────────────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"  Deep only:      F1={f1_deep:.4f}  AUC={auc_deep:.4f}  Acc={acc_deep:.4f}")
print(f"  Deep+Radiomics: F1={f1_fus:.4f}  AUC={auc_fus:.4f}  Acc={acc_fus:.4f}")
print(f"{'='*50}")
print(f"\nFusion confusion matrix:")
print(f"  [[{cm_fus[0,0]:3d} {cm_fus[0,1]:3d}]   Luminal")
print(f"   [{cm_fus[1,0]:3d} {cm_fus[1,1]:3d}]]  Non-Luminal")
print(f"\nFor Table 4.6 (Radiomics Fusion row):")
print(f"  Deep+Radiomics fusion & {f1_fus:.4f} & {auc_fus:.4f} & {acc_fus:.4f} \\\\")