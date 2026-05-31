# 02_raster_math_ndvi.py
# MagPI Open-Source Geospatial Framework
# Demonstrates Map Algebra using MagPI's internal Image Analyst (IA) module.

import magpi as arcpy
from magpi.ia import RasterMath
import os

# --- Set Global Environments ---
arcpy.env.workspace = "."
arcpy.env.scratchWorkspace = "."
arcpy.env.outputWorkspace = "."
arcpy.env.overwriteOutput = True

# --- Inputs ---
# 4-band Sentinel-2 GeoTIFF where Band 3 is Red and Band 4 is NIR
input_multispectral = "sentinel2_optical.tif"
output_ndvi = "ndvi_output.tif"

def calculate_ndvi():
    arcpy.AddMessage("Starting NDVI Calculation using MagPI Map Algebra...")
    
    in_path = os.path.join(arcpy.env.workspace, input_multispectral)
    if not os.path.exists(in_path):
        arcpy.AddWarning(f"Sample data {input_multispectral} not found. Ensure raster exists in workspace.")
        return

    # Execute Map Algebra natively using the IA Module
    # We reference Band 4 (NIR) as b4 and Band 3 (Red) as b3
    arcpy.AddMessage("Executing Map Algebra expression: (b4 - b3) / (b4 + b3)")
    RasterMath(
        raster_a=in_path,
        raster_b=None,
        expression="(b4 - b3) / (b4 + b3)",
        out_raster=output_ndvi
    )
    
    arcpy.AddMessage(f"NDVI successfully saved to {output_ndvi}")
    
    # Build Pyramids for fast rendering in MagPI Canvas
    arcpy.management.BuildPyramidsAndStats(output_ndvi)
    arcpy.AddMessage("Statistics and pyramids built for NDVI raster.")

if __name__ == "__main__":
    calculate_ndvi()
