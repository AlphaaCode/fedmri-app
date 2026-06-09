"""
verify_fedscrt_theorem.py
=========================
Empirical verification of Theorem 3.1 (FedSCRT Gradient Unbiasedness).

The theorem claims:
    Under class-balanced sampling, each client's head gradient is an
    unbiased estimator of the GLOBAL balanced objective gradient,
    INDEPENDENT of the client's local class prior P_k(c).

This script tests that claim directly:
    1. Extract frozen-backbone features for all training patients.
    2. Build several artificial clients with DELIBERATELY different
       class priors (e.g. 90% Luminal, 50/50, 10% Luminal).
    3. For each client compute:
         (a) the BALANCED gradient (equal samples per class)
         (b) the NATURAL gradient (sampled by the client's real prior)
    4. Compute the GLOBAL balanced gradient on the pooled data (the target).
    5. Measure cosine similarity of each client gradient to the global target.

    Expected result (confirms the theorem):
       balanced gradients  → cosine ≈ 1.0  (aligned, prior-independent)
       natural gradients   → cosine < 1.0  (biased by local prior)

Run:
    conda activate mri_thesis
    $env:MRI_NUM_CLASSES=2
    $env:HF_HUB_OFFLINE=1
    python verify_fedscrt_theorem.py
"""

import os, sys, torch, numpy as np
os.environ.setdefault("MRI_NUM_CLASSES", "2")
sys.path.insert(0, ".")

import torch.nn as nn
import torch.nn.functional as F
from main import build_model
from data_loader import MRI25DSliceDataset, load_samples
from sklearn.model_selection import StratifiedGroupKFold
from torch.utils.data import DataLoader
from config import FullConfig

REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
SEED  = 42
torch.manual_seed(SEED); np.random.seed(SEED)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ── 1. load fold 0 training features (frozen backbone) ───────────────────────
cfg     = FullConfig()
samples = load_samples(cfg.data_json, cfg.data_root)
labels  = [s[1] for s in samples]
groups  = [s[2] for s in samples]
skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
    if fi == 0:
        tr_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
        break

model = build_model("convnext_mil", device)
ck    = torch.load("checkpoints/fold0_stage2_best_crt.pt", map_location=device)
model.load_state_dict(ck.get("model_state", ck), strict=False)
model.eval()

print("Extracting frozen-backbone features for all training patients...")
ds     = MRI25DSliceDataset(tr_s, augment=False, slice_size=224)
loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)
feats, labs = [], []
store = {}
handle = model.head.register_forward_hook(
    lambda m, inp, out: store.update({"f": inp[0].detach().cpu()})
)
with torch.no_grad():
    for x, y in loader:
        _ = model(x.to(device))
        feats.append(store["f"]); labs.extend(y.numpy())
handle.remove()

X = torch.cat(feats)                 # (N, 256)
Y = torch.tensor(labs)               # (N,)
N = len(Y)
idx0 = (Y == 0).nonzero(as_tuple=True)[0]   # Luminal indices
idx1 = (Y == 1).nonzero(as_tuple=True)[0]   # Non-Luminal indices
print(f"Total: {N} patients | Luminal={len(idx0)} | Non-Luminal={len(idx1)}")

# ── 2. gradient computation helpers ───────────────────────────────────────────
def head_gradient(feat_subset, label_subset):
    """Compute the gradient of CE loss w.r.t. a fresh linear head."""
    head = nn.Linear(256, 2)
    head.weight.data.zero_(); head.bias.data.zero_()   # same point for all
    logits = head(feat_subset)
    loss   = F.cross_entropy(logits, label_subset)
    grad   = torch.autograd.grad(loss, head.weight)[0]
    return grad.flatten()

def balanced_gradient(class0_idx, class1_idx, m=20):
    """Balanced: sample m from each class, weight equally."""
    s0 = class0_idx[torch.randperm(len(class0_idx))[:m]]
    s1 = class1_idx[torch.randperm(len(class1_idx))[:m]]
    sel = torch.cat([s0, s1])
    return head_gradient(X[sel], Y[sel])

def natural_gradient(client_idx):
    """Natural: sample by the client's real class proportions."""
    sel = client_idx[torch.randperm(len(client_idx))[:40]]
    return head_gradient(X[sel], Y[sel])

def cos(a, b):
    return float(F.cosine_similarity(a.unsqueeze(0), b.unsqueeze(0))[0])

# ── 3. build the GLOBAL balanced target gradient ──────────────────────────────
# average many balanced draws over the FULL pool → the global balanced gradient
global_grad = torch.stack([balanced_gradient(idx0, idx1, m=40)
                           for _ in range(200)]).mean(0)

# ── 4. build artificial clients with different priors ─────────────────────────
def make_client(p_luminal, size=120):
    """Create a client whose data is p_luminal fraction Luminal."""
    n0 = int(size * p_luminal)
    n1 = size - n0
    c0 = idx0[torch.randperm(len(idx0))[:n0]]
    c1 = idx1[torch.randperm(len(idx1))[:n1]]
    return torch.cat([c0, c1]), c0, c1

clients = {
    "Hospital A (90% Luminal)": 0.90,
    "Hospital B (50% Luminal)": 0.50,
    "Hospital C (10% Luminal)": 0.10,
}

# ── 5. run the test ───────────────────────────────────────────────────────────
print(f"\n{'='*68}")
print("THEOREM 3.1 TEST — does balanced sampling remove the prior effect?")
print(f"{'='*68}")
print(f"{'Client':<26}{'balanced cos':>16}{'natural cos':>16}")
print(f"{'-'*68}")

for name, p in clients.items():
    cidx, c0, c1 = make_client(p)
    # average over many draws to reduce sampling noise
    bal = torch.stack([balanced_gradient(c0, c1, m=min(len(c0), len(c1), 15))
                       for _ in range(100)]).mean(0)
    nat = torch.stack([natural_gradient(cidx) for _ in range(100)]).mean(0)
    print(f"{name:<26}{cos(bal, global_grad):>16.4f}{cos(nat, global_grad):>16.4f}")

print(f"{'-'*68}")
print("""
INTERPRETATION:
  balanced cos ≈ 1.0 for ALL clients  → Theorem 3.1 CONFIRMED
     (balanced gradient aligns with global target regardless of prior)
  natural cos varies and is < balanced → the prior P_k(c) biases the
     natural gradient, exactly as the theorem predicts balanced sampling
     removes.
""")
