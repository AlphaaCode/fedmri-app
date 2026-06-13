# FedMRI — Engineering Guide

> The single document an AI engineer or software engineer should read **before**
> touching this codebase. It explains how the whole system fits together, how to
> run it, the contracts between services, the invariants you must not break, and
> the long list of small details that will bite you if you don't know them.
>
> Companion docs: [`CLAUDE.md`](../CLAUDE.md) (agent rules + invariants),
> [`CONTEXT.md`](../CONTEXT.md) (domain language). This guide is the practical,
> build-it-yourself manual.

---

## 1. What FedMRI is

An educational web app that demonstrates **federated learning (FL)** for breast-MRI
molecular-subtype classification. The model is trained "across 3 hospitals" without
raw patient data ever leaving a hospital — only model weights move. The app has
three portals, each telling the same story from a different angle:

| Portal | Who | What they see |
|---|---|---|
| **Doctor** | Hospital clinician (belongs to one hospital) | Upload a scan → get a prediction → an FL round fires automatically and animates the network topology. Data stays in the hospital silo. |
| **Patient** | Independent consumer (no hospital) | Self sign-up, upload their own scan, plain-language results. Benefits from the global model but is **not** part of training. |
| **Researcher** | Network operator | Live federated experiments (FedAvg vs FedSCRT), training log, model versions, topology, privacy audit. |

The classification task is **binary**: `Luminal` vs `Non-Luminal`. The deployed model
is **FedSCRT** (ConvNeXt-Nano backbone + Gated-Attention MIL), macro-F1 ≈ 0.662,
accuracy ≈ 0.70.

> **Patient-copy rule (invariant #5):** patient-facing text never says "federated
> learning", "gradient", "weight delta", etc. Say *"AI trained across 3 hospitals"*.

---

## 2. Repository layout

```
fedmri-app/
├── apps/
│   ├── web/             Next.js 16 (App Router) — all three portal UIs
│   ├── backend/         NestJS — REST + WebSocket, Prisma/Postgres, JWT, RBAC
│   ├── ml-service/      FastAPI — inference, attention maps, active-learning sim
│   └── fl-coordinator/  FastAPI — FL round lifecycle + live FL-test (numpy/sklearn)
├── packages/shared/     TypeScript types/constants shared across web+backend
├── model-core/          Model SOURCE (model.py, image_process.py)   ← mounted to ml-service
├── model_core/          Model CHECKPOINT (fedscrt_final.pt)         ← note the underscore!
├── docs/                ADRs, agent skills, and THIS guide
├── docker-compose.yml   Infra + ml-service + fl-coordinator (backend is opt-in)
└── .env                 Root env — the backend and the Dockerized services read this
```

> ⚠️ **`model-core/` (hyphen) vs `model_core/` (underscore) are different directories.**
> Hyphen = source code, underscore = the `.pt` checkpoint. The ml-service container
> mounts hyphen → `/model-v2` and underscore → `/model-ckpt`. Don't conflate them.

---

## 3. Services, ports, and the runtime topology

### 3.1 Ports

| Service | Port | Stack | Notes |
|---|---|---|---|
| web | 3000 | Next.js 16 | `next dev` |
| backend | 3001 | NestJS | REST + Socket.IO on the same port |
| ml-service | 8001 | FastAPI | inference / attention / verify / feedback |
| fl-coordinator | 8002 | FastAPI | FL rounds + FL-test |
| postgres | 5432 | Postgres 16 | user `fedmri` / db `fedmri` |
| redis | 6379 | Redis 7 | refresh-token store |
| ollama | 11434 | Ollama | LLM for the in-app assistant (`llama3.2:3b`) |

### 3.2 The topology we actually run: **HYBRID**

This is the most important operational fact in the whole repo. We do **not** run
everything in Docker. We run:

- **In Docker** (`docker compose up`): `postgres`, `redis`, `ollama`, `ml-service`,
  `fl-coordinator`.
- **On the host** (locally): `backend` (`npm run start:dev`) and `web` (`npm run dev`).

```
            ┌─────────────────────── HOST (your machine) ───────────────────────┐
            │   web (Next.js :3000)        backend (NestJS :3001)                │
            │        │  fetch                     │  ▲                            │
            └────────┼────────────────────────────┼──┼────────────────────────────┘
                     │                             │  │ webhook (host.docker.internal:3001)
        localhost:*  │             localhost:8001  │  │
            ┌────────▼─────────────────────────────▼──┴────── Docker network ─────┐
            │  postgres:5432   redis:6379   ollama:11434                          │
            │  ml-service:8001        fl-coordinator:8002 ──────────────┘         │
            └────────────────────────────────────────────────────────────────────┘
```

Why hybrid: the backend and web iterate fastest with native hot-reload, while the
Python/ML/infra pieces are stable and happiest pinned in containers.

**The networking consequence you must understand:**

- The **host backend** reaches the containers via published ports on `localhost`
  (`localhost:5432`, `:6379`, `:8001`, `:8002`, `:11434`). That's why the root `.env`
  uses `localhost` everywhere.
- The **fl-coordinator container** must reach the **host backend** to deliver round
  results. From inside a container, `localhost` is the container itself — so it uses
  **`host.docker.internal:3001`** (set in `docker-compose.yml`). On Linux this needs
  `extra_hosts: host.docker.internal:host-gateway` (already added); Docker Desktop on
  Windows/Mac provides it automatically.

> Because the root `.env` is host-centric (`localhost`), the Docker **`backend`**
> service can't actually work in this topology (its `localhost:5432` would point at
> itself, not Postgres) **and** it would fight your local backend for port 3001. So
> it's gated behind a Compose profile: `docker compose up` skips it. To run the full
> stack in Docker instead, use `docker compose --profile full up`.

---

## 4. First-time setup & daily run

### 4.1 One-time

