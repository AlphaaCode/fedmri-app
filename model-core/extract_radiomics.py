"""
extract_radiomics.py
====================
Standalone radiomic feature extraction for breast MRI molecular subtype classification.

Extracts classical hand-crafted radiomic features (PyRadiomics) from each MRI
volume to serve as (a) a sanity-check baseline confirming the deep model learns
beyond simple texture statistics, and (b) the radiomics half of the deep +
radiomics fusion experiment (fusion_eval.py).

Feature classes extracted:
    firstorder, shape, glcm (+ glrlm, gldm in the helper function)
A foreground mask (intensity > 0.01) is computed per volume and cropped to its
bounding box before extraction.

Output:
    results/radiomics_features.csv
    Columns: patient_id, label, then one column per radiomic feature.
    NOTE: the 'label' column must be dropped before training any classifier on
    these features — see the data-leakage warning in fusion_eval.py.

Pipeline position:
    raw .mha files → THIS MODULE → results/radiomics_features.csv → fusion_eval.py

Authors:  TALEB Youcef & BENSEFIA Yazid — USTHB Bioinformatics 2026
Supervisor: Mme Malika MEHDI-SILHADI
Dataset:  737 DCE-MRI volumes, DOI: 10.5281/zenodo.7956360
"""
from __future__ import annotations
import json
import os
import sys
import csv
from pathlib import Path
from typing import Optional
import logging

import numpy as np
import SimpleITK as sitk
from radiomics import featureextractor

