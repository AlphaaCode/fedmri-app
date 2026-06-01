# Phase C — Doctor Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Doctor portal to the shared `PortalShell` sidebar and deliver its 8 screens (Dashboard, Scan Analysis, AI Assistant, Model Performance, Medical History, Documentation, Support, Settings) on real data, composing from existing endpoints — no new backend.

**Architecture:** Replace the doctor's top-nav + right-rail `layout.tsx` with `PortalShell` (researcher-portal pattern), fold in two carried-debt fixes (shell nav-active longest-prefix; doctor landing → Dashboard), extract the FL silo bar/topology into reusable doctor chrome, then build/redesign one screen per commit. All screens read existing `/cases` + `/model/*` + the client `fl-store`.

**Tech Stack:** Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4 + framer-motion + recharts + lucide-react + zustand.

**Spec:** `docs/superpowers/specs/2026-06-01-phase-c-doctor-portal-design.md`.

---

## Conventions

- Branch `redesign/figma-portals` (continue). **Frontend-only — NO backend changes, NO new e2e.** Verify each task with `cd apps/web && npm run build` (must be green) + browser QA at the end. There is **no web unit-test runner**.
- **Next 16:** read `node_modules/next/dist/docs/` before editing any route/layout if anything Next-16-specific arises (`apps/web/AGENTS.md`).
- **Reuse, do not rebuild:** Phase A primitives `@/components/ui/*` (`PageHeader`, `Panel`, `StatCard`, `DataTable`, `StatusBadge`, `Button`, `SectionLabel`); existing doctor components `ScanUpload`, `PredictionCard`, `AttentionOverlay`, `MedicationCard`, `ConvergenceChart`, `PerClassChart`, `ConfusionMatrix`, `FlTopology`, `ChatPanel`; `usePortalTitle`; `apiFetch`.
- **FL socket is untouched:** the subscription that feeds `fl-store` lives in `app/providers.tsx` (`role === "DOCTOR"` → `getSocket(token)`), independent of `doctor/layout.tsx`. `FlTopology()` is self-contained (reads `fl-store`, takes no props). Converting the layout does **not** break the live round animation (invariant #4).
- **Reconciliation (domain truth wins):** 3 hospitals (A=247, B=312, C=178; Σ 737), breast DCE-MRI, 4 PAM50 subtypes, **DINOv2-MIL**, model **v10**, **10 FL rounds**, F1 macro **0.41**, real 4×4 confusion matrix. Map Figma's inflated numbers to these. Non-real widgets are labeled **"illustrative"**.
- **Commit after every task. Stage explicit paths only** (the repo tracks `dist/` + `node_modules/.prisma` — never `git add -A`).
- Optional per screen: capture its Figma frame to `.scratch/figma/doctor-<screen>.png` (file `4JBtoO3337iKtP1ryysX15`) as a visual aid before building.

## Data contracts (authoritative — screens depend on these)

```
GET /cases?page&limit → { data: CaseResult[], total: number }   // HospitalSiloGuard-scoped
CaseResult = { id, scope:"HOSPITAL"|"PATIENT", predictedSubtype:Subtype, confidence:number,
               probs:number[], modelVersion:number, hospitalId?:string|null, userId, createdAt }
GET /model/comparison → { centralized:{f1Macro}, fedprox:{f1Macro}, gap, privacyCost:{patientsProtected}, totalCases }
GET /model/history | /model/per-class | /model/confusion-matrix → consumed as-is by the existing chart components
fl-store (client) → { phase:"idle"|"local_training"|"aggregating"|"complete", modelVersion, lastF1After, lastF1Delta }
```
**Status column caveat:** `CaseResult` (the web type) has **no** validation-status field. At build, inspect `apps/backend/src/cases/cases.service.ts` `findAll`: **if** it already returns a feedback/validation field, map `VALIDATE→"validated"`, `DISPUTE→"disputed"`; **else** render `StatusBadge status="pending" label="Awaiting review"` for all rows (honest). **Do not** add backend without flagging.

---

## Task 1 — Shell conversion + nav-active fix + routing + FL chrome

**Files:**
- Modify: `apps/web/components/shell/PortalShell.tsx`
- Modify: `apps/web/app/doctor/layout.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Create: `apps/web/components/doctor/DoctorSiloBanner.tsx`
- Create: `apps/web/components/doctor/FlPhaseBadge.tsx`
- Create: `apps/web/app/doctor/page.tsx` (Dashboard scaffold; filled in Task 2)

- [ ] **Step 1 — Fix nav-active (longest-prefix) in `PortalShell.tsx`.** After the `const chromeTitle = usePortalChrome((s) => s.title);` line, add:

```tsx
  // Longest-matching-href wins → index items (/doctor, /researcher) no longer
  // read active on every sub-route.
  const activeHref = nav.reduce<string | null>((best, item) => {
    const matches = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
    if (!matches) return best;
    return !best || item.href.length > best.length ? item.href : best;
  }, null);
```

Then inside `nav.map(...)`, replace:
```tsx
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
```
with:
```tsx
            const active = item.href === activeHref;
```

- [ ] **Step 2 — Update `ROLE_HOME` in `PortalShell.tsx`.** Change `DOCTOR: "/doctor/scan"` to `DOCTOR: "/doctor"`.

- [ ] **Step 3 — Create `apps/web/components/doctor/FlPhaseBadge.tsx`:**

```tsx
"use client";

import { useFlStore } from "@/lib/fl-store";

const LABEL: Record<string, string> = {
  idle: "Idle",
  local_training: "Local training",
  aggregating: "Aggregating",
  complete: "Synced",
};

export function FlPhaseBadge() {
  const phase = useFlStore((s) => s.phase);
  const active = phase === "local_training" || phase === "aggregating";
  const color = active ? "var(--amber)" : "var(--teal)";
  return (
    <span
      className="text-[11px] px-2 py-1 rounded-full inline-flex items-center gap-1.5"
      style={{ background: active ? "#f59e0b15" : "var(--teal-glow)", color, border: `1px solid ${active ? "#f59e0b40" : "#2dd4bf40"}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {LABEL[phase] ?? phase}
    </span>
  );
}
```

- [ ] **Step 4 — Create `apps/web/components/doctor/DoctorSiloBanner.tsx`** (extracted from the old layout's silo bar):

```tsx
"use client";

import { useFlStore } from "@/lib/fl-store";

export function DoctorSiloBanner() {
  const phase = useFlStore((s) => s.phase);
  const active = phase === "local_training" || phase === "aggregating";
  return (
    <div
      className="px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2"
      style={{
        background: active ? "#f59e0b15" : "var(--teal-glow)",
        color: active ? "#fbbf24" : "#99f6e4",
        border: "1px solid var(--border)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1L10 3v4c0 2.2-1.6 4-4 4.5C3.6 11 2 9.2 2 7V3L6 1z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      {phase === "idle" && "Your hospital silo is active — data stays here"}
      {phase === "local_training" && "FL round running — only model weights leaving hospital, 0 bytes of patient data"}
      {phase === "aggregating" && "Aggregating updates — still 0 bytes of patient data transmitted"}
      {phase === "complete" && "Round complete — your hospital silo remained intact throughout"}
    </div>
  );
}
```

- [ ] **Step 5 — Replace `apps/web/app/doctor/layout.tsx` entirely:**

```tsx
"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ScanLine, MessageSquare, BarChart3, History, Settings, BookOpen, HelpCircle, LogOut } from "lucide-react";
import { PortalShell } from "@/components/shell/PortalShell";
import { FlPhaseBadge } from "@/components/doctor/FlPhaseBadge";
import { useAuthStore } from "@/lib/auth-store";

export default function DoctorLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  return (
    <PortalShell
      requiredRole="DOCTOR"
      identity={{ title: "Hospital Silo", subtitle: "Active · data stays here", status: "ok" }}
      primaryAction={{ label: "New Scan", href: "/doctor/scan", icon: ScanLine }}
      headerStatus={<FlPhaseBadge />}
      nav={[
        { href: "/doctor", label: "Dashboard", icon: LayoutDashboard },
        { href: "/doctor/scan", label: "Scan Analysis", icon: ScanLine },
        { href: "/doctor/chat", label: "AI Assistant", icon: MessageSquare },
        { href: "/doctor/model", label: "Model Performance", icon: BarChart3 },
        { href: "/doctor/history", label: "Medical History", icon: History },
        { href: "/doctor/settings", label: "Settings", icon: Settings },
      ]}
      footerNav={[
        { href: "/doctor/docs", label: "Documentation", icon: BookOpen },
        { href: "/doctor/support", label: "Support", icon: HelpCircle },
        { label: "Logout", icon: LogOut, onClick: () => { clear(); router.replace("/login"); } },
      ]}
    >
      {children}
    </PortalShell>
  );
}
```

- [ ] **Step 6 — Update doctor landing in `apps/web/app/login/page.tsx`.** Change `router.replace("/doctor/scan");` to `router.replace("/doctor");`.

- [ ] **Step 7 — Create `apps/web/app/doctor/page.tsx`** (scaffold; Task 2 fills it):

```tsx
"use client";

import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";

export default function DoctorDashboardPage() {
  usePortalTitle("Dashboard");
  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader title="Clinical Overview" description="Federated diagnostics — your hospital silo" />
      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>Dashboard panels land in Task 2.</div>
    </div>
  );
}
```

- [ ] **Step 8 — Build:** `cd apps/web && npm run build` → green. Sidebar shows the 6 nav items + 3 footer items; `/doctor` renders; existing `/doctor/scan|chat|model` render inside the shell.
- [ ] **Step 9 — Commit:**
```bash
git add apps/web/components/shell/PortalShell.tsx apps/web/app/doctor/layout.tsx apps/web/app/login/page.tsx apps/web/components/doctor apps/web/app/doctor/page.tsx
git commit -m "feat(web): convert doctor portal to PortalShell + nav-active longest-prefix fix + FL chrome"
```

---

## Task 2 — Dashboard (`/doctor`)

**Files:**
- Create: `apps/web/lib/doctor-api.ts`
- Modify: `apps/web/app/doctor/page.tsx` (replace the scaffold)

- [ ] **Step 1 — Create `apps/web/lib/doctor-api.ts`** (the typed compose-from-existing layer, reused by Medical History):

```ts
import { apiFetch } from "@/lib/api";
import type { CaseResult } from "@/lib/types";

export interface CasesResponse {
  data: CaseResult[];
  total: number;
}

export function getCases(params?: { page?: number; limit?: number }): Promise<CasesResponse> {
  const p = new URLSearchParams();
  if (params?.page !== undefined) p.set("page", String(params.page));
  if (params?.limit !== undefined) p.set("limit", String(params.limit));
  const qs = p.toString() ? `?${p.toString()}` : "";
  return apiFetch<CasesResponse>(`/cases${qs}`);
}

export interface ModelComparison {
  centralized: { f1Macro: number };
  fedprox: { f1Macro: number };
  gap: number;
  privacyCost: { patientsProtected: number };
  totalCases: number;
}

export function getModelComparison(): Promise<ModelComparison> {
  return apiFetch<ModelComparison>("/model/comparison");
}
```

- [ ] **Step 2 — Replace `apps/web/app/doctor/page.tsx`** with the full Dashboard:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useFlStore } from "@/lib/fl-store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FlTopology } from "@/components/FlTopology";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";
import { getCases, getModelComparison, type CasesResponse, type ModelComparison } from "@/lib/doctor-api";
import { SUBTYPE_COLOR, type CaseResult, type Subtype } from "@/lib/types";

const shortId = (id: string) => `#FED-${id.slice(0, 6).toUpperCase()}`;

export default function DoctorDashboardPage() {
  usePortalTitle("Dashboard");
  const [cases, setCases] = useState<CasesResponse | null>(null);
  const [model, setModel] = useState<ModelComparison | null>(null);
  const flModelVersion = useFlStore((s) => s.modelVersion);

  useEffect(() => {
    getCases({ limit: 5 }).then(setCases).catch(() => setCases({ data: [], total: 0 }));
    getModelComparison().then(setModel).catch(() => setModel(null));
  }, []);

  const recent = cases?.data ?? [];
  const total = cases?.total ?? 0;
  const f1 = model?.fedprox.f1Macro ?? 0.41;
  const protectedCount = model?.privacyCost.patientsProtected ?? 737;
  const version = flModelVersion ?? 10;

  const columns: Column<CaseResult>[] = [
    { key: "id", header: "Case", render: (r) => <span className="font-mono text-xs">{shortId(r.id)}</span> },
    { key: "subtype", header: "Subtype", render: (r) => <span style={{ color: SUBTYPE_COLOR[r.predictedSubtype as Subtype] }}>{r.predictedSubtype}</span> },
    { key: "conf", header: "AI Confidence", align: "right", render: (r) => `${Math.round(r.confidence * 100)}%` },
    { key: "status", header: "Status", render: () => <StatusBadge status="pending" label="Awaiting review" /> },
    { key: "go", header: "", align: "right", render: (r) => <Link href={`/doctor/chat?caseId=${r.id}`} className="text-xs" style={{ color: "var(--teal)" }}>Discuss →</Link> },
  ];

  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader title="Clinical Overview" description="Federated diagnostics — your hospital silo" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="Active Analyses" value={total} accent="var(--teal)" hint="In your hospital silo" />
        <StatCard label="FL Model" value={`v${version}`} accent="var(--blue-accent)" hint="Round 10 / 10" />
        <StatCard label="Global F1 Macro" value={f1.toFixed(2)} accent="var(--amber)" hint={`${protectedCount} patients protected`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Panel title="Recent Studies" action={<Link href="/doctor/history" className="text-xs" style={{ color: "var(--teal)" }}>View all →</Link>}>
          <DataTable columns={columns} rows={recent} getRowKey={(r) => r.id} empty="No studies yet — upload a scan to begin." />
        </Panel>
        <Panel title="Network Performance" subtitle={`Model v${version} · trained across 3 hospitals`}>
          <FlTopology />
        </Panel>
      </div>

      {recent[0] ? (
        <Panel title="Active Analysis" subtitle={shortId(recent[0].id)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AttentionOverlay caseId={recent[0].id} />
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              AI cross-referenced this scan against the model trained across 3 hospitals (737 cases).
              Predicted subtype{" "}
              <span style={{ color: SUBTYPE_COLOR[recent[0].predictedSubtype as Subtype] }}>{recent[0].predictedSubtype}</span>
              {" "}· confidence {Math.round(recent[0].confidence * 100)}%.
              <div className="mt-3">
                <Link href={`/doctor/chat?caseId=${recent[0].id}`} className="text-xs px-3 py-2 rounded-lg inline-block" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>Discuss with AI assistant →</Link>
              </div>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Active Analysis">
          <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>Upload a scan to begin.</div>
        </Panel>
      )}
    </div>
  );
}
```

- [ ] **Step 3 — Build:** `cd apps/web && npm run build` → green. (With `dr.benali`'s 0 cases, the table shows the empty message and the Active Analysis shows the empty state — correct.)
- [ ] **Step 4 — Commit:**
```bash
git add apps/web/lib/doctor-api.ts apps/web/app/doctor/page.tsx
git commit -m "feat(web): doctor Dashboard (clinical overview) + doctor-api compose layer"
```

---

## Task 3 — Scan Analysis redesign (`/doctor/scan`)

**Files:** Modify `apps/web/app/doctor/scan/page.tsx`.

- [ ] **Step 1 — Replace the page** keeping the proven `ScanUpload → result` flow, re-housed in shell primitives + FL chrome:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { usePortalTitle } from "@/lib/use-portal-title";
import { useToastStore } from "@/components/ToastProvider";
import { ScanUpload } from "@/components/ScanUpload";
import { PredictionCard } from "@/components/PredictionCard";
import { MedicationCard } from "@/components/MedicationCard";
import { AttentionOverlay } from "@/components/AttentionOverlay";
import { FlTopology } from "@/components/FlTopology";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { DoctorSiloBanner } from "@/components/doctor/DoctorSiloBanner";
import type { CaseResult } from "@/lib/types";

export default function ScanPage() {
  usePortalTitle("Scan Analysis");
  const [result, setResult] = useState<CaseResult | null>(null);
  const push = useToastStore((s) => s.push);

  return (
    <div className="space-y-4">
      <DoctorSiloBanner />
      <PageHeader title="Scan Analysis" description="Upload a breast MRI scan — AI predicts molecular subtype in under 4 seconds" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4 min-w-0">
          <ScanUpload onUploaded={(r) => { setResult(r); push(`Prediction ready — ${r.predictedSubtype}`, "success"); }} />

          <AnimatePresence>
            {result && (
              <motion.div key={result.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="space-y-4">
                <MedicationCard subtype={result.predictedSubtype} />
                <div className="grid md:grid-cols-2 gap-4">
                  <PredictionCard result={result} onFeedbackSubmitted={() => {}} />
                  <AttentionOverlay caseId={result.id} />
                </div>
                <div className="flex justify-end gap-2">
                  <Link href={`/doctor/chat?caseId=${result.id}`} className="rounded-lg text-sm font-semibold px-4 py-2" style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>Discuss with AI assistant →</Link>
                  <Button variant="ghost" onClick={() => setResult(null)}>Analyse another scan</Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Panel title="Federated Training" subtitle="Round fires automatically on upload">
          <FlTopology />
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 2 — Build:** `cd apps/web && npm run build` → green.
- [ ] **Step 3 — Commit:**
```bash
git add apps/web/app/doctor/scan/page.tsx
git commit -m "feat(web): redesign doctor Scan Analysis into shell + live FL topology panel"
```

---

## Task 4 — AI Assistant convert (`/doctor/chat`)

**Files:**
- Modify: `apps/web/components/ChatPanel.tsx` (add optional `heightClass` — non-breaking for patient)
- Modify: `apps/web/app/doctor/chat/page.tsx`

- [ ] **Step 1 — Add an optional `heightClass` prop to `ChatPanel`.** In the `Props` interface add `heightClass?: string;`. In the signature default it: `export function ChatPanel({ role, caseId, starters, caseContext, heightClass = "h-[calc(100vh-180px)]" }: Props) {`. At line 85 replace the literal `h-[calc(100vh-180px)]` inside the container `className` with `${heightClass}` (template literal). Patient screens omit the prop → unchanged.

- [ ] **Step 2 — Update `apps/web/app/doctor/chat/page.tsx`** to set the portal title, add a `PageHeader`, and pass a shell-fit height:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";

const DOCTOR_STARTERS = [
  "Why was this classified as Luminal A?",
  "How confident should I be in this result?",
  "What does the attention map highlight?",
  "How did the FL round improve this prediction?",
];

function DoctorChatInner() {
  usePortalTitle("AI Assistant");
  const params = useSearchParams();
  const caseId = params.get("caseId") ?? undefined;
  const [ctx, setCtx] = useState<{ subtype: string; confidence: number; modelVersion: number } | null>(null);

  useEffect(() => {
    if (!caseId) return;
    apiFetch<any>(`/cases/${caseId}`).then((c) => setCtx({ subtype: c.predictedSubtype, confidence: c.confidence, modelVersion: c.modelVersion })).catch(() => {});
  }, [caseId]);

  return (
    <div>
      <PageHeader title="Clinical AI assistant" description="Ask about predictions, the FL training process, or how to interpret results" />
      <ChatPanel role="doctor" caseId={caseId} starters={DOCTOR_STARTERS} caseContext={ctx} heightClass="h-[calc(100vh-12rem)]" />
    </div>
  );
}

export default function DoctorChatPage() {
  return (
    <Suspense fallback={null}>
      <DoctorChatInner />
    </Suspense>
  );
}
```

- [ ] **Step 3 — Build:** `cd apps/web && npm run build` → green.
- [ ] **Step 4 — Commit:**
```bash
git add apps/web/components/ChatPanel.tsx apps/web/app/doctor/chat/page.tsx
git commit -m "feat(web): convert doctor AI Assistant to shell (ChatPanel heightClass prop)"
```

---

## Task 5 — Model Performance convert + dedupe (`/doctor/model`)

**Files:** Modify `apps/web/app/doctor/model/page.tsx`.

- [ ] **Step 1 — Convert to shell + replace the page-local `Stat`/`Panel`/`Skeleton` helpers with shared primitives.** At the top add imports:
```tsx
import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { StatCard } from "@/components/ui/StatCard";
```
Delete the local `function Stat(...)`, `function Panel(...)`, and `function Skeleton(...)` definitions at the bottom of the file. Add `usePortalTitle("Model Performance");` as the first line inside the component. Replace the page-title `<div>` block with `<PageHeader title="Model Performance" description="Federated vs centralized convergence, per-class F1, and confusion matrix" />`.

- [ ] **Step 2 — Map the comparison cards to `StatCard`.** Replace each `<Stat label=… value=… color=… hint=… />` with `<StatCard label=… value=… accent=… hint=… />` (prop rename `color`→`accent`). Keep the four cards: Centralized F1 (`accent="#f59e0b"`), FedProx F1 (`accent="#2dd4bf"`), Privacy gap (conditional accent), Patients protected (`accent="#60a5fa"`).

- [ ] **Step 3 — Use shared `Panel`** for the three chart panels (`title`/`subtitle` props already match). Keep `ConvergenceChart`, `PerClassChart`, `ConfusionMatrix` and the privacy-framing box unchanged. Replace `<Skeleton />` fallbacks with `<div className="h-[260px] rounded skeleton" />`.

- [ ] **Step 4 — Build:** `cd apps/web && npm run build` → green; the four charts/cards still render from `/model/*`.
- [ ] **Step 5 — Commit:**
```bash
git add apps/web/app/doctor/model/page.tsx
git commit -m "refactor(web): convert doctor Model Performance to shell + shared primitives"
```

---

## Task 6 — Medical History (`/doctor/history`)

**Files:** Create `apps/web/app/doctor/history/page.tsx`.

Reuse `getCases` from `lib/doctor-api.ts` (Task 2). The doctor's own caseload + analytics; HospitalSiloGuard-scoped.

- [ ] **Step 1 — Build the screen** with this structure (assemble JSX from the primitives + the analytics below; capture `.scratch/figma/doctor-history.png` first if available):
  - `usePortalTitle("Medical History")`; `PageHeader title="Medical History & Analytics" description="Your hospital's case archive and outcomes"`.
  - **Load:** `useEffect` → `getCases({ page, limit: 10 })` into state `{ data, total }`; keep a `page` state for pagination. Also fetch a wider slice once (`getCases({ limit: 200 })`) for the analytics aggregates, OR aggregate from the loaded page — prefer one analytics fetch at `limit: 200` into `allCases`.
  - **Analytics row — 4 `StatCard`s, computed client-side from `allCases.data`:**
    - Total studies = `total`.
    - Subtype distribution → for the value, render the dominant subtype + count; OR a compact inline bar (4 segments colored by `SUBTYPE_COLOR`, widths = share of each `predictedSubtype`). Counts: `allCases.data.reduce` by `predictedSubtype`.
    - Avg confidence = `mean(confidence) * 100` → `XX%`.
    - Latest model = `v{max(modelVersion)}`.
  - **Case `DataTable`** (`columns: Column<CaseResult>[]`): Date (`new Date(r.createdAt).toLocaleDateString()`) · Case (`#FED-…` mono) · Subtype (subtype-colored) · Confidence (`%`, `align:"right"`) · Model (`v{r.modelVersion}`) · Status (`StatusBadge` — per the Status caveat) · Action (`Link → /doctor/chat?caseId=`). `getRowKey={(r) => r.id}`, `empty="No studies yet — upload a scan to begin."`.
  - **Pagination:** two `Button variant="ghost"` (Prev/Next) gated on `page` and `total / limit`; refetch on change.
- [ ] **Step 2 — Build:** `cd apps/web && npm run build` → green; empty states render for the 0-case doctor.
- [ ] **Step 3 — Commit:**
```bash
git add apps/web/app/doctor/history/page.tsx
git commit -m "feat(web): doctor Medical History & Analytics (case archive + client-side analytics)"
```

---

## Task 7 — Documentation (`/doctor/docs`)

**Files:** Create `apps/web/app/doctor/docs/page.tsx`.

- [ ] **Step 1 — Static screen** in the design idiom (no backend):
  - `usePortalTitle("Documentation")`; `PageHeader title="Documentation" description="How FedMRI works — for clinicians"`.
  - A grid of `Panel`s:
    1. **Getting started** — how to upload a scan, read the result, discuss with the assistant.
    2. **Molecular subtypes** — map over `SUBTYPES` from `@/lib/types`, each row showing the subtype name in `SUBTYPE_COLOR[s]` + `SUBTYPE_PLAIN[s]` description.
    3. **How federated learning works here** — plain explanation: the model trains across **3 hospitals**, **only weights leave each silo (0 bytes of patient data)**, FedAvg rounds 1–5 then FedProx 6–10, current **model v10, F1 0.41**. (Doctor audience — FL terms allowed.)
    4. **Reading the attention map** — what the jet-colormap overlay means.
    5. **Model & metrics** — one-line summary + `Link` to `/doctor/model`.
  - Real facts only (DINOv2-MIL; 3 hospitals; 10 rounds; F1 0.41). May use `react-markdown` for prose blocks (already a dep) — optional.
- [ ] **Step 2 — Build:** green. **Step 3 — Commit:**
```bash
git add apps/web/app/doctor/docs/page.tsx
git commit -m "feat(web): doctor Documentation screen"
```

---

## Task 8 — Support (`/doctor/support`)

**Files:** Create `apps/web/app/doctor/support/page.tsx`.

- [ ] **Step 1 — Static screen** mirroring the researcher Support idiom (`apps/web/app/researcher/support/page.tsx` is the template):
  - `usePortalTitle("Support")`; `PageHeader title="Support" description="Help with predictions, privacy, and the federated network"`.
  - **Contact** `Panel` — `mailto:` link (e.g. `support@fedmri.local`) + response-time note.
  - **FAQ** `Panel` — a small accordion (local `useState` open index) with 3–4 Q/A: "How accurate are the predictions?", "Does any patient data leave my hospital?" (answer: no — 0 bytes, only weights), "How do I dispute a result?", "What is the model trained on?" (3 hospitals, 737 cases, DINOv2-MIL).
  - **Documentation** `Panel` — `Link` to `/doctor/docs`.
- [ ] **Step 2 — Build:** green. **Step 3 — Commit:**
```bash
git add apps/web/app/doctor/support/page.tsx
git commit -m "feat(web): doctor Support screen"
```

---

## Task 9 — Settings (`/doctor/settings`)

**Files:** Create `apps/web/app/doctor/settings/page.tsx`.

- [ ] **Step 1 — Read-mostly screen** — copy the structure of `apps/web/app/researcher/settings/page.tsx` (reuse its `InfoRow` + `ToggleRow` local helpers verbatim) and adapt the content:
  - `usePortalTitle("Settings")`; `PageHeader title="Settings" description="Account and network configuration."`.
  - **Identity** `Panel` — `InfoRow`s: Name (`user?.name`), Email (`user?.email`), Hospital (`user?.hospitalId ?? "—"`). (No silo name client-side; show the id, or "Your hospital silo".)
  - **Role** `Panel` — `InfoRow` Assigned role = `user?.role`.
  - **Network** `Panel` — `InfoRow`s: API Endpoint (`process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"`), Inference mode "mock", FL mode "mock".
  - **Preferences** `Panel subtitle="Read-only in demo."` — two `ToggleRow`s (e.g. "Email alerts on round completion" on; "Show attention overlay by default" off).
  - **Session** `Panel` — coral `Button` "Sign out" → `clear(); router.replace("/login")`.
- [ ] **Step 2 — Build:** green. **Step 3 — Commit:**
```bash
git add apps/web/app/doctor/settings/page.tsx
git commit -m "feat(web): doctor Settings screen"
```

---

## Task 10 — QA browser pass + regression

**Files:** none (QA; record results under `.scratch/`).

- [ ] **Step 1** — Ensure web (`:3000`) + backend (`:3001`) are running; Docker (Postgres/Redis) up. Log in as `dr.benali@fedmri.local` / `doctor1234`.
- [ ] **Step 2 — gstack `/browse`:** visit `/doctor`, `/doctor/scan`, `/doctor/chat`, `/doctor/model`, `/doctor/history`, `/doctor/docs`, `/doctor/support`, `/doctor/settings`. For each: screenshot, `console --errors` clean, key elements present. Confirm **nav-active highlights exactly one item** per route (esp. `/doctor` not staying lit on sub-routes). Verify empty states render (0-case doctor). On `/doctor/scan`, upload a sample MRI and confirm the **FL topology animates** (phase badge + silo banner transition) and a prediction returns.
- [ ] **Step 3 — Regression:** confirm the **researcher** portal nav-active is now correct too (the `/researcher` index item no longer lit on sub-routes); confirm **patient** portal still renders (ChatPanel height unchanged there).
- [ ] **Step 4** — Record findings in `.scratch/`; fix any bug found (QA sweep) and commit with explicit paths.

---

## Self-review (completed)

- **Spec coverage:** §4 shell/routing/debt → T1; §5.1 Dashboard → T2; §5.2 Scan → T3; §5.3 Assistant → T4; §5.4 Model Performance → T5; §5.5 History → T6; §5.6 Docs → T7; §5.7 Support → T8; §5.8 Settings → T9; §10 testing → T10. All spec sections have a task.
- **No backend / invariants:** every task is frontend; `/cases` is HospitalSiloGuard-scoped; nothing writes `rawDataTransmitted`; the FL socket (providers.tsx) and the FL-after-response flow are untouched → invariants #1–#4 hold; doctor-portal FL jargon is allowed (#5 N/A).
- **Type consistency:** `CasesResponse`/`ModelComparison` defined once in `doctor-api.ts` (T2) and reused in T6; `Column<T>`, `StatCard`/`StatusBadge`/`Button`/`Panel`/`PageHeader` props match their Phase A definitions; `ChatPanel` gains `heightClass?` (T4) used only by doctor.
- **Placeholder posture:** mechanical tasks (T1, T2, T3, T4, T5) carry complete code. UI tasks (T6–T9) carry exact data sources, the reuse template (named researcher screens to mirror), concrete column/analytics definitions, and build+commit steps — JSX assembled by the implementer from the listed primitives + the optional Figma frame (same convention as the Phase B plan). The one open data detail (Status column) is bounded by an explicit build-time check, not left vague.
