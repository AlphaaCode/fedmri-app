# FedMRI — Federated-Learning Test Model + Optimization Objective

**Date:** 2026-06-02
**Branch:** `redesign/figma-portals`
**Status:** Design — awaiting user review
**Relation:** Builds on `2026-06-02-fedscrt-real-scan-pipeline-design.md` (the real binary
FedSCRT scan flow). This is **WS3** (real federated training), promoted to priority by the
academic supervisor.

---

## 1. Why this exists

The supervisor's requirement (paraphrased): *"the application must implement a federated-
learning test model, and must specify the optimization objective."* Two concrete gaps today:

1. **The app never runs federated learning and shows fabricated numbers.** `FlService`
   fires a round at the mock `fl-coordinator`, which webhooks back invented F1 deltas; the
   seed writes fake rounds (`0.25 → 0.41`). Nothing actually trains or aggregates.
2. **The optimization objective is never stated.** `CONTEXT.md` defines FedAvg/FedProx
   conceptually but never writes the objective `F(w)` being minimized, the local loss, or
   the research goal.

Both gaps are cheap to close honestly because the real artifacts already exist on disk:

- **Real FL experiment results** — `Documents/GitHub/federated-learning-model/results/fl_*.json`:
  genuine 20-round convergence histories (per-round F1/AUC/accuracy) for **FedAvg, Momentum,
  SCAFFOLD, FedSCRT** at **α=0.5 (non-IID)** and **α=100 (near-IID)**. Each run took ~12 h on GPU.
- **A real FL harness** — `fl_train.py` (4 strategies, Dirichlet partitioning, class-balanced
  CE, weighted aggregation, F1/AUC eval) and `save_fedscrt_model.py` (the FedSCRT method:
  frozen backbone → per-client head retraining → FedAvg of heads).

So we **surface the real results**, **add a small live FedSCRT test**, and **state the
objective**. No fabricated FL numbers remain in the FL surfaces.

## 2. The optimization objective (the core academic deliverable)

Stated in the app (an Objective card), in `CONTEXT.md`, and in a new ADR.

**Global federated objective.** Minimize

```
F(w) = Σ_{k=1}^{K} (n_k / n) · F_k(w),     K = 3 hospital clients,  n = Σ_k n_k
```

**Local objective** (client k):

```
F_k(w) = (1 / n_k) · Σ_{i ∈ D_k} ℓ( f_w(x_i), y_i )
```

with `ℓ` = **class-balanced cross-entropy** (per-class weight ∝ inverse class frequency;
matches `nn.CrossEntropyLoss(weight=w)` in `fl_train.py`/`save_fedscrt_model.py`). The task is
**binary** — Luminal vs Non-Luminal.

**Aggregation rules** (what each strategy does to reach `w`):

| Strategy | Rule |
|---|---|
| **FedAvg** | `w ← Σ_k (n_k/n) · w_k` (weighted average of client weights). |
| **Momentum-FedAvg** | FedAvg + server-side momentum on the aggregated delta. |
| **SCAFFOLD** | Control variates `c, c_k` correct client drift: local step uses `g − c_k + c`; server aggregates `w` and `c`. |
| **FedSCRT** (novel) | Freeze backbone; each client **retrains the linear head** on its local frozen features (best-of-seeds, class-balanced CE); **FedAvg the heads**. |

**Evaluation metric.** Macro-F1 (primary), AUC, accuracy on the held-out validation fold.

**Research goal of the optimization.** Under non-IID data (Dirichlet `α=0.5`), minimize client
drift so the federated model **approaches centralized performance without sharing raw data**.
`α=0.5` (non-IID) vs `α=100` (near-IID) isolates heterogeneity's effect. The contribution is
**closing the FL↔centralized gap**, not absolute F1 (biological ceiling ≈ 0.75 macro-F1).

## 3. Locked decisions

