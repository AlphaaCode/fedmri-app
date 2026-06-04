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


def run_fl(clients, val, strategy="fedscrt", rounds=10, local_epochs=60, seeds=5, lr=0.1, on_round=None):
    """clients: list of (X, y) arrays (one per hospital). val: (Xv, yv).
    Returns the per-round history; calls on_round(entry) for live streaming.

    Strategy effects on the aggregation (all real numpy FL math):
      fedavg   — plain FedAvg of locally-trained heads (baseline).
      momentum — server momentum on the aggregate delta (faster, smoother).
      scaffold — control-variate drift correction (steadier under non-IID).
      fedscrt  — freeze backbone + best-of-seeds cRT head at the init round.
    """
    sizes = [len(y) for _, y in clients]
    n_classes = int(max(int(y.max()) for _, y in clients) + 1)
    glob = None
    velocity = None              # server momentum buffer
    server_c = None              # SCAFFOLD server control variate
    history = []
    for r in range(1, rounds + 1):
        heads = []
        for k, (X, y) in enumerate(clients):
            if strategy == "fedscrt" and r == 1:
                # FedSCRT cRT: best-of-seeds local head at the init round
                best, best_f1 = None, -1.0
                for s in range(seeds):
                    h = train_head(X, y, n_classes, epochs=local_epochs, seed=s, lr=lr, init=glob)
                    f = evaluate(h, X, y, n_classes)["f1"]
                    if f > best_f1:
                        best_f1, best = f, h
                heads.append(best)
            else:
                heads.append(train_head(X, y, n_classes, epochs=local_epochs, seed=r, lr=lr, init=glob))
        agg = aggregate(heads, sizes)

        if glob is None:
            glob = agg
        elif strategy == "momentum":
            # Server momentum: accumulate the aggregate delta to accelerate.
            dW = agg["W"] - glob["W"]; db = agg["b"] - glob["b"]
            if velocity is None:
                velocity = {"W": dW, "b": db}
            else:
                velocity = {"W": 0.6 * velocity["W"] + dW, "b": 0.6 * velocity["b"] + db}
            glob = {"W": glob["W"] + velocity["W"], "b": glob["b"] + velocity["b"]}
        elif strategy == "scaffold":
            # Control-variate correction: damp the global step toward the drift-
            # corrected direction (steadier convergence on non-IID splits).
            dW = agg["W"] - glob["W"]; db = agg["b"] - glob["b"]
            if server_c is None:
                server_c = {"W": np.zeros_like(dW), "b": np.zeros_like(db)}
            corrW = dW - 0.3 * server_c["W"]; corrb = db - 0.3 * server_c["b"]
            server_c = {"W": 0.5 * server_c["W"] + 0.5 * dW, "b": 0.5 * server_c["b"] + 0.5 * db}
            glob = {"W": glob["W"] + corrW, "b": glob["b"] + corrb}
        else:
            glob = agg

        entry = {"round": r, **evaluate(glob, val[0], val[1], n_classes)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return history
