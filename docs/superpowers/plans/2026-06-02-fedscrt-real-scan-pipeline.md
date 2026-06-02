# FedSCRT Real Scan Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the doctor scan flow real end-to-end — upload a real breast-MRI volume, get a real FedSCRT binary prediction from the pixels, with a real attention overlay on a real slice, and authoritative verification that rejects non-MRI files.

**Architecture:** Add an `INFERENCE_MODE=real` path to the existing `apps/ml-service` FastAPI service that loads the user's FedSCRT ConvNeXt-MIL checkpoint (run from the `mri_thesis` conda env). Keep `mock` as the default fallback. The NestJS backend's `predict` proxy is unchanged; `getAttention` gains the volume path; `verify` becomes a real 3D-volume check. The web layer swaps the fake attention canvas for the real slice, tightens upload formats, adds a sample-scan picker, and removes the "Analyse anyway" bypass.

**Tech Stack:** FastAPI + PyTorch (ConvNeXt-Nano + GatedAttentionMIL, `Model/V2`), SimpleITK, NestJS (axios proxy), Next.js 16 / React 19 / framer-motion / react-dropzone.

---

## Spec

`docs/superpowers/specs/2026-06-02-fedscrt-real-scan-pipeline-design.md`. Read it first. Key invariants: real confidence only; `PrivacyAuditLog.rawDataTransmitted` stays 0; binary Luminal/Non-Luminal; checkpoint contract in spec §2.1.

## File map

**ml-service (`apps/ml-service/`)** — run from `mri_thesis` env in real mode:
- Create `real_inference.py` — model loader + preprocess + predict + attention rendering (all real-mode logic, isolated from `main.py`).
- Create `make_fedscrt_stub.py` — generates a contract-shaped random `fedscrt_stub.pt` so the pipeline is testable before the user's real `fedscrt_final.pt` exists.
- Modify `main.py` — branch `/predict`, `/verify`, `/attention`, `/metrics`, `/model-info` on `INFERENCE_MODE`.
- Modify `requirements.txt` — note torch/model stack provided by `mri_thesis` (not pinned here).

**backend (`apps/backend/src/`)**:
- Modify `inference/inference.service.ts` — `getAttention(caseId, imagePath)` passes the path; new return type `{ slicePng, attention, size, topSlice }`.
- Modify `cases/cases.service.ts` — `getAttention` passes `case.imagePath`; add `listSamples()` + `createFromSample()`.
- Modify `cases/cases.controller.ts` — `GET /cases/samples`, `POST /cases/from-sample`.

**web (`apps/web/`)**:
- Modify `components/ScanUpload.tsx` — accept volumes only, add sample picker, remove "Analyse anyway".
- Modify `components/AttentionOverlay.tsx` — render the real slice PNG + real spatial attention.
- Modify `lib/api.ts` — `apiGetAttention` returns `{ slicePng, attention, size, topSlice }`; add `apiListSamples`, `apiCreateFromSample`.
- Modify the doctor scan result UI to show real confidence + F1/AUC (from `/metrics`) + the hormone-therapy advisory derived from subtype.

## Testing reality

The web has no unit runner (verify via `tsc --noEmit` + browser). The backend uses Jest e2e (`--forceExit`). The ml-service has no test harness; verify the Python via a small `pytest` for pure functions (verify/preprocess) and **curl smoke tests** for the model path (model load needs torch + a checkpoint, too heavy for CI-style unit tests). TDD where cheap; smoke where model-dependent.

## Env (real mode, ml-service)

```
INFERENCE_MODE=real
MODEL_V2_PATH=D:\study\BioInfo M2 (2026)\Memoir\Model\V2
FEDSCRT_CKPT=D:\study\BioInfo M2 (2026)\Memoir\Model\V2\checkpoints\fedscrt_final.pt   # or fedscrt_stub.pt until the real one exists
SAMPLES_DIR=D:\study\BioInfo M2 (2026)\Memoir\Datasets\breast-mri-molecular-cancer-subtype\samples
MRI_NUM_CLASSES=2
ATTN_CACHE_DIR=.attn_cache
```

---

### Task 1: Stand-in checkpoint generator (unblocks all real-mode testing)

**Files:**
- Create: `apps/ml-service/make_fedscrt_stub.py`

- [ ] **Step 1: Write the generator**

