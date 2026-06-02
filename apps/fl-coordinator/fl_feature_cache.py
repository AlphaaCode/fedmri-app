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
        X = rng.normal(c * 0.6, 1.0, (n, d))
        y = np.full(n, c)
        return X, y

    for k, n in enumerate([60, 120, 90]):           # 3 clients, non-IID-ish sizes
        n0 = int(n * (0.7 if k == 0 else 0.4))       # skewed class balance per client
        X = np.vstack([blob(n0, 0)[0], blob(n - n0, 1)[0]])
        y = np.concatenate([np.zeros(n0), np.ones(n - n0)]).astype(int)
        _save(f"client_{k}.npz", X, y)
    Xv = np.vstack([blob(40, 0)[0], blob(40, 1)[0]])
    yv = np.array([0] * 40 + [1] * 40)
    _save("val.npz", Xv, yv)
    print("wrote synthetic caches to", OUT)


def build_real():
    V2 = os.environ["MODEL_V2_PATH"]
    sys.path.insert(0, V2)
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
    labels = [s[1] for s in samples]
    groups = [s[2] for s in samples]
    skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    tr_s = va_s = None
    for fi, (tr, va) in enumerate(skf.split(range(len(samples)), labels, groups)):
        if fi == 0:
            tr_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
            va_s = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va]
            break
    random.seed(42)
    sh = tr_s.copy()
    random.shuffle(sh)
    client_samples = [sh[:80], sh[80:363], sh[363:]]   # 3 hospitals (save_fedscrt_model split)

    model = build_model("convnext_mil", device)
    ck = torch.load(os.environ["FEDSCRT_CKPT"], map_location=device, weights_only=False)
    model.load_state_dict(ck["model_state"], strict=False)
    model.eval()

    def extract(sample_list):
        ds = MRI25DSliceDataset(sample_list, augment=False, slice_size=224)
        loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)
        store, feats, labs = {}, [], []
        h = model.head.register_forward_hook(lambda m, i, o: store.update({"f": i[0].detach().cpu()}))
        with torch.no_grad():
            for x, y in loader:
                _ = model(x.to(device))
                feats.append(store["f"])
                labs.extend(y.numpy())
        h.remove()
        return torch.cat(feats).numpy(), np.array(labs)

    for k, s in enumerate(client_samples):
        X, y = extract(s)
        _save(f"client_{k}.npz", X, y)
        print(f"client_{k}: X={X.shape} classes={np.bincount(y, minlength=2).tolist()}")
    Xv, yv = extract(va_s)
    _save("val.npz", Xv, yv)
    print(f"val: X={Xv.shape} classes={np.bincount(yv, minlength=2).tolist()} -> {OUT}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--synthetic", action="store_true")
    args = p.parse_args()
    build_synthetic() if args.synthetic else build_real()
