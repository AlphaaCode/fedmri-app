"""
run_fl_all.py
=============
Batch runner for all federated learning experiments, with per-run logging.

Launches each FL experiment (strategy × Dirichlet alpha) as a subprocess
invoking fl_train.py, streams its output to both the console and a log file,
and skips experiments whose result JSON already exists (idempotent / resumable).

Experiment matrix:
    fedavg   α=0.5   — primary baseline
    momentum α=0.5   — optimisation variant
    scaffold α=0.5   — main contribution (client-drift correction)
    fedscrt  α=0.5   — novel contribution (federated cRT)
    fedavg   α=100   — near-IID comparison
    scaffold α=100   — near-IID comparison

Each experiment saves to:
    logs/fl_{strategy}_a{alpha}.log              (live training log)
    results/fl_{strategy}_alpha{alpha}.json      (metrics, written by fl_train.py)

Pipeline position:
    fl_train.py (single run) ← THIS MODULE orchestrates → results/ (all runs)

Run all:
    python run_fl_all.py

Run one only:
    python run_fl_all.py --only fedavg_0.5
    python run_fl_all.py --only momentum_0.5
    python run_fl_all.py --only scaffold_0.5
    python run_fl_all.py --only fedscrt_0.5
    python run_fl_all.py --only fedavg_100
    python run_fl_all.py --only scaffold_100

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""

import argparse, glob, json, os, subprocess, sys, time
from datetime import datetime
from pathlib import Path

os.makedirs("logs", exist_ok=True)

# Experiment matrix: (strategy, dirichlet_alpha, human_label, cli_key)
EXPERIMENTS = [
    ("fedavg",   0.5,  "FedAvg α=0.5          [PRIMARY BASELINE]",   "fedavg_0.5"),
    ("momentum", 0.5,  "Momentum-FedAvg α=0.5 [OPTIMISATION]",       "momentum_0.5"),
    ("scaffold", 0.5,  "SCAFFOLD α=0.5        [MAIN CONTRIBUTION]",   "scaffold_0.5"),
    ("fedscrt",  0.5,  "FedSCRT α=0.5         [NOVEL CONTRIBUTION]",  "fedscrt_0.5"),
    ("fedavg",   100,  "FedAvg α=100          [NEAR-IID COMPARISON]", "fedavg_100"),
    ("scaffold", 100,  "SCAFFOLD α=100        [NEAR-IID COMPARISON]", "scaffold_100"),
]


def run_one(strategy, alpha, label):
    """
    Run a single FL experiment as a subprocess, logging output to file + console.

    Skips the run if its result JSON already exists (resumable batch runs).

    Args:
        strategy (str): FL strategy name (fedavg / momentum / scaffold / fedscrt).
        alpha (float): Dirichlet heterogeneity parameter.
        label (str): Human-readable experiment label for logs.

    Returns:
        bool: True if the experiment completed with exit code 0 (or was skipped).
    """
    atag    = str(int(alpha)) if alpha == int(alpha) else str(alpha)
    logp    = f"logs/fl_{strategy}_a{atag}.log"
    resultp = f"results/fl_{strategy}_alpha{atag}.json"

    if Path(resultp).exists():
        print(f"\n  SKIP (already done): {label}")
        return True

    print(f"\n{'#'*70}\n#  {label}\n#  Log → {logp}\n{'#'*70}\n")
    t0 = time.time()

    # Force binary mode + offline HuggingFace + unbuffered output for live logs
    env = {**os.environ, "MRI_NUM_CLASSES": "2", "HF_HUB_OFFLINE": "1", "PYTHONUNBUFFERED": "1"}
    cmd = [sys.executable, "fl_train.py",
           "--strategy", strategy, "--alpha", str(alpha),
           "--rounds", "20", "--epochs", "2"]

    with open(logp, "w", buffering=1, encoding="utf-8") as lf:
        lf.write(f"Experiment: {label}\n"
                 f"Started:    {datetime.now():%Y-%m-%d %H:%M:%S}\n"
                 f"{'='*60}\n\n")
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT,
                                env=env, bufsize=1, text=True,
                                encoding="utf-8", errors="replace")
        for line in proc.stdout:
            sys.stdout.write(line); sys.stdout.flush()
            lf.write(line); lf.flush()
        proc.wait()

    elapsed = time.time() - t0
    ok  = proc.returncode == 0
    msg = f"{'DONE' if ok else 'FAILED'}  {elapsed/3600:.2f}h  {datetime.now():%H:%M:%S}"
    with open(logp, "a", encoding="utf-8") as lf:
        lf.write(f"\n{'='*60}\n{msg}\n")
    print(f"\n  {msg}\n")
    return ok


def main():
    """
    Run all FL experiments (or a single one via --only) and print a summary.

    After running, prints a pass/fail summary and the final F1/AUC scores
    parsed from all results/fl_*.json files.
    """
    p = argparse.ArgumentParser()
    p.add_argument("--only", default=None, choices=[e[3] for e in EXPERIMENTS],
                   help="Run only the named experiment (e.g. scaffold_0.5)")
    args = p.parse_args()

    if args.only:
        exp = next(e for e in EXPERIMENTS if e[3] == args.only)
        run_one(*exp[:3]); return

    results = []
    for strategy, alpha, label, _ in EXPERIMENTS:
        results.append((label, run_one(strategy, alpha, label)))

    print("\n" + "="*70 + "\nSUMMARY\n" + "="*70)
    for label, ok in results:
        print(f"  {'OK' if ok else 'FAIL'}  {label}")

    print("\n" + "="*70 + "\nFINAL F1 SCORES\n" + "="*70)
    for f in sorted(glob.glob("results/fl_*.json")):
        try:
            d = json.load(open(f))
            print(f"  {d['strategy']:12s} α={d['alpha']:<6} "
                  f"F1={d['final']['f1']:.4f}  AUC={d['final']['auc']:.4f}")
        except Exception:
            pass

if __name__ == "__main__":
    main()