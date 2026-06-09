"""
save_fedscrt_model.py
=====================
Production model export script for the FedSCRT web application.

Re-runs the FedSCRT procedure (federated Classifier Retraining over a shared
centralised backbone) and saves the final, deployable model checkpoint.

Why FedSCRT uses a centralised backbone:
    In FedSCRT the feature extractor (ConvNeXt-MIL backbone) is trained once,
    centrally, on all patients' data (Stage 2 checkpoint). Only the lightweight
    Linear(256→2) classification head is retrained in a federated manner — each
    hospital trains a head on its locally balanced features, then heads are
    FedAvg-aggregated. This decoupling (Kang et al. 2020) means the expensive
    representation learning is shared, while the privacy-sensitive, imbalance-
    sensitive head calibration stays decentralised. The exported model therefore
    bundles the centralised backbone with the federated-aggregated head.

Output:
    checkpoints/fedscrt_final.pt   — full model (backbone + aggregated head)
    checkpoints/fedscrt_head.pt    — head only (256→2 Linear weights, lightweight)

Pipeline position:
    main.py (Stage 2 ckpt) → THIS MODULE → inference_service.py (web app)

Run:
    conda activate mri_thesis
    $env:MRI_NUM_CLASSES=2
    $env:HF_HUB_OFFLINE=1
    python save_fedscrt_model.py

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
# Reproducibility: all random seeds fixed to 42

import os, sys, json, torch
os.environ.setdefault("MRI_NUM_CLASSES", "2")   # binary mode before config import
sys.path.insert(0, ".")

from main import build_model
from data_loader import MRI25DSliceDataset, load_samples
from sklearn.model_selection import StratifiedGroupKFold
from torch.utils.data import DataLoader
from config import FullConfig
import torch.nn as nn
import numpy as np
from sklearn.metrics import f1_score, roc_auc_score

REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
device = torch.device("cuda")
os.makedirs("checkpoints", exist_ok=True)

# ── fold 0 split ──────────────────────────────────────────────────────────────
cfg     = FullConfig()
samples = load_samples(cfg.data_json, cfg.data_root)
labels  = [s[1] for s in samples]
groups  = [s[2] for s in samples]
skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
    if fi == 0:
        tr_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
        va_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va]
        break

# ── Client partition (3 hospitals, fixed split for reproducible export) ───────
import random
random.seed(42)   # fixed seed: deterministic client partition for the saved model
shuffled = tr_s.copy()
random.shuffle(shuffled)
n = len(shuffled)
# Uneven split mimics realistic hospital sizes: small / large / medium
client_samples = [shuffled[:80], shuffled[80:363], shuffled[363:]]

print(f"Clients: {[len(c) for c in client_samples]}")
print(f"Validation: {len(va_s)} patients")

# ── load centralised backbone ─────────────────────────────────────────────────
model = build_model("convnext_mil", device)
ck    = torch.load("checkpoints/fold0_stage2_best_crt.pt", map_location=device)
model.load_state_dict(ck.get("model_state", ck), strict=False)
model.eval()
print("Loaded centralised backbone")

# ── Feature extraction with forward hook ─────────────────────────────────────
def extract_features(sample_list):
    """
    Extract 256-dim MIL embeddings via a forward hook on model.head.

    Args:
        sample_list (list): List of (path, binary_label, patient_id) tuples.

    Returns:
        Tuple[torch.Tensor, torch.Tensor]: (features [N, 256], labels [N]).
    """
    ds     = MRI25DSliceDataset(sample_list, augment=False, slice_size=224)
    loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)
    feats, labs = [], []
    store = {}
    handle = model.head.register_forward_hook(
        lambda m, inp, out: store.update({"f": inp[0].detach().cpu()})
    )
    with torch.no_grad():
        for x, y in loader:
            _ = model(x.to(device))
            feats.append(store["f"])
            labs.extend(y.numpy())
    handle.remove()
    return torch.cat(feats), torch.tensor(labs)

# ── federated cRT per client ──────────────────────────────────────────────────
CRT_EPOCHS = 300
N_SEEDS    = 10
LR         = 1e-3

client_heads = []
client_sizes = []

for k, samples in enumerate(client_samples):
    print(f"\nClient {k+1} ({len(samples)} samples) — extracting features...")
    feats, labs = extract_features(samples)

    # class-balanced sampler
    from torch.utils.data import WeightedRandomSampler, TensorDataset
    class_counts = torch.bincount(labs)
    weights = 1.0 / class_counts[labs].float()
    sampler = WeightedRandomSampler(weights, len(weights))
    ds_head = TensorDataset(feats, labs)
    loader  = DataLoader(ds_head, batch_size=32, sampler=sampler)

    best_f1, best_head = 0.0, None

    for seed in range(N_SEEDS):
        torch.manual_seed(seed)
        head = nn.Linear(256, 2).to(device)
        opt  = torch.optim.Adam(head.parameters(), lr=LR, weight_decay=1e-4)
        head.train()

        for _ in range(CRT_EPOCHS):
            for xb, yb in loader:
                xb, yb = xb.to(device), yb.to(device)
                loss = nn.CrossEntropyLoss()(head(xb), yb)
                opt.zero_grad(); loss.backward(); opt.step()

        head.eval()
        with torch.no_grad():
            all_feats, all_labs = extract_features(samples)
            preds = head(all_feats.to(device)).argmax(-1).cpu().numpy()
        f1 = f1_score(labs.numpy(), preds, average="macro", zero_division=0)

        if f1 > best_f1:
            best_f1 = f1
            best_head = {k: v.clone() for k, v in head.state_dict().items()}

    print(f"  Best local F1 = {best_f1:.4f}")
    client_heads.append(best_head)
    client_sizes.append(len(samples))

# ── Federated averaging of heads ──────────────────────────────────────────────
# FedAvg over head weights: w_global = Σ_k (n_k / n) * W_k
total = sum(client_sizes)
agg_head_state = {}
for key in client_heads[0]:
    agg_head_state[key] = sum(
        (client_sizes[k] / total) * client_heads[k][key]   # n_k/n weighting
        for k in range(len(client_heads))
    )

# ── update model head with aggregated weights ─────────────────────────────────
model.head.load_state_dict(agg_head_state)
model.eval()

# ── evaluate ──────────────────────────────────────────────────────────────────
val_feats, val_labs = extract_features(va_s)
with torch.no_grad():
    logits = model.head(val_feats.to(device))
    probs  = torch.softmax(logits, -1)[:, 1].cpu().numpy()
    preds  = logits.argmax(-1).cpu().numpy()

f1  = f1_score(val_labs.numpy(), preds, average="macro", zero_division=0)
auc = roc_auc_score(val_labs.numpy(), probs)
acc = float(np.mean(preds == val_labs.numpy()))

print(f"\n{'='*50}")
print(f"FedSCRT Final: F1={f1:.4f}  AUC={auc:.4f}  Acc={acc:.4f}")
print(f"{'='*50}")

# ── save full model ───────────────────────────────────────────────────────────
torch.save({
    "model_state":  model.state_dict(),
    "arch":         "convnext_mil",
    "num_classes":  2,
    "task":         "binary_luminal_vs_nonluminal",
    "f1":           f1,
    "auc":          auc,
    "label_map":    {0: "Luminal", 1: "Non-Luminal"},
    "fedscrt":      True,
    "description":  "FedSCRT: centralised backbone + federated cRT head"
}, "checkpoints/fedscrt_final.pt")

# save head only (lightweight, for fast loading in app)
torch.save(agg_head_state, "checkpoints/fedscrt_head.pt")

print("Saved: checkpoints/fedscrt_final.pt")
print("Saved: checkpoints/fedscrt_head.pt")
