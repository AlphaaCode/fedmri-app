import json
import os
import hashlib
import asyncio
import random
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="FedMRI ML Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load mock results
MOCK_RESULTS_PATH = Path(__file__).parent / "mock_results.json"
with open(MOCK_RESULTS_PATH) as f:
    MOCK_RESULTS = json.load(f)

# Configuration
INFERENCE_MODE = os.getenv("INFERENCE_MODE", "mock")
ATTN_MODE = os.getenv("ATTN_MODE", "blob")
AL_MODE = os.getenv("AL_MODE", "mock")
ATTN_GRID = 224

# Active-learning state — in-memory model metrics, mutated by /feedback
SUBTYPE_KEYS = ["Luminal A", "Luminal B", "HER2", "Triple Negative"]
AL_STATE = {
    "model_version": 10,
    "f1_per_class": {"Luminal A": 0.71, "Luminal B": 0.27, "HER2": 0.11, "Triple Negative": 0.21},
    "accuracy": 0.55,
}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/metrics")
async def metrics():
    """Return model metrics (real: from the FedSCRT checkpoint; mock: seeded)."""
    if INFERENCE_MODE == "real":
        import real_inference
        _, meta = real_inference._model_and_meta()
        return {
            "modelVersion": meta["model_version"],
            "f1Macro": meta["f1"],
            "auc": meta["auc"],
            "accuracy": 0.7027,
            "mode": "real",
            "task": "binary",
        }
    return {
        "modelVersion": 10,
        "f1Macro": 0.41,
        "accuracy": 0.55,
        "mode": INFERENCE_MODE,
    }


