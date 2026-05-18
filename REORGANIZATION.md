# File Reorganization Plan

Your files are currently scattered at the root. Here's the target structure from CLAUDE.md and the migration commands.

## Target Structure

```
fedmri-app/
├── CLAUDE.md                    ← already here ✓
├── CONTEXT.md                   ← already here ✓
├── BACKEND_REVIEW.md            ← newly created ✓
├── README.md                    ← create this (project overview)
│
├── docs/
│   ├── agents/
│   │   ├── domain.md            ← move from root
│   │   ├── issue-tracker.md     ← move from root
│   │   └── triage-labels.md     ← move from root
│   └── adr/
│       ├── ADR-001-ml-service-fastapi.md           ← move from root
│       ├── ADR-002-fl-coordinator-standalone.md    ← move from root
│       └── ADR-003-interface-abstraction.md        ← move from root
│
├── tasks/
│   ├── phase-1-scaffold.md      ← move from root
│   ├── phase-2-inference.md     ← move from root
│   ├── phase-3-attention-fl-viz.md ← move from root
│   ├── phase-4-chatbot.md       ← move from root
│   ├── phase-5-feedback-al.md   ← move from root
│   ├── phase-6-patient-polish.md ← move from root
│   └── phase-7-mobile.md        ← move from root
│
├── apps/
│   ├── backend/                 ← NestJS, currently in root — move here
│   │   ├── src/
│   │   ├── prisma/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── ... (TBD)
│   │
│   ├── ml-service/              ← FastAPI (TBD)
│   │   ├── main.py
│   │   ├── mock_results.json
│   │   └── ... (TBD)
│   │
│   ├── fl-coordinator/          ← FastAPI, currently in root — move here
│   │   ├── main.py
│   │   ├── engines/
│   │   │   ├── base.py          ← move from root/backend/base.py
│   │   │   ├── mock.py          ← move from root/backend/mock.py
│   │   │   └── flower.py        ← move from root/backend/flower.py
│   │   ├── requirements.txt     ← create (fastapi, httpx, flwr)
│   │   └── .env.example         ← move from root/backend/.env.example
│   │
│   └── web/                     ← Next.js (TBD)
│
├── packages/
│   └── shared/                  ← TypeScript shared types
│       ├── src/
│       │   ├── types/
│       │   │   └── index.ts     ← move from root/backend/index.ts
│       │   └── api/
│       │       └── client.ts    ← TBD: API client
│       ├── package.json
│       └── tsconfig.json
│
└── .scratch/                    ← Local issue tracker (TBD)
    ├── issues.md
    └── ...
```

---

## Migration Steps

### 1. Create Directory Structure

```bash
cd D:\study\BioInfo\ M2\ \(2026\)\Memoir\fedmri-app

# Create all directories
mkdir -p docs/agents
mkdir -p docs/adr
mkdir -p tasks
mkdir -p apps/backend/src
mkdir -p apps/backend/prisma
mkdir -p apps/ml-service
mkdir -p apps/fl-coordinator/engines
mkdir -p packages/shared/src/types
mkdir -p packages/shared/src/api
mkdir -p .scratch
```

### 2. Move Documentation Files

```bash
# Move ADRs
mv ADR-001-ml-service-fastapi.md docs/adr/
mv ADR-002-fl-coordinator-standalone.md docs/adr/
mv ADR-003-interface-abstraction.md docs/adr/

# Move agent docs
mv domain.md docs/agents/
mv issue-tracker.md docs/agents/
mv triage-labels.md docs/agents/

# Move phase tasks
mv phase-1-scaffold.md tasks/
mv phase-2-inference.md tasks/
mv phase-3-attention-fl-viz.md tasks/
mv phase-4-chatbot.md tasks/
mv phase-5-feedback-al.md tasks/
mv phase-6-patient-polish.md tasks/
mv phase-7-mobile.md tasks/
```

### 3. Move Backend Files (Current)

The backend/ folder at root needs to be split into:
- **NestJS backend** → `apps/backend/`
- **FL Coordinator** (FastAPI) → `apps/fl-coordinator/`
- **Shared types** → `packages/shared/src/types/`

```bash
# Move Prisma schema and seed to backend
mv backend/schema.prisma apps/backend/prisma/
mv backend/seed.ts apps/backend/prisma/
mv backend/package.json apps/backend/
mv backend/turbo.json apps/backend/

# Move FL Coordinator Python files
mv backend/main.py apps/fl-coordinator/
mv backend/base.py apps/fl-coordinator/engines/
mv backend/mock.py apps/fl-coordinator/engines/
mv backend/flower.py apps/fl-coordinator/engines/
mv backend/.env.example apps/fl-coordinator/

# Move TypeScript shared types
mv backend/index.ts packages/shared/src/types/index.ts

# Clean up root backend folder
rm -rf backend
```

