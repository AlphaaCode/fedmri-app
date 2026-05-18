from __future__ import annotations
import asyncio, random, time, uuid, os
from .base import FLEngine, RoundResult, ProgressCallback

_HOSPITALS = ["client_0", "client_1", "client_2"]
_SAMPLES   = {"client_0": 247, "client_1": 312, "client_2": 178}
_F1_STATE  = {"current": 0.41, "model_version": 10}
_STRATEGY  = os.getenv("FL_STRATEGY", "FEDPROX").upper()

_F1_BASE = {
    "FEDAVG":  {"lumA": 0.71, "lumB": 0.24, "her2": 0.09, "tn": 0.18},
    "FEDPROX": {"lumA": 0.73, "lumB": 0.27, "her2": 0.11, "tn": 0.21},
}


class MockFLEngine(FLEngine):
    def __init__(self, strategy: str = "FEDPROX"):
        self.strategy = strategy.upper()

    async def start_round(
        self,
        hospital_id: str,
        case_id: str,
        trigger: str,
        on_progress: ProgressCallback | None = None,
    ) -> RoundResult:
        round_id     = str(uuid.uuid4())
        f1_before    = _F1_STATE["current"]
        contributions = []
        start_time   = time.time()
        local_epochs = 3

        for client_id in _HOSPITALS:
            if on_progress:
                await on_progress(client_id, "local_training", 0)

            delay = 8.0 + _SAMPLES[client_id] / 80.0
            await asyncio.sleep(delay)

            if on_progress:
                await on_progress(client_id, "local_training", local_epochs)

            delta = random.uniform(0.005, 0.018)
            contributions.append({
                "hospital_id":         client_id,
                "local_epochs":        local_epochs,
                "samples_used":        _SAMPLES[client_id],
                "local_f1_before":     round(f1_before - random.uniform(0.01, 0.03), 4),
                "local_f1_after":      round(f1_before + delta, 4),
                "weight_delta_norm":   round(random.uniform(0.10, 0.18), 4),
                "privacy_budget_used": 0.1,
            })

        if on_progress:
            await on_progress(hospital_id, "aggregating", local_epochs)
        await asyncio.sleep(3)

        total = sum(_SAMPLES.values())
        wdelta = sum(
            c["weight_delta_norm"] * _SAMPLES[c["hospital_id"]] / total
            for c in contributions
        ) * 0.12
        f1_after = round(min(f1_before + wdelta, 0.75), 4)

        _F1_STATE["current"] = f1_after
        _F1_STATE["model_version"] += 1

        base = _F1_BASE.get(self.strategy, _F1_BASE["FEDPROX"])
        f1_per_class = {k: round(min(v + wdelta * 0.5, 0.95), 4) for k, v in base.items()}

        if on_progress:
            await on_progress(hospital_id, "complete", local_epochs)

        return RoundResult(
            round_id=round_id,
            round_number=_F1_STATE["model_version"] - 10,
            strategy=self.strategy,
            global_f1_before=round(f1_before, 4),
            global_f1_after=f1_after,
            f1_per_class_after=f1_per_class,
            duration_seconds=int(time.time() - start_time),
            model_version=_F1_STATE["model_version"],
            contributions=contributions,
        )

    async def get_current_metrics(self) -> dict:
        base = _F1_BASE.get(self.strategy, _F1_BASE["FEDPROX"])
        return {
            "model_version": _F1_STATE["model_version"],
            "f1_macro":      round(_F1_STATE["current"], 4),
            "f1_per_class":  base,
            "strategy":      self.strategy,
        }
