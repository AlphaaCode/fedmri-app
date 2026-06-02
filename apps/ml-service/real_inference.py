"""Real FedSCRT inference. Imported only when INFERENCE_MODE=real.

Loads the ConvNeXt-MIL model from the federated-learning-model repo and runs
real predictions + attention. Run the service from the mri_thesis conda env.

Env:
    MODEL_V2_PATH  path to the model code (federated-learning-model repo)
    FEDSCRT_CKPT   path to fedscrt_final.pt (real) or fedscrt_stub.pt
    MRI_NUM_CLASSES=2  (binary head; read at import time by model/main)
"""
import os, sys, io, tempfile
from functools import lru_cache
from typing import Tuple
import numpy as np
import torch
import torch.nn.functional as F

V2 = os.environ.get("MODEL_V2_PATH")
if V2 and V2 not in sys.path:
    sys.path.insert(0, V2)
os.environ.setdefault("MRI_NUM_CLASSES", "2")

CKPT = os.environ.get("FEDSCRT_CKPT")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
LABELS = ["Luminal", "Non-Luminal"]


@lru_cache(maxsize=1)
def _model_and_meta():
    from main import build_model  # federated-learning-model/main.py:140
    if not CKPT or not os.path.exists(CKPT):
        raise RuntimeError(
            f"FEDSCRT_CKPT not found: {CKPT!r}. Set it to fedscrt_final.pt "
            f"(or fedscrt_stub.pt) and ensure MODEL_V2_PATH points at the model repo."
        )
    ck = torch.load(CKPT, map_location=DEVICE, weights_only=False)
    model = build_model("convnext_mil", DEVICE)
    model.load_state_dict(ck["model_state"], strict=False)
    model.eval()
    label_map = ck.get("label_map", {0: "Luminal", 1: "Non-Luminal"})
    meta = {
        "f1": float(ck.get("f1", 0.6289)),
        "auc": float(ck.get("auc", 0.6874)),
        "label_map": {int(k): v for k, v in label_map.items()},
        "model_version": int(ck.get("model_version", 1)),
    }
    return model, meta


def _slices_from_path(path: str) -> Tuple[torch.Tensor, torch.Tensor]:
    """.mha/.nii -> ((1,64,3,224,224) on DEVICE, (64,128,128) CPU vol).

    Uses the trained slice_view_transform which resizes, channel-replicates,
    AND ImageNet-normalizes (the user's draft skipped normalization)."""
    from image_process import preprocess_raw, slice_view_transform
    vol = preprocess_raw(path)                       # (64,128,128) float32 [0,1]
    vol_t = torch.from_numpy(vol)
    x = slice_view_transform(vol_t)                  # (64,3,224,224) — normalizes!
    return x.unsqueeze(0).to(DEVICE), vol_t


def predict_path(path: str) -> dict:
    model, meta = _model_and_meta()
    x, _ = _slices_from_path(path)
    with torch.no_grad():
        probs = torch.softmax(model(x), dim=-1)[0].cpu().numpy()
    order = probs.argsort()[::-1]
    pred = meta["label_map"].get(int(order[0]), LABELS[int(order[0])])
    return {
        "predicted_subtype": pred,
        "confidence": round(float(probs[order[0]]), 4),
        "probs": [round(float(p), 4) for p in probs],
        "model_version": meta["model_version"],
        "strategy": "FEDSCRT",
        "f1": meta["f1"],
        "auc": meta["auc"],
        "hormone_therapy": "indicated" if pred == "Luminal" else "not_indicated",
    }


def verify_volume(buffer: bytes, filename: str) -> dict:
    """Real check: does SimpleITK read this as a 3D MRI volume?"""
    import SimpleITK as sitk
    suffix = os.path.splitext(filename)[1] or ".mha"
    if suffix.lower() not in (".mha", ".nii", ".gz", ".dcm"):
        return {"valid": False, "confidence": 0.97, "reason": "Not an MRI volume format (.mha/.nii/.dcm)"}
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as t:
        t.write(buffer); tmp = t.name
    try:
        img = sitk.ReadImage(tmp, sitk.sitkFloat32)
        arr = sitk.GetArrayFromImage(img)
        if arr.ndim != 3 or min(arr.shape) < 8:
            return {"valid": False, "confidence": 0.9, "reason": "File is not a 3D MRI volume"}
        return {"valid": True, "confidence": 0.95, "reason": "Valid 3D MRI volume"}
    except Exception as e:
        return {"valid": False, "confidence": 0.6, "reason": f"Could not read as MRI volume: {e}"}
    finally:
        os.unlink(tmp)
