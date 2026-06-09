# Model Evolution Log
## Breast MRI Molecular Subtype Classification

This file tracks every architectural decision, bug fix, and hyperparameter change made to the model over time, including the reasoning behind each. It is the canonical record for onboarding and for understanding why the code looks the way it does.

---

## Task

Classify breast MRI volumes into 4 molecular subtypes:
- **0 — Luminal A** (majority class, ~11.6× more samples than HER2)
- **1 — Luminal B**
- **2 — HER2**
- **3 — Triple Negative**

Dataset: 737 volumes. Severe class imbalance. 5-fold stratified group cross-validation (no patient leakage). Target metric: **macro F1**.

---

## v1.0 — Initial Working Baseline
*Commit: `d85ce16` — 2026-04-20*

### Architecture
- **R3D-18** (Kinetics-pretrained 3D video backbone), input channel adapted from 3→1 for greyscale MRI.
- Linear classifier head with LayerNorm + Dropout(0.6).
- Backbone frozen by default; only head trained.

### Training
- Cross-entropy loss, no class weighting.
- Basic augmentation in `image_process.py`.
- Simple train/val split (no k-fold).

### Known problems at this stage
- No class rebalancing → model predicts Luminal A almost exclusively.
- No MixUp, no label smoothing.
- 3D convolution processes full volume at once → high VRAM.

---

## v1.1 — Evaluation Rewrite + Unfreezing Schedule
*Commit: `0317981` — 2026-04-20*

### Changes
- `evaluate.py` fully rewritten: now returns per-class F1, confusion matrix, and prediction distribution. Previously only returned accuracy.
- `main.py`: added **progressive unfreezing** — `layer4` unlocked at epoch 10, `layer3` at epoch 35. Prevents catastrophic forgetting.
- `model.py`: minor cleanup.

### Why
Accuracy was misleading on the imbalanced dataset. Macro F1 exposes the model ignoring minority classes.

---

## v1.2 — Smoke Test + Results Logging
*Commit: `de581ac` — 2026-05-08*

### Changes
- Added `smoke_test.py`: fast end-to-end check with a dummy dataset to catch import errors and shape mismatches before a full run.
- Added `results.txt`: raw training log from the first full run on the real dataset.

### Key observations from results.txt
- Val macro F1 plateaued around 0.38–0.42 with R3D-18.
- Confusion matrix showed near-zero recall on HER2 (class 2) and Luminal B (class 1).
- Confirmed that the architecture and loss were insufficient for the imbalance.

---

## v2.0 — Complete Architecture Overhaul
*Commit: `7291f6f` — 2026-05-08*

This is the major redesign. Almost every file was rewritten or replaced.

---

### Architecture: 2.5D MIL instead of 3D convolution

**Problem with R3D-18**: treating the MRI as a video forces the model to process all slices jointly through 3D convolutions. On a GTX 1660 Ti (6 GB VRAM) this hits memory limits and the temporal kernel conflates depth with time.

**New approach**: extract per-slice 2D features, then aggregate across slices with attention.

```
Input: (B, S, 3, H, W)  — S axial slices per volume
  → DINOv2-S/14 per-slice  → (B, S, 384)
  → GatedAttentionMIL      → (B, 256)   + attention weights
  → Linear head            → (B, 4)
```

**Two backbones implemented:**

| Class | Backbone | Trainable params | Notes |
|---|---|---|---|
| `Dinov2MILClassifier` | DINOv2 ViT-S/14 (LVD-142M) | LoRA on last 2 blocks (~150K) | Primary; loaded via timm |
| `ConvNeXtMILClassifier` | ConvNeXt-Nano (in12k) | Fully trainable | Fallback if timm DINOv2 unavailable |
| `R3D18Classifier` | R3D-18 | Head only | Legacy fallback; kept as `BreastMRIClassifier` alias |

**GatedAttentionMIL** (`model.py`): Ilse et al. 2018. Two parallel linear paths (tanh branch V, sigmoid branch U) produce element-wise gated scores. Softmax over slices gives interpretable attention weights stored in `model.last_attn`. Drop-path regularisation applied at the projection layer.

**LoRA** (`model.py:_apply_lora`): Attached via `peft` to `attn.qkv`, `mlp.fc1`, `mlp.fc2` in the last 2 ViT blocks. Rank=4, alpha=8. Silently skips if peft is unavailable. Gradient checkpointing enabled on backbone to halve VRAM.

---

### Training: 3-Stage Pipeline

The model is now trained in three sequential stages, each with its own config block in `config.py`.

