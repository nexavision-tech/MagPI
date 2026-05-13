# test_noaa_pipeline.py
import magpi as arcpy
import os
import glob

arcpy.AddMessage("--- IGNITING MAGPI NOAA PIPELINE ---")

# 1. Configure Global Environment
arcpy.env.workspace = "./test_data/noaa_florida"
arcpy.env.overwriteOutput = True
arcpy.AddMessage(f"Workspace locked to: {arcpy.env.workspace}")

# 2. Dynamically locate the extracted LAZ file
laz_files = glob.glob(os.path.join(arcpy.env.workspace, "**", "*.laz"), recursive=True)

if not laz_files:
    arcpy.AddError("No LAZ files found! Check extraction.")
else:
    target_laz = laz_files[0]
    arcpy.AddMessage(f"Target Acquired (Lidar): {target_laz}")
    
    # --- STAGE 1: 3D ANALYST (Point Cloud to DEM) ---
    out_dem = os.path.join(arcpy.env.workspace, "florida_lidar_dem.tif")
    arcpy.AddMessage("Executing 3D Analyst: LasDatasetToRaster...")
    result_dem = arcpy.ddd.LasDatasetToRaster(target_laz, out_dem, sampling_value=3.0)
    
    # --- STAGE 2: QA/QC (Describe Object) ---
    if arcpy.Exists(out_dem):
        desc = arcpy.Describe(out_dem)
        arcpy.AddMessage(f"SUCCESS: DEM Generated.")
        
        # --- STAGE 3: SPATIAL ANALYST (Chaining Tools) ---
        arcpy.AddMessage("Chaining Spatial Analyst: Calculating Slope...")
        slope_result = arcpy.sa.Slope(out_dem)
        arcpy.AddMessage(f"Slope calculation complete.")
        
        # =====================================================================
        # STAGE 4: EXTRACT BY MASK (Automated Slice)
        # =====================================================================
        # Dynamically find the NOAA clipping polygon
        mask_files = glob.glob(os.path.join(arcpy.env.workspace, "**", "*clippoly.shp"), recursive=True)
        
        if mask_files:
            mask_shp = mask_files[0]
            arcpy.AddMessage(f"Target Acquired (Mask): {mask_shp}")
            arcpy.AddMessage("Executing Spatial Analyst: ExtractByMask...")
            
            # Slice the DEM to the exact NOAA boundary!
            clipped_dem = arcpy.sa.ExtractByMask(out_dem, mask_shp)
            if clipped_dem and clipped_dem.array.size > 0:
                out_clip = os.path.join(arcpy.env.workspace, "florida_dem_clipped.tif")
                clipped_dem.save(out_clip)
                arcpy.AddMessage(f"Extraction Complete! Saved to: {out_clip}")
        else:
            arcpy.AddWarning("Clipping Polygon not found. Skipping ExtractByMask phase.")

arcpy.AddMessage("--- MAGPI PIPELINE SEQUENCE COMPLETE ---")
