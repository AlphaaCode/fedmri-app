# Project Context: Breast Cancer MRI Molecular Subtype Classification

## 1. Project Overview
The goal of this project is to classify four breast cancer molecular subtypes (Luminal A, Luminal B, HER2-Enriched, Triple Negative) from single-channel 3D MRI volumes using deep learning. The dataset is small (~737 total samples) and suffers from extreme class imbalance (Class 0: 481 vs Class 2: 46).

## 2. Technical Journey & Evolution

### Phase 1: Foundation & Infrastructure
- **Initial Setup**: Started with a custom 3D CNN architecture. 
- **The Challenge**: Training was unstable; the model would "collapse" and predict only the majority class. Accuracies were hovering near random guessing (25%).
- **Hardware Constraint**: NVIDIA GTX 1660 Ti (6GB VRAM) limited the batch size to **2**. This caused `BatchNorm3d` to fail because statistics cannot be calculated from just two samples.

### Phase 2: Stability & Transfer Learning
- **Backbone**: Switched to a pretrained **R3D-18** (Kinetics-400), adapting the first layer for grayscale input.
- **BatchNorm Fix**: Overrode the `model.train()` method to force BatchNorm layers into `.eval()` mode even during training. This prevented the tiny batch size from corrupting pretrained statistics.
- **Normalization**: Replaced `BatchNorm1d` in the classifier head with `LayerNorm`, which is batch-size independent.

### Phase 3: Balancing & Unfreezing
- **Sampling**: Implemented `WeightedRandomSampler` with `SAMPLER_ALPHA=1.0` to ensure a perfectly balanced 25/25/25/25 class distribution in every training batch.
- **Progressive Unfreezing**: Implemented a 3-stage schedule:
    - Stage 1: Classifier head only (Warmup).
    - Stage 2: Classifier + Layer 4.
    - Stage 3: Classifier + Layer 4 + Layer 3.
- **Loss Function**: Switched to `CrossEntropyLoss` with `label_smoothing=0.1` to handle the noise in medical labeling.

### Phase 4: Overcoming Overfitting (Current State)
- **Problem**: The model reached a Train F1 of **0.49** but Val F1 stayed at **0.18-0.25**, indicating severe memorization of the training set.
- **Solution (Regularization)**: 
    - Increased **Dropout to 0.5** in the multi-layer classifier head.
    - Increased **Weight Decay to 0.05** in the AdamW optimizer.
    - Dialed back overly aggressive data augmentations (e.g., 3D Cutout) to allow the model to see cleaner tumor textures while maintaining spatial diversity.

## 3. Evaluation Toolkit
- **evaluate.py**: A dedicated script that generates:
    1. Normalized Confusion Matrix (Heatmap).
    2. Precision/Recall/F1 Bar Charts.
    3. Training History Curves (Loss/Acc/F1).
    4. One-vs-Rest ROC Curves with AUC calculations.

## 4. Current Target
**Target: F1-Macro 0.50**
We are looking for the model to generalize beyond the majority class and capture the specific radiomic signatures of the rarer HER2 and Triple Negative subtypes.

## 5. File Structure
- `main.py`: Core training pipeline, logging, and history management.
- `model.py`: R3D-18 architecture with LayerNorm/Dropout head and BatchNorm freeze logic.
- `image_process.py`: Optimized 3D preprocessing and augmentation pipeline.
- `data_loader.py`: MRI dataset management and sampling.
- `evaluate.py`: Post-training analysis script.
- `results/history.json`: Epoch-by-epoch metrics for analysis.
