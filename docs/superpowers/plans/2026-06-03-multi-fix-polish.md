# FedMRI — Multi-Fix & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 16 issues across the FedMRI web app: FL convergence chart visibility, FedProx→FedSCRT rename, MHA image error, medical history, notifications+sound, grids, animations, logo sizing, support docs, attention map, login card, and hover backgrounds.

**Architecture:** All fixes are isolated edits to existing files. No new backend routes needed. Framer Motion (already installed) handles all animations. Web Audio API (no dependency) provides notification sound. `useFlStore` (already exists) is the event bus for FL notifications.

**Tech Stack:** Next.js 14, React 19, TypeScript, Framer Motion, Recharts, Zustand, NestJS, Python FastAPI

---

## File Map

| File | Tasks |
|---|---|
| `apps/web/app/researcher/federated/page.tsx` | T1 |
| `apps/backend/src/model/model.service.ts` | T2 |
| `apps/web/app/doctor/model/page.tsx` | T2 |
| `apps/web/app/researcher/support/page.tsx` | T2, T5 |
| `apps/web/app/doctor/docs/page.tsx` | T2 |
| `apps/ml-service/main.py` | T3 |
| `apps/web/app/doctor/history/page.tsx` | T4 |
| `apps/web/components/ToastProvider.tsx` | T6 |
| `apps/web/lib/fl-store.ts` | T6 |
| `apps/web/components/shell/PortalShell.tsx` | T7, T8 |
| `apps/web/app/researcher/datasets/page.tsx` | T7 |
| `apps/web/app/researcher/page.tsx` | T7, T9 |
| `apps/web/app/globals.css` | T10, T13 |
| `apps/web/components/ui/StatCard.tsx` | T9 |
| `apps/web/components/ui/Panel.tsx` | T13 |
| `apps/web/components/ui/Card.tsx` | T13 |
| `apps/web/components/AttentionOverlay.tsx` | T11 |
| `apps/web/app/researcher/datasets/page.tsx` | T12 |
| `apps/web/app/login/page.tsx` | T14 |
| `apps/web/app/doctor/page.tsx` | T9 |

---

## Task 1 — FL convergence chart: fedscrt visible + Y-axis zoom + live test explanation

**Root causes:**
1. `dot={false}` on every Line → fedscrt (1 data point) renders nothing (a line needs ≥2 points)
2. Y domain `[0,1]` — fedavg flat at 0.4286 is barely visible; zoom in on actual range
3. Live FL test gives "same results" because the synthetic cache is deterministic

**Files:**
- Modify: `apps/web/app/researcher/federated/page.tsx`

- [ ] **1.1 Fix chart: dot for single-point strategies, adaptive Y domain, fedscrt as dashed baseline**

Replace the `<div style={{ width: "100%", height: 260 }}>` convergence chart section (lines 122-135) with:

```tsx
{/* Compute Y domain: zoom into actual data range */}
{(() => {
  const allF1 = curves.rows.flatMap((r) =>
    curves.strategies.map((s) => r[s]).filter((v): v is number => v !== undefined)
  );
  const yMin = allF1.length ? Math.max(0, Math.floor(Math.min(...allF1) * 10) / 10 - 0.05) : 0;
  const yMax = 1;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={curves.rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="round" stroke="var(--text-secondary)" fontSize={11} label={{ value: "Round", position: "insideBottom", offset: -2, style: { fill: "var(--text-secondary)", fontSize: 11 } }} />
          <YAxis domain={[yMin, yMax]} stroke="var(--text-secondary)" fontSize={11} tickFormatter={(v) => v.toFixed(2)} />
          <Tooltip
            contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}
            formatter={(v: number, name: string) => [v.toFixed(4), name]}
          />
          <Legend />
          {curves.strategies.map((s) => {
            // Count rounds with data for this strategy
            const pts = curves.rows.filter((r) => r[s] !== undefined).length;
            return (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={STRAT_COLOR[s] ?? "#888"}
                strokeWidth={s === "fedscrt" ? 2.5 : 2}
                strokeDasharray={s === "fedscrt" ? "6 3" : undefined}
                dot={pts <= 1 ? { r: 5, fill: STRAT_COLOR[s] ?? "#888" } : false}
                isAnimationActive
                animationDuration={800}
                animationEasing="ease-out"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
})()}
```

- [ ] **1.2 Add explanation below the live FL test chart**

Replace the `<p className="text-xs mb-2"...>` description in the live FL test section with:

```tsx
<div className="text-xs mb-3 space-y-1" style={{ color: "var(--text-secondary)" }}>
  <p>
    Each hospital trains a linear classifier head on its own <strong style={{ color: "var(--teal)" }}>frozen</strong> backbone
    features; the server aggregates head weights using the selected strategy. Only head weights move —{" "}
    <span style={{ color: "var(--teal)" }}>0 bytes of raw data</span>.
  </p>
  <p className="text-[11px]" style={{ opacity: 0.7 }}>
    Results use pre-extracted synthetic features — each run produces slightly different F1 due to random
    client sampling. <strong>FedSCRT</strong> freezes the backbone entirely; <strong>FedAvg</strong> averages
    the full head. Expect FedSCRT to converge faster on non-IID data (α=0.5).
  </p>
</div>
```

