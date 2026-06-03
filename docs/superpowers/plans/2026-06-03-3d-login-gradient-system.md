# 3D Login Scene + Gradient System + Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the login page's placeholder SVG brain with a looping 3D animation (brain spin → MRI scan → repeat) using actual FBX assets; upgrade all logos to the vector `main_logo.svg`; propagate the gradient-card pattern across portals; fix the datasets hospital grid.

**Architecture:** `@react-three/fiber` Canvas dynamically imported (ssr:false) lives in `components/scene/LoginScene3D.tsx`. A ref-based phase state machine in `SceneController` drives opacity + motion without triggering React re-renders. `GradientCard` is a small presentational primitive; apply it across portals in the same pass. Logo swap is a one-line find-replace per file.

**Tech Stack:** three@0.170, @react-three/fiber@8, @react-three/drei@9, TypeScript, Next.js 16, React 19

---

## File map

| File | Action | Purpose |
|---|---|---|
| `apps/web/package.json` | modify | add three, r3f, drei |
| `public/3d/brain/stylizedhumanbrain.fbx` | copy | brain model asset |
| `public/3d/mri/IRM.fbx` | copy | MRI machine asset |
| `public/3d/mri/textures/*.png / *.jpeg` | copy | MRI PBR textures |
| `apps/web/components/scene/types.ts` | create | Phase type + constants |
| `apps/web/components/scene/SceneLights.tsx` | create | ambient + directional + teal point light |
| `apps/web/components/scene/BrainModel.tsx` | create | FBX load, teal material, spin+float anim |
| `apps/web/components/scene/MriModel.tsx` | create | FBX load, PBR textures, bed-slide anim |
| `apps/web/components/scene/SceneController.tsx` | create | phase state machine via useFrame |
| `apps/web/components/scene/LoginScene3D.tsx` | create | Canvas assembly + shimmer fallback |
| `apps/web/components/ui/GradientCard.tsx` | create | accent-coloured card wrapper |
| `apps/web/app/login/page.tsx` | modify | swap NeuralBrain SVG → LoginScene3D; logo |
| `apps/web/app/patient/register/page.tsx` | modify | logo upgrade |
| `apps/web/components/shell/PortalShell.tsx` | modify | logo upgrade |
| `apps/web/app/researcher/datasets/page.tsx` | modify | grid-cols-3 fix |
| `apps/web/app/researcher/page.tsx` | modify | apply GradientCard to stat cards |
| `apps/web/app/patient/page.tsx` | modify | apply GradientCard |

---

## Task 1 — Install Three.js dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **1.1 Install packages**

```bash
cd apps/web
npm install three@0.170.0 @react-three/fiber@8.17.10 @react-three/drei@9.115.0
npm install --save-dev @types/three@0.170.0
```

Expected: no peer-dep errors. React 19 is supported by r3f 8.17+.

- [ ] **1.2 Verify install**

```bash
node -e "require('./node_modules/three/build/three.cjs.js'); console.log('three OK')"
```

Expected: `three OK`

- [ ] **1.3 Commit**

```bash
cd ../..  # back to repo root
git add apps/web/package.json apps/web/package-lock.json
git commit -m "feat(deps): add three + @react-three/fiber + drei for 3D login scene"
```

---

## Task 2 — Copy 3D assets to public

**Files:**
- Create: `public/3d/brain/stylizedhumanbrain.fbx`
- Create: `public/3d/mri/IRM.fbx`
- Create: `public/3d/mri/textures/*.png / *.jpeg`

- [ ] **2.1 Create directories**

```powershell
New-Item -ItemType Directory -Force "apps\web\public\3d\brain"
New-Item -ItemType Directory -Force "apps\web\public\3d\mri\textures"
```

- [ ] **2.2 Copy brain FBX**

