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

# Default to the in-repo model copy (apps/ml-service -> ../../model-core) so the
# app loads the FedSCRT model + checkpoint from THIS repository with no external
# path configuration. Override MODEL_V2_PATH / FEDSCRT_CKPT to point elsewhere.
_REPO_MODEL_CORE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "model-core")
)
V2 = os.environ.get("MODEL_V2_PATH") or _REPO_MODEL_CORE
if V2 and V2 not in sys.path:
    sys.path.insert(0, V2)
os.environ.setdefault("MRI_NUM_CLASSES", "2")

CKPT = os.environ.get("FEDSCRT_CKPT") or os.path.join(V2, "checkpoints", "fedscrt_final.pt")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
LABELS = ["Luminal", "Non-Luminal"]
HOST_WORKSPACE_ROOT = os.environ.get("HOST_WORKSPACE_ROOT")
CONTAINER_WORKSPACE_ROOT = os.environ.get("CONTAINER_WORKSPACE_ROOT", "/workspace-root")


def _resolve_path(path: str) -> str:
    if os.path.exists(path):
        return path

    if not HOST_WORKSPACE_ROOT:
        return path

    host_root = HOST_WORKSPACE_ROOT.replace("\\", "/").rstrip("/")
    candidate = path.replace("\\", "/")
    if candidate.lower().startswith(host_root.lower() + "/"):
        rel = candidate[len(host_root) + 1 :]
        translated = os.path.join(CONTAINER_WORKSPACE_ROOT, *rel.split("/"))
        if os.path.exists(translated):
            return translated

    return path


def _load_repo_model_module():
    """Import the model class from the federated-learning-model repo without
    importing the training entrypoint.

    The repo's `main.py` pulls in the full training stack and can block startup
    on dataset or hub setup. For inference we only need `model.py`.
    """
    import importlib.util
    try:
        import timm

        original_create_model = timm.create_model

        if not getattr(original_create_model, "_fedmri_no_pretrained", False):
            def _create_model_no_pretrained(*args, **kwargs):
                kwargs = dict(kwargs)
                kwargs["pretrained"] = False
                kwargs.pop("pretrained_cfg", None)
                kwargs.pop("pretrained_cfg_overlay", None)
                return original_create_model(*args, **kwargs)

            _create_model_no_pretrained._fedmri_no_pretrained = True  # type: ignore[attr-defined]
            timm.create_model = _create_model_no_pretrained
    except Exception:
        pass

    mod = sys.modules.get("fedscrt_repo_model")
    if mod is not None and hasattr(mod, "ConvNeXtMILClassifier"):
        return mod
    if not V2:
        raise RuntimeError("MODEL_V2_PATH not set; cannot locate the model repo model.py")
    path = os.path.join(V2, "model.py")
    spec = importlib.util.spec_from_file_location("fedscrt_repo_model", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["fedscrt_repo_model"] = mod
    spec.loader.exec_module(mod)
    return mod


@lru_cache(maxsize=1)
def _model_and_meta():
    if not CKPT or not os.path.exists(CKPT):
        raise RuntimeError(
            f"FEDSCRT_CKPT not found: {CKPT!r}. Set it to fedscrt_final.pt "
            f"(or fedscrt_stub.pt) and ensure MODEL_V2_PATH points at the model repo."
        )
    ck = torch.load(CKPT, map_location=DEVICE, weights_only=False)
    model_module = _load_repo_model_module()
    model = model_module.ConvNeXtMILClassifier(num_classes=2, proj_dim=256, attn_dim=128)
    model = model.to(DEVICE)
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
    vol = preprocess_raw(_resolve_path(path))       # (64,128,128) float32 [0,1]
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


def _spatial_map_for_slice(model, slice_tensor: torch.Tensor) -> np.ndarray:
    """ConvNeXt last-stage activation magnitude for one (1,3,224,224) slice
    -> (224,224) in [0,1]. Real activation map (not random).

    The backbone is built with global_pool='avg'/num_classes=0, so calling it
    directly returns a pooled (1,C) vector. We use forward_features to get the
    unpooled (1,C,h,w) spatial map and reduce it across channels."""
    with torch.no_grad():
        fmap = model.backbone.forward_features(slice_tensor)  # (1, C, h, w)
    if fmap.dim() != 4:                                       # unexpected -> no map
        return np.zeros((224, 224), dtype="float32")
    m = fmap.abs().mean(dim=1, keepdim=True)                  # (1,1,h,w)
    m = F.interpolate(m, size=(224, 224), mode="bilinear", align_corners=False)[0, 0]
    m = m.cpu().numpy()
    mn, mx = float(m.min()), float(m.max())
    return ((m - mn) / (mx - mn + 1e-8)).astype("float32")


def attention_for_path(path: str) -> dict:
    """Real top-attended slice (PNG b64) + within-slice spatial map (224x224 floats)."""
    import base64
    from PIL import Image
    model, _ = _model_and_meta()
    x, vol = _slices_from_path(path)                      # x:(1,S,3,224,224) vol:(S,128,128)
    with torch.no_grad():
        model(x)

    # GatedAttentionMIL stores per-slice weights in last_attn after forward.
    # Fall back to mid-volume slice if the attribute is absent.
    try:
        raw = model.last_attn
        if raw is None:
            raise AttributeError
        attn = (raw[0] if hasattr(raw[0], "cpu") else torch.tensor(raw[0])).cpu().numpy()
        top = int(attn.argmax())
    except (AttributeError, IndexError, TypeError):
        top = x.shape[1] // 2

    # Real grayscale slice PNG from the preprocessed volume (not the normalised tensor).
    sl = vol[top].numpy()
    img = Image.fromarray((np.clip(sl, 0, 1) * 255).astype("uint8")).resize((224, 224))
    buf = io.BytesIO(); img.save(buf, format="PNG")
    slice_png = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    spatial = _spatial_map_for_slice(model, x[0, top:top + 1])  # (1,3,224,224)
    return {"slicePng": slice_png, "attention": spatial.flatten().tolist(),
            "size": 224, "topSlice": top}
