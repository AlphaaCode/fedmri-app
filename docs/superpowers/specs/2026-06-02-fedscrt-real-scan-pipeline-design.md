# FedMRI — Real Scan Pipeline with FedSCRT (WS0–WS2)

**Date:** 2026-06-02
**Branch:** `redesign/figma-portals`
**Status:** Design — awaiting user review
**Supersedes (for the scan flow):** the 4-class assumptions in
`2026-05-31-fedmri-figma-redesign-design.md`. The real model is **binary**.

---

## 1. Why this exists

The previous phases built portal *shells* that look finished but are not wired to a
real model. Concretely, today:

- `apps/ml-service/main.py` `/predict` seeds the result from `md5(filename)` — it
  **never reads the pixels**. Any file (including a `.webp` photo) returns a result.
- `ScanUpload.tsx` accepts an `image/*` wildcard (lets `.webp` through) and offers an
  **"Analyse anyway →"** button that bypasses verification entirely.
- `AttentionOverlay.tsx` draws a **synthetic** breast with canvas gradients and overlays
  **random Gaussian blobs** from `/attention`. No real slice, no real attention.

The real model, data, and a working Python stack exist on disk:

- **Model code:** `Memoir/Model/V2/` (`model.py` `ConvNeXtMILClassifier` + `GatedAttentionMIL`,
  `image_process.py`, `main.py:build_model`). Binary head when `MRI_NUM_CLASSES=2`.
- **Data:** `Memoir/Datasets/breast-mri-molecular-cancer-subtype/` — 771 `.mha` volumes
  + a `samples/` subset (~20 curated volumes).
- **Env:** the user's **conda `mri_thesis`** env (torch + timm + monai + SimpleITK), which
  also runs `save_fedscrt_model.py`.

This deliverable makes the **scan flow real, end to end**, using the user's own model.

## 2. The model: FedSCRT (binary)

- **FedSCRT** = the user's federated classifier-retraining model. Architecture:
  **ConvNeXt-Nano + GatedAttentionMIL**. Task: **binary** — `Luminal` vs `Non-Luminal`.
- Reported validation: **macro F1 0.629 · AUC 0.687 · accuracy 0.703**.
- Produced by the user via `save_fedscrt_model.py` → **`checkpoints/fedscrt_final.pt`**
  (does not exist yet; the user owns producing it). The app *consumes* it.
- **Attention:** `ConvNeXtMILClassifier` stores per-slice gated-attention in
  `model.last_attn` (shape `(B, S)`) — the real "which slices mattered" signal.

### 2.1 Checkpoint contract (the loader depends on this)

`fedscrt_final.pt` must be a dict containing:

```
{
  "model_state": <state_dict>,         # ConvNeXtMILClassifier weights (binary head)
  "arch":        "convnext_mil",
  "task":        "binary",
  "f1":          0.6289,               # validation macro F1
  "auc":         0.6874,               # validation AUC
  "label_map":   {"0": "Luminal", "1": "Non-Luminal"},   # STRING keys
  "fedscrt":     true
}
```

Loader uses `load_state_dict(..., strict=False)` and `MRI_NUM_CLASSES=2` set **before**
importing `main`/`model` (env read at import time).

## 3. Locked decisions

| Decision | Value |
|---|---|
| How real | Real inference, incrementally (spike already proved it runs) |
| First deliverable | Scan flow end-to-end (WS0 + WS1 + WS2) |
| Model | FedSCRT binary (Luminal / Non-Luminal), ConvNeXt-MIL |
| Inference env | Run the real ml-service from the **`mri_thesis` conda env** + `pip install fastapi uvicorn python-multipart` |
| Upload scope | Real `.mha/.nii/.nii.gz/.dcm` **+ a "Use a sample scan" picker** over the bundled `samples/` |
| Verification | Real "is this a valid MRI volume" check; **`.webp` blocked; "Analyse anyway" bypass removed** |
| Inference latency | ~11 s/volume warm on CPU (4.7 s preprocess + 6.4 s infer) → **run live on upload**; model loaded once at service startup |
| Focus areas | Real top-attended slice + real spatial attention (no fake canvas / random blobs) |
| Confidence | Show **real** confidence + real F1/AUC from the checkpoint. No faked "86%". |
| Binary conversion scope | **Scan flow now**; convert display screens (confusion matrix → 2×2, subtype bars → 2, seeds, researcher Model Performance) in an **immediate follow-on** |

