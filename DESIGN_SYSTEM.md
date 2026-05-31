# FedMRI — Design System

Complete reference for the UI/UX design language across the **web app** (Next.js) and **mobile app** (Expo / React Native). Both surfaces share the same color and spacing vocabulary with platform-appropriate rendering.

---

## 1. Design Philosophy

FedMRI uses a **dark medical-tech aesthetic**: deep navy/charcoal backgrounds, teal as the primary action color, and muted secondary text. The visual language is clean and data-forward — no decorative elements, every element earns its place.

Two distinct portal identities share the same token set:

| Portal | Identity | Audience |
|---|---|---|
| Doctor Portal (web) | Dense, data-rich, two-column layout with live topology sidebar | Hospital radiologists / oncologists |
| Patient Portal (web + mobile) | Sparse, centered, plain-language copy, no FL jargon | Patients receiving analysis |

**Key editorial rule:** Patient-facing copy never uses "federated learning", "gradient", "weight delta", or any FL jargon. Instead: "AI trained across 3 hospitals".

---

## 2. Color Tokens

These are defined in `apps/web/app/globals.css` (CSS variables) and `apps/mobile/src/lib/theme.ts` (JS constants). Both sets are identical in value.

### Base palette

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` / `colors.bgBase` | `#0d1117` | Page background, input backgrounds |
| `--bg-card` / `colors.bgCard` | `#161b22` | Card / panel backgrounds |
| `--bg-card2` / `colors.bgCard2` | `#1c2128` | Nested card, secondary surface |
| `--border` / `colors.border` | `#30363d` | All borders, dividers, tracks |
| `--text-primary` / `colors.textPrimary` | `#e6edf3` | Body text, headings |
| `--text-secondary` / `colors.textSecondary` | `#8b949e` | Labels, captions, metadata |

### Accent palette

| Token | Hex | Usage |
|---|---|---|
| `--teal` / `colors.teal` | `#2dd4bf` | Primary action color, active states, links |
| `--teal-dim` / `colors.tealDim` | `#14b8a6` | Primary button fill (solid) |
| `--teal-glow` / `colors.tealGlow` | `rgba(45,212,191,0.15)` | Tinted backgrounds, active nav pills, info banners |
| `--amber` / `colors.amber` | `#f59e0b` | FL-active state, warnings, moderate confidence |
| `--coral` / `colors.coral` | `#fb7185` | Errors, dispute actions, low confidence, disclaimers |
| `--blue-accent` / `colors.blue` | `#60a5fa` | Luminal B subtype accent |
| `--teal-deep` | `#0f766e` | Scan-upload gradient deep stop |

### Subtype color map

Each molecular subtype has a fixed accent color used consistently across all charts, cards, and labels:

| Subtype | Hex | Rationale |
|---|---|---|
| Luminal A | `#2dd4bf` (teal) | Most common, positive prognosis — matches the primary app accent |
| Luminal B | `#60a5fa` (blue) | Similar to Luminal A but differentiated |
| HER2 | `#f59e0b` (amber) | Requires targeted therapy — attention color |
| Triple Negative | `#fb7185` (coral) | Worst prognosis, chemo only — alert color |

### Semantic color derivations

These are constructed inline via string concatenation (hex + alpha suffix):
- Error background: `#fb718515` (coral at 8%)
- Error border: `#fb718830` (coral at 19%)
- Teal glow border: `var(--teal)40` (teal at 25%)
- Teal active badge border: `var(--teal)40`
- Subtype badge background: `{color}20` (subtype color at 12%)
- Subtype badge border: `{color}50` (subtype color at 31%)

### Semantic & subtype CSS variables

The following CSS variables are defined in `apps/web/app/globals.css` and available globally across the web app:

- `--success` (`#2dd4bf`), `--warning` (`#f59e0b`), `--danger` (`#fb7185`), `--info` (`#60a5fa`) — semantic state tokens for use in components instead of inline hex.
- `--subtype-luminal-a`, `--subtype-luminal-b`, `--subtype-her2`, `--subtype-tn` — per-subtype accent colors that mirror the `SUBTYPE_COLOR` record in `apps/web/lib/types.ts`. Use these variables in shared UI primitives so subtype color assignments stay in one place.

---

## 3. Typography

### Web

| Purpose | Font | Weight | Size | Notes |
|---|---|---|---|---|
| Body / UI | Geist Sans | 400–700 | 12–16px base | `-webkit-font-smoothing: antialiased` |
| Monospace / technical | Geist Mono | 400 | match context | File names, percentages, tabular numbers |
| Page title (h1) | Geist Sans | 600 | `text-base` (16px) | Consistent low-emphasis headers |
| Card title | Geist Sans | 600 | `text-sm` (14px) | |
| Section label / eyebrow | Geist Sans | 400 | `text-xs` (12px) | `uppercase tracking-widest` — used for all category labels |
| Metadata / captions | Geist Sans | 400 | 11px | `text-[11px]` |
| Micro labels | Geist Sans | 400 | 9–10px | Status badges, scale labels |

**Eyebrow pattern:** Section labels above values always use `text-xs uppercase tracking-widest` in `--text-secondary`. Example: "PREDICTED SUBTYPE", "AI FOCUS AREAS", "CONFIDENCE".

### Mobile