```powershell
Copy-Item `
  "3D\Stylized_Human_Brain_Anatomy-7fc9671c\fbx\stylizedhumanbrain.fbx" `
  "apps\web\public\3d\brain\stylizedhumanbrain.fbx"
```

- [ ] **2.3 Copy MRI FBX**

```powershell
Copy-Item `
  "3D\Sci_Fi_lab_02-f0b18256\fbx\sci-fi-lab-02_extracted\source\IRM.fbx" `
  "apps\web\public\3d\mri\IRM.fbx"
```

- [ ] **2.4 Copy MRI textures**

```powershell
Copy-Item `
  "3D\Sci_Fi_lab_02-f0b18256\fbx\sci-fi-lab-02_extracted\textures\*" `
  "apps\web\public\3d\mri\textures\" -Recurse
```

- [ ] **2.5 Verify sizes**

```powershell
(Get-Item "apps\web\public\3d\brain\stylizedhumanbrain.fbx").length / 1MB
(Get-Item "apps\web\public\3d\mri\IRM.fbx").length / 1MB
```

Expected: ~15.3 MB brain, ~123.6 MB MRI

- [ ] **2.6 Add gitignore for large 3D assets** (FBX too large for git)

Append to `apps/web/.gitignore`:
```
# 3D model assets (binary, large — stored locally)
public/3d/
```

- [ ] **2.7 Commit**

```bash
git add apps/web/.gitignore
git commit -m "chore(3d): gitignore large FBX assets; public/3d/ copied locally"
```

---

## Task 3 — GradientCard primitive

**Files:**
- Create: `apps/web/components/ui/GradientCard.tsx`

- [ ] **3.1 Create component**

```tsx
// apps/web/components/ui/GradientCard.tsx
import { CSSProperties, ReactNode } from "react";

const ACCENT_HEX: Record<string, string> = {
  teal:   "#2dd4bf",
  indigo: "#6366f1",
  amber:  "#f59e0b",
  blue:   "#60a5fa",
  coral:  "#fb7185",
};

interface GradientCardProps {
  children: ReactNode;
  accent?: "teal" | "indigo" | "amber" | "blue" | "coral";
  className?: string;
  style?: CSSProperties;
}

export function GradientCard({
  children,
  accent = "teal",
  className = "",
  style,
}: GradientCardProps) {
  const hex = ACCENT_HEX[accent] ?? ACCENT_HEX.teal;
  return (
    <div
      className={`relative rounded-xl border overflow-hidden ${className}`}
      style={{ background: "var(--bg-card)", borderColor: "var(--border)", ...style }}
    >
      {/* top-right radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at top right, ${hex}28, transparent 65%)`,
        }}
      />
      {/* top-left diagonal sweep */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${hex}0a 0%, transparent 45%)`,
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **3.2 Verify tsc**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (exit 0)

- [ ] **3.3 Commit**

```bash
git add apps/web/components/ui/GradientCard.tsx
git commit -m "feat(ui): GradientCard — radial+diagonal accent gradient wrapper"
```

---

## Task 4 — Apply GradientCard + fix datasets grid

**Files:**
- Modify: `apps/web/app/researcher/datasets/page.tsx`
- Modify: `apps/web/app/patient/page.tsx`

- [ ] **4.1 Fix datasets node grid** in `apps/web/app/researcher/datasets/page.tsx`

Find the grid container (line ~315):
```tsx
// OLD
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```

Replace with:
```tsx
// NEW
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

- [ ] **4.2 Apply GradientCard to NodeCard** in the same file

Add import at top:
```tsx
import { GradientCard } from "@/components/ui/GradientCard";
```

In `NodeCard` function, replace the outer `div`:
```tsx
// BEFORE (lines ~40-84):
function NodeCard({ node, colorIdx }: { node: DatasetNode; colorIdx: number }) {
  const dotColor = NODE_COLORS[colorIdx % NODE_COLORS.length];
  const blobColor = NODE_GRADIENT_COLORS[colorIdx % NODE_GRADIENT_COLORS.length];

  return (
    <div
      className="relative rounded-xl border p-4 flex flex-col gap-1 overflow-hidden"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {/* Decorative corner gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background: `radial-gradient(circle at top right, ${blobColor}22, transparent 70%)`,
        }}
      />
```

