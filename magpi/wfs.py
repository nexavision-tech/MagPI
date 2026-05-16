# magpi/wfs.py
import geopandas as gpd
import requests
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_WFS")

def GetCensusTracts(state_fips, county_fips, year=2020, out_feature_class=None):
    """
    MagPI Exclusive Tool.
    Queries the US Census for Tract boundaries, bypassing brittle ESRI MapServers
    by pulling the official TIGER shapefile zips directly into memory.
    """
    state_str = str(state_fips).zfill(2)
    county_str = str(county_fips).zfill(3)
    
    logger.info(f"Querying US Census TIGER Data for State: {state_str}, County: {county_str} (Year: {year})")
    
    # Bypass ArcGIS REST API completely. Use the official Census FTP/HTTP raw files.
    # This is infinitely more stable and perfectly aligns with sovereign data extraction.
    tiger_url = f"https://www2.census.gov/geo/tiger/TIGER{year}/TRACT/tl_{year}_{state_str}_tract.zip"
    
    try:
        from .env import env
        temp_zip = os.path.join(env.workspace if env.workspace else ".", f"temp_tiger_{state_str}.zip")
        
        logger.info(f"Downloading raw TIGER block from: {tiger_url}")
        
        # 1. Download the zip locally to ensure GeoPandas doesn't timeout on HTTP streams
        response = requests.get(tiger_url, stream=True)
        response.raise_for_status()
        
        with open(temp_zip, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192):
                fd.write(chunk)
                
        # 2. Read directly from the zipped shapefile using fiona VFS
        logger.info("Extracting and parsing TIGER geometry...")
        gdf = gpd.read_file(f"zip://{temp_zip}")
        
        # Clean up the temp file silently
        try:
            os.remove(temp_zip)
        except Exception:
            pass
            
        # 3. Filter down to the specific county requested
        # TIGER column names change slightly by year (e.g., COUNTYFP vs COUNTYFP20)
        county_col = next((col for col in gdf.columns if 'COUNTYFP' in col), None)
        
        if county_col:
            gdf = gdf[gdf[county_col] == county_str]
            logger.info(f"Filtered to {len(gdf)} tracts for County {county_str}.")
        else:
            logger.warning("Could not find County FIPS column. Outputting entire state.")
            
        # 4. Standardize the unique ID column for Zonal Statistics to use
        # Zonal Stats expects a 'GEOID' column, TIGER sometimes uses 'GEOID20'
        geoid_col = next((col for col in gdf.columns if 'GEOID' in col), None)
        if geoid_col and geoid_col != 'GEOID':
            gdf['GEOID'] = gdf[geoid_col]

        # 5. Reproject and Save
        if out_feature_class:
            if env.outputCoordinateSystem:
                # Standard MagPI Environment Reprojection
                target_crs = f"EPSG:{env.outputCoordinateSystem}" if isinstance(env.outputCoordinateSystem, int) else str(env.outputCoordinateSystem)
                logger.info(f"Auto-Reprojecting from {gdf.crs} to: {target_crs}")
                gdf = gdf.to_crs(target_crs)
                
            gdf.to_file(out_feature_class)
            logger.info(f"SUCCESS: Census Tracts saved to: {out_feature_class}")
            return Result(out_feature_class)
        
        return Result("In-Memory-GDF")
            
    except Exception as e:
        logger.error(f"Failed to retrieve Census Data: {e}")
        return Result(None, status=3)


def PullSentinel2(extent, out_raster, max_cloud_cover=10):
    """
    MagPI Cloud Extractor (STAC/COG Bridge)
    Queries AWS Earth Search for Sentinel-2 L2A imagery intersecting the given extent,
    and streams the cropped RGB+NIR bands directly to the local hard drive.
    """
    logger.info("Initializing MagPI Sovereign Data Pull (Sentinel-2 via AWS Earth Search)...")
    
    try:
        import rasterio
        from rasterio.windows import from_bounds
        
        # 1. Parse the Extent (Assume WGS84 Lat/Lon for the API search)
        if hasattr(extent, 'XMin'):
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        else:
            parts = str(extent).split()
            min_lon, min_lat, max_lon, max_lat = map(float, parts)

        # 2. Query the STAC API
        search_url = "https://earth-search.aws.element84.com/v1/search"
        payload = {
            "collections": ["sentinel-2-l2a"],
            "bbox": [min_lon, min_lat, max_lon, max_lat],
            "query": {"eo:cloud_cover": {"lt": max_cloud_cover}},
            "sortby": [{"field": "properties.datetime", "direction": "desc"}],
            "limit": 1
        }

        logger.info(f"Querying AWS Earth STAC API for BBOX: {payload['bbox']}...")
        response = requests.post(search_url, json=payload)
        response.raise_for_status()
        data = response.json()

        if not data.get("features"):
            logger.error("No Sentinel-2 imagery found for this extent with the specified cloud cover.")
            return Result(None, status=3)

        # Get the most recent, cloud-free scene
        best_scene = data["features"][0]
        scene_id = best_scene["id"]
        date_captured = best_scene["properties"]["datetime"]
        logger.info(f"Target Acquired: Scene {scene_id} (Captured: {date_captured})")

        # 3. Extract the Cloud Optimized GeoTIFF (COG) URLs for 10m resolution bands
        # Sentinel-2 Bands: B04 (Red), B03 (Green), B02 (Blue), B08 (NIR)
        assets = best_scene["assets"]
        band_urls = [
            assets["red"]["href"],
            assets["green"]["href"],
            assets["blue"]["href"],
            assets["nir"]["href"]
        ]

        # 4. Stream and Crop the data directly from AWS (No full downloads!)
        logger.info("Streaming and cropping 4-Band matrix directly from AWS Cloud...")
        
        with rasterio.Env(CPL_VSIL_CURL_ALLOWED_EXTENSIONS="tif"):
            # Open the first band to get the CRS and transform
            with rasterio.open(band_urls[0]) as src0:
                # We need to project our WGS84 Extent to the Scene's native UTM projection
                from rasterio.warp import transform_bounds
                utm_bounds = transform_bounds('EPSG:4326', src0.crs, min_lon, min_lat, max_lon, max_lat)
                
                # Calculate the exact pixel window
                window = from_bounds(*utm_bounds, src0.transform)
                window = window.round_offsets().round_lengths()
                
                # Setup metadata for the output stacked TIFF
                out_meta = src0.meta.copy()
                out_meta.update({
                    "driver": "GTiff",
                    "count": 4, # 4 Bands
                    "height": window.height,
                    "width": window.width,
                    "transform": src0.window_transform(window)
                })

                # Write the combined bands to the local disk
                with rasterio.open(out_raster, "w", **out_meta) as dest:
                    for i, url in enumerate(band_urls, start=1):
                        logger.info(f"Streaming Band {i}...")
                        with rasterio.open(url) as src_band:
                            dest.write(src_band.read(1, window=window), i)
                            
        logger.info(f"Sovereign Data Pull Complete. Saved 4-Band Sentinel-2 chip to: {out_raster}")
        return Result(out_raster)

    except ImportError:
        logger.error("Missing dependency. Please ensure 'requests' and 'rasterio' are installed.")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Data pull failed: {e}")
        return Result(None, status=3)