### 4. Update Import Paths

After moving files, update relative imports:

**In `apps/backend/prisma/seed.ts`:**
```typescript
// OLD: import { PrismaClient } from "@prisma/client";
// NEW: (same, no change)
```

**In `apps/fl-coordinator/engines/mock.py`:**
```python
# OLD: from .base import FLEngine, ...
# NEW: from .base import FLEngine, ...
# (same, no change — both in engines/ dir)
```

**In `packages/shared/src/types/index.ts`:**
```typescript
// (no imports to update — pure type exports)
```

### 5. Create Missing Files

**`apps/fl-coordinator/requirements.txt`:**
```
fastapi==0.104.1
httpx==0.25.0
python-dotenv==1.0.0
flwr==0.24.0  # only needed if FL_MODE=flower
pydantic==2.4.2
```

**`apps/fl-coordinator/__init__.py`:**
```python
# Empty init file for package structure
```

**`apps/fl-coordinator/engines/__init__.py`:**
```python
from .base import FLEngine, RoundResult, ProgressCallback
from .mock import MockFLEngine
from .flower import FlowerFLEngine

__all__ = ["FLEngine", "RoundResult", "ProgressCallback", "MockFLEngine", "FlowerFLEngine"]
```

**`packages/shared/package.json`:**
```json
{
  "name": "@fedmri/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

**`packages/shared/tsconfig.json`:**
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src"]
}
```

**`README.md` (at root):**
```markdown
# FedMRI — Federated Learning for Breast Cancer MRI

Educational web app demonstrating federated learning (FL) across 3 hospitals for breast cancer molecular subtype classification.

## Quick Start

```bash
# Install dependencies
npm install

# Set up database
npm run db:push
npm run db:seed

# Start dev servers
npm run dev
```

## Architecture

- **Frontend**: Next.js 14 (Doctor & Patient portals)
- **Backend**: NestJS + Prisma + PostgreSQL
- **ML Service**: FastAPI (DINOv2 inference)
- **FL Coordinator**: FastAPI (mock & Flower FL)

## Key Files

- `CLAUDE.md` — Claude Code instructions
- `CONTEXT.md` — Domain vocabulary & invariants
- `BACKEND_REVIEW.md` — Architecture review
- `docs/adr/` — Architecture decision records
- `tasks/` — Phase-by-phase implementation tasks

## Development

See `CLAUDE.md` for project conventions, environment variables, and critical invariants to maintain.
```

### 6. Verify Structure

After migration, run:
```bash
tree /a /f  # Windows version of tree
# or manually verify:
dir docs\agents
dir docs\adr
dir tasks
dir apps\backend
dir apps\fl-coordinator
dir apps\ml-service
dir packages\shared
```

---

## Files Status

| File | Current | Target | Status |
|------|---------|--------|--------|
| CLAUDE.md | root | root | ✓ keep |
| CONTEXT.md | root | root | ✓ keep |
| BACKEND_REVIEW.md | — | root | ✓ created |
| README.md | — | root | → create |
| ADR-001.md | root | docs/adr/ | → move |
| ADR-002.md | root | docs/adr/ | → move |
| ADR-003.md | root | docs/adr/ | → move |
| domain.md | root | docs/agents/ | → move |
| issue-tracker.md | root | docs/agents/ | → move |
| triage-labels.md | root | docs/agents/ | → move |
| phase-*.md | root | tasks/ | → move (7 files) |
| backend/schema.prisma | root/backend/ | apps/backend/prisma/ | → move |
| backend/seed.ts | root/backend/ | apps/backend/prisma/ | → move |
| backend/package.json | root/backend/ | apps/backend/ | → move |
| backend/index.ts | root/backend/ | packages/shared/src/types/ | → move |
| backend/main.py | root/backend/ | apps/fl-coordinator/ | → move |
| backend/base.py | root/backend/ | apps/fl-coordinator/engines/ | → move |
| backend/mock.py | root/backend/ | apps/fl-coordinator/engines/ | → move |
| backend/flower.py | root/backend/ | apps/fl-coordinator/engines/ | → move |
| backend/.env.example | root/backend/ | apps/fl-coordinator/ | → move |

---

## Next Steps

1. **Run reorganization** (Bash or PowerShell)
2. **Update root package.json** to reference new paths in apps/
3. **Verify imports** in all moved files
4. **Create missing __init__.py files** for Python packages
5. **Test structure** by running `npm install` and `turbo run build`