| Purpose | Font | Weight | Size |
|---|---|---|---|
| Screen title | System default | 700 | 20–22sp |
| Card heading | System default | 700 | 14–15sp |
| Body text | System default | 400 | 12–13sp |
| Labels / captions | System default | 400 | 10–11sp |
| Monospace (IDs, URLs) | `monospace` | 400 | 11sp |
| Status badge text | System default | 700 | 9sp, `letterSpacing: 0.8` |

---

## 4. Spacing & Layout

### Web grid

- **Doctor portal:** `grid lg:grid-cols-[1fr_300px]` — main content + 300px FL topology sidebar, `gap-5 p-5`, max-width `max-w-7xl mx-auto`
- **Patient portal:** Single column, `max-w-xl mx-auto p-5` (scan/results) or `max-w-3xl mx-auto p-5` (chat)
- **Login / onboarding:** Centered card, `max-w-sm` or `max-w-md`, full-screen flex centering

### Web spacing scale (Tailwind)

| Usage | Value |
|---|---|
| Card internal padding | `p-4` (16px) to `p-6` (24px) |
| Card gap | `space-y-4` (16px) between cards |
| Header padding | `px-6 py-3` |
| Form field gap | `space-y-3` |
| Button padding | `px-3 py-1` (nav), `px-4 py-2` (action), `py-2.5` (primary CTA) |
| Section gap inside card | `mb-4` or `mb-5` |

### Mobile spacing

| Usage | Value |
|---|---|
| Screen padding | 16px |
| Card padding | 14–24px |
| Card gap (FlatList) | `marginBottom: 10` |
| Button vertical padding | 12–14px |
| Section gap | 24px (`marginTop: 24`) |

### Border radius

| Context | Web | Mobile |
|---|---|---|
| Cards / panels | `rounded-xl` (12px) | `borderRadius: 14–16` |
| Buttons | `rounded-lg` (8px) | `borderRadius: 8–12` |
| Nav pills / small badges | `rounded-lg` (8px) | `borderRadius: 6–10` |
| Input fields | `rounded-lg` (8px) | `borderRadius: 8` |
| Avatars / circular elements | `rounded-full` | `borderRadius: 38` (half of 76px avatar) |
| Logo mark | `rounded-xl` | `borderRadius: 10` |

---

## 5. Elevation & Surfaces

There is **no box-shadow system** — depth is conveyed through background color layering:

```
Layer 0: --bg-base (#0d1117)    ← page
Layer 1: --bg-card (#161b22)    ← cards, panels, header
Layer 2: --bg-card2 (#1c2128)   ← nested items, medication protocols, input bg override
Layer 3: rgba(0,0,0,0.7)        ← floating overlays (heatmap loading badge)
```

The only shadow-like effect is teal glow on the scan upload widget during active states: `boxShadow: "0 0 60px rgba(0,229,204,0.08), inset 0 0 40px rgba(0,229,204,0.04)"`.

---

## 6. Component Catalog

### 6.1 Navigation

#### Doctor Portal Header (web)
- **Height:** `py-3` + content ≈ 48px
- **Background:** `--bg-card` with `border-b` in `--border`
- **Logo mark:** 28×28px rounded-xl teal-glow box with custom SVG crosshair icon (outer circle r=7, inner dot r=1.2, 4 cardinal line stubs)
- **Brand text:** "FedMRI" 14px/700, "Doctor Portal" 12px secondary — separated by 1px vertical divider
- **Nav items:** Three pill-style links: Scan · Assistant · Metrics
  - **Inactive:** transparent bg, secondary text, transparent border
  - **Active:** `--teal-glow` bg, `--teal` text, `--teal`40 border
  - Padding: `px-3 py-1`, `text-xs`, `rounded-lg`
- **Right side:** Doctor name (secondary text) + "Sign out" ghost button (`--bg-card2`, border, secondary color)

#### Doctor Silo Status Bar (web)
- Sits between header and main content
- **Height:** `py-1.5`, `text-[11px]`
- **Default (idle):** teal-glow background, `#99f6e4` text — "Your hospital silo is active — data stays here"
- **FL active (local_training / aggregating):** `#f59e0b15` background, `#fbbf24` text — shows FL status with 0-bytes assurance
- **Shield icon:** 12×12px inline SVG path
- Transitions dynamically based on `flPhase` state from WebSocket

#### Patient Portal Header (web)
- Same structure but simpler — no logo mark SVG, just text brand
- Nav: Scan · Results · Ask AI (hidden on onboarding page)
- Info banner below header: `--teal-glow` bg, `#99f6e4` text — "AI trained across 3 hospitals — no patient data was ever shared between them"
- Info icon: circle with vertical line (ℹ style), 12×12px

#### Mobile Bottom Tab Bar
- **Height:** 68px, `paddingTop: 8`, `paddingBottom: 12`
- **Background:** `colors.bgCard`, 1px top border in `colors.border`
- **4 tabs:** Scan · Results (History) · Chat (Ask AI) · Profile
- **Icons:** PNG assets tinted via `tintColor`
  - Active: `colors.teal`, opacity 1.0
  - Inactive: `colors.textSecondary`, opacity 0.7
