# Federated Learning for Breast MRI Subtype Classification

**Authors:** TALEB Youcef & BENSEFIA Yazid
**Institute:** USTHB — Master Bioinformatics 2026
**Supervisor:** Mme Malika MEHDI-SILHADI
**Dataset:** 737 DCE-MRI volumes, 4 molecular subtypes — DOI: [10.5281/zenodo.7956360](https://doi.org/10.5281/zenodo.7956360)

---

## Project Overview

This project classifies breast Dynamic Contrast-Enhanced MRI (DCE-MRI) volumes
into molecular subtypes (Luminal A, Luminal B, HER2, Triple Negative) under
severe class imbalance, and studies how this classifier can be trained across
multiple simulated hospitals without sharing raw patient data. The classifier
is a 2.5D Multiple Instance Learning (MIL) model: each volume is decomposed into
axial slices, a 2D backbone (ConvNeXt-Nano or DINOv2-S/14) encodes every slice,
and a Gated Attention MIL head pools the slice features into one volume-level
representation. Training follows a three-stage pipeline (head warmup → joint
fine-tuning → classifier retraining) specifically engineered to recover
minority-class recall on the long-tailed label distribution.

The federated learning component simulates a three-hospital network and compares
four aggregation strategies — FedAvg, Momentum-FedAvg, SCAFFOLD, and the novel
FedSCRT — on a binary clinical task (Luminal vs Non-Luminal). The central privacy
guarantee is that only model weights, never raw imaging data, cross the hospital
boundary. FedSCRT, the project's main contribution, shares a single centrally
trained feature extractor while each hospital retrains only a small balanced
classification head, which are then federated-averaged. This decouples expensive
representation learning from privacy- and imbalance-sensitive head calibration.

---

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd federated-learning-model

# 2. Create and activate the conda environment
conda create -n mri_thesis python=3.10
conda activate mri_thesis

# 3. Install dependencies
pip install torch torchvision timm peft
pip install SimpleITK numpy scikit-learn pandas matplotlib
pip install pyradiomics            # radiomics baseline / fusion
pip install fastapi uvicorn python-multipart   # inference web service
pip install monai                  # optional: stronger 3D augmentation
```

> **GPU note:** The pipeline is tuned for a GTX 1660 Ti (6 GB VRAM) via gradient
> checkpointing, chunked slice inference, and gradient accumulation. It runs on
> CPU but training will be very slow.

---

## Environment Setup

```bash
conda activate mri_thesis
```

Key environment variables (all hyperparameters are overridable — see `config.py`):

| Variable | Purpose | Typical value |
|---|---|---|
| `MRI_NUM_CLASSES` | `4` for subtype, `2` for binary FL task | `2` |
| `NPY_CACHE_DIR` | Directory of pre-built `.npy` volume cache | path to `npy_cache/` |
| `HF_HUB_OFFLINE` | Use cached HuggingFace weights (no download) | `1` |
| `MRI_JSON_PATH` | Path to `dataset.json` | dataset path |
| `MRI_DATA_DIR` | Directory of `.mha` volumes | dataset path |

PowerShell example:

```powershell
$env:MRI_NUM_CLASSES = "2"
$env:HF_HUB_OFFLINE  = "1"
$env:NPY_CACHE_DIR   = "D:\...\npy_cache"
```

---

## Pipeline Order

Run the scripts in this order:

```
build_npy_cache.py  →  main.py  →  run_crt_only.py  →  fl_train.py
   (cache volumes)     (train       (tune Stage 3       (federated
                        centrally)    only, optional)     experiments)
```

1. **`build_npy_cache.py`** — preprocess and cache all 737 volumes once (~30× faster loads).
2. **`main.py`** — train the centralised model (Stages 1–3) and save fold checkpoints.
3. **`run_crt_only.py`** — *(optional)* re-tune the Stage 3 classifier head on an existing checkpoint.
4. **`fl_train.py`** — run the federated experiments using the centralised Stage 2 backbone.

---

## File Structure

| File | Purpose | When to run |
|---|---|---|
| `config.py` | Central hyperparameter configuration (env-overridable) | imported (never run directly) |
| `model.py` | ConvNeXt / DINOv2 + GatedAttentionMIL architectures | imported |
| `losses.py` | LDAM, class-balanced CE, focal, consistency losses | imported |
| `data_loader.py` | Dataset classes, NPY cache, 2.5D slice extraction | imported |
| `image_process.py` | Volume preprocessing + 3D augmentation | imported |
| `crt.py` | Stage 3 classifier retraining (cRT) | imported by `main.py` |
| `build_npy_cache.py` | Pre-cache all volumes as `.npy` | **once, first** |
| `main.py` | Three-stage centralised training pipeline | after caching |
| `run_crt_only.py` | Re-run Stage 3 on an existing checkpoint | optional, after `main.py` |
| `extract_radiomics.py` | PyRadiomics feature extraction (baseline/fusion) | before `fusion_eval.py` |
| `fl_train.py` | Federated learning simulation (4 strategies) | after `main.py` |
| `run_fl_all.py` | Batch-run all FL experiments with logging | runs `fl_train.py` |
| `save_fedscrt_model.py` | Export production FedSCRT model for the web app | after FL experiments |
| `inference_service.py` | FastAPI inference service (`/predict`, `/docs`) | serves the saved model |
| `Eval_binary_fold0.py` | Evaluate a single binary checkpoint on fold 0 | after `main.py` (binary) |
| `evaluate.py` | Full 5-fold ensemble evaluation + figures | after all folds trained |
| `fusion_eval.py` | Deep + radiomics late-fusion evaluation | after `extract_radiomics.py` |

---

## Three-Stage Training Pipeline (`main.py`)

| Stage | Name | What trains | Key techniques |
|---|---|---|---|
| 1 | Head warmup | MIL head + classifier (backbone frozen) | Class-balanced CE, cosine warmup |
| 2 | Joint fine-tune | LoRA/backbone + MIL + head | LDAM → CB-CE, ASAM, SWA, EMA, MixUp |
| 3 | cRT | Linear head only (backbone re-frozen) | Class-balanced sampler, best-of-10 seeds |

---

## Results Summary

### Federated Learning — Binary Task (Luminal vs Non-Luminal), fold 0

| Strategy | Dirichlet α | Macro F1 | AUC-ROC | Accuracy |
|---|---|---|---|---|
| FedAvg | 0.5 | 0.4286 | 0.5654 | 0.7500 |
| Momentum-FedAvg | 0.5 | 0.4286 | 0.4218 | 0.7500 |
| SCAFFOLD | 0.5 | 0.2000 | 0.5000 | 0.2500 |
| **FedSCRT** | **0.5** | **0.6289** | **0.6874** | **0.7027** |
| FedAvg | 100 (near-IID) | 0.4286 | 0.5622 | 0.7500 |
| SCAFFOLD | 100 (near-IID) | 0.4286 | 0.3702 | 0.7500 |

FedSCRT is the only federated strategy to clearly exceed the trivial
majority-class baseline on macro F1, confirming that decoupling the shared
backbone from locally balanced heads is effective under hospital data
heterogeneity.

### Centralised Reference Results

| Model | Macro F1 | AUC | Notes |
|---|---|---|---|
| Centralised binary (5-fold ensemble) | 0.6507 | 0.6691 | `evaluate.py` ensemble |
| Centralised 4-class (5-fold ensemble) | 0.3424 | 0.6009 | `final_4class_results.json` |

*All metrics are read from the `results/` JSON files produced by the pipeline.*

---

## Privacy Guarantee

In all federated experiments, **only model weights are transmitted between
hospitals — raw patient imaging data never leaves its source**
(`rawDataTransmitted = 0`). This is the defining property of the federated
setting and the core motivation for the FedSCRT design.