from config import CFG
from image_process import preprocess_raw

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def extract_radiomics_features(volume: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    """
    Extract radiomic features from a volume using PyRadiomics.

    Args:
        volume: preprocessed volume (64, 128, 128), values in [0, 1]
        mask: binary mask (64, 128, 128), all ones for whole-volume analysis

    Returns:
        dict mapping feature names to values
    """
    # Convert to SimpleITK images
    vol_sitk = sitk.GetImageFromArray(volume)
    mask_sitk = sitk.GetImageFromArray(mask.astype(np.uint8))

    # Initialize feature extractor with selected classes
    settings = {
        "binWidth": 25,
        "resamplingPixelSpacing": None,
        "interpolator": "sitkLinear",
        "enableCExtensions": True,
    }

    extractor = featureextractor.RadiomicsFeatureExtractor(
        **settings,
        useNumpyArray=True,
        force2Ddimension=False,  # keep 3D analysis
    )

    # Enable only specific feature classes to speed up extraction
    extractor.disableAllFeatures()
    extractor.enableFeatureClassByName("firstorder")
    extractor.enableFeatureClassByName("shape")
    extractor.enableFeatureClassByName("glcm")
    extractor.enableFeatureClassByName("glrlm")
    extractor.enableFeatureClassByName("gldm")

    features = extractor.execute(vol_sitk, mask_sitk)

    # Filter to keep only feature values (exclude diagnostics)
    feature_dict = {}
    for key, val in features.items():
        if key.startswith("original_"):
            feature_dict[key] = float(val)

    return feature_dict


def main():
    """
    Extract radiomic features from all volumes and write results/radiomics_features.csv.

    Two-pass approach: first extract features and collect the union of feature
    names (PyRadiomics may emit different features per volume), then write a CSV
    with a consistent header. Volumes that fail extraction are logged and skipped.
    """
    # Ensure output directory exists
    results_dir = Path(CFG.results_dir)
    results_dir.mkdir(parents=True, exist_ok=True)
    output_csv = results_dir / "radiomics_features.csv"

    # Load dataset
    logger.info(f"Loading dataset from {CFG.data_json}")
    with open(CFG.data_json, "r") as f:
        data = json.load(f)

    # Support nnUNet-style dataset.json with a top-level "training" key
    if isinstance(data, dict) and "training" in data:
        data = data["training"]
    if not isinstance(data, list):
        raise ValueError("dataset.json must be a list of samples or contain a 'training' list")

    logger.info(f"Dataset has {len(data)} volumes")

    # Initialize feature extractor once before processing
    params = {
        'binWidth': 25,
        'resampledPixelSpacing': [3, 3, 3],  # downsample to 3mm (from 0.8mm)
        'interpolator': 'sitkLinear',
        'enableCExtensions': True,
    }
    extractor = featureextractor.RadiomicsFeatureExtractor(**params)

    # Keep only fast feature classes (remove glrlm, glszm, ngtdm, gldm)
    extractor.disableAllFeatures()
    extractor.enableFeatureClassByName('firstorder')
    extractor.enableFeatureClassByName('glcm')
    extractor.enableFeatureClassByName('shape')

    # Collect all feature names first (to write consistent header)
    all_feature_names = set()
    failed_volumes = []
    feature_data = []

    # First pass: extract features and collect feature names
    for idx, entry in enumerate(data):
        if (idx + 1) % 10 == 0:
            logger.info(f"Processing volume {idx + 1}/{len(data)}")

        patient_id = entry.get("patient_id")
        image_path = entry.get("image")
        label = entry.get("Molecular_subtype")

        if image_path is None:
            logger.warning(f"[{idx}] {patient_id}: missing 'image' key")
            failed_volumes.append((patient_id, "missing image path"))
            continue

        # Full path to MHA file
        rel_path = str(image_path).replace("\\", "/")
        if rel_path.startswith("imagesTr/"):
            rel_path = rel_path.split("imagesTr/", 1)[1]
        root = Path(CFG.data_root).expanduser()
        path = Path(rel_path)
        full_path = path if path.is_absolute() else (root / path)
        if patient_id is None:
            patient_id = full_path.stem

        try:
            # Handle _0000 suffix fallback for file paths
            p = Path(full_path)
            if not p.exists():
                alt = p.with_name(p.stem + "_0000" + p.suffix)
                if alt.exists():
                    full_path = alt
                else:
                    raise FileNotFoundError(f"Neither {p} nor {alt} exists")

            sitk_image = sitk.ReadImage(str(full_path), sitk.sitkFloat32)

            # Create foreground mask: non-background voxels (intensity > 0.01)
            # This is more appropriate than all-ones and PyRadiomics accepts it
            sitk_mask = sitk.BinaryThreshold(
                sitk_image,
                lowerThreshold=0.01,
                upperThreshold=1e9,
                insideValue=1,
                outsideValue=0
            )
            sitk_mask = sitk.Cast(sitk_mask, sitk.sitkUInt8)

            import numpy as np
            mask_arr = sitk.GetArrayViewFromImage(sitk_mask)
            n_foreground = int((mask_arr == 1).sum())
            print(f"  Mask foreground voxels: {n_foreground}")
            if n_foreground == 0:
                raise ValueError("Mask is empty after thresholding")

            # Crop image and mask to bounding box of foreground
            label_stats = sitk.LabelShapeStatisticsImageFilter()
            label_stats.Execute(sitk_mask)
            bbox = label_stats.GetBoundingBox(1)  # (x,y,z,sx,sy,sz)
            sitk_image = sitk.RegionOfInterest(sitk_image, bbox[3:], bbox[:3])
            sitk_mask = sitk.RegionOfInterest(sitk_mask, bbox[3:], bbox[:3])

            features_raw = extractor.execute(sitk_image, sitk_mask, label=1)

            # Filter to keep only feature values (exclude diagnostics)
            features = {}
            for key, val in features_raw.items():
                if key.startswith("original_"):
                    features[key] = float(val)

            all_feature_names.update(features.keys())

            feature_data.append({
                "patient_id": patient_id,
                "label": label,
                "features": features,
            })

        except Exception as e:
            logger.warning(f"[{idx}] {patient_id}: {type(e).__name__}: {e}")
            failed_volumes.append((patient_id, str(e)))

    logger.info(f"Successfully extracted features from {len(feature_data)} volumes")
    if failed_volumes:
        logger.info(f"Failed on {len(failed_volumes)} volumes:")
        for pid, err in failed_volumes:
            logger.info(f"  {pid}: {err}")

    # Sort feature names for consistent ordering
    sorted_feature_names = sorted(all_feature_names)

    # Write CSV
    logger.info(f"Writing results to {output_csv}")
    with open(output_csv, "w", newline="") as f:
        writer = csv.writer(f)

        # Header
        header = ["patient_id", "label"] + sorted_feature_names
        writer.writerow(header)

        # Data rows
        for item in feature_data:
            row = [item["patient_id"], item["label"]]
            for fname in sorted_feature_names:
                row.append(item["features"].get(fname, ""))
            writer.writerow(row)

    logger.info(f"Saved {len(feature_data)} rows to {output_csv}")
    logger.info(f"Features extracted: {len(sorted_feature_names)}")


if __name__ == "__main__":
    main()