```tsx
// AFTER — remove the inner blob div, use GradientCard wrapper:
const ACCENT_MAP = ["teal", "indigo", "amber"] as const;

function NodeCard({ node, colorIdx }: { node: DatasetNode; colorIdx: number }) {
  const dotColor = NODE_COLORS[colorIdx % NODE_COLORS.length];
  const accent = ACCENT_MAP[colorIdx % ACCENT_MAP.length];

  return (
    <GradientCard accent={accent} className="p-4 flex flex-col gap-1">
```

Also remove the closing `</div>` of the old outer wrapper and replace with `</GradientCard>`.

- [ ] **4.3 Apply GradientCard to patient dashboard cards** in `apps/web/app/patient/page.tsx`

Add import:
```tsx
import { GradientCard } from "@/components/ui/GradientCard";
```

Replace the "Latest MRI Analysis" card outer div:
```tsx
// BEFORE
<div className="md:col-span-2 rounded-xl border p-5 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
```
```tsx
// AFTER
<GradientCard accent="teal" className="md:col-span-2 p-5 space-y-4">
```
(remove corresponding closing `</div>`, add `</GradientCard>`)

Replace the "Network Status" card:
```tsx
// BEFORE
<div className="rounded-2xl border p-5 flex flex-col justify-between" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
```
```tsx
// AFTER
<GradientCard accent="indigo" className="p-5 flex flex-col justify-between">
```

Replace Quick Actions link items:
```tsx
// BEFORE
<Link href={a.href}
  className="flex items-center gap-3 rounded-xl border p-4 transition-colors group"
  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
```
```tsx
// AFTER — wrap Link inside GradientCard
<GradientCard accent={["teal","indigo","amber"][i] as any} className="p-0">
  <Link href={a.href}
    className="flex items-center gap-3 p-4 transition-colors group w-full">
```
(add matching `</Link></GradientCard>`)

- [ ] **4.4 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **4.5 Commit**

```bash
git add apps/web/app/researcher/datasets/page.tsx apps/web/app/patient/page.tsx
git commit -m "feat(ui): apply GradientCard to patient dash + datasets; fix lg:grid-cols-3"
```

---

## Task 5 — Logo upgrade

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/patient/register/page.tsx`
- Modify: `apps/web/components/shell/PortalShell.tsx`

`main_logo.svg` is at `public/main_logo.svg` (viewBox 0 0 889 415). Use it as an `<img>` tag — SVG scales perfectly at any CSS width with zero quality loss.

- [ ] **5.1 Update login page logo** in `apps/web/app/login/page.tsx`

In the **left panel** (brand panel), find the mobile-hidden logo at the top:
```tsx
// BEFORE
<img src="/logo-full.png" alt="FedMRI" className="h-9 w-auto object-contain" />
```
```tsx
// AFTER — main_logo.svg, taller display
<img src="/main_logo.svg" alt="FedMRI" className="h-14 w-auto object-contain" />
```

In the **right panel** (mobile-only logo):
```tsx
// BEFORE
<img src="/logo-full.png" alt="FedMRI" className="h-8 w-auto object-contain" />
```
```tsx
// AFTER
<img src="/main_logo.svg" alt="FedMRI" className="h-12 w-auto object-contain" />
```

- [ ] **5.2 Update register page logo** in `apps/web/app/patient/register/page.tsx`

Left panel logo (`h-9`):
```tsx
// BEFORE
<img src="/logo-full.png" alt="FedMRI" className="h-9 w-auto object-contain" />
```
```tsx
// AFTER
<img src="/main_logo.svg" alt="FedMRI" className="h-14 w-auto object-contain" />
```

Right panel mobile logo (`h-8`):
```tsx
// BEFORE
<img src="/logo-full.png" alt="FedMRI" className="h-8 w-auto object-contain" />
```
```tsx
// AFTER
<img src="/main_logo.svg" alt="FedMRI" className="h-12 w-auto object-contain" />
```

- [ ] **5.3 Update PortalShell sidebar logo** in `apps/web/components/shell/PortalShell.tsx`

Find the `BrandMark` function and the sidebar logo block. The sidebar has a 36px (w-9 h-9) container with `logo-mark.png`. Replace the entire sidebar brand block with the full logo:

Find the sidebar `<div className="px-4 py-4 flex items-center gap-3 border-b"...>` block and its contents. Replace the icon `<div>` + text block with:

```tsx
{/* BEFORE — icon div + text */}
<div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
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
```

```tsx
{/* AFTER — main_logo.svg + subtitle below */}
<div className="flex flex-col gap-1 min-w-0">
  {/* eslint-disable-next-line @next/next/no-img-element */}
  <img src="/main_logo.svg" alt="FedMRI" className="h-8 w-auto object-contain object-left" />
  {identity.subtitle && (
    <div className="text-[11px] flex items-center gap-1.5 truncate" style={{ color: "var(--text-secondary)" }}>
      {identity.status && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor }} />}
      {identity.subtitle}
    </div>
  )}
