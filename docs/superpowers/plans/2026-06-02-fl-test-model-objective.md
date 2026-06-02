# Federated-Learning Test Model + Optimization Objective — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app genuinely demonstrate federated learning — surface the real FL experiment results, add a seconds-long live FedSCRT test that really trains + aggregates classifier heads across 3 hospital clients, and state the optimization objective explicitly.

**Architecture:** Architecture A from the spec. A one-time offline script extracts frozen-backbone features into tiny per-hospital caches. The `fl-coordinator` gains a pure-numpy real-FL path (`/fl-test/run`) that trains per-client linear heads (class-balanced cross-entropy) and FedAvg-aggregates them in seconds — no torch/GPU. Real `fl_*.json` results are copied into the backend and served to the researcher portal. A new researcher "Federated Learning" view shows the objective, the real convergence curves, and a live test runner streamed over WebSocket.

**Tech Stack:** FastAPI (coordinator), numpy + scikit-learn (FL math + metrics), NestJS (researcher endpoints + Socket.io gateway), Next.js 16 / React 19 / recharts (researcher UI), pytest.

## Spec

`docs/superpowers/specs/2026-06-02-fl-test-model-objective-design.md`. Read it first. Key invariants: real numbers only on FL surfaces; `PrivacyAuditLog.rawDataTransmitted` stays 0; binary Luminal/Non-Luminal; the live test demonstrates the federated *aggregation* (numpy head = same class-balanced CE objective as the user's `nn.Linear`+Adam).

## File map

**fl-coordinator (`apps/fl-coordinator/`)** — runs with numpy only (no GPU) at click time:
- Create `realfl.py` — pure-numpy linear softmax head, class-balanced CE training, FedAvg aggregation, FedSCRT best-of-seeds, evaluation. All live-FL math, isolated.
- Create `test_realfl.py` — pytest on aggregation + convergence with deterministic synthetic features.
- Create `fl_feature_cache.py` — offline (mri_thesis) builder: frozen-backbone features → `fl_cache/client_{0,1,2}.npz` + `val.npz`. Also `--synthetic` to emit a tiny committed fallback cache.
- Modify `main.py` — add `POST /fl-test/run` (loads caches, runs `realfl`, streams progress to backend webhook).

**backend (`apps/backend/src/`)**:
- Create `fl/experiments/*.json` — the real results copied verbatim from the model repo.
- Modify `researcher/researcher.service.ts` — `getFlExperiments()` reads the json; `runFlTest()` proxies the coordinator.
- Modify `researcher/researcher.controller.ts` — `GET /researcher/fl-experiments`, `POST /researcher/fl-test`.
- Modify `fl/fl.gateway.ts` — add a `researchers` room + `emitTestProgress`/`emitTestComplete`.
- Modify `fl/fl.service.ts` — `handleTestProgress()`; trigger helper.
- Modify the internal FL webhook controller — add `POST /internal/fl/test-progress`.

**web (`apps/web/`)**:
- Modify `lib/researcher-api.ts` — `getFlExperiments`, `runFlTest`, types.
- Create `app/researcher/federated/page.tsx` — Objective card + real convergence chart (strategy + α toggle) + live FL test panel (WS).
- Modify `app/researcher/layout.tsx` — add the "Federated Learning" nav item.

**docs**:
- Modify `CONTEXT.md` — the optimization objective section.
- Create `docs/adr/ADR-004-fl-optimization-objective.md`.

## Env (coordinator real FL)

```
FL_CACHE_DIR=apps/fl-coordinator/fl_cache    # where client_*.npz + val.npz live
# offline builder (mri_thesis):
MODEL_V2_PATH=C:\Users\akaro\Documents\GitHub\federated-learning-model
FEDSCRT_CKPT=...\checkpoints\fedscrt_final.pt
MRI_NUM_CLASSES=2
```

---

### Task 1: Coordinator real-FL math (pure numpy, unit-tested)

**Files:**
- Create: `apps/fl-coordinator/realfl.py`
- Test: `apps/fl-coordinator/test_realfl.py`

- [ ] **Step 1: Write `realfl.py`**

```python
"""Real federated head training + aggregation for the live FL test.
Pure numpy: a linear softmax head trained with class-balanced cross-entropy +
SGD, FedAvg-aggregated across clients. Same objective as the user's
nn.Linear(256,2)+Adam head in save_fedscrt_model.py; the demonstrated quantity
is the FEDERATED aggregation. No torch, no GPU."""
import numpy as np
from sklearn.metrics import f1_score, roc_auc_score, accuracy_score


def _softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def _class_weights(y, n_classes):
    counts = np.maximum(np.bincount(y, minlength=n_classes).astype(float), 1.0)
    return counts.sum() / (n_classes * counts)   # inverse-frequency


def train_head(X, y, n_classes, epochs=60, lr=0.1, l2=1e-4, seed=0, init=None):
    """Linear softmax head via class-balanced CE + full-batch GD. Warm-starts
    from `init` (the global head) when given, so rounds converge."""
    rng = np.random.default_rng(seed)
    d = X.shape[1]
    if init is None:
        W = rng.normal(0, 0.01, (d, n_classes)); b = np.zeros(n_classes)
    else:
        W = init["W"].copy(); b = init["b"].copy()
    sw = _class_weights(y, n_classes)[y]          # per-sample weight
    Y = np.eye(n_classes)[y]
    n = X.shape[0]
    for _ in range(epochs):
        P = _softmax(X @ W + b)
        G = (P - Y) * sw[:, None] / n
        W -= lr * (X.T @ G + l2 * W)
        b -= lr * G.sum(axis=0)
    return {"W": W, "b": b}


def aggregate(heads, sizes):
    """FedAvg: weighted average of client heads by sample count."""
    total = float(sum(sizes))
    W = sum((sizes[k] / total) * heads[k]["W"] for k in range(len(heads)))
    b = sum((sizes[k] / total) * heads[k]["b"] for k in range(len(heads)))
    return {"W": W, "b": b}


def evaluate(head, X, y, n_classes):
    P = _softmax(X @ head["W"] + head["b"])
    pred = P.argmax(1)
    f1 = f1_score(y, pred, average="macro", zero_division=0)
    try:
        auc = roc_auc_score(y, P[:, 1]) if n_classes == 2 else roc_auc_score(y, P, multi_class="ovr")
    except Exception:
        auc = 0.5
    return {"f1": float(f1), "auc": float(auc), "accuracy": float(accuracy_score(y, pred))}


def run_fl(clients, val, strategy="fedscrt", rounds=10, local_epochs=60, seeds=5, on_round=None):
    """clients: list of (X, y) arrays (one per hospital). val: (Xv, yv).
    Returns the per-round history; calls on_round(entry) for live streaming."""
    sizes = [len(y) for _, y in clients]
    n_classes = int(max(int(y.max()) for _, y in clients) + 1)
    glob = None
    history = []
    for r in range(1, rounds + 1):
        heads = []
        for k, (X, y) in enumerate(clients):
            if strategy == "fedscrt" and r == 1:
                # FedSCRT cRT: best-of-seeds local head at the init round
                best, best_f1 = None, -1.0
                for s in range(seeds):
                    h = train_head(X, y, n_classes, epochs=local_epochs, seed=s, init=glob)
                    f = evaluate(h, X, y, n_classes)["f1"]
                    if f > best_f1:
                        best_f1, best = f, h
                heads.append(best)
            else:
                heads.append(train_head(X, y, n_classes, epochs=local_epochs, seed=r, init=glob))
        glob = aggregate(heads, sizes)
        entry = {"round": r, **evaluate(glob, val[0], val[1], n_classes)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return history
```

- [ ] **Step 2: Write the failing test**

```python
# apps/fl-coordinator/test_realfl.py
import numpy as np
from realfl import train_head, aggregate, evaluate, run_fl


def _synth(n_per_class=40, d=16, sep=2.0, seed=0):
    rng = np.random.default_rng(seed)
    X0 = rng.normal(-sep, 1.0, (n_per_class, d))
    X1 = rng.normal(+sep, 1.0, (n_per_class, d))
    X = np.vstack([X0, X1]).astype("float32")
    y = np.array([0] * n_per_class + [1] * n_per_class)
    return X, y


def test_aggregate_is_weighted_average():
    h1 = {"W": np.ones((4, 2)), "b": np.zeros(2)}
    h2 = {"W": np.zeros((4, 2)), "b": np.ones(2)}
    agg = aggregate([h1, h2], [3, 1])           # 3:1 weighting
    assert np.allclose(agg["W"], 0.75)
    assert np.allclose(agg["b"], 0.25)


def test_single_head_learns_separable_data():
    X, y = _synth()
    h = train_head(X, y, 2, epochs=200, seed=0)
    assert evaluate(h, X, y, 2)["f1"] > 0.9


def test_federated_run_converges():
    clients = [_synth(seed=1), _synth(seed=2), _synth(seed=3)]
    val = _synth(seed=99)
    hist = run_fl(clients, val, strategy="fedscrt", rounds=5, local_epochs=80, seeds=3)
    assert len(hist) == 5
    assert hist[-1]["f1"] >= hist[0]["f1"]       # non-decreasing on separable data
    assert hist[-1]["f1"] > 0.8
```

- [ ] **Step 3: Run the test (from `mri_thesis`, or any env with numpy + scikit-learn)**

Run: `cd apps/fl-coordinator && python -m pytest test_realfl.py -v`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add apps/fl-coordinator/realfl.py apps/fl-coordinator/test_realfl.py
git commit -m "feat(fl): pure-numpy federated head training + FedAvg/FedSCRT aggregation"
```

---

### Task 2: Offline feature-cache builder (+ synthetic fallback)

**Files:**
- Create: `apps/fl-coordinator/fl_feature_cache.py`

- [ ] **Step 1: Write the builder**

```python
"""Build per-hospital feature caches for the live FL test.

Real mode (from the mri_thesis conda env): extract 256-dim frozen-backbone
features for the 3 hospital client partitions + the validation set, mirroring
save_fedscrt_model.py. Synthetic mode: write a tiny random fallback so the
coordinator's live test runs before the real cache exists (Risk R2).

Run real:      conda run -n mri_thesis python fl_feature_cache.py
Run synthetic: python fl_feature_cache.py --synthetic
"""
import os, sys, argparse
import numpy as np

OUT = os.environ.get("FL_CACHE_DIR", os.path.join(os.path.dirname(__file__), "fl_cache"))
os.makedirs(OUT, exist_ok=True)


def _save(name, X, y):
    np.savez(os.path.join(OUT, name), X=X.astype("float32"), y=y.astype("int64"))


def build_synthetic(d=256):
    rng = np.random.default_rng(0)
    def blob(n, c):
        X = rng.normal(c * 0.6, 1.0, (n, d)); y = np.full(n, c)
        return X, y
    for k, n in enumerate([60, 120, 90]):           # 3 clients, non-IID-ish sizes
        n0 = int(n * (0.7 if k == 0 else 0.4))
        X = np.vstack([blob(n0, 0)[0], blob(n - n0, 1)[0]])
        y = np.concatenate([np.zeros(n0), np.ones(n - n0)]).astype(int)
        _save(f"client_{k}.npz", X, y)
    Xv = np.vstack([blob(40, 0)[0], blob(40, 1)[0]]); yv = np.array([0]*40 + [1]*40)
    _save("val.npz", Xv, yv)
    print("wrote synthetic caches to", OUT)


def build_real():
    V2 = os.environ["MODEL_V2_PATH"]; sys.path.insert(0, V2)
    os.environ.setdefault("MRI_NUM_CLASSES", "2")
    import torch
    from main import build_model
    from data_loader import MRI25DSliceDataset, load_samples
    from config import FullConfig
    from sklearn.model_selection import StratifiedGroupKFold
    from torch.utils.data import DataLoader
    import random

    REMAP = {0: 0, 1: 0, 2: 1, 3: 1}
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    cfg = FullConfig()
    samples = load_samples(cfg.data_json, cfg.data_root)
    labels = [s[1] for s in samples]; groups = [s[2] for s in samples]
    skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    tr_s = va_s = None
    for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
        if fi == 0:
            tr_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
            va_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va]
            break
    random.seed(42); sh = tr_s.copy(); random.shuffle(sh)
    client_samples = [sh[:80], sh[80:363], sh[363:]]   # 3 hospitals (save_fedscrt_model split)

    model = build_model("convnext_mil", device)
    ck = torch.load(os.environ["FEDSCRT_CKPT"], map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state"], strict=False); model.eval()

    def extract(sample_list):
        ds = MRI25DSliceDataset(sample_list, augment=False, slice_size=224)
        loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)
        store, feats, labs = {}, [], []
        h = model.head.register_forward_hook(lambda m, i, o: store.update({"f": i[0].detach().cpu()}))
        with torch.no_grad():
            for x, y in loader:
                _ = model(x.to(device)); feats.append(store["f"]); labs.extend(y.numpy())
        h.remove()
        return torch.cat(feats).numpy(), np.array(labs)

    for k, s in enumerate(client_samples):
        X, y = extract(s); _save(f"client_{k}.npz", X, y)
        print(f"client_{k}: X={X.shape} classes={np.bincount(y, minlength=2).tolist()}")
    Xv, yv = extract(va_s); _save("val.npz", Xv, yv)
    print(f"val: X={Xv.shape} classes={np.bincount(yv, minlength=2).tolist()} -> {OUT}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--synthetic", action="store_true")
    args = p.parse_args()
    build_synthetic() if args.synthetic else build_real()
