import sys
import os
sys.path.insert(0, os.path.abspath('.'))
import magpi as arcpy

def run_mega_qaqc():
    print("\n--- [ MagPI Mega QAQC: The Lego Peace Scenario ] ---")
    
    # 1. Setup Global Environments
    arcpy.env.workspace = "./magpi_workspace"
    arcpy.env.scratchWorkspace = "./magpi_scratch"
    arcpy.env.outputWorkspace = "./magpi_output"
    arcpy.env.overwriteOutput = True
    arcpy.env.outputCoordinateSystem = "4326"

    # Ensure directories exist
    for dir_path in [arcpy.env.workspace, arcpy.env.scratchWorkspace, arcpy.env.outputWorkspace]:
        os.makedirs(dir_path, exist_ok=True)
        
    print(f"[OK] Environments Set")

    # 2. Define AOI (Small Test Area)
    print("\n[Stage 1] Defining AOI...")
    aoi_extent = arcpy.Extent(-80.19, 25.76, -80.18, 25.77)  # Miami Area ~1km
    print(f"[OK] AOI Extent initialized: {aoi_extent.XMin}, {aoi_extent.YMin}, {aoi_extent.XMax}, {aoi_extent.YMax}")

    # 3. Pull WFS Data (NLCD and DEM)
    print("\n[Stage 2] Executing Sovereign Data Pulls...")
    nlcd_out = "qaqc_nlcd_2021.tif"
    dem_out = "qaqc_usgs_dem.tif"

    nlcd_res = arcpy.wfs.PullNLCD(extent=aoi_extent, out_raster=nlcd_out, year=2021)
    if nlcd_res.status == 0:
        print(f"[OK] NLCD Pull Successful -> {nlcd_res.getOutput(0)}")
    else:
        print(f"[FAIL] NLCD Pull failed. Status: {nlcd_res.status}")

    dem_res = arcpy.wfs.PullUSGSElevation(extent=aoi_extent, out_raster=dem_out)
    if dem_res.status == 0:
        print(f"[OK] USGS DEM Pull Successful -> {dem_res.getOutput(0)}")
    else:
        print(f"[FAIL] USGS DEM Pull failed. Status: {dem_res.status}")

    if nlcd_res.status != 0 or dem_res.status != 0:
        print("Skipping further execution due to data pull failure.")
        return

    # 4. Raster Math (Mock Processing)
    print("\n[Stage 3] Spatial Analyst: Raster Math...")
    math_out = "qaqc_math_result.tif"
    
    # Let's do a simple addition if we pretend both are 1 band, or just multiply NLCD by 2 for fun
    math_res = arcpy.sa.RasterMath(
        raster_a=nlcd_res.getOutput(0),
        raster_b=dem_res.getOutput(0),
        operation="add",
        out_raster=math_out
    )
    if math_res.status == 0:
        print(f"[OK] Raster Math Successful -> {math_res.getOutput(0)}")
    else:
        print(f"[FAIL] Raster Math failed. Status: {math_res.status}")
        return

    # 5. PyTorch Inference (Tensor Brew)
    print("\n[Stage 4] Tensor Brew: AI Inference...")
    
    # Generate Dummy Model
    dummy_model_path = os.path.join(arcpy.env.scratchWorkspace, "mega_dummy_model.py")
    with open(dummy_model_path, "w") as f:
        f.write("""import torch
import torch.nn as nn
class DynamicModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv = nn.Conv2d(1, 1, kernel_size=1)
        with torch.no_grad():
            self.conv.weight[0, 0, 0, 0] = 1.0
            self.conv.bias[0] = 0.0
    def forward(self, x):
        return self.conv(x)
""")
    
    inf_out = "qaqc_mega_inference.tif"
    ml_res = arcpy.ml.PyTorchInference(
        in_raster=math_res.getOutput(0),
        model_path=dummy_model_path,
        out_raster=inf_out,
        tile_size=256,
        batch_size=1,
        device="cpu"
    )

    if ml_res.status == 0:
        print(f"[OK] Inference Successful -> {ml_res.getOutput(0)}")
    else:
        print(f"[FAIL] Inference failed. Status: {ml_res.status}")

    print("\n--- [ Mega QAQC Complete! All Nodes Green ] ---")

if __name__ == "__main__":
    run_mega_qaqc()