</div>
```

Also remove the now-unused `BrandMark` function from the file.

- [ ] **5.4 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **5.5 Commit**

```bash
git add apps/web/app/login/page.tsx apps/web/app/patient/register/page.tsx apps/web/components/shell/PortalShell.tsx
git commit -m "feat(brand): replace logo-full.png with main_logo.svg (vector, 2× larger)"
```

---

## Task 6 — Scene types + SceneLights

**Files:**
- Create: `apps/web/components/scene/types.ts`
- Create: `apps/web/components/scene/SceneLights.tsx`

- [ ] **6.1 Create types**

```ts
// apps/web/components/scene/types.ts
import { MutableRefObject } from "react";

export type Phase =
  | "BRAIN_SPIN"
  | "FADE_TO_MRI"
  | "MRI_SCAN"
  | "FADE_TO_BRAIN";

export const PHASE_DURATION: Record<Phase, number> = {
  BRAIN_SPIN:    5,
  FADE_TO_MRI:   1,
  MRI_SCAN:      6,
  FADE_TO_BRAIN: 1,
};

export const NEXT_PHASE: Record<Phase, Phase> = {
  BRAIN_SPIN:    "FADE_TO_MRI",
  FADE_TO_MRI:   "MRI_SCAN",
  MRI_SCAN:      "FADE_TO_BRAIN",
  FADE_TO_BRAIN: "BRAIN_SPIN",
};

/** Shared animation state — written by SceneController, read by models */
export interface SceneRefs {
  phaseRef:        MutableRefObject<Phase>;
  elapsedRef:      MutableRefObject<number>;   // seconds elapsed in current phase
  brainOpacRef:    MutableRefObject<number>;   // 0–1
  mriOpacRef:      MutableRefObject<number>;   // 0–1
  mriReadyRef:     MutableRefObject<boolean>;  // true once MRI FBX loaded
}
```

- [ ] **6.2 Create SceneLights**

```tsx
// apps/web/components/scene/SceneLights.tsx
export function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} color="#ffffff" castShadow={false} />
      {/* Teal key light — gives the teal glow */}
      <pointLight position={[0, 2, 4]} intensity={3} color="#2dd4bf" distance={12} />
      {/* Rim light from behind */}
      <pointLight position={[0, -3, -6]} intensity={0.8} color="#0d4444" distance={14} />
    </>
  );
}
```

- [ ] **6.3 Commit**

```bash
git add apps/web/components/scene/types.ts apps/web/components/scene/SceneLights.tsx
git commit -m "feat(scene): animation types + SceneLights"
```

---

## Task 7 — BrainModel component

**Files:**
- Create: `apps/web/components/scene/BrainModel.tsx`

The brain FBX is stylized (no PBR textures). We apply a custom `MeshStandardMaterial` with teal emission. The model is loaded with `useLoader(FBXLoader, ...)` inside a Suspense boundary.

- [ ] **7.1 Create BrainModel**

```tsx
// apps/web/components/scene/BrainModel.tsx
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { SceneRefs, PHASE_DURATION } from "./types";