```

- [ ] **Step 2: Build the synthetic fallback now (no GPU needed)**

Run: `cd apps/fl-coordinator && python fl_feature_cache.py --synthetic`
Expected: `wrote synthetic caches to .../fl_cache` and `fl_cache/{client_0,client_1,client_2,val}.npz` exist.

- [ ] **Step 3: (Later, from `mri_thesis`) build the real cache**

Run: `conda run -n mri_thesis python apps/fl-coordinator/fl_feature_cache.py`
Expected: per-client feature shapes + class counts logged; the real `.npz` files replace the synthetic ones with no code change.

- [ ] **Step 4: Commit (code + synthetic cache as the committed fallback)**

```bash
git add apps/fl-coordinator/fl_feature_cache.py apps/fl-coordinator/fl_cache/
git commit -m "feat(fl): offline frozen-backbone feature-cache builder + synthetic fallback"
```

---

### Task 3: Coordinator `/fl-test/run` endpoint

**Files:**
- Modify: `apps/fl-coordinator/main.py`

- [ ] **Step 1: Add the cache loader + endpoint** (after the `/round/start` block)

```python
import numpy as np

FL_CACHE_DIR = os.getenv("FL_CACHE_DIR", os.path.join(os.path.dirname(__file__), "fl_cache"))


