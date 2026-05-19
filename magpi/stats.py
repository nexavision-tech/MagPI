# magpi/stats.py
"""
MagPI: Matrix Automated Geospatial Processing Interface
Spatial Statistics Module - Mathematical Verification Engine
Created by www.nexavision.tech
"""

import os
import logging
import numpy as np
from .objects import Result

logger = logging.getLogger("MagPI_Stats")

def ComputeConfusionMatrix(in_ground_truth, in_classified, out_table, value_field="Value"):
    """
    MagPI Translation of arcpy.stats.ComputeConfusionMatrix.
    Computes a pixel-by-pixel spatial error matrix comparing ground truth to predictions.
    Calculates Overall Accuracy, Producer's Accuracy, User's Accuracy, and Kappa Coefficient.
    """
    # Dynamic parameter duck-typing
    if hasattr(in_ground_truth, 'name'): gt_path = in_ground_truth.name
    elif hasattr(in_ground_truth, 'output'): gt_path = in_ground_truth.output
    else: gt_path = str(in_ground_truth)

    if hasattr(in_classified, 'name'): pred_path = in_classified.name
    elif hasattr(in_classified, 'output'): pred_path = in_classified.output
    else: pred_path = str(in_classified)

    logger.info("Initializing Spatial Confusion Matrix Engine...")
    logger.info(f"Ground Truth Reference: {os.path.basename(gt_path)}")
    logger.info(f"Classified Map: {os.path.basename(pred_path)}")

    try:
        import rasterio
        from rasterio.vrt import WarpedVRT
        from rasterio.enums import Resampling

        # Securely read and align datasets in memory
        with rasterio.open(gt_path) as src_gt:
            with rasterio.open(pred_path) as src_pred:
                # Align prediction grid to the ground truth grid dynamically in memory if they mismatch
                if src_pred.shape != src_gt.shape or src_pred.transform != src_gt.transform:
                    logger.info("Grid dimensions or projections mismatch. Auto-aligning via WarpedVRT...")
                    with WarpedVRT(src_pred, crs=src_gt.crs, transform=src_gt.transform, width=src_gt.width, height=src_gt.height, resampling=Resampling.nearest) as vrt:
                        pred_data = vrt.read(1)
                else:
                    pred_data = src_pred.read(1)
                
                gt_data = src_gt.read(1)

        # Flatten arrays for matching
        gt_flat = gt_data.flatten()
        pred_flat = pred_data.flatten()

        # Filter out nodata values (e.g. 255)
        valid_mask = (gt_flat != 255) & (pred_flat != 255)
        gt_valid = gt_flat[valid_mask]
        pred_valid = pred_flat[valid_mask]

        # Identify unique classes
        classes = np.unique(np.concatenate((gt_valid, pred_valid)))
        num_classes = len(classes)
        logger.info(f"Identified {num_classes} distinct classes for matrix comparison: {classes}")

        # Compute confusion matrix array
        matrix = np.zeros((num_classes, num_classes), dtype=np.int64)
        class_to_idx = {val: idx for idx, val in enumerate(classes)}

        for gt_val, pred_val in zip(gt_valid, pred_valid):
            matrix[class_to_idx[gt_val], class_to_idx[pred_val]] += 1

        total_pixels = np.sum(matrix)
        if total_pixels == 0:
            logger.error("No valid pixels found for comparison!")
            return Result(None, status=3)

        # --- STATISTICAL ALGEBRA ENGINE (Hanni Equations) ---
        # Overall Accuracy: Diagonal Sum / Total
        diag_sum = np.trace(matrix)
        overall_accuracy = diag_sum / total_pixels

        # Row and Col sums
        row_sums = np.sum(matrix, axis=1) # Reference/Ground Truth totals
        col_sums = np.sum(matrix, axis=0) # Classified/Prediction totals

        # Kappa Calculation Math
        pe = np.sum((row_sums * col_sums) / total_pixels) / total_pixels
        po = overall_accuracy
        kappa = (po - pe) / (1 - pe) if pe < 1.0 else 1.0

        # Build clean string report to match NexaVision standards
        report = []
        report.append("=====================================================================")
        report.append(":::::: NEXAVISION SPATIAL ACCURACY VERIFICATION REPORT :::::::::::::")
        report.append("=====================================================================")
        report.append(f"Ground Truth: {os.path.basename(gt_path)}")
        report.append(f"Classified Map: {os.path.basename(pred_path)}")
        report.append(f"Total Evaluated Pixels: {total_pixels:,}")
        report.append(f"Overall Accuracy: {overall_accuracy * 100:.2f}%")
        report.append(f"Kappa Coefficient (\u03ba): {kappa:.4f}")
        report.append("---------------------------------------------------------------------")
        
        header_row = f"{'Class':<12} | {'Reference':<10} | {'Classified':<10} | {'Producer Accuracy':<18} | {'User Accuracy':<15}"
        report.append(header_row)
        report.append("-" * len(header_row))

        for idx, val in enumerate(classes):
            gt_total = row_sums[idx]
            pred_total = col_sums[idx]
            correct = matrix[idx, idx]
            
            pa = (correct / gt_total * 100.0) if gt_total > 0 else 0.0
            ua = (correct / pred_total * 100.0) if pred_total > 0 else 0.0
            
            report.append(f"{str(val):<12} | {gt_total:<10,} | {pred_total:<10,} | {pa:.2f}%{'':<11} | {ua:.2f}%")

        report.append("=====================================================================")

        # Log directly to local daemon console
        for line in report:
            logger.info(line)

        # Write clean CSV output
        with open(out_table, 'w') as f:
            f.write("Class,ReferenceTotal,ClassifiedTotal,ProducerAccuracy,UserAccuracy\n")
            for idx, val in enumerate(classes):
                gt_total = row_sums[idx]
                pred_total = col_sums[idx]
                correct = matrix[idx, idx]
                pa = (correct / gt_total) if gt_total > 0 else 0.0
                ua = (correct / pred_total) if pred_total > 0 else 0.0
                f.write(f"{val},{gt_total},{pred_total},{pa:.6f},{ua:.6f}\n")
            f.write(f"OVERALL_ACCURACY,,,{overall_accuracy:.6f},\n")
            f.write(f"KAPPA,,,{kappa:.6f},\n")

        logger.info(f"SUCCESS: Confusion spreadsheet saved to: {out_table}")
        return Result(out_table)

    except Exception as e:
        logger.error(f"Failed to calculate Confusion Matrix: {e}")
        return Result(None, status=3)