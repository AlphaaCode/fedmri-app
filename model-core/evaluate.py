"""
evaluate.py
===========
Post-training evaluation with TTA, fold ensembling, bootstrap confidence
intervals, and calibration metrics for breast MRI subtype classification.

WARNING: This script is designed for ENSEMBLE evaluation across ALL 5 fold
checkpoints.  For single-checkpoint evaluation (e.g. fold 0 only), use
Eval_binary_fold0.py instead.  Running this script with a single checkpoint
will evaluate only on the validation samples of that fold (~20% of the dataset)
and report correct metrics, but the result is not comparable to full CV results.

Pipeline position:
    main.py (all 5 fold checkpoints) → THIS MODULE → results/ (metrics + figures)

Usage:
    # Full 5-fold ensemble (recommended):
    python evaluate.py --ensemble "checkpoints/best_fold*.pt"

    # Single fold (use Eval_binary_fold0.py instead for cleaner output):
    python evaluate.py --ckpt checkpoints/fold0_stage2_best_crt.pt

Output figures (saved to results/):
    confusion_matrix.png   — normalised confusion matrix heatmap
    per_class_metrics.png  — bar chart of precision / recall / F1 per class
    reliability.png        — calibration reliability diagram
    roc_curves.png         — one-vs-rest ROC curves with AUC

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
import argparse
import glob
import json
from pathlib import Path
from typing import List, Tuple

import matplotlib
matplotlib.use("Agg")   # headless rendering — no display required
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from sklearn.metrics import (
    confusion_matrix, classification_report, roc_auc_score,
    average_precision_score, f1_score, balanced_accuracy_score,
    precision_recall_fscore_support,
)
from sklearn.preprocessing import label_binarize

from config import CFG, CLASS_NAMES
from data_loader import MRI25DSliceDataset, load_samples


def _safe_import_plot():
    """Import matplotlib.pyplot with graceful fallback if unavailable."""
    try:
        import matplotlib.pyplot as plt
        return plt
    except Exception:
        return None


def _build_model(arch: str):
    """
    Instantiate a model for evaluation from an architecture string.

    Args:
        arch (str): Architecture name — one of 'dinov2_mil', 'convnext_mil',
            'r3d18', or 'fallback_convnext'.

    Returns:
        nn.Module: Uninitialised model (weights loaded separately).

    Raises:
        ValueError: If arch is not a recognised architecture name.
    """
    from model import ConvNeXtMILClassifier, Dinov2MILClassifier, R3D18Classifier
    if arch == "dinov2_mil":
        return Dinov2MILClassifier(
            num_classes=CFG.model.num_classes,
            lora_rank=CFG.model.lora_rank,
            freeze_backbone=True,
            proj_dim=CFG.model.proj_dim,
            attn_dim=CFG.model.attn_dim,
        )
    if arch == "convnext_mil":
        return ConvNeXtMILClassifier(
            num_classes=CFG.model.num_classes,
            proj_dim=CFG.model.proj_dim,
            attn_dim=CFG.model.attn_dim,
            dropout=CFG.s2.dropout,
            drop_path=CFG.s2.drop_path,
        )
    if arch == "r3d18":
        return R3D18Classifier(num_classes=CFG.model.num_classes)
    if arch == "fallback_convnext":
        return Dinov2MILClassifier(
            num_classes=CFG.model.num_classes,
            lora_rank=0, freeze_backbone=True, fallback=True,
        )
    raise ValueError(f"Unknown architecture: {arch}")


def _slice_tta_views(slices: torch.Tensor):
    """
    Generate 4 test-time augmentation views by flipping the slice tensor.

    Views: identity, horizontal flip, vertical flip, slice-axis flip.

    Args:
        slices (torch.Tensor): Shape (B, D, 3, H, W).

    Yields:
        torch.Tensor: Each of the 4 augmented views, same shape as input.
    """
    yield slices                             # view 0: identity
    yield torch.flip(slices, dims=[-1])      # view 1: horizontal flip
    yield torch.flip(slices, dims=[-2])      # view 2: vertical flip
    yield torch.flip(slices, dims=[-3])      # view 3: slice-axis flip


def _extract_state_dict(ckpt) -> dict:
    """
    Extract the model state dict from a checkpoint, handling multiple key conventions.

    Supports checkpoints saved with keys 'model_state', 'state_dict',
    or 'model_state_dict', as well as raw state dicts (no nesting).

    Args:
        ckpt: Loaded checkpoint (dict or raw state dict).

    Returns:
        dict: Model state dict.
    """
    if isinstance(ckpt, dict):
        for key in ("model_state", "state_dict", "model_state_dict"):
            if key in ckpt:
                return ckpt[key]
    return ckpt


@torch.no_grad()
def predict_tta(
    model,
    loader: DataLoader,
    device: torch.device,
    n_views: int = 4,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Run TTA inference and return averaged class probabilities.

    For each batch, applies up to ``n_views`` augmentation views and
    averages the softmax probabilities.

    Args:
        model: Evaluated model (in eval mode).
        loader (DataLoader): Evaluation DataLoader (no augmentation).
        device (torch.device): Compute device.
        n_views (int): Number of TTA views to average. Default 4.

    Returns:
        Tuple[np.ndarray, np.ndarray]:
            probs  — (N, num_classes): averaged class probabilities.
            labels — (N,): ground-truth class indices.
    """
    model.eval()
    all_probs, all_y = [], []

    for x, y in loader:
        x          = x.to(device, non_blocking=True)
        probs_acc  = None
        count      = 0

        for view in _slice_tta_views(x):
            if count >= n_views:
                break
            p         = F.softmax(model(view), dim=-1)   # (B, C)
            probs_acc = p if probs_acc is None else probs_acc + p
            count    += 1

        probs_acc = probs_acc / count   # average over views
        all_probs.append(probs_acc.cpu().numpy())
        all_y.append(y.numpy())

    return np.concatenate(all_probs), np.concatenate(all_y)


