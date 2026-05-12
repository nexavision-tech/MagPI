# test_magpi.py
import magpi as arcpy
import os

arcpy.AddMessage("--- IGNITING MAGPI CORE ENGINE ---")

# 1. Test Environment Singleton
arcpy.env.workspace = "./test_data"
arcpy.AddMessage(f"Global Workspace locked to: {arcpy.env.workspace}")

# Define relative paths from your tree
seamlines_shp = "test_data/2022 Pilot Tiles/Orange County 3 Inch/3in/Seamlines/Orange_3in_Pilot_Seamlines.shp"
buffer_out = "test_data/Seamlines_Buffered_10m.shp"
sample_tif = "test_data/2022 Pilot Tiles/Orange County 3 Inch/3in/GeoTIFF/2022_480536.tif"

# 2. Test Vector Engine & Data Management
if arcpy.Exists(seamlines_shp):
    arcpy.AddMessage(f"Target Acquired: {seamlines_shp}")
    
    # Test GetCount and duck-typed indexing result[0]
    count_result = arcpy.management.GetCount(seamlines_shp)
    arcpy.AddMessage(f"Seamline Feature Count: {count_result[0]}")

    # Test Vector Math
    arcpy.AddMessage("Executing Vector Buffer (GeoPandas/Shapely)...")
    buf_result = arcpy.analysis.Buffer(seamlines_shp, buffer_out, "10 Meters")
    arcpy.AddMessage(f"Buffer Success. Wrote to: {buf_result.getOutput(0)}")
else:
    arcpy.AddError("Seamlines shapefile not found.")

# 3. Test Raster Engine
if arcpy.Exists(sample_tif):
    arcpy.AddMessage(f"Target Acquired: {sample_tif}")
    
    # Test Raster Math
    arcpy.AddMessage("Executing Raster Slope Math (Rasterio/NumPy)...")
    slope_result = arcpy.sa.Slope(sample_tif, "DEGREE", 1)
    arcpy.AddMessage(f"Slope Success. Result Object: {slope_result[0]}")
else:
    arcpy.AddError("Pilot Tile GeoTIFF not found.")

# 4. Test The Interceptor
arcpy.AddMessage("Testing Fallback Interceptor on fake legacy tool...")
arcpy.SomeProprietaryBlackBoxTool("input_data")

arcpy.AddMessage("--- MAGPI TEST SEQUENCE COMPLETE ---")