```powershell
# 1. Install JS deps (root workspace covers apps/web + apps/backend + packages)
npm install

# 2. Bring up infra (and ml-service + fl-coordinator)
docker compose up -d            # postgres, redis, ollama, ml-service, fl-coordinator

# 3. Create the schema and seed demo data (hospitals, users, FL history)
#    Run these from the repo ROOT — the scripts `cd apps/backend` themselves.
#    (From apps/backend, call Prisma directly: `npx prisma db push` / `db seed`.)
npm run db:push                 # → cd apps/backend && npx prisma db push
npm run db:seed                 # → cd apps/backend && npx prisma db seed

# 4. Pull the Ollama model once (for the assistant)
docker exec -it fedmri-ollama ollama pull llama3.2:3b
```

### 4.2 Every day

```powershell
docker compose up -d                      # infra + ml + fl-coordinator
cd apps/backend; npm run start:dev        # backend on :3001 (host)
cd apps/web;     npm run dev              # web on :3000 (host)
```

Open http://localhost:3000.

### 4.3 Verify each service is alive

```powershell
curl http://localhost:3001/health         # backend
curl http://localhost:8001/health         # ml-service  -> {"status":"ok"}
curl http://localhost:8002/health         # fl-coordinator -> {"status":"ok","mode":"mock",...}
docker exec fedmri-ollama ollama list      # ollama models
```

---

## 5. Environment variables — and **which file each process reads**

This trips up everyone. There are several `.env` files and they are **not** all read
by the same process:

| Process | File it reads | How |
|---|---|---|
| **backend** (NestJS app) | repo-root **`.env`** | `ConfigModule.forRoot({ envFilePath: '../../.env' })` — relative to `apps/backend` cwd. |
| **Prisma CLI** (`db:push`/`db:seed`/`studio`) | **`apps/backend/.env`** | Prisma's default `.env` lookup. |
| **ml-service** | root `.env`, then `apps/ml-service/.env` (override) | `load_dotenv()` walks up + local override. |
| **fl-coordinator** | container env (compose `env_file: .env` + `environment:`) | `load_dotenv()` finds no file in-container; real env vars win. |
| **web** (Next.js) | **`apps/web/.env.local`** | Next reads env from the app dir, **not** the repo root. |

**Keep these consistent across files** or things silently break:

- `FL_WEBHOOK_SECRET` — must be identical for the backend (root `.env`) and the
  coordinator (compose pulls root `.env`). Mismatch ⇒ every round-complete webhook is
  rejected with `400 Invalid FL webhook secret` and FL appears dead.
- `DATABASE_URL` — must match between root `.env` (app) and `apps/backend/.env` (Prisma)
  or you'll migrate one DB and run against another.
- `JWT_ACCESS_SECRET` — used to sign **and** verify, and also to authenticate the
  WebSocket handshake. Changing it invalidates all live tokens.

### Mode switches (all default to the cheap/offline path)

| Var | Values | Effect |
|---|---|---|
| `INFERENCE_MODE` | `mock` / `real` | `real` loads the FedSCRT checkpoint and predicts from voxels. `mock` seeds from `mock_results.json`. |
| `FL_MODE` | `mock` / `flower` | `mock` simulates ~33 s rounds. `flower` would use a real flwr server. |
| `STORAGE_MODE` | `local` / `minio` / `s3` | where uploaded scans go. |
| `ATTN_MODE` | `blob` / `mil` | attention-map source. |
| `AL_MODE` | `mock` / `real` | active-learning. `mock` (default, on) shifts a persisted per-subtype confidence bias from doctor feedback that `/predict` applies — the same scan's confidence moves over time. `real` would run an actual fine-tune (501 until a checkpoint path is wired). |

> The repo currently runs `INFERENCE_MODE=real` (real FedSCRT predictions + real MRI
> attention) and `FL_MODE=mock` (simulated rounds). Both the root `.env` and the
> ml-service container set `INFERENCE_MODE=real`.

---

## 6. Backend (NestJS) — module by module

Bootstrap: `apps/backend/src/main.ts` — global `ValidationPipe`
(`whitelist + forbidNonWhitelisted + transform`) and CORS allowing `http://localhost:3000`
+ Expo origins. Listens on `PORT` (default 3001).

### 6.1 Auth (`auth/`)

- `POST /auth/register` → `AuthService.register`. Validates `RegisterDto`
  (`email`, `password` min **8**, `name`, `role ∈ {DOCTOR,PATIENT,ADMIN,RESEARCHER}`,
  `hospitalId` required only for `DOCTOR`). Hashes with bcrypt, creates the user,
  returns `{ accessToken, refreshToken, user }`.
- `POST /auth/login` → verify bcrypt, issue tokens.
- `POST /auth/refresh` → checks the refresh token against Redis (`refresh:{userId}`),
  re-issues.
- `POST /auth/logout` → deletes the Redis key (JWT-guarded).
- **Tokens:** access (`JWT_ACCESS_SECRET`, ~8 h) + refresh (`JWT_REFRESH_SECRET`, 7 d).
  Refresh tokens live in Redis. Payload = `{ sub, email, role, hospitalId? }`.
- **`JwtStrategy.validate`** re-loads the user from the DB on every request, so a
  deleted user is rejected even with a valid token. The request `user` object is
  `{ id, email, name, role, hospitalId }`.

### 6.2 RBAC & silo (`common/`)

- `RolesGuard` + `@Roles('DOCTOR', …)` decorator — coarse role gate per controller.
- `HospitalSiloGuard` — enforces **invariant #2**: a `DOCTOR` may only touch cases whose
  `hospitalId` matches their own; a `PATIENT` only their own `userId`; `ADMIN` bypasses.
- `@CurrentUser()` — pulls the validated user off the request.

### 6.3 Cases (`cases/`) — the heart of the app