def bootstrap_f1(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    n_boot: int = 1000,
    seed: int = 0,
) -> Tuple[float, float, float]:
    """
    Compute macro F1 with 95% bootstrap confidence interval.

    Resamples with replacement ``n_boot`` times and returns the mean and
    2.5th / 97.5th percentiles.

    Args:
        y_true (np.ndarray): Ground-truth labels, shape (N,).
        y_pred (np.ndarray): Predicted labels, shape (N,).
        n_boot (int): Number of bootstrap resamples. Default 1000.
        seed (int): Random seed for reproducibility.

    Returns:
        Tuple[float, float, float]: (mean_f1, ci_lower_2.5%, ci_upper_97.5%).
    """
    rng = np.random.default_rng(seed)
    n   = len(y_true)
    f1s = []
    for _ in range(n_boot):
        idx = rng.integers(0, n, size=n)
        f1s.append(f1_score(y_true[idx], y_pred[idx], average="macro", zero_division=0))
    f1s = np.array(f1s)
    return float(np.mean(f1s)), float(np.percentile(f1s, 2.5)), float(np.percentile(f1s, 97.5))


def brier_multiclass(
    probs: np.ndarray,
    y: np.ndarray,
    num_classes: int,
) -> float:
    """
    Compute multiclass Brier score (mean squared error in probability space).

    Brier = (1/N) Σ_i Σ_c (p_{i,c} - y_{i,c})^2
    where y_{i,c} is the one-hot encoding.  Lower is better (0 = perfect).

    Args:
        probs (np.ndarray): Predicted probabilities, shape (N, num_classes).
        y (np.ndarray): Integer labels, shape (N,).
        num_classes (int): Number of classes.

    Returns:
        float: Mean Brier score.
    """
    oh    = np.eye(num_classes)[y]                    # one-hot: (N, C)
    return float(np.mean(np.sum((probs - oh) ** 2, axis=1)))


