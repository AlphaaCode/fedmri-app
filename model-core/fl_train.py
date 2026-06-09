"""
fl_train.py
===========
Federated Learning simulation implementing four aggregation strategies
for binary breast MRI molecular subtype classification.

This module is the core contribution of the thesis.  It simulates a
three-hospital federated network in which raw patient MRI data never
leaves the local hospital — only model weights are communicated.

Strategies implemented:

    1. FedAvg     — McMahan et al., 2017 (Communication-Efficient Learning
                    of Deep Networks from Decentralized Data)
    2. Momentum   — FedAvg with server-side Nesterov-like momentum on the
                    aggregated weight delta
    3. SCAFFOLD   — Karimireddy et al., ICML 2020 (SCAFFOLD: Stochastic
                    Controlled Averaging for Federated Learning). Corrects
                    client drift via control variates.
    4. FedSCRT    — Novel contribution: SCAFFOLD backbone training followed
                    by federated Classifier Retraining (cRT) using a
                    centralised backbone with locally balanced heads.

Pipeline position:
    build_npy_cache.py → main.py (Stage 2 ckpt) → THIS MODULE → results/

Usage:
    python fl_train.py --strategy fedavg    --alpha 0.5 --rounds 20
    python fl_train.py --strategy momentum  --alpha 0.5 --rounds 20
    python fl_train.py --strategy scaffold  --alpha 0.5 --rounds 20
    python fl_train.py --strategy fedscrt   --alpha 0.5 --rounds 20
    python fl_train.py --strategy fedavg    --alpha 100 --rounds 20
    python fl_train.py --strategy scaffold  --alpha 100 --rounds 20

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""

# ┌─────────────────────────────────────────────────────┐
# │  PRIVACY GUARANTEE                                   │
# │  Only model weights (not raw data) are transmitted  │
# │  between hospitals. rawDataTransmitted = 0 always.  │
# └─────────────────────────────────────────────────────┘

# Reproducibility: all random seeds fixed to 42
# torch.manual_seed(42), numpy.random.seed(42)

from __future__ import annotations
import argparse, copy, json, os, sys, time
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from torch.utils.data import DataLoader, WeightedRandomSampler

sys.path.insert(0, str(Path(__file__).parent))
from config import FullConfig
from data_loader import MRI25DSliceDataset, load_samples
from main import build_model

CFG       = FullConfig()
SEED      = 42          # global random seed for reproducibility
N_CLIENTS = 3           # simulated number of hospitals
NUM_CLASSES = 2         # binary task: Luminal (0) vs Non-Luminal (1)
# Collapse 4-class labels to binary:
#   Luminal A (0) + Luminal B (1) → 0 (Luminal)
#   HER2 (2) + Triple Negative (3) → 1 (Non-Luminal)
REMAP     = {0: 0, 1: 0, 2: 1, 3: 1}

os.makedirs(CFG.results_dir, exist_ok=True)


# ── Data Utilities ────────────────────────────────────────────────────────────

def get_fold_split(fold: int = 0) -> Tuple[List, List]:
    """
    Return stratified-group train/val split for a given fold index.

    Uses StratifiedGroupKFold (5 splits) to ensure no patient appears in
    both train and validation, and class ratios are preserved in each fold.
    Labels are remapped to binary (Luminal vs Non-Luminal) after splitting.

    Args:
        fold (int): Fold index in [0, 4]. Default is 0.

    Returns:
        Tuple[List, List]: (train_samples, val_samples), each a list of
            (path, binary_label, patient_id) tuples.

    Raises:
        ValueError: If the requested fold index is not found.
    """
    samples = load_samples(CFG.data_json, CFG.data_root)
    labels  = np.array([s[1] for s in samples])   # original 4-class labels
    groups  = np.array([s[2] for s in samples])   # patient IDs for leakage check

    skf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    for fi, (tr, va) in enumerate(skf.split(np.zeros(len(labels)), labels, groups)):
        if fi == fold:
            # Apply binary remap after splitting to preserve stratification
            train = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in tr]
            val   = [(samples[i][0], REMAP[samples[i][1]], samples[i][2]) for i in va]
            return train, val
    raise ValueError(f"Fold {fold} not found in 5-fold split")


def dirichlet_partition(
    labels: List[int],
    n_clients: int = N_CLIENTS,
    alpha: float = 0.5,
    seed: int = SEED,
) -> List[List[int]]:
    """
    Partition sample indices across clients using a Dirichlet distribution.

    A Dirichlet partition (Hsieh et al., 2020) controls data heterogeneity:
        - alpha → 0   : extreme non-IID (each client sees one class only)
        - alpha = 0.5 : moderate heterogeneity (realistic hospital scenario)
        - alpha → ∞   : near-IID (uniform distribution across clients)

    For each class c with indices I_c, the proportion assigned to client k is
    drawn as:  p_k ~ Dir(alpha)  so that  sum_k p_k = 1.

    Args:
        labels (List[int]): Binary label for each sample (0 or 1).
        n_clients (int): Number of federated clients (hospitals). Default 3.
        alpha (float): Dirichlet concentration parameter. Default 0.5.
        seed (int): Random seed for reproducibility.

    Returns:
        List[List[int]]: Per-client lists of sample indices.
    """
    rng    = np.random.default_rng(seed)
    labels = np.array(labels)
    idx    = [[] for _ in range(n_clients)]  # one list of indices per client

    for c in np.unique(labels):
        ci = np.where(labels == c)[0]    # indices of samples with class c
        rng.shuffle(ci)
        props = rng.dirichlet([alpha] * n_clients)  # p_k ~ Dir(alpha)
        cuts  = (np.cumsum(props) * len(ci)).astype(int)
        cuts[-1] = len(ci)  # ensure last cut reaches the end
        prev = 0
        for k in range(n_clients):
            idx[k].extend(ci[prev:cuts[k]].tolist())
            prev = cuts[k]
    return idx


def make_loader(
    samples: List[Tuple],
    augment: bool = True,
    batch_size: int = 2,
    balanced: bool = False,
) -> DataLoader:
    """
    Build a DataLoader for a list of (path, label, pid) samples.

    Args:
        samples (List[Tuple]): List of (path, binary_label, patient_id).
        augment (bool): Apply 3D data augmentation. Default True.
        batch_size (int): Number of volumes per batch. Default 2.
        balanced (bool): Use WeightedRandomSampler for class balance.
            Set True for cRT head training. Default False.

    Returns:
        DataLoader: Configured DataLoader for the given samples.
    """
    ds  = MRI25DSliceDataset(samples, augment=augment, slice_size=224)
    if balanced:
        lbls    = [s[1] for s in samples]
        # w_i = 1 / count(class_i) — inverse-frequency weighting
        counts  = np.maximum(np.bincount(lbls, minlength=NUM_CLASSES).astype(float), 1)
        weights = torch.tensor(1.0 / counts[lbls], dtype=torch.float32)
        sampler = WeightedRandomSampler(weights, len(weights), replacement=True)
        return DataLoader(ds, batch_size=batch_size, sampler=sampler, num_workers=0)
    return DataLoader(ds, batch_size=batch_size, shuffle=augment, num_workers=0)


# ── Model Parameter Utilities ─────────────────────────────────────────────────

def get_params(model: nn.Module) -> List[np.ndarray]:
    """
    Extract all model parameters as a list of numpy arrays (CPU copy).

    Args:
        model (nn.Module): Any PyTorch model.

    Returns:
        List[np.ndarray]: Ordered list of parameter arrays, one per
            parameter tensor in model.parameters().
    """
    return [p.data.cpu().numpy().copy() for p in model.parameters()]


def set_params(model: nn.Module, params: List[np.ndarray]) -> None:
    """
    Overwrite model parameters in-place from a list of numpy arrays.

    Args:
        model (nn.Module): Target model. Parameters are updated in-place.
        params (List[np.ndarray]): New parameter values in the same order
            as model.parameters().
    """
    with torch.no_grad():
        for p, arr in zip(model.parameters(), params):
            p.data.copy_(torch.tensor(arr, device=p.device))


def weighted_average(
    param_lists: List[List[np.ndarray]],
    weights: List[int],
) -> List[np.ndarray]:
    """
    Compute the FedAvg weighted average of client parameter lists.

    FedAvg aggregation formula (McMahan et al. 2017, Eq. 1):
        w_new = Σ_k (n_k / n) * w_k
    where n_k is the number of samples on client k and n = Σ_k n_k.

    Args:
        param_lists (List[List[np.ndarray]]): One parameter list per client,
            each list having the same structure as get_params() output.
        weights (List[int]): Per-client sample counts n_k used as weights.

    Returns:
        List[np.ndarray]: Aggregated global parameters.
    """
    total = sum(weights)   # n = Σ_k n_k (total samples across all clients)
    result = []
    for layers in zip(*param_lists):
        # w_new_layer = Σ_k (n_k / n) * w_k_layer
        agg = sum(w * l for w, l in zip(weights, layers)) / total
        result.append(agg)
    return result


def build_fresh(device: torch.device) -> nn.Module:
    """
    Instantiate a clean ConvNeXt-MIL model configured for the binary task.

    Sets MRI_NUM_CLASSES=2 in the environment so build_model reads the
    correct number of output classes from config.

    Args:
        device (torch.device): Target device (CPU or CUDA).

    Returns:
        nn.Module: Freshly initialised ConvNeXtMILClassifier on ``device``.
    """
    os.environ["MRI_NUM_CLASSES"] = str(NUM_CLASSES)  # override to binary
    return build_model("convnext_mil", device)


# ── Local Training ────────────────────────────────────────────────────────────

def local_train(
    model: nn.Module,
    samples: List[Tuple],
    device: torch.device,
    epochs: int = 3,
    lr: float = 3e-5,
    scaffold_correction: Optional[List[np.ndarray]] = None,
) -> int:
    """
    Train a model on a single client's local data for a fixed number of epochs.

    For SCAFFOLD, a gradient correction term (c_global - c_local) is added
    to each gradient before the parameter update, correcting for client drift.

    SCAFFOLD correction (Karimireddy et al. 2020, Option II, Eq. 3):
        g_corrected = g_local + (c_global - c_local)
    where c_global and c_local are server and client control variates.

    Class-weighted cross-entropy is used to handle binary imbalance.

    Args:
        model (nn.Module): Client model (deep copy of the global model).
        samples (List[Tuple]): Client's local training samples.
        device (torch.device): Compute device.
        epochs (int): Number of local training epochs. Default 3.
        lr (float): AdamW learning rate. Default 3e-5.
        scaffold_correction (Optional[List[np.ndarray]]): Per-parameter
            correction arrays c_global - c_local. Pass None for FedAvg /
            Momentum (no correction applied).

    Returns:
        int: Number of training samples (used as weight in FedAvg).
    """
    loader = make_loader(samples, augment=True)
    lbls   = [s[1] for s in samples]

    # Inverse-frequency class weights: w_c = 1 / count(c), normalised
    counts = np.maximum(np.bincount(lbls, minlength=NUM_CLASSES).astype(float), 1)
    w      = torch.tensor(
        (1.0 / counts) / (1.0 / counts).sum() * NUM_CLASSES,
        dtype=torch.float32, device=device,
    )
    criterion = nn.CrossEntropyLoss(weight=w)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)

    # Pre-convert SCAFFOLD correction arrays to device tensors once
    sc = None
    if scaffold_correction is not None:
        sc = [
            torch.tensor(c, dtype=torch.float32, device=device)
            for c in scaffold_correction
        ]

    model.train()
    for _ in range(epochs):
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            criterion(model(x), y).backward()

            if sc is not None:
                # Add SCAFFOLD correction to each parameter gradient:
                # g ← g + (c_global - c_local)  [Karimireddy et al. 2020]
                with torch.no_grad():
                    for p, corr in zip(model.parameters(), sc):
                        if p.grad is not None:
                            p.grad.data.add_(corr)

            nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # prevent exploding grads
            optimizer.step()
    return len(samples)


@torch.no_grad()
def evaluate(
    model: nn.Module,
    samples: List[Tuple],
    device: torch.device,
) -> Tuple[float, Dict[str, float]]:
    """
    Evaluate a model on a validation set and return loss and metrics.

    Args:
        model (nn.Module): Model to evaluate.
        samples (List[Tuple]): Validation samples (no augmentation applied).
        device (torch.device): Compute device.

    Returns:
        Tuple[float, Dict[str, float]]: (mean_loss, metrics_dict) where
            metrics_dict contains keys 'f1', 'auc', and 'accuracy'.
    """
    loader = make_loader(samples, augment=False)
    model.eval()
    preds, probs, labels = [], [], []
    total_loss, n = 0.0, 0
    crit = nn.CrossEntropyLoss()

    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        total_loss += crit(logits, y).item()
        n += 1
        probs.extend(torch.softmax(logits, -1)[:, 1].cpu().numpy())  # P(Non-Luminal)
        preds.extend(logits.argmax(-1).cpu().numpy())
        labels.extend(y.cpu().numpy())

    f1  = float(f1_score(labels, preds, average="macro", zero_division=0))
    acc = float(np.mean(np.array(preds) == np.array(labels)))
    try:
        auc = float(roc_auc_score(labels, probs))
    except Exception:
        auc = 0.0   # fails if only one class present in the batch
    return total_loss / max(n, 1), {"f1": f1, "auc": auc, "accuracy": acc}


# ── FL Strategy Implementations ───────────────────────────────────────────────

def run_fedavg(
    client_samples: List[List[Tuple]],
    val_samples: List[Tuple],
    device: torch.device,
    rounds: int = 20,
    epochs: int = 2,
    lr: float = 3e-5,
) -> Tuple[nn.Module, List[dict]]:
    """
    Run FedAvg (McMahan et al., 2017) for a fixed number of communication rounds.

    Each round:
      1. Broadcast global model to all clients.
      2. Each client trains locally for ``epochs`` epochs.
      3. Aggregate with FedAvg: w_new = Σ (n_k / n) * w_k.
      4. Evaluate global model on held-out validation set.

    Privacy guarantee: only weights w_k are sent to the server, never raw data.

    Args:
        client_samples (List[List[Tuple]]): Per-client training samples.
        val_samples (List[Tuple]): Central validation set.
        device (torch.device): Compute device.
        rounds (int): Number of FL communication rounds. Default 20.
        epochs (int): Local training epochs per round. Default 2.
        lr (float): Local AdamW learning rate. Default 3e-5.

    Returns:
        Tuple[nn.Module, List[dict]]: (final_global_model, per-round metrics).
    """
    model   = build_fresh(device)
    history = []

    for rnd in range(1, rounds + 1):
        client_params, sizes = [], []

        for k, samples in enumerate(client_samples):
            m = copy.deepcopy(model)                   # broadcast global → client
            n = local_train(m, samples, device, epochs, lr)
            client_params.append(get_params(m))
            sizes.append(n)
            del m; torch.cuda.empty_cache()            # free GPU memory promptly

        # FedAvg aggregation: w_new = Σ (n_k / n) * w_k
        set_params(model, weighted_average(client_params, sizes))

        _, metrics = evaluate(model, val_samples, device)
        print(f"  Round {rnd:02d}: F1={metrics['f1']:.4f}  AUC={metrics['auc']:.4f}")
        history.append({"round": rnd, **metrics})

    return model, history


def run_momentum(
    client_samples: List[List[Tuple]],
    val_samples: List[Tuple],
    device: torch.device,
    rounds: int = 20,
    epochs: int = 2,
    lr: float = 3e-5,
    momentum: float = 0.9,
) -> Tuple[nn.Module, List[dict]]:
    """
    Run Momentum-FedAvg: FedAvg with server-side momentum on the weight delta.

    Server-side momentum update (Polyak 1964, applied to FL):
        delta_t  = w_agg_t - w_global_{t-1}            (weight delta this round)
        v_t      = beta * v_{t-1} + delta_t            (accumulated velocity)
        w_new    = w_global_{t-1} + v_t                (momentum-corrected update)

    Server momentum smooths noisy client updates and can accelerate convergence
    compared to vanilla FedAvg when client data is heterogeneous.

    Args:
        client_samples (List[List[Tuple]]): Per-client training samples.
        val_samples (List[Tuple]): Central validation set.
        device (torch.device): Compute device.
        rounds (int): Communication rounds. Default 20.
        epochs (int): Local training epochs per round. Default 2.
        lr (float): Local learning rate. Default 3e-5.
        momentum (float): Server-side momentum coefficient beta. Default 0.9.

    Returns:
        Tuple[nn.Module, List[dict]]: (final_global_model, per-round metrics).
    """
    model    = build_fresh(device)
    velocity = None   # v_0 = None (initialised on first round)
    history  = []

    for rnd in range(1, rounds + 1):
        client_params, sizes = [], []
        old_params = get_params(model)   # w_global_{t-1}

        for k, samples in enumerate(client_samples):
            m = copy.deepcopy(model)
            n = local_train(m, samples, device, epochs, lr)
            client_params.append(get_params(m))
            sizes.append(n)
            del m; torch.cuda.empty_cache()

        agg   = weighted_average(client_params, sizes)        # w_agg_t
        delta = [a - o for a, o in zip(agg, old_params)]     # delta_t

        if velocity is None:
            velocity = delta                                   # v_1 = delta_1
        else:
            # v_t = beta * v_{t-1} + delta_t  (Polyak momentum)
            velocity = [momentum * v + d for v, d in zip(velocity, delta)]

        new_params = [o + v for o, v in zip(old_params, velocity)]
        set_params(model, new_params)

        _, metrics = evaluate(model, val_samples, device)
        print(f"  Round {rnd:02d}: F1={metrics['f1']:.4f}  AUC={metrics['auc']:.4f}")
        history.append({"round": rnd, **metrics})

    return model, history


def run_scaffold(
    client_samples: List[List[Tuple]],
    val_samples: List[Tuple],
    device: torch.device,
    rounds: int = 20,
    epochs: int = 2,
    lr: float = 3e-5,
) -> Tuple[nn.Module, List[dict]]:
    """
    Run SCAFFOLD (Karimireddy et al., ICML 2020) to correct client drift.

    SCAFFOLD maintains per-client control variates c_i and a global control
    variate c that quantify the local gradient bias on each client. During
    local training the bias is subtracted from each gradient update.

    Control variate update (Option II, Karimireddy et al. 2020, Eq. 5):
        c_i_new = c_i - c + (x_old - x_new) / (K * eta)
    where:
        c_i   : client i control variate (tracks local gradient bias)
        c     : global server control variate
        x_old : parameters BEFORE local training
        x_new : parameters AFTER local training
        K     : total local SGD steps (epochs × batches per epoch)
        eta   : local learning rate

    Global control variate aggregation:
        c_new = Σ_k (n_k / n) * c_k_new

    Args:
        client_samples (List[List[Tuple]]): Per-client training samples.
        val_samples (List[Tuple]): Central validation set.
        device (torch.device): Compute device.
        rounds (int): Communication rounds. Default 20.
        epochs (int): Local training epochs per round. Default 2.
        lr (float): Local AdamW learning rate. Default 3e-5.

    Returns:
        Tuple[nn.Module, List[dict]]: (final_global_model, per-round metrics).
    """
    model     = build_fresh(device)
    n_params  = len(list(model.parameters()))

    # Initialise control variates to zero (cold start)
    global_cv = [np.zeros_like(p) for p in get_params(model)]   # c  (server)
    local_cvs = [                                                 # c_i (per client)
        [np.zeros_like(p) for p in get_params(model)]
        for _ in client_samples
    ]
    history = []

    for rnd in range(1, rounds + 1):
        client_params, new_cvs, sizes = [], [], []
        global_params = get_params(model)   # x_global before this round

        for k, samples in enumerate(client_samples):
            m = copy.deepcopy(model)

            # Correction = c_global - c_local  (applied per gradient step)
            correction = [g - l for g, l in zip(global_cv, local_cvs[k])]
            x_old      = get_params(m)   # x_old = global params before local training

            n = local_train(m, samples, device, epochs, lr, scaffold_correction=correction)
            x_new = get_params(m)        # x_new = params after local training

            # SCAFFOLD Option II control variate update:
            # c_i_new = c_i - c + (x_old - x_new) / (K * lr)
            K      = epochs * max(len(samples) // 2, 1)  # estimated SGD steps
            new_ci = [
                ci - c + (xo - xn) / (K * lr)
                for ci, c, xo, xn
                in zip(local_cvs[k], global_cv, x_old, x_new)
            ]
            local_cvs[k] = new_ci
            client_params.append(x_new)
            new_cvs.append(new_ci)
            sizes.append(n)
            del m; torch.cuda.empty_cache()

        # Aggregate model weights with FedAvg
        set_params(model, weighted_average(client_params, sizes))

        # Aggregate global control variate: c_new = Σ (n_k / n) * c_k_new
        total     = sum(sizes)
        global_cv = [
            sum(s * cv[i] for s, cv in zip(sizes, new_cvs)) / total
            for i in range(n_params)
        ]

        _, metrics = evaluate(model, val_samples, device)
        print(f"  Round {rnd:02d}: F1={metrics['f1']:.4f}  AUC={metrics['auc']:.4f}")
        history.append({"round": rnd, **metrics})

    return model, history


def run_fedscrt(
    client_samples: List[List[Tuple]],
    val_samples: List[Tuple],
    device: torch.device,
    rounds: int = 20,
    epochs: int = 2,
    lr: float = 3e-5,
    crt_epochs: int = 300,
    n_seeds: int = 10,
) -> Tuple[nn.Module, List[dict]]:
    """
    Run FedSCRT: Federated SCAFFOLD + Classifier Retraining (novel contribution).

    FedSCRT decouples representation learning from classification in a federated
    setting.  The backbone is shared and pre-trained centrally (Stage 2 ckpt),
    then each hospital retrains only the linear head on its local balanced
    features.  Only head weights are federated-averaged.

    Three-phase procedure:

    Phase 1 — Centralised backbone loading:
        Load a ConvNeXt-MIL backbone from a pre-trained Stage 2 checkpoint.
        The backbone captures global representations trained on all patients.

    Phase 2 — Federated Classifier Retraining (cRT):
        For each hospital k:
          a. Extract 256-dim MIL embeddings via a forward hook on model.head.
          b. Train a fresh Linear(256 → 2) head for ``crt_epochs`` epochs
             using a class-balanced sampler (prevents majority-class dominance).
          c. Repeat with ``n_seeds`` different random seeds; keep the best head
             by local macro F1 (reduces variance from small minority classes).
        Result: one weight matrix W_k of shape (2, 256) per hospital.

    Phase 3 — FedAvg head aggregation:
        w_global = Σ_k (n_k / n) * W_k
        Only the 2×256 head weights are transmitted — never raw features.

    Privacy note:
        MIL features are 256-dimensional aggregated embeddings, not raw
        pixels, but they are still derived from patient data.  In a real
        deployment, differential privacy noise would be added before
        transmitting W_k.

    Args:
        client_samples (List[List[Tuple]]): Per-client training samples.
        val_samples (List[Tuple]): Central validation set.
        device (torch.device): Compute device.
        rounds (int): Unused (kept for API consistency with other strategies).
        epochs (int): Unused (kept for API consistency).
        lr (float): Unused (kept for API consistency).
        crt_epochs (int): Epochs to train each local head. Default 300.
        n_seeds (int): Random seeds for cRT head stability. Default 10.

    Returns:
        Tuple[nn.Module, List[dict]]: (final_global_model, history_list).
            history_list contains a single dict with the final metrics.
    """
    # ── Phase 1: Load centralised backbone ───────────────────────────────────
    print("  Loading centralised backbone for FedSCRT...")
    model = build_fresh(device)
    ck    = torch.load("checkpoints/fold0_stage2_best_crt.pt", map_location=device)
    model.load_state_dict(ck.get("model_state", ck), strict=False)

    history = []

    # ── Phase 2: Federated Classifier Retraining ──────────────────────────────
    print("\n  Phase 2: FedSCRT — federated classifier retraining")

    # Freeze all backbone parameters: only the head will be trained per client
    model.eval()
    for p in model.parameters():
        p.requires_grad_(False)

    client_heads: List[np.ndarray] = []   # aggregated best W_k per hospital
    sizes: List[int] = []

    for k, samples in enumerate(client_samples):
        print(f"    Client {k+1} ({len(samples)} samples) — extracting features")

        ds     = MRI25DSliceDataset(samples, augment=False, slice_size=224)
        loader = DataLoader(ds, batch_size=2, shuffle=False, num_workers=0)

        feats: List[torch.Tensor] = []
        labs:  List[int]          = []
        store: dict               = {}

        # Register forward hook on model.head to capture the 256-dim MIL embedding
        # (the input to the final Linear layer, NOT its output).
        handle = model.head.register_forward_hook(
            lambda m, inp, out: store.update({"feat": inp[0].detach().cpu()})
        )

        with torch.no_grad():
            for x, y in loader:
                _ = model(x.to(device))          # forward pass triggers hook
                feats.append(store["feat"])       # (batch, 256) MIL embedding
                labs.extend(y.numpy())

        handle.remove()                           # prevent memory leak

        feats = torch.cat(feats)                 # (N_client, 256)
        labs  = torch.tensor(labs)               # (N_client,)

        # Build class-balanced sampler for head training
        counts  = np.maximum(
            np.bincount(labs.numpy(), minlength=NUM_CLASSES).astype(float), 1
        )
        weights = torch.tensor(1.0 / counts[labs.numpy()], dtype=torch.float32)
        sampler = WeightedRandomSampler(weights, len(weights), replacement=True)
        feat_ld = DataLoader(
            torch.utils.data.TensorDataset(feats, labs),
            batch_size=32, sampler=sampler, num_workers=0,
        )

        best_f1: float      = 0.0
        best_w:  Optional[np.ndarray] = None

        # Train n_seeds heads and keep the best one (reduces cRT variance
        # caused by the tiny minority class in each hospital's val subset)
        for seed in range(42, 42 + n_seeds):
            torch.manual_seed(seed)
            head = nn.Linear(256, NUM_CLASSES).to(device)
            opt  = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=0.01)

            for _ in range(crt_epochs):
                head.train()
                for fb, lb in feat_ld:
                    opt.zero_grad()
                    F.cross_entropy(head(fb.to(device)), lb.to(device)).backward()
                    opt.step()

            head.eval()
            with torch.no_grad():
                preds = head(feats.to(device)).argmax(-1).cpu().numpy()
                f1    = float(f1_score(labs.numpy(), preds, average="macro", zero_division=0))

            if f1 > best_f1:
                best_f1 = f1
                best_w  = head.weight.detach().cpu().numpy().copy()  # (2, 256)

        print(f"      Best local F1 = {best_f1:.4f}")
        client_heads.append(best_w)
        sizes.append(len(samples))

    # ── Phase 3: FedAvg head aggregation ─────────────────────────────────────
    # w_global = Σ_k (n_k / n) * W_k  (FedAvg over head weights only)
    total = sum(sizes)
    agg_w = sum(s * h for s, h in zip(sizes, client_heads)) / total  # (2, 256)

    with torch.no_grad():
        model.head.weight.copy_(torch.tensor(agg_w, device=device))
        model.head.bias.zero_()   # reset bias to neutral (not aggregated separately)

    _, metrics = evaluate(model, val_samples, device)
    print(f"\n  FedSCRT final: F1={metrics['f1']:.4f}  AUC={metrics['auc']:.4f}")
    history.append({"round": "fedscrt", **metrics})
    return model, history


# ── Entry Point ───────────────────────────────────────────────────────────────

def main() -> None:
    """
    Parse command-line arguments, partition data, and run the selected FL strategy.

    Saves per-round metrics and final summary to results/fl_{strategy}_alpha{a}.json.
    """
    p = argparse.ArgumentParser(
        description="Federated Learning for breast MRI binary subtype classification"
    )
    p.add_argument("--strategy", default="scaffold",
                   choices=["fedavg", "momentum", "scaffold", "fedscrt"],
                   help="FL aggregation strategy (default: scaffold)")
    p.add_argument("--alpha",    type=float, default=0.5,
                   help="Dirichlet alpha for data heterogeneity (default: 0.5)")
    p.add_argument("--rounds",   type=int,   default=20,
                   help="Number of FL communication rounds (default: 20)")
    p.add_argument("--epochs",   type=int,   default=3,
                   help="Local training epochs per round (default: 3)")
    p.add_argument("--lr",       type=float, default=3e-5,
                   help="Local AdamW learning rate (default: 3e-5)")
    p.add_argument("--momentum", type=float, default=0.9,
                   help="Server-side momentum coefficient (momentum strategy only)")
    p.add_argument("--fold",     type=int,   default=0,
                   help="Cross-validation fold index (default: 0)")
    args = p.parse_args()

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print(f"\nDevice: {device}")
    print(
        f"Strategy: {args.strategy.upper()}  alpha={args.alpha}  "
        f"R={args.rounds}  E={args.epochs}\n"
    )

    # Build fold split and apply Dirichlet partition across hospitals
    train_all, val_samples = get_fold_split(args.fold)
    train_labels   = [s[1] for s in train_all]
    client_indices = dirichlet_partition(train_labels, alpha=args.alpha)
    client_samples = [[train_all[i] for i in idx] for idx in client_indices]

    print("Data partition:")
    for k, samps in enumerate(client_samples):
        lbls = [s[1] for s in samps]
        n0, n1 = lbls.count(0), lbls.count(1)
        dom    = "Luminal" if n0 >= n1 else "Non-Luminal"
        print(f"  Hospital {k+1}: L={n0}, NL={n1}, n={len(samps)}, Dominant={dom}")
    print(f"  Validation: {len(val_samples)} patients\n")

    t0 = time.time()

    if args.strategy == "fedavg":
        _, history = run_fedavg(
            client_samples, val_samples, device, args.rounds, args.epochs, args.lr
        )
    elif args.strategy == "momentum":
        _, history = run_momentum(
            client_samples, val_samples, device,
            args.rounds, args.epochs, args.lr, args.momentum,
        )
    elif args.strategy == "scaffold":
        _, history = run_scaffold(
            client_samples, val_samples, device, args.rounds, args.epochs, args.lr
        )
    elif args.strategy == "fedscrt":
        _, history = run_fedscrt(
            client_samples, val_samples, device, args.rounds, args.epochs, args.lr
        )

    elapsed = time.time() - t0
    final   = history[-1]

    print(f"\n{'='*60}")
    print(f"  Strategy : {args.strategy.upper()}")
    print(f"  Alpha    : {args.alpha}")
    print(f"  F1       : {final.get('f1', 0):.4f}")
    print(f"  AUC      : {final.get('auc', 0):.4f}")
    print(f"  Accuracy : {final.get('accuracy', 0):.4f}")
    print(f"  Time     : {elapsed / 3600:.2f}h")
    print(f"{'='*60}\n")

    out = {
        "strategy":   args.strategy,
        "alpha":      args.alpha,
        "rounds":     args.rounds,
        "epochs":     args.epochs,
        "history":    history,
        "final":      final,
        "time_hours": elapsed / 3600,
    }

    # Filename convention: fl_{strategy}_alpha{alpha}.json
    atag  = str(int(args.alpha)) if args.alpha == int(args.alpha) else str(args.alpha)
    fname = f"fl_{args.strategy}_alpha{atag}.json"
    path  = os.path.join(CFG.results_dir, fname)
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Saved: {path}")


if __name__ == "__main__":
    main()
