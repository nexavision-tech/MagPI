# test_describe.py
import magpi as arcpy

arcpy.AddMessage("--- INITIATING MAGPI DESCRIBE PROTOCOL ---")

# Target 1: The Raster (3-inch Ortho)
raster_target = "test_data/2022 Pilot Tiles/Orange County 3 Inch/3in/GeoTIFF/2022_480536.tif"

arcpy.AddMessage(f"\\nDescribing Raster: {raster_target}")
if arcpy.Exists(raster_target):
    desc_raster = arcpy.Describe(raster_target)
    arcpy.AddMessage(f"  Name: {desc_raster.name}")
    arcpy.AddMessage(f"  Data Type: {desc_raster.dataType}")
    arcpy.AddMessage(f"  Band Count: {desc_raster.bandCount}")
    if desc_raster.spatialReference:
        arcpy.AddMessage(f"  Spatial Reference: {desc_raster.spatialReference.name}")
else:
    arcpy.AddError("Raster target not found.")

# Target 2: The Vector (6-inch Tile Grid)
vector_target = "test_data/2022 Pilot Tiles/Orange County 6 Inch/6in/Tile_Grid/2022_OrangeCo_6in_Pilot_TileGrid.shp"

arcpy.AddMessage(f"\\nDescribing Vector: {vector_target}")
if arcpy.Exists(vector_target):
    desc_vector = arcpy.Describe(vector_target)
    arcpy.AddMessage(f"  Name: {desc_vector.name}")
    arcpy.AddMessage(f"  Data Type: {desc_vector.dataType}")
    arcpy.AddMessage(f"  Shape Type: {desc_vector.shapeType}")
    if desc_vector.spatialReference:
        arcpy.AddMessage(f"  Spatial Reference: {desc_vector.spatialReference.name}")
else:
    arcpy.AddError("Vector target not found.")

arcpy.AddMessage("\\n--- MAGPI DESCRIBE PROTOCOL COMPLETE ---")