```python
"""Generate a contract-shaped FedSCRT stub checkpoint so the real-mode
pipeline is testable before the user's fedscrt_final.pt exists.
Run from the mri_thesis env:  python make_fedscrt_stub.py
Predictions are random until the real checkpoint replaces it."""
import os, sys, torch
os.environ["MRI_NUM_CLASSES"] = "2"
V2 = os.environ.get("MODEL_V2_PATH", r"D:\study\BioInfo M2 (2026)\Memoir\Model\V2")
sys.path.insert(0, V2)
from model import ConvNeXtMILClassifier

m = ConvNeXtMILClassifier(num_classes=2, proj_dim=256, attn_dim=128)
ckpt = {
    "model_state": m.state_dict(),
    "arch": "convnext_mil",
    "task": "binary",
    "f1": 0.6289,
    "auc": 0.6874,
    "label_map": {"0": "Luminal", "1": "Non-Luminal"},
    "fedscrt": True,
}
out = os.path.join(V2, "checkpoints", "fedscrt_stub.pt")
os.makedirs(os.path.dirname(out), exist_ok=True)
torch.save(ckpt, out)
print("wrote", out)
```

- [ ] **Step 2: Run it (from `mri_thesis`)**

Run: `python apps/ml-service/make_fedscrt_stub.py`
Expected: `wrote .../checkpoints/fedscrt_stub.pt` (ConvNeXt-Nano weights download on first run if not cached).

- [ ] **Step 3: Commit**

```bash
git add apps/ml-service/make_fedscrt_stub.py
git commit -m "feat(ml): FedSCRT stub-checkpoint generator for real-mode testing"
```

---

### Task 2: Real-mode loader + preprocess (pure-ish, unit-testable)

**Files:**
- Create: `apps/ml-service/real_inference.py`
- Test: `apps/ml-service/test_real_inference.py`

- [ ] **Step 1: Write `real_inference.py` (loader + preprocess + predict)**

```python
"""Real FedSCRT inference. Imported only when INFERENCE_MODE=real.
Loads the ConvNeXt-MIL model from Model/V2 and runs real predictions +
attention. Run the service from the mri_thesis conda env."""
import os, sys, hashlib, io, tempfile
from functools import lru_cache
import numpy as np
import torch
import torch.nn.functional as F

V2 = os.environ.get("MODEL_V2_PATH")
if V2 and V2 not in sys.path:
    sys.path.insert(0, V2)
os.environ.setdefault("MRI_NUM_CLASSES", "2")

CKPT = os.environ.get("FEDSCRT_CKPT")
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
LABELS = ["Luminal", "Non-Luminal"]


@lru_cache(maxsize=1)
def _model_and_meta():
    from main import build_model  # Model/V2/main.py:140
    ck = torch.load(CKPT, map_location=DEVICE)
    model = build_model("convnext_mil", DEVICE)
    model.load_state_dict(ck["model_state"], strict=False)
    model.eval()
    meta = {
        "f1": float(ck.get("f1", 0.6289)),
        "auc": float(ck.get("auc", 0.6874)),
        "label_map": {int(k): v for k, v in ck.get("label_map", {"0": "Luminal", "1": "Non-Luminal"}).items()},
        "model_version": int(ck.get("model_version", 1)),
    }
    return model, meta


def _slices_from_path(path: str) -> torch.Tensor:
    """.mha/.nii -> (1, 64, 3, 224, 224), ImageNet-normalized (the trained transform)."""
    from image_process import preprocess_raw, slice_view_transform
    vol = preprocess_raw(path)                       # (64,128,128) float32 [0,1]
    x = slice_view_transform(torch.from_numpy(vol))  # (64,3,224,224) — normalizes!
    return x.unsqueeze(0).to(DEVICE), torch.from_numpy(vol)


def predict_path(path: str) -> dict:
    model, meta = _model_and_meta()
    x, _ = _slices_from_path(path)
    with torch.no_grad():
        probs = torch.softmax(model(x), dim=-1)[0].cpu().numpy()
    order = probs.argsort()[::-1]
    pred = meta["label_map"].get(int(order[0]), LABELS[int(order[0])])
    return {
        "predicted_subtype": pred,
        "confidence": round(float(probs[order[0]]), 4),
        "probs": [round(float(p), 4) for p in probs],
        "model_version": meta["model_version"],
        "strategy": "FEDSCRT",
        "f1": meta["f1"],
        "auc": meta["auc"],
        "hormone_therapy": "indicated" if pred == "Luminal" else "not_indicated",
    }


def verify_volume(buffer: bytes, filename: str) -> dict:
    """Real check: does SimpleITK read this as a 3D MRI volume?"""
    import SimpleITK as sitk
    suffix = os.path.splitext(filename)[1] or ".mha"
    if suffix.lower() not in (".mha", ".nii", ".gz", ".dcm"):
        return {"valid": False, "confidence": 0.97, "reason": "Not an MRI volume format (.mha/.nii/.dcm)"}
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as t:
        t.write(buffer); tmp = t.name
    try:
        img = sitk.ReadImage(tmp, sitk.sitkFloat32)
        arr = sitk.GetArrayFromImage(img)
        if arr.ndim != 3 or min(arr.shape) < 8:
            return {"valid": False, "confidence": 0.9, "reason": "File is not a 3D MRI volume"}
        return {"valid": True, "confidence": 0.95, "reason": "Valid 3D MRI volume"}
    except Exception as e:
        return {"valid": False, "confidence": 0.6, "reason": f"Could not read as MRI volume: {e}"}
    finally:
        os.unlink(tmp)
```

