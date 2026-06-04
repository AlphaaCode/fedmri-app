import os, uuid, asyncio, logging
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

FL_MODE        = os.getenv("FL_MODE", "mock").lower()
BACKEND_URL    = os.getenv("BACKEND_URL", "http://localhost:3001")
WEBHOOK_SECRET = os.getenv("FL_WEBHOOK_SECRET", "")
FL_STRATEGY    = os.getenv("FL_STRATEGY", "FEDPROX").upper()
MAX_RETRIES    = int(os.getenv("WEBHOOK_MAX_RETRIES", "3"))
FL_CACHE_DIR   = os.getenv("FL_CACHE_DIR", os.path.join(os.path.dirname(__file__), "fl_cache"))

if FL_MODE == "flower":
    from engines.flower import FlowerFLEngine as Engine
else:
    from engines.mock import MockFLEngine as Engine

engine = Engine() if FL_MODE == "flower" else Engine(strategy=FL_STRATEGY)

app = FastAPI(title="FedMRI FL Coordinator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

_rounds: dict[str, dict] = {}


class StartRoundReq(BaseModel):
    hospital_id: str = Field(..., min_length=3, max_length=50, description="Hospital client ID")
    case_id: str = Field(..., min_length=3, max_length=50, description="Case identifier")
    trigger: str = Field(..., pattern="^(DOCTOR_UPLOAD|DISPUTE|SCHEDULED)$", description="What triggered this round")


@app.post("/round/start")
@limiter.limit("5/minute")
async def start_round(request: Request, req: StartRoundReq, background_tasks: BackgroundTasks):
    rid = str(uuid.uuid4())
    _rounds[rid] = {"status": "running", "progress": []}
    logger.info(f"[round {rid}] Starting FL round triggered by {req.trigger} from {req.hospital_id}")
    background_tasks.add_task(_run, rid, req)
    return {"round_id": rid, "status": "running", "mode": FL_MODE}


async def _run(rid: str, req: StartRoundReq):
    progress: list[dict] = []

    async def _post_with_retry(url: str, payload: dict, max_retries: int = MAX_RETRIES) -> bool:
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=10) as c:
                    resp = await c.post(url, json=payload, headers={"x-fl-secret": WEBHOOK_SECRET})
                    if resp.status_code in [200, 201, 202]:
                        logger.info(f"[round {rid}] Webhook {url} succeeded on attempt {attempt + 1}")
                        return True
                    logger.warning(f"[round {rid}] Webhook {url} returned {resp.status_code} on attempt {attempt + 1}")
            except asyncio.TimeoutError:
                logger.warning(f"[round {rid}] Webhook {url} timeout on attempt {attempt + 1}")
            except Exception as e:
                logger.warning(f"[round {rid}] Webhook {url} failed on attempt {attempt + 1}: {e}")

            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # exponential backoff: 1s, 2s, 4s

        logger.error(f"[round {rid}] Webhook {url} failed after {max_retries} attempts")
        return False

    async def on_progress(hospital_id: str, phase: str, epochs: int):
        entry = {"hospital_id": hospital_id, "phase": phase, "epochs_done": epochs}
        progress.append(entry)
        _rounds[rid]["progress"] = list(progress)
        await _post_with_retry(
            f"{BACKEND_URL}/internal/fl/progress",
            {"round_id": rid, **entry}
        )

    try:
        logger.info(f"[round {rid}] Starting engine.start_round()")
        result = await engine.start_round(
            hospital_id=req.hospital_id,
            case_id=req.case_id,
            trigger=req.trigger,
            on_progress=on_progress,
        )
        logger.info(f"[round {rid}] Round complete: f1_before={result.global_f1_before}, f1_after={result.global_f1_after}")

        _rounds[rid]["status"] = "complete"
        await _post_with_retry(
            f"{BACKEND_URL}/internal/fl/round-complete",
            {
                "round_id":           result.round_id,
                "round_number":       result.round_number,
                "strategy":           result.strategy,
                "global_f1_before":   result.global_f1_before,
                "global_f1_after":    result.global_f1_after,
                "f1_per_class_after": result.f1_per_class_after,
                "duration_seconds":   result.duration_seconds,
                "model_version":      result.model_version,
                "contributions":      result.contributions,
                "triggered_hospital": req.hospital_id,
                "triggered_case":     req.case_id,
            }
        )
    except Exception as e:
        _rounds[rid]["status"] = "failed"
        logger.error(f"[round {rid}] Round failed: {e}", exc_info=True)


