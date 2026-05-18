# FedMRI Project Structure

```
fedmri-app/
│
├─ Root Configuration & Docs
│  ├── CLAUDE.md                   ← Claude Code project instructions
│  ├── CONTEXT.md                  ← Domain vocabulary & invariants
│  ├── README.md                   ← Project overview & quick start
│  ├── BACKEND_REVIEW.md           ← Architecture audit (Phase 1 complete)
│  ├── CHANGES.md                  ← This reorganization + fixes (May 19)
│  ├── REORGANIZATION.md           ← Migration guide (reference)
│  ├── STRUCTURE.md                ← This file
│  ├── package.json                ← Monorepo root (turbo)
│  ├── tsconfig.json               ← Base TypeScript config
│  └── .claude/settings.local.json ← Claude Code settings
│
├─ 📚 Documentation
│  ├── docs/agents/
│  │  ├── domain.md                ← Agent skill: domain docs
│  │  ├── issue-tracker.md         ← Agent skill: local issue tracker
│  │  └── triage-labels.md         ← Agent skill: issue triage labels
│  │
│  └── docs/adr/                   ← Architecture Decision Records
│     ├── ADR-001-ml-service-fastapi.md
│     ├── ADR-002-fl-coordinator-standalone.md
│     └── ADR-003-interface-abstraction.md
│
├─ 🎯 Implementation Tasks (Phases)
│  └── tasks/
│     ├── phase-1-scaffold.md      ← Done: DB schema, FL coordinator scaffold
│     ├── phase-2-inference.md     ← Next: Doctor upload, prediction, WebSocket
│     ├── phase-3-attention-fl-viz.md
│     ├── phase-4-chatbot.md
│     ├── phase-5-feedback-al.md
│     ├── phase-6-patient-polish.md
│     └── phase-7-mobile.md
│
├─ 🏗️ Applications (Monorepo)
│  └── apps/
│     ├── backend/ (NestJS + Prisma)
│     │  ├── src/                  ← TBD: controllers, services, guards
│     │  ├── prisma/
│     │  │  ├── schema.prisma      ← Database schema (Phase 1 ✓)
│     │  │  └── seed.ts            ← Seed data with 3 hospitals, 10 FL rounds (Phase 1 ✓)
│     │  ├── package.json
│     │  ├── turbo.json
│     │  ├── .env.example
│     │  └── tsconfig.json
│     │
│     ├── fl-coordinator/ (FastAPI, Python)
│     │  ├── main.py               ← FL orchestration server (FIXED: Phase 1+ ✓)
│     │  │  - Logging throughout
│     │  │  - Input validation (Pydantic Field)
│     │  │  - Rate limiting (slowapi, 5/min)
│     │  │  - Retry logic with exponential backoff
│     │  │  - Health check & startup events
│     │  │
│     │  ├── engines/
│     │  │  ├── __init__.py        ← Package init (new)
│     │  │  ├── base.py            ← FLEngine abstract class (Phase 1 ✓)
│     │  │  ├── mock.py            ← Mock FL simulator (Phase 1 ✓)
│     │  │  └── flower.py          ← Real Flower integration (Phase 1 ✓)
│     │  │
│     │  ├── requirements.txt       ← Python dependencies (with slowapi)
│     │  ├── .env.example
│     │  ├── docker-compose.yml    ← Dev environment
│     │  └── Dockerfile            ← TBD
│     │
│     ├── ml-service/ (FastAPI, Python — TBD)
│     │  ├── main.py
│     │  ├── models/               ← DINOv2 + R3D18 implementations
│     │  ├── inference.py          ← Prediction logic
│     │  ├── attention.py          ← Attention map generation
│     │  ├── mock_results.json     ← Pre-computed results (50 samples)
│     │  ├── requirements.txt
│     │  └── Dockerfile
│     │
│     └── web/ (Next.js 14 — TBD)
│        ├── app/
│        │  ├── (doctor)/          ← Doctor portal
│        │  ├── (patient)/         ← Patient portal
│        │  └── api/               ← API routes (if any)
│        ├── components/
│        ├── lib/
│        ├── styles/
│        ├── package.json
│        ├── tsconfig.json
│        ├── next.config.js
│        └── tailwind.config.js
│
├─ 📦 Shared Code (Monorepo)
│  └── packages/shared/
│     ├── src/
│     │  ├── types/
│     │  │  └── index.ts           ← Shared TypeScript types (Phase 1 ✓)
│     │  │     - UserRole, Subtype, SUBTYPES
│     │  │     - AuthUser, PredictionResult, CaseSummary
│     │  │     - FlRoundSummary, PrivacyAuditEntry
│     │  │     - WebSocket payload types
│     │  │
│     │  └── api/
│     │     └── client.ts          ← API client (TBD)
│     │
│     ├── package.json             ← @fedmri/shared package
│     └── tsconfig.json
│
├─ 🔧 Local Tools
│  └── .scratch/                   ← Local issue tracker (not in git)
│     ├── issues.md
│     └── ...
│
└─ Git & CI/CD
   ├── .gitignore
   ├── .github/workflows/          ← TBD: CI/CD pipelines
   └── .dockerignore
```