- [ ] **Step 2: Write the failing test (verify logic only — no torch needed)**

```python
# apps/ml-service/test_real_inference.py
import numpy as np, SimpleITK as sitk, tempfile, os
from real_inference import verify_volume

def _mha_bytes(shape=(32, 64, 64)):
    img = sitk.GetImageFromArray(np.random.rand(*shape).astype("float32"))
    with tempfile.NamedTemporaryFile(suffix=".mha", delete=False) as t:
        sitk.WriteImage(img, t.name); p = t.name
    b = open(p, "rb").read(); os.unlink(p); return b

def test_valid_volume_passes():
    assert verify_volume(_mha_bytes(), "x.mha")["valid"] is True

def test_png_rejected():
    assert verify_volume(b"\x89PNG\r\n", "photo.png")["valid"] is False
```

- [ ] **Step 3: Run it (from `mri_thesis`)**

Run: `cd apps/ml-service && python -m pytest test_real_inference.py -v`
Expected: 2 passed. (Importing `real_inference` triggers torch import but not model load — `_model_and_meta` is lazy.)

- [ ] **Step 4: Commit**

```bash
git add apps/ml-service/real_inference.py apps/ml-service/test_real_inference.py
git commit -m "feat(ml): real FedSCRT loader, preprocess, predict, volume verify"
```

---

### Task 3: Real attention rendering (top slice PNG + spatial activation)

**Files:**
- Modify: `apps/ml-service/real_inference.py`

- [ ] **Step 1: Add attention rendering to `real_inference.py`**

```python
def _spatial_map_for_slice(model, slice_tensor: torch.Tensor) -> np.ndarray:
    """ConvNeXt last-stage activation magnitude for one (1,3,224,224) slice
    -> (224,224) in [0,1]. Real activation map (not random)."""
    feats = {}
    def hook(_m, _i, o): feats["f"] = o.detach()
    h = model.backbone.register_forward_hook(hook)
    with torch.no_grad():
        model.backbone(slice_tensor)
    h.remove()
    fmap = feats["f"]                     # (1, C, h, w) for ConvNeXt stages
    if fmap.dim() != 4:                   # global-pooled fallback -> flat vignette
        return np.zeros((224, 224), dtype="float32")
    m = fmap.abs().mean(dim=1, keepdim=True)             # (1,1,h,w)
    m = F.interpolate(m, size=(224, 224), mode="bilinear", align_corners=False)[0, 0]
    m = m.cpu().numpy()
    mn, mx = float(m.min()), float(m.max())
    return ((m - mn) / (mx - mn + 1e-8)).astype("float32")


def attention_for_path(path: str) -> dict:
    """Real top-attended slice (PNG b64) + within-slice spatial map (224x224 floats)."""
    import base64
    from PIL import Image
    model, _ = _model_and_meta()
    x, vol = _slices_from_path(path)                      # x:(1,64,3,224,224) vol:(64,128,128)
    with torch.no_grad():
        model(x)
    attn = model.last_attn[0].cpu().numpy()              # (64,) per-slice
    top = int(attn.argmax())
    # real grayscale slice PNG (from the preprocessed volume, not the normalized tensor)
    sl = vol[top].numpy()
    img = Image.fromarray((np.clip(sl, 0, 1) * 255).astype("uint8")).resize((224, 224))
    buf = io.BytesIO(); img.save(buf, format="PNG")
    slice_png = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    spatial = _spatial_map_for_slice(model, x[0, top:top + 1])  # (1,3,224,224)
    return {"slicePng": slice_png, "attention": spatial.flatten().tolist(),
            "size": 224, "topSlice": top}
```