- **Label:** 10sp, weight 600, `marginTop: 2`
- **Active color:** `colors.teal`; inactive: `colors.textSecondary`
- **Header style:** `colors.bgCard` bg, `colors.textPrimary` title 15sp/700, `colors.teal` tint (back button / icons)

---

### 6.2 Cards & Panels

**Standard card (web):**
```
rounded-xl border p-4
background: var(--bg-card)
borderColor: var(--border)
```

**Standard card (mobile):**
```
backgroundColor: colors.bgCard
borderColor: colors.border
borderWidth: 1
borderRadius: 14
padding: 14
```

**Nested / secondary card (web):** same but `--bg-card2`, `gap-3` or `p-3`

**Panel with title (web — Model Metrics):**
```
rounded-xl border p-4
title: text-sm font-semibold primary
subtitle: text-xs mt-0.5 secondary
```

---

### 6.3 Buttons

#### Primary CTA (web)
```
background: var(--teal-dim)   ← #14b8a6
color: #0d1117                ← dark — high contrast
rounded-lg text-sm font-semibold py-2.5
transition-opacity disabled:opacity-50
```
Used for: "Sign in", "Got it" (onboarding), "Next →"

#### Primary CTA (mobile)
```
backgroundColor: colors.tealDim   ← #14b8a6
borderRadius: 8–12
paddingVertical: 12–14
color: colors.bgBase or "#fff"
fontWeight: "600"–"700"
```

#### Ghost / secondary button (web)
```
background: var(--bg-card2)
color: var(--text-secondary)
border: 1px solid var(--border)
rounded-lg text-xs px-3 py-1
```
Used for: "Sign out", "Cancel", "Analyse another scan"

#### Teal ghost button (web)
```
background: var(--teal-glow)
color: var(--teal)
border: 1px solid var(--teal)40
rounded-lg text-xs px-4 py-2 font-medium
```
Used for: "Discuss with AI assistant →", "Download PDF report", nav active state

#### Coral / danger button (web)
```
background: #fb718520
color: #fb7185
border: 1px solid #fb718540
```
Used for: "✗ Dispute", "Confirm dispute"

#### Teal validate button (web)
```
background: #2dd4bf20
color: #2dd4bf
border: 1px solid #2dd4bf40
```
Used for: "✓ Correct" (feedback)

#### Amber / warning secondary (mobile)
```
backgroundColor: "rgba(255,159,10,0.12)"
color: "#ff9f0a"
border: "1px solid rgba(255,159,10,0.4)"
```
Used for: "Analyse anyway →" in verification warning state

#### Send button (chat, both platforms)
- Web: teal-dim bg, dark text, `px-4 py-2`, disabled opacity 0.40
- Mobile: teal-dim bg, `paddingHorizontal: 16`, `borderRadius: 10`

#### Text link (mobile)
- "New here? Create an account" — secondary text with teal inline link span
- "PDF" download — teal underline, no border/background

---

### 6.4 Form Fields

#### Text input (web)
```
background: var(--bg-base)
color: var(--text-primary)
border: 1px solid var(--border)
rounded-lg text-sm px-3 py-2.5
outline-none transition-colors
```
Label: `text-xs uppercase tracking-widest mb-1.5` in secondary color

#### Text input (mobile)
```
backgroundColor: colors.bgBase
color: colors.textPrimary
borderWidth: 1, borderColor: colors.border
borderRadius: 8
paddingHorizontal: 12, paddingVertical: 10
fontSize: 14
```
Label: `fontSize: 10, letterSpacing: 1.5, color: colors.textSecondary`

#### Select / dropdown (web — dispute form)
Same styling as text input, native `<select>` element

#### Range slider (web — attention heatmap opacity)
- `type="range"` with `accent-teal-400` class
- Disabled state when heatmap is hidden

---

### 6.5 Error / Alert States

#### Error message inline (web)
```
background: #fb718515
color: #fb7185
border: 1px solid #fb718830
rounded-lg text-xs p-3
motion.div: initial opacity 0 y:-4, animate opacity 1 y:0
```

#### Error box (mobile)
```
backgroundColor: "#fb718515"
borderColor: colors.coral + "60"
borderWidth: 1, borderRadius: 8–10, padding: 10–12
```

#### Medical disclaimer box (web — patient scan result)
```
background: #fb718510
border: 2px solid #fb718840   ← 2px, thicker for emphasis
color: #fb7185
rounded-xl p-4 text-sm
```
Includes a triangle warning SVG icon (14×14px) before "Important" heading. Non-dismissable.

#### Medical disclaimer (mobile — scan result)
```
backgroundColor: "#fb718508"
borderColor: colors.coral + "50"
borderWidth: 1, borderRadius: 14, padding: 14
```
Title: coral, 13sp, weight 700, "⚠ For educational purposes only"
Body: `colors.coral + "cc"`, 11sp, lineHeight 17

#### Patient chat disclaimer bar (web)
```
background: #f59e0b15
color: #fbbf24
border-top: 1px solid var(--border)
px-3 py-2 text-[11px]
```
Triangle warning SVG icon + "This AI provides general information only. Always consult a certified oncologist."

#### Patient chat disclaimer bar (mobile)
```
backgroundColor: "#f59e0b15"
borderTopWidth: 1, borderTopColor: colors.amber + "40"
paddingHorizontal: 14, paddingVertical: 8
color: colors.amber, fontSize: 10
```

---