interface Props {
  refs: SceneRefs;
}

export function BrainModel({ refs }: Props) {
  const fbx = useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Apply teal material once on load
  useEffect(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1a3a38"),
      emissive: new THREE.Color("#2dd4bf"),
      emissiveIntensity: 0.3,
      roughness: 0.55,
      metalness: 0.25,
    });
    matRef.current = mat;

    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = mat;
        child.castShadow = false;
      }
    });

    // Normalise scale — stylised brain is huge in some exports
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 2.2;
      fbx.scale.setScalar(targetSize / maxDim);
    }

    return () => { mat.dispose(); };
  }, [fbx]);

  useFrame((_, delta) => {
    if (!groupRef.current || !matRef.current) return;

    const { phaseRef, elapsedRef, brainOpacRef } = refs;
    const phase = phaseRef.current;
    const t = Math.min(elapsedRef.current / PHASE_DURATION[phase], 1);

    // Spin + float only during BRAIN_SPIN
    if (phase === "BRAIN_SPIN") {
      groupRef.current.rotation.y += 0.006; // ~360° in 5 s at 60fps
      groupRef.current.position.y = Math.sin(Date.now() * 0.0006) * 0.08;
    }

    // Opacity driven by brainOpacRef (set by SceneController)
    const opac = brainOpacRef.current;
    const mat = matRef.current;
    mat.transparent = opac < 1;
    mat.opacity = opac;
    // Pulse emission when fully visible
    if (phase === "BRAIN_SPIN") {
      mat.emissiveIntensity = 0.25 + Math.sin(Date.now() * 0.002) * 0.12;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={fbx} />
    </group>
  );
}
```

- [ ] **7.2 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **7.3 Commit**

```bash
git add apps/web/components/scene/BrainModel.tsx
git commit -m "feat(scene): BrainModel — FBX load, teal material, spin+float animation"
```

---

## Task 8 — MriModel component

**Files:**
- Create: `apps/web/components/scene/MriModel.tsx`

The MRI machine has PBR textures in `public/3d/mri/textures/`. Three.js FBXLoader resolves textures relative to the FBX file URL — textures must be in `public/3d/mri/textures/` (as copied in Task 2). The scan animation slides the bed mesh along the Z axis.

- [ ] **8.1 Create MriModel**

```tsx
// apps/web/components/scene/MriModel.tsx
"use client";

import { useEffect, useRef } from "react";
import { useLoader, useFrame } from "@react-three/fiber";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three";
import { SceneRefs, PHASE_DURATION } from "./types";

interface Props {
  refs: SceneRefs;
}

export function MriModel({ refs }: Props) {
  const fbx = useLoader(FBXLoader, "/3d/mri/IRM.fbx");
  const groupRef = useRef<THREE.Group>(null);
  const ringMeshes = useRef<THREE.Mesh[]>([]);
  const bedMeshes = useRef<THREE.Mesh[]>([]);
  const opacMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const bedOriginZ = useRef<number>(0);

  useEffect(() => {
    // Normalise scale
    const box = new THREE.Box3().setFromObject(fbx);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      fbx.scale.setScalar(3.5 / maxDim);
    }

    // Collect ring + bed meshes by name; clone materials for opacity control
    fbx.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const name = child.name.toLowerCase();

      // Clone material so opacity changes don't affect shared instances
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => m.clone());
      } else {
        child.material = child.material.clone();
      }

      const mats: THREE.MeshStandardMaterial[] = (
        Array.isArray(child.material) ? child.material : [child.material]
      ) as THREE.MeshStandardMaterial[];

      mats.forEach((m) => {
        m.transparent = true;
        opacMats.current.push(m);
      });

      if (name.includes("ring")) {
        ringMeshes.current.push(child);
      }
      if (name.includes("bed") || name.includes("matelas")) {
        bedMeshes.current.push(child);
        // Record initial Z for slide animation
        if (bedOriginZ.current === 0) bedOriginZ.current = child.position.z;
      }
    });

    // Signal ready to SceneController
    refs.mriReadyRef.current = true;
  }, [fbx, refs]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const { phaseRef, elapsedRef, mriOpacRef } = refs;
    const phase = phaseRef.current;
    const t = Math.min(elapsedRef.current / PHASE_DURATION[phase], 1);

    // Opacity driven by mriOpacRef
    const opac = mriOpacRef.current;
    opacMats.current.forEach((m) => { m.opacity = opac; });

    // Bed slide: only during MRI_SCAN
    if (phase === "MRI_SCAN") {
      // Slide bed in from one side, through bore, out the other
      // t: 0→0.2 enter, 0.2→0.8 traverse, 0.8→1 exit
      const slideRange = 3;
      const bedZ = bedOriginZ.current + THREE.MathUtils.lerp(-slideRange, slideRange, t);
      bedMeshes.current.forEach((m) => { m.position.z = bedZ; });

      // Ring emission pulse
      const emitIntensity = Math.sin(t * Math.PI) * 2.5;
      ringMeshes.current.forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        (mats as THREE.MeshStandardMaterial[]).forEach((mat) => {
          mat.emissiveIntensity = emitIntensity;
        });
      });
    } else {
      // Reset bed position when not in scan phase
      bedMeshes.current.forEach((m) => { m.position.z = bedOriginZ.current; });
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.5, 0]} rotation={[0, Math.PI * 0.25, 0]}>
      <primitive object={fbx} />
    </group>
  );
}
```

- [ ] **8.2 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **8.3 Commit**

```bash
git add apps/web/components/scene/MriModel.tsx
git commit -m "feat(scene): MriModel — FBX load, PBR textures, bed-slide + ring-glow animation"
```

---

## Task 9 — SceneController (phase state machine)

**Files:**
- Create: `apps/web/components/scene/SceneController.tsx`

- [ ] **9.1 Create SceneController**

```tsx
// apps/web/components/scene/SceneController.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { SceneRefs, Phase, PHASE_DURATION, NEXT_PHASE } from "./types";