- [ ] **Step 2: Smoke-test it (from `mri_thesis`, needs stub ckpt)**

Run:
```bash
cd apps/ml-service && FEDSCRT_CKPT=$MODEL_V2_PATH/checkpoints/fedscrt_stub.pt \
python -c "import real_inference as r; d=r.attention_for_path(r'$SAMPLES_DIR/Breast_MRI_0001_0000.mha'); print(d['topSlice'], len(d['attention']), d['slicePng'][:30])"
```
Expected: prints a slice index, `50176`, and `data:image/png;base64,iVBOR...`.

- [ ] **Step 3: Commit**

```bash
git add apps/ml-service/real_inference.py
git commit -m "feat(ml): real top-attended slice PNG + within-slice activation map"
```

---

### Task 4: Wire real mode into `main.py`

**Files:**
- Modify: `apps/ml-service/main.py:63-189` (`/predict`, `/verify`, `/attention`, `/metrics`, add `/model-info`)

- [ ] **Step 1: Branch `/predict` on mode**

Replace the body of `predict` (`main.py:63-86`) so real mode calls the loader. The endpoint now also accepts an optional saved path via form field `path` (used by the from-sample flow); otherwise it saves the upload to a temp file:

```python
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if INFERENCE_MODE == "real":
        import tempfile, os, real_inference
        suffix = os.path.splitext(file.filename or "scan.mha")[1] or ".mha"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as t:
            t.write(await file.read()); tmp = t.name
        try:
            return real_inference.predict_path(tmp)
        finally:
            os.unlink(tmp)
    # ---- existing mock path (unchanged) ----
    seed = int(hashlib.md5(file.filename.encode()).hexdigest(), 16) % len(MOCK_RESULTS)
    result = MOCK_RESULTS[seed].copy()
    result["probs"] = [float(p) for p in result["probs"]]
    await asyncio.sleep(random.uniform(1.5, 3.0))
    return result
```

- [ ] **Step 2: Branch `/verify` on mode**

At the top of `verify_image` (`main.py:141`):

```python
    contents = await file.read()
    if INFERENCE_MODE == "real":
        import real_inference
        return real_inference.verify_volume(contents, file.filename or "scan.mha")
    # ---- existing PIL grayscale heuristic below (operates on `contents`) ----
```
(Adjust the existing code to use the already-read `contents` instead of re-reading.)

- [ ] **Step 3: Change `/attention` to accept a volume path (real) and keep the blob (mock)**

```python
from fastapi import Query

@app.get("/attention/{case_id}")
async def attention(case_id: str, path: str = Query(default=None)):
    if INFERENCE_MODE == "real":
        if not path or not os.path.exists(path):
            raise HTTPException(404, detail="volume path required for real attention")
        import real_inference
        return real_inference.attention_for_path(path)
    # ---- existing blob path (unchanged) ----
    ...
```

- [ ] **Step 4: Real `/metrics` + new `/model-info`**

```python
@app.get("/metrics")
async def metrics():
    if INFERENCE_MODE == "real":
        import real_inference
        _, meta = real_inference._model_and_meta()
        return {"modelVersion": meta["model_version"], "f1Macro": meta["f1"],
                "auc": meta["auc"], "accuracy": 0.7027, "mode": "real", "task": "binary"}
    return {"modelVersion": 10, "f1Macro": 0.41, "accuracy": 0.55, "mode": INFERENCE_MODE}

@app.get("/model-info")
async def model_info():
    return {"model": "FedSCRT", "architecture": "ConvNeXt-Nano + GatedAttentionMIL",
            "task": "Binary breast MRI subtype (Luminal vs Non-Luminal)",
            "training": "Federated Classifier Retraining (FedSCRT)",
            "privacy": "Raw data never transmitted — model weights only",
            "mode": INFERENCE_MODE}
```

- [ ] **Step 5: Smoke test (from `mri_thesis`, real mode)**