class FlTestReq(BaseModel):
    strategy: str = Field("fedscrt", pattern="^(fedscrt|fedavg)$")
    rounds: int = Field(10, ge=1, le=30)
    seed: int = Field(0, ge=0, le=9999)


def _load_clients():
    import glob
    clients = []
    for p in sorted(glob.glob(os.path.join(FL_CACHE_DIR, "client_*.npz"))):
        d = np.load(p); clients.append((d["X"], d["y"]))
    v = np.load(os.path.join(FL_CACHE_DIR, "val.npz"))
    if not clients:
        raise HTTPException(503, detail=f"no feature caches in {FL_CACHE_DIR}")
    return clients, (v["X"], v["y"])


@app.post("/fl-test/run")
@limiter.limit("10/minute")
async def fl_test_run(request: Request, req: FlTestReq, background_tasks: BackgroundTasks):
    rid = str(uuid.uuid4())
    _rounds[rid] = {"status": "running", "history": []}
    background_tasks.add_task(_run_fl_test, rid, req)
    return {"test_id": rid, "status": "running", "strategy": req.strategy, "rounds": req.rounds}


async def _run_fl_test(rid: str, req: FlTestReq):
    import realfl
    try:
        clients, val = _load_clients()
        sizes = [int(len(y)) for _, y in clients]
        # numpy compute is sub-second; run it off the event loop, then stream per round
        hist = await asyncio.to_thread(
            realfl.run_fl, clients, val,
            strategy=req.strategy, rounds=req.rounds, seeds=5, on_round=None,
        )
        for i, e in enumerate(hist):
            await _post_fl_test(rid, req.strategy, sizes, e, done=(i == len(hist) - 1))
        _rounds[rid]["status"] = "complete"
        _rounds[rid]["history"] = hist
    except HTTPException:
        raise
    except Exception as ex:
        _rounds[rid]["status"] = "failed"
        logger.error(f"[fl-test {rid}] failed: {ex}", exc_info=True)