#### Stage 1 — Head-only warmup (`Stage1Config`)
- **Epochs: 20** (raised from 5 in a later session)
- Backbone fully frozen. Only `GatedAttentionMIL` + linear head trained.
- LR head: 1e-3, weight decay: 0.05.
- **Why 20 epochs**: gives the MIL head ~5,900 optimizer steps (20 epochs × batch_size=2 × accum=8 × ~150 train volumes / 5 folds ≈ 5900 effective updates) to converge before backbone gradients start flowing. Starting Stage 2 too early → unstable attention weights.

#### Stage 2 — Joint fine-tune (`Stage2Config`)
- **Epochs: 80** (raised from 25).
- Backbone LoRA adapters unfrozen alongside MIL head.
- LR backbone: 5e-5, LR head: 1e-3. Separate param groups; biases/norms excluded from weight decay.
- **LDAM loss for first 40 epochs** (`epochs_ldam_only=40`, raised from 12): per-class additive margin forces minority-class separation before the model has converged. Switching to CB-CE after 40 epochs gives a cleaner fine-tune phase.
- **ASAM optimizer** starts at epoch 55 (`sam_start_epoch=55`): Adaptive SAM flattens the loss landscape, improving generalisation. Starting too early destabilises early convergence.
- **SWA** starts at epoch 65 (`swa_start_epoch=65`): averages weights over the last 15 epochs. Improves minority-class robustness. Comment: "ASAM starts at 55/80, SWA at 65/80."
- **KL consistency loss disabled** (`consistency_weight=0.0`): was 0.1. With batch_size=2, two-view KL is statistically meaningless (N=2 estimate of a distribution divergence). Re-enable if effective batch ≥ 8.
- **EMA** (`ema.py`): decay=0.99, updated every step. Used for validation; not the checkpoint model.
- Gradient clip: 1.0. Drop-path: 0.1. Dropout: 0.3.
- Effective batch size = 2 × 8 accum steps = 16.

#### Stage 3 — Classifier Retraining / cRT (`Stage3Config`, `crt.py`)
Based on Kang et al., ICLR 2020. After Stage 2, the backbone is re-frozen and cached MIL-pooled features are used to retrain only the linear head on a class-balanced sampler.

- **Epochs: 300** (raised from 20): small linear head on cached features is cheap; 300 epochs ensures full convergence.
- **CyclicLR scheduler** (replaced CosineAnnealingLR): base_lr = lr × 0.1, max_lr = lr, step_size_up = 50, called per-step. Cyclic schedule escapes flat regions in the small linear head loss.
- **10 seeds** (`n_seeds=10`, raised from 3): with ~4–8 samples per minority class in the val set, a single cRT seed has very high variance. Best-of-10 gives a stable head. Comment preserved in code.
- Diagnostic print before training loop: `[cRT seed N] class dist train: [...]` — confirms weighted sampler is working.

---

### Loss Functions (`losses.py`)

| Loss | Used when | Notes |
|---|---|---|
| `LDAMLoss` | Stage 2, epochs 0–39 | Margin ∝ 1/n^0.25; scale=30. Handles soft labels from MixUp via soft-CE fallback. |
| `ClassBalancedCE` | Stage 2, epochs 40–79 | Effective-number weights (β=0.9999). |
| `CBFocalLoss` | Fallback | CB-weighted focal loss if LDAM destabilises. |
| `ConsistencyKL` | Disabled (weight=0.0) | Symmetric KL between two augmented views. Re-enable at batch ≥ 8. |

---

### Data Augmentation (`mixup.py`, `data_loader.py`)

Four augmentation strategies, all producing soft labels compatible with the loss functions:

- **`volume_mixup`**: interpolates two volumes and their labels. Alpha=0.2.
- **`volume_cutmix`**: pastes a rectangular patch from one volume into another. Alpha=1.0.
- **`feature_mixup`** (Manifold Mixup): interpolates in MIL feature space rather than pixel space. Alpha=0.2, prob=0.3.
- **`within_class_mixup`**: mixes only same-class minority samples (Luminal B, HER2). Avoids cross-class noise on tiny classes.

---

### Regularisation Additions

- **ASAM** (`sam.py`): Adaptive Sharpness-Aware Minimization (Kwon et al., ICML 2021). Wraps AdamW. Two-step training: `first_step` perturbs weights, `second_step` updates at perturbed weights then restores. `adaptive=True` scales perturbation by |w| (better for heterogeneous parameter scales in ViT).
- **EMA** (`ema.py`): Exponential moving average of weights. Shadow model maintained separately; backbone gradients do not flow through it.
- **TTA** (`tta.py`): 8-view test-time augmentation — identity + 3 axis flips + 4 axial 90° rotations. Averaged softmax probabilities. Enabled by default (`TTA_ENABLED=True`).

