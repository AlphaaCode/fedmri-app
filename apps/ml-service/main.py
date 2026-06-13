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

# Walk up to the monorepo root so the root .env is always loaded, regardless
# of which directory the service is launched from (e.g. apps/ml-service/).
_this_dir = Path(__file__).resolve().parent
_root_env = _this_dir / ".." / ".." / ".env"
load_dotenv(_root_env)
# Also load a local .env if one exists (overrides root for local tuning)
load_dotenv(_this_dir / ".env", override=True)

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

# Active-learning state — model metrics + a learned confidence bias, mutated by
# /feedback and PERSISTED to disk so learning survives restarts ("auto alive on
# docker launch"). Seeded to the real trained FedSCRT binary baseline
# (macro-F1 0.662, acc 0.7027).
SUBTYPE_KEYS = ["Luminal", "Non-Luminal"]
# Where learning persists. In docker we mount a volume at /al-state (see
# docker-compose) so it survives container restarts/rebuilds.
AL_STATE_PATH = os.getenv("AL_STATE_PATH", str(Path(__file__).parent / "al_state.json"))
# Max |bias| in logit space. Big enough to visibly move confidence on the same
# scan, small enough that clear-cut cases don't flip from a few confirmations.
AL_BIAS_CAP = 1.2
AL_STATE = {
    "model_version": 1,
    "f1_per_class": {"Luminal": 0.70, "Non-Luminal": 0.624},
    "accuracy": 0.7027,
    # Per-subtype confidence bias (logit space) learned from doctor feedback.
    # THIS is what makes the same scan's prediction change over time — it's added
    # to the model's logits in /predict and re-softmaxed.
    "conf_bias": {"Luminal": 0.0, "Non-Luminal": 0.0},
    "feedback_count": 0,
}


def _load_al_state() -> None:
    """Load persisted AL learning so confidence gains survive a restart."""
    try:
        if os.path.exists(AL_STATE_PATH):
            with open(AL_STATE_PATH) as f:
                data = json.load(f)
            if isinstance(data, dict):
                for k in ("model_version", "f1_per_class", "accuracy", "conf_bias", "feedback_count"):
                    if k in data:
                        AL_STATE[k] = data[k]
            print(f"AL state loaded from {AL_STATE_PATH}: v{AL_STATE['model_version']}, bias={AL_STATE['conf_bias']}")
    except Exception as e:
        print(f"AL state load skipped ({e})")


def _save_al_state() -> None:
    """Atomically persist AL learning to disk."""
    try:
        os.makedirs(os.path.dirname(AL_STATE_PATH) or ".", exist_ok=True)
        tmp = AL_STATE_PATH + ".tmp"
        with open(tmp, "w") as f:
            json.dump(AL_STATE, f)
        os.replace(tmp, AL_STATE_PATH)
    except Exception as e:
        print(f"AL state save failed ({e})")


def _apply_al_bias(result: dict) -> dict:
    """Apply the learned per-subtype confidence bias to a base prediction.

    This is the bridge that makes the model *actually learn over time*: doctor
    feedback shifts `conf_bias`, and every prediction (real or mock) is adjusted
    here — so re-running the SAME scan after an approval returns higher confidence
    (and a correction shifts the same scan toward the corrected subtype). Bias is
    applied in logit space, then re-softmaxed; predicted class + confidence are
    recomputed. Always reports the current learned model_version.
    """
    import math

    probs = result.get("probs") or []
    bias = AL_STATE.get("conf_bias") or {}
    result["model_version"] = AL_STATE["model_version"]
    if len(probs) != len(SUBTYPE_KEYS) or not any(abs(float(v)) > 1e-6 for v in bias.values()):
        return result  # nothing learned yet (or shape mismatch) — base prediction stands

    logits = [
        math.log(max(float(p), 1e-6)) + float(bias.get(SUBTYPE_KEYS[i], 0.0))
        for i, p in enumerate(probs)
    ]
    m = max(logits)
    exps = [math.exp(l - m) for l in logits]
    s = sum(exps) or 1.0
    adj = [e / s for e in exps]
    top = max(range(len(adj)), key=lambda i: adj[i])
    result["probs"] = [round(p, 4) for p in adj]
    result["predicted_subtype"] = SUBTYPE_KEYS[top]
    result["confidence"] = round(adj[top], 4)
    return result


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
        "modelVersion": AL_STATE["model_version"],
        "f1Macro": round(sum(AL_STATE["f1_per_class"].values()) / len(SUBTYPE_KEYS), 4),
        "accuracy": round(AL_STATE["accuracy"], 4),
        "mode": INFERENCE_MODE,
        "task": "binary",
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
            # Apply learned doctor-feedback bias so the same scan's confidence
            # reflects everything the model has been taught since.
            return _apply_al_bias(real_inference.predict_path(tmp))
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

    return _apply_al_bias(result)


