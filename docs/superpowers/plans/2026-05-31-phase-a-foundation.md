# Phase A — Foundation & Shared Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `RESEARCHER` role end-to-end and a shared left-sidebar `PortalShell` + UI primitives, proven on a new `/researcher` route, without touching the live Doctor/Patient portals.

**Architecture:** Backend gains one `Role` enum value (Prisma migration → DTO → seed), threaded through shared + web types. The web gains a token extension, a small set of presentational primitives in the existing inline-CSS-var idiom, a configurable `PortalShell` (sidebar + top bar + auth guard), and a `/researcher` route group that renders the shell. Login routes by role. Doctor/Patient layouts are untouched (they migrate in Phases C/D).

**Tech Stack:** NestJS 10 + Prisma 5 + Postgres + jest/supertest (backend); Next.js 16 (App Router) + React 19 + Tailwind v4 + framer-motion + lucide-react + zustand (web).

**Spec:** `docs/superpowers/specs/2026-05-31-fedmri-figma-redesign-design.md`

---

## Conventions & testing strategy

- **Branch:** all work on `redesign/figma-portals` (already checked out).
- **Backend** has a real test runner — use **TDD via jest e2e** (`apps/backend/test/*.e2e-spec.ts`, run with `npm run test:e2e` from `apps/backend`). E2e tests need a running Postgres + Redis and a seeded DB (matches the existing harness).
- **Web has NO unit-test runner** (package.json scripts are dev/build/start/lint only). Do **not** add one in Phase A. Verify web changes with: `npm run build` (typecheck + compile) from `apps/web`, then boot and **browser-screenshot** the result (use the gstack `/browse` skill). Visual screenshots are the acceptance artifact for UI.
- **Next 16 caution** (`apps/web/AGENTS.md`): before editing any route/layout file (Tasks 7–8), skim the relevant page under `node_modules/next/dist/docs/` for App-Router layout/route APIs. Existing `app/doctor/layout.tsx` confirms default-export client layouts work.
- **`lucide-react` is pinned at `^1.16.0`** (unusual). In Task 6, verify icon named-imports resolve at build; if they don't, fall back to the hand-authored inline SVG pattern already used across the codebase. Do not block the phase on the icon library.
- Commit after every task.

---

## File map

**Backend**
- Modify: `apps/backend/prisma/schema.prisma` (enum `Role` += `RESEARCHER`)
- Create: `apps/backend/prisma/migrations/<ts>_add_researcher_role/` (generated)
- Modify: `apps/backend/src/auth/dto/register.dto.ts` (allow `RESEARCHER`)
- Modify: `apps/backend/prisma/seed.ts` (seed a researcher)
- Modify: `apps/backend/test/auth.e2e-spec.ts` (researcher register/login test)

**Shared / web types**
- Modify: `packages/shared/src/types/index.ts` (`UserRole`)
- Modify: `apps/web/lib/types.ts` (`AuthUser.role`)

**Web — tokens & utilities**
- Modify: `apps/web/app/globals.css` (subtype/semantic/`--teal-deep` tokens)
- Modify: `DESIGN_SYSTEM.md` (token table + shell + researcher identity)
- Create: `apps/web/lib/cn.ts`
- Create: `apps/web/lib/portal-chrome.ts`
- Create: `apps/web/lib/use-portal-title.ts`

**Web — primitives**
- Create: `apps/web/components/ui/Card.tsx`
- Create: `apps/web/components/ui/Panel.tsx`
- Create: `apps/web/components/ui/StatCard.tsx`
- Create: `apps/web/components/ui/SectionLabel.tsx`
- Create: `apps/web/components/ui/StatusBadge.tsx`
- Create: `apps/web/components/ui/Button.tsx`
- Create: `apps/web/components/ui/DataTable.tsx`
- Create: `apps/web/components/ui/PageHeader.tsx`

**Web — shell & researcher route**
- Create: `apps/web/components/shell/PortalShell.tsx`
- Create: `apps/web/app/researcher/layout.tsx`
- Create: `apps/web/app/researcher/page.tsx`
- Modify: `apps/web/app/login/page.tsx` (route `RESEARCHER` → `/researcher`)

---

## Task 1: Backend — `RESEARCHER` role (schema + migration + DTO)

**Files:**
- Modify: `apps/backend/prisma/schema.prisma:10-14`
- Modify: `apps/backend/src/auth/dto/register.dto.ts:16-17`
- Test: `apps/backend/test/auth.e2e-spec.ts`