async def _post_fl_test(rid, strategy, sizes, entry, done):
    payload = {
        "test_id": rid, "strategy": strategy, "client_sizes": sizes,
        "round": entry["round"], "f1": entry["f1"], "auc": entry["auc"],
        "accuracy": entry["accuracy"], "done": done,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            await c.post(f"{BACKEND_URL}/internal/fl/test-progress", json=payload,
                         headers={"x-fl-secret": WEBHOOK_SECRET})
    except Exception as e:
        logger.warning(f"[fl-test {rid}] webhook failed: {e}")
```

Note: `/fl-test/run` reuses the shared `_rounds` dict, so the existing `GET /round/{id}/status` returns the test's status + history (no separate status endpoint needed).

- [ ] **Step 2: Smoke test (synthetic cache)**

Run:
```bash
cd apps/fl-coordinator && FL_MODE=mock FL_CACHE_DIR=./fl_cache uvicorn main:app --port 8002 &
sleep 4
TID=$(curl -s -X POST localhost:8002/fl-test/run -H "Content-Type: application/json" \
  -d '{"strategy":"fedscrt","rounds":8}' | python -c "import sys,json;print(json.load(sys.stdin)['test_id'])")
sleep 2
curl -s localhost:8002/round/$TID/status
```
Expected: the POST returns `{"test_id":...,"status":"running",...}`; the status call shows `"status":"complete"` with an 8-entry `history` of real f1/auc. (Webhook posts to the backend 4xx if the backend is down — fine for this smoke.)

- [ ] **Step 3: Commit**

```bash
git add apps/fl-coordinator/main.py
git commit -m "feat(fl): POST /fl-test/run runs live numpy FedSCRT and streams per-round metrics"
```

---

### Task 4: Copy real FL experiment results into the backend

**Files:**
- Create: `apps/backend/src/fl/experiments/fl_fedavg_alpha0.5.json` (+ the other 5)

- [ ] **Step 1: Copy the real result files verbatim**

Run:
```bash
mkdir -p apps/backend/src/fl/experiments
cp "C:/Users/akaro/Documents/GitHub/federated-learning-model/results/"fl_*.json apps/backend/src/fl/experiments/
ls apps/backend/src/fl/experiments/
```
Expected: `fl_fedavg_alpha0.5.json fl_fedavg_alpha100.json fl_fedscrt_alpha0.5.json fl_momentum_alpha0.5.json fl_scaffold_alpha0.5.json fl_scaffold_alpha100.json`.

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/fl/experiments/
git commit -m "data(fl): real FL experiment results (FedAvg/Momentum/SCAFFOLD/FedSCRT, alpha 0.5/100)"
```

---

### Task 5: Backend `GET /researcher/fl-experiments`

**Files:**
- Modify: `apps/backend/src/researcher/researcher.service.ts`
- Modify: `apps/backend/src/researcher/researcher.controller.ts`

- [ ] **Step 1: Add the service method** (top of file: `import { readdirSync, readFileSync } from 'fs'; import { join } from 'path';`)

```typescript
getFlExperiments(): {
  strategy: string; alpha: number; rounds: number;
  history: { round: number; f1: number; auc: number; accuracy: number }[];
  final: { f1: number; auc: number; accuracy: number };
}[] {
  const dir = join(__dirname, 'fl', 'experiments');
  // __dirname resolves to dist at runtime; the json is copied next to source.
  // Fall back to the source path when running ts-node/tests.
  const candidates = [dir, join(process.cwd(), 'src', 'fl', 'experiments')];
  const base = candidates.find((d) => { try { return readdirSync(d).length >= 0; } catch { return false; } });
  if (!base) return [];
  return readdirSync(base)
    .filter((f) => f.startsWith('fl_') && f.endsWith('.json'))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(base, f), 'utf8'));
      return {
        strategy: j.strategy, alpha: j.alpha, rounds: j.rounds,
        history: j.history ?? [],
        final: { f1: j.final?.f1 ?? 0, auc: j.final?.auc ?? 0, accuracy: j.final?.accuracy ?? 0 },
      };
    });
}
```

> The experiments json must be present in `dist/fl/experiments` at runtime. Add to `apps/backend`'s build copy step (nest-cli `assets`) OR keep the `process.cwd()/src` fallback (works for `start:dev`/ts-node). For this plan the `src` fallback is sufficient; note it in the PR.

- [ ] **Step 2: Add the controller route**

```typescript
@Get('fl-experiments')
flExperiments() {
  return this.svc.getFlExperiments();
}
```

- [ ] **Step 3: Add the e2e test** (extend `apps/backend/test/researcher.e2e-spec.ts`)

```typescript
it('returns FL experiments for RESEARCHER (200)', async () => {
  const res = await request(app.getHttpServer())
    .get('/researcher/fl-experiments')
    .set('Authorization', `Bearer ${researcherToken}`)
    .expect(200);
  expect(Array.isArray(res.body)).toBe(true);
  if (res.body.length) expect(res.body[0]).toHaveProperty('strategy');
});

it('forbids DOCTOR from FL experiments (403)', async () => {
  await request(app.getHttpServer())
    .get('/researcher/fl-experiments')
    .set('Authorization', `Bearer ${doctorToken}`)
    .expect(403);
});
```

- [ ] **Step 4: Verify**

Run: `cd apps/backend && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json researcher --forceExit --runInBand`
Expected: tsc clean; researcher e2e passes (now including the 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/researcher/researcher.service.ts apps/backend/src/researcher/researcher.controller.ts apps/backend/test/researcher.e2e-spec.ts
git commit -m "feat(backend): GET /researcher/fl-experiments serves real FL results"
```

---

### Task 6: Backend live-test trigger + researcher WebSocket room

**Files:**
- Modify: `apps/backend/src/fl/fl.gateway.ts`
- Modify: `apps/backend/src/fl/fl.service.ts`
- Modify: the internal FL webhook controller (find via `grep -rn "internal/fl/round-complete" apps/backend/src`)
- Modify: `apps/backend/src/researcher/researcher.controller.ts` + `researcher.service.ts`

- [ ] **Step 1: Room + emit methods in `fl.gateway.ts`**

In `handleConnection`, replace the role branch so researchers get a room:

```typescript
if (payload.role === 'DOCTOR') {
  socket.join('doctors');
} else if (payload.role === 'RESEARCHER') {
  socket.join('researchers');
  this.logger.log(`Researcher ${payload.sub} joined room 'researchers'`);
}
```

Add emit methods:

```typescript
emitTestProgress(payload: {
  testId: string; strategy: string; round: number;
  f1: number; auc: number; accuracy: number; clientSizes: number[];
}): void {
  this.server.to('researchers').emit('fl:test:progress', payload);
}

emitTestComplete(payload: { testId: string; strategy: string; finalF1: number }): void {
  this.server.to('researchers').emit('fl:test:complete', payload);
}
```

- [ ] **Step 2: `handleTestProgress` + trigger in `fl.service.ts`**

```typescript
async handleTestProgress(body: any): Promise<void> {
  this.gateway.emitTestProgress({
    testId: body.test_id, strategy: body.strategy, round: body.round,
    f1: body.f1, auc: body.auc, accuracy: body.accuracy,
    clientSizes: body.client_sizes ?? [],
  });
  if (body.done) {
    this.gateway.emitTestComplete({ testId: body.test_id, strategy: body.strategy, finalF1: body.f1 });
  }
}

async runFlTest(strategy: string, rounds: number): Promise<any> {
  const resp = await firstValueFrom(
    this.httpService.post(`${this.flCoordinatorUrl}/fl-test/run`, { strategy, rounds }),
  );
  return resp.data; // { test_id, status, ... }
}
```

- [ ] **Step 3: Internal webhook route** (in the controller that already handles `/internal/fl/round-complete` + `/internal/fl/progress`)

```typescript
@Post('test-progress')
@HttpCode(202)
async testProgress(@Body() body: any) {
  await this.flService.handleTestProgress(body);
  return { ok: true };
}
```
(Match the existing `x-fl-secret` guard used by the other internal routes.)

- [ ] **Step 4: Researcher trigger endpoint** — `researcher.service.ts`:

```typescript
constructor(private prisma: PrismaService, private flService: FlService) {}
runFlTest(strategy = 'fedscrt', rounds = 10) {
  const s = strategy === 'fedavg' ? 'fedavg' : 'fedscrt';
  return this.flService.runFlTest(s, Math.min(Math.max(rounds, 1), 30));
}
```
(Ensure `FlService` is importable — `ResearcherModule` imports `FlModule` exporting `FlService`.) `researcher.controller.ts`:

```typescript
@Post('fl-test')
@HttpCode(202)
flTest(@Body() body: { strategy?: string; rounds?: number }) {
  return this.svc.runFlTest(body?.strategy, body?.rounds ?? 10);
}
```
(Add `Post, Body, HttpCode` to the `@nestjs/common` import.)

- [ ] **Step 5: Verify**

Run: `cd apps/backend && npx tsc --noEmit && npx jest --config ./test/jest-e2e.json researcher --forceExit --runInBand`
Expected: tsc clean; e2e green. Add an e2e: `POST /researcher/fl-test` returns 403 for DOCTOR, 202 for RESEARCHER (coordinator may be down → service still returns the trigger attempt; mock the http call or assert the 403/auth path only).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/fl apps/backend/src/researcher
git commit -m "feat(backend): live FL test trigger + researcher WS room (fl:test:progress)"
```

---

### Task 7: Web researcher-api additions

**Files:**
- Modify: `apps/web/lib/researcher-api.ts`

- [ ] **Step 1: Add types + functions**

```typescript
export interface FlExperiment {
  strategy: string;
  alpha: number;
  rounds: number;
  history: { round: number; f1: number; auc: number; accuracy: number }[];
  final: { f1: number; auc: number; accuracy: number };
}

export function getFlExperiments(): Promise<FlExperiment[]> {
  return apiFetch<FlExperiment[]>("/researcher/fl-experiments");
}

export function runFlTest(strategy: "fedscrt" | "fedavg", rounds: number): Promise<{ test_id: string; status: string }> {
  return apiFetch("/researcher/fl-test", {
    method: "POST",
    body: JSON.stringify({ strategy, rounds }),
  });
}
```

- [ ] **Step 2: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/researcher-api.ts
git commit -m "feat(web): researcher-api getFlExperiments + runFlTest"
```

---

### Task 8: Web "Federated Learning" researcher view

**Files:**
- Create: `apps/web/app/researcher/federated/page.tsx`
- Modify: `apps/web/app/researcher/layout.tsx` (add nav item)

- [ ] **Step 1: Add the nav item** in `layout.tsx`

Find the researcher nav array (items like Model Performance, Network Topology, Datasets, System Logs) and add, before Datasets:

```tsx
{ href: "/researcher/federated", label: "Federated Learning" },
```
(Match the existing item shape exactly — inspect the array first.)

- [ ] **Step 2: Write the page** (`app/researcher/federated/page.tsx`)

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { io, Socket } from "socket.io-client";
import { usePortalTitle } from "@/lib/use-portal-title";
import { getFlExperiments, runFlTest, type FlExperiment } from "@/lib/researcher-api";
import { API_URL } from "@/lib/api";

const STRAT_COLOR: Record<string, string> = {
  fedavg: "#60a5fa", momentum: "#f59e0b", scaffold: "#a78bfa", fedscrt: "#2dd4bf",
};

export default function FederatedPage() {
  usePortalTitle("Federated Learning");
  const [exps, setExps] = useState<FlExperiment[]>([]);
  const [alpha, setAlpha] = useState<number>(0.5);
  const [live, setLive] = useState<{ round: number; f1: number }[]>([]);
  const [running, setRunning] = useState(false);
  const [liveStrategy, setLiveStrategy] = useState<"fedscrt" | "fedavg">("fedscrt");

  useEffect(() => { getFlExperiments().then(setExps).catch(() => setExps([])); }, []);

  // Live WS subscription for the test run
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
    const socket: Socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
    socket.on("fl:test:progress", (p: any) => {
      setLive((prev) => [...prev, { round: p.round, f1: Number(p.f1.toFixed(4)) }]);
    });
    socket.on("fl:test:complete", () => setRunning(false));
    return () => { socket.disconnect(); };
  }, []);

  const curves = useMemo(() => {
    const byAlpha = exps.filter((e) => e.alpha === alpha);
    const maxR = Math.max(1, ...byAlpha.map((e) => e.rounds));
    const rows: any[] = [];
    for (let r = 1; r <= maxR; r++) {
      const row: any = { round: r };
      byAlpha.forEach((e) => {
        const pt = e.history.find((h) => h.round === r);
        if (pt) row[e.strategy] = Number(pt.f1.toFixed(4));
      });
      rows.push(row);
    }
    return { rows, strategies: byAlpha.map((e) => e.strategy) };
  }, [exps, alpha]);

  async function startTest() {
    setLive([]); setRunning(true);
    try { await runFlTest(liveStrategy, 10); } catch { setRunning(false); }
  }

  return (
    <div className="space-y-4">
      {/* Objective card */}
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--text-secondary)" }}>Optimization objective</div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
          Minimize the federated objective <code>F(w) = Σₖ (nₖ/n)·Fₖ(w)</code> across 3 hospital
          clients, where each local objective <code>Fₖ(w)</code> is the class-balanced cross-entropy
          on that hospital&apos;s data. Aggregation: FedAvg (weighted by nₖ); SCAFFOLD corrects client
          drift via control variates; <strong>FedSCRT</strong> freezes the backbone and federates a
          retrained classifier head. Metric: macro-F1 (binary Luminal vs Non-Luminal).
        </p>
        <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
          Goal: under non-IID data (Dirichlet α=0.5), approach centralized performance without sharing
          raw data. Raw bytes transmitted: <span style={{ color: "var(--teal)" }}>0</span>.
        </p>
      </div>

      {/* Real convergence */}
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Real convergence (per-round macro-F1)</div>
          <div className="flex gap-1 text-xs">
            {[0.5, 100].map((a) => (
              <button key={a} onClick={() => setAlpha(a)}
                className="px-2.5 py-1 rounded-lg"
                style={{ background: alpha === a ? "var(--teal-glow)" : "var(--bg-card2)", color: alpha === a ? "var(--teal)" : "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {a === 0.5 ? "Non-IID (α=0.5)" : "Near-IID (α=100)"}
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={curves.rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="round" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis domain={[0, 1]} stroke="var(--text-secondary)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }} />
              <Legend />
              {curves.strategies.map((s) => (
                <Line key={s} type="monotone" dataKey={s} stroke={STRAT_COLOR[s] ?? "#888"} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-xs mt-3">
          <thead><tr style={{ color: "var(--text-secondary)" }}><th className="text-left">Strategy</th><th className="text-right">Final F1</th><th className="text-right">AUC</th></tr></thead>
          <tbody>
            {exps.filter((e) => e.alpha === alpha).map((e) => (
              <tr key={e.strategy} style={{ color: "var(--text-primary)" }}>
                <td className="py-1">{e.strategy}</td>
                <td className="text-right tabular-nums">{e.final.f1.toFixed(3)}</td>
                <td className="text-right tabular-nums">{e.final.auc.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Live FL test */}
      <div className="rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Run a live federated test</div>
          <div className="flex items-center gap-2 text-xs">
            <select value={liveStrategy} onChange={(e) => setLiveStrategy(e.target.value as any)}
              className="rounded-lg px-2 py-1" style={{ background: "var(--bg-card2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              <option value="fedscrt">FedSCRT</option>
              <option value="fedavg">FedAvg</option>
            </select>
            <button onClick={startTest} disabled={running}
              className="px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: "var(--teal-glow)", color: "var(--teal)", border: "1px solid #2dd4bf40" }}>
              {running ? "Training…" : "Run FL test"}
            </button>
          </div>
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
          Each of the 3 hospitals trains a classifier head on its own local features; the server
          aggregates the heads. Only head weights move — <span style={{ color: "var(--teal)" }}>0 bytes of raw data</span>.
        </p>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <LineChart data={live}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="round" stroke="var(--text-secondary)" fontSize={11} />
              <YAxis domain={[0, 1]} stroke="var(--text-secondary)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--bg-card2)", border: "1px solid var(--border)" }} />
              <Line type="monotone" dataKey="f1" stroke="var(--teal)" dot strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

> Check `socket.io-client` is a web dependency (the doctor FL store already uses it — confirm the import path/version). If `API_URL` is not exported from `lib/api`, it is (see `export const API_URL = API`).

- [ ] **Step 3: Verify**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/researcher/federated/page.tsx apps/web/app/researcher/layout.tsx
git commit -m "feat(web): researcher Federated Learning view (objective + real convergence + live test)"
```

---

### Task 9: State the objective in CONTEXT.md + ADR

**Files:**
- Modify: `CONTEXT.md`
- Create: `docs/adr/ADR-004-fl-optimization-objective.md`

- [ ] **Step 1: Add an "Optimization objective" section to `CONTEXT.md`** (after the "Core concept" section)

```markdown
## Optimization objective (federated)

The federated training minimizes the global objective

    F(w) = Σ_k (n_k / n) · F_k(w)      (K = 3 hospital clients, n = Σ n_k)

where each local objective F_k(w) = (1/n_k) Σ_i ℓ(f_w(x_i), y_i) and ℓ is
class-balanced cross-entropy (per-class weight ∝ inverse frequency). Task: binary
Luminal vs Non-Luminal. Aggregation: FedAvg (weighted by n_k); Momentum (server
momentum); SCAFFOLD (control variates correct client drift); FedSCRT (freeze
backbone, federate a retrained head). Metric: macro-F1 (primary), AUC, accuracy.
Goal: under non-IID data (Dirichlet α=0.5), approach centralized performance
without sharing raw data — only weight updates move (rawDataTransmitted = 0).
```

- [ ] **Step 2: Write the ADR** (`docs/adr/ADR-004-fl-optimization-objective.md`)

```markdown
# ADR-004: Federated optimization objective + live FL test

## Status
Accepted (2026-06-02)

## Context
The supervisor requires the app to (a) implement a federated-learning test model
and (b) specify the optimization objective. Full re-training is ~12 h/run on GPU.

## Decision
- State the global objective F(w)=Σ (n_k/n)·F_k(w) with class-balanced CE locals,
  the four aggregation rules (FedAvg/Momentum/SCAFFOLD/FedSCRT), and macro-F1 as
  the metric, surfaced in the researcher portal + CONTEXT.md.
- Surface the real offline experiment results (no fabricated FL numbers).
- Provide a live FL test that runs the genuinely-federated head aggregation in
  seconds over cached frozen-backbone features (numpy, no GPU). The federated step
  is real; the expensive backbone feature extraction is precomputed offline.

## Consequences
- Honest, reproducible FL demonstration without GPU at click time.
- The live numpy head optimizes the same class-balanced CE objective as the
  training code's nn.Linear+Adam head; the demonstrated quantity is aggregation.
- rawDataTransmitted stays 0 (only head weights move).
```

- [ ] **Step 3: Commit**

```bash
git add CONTEXT.md docs/adr/ADR-004-fl-optimization-objective.md
git commit -m "docs(fl): state the federated optimization objective (CONTEXT + ADR-004)"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Bring up the stack**

```bash
docker compose up -d postgres redis
npm run dev                                   # backend :3001
( cd apps/web && npm run dev )                # web :3000
( cd apps/fl-coordinator && FL_MODE=mock FL_CACHE_DIR=./fl_cache \
    BACKEND_URL=http://localhost:3001 FL_WEBHOOK_SECRET=<same-as-backend> \
    uvicorn main:app --port 8002 )            # coordinator (numpy synthetic cache ok)
```

- [ ] **Step 2: Drive it (browse, logged in as `researcher@fedmri.local` / `research1234`)**

- `/researcher/federated`: the Objective card renders; the real convergence chart shows the
  4 strategies; the α toggle switches non-IID/near-IID; the final-metrics table matches the json.
- Click **Run FL test** (FedSCRT): the live chart fills round-by-round with real F1 values;
  completes in seconds; console clean.

- [ ] **Step 3: Regression**

Run: `cd apps/backend && npx jest --config ./test/jest-e2e.json --forceExit --runInBand` (all green),
`cd apps/web && npx tsc --noEmit` (clean), `cd apps/fl-coordinator && python -m pytest -q` (green).
Doctor/patient portals load; `rawDataTransmitted` still 0.

- [ ] **Step 4: Final note**

When the real feature cache is built (`conda run -n mri_thesis python apps/fl-coordinator/fl_feature_cache.py`),
copy `fl_cache/` over the synthetic one and restart the coordinator — the live test then runs on
real hospital features with no code change.

---

## Self-review notes

- **Spec coverage:** objective stated (Tasks 8,9); real results surfaced (Tasks 4,5,8); live FedSCRT test (Tasks 1,2,3,6,8); architecture A (coordinator numpy + cached features, Tasks 1–3); researcher WS room fix (Task 6); honesty/invariants — only head weights move, rawDataTransmitted 0 (Tasks 3,6,9).
- **Stand-in:** Task 2 synthetic cache unblocks the live test before the real cache exists (spec Risk R2), mirroring the FedSCRT stub→final pattern.
- **Faithfulness (Risk R3):** numpy head = same class-balanced CE objective as nn.Linear+Adam; documented in the Objective card + ADR.
- **Type consistency:** the streamed contract `{test_id, strategy, round, f1, auc, accuracy, client_sizes, done}` is identical across coordinator (Task 3), backend webhook + gateway (Task 6), and the web WS handler (Task 8). `FlExperiment` shape identical across backend (Task 5) and web (Tasks 7,8).
- **Known follow-up flagged in PR:** ensure `dist/fl/experiments` is populated at backend build (nest-cli `assets`) or rely on the `src` fallback (Task 5 note).
```