Controller is `@Roles('DOCTOR','PATIENT')`. Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/cases` | Upload a scan (multipart `file`) → predict → save → (doctor) fire FL. |
| `POST` | `/cases/verify` | Pre-flight: "does this look like an MRI?" (in-memory, no save). |
| `GET` | `/cases` | List the caller's cases (hospital- or user-scoped). |
| `GET` | `/cases/samples` | List bundled sample volumes (`SAMPLES_DIR`). |
| `POST` | `/cases/from-sample` | Run a bundled sample through the same real pipeline. |
| `GET` | `/cases/:id` | One case (silo-checked). |
| `GET` | `/cases/:id/attention` | 224×224 attention heatmap (+ real slice PNG in real mode). |
| `GET` | `/cases/:id/pdf` | PDF report (pdfkit) — redesigned patient summary (hero result, probability bars, next steps, privacy box). |
| `POST` | `/cases/:id/feedback` | Doctor VALIDATE/DISPUTE → active-learning update. |
| `PATCH` | `/cases/:id` | Update editable fields: `clinicalNote` (persisted doctor note) + subject attribution (`subjectType` `PATIENT`/`TEST`, `subjectLabel`). Silo-checked; never touches prediction/privacy fields. |

> **Subject attribution.** On upload a doctor tags the scan as a `PATIENT` study (with
> a name/ID label) or a `TEST` run; patient self-uploads are always `PATIENT`. These
> three columns (`subjectType`, `subjectLabel`, `clinicalNote`) are sent as multipart
> form fields on `POST /cases` / `POST /cases/from-sample` and power the doctor Medical
> History (patient-vs-test separation, scan re-view, persisted notes).

**The upload → inference → FL flow** (`CasesService.create`):

```
1. multer writes the file (see multer.config) — DOCTOR scope vs PATIENT scope.
2. await InferenceService.predict(path)   → POST ml-service /predict (sync, 1.5–3 s)
3. prisma.case.create(...)                 → persist prediction
4. return the case to the client           ← the user sees their result HERE
5. if (DOCTOR && hospitalId)
      flService.triggerRound(hospitalId, caseId)   ← fire-and-forget, AFTER the return