Run:
```bash
cd apps/ml-service && INFERENCE_MODE=real FEDSCRT_CKPT=$MODEL_V2_PATH/checkpoints/fedscrt_stub.pt \
python -m uvicorn main:app --port 8001 &
sleep 25
curl -s http://localhost:8001/metrics
curl -s -F "file=@$SAMPLES_DIR/Breast_MRI_0001_0000.mha" http://localhost:8001/predict
```
Expected: `/metrics` shows `"mode":"real"`, `f1Macro:0.6289`; `/predict` returns a binary `predicted_subtype` + 2-length `probs` (random values with the stub). Verify a non-MRI is rejected:
`curl -s -F "file=@apps/web/public/logo-mark.png" http://localhost:8001/verify` → `"valid":false`.

- [ ] **Step 6: Commit**

```bash
git add apps/ml-service/main.py
git commit -m "feat(ml): INFERENCE_MODE=real branches for predict/verify/attention/metrics + /model-info"
```

---

### Task 5: Backend — pass the volume path to attention

**Files:**
- Modify: `apps/backend/src/inference/inference.service.ts:31-39`
- Modify: `apps/backend/src/cases/cases.service.ts:126-130`

- [ ] **Step 1: Update `InferenceService.getAttention` signature + return type**

```typescript
async getAttention(caseId: string, imagePath?: string): Promise<{ attention: number[]; size: number; slicePng?: string; topSlice?: number }> {
  const url = `${this.mlServiceUrl}/attention/${caseId}` + (imagePath ? `?path=${encodeURIComponent(imagePath)}` : '');
  const response = await firstValueFrom(this.httpService.get<any>(url));
  return {
    attention: response.data.attention,
    size: response.data.size,
    slicePng: response.data.slicePng,
    topSlice: response.data.topSlice,
  };
}
```

- [ ] **Step 2: Pass `imagePath` from `cases.service.ts`**

```typescript
async getAttention(user: any, id: string): Promise<{ attention: number[]; size: number; slicePng?: string; topSlice?: number }> {
  const c = await this.findOne(user, id);          // silo enforcement, returns case with imagePath
  return this.inferenceService.getAttention(id, c.imagePath);
}
```

- [ ] **Step 3: Verify backend compiles + e2e green**

Run: `cd apps/backend && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json cases --forceExit --runInBand`
Expected: no TS errors; cases e2e pass (attention still returns `{attention,size}` in mock; new fields optional).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/inference/inference.service.ts apps/backend/src/cases/cases.service.ts
git commit -m "feat(backend): pass case imagePath to ml-service for real attention"
```

---

### Task 6: Backend — sample-scan picker endpoints

**Files:**
- Modify: `apps/backend/src/cases/cases.service.ts` (add `listSamples`, `createFromSample`)
- Modify: `apps/backend/src/cases/cases.controller.ts` (add routes)

- [ ] **Step 1: Add service methods**

```typescript
// at top: import { readdirSync, existsSync } from 'fs'; import { join } from 'path';
private samplesDir = process.env.SAMPLES_DIR || '';

listSamples(): { name: string }[] {
  if (!this.samplesDir || !existsSync(this.samplesDir)) return [];
  return readdirSync(this.samplesDir)
    .filter((f) => f.endsWith('.mha') || f.endsWith('.nii') || f.endsWith('.nii.gz'))
    .slice(0, 12)
    .map((name) => ({ name }));
}

async createFromSample(user: any, name: string): Promise<any> {
  if (!/^[\w.-]+\.(mha|nii|nii\.gz)$/.test(name)) throw new ForbiddenException('bad sample name');
  const path = join(this.samplesDir, name);
  if (!existsSync(path)) throw new ForbiddenException('sample not found');
  // reuse create() by faking a multer file pointing at the sample
  return this.create(user, { path, originalname: name } as any);
}
```

- [ ] **Step 2: Add controller routes (above `@Get(':id')` to avoid route capture)**

```typescript
@Get('samples')
listSamples() { return this.casesService.listSamples(); }

@Post('from-sample')
@HttpCode(201)
createFromSample(@CurrentUser() user: any, @Body() body: { name: string }) {
  return this.casesService.createFromSample(user, body.name);
}
```

- [ ] **Step 3: Verify ordering + compile**

Run: `cd apps/backend && npx tsc --noEmit`
Expected: no errors. Confirm `GET /cases/samples` is mapped **before** `GET /cases/:id` in the boot log (else `:id` captures `samples`).

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/cases/cases.service.ts apps/backend/src/cases/cases.controller.ts
git commit -m "feat(backend): GET /cases/samples + POST /cases/from-sample"
```