interface Props {
  refs: SceneRefs;
}

export function SceneController({ refs }: Props) {
  useFrame((_, delta) => {
    const { phaseRef, elapsedRef, brainOpacRef, mriOpacRef, mriReadyRef } = refs;

    elapsedRef.current += delta;
    const phase = phaseRef.current;
    const dur = PHASE_DURATION[phase];
    const t = Math.min(elapsedRef.current / dur, 1);

    // ── opacity for each model ────────────────────────────────
    if (phase === "BRAIN_SPIN") {
      brainOpacRef.current = 1;
      mriOpacRef.current = 0;
    } else if (phase === "FADE_TO_MRI") {
      brainOpacRef.current = 1 - t;
      mriOpacRef.current = mriReadyRef.current ? t : 0;
    } else if (phase === "MRI_SCAN") {
      brainOpacRef.current = 0;
      mriOpacRef.current = mriReadyRef.current ? 1 : 0;
    } else if (phase === "FADE_TO_BRAIN") {
      brainOpacRef.current = t;
      mriOpacRef.current = mriReadyRef.current ? 1 - t : 0;
    }

    // ── phase advance ─────────────────────────────────────────
    if (elapsedRef.current >= dur) {
      const next: Phase = NEXT_PHASE[phase];
      // Skip MRI phases if model not yet loaded
      if (
        (next === "FADE_TO_MRI" || next === "MRI_SCAN") &&
        !mriReadyRef.current
      ) {
        phaseRef.current = "BRAIN_SPIN";
      } else {
        phaseRef.current = next;
      }
      elapsedRef.current = 0;
    }
  });

  return null; // renders nothing — pure behaviour
}
```

- [ ] **9.2 Commit**

```bash
git add apps/web/components/scene/SceneController.tsx
git commit -m "feat(scene): SceneController — phase state machine, opacity cross-fade, MRI-ready guard"
```

---

## Task 10 — LoginScene3D canvas assembly

**Files:**
- Create: `apps/web/components/scene/LoginScene3D.tsx`

This file assembles the Canvas, wires SceneRefs, and provides a shimmer fallback via Suspense. It is dynamically imported with `ssr: false` in the login page.

- [ ] **10.1 Create LoginScene3D**

```tsx
// apps/web/components/scene/LoginScene3D.tsx
"use client";

