# Phase B — Researcher Portal (design)

**Date:** 2026-05-31
**Status:** Proposed — awaiting approval
**Parent:** `docs/superpowers/specs/2026-05-31-fedmri-figma-redesign-design.md` (program roadmap)
**Builds on:** Phase A (shell, primitives, RESEARCHER role) — complete.

## 1. Scope

Build the Researcher portal: the FL network operator's god-view. Six screens behind
`/researcher`, served by new **aggregate-only** backend endpoints. All data is
model/round/hospital-level — **never** `Case.imagePath` or raw images (invariants §7 of parent).

Screens (Figma): **Model Performance** (index), **Network Topology**, **Datasets**,
**System Logs**, **Support**, **Settings**.

## 2. P0 privacy fix (Task 1, before any screen)

`CasesController` is guarded only by `JwtAuthGuard`, so a `RESEARCHER` token can currently
read `/cases` and receive `Case.imagePath`. Fix: deny `RESEARCHER`. Because `RolesGuard`
reads `context.getHandler()` (method metadata), apply `@Roles('DOCTOR','PATIENT')` at the
**method** level on `create`/`findAll`/`findOne` (+ `@UseGuards(JwtAuthGuard, RolesGuard)` on
the controller), and add an e2e test asserting a researcher gets **403** on `GET /cases` and
`GET /cases/:id`. Verify doctor/patient still pass.

## 3. Figma → domain reconciliation (Phase B specifics)

The Figma researcher screens use inflated, generic mockup data. The real federation is
**3 hospitals** (seed: Hospital A=247, B=312, C=178 cases), **breast DCE-MRI**, 4 PAM50
subtypes, **10 FL rounds** (FedAvg r1–5, FedProx r6–10), model **v10**, F1 macro **0.41**.
Adapt visuals, keep honesty:

| Figma (mockup) | Render instead (real) |
|---|---|
| "1,248 connected nodes", world map | **3 participating hospitals** + 1 aggregator; keep a map/diagram motif but label real nodes (Hospital A/B/C). |
| Node names "Alpha/Beta/Gamma", "NYC-Prime", brain/stroke/glioma cohorts | Hospital A/B/C; modality **DCE-MRI (breast)**; cohort = breast-MRI subtype cohort. |
| "142,854 records" | Real totals from `Hospital.totalCases` (sum 737). |
| "Cycle 4,892 / 5,000" | Real `FlRound.roundNumber` / total rounds (10). |
| "Federated ResNet-50 v4.2.1" | **DINOv2-MIL**, integer `modelVersion`. |
| 2×2 classification matrix | Real **4×4** (`/model/confusion-matrix`). |
| "Gradient Norm" | `FlContribution.weightDeltaNorm` (Δw). |
| "Request Access / Add Dataset / Export CSV" | Clearly-labeled **demo** actions: Export CSV is real (client-side from loaded rows); Add Dataset / Request Access are visibly disabled or show a "demo — read-only network" toast (no real mutation backend in this educational app). |
| "Security Anomalies: 0 blocked / handshakes verified" | Keep — aligns with the privacy invariant; back it with `rawDataTransmitted=0`. |

## 4. Backend — new `researcher` module (all `@Roles('RESEARCHER')`)

New `apps/backend/src/researcher/` module (controller + service), guarded by
`@UseGuards(JwtAuthGuard, RolesGuard)` + method-level `@Roles('RESEARCHER')`. Endpoints
read only `FlRound`, `FlContribution`, `ModelMetrics`, `PrivacyAuditLog`, `Hospital`,
`ModelMetrics`, and aggregate `Case` **counts** (never `imagePath`).

| Endpoint | Returns | Source |
|---|---|---|
| `GET /researcher/overview` | model version, F1 macro, accuracy, total rounds, active strategy, raw-bytes-sent (0), patients-protected (737), #hospitals | `ModelMetrics`, `FlRound`, `Hospital`, `model.service.getComparison` |
| `GET /researcher/training-log?page&limit` | per-round rows: round#, strategy (agg weight), nodesParticipating, avg `weightDeltaNorm` (gradient norm), globalF1After, status (active/completed/dropped) | `FlRound` + `FlContribution` |
| `GET /researcher/model-versions` | version list: modelVersion, flRound, f1Macro, accuracy, strategy, status (active=latest, else archived), short hash (deterministic from id) | `ModelMetrics` (+ derive) |
| `GET /researcher/topology` | nodes: Hospital A/B/C (id, displayName, flClientId, totalCases, status), aggregator, current FL phase, last round | `Hospital`, `FlRound`, FL store |
| `GET /researcher/datasets` | per-hospital cohort: hospital, totalCases, samplesUsed (latest round), subtype distribution (from `FlRound.f1PerClass`/counts), modality "DCE-MRI", access state (demo) | `Hospital`, `FlContribution`, `Case` counts grouped by subtype (count only) |
| `GET /researcher/system-logs?page&limit&severity` | network-wide event stream: ts, severity, nodeId (hospital flClientId or CORE-AGGREGATOR), eventType (WEIGHTS_SENT→GRADIENT_UPLOAD, ROUND_COMPLETE→AGGREGATION_DONE, etc.), payload, bytes/latency | `PrivacyAuditLog` + `FlRound` lifecycle, newest first |