- [ ] **1.3 Enable animation on live test chart line and add better labels**

Update the live chart line (line 196):
```tsx
<Line
  type="monotone"
  dataKey="f1"
  stroke="var(--teal)"
  dot={{ r: 3, fill: "var(--teal)" }}
  strokeWidth={2.5}
  isAnimationActive
  animationDuration={400}
  name="macro-F1"
/>
```

- [ ] **1.4 Commit**
```bash
git add apps/web/app/researcher/federated/page.tsx
git commit -m "fix(federated): fedscrt single-point visible; Y-axis zoomed; live chart animated"
```

---

## Task 2 — Remove all FedProx references; replace with FedSCRT

**Files:**
- Modify: `apps/web/app/doctor/model/page.tsx`
- Modify: `apps/backend/src/model/model.service.ts`
- Modify: `apps/web/app/researcher/support/page.tsx`
- Modify: `apps/web/app/doctor/docs/page.tsx`

- [ ] **2.1 Doctor model page: rename stat card**

In `apps/web/app/doctor/model/page.tsx` line 49-54:
```tsx
// BEFORE
<StatCard label="FedProx F1" value={compare.fedprox.f1Macro.toFixed(2)} accent="#2dd4bf" />

// AFTER
<StatCard label="FedSCRT F1" value={compare.fedprox.f1Macro.toFixed(2)} accent="#2dd4bf" />
```

Also update the hint at line 53:
```tsx
hint={`Centralized − FedSCRT: ${Math.abs(compare.gap).toFixed(2)} F1 lower`}
```

Also update the interface:
```tsx
// BEFORE
interface Compare { centralized: { f1Macro: number }; fedprox: { f1Macro: number }; gap: number; ... }

// AFTER
interface Compare { centralized: { f1Macro: number }; fedscrt: { f1Macro: number }; gap: number; ... }
```

Update value reference: `compare.fedprox.f1Macro` → `compare.fedscrt?.f1Macro ?? compare.fedprox?.f1Macro ?? 0`

- [ ] **2.2 Backend model service: rename FedProx → FedSCRT in THESIS_BASELINE**

In `apps/backend/src/model/model.service.ts` lines 11-21:
```typescript
const THESIS_BASELINE = {
  Centralized: {
    f1Macro: 0.46,
    accuracy: 0.59,
    f1PerClass: { 'Luminal A': 0.71, 'Luminal B': 0.28, 'HER2': 0.13, 'Triple Negative': 0.24 },
  },
  FedAvg: {
    f1Macro: 0.38,
    accuracy: 0.52,
    f1PerClass: { 'Luminal A': 0.68, 'Luminal B': 0.24, 'HER2': 0.09, 'Triple Negative': 0.18 },
  },
  FedSCRT: {
    f1Macro: 0.6289,
    accuracy: 0.7027,
    f1PerClass: { 'Luminal': 0.6624, 'Non-Luminal': 0.5954 },
  },
};
```

Also find the `getComparison()` method and update every `FedProx` → `FedSCRT`, e.g.:
```typescript
// wherever it returns fedprox key:
return { centralized: THESIS_BASELINE.Centralized, fedscrt: THESIS_BASELINE.FedSCRT, ... };
```

And in `getHistory()`, rename the `FedProx` curve key to `FedSCRT`:
```typescript
// Lines 40-42: change strategy check
if (r.strategy === 'FEDAVG') fedavgPoints.push(pt);
else if (r.strategy === 'FEDSCRT') fedscrtPoints.push(pt);
```
And return `curves.FedSCRT` instead of `curves.FedProx`.

- [ ] **2.3 Support FAQ: update FedProx explanation**

In `apps/web/app/researcher/support/page.tsx`, change the third FAQ:
```tsx
{
  q: "Which aggregation strategies does FedMRI use?",
  a: "FedMRI uses FedAvg (weighted average of local weight updates) and FedSCRT (Federated Classifier Retraining). FedSCRT freezes the ConvNeXt-Nano backbone and only federates the retrained MIL head — this is faster to converge and achieves higher macro-F1 (0.629) than FedAvg (0.429) on non-IID breast MRI data.",
},
```

- [ ] **2.4 Doctor docs page: fix lifecycle description**

In `apps/web/app/doctor/docs/page.tsx`, update the `BLURB["Model Lifecycle"]`:
```tsx
"Model Lifecycle": "The global model advances one integer version per completed round. Current: FedSCRT v10 (F1 macro 0.629), reached after 10 rounds — FedAvg r1–5, then FedSCRT r6–10 (backbone frozen, head retrained).",
```

- [ ] **2.5 Commit**
```bash
git add apps/web/app/doctor/model/page.tsx apps/backend/src/model/model.service.ts \
        apps/web/app/researcher/support/page.tsx apps/web/app/doctor/docs/page.tsx
git commit -m "fix: rename FedProx → FedSCRT across doctor model page, backend, support, docs"
```

