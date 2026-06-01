# Phase C — Doctor Portal (design)

**Date:** 2026-06-01
**Status:** Proposed — awaiting approval
**Parent:** `docs/superpowers/specs/2026-05-31-fedmri-figma-redesign-design.md` (program roadmap)
**Builds on:** Phase A (shell, primitives, RESEARCHER role) + Phase B (researcher portal) — both complete.
**Figma:** `4JBtoO3337iKtP1ryysX15` (FedMri). Dashboard frame captured at `.scratch/figma/doctor-dashboard.png`; remaining doctor frames to be captured to `.scratch/figma/doctor-*.png` during the build.

## 1. Scope

Convert the Doctor portal from its current top-nav + right-rail layout to the shared
left-sidebar `PortalShell`, and deliver the doctor screen set per the Figma. Eight nav
destinations: **Dashboard, Scan Analysis, AI Assistant, Model Performance, Medical History,
Documentation, Support, Settings.**

**Phase C adds no backend.** Every screen composes from existing endpoints (`/cases`,
`/model/*`) + the client `fl-store`. This keeps Phase C a frontend-only phase plus two
carried-debt fixes.

## 2. Decisions (locked with the user)

1. **IA / nav** — match the Figma screens **and keep AI Assistant + Model Performance as
   their own sidebar entries** (they are not in the Figma doctor nav, but we retain them).
   "Medical History & Analytics" = the doctor's *own* caseload + case-level analytics,
   distinct from the global FL-model view in "Model Performance".
2. **FL chrome** — the shared shell is single-column (no right rail). The live `FlTopology`
   animation becomes a **panel on the Dashboard ("Network Performance" slot) and on Scan
   Analysis** (so the round animates in view right after an upload). FL phase shows as a
   compact **badge in the shell header** (`headerStatus`); the "0 bytes of patient data"
   silo assurance becomes a slim `DoctorSiloBanner` rendered on Dashboard + Scan.
3. **Backend** — none. Compose from existing endpoints; counts come from `/cases.total`.
4. **Reconciliation / honesty** — map every headline number to real domain data where a
   source exists; derive secondary widgets (notifications) from real FL events where
   possible; render any remaining non-real value as a clearly-labeled **"illustrative"**
   element — never passed off as a live metric. Consistent with Phase B.

## 3. Approach

Incremental, **shell-first, one screen per commit** (mirrors Phase B's cadence; every commit
builds & ships green): convert `doctor/layout.tsx` to `PortalShell` first (the existing
scan/chat/model screens render unchanged as children), folding the carried-debt fixes into
that conversion, then add/redesign screens one per commit. Build order in §9.

## 4. Shell conversion + routing + carried debt

### 4.1 `doctor/layout.tsx` → `PortalShell`
Replaces the current top-nav header + silo bar + `[1fr_300px]` right-rail grid with:
- `requiredRole="DOCTOR"`.
- `identity={{ title: "Hospital Silo", subtitle: "Active · data stays here", status: "ok" }}`
  (parallels researcher's "Node Alpha-7 / Synchronized"; the doctor's name already shows in
  the shell header. If the hospital `displayName` is later exposed on the JWT/user, swap it
  into `title` — minor, non-blocking).
- `primaryAction={{ label: "New Scan", href: "/doctor/scan" }}` (the Figma "New Scan" button).
- **Main nav:** Dashboard `/doctor` · Scan Analysis `/doctor/scan` · AI Assistant `/doctor/chat`
  · Model Performance `/doctor/model` · Medical History `/doctor/history` · Settings
  `/doctor/settings` (lucide icons).
- **Footer nav:** Documentation `/doctor/docs` · Support `/doctor/support` · Logout
  (`clear()` → `/login`).
- **Header:** per-screen title via `usePortalTitle`; `headerStatus` = compact `FlPhaseBadge`
  (Idle / Local training / Aggregating / Complete) reading `fl-store.phase`.

### 4.2 Routing
Add `app/doctor/page.tsx` (Dashboard). Change the doctor landing from `/doctor/scan` to
`/doctor` in **two** places: `app/login/page.tsx` and `PortalShell`'s `ROLE_HOME` map.

