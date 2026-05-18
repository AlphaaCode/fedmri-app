from __future__ import annotations
import asyncio, os, time, uuid
from .base import FLEngine, RoundResult, ProgressCallback

_STATE = {"f1": 0.41, "model_version": 10}


class FlowerFLEngine(FLEngine):
    """
    Production engine. Wraps flwr.server.start_server().
    Hospital client processes must be running and reachable before calling start_round().

    Client-side: each hospital VM runs:
        python fl_client.py --hospital-id client_N --server-address <this_host>:9080

    fl_client.py reuses your existing model.py + data_loader.py + main.py.
    No changes to those files required.
    """
    def __init__(self):
        self.host     = os.getenv("FLOWER_SERVER_HOST", "0.0.0.0")
        self.port     = int(os.getenv("FLOWER_SERVER_PORT", "9080"))
        self.rounds   = int(os.getenv("FL_ROUNDS_PER_TRIGGER", "1"))
        self.strategy = os.getenv("FL_STRATEGY", "FEDPROX").upper()

    async def start_round(
        self,
        hospital_id: str,
        case_id: str,
        trigger: str,
        on_progress: ProgressCallback | None = None,
    ) -> RoundResult:
        import flwr as fl
        from flwr.server.strategy import FedAvg, FedProx

        round_id   = str(uuid.uuid4())
        f1_before  = _STATE["f1"]
        start_time = time.time()

        strategy = (FedProx if self.strategy == "FEDPROX" else FedAvg)(
            fraction_fit=1.0,
            fraction_evaluate=1.0,
            min_fit_clients=3,
            min_evaluate_clients=3,
            min_available_clients=3,
        )

        loop = asyncio.get_event_loop()
        history = await loop.run_in_executor(
            None,
            lambda: fl.server.start_server(
                server_address=f"{self.host}:{self.port}",
                config=fl.server.ServerConfig(num_rounds=self.rounds),
                strategy=strategy,
            ),
        )

        f1_after = self._extract_f1(history)
        _STATE["f1"] = f1_after
        _STATE["model_version"] += 1

        if on_progress:
            await on_progress(hospital_id, "complete", self.rounds)

        return RoundResult(
            round_id=round_id,
            round_number=_STATE["model_version"],
            strategy=self.strategy,
            global_f1_before=round(f1_before, 4),
            global_f1_after=round(f1_after, 4),
            f1_per_class_after=self._extract_per_class(history),
            duration_seconds=int(time.time() - start_time),
            model_version=_STATE["model_version"],
            contributions=[],
        )

    def _extract_f1(self, history) -> float:
        try:
            rounds = history.metrics_distributed.get("f1_macro", [])
            return rounds[-1][1] if rounds else _STATE["f1"]
        except Exception:
            return _STATE["f1"]

    def _extract_per_class(self, history) -> dict:
        result = {}
        for key in ["lumA", "lumB", "her2", "tn"]:
            rounds = history.metrics_distributed.get(f"f1_{key}", [])
            result[key] = round(rounds[-1][1], 4) if rounds else 0.0
        return result

    async def get_current_metrics(self) -> dict:
        return {"model_version": _STATE["model_version"], "f1_macro": round(_STATE["f1"], 4), "strategy": self.strategy}