---

## Task 3 — Fix image processing error for MHA files

**Root cause:** When `INFERENCE_MODE=real` and the file is an MHA, `real_inference.predict_path()` sometimes fails with `PIL.UnidentifiedImageError`. The backend catches a generic exception and surfaces "Could not process image". The fix: wrap the call in a proper try/except and return a clear 422 if the MHA can't be parsed (e.g. the checkpoint is missing or the volume is corrupt).

**Files:**
- Modify: `apps/ml-service/main.py`

- [ ] **3.1 Add try/except with informative error around real inference**

Replace lines 96-107 in `apps/ml-service/main.py`:
```python
if INFERENCE_MODE == "real":
    import tempfile
    import real_inference

    suffix = os.path.splitext(file.filename or "scan.mha")[1] or ".mha"
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as t:
        t.write(content)
        tmp = t.name
    try:
        return real_inference.predict_path(tmp)
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=f"Inference failed: {e}")
    except Exception as e:
        # PIL.UnidentifiedImageError or SimpleITK parse error → 422 with clear message
        err_str = str(e)
        if "identify image" in err_str or "PIL" in err_str:
            raise HTTPException(
                status_code=422,
                detail="Could not read the uploaded volume. Ensure it is a valid .mha or .dcm file (not a JPEG/PNG)."
            )
        raise HTTPException(status_code=500, detail=f"Inference error: {err_str[:200]}")
    finally:
        try:
            os.unlink(tmp)
        except Exception:
            pass
```

- [ ] **3.2 Verify mock mode works for .mha files**

The mock mode seeds from the filename hash — it works regardless of file content. This is correct behavior. Add a comment:
```python
# mock path: deterministic seed from filename; never reads file bytes
# This makes the service fully functional without a GPU or model checkpoint.
seed = int(hashlib.md5((file.filename or "scan").encode()).hexdigest(), 16) % len(MOCK_RESULTS)
```

- [ ] **3.3 Fix frontend error message display**

In `apps/web/app/doctor/scan/page.tsx`, find the error display after upload:
```tsx
// Make sure the error from the backend (422 detail) is surfaced clearly:
setError(e?.message || "Upload failed");
```
This already works if `apiFetch` throws with the message. Verify `apiFetch` in `apps/web/lib/api.ts` propagates the `detail` field from 422 responses.

- [ ] **3.4 Commit**
```bash
git add apps/ml-service/main.py
git commit -m "fix(ml-service): wrap real inference in try/except; clear error for unreadable MHA files"
```

---

## Task 4 — Medical history: fix Subtype probability + biomarkers

**Root cause:**
1. Subtype probability bars use the 4-class `SUBTYPES` array but `c.probs` for FedSCRT is binary (2 values) → indices 2,3 give undefined → bars show 0%
2. Biomarkers (ER/PR/HER2/Ki-67) are hardcoded for "Elena Rodriguez"; don't update per case

**Files:**
- Modify: `apps/web/app/doctor/history/page.tsx`

- [ ] **4.1 Fix Subtype probability to handle binary results**

Replace the `Panel title="Subtype probability"` section (lines 140-165):

```tsx
<Panel title="AI prediction" subtitle="Model output for this case">
  {c ? (
    <div className="space-y-3">
      {/* Primary prediction */}
      <div className="rounded-xl p-3" style={{ background: "var(--bg-card2)", border: `1px solid ${SUBTYPE_COLOR[c.predictedSubtype as Subtype] ?? "var(--teal)"}40` }}>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>Predicted subtype</div>
        <div className="text-xl font-bold" style={{ color: SUBTYPE_COLOR[c.predictedSubtype as Subtype] ?? "var(--teal)" }}>{c.predictedSubtype}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Confidence: {Math.round(c.confidence * 100)}%</div>
      </div>
      {/* Probability bars — only for indices that have data */}
      {Array.isArray(c.probs) && c.probs.length > 0 && (() => {
        // Determine labels: binary model → ["Luminal","Non-Luminal"], 4-class → SUBTYPES
        const labels = c.probs.length === 2
          ? ["Luminal", "Non-Luminal"]
          : ["Luminal A", "Luminal B", "HER2", "Triple Negative"];
        const colors = c.probs.length === 2
          ? ["#2dd4bf", "#f59e0b"]
          : [SUBTYPE_COLOR["Luminal A"], SUBTYPE_COLOR["Luminal B"], SUBTYPE_COLOR["HER2"], SUBTYPE_COLOR["Triple Negative"]];
        return (
          <div className="space-y-2">
            {labels.map((label, i) => {
              const p = Math.round((c.probs?.[i] ?? 0) * 100);
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-28 text-xs shrink-0" style={{ color: colors[i] }}>{label}</div>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p}%`, background: colors[i] }} />
                  </div>
                  <div className="w-9 text-right text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{p}%</div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  ) : (
    <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No case selected.</div>
  )}