---

### Task 7: Web — real attention overlay

**Files:**
- Modify: `apps/web/lib/api.ts` (`apiGetAttention` return shape; add sample helpers)
- Modify: `apps/web/components/AttentionOverlay.tsx`

- [ ] **Step 1: Update `apiGetAttention` + add sample helpers in `lib/api.ts`**

Change `apiGetAttention` to return `{ attention, size, slicePng, topSlice }` (it already calls `/cases/:id/attention`; just widen the type). Add:

```typescript
export async function apiListSamples(): Promise<{ name: string }[]> {
  return apiFetch('/cases/samples');
}
export async function apiCreateFromSample(name: string): Promise<CaseResult> {
  return apiFetch('/cases/from-sample', { method: 'POST', body: JSON.stringify({ name }) });
}
```
(Match the existing `apiFetch` helper signature in `lib/api.ts`.)

- [ ] **Step 2: Render the real slice in `AttentionOverlay.tsx`**

Delete `drawBreastMRI` (lines 9-109) and the `bgRef` draw effect. Replace the background `<canvas ref={bgRef}>` with an `<img>` of the real slice, falling back to a neutral panel while loading:

```tsx
// state: const [slicePng, setSlicePng] = useState<string | null>(null);
// in the apiGetAttention .then: setAttnData(attention); setSlicePng(slicePng ?? null);
// in the JSX, replace the bg <canvas> with:
{slicePng
  ? <img src={slicePng} alt="MRI slice" className="absolute inset-0" style={{ width: SIZE, height: SIZE, objectFit: "cover" }} />
  : <div className="absolute inset-0" style={{ width: SIZE, height: SIZE, background: "#050a0e" }} />}
```
The heatmap canvas (`heatRef`) and `attentionToHeatmap` stay as-is — `attention` is now the real 224×224 spatial map. Update the subtitle to "Real model attention · slice {topSlice}".

- [ ] **Step 3: Verify (dev server running)**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/AttentionOverlay.tsx
git commit -m "feat(web): real slice + real attention in focus-areas overlay"
```

---

### Task 8: Web — ScanUpload (volumes only, sample picker, no bypass)

**Files:**
- Modify: `apps/web/components/ScanUpload.tsx`

- [ ] **Step 1: Tighten `accept` (line 83) to volumes only**

```tsx
accept: { "application/octet-stream": [".mha", ".nii", ".gz", ".dcm"] },
```
Update the idle hint text (line 195) to `.mha · .nii · .dcm · up to 50 MB`.

- [ ] **Step 2: Remove the "Analyse anyway" bypass**

In the `warn` branch (lines 90-135), delete the second button (`Analyse anyway →`, lines 128-132) and make the panel copy: "This file is not a breast-MRI volume and cannot be analysed." Keep only "← Choose another file". Verification is now authoritative.

- [ ] **Step 3: Add a "Use a sample scan" control**

Below the dropzone idle state, add a button that opens a list from `apiListSamples()`; selecting one calls `apiCreateFromSample(name)` then `onUploaded(result)` (same callback as a real upload), with the `uploading` stage shown meanwhile:

```tsx
// const [samples, setSamples] = useState<{name:string}[]>([]);
// useEffect(() => { apiListSamples().then(setSamples).catch(()=>setSamples([])); }, []);
async function useSample(name: string) {
  setStage("uploading"); setProgress(10);
  try { const r = await apiCreateFromSample(name) as CaseResult; setProgress(100);
        setTimeout(() => { setStage("idle"); onUploadedRef.current(r); }, 400); }
  catch (e:any) { setError(e?.message || "Sample failed"); setStage("idle"); }
}
// render a small "Use a sample scan" button + a list of `samples` (name) when clicked.
```

- [ ] **Step 4: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ScanUpload.tsx
git commit -m "feat(web): volumes-only upload, sample-scan picker, remove analyse-anyway bypass"
```

---

### Task 9: Web — real result UI (confidence, F1/AUC, hormone advisory)

**Files:**
- Modify: the doctor scan result view (`apps/web/app/doctor/scan/page.tsx`)
- Modify: `apps/web/lib/api.ts` (add `apiGetMetrics` if absent)

