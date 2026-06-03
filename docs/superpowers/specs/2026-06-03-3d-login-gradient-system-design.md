# FedMRI — 3D Login Scene + Gradient System + Logo

**Date:** 2026-06-03  
**Status:** Approved  
**Branch:** redesign/figma-portals

---

## 1. Overview

Three deliverables shipped together as they share the same visual language:

1. **3D animated login panel** — brain and MRI machine FBX models rendered in a Three.js canvas on the login page left panel, looping through brain-spin → MRI-scan → brain-spin.
2. **Logo upgrade** — replace `logo-full.png` with `main_logo.svg` (vector, infinite scale) in login, signup, and PortalShell.
3. **Gradient card system** — generalise the datasets `NodeCard` radial-gradient style into a shared `GradientCard` primitive and apply it across researcher, doctor, and patient portals; fix datasets node grid.

---

## 2. 3D Login Scene

### 2.1 Stack

- `@react-three/fiber` — React renderer for Three.js; no class components, hooks-first.
- `@react-three/drei` — utilities: `useFBX`, `OrbitControls`, `Environment`, `Preload`, `Html` (loading overlay).
- `three` — core Three.js (peer dep of r3f).
- All three installed as `dependencies` (not dev) — needed at runtime.

### 2.2 Asset setup

Copy model trees into `apps/web/public/3d/`:

```
public/3d/
  brain/
    stylizedhumanbrain.fbx        ← 16 MB
  mri/
    IRM.fbx                       ← 129 MB
    textures/
      M_bed_01_BaseColor.png
      M_body_01_BaseColor.png
      M_ring_01_panels_BaseColor.png
      M_ring_01_panels_Emission.png
      M_ring_02_BaseColor.png
      M_ring_02_Emission.png
      … (all texture PNGs)
```

`useFBX` resolves texture paths relative to the FBX file location — placing textures next to the FBX is required.

### 2.3 Component architecture

```
LoginScene3D (Canvas, Suspense, no SSR)
├── SceneLights          — ambient + directional + teal point light
├── BrainModel           — useFBX, teal MeshStandardMaterial, float+spin anim
├── MriModel             — useFBX, PBR materials mapped from textures, bed anim
├── SceneController      — animation state machine driving phase+opacity
└── Html fallback        — shimmer skeleton while models load
```

`LoginScene3D` is `dynamic(() => import(...), { ssr: false })` — Three.js requires `window`, cannot SSR.

### 2.4 Animation state machine

States: `BRAIN_SPIN | FADE_TO_MRI | MRI_SCAN | FADE_TO_BRAIN`

```
BRAIN_SPIN (5s)    → FADE_TO_MRI (1s)
FADE_TO_MRI (1s)   → MRI_SCAN (6s)
MRI_SCAN (6s)      → FADE_TO_BRAIN (1s)
FADE_TO_BRAIN (1s) → BRAIN_SPIN
                   ↑_______________↙  (loop)
```

**BRAIN_SPIN**: brain Y-rotation += 0.006 rad/frame (~360° in 5 s at 60 fps); Y-position: `Math.sin(elapsed * 0.6) * 0.08` (gentle float). Teal `emissiveIntensity` pulses 0.2→0.5.

**FADE_TO_MRI / FADE_TO_BRAIN**: linear opacity cross-fade between brain and MRI meshes over 1 s. `mesh.material.transparent = true`, `mesh.material.opacity` lerped.

**MRI_SCAN**: MRI machine visible. Bed Z position: `t ∈ [0,1]` → `lerp(-4, +4, t)`. Ring emission (M_ring_01_panels, M_ring_02) intensity ramps from 0 → 2 → 0 in sync with bed travel. Brain hidden.

### 2.5 Materials

**Brain** — override loaded FBX material with:
```js
new THREE.MeshStandardMaterial({
  color: '#1a3a3a',
  emissive: '#2dd4bf',
  emissiveIntensity: 0.3,
  roughness: 0.6,
  metalness: 0.2,
})
```

**MRI machine** — keep loaded FBX materials (PBR). Identify ring meshes by name pattern `ring` → store refs for emission animation.

### 2.6 Camera & lighting

