# test_wfs_tiger.py
import magpi as arcpy
import os
import glob

arcpy.AddMessage("--- IGNITING MAGPI TIGER & ZONAL STATS PIPELINE ---")

# 1. Set Environment
arcpy.env.workspace = "./test_data/noaa_florida"
arcpy.env.overwriteOutput = True
# Set our target CRS to match the Lidar (Florida East State Plane, EPSG:6438)
arcpy.env.outputCoordinateSystem = 6438 

# ---------------------------------------------------------
# STAGE 1: WFS TIGER PULL (Direct from Census!)
# ---------------------------------------------------------
tracts_shp = os.path.join(arcpy.env.workspace, "Orange_County_Tracts_2020.shp")
arcpy.AddMessage("STAGE 1: Reaching out to US Census TIGER VFS...")
# State 12 = FL, County 095 = Orange County
arcpy.wfs.GetCensusTracts(12, 95, 2020, tracts_shp)

if not arcpy.Exists(tracts_shp):
    arcpy.AddError("Failed to pull Census Tracts.")
    exit()

# ---------------------------------------------------------
# STAGE 2: VECTOR ANALYSIS (CLIP)
# ---------------------------------------------------------
arcpy.AddMessage("STAGE 2: Locating NOAA clipping footprint...")
mask_files = glob.glob(os.path.join(arcpy.env.workspace, "**", "*clippoly.shp"), recursive=True)

clipped_tracts = os.path.join(arcpy.env.workspace, "Orange_County_Tracts_Clipped.shp")

if mask_files:
    mask_shp = mask_files[0]
    arcpy.AddMessage(f"Clipping Census Tracts to NOAA footprint: {mask_shp}")
    arcpy.analysis.Clip(tracts_shp, mask_shp, clipped_tracts)
else:
    arcpy.AddWarning("No NOAA clipping polygon found. Using full county tracts.")
    clipped_tracts = tracts_shp

# ---------------------------------------------------------
# STAGE 3: SPATIAL ANALYST (ZONAL STATS)
# ---------------------------------------------------------
dem_raster = os.path.join(arcpy.env.workspace, "florida_lidar_dem.tif")
out_table = os.path.join(arcpy.env.workspace, "Tract_Elevation_Stats.csv")

if arcpy.Exists(dem_raster) and arcpy.Exists(clipped_tracts):
    arcpy.AddMessage("STAGE 3: Running Zonal Statistics (Vector/Raster Integration)...")
    # TIGER data uses 'GEOID' as the unique identifier for census tracts
    arcpy.sa.ZonalStatisticsAsTable(clipped_tracts, "GEOID", dem_raster, out_table)
    arcpy.AddMessage("SUCCESS: Statistical Intelligence Extracted to CSV!")
else:
    arcpy.AddWarning("Lidar DEM not found. Did you run test_noaa_pipeline.py first?")
    exit()

# ---------------------------------------------------------
# STAGE 4: DATA MANAGEMENT (JOIN FIELD)
# ---------------------------------------------------------
if arcpy.Exists(clipped_tracts) and arcpy.Exists(out_table):
    arcpy.AddMessage("STAGE 4: Binding Zonal Stats CSV back to the Shapefile...")
    # Permanently inject the CSV table data into the Shapefile's DBF using 'GEOID'
    arcpy.management.JoinField(clipped_tracts, "GEOID", out_table, "GEOID")
    arcpy.AddMessage("SUCCESS: The Shapefile is now carrying the Raster statistics!")

arcpy.AddMessage("--- MAGPI PIPELINE SEQUENCE COMPLETE ---")