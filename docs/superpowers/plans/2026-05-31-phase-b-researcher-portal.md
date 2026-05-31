# Phase B — Researcher Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Build the Researcher portal — P0 cases-guard fix, aggregate-only `/researcher/*` endpoints, and 6 screens — all on real 3-hospital/10-round seed data, never touching raw images.

**Architecture:** New NestJS `researcher` module (controller + service) guarded by `@Roles('RESEARCHER')` (via an upgraded `RolesGuard` that reads class+method metadata). Six Next.js client screens under `app/researcher/` using the Phase A `PortalShell` + primitives + recharts, reusing the existing `/model/*` charts.

**Tech Stack:** NestJS 10 + Prisma 5 + jest/supertest; Next 16 + React 19 + Tailwind v4 + recharts + framer-motion + lucide.

**Specs:** `docs/superpowers/specs/2026-05-31-phase-b-researcher-portal-design.md` (+ parent program spec). **Figma screenshots saved at** `.scratch/figma/researcher-*.png` (model-performance via node `15:612`, topology `27:11232`, datasets `15:931`, logs `15:351`).

---

## Conventions
- Branch `redesign/figma-portals` (continue). Backend = TDD via `npm run test:e2e` from `apps/backend`. Web = `npm run build` + browser QA (no web unit runner). Read `node_modules/next/dist/docs/` before route work if anything Next-16-specific arises.
- Reconciliation (parent spec §3): 3 hospitals (A=247,B=312,C=178), breast DCE-MRI, 4 subtypes, 10 rounds, model v10, F1 0.41. Map Figma's inflated mock numbers to this real data. Demo-only actions (Add Dataset / Request Access) are **simulated in-memory, labeled "demo · not saved"**.
- Commit after every task. Stage explicit paths only (the repo tracks `dist/` + `node_modules/.prisma` — never `git add -A`).

---

## Endpoint data contracts (authoritative — tests + screens depend on these)

```
GET /researcher/overview  → { modelVersion:10, strategy:"FedProx", f1Macro:0.41, accuracy:0.55,
                              totalRounds:10, hospitals:3, patientsProtected:737, rawBytesSent:0, phase:"idle"|"local_training"|"aggregating"|"complete" }
GET /researcher/training-log?page&limit → { total:number, rounds:[ { roundNumber, strategy:"FedAvg"|"FedProx",
                              nodesParticipating:number, totalNodes:3, gradientNorm:number, globalF1After:number, status:"active"|"completed" } ] }
GET /researcher/model-versions → { versions:[ { modelVersion, flRound, f1Macro, accuracy, strategy, status:"active"|"archived", hash:string } ] }
GET /researcher/topology → { aggregator:{ id:"agg", label:"Aggregator", phase }, currentRound, totalRounds, uptime:"99.9%", globalDataVolume:737,
                              nodes:[ { id, displayName, flClientId, totalCases, status:"synchronized", lastContributionNorm:number } ] }
GET /researcher/datasets → { totalRecords:737, dataQuality:{ annotationCompleteness:0.94, dicomIntegrity:0.998 },
                              nodes:[ { displayName, flClientId, totalCases, specialty } ],
                              cohorts:[ { designation, description, sourceNode, modality:"DCE-MRI", records, access:"GRANTED"|"PENDING"|"RESTRICTED" } ] }
GET /researcher/system-logs?page&limit&severity → { total, connectedNodes:3, totalNodes:3,
                              events:[ { id, ts, severity:"INFO"|"WARN"|"ERROR", nodeId, eventType, payload, latencyMs:number|null, bytes:number|null } ] }
```
All derived from `FlRound`, `FlContribution`, `ModelMetrics`, `PrivacyAuditLog`, `Hospital`, and `Case` **counts** (Prisma `groupBy`/`count` — never select `imagePath`).

---

## Task 1 — P0: deny RESEARCHER on `/cases` (RolesGuard + guard + e2e)