- Camera: PerspectiveCamera, fov 45, position `[0, 0, 6]` (brain) / `[3, 1.5, 8]` (MRI).
- Lights: `ambientLight intensity={0.3}`, `directionalLight position={[5,5,5]} intensity={1}`, `pointLight color="#2dd4bf" position={[0,2,3]} intensity={2}` (teal key light).
- No `OrbitControls` in production (mouse drag disabled on login).

### 2.7 Fallback

While Suspense is loading, render a CSS shimmer gradient: `linear-gradient(135deg, #0d1117 0%, #0a1a1a 100%)` with a pulsing teal ring glyph (same as existing placeholder SVG, no JS needed). Ensures login form is usable immediately.

---

## 3. Logo upgrade

`main_logo.svg` (889×415 viewBox) contains: brain icon (left 415×415) + "FedMRI" wordmark with angular gradient fill.

Replace in:
- `apps/web/app/login/page.tsx` — left panel logo: `<img src="/main_logo.svg" className="w-56 h-auto">`, bottom copy: `<img src="/main_logo.svg" className="w-40 h-auto">` (or `w-48` to taste)
- `apps/web/app/patient/register/page.tsx` — same
- `apps/web/components/shell/PortalShell.tsx` — sidebar logo: currently uses `logo-mark.png` (32×32) + text — replace sidebar logo block with `<img src="/main_logo.svg" className="w-36 h-auto">`

`logo-full.png` and `logo-mark.png` kept as fallbacks.

---

## 4. Gradient card system

### 4.1 `GradientCard` component

New file: `apps/web/components/ui/GradientCard.tsx`

Props:
```ts
interface GradientCardProps {
  children: ReactNode
  accent?: 'teal' | 'indigo' | 'amber'
  className?: string
  style?: CSSProperties
}
```

Renders a `div.rounded-xl.border.relative.overflow-hidden` with a `radial-gradient(circle at top right, {accent}22, transparent 65%)` blob overlay (same technique as `NodeCard`) plus an optional `linear-gradient(135deg, {accent}08, transparent 50%)` sweep from top-left.

Accent hex mapping: `teal → #2dd4bf`, `indigo → #6366f1`, `amber → #f59e0b`.

### 4.2 Apply to

| Location | Accent | Change |
|---|---|---|
| Researcher overview stats (F1/Accuracy/Raw bytes) | teal | wrap `StatCard` rows |
| Doctor dashboard FL topology card | indigo | `GradientCard accent="indigo"` |
| Patient `Network Status` card | teal | already partial — complete the gradient |
| Patient `Latest MRI Analysis` card | dynamic by subtype color | derive from `subtypeColor()` |
| Researcher `NodeCard` (datasets) | per-hospital (teal/indigo/amber) | already done — keep, verify grid |

### 4.3 Datasets node grid fix

Current: `grid grid-cols-3 gap-3` — breaks at medium widths.  
Fix: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` with `min-h-[120px]` on each card. Stat summary row below stays full-width.

---

## 5. Files changed

```
apps/web/
  app/login/page.tsx                              ← logo + 3D scene
  app/patient/register/page.tsx                   ← logo
  components/shell/PortalShell.tsx                ← logo
  components/ui/GradientCard.tsx                  ← NEW
  components/scene/LoginScene3D.tsx               ← NEW (dynamic import)
  components/scene/BrainModel.tsx                 ← NEW
  components/scene/MriModel.tsx                   ← NEW
  app/researcher/datasets/page.tsx                ← grid fix
public/3d/brain/stylizedhumanbrain.fbx            ← COPY
public/3d/mri/IRM.fbx                             ← COPY
public/3d/mri/textures/*.png                      ← COPY
package.json                                      ← add r3f/drei/three
```

---

## 6. Performance budget

- Brain FBX: 16 MB → loads in ~3 s on 50 Mbps; acceptable for a login page panel.
- MRI FBX: 129 MB → loads in ~20 s on 50 Mbps. **Mitigation**: start with brain phase (5 s); MRI is lazy-loaded in the background during brain-spin. Suspense boundary only covers the full scene; shimmer shows until brain loads (~3 s). MRI loads silently and takes over when its phase begins.
- Canvas is `hidden lg:block` — no 3D on mobile (avoids mobile GPU budget issues).

---

## 7. Invariants

No invariants affected. This is purely presentational; no backend calls, no data models changed.
