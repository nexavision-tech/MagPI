# 00_generate_sample_data.py
# Generates small, GitHub-friendly test data for MagPI's sample scripts.
import magpi as arcpy
import os
import requests
import json

arcpy.env.workspace = "."
arcpy.env.scratchWorkspace = "."
arcpy.env.outputWorkspace = "."
arcpy.env.overwriteOutput = True

# 1. Define Micro-AOI over Gaza (approx 1km x 1km)
min_lon, min_lat = 34.450, 31.510
max_lon, max_lat = 34.460, 31.520
extent = arcpy.Extent(min_lon, min_lat, max_lon, max_lat)

def generate_data():
    arcpy.AddMessage("Initializing Test Data Generation Pipeline...")
    
    # 2. Pull Sentinel-2 Imagery
    out_raster = "sentinel2_optical.tif"
    arcpy.AddMessage(f"Pulling Sentinel-2 Optical Chip to {out_raster}...")
    try:
        from magpi.wfs import PullSentinel2
        res = PullSentinel2(
            extent=extent,
            out_raster=out_raster,
            max_cloud_cover=20,
            date_range="2024-01-01/2024-05-01"
        )
        if res.status == 0:
            arcpy.AddMessage(f"SUCCESS: Sentinel-2 saved to {res.output}")
        else:
            arcpy.AddError("Failed to pull Sentinel-2 data.")
    except Exception as e:
        arcpy.AddError(f"Sentinel-2 Error: {e}")

    # 3. Pull OSM Building Footprints
    out_vector = os.path.join(arcpy.env.workspace, "OSM_Buildings_Gaza.shp")
    arcpy.AddMessage(f"Pulling OSM Footprints to {out_vector}...")
    try:
        overpass_query = f"""
        [out:json][timeout:25];
        (
          way["building"]({min_lat},{min_lon},{max_lat},{max_lon});
          relation["building"]({min_lat},{min_lon},{max_lat},{max_lon});
        );
        out body;
        >;
        out skel qt;
        """
        headers = {
            "User-Agent": "MagPI/1.0 (GIS Tool)",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        response = requests.post("https://overpass-api.de/api/interpreter", headers=headers, data={'data': overpass_query})
        
        if not response.ok:
            raise Exception(f"Overpass API failed ({response.status_code}): {response.text}")
            
        data = response.json()
        
        nodes = {el["id"]: (el["lon"], el["lat"]) for el in data.get("elements", []) if el["type"] == "node"}
        ways = [el for el in data.get("elements", []) if el["type"] == "way"]
        
        polygons = []
        from shapely.geometry import Polygon
        import geopandas as gpd
        
        for way in ways:
            if "nodes" in way and len(way["nodes"]) >= 3:
                coords = [nodes[nid] for nid in way["nodes"] if nid in nodes]
                if len(coords) >= 3:
                    poly = Polygon(coords)
                    if poly.is_valid:
                        polygons.append(poly)
                        
        if polygons:
            gdf = gpd.GeoDataFrame(geometry=polygons, crs="EPSG:4326")
            gdf.to_file(out_vector)
            arcpy.AddMessage(f"SUCCESS: {len(polygons)} OSM Footprints saved to {out_vector}")
        else:
            arcpy.AddWarning("No OSM Footprints found in this AOI.")
            
    except Exception as e:
        arcpy.AddError(f"OSM Pull Error: {e}")

    # 4. Generate AOI Clip Boundary
    out_boundary = os.path.join(arcpy.env.workspace, "Gaza_AOI_Boundary.shp")
    arcpy.AddMessage(f"Generating AOI Clip Boundary at {out_boundary}...")
    try:
        from shapely.geometry import box
        import geopandas as gpd
        # Create a slightly smaller box inside the AOI to test the Clip tool
        clip_box = box(min_lon + 0.002, min_lat + 0.002, max_lon - 0.002, max_lat - 0.002)
        gdf_boundary = gpd.GeoDataFrame(geometry=[clip_box], crs="EPSG:4326")
        gdf_boundary.to_file(out_boundary)
        arcpy.AddMessage(f"SUCCESS: Boundary saved to {out_boundary}")
    except Exception as e:
        arcpy.AddError(f"Boundary Gen Error: {e}")

if __name__ == "__main__":
    generate_data()