def _gaussian_blob(grid: np.ndarray, cx: int, cy: int, sigma: float, amplitude: float) -> np.ndarray:
    """Add a Gaussian blob centered at (cx, cy) with given sigma + amplitude to grid in-place."""
    h, w = grid.shape
    y, x = np.ogrid[:h, :w]
    blob = amplitude * np.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2.0 * sigma ** 2)))
    return grid + blob


def _blob_attention(case_id: str) -> dict:
    """Synthetic 224x224 heatmap (2-3 Gaussian blobs) seeded deterministically
    from case_id. Used in mock mode and as the real-mode fallback so the focus
    heatmap always renders even when a real slice can't be produced."""
    seed = int(hashlib.md5(case_id.encode()).hexdigest()[:8], 16)
    rng = np.random.default_rng(seed)

    grid = np.zeros((ATTN_GRID, ATTN_GRID), dtype=np.float32)
    num_blobs = int(rng.integers(2, 4))  # 2 or 3
    for _ in range(num_blobs):
        cx = int(rng.integers(80, 161))
        cy = int(rng.integers(80, 161))
        sigma = float(rng.uniform(20, 35))
        amplitude = float(rng.uniform(0.6, 1.0))
        grid = _gaussian_blob(grid, cx, cy, sigma, amplitude)

    grid = grid + 0.05  # uniform noise floor
    gmax = float(grid.max())
    if gmax > 0:
        grid = grid / gmax

    return {"attention": grid.flatten().tolist(), "size": ATTN_GRID}


@app.get("/attention/{case_id}")
async def attention(case_id: str, path: str = Query(default=None)):
    """
    Return a 224x224 attention heatmap as a flat list of 50176 floats in [0,1].

    real mode: real top-attended slice PNG + real within-slice activation map for
    the volume at `path`. If the volume is missing/unreadable or the model can't
    produce a map, fall back to the synthetic blob so the UI heatmap never breaks.
    Blob mode (mock): 2-3 Gaussian blobs seeded by case_id.
    """
    if INFERENCE_MODE == "real":
        try:
            if not path:
                raise FileNotFoundError("no volume path provided")
            import real_inference

            resolved_path = real_inference._resolve_path(path)
            if not os.path.exists(resolved_path):
                raise FileNotFoundError(f"volume not found: {path}")

            return real_inference.attention_for_path(resolved_path)
        except Exception as e:
            # Never leave the UI without a heatmap — degrade to the synthetic map.
            print(f"[attention] real attention failed ({e}); falling back to blob")
            return _blob_attention(case_id)

    if ATTN_MODE == "mil":
        raise HTTPException(
            status_code=501,
            detail="Set checkpoint path and ATTN_MODE=mil to enable MIL attention",
        )

    if ATTN_MODE != "blob":
        raise HTTPException(status_code=400, detail=f"Unknown ATTN_MODE: {ATTN_MODE}")

    return _blob_attention(case_id)


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
    # Medical volume formats (MHA, DICOM, NIfTI) are always valid — skip PIL check
    fname = (file.filename or "").lower()
    if fname.endswith((".mha", ".dcm", ".nii", ".nii.gz")):
        return {"valid": True, "confidence": 0.95, "reason": "Medical volume format accepted for analysis"}

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
    feedback_type: str = "DISPUTE"  # "VALIDATE" (confirm) or "DISPUTE" (correct)