class FlTestReq(BaseModel):
    strategy: str = Field("fedscrt", pattern="^(fedscrt|fedavg)$")
    rounds: int = Field(10, ge=1, le=30)
    seed: int = Field(0, ge=0, le=9999)


def _load_clients():
    """Load the per-hospital feature caches (lazy numpy import so mock-mode
    startup does not require numpy)."""
    import glob
    import numpy as np
    clients = []
    for p in sorted(glob.glob(os.path.join(FL_CACHE_DIR, "client_*.npz"))):
        d = np.load(p)
        clients.append((d["X"], d["y"]))
    if not clients:
        raise HTTPException(503, detail=f"no feature caches in {FL_CACHE_DIR}")
    v = np.load(os.path.join(FL_CACHE_DIR, "val.npz"))
    return clients, (v["X"], v["y"])


@app.post("/fl-test/run")
@limiter.limit("10/minute")
async def fl_test_run(request: Request, req: FlTestReq, background_tasks: BackgroundTasks):
    rid = str(uuid.uuid4())
    _rounds[rid] = {"status": "running", "history": []}
    logger.info(f"[fl-test {rid}] starting {req.strategy} for {req.rounds} rounds")
    background_tasks.add_task(_run_fl_test, rid, req)
    return {"test_id": rid, "status": "running", "strategy": req.strategy, "rounds": req.rounds}


async def _run_fl_test(rid: str, req: FlTestReq):
    import realfl
    try:
        clients, val = _load_clients()
        sizes = [int(len(y)) for _, y in clients]
        # numpy compute is sub-second; run it off the event loop, then stream per round
        # Few local epochs/round so the live curve climbs visibly over rounds
        # (warm-started each round) instead of saturating at round 1.
        hist = await asyncio.to_thread(
            realfl.run_fl, clients, val,
            strategy=req.strategy, rounds=req.rounds, local_epochs=10, seeds=5, on_round=None,
        )
        for i, e in enumerate(hist):
            await _post_fl_test(rid, req.strategy, sizes, e, done=(i == len(hist) - 1))
        _rounds[rid]["status"] = "complete"
        _rounds[rid]["history"] = hist
    except Exception as ex:
        _rounds[rid]["status"] = "failed"
        logger.error(f"[fl-test {rid}] failed: {ex}", exc_info=True)


async def _post_fl_test(rid, strategy, sizes, entry, done):
    payload = {
        "test_id": rid, "strategy": strategy, "client_sizes": sizes,
        "round": entry["round"], "f1": entry["f1"], "auc": entry["auc"],
        "accuracy": entry["accuracy"], "done": done,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(f"{BACKEND_URL}/internal/fl/test-progress", json=payload,
                         headers={"x-fl-secret": WEBHOOK_SECRET})
    except Exception as e:
        logger.warning(f"[fl-test {rid}] webhook failed: {e}")


@app.get("/round/{rid}/status")
async def round_status(rid: str):
    s = _rounds.get(rid)
    if not s:
        logger.warning(f"Status requested for unknown round: {rid}")
        raise HTTPException(404, detail="Round not found")
    return {"round_id": rid, **s}


@app.get("/metrics")
async def metrics():
    try:
        return await engine.get_current_metrics()
    except Exception as e:
        logger.error(f"Failed to fetch metrics: {e}")
        raise HTTPException(500, detail="Failed to fetch metrics")


@app.get("/health")
async def health():
    try:
        metrics = await engine.get_current_metrics()
        return {
            "status": "ok",
            "mode": FL_MODE,
            "strategy": FL_STRATEGY,
            "model_version": metrics.get("model_version", -1),
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(503, detail="Engine unavailable")


@app.on_event("startup")
async def startup():
    logger.info(f"FedMRI FL Coordinator starting: mode={FL_MODE}, strategy={FL_STRATEGY}")


@app.on_event("shutdown")
async def shutdown():
    logger.info("FedMRI FL Coordinator shutting down")
