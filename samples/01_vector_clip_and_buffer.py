# 01_vector_clip_and_buffer.py
# MagPI Open-Source Geospatial Framework
# Demonstrates standard vector geoprocessing using the Rosetta mapping (import magpi as arcpy)

import magpi as arcpy
import os

# --- Set Global Environments ---
arcpy.env.workspace = "."
arcpy.env.scratchWorkspace = "."
arcpy.env.outputWorkspace = "."
arcpy.env.overwriteOutput = True

# --- Inputs & Outputs ---
input_parcels = "OSM_Buildings_Gaza.shp"
clip_boundary = "Gaza_AOI_Boundary.shp"
output_clipped = "OSM_Buildings_Clipped.shp"
output_buffered = "OSM_Buildings_Buffered_10m.shp"

def run_vector_pipeline():
    arcpy.AddMessage("Starting Vector Geoprocessing Pipeline...")
    
    # Check if inputs exist
    if not os.path.exists(os.path.join(arcpy.env.workspace, input_parcels)):
        arcpy.AddWarning(f"Sample data {input_parcels} not found. Skipping execution.")
        return

    # Step 1: Clip Parcels to City Limits
    arcpy.AddMessage("Clipping parcels...")
    clip_result = arcpy.analysis.Clip(
        in_features=input_parcels,
        clip_features=clip_boundary,
        out_feature_class=output_clipped
    )
    
    # Step 2: Buffer the clipped footprints by 10 meters
    arcpy.AddMessage("Buffering clipped footprints by 10m...")
    buffer_result = arcpy.analysis.Buffer(
        in_features=clip_result,
        out_feature_class=output_buffered,
        buffer_distance_or_field="10 Meters"
    )
    
    # Step 3: Count the features
    count = arcpy.management.GetCount(buffer_result).output
    arcpy.AddMessage(f"Pipeline complete! Generated {count} buffered polygons.")

if __name__ == "__main__":
    run_vector_pipeline()