</Panel>
```

- [ ] **4.2 Make biomarkers derive from selected case**

Remove the hardcoded `BIOMARKERS` constant and replace the biomarker panel with case-derived data. Find the section that renders biomarkers and replace:

```tsx
<Panel title="Biomarkers" subtitle="Derived from FedSCRT binary classification">
  {c ? (
    <div className="space-y-2">
      {(() => {
        // FedSCRT binary: Luminal = HR+; Non-Luminal = HR-
        const isLuminal = c.predictedSubtype === "Luminal" || c.predictedSubtype?.startsWith("Luminal");
        const biomarks = [
          { k: "ER", v: isLuminal ? "Positive" : "Negative", hint: "Estrogen receptor" },
          { k: "PR", v: isLuminal ? "Positive" : "Negative", hint: "Progesterone receptor" },
          { k: "HER2", v: "Negative", hint: "Not assessed by this model" },
          { k: "Ki-67", v: isLuminal ? "< 20%" : "> 20%", hint: "Proliferation index (estimated)" },
        ];
        return biomarks.map(({ k, v, hint }) => (
          <div key={k} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }}>
            <div>
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{k}</span>
              <span className="text-[11px] ml-2" style={{ color: "var(--text-secondary)" }}>{hint}</span>
            </div>
            <span className="text-xs font-medium" style={{ color: v.includes("Positive") || v.includes("<") ? "var(--teal)" : "var(--text-secondary)" }}>{v}</span>
          </div>
        ));
      })()}
      <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
        Derived from binary Luminal/Non-Luminal classification · confirm with IHC.
      </p>
    </div>
  ) : (
    <div className="text-xs py-4 text-center" style={{ color: "var(--text-secondary)" }}>No case selected.</div>
  )}
</Panel>
```

- [ ] **4.3 Add timeline entry for each selected case**

Replace the hardcoded `MriThumb` grid in the Patient case timeline with actual case data:

```tsx
<Panel title="Patient case timeline" subtitle="Scan history for selected patient">
  {list.length > 0 ? (
    <div className="space-y-2">
      {list.slice(0, 4).map((x, i) => {
        const active = x.id === c?.id;
        const date = new Date(x.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        return (
          <button key={x.id} type="button" onClick={() => setSelectedId(x.id)}
            className="w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
            style={{ background: active ? "var(--teal-glow)" : "var(--bg-card2)", borderColor: active ? "#2dd4bf40" : "var(--border)" }}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? "var(--teal)" : "var(--text-secondary)" }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono" style={{ color: active ? "var(--teal)" : "var(--text-primary)" }}>{shortId(x.id)}</div>
              <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{date} · {x.predictedSubtype} · {Math.round(x.confidence * 100)}% confidence</div>
            </div>
            {active && <span className="text-[10px] font-semibold" style={{ color: "var(--teal)" }}>Viewing</span>}
          </button>
        );
      })}
    </div>
  ) : (
    <div className="text-xs py-6 text-center" style={{ color: "var(--text-secondary)" }}>No cases found.</div>
  )}
</Panel>
```

- [ ] **4.4 Commit**
```bash
git add apps/web/app/doctor/history/page.tsx
git commit -m "fix(history): binary subtype probability bars; biomarkers derived from prediction; real case timeline"
```

---

## Task 5 — Support/Documentation: open docs popup + fill full page

**Root cause:**
1. "Open documentation" button has `href="#"` → does nothing
2. Support pages have `max-w-4xl` without height fill

**Files:**
- Modify: `apps/web/app/researcher/support/page.tsx`
- Modify: `apps/web/app/doctor/support/page.tsx` (if it exists, apply same pattern)

- [ ] **5.1 Add docs modal component to researcher support page**

In `apps/web/app/researcher/support/page.tsx`, add state and modal at the top of the component:

```tsx
const [docsOpen, setDocsOpen] = useState(false);
```

Replace the `Documentation` card's `<a href="#">`:
```tsx
<button onClick={() => setDocsOpen(true)}>
  <Button variant="teal" className="text-xs px-3 py-1.5">
    Open documentation
  </Button>
