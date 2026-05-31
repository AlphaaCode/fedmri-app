# FedMRI — Figma Redesign & Researcher Portal

**Date:** 2026-05-31
**Status:** Approved design — Phase A ready for planning
**Figma:** https://www.figma.com/design/4JBtoO3337iKtP1ryysX15/FedMri (node 0-1)

---

## 1. Overview

FedMRI is an educational web app demonstrating federated learning (FL) for breast-MRI
molecular-subtype classification. Today it ships two web portals (Doctor, Patient), a
NestJS backend, an ML FastAPI service, an FL-coordinator FastAPI service, and an Expo
mobile app.

The Figma file defines a fuller product: the same **dark medical-tech design system**
(unchanged palette), a **left-sidebar shell** shared by all portals, a redesign of every
existing screen, ~15 new screens, and an **entirely new third actor — the Researcher**
(the FL network operator's god-view).

This effort redesigns the **web app** to match the Figma and adds the Researcher actor.
The mobile app is explicitly deferred to a later phase. Bug-fixing is handled as an
in-line QA sweep per phase (no separate bug backlog).

## 2. Goals / Non-goals

**Goals**
- Match the Figma design for every web screen, per actor.
- Add the Researcher portal and the `RESEARCHER` role end-to-end (DB → RBAC → routing → UI).
- Keep the existing design system; extend it, don't replace it.
- Preserve all five critical invariants (§7).
- Fix bugs encountered along the way (QA sweep folded into each phase).

**Non-goals (this effort)**
- Expo mobile redesign (deferred — Figma mobile frames captured for a later phase).
- Introducing a new UI framework (no shadcn/ui — see §6).
- Changing the ML model, FL math, or the `fl-model/` source (read-only).
- Real FL/inference backends — `mock` modes remain the default.

## 3. Decomposition (roadmap)

The work is too large for one spec. It splits into four phases, each with its own
spec → plan → build cycle. Sequencing (approved): **Foundation → Researcher → Doctor → Patient.**

| Phase | Scope | Nature |
|---|---|---|
| **A — Foundation & Shared Shell** | Design tokens, shared `PortalShell` + UI primitives, `RESEARCHER` role (DB/RBAC/auth/seed), role-based routing, QA baseline | Net-new infra |
| **B — Researcher Portal** | Model Performance · Network Topology · Datasets · System Logs · Support · Settings + backend aggregate endpoints | Net-new actor |
| **C — Doctor Portal** | Sidebar conversion + Dashboard, Scan Analysis, Medical History & Analytics, Documentation, Support, Settings | Redesign + new |
| **D — Patient Portal** | Dashboard, Scan/Results/Chat redesign, History Archive, Support, Privacy & Data Settings, Data Export | Redesign + new |

**This document covers the cross-cutting decisions (§4–§7) and the detailed Phase A
design (§8).** Phases B–D get their own design docs when reached.

## 4. Cross-cutting design-system decisions

- **Palette is unchanged.** The Figma "Recreate Color Palette" frame equals the live
  `globals.css` tokens: Primary `#2DD4BF` (teal), Secondary `#60A5FA` (blue), Tertiary
  `#F59E0B` (amber), Neutral `#0D1117`, Geist Sans/Mono. This is an *extension*, not a re-skin.
- **One shared shell.** All three portals use a left-sidebar layout in the Figma
  (verified: Doctor, Researcher, and Patient dashboards). A single configurable
  `PortalShell` replaces the current per-portal top-nav layouts.
- **Hand-rolled primitives** in the existing idiom (Tailwind utility classes +
  CSS-variable inline styles + framer-motion; `lucide-react` for generic nav/utility icons,
  hand-authored SVGs kept for the FedMRI brand mark and FL-specific glyphs). See §6.
- **`DESIGN_SYSTEM.md` is the source of truth** and is updated as tokens/primitives land.

## 5. Researcher domain model

The Researcher is the **FL network operator / ML researcher** — a god-view of *global*
training across all hospital nodes. They are **not** hospital-bound (`hospitalId = null`).

**Data they see (all privacy-safe, already in the schema):**
- `FlRound` — round number, strategy (FedAvg/FedProx), `globalF1Before/After`,
  `f1PerClassAfter`, `durationSeconds`, `modelVersion`, `triggeredBy` → convergence chart, training log.
- `FlContribution` — `localEpochs`, `samplesUsed`, `localF1Before/After`,
  `weightDeltaNorm` (the "gradient norm" column), `privacyBudgetUsed` → per-node participation.
- `ModelMetrics` — `accuracy`, `f1Macro`, `f1PerClass`, `strategy` → model versions, classification matrix.
- `PrivacyAuditLog` — `bytesTransmitted`, `rawDataTransmitted` (always 0) → system logs / privacy.
- `Hospital` — `flClientId`, `displayName`, `totalCases` → network-topology nodes & dataset registry.

**Data they NEVER see:** `Case.imagePath`, raw images, or any single patient's record.
This keeps invariants #1 and #2 intact by construction — the researcher works only with
aggregate and model-level data.

## 6. Technical constraints (verified against `apps/web/package.json`)

- **Next.js 16.2.6**, React 19.2.4. `apps/web/AGENTS.md` warns Next 16 has breaking
  changes vs. prior majors — **read `node_modules/next/dist/docs/` for routing/layout
  APIs before writing route or layout code.** This is a hard rule for every phase.
- **Tailwind v4** (`@import "tailwindcss"` + `@theme inline`) — no `tailwind.config.js`
  token block; tokens live in `globals.css`.
- **No shadcn/ui installed.** Do not add it. Build primitives by hand.
- Available libs to lean on: `framer-motion` (motion), `recharts` (charts — already used
  in the model page), `lucide-react` (icons), `react-dropzone`, `react-markdown`,
  `zustand` (auth/fl stores), `clsx` + `tailwind-merge` (compose a `cn()` helper).

## 7. Invariants preserved (never break)

1. `PrivacyAuditLog.rawDataTransmitted` is always `0`.
2. `HospitalSiloGuard` blocks every cross-hospital case read.
3. `CaseScope.HOSPITAL` → `uploads/hospitals/{id}/`; `CaseScope.PATIENT` → `uploads/patients/{id}/`.
4. FL round fires **after** the case response returns to the client.
5. Patient-facing copy uses **no FL jargon** ("federated learning", "gradient", "weight delta").

**Reconciliation rules (Figma is a mockup; domain truth wins):**
1. Figma "Federated ResNet-50 v4.2.1 / Round 142/500" → real **DINOv2-MIL** model name,
   FedAvg/FedProx strategies, integer `modelVersion`, real `FlRound` counts.
2. Figma classification matrix is 2×2 (Lum A/B) → render the real **4×4** matrix
   (Luminal A, Luminal B, HER2, Triple Negative). "Gradient Norm" label maps to `weightDeltaNorm`.
3. Figma patient "contributing to the global network" copy **violates invariant #5 and the
   domain** (the patient is a *consumer*, not a contributor) → rewrite to plain, accurate
   copy, e.g. "Your AI model is up to date — trained across 3 hospitals." Every such
   adaptation is flagged in the relevant phase.

## 8. Phase A — Foundation & Shared Shell (detailed design)

### A1 · Design tokens (`apps/web/app/globals.css` + `DESIGN_SYSTEM.md`)
Extend `:root` with tokens currently expressed as inline hex strings:
- Subtype colors: `--subtype-luminal-a` (=teal), `--subtype-luminal-b` (=blue),
  `--subtype-her2` (=amber), `--subtype-tn` (=coral).
- Semantic states: `--success` (teal), `--warning` (amber), `--error`/`--danger` (coral),
  `--info` (blue).
- Missing accent referenced by `DESIGN_SYSTEM.md`/`ScanUpload`: `--teal-deep`.
- Keep the existing keyframes; document radius (`rounded-lg`/`xl`/`2xl`) and the
  layer-based elevation model in comments. No Tailwind config changes (v4).
Update `DESIGN_SYSTEM.md`: new tokens, the shared-shell section, the Researcher identity.

### A2 · Shared shell + primitives (`apps/web/components/shell/`, `apps/web/components/ui/`)
- **`PortalShell`** — props: `identity` (brand block: title, subtitle/status, icon),
  `primaryAction?` (e.g. "New Scan"), `nav` (items: href, label, lucide icon),
  `footerNav` (Support · Documentation · Settings/Logout), `headerTitle`,
  `headerStatus?` (badge slot), `children`. Renders: fixed left sidebar (active item =
  teal-glow pill) + top page-header bar + scrollable main. Auth-guard + logout live here
  (lifted from the current per-portal layouts). Responsive: sidebar collapses under `lg`.
- **`components/ui/` primitives** (existing inline-CSS-var idiom):
  `Card`, `Panel` (titled card), `StatCard` (eyebrow label + accent value + hint),
  `DataTable` (header row + rows, right-alignable cols), `StatusBadge`
  (validated/disputed/pending/active variants), `Button` (variants: primary, ghost,
  teal-ghost, coral, validate), `PageHeader`, `SectionLabel` (eyebrow).
- Add `lib/cn.ts` (`clsx` + `tailwind-merge`).

### A3 · `RESEARCHER` role (backend)
- `apps/backend/prisma/schema.prisma`: add `RESEARCHER` to `enum Role`. Generate a
  Prisma migration. Researcher users have `hospitalId = null`.
- `apps/backend/prisma/seed.ts`: seed one researcher account (e.g. `researcher@fedmri.org`).
- `packages/shared/src/types/index.ts`: `UserRole` += `"RESEARCHER"`.
- `register.dto.ts` / auth: accept the new role where roles are validated.
- No new endpoints in Phase A — researcher data endpoints are Phase B. Confirm a
  `@Roles()`-style guard or equivalent exists; if RBAC is ad-hoc, document the pattern
  Phase B will follow. Researcher endpoints will read only aggregate/model tables.

### A4 · Role-based routing (web)
- New route group `apps/web/app/researcher/` with `layout.tsx` using `PortalShell`
  (placeholder index page in Phase A; real screens in Phase B).
- `apps/web/app/login/page.tsx`: after auth, route by `user.role` →
  `/doctor` · `/patient` · `/researcher`.
- `apps/web/lib/auth-store.ts` + `lib/types.ts`: include `"RESEARCHER"`.
- Doctor & Patient layouts are **not** converted to the shell in Phase A (that is Phase C/D)
  — Phase A only introduces the shell and proves it on the new `/researcher` route, so the
  two live portals keep working unchanged until their phase.

### A5 · QA baseline
- Boot web + backend (mock modes) and capture a before-state pass (login + each existing
  portal screen) so later phases can diff against it. Record any pre-existing breakage.

### Data flow (Phase A)
`login` → backend `/auth/login` returns `{ token, user: { role } }` → auth-store persists →
client routes by role. The `/researcher` route renders `PortalShell` with researcher
identity + a placeholder dashboard. No new server data paths yet.

### Testing (Phase A)
- Backend: extend `auth.e2e-spec.ts` — register/login a `RESEARCHER`, assert role echoed
  and `hospitalId` null; assert seed researcher exists.
- Web: smoke — login as each role lands on the correct portal; researcher route renders
  the shell; doctor/patient portals still render (no regression).
- Primitives: render-level checks (variants produce expected classes/markup).

### Components & isolation (Phase A)
- `PortalShell` — what: portal chrome + auth guard; deps: auth-store, next/navigation, nav config.
- `ui/*` primitives — what: presentational building blocks; deps: tokens + `cn()`; no data deps.
- Role plumbing — what: one new enum value threaded DB→shared→web; deps: Prisma, shared types.
Each unit is independently testable and understandable without reading the others' internals.

## 9. Risks

- **Next 16 API drift** — mitigated by the read-the-docs rule (§6) before route/layout edits.
- **Shell regressions on live portals** — mitigated by *not* converting Doctor/Patient in
  Phase A; they migrate in their own phases behind their own QA.
- **Prisma migration** on a Postgres dev DB — migration must be additive (enum value add)
  and reversible; seed idempotent.
- **Figma-vs-domain drift** — handled by the explicit reconciliation rules (§7); flagged per screen.

## 10. Phase A outcomes & carried-over items (added 2026-05-31)

Phase A is **complete and verified** on branch `redesign/figma-portals` (12 commits,
`4c1b6be`..`e1a74e2`). Backend e2e 7/7; web production build green (14 routes); live
browser QA confirmed: researcher login → `/researcher` renders the new sidebar shell;
doctor/patient portals unchanged (no regression). A pre-existing Next-16 build blocker
(`doctor/chat` `useSearchParams` without Suspense) was fixed during the QA sweep.

**Carried into Phase B (must-fix FIRST, before any researcher screen fetches data):**
- **[P0 privacy] Guard `CasesController` against `RESEARCHER`.** Today it is guarded only
  by `JwtAuthGuard`; a `RESEARCHER` token can reach `GET /cases`, `GET /cases/:id`,
  `POST /cases` and receive `Case.imagePath` (raw scan path). This violates the researcher
  privacy boundary (§5/§7). Fix: deny `RESEARCHER` on `cases.controller.ts` — note
  `RolesGuard` reads `context.getHandler()`, so apply `@Roles('DOCTOR','PATIENT')` at the
  **method** level (or a service-level `ForbiddenException` for `RESEARCHER`) — plus an
  e2e test asserting a researcher gets 403. This is Phase B Task 1.

**Deferred debt (address in the owning phase):**
- `packages/shared` `dist/` is stale (`UserRole` lacks `RESEARCHER`) and its `package.json`
  `types` path is wrong (tsconfig `outDir` nests under `dist/packages/shared/src/`).
  Inert now (no source imports `@fedmri/shared`); rebuild + fix `outDir` when Phase B first
  imports shared types.
- `PortalShell` active-nav uses `startsWith(href + "/")`, so the `/researcher` "Models"
  item will read active on every sub-route once Phase B adds them. Fix nav-active
  (exact-match for index items, or longest-prefix wins) in Phase B.
- Login subtitle is hardcoded "Doctor portal" for all roles — fix in the Phase C/D login
  redesign (the Figma redesigns login/signup anyway).
- Add an automated researcher **login** e2e (seed account) alongside the existing register
  test when convenient.