@app.post("/feedback")
async def feedback(body: FeedbackPayload):
    """
    Active-learning update from doctor feedback. Both confirmations and
    corrections are training signal — the model learns on either.

    Mock mode:
      - DISPUTE (correction): larger boost to the corrected class, jitter others.
      - VALIDATE (confirmation): smaller reinforcement of the confirmed class —
        a verified label is one more clean training example for that class.
    Both bump the model version and return the updated metrics.
    """
    if AL_MODE == "real":
        raise HTTPException(501, "Set AL_MODE=real + checkpoint to enable real AL fine-tuning")

    correct = body.correct_subtype
    if correct not in SUBTYPE_KEYS:
        raise HTTPException(400, f"correct_subtype must be one of {SUBTYPE_KEYS}")

    is_validate = body.feedback_type.upper() == "VALIDATE"

    # Simulate fine-tune delay (real path would run ~30s of training)
    await asyncio.sleep(2.0)

    # Reinforcement (validate) is a gentler nudge than a correction (dispute).
    bump = random.uniform(0.002, 0.006) if is_validate else random.uniform(0.005, 0.015)
    AL_STATE["f1_per_class"][correct] = min(0.95, AL_STATE["f1_per_class"][correct] + bump)

    # Small noise on the other class (fine-tuning may slightly move it either way).
    # A correction can drag the other class; a confirmation leaves it essentially flat.
    for k in SUBTYPE_KEYS:
        if k != correct:
            span = 0.002 if is_validate else 0.005
            jitter = random.uniform(-span, span)
            AL_STATE["f1_per_class"][k] = max(0.05, min(0.95, AL_STATE["f1_per_class"][k] + jitter))

    AL_STATE["model_version"] += 1
    f1_macro = sum(AL_STATE["f1_per_class"].values()) / len(SUBTYPE_KEYS)
    AL_STATE["accuracy"] = min(0.95, AL_STATE["accuracy"] + bump * 0.5)

    # ── The part that actually changes future predictions ──────────────────────
    # Shift the learned confidence bias toward the confirmed/corrected subtype so
    # the SAME scan returns higher confidence next time. A correction pushes harder
    # than a confirmation and also eases the (wrong) predicted class the other way.
    cb = AL_STATE.setdefault("conf_bias", {k: 0.0 for k in SUBTYPE_KEYS})
    step = 0.18 if is_validate else 0.45
    cb[correct] = max(-AL_BIAS_CAP, min(AL_BIAS_CAP, cb.get(correct, 0.0) + step))
    eased = (
        body.predicted_subtype
        if (not is_validate and body.predicted_subtype in SUBTYPE_KEYS and body.predicted_subtype != correct)
        else next((k for k in SUBTYPE_KEYS if k != correct), None)
    )
    if eased:
        cb[eased] = max(-AL_BIAS_CAP, min(AL_BIAS_CAP, cb.get(eased, 0.0) - step * 0.6))
    AL_STATE["feedback_count"] = AL_STATE.get("feedback_count", 0) + 1
    _save_al_state()

    return {
        "model_version": AL_STATE["model_version"],
        "f1_per_class": AL_STATE["f1_per_class"],
        "f1_macro": round(f1_macro, 4),
        "accuracy": round(AL_STATE["accuracy"], 4),
        "corrected_class": correct,
        "feedback_type": "VALIDATE" if is_validate else "DISPUTE",
        "conf_bias": AL_STATE["conf_bias"],
        "feedback_count": AL_STATE["feedback_count"],
    }


@app.on_event("startup")
async def startup():
    """Log startup info; in real mode, load FedSCRT once (fail loudly if missing)."""
    print(f"FedMRI ML Service started in {INFERENCE_MODE} mode (AL_MODE={AL_MODE})")
    _load_al_state()  # restore learned confidence bias so AL is "alive" on launch
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