### Spike evidence (2026-06-02)

`best_fold0.pt` (4-class DINOv2) loaded clean (`missing=0 unexpected=0`) and ran on CPU:
preprocess 4.7 s + inference 6.4 s, real probs + real per-slice attention. The FedSCRT
ConvNeXt path is lighter than DINOv2, so ~11 s/volume is a safe upper bound.

## 4. WS0 — Real inference in `apps/ml-service`

Fold the real path into the **existing** service (keep `/attention`, `/verify`, `/metrics`,
and the `mock` fallback). Do **not** ship a standalone `inference_service.py` that only
has `/predict`.

- **`INFERENCE_MODE=real`** loads FedSCRT once at startup:
  - `os.environ["MRI_NUM_CLASSES"]="2"` before importing; add `Model/V2` to `sys.path`.
  - `model = build_model("convnext_mil", device)`; `model.load_state_dict(ckpt["model_state"], strict=False)`; `eval()`.
- **`POST /predict`** reads the **actual file**:
  - `.mha/.nii` → `preprocess_raw(path)` → `(64,128,128)`.
  - **Correction vs the user's draft:** use the trained transform
    `slice_view_transform(torch.from_numpy(vol))` → `(64,3,224,224)` (it does resize +
    channel-replicate **+ ImageNet normalization**). The user's manual loop skipped the
    mean/std normalization, which silently degrades ConvNeXt predictions.
  - `model(slices.unsqueeze(0))` → softmax → probs `[p_luminal, p_nonluminal]`.
  - Capture `model.last_attn[0]` (per-slice) + top-attended slice index.
- **Response contract** (matches what `cases.service.create` already consumes):
  ```
  { "predicted_subtype": "Luminal" | "Non-Luminal",
    "confidence": <max prob>,
    "probs": [p_luminal, p_nonluminal],
    "model_version": <int>,
    "f1": 0.6289, "auc": 0.6874,                 # surfaced in UI
    "hormone_therapy": "indicated" | "not_indicated"  # advisory, Luminal→indicated
  }
  ```
  NestJS keeps its existing field mapping; `f1`/`auc`/`hormone_therapy` are additive.
- **Slice + attention export** (for WS2), cached per case id:
  - top-attended **real axial slice** → grayscale PNG.
  - **within-slice spatial attention** for that slice (see Risk R1).

## 5. WS1 — Verification + real scan (the loudest complaint)

- **Upload accept (`ScanUpload.tsx`):** drop the `image/*` wildcard. Accept
  `.mha/.nii/.nii.gz/.dcm` only. `.webp/.png/.jpg` no longer pass.
- **"Use a sample scan" picker:** a control listing the bundled `samples/` volumes; one
  click runs the same real pipeline (no local file needed to demo).
- **`/verify` becomes real & authoritative:** "can SimpleITK open this as a 3D volume with
  plausible dims?" Non-MRI → **rejected**. **Remove the "Analyse anyway →" button** — there
  is no path to analyze a non-MRI.
- **Real scan pass:** the verify→scan stage runs the real model and shows honest progress
  (verifying → preprocessing → scanning N slices → aggregating), ~11 s. The existing scan
  sweep animation becomes truthful, not a 700 ms placeholder.
- **Result:** real subtype from pixels, **real confidence**, plus "AUC 0.687 · F1 0.629" and
  the advisory **"Luminal → hormone-receptor positive → hormone therapy typically indicated
  (clinical correlation required)."**
- **Scan screen** redesigned to the Figma; copy updated from "molecular subtype in under 4
  seconds" to honest binary + latency language.

## 6. WS2 — Real focus areas

