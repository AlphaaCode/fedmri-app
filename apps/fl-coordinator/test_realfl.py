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