### 6.6 Badges & Pills

#### Status indicator pill (web — FL topology header)
```
text-[11px] px-2 py-1 rounded-full flex items-center gap-1.5
Idle: bg-card2, border, secondary text
Active: teal-glow, teal border, teal text
```
Contains a 6×6px dot: secondary (idle) or teal with node-pulse animation (active)

#### Confidence badge (web — PredictionCard)
```
text-xs font-semibold px-3 py-1 rounded-full
background: {subtypeColor}20
color: {subtypeColor}
border: 1px solid {subtypeColor}50
```
Shows percentage: "73%"

#### Model version (web)
```
text-xs secondary — "Model v3"
```

#### Model badge (mobile)
```
backgroundColor: colors.bgCard2, borderRadius: 10
paddingVertical: 8, paddingHorizontal: 14
color: colors.textSecondary, fontSize: 10, letterSpacing: 0.5
"Model v{n} · AI trained across 3 hospitals"
```

#### Treatment line badge (web — MedicationCard)
Three fixed classes using Tailwind:
- First-line: `bg-teal-900/60 text-teal-300 border border-teal-700/50`
- Second-line: `bg-blue-900/60 text-blue-300 border border-blue-700/50`
- Adjuvant: `bg-purple-900/60 text-purple-300 border border-purple-700/50`

#### Drug agent chip (web — MedicationCard)
```
text-xs px-2 py-0.5 rounded
background: var(--bg-base)
color: var(--text-primary)
border: 1px solid var(--border)
```

#### Status badge (mobile — ResultsScreen)
```
borderWidth: 1, borderRadius: 6
paddingHorizontal: 7, paddingVertical: 2
fontSize: 9, fontWeight: "700", letterSpacing: 0.8
VALIDATED → teal colors
DISPUTED → amber colors
PENDING → hidden (only shown for non-pending)
```

#### Case status dot (mobile — ResultsScreen)
8×8px circle, `borderRadius: 4`, colored by subtype

#### Model version tag (mobile)
```
color: colors.teal + "80"
fontSize: 10, fontWeight: "600"
backgroundColor: colors.tealGlow
paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4
```

---

### 6.7 Probability / Progress Bars

#### Subtype probability bars (web — PredictionCard)
- Container: `flex-1 h-1.5 rounded-full overflow-hidden` on `--bg-base` track
- Fill: animated with framer-motion `initial width:0 → animate width:{p}%`, `duration 0.6 delay 0.2+i*0.05`
- Active subtype bar: subtype color; others: `--border`
- Label: 112px fixed-width left, percentage right `w-10 text-right tabular-nums`

#### Confidence bar (mobile — ScanScreen + ResultsScreen)
- Track: `height: 5–6, backgroundColor: colors.border/bgCard2, borderRadius: 3, overflow: hidden`
- Fill: colored by confidence threshold
  - ≥70%: `colors.teal`
  - ≥50%: `colors.amber`
  - <50%: `colors.coral`

#### Upload progress bar (web — ScanUpload)
- 2px height, full-width container with `--border` background
- Fill: `linear-gradient(90deg, var(--teal-deep), var(--teal))` with `boxShadow: "0 0 8px var(--teal)"`
- Animated via framer-motion `width: {progress}%`, transition duration 0.3
- Progress tracked by ticker interval (random 0–10% increments up to 88%, then jumps to 100%)

#### Upload progress (mobile — ScanScreen while uploading)
- `ActivityIndicator` in teal, large size
- Text: "Analysing scan…" (primary) + "AI model processing, this takes 2–4 s" (secondary)

---

### 6.8 ScanUpload Component (web)

The scan upload widget is the most visually sophisticated component. It is a dropzone with 4 states:

#### Idle state
- Outer container: `rounded-2xl`, `border: 1px solid var(--border)`, `--bg-card`, `minHeight: 280px`
- On `isDragActive`: border becomes `rgba(0,229,204,0.5)`, bg `rgba(0,229,204,0.04)`, double glow shadow
- **Aperture rings animation** (centered, 128×128px):
  - Ring 1 (outermost): dashed, `rgba(0,229,204,0.12)`, `orbit-cw 25s linear infinite`
  - Ring 2 (mid): dashed, `rgba(0,229,204,0.18)`, `orbit-ccw 18s linear infinite`
  - Ring 3 (inner): solid, `rgba(0,229,204,0.3)`, static
  - Core (center): 8px smaller inset, radial bg, contains MRI crosshair SVG
- **MRI crosshair SVG:** Circle r=5 + filled circle r=2 + 4 cardinal line stubs — all in teal
- Drag-active: rings and core intensify
- Text: "Drop breast MRI scan" (14px/600) + file format hint in Geist Mono secondary
- Accepted formats: `.png`, `.jpg`, `.nii`, `.dcm`, up to 50MB (doctor) / 10MB (patient mobile)

#### Verifying state
- Same aperture but rings speed up dramatically: `orbit-cw 8s`, `orbit-ccw 6s`, inner `ring-breathe 1.6s`
- Core: spinning quarter-arc SVG via framer-motion `rotate: 360, duration: 2, repeat: Infinity`
- Text: "Verifying scan" + file name in Geist Mono teal
- **Minimum display time:** 700ms to keep badge readable

