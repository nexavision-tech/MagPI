import sys
import logging
from pprint import pprint

# 1. The Import Test
print("\n--- INITIATING MAGPI 0.0.1 BETA TEST ---")
try:
    import magpi as arcpy
    print("[PASS] Successfully imported 'magpi as arcpy'")
except ImportError as e:
    print(f"[FAIL] Could not import magpi. Error: {e}")
    sys.exit(1)

# 2. Environment Variables Test
print("\n--- TESTING ENVIRONMENT VARIABLES ---")
try:
    arcpy.env.workspace = "./test_data"
    arcpy.env.overwriteOutput = True
    arcpy.env.outputCoordinateSystem = 4326
    
    # Test the duck-typing interceptor for unsupported variables
    arcpy.env.parallelProcessingFactor = "100%"
    
    print(f"[PASS] Workspace set to: {arcpy.env.workspace}")
    print(f"[PASS] Interceptor caught parallelProcessingFactor: {arcpy.env.parallelProcessingFactor}")
except Exception as e:
    print(f"[FAIL] Environment variables test failed. Error: {e}")

# 3. Core Objects Test
print("\n--- TESTING CORE OBJECTS & MESSAGING ---")
try:
    arcpy.AddMessage("This is a native MagPI log message.")
    res = arcpy.Result("test_output.shp", status=4)
    print(f"[PASS] Result Object generated. Status Code: {res.status}")
except Exception as e:
    print(f"[FAIL] Core Objects test failed. Error: {e}")

# 4. Fallback Interceptor Test (The Trojan Horse)
print("\n--- TESTING LEGACY FALLBACK INTERCEPTOR ---")
try:
    # We never built 'arcpy.aviation', so this should trigger the __getattr__ fallback
    mock_result = arcpy.aviation.SomeLegacyTool("input.shp")
    print(f"[PASS] Fallback intercepted missing module. Returned: {mock_result}")
except Exception as e:
    print(f"[FAIL] Fallback Interceptor crashed. Error: {e}")

print("\n--- MAGPI 0.0.1 BETA TEST COMPLETE ---")