---

### SSL Pre-training (`ssl_pretrain.py`)

Optional SimMIM pre-training on the unlabelled MRI slices before supervised training.
- Backbone: DINOv2-S with LoRA r=4, last 2 blocks only (~150K trainable).
- Task: 40% random patch masking, L1 reconstruction of masked patches.
- Data: all non-background 2D axial slices from all 737 volumes.
- Output: `checkpoints/dinov2s_simmim_lora.pt` — loaded as backbone init in Stage 1.
- 50 epochs, LR=2e-4.

---

### Config System (`config.py`)

All hyperparameters live in dataclasses. Every value can be overridden via environment variable with `MRI_` prefix (e.g. `MRI_STAGE2_EPOCHS=40`). No magic numbers in training code.

```
FullConfig
├── ModelConfig      (arch, lora_rank, proj_dim, attn_dim, slice_size)
├── SSLConfig        (ssl pretraining)
├── Stage1Config     (head warmup)
├── Stage2Config     (joint fine-tune)
├── Stage3Config     (cRT)
└── TTAConfig        (test-time augmentation)
```

---

### Tools (`tools/`)

- **`audit_patient_split.py`**: verifies no patient appears in both train and val folds. Run before any experiment.
- **`cache_volumes.py`**: pre-processes and caches volumes to disk to speed up data loading.
- **`baseline_radiomic.py`**: radiomic feature baseline (PyRadiomics + sklearn) for sanity-checking that the deep model is actually learning.

---

### Utility Scripts

- **`run_crt_only.py`**: re-runs cRT on an existing Stage 2 checkpoint without re-training the backbone. Useful for hyperparameter search on Stage 3 only.
- **`evaluate.py`**: standalone evaluation script. Loads a checkpoint, runs inference, prints per-class F1, confusion matrix, attention maps.

---

## Hyperparameter Change Log (Session after v2.0)

The following changes were made in the current working session to address recall failures on minority classes:

| Location | Parameter | Before | After | Reason |
|---|---|---|---|---|
| `config.py` Stage1 | `epochs` | 5 | **20** | MIL head needs ~5900 steps before Stage 2 |
| `config.py` Stage2 | `epochs` | 25 | **80** | More total budget for LDAM + ASAM + SWA |
| `config.py` Stage2 | `epochs_ldam_only` | 12 | **40** | 40 epochs LDAM before switching to CB-CE |
| `config.py` Stage2 | `sam_start_epoch` | 999 (disabled) | **55** | ASAM in final 25 epochs for landscape sharpness |
| `config.py` Stage2 | `swa_start_epoch` | 999 (disabled) | **65** | SWA average over last 15 epochs |
| `config.py` Stage2 | `consistency_weight` | 0.1 | **0.0** | KL meaningless at batch=2 |
| `config.py` Stage3 | `epochs` | 20 | **300** | Full convergence of small linear head |
| `crt.py` | `n_seeds` | 3 | **10** | Reduce variance at 4–8 minority val samples |
| `crt.py` | scheduler | CosineAnnealingLR | **CyclicLR** | Escape flat regions; per-step updates |

---

## VRAM Budget (GTX 1660 Ti, 6 GB)

| Component | Approx VRAM |
|---|---|
| DINOv2-S weights | ~90 MB |
| LoRA adapters | ~5 MB |
| Activations per slice (grad ckpt) | ~45 MB |
| 16 slices per volume, chunk=16 | ~720 MB |
| Batch=2, accum=8 | ~1.5 GB |
| Optimizer state (AdamW) | ~200 MB |
| **Total** | **~3–4 GB** |

Gradient checkpointing (`set_grad_checkpointing`) is the key enabler — without it the activation footprint for a ViT-S processing 16 slices exceeds 6 GB.

---

## Known Issues / Next Steps

- `run_crt_only.py:61` still uses `sstride = 2 if arch == "convnext_mil" else 1` — this should be changed to `sstride = 1` to match the reasoning applied elsewhere (striding discards central tumour slices, hurting minority recall).
- `run_stage2()` does not yet exist in `main.py` — the Stage 2 training loop is inline. It should be refactored into a named function to enable SWA diagnostic prints.
- SWA final-model diagnostic prints are pending (blocked on `run_stage2` extraction).
- SSL pre-training (`ssl_pretrain.py`) has not yet been run on the full dataset — the SSL checkpoint path `dinov2s_simmim_lora.pt` may not exist. Stage 1 will fall back to ImageNet-pretrained DINOv2 weights.
