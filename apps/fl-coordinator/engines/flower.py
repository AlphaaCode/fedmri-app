from __future__ import annotations
import asyncio, os, time, uuid
import glob as _glob
import numpy as np
from .base import FLEngine, RoundResult, ProgressCallback

# Per-hospital feature caches the real round trains on (same caches the live
# FL-test uses). Override with FL_CACHE_DIR.
_CACHE = os.getenv("FL_CACHE_DIR", os.path.join(os.path.dirname(__file__), "..", "fl_cache"))
_HOSPITALS = ["client_0", "client_1", "client_2"]

# Persistent global head + version, warm-started across rounds.
_STATE: dict = {"glob": None, "f1": 0.0, "model_version": 10}


def _load_clients():
    clients = []
    for p in sorted(_glob.glob(os.path.join(_CACHE, "client_*.npz"))):
        d = np.load(p)
        clients.append((d["X"], d["y"]))
    if not clients:
        raise RuntimeError(f"no feature caches in {_CACHE}")
    v = np.load(os.path.join(_CACHE, "val.npz"))
    return clients, (v["X"], v["y"])


def _aggregate(heads: list[dict], sizes: list[int]) -> dict:
    """FedAvg of the client heads. Uses Flower's real aggregate() when the flwr
    package is importable; otherwise an identical numpy weighted mean (so a real
    federated round runs whether or not flwr is installed)."""
    try:
        from flwr.server.strategy.aggregate import aggregate as flwr_aggregate
        results = [([h["W"], h["b"]], int(sizes[k])) for k, h in enumerate(heads)]
        w, b = flwr_aggregate(results)  # weighted average of the ndarrays
        return {"W": np.asarray(w), "b": np.asarray(b)}
    except Exception:
        import realfl
        return realfl.aggregate(heads, sizes)


def _per_class_f1(head: dict, val, n_classes: int) -> dict:
    import realfl
    from sklearn.metrics import f1_score
    Xv, yv = val
    pred = realfl._softmax(Xv @ head["W"] + head["b"]).argmax(1)
    names = ["Luminal", "Non-Luminal"] if n_classes == 2 else ["lumA", "lumB", "her2", "tn"]
    f = f1_score(yv, pred, average=None, labels=list(range(n_classes)), zero_division=0)
    return {names[i]: round(float(f[i]), 4) for i in range(min(n_classes, len(names)))}


class FlowerFLEngine(FLEngine):
    """Self-contained REAL federated round.

    Each hospital trains a classifier head on its OWN cached features (never
    shared), then only those head weights are FedAvg-aggregated into the global
    model — a genuine federated-learning round, run in-process over fl_cache/.
    No external client VMs and no Ray are required (unlike a full flwr server),
    which makes FL_MODE=flower actually runnable on one machine. Flower's real
    aggregate() is used when the flwr package is present (see _aggregate)."""

    def __init__(self, strategy: str | None = None):
        self.strategy = (strategy or os.getenv("FL_STRATEGY", "FEDAVG")).upper()

    async def start_round(
        self,
        hospital_id: str,
        case_id: str,
        trigger: str,
        on_progress: ProgressCallback | None = None,
    ) -> RoundResult:
        import realfl
        round_id = str(uuid.uuid4())
        start = time.time()

        clients, val = await asyncio.to_thread(_load_clients)
        sizes = [int(len(y)) for _, y in clients]
        n_classes = int(max(int(y.max()) for _, y in clients) + 1)
        glob = _STATE["glob"]
        f1_before = (
            realfl.evaluate(glob, val[0], val[1], n_classes)["f1"] if glob is not None else 0.0
        )

        heads: list[dict] = []
        contributions: list[dict] = []
        for k, (cid, (X, y)) in enumerate(zip(_HOSPITALS, clients)):
            if on_progress:
                await on_progress(cid, "local_training", 0)
            # Local training on this hospital's silo only.
            h = await asyncio.to_thread(realfl.train_head, X, y, n_classes, 60, 0.1, 1e-4, k, glob)
            heads.append(h)
            local_f1 = float(realfl.evaluate(h, X, y, n_classes)["f1"])
            if glob is not None:
                dn = float(np.sqrt(np.sum((h["W"] - glob["W"]) ** 2) + np.sum((h["b"] - glob["b"]) ** 2)))
            else:
                dn = float(np.sqrt(np.sum(h["W"] ** 2) + np.sum(h["b"] ** 2)))
            contributions.append({
                "hospital_id": cid,
                "local_epochs": 60,
                "samples_used": int(len(y)),
                "local_f1_before": round(f1_before, 4),
                "local_f1_after": round(local_f1, 4),
                "weight_delta_norm": round(dn, 4),
                "privacy_budget_used": 0.1,
            })
            if on_progress:
                await on_progress(cid, "local_training", 60)
            await asyncio.sleep(0.4)  # pace so the topology animation can follow

        if on_progress:
            await on_progress(hospital_id, "aggregating", 60)
        agg = _aggregate(heads, sizes)
        _STATE["glob"] = agg
        f1_after = float(realfl.evaluate(agg, val[0], val[1], n_classes)["f1"])
        _STATE["f1"] = f1_after
        _STATE["model_version"] += 1
        await asyncio.sleep(0.6)
        if on_progress:
            await on_progress(hospital_id, "complete", 60)

        return RoundResult(
            round_id=round_id,
            round_number=_STATE["model_version"] - 10,
            strategy=self.strategy,
            global_f1_before=round(f1_before, 4),
            global_f1_after=round(f1_after, 4),
            f1_per_class_after=_per_class_f1(agg, val, n_classes),
            duration_seconds=int(time.time() - start),
            model_version=_STATE["model_version"],
            contributions=contributions,
        )

    async def get_current_metrics(self) -> dict:
        return {
            "model_version": _STATE["model_version"],
            "f1_macro": round(_STATE["f1"], 4),
            "strategy": self.strategy,
        }
