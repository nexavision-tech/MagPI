import magpi as arcpy
import os

print("--- Testing MagPI Drop-in Replacement for ArcPy ---")

arcpy.env.workspace = "./magpi_workspace"
arcpy.env.overwriteOutput = True

try:
    print("Testing RasterCalculator...")
    res = arcpy.sa.RasterCalculator("1 + 1", "test_calc.tif")
    print(res)
except Exception as e:
    print("RasterCalculator Failed:", e)

try:
    print("Testing Dissolve...")
    res = arcpy.management.Dissolve("test_data/input.shp", "test_data/dissolved.shp")
    print(res)
except Exception as e:
    print("Dissolve Failed:", e)

print("Drop-in replacement test complete.")
