# ADR-001: ML service is standalone FastAPI, not a NestJS module

**Status**: Accepted

ML inference code is pure Python/PyTorch. FastAPI app at `apps/ml-service/`.
NestJS calls via HTTP. Mock: mock_results.json. Real: loads checkpoint.
Switch: `INFERENCE_MODE=real` — zero NestJS changes.
