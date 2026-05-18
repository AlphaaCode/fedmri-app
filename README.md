# FedMRI — Federated Learning for Breast Cancer MRI

Educational web application demonstrating federated learning (FL) across 3 hospitals for molecular subtype classification of breast cancer using dynamic contrast-enhanced MRI (DCE-MRI).

## Overview

**Doctor Portal**: Hospital staff upload MRI scans → AI model predicts molecular subtype → FL round fires automatically to improve global model across hospitals without sharing raw patient data.

**Patient Portal**: Independent consumers benefit from the global model trained across 3 hospitals without being part of the training network.

## Architecture

| Component | Tech | Purpose |
|-----------|------|---------|
| Frontend | Next.js 14 (App Router, Tailwind, shadcn/ui) | Doctor & Patient portals |
| Backend | NestJS + Prisma + PostgreSQL | API, auth, case/FL management |
| ML Service | FastAPI + PyTorch | Inference (DINOv2), attention maps |
| FL Coordinator | FastAPI | FL round orchestration (mock & Flower) |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Python 3.9+ (for FL services)

### Setup

```bash
# Install dependencies
npm install

# Configure environment
cp apps/fl-coordinator/.env.example apps/fl-coordinator/.env
# Edit .env as needed

# Initialize database
npm run db:push
npm run db:seed

# Start dev servers
npm run dev
```

The app runs in **fully offline mock mode** by default:
- Inference uses pre-computed results (no GPU needed)
- FL rounds simulate training without real Flower server
- Storage is local filesystem

## Key Files

- **CLAUDE.md** — Claude Code project instructions
- **CONTEXT.md** — Domain vocabulary and critical invariants
- **BACKEND_REVIEW.md** — Detailed architecture review
- **docs/adr/** — Architecture decision records
- **tasks/** — Implementation roadmap (7 phases)

## Environment Variables

| Variable | Default | Effect |
|----------|---------|--------|
| `INFERENCE_MODE` | `mock` | `mock`: pre-computed results; `real`: live DINOv2 |
| `FL_MODE` | `mock` | `mock`: simulated rounds; `flower`: real Flower server |
| `STORAGE_MODE` | `local` | Where to store MRI images: `local`, `minio`, `s3` |
| `FL_WEBHOOK_SECRET` | — | Shared secret between coordinator and backend |
| `DATABASE_URL` | — | PostgreSQL connection string |

## Critical Invariants

These are enforced by design and must never be violated:

1. **Privacy**: `PrivacyAuditLog.rawDataTransmitted` is always 0 — no raw data ever leaves a hospital
2. **Silo**: A doctor at Hospital A can never read Hospital B's raw case data (HospitalSiloGuard)
3. **Paths**: Hospital cases stored under `uploads/hospitals/{id}/`; patient cases under `uploads/patients/{id}/`
4. **Async FL**: FL round fires **after** doctor sees prediction (never blocking the response)
5. **Language**: Patient UI avoids "federated learning" jargon — say "AI trained across 3 hospitals"

## Monorepo Structure

```
fedmri-app/
├── CLAUDE.md, CONTEXT.md, BACKEND_REVIEW.md
├── docs/agents/     ← domain docs, issue tracker, triage labels
├── docs/adr/        ← architecture decision records
├── tasks/           ← phase-1 through phase-7
├── apps/
│   ├── backend/     ← NestJS + Prisma
│   ├── web/         ← Next.js (TBD)
│   ├── ml-service/  ← FastAPI inference (TBD)
│   └── fl-coordinator/ ← FastAPI FL round manager
├── packages/shared/ ← TypeScript shared types
└── .scratch/        ← Local issue tracker
```

## Development Status

| Phase | Status | Work |
|-------|--------|------|
| 1 | ✅ Done | Scaffold monorepo, Prisma schema, FL coordinator |
| 2 | 🚧 Next | Doctor case upload, inference integration, WebSocket |
| 3 | ⏳ Planned | Attention maps, FL topology visualization |
| 4 | ⏳ Planned | Chatbot integration for explainability |
| 5 | ⏳ Planned | Active learning feedback loop |
| 6 | ⏳ Planned | Patient portal polish, mobile-ready |
| 7 | ⏳ Planned | Mobile app (React Native) |

## Testing

```bash
# Run type checks
npm run build

# Run tests (TBD)
npm test

# Seed with mock data
npm run db:seed
```

## Deployment

See `BACKEND_REVIEW.md` for a complete pre-production checklist.

## References

- **Model**: DINOv2-S/14 + GatedAttentionMIL (from `../fl-model/`)
- **FL Framework**: Flower (flower.dev)
- **FL Strategy**: FedAvg & FedProx
- **Baseline**: Centralized model trained on combined hospital data

## License

Educational use only. See individual component licenses.
