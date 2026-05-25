import time
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import magpi as arcpy

arcpy.env.workspace = "./magpi_workspace"
arcpy.env.scratchWorkspace = "./magpi_scratch"
arcpy.env.outputWorkspace = "./magpi_output"
arcpy.env.outputCoordinateSystem = 6438
arcpy.env.overwriteOutput = True

base_lon = -81.4
base_lat = 27.8

sizes = {
    "Very Small (1x1 km)": 0.01,
    "Small (5x5 km)": 0.05,
    "Medium (10x10 km)": 0.1,
    "Large (20x20 km)": 0.2
}

print(f"{'AOI Size':<25} | {'Grid Dim':<15} | {'Download Time':<15}")
print("-" * 60)

for name, offset in sizes.items():
    extent = arcpy.Extent(base_lon, base_lat, base_lon + offset, base_lat + offset)
    out_file = f"benchmark_{name.replace(' ', '_').replace('(', '').replace(')', '')}.tif"
    out_path = os.path.join(arcpy.env.outputWorkspace, out_file)
    
    start_t = time.time()
    result = arcpy.wfs.PullSentinel2(
        extent, 
        out_path, 
        max_cloud_cover=10, 
        date_range="2023-01-01/2023-12-31", 
        item_ids="S2B_17RML_20231119_0_L2A", 
        bands="B02,B03,B04,B08"
    )
    end_t = time.time()
    
    if result.status == 0:
        import rasterio
        with rasterio.open(result.output) as src:
            dims = f"{src.width}x{src.height}"
    else:
        dims = "FAILED"
        
    print(f"{name:<25} | {dims:<15} | {end_t - start_t:.2f}s")
