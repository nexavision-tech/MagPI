# magpi_dl_test_flow.py
import magpi as arcpy
import os

# --- 1. Global Environment ---
arcpy.env.workspace = "./tmp_wksp"
arcpy.env.outputCoordinateSystem = 6438
arcpy.env.overwriteOutput = True
arcpy.AddMessage("Initiating MagPI Master GeoAI Pipeline (Phase 6)...")

# --- 2. The Universal Bounding Box ---
master_extent = arcpy.Extent(-81.45190, 28.53738, -81.37784, 28.58801)

# --- 3. Cloud Extraction (The Dough) ---
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

# --- 4. Deep Learning Super-Resolution (GAN) ---
# We use a GAN to upsample the 10m Sentinel-2 data to 2.5m resolution.
# CRITICAL: This will inject SYNTHETIC_DATA=TRUE into the GeoTIFF tags!
s2_super_res = arcpy.geoai.GenerateSyntheticData(
    in_raster=s2_image,
    out_raster="s2_orlando_super_res_2.5m.tif",
    scale_factor=4 # Upsample by 4x
)

# --- 5. Classical Machine Learning (Random Forest) ---
# We train a Random Forest model on the original 10m data because we MUST NOT
# train on the hallucinated Super-Res data!
rf_model = arcpy.geoai.TrainMachineLearningModel(
    in_raster=s2_image,
    in_training_features=nlcd_labels,
    out_model="orlando_landcover_rf.model",
    model_type="RANDOM_FOREST",
    max_trees=100
)

# Now we predict using the trained Random Forest model.
rf_classification = arcpy.geoai.ClassifyPixelsUsingMachineLearning(
    in_raster=s2_image,
    out_raster="s2_orlando_classified_rf.tif",
    in_model=rf_model
)

# --- 6. Accuracy Assessment (The Guardrail Test) ---
# We compute a Confusion Matrix on the RF classification.
# If we had passed `s2_super_res` here by mistake, MagPI would throw a CRITICAL WARNING!
confusion_matrix = arcpy.ia.ComputeConfusionMatrix(
    in_accuracy_assessment_points=rf_classification,
    out_confusion_matrix="rf_accuracy_report.txt"
)

arcpy.AddMessage("SUCCESS: Phase 6 Classical ML and GAN verification complete.")