---

## Key File Purposes

### Core Domain
| File | Purpose | Status |
|------|---------|--------|
| `CONTEXT.md` | Domain vocabulary, molecular subtypes, model architecture | ✓ Phase 1 |
| `CLAUDE.md` | Project instructions for Claude Code | ✓ Phase 1 |
| `docs/adr/*` | Architecture decisions (why FastAPI, why separate coordinator, why abstractions) | ✓ Phase 1 |

### Database
| File | Purpose | Status |
|------|---------|--------|
| `apps/backend/prisma/schema.prisma` | Hospital, User, Case, FlRound, FlContribution, PrivacyAuditLog, Feedback, ChatMessage, ModelMetrics | ✓ Phase 1 |
| `apps/backend/prisma/seed.ts` | 3 hospitals, 9 users, 10 FL rounds with realistic F1 trajectories | ✓ Phase 1 |

### FL Coordinator
| File | Purpose | Status |
|------|---------|--------|
| `apps/fl-coordinator/main.py` | HTTP server: `/round/start`, `/round/{rid}/status`, `/metrics`, `/health` | ✅ Phase 1 (FIXED) |
| `apps/fl-coordinator/engines/base.py` | `FLEngine` abstract class with `start_round()` and `get_current_metrics()` | ✓ Phase 1 |
| `apps/fl-coordinator/engines/mock.py` | MockFLEngine: simulates 3 hospitals, realistic delays, F1 improvement | ✓ Phase 1 |
| `apps/fl-coordinator/engines/flower.py` | FlowerFLEngine: real Flower server integration | ✓ Phase 1 |

### Shared Types
| File | Purpose | Status |
|------|---------|--------|
| `packages/shared/src/types/index.ts` | TypeScript interfaces for auth, predictions, FL rounds, WebSocket payloads | ✓ Phase 1 |

### Phase 2+ (Upcoming)
| File | Purpose | Status |
|------|---------|--------|
| `apps/backend/src/controllers/cases.controller.ts` | POST /cases, GET /cases | ⏳ Phase 2 |
| `apps/backend/src/services/inference.service.ts` | Calls FastAPI `/predict`, returns result | ⏳ Phase 2 |
| `apps/backend/src/guards/hospital-silo.guard.ts` | Blocks cross-hospital case reads | ⏳ Phase 2 |
| `apps/ml-service/main.py` | FastAPI `/predict` for DINOv2 inference | ⏳ Phase 2 |
| `apps/web/app/(doctor)/upload.tsx` | Doctor case upload UI | ⏳ Phase 2 |
| `packages/shared/src/api/client.ts` | TypeScript HTTP client (fetch wrapper) | ⏳ Phase 2 |

---

## Environment Variables

### Backend
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/fedmri
```

### FL Coordinator
```bash
FL_MODE=mock                          # mock or flower
FL_STRATEGY=FEDPROX                   # FEDAVG or FEDPROX
BACKEND_URL=http://localhost:3001     # webhook target
FL_WEBHOOK_SECRET=your-shared-secret  # shared secret
WEBHOOK_MAX_RETRIES=3
```

### ML Service (Phase 2)
```bash
INFERENCE_MODE=mock                   # mock or real
ATTN_MODE=blob                        # blob or mil
AL_MODE=mock                          # mock or real
```

### Storage (Phase 2)
```bash
STORAGE_MODE=local                    # local, minio, or s3
```

---

## Monorepo Commands

```bash
# Install all dependencies
npm install

# Build all apps
npm run build

# Run dev servers
npm run dev

# Database
npm run db:push                        # Prisma schema to DB
npm run db:seed                        # Seed 3 hospitals + 10 FL rounds
npm run db:studio                      # Prisma Studio UI
```

---

## Current Status

✅ **Phase 1 Complete:**
- Database schema (Prisma)
- Seed data (3 hospitals, realistic history)
- FL Coordinator (mock & Flower modes)
- Shared TypeScript types
- Input validation & rate limiting
- Comprehensive logging

🚧 **Phase 2 Next:**
- NestJS backend controllers
- FastAPI inference service
- WebSocket real-time updates
- HospitalSiloGuard
- Doctor upload UI

⏳ **Future:**
- Patient portal
- Active learning
- Chatbot
- Mobile app