**Files:** `apps/backend/src/common/guards/roles.guard.ts`, `apps/backend/src/cases/cases.controller.ts`, `apps/backend/test/cases.e2e-spec.ts` (or a new `cases-rbac.e2e-spec.ts`).

- [ ] **Step 1 — failing test.** In `apps/backend/test/cases.e2e-spec.ts` (read it first to match harness; if researcher RBAC fits better standalone, create `apps/backend/test/cases-rbac.e2e-spec.ts` modeled on `auth.e2e-spec.ts`'s bootstrap). Register+login a RESEARCHER (or login seed `researcher@fedmri.local`/`research1234`) and assert:
```typescript
it('forbids RESEARCHER from reading cases', async () => {
  const login = await request(app.getHttpServer()).post('/auth/login')
    .send({ email: 'researcher@fedmri.local', password: 'research1234' }).expect(200);
  const tok = login.body.accessToken;
  await request(app.getHttpServer()).get('/cases').set('Authorization', `Bearer ${tok}`).expect(403);
  await request(app.getHttpServer()).get('/cases/any-id').set('Authorization', `Bearer ${tok}`).expect(403);
});
```
- [ ] **Step 2 — run, expect FAIL** (currently 200/other): `npm run test:e2e -- cases`.
- [ ] **Step 3 — upgrade RolesGuard** to read class + method metadata (`@Roles` is currently unused anywhere, so this is safe). Replace the `reflector.get(...)` line:
```typescript
import { Reflector } from '@nestjs/core';
// ...
const roles = this.reflector.getAllAndOverride<string[]>('roles', [
  context.getHandler(),
  context.getClass(),
]);
if (!roles || roles.length === 0) return true;
```
(keep the rest: read `request.user`, throw `ForbiddenException` if role not included.)
- [ ] **Step 4 — guard CasesController.** In `cases.controller.ts`: import `RolesGuard` (`../common/guards/roles.guard`) and `Roles` (`../common/decorators/roles.decorator`); change the class decorators to:
```typescript
@Controller('cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DOCTOR', 'PATIENT')
export class CasesController {
```
(Class-level `@Roles` now applies to every method via the upgraded guard. `RolesGuard` needs only `Reflector`, which is globally available — no module change.)
- [ ] **Step 5 — run, expect PASS**, and confirm existing doctor/patient cases e2e still pass: `npm run test:e2e -- cases auth`.
- [ ] **Step 6 — commit:** `git add apps/backend/src/common/guards/roles.guard.ts apps/backend/src/cases/cases.controller.ts apps/backend/test/*cases*e2e-spec.ts && git commit -m "fix(backend): deny RESEARCHER on /cases (RolesGuard class+method) + e2e"`

---

## Task 2 — Researcher backend module: overview + training-log + model-versions

**Files:** create `apps/backend/src/researcher/researcher.module.ts`, `researcher.controller.ts`, `researcher.service.ts`; register module in `apps/backend/src/app.module.ts`; test `apps/backend/test/researcher.e2e-spec.ts`.

- [ ] **Step 1 — controller skeleton** with class-level guards (mirrors Task 1 pattern):
```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ResearcherService } from './researcher.service';

@Controller('researcher')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('RESEARCHER')
export class ResearcherController {
  constructor(private svc: ResearcherService) {}
  @Get('overview') overview() { return this.svc.getOverview(); }
  @Get('training-log') trainingLog(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getTrainingLog(page ? +page : 1, limit ? +limit : 20);
  }
  @Get('model-versions') modelVersions() { return this.svc.getModelVersions(); }
}
```
- [ ] **Step 2 — service methods** in `researcher.service.ts` (Prisma-backed, aggregate-only). `getOverview`: latest `ModelMetrics` (modelVersion desc) for f1Macro/accuracy/strategy/modelVersion; `flRound.count()` for totalRounds; `hospital.count()`; patientsProtected=737; rawBytesSent=0; phase from latest round (=`"complete"` if any rounds else `"idle"`). `getTrainingLog`: `flRound.findMany` ordered by roundNumber desc, paginated, and for each round average its `flContribution.weightDeltaNorm` (gradientNorm) and count contributions (nodesParticipating); status = latest roundNumber → `"active"` else `"completed"`. `getModelVersions`: build from `flRound.findMany` (each round carries a `modelVersion`), newest first; status latest→`"active"` else `"archived"`; hash = `createHash('sha1').update(round.id).digest('hex').slice(0,7)`. Return exactly the contract shapes above. **Never select `Case.imagePath`.**
- [ ] **Step 3 — module + registration.** `researcher.module.ts` imports `PrismaModule`, `AuthModule`; provides `ResearcherService`; controllers `[ResearcherController]`. Add `ResearcherModule` to `app.module.ts` imports.
- [ ] **Step 4 — e2e test** `researcher.e2e-spec.ts` (bootstrap like `auth.e2e-spec.ts`): login researcher → `GET /researcher/overview|training-log|model-versions` each **200** with the contract keys present (assert `modelVersion`, `rawBytesSent===0`; `rounds` array; `versions` array). Login a DOCTOR (seed `dr.benali@fedmri.local`/`doctor1234`) → each endpoint **403**. No token → **401**.
- [ ] **Step 5 — run:** `npm run test:e2e -- researcher` → PASS.
- [ ] **Step 6 — commit:** explicit paths (`apps/backend/src/researcher`, `apps/backend/src/app.module.ts`, the test) — `feat(backend): researcher overview/training-log/model-versions endpoints + e2e`.

---

## Task 3 — Researcher backend: topology + datasets + system-logs

**Files:** extend `researcher.controller.ts` + `researcher.service.ts`; extend `researcher.e2e-spec.ts`.

- [ ] **Step 1 — controller** add `@Get('topology')`, `@Get('datasets')`, `@Get('system-logs')` (system-logs takes `page`,`limit`,`severity` queries) delegating to the service.
- [ ] **Step 2 — service.** `getTopology`: `hospital.findMany`, map to nodes (status `"synchronized"`, `lastContributionNorm` = that hospital's latest `flContribution.weightDeltaNorm`); aggregator phase from latest round; `globalDataVolume` = Σ totalCases; currentRound/totalRounds from `flRound`. `getDatasets`: nodes from `hospital.findMany` with a `specialty` map (Hospital A→"Breast Oncology", B→"Breast Imaging", C→"Oncology Centre"); totalRecords = Σ totalCases; dataQuality static (0.94 / 0.998); cohorts = one per hospital `{ designation:"BREAST_DCE_<A|B|C>", description:"Breast DCE-MRI subtype cohort", sourceNode, modality:"DCE-MRI", records:totalCases, access: A→"GRANTED",B→"PENDING",C→"RESTRICTED" }`. `getSystemLogs`: build events from `privacyAuditLog.findMany` (include hospital) mapped — `WEIGHTS_SENT`→`GRADIENT_UPLOAD` (severity INFO, bytes=bytesTransmitted, latencyMs synth ~20-50), `ROUND_COMPLETE`→`AGGREGATION_DONE` (nodeId "CORE-AGGREGATOR") — ordered by createdAt desc, paginated, optional severity filter; connectedNodes/totalNodes = hospital count. Reflect the privacy invariant in payload text ("0 bytes of raw patient data"). Counts only; no `imagePath`.
- [ ] **Step 3 — e2e** extend: researcher 200 + key assertions (`nodes` len 3 for topology; `cohorts` for datasets; `events` for logs; assert no event/object contains an `imagePath` key); doctor 403.
- [ ] **Step 4 — run:** `npm run test:e2e -- researcher` → PASS.
- [ ] **Step 5 — commit:** `feat(backend): researcher topology/datasets/system-logs endpoints + e2e`.

---

## Task 4 — Model Performance screen (`/researcher` index)

**Files:** rewrite `apps/web/app/researcher/page.tsx`; add `apps/web/lib/researcher-api.ts` (typed fetch helpers for `/researcher/*` using the existing `apiFetch`); reuse `components/ConvergenceChart`, `components/ConfusionMatrix`, Phase A primitives.

- [ ] **Step 1 — `researcher-api.ts`:** typed `apiFetch` wrappers + TS interfaces matching the contracts above (overview, trainingLog, modelVersions; and for later tasks topology, datasets, systemLogs). One module, exported functions `getOverview()` etc.
- [ ] **Step 2 — screen.** Replace the placeholder. Layout (ref `.scratch/figma/researcher-model.png`, Figma `15:612`): `PageHeader` "Global Model Performance" / "Federated DINOv2-MIL · Round {n}/{total}"; header status badge (Idle/Training) passed to shell via `usePortalTitle` stays "MRI Federated Core" + a `headerStatus` slot is set in the layout (leave layout as-is; render the badge inline near the page header for now). Then: a 2-col grid — left **Convergence Metrics** `Panel` wrapping `<ConvergenceChart data={await getHistory()}/>` (fetch `/model/history`), right **Classification Matrix** `Panel` wrapping `<ConfusionMatrix data={await getConfusion()}/>` (fetch `/model/confusion-matrix`). Below: 4 `StatCard`s from `/researcher/overview` (Model Version, F1 Macro, Accuracy, Raw Data Sent "0 B"). Then **Training Log** `Panel` + `DataTable` from `/researcher/training-log` (cols: Round, Nodes Participating `{n}/{total}`, Gradient Norm, Agg Weight=strategy, Status via `StatusBadge`). Then **Model Versions** `Panel` with a row of cards from `/researcher/model-versions` (version, hash mono, f1, status badge). Use `"use client"` + `useEffect`/`useState` (or react-query, already a dep) to load; show skeletons while loading.
- [ ] **Step 3 — build:** `npm run build` green.
- [ ] **Step 4 — commit:** `feat(web): researcher Model Performance screen`.

---

## Task 5 — Network Topology screen (`/researcher/topology`)

**Files:** create `apps/web/app/researcher/topology/page.tsx` (+ a `components/researcher/NetworkTopology.tsx` SVG if it keeps the page focused).

- [ ] **Step 1 — screen** (ref `.scratch/figma/researcher-topology.png`, Figma `27:11232`; reconcile to 3 hospitals + aggregator, NOT a 1248-node world map). Top stat bar (4 `StatCard`s: Connected Nodes "3", Network Uptime, Global Data Volume "{737} scans", Aggregation Cycle "{round}/{total}") from `/researcher/topology`. Center: an SVG topology (extend the `components/FlTopology.tsx` idea — 3 hospital nodes + central aggregator, connection lines, teal accents) where clicking a node selects it. Right: **Node Inspector** `Panel` (selected node displayName, status, totalCases, lastContributionNorm as "Recent Δw", a "Request Audit" demo button → toast "demo · read-only network"). Bottom: **Consensus Stream** strip (recent events from `/researcher/system-logs?limit=5`). `usePortalTitle("Network Topology")`.
- [ ] **Step 2 — build green. Step 3 — commit:** `feat(web): researcher Network Topology screen`.

---

## Task 6 — Datasets screen (`/researcher/datasets`)

**Files:** create `apps/web/app/researcher/datasets/page.tsx`.

- [ ] **Step 1 — screen** (ref `.scratch/figma/researcher-datasets.png`, Figma `15:931`). `PageHeader` "Federated Dataset Registry". Stat row: Total Accessible Records (`totalRecords`) + 3 node cards (Hospital A/B/C totals + specialty). **Data Quality Index** `Panel` (two labelled progress bars from `dataQuality`). Cohort filter chips (BREAST default; BRAIN/SPINE shown disabled "demo"). **Available Cohorts** `DataTable` from `cohorts` (Designation mono, Source Node badge, Modality, Records N, Action). **Simulated actions (in-memory, "demo · not saved"):** Request Access on a PENDING row → local state PENDING→GRANTED; **Add Dataset** button (in shell `primaryAction` is global; here add a header button) prepends a local cohort row. `usePortalTitle("Datasets")`.
- [ ] **Step 2 — build green. Step 3 — commit:** `feat(web): researcher Datasets screen (simulated access/add)`.

---

## Task 7 — System Logs screen (`/researcher/logs`)

**Files:** create `apps/web/app/researcher/logs/page.tsx`; small client-side CSV helper inline.

- [ ] **Step 1 — screen** (ref `.scratch/figma/researcher-logs.png`, Figma `15:351`). "Live Telemetry" header. 3 `StatCard`s (Aggregation Cycle `{round}/{total}`, Network Latency avg (computed from events), Security Anomalies "0 · all handshakes verified"). Severity filter (All/INFO/WARN/ERROR) → refetch `/researcher/system-logs?severity=`. **Log `DataTable`** (Timestamp mono, Severity `StatusBadge`-style chip, Node ID, Event Type teal, Message Payload, Lat/BW). Footer: "Connected Nodes 3/3" + **Export CSV** (real: build CSV string from loaded rows, `Blob` download). `usePortalTitle("System Logs")`.
- [ ] **Step 2 — build green. Step 3 — commit:** `feat(web): researcher System Logs screen + CSV export`.

---

## Task 8 — Support screen (`/researcher/support`)

**Files:** create `apps/web/app/researcher/support/page.tsx`.

- [ ] **Step 1 — static screen** in the design idiom: `PageHeader` "Support"; cards — Documentation links, Contact (mailto), FAQ accordion (3-4 Q/A about the FL network, privacy, model). No backend. `usePortalTitle("Support")`.
- [ ] **Step 2 — build green. Step 3 — commit:** `feat(web): researcher Support screen`.

---

## Task 9 — Settings screen (`/researcher/settings`)

**Files:** create `apps/web/app/researcher/settings/page.tsx`.

- [ ] **Step 1 — read-mostly screen** (no researcher-settings Figma frame; follow the settings idiom). Sections: Identity (Node Alpha-7, researcher name/email from `useAuthStore`), Role (RESEARCHER), Network (API endpoint from `NEXT_PUBLIC_API_URL`, Mode mock/real), and a coral Sign-out button (`clear()` → `/login`). Toggles are visual-only ("demo"). `usePortalTitle("Settings")`.
- [ ] **Step 2 — build green. Step 3 — commit:** `feat(web): researcher Settings screen`.

---

## Task 10 — QA browser pass

**Files:** none.

- [ ] **Step 1** — ensure backend + web dev servers running; seed present.
- [ ] **Step 2 — gstack `/browse`:** login researcher, visit `/researcher`, `/researcher/topology`, `/researcher/datasets`, `/researcher/logs`, `/researcher/support`, `/researcher/settings`. For each: screenshot, `console --errors` clean, key elements present. Verify the simulated Request Access + Add Dataset update the UI; verify Export CSV downloads.
- [ ] **Step 3 — regression:** doctor → `/doctor/scan` and patient flows unaffected.
- [ ] **Step 4** — record results in `.scratch/`; fix any bug found (QA sweep) and commit.

---

## Self-review (completed)
- **Spec coverage:** P0 → T1; endpoints → T2/T3; 6 screens → T4–T9; QA → T10. All Phase B spec items have tasks.
- **Contracts:** endpoint shapes defined once (top) and referenced by tests + screens — consistent.
- **Privacy:** every researcher query is aggregate/count; tests assert no `imagePath`; `rawBytesSent`/payloads surface 0. P0 closes the `/cases` hole first.
- **Placeholder scan:** backend tasks carry exact code; screen tasks carry exact data contracts + Figma refs + primitive/reuse lists (JSX built by implementer from the saved screenshots, per subagent-driven UI flow).