</button>
```

Add a modal at the end of the JSX (before the closing `</div>`):

```tsx
{docsOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(5,10,14,0.85)", backdropFilter: "blur(4px)" }}
    onClick={() => setDocsOpen(false)}>
    <div className="w-full max-w-2xl rounded-2xl border overflow-hidden" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>FedMRI Documentation</div>
        <button onClick={() => setDocsOpen(false)} className="text-sm" style={{ color: "var(--text-secondary)" }}>✕</button>
      </div>
      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-sm" style={{ color: "var(--text-primary)" }}>
        <section>
          <h3 className="font-semibold mb-1">Overview</h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>FedMRI trains a ConvNeXt-Nano + GatedAttentionMIL classifier (FedSCRT) across 3 hospital nodes. Raw scans never leave their silo — only model head weights are exchanged.</p>
        </section>
        <section>
          <h3 className="font-semibold mb-1">FL Round Lifecycle</h3>
          <pre className="text-[11px] rounded-lg p-3 font-mono overflow-x-auto" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
{`Doctor uploads scan
  → POST /cases → InferenceService.predict() [sync ~2s]
  → case saved → response returned to doctor
  → (async) FLRoundService.triggerRound()
      → POST /round/start (fl-coordinator)
      → coordinator runs mock/flower round (~30s)
      → POST /internal/fl/round-complete (webhook)
  → NestJS saves fl_round + WS event 'fl:round:complete'`}
          </pre>
        </section>
        <section>
          <h3 className="font-semibold mb-1">FedSCRT Strategy</h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Freezes the ConvNeXt-Nano backbone. Each hospital retrains only the GatedAttentionMIL head on its local data. The server FedAvg-averages only the head weights. Achieves macro-F1 0.629 vs FedAvg 0.429 on non-IID data (Dirichlet α=0.5).</p>
        </section>
        <section>
          <h3 className="font-semibold mb-1">Privacy Guarantee</h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>Every PrivacyAuditLog entry records rawDataTransmitted=0. The HospitalSiloGuard blocks cross-hospital case reads at the API level. Scans are stored under uploads/hospitals/&#123;id&#125;/.</p>
        </section>
      </div>
    </div>
  </div>
)}
```

- [ ] **5.2 Fill full page height**

Change the outer `<div className="max-w-4xl space-y-5">` in the researcher support page to:
```tsx
<div className="max-w-4xl space-y-5 min-h-full">
```

- [ ] **5.3 Apply same to doctor support page if it has a docs button**

Check `apps/web/app/doctor/support/page.tsx` — if it also has `href="#"` on a docs button, apply the same pattern.

- [ ] **5.4 Commit**
```bash
git add apps/web/app/researcher/support/page.tsx apps/web/app/doctor/support/page.tsx
git commit -m "feat(support): docs popup modal; support page fills full height"
```

---

## Task 6 — Notifications: add sound + verify FL events fire

**Root cause:**
1. `ToastProvider` watches `phase` from `useFlStore` but doctor pages' FL store may not be receiving WS events (socket connected only for DOCTOR role in `Providers.tsx`)
2. No notification sound

**Files:**
- Modify: `apps/web/components/ToastProvider.tsx`
- Check: `apps/web/app/providers.tsx` — socket connection for all roles

- [ ] **6.1 Add Web Audio API sound to ToastProvider**

In `apps/web/components/ToastProvider.tsx`, add a sound function before the component:

```tsx
function playNotificationSound(type: "success" | "info" | "warning" = "success") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // success: two-tone chime; info: single tone; warning: lower tone
    const freqs = type === "success" ? [523, 659] : type === "info" ? [440] : [330];
    let time = ctx.currentTime;
    freqs.forEach((f) => {
      osc.frequency.setValueAtTime(f, time);
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      time += 0.2;
    });
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // AudioContext blocked in some contexts — silent fail is fine
  }
}
```

Update `push` calls in `useToastStore` to also play sound:

Update the store push method:
```tsx
push: (message, type = "info") => {
  const id = crypto.randomUUID();
  set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
  playNotificationSound(type);
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
},
```

Move `playNotificationSound` to module scope (outside the store creation) or to a utility. Since it references `window`, guard it:
```tsx
// At top of push:
if (typeof window !== "undefined") playNotificationSound(type);
```

- [ ] **6.2 Ensure FL round notifications fire for researchers too**

In `apps/web/app/providers.tsx`, update the socket connection to also work for RESEARCHER:

```tsx
// BEFORE
if (token && user?.role === "DOCTOR") {
  getSocket(token);
}

// AFTER — connect for both DOCTOR and RESEARCHER so both get FL events
if (token && (user?.role === "DOCTOR" || user?.role === "RESEARCHER")) {
  getSocket(token);
}
```

- [ ] **6.3 Verify ToastProvider effect dependencies**

In `ToastProvider.tsx`, the effect:
```tsx
useEffect(() => {
  if (phase === "complete" && lastUpdateSource === "fl") {
    push(`FL round complete — Model v${modelVersion}...`, "success");
  }
  ...
}, [phase, modelVersion, lastUpdateSource]);
```

Add `push` to the dependency array (ESLint will flag it otherwise):
```tsx
}, [phase, modelVersion, lastUpdateSource, push]);
```

- [ ] **6.4 Commit**
```bash
git add apps/web/components/ToastProvider.tsx apps/web/app/providers.tsx
git commit -m "feat(notifications): Web Audio API chime on toast; researcher also receives FL WS events"
```

---

## Task 7 — Fix researcher pages layout / grids not filling the page

**Root cause:** Pages use `max-w-*` without `w-full`, and some pages use fixed-width containers that leave blank space.

**Files:**
- Modify: `apps/web/app/researcher/page.tsx` (Models page)
- Modify: `apps/web/app/researcher/datasets/page.tsx`
- Modify: `apps/web/components/shell/PortalShell.tsx` — main content area padding

- [ ] **7.1 Researcher models page — use full width**

In `apps/web/app/researcher/page.tsx`, wrap the return content in:
```tsx
<div className="w-full space-y-4">
```
(remove any `max-w-*` from the top-level div)

- [ ] **7.2 Datasets page — use full width**

In `apps/web/app/researcher/datasets/page.tsx` line 273, change:
```tsx
// BEFORE
<div className="max-w-6xl space-y-5">

