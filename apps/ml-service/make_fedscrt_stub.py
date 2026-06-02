"""Generate a contract-shaped FedSCRT stub checkpoint so the real-mode
pipeline is testable WITHOUT the user's 60 MB fedscrt_final.pt.

The real checkpoint already exists at
  C:\\Users\\akaro\\Documents\\GitHub\\federated-learning-model\\checkpoints\\fedscrt_final.pt
so this stub is a lightweight fallback + a living document of the checkpoint
contract the loader (real_inference.py) depends on. Predictions from the stub
are random (random head); point FEDSCRT_CKPT at fedscrt_final.pt for real ones.

Run from the mri_thesis conda env:
    conda run -n mri_thesis python apps/ml-service/make_fedscrt_stub.py
"""
import os, sys, torch

os.environ.setdefault("MRI_NUM_CLASSES", "2")
# Authoritative model code = the federated-learning-model repo (it produced the
# real checkpoint via save_fedscrt_model.py). Override with MODEL_V2_PATH.
V2 = os.environ.get(
    "MODEL_V2_PATH",
    r"C:\Users\akaro\Documents\GitHub\federated-learning-model",
)
sys.path.insert(0, V2)
from model import ConvNeXtMILClassifier  # noqa: E402

m = ConvNeXtMILClassifier(num_classes=2, proj_dim=256, attn_dim=128)
ckpt = {
    "model_state": m.state_dict(),
    "arch": "convnext_mil",
    "num_classes": 2,
    "task": "binary_luminal_vs_nonluminal",
    "f1": 0.6289,
    "auc": 0.6874,
    "label_map": {0: "Luminal", 1: "Non-Luminal"},
    "fedscrt": True,
    "description": "FedSCRT stub (random head) — contract-shaped placeholder",
}
out = os.path.join(V2, "checkpoints", "fedscrt_stub.pt")
os.makedirs(os.path.dirname(out), exist_ok=True)
torch.save(ckpt, out)
print("wrote", out)
