# FedMRI — Codex Instructions

## Project summary

Educational web app demonstrating federated learning for breast MRI molecular subtype
classification. Two portals with distinct identities:

- **Doctor portal** — generic hospital participant in the FL network. Data stays in the
  hospital silo. FL rounds fire automatically on every scan upload.
- **Patient portal** — independent FL consumer. No hospital affiliation. Benefits from
  the global model trained across 3 hospitals without being part of the training loop.

Source ML model: `../fl-model/` (read-only — do NOT modify those files).

## Monorepo layout

```
fedmri-app/
├── AGENTS.md              ← you are here
├── CONTEXT.md             ← domain language and invariants
├── apps/
│   ├── web/               ← Next.js 14 (App Router, Tailwind, shadcn/ui)
│   ├── backend/           ← NestJS (Prisma, JWT, Socket.io, RBAC)
│   ├── ml-service/        ← FastAPI (inference, attention maps, AL simulation)
│   └── fl-coordinator/    ← FastAPI (FL round lifecycle, mock ↔ Flower)
├── packages/
│   └── shared/            ← TypeScript types, API client, constants
├── docs/
│   ├── agents/            ← agent skill configuration
│   └── adr/               ← architecture decision records
├── tasks/                 ← Codex task prompts (one file per phase)
└── .scratch/              ← local issue tracker
```

## Key environment variables

| Variable | Values | Effect |
|---|---|---|
| `INFERENCE_MODE` | `mock` / `real` | Mock: draws from mock_results.json. Real: loads checkpoint. |
| `FL_MODE` | `mock` / `flower` | Mock: simulates rounds. Flower: real flwr server. |
| `STORAGE_MODE` | `local` / `minio` / `s3` | Where images are stored. |
| `ATTN_MODE` | `blob` / `mil` | Attention map source. |
| `AL_MODE` | `mock` / `real` | Active-learning fine-tune mode. |
| `FL_WEBHOOK_SECRET` | string | Shared secret between fl-coordinator and backend. |

All default to `mock`/`local` — the app runs fully offline with no GPU.

## Critical invariants — never break these

1. `PrivacyAuditLog.rawDataTransmitted` is **always 0**. This is the FL privacy claim
   made into a database column. No code path should ever set it to anything else.
2. `HospitalSiloGuard` must block every cross-hospital case read. A doctor at Hospital A
   must never see Hospital B's raw case data.
3. `CaseScope.HOSPITAL` cases are stored under `uploads/hospitals/{hospital_id}/`.
   `CaseScope.PATIENT` cases are stored under `uploads/patients/{patient_id}/`.
   These paths must never be mixed.
4. The FL round fires **after** the case response is returned to the client — never before.
   The doctor sees the prediction immediately; the FL round is async background work.
5. Patient-facing UI copy never uses the words "federated learning", "gradient",
   "weight delta", or any FL jargon. Use: "AI trained across 3 hospitals" instead.

## FL round auto-trigger flow

```
Doctor uploads scan
  → POST /cases (NestJS CasesController)
  → InferenceService.predict()          [FastAPI /predict — sync, 1.5–3s]
  → case saved to DB
  → response returned to doctor client  ← doctor sees result here
  → (async) FLRoundService.triggerRound()
      → POST /round/start (fl-coordinator)
      → coordinator runs mock/flower round (~30s)
      → POST /internal/fl/round-complete (webhook back to NestJS)
  → NestJS saves fl_round + contributions + privacy_audit_log
  → WS event 'fl:round:complete' broadcast to all connected doctors
  → doctor UI topology animation completes
```

## Mock results source

`apps/ml-service/mock_results.json` — 50 pre-computed inference records seeded from
real training runs. Distribution: ~65% Luminal A, ~18% Luminal B, ~6% HER2, ~11% TN.
Confidence ranges: 0.42–0.88. **Update F1 values in the seed file once final training
results are available.**

## Agent skills

### Issue tracker

Local markdown under `.scratch/` — no GitHub remote yet. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical labels using default names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at repo root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.