Reuse existing `/model/history`, `/model/per-class`, `/model/confusion-matrix`,
`/model/comparison` for charts (they are `JwtAuthGuard` only → a researcher token may call
them; acceptable — they are aggregate). No change needed there.

**Live status:** subscribe the Model Performance "Training Active / Idle" badge to the
existing FL WebSocket (`fl-store` / socket) if trivial; otherwise show phase from
`/researcher/overview`. WS is a nice-to-have, not a blocker.

## 5. Screens

Each screen is a client page under `app/researcher/`, using `PortalShell` (already wired in
the layout), the Phase A primitives, and `recharts` (already a dep). Set the top-bar title via
`usePortalTitle`.

1. **Model Performance** (`/researcher`, index — already a placeholder): replace placeholder
   with: 4 stat cards (`/researcher/overview`), **Convergence Metrics** line chart
   (`/model/history`, recharts — reuse `ConvergenceChart` if shape fits), **Classification
   Matrix** 4×4 (`/model/confusion-matrix`, reuse `ConfusionMatrix`), **Training Log** table
   (`/researcher/training-log`, `DataTable`), **Model Versions** cards
   (`/researcher/model-versions`), and a "Training Active | ETA" / "Idle" status badge in the
   shell header.
2. **Network Topology** (`/researcher/topology`): top stat bar (nodes=3, uptime, global data
   volume = Σ totalCases, aggregation cycle = current round), a **topology diagram** (3
   hospitals + aggregator — an expanded SVG akin to `FlTopology`, NOT a 1248-node world map),
   a **Node Inspector** panel (click a node → displayName, latency mock, trust/contribution,
   recent `weightDeltaNorm` contributions, "Request Audit" demo button), and a **Consensus
   Stream** strip (recent round/privacy events). Data: `/researcher/topology` +
   `/researcher/system-logs`.
3. **Datasets** (`/researcher/datasets`): "Federated Dataset Registry" — Total Accessible
   Records (Σ totalCases) + 3 node cards (Hospital A/B/C with totals + specialty label),
   Data Quality Index (annotation completeness / DICOM integrity — static demo metrics),
   cohort filter chips, **Available Cohorts** `DataTable` (designation, source node, modality
   DCE-MRI, records N, action = demo). Data: `/researcher/datasets`.
4. **System Logs** (`/researcher/logs`): "Live Telemetry" — 3 stat cards (aggregation cycle,
   avg latency mock, security anomalies 0/handshakes verified), severity filter, **log
   `DataTable`** (ts, severity badge, nodeId, eventType, payload, lat/bw), footer (connected
   nodes 3/3, **Export CSV** = real client-side download). Data: `/researcher/system-logs`.
5. **Support** (`/researcher/support`): static help — FAQ/contact cards in the design idiom
   (mirrors the doctor/patient Support screens in later phases). No backend.
6. **Settings** (`/researcher/settings`): read-mostly node/account settings — identity (Node
   Alpha-7), role, API endpoint, mode (mock/real), sign out. No mutation backend (mirrors the
   mobile Profile pattern). No Figma researcher-settings frame exists, so follow the
   established settings idiom.

## 6. Testing

- **Backend e2e** (`test/researcher.e2e-spec.ts`, jest): researcher gets **200** on each
  `/researcher/*` endpoint with expected shape; **doctor & patient get 403**; no-token 401.
  Plus the P0 test (researcher 403 on `/cases`).
- **Web**: `npm run build` green after each screen; **browser QA** (login as researcher,
  visit each screen, screenshot, no console errors; confirm doctor/patient unaffected).

## 7. Invariants (unchanged)

All five parent invariants hold. The researcher never reads raw images; every researcher
endpoint returns aggregate/model data. `rawDataTransmitted`/raw-bytes is surfaced as **0**
and never written non-zero.

## 8. Risks

- **Subtype-count grouping** for Datasets must use Prisma `groupBy` on `Case.predictedSubtype`
  (counts only) — confirm no `imagePath` selected.
- **WS live status** may be fiddly with Next 16 + existing socket setup — keep optional;
  fall back to polled phase.
- **Topology viz** scope — reuse/extend the existing `FlTopology` SVG rather than building a
  world-map; cap effort.