import { useRef, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { SceneLights } from "./SceneLights";
import { BrainModel } from "./BrainModel";
import { MriModel } from "./MriModel";
import { SceneController } from "./SceneController";
import type { SceneRefs, Phase } from "./types";

function ShimmerFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="w-32 h-32 rounded-full animate-pulse"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.15) 0%, transparent 70%)",
          border: "1px solid rgba(45,212,191,0.2)",
        }}
      />
    </div>
  );
}

export function LoginScene3D() {
  // Shared animation state — refs so useFrame updates don't trigger re-renders
  const phaseRef    = useRef<Phase>("BRAIN_SPIN");
  const elapsedRef  = useRef(0);
  const brainOpacRef = useRef(1);
  const mriOpacRef  = useRef(0);
  const mriReadyRef = useRef(false);

  const sceneRefs: SceneRefs = {
    phaseRef,
    elapsedRef,
    brainOpacRef,
    mriOpacRef,
    mriReadyRef,
  };

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ fov: 45, position: [0, 0.5, 5.5] }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <SceneLights />
        <SceneController refs={sceneRefs} />

        {/* Brain — loads fast (~3s), shows shimmer until ready */}
        <Suspense fallback={null}>
          <BrainModel refs={sceneRefs} />
        </Suspense>

        {/* MRI — loads silently in background (no fallback); skipped by
            controller if not ready when MRI_SCAN phase starts */}
        <Suspense fallback={null}>
          <MriModel refs={sceneRefs} />
        </Suspense>
      </Canvas>

      {/* CSS shimmer shown until brain model appears */}
      <Suspense fallback={<ShimmerFallback />}>
        <BrainReadySentinel />
      </Suspense>
    </div>
  );
}

// Sentinel component — mounted inside Suspense to hide shimmer once brain loads
function BrainReadySentinel() {
  // This component renders nothing but causes Suspense to resolve
  // once the FBXLoader for the brain has cached its result.
  // useLoader caches globally, so this re-uses the already-loading promise.
  const { useLoader } = require("@react-three/fiber");
  const { FBXLoader } = require("three/examples/jsm/loaders/FBXLoader.js");
  useLoader(FBXLoader, "/3d/brain/stylizedhumanbrain.fbx");
  return null;
}
```

> **Note on BrainReadySentinel:** The sentinel shares the same `useLoader` cache entry as BrainModel, so it causes Suspense to suspend (showing shimmer) until the brain FBX is ready, then resolves (hiding shimmer). The MRI loads in its own Suspense with `fallback={null}` so it's invisible.

- [ ] **10.2 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output

- [ ] **10.3 Commit**

```bash
git add apps/web/components/scene/LoginScene3D.tsx
git commit -m "feat(scene): LoginScene3D — Canvas assembly, dual Suspense, shimmer fallback"
```

---

## Task 11 — Wire LoginScene3D into login page

**Files:**
- Modify: `apps/web/app/login/page.tsx`

- [ ] **11.1 Add dynamic import at top of login page**

After the existing imports, add:
```tsx
import dynamic from "next/dynamic";

