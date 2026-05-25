import sys
import os
sys.path.insert(0, os.path.abspath('.'))
import magpi as arcpy

def run_qaqc_wfs():
    print("\n--- [ MagPI QAQC: Sovereign WFS Data Pulls ] ---")
    
    # 1. Setup Global Environments
    arcpy.env.workspace = "./magpi_workspace"
    arcpy.env.scratchWorkspace = "./magpi_scratch"
    arcpy.env.outputWorkspace = "./magpi_output"
    arcpy.env.overwriteOutput = True
    
    # Very small 1x1km AOI in Oregon
    aoi_extent = arcpy.Extent(-122.0, 44.0, -121.99, 44.01)

    print("\n[STEP 1] Testing NLCD Pull...")
    try:
        nlcd_result = arcpy.wfs.PullNLCD(extent=aoi_extent, out_raster="nlcd_test.tif", year=2021)
        if nlcd_result and nlcd_result.output and os.path.exists(nlcd_result.output):
            print(f"[OK] NLCD Pull Success: {nlcd_result.output}")
        else:
            print("[FAILED] NLCD Pull returned no file.")
    except Exception as e:
        print(f"[FAILED] NLCD Pull Exception: {e}")

    print("\n[STEP 2] Testing USGS DEM Pull...")
    try:
        dem_result = arcpy.wfs.PullUSGSDem(extent=aoi_extent, out_raster="dem_test.tif", resolution="10m")
        if dem_result and dem_result.output and os.path.exists(dem_result.output):
            print(f"[OK] USGS DEM Pull Success: {dem_result.output}")
        else:
            print("[FAILED] USGS DEM Pull returned no file.")
    except Exception as e:
        print(f"[FAILED] USGS DEM Pull Exception: {e}")

    print("\n[STEP 3] Testing US Census TIGER Pull...")
    try:
        tiger_result = arcpy.wfs.PullCensus(extent=aoi_extent, out_features="roads_test.shp", layer="roads")
        if tiger_result and tiger_result.output and os.path.exists(tiger_result.output):
            print(f"[OK] Census TIGER Pull Success: {tiger_result.output}")
        else:
            print("[FAILED] Census TIGER Pull returned no file.")
    except Exception as e:
        print(f"[FAILED] Census TIGER Pull Exception: {e}")

    print("\n--- [ WFS QAQC COMPLETE ] ---")

if __name__ == "__main__":
    run_qaqc_wfs()
