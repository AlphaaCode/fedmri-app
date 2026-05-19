import json
import os
import hashlib
import asyncio
import random
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
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
    """Return seeded model metrics."""
    return {
        "modelVersion": 10,
        "f1Macro": 0.41,
        "accuracy": 0.55,
        "mode": INFERENCE_MODE,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Predict molecular subtype from MRI file.

    Uses deterministic seeding based on filename hash.
    Adds Gaussian noise to probabilities and returns result.
    """
    if INFERENCE_MODE != "mock":
        raise HTTPException(
            status_code=501,
            detail="Set checkpoint path and INFERENCE_MODE=real to enable real inference",
        )

    # Deterministic seed from filename — same file always returns same result
    seed = int(hashlib.md5(file.filename.encode()).hexdigest(), 16) % len(MOCK_RESULTS)
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
async def attention(case_id: str):
    """
    Return a 224x224 attention heatmap as a flat list of 50176 floats in [0,1].

    Blob mode: 2-3 Gaussian blobs centered in the upper-left quadrant, seeded by case_id.
    MIL mode: not implemented (set ATTN_MODE=mil + checkpoint to enable).
    """
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
    """Log startup info."""
    print(f"FedMRI ML Service started in {INFERENCE_MODE} mode")


@app.on_event("shutdown")
async def shutdown():
    """Log shutdown info."""
    print("FedMRI ML Service shutting down")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