| Decision | Value |
|---|---|
| Scope | **Both**: surface real results **+** a live FL test **+** state the objective |
| Live test method | **Real head-level FedSCRT on cached features** (genuine federated head training + aggregation, in seconds) |
| Architecture | **A — coordinator owns live FL over cached per-hospital feature caches**; frozen-backbone feature extraction is a one-time offline prep |
| Coordinator FL math | **Pure numpy** linear softmax head + class-balanced CE + SGD (same objective as `nn.Linear`+Adam) → no torch/GPU in the coordinator at click time |
| Real results source | The genuine `results/fl_*.json` (4 strategies × α0.5/α100), copied into the app |
| UI home | **Researcher portal** "Federated Learning" view (FL/ML operator god-view) |
| Task | **Binary** (Luminal vs Non-Luminal) throughout — consistent with the FedSCRT scan flow |
| Privacy | Clients keep their features; only head weights aggregate → `rawDataTransmitted` stays **0** |

## 4. WS-A — Honest real results (replace fabricated numbers)

- Copy the real experiment JSON into the app at `apps/backend/src/fl/experiments/`:
  `fl_{fedavg,momentum,scaffold,fedscrt}_alpha{0.5,100}.json`.
  Histories vary in length (e.g. `fedscrt_alpha0.5` is shorter) — the reader handles that.
- New researcher-scoped endpoint **`GET /researcher/fl-experiments`** returns, per strategy/α:
  `{ strategy, alpha, rounds, history: [{round,f1,auc,accuracy}], final, time_hours }`.
  Never returns raw data or image paths (researcher invariant holds by construction).
- Researcher **convergence chart** renders these **real** curves (per-round F1) comparing
  strategies, with a **non-IID (α0.5) ↔ near-IID (α100)** toggle and a final-metrics table.
  Replaces the seed's fabricated `0.25→0.41`. (Binary — overlaps the deferred 4→2-class
  display follow-on; this view is scoped binary.)

## 5. WS-B — Live FL test (Architecture A)