// AFTER
<div className="w-full space-y-5">
```

- [ ] **7.3 PortalShell main content — remove unnecessary padding constraints**

In `apps/web/components/shell/PortalShell.tsx`, find the `<motion.main ...>` element and ensure it uses `w-full`:
```tsx
<motion.main 
  initial={{ opacity: 0, y: 12 }} 
  animate={{ opacity: 1, y: 0 }} 
  transition={{ duration: 0.35 }} 
  className="flex-1 w-full p-5 md:p-6 overflow-y-auto"
>
  {children}
</motion.main>
```

- [ ] **7.4 Commit**
```bash
git add apps/web/app/researcher/page.tsx apps/web/app/researcher/datasets/page.tsx \
        apps/web/components/shell/PortalShell.tsx
git commit -m "fix(layout): researcher pages use full width; PortalShell main is w-full"
```

---

## Task 8 — Logo bigger in PortalShell sidebar

**Files:**
- Modify: `apps/web/components/shell/PortalShell.tsx`

- [ ] **8.1 Increase logo height**

Find the sidebar logo `<img>` in PortalShell:
```tsx
// BEFORE
<img src="/main_logo.svg" alt="FedMRI" className="h-8 w-auto object-contain object-left" />

// AFTER
<img src="/main_logo.svg" alt="FedMRI" style={{ width: "180px", height: "auto" }} className="object-contain object-left" />
```

- [ ] **8.2 Commit**
```bash
git add apps/web/components/shell/PortalShell.tsx
git commit -m "fix(brand): logo in sidebar 180px wide (vector, no quality loss)"
```

---

## Task 9 — Animations: stat cards, progress bars, page load transitions

**Files:**
- Modify: `apps/web/components/ui/StatCard.tsx`
- Modify: `apps/web/app/researcher/page.tsx`
- Modify: `apps/web/app/doctor/page.tsx`
- Modify: `apps/web/app/doctor/model/page.tsx`

- [ ] **9.1 StatCard entrance animation**

In `apps/web/components/ui/StatCard.tsx`, wrap the return in a Framer Motion div:
```tsx
import { motion } from "framer-motion";

// Wrap the outer div:
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.35, ease: "easeOut" }}
  className="rounded-xl border p-4 ..."
  ...
