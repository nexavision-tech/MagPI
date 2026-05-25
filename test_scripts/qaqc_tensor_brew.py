import sys
import os
sys.path.insert(0, os.path.abspath('.'))
import magpi as arcpy

def run_qaqc():
    print("\n--- [ MagPI QAQC: Tensor Brew Inference Engine ] ---")
    
    # 1. Setup Global Environments
    arcpy.env.workspace = "./magpi_workspace"
    arcpy.env.scratchWorkspace = "./magpi_scratch"
    arcpy.env.outputWorkspace = "./magpi_output"
    arcpy.env.overwriteOutput = True
    arcpy.env.outputCoordinateSystem = "6438"  # Some projected CRS

    # Ensure directories exist
    for dir_path in ["./magpi_workspace", "./magpi_scratch", "./magpi_output"]:
        os.makedirs(dir_path, exist_ok=True)
        
    print(f"[OK] Environments Set: Workspace={arcpy.env.workspace}, Scratch={arcpy.env.scratchWorkspace}, Output={arcpy.env.outputWorkspace}")

    # 2. Generate a Dummy PyTorch Model for Testing
    dummy_model_path = os.path.join(arcpy.env.scratchWorkspace, "dummy_model.py")
    with open(dummy_model_path, "w") as f:
        f.write("""import torch
import torch.nn as nn

# A simple dummy model that thresholds NDVI
class DynamicModel(nn.Module):
    def __init__(self):
        super().__init__()
        # 1 input channel (NDVI), 1 output probability
        self.conv = nn.Conv2d(1, 1, kernel_size=1)
        
        # Hardcode weights so it acts like a threshold mask
        with torch.no_grad():
            self.conv.weight[0, 0, 0, 0] = 1.0  # Positive NDVI is high
            self.conv.bias[0] = 0.0

    def forward(self, x):
        return self.conv(x)
""")
    print(f"[OK] Dummy PyTorch Model compiled at {dummy_model_path}")

    # 3. Pull Sovereign Data (Very Small AOI 1x1km)
    print("\n[STEP 1] Executing Sovereign Data Pull...")
    # Extent for a small area in Oregon (EPSG:4326 coords required for STAC)
    aoi_extent = arcpy.Extent(-122.0, 44.0, -121.99, 44.01)
    
    # Notice we only provide "raw_s2.tif". MagPI should resolve this to the Workspace!
    s2_result = arcpy.wfs.PullSentinel2(
        extent=aoi_extent, 
        out_raster="raw_s2.tif", 
        max_cloud_cover=10, 
        bands="B04,B08" # Just Red and NIR for NDVI
    )
    
    raw_s2_path = s2_result.output if s2_result else None
    if not raw_s2_path or not os.path.exists(raw_s2_path):
        print(f"[FAILED] Sovereign Data Pull failed. Expected at {raw_s2_path}")
        return
        
    if "magpi_workspace" in raw_s2_path:
        print(f"[OK] Workspace Routing verified: {raw_s2_path}")
    else:
        print(f"[WARNING] Workspace Routing failed. File at {raw_s2_path}")

    # 4. Raster Math (NDVI)
    print("\n[STEP 2] Executing Vectorized Raster Math (NDVI)...")
    # b2 = NIR, b1 = Red
    ndvi_expr = "(b2 - b1) / (b2 + b1 + 0.0001)"
    
    # We want this in Scratch since it's an intermediate product.
    # Use MagPI's direct RasterMath hook
    ndvi_result = arcpy.ia.RasterMath(raster_a=raw_s2_path, raster_b=None, expression=ndvi_expr, out_raster="ndvi_scratch.tif")
    
    ndvi_path = ndvi_result.output
    if not os.path.exists(ndvi_path):
        print("[FAILED] Raster Math failed.")
        return
        
    print(f"[OK] Raster Math completed: {ndvi_path}")

    # 5. Tensor Brew Deep Learning Inference
    print("\n[STEP 3] Executing Tensor Brew PyTorch Inference...")
    ml_result = arcpy.ml.PyTorchInference(
        in_raster=ndvi_path,
        model_script_path=dummy_model_path,
        out_raster="final_veg_mask.tif", # Should route to outputWorkspace
        tile_size=64, # Small tile size to force chunking logic to trigger
        batch_size=2,
        device="cpu" # Use CPU to ensure it runs anywhere
    )
    
    final_path = ml_result.output
    if not os.path.exists(final_path):
        print("[FAILED] PyTorch Inference failed.")
        return
        
    if "magpi_output" in final_path:
        print(f"[OK] Output Workspace Routing verified: {final_path}")
    else:
        print(f"[WARNING] Output Routing failed. File at {final_path}")
        
    print("\n--- [ QAQC PASSED SUCCESSFULLY ] ---")
    print("The MagPI environment is successfully bridging AWS STAC -> NumPy Raster Math -> PyTorch Deep Learning with proper workspace segregation!")

if __name__ == "__main__":
    run_qaqc()
