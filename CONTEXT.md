# FedMRI — Domain Context

## Core concept

Federated learning (FL) allows multiple hospitals to collaboratively train a shared AI
model without any hospital sharing its raw patient data. Only model weight updates
(gradient deltas) travel between hospitals and the aggregation server.

This app makes that concept tangible through two portals.

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

## Domain vocabulary

| Term | Definition |
|---|---|
| **Silo** | A hospital's local data boundary. Data inside a silo never leaves. |
| **FL round** | One cycle: all clients train locally → send weight deltas → server aggregates → global model updates. |
| **FedAvg** | McMahan et al. 2017 aggregation: weighted average of client weights by dataset size. |
| **FedProx** | Li et al. 2020 aggregation: adds proximal regularisation term μ‖w−w_global‖² to local objective. Better for non-IID data. |
| **Non-IID** | Non-independent and identically distributed. Each hospital's patient population has a different subtype distribution — Hospital A may see mostly Luminal A, Hospital B more Triple Negative. |
| **Molecular subtype** | PAM50 gene expression classification of breast cancer: Luminal A, Luminal B, HER2-enriched, Triple Negative. |
| **DCE-MRI** | Dynamic contrast-enhanced MRI — the imaging modality used. 3D volumetric scans (.mha format). |
| **MIL** | Multiple Instance Learning — the GatedAttentionMIL head treats each 2D slice as an instance and learns which slices matter most. |
| **Attention map** | Per-pixel importance weights output by GatedAttentionMIL, upsampled to 224×224, shown as a heatmap overlay on the MRI slice. |
| **Active learning (AL)** | When a doctor disputes a prediction, the corrected label is used to trigger a fine-tune step, improving the model. |
| **Weight delta** | The difference between a client's locally trained weights and the global model weights: Δw = w_local − w_global. Only this delta is transmitted. |
| **Privacy budget (ε)** | Differential privacy parameter. Lower ε = stronger privacy guarantee but lower accuracy. Simulated as 0.1 per round in mock mode. |

## Molecular subtypes — clinical facts

| Subtype | ER | PR | HER2 | Ki-67 | Prognosis |
|---|---|---|---|---|---|
| Luminal A | + | + | − | Low | Best — slow-growing, hormone-sensitive |
| Luminal B | + | + | ± | High | Moderate — faster-growing |
| HER2-enriched | − | − | + | High | Targeted therapy available (trastuzumab) |
| Triple Negative | − | − | − | High | Worst — chemotherapy only, no targeted therapy |

## Model architecture (source: ../fl-model/model.py)

Primary: `Dinov2MILClassifier` — frozen DINOv2-S/14 per-slice encoder +
`GatedAttentionMIL` head (Ilse et al. 2018). Input: 2.5D slices extracted from 3D
.mha volumes. Output: 4-class logits + per-slice attention weights.

Fallback: `R3D18Classifier` — R3D-18 video backbone adapted for grayscale.

Training: WeightedRandomSampler (class-balanced batches), progressive unfreezing,
label smoothing 0.1, AdamW, weight decay 0.05.

## Real performance numbers (update when final training completes)

| Strategy | F1 macro | Accuracy | Luminal A F1 | HER2 F1 |
|---|---|---|---|---|
| Centralized (baseline) | 0.46 | 0.59 | 0.71 | 0.13 |
| FedAvg (10 rounds) | 0.38 | 0.52 | 0.68 | 0.09 |
| FedProx (10 rounds) | 0.41 | 0.55 | 0.71 | 0.11 |

**Note**: The biological ceiling for molecular subtype prediction from MRI alone is ~0.75
F1 macro. Even expert radiologists achieve ~0.60–0.65. The FL contribution is not the
absolute F1 — it is demonstrating that federated training approaches centralized
performance without data sharing.

## Architecture decisions

See `docs/adr/` for rationale on:
- ADR-001: Why FastAPI for ML service (not embedding PyTorch in NestJS)
- ADR-002: Why FL Coordinator is a separate service (not a NestJS module)
- ADR-003: Why mock-to-prod uses interface abstraction (not feature flags)
- ADR-004: Federated optimization objective + live FL test