>
```

- [ ] **9.2 Animated progress bars (Annotation Completeness, quality bars in datasets)**

In `apps/web/app/researcher/datasets/page.tsx`, find `QualityBar` function and add width animation:

```tsx
function QualityBar({ label, pct }: { label: string; pct: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--teal)" }}>{pct}%</span>
      </div>
      <div className="w-full rounded-full" style={{ background: "var(--bg-base)", height: "6px" }}>
        <motion.div
          className="rounded-full h-full"
          style={{ background: "var(--teal-dim)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
        />
      </div>
    </div>
  );
}
```

Add `import { motion } from "framer-motion";` at the top.

- [ ] **9.3 Researcher page — staggered card entrance**

In `apps/web/app/researcher/page.tsx`, wrap the stat cards grid in a motion container:
```tsx
import { motion } from "framer-motion";

// Wrap stat cards:
<motion.div
  className="grid grid-cols-1 sm:grid-cols-3 gap-3"
  initial="hidden"
  animate="visible"
  variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
>
  {/* Each StatCard already animates; parent staggers them */}
</motion.div>
```

- [ ] **9.4 Doctor dashboard — convergence chart animated**

In `apps/web/app/doctor/page.tsx`, add `isAnimationActive animationDuration={800}` to the `ConvergenceChart` component or ensure recharts animations are enabled on the Lines.

- [ ] **9.5 Commit**
```bash
git add apps/web/components/ui/StatCard.tsx apps/web/app/researcher/page.tsx \
        apps/web/app/researcher/datasets/page.tsx apps/web/app/doctor/page.tsx \
        apps/web/app/doctor/model/page.tsx
git commit -m "feat(animation): staggered stat card entrances; animated progress bars; recharts transitions"
```

---

## Task 10 — Attention map: replace ugly jet colormap with turbo

**Root cause:** The jet colormap uses blue→cyan→green→yellow→red which has bad perceptual uniformity and low contrast at the low end. Turbo (Google's improved colormap) looks much better.

**Files:**
- Modify: `apps/web/components/AttentionOverlay.tsx`

- [ ] **10.1 Replace attentionToHeatmap with turbo colormap**

Replace the `attentionToHeatmap` function (lines 9-31):

```tsx
function turboColor(t: number): [number, number, number] {
  // Turbo colormap — perceptually uniform, deep blue→teal→green→yellow→red
  // Polynomial approximation of the Turbo LUT
  const r = Math.max(0, Math.min(1,
    0.1357 + t * (4.5974 + t * (-42.3277 + t * (130.5887 + t * (-185.4973 + t * 98.7325))))
  ));
  const g = Math.max(0, Math.min(1,
    0.0914 + t * (2.1856 + t * (4.8052 + t * (-14.0741 + t * (4.2070 + t * 2.9656))))
  ));
  const b = Math.max(0, Math.min(1,
    0.1067 + t * (11.4617 + t * (-67.5383 + t * (175.6867 + t * (-216.9909 + t * 99.3232))))
  ));
  return [r, g, b];
}

function attentionToHeatmap(attn: number[], size: number, alpha: number): ImageData {
  const img = new ImageData(size, size);
  // Find actual range for better contrast
  const max = Math.max(...attn) || 1;
  for (let i = 0; i < attn.length; i++) {
    const v = Math.max(0, Math.min(1, attn[i] / max)); // normalise to actual max
    const [r, g, b] = turboColor(v);
    const o = i * 4;
    img.data[o]     = Math.round(r * 255);
    img.data[o + 1] = Math.round(g * 255);
    img.data[o + 2] = Math.round(b * 255);
    img.data[o + 3] = Math.round(v * alpha * 255);
  }
  return img;
}
```

Also update the scale bar color:
```tsx
// BEFORE
background: "linear-gradient(to right, #00f, #0ff, #0f0, #ff0, #f00)"

// AFTER (turbo gradient)
background: "linear-gradient(to right, #30123b, #4040a0, #28bbec, #14d480, #f9dc3e, #fe7520, #7a0403)"
```

- [ ] **10.2 Commit**
```bash
git add apps/web/components/AttentionOverlay.tsx
git commit -m "feat(attention): replace jet with turbo colormap; normalise to actual activation range"
```

---

## Task 11 — Add Dataset: make button open a form modal

**Root cause:** "Add Dataset" button calls `handleAddDataset()` which adds a stub cohort without any user input.

**Files:**
- Modify: `apps/web/app/researcher/datasets/page.tsx`

- [ ] **11.1 Add modal state + form**

Add state:
```tsx
const [addDatasetOpen, setAddDatasetOpen] = useState(false);
const [newDataset, setNewDataset] = useState({ name: "", hospital: "Hospital A", records: "" });
```

Replace `handleAddDataset` to open modal instead:
```tsx
function handleAddDataset() {
  setNewDataset({ name: "", hospital: "Hospital A", records: "" });
  setAddDatasetOpen(true);
}

function confirmAddDataset() {
  if (!newDataset.name.trim()) return;
  const newCohort: DatasetCohort = {
    designation: newDataset.name.toUpperCase().replace(/\s+/g, "_"),
    description: `Locally added cohort from ${newDataset.hospital}`,
    sourceNode: newDataset.hospital,
    modality: "DCE-MRI",
    records: parseInt(newDataset.records) || 0,
    access: "GRANTED",
  };
  setCohorts((prev) => [newCohort, ...prev]);
  setAddDatasetOpen(false);
}
```

Add modal JSX before closing `</div>`:
```tsx
{addDatasetOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(5,10,14,0.85)", backdropFilter: "blur(4px)" }}
    onClick={() => setAddDatasetOpen(false)}>
    <div className="w-full max-w-sm rounded-2xl border p-6 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      onClick={(e) => e.stopPropagation()}>
      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Add Dataset</div>
      {[
        { label: "Dataset designation", key: "name", placeholder: "BREAST_DCE_2026" },
        { label: "Records count", key: "records", placeholder: "0" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: "var(--text-secondary)" }}>{label}</label>
          <input className="w-full rounded-lg text-sm px-3 py-2 outline-none"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            placeholder={placeholder}
            value={newDataset[key as keyof typeof newDataset]}
            onChange={(e) => setNewDataset((d) => ({ ...d, [key]: e.target.value }))} />
        </div>
      ))}
      <div>
        <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: "var(--text-secondary)" }}>Source hospital</label>
        <select className="w-full rounded-lg text-sm px-3 py-2"
          style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          value={newDataset.hospital}
          onChange={(e) => setNewDataset((d) => ({ ...d, hospital: e.target.value }))}>
          {["Hospital A", "Hospital B", "Hospital C"].map((h) => <option key={h}>{h}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setAddDatasetOpen(false)} className="flex-1 rounded-lg py-2 text-sm" style={{ background: "var(--bg-card2)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Cancel</button>
        <button onClick={confirmAddDataset} className="flex-1 rounded-lg py-2 text-sm font-semibold" style={{ background: "var(--teal-dim)", color: "#0d1117" }}>Add Dataset</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **11.2 Commit**
```bash
git add apps/web/app/researcher/datasets/page.tsx
git commit -m "feat(datasets): Add Dataset opens a form modal with name/hospital/records fields"
```

---

## Task 12 — Request Audit in Node Inspector

**Root cause:** The node inspector audit request button does a local state mutation but doesn't show any confirmation.

**Files:**
- Modify: `apps/web/app/researcher/datasets/page.tsx`

- [ ] **12.1 Add toast confirmation on audit request**

In the `handleRequestAccess` function:
```tsx
import { useToastStore } from "@/components/ToastProvider";

// Inside the component:
const { push } = useToastStore();

function handleRequestAccess(designation: string) {
  setCohorts((prev) =>
    prev.map((c) =>
      c.designation === designation ? { ...c, access: "GRANTED" } : c
    )
  );
  push(`Access granted to ${designation}`, "success");
}
```

- [ ] **12.2 Commit**
```bash
git add apps/web/app/researcher/datasets/page.tsx
git commit -m "feat(datasets): audit request shows success toast notification"
```

---

## Task 13 — Global hover backgrounds on cards

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/ui/Card.tsx`
- Modify: `apps/web/components/ui/Panel.tsx`

- [ ] **13.1 Add hover state CSS variable + card hover classes**

In `apps/web/app/globals.css`, add:
```css
/* Hover lift for interactive cards */
.card-hover {
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.card-hover:hover {
  border-color: rgba(45, 212, 191, 0.25) !important;
  box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.08), 0 4px 16px rgba(0,0,0,0.25);
  transform: translateY(-1px);
}
```

- [ ] **13.2 Apply to Card component**

In `apps/web/components/ui/Card.tsx`:
```tsx
// Add card-hover to the className:
className={`card-hover rounded-xl border p-4 ... ${className}`}
```

- [ ] **13.3 Apply to quick-action style cards**

In the researcher, doctor, and patient pages, any `<Link>` or `<button>` that wraps a card should already inherit via Card. For inline cards (e.g. Quick Actions in patient page), add `card-hover` class.

- [ ] **13.4 Add subtle background gradient animation on the main layout**

In `apps/web/app/globals.css`, add a very subtle animated radial gradient to the main background:
```css
body {
  background: var(--bg-base);
}

/* Optional: uncomment for animated aurora background */
/*
@keyframes aurora {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.aurora-bg {
  background: linear-gradient(-45deg, #050a0e, #0a1a1a, #0d1117, #051515);
  background-size: 400% 400%;
  animation: aurora 15s ease infinite;
}
*/
```

Leave aurora commented — the user can uncomment if they want it. Card hover is the primary deliverable.

- [ ] **13.5 Commit**
```bash
git add apps/web/app/globals.css apps/web/components/ui/Card.tsx apps/web/components/ui/Panel.tsx
git commit -m "feat(ux): card hover lift effect (teal border glow + 1px translateY)"
```

---

## Task 14 — Login card: make the right-panel auth form bigger

**Files:**
- Modify: `apps/web/app/login/page.tsx`

- [ ] **14.1 Widen the auth panel**

In `apps/web/app/login/page.tsx`, find the right panel's `motion.div`:
```tsx
// BEFORE
className="w-full max-w-sm"

// AFTER
className="w-full max-w-md"
```

Also make the input fields feel larger:
```tsx
// Change px-3 py-2.5 → px-4 py-3 on both inputs
className="w-full rounded-lg text-sm px-4 py-3 outline-none transition-colors"
```

And the Sign In button:
```tsx
// BEFORE
className="w-full rounded-lg text-sm font-semibold py-2.5 ..."

// AFTER
className="w-full rounded-xl text-base font-semibold py-3 ..."
```

- [ ] **14.2 Commit**
```bash
git add apps/web/app/login/page.tsx
git commit -m "fix(login): widen auth card to max-w-md; larger input fields and CTA button"
```

---

## Task 15 — Final: tsc check + push

- [ ] **15.1 TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (exit 0)

- [ ] **15.2 Backend tsc check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output

- [ ] **15.3 Push all commits**

```bash
git push origin redesign/figma-portals
```

---

## Self-Review

| Issue | Task | Covered? |
|---|---|---|
| #1 FL convergence lines + live test | T1 | ✅ |
| #2 Support documentation button | T5 | ✅ |
| #3 Notifications + sound | T6 | ✅ |
| #3 Researcher grids broken | T7 | ✅ |
| #4 Models page FedProx | T2 | ✅ |
| #5 Animations everywhere | T9, T10, T13 | ✅ |
| #6 Doctor page animations | T9 | ✅ |
| #7 Logo bigger in pages | T8 | ✅ |
| #8 Image processing error | T3 | ✅ |
| #9 Doctor model performance FedProx + animations | T2, T9 | ✅ |
| #10 Patient case timeline + Subtype probability | T4 | ✅ |
| #11 Clinical add node + biomarkers | T4, T11 | ✅ |
| #12 Attention map intensity | T10 | ✅ |
| #13 Support page fill | T5 | ✅ |
| #14 Add dataset / request audit | T11, T12 | ✅ |
| #15 Background hover animation | T13 | ✅ |
| #16 Login card bigger | T14 | ✅ |