- [ ] **Step 1: Write the failing test** — append inside the `describe('POST /auth/register', ...)` block in `apps/backend/test/auth.e2e-spec.ts`:

```typescript
    it('should register a RESEARCHER without hospitalId and return 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test.researcher@fedmri.local',
          password: 'SecurePass123!',
          name: 'Test Researcher',
          role: 'RESEARCHER',
        })
        .expect(201);

      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: 'test.researcher@fedmri.local',
        name: 'Test Researcher',
        role: 'RESEARCHER',
        hospitalId: null,
      });
    });
```

Also add `'test.researcher@fedmri.local'` to the cleanup `in: [...]` array in `beforeAll` (around line 35) so reruns are idempotent.

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npm run test:e2e -- auth`
Expected: FAIL — the new test gets **400** (ValidationPipe rejects `role: 'RESEARCHER'` because `@IsEnum` doesn't list it), not 201.

- [ ] **Step 3: Add the enum value** — in `apps/backend/prisma/schema.prisma`:

```prisma
enum Role {
  DOCTOR
  PATIENT
  ADMIN
  RESEARCHER
}
```

- [ ] **Step 4: Generate the migration + client**

Run (from `apps/backend`): `npx prisma migrate dev --name add_researcher_role`
Expected: a new folder under `prisma/migrations/` and "Your database is now in sync"; Prisma Client regenerated so `Role.RESEARCHER` exists.

- [ ] **Step 5: Allow the role in the DTO** — in `apps/backend/src/auth/dto/register.dto.ts`:

```typescript
  @IsEnum(['DOCTOR', 'PATIENT', 'ADMIN', 'RESEARCHER'])
  role: 'DOCTOR' | 'PATIENT' | 'ADMIN' | 'RESEARCHER';
```

(No `auth.service.ts` change needed — `register()` only requires a hospital when `role === 'DOCTOR'`, so a researcher falls through with `hospitalId = null`.)

- [ ] **Step 6: Run test to verify it passes**

Run (from `apps/backend`): `npm run test:e2e -- auth`
Expected: PASS — researcher registers (201) with `hospitalId: null`; existing doctor/patient tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations apps/backend/src/auth/dto/register.dto.ts apps/backend/test/auth.e2e-spec.ts
git commit -m "feat(backend): add RESEARCHER role (enum, migration, DTO) + e2e test"
```

---

## Task 2: Backend — seed a researcher account

**Files:**
- Modify: `apps/backend/prisma/seed.ts:12` (after the ADMIN upsert)

- [ ] **Step 1: Add the seed entry** — in `apps/backend/prisma/seed.ts`, immediately after the `admin@fedmri.local` upsert line:

```typescript
  await prisma.user.upsert({ where:{email:"researcher@fedmri.local"}, update:{}, create:{email:"researcher@fedmri.local",passwordHash:await bcrypt.hash("research1234",10),name:"Dr. Imene Researcher",role:Role.RESEARCHER,onboardingDone:true} });
```

- [ ] **Step 2: Run the seed**

Run (from `apps/backend`): `npx prisma db seed`
Expected: prints `Seed complete` with no error (the configured seed command is `ts-node prisma/seed.ts`).

- [ ] **Step 3: Verify the account logs in and reports the role**

Ensure the backend is running (`npm run start:dev` in another shell), then:

```bash
curl -s -X POST http://localhost:3001/auth/login -H "Content-Type: application/json" \
  -d '{"email":"researcher@fedmri.local","password":"research1234"}'
```

