# magpi/wfs.py
import geopandas as gpd
import requests
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_WFS")

def GetCensusTracts(state_fips, county_fips, year=2020, out_feature_class=None):
    state_str = str(state_fips).zfill(2)
    county_str = str(county_fips).zfill(3)
    logger.info(f"Querying US Census TIGER Data for State: {state_str}, County: {county_str}")
    tiger_url = f"https://www2.census.gov/geo/tiger/TIGER{year}/TRACT/tl_{year}_{state_str}_tract.zip"
    try:
        from .env import env
        temp_zip = os.path.join(env.workspace if env.workspace else ".", f"temp_tiger_{state_str}.zip")
        response = requests.get(tiger_url, stream=True)
        response.raise_for_status()
        with open(temp_zip, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192): fd.write(chunk)
                
        logger.info("Extracting and parsing TIGER geometry...")
        gdf = gpd.read_file(f"zip://{temp_zip}")
        try: os.remove(temp_zip) 
        except: pass
            
        county_col = next((col for col in gdf.columns if 'COUNTYFP' in col), None)
        if county_col: gdf = gdf[gdf[county_col] == county_str]
            
        geoid_col = next((col for col in gdf.columns if 'GEOID' in col), None)
        if geoid_col and geoid_col != 'GEOID': gdf['GEOID'] = gdf[geoid_col]

        if out_feature_class:
            if env.outputCoordinateSystem:
                target_crs = f"EPSG:{env.outputCoordinateSystem}" if isinstance(env.outputCoordinateSystem, int) else str(env.outputCoordinateSystem)
                gdf = gdf.to_crs(target_crs)
            gdf.to_file(out_feature_class)
            logger.info(f"SUCCESS: Census Tracts saved to: {out_feature_class}")
            return Result(out_feature_class)
        return Result("In-Memory-GDF")
    except Exception as e:
        logger.error(f"Failed to retrieve Census Data: {e}")
        return Result(None, status=3)

def PullSentinel2(extent, out_raster, max_cloud_cover=10, date_range="2023-01-01/2023-12-31"):
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

        # 2. Query the STAC API with the TEMPORAL FILTER
        search_url = "https://earth-search.aws.element84.com/v1/search"
        payload = {
            "collections": ["sentinel-2-l2a"],
            "bbox": [min_lon, min_lat, max_lon, max_lat],
            "datetime": date_range, # NEW: Filtering by user-defined dates!
            "query": {"eo:cloud_cover": {"lt": max_cloud_cover}},
            "sortby": [{"field": "properties.datetime", "direction": "desc"}],
            "limit": 1
        }

        logger.info(f"Querying AWS Earth STAC API for BBOX: {payload['bbox']} across {date_range}...")
        response = requests.post(search_url, json=payload)
        response.raise_for_status()
        data = response.json()

        if not data.get("features"):
            logger.error("No Sentinel-2 imagery found.")
            return Result(None, status=3)

        best_scene = data["features"][0]
        band_urls = [best_scene["assets"]["red"]["href"], best_scene["assets"]["green"]["href"], best_scene["assets"]["blue"]["href"], best_scene["assets"]["nir"]["href"]]
        
        with rasterio.Env(CPL_VSIL_CURL_ALLOWED_EXTENSIONS="tif"):
            with rasterio.open(band_urls[0]) as src0:
                from rasterio.warp import transform_bounds
                utm_bounds = transform_bounds('EPSG:4326', src0.crs, min_lon, min_lat, max_lon, max_lat)
                window = from_bounds(*utm_bounds, src0.transform).round_offsets().round_lengths()
                out_meta = src0.meta.copy()
                out_meta.update({"driver": "GTiff", "count": 4, "height": window.height, "width": window.width, "transform": src0.window_transform(window)})
                with rasterio.open(out_raster, "w", **out_meta) as dest:
                    for i, url in enumerate(band_urls, start=1):
                        logger.info(f"Streaming Band {i}...")
                        with rasterio.open(url) as src_band: dest.write(src_band.read(1, window=window), i)
                            
        logger.info(f"Saved 4-Band Sentinel-2 chip to: {out_raster}")
        return Result(out_raster)
    except Exception as e:
        logger.error(f"Data pull failed: {e}")
        return Result(None, status=3)

def PullUSGSElevation(extent, out_raster, resolution_width=1000, resolution_height=1000):
    """
    MagPI Sovereign Elevation Puller.
    Streams 3D bare-earth elevation (DEM) natively from the USGS 3DEP Web Coverage Service.
    """
    logger.info("Initializing Z-Axis Data Pull (USGS 3DEP WCS)...")
    try:
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())

        # Construct the precise WCS REST URL
        wcs_url = (
            f"https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer"
            f"?request=GetCoverage&service=WCS&version=1.0.0&coverage=3DEPElevation"
            f"&bbox={min_lon},{min_lat},{max_lon},{max_lat}"
            f"&crs=EPSG:4326&format=GeoTIFF_Float32"
            f"&width={resolution_width}&height={resolution_height}"
        )

        logger.info(f"Streaming topographical mesh from National Map... (Targeting {resolution_width}x{resolution_height} px)")
        response = requests.get(wcs_url, stream=True)
        response.raise_for_status()

        with open(out_raster, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192):
                fd.write(chunk)

        # Reproject if environment specifies
        from .env import env
        if env.outputCoordinateSystem:
            import rasterio
            from .management import ProjectRaster
            target_crs = f"EPSG:{env.outputCoordinateSystem}" if isinstance(env.outputCoordinateSystem, int) else str(env.outputCoordinateSystem)
            temp_out = out_raster.replace(".tif", "_proj.tif")
            ProjectRaster(out_raster, temp_out, target_crs)
            os.replace(temp_out, out_raster)

        logger.info(f"Z-Axis Elevation Model saved to: {out_raster}")
        return Result(out_raster)

    except Exception as e:
        logger.error(f"Elevation pull failed: {e}")
        return Result(None, status=3)