```

> **Invariant #4:** the FL round is triggered *after* the response is built, never
> before. `triggerRound` is fully fire-and-forget (`Promise.resolve().then(...)`,
> never awaited, never throws) so a coordinator outage can't break or slow an upload.
> Patients never trigger FL.

### 6.4 FL (`fl/`)

- **`FlService.triggerRound`** → `POST {FL_COORDINATOR_URL}/round/start` with the
  hospital's **`flClientId`** (not the internal id).
- **Webhooks in** — `FlController` (`/internal/fl/*`), secured by the `x-fl-secret`
  header (not JWT, because it's server-to-server):
  - `/internal/fl/progress` → relayed to the `doctors` WS room.
  - `/internal/fl/round-complete` → writes `FlRound` + `FlContribution` rows +
    `PrivacyAuditLog` rows, links the triggering case, emits `fl:round:complete`.
  - `/internal/fl/test-progress` → relayed to the `researchers` WS room.
- **Read APIs** — `FlPublicController` (`/fl/*`, JWT): `rounds`, `rounds/:id`,
  `hospital/contribution` (doctors), `privacy-log` (doctors).

> **Invariant #1:** every `PrivacyAuditLog.rawDataTransmitted` is written as `0`,
> hard-coded. It's the privacy claim expressed as a column. Never set it to anything else.

### 6.5 Researcher (`researcher/`)

`@Roles('RESEARCHER')`. Dashboards (`overview`, `training-log`, `model-versions`,
`topology`, `datasets`, `system-logs`), two **live data endpoints** —
`GET /researcher/node-audit/:flClientId` (privacy/integrity audit for one node,
computed from real `FlContribution` + `PrivacyAuditLog` rows; powers the topology
"Request Audit" modal) and `GET /researcher/insights` (recent real events — patient
signups, scans analysed, model updates — for the Datasets feed) — plus the **live
FL-test trigger**:
`POST /researcher/fl-test {strategy, rounds, alpha}` → `ResearcherService.runFlTest`
looks up the recorded experiment for `(strategy, α)` and calls
`FlService.streamFlTest`, which **replays the real recorded per-round convergence**
over WS (`fl:test:progress` → `fl:test:complete`, ~0.9 s/round). `fl-experiments`
serves those same real convergence curves from `src/fl/experiments/fl_*.json`.

> **Why replay instead of recompute:** the coordinator's numpy sim trains a head on
> *frozen* features, where FedAvg and FedSCRT are the same algorithm — it can't
> reproduce the real gap (α=0.5: FedAvg ≈ 0.52 vs FedSCRT ≈ 0.66 macro-F1). The live
> test now streams the genuine recorded curve per strategy/α, so it is distinct and
> matches the static chart. See §16.9. (The coordinator's `/fl-test/run` numpy path
> still exists but is no longer used by the app — see §8.)

### 6.6 Other modules

- `inference/` — thin HTTP client to ml-service (`/predict`, `/attention`, `/verify`).
  Streams the file as multipart; surfaces additive real-mode fields (`f1`, `auc`,
  `hormone_therapy`) transiently without persisting them.
- `chat/` — Socket.IO gateway on the `/chat` namespace; provider-pluggable
  (`ollama` default, `deepseek`, `anthropic`). Project-aware assistant.
- `model/`, `users/`, `health/` — model metadata, user CRUD, liveness.

---

## 7. ml-service (FastAPI, port 8001)

Entry: `apps/ml-service/main.py` (has a `__main__`/`uvicorn.run`, so `python main.py`
works; the container CMD also runs it).

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{status: ok}` |
| `GET /metrics` | model version + F1/accuracy (real: from checkpoint meta). |
| `GET /model-info` | static identity: FedSCRT, ConvNeXt-Nano + GatedAttentionMIL, binary. |
| `POST /predict` | the prediction. **real**: writes upload to a temp file, runs `real_inference.predict_path`. **mock**: deterministic pick from `mock_results.json` by filename hash + a 1.5–3 s sleep (never reads bytes). |
| `GET /attention/{case_id}?path=` | 224×224 heatmap = 50 176 floats in [0,1]. **real**: top-attended slice PNG + within-slice map for the volume at `path`, **falling back to a synthetic Gaussian-blob map** if the volume is missing/unreadable. **blob**: deterministic blobs from `case_id`. |
| `POST /verify` | "is this a grayscale medical scan?" — real volume formats auto-pass; otherwise a PIL heuristic (grayscale variance, intensity, texture). |
| `POST /feedback` | active-learning update: bumps model version + per-class F1 **and** shifts a persisted per-subtype **confidence bias** (`conf_bias`) so future predictions actually move. `/predict` applies that bias (`_apply_al_bias`), so re-running the **same scan** after an approval returns higher confidence (correction shifts it toward the corrected subtype). State persists to `AL_STATE_PATH` (mounted `/al-state` volume) → survives restarts. |

Real-mode env (set on the container in `docker-compose.yml`):
`MODEL_V2_PATH=/model-v2`, `FEDSCRT_CKPT=/model-ckpt/fedscrt_final.pt`, plus
`HOST_WORKSPACE_ROOT`/`CONTAINER_WORKSPACE_ROOT` so the container can translate the
Windows upload path the **host** backend wrote (`apps/backend/uploads-tmp/<id>.mha`)
into a container path for real attention.

> The `../fl-model/` and `model-core/` model sources are **read-only** — do not modify
> model code from this app.

---

## 8. fl-coordinator (FastAPI, port 8002)

Entry: `apps/fl-coordinator/main.py`. **Gotcha: this file has NO `__main__`/`uvicorn.run`
block** — `python main.py` defines the app and exits without serving. It must be started
via the CLI: `uvicorn main:app --host 0.0.0.0 --port 8002` (which is exactly the Docker
`CMD`).

| Endpoint | Purpose |
|---|---|
| `POST /round/start` | starts an async mock/flower round; returns `round_id` immediately. |
| `GET /round/{rid}/status` | in-memory round status. |
| `POST /fl-test/run` | runs `realfl.run_fl` over the per-hospital feature caches and streams per-round metrics. **Legacy:** the researcher live test no longer calls this — it replays recorded curves from the backend (§6.5, §16.9). The endpoint and `regen_experiments.py` still use `realfl` to (re)generate the `fl_*.json` experiment files offline. |
| `GET /metrics`, `GET /health` | engine metrics / liveness. |

**Engines** (`engines/`): `mock` (default — no torch needed) simulates 3 clients
(`client_0/1/2`) with realistic per-client delays (≈ 33 s total). `flower` is only
imported when `FL_MODE=flower`.

**FL-test** uses `realfl.py` + the feature caches in `fl_cache/` (`client_0/1/2.npz`,
`val.npz`) with **numpy + scikit-learn** — it does **not** need torch or flwr. That's
why the Dockerfile installs the core deps and treats `flwr` as best-effort.

**Webhooks out** (with `x-fl-secret`, 3× retry + exponential backoff) to
`BACKEND_URL`: `/internal/fl/progress`, `/round-complete`, `/test-progress`. In hybrid
mode `BACKEND_URL=http://host.docker.internal:3001`.

---

## 9. web (Next.js 16, App Router, port 3000)

- **API client:** `lib/api.ts` exports `apiFetch`, `apiLogin`, `apiRegister`, and the
  case helpers. Base URL = `process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"`.
  **Always call the backend through these helpers** so the fallback applies — see the
  gotcha in §12.
- **Auth store:** `lib/auth-store.ts` (zustand) persists `token`/`user` to
  `localStorage`. `apiFetch` attaches `Authorization: Bearer`; a `401` clears auth and
  bounces to `/login`.
- **WebSockets:** `lib/chat-socket.ts` (chat) and the FL store consume Socket.IO via
  `API_URL`. The FL store (`lib/fl-store.ts`) drives the doctor topology animation from
  `fl:round:*` events.
- **Routes:** `/login`, `/patient/register` (public self sign-up), and the three portal
  trees `/doctor/*`, `/patient/*`, `/researcher/*`. The patient layout treats
  `/patient/register` as public (not wrapped in the authenticated shell).
- **`apps/web/AGENTS.md` says this is "not the Next.js you know"** — Next 16 has moved
  things. Read `node_modules/next/dist/docs/` before writing non-trivial Next code.
- **Theming:** all colors come from CSS custom properties in `app/globals.css`. Dark is
  the `:root` default; `:root[data-theme="light"]` overrides them. The light palette was
  recalibrated (2026-06-13) to a clearly grey page with near-solid white cards for
  readability — when adding surfaces, use the `--bg-card`/`--bg-card2`/`--text-*` tokens
  (never hard-code hex) so both themes stay correct.
- **Attention heatmap** (`components/AttentionOverlay.tsx`) is the single shared scan
  viewer used by the doctor scan, doctor history (re-view), patient scan and patient
  results screens. It supports **zoom + pan** (toolbar buttons, mouse-wheel, and
  double-click-to-zoom-at-point; drag to pan when zoomed) so a clinician can inspect the
  tumour focus area — the slice image and heatmap share one transform so they stay
  aligned. Its opacity control uses the themed `.heat-slider` class (teal thumb +
  value-driven fill) defined in `globals.css` — restyle it there, once.

---

## 10. WebSockets

`FlGateway` (default namespace) authenticates the Socket.IO handshake with the JWT
(`auth.token` or `Authorization` header) using `JWT_ACCESS_SECRET`, then joins a room
by role:

| Room | Joined by | Events emitted to it |
|---|---|---|
| `doctors` | role `DOCTOR` | `fl:round:started`, `fl:round:progress`, `fl:round:complete` |
| `researchers` | role `RESEARCHER` | `fl:test:progress`, `fl:test:complete` |

`ChatModule` runs a separate gateway on the `/chat` namespace.

---

## 11. Database (Prisma + Postgres) & seed

Schema: `apps/backend/prisma/schema.prisma`. Core models: `Hospital`, `User`, `Case`,
`FlRound`, `FlContribution`, `PrivacyAuditLog`, `Feedback`, `ChatMessage`,
`ModelMetrics`. Key enums: `Role`, `CaseScope {HOSPITAL,PATIENT}`,
`FLStrategy {FEDAVG,FEDSCRT}`, `PrivacyEvent`.

> **`Case` gained three editable columns (2026-06-13):** `subjectType` (`'PATIENT'` |
> `'TEST'`), `subjectLabel` (free-text patient id/name or test description) and
> `clinicalNote` (persisted doctor note). After pulling, run `npm run db:push` to add
> them (see §12.14). They are plain `String?` (no enum migration) and never affect the
> prediction or privacy columns.

**Seed (`prisma/seed.ts`) — idempotent.** Creates:

- 3 hospitals with **`flClientId` = `client_0` / `client_1` / `client_2`**. ⚠️ These
  **must** match the coordinator's mock client IDs, or round contributions are dropped
  with `Unknown hospital flClientId`.
- A 10-round FL history (FedAvg plateau → FedSCRT climb to 0.662) — only if no rounds
  exist yet.
- Demo doctor cases for Hospital A (real binary cases if the real ml-service is up,
  else a static fallback). Inserted directly, so they don't trigger FL.

**Demo credentials** (all seeded):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@fedmri.local` | `admin1234` |
| Researcher | `researcher@fedmri.local` | `research1234` |
| Doctor (Hospital A) | `dr.benali@fedmri.local` | `doctor1234` |
| Patient | `sara@fedmri.local` | `patient1234` |

(More doctors: `dr.mouloud`, `dr.khelifi`, `dr.meriem`, `dr.hadj`, `dr.soumia` — all
`doctor1234`, spread across the 3 hospitals.)

---

## 12. Small details that *will* bite you

1. **`NEXT_PUBLIC_API_URL` is read from `apps/web/`, not the repo root.** Next.js loads
   env from the app directory. The repo root `.env` (which the backend uses) is invisible
   to the browser bundle. We keep `apps/web/.env.local` for this. Without it, only code
   that has a fallback (`lib/api.ts`) works; any direct
   `` fetch(`${process.env.NEXT_PUBLIC_API_URL}/...`) `` becomes
   `fetch("undefined/...")` → a relative 404. (This was the patient-registration bug —
   see §13.) **Rule: go through `lib/api.ts`.**

2. **Two `.env` files for the backend side.** The NestJS app reads root `.env`
   (`../../.env`); Prisma CLI reads `apps/backend/.env`. Keep `DATABASE_URL` and
   `FL_WEBHOOK_SECRET` in sync between them.

3. **`fl-coordinator/main.py` has no `uvicorn.run`.** Start it with the `uvicorn` CLI,
   never `python main.py`.

4. **Coordinator → backend uses `host.docker.internal:3001`, not `localhost`.** In the
   hybrid topology the backend is on the host. Inside the coordinator container
   `localhost` is the container.

5. **The Docker `backend` service is profile-gated (`profiles: ["full"]`).** Default
   `docker compose up` skips it so it doesn't grab port 3001 from your local backend
   (and its `localhost` DB URL wouldn't resolve in-container anyway). Full in-Docker
   stack = `docker compose --profile full up`.

6. **`flClientId` must be `client_0/1/2`.** It's the join key between the coordinator's
   mock clients and the `Hospital` rows. Changing the seed names silently breaks
   contribution/round mapping.

7. **`FL_WEBHOOK_SECRET` mismatch = silent FL death.** The webhook returns `400` and the
   coordinator logs `failed after 3 attempts`, but the upload itself still succeeds, so
   it looks like "FL just doesn't run".

8. **Password min length is 8.** The backend rejects shorter passwords with a
   class-validator **array** message (`["password must be longer than or equal to 8
   characters"]`). `apiRegister` joins those into a readable string; the register form
   also enforces `minLength={8}` client-side.

9. **`dist/` is committed for the backend.** You'll see large diffs in
   `apps/backend/dist/**` after a build. Don't hand-edit compiled output — edit `src/`,
   the watcher rebuilds.

10. **Real inference needs the checkpoint mounted and the container rebuilt.** Changing
    ML real-mode behaviour means rebuilding the `ml-service` container (`docker compose
    build ml-service`), not just restarting. `model-core/` (source) and `model_core/`
    (checkpoint) are different dirs.

11. **CORS is allow-listed to `http://localhost:3000`.** If you open the web app from a
    LAN IP (e.g. testing on a phone), set `CORS_ORIGIN` on the backend **and** point
    `apps/web/.env.local`'s `NEXT_PUBLIC_API_URL` at the same host:port, then restart
    both.

12. **A mock FL round takes ≈ 33 s.** The doctor sees the prediction instantly; the
    topology animation completes ~30 s later when the `round-complete` webhook lands.

13. **Ollama model blobs live on `D:\ollama-models`** (mapped in compose to keep them off
    the C: drive). The first assistant call after a cold start is slow while the model loads.

14. **`prisma generate` fails with `EPERM … query_engine-windows.dll.node` while the
    backend is running.** The running NestJS dev server holds the engine DLL open, so the
    rename can't complete. Stop the backend, then **from the repo root** run
    `npm run db:push` (or `npx prisma db push` from `apps/backend`) — it applies new
    columns *and* regenerates the client — then restart. This is the required step after pulling
    the 2026-06-13 `Case` column additions — until then, writes to `subjectType` /
    `clinicalNote` will be rejected by the stale client.

---

## 13. Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| **Patient registration says "Registration failed"** | `NEXT_PUBLIC_API_URL` undefined in the browser → POST to a relative 404; or a sub-8-char password surfaced as a generic error. | Ensure `apps/web/.env.local` exists and the register page goes through `lib/api.ts` (both done). Restart `next dev` after adding env. Password ≥ 8 chars. |
| **FL round never completes / topology never animates** | Coordinator not running, or webhook rejected. | `curl localhost:8002/health`. Bring it up (`docker compose up -d fl-coordinator`). Check `FL_WEBHOOK_SECRET` matches. Confirm `BACKEND_URL=host.docker.internal:3001`. |
| **FL-test (researcher) does nothing** | The live test now runs **in the backend** (replays recorded curves over WS) — so it's a backend/WS issue, not the coordinator. | Confirm the backend is up and the researcher's Socket.IO connected (it joins the `researchers` room); ensure `src/fl/experiments/fl_*.json` exist. Restart the backend after pulling the change. |
| **`Unknown hospital flClientId client_0`** in backend logs | Hospitals not seeded / wrong `flClientId`. | `npm run db:seed`. |
| **Login works but registration doesn't** | Classic env-fallback asymmetry (login used the helper, register didn't). | Already fixed — keep all calls in `lib/api.ts`. |
| **Backend can't reach Postgres/Redis** | Running backend in Docker with `localhost` URLs, or infra not up. | Run backend on the host; `docker compose up -d` the infra. |
| **`EADDRINUSE :3001`** | The Docker `backend` container is also bound to 3001. | Don't start it: plain `docker compose up` (no `--profile full`). |
| **Predictions error with 422 "Could not read the uploaded volume"** | Real mode got a JPEG/PNG instead of `.mha/.dcm/.nii`. | Upload a real volume, or run `INFERENCE_MODE=mock`. |
| **Assistant replies are empty/slow** | Ollama model not pulled / cold. | `docker exec -it fedmri-ollama ollama pull llama3.2:3b`. |

---

## 14. The five invariants (never break these)

1. `PrivacyAuditLog.rawDataTransmitted` is **always 0**.
2. `HospitalSiloGuard` blocks every cross-hospital case read.
3. `CaseScope.HOSPITAL` → `uploads/hospitals/{hospital_id}/`;
   `CaseScope.PATIENT` → `uploads/patients/{patient_id}/`. Never mix.
4. The FL round fires **after** the case response is returned — never before.
5. Patient-facing copy never uses FL jargon.

---

## 15. Quick command reference

```powershell
# Infra + ml + coordinator (hybrid)
docker compose up -d
docker compose logs -f fl-coordinator      # watch FL rounds land
docker compose --profile full up           # everything in Docker instead

# Backend / web (host)
cd apps/backend; npm run start:dev
cd apps/web;     npm run dev

# Database — run from repo ROOT (scripts cd into apps/backend themselves;
# from apps/backend call Prisma directly, e.g. `npx prisma db push`)
npm run db:push        # apply schema
npm run db:seed        # demo data
npm run db:studio      # browse

# Health
curl http://localhost:3001/health
curl http://localhost:8001/health
curl http://localhost:8002/health
```

---

## 16. Why this stack — technology decisions (and the alternatives we rejected)

This section is the "comprehension test": every major choice below was made for a
concrete reason rooted in *this* project, not because it was fashionable. If you can
explain these trade-offs, you understand the system. Three forces shaped almost every
decision:

- **A.** It is an **educational, privacy-first, offline-capable demo** — a grader or
  contributor must be able to run it on a laptop with no GPU, no cloud account, and no
  paid API. (Hence every mode switch defaults to `mock`/`local`.)
- **B.** The FL data is **highly relational and audit-critical** — a round fans out to
  per-hospital contributions and one privacy-audit row each, and those writes must be
  atomic and constraint-enforced (invariants #1–#2 are literally DB columns/foreign keys).
- **C.** It is **inherently two-language** — the UI/API world is TypeScript, but the
  model is PyTorch and the FL math is numpy. We embraced that split instead of fighting it.

### 16.1 Datastore: **PostgreSQL** (not MongoDB / MySQL / SQLite)

> **What it is:** PostgreSQL is a mature, open-source *relational* (SQL) database — data
> lives in tables linked by foreign keys, with ACID transactions and rich JSON (`JSONB`)
> columns.

This is the choice people ask about most, so here is the full reasoning.

- **Our data is relational, not document-shaped.** `Hospital 1—* Case`,
  `FlRound 1—* FlContribution`, `FlRound 1—* PrivacyAuditLog`, `User 1—* Case`. These
  are joins, not nested blobs. A relational store models them directly with foreign keys.
- **We need real transactions.** The `round-complete` webhook writes an `FlRound` **plus**
  N `FlContribution` rows **plus** N `PrivacyAuditLog` rows in one logical operation. If
  that half-commits, the privacy audit trail is corrupt. Postgres gives ACID
  multi-row transactions; the audit invariant depends on it.
- **Constraints enforce the invariants at the lowest layer.** Foreign keys + enums
  (`CaseScope`, `FLStrategy`, `Role`) make illegal states unrepresentable in the DB
  itself — defense in depth behind `HospitalSiloGuard`, not just in app code.
- **We still get schema flexibility where we want it.** `participants` and
  `f1PerClassAfter` are `Json` columns (Postgres `JSONB`) — semi-structured data lives in
  a typed relational row without dragging in a separate document database.
- **It's free, tiny, and Prisma-first.** Postgres 16 runs in one small container, and
  Prisma treats it as a first-class target (richest type mapping, `JSONB`, enums, native
  migrations).

**Rejected, and the honest reason:**

| Alternative | Why not here |
|---|---|
| **MongoDB** | Our model is relational; we'd push joins (round→contributions→hospital) into app code and lose foreign-key + multi-document transactional guarantees that the audit invariant relies on. Document stores shine for denormalized, schema-fluid data — that's not this. |
| **MySQL** | Perfectly capable, but weaker `JSONB`/constraint ergonomics than Postgres and a second-class Prisma experience. No upside for us. |
| **SQLite** | Great zero-config DX, but the **host backend** and the **coordinator webhook** write concurrently; SQLite's single-writer locking and thinner JSON/enum support make it the wrong fit for a production-credible demo. |

### 16.2 ORM: **Prisma** (not TypeORM / raw SQL)

> **What it is:** Prisma is a type-safe ORM (object–relational mapper) for TypeScript —
> you describe the data model once in `schema.prisma` and it generates a typed query
> client plus database migrations.

One `schema.prisma` is the single source of truth for the database, the migrations, the
seed, **and** the TypeScript types. Those generated types flow straight into the same
end-to-end TS contract the rest of the stack is built on, so a column rename becomes a
compile error, not a runtime surprise. *Rejected:* TypeORM (decorator-heavy, historically
shakier migrations) and raw SQL (throws away the type safety the whole stack is designed
around).

### 16.3 Backend framework: **NestJS** (not Express / a Python web framework)

> **What it is:** NestJS is an opinionated Node.js/TypeScript backend framework (built on
> Express) with first-class dependency injection, modules, and guard/decorator-based
> request handling.

The domain *is* modular (auth, cases, fl, researcher, chat), and Nest's module + DI
structure mirrors that one-to-one. More importantly, the security model is
guard-and-decorator shaped — `@Roles(...)` + `RolesGuard` + `HospitalSiloGuard` +
`class-validator` pipes — which Nest provides first-class, along with a built-in
Socket.IO gateway. *Rejected:* bare Express (we'd hand-roll the guard/role/validation
machinery the invariants depend on) and a Python backend (would fracture the TS
contract and duplicate types across the language boundary for no benefit, since the
heavy ML already lives in its own Python services).

### 16.4 One language for the app tier: **TypeScript end-to-end + a monorepo**

> **What it is:** TypeScript is JavaScript with a static type system (errors caught at
> compile time). A *monorepo* keeps all packages in one repository; npm workspaces +
> Turborepo install and build them together.

Web, backend, and `packages/shared` are all TypeScript, with shared DTOs/types/constants
in `packages/shared`. A monorepo (npm workspaces + Turbo) means a single install, atomic
cross-cutting changes (touch a type and both sides recompile against it), and one place
for the contract. *Rejected:* polyrepo (version-skew and PR overhead with no payoff at
this size) and mixed languages in the app tier (loses the shared-type guarantee).

### 16.5 Auth: **JWT access tokens + Redis-backed refresh tokens**

> **What it is:** A JWT (JSON Web Token) is a signed, self-contained token the client
> sends on each request to prove who it is — no server-side session lookup. Redis is an
> in-memory key–value store with per-key expiry (here, the refresh-token store).

Stateless access tokens scale and — crucially — double as the **WebSocket handshake
credential** (same `JWT_ACCESS_SECRET` verifies the Socket.IO connection), so live FL
events ride the existing auth with no second mechanism. Refresh tokens live in **Redis**
keyed by user with a natural TTL: logout is a key delete, revocation needs no relational
write, and expiry is free. *Rejected:* server-side sessions (don't travel cleanly to the
socket handshake or the mobile client) and storing refresh tokens in Postgres (works, but
Redis gives free expiry/speed and keeps high-churn auth state off the audit DB).

### 16.6 Web: **Next.js (App Router) + Tailwind + shadcn/ui**

> **What it is:** Next.js is a React framework with file-based routing, server rendering
> and hot reload. Tailwind is utility-class CSS (style in the markup); shadcn/ui is a set
> of accessible React components you copy into the repo and own outright.

File-based routing maps directly onto the three portal trees (`/doctor`, `/patient`,
`/researcher`), React unlocks the charting/animation ecosystem (recharts, framer-motion),
and HMR keeps the host-side DX fast. Tailwind + shadcn give a **copy-in** component
system we fully own and can restyle into the bespoke glass/teal medical look — no heavy
component library dictating the aesthetic. *Rejected:* a plain SPA (we'd rebuild routing
and lose SSR headroom), Angular (heavier, weaker fit with the React viz ecosystem), and
MUI/AntD (opinionated visual identity that fights the medical design system).

### 16.7 Real-time: **Socket.IO** (not raw WS / SSE)

> **What it is:** Socket.IO is a real-time messaging library over WebSockets, adding
> rooms (group broadcast), automatic reconnection and transport fallback on top of the
> raw protocol.

The product *is* live — round progress, the doctor topology animation, and the
researcher live-test curve all stream. Socket.IO's **rooms** map cleanly onto roles
(`doctors`, `researchers`), and auto-reconnect/transport-fallback come for free.
*Rejected:* raw `ws` (we'd reimplement rooms + reconnect) and SSE (one-way only; we want
the room model and it already pairs with the Nest gateway).

### 16.8 ML & FL in **Python/FastAPI**, split into **two** services

> **What it is:** FastAPI is a modern, async Python web framework with built-in request
> validation (via pydantic). PyTorch is the deep-learning library the FedSCRT model is
> built and run with.

The model is PyTorch and the FL aggregation is numpy/sklearn — that work *has* to be
Python, so it lives behind FastAPI (async, tiny, pydantic-validated). It is **two**
services on purpose: `ml-service` carries torch + the checkpoint (heavy, real-mode), while
`fl-coordinator` needs only numpy/sklearn (light, torch-free, GPU-free). Different
dependencies, different lifecycles, independent failure — so they're separate containers.
The Python↔Node boundary is plain HTTP, and FL results return via a **signed webhook**
(`x-fl-secret`) because that path is server-to-server and asynchronous. This boundary is
also where the core privacy claim is enforced: raw scans never cross it — only
weights/metrics do. *Rejected:* embedding ML in the Node backend (no torch) or using
Flask (sync, no pydantic validation).

### 16.9 The live FL-test math: **numpy/scikit-learn replaying recorded results**

> **What it is:** NumPy is Python's array/linear-algebra library; scikit-learn supplies
> the evaluation metrics (macro-F1, AUC). Flower (`flwr`) is a federated-learning
> orchestration framework, wired in best-effort for the optional real-FL mode.

The quantity worth demonstrating is the **federated aggregation**, which is pure linear
algebra — so the coordinator's `realfl.py` is numpy + sklearn, keeping the container
small and instant with no torch/GPU/flwr (flwr is best-effort). But there's a subtlety
that is itself a comprehension point: on **frozen-backbone features**, "FedAvg" and
"FedSCRT" are the *same* procedure (train a linear head → FedAvg-aggregate), so a live
re-run cannot distinguish them and would not match the published numbers. The genuine
FedAvg-vs-FedSCRT gap only exists in the **full training runs** (recorded in
`src/fl/experiments/fl_*.json`). So the researcher live test **replays the real recorded
per-round convergence** for the chosen strategy and α (see §6.5) — honest, distinct per
strategy, and consistent with the static convergence chart. *Rejected:* running torch FL
in the browser-triggered path (slow, GPU-bound) and fabricating a fake gap in the numpy
sim (dishonest, and it wouldn't match the real F1s).

### 16.10 Runtime: **hybrid Docker + host** (and **mock-by-default** everywhere)

> **What it is:** Docker packages each service with its dependencies into an isolated,
> reproducible *container* (orchestrated here by Docker Compose). Ollama is a runtime that
> serves open-weight LLMs (e.g. `llama3.2`) locally, with no API key or cloud calls.

Node hot-reloads fastest on the host; Postgres/Redis/Ollama/Python pin cleanly and
reproducibly in containers — so we run the JS tier on the host and everything else in
Docker (§3 covers the networking consequences). And every mode switch
(`INFERENCE_MODE`, `FL_MODE`, `STORAGE_MODE`, …) **defaults to the offline path** so the
whole app runs with no GPU, no cloud, and no checkpoint — non-negotiable for an
educational artifact someone has to be able to clone and run. The in-app assistant uses
**Ollama** (local `llama3.2:3b`) for the same reason: no API key, no cost, and it keeps
the "your data stays local" story intact end-to-end, while staying provider-pluggable
(`deepseek`/`anthropic`) if a cloud model is ever wanted. *Rejected:* all-in-Docker
(slower JS DX + the localhost/port pitfalls of §3) and a cloud-only LLM (breaks the
offline/no-cost/privacy promise).

---

## 17. Recent feature changes (2026-06-13)

A pass to make several screens *do real work* instead of being static. All wired to real
DB/endpoints; the only manual step is one `npm run db:push` (§12.14) for the new `Case`
columns.

| Area | What changed | Where |
|---|---|---|
| **Researcher · Models** (`/researcher`) | Added a **Model card** (architecture/task/strategy/provenance), a **"Why federated?"** panel (FedSCRT vs centralized upper bound + patients-protected, from `/model/comparison`), a **Per-class F1** chart (`/model/per-class`), and **interactive model versions** (click to select, F1 delta vs previous). | `apps/web/app/researcher/page.tsx` |
| **Researcher · Topology** | **Request Audit** now fetches `GET /researcher/node-audit/:flClientId` and opens a real audit modal (privacy summary, derived integrity checks, recent contributions, COMPLIANT verdict) — all computed from `FlContribution` + `PrivacyAuditLog`. | `topology/page.tsx`, `researcher.service.ts` |
| **Researcher · Datasets** | New **Network insights** feed + auto-popup toast of the latest event (e.g. a patient's first signup) from `GET /researcher/insights` (real users/cases/rounds). | `datasets/page.tsx`, `researcher.service.ts` |
| **Doctor · Medical History** | Reworked to real logic: **patient-study vs test-scan** separation + filter, **scan re-view** (embeds `AttentionOverlay`), and **persisted clinical notes** (`PATCH /cases/:id`). Upload now captures a **scan subject** (patient label / TEST). | `doctor/history/page.tsx`, `doctor/scan/page.tsx`, `cases.*` |
| **Patient · PDF** | Rewritten report: header band, colored result hero + confidence chip, probability bars, "what this means", "what happens next", questions, privacy box, disclaimer. | `cases/pdf.service.ts` |
| **Heatmap opacity + zoom** | Themed `.heat-slider` opacity control, **plus zoom/pan** (buttons, wheel, double-click-to-zoom, drag-to-pan) and a larger responsive viewer — so doctor/patient can inspect the tumour focus area. | `globals.css`, `AttentionOverlay.tsx` |
| **Active learning now affects predictions** | `/feedback` shifts a persisted per-subtype confidence bias that `/predict` applies — so the **same scan's confidence changes after a doctor approves/corrects** it (verified: 0.55→0.69 after 2 approvals). On by default (`AL_MODE=mock`), persisted to the `/al-state` volume so it survives docker restarts. | `ml-service/main.py`, `docker-compose.yml` |
| **Light mode** | Recalibrated to a grey page + near-solid white cards + darker text/borders so content is readable (was washed-out near-white). | `globals.css` |
| **Patient PDF footer** | Fixed a footer overflow that pushed the disclaimer onto a blank second page. | `cases/pdf.service.ts` |
| **FL test** (prev. change) | Live researcher FL test replays the real recorded convergence per strategy/α instead of the on-frozen-features numpy sim. | §6.5, §16.9 |

**Backend / ml-service additions:** `Case.subjectType` / `subjectLabel` / `clinicalNote`
columns; `PATCH /cases/:id` (`CasesService.updateCase`); `ResearcherService.getNodeAudit`
+ `getInsights` with controller routes; ml-service AL `conf_bias` + persistence
(`AL_STATE_PATH`, `/al-state` volume) applied in `/predict`. Both `apps/backend` and
`apps/web` typecheck clean; ml-service rebuilt.

> **Applying these:** the ml-service change needs a container rebuild
> (`docker compose up -d --build ml-service`) since its code is baked into the image. The
> `Case` columns need `npm run db:push` (backend stopped). Web + backend hot-reload.
