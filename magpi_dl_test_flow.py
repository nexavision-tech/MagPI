# magpi_dl_test_flow.py
import magpi as arcpy
import os

# --- 1. Global Environment ---
arcpy.env.workspace = "./tmp_wksp"
arcpy.env.outputCoordinateSystem = 6438
arcpy.env.overwriteOutput = True
arcpy.AddMessage("Initiating MagPI Master Deep Learning Pipeline...")

# --- 2. The Universal Bounding Box (The Cookie Cutter) ---
# This single node controls the geography for the entire pipeline.
master_extent = arcpy.Extent(-81.45190, 28.53738, -81.37784, 28.58801)

# --- 3. Sovereign Cloud Extraction (The Dough) ---
# We feed the EXACT same extent into both pullers to guarantee overlap.
s2_image = arcpy.wfs.PullSentinel2(
    extent=master_extent, 
    out_raster="s2_orlando.tif", 
    max_cloud_cover=10, 
    date_range="2023-01-01/2023-12-31"
)

nlcd_labels = arcpy.wfs.PullNLCD(
    extent=master_extent, 
    out_raster="nlcd_orlando.tif", 
    year=2021, 
    product="Land_Cover"
)

# --- 4. Data Management (Statistics & Pyramids) ---
# NOTE: Because these modify the file IN-PLACE, we assign a "pass-through" variable
# so the downstream tools still know what the file is called!
s2_stats = s2_image 
arcpy.management.BuildPyramidsAndStats(s2_image, build_pyramids=False, calculate_stats=True)

nlcd_stats = nlcd_labels
arcpy.management.BuildPyramidsAndStats(nlcd_labels, build_pyramids=False, calculate_stats=True)

# --- 5. Feature Extraction (Optional e.g., NDVI) ---
# In this pipeline, we'll just run NDVI for visualization purposes.
ndvi_image = arcpy.ia.NDVI(s2_stats, nir_band_id=4, red_band_id=1)

# --- 6. Deep Learning Tensor Chipper ---
# MULTI-WIRE LOGIC: We feed BOTH the Image AND the Label into the tool.
# MagPI will engage the WarpedVRT internally to align the 10m Sentinel with the 30m NLCD!
tensor_folder = arcpy.ia.ExportTrainingDataForDeepLearning(
    in_raster=s2_stats, 
    out_folder="./dl_chips", 
    in_class_data=nlcd_stats, 
    tile_size_x=256, 
    tile_size_y=256, 
    stride_x=128, 
    stride_y=128,
    shuffle_chips=True
)

# --- 7. The PyTorch AI Forge ---
# We take the folder of chipped Tensors and feed it directly to the Neural Network!
trained_model = arcpy.geoai.TrainDeepLearningModel(
    in_folder=tensor_folder, 
    out_folder="./trained_model", 
    max_epochs=20, 
    batch_size=4, 
    model_type="SEGFORMER"
)

arcpy.AddMessage("SUCCESS: MagPI AI Factory Complete. Model Weights Generated.")