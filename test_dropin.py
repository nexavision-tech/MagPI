"""
test_dropin.py

A legacy ArcPro Python script seamlessly intercepted by the MagPI Translation Matrix.
"""

import magpi as arcpy
import os

print("\n[+] MagPI Translation Engine Initialized")

# Set the workspace environment variables exactly like ArcPy
arcpy.env.workspace = os.path.abspath("test_data")
arcpy.env.overwriteOutput = True

input_points = os.path.join(arcpy.env.workspace, "points.geojson")
output_buffer = os.path.join(arcpy.env.workspace, "points_buffered.geojson")

arcpy.AddMessage("--------------------------------------------------")
arcpy.AddMessage(f"Buffering points from {input_points} by 50 meters...")

# Call the legacy Buffer_analysis function
# The MagPI Matrix will intercept this, convert it to a GeoPandas/Shapely localized planar buffer, 
# execute it in C memory, and spit out the result.
arcpy.Buffer_analysis(input_points, output_buffer, "50 Meters")

arcpy.AddMessage("--------------------------------------------------")
arcpy.AddMessage("Checking if output exists...")

if arcpy.Exists(output_buffer):
    arcpy.AddMessage(f"SUCCESS! Output successfully generated at: {output_buffer}")
else:
    arcpy.AddError("FAILED! Output was not generated.")
    
print("[+] Test Complete\n")