Expected: JSON with `accessToken` and `"user":{...,"role":"RESEARCHER","hospitalId":null}`.
(If the backend port differs, use the one from `apps/backend/src/main.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/seed.ts
git commit -m "feat(backend): seed researcher@fedmri.local (RESEARCHER role)"
```

---

## Task 3: Shared + web — extend `UserRole` with `RESEARCHER`

**Files:**
- Modify: `packages/shared/src/types/index.ts:1`
- Modify: `apps/web/lib/types.ts:68`

- [ ] **Step 1: Update the shared type** — `packages/shared/src/types/index.ts` line 1:

```typescript
export type UserRole = "DOCTOR" | "PATIENT" | "ADMIN" | "RESEARCHER";
```

- [ ] **Step 2: Update the web AuthUser type** — `apps/web/lib/types.ts`, the `AuthUser` interface:

```typescript
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "DOCTOR" | "PATIENT" | "ADMIN" | "RESEARCHER";
  hospitalId?: string;
}
```

- [ ] **Step 3: Typecheck the web app**

Run (from `apps/web`): `npm run build`
Expected: build succeeds (no type errors). This compiles the type change; nothing references the old union exhaustively, so it stays green.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/index.ts apps/web/lib/types.ts
git commit -m "feat(types): add RESEARCHER to UserRole (shared + web)"
```

---

## Task 4: Web — extend design tokens

**Files:**
- Modify: `apps/web/app/globals.css:3-16`
- Modify: `DESIGN_SYSTEM.md` (§2 Color Tokens)

- [ ] **Step 1: Add tokens to `:root`** — in `apps/web/app/globals.css`, extend the `:root` block (keep existing vars; add these before the closing brace):

```css
  --teal-deep: #0f766e;
  --blue: #60a5fa;
  /* semantic states */
  --success: #2dd4bf;
  --warning: #f59e0b;
  --danger: #fb7185;
  --info: #60a5fa;
  /* molecular subtype accents (mirror SUBTYPE_COLOR in lib/types.ts) */
  --subtype-luminal-a: #2dd4bf;
  --subtype-luminal-b: #60a5fa;
  --subtype-her2: #f59e0b;
  --subtype-tn: #fb7185;
```

- [ ] **Step 2: Document the tokens** — in `DESIGN_SYSTEM.md` §2, add a row to the accent table for `--teal-deep` (`#0f766e`, "scan upload gradient deep stop") and a short "Semantic & subtype CSS variables" note listing `--success/--warning/--danger/--info` and the four `--subtype-*` vars, stating they mirror `SUBTYPE_COLOR` in `apps/web/lib/types.ts`.

- [ ] **Step 3: Verify build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds (Tailwind v4 compiles `globals.css`; new vars are additive and unused-but-valid).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css DESIGN_SYSTEM.md
git commit -m "feat(web): add subtype/semantic/teal-deep CSS tokens + document them"
```

---

## Task 5: Web — `cn()` helper + portal-chrome store + title hook

**Files:**
- Create: `apps/web/lib/cn.ts`
- Create: `apps/web/lib/portal-chrome.ts`
- Create: `apps/web/lib/use-portal-title.ts`

- [ ] **Step 1: Create `apps/web/lib/cn.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, de-duping conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `apps/web/lib/portal-chrome.ts`** (top-bar title shared between page and shell; string-only to avoid render loops)

```typescript
"use client";

import { create } from "zustand";

interface PortalChromeState {
  title: string;
  setTitle: (title: string) => void;
}

export const usePortalChrome = create<PortalChromeState>((set) => ({
  title: "",
  setTitle: (title) => set({ title }),
}));
```

- [ ] **Step 3: Create `apps/web/lib/use-portal-title.ts`**

```typescript
"use client";

import { useEffect } from "react";
import { usePortalChrome } from "./portal-chrome";

/** A page calls this to set the portal top-bar title. */
export function usePortalTitle(title: string): void {
  const setTitle = usePortalChrome((s) => s.setTitle);
  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
}
```

- [ ] **Step 4: Verify build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/cn.ts apps/web/lib/portal-chrome.ts apps/web/lib/use-portal-title.ts
git commit -m "feat(web): add cn() helper and portal-chrome title store"
```

---

## Task 6: Web — UI primitives

**Files (all Create):** `apps/web/components/ui/{Card,Panel,StatCard,SectionLabel,StatusBadge,Button,DataTable,PageHeader}.tsx`

- [ ] **Step 1: Confirm lucide-react resolves** (used in Task 7). From `apps/web`:

```bash
node -e "const l=require('lucide-react'); console.log(['Share2','Database','BarChart3','HelpCircle','Settings','ScrollText','LogOut','Plus'].map(n=>n+':'+(typeof l[n])).join(' '))"
```

Expected: each name prints `:function` (or `:object`). If any is `:undefined`, note it and substitute an inline SVG in Task 7 instead of that icon.

- [ ] **Step 2: Create `apps/web/components/ui/Card.tsx`**

```tsx
import { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ children, className, style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("rounded-xl border p-4", className)}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/ui/SectionLabel.tsx`**

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-xs uppercase tracking-widest", className)} style={{ color: "var(--text-secondary)" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/ui/StatCard.tsx`**

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function StatCard({ label, value, hint, accent = "var(--text-primary)", className }: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4", className)} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: accent }}>{value}</div>
      {hint && <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Create `apps/web/components/ui/Panel.tsx`**

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({ title, subtitle, action, children, className }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4", className)} style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      {(title || action) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {title && <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</div>}
            {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Create `apps/web/components/ui/StatusBadge.tsx`**

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Status = "validated" | "disputed" | "pending" | "active";

const MAP: Record<Status, { bg: string; color: string; border: string; label: string }> = {
  validated: { bg: "#2dd4bf20", color: "#2dd4bf", border: "#2dd4bf50", label: "Validated" },
  disputed:  { bg: "#f59e0b20", color: "#f59e0b", border: "#f59e0b50", label: "Disputed" },
  pending:   { bg: "var(--bg-card2)", color: "var(--text-secondary)", border: "var(--border)", label: "Pending" },
  active:    { bg: "var(--teal-glow)", color: "var(--teal)", border: "var(--teal)40", label: "Active" },
};

export function StatusBadge({ status, label, className }: { status: Status; label?: ReactNode; className?: string }) {
  const s = MAP[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full", className)}
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label ?? s.label}
    </span>
  );
}
```

- [ ] **Step 7: Create `apps/web/components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes, CSSProperties } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "teal" | "coral" | "validate";

const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  primary:  { background: "var(--teal-dim)", color: "#0d1117" },
  ghost:    { background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" },
  teal:     { background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid var(--teal)40" },
  coral:    { background: "#fb718520", color: "#fb7185", border: "1px solid #fb718540" },
  validate: { background: "#2dd4bf20", color: "#2dd4bf", border: "1px solid #2dd4bf40" },
};

export function Button({ variant = "primary", className, style, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn("rounded-lg text-sm font-semibold px-4 py-2 transition-opacity disabled:opacity-50", className)}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...props}
    />
  );
}
```

- [ ] **Step 8: Create `apps/web/components/ui/DataTable.tsx`**

```tsx
import { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, getRowKey, empty = "No data", className }: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn("font-medium pb-2 text-xs uppercase tracking-wider", c.align === "right" ? "text-right" : "text-left")}
                style={{ color: "var(--text-secondary)" }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-6 text-center text-xs" style={{ color: "var(--text-secondary)" }}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={getRowKey(row, i)} style={{ borderBottom: "1px solid var(--border)" }}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("py-3", c.align === "right" ? "text-right tabular-nums" : "text-left")}
                    style={{ color: "var(--text-primary)" }}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 9: Create `apps/web/components/ui/PageHeader.tsx`**

```tsx
import { ReactNode } from "react";

export function PageHeader({ title, description, action }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h1>
        {description && <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 10: Verify build**

Run (from `apps/web`): `npm run build`
Expected: success — all primitives compile.

- [ ] **Step 11: Commit**

```bash
git add apps/web/components/ui
git commit -m "feat(web): add shared UI primitives (Card, Panel, StatCard, Badge, Button, DataTable, PageHeader, SectionLabel)"
```

---

## Task 7: Web — `PortalShell`

**Files:**
- Create: `apps/web/components/shell/PortalShell.tsx`

- [ ] **Step 1: (Next 16 check)** Skim `node_modules/next/dist/docs/` for any App-Router client-layout / `next/link` / `next/navigation` notes that differ from prior majors. The existing `app/doctor/layout.tsx` is the working reference pattern.

- [ ] **Step 2: Create `apps/web/components/shell/PortalShell.tsx`**

```tsx
"use client";

import { ReactNode, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useAuthStore } from "@/lib/auth-store";
import { usePortalChrome } from "@/lib/portal-chrome";

export interface NavItem { href: string; label: string; icon: LucideIcon; }
export interface FooterItem { label: string; icon: LucideIcon; href?: string; onClick?: () => void; }
export interface ShellIdentity { title: string; subtitle?: string; status?: "ok" | "active" | "idle"; icon?: ReactNode; }

function BrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="4" stroke="var(--teal)" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.5" fill="var(--teal)" />
      <path d="M2 9h2M14 9h2M9 2v2M9 14v2" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PortalShell({ identity, nav, footerNav, primaryAction, headerStatus, children }: {
  identity: ShellIdentity;
  nav: NavItem[];
  footerNav?: FooterItem[];
  primaryAction?: { label: string; href: string; icon?: LucideIcon };
  headerStatus?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const chromeTitle = usePortalChrome((s) => s.title);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().token) router.replace("/login");
    }, 120);
    return () => clearTimeout(t);
  }, [token, router]);

  const statusColor =
    identity.status === "active" ? "var(--amber)" :
    identity.status === "ok" ? "var(--teal)" : "var(--text-secondary)";

  const footerItemClass = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm w-full transition-colors text-left";

  return (
    <div className="min-h-screen flex">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="px-4 py-4 flex items-center gap-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--teal-glow)", border: "1px solid var(--teal)40" }}>
            {identity.icon ?? <BrandMark />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{identity.title}</div>
            {identity.subtitle && (
              <div className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: "var(--text-secondary)" }}>
                {identity.status && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />}
                {identity.subtitle}
              </div>
            )}
          </div>
        </div>

        {primaryAction && (
          <div className="px-4 pt-4">
            <Link href={primaryAction.href} className="flex items-center justify-center gap-2 rounded-lg text-sm font-semibold py-2.5 w-full" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>
              {primaryAction.icon && <primaryAction.icon size={16} />}
              {primaryAction.label}
            </Link>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                style={{
                  background: active ? "var(--teal-glow)" : "transparent",
                  color: active ? "var(--teal)" : "var(--text-secondary)",
                  border: "1px solid " + (active ? "var(--teal)40" : "transparent"),
                }}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {footerNav && footerNav.length > 0 && (
          <div className="px-3 py-3 space-y-1 border-t" style={{ borderColor: "var(--border)" }}>
            {footerNav.map((item) => {
              const Icon = item.icon;
              return item.href ? (
                <Link key={item.label} href={item.href} className={footerItemClass} style={{ color: "var(--text-secondary)" }}>
                  <Icon size={16} />{item.label}
                </Link>
              ) : (
                <button key={item.label} type="button" onClick={item.onClick} className={footerItemClass} style={{ color: "var(--text-secondary)" }}>
                  <Icon size={16} />{item.label}
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b px-5 flex items-center justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{chromeTitle}</div>
          <div className="flex items-center gap-4">
            {headerStatus}
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{user?.name}</div>
          </div>
        </header>

        <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex-1 p-5 md:p-6 overflow-y-auto">
          {children}
        </motion.main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run (from `apps/web`): `npm run build`
Expected: success (the component is unused so far; this only checks it compiles, incl. `LucideIcon` type import).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/shell/PortalShell.tsx
git commit -m "feat(web): add configurable PortalShell (sidebar + top bar + auth guard)"
```

---

## Task 8: Web — `/researcher` route group + role-based login routing

**Files:**
- Create: `apps/web/app/researcher/layout.tsx`
- Create: `apps/web/app/researcher/page.tsx`
- Modify: `apps/web/app/login/page.tsx:24-30`

- [ ] **Step 1: (Next 16 check)** Skim `node_modules/next/dist/docs/` for App-Router route-group / `layout.tsx` conventions if anything differs from the existing `app/doctor/layout.tsx` pattern.

- [ ] **Step 2: Create `apps/web/app/researcher/layout.tsx`**

```tsx
"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Share2, Database, BarChart3, HelpCircle, Settings, ScrollText, LogOut } from "lucide-react";
import { PortalShell } from "@/components/shell/PortalShell";
import { useAuthStore } from "@/lib/auth-store";

export default function ResearcherLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);

  return (
    <PortalShell
      identity={{ title: "Node Alpha-7", subtitle: "Synchronized", status: "ok" }}
      nav={[
        { href: "/researcher", label: "Models", icon: BarChart3 },
        { href: "/researcher/topology", label: "Network Topology", icon: Share2 },
        { href: "/researcher/datasets", label: "Datasets", icon: Database },
        { href: "/researcher/support", label: "Support", icon: HelpCircle },
        { href: "/researcher/settings", label: "Settings", icon: Settings },
      ]}
      footerNav={[
        { href: "/researcher/logs", label: "System Logs", icon: ScrollText },
        { label: "Logout", icon: LogOut, onClick: () => { clear(); router.replace("/login"); } },
      ]}
    >
      {children}
    </PortalShell>
  );
}
```

> Note: only `/researcher` (Models) exists in Phase A. Topology / Datasets / Support / Settings / Logs are Phase B routes — their nav links 404 until then. This is expected for the foundation phase.

- [ ] **Step 3: Create `apps/web/app/researcher/page.tsx`** (placeholder that exercises the shell + primitives, with domain-correct copy)

```tsx
"use client";

import { usePortalTitle } from "@/lib/use-portal-title";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Panel } from "@/components/ui/Panel";

export default function ResearcherHome() {
  usePortalTitle("MRI Federated Core");
  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Global Model Performance"
        description="Federated DINOv2-MIL · aggregate metrics across all hospital nodes"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Model Version" value="v10" accent="var(--teal)" hint="FedProx" />
        <StatCard label="F1 Macro" value="0.41" accent="var(--teal)" />
        <StatCard label="FL Rounds" value="10" accent="var(--blue-accent)" />
        <StatCard label="Raw Data Sent" value="0 B" accent="var(--teal)" hint="Privacy preserved" />
      </div>
      <Panel title="Researcher portal" subtitle="Full screens land in Phase B">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Foundation shell is live. Network Topology, Datasets, Models, System Logs, Support,
          and Settings arrive in Phase B and read aggregate / model-level data only — no raw images.
        </p>
      </Panel>
    </div>
  );
}
```

- [ ] **Step 4: Route `RESEARCHER` on login** — in `apps/web/app/login/page.tsx`, replace the role branch inside `onSubmit` (lines ~24-30):

```tsx
      if (user.role === "DOCTOR") {
        router.replace("/doctor/scan");
      } else if (user.role === "PATIENT") {
        router.replace("/patient/chat");
      } else if (user.role === "RESEARCHER") {
        router.replace("/researcher");
      } else {
        setError("Unknown role — contact support.");
      }
```

- [ ] **Step 5: Verify build**

Run (from `apps/web`): `npm run build`
Expected: success — `/researcher` and `/researcher` layout compile; login typechecks.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/researcher apps/web/app/login/page.tsx
git commit -m "feat(web): add /researcher route group + shell, route RESEARCHER on login"
```

---

## Task 9: QA — browser verification (researcher shell + no regression)

**Files:** none (verification only).

- [ ] **Step 1: Boot the stack in mock mode**

Start Postgres + Redis (per repo setup), then in separate shells: backend `npm run start:dev` (from `apps/backend`) and web `npm run dev` (from `apps/web`). Ensure the researcher account is seeded (Task 2).

- [ ] **Step 2: Verify researcher flow (use the gstack `/browse` skill)**

- Open the web app, log in as `researcher@fedmri.local` / `research1234`.
- Expected: redirect to `/researcher`; left sidebar shows Node Alpha-7 · Synchronized, nav (Models active, Network Topology, Datasets, Support, Settings) + footer (System Logs, Logout); top bar shows "MRI Federated Core" + user name; 4 stat cards + the placeholder panel render in the dark/teal style.
- Screenshot to `.scratch/figma/qa-researcher-shell.png`.

- [ ] **Step 3: Verify no regression on existing portals**

- Log in as `dr.benali@fedmri.local` / `doctor1234` → lands on `/doctor/scan`, top-nav doctor layout unchanged, FL topology sidebar present.
- Log in as `sara@fedmri.local` / `patient1234` → patient portal renders with the AI info banner.
- Screenshot both. Expected: visually identical to pre-Phase-A (only additive token vars were introduced).

- [ ] **Step 4: Verify the privacy-copy logout path**

- From `/researcher`, click Logout → returns to `/login`, auth cleared (reload stays logged out).

- [ ] **Step 5: Record results**

- Note pass/fail + any pre-existing breakage in `.scratch/` (issue-tracker note). If a regression appears on doctor/patient, fix it before closing the phase (QA-sweep rule).

- [ ] **Step 6: Commit any QA fixes** (if needed)

```bash
git add -A
git commit -m "fix(web): Phase A QA sweep — <describe>"
```

---

## Self-review (completed)

- **Spec coverage:** A1 tokens → Task 4; A2 shell+primitives → Tasks 5–7; A3 RESEARCHER role → Tasks 1–3; A4 routing → Task 8; A5 QA baseline → Task 9. All Phase A spec items have tasks.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; commands are exact (`npm run test:e2e`, `npx prisma migrate dev`, `npx prisma db seed`, `npm run build`).
- **Type consistency:** `usePortalChrome`/`usePortalTitle`/`setTitle` names match across store, hook, and shell; `PortalShell` props (`identity/nav/footerNav/primaryAction/headerStatus`) match the researcher layout usage; `Column<T>`/`DataTable` generics consistent; `UserRole` union identical in shared + web + DTO + login branch.
- **Known contingencies flagged:** lucide-react pin (Task 6 Step 1), Next 16 docs (Tasks 7–8), web has no unit runner (verification = build + browser).
```