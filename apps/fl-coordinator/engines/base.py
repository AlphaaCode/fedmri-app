from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Callable, Awaitable


@dataclass
class RoundResult:
    round_id: str
    round_number: int
    strategy: str
    global_f1_before: float
    global_f1_after: float
    f1_per_class_after: dict
    duration_seconds: int
    model_version: int
    contributions: list[dict] = field(default_factory=list)


ProgressCallback = Callable[[str, str, int], Awaitable[None]]


class FLEngine(ABC):
    @abstractmethod
    async def start_round(
        self,
        hospital_id: str,
        case_id: str,
        trigger: str,
        on_progress: ProgressCallback | None = None,
    ) -> RoundResult: ...

    @abstractmethod
    async def get_current_metrics(self) -> dict: ...
