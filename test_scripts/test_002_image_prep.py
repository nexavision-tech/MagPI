import os
import sys
import logging

print("\n--- INITIATING MAGPI 0.0.2 IMAGE PREP TEST ---")

try:
    import magpi as arcpy
    print("[PASS] MagPI Matrix engaged.")
except ImportError as e:
    print(f"[FAIL] MagPI import failed: {e}")
    sys.exit(1)

# Set the workspace to your NOAA data folder
workspace_dir = os.path.join(".", "test_data", "noaa_florida")
arcpy.env.workspace = workspace_dir
arcpy.env.overwriteOutput = True

# The Target 4-Band Raster
target_raster = os.path.join(workspace_dir, "2021_4BandImagery_Florida_J1378560tR0_C0.tif")

# Check if file exists using our custom core script
if not arcpy.Exists(target_raster):
    print(f"[FAIL] Could not find the NOAA 4-Band raster at: {target_raster}")
    sys.exit(1)
else:
    print(f"[PASS] Located target raster: {os.path.basename(target_raster)}")

# --- NEW: TESTING DESCRIBE ---
print("\n--- RUNNING DESCRIBE ON INPUT RASTER ---")
try:
    desc = arcpy.Describe(target_raster)
    print(f"[PASS] Data Type: {desc.dataType}")
    print(f"[PASS] Band Count: {desc.bandCount}")
    print(f"[PASS] Extent: {desc.extent}")
    print(f"[PASS] Spatial Ref: {desc.spatialReference}")
except Exception as e:
    print(f"[FAIL] Describe crashed: {e}")

# --- TEST 1: Map Algebra (NDVI) ---
print("\n--- RUNNING IMAGE ANALYST: NDVI ---")
try:
    # This calls the C-backed NumPy math we wrote in magpi/ia.py
    ndvi_result = arcpy.ia.NDVI(target_raster, nir_band_id=4, red_band_id=1)
    
    # Map Algebra returns a Raster object, which has a .name attribute
    if hasattr(ndvi_result, 'name'):
        print(f"[PASS] NDVI successfully calculated and saved to: {ndvi_result.name}")
    else:
        print("[FAIL] NDVI calculation returned an error status.")
except Exception as e:
    print(f"[FAIL] NDVI calculation crashed: {e}")

# --- TEST 2: Deep Learning Chipping & Shuffling ---
print("\n--- RUNNING GEOAI: EXPORT TRAINING DATA ---")
try:
    out_dl_folder = os.path.join(workspace_dir, "MagPI_DeepLearning_Chips")
    
    # We are using the exact parameters you envisioned: 256x256 with shuffling enabled
    chip_result = arcpy.ia.ExportTrainingDataForDeepLearning(
        in_raster=target_raster,
        out_folder=out_dl_folder,
        tile_size_x=256,
        tile_size_y=256,
        stride_x=128,  # 50% overlap for better training data
        stride_y=128,
        shuffle_chips=True,
        apply_jitter=True 
    )
    
    # Deep Learning Export returns a Result object, use getOutput(0)
    if chip_result and chip_result.status != 3:
        print(f"[PASS] PyTorch tensors successfully chipped, shuffled, and saved to: {chip_result.getOutput(0)}")
    else:
        print("[FAIL] Deep Learning Export returned an error status.")
except Exception as e:
    print(f"[FAIL] Deep Learning Export crashed: {e}")

print("\n--- MAGPI 0.0.2 IMAGE PREP TEST COMPLETE ---")