def plot_confusion(cm: np.ndarray, path: Path, class_names: list) -> None:
    """
    Save a normalised confusion matrix heatmap to disk.

    Args:
        cm (np.ndarray): Integer confusion matrix, shape (C, C).
        path (Path): Output file path (.png).
        class_names (list): Class name strings for axis labels.
    """
    plt = _safe_import_plot()
    if plt is None:
        return
    cm_norm = cm.astype(float) / np.maximum(cm.sum(axis=1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(6, 5))
    im      = ax.imshow(cm_norm, cmap="Blues", vmin=0, vmax=1)
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, f"{cm_norm[i,j]:.2f}",
                    ha="center", va="center", fontsize=9,
                    color="white" if cm_norm[i, j] > 0.5 else "black")
    ax.set_xticks(range(len(class_names)))
    ax.set_yticks(range(len(class_names)))
    ax.set_xticklabels(class_names, rotation=30, ha="right")
    ax.set_yticklabels(class_names)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def plot_per_class(
    y_true: np.ndarray, y_pred: np.ndarray,
    path: Path, class_names: list,
) -> None:
    """
    Save a bar chart of per-class precision, recall, and F1.

    Args:
        y_true (np.ndarray): Ground-truth labels.
        y_pred (np.ndarray): Predicted labels.
        path (Path): Output file path (.png).
        class_names (list): Class name strings.
    """
    plt = _safe_import_plot()
    if plt is None:
        return
    p, r, f1, _ = precision_recall_fscore_support(
        y_true, y_pred,
        labels=list(range(len(class_names))), zero_division=0,
    )
    x = np.arange(len(class_names))
    w = 0.25
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(x - w, p, w, label="Precision")
    ax.bar(x,     r, w, label="Recall")
    ax.bar(x + w, f1, w, label="F1")
    ax.set_xticks(x)
    ax.set_xticklabels(class_names, rotation=30, ha="right")
    ax.set_ylim(0, 1)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def plot_reliability(
    probs: np.ndarray, y: np.ndarray,
    path: Path, num_classes: int, n_bins: int = 10,
) -> None:
    """
    Save a reliability (calibration) diagram to disk.

    Plots mean predicted confidence vs actual accuracy in n_bins confidence bins.
    A well-calibrated model follows the diagonal.

    Args:
        probs (np.ndarray): Predicted probabilities, shape (N, C).
        y (np.ndarray): True integer labels, shape (N,).
        path (Path): Output file path (.png).
        num_classes (int): Number of classes.
        n_bins (int): Number of confidence bins. Default 10.
    """
    plt = _safe_import_plot()
    if plt is None:
        return
    conf    = probs.max(axis=1)                    # confidence = max class prob
    pred    = probs.argmax(axis=1)
    correct = (pred == y).astype(float)
    bins    = np.linspace(0, 1, n_bins + 1)
    xs, ys  = [], []
    for i in range(n_bins):
        m = (conf >= bins[i]) & (conf < bins[i + 1])
        if m.sum() > 0:
            xs.append(conf[m].mean())
            ys.append(correct[m].mean())
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.plot([0, 1], [0, 1], "k--", label="Perfect calibration")
    ax.plot(xs, ys, "o-", label="Model")
    ax.set_xlabel("Confidence")
    ax.set_ylabel("Accuracy")
    ax.set_title("Reliability diagram")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def plot_roc_curves(
    probs: np.ndarray, y: np.ndarray,
    path, class_names: list, num_classes: int,
) -> None:
    """
    Save one-vs-rest ROC curves for all classes.

    For binary classification (num_classes=2) uses P(class 1) directly.
    For multiclass uses label_binarize and plots one curve per class.

    Args:
        probs (np.ndarray): Predicted probabilities, shape (N, C).
        y (np.ndarray): True integer labels, shape (N,).
        path: Output file path (.png).
        class_names (list): Class name strings.
        num_classes (int): Number of classes.
    """
    plt = _safe_import_plot()
    if plt is None:
        return
    from sklearn.metrics import roc_curve
    from sklearn.preprocessing import label_binarize
    colors = ["#4472C4", "#ED7D31", "#A9D18E", "#FF0000"]
    fig, ax = plt.subplots(figsize=(7, 6))

    if num_classes == 2:
        # Binary: use P(Non-Luminal) directly (sklearn returns (n,1) for binary binarize)
        fpr, tpr, _ = roc_curve(y, probs[:, 1])
        auc_val     = roc_auc_score(y, probs[:, 1])
        ax.plot(fpr, tpr, color=colors[0], lw=2,
                label=f"{class_names[1]} vs {class_names[0]} (AUC = {auc_val:.3f})")
    else:
        y_bin = label_binarize(y, classes=list(range(num_classes)))
        for i, (name, color) in enumerate(zip(class_names, colors)):
            fpr, tpr, _ = roc_curve(y_bin[:, i], probs[:, i])
            auc_val     = roc_auc_score(y_bin[:, i], probs[:, i])
            ax.plot(fpr, tpr, color=color, lw=2,
                    label=f"{name} (AUC = {auc_val:.3f})")

    ax.plot([0, 1], [0, 1], "k--", lw=1)
    ax.set_xlabel("False Positive Rate")
    ax.set_ylabel("True Positive Rate")
    title = (
        "ROC Curve — Binary Classification (fold~0)"
        if num_classes == 2
        else "One-vs-Rest ROC Curves — 5-fold Ensemble"
    )
    ax.set_title(title)
    ax.legend(loc="lower right")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1.02)
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def evaluate_ensemble(
    ckpt_paths: List[str],
    json_path: str,
    root_dir: str,
    device: torch.device,
    n_views: int = 4,
    arch: str = None,
) -> dict:
    """
    Evaluate an ensemble of fold checkpoints and return aggregated metrics.

    Builds out-of-fold (OOF) predictions: each validation sample is predicted
    by the checkpoint trained on the complementary folds.  Concatenating OOF
    predictions across all 5 folds gives an unbiased estimate of test performance
    for all 737 samples.

    Args:
        ckpt_paths (List[str]): Sorted list of checkpoint paths (one per fold).
        json_path (str): Path to dataset.json.
        root_dir (str): Root directory for .mha files.
        device (torch.device): Compute device.
        n_views (int): Number of TTA views. Default 4.
        arch (str): Architecture override. If None, reads from checkpoint metadata.

    Returns:
        dict: Metrics dictionary with keys: macro_f1, balanced_accuracy,
            auc_ovr_macro, brier, bootstrap_f1_mean, bootstrap_f1_ci95,
            confusion_matrix, report, n_folds.
    """
    samples = load_samples(json_path, root_dir)
    y_all   = np.array([s[1] for s in samples])

    from sklearn.model_selection import StratifiedGroupKFold
    g   = np.array([s[2] for s in samples])
    skf = StratifiedGroupKFold(n_splits=CFG.n_splits, shuffle=True,
                               random_state=CFG.seed)

    # Accumulate OOF predictions
    probs_oof = np.zeros((len(samples), CFG.model.num_classes), dtype=np.float64)
    filled    = np.zeros(len(samples), dtype=bool)

    ckpt_paths = sorted(ckpt_paths)
    folds      = list(skf.split(np.zeros(len(y_all)), y_all, g))

    for fi, ckpt in enumerate(ckpt_paths):
        if fi >= len(folds):
            break
        _, va_idx   = folds[fi]
        val_samples = [samples[i] for i in va_idx]
        ds          = MRI25DSliceDataset(
            val_samples, augment=False, return_two_views=False,
            slice_size=CFG.model.slice_size,
        )
        loader    = DataLoader(ds, batch_size=2, shuffle=False, pin_memory=True)
        sd        = torch.load(ckpt, map_location=device)
        fold_arch = arch or (sd.get("arch") if isinstance(sd, dict) else None) or CFG.model.arch
        model     = _build_model(fold_arch).to(device)
        model.load_state_dict(_extract_state_dict(sd), strict=False)
        probs, y  = predict_tta(model, loader, device, n_views=n_views)
        probs_oof[va_idx] = probs
        filled[va_idx]    = True
        print(f"[EVAL] fold {fi} from {ckpt} -> {probs.shape[0]} samples")

    if not filled.all():
        n_missing = (~filled).sum()
        print(f"[INFO] Single-fold evaluation: {n_missing} training samples "
              f"excluded. Evaluating on {filled.sum()} validation samples only.")
        y_all     = y_all[filled]
        probs_oof = probs_oof[filled]

    # Remap 4-class labels to binary if running in binary mode
    # Luminal A(0)+B(1) → 0, HER2(2)+TN(3) → 1
    if CFG.model.num_classes == 2:
        y_all = np.where(y_all <= 1, 0, 1)

    y_pred = probs_oof.argmax(axis=1)

    # ── Compute Metrics ───────────────────────────────────────────────────────
    macro_f1      = f1_score(y_all, y_pred, average="macro", zero_division=0)
    bal_acc       = balanced_accuracy_score(y_all, y_pred)
    mean_f1, lo, hi = bootstrap_f1(y_all, y_pred, n_boot=1000, seed=0)
    cm            = confusion_matrix(y_all, y_pred,
                                     labels=list(range(CFG.model.num_classes)))

    try:
        if CFG.model.num_classes == 2:
            auc_ovr = roc_auc_score(y_all, probs_oof[:, 1])
        else:
            auc_ovr = roc_auc_score(
                label_binarize(y_all, classes=list(range(CFG.model.num_classes))),
                probs_oof, average="macro", multi_class="ovr",
            )
    except Exception:
        auc_ovr = float("nan")

    brier = brier_multiclass(probs_oof, y_all, CFG.model.num_classes)

    # ── Generate Figures ──────────────────────────────────────────────────────
    out_dir = Path(CFG.results_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    names   = (
        ["Luminal", "Non-Luminal"]
        if CFG.model.num_classes == 2
        else list(CLASS_NAMES)[:CFG.model.num_classes]
    )
    plot_confusion(cm, out_dir / "confusion_matrix.png", names)
    plot_per_class(y_all, y_pred, out_dir / "per_class_metrics.png", names)
    plot_reliability(probs_oof, y_all, out_dir / "reliability.png",
                     num_classes=CFG.model.num_classes)
    plot_roc_curves(probs_oof, y_all, out_dir / "roc_curves.png",
                    names, CFG.model.num_classes)

    report_text = classification_report(y_all, y_pred, target_names=names, zero_division=0)

    metrics = {
        "macro_f1":           float(macro_f1),
        "balanced_accuracy":  float(bal_acc),
        "auc_ovr_macro":      float(auc_ovr) if auc_ovr == auc_ovr else None,
        "brier":              brier,
        "bootstrap_f1_mean":  mean_f1,
        "bootstrap_f1_ci95":  [lo, hi],
        "confusion_matrix":   cm.tolist(),
        "report":             report_text,
        "n_folds":            len(ckpt_paths),
    }
    with open(out_dir / "ensemble_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)

    print(json.dumps(
        {k: v for k, v in metrics.items()
         if k not in ("confusion_matrix", "report")},
        indent=2,
    ))
    print(report_text)
    return metrics


def main() -> None:
    """Parse arguments and run ensemble or single-checkpoint evaluation."""
    ap = argparse.ArgumentParser(
        description="Post-training evaluation with TTA and bootstrap CIs"
    )
    ap.add_argument("--ensemble", type=str, default=None,
                    help="Glob pattern for fold checkpoints, e.g. 'checkpoints/best_fold*.pt'")
    ap.add_argument("--ckpt",     type=str, default=None,
                    help="Single checkpoint path")
    ap.add_argument("--json",     type=str, default=CFG.data_json)
    ap.add_argument("--root",     type=str, default=CFG.data_root)
    ap.add_argument("--n-views",  type=int, default=4,
                    help="Number of TTA views (default: 4)")
    ap.add_argument("--arch",     type=str, default=None,
                    help="Architecture override: convnext_mil, dinov2_mil, r3d18")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if args.ensemble:
        paths = sorted(glob.glob(args.ensemble))
        if not paths:
            raise SystemExit(f"No checkpoints match: {args.ensemble}")
        evaluate_ensemble(paths, args.json, args.root, device,
                          n_views=args.n_views, arch=args.arch)
    elif args.ckpt:
        evaluate_ensemble([args.ckpt], args.json, args.root, device,
                          n_views=args.n_views, arch=args.arch)
    else:
        default = sorted(glob.glob(str(Path(CFG.ckpt_dir) / "best_fold*.pt")))
        if not default:
            raise SystemExit("No checkpoints found; pass --ckpt or --ensemble")
        evaluate_ensemble(default, args.json, args.root, device,
                          n_views=args.n_views, arch=args.arch)


if __name__ == "__main__":
    main()
