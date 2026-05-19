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

    # Deterministic seed from filename
    seed = int(hashlib.md5(file.filename.encode()).hexdigest(), 16) % len(MOCK_RESULTS)
    result = MOCK_RESULTS[seed].copy()

    # Add Gaussian noise and softmax renormalize
    probs = np.array(result["probs"], dtype=np.float32)
    noise = np.random.normal(0, 0.025, 4)
    probs = probs + noise
    # Softmax renormalization
    probs_exp = np.exp(probs)
    probs = probs_exp / probs_exp.sum()
    result["probs"] = probs.tolist()

    # Simulate inference latency (1.5-3s)
    await asyncio.sleep(random.uniform(1.5, 3.0))

    return result


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