### 4.3 FL chrome extraction
Extract today's silo-bar logic into a small `DoctorSiloBanner` and a header `FlPhaseBadge`,
both reading `fl-store`. **Preserve the existing FL socket subscription** that feeds
`fl-store` (locate where it mounts today before converting — the live round animation on
scan upload, invariant #4, must keep working).

### 4.4 Carried debt folded in
- **Nav-active fix** (`PortalShell`): change active detection to **longest-matching-href
  wins** — only the nav item whose `href` is the longest prefix of `pathname` (by `===` or
  `startsWith(href + "/")`) is active. Fixes the `/doctor` and `/researcher` index items
  reading active on every sub-route (retroactively cleans the researcher portal too).
- **Doctor landing** → Dashboard (§4.2).
- **Full login Figma redesign is deferred** (its own pass, the Figma redesigns login/signup);
  Phase C only changes the redirect target.
- **`packages/shared` dist rebuild is NOT needed** — the web doctor screens import the local
  `@/lib/types`, not `@fedmri/shared`.

## 5. Screens

All are client pages under `app/doctor/`, using `PortalShell` (via the layout), the Phase A
primitives (`Card`, `Panel`, `StatCard`, `DataTable`, `StatusBadge`, `Button`, `PageHeader`,
`SectionLabel`), existing doctor components, and `usePortalTitle`.

### 5.1 Dashboard (`/doctor`, index) — `usePortalTitle("Dashboard")`
Ref `.scratch/figma/doctor-dashboard.png`. Top-to-bottom:
1. **Silo banner** — `DoctorSiloBanner` (phase-aware).
2. **Stat row — 3 `StatCard`s:** Active Analyses = `/cases.total` · FL Model = "v10 · round
   10/10" (`/model/comparison` + `fl-store`) · Global F1 Macro = 0.41 (hint: "737 patients
   protected") — replacing Figma's "System Latency".
3. **Recent Studies `DataTable`** (`/cases?limit=5`): Case ID (mono `#FED-…`) · Subtype
   (subtype-colored) · AI Confidence (% colored) · Status (`StatusBadge`: Validated/Disputed
   from feedback if present, else "Awaiting review") · Action (→ `/doctor/chat?caseId=`).
   "View all →" → `/doctor/history`.
4. **Right column:** Network Performance panel = the **`FlTopology`** widget + caption
   "Model v10 · trained across 3 hospitals"; Notifications panel = items derived from
   `fl-store` (e.g. "Round complete — Model v10 (+Δ F1)", "0 bytes of patient data
   transmitted"); any non-derivable item carries an "illustrative" tag.
5. **Active Analysis panel** (most recent case via `/cases?limit=1`): reuse `AttentionOverlay`
   + a prediction summary; copy reconciled to "cross-referenced against the model trained
   across **3 hospitals (737 cases)**" (not "4,200 peer-validated studies"). Actions reuse
   the existing feedback flow — **Accept AI Findings** → validate, **Manual Override** →
   dispute. Empty state when `total === 0` ("Upload a scan to begin").

### 5.2 Scan Analysis (`/doctor/scan`, redesign) — `usePortalTitle("Scan Analysis")`
Keep the proven flow: `ScanUpload` → on result → `MedicationCard` + (`PredictionCard` ∥
`AttentionOverlay`, 2-col) → actions. Deltas: wrap in `Panel`/`Card` primitives; add
`PageHeader` + slim `DoctorSiloBanner`; place a compact **`FlTopology`** panel here so the
doctor watches the round animate after upload; actions become `Button` variants
("Discuss with AI assistant →" teal-ghost + "Analyse another scan" ghost). Reconcile any
inflated Figma copy → real.

### 5.3 AI Assistant (`/doctor/chat`, convert) — `usePortalTitle("AI Assistant")`
Minimal change. Keep `ChatPanel` (doctor mode, `DOCTOR_STARTERS`, case-context banner,
Suspense). Add `PageHeader`; **recompute the `ChatPanel` height** (the old
`h-[calc(100vh-180px)]` was tuned for top-nav + silo bar; the shell header is `h-14` — retune,
≈ `100vh-160px`, so the input bar stays visible). Functionality identical.

### 5.4 Model Performance (`/doctor/model`, convert) — `usePortalTitle("Model Performance")`
The global FL-model view. Convert to shell; **replace the page's locally-defined
`Stat`/`Panel`/`Skeleton` helpers with the shared `StatCard`/`Panel` primitives** (dedupe).
Keep `ConvergenceChart`, `PerClassChart`, `ConfusionMatrix`, comparison stats, and the
privacy-framing box. Data unchanged (`/model/history|per-class|confusion-matrix|comparison`).

### 5.5 Medical History (`/doctor/history`, new) — `usePortalTitle("Medical History")`
The doctor's own caseload + analytics. `PageHeader` "Medical History & Analytics".
- **Analytics row** (computed client-side from `/cases`): Total studies (`total`) · Subtype
  distribution (counts of `predictedSubtype`, subtype-colored mini bar) · Validation rate
  (validated/disputed/awaiting from feedback if present) · Avg confidence.
- **Case history `DataTable`** (paginated, `/cases?page&limit`): Date · Case ID (mono) ·
  Subtype (colored) · Confidence (%) · Model v · Status (`StatusBadge`) · Action
  (→ `/doctor/chat?caseId=`). Pagination controls.
- Empty state for the 0-case doctor. HospitalSiloGuard-scoped — no cross-hospital data.

### 5.6 Documentation (`/doctor/docs`, new) — `usePortalTitle("Documentation")`
Static cards in the design idiom: Getting started · The 4 molecular subtypes (from
`SUBTYPE_PLAIN`, subtype-colored) · How federated learning works here (3-hospital diagram +
privacy invariants; doctor audience, FL terms allowed) · Reading the attention map · Model &
metrics (links to Model Performance). May use `react-markdown` (existing dep). No backend.
Real facts only (DINOv2-MIL, 3 hospitals, 10 rounds, F1 0.41).

### 5.7 Support (`/doctor/support`, new) — `usePortalTitle("Support")`
Mirrors the researcher Support idiom: Contact card (mailto) · FAQ accordion (3–4 Q/A:
predictions, privacy, FL, disputing a result) · Documentation link. No backend.

### 5.8 Settings (`/doctor/settings`, new) — `usePortalTitle("Settings")`
Read-mostly, mirrors researcher Settings: Identity (name/email/role/hospital from
`useAuthStore`) · Network (API endpoint from `NEXT_PUBLIC_API_URL`, Mode mock/real) ·
demo-only visual toggles (labeled "demo") · coral Sign-out (`clear()` → `/login`). No
mutation backend.

## 6. Figma → domain reconciliation (Phase C)

| Figma (mockup) | Render instead (real) |
|---|---|
| "4,200 peer-validated studies" / "1,248 nodes" | model trained across **3 hospitals (737 cases)** |
| "System Latency 42ms" stat | **Global F1 Macro 0.41** (real) |
| "Active Analyses 14" | real `/cases.total` |
| "Global Consensus Pending 08" | **Model v10 · round 10/10** |
| "Federated ResNet-50 v4.2.1" | **DINOv2-MIL**, integer `modelVersion` |
| 2×2 classification matrix | real **4×4** (existing `ConfusionMatrix`) |
| Recent Studies generic patient IDs | real case IDs, HospitalSiloGuard-scoped |
| Notifications feed | derived from `fl-store` events; non-derivable → "illustrative" tag |
| "Accept AI Findings / Manual Override" | wired to the existing validate/dispute feedback flow |

## 7. Data sources (no new backend)

- `GET /cases?page&limit` → `{ data: CaseResult[], total: number }` (HospitalSiloGuard-scoped).
  Powers Dashboard recent slice + counts and Medical History (list + analytics).
  `CaseResult` = `{ id, scope, predictedSubtype, confidence, probs[], modelVersion, hospitalId,
  userId, createdAt }`. **Build-time check:** confirm whether `findAll` returns a
  feedback/validation field for the Status column; if not, render "Awaiting review" (honest)
  — do **not** silently add backend without flagging.
- `GET /model/comparison|history|per-class|confusion-matrix` → Model Performance + dashboard F1.
- `fl-store` (client) → `phase`, `modelVersion`, `lastF1After`, `lastF1Delta` for the header
  badge, silo banner, topology, and notifications.
- `GET /cases/:id/attention` (via `AttentionOverlay`) for the Active Analysis panel.

## 8. Invariants (unchanged)

1. `PrivacyAuditLog.rawDataTransmitted` stays 0 — Phase C writes nothing here.
2. `HospitalSiloGuard` — doctor `/cases` is already scoped; no screen calls cross-hospital data.
3. Storage paths — untouched.
4. FL round fires **after** the case response — untouched; the existing scan→round flow and
   the `fl-store` socket subscription are preserved through the layout conversion.
5. Patient FL-jargon rule — N/A here (doctor portal); Documentation/Support copy stays
   factually accurate (real model/round/F1 numbers).

## 9. Build order (one commit each)

1. Shell conversion + nav-active fix + routing + FL-chrome extraction (+ `/doctor` Dashboard route).
2. Dashboard.
3. Scan Analysis redesign.
4. AI Assistant convert.
5. Model Performance convert (dedupe into shared primitives).
6. Medical History.
7. Documentation.
8. Support.
9. Settings.
10. QA browser pass + regression.

## 10. Testing

- **No new backend** → no new e2e. Run existing backend e2e (cases/auth) to confirm **no
  regression** (`--forceExit --runInBand`).
- **Web:** `npm run build` green after each screen. **Browser QA** (`/browse`): login as
  doctor, visit all 8 screens — screenshot, console clean, key elements present; verify the
  **FL topology animates on scan upload**, empty states render for the 0-case doctor, and
  **nav-active** is correct (incl. researcher portal regression). Confirm patient + researcher
  portals unaffected.

## 11. Risks

- **0-case doctor** — `dr.benali` has `total: 0`, so Dashboard/History/Active-Analysis render
  empty. Designed-for (empty states). Populating demo cases is **not free**: a scan upload
  fires an FL round (invariant #4) and re-inflates researcher metrics — do any case-seeding
  deliberately and idempotently, outside this phase.
- **FL socket subscription** must survive the layout conversion (§4.3) or the live animation
  breaks silently.
- **Next 16** — read `node_modules/next/dist/docs/` before route/layout edits (`apps/web/AGENTS.md`).
- **ChatPanel height** retune (§5.3) — easy to leave the input bar clipped; verify in browser.
- **Status column** depends on whether `/cases` returns feedback — resolve at build (§7).