@app.get("/model-info")
async def model_info():
    """Static model metadata for the UI (FedSCRT identity + privacy framing)."""
    return {
        "model": "FedSCRT",
        "architecture": "ConvNeXt-Nano + GatedAttentionMIL",
        "task": "Binary breast MRI subtype (Luminal vs Non-Luminal)",
        "training": "Federated Classifier Retraining (FedSCRT)",
        "privacy": "Raw data never transmitted — model weights only",
        "mode": INFERENCE_MODE,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict the molecular subtype from an uploaded MRI file.

    real mode: load the FedSCRT ConvNeXt-MIL model and predict from the actual
    voxels (binary Luminal / Non-Luminal). mock mode: deterministic seeding from
    the filename hash.
    """
    if INFERENCE_MODE == "real":
        import tempfile
        import real_inference

        suffix = os.path.splitext(file.filename or "scan.mha")[1] or ".mha"
        content = await file.read()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as t:
            t.write(content)
            tmp = t.name
        try:
            return real_inference.predict_path(tmp)
        except RuntimeError as e:
            raise HTTPException(status_code=422, detail=f"Inference failed: {e}")
        except Exception as e:
            err_str = str(e)
            if "identify image" in err_str or "PIL" in err_str or "BytesIO" in err_str:
                raise HTTPException(
                    status_code=422,
                    detail="Could not read the uploaded volume. Ensure it is a valid .mha or .dcm file (not a JPEG/PNG)."
                )
            raise HTTPException(status_code=500, detail=f"Inference error: {err_str[:200]}")
        finally:
            try:
                os.unlink(tmp)
            except Exception:
                pass

    # mock path: deterministic seed from filename hash; never reads file bytes.
    # This makes the service fully functional without a GPU or model checkpoint.
    seed = int(hashlib.md5((file.filename or "scan").encode()).hexdigest(), 16) % len(MOCK_RESULTS)
    result = MOCK_RESULTS[seed].copy()
    # Probs are already normalised in mock_results; return as-is for reproducibility
    result["probs"] = [float(p) for p in result["probs"]]

    # Simulate inference latency (1.5-3s)
    await asyncio.sleep(random.uniform(1.5, 3.0))

    return result


def _gaussian_blob(grid: np.ndarray, cx: int, cy: int, sigma: float, amplitude: float) -> np.ndarray:
    """Add a Gaussian blob centered at (cx, cy) with given sigma + amplitude to grid in-place."""
    h, w = grid.shape
    y, x = np.ogrid[:h, :w]
    blob = amplitude * np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2.0 * sigma ** 2)))
    return grid + blob


@app.get("/attention/{case_id}")
async def attention(case_id: str, path: str = Query(default=None)):
    """
    Return a 224x224 attention heatmap as a flat list of 50176 floats in [0,1].

    real mode: real top-attended slice PNG + real within-slice activation map for
    the volume at `path`. Blob mode (mock): 2-3 Gaussian blobs seeded by case_id.
    """
    if INFERENCE_MODE == "real":
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="volume path required for real attention")
        import real_inference

        return real_inference.attention_for_path(path)

    if ATTN_MODE == "mil":
        raise HTTPException(
            status_code=501,
            detail="Set checkpoint path and ATTN_MODE=mil to enable MIL attention",
        )

    if ATTN_MODE != "blob":
        raise HTTPException(status_code=400, detail=f"Unknown ATTN_MODE: {ATTN_MODE}")

    # Deterministic seeding from case_id
    seed = int(hashlib.md5(case_id.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)

    grid = np.zeros((ATTN_GRID, ATTN_GRID), dtype=np.float32)

    # 2-3 blobs placed in center-left region
    num_blobs = int(rng.integers(2, 4))  # 2 or 3
    for _ in range(num_blobs):
        cx = int(rng.integers(80, 161))
        cy = int(rng.integers(80, 161))
        sigma = float(rng.uniform(20, 35))
        amplitude = float(rng.uniform(0.6, 1.0))
        grid = _gaussian_blob(grid, cx, cy, sigma, amplitude)

    # Uniform noise floor
    grid = grid + 0.05

    # Normalize to [0,1]
    gmax = float(grid.max())
    if gmax > 0:
        grid = grid / gmax

    return {"attention": grid.flatten().tolist(), "size": ATTN_GRID}


@app.post("/verify")
async def verify_image(file: UploadFile = File(...)):
    """
    Check whether the uploaded image looks like a grayscale medical (breast MRI) scan.
    Returns {valid, confidence, reason}.
    """
    import io
    from PIL import Image as PILImage

    contents = await file.read()

    if INFERENCE_MODE == "real":
        import real_inference

        return real_inference.verify_volume(contents, file.filename or "scan.mha")

    # ---- mock path: PIL grayscale-photo heuristic on `contents` ----
    try:
        img = PILImage.open(io.BytesIO(contents)).convert("RGB")
        arr = np.array(img, dtype=np.int32)

        h, w = arr.shape[:2]
        if h < 64 or w < 64:
            return {"valid": False, "confidence": 0.95, "reason": "Image resolution is too small for MRI analysis"}

        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        mean_intensity = float(np.mean(arr))
        if mean_intensity < 15:
            return {"valid": False, "confidence": 0.90, "reason": "Image appears to be blank or completely dark"}
        if mean_intensity > 240:
            return {"valid": False, "confidence": 0.90, "reason": "Image appears to be overexposed or blank white"}

        # Grayscale check: MRI scans have very low channel-to-channel variance
        rg_diff = float(np.mean(np.abs(r - g)))
        rb_diff = float(np.mean(np.abs(r - b)))
        gb_diff = float(np.mean(np.abs(g - b)))
        color_variance = (rg_diff + rb_diff + gb_diff) / 3.0

        is_grayscale = color_variance < 25.0
        if not is_grayscale:
            return {
                "valid": False,
                "confidence": round(min(0.95, color_variance / 100.0), 2),
                "reason": "Image appears to be a color photograph, not a grayscale MRI scan",
            }

        # Texture check: MRI scans have varied texture (not a solid fill)
        gray = np.mean(arr, axis=2)
        texture_std = float(np.std(gray))
        if texture_std < 10:
            return {"valid": False, "confidence": 0.80, "reason": "Image appears to be a solid color, not an MRI scan"}

        confidence = round(min(0.94, 0.60 + (texture_std / 128.0) * 0.34), 2)
        return {"valid": True, "confidence": confidence, "reason": "Image appears to be a valid grayscale medical scan"}

    except Exception as e:
        return {"valid": False, "confidence": 0.50, "reason": f"Could not process image: {str(e)}"}


from pydantic import BaseModel


class FeedbackPayload(BaseModel):
    case_id: str
    correct_subtype: str
    predicted_subtype: str


@app.post("/feedback")
async def feedback(body: FeedbackPayload):
    """
    Active learning update: a doctor corrected a prediction.
    Mock mode: bump F1 for the corrected class, jitter others, bump model version.
    """
    if AL_MODE == "real":
        raise HTTPException(501, "Set AL_MODE=real + checkpoint to enable real AL fine-tuning")

    correct = body.correct_subtype
    if correct not in SUBTYPE_KEYS:
        raise HTTPException(400, f"correct_subtype must be one of {SUBTYPE_KEYS}")

    # Simulate fine-tune delay (real path would run ~30s of training)
    await asyncio.sleep(2.0)

    # Boost the corrected class
    bump = random.uniform(0.005, 0.015)
    AL_STATE["f1_per_class"][correct] = min(0.95, AL_STATE["f1_per_class"][correct] + bump)

    # Small noise on others (could go either way — fine-tuning may slightly degrade other classes)
    for k in SUBTYPE_KEYS:
        if k != correct:
            jitter = random.uniform(-0.005, 0.005)
            AL_STATE["f1_per_class"][k] = max(0.05, min(0.95, AL_STATE["f1_per_class"][k] + jitter))

    AL_STATE["model_version"] += 1
    f1_macro = sum(AL_STATE["f1_per_class"].values()) / len(SUBTYPE_KEYS)
    AL_STATE["accuracy"] = min(0.95, AL_STATE["accuracy"] + bump * 0.5)

    return {
        "model_version": AL_STATE["model_version"],
        "f1_per_class": AL_STATE["f1_per_class"],
        "f1_macro": round(f1_macro, 4),
        "accuracy": round(AL_STATE["accuracy"], 4),
        "corrected_class": correct,
    }


@app.on_event("startup")
async def startup():
    """Log startup info; in real mode, load FedSCRT once (fail loudly if missing)."""
    print(f"FedMRI ML Service started in {INFERENCE_MODE} mode")
    if INFERENCE_MODE == "real":
        import real_inference

        _, meta = real_inference._model_and_meta()
        print(
            f"FedSCRT loaded | F1={meta['f1']:.4f} AUC={meta['auc']:.4f} "
            f"on {real_inference.DEVICE}"
        )


@app.on_event("shutdown")
async def shutdown():
    """Log shutdown info."""
    print("FedMRI ML Service shutting down")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
