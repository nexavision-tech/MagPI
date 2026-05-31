# 03_dynamic_projection.py
# MagPI Open-Source Geospatial Framework
# Demonstrates reprojection of Raster data

import magpi as arcpy
import os

# --- Set Global Environments ---
arcpy.env.workspace = "."
arcpy.env.scratchWorkspace = "."
arcpy.env.outputWorkspace = "."
arcpy.env.overwriteOutput = True

# --- Inputs ---
input_raster = "sentinel2_optical.tif"
target_crs = "EPSG:32617"  # UTM Zone 17N
output_raster = "sentinel2_projected_utm17n.tif"

def project_raster_demo():
    arcpy.AddMessage(f"Starting raster projection to {target_crs}...")
    
    in_path = os.path.join(arcpy.env.workspace, input_raster)
    if not os.path.exists(in_path):
        arcpy.AddWarning(f"Sample data {input_raster} not found. Ensure raster exists in workspace.")
        return

    # Project the Raster
    # MagPI automatically handles explicit WKT embedding and color interpretation transfer!
    arcpy.management.ProjectRaster(
        in_raster=in_path,
        out_raster=output_raster,
        out_crs=target_crs,
        resampling_type="BILINEAR"
    )
    
    # Verify the new CRS
    import rasterio
    with rasterio.open(output_raster) as src:
        arcpy.AddMessage(f"Projection complete. New Spatial Reference: {src.crs}")
    
    # Bake Pyramids
    arcpy.management.BuildPyramidsAndStats(output_raster)
    arcpy.AddMessage("Pyramids built successfully.")

if __name__ == "__main__":
    project_raster_demo()