#### Uploading state
- Aperture fully lit: rings faster still (5s, 4s), brightness `drop-shadow(0 0 16px rgba(0,229,204,0.3))`
- Core: MRI cross-section icon (rect + circle + dot)
- Animated scan sweep overlay: absolute horizontal line traversing top-to-bottom with `animate-scan`
- Progress bar below aperture
- Filename in Geist Mono secondary

#### Warning state (non-MRI detected)
- Replaces dropzone completely
- Orange (#ff9f0a) themed card: `border: 1px solid rgba(255,159,10,0.3)`, subtle glow shadow
- Warning icon: 44×44px hexagonal box in orange-10%, triangle SVG stroke orange
- Error title in orange (14px/600), reason text in secondary, filename+confidence in Geist Mono `text-dim`
- Two action buttons side by side: "← Choose another file" (ghost) + "Analyse anyway →" (orange ghost)

---

### 6.9 ScanUpload Component (mobile)

Simpler — no animated aperture rings. Three visual states:

**Upload zone (idle):**
- Dashed border, `borderColor: colors.teal + "40"`, `borderRadius: 16`, `padding: 32`
- Background: `colors.tealGlow`
- Icon: 🩻 emoji in 60×60 circle card
- "Tap to choose from library" (15sp/600) + "JPEG · PNG · up to 10 MB" (11sp)
- OR divider then camera button with 📷 emoji

**Preview + verify:**
- Image preview: 100% width, 260px height, `borderRadius: 14`
- Verify badge overlaid below image:
  - Checking: ActivityIndicator + "Verifying scan…"
  - OK: ✓ + reason in teal on teal-glow background
  - Warn: ⚠ + reason in amber on amber-10% background
- Two buttons: "Cancel" (ghost) + "Analyse →" / "Analyse anyway →" / "Verifying…" (primary)

**Result (hero layout):**
- Subtype hero card: centered, icon box (56×56, rounded-16, subtype-color-20% bg), "AI RESULT" eyebrow (10sp, letterSpacing 2), subtype name (26sp/800), plain description (12sp secondary)
- Confidence card: label/value row + confidence bar
- Class probabilities card: 4-row bar breakdown
- Model badge chip
- Disclaimer card (coral)
- "Analyse another scan" ghost button

---

### 6.10 PredictionCard (web)

Two-column card, right-aligned confidence badge:
- **Header:** "PREDICTED SUBTYPE" eyebrow → subtype name (24px/700 in subtype color) → plain description → confidence pill
  - Subtype name: spring animation, `scale 0.9→1, delay 0.1`
- **Probability bars:** 4 subtypes with horizontal bars (see §6.7)
- **Confidence row:** colored text label + "Model v{n}" right-aligned
- **Feedback section (3 states):**
  - **Idle:** "✓ Correct" (teal ghost) + "✗ Dispute" (coral ghost) side by side
  - **Disputing:** select dropdown for correct subtype + "Confirm dispute" (coral) + "Cancel" (base ghost)
  - **Submitted:** green checkmark circle + "Feedback recorded — model will be updated"

---

### 6.11 AttentionOverlay (web)

Canvas-based heatmap component:
- Container: `rounded-xl border p-4`, card background
- Header: "AI FOCUS AREAS" eyebrow + "Regions that influenced the prediction" subtitle + "Hide/Show heatmap" toggle button
- **Canvas area:** 224×224px, `background: #050a0e` (near-black)
  - Layer 1 (background canvas): procedurally drawn breast MRI:
    - Outer ellipse with dark radial gradient (tissue)
    - 18 fatty tissue streaks at radial angles
    - Fibroglandular core (bright ellipse with radial gradient)
    - Nipple marker (small arc)
    - Skin boundary (thin stroke ellipse)
    - Scanner grid artifacts (faint horizontal lines)
    - FOV corner markers in teal (6px L-shape at each corner)
  - Layer 2 (heatmap canvas): attention weights via jet colormap (blue→cyan→green→yellow→red), `mixBlendMode: "screen"`
  - Scale bar: bottom-right, 48×4px gradient strip + "activation" label in 9px semi-transparent
  - Loading overlay: centered pill `rgba(0,0,0,0.7)` bg, teal text "Loading heatmap…"
- **Opacity slider:** range 0–100, default 65%, `accent-teal-400`, disabled when heatmap hidden

---

### 6.12 FlTopology (web — Doctor sidebar)

SVG-based animated network diagram (280×240 viewBox):
- **Header:** "FEDERATED TRAINING" eyebrow + "FL Network" title + status pill
- **Topology:**
  - 3 hospital nodes: circles r=14, triangle arrangement (60,52), (200,52), (130,178)
  - Aggregator node: 48×32 rectangle at center (130,110)
  - Connection lines: 1px solid `--border` (idle) → 1.5px dashed teal (active)
  - Animated data packets (circles r=3, teal): travel hospital→agg (training) or agg→hospital (aggregating), staggered delays
  - Hospital node pulse: expanding teal circle `r 16→26→16, opacity 0→0.15→0`, 2s repeat
  - Completion checkmark: green circle (cx=220, cy=195, r=14) + path, spring animation
- **Status labels** (cycle through 4 phases):
  - `idle` → "Waiting for scan upload"
  - `local_training` → "Local training on hospital data…"
  - `aggregating` → "Aggregating model updates…"
  - `complete` → "Round complete — Model v{n} (+{delta}pp F1)"
  - Transitions: fade-slide via AnimatePresence, 0.25s
- **Privacy pill:** teal-glow background, shield SVG, "Your data stayed in your hospital — 0 bytes of patient data transmitted"

---

### 6.13 ChatPanel (web)

Full-height container: `h-[calc(100vh-180px)] rounded-xl border`
- **Case context banner** (doctor only): inline metadata — subtype (teal), confidence %, model version, `border-b`
- **Message list:** scrollable, auto-scroll on new messages
  - **Empty state:** centered text + starter chips (4 question suggestions)
    - Starter chip: `--bg-card2`, primary text, border, `rounded-lg text-xs px-3 py-2`
  - **User bubble:** right-aligned, `--teal-glow` bg, teal text, teal border
  - **Assistant bubble:** left-aligned, `--bg-card2` bg, primary text, border
  - **Streaming cursor:** inline teal pulse block `w-1 h-3 bg-teal-400 animate-pulse`
  - **Markdown rendering:** `react-markdown` with custom prose styles (p, ul, ol, code, strong, a)
- **Input bar:** `border-t p-3 flex gap-2`
  - Input field: base background, border, full flex
  - Send button: teal-dim bg, dark text, `disabled:opacity-40`
- **Patient disclaimer bar:** amber-15% bg, amber text, triangle icon

---

### 6.14 ChatScreen (mobile)

`KeyboardAvoidingView`, `keyboardVerticalOffset: 88`
- Header: title + subtitle in padding-16 block
- Message list: `ScrollView` with `scrollToEnd` on new messages
- **Empty state:** centered prompt + `startersWrap` (4 TouchableOpacity chips, vertical stack)
  - Chip: `bgCard` bg, border, `borderRadius: 10`, padding 12
- **Bubbles:**
  - User: `tealGlow` bg, `teal+60` border, teal text
  - Assistant: `bgCard` bg, border, primary text
  - Max width 85%, `borderRadius: 12`, `paddingHorizontal: 12, paddingVertical: 8`
  - Streaming indicator: teal ▌ character appended to last assistant message
- **Input bar:** `bgCard` bg, border-top, row layout
  - TextInput + Send TouchableOpacity
  - Disabled while streaming: opacity 0.4
- **Disclaimer bar:** amber-15% bg, amber-40 border-top, amber text

---

### 6.15 MedicationCard (web)

First component shown after prediction result (above PredictionCard):
- Header: "TREATMENT PROTOCOLS" eyebrow + subtype name in subtype color + molecular profile (secondary) + "AI Recommendation" pill (right)
- Protocol items (staggered fade-in, delay `0.1 + i*0.08`):
  - Container: `--bg-card2`, border, `rounded-lg p-3`
  - Line badge (teal/blue/purple Tailwind classes)
  - Drug agent chips (base background, border)
  - Note text (secondary, `text-xs leading-relaxed`)
- Footer: ℹ icon + "AI-assisted — always confirm with oncology team before prescribing"

---

### 6.16 Model Metrics Page (web)

Four stat cards in a responsive grid (`grid-cols-1 md:grid-cols-4`):
- Stat card: `rounded-xl border p-4`
  - Label: `text-[11px] uppercase tracking-widest secondary`
  - Value: `text-2xl font-bold tabular-nums` in accent color
  - Hint (optional): `text-[11px] secondary mt-1`
  - Colors: Centralized F1 = amber, FedProx F1 = teal, Privacy gap = conditional (teal if positive), Patients protected = blue

Charts in `grid-cols-1 lg:grid-cols-2`:
- Convergence chart (Recharts line chart): FL rounds on X axis, F1 macro on Y, centralized as dashed reference line
- Per-class F1 (grouped bar chart): FedAvg vs FedProx vs Centralized per subtype
- Confusion matrix (`lg:col-span-2`): full-width heatmap grid
- Privacy framing box: teal-glow bg, teal border, teal+white text explaining the privacy cost

---

### 6.17 Patient Onboarding (web)

3-step linear flow:
- **Step indicators:** 3 horizontal pills — active: 32px wide, teal; inactive: 16px wide, `--border`
- **Card:** `rounded-2xl border p-6`, card background, `AnimatePresence mode="wait"` with `x:24→0` slide enter, `x:-24` exit
- Each step has:
  - Title (16px/600)
  - Visual component (custom SVG animations, 60–80px icons)
  - Body text (14px secondary, `leading-relaxed`)
- **Navigation:** "Skip" (ghost, secondary text, border) + "Next →" / "Got it" (primary teal-dim)

**Step visuals:**
1. Three hospital icons with lock badges (teal building SVG), staggered fade-in
2. Hospital letters A/B/C with "raw data ✕" badges (coral pulsing opacity) → teal star aggregator
3. Hospitals A/B/C → teal line → pulsing teal circle with clock icon

---

### 6.18 Patient Register Screen (mobile)

Standard form card with:
- "+" logo mark (teal text in teal-glow box)
- Name / Email / Password fields
- Primary CTA: "Create account"
- Link to Login
- Footer privacy copy

---

### 6.19 Profile Screen (mobile)

Centered layout:
- Avatar: 76×76 circle, teal-glow bg, teal border, initial letter in teal 32sp/700
- Name (18sp/700) + email (12sp secondary)
- "ACCOUNT" section: Role, User ID rows (label + value in card rows)
- "SYSTEM" section: API endpoint (monospace), Mode
- About box: teal-glow bg, teal-40 border, teal title, `#99f6e4` body text
- Sign out button: coral-10% bg, coral-60 border, coral text

---

## 7. Animation & Motion

### Web (framer-motion)

| Animation | Target | Config |
|---|---|---|
| Page enter | Main content areas | `opacity 0→1, y 12→0, duration 0.35` |
| Card appear | Cards after data load | `opacity 0→1, y 12→0` |
| Result reveal | Scan result container | `opacity 0→1, y 16→0, duration 0.4 easeOut` |
| Subtype name | PredictionCard header | `scale 0.9→1, spring stiffness 200, delay 0.1` |
| Probability bars | Each bar fill | `width 0→{p}%, duration 0.6 easeOut, delay 0.2+i*0.05` |
| Chat messages | Each new message | `opacity 0→1, y 8→0` |
| Onboarding steps | Slide transition | `x 24→0 enter, x -24 exit, duration 0.28` |
| Step indicators | Width transition | CSS `transition-all` (Tailwind) |
| FL topology phase | Status text | `opacity 0→1, y 4→0, duration 0.25` |
| FL complete check | Checkmark | Spring, `transformOrigin: "220px 195px"` |
| Data packets | Hospital ↔ AGG | `opacity [0,1,1,0], cx/cy lerp, 1.8s repeat, stagger 0.4–0.6s` |
| Hospital node pulse | Expanding ring | `r [16,26,16], opacity [0,0.15,0], 2s repeat` |
| Error messages | Inline errors | `opacity 0→1, y -4→0` |
| Scan upload | Warning state | `opacity 0, scale 0.97 → opacity 1, scale 1` |
| Login form | Page load | `opacity 0, y 24 → opacity 1, y 0, duration 0.5 easeOut` |

### Global CSS animations (`globals.css`)

| Name | Usage | Keyframes |
|---|---|---|
| `node-pulse` | FL status dot | `box-shadow 0→12px, scale 1→1.08` |
| `data-flow` | SVG stroke | `stroke-dashoffset 20→0, opacity 0.3→1→0.3` |
| `fade-up` | `.animate-fade-up` class | `opacity 0→1, translateY 16→0, 0.4s` |
| `shimmer` | `.skeleton` class | `background-position -200%→200%, 1.4s infinite` |

Additional CSS animations referenced in ScanUpload:
- `orbit-cw` / `orbit-ccw`: ring rotation
- `ring-breathe`: scale pulse on inner ring
- `glow-flicker`: brightness flicker on fully-lit ring
- `animate-scan`: vertical sweep line during upload

### Mobile (React Native)

No framer-motion — uses:
- `ActivityIndicator` for all loading states (color: `colors.teal`)
- `RefreshControl` on ResultsScreen (tintColor: `colors.teal`)
- `Alert.alert` for native OS dialogs (verify warning, camera permission)

---

## 8. Iconography

### Web — Custom SVG icons

All icons are hand-authored inline SVGs. No icon library used. Key patterns:

| Icon | Usage | Description |
|---|---|---|
| FedMRI logo mark | Login, Doctor header | Circle r=7–9 + dot r=1.5 + 4 cardinal stubs (`M2 9h2M14 9h2M9 2v2M9 14v2`) |
| Shield | Silo status bar | Pointed polygon path |
| Info circle | Patient banner | Circle + vertical path + dot |
| Triangle warning | Disclaimers, alert | Filled triangle path |
| Checkmark circle | Feedback submitted | Circle r=6 + check path |
| Hospital building | Onboarding step 1 | Rect + door arch + roof path |
| Lock / padlock | Hospital badge overlay | Rect + arch path |
| Star | Aggregator (onboarding) | 5-point star path |
| Clock | Patient benefit (onboarding) | Circle + clock hands |
| Scan crosshair | Upload dropzone core | Circle + dot + 4 stubs |
| MRI frame | Upload uploading state | Rect + circle + dot |
| Arrow arc | Spinning verify indicator | `d="M10 2a8 8 0 0 1 8 8"` quarter arc |

SVG sizes: 10–24px, `viewBox="0 0 {n} {n}"`, `fill="none"`, stroke `currentColor` or explicit color, `strokeWidth` 1–1.5, `strokeLinecap="round"`

### Mobile — PNG assets

Located in `apps/mobile/assets/`:
- `qr-code-scan.png` → Scan tab
- `history.png` → Results tab
- `chat.png` → Chat tab
- `people.png` → Profile tab

Rendered at 22×22, `tintColor` applied for active/inactive states. `resizeMode: "contain"`.

Emoji used for supplemental illustration:
- 🩻 (X-ray / MRI) — scan upload state on mobile
- 📷 — camera button
- ⚠ — disclaimer headers
- ◎ ◉ ⬡ ▲ — subtype icons in `SUBTYPE_ICONS` record

---

## 9. Information Architecture

### Web — Doctor Portal

```
/login
  └── /doctor (protected, requires DOCTOR role)
        ├── [layout: header + silo bar + main/sidebar grid]
        ├── /doctor/scan         ← default landing
        │     ScanUpload → [MedicationCard + PredictionCard + AttentionOverlay] → action links
        ├── /doctor/chat?caseId= ← with or without case context
        │     ChatPanel (doctor mode, DOCTOR_STARTERS)
        └── /doctor/model
              [4 stat cards] + [ConvergenceChart + PerClassChart + ConfusionMatrix] + privacy note
```

**Sidebar (all doctor pages):** FlTopology (real-time WebSocket-driven)

### Web — Patient Portal

```
/login → /patient/register (new users)
  └── /patient (protected, requires PATIENT role)
        ├── [layout: header + AI info banner]
        ├── /patient/onboarding  ← shown if !onboardingDone
        ├── /patient/scan        ← default post-onboarding
        │     dropzone → [AI result card + disclaimer] + PDF button
        ├── /patient/results
        │     scan history list (FlatList-style, staggered fade-in)
        └── /patient/chat
              ChatPanel (patient mode, PATIENT_STARTERS)
```

### Mobile App (Expo)

```
Auth stack (unauthenticated):
  Login screen → Register screen

Main tabs (authenticated):
  Scan tab    → ScanScreen
  Results tab → ResultsScreen  
  Chat tab    → ChatScreen
  Profile tab → ProfileScreen
```

---

## 10. Copy Guidelines

### Tone
- **Doctor portal:** Clinical, concise, data-forward. Uses technical terms (molecular subtype, FL round, FedProx, F1, confidence).
- **Patient portal:** Plain language, reassuring, no jargon. Never uses "federated learning", "gradient", "weight delta".

### Recurring phrases (verbatim)
- "AI trained across 3 hospitals" — the canonical patient-facing FL description
- "Your data never leaves your hospital" — privacy assurance
- "Always confirm with your oncologist" / "Always consult a certified oncologist" — medical disclaimer

### Confidence labels

| Threshold | Web label | Mobile label |
|---|---|---|
| ≥ 70% | "High confidence" | "High confidence" |
| 50–69% | "Moderate confidence" | "Moderate confidence" |
| < 50% | "Low — seek specialist" | "Low — consult specialist" |

### Confidence display (patient, simplified)

| Threshold | Label |
|---|---|
| ≥ 70% | "High" |
| 50–69% | "Moderate" |
| < 50% | "Low" |

---

## 11. Platform-Specific Differences

| Aspect | Web (Next.js) | Mobile (Expo RN) |
|---|---|---|
| Navigation | Header tabs (top) | Bottom tab bar |
| Scan input | Drag-and-drop dropzone with aperture animation | Gallery picker + camera (ImagePicker permissions) |
| Scan verification warning | Inline overlay state within dropzone | Native `Alert.alert` dialog |
| Feedback (doctor) | Inline validate/dispute in PredictionCard | — (doctor portal is web-only) |
| Attention heatmap | Canvas-based MRI + jet colormap overlay | — (not in mobile) |
| FL topology | Animated SVG sidebar | — (not in mobile) |
| Medication protocols | MedicationCard after scan | — (not in mobile) |
| PDF export | "Download PDF report" button | — (not in mobile) |
| Model metrics | Full dashboard (/doctor/model) | — (not in mobile) |
| Onboarding | 3-step visual flow | — (registration flow) |
| Chat rendering | react-markdown (assistant), plain text (user) | Plain Text (no markdown) |
| Loading states | Skeleton shimmer + framer-motion | ActivityIndicator (teal) |
| Error display | Inline animated div | View with coral border |
| Auth persistence | Zustand + localStorage | Zustand + expo-secure-store |
| Server config | Fixed (env var) | Configurable LAN IP in login screen |
| Font | Geist Sans + Geist Mono (Google Fonts) | System default |

---

## 12. Accessibility Notes

- All interactive elements have sufficient contrast (dark bg + teal/coral on dark backgrounds)
- Disabled states use `opacity-50` or `opacity-40` on web, `opacity: 0.5` on mobile
- Error states use both color (coral) and icon (triangle ⚠) to avoid color-only signaling
- Medical disclaimers are persistent (non-dismissable) in patient-facing result screens
- Input fields have explicit visible labels (not placeholder-only)
- Chat streaming cursor is visual-only (`animate-pulse`) — screen readers receive the message text

---

## 13. Key State Flows

### FL Round Phase Progression
`idle → local_training → aggregating → complete → idle`

Drives:
- Silo status bar color/text (web doctor)
- FlTopology animation state (web doctor)
- Data packet direction (training: hospital→agg, aggregating: agg→hospital)
- Status indicator pill text and dot animation

### Scan Upload Stages (web doctor)
`idle → verifying → [warn] → uploading → (reset to idle, emit result)`

Minimum 700ms on verifying state for UX readability.

### Scan Verify States (mobile)
`idle → checking → ok | warn`

If warn: Alert.alert with "Analyse anyway" / Cancel. If ok: proceed to upload on button tap.

### Chat Streaming
WebSocket `chat:token` events appended to last assistant message. Cursor visible during streaming. `chat:error` shows inline error with rate-limit-specific message.

### Feedback Flow (web doctor — PredictionCard)
`idle → [validate: submitted] | [disputing → submitted]`

Dispute state shows dropdown + confirm/cancel. Submitted state shows checkmark confirmation.