const LoginScene3D = dynamic(
  () => import("@/components/scene/LoginScene3D").then((m) => m.LoginScene3D),
  { ssr: false }
);
```

- [ ] **11.2 Replace NeuralBrain SVG with LoginScene3D**

In the left panel, find the section with `<NeuralBrain />`:
```tsx
{/* Brain illustration */}
<div className="relative z-10 flex-1 flex items-center justify-center py-8">
  <NeuralBrain />
</div>
```

Replace with:
```tsx
{/* 3D scene */}
<div className="relative z-10 flex-1 w-full">
  <LoginScene3D />
</div>
```

- [ ] **11.3 Remove the NeuralBrain function**

Delete the entire `function NeuralBrain()` component (the large SVG function defined near the top of the file) since it is no longer used.

- [ ] **11.4 tsc check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **11.5 Commit**

```bash
git add apps/web/app/login/page.tsx
git commit -m "feat(login): replace placeholder brain SVG with LoginScene3D 3D canvas"
```

---

## Task 12 — Browser test + final commit + push

- [ ] **12.1 Verify services are running**

Backend must be on :3001, web on :3000, ml-service on :8001.

```bash
curl -s http://localhost:3001/health && echo backend OK
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 && echo web OK
```

- [ ] **12.2 Open login page in browser**

```bash
# Using the browse skill:
$B goto http://localhost:3000/login
sleep 8   # wait for 3D canvas + brain model to load
$B screenshot /tmp/login-3d.png
```

Expected: left panel shows dark background, shimmer briefly, then brain model renders and rotates. Right panel shows main_logo.svg (large) + auth form.

- [ ] **12.3 Wait for full animation cycle (12 s)**

```bash
sleep 14
$B screenshot /tmp/login-3d-mri.png
```

Expected: MRI machine visible if model has loaded (may take 20-40 s first load). At minimum, brain continues spinning while MRI loads.

- [ ] **12.4 Verify patient portal login path**

```bash
$B fill @e1 "sara@fedmri.local"
$B fill @e2 "patient1234"
$B click @e3
sleep 2
$B url  # should be http://localhost:3000/patient
```

- [ ] **12.5 Verify datasets grid**

```bash
$B goto http://localhost:3000/login
# Login as researcher
$B fill @e1 "researcher@fedmri.local"
$B fill @e2 "research1234"
$B click @e3
sleep 2
$B goto http://localhost:3000/researcher/datasets
$B screenshot /tmp/datasets-grid.png
```

Expected: 3 hospital cards in a 3-column grid with gradient accents.

- [ ] **12.6 Push**

```bash
git push origin redesign/figma-portals
```

---

## Self-review notes

| Spec section | Covered by |
|---|---|
| 3D Canvas: brain spin 5s, fade 1s, MRI scan 6s, fade 1s | Tasks 6-11 |
| FBX assets in public/3d | Task 2 |
| Shimmer fallback while loading | Task 10 (ShimmerFallback + BrainReadySentinel) |
| MRI-not-ready guard (skip MRI phases) | Task 9 (SceneController) |
| main_logo.svg in login, signup, PortalShell | Task 5 |
| GradientCard primitive | Task 3 |
| GradientCard applied: patient dash, datasets NodeCard | Task 4 |
| Datasets lg:grid-cols-3 fix | Task 4 |
| Canvas hidden on mobile (no GPU waste) | Task 10 (`hidden lg:block` on left panel in login — already in existing code) |
| Performance: brain-first loading, MRI background | Tasks 7-10 dual Suspense |