### 5.1 Offline prep (one-time, `mri_thesis`)
`fl_feature_cache.py` (adapted from `save_fedscrt_model.py`):
- Load the FedSCRT frozen backbone (`fedscrt_final.pt`).
- Reuse the fold-0 binary split; partition the train set into **3 hospital clients** using the
  existing fixed `[:80], [80:363], [363:]` split from `save_fedscrt_model.py` (one client per
  app hospital). The `α0.5/α100` toggle in WS-A belongs to the **surfaced offline results**
  (`fl_train.py`'s Dirichlet experiments); the live test demonstrates FedSCRT's federated head
  aggregation over the 3 hospitals and does not re-partition by `α`.
- Extract **256-dim** features (the head's input, via a forward hook) for each client + the
  validation set.
- Write compact caches: `fl_cache/client_{0,1,2}.npz` + `val.npz` (features `float32` + int
  labels). **No raw images**; a few hundred × 256 floats — tiny. Copied to a path the
  coordinator reads (`FL_CACHE_DIR`).

### 5.2 Coordinator real path
`fl-coordinator` gains a real FL path (`FL_MODE`-gated):
- **`POST /fl-test/run`** body `{ strategy: "fedscrt"|"fedavg", rounds, seed }`:
  1. Load cached client features + val.
  2. Each round, **per client**: train a linear softmax head (class-balanced CE, SGD) on its
     own features (FedSCRT: best-of-N-seeds head). Server **aggregates** heads
     `w ← Σ (n_k/n) w_k`. Evaluate global head on val → `{f1, auc, accuracy}`.
  3. Stream per-round progress via the existing webhook → backend → WS event
     **`fl:test:progress`**; return the final metrics + full history.
- Pure numpy (no torch, no GPU, no model load) → **seconds**. Deterministic on `seed`.
- A privacy-audit event is logged with `rawDataTransmitted = 0` (only head weights moved).

### 5.3 Backend
- Proxy/trigger endpoint **`POST /researcher/fl-test`** (researcher-scoped) → coordinator
  `/fl-test/run`; relays the streamed progress to the researcher client over WS.
- Persisting the live run is optional (it's a demonstration); if persisted, it writes an
  `FlRound`-like record flagged as a test run (not mixed into the production round history).

### 5.4 Web (researcher portal)
A "Federated Learning" view:
- **Objective card** — the `F(w)` formula + plain-language goal (§2).
- **Real convergence** — chart comparing strategies with the α toggle + final-metrics table (WS-A).
- **"Run FL test" panel** — pick strategy + rounds → live-streamed real convergence across the
  3 clients, with the **0 bytes of raw data** privacy note. Reuses `ConvergenceChart` + WS.

## 6. Honesty principles / invariants

- **Invariant #1** (`rawDataTransmitted = 0`) preserved and *demonstrated* — the live test
  aggregates only head weights.
- **Invariant #5** — patient portal stays free of FL jargon; this work is researcher/doctor-side only.
- **Real numbers only** on FL surfaces: surfaced results are the genuine 12 h runs; the live
  test computes real metrics on the validation cache. No fabricated FL numbers remain.
- Binary task throughout (consistent with the deployed FedSCRT scan model).

## 7. Out of scope (follow-on)

- Re-running the full 12 h end-to-end FL experiments (we consume the existing results).
- Wiring the **production** scan→FL-round trigger to real training (the doctor-upload auto-round
  stays mock/animation; the live test is the explicit, on-demand real demonstration).
- The broader 4→2-class display conversion of the rest of the researcher/doctor screens
  (tracked separately; this spec only makes the FL surfaces binary + honest).
- Differential-privacy ε accounting beyond the existing simulated framing.

## 8. Risks

- **R1 — coordinator deps.** The live FL must stay light. Mitigation: pure-numpy head + CE
  (no torch in the coordinator). Verify the coordinator runs the test with only numpy +
  scikit-learn (for F1/AUC) installed.
- **R2 — feature-cache availability.** The caches are produced offline from `mri_thesis`.
  Mitigation: ship a tiny committed fallback cache (synthetic or a small real slice) so the
  live test runs even before the real cache is built; the real cache replaces it with no code
  change (mirrors the FedSCRT stub→final pattern).
- **R3 — faithfulness of numpy head vs the user's `nn.Linear`+Adam.** Both optimize the same
  linear-head class-balanced CE objective; the demo's value is the *federated aggregation*,
  which is identical. Document this equivalence in the Objective card.
- **R4 — honesty drift.** The surfaced curves must be the real `fl_*.json`, not re-fabricated.
  Mitigation: copy the files verbatim; the endpoint just reads them.

## 9. Verification plan

1. **Offline:** `fl_feature_cache.py` (from `mri_thesis`) writes `client_{0,1,2}.npz` + `val.npz`;
   log feature shapes + per-client class counts.
2. **Coordinator:** `pytest` on the numpy FedAvg aggregation + a deterministic synthetic
   feature set → asserts aggregation correctness + monotone-ish convergence; `POST /fl-test/run`
   (fedscrt) returns a real history + final F1/AUC in seconds.
3. **Backend:** e2e — `GET /researcher/fl-experiments` and `POST /researcher/fl-test` return
   200 for RESEARCHER, **403** for DOCTOR/PATIENT, 401 no-token (`--forceExit`).
4. **Web:** `tsc --noEmit` clean; browser smoke — researcher logs in, sees the Objective card +
   real convergence (α toggle), runs the live FL test and watches real per-round convergence;
   console clean.
5. **Regression:** backend e2e green; doctor/patient/researcher portals load; `rawDataTransmitted`
   still 0 everywhere.

## 10. Run (captured)

- Offline cache (one-time): from `mri_thesis`,
  `MODEL_V2_PATH=…/federated-learning-model FEDSCRT_CKPT=…/checkpoints/fedscrt_final.pt
  python fl_feature_cache.py` → copy `fl_cache/` to `FL_CACHE_DIR`.
- Coordinator: `FL_MODE=real FL_CACHE_DIR=… uvicorn main:app --port 8002` (numpy-only; no GPU).
- Backend `:3001`, web `:3000` as in the scan-pipeline spec. Researcher login
  `researcher@fedmri.local` / `research1234` → Federated Learning view.
