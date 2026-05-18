# ADR-002: FL Coordinator is standalone Python service

**Status**: Accepted

Flower is Python-only and blocking. Lives at `apps/fl-coordinator/`.
NestJS calls `POST /round/start`, receives webhook at `POST /internal/fl/round-complete`.
Switch: `FL_MODE=flower` — zero NestJS changes.