- `AttentionOverlay.tsx`: delete `drawBreastMRI()`. Render the **real top-attended slice**
  PNG from WS0.
- Overlay the **real spatial attention** heatmap (tumor-focused) with the existing
  opacity/toggle controls. Optional: a slice scrubber to view other slices + their attention.

## 7. Demo data

Seed a handful of `CaseScope.HOSPITAL` (and later `PATIENT`) cases by running `samples/`
volumes through the **real** model **once at seed time**, storing real probs + slice PNGs.
Dashboard / History / Results then show real predictions and real imagery. Idempotent
(guard on existing demo cases). Empty states preserved for fresh accounts.

## 8. Honesty principles (memoir integrity)

- Real confidence everywhere; never fake high certainty. Binary F1 0.629 / AUC 0.687 from
  the checkpoint is shown as-is.
- The hormone-therapy line is an **advisory clinical correlate**, not a directive.
- `PrivacyAuditLog.rawDataTransmitted` stays **0** (invariant #1). FedSCRT's
  "weights-only, raw data never transmitted" framing reinforces this.

## 9. Out of scope (explicit, follow-on)

- **Binary conversion of display screens** (4×4 confusion matrix → 2×2, 4-bar subtype panels
  → 2, `mock_results.json`, seed F1-per-class, researcher Model Performance, history colors,
  `CONTEXT.md`): immediate follow-on right after the scan flow works.
- **WS3 real federated training** (`fl_train.py` / `run_fl_all.py` wired to the coordinator).
- **WS4** patient timeline + dead-control cleanup; **WS5** Support/Docs fidelity + researcher
  completion; **WS6** patient portal (Phase D: shell + PDF export + persisted privacy settings).

## 10. Risks

- **R1 — within-slice spatial attention.** MIL `last_attn` is per-*slice*, not within-slice.
  For the tumor-on-slice overlay we derive spatial attention from the ConvNeXt feature map
  (Grad-CAM on the last stage w.r.t. the predicted class) or an activation map upsampled to
  224. Validate early; **fallback:** highlight the top-attended *slice* (still real) instead
  of a fake blob.
- **R2 — CPU latency UX.** ~11 s is fine as an honest scan; if a machine is slower, cut
  slices (64 → 24–32 via target depth) and/or precompute seeded cases.
- **R3 — env wiring.** Real service must run from `mri_thesis` (torch + model stack). Verify
  the env exists and add fastapi/uvicorn/python-multipart at implementation start; document
  the exact launch command.
- **R4 — `fedscrt_final.pt` availability.** User-produced; until it exists, `INFERENCE_MODE`
  stays `mock`. Loader fails loudly (clear error) if the checkpoint or contract is missing.

## 11. Verification plan

1. From `mri_thesis`: `INFERENCE_MODE=real` ml-service starts, loads `fedscrt_final.pt`,
   `/health` ok, `/model-info` shows FedSCRT + F1/AUC.
2. `curl -F file=@samples/Breast_MRI_0001_0000.mha /predict` → real binary probs in the
   contract shape; latency logged.
3. Browser: upload a `.mha` (and use the sample picker) → real subtype + confidence +
   AUC/F1 + advisory; a `.webp` is **rejected** with no bypass.
4. Focus areas show a **real slice** with a real attention overlay (or the slice fallback).
5. Backend e2e green (`--forceExit`); web `tsc --noEmit` clean; doctor/patient/researcher
   portals no regression.

## 12. Run the app (captured)

- Stores: `docker compose up -d postgres redis` (Docker Desktop must be running).
- Backend + shared: `npm run dev` (turbo) → NestJS :3001. **Web is NOT started by this**
  (the `web` package has no `start:dev` script) → run `cd apps/web && npm run dev` → :3000.
- ml-service: from `mri_thesis`, `INFERENCE_MODE=real uvicorn main:app --port 8001`
  (or system python + `INFERENCE_MODE=mock` for offline UI work).
- Logins: `dr.benali@fedmri.local`/`doctor1234`, `researcher@fedmri.local`/`research1234`,
  patients `…/patient1234`.