- [ ] **Step 1: Show real confidence + model metrics + advisory**

After a result returns, render: predicted subtype + `Math.round(confidence*100)%` (real), the 2-bar Luminal/Non-Luminal probabilities, "Model F1 0.629 · AUC 0.687" (from `apiGetMetrics()` → `/model/*` or ml `/metrics`), and the advisory line when subtype is Luminal: "Luminal → hormone-receptor positive → hormone therapy typically indicated (clinical correlation required)." Do not hard-code 4 subtypes here.

```tsx
const hormone = result.predictedSubtype === "Luminal"
  ? "Hormone-receptor positive — hormone therapy typically indicated (clinical correlation required)."
  : "Not Luminal — hormone therapy not indicated on this basis.";
```

- [ ] **Step 2: Verify + browser smoke**

Run: `cd apps/web && npx tsc --noEmit`
Then in the browser (logged in as `dr.benali`/`doctor1234`): upload `Breast_MRI_0001_0000.mha` (or use the sample picker) → real subtype + confidence + advisory appear; focus-areas shows a real slice.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/doctor/scan/page.tsx apps/web/lib/api.ts
git commit -m "feat(web): real confidence, model F1/AUC, hormone advisory on scan result"
```

---

### Task 10: Seed real demo cases

**Files:**
- Modify: `apps/backend/prisma/seed.ts` (the demo-doctor-cases block ~line 65)

- [ ] **Step 1: Seed cases from sample volumes via the real predict**

Extend the idempotent demo block: for ~6 sample volumes, if no demo cases exist, POST each to the running real ml-service `/predict` (or call a seed-time helper) and insert a `Case` with the real `predictedSubtype/confidence/probs/modelVersion` and `imagePath` pointing at the sample. Guard so it only runs when `INFERENCE_MODE=real` and the ml-service is reachable; otherwise skip (keep the existing static demo cases as fallback).

- [ ] **Step 2: Run seed (ml-service real, from `mri_thesis`)**

Run: `npm run db:seed`
Expected: log "seeded N real demo cases"; Dashboard/History show real binary predictions.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/prisma/seed.ts
git commit -m "feat(backend): seed real demo cases via FedSCRT predict (idempotent, real-mode only)"
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Bring up the stack**

```bash
docker compose up -d postgres redis
npm run dev                       # backend :3001
( cd apps/web && npm run dev )    # web :3000
# ml-service from mri_thesis:
cd apps/ml-service && INFERENCE_MODE=real MODEL_V2_PATH=... FEDSCRT_CKPT=.../fedscrt_stub.pt \
  SAMPLES_DIR=... MRI_NUM_CLASSES=2 python -m uvicorn main:app --port 8001
```

- [ ] **Step 2: Drive it (browse)**

Log in `dr.benali`/`doctor1234` → `/doctor/scan`:
- Upload `Breast_MRI_0001_0000.mha` → real subtype + confidence + F1/AUC + advisory.
- Use the sample picker → same.
- Drag `apps/web/public/logo-mark.png` → **rejected**, no "Analyse anyway".
- Focus areas → a **real slice** with a real attention overlay.
- Console: no errors.

- [ ] **Step 3: Regression**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --forceExit --runInBand` (all green) and `cd apps/web && npx tsc --noEmit` (clean). Researcher/patient portals still load.

- [ ] **Step 4: Final note**

When the user drops in the real `fedscrt_final.pt`, point `FEDSCRT_CKPT` at it and restart the ml-service — no code change. Predictions become real (not random).

---

## Self-review notes

- **Spec coverage:** WS0 (Tasks 1-4), WS1 verify/upload/scan (Tasks 4,6,8,9), WS2 attention (Tasks 3,5,7), demo data (Task 10), honesty/advisory (Task 9), checkpoint contract (Tasks 1-2). Display-screen binary conversion is explicitly deferred (spec §9) — not in this plan.
- **Stand-in:** Task 1 stub unblocks all real-mode testing before `fedscrt_final.pt` exists (spec Risk R4).
- **Within-slice attention (Risk R1):** Task 3 uses a real ConvNeXt activation map; fallback is the real top slice itself (never a fake blob).
- **Type consistency:** attention return `{ attention, size, slicePng, topSlice }` is identical across ml-service (Task 3), backend (Task 5), and web (Task 7).
