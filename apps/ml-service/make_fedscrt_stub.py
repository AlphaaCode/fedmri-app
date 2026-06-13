"""Generate a contract-shaped FedSCRT stub checkpoint so the real-mode
pipeline is testable WITHOUT the user's 60 MB fedscrt_final.pt.

The real checkpoint lives at  model_core/fedscrt_final.pt.
This stub is a lightweight fallback + a living document of the checkpoint
contract the loader (real_inference.py) depends on. Predictions from the stub
are random (random head); point FEDSCRT_CKPT at fedscrt_final.pt for real ones.

Run from the mri_thesis conda env:
    conda run -n mri_thesis python apps/ml-service/make_fedscrt_stub.py
"""
import os, sys, torch

os.environ.setdefault("MRI_NUM_CLASSES", "2")
# Model code lives in model-core/ (hyphen); checkpoint output goes to model_core/ (underscore).
MODEL_CODE = os.environ.get(
    "MODEL_V2_PATH",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "model-core")),
)
MODEL_CKPT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "model_core")
)
sys.path.insert(0, MODEL_CODE)
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
out = os.path.join(MODEL_CKPT_DIR, "fedscrt_stub.pt")
os.makedirs(os.path.dirname(out), exist_ok=True)
torch.save(ckpt, out)
print("wrote", out)
