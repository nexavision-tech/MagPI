# magpi/wfs.py
import geopandas as gpd
import requests
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_WFS")

def PullArcGISRest(url, extent, out_file, width=1024, height=1024, format="tiff"):
    """
    Pulls data from an ArcGIS REST MapServer or ImageServer using the export API.
    """
    logger.info(f"Querying ArcGIS REST Service: {url}")
    try:
        from .env import env
        
        # Ensure extent is unwrapped if it's a MagPI_AOI object
        if hasattr(extent, 'xmin'):
            bbox = f"{extent.xmin},{extent.ymin},{extent.xmax},{extent.ymax}"
        else:
            bbox = f"{extent[0]},{extent[1]},{extent[2]},{extent[3]}"

        export_url = f"{url}/export"
        params = {
            "bbox": bbox,
            "bboxSR": "4326",
            "size": f"{width},{height}",
            "imageSR": "4326",
            "format": format,
            "f": "image"
        }
        
        import requests
        response = requests.get(export_url, params=params, stream=True)
        response.raise_for_status()
        
        with open(out_file, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192): 
                fd.write(chunk)
                
        logger.info(f"SUCCESS: ArcGIS REST data saved to {out_file}")
        from .objects import Result
        return Result(out_file)
    except Exception as e:
        logger.error(f"Failed to retrieve ArcGIS REST Data: {e}")
        from .objects import Result
        return Result(None, status=3)


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

def QuerySTAC(extent, collection="sentinel-2-l2a", max_cloud_cover=10, date_range="2023-01-01/2023-12-31", catalog_url="https://earth-search.aws.element84.com/v1"):
    try:
        from pystac_client import Client
        import logging
        if isinstance(extent, dict):
            if "extent" in extent and extent["extent"] and len(extent["extent"]) == 4:
                extent = extent["extent"]
            elif "path_out" in extent:
                extent = extent["path_out"]
        logger = logging.getLogger("MagPI_WFS")
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, (list, tuple)) and len(extent) == 4:
            min_lon, min_lat, max_lon, max_lat = map(float, extent)
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).replace('[','').replace(']','').replace(',',' ').split())
        
        formatted_date = str(date_range).strip()
        if "T" not in formatted_date:
            try:
                start_d, end_d = formatted_date.split('/')
                formatted_date = f"{start_d.strip()}T00:00:00Z/{end_d.strip()}T23:59:59Z"
            except Exception: pass 
            
        logger.info(f"Querying STAC Catalog: {catalog_url} for {collection}")
        client = Client.open(catalog_url)
        
        query_params = {}
        if max_cloud_cover and ("sentinel-2" in collection.lower() or "s2" in collection.lower()):
            query_params["eo:cloud_cover"] = {"lt": int(max_cloud_cover)}
            
        search = client.search(
            collections=[collection],
            bbox=[min_lon, min_lat, max_lon, max_lat],
            datetime=formatted_date,
            query=query_params if query_params else None,
            max_items=100
        )
        
        items = list(search.items())
        results = []
        for item in items:
            results.append({
                "id": item.id,
                "date": item.datetime.isoformat() if item.datetime else "",
                "cloud_cover": item.properties.get("eo:cloud_cover", 0),
                "geometry": item.geometry,
                "bbox": item.bbox
            })
        return {
            "results": results,
            "parsed_bbox": [min_lon, min_lat, max_lon, max_lat]
        }
    except Exception as e:
        import logging
        logger = logging.getLogger("MagPI_WFS")
        logger.error(f"Query STAC failed: {e}")
        return {"results": [], "parsed_bbox": None}

# Backward compatibility wrapper
def QuerySentinel2(extent, max_cloud_cover=10, date_range="2023-01-01/2023-12-31"):
    return QuerySTAC(extent, "sentinel-2-c1-l2a", max_cloud_cover, date_range, "https://earth-search.aws.element84.com/v1")

def PullSTAC(extent, out_raster, collection="sentinel-2-l2a", catalog_url="https://earth-search.aws.element84.com/v1", max_cloud_cover=10, date_range="2023-01-01/2023-12-31", item_ids=None, bands=None):
    import logging
    logger = logging.getLogger("MagPI_WFS")
    logger.info(f"Initializing MagPI Sovereign Data Pull ({collection} via {catalog_url})...")
    try:
        from .env import env
        from .objects import Result
        import os
        out_raster = env.resolve_path(out_raster, intent="input")
        print(f"DEBUG MAGPI WFS: extent is type {type(extent)}, value: {extent}")
        import rasterio
        from rasterio.windows import from_bounds
        from pystac_client import Client
        
        if extent is None:
            logger.error("No valid spatial extent provided.")
            return Result(None, status=3)
        
        if hasattr(extent, 'output'):
            extent = extent.output
            
        if isinstance(extent, dict):
            if "extent" in extent and extent["extent"] and len(extent["extent"]) == 4:
                extent = extent["extent"]
            elif "path_out" in extent:
                extent = extent["path_out"]
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, (list, tuple)) and len(extent) == 4:
            min_lon, min_lat, max_lon, max_lat = map(float, extent)
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).replace('[','').replace(']','').replace(',',' ').split())

        client = Client.open(catalog_url)
        
        if item_ids and isinstance(item_ids, str):
            item_ids = [i.strip() for i in item_ids.split(',')]
            
        if item_ids:
            search = client.search(collections=[collection], ids=item_ids)
        else:
            formatted_date = str(date_range).strip()
            if "T" not in formatted_date:
                try:
                    start_d, end_d = formatted_date.split('/')
                    formatted_date = f"{start_d.strip()}T00:00:00Z/{end_d.strip()}T23:59:59Z"
                except Exception: pass 
            
            query_params = {}
            if max_cloud_cover and ("sentinel-2" in collection.lower() or "s2" in collection.lower()):
                query_params["eo:cloud_cover"] = {"lt": int(max_cloud_cover)}
                
            search = client.search(
                collections=[collection],
                bbox=[min_lon, min_lat, max_lon, max_lat],
                datetime=formatted_date,
                query=query_params if query_params else None,
                sortby=[{"field": "properties.eo:cloud_cover", "direction": "asc"}],
                max_items=1
            )

        items = list(search.items())
        if not items:
            logger.error("No STAC imagery found.")
            return Result(None, status=3)

        downloaded_rasters = []
        for s_idx, best_scene in enumerate(items):
            current_out_raster = out_raster
            if len(items) > 1:
                # Append the item ID to the filename so they don't overwrite
                name, ext = os.path.splitext(out_raster)
                current_out_raster = f"{name}_{best_scene.id}{ext}"
                
            logger.info(f"Processing STAC Item {s_idx+1}/{len(items)}: {best_scene.id}")
            
            # --- OMNI-OPTIMIZED GEOMETRIC VALIDATION ---
            try:
                from shapely.geometry import box
                req_box = box(min_lon, min_lat, max_lon, max_lat)
                scene_bbox = getattr(best_scene, 'bbox', None)
                if scene_bbox and len(scene_bbox) == 4:
                    scene_box = box(scene_bbox[0], scene_bbox[1], scene_bbox[2], scene_bbox[3])
                    if not req_box.intersects(scene_box):
                        logger.error(f"Geometric Mismatch: Requested map extent does not intersect STAC item {best_scene.id}")
                        continue
                    # Restrict bounds to the actual intersection to prevent NoData pixel bloat
                    intersect_box = req_box.intersection(scene_box)
                    item_min_lon, item_min_lat, item_max_lon, item_max_lat = intersect_box.bounds
                else:
                    item_min_lon, item_min_lat, item_max_lon, item_max_lat = min_lon, min_lat, max_lon, max_lat
            except ImportError:
                logger.warning("shapely not installed. Skipping geometric validation.")
                item_min_lon, item_min_lat, item_max_lon, item_max_lat = min_lon, min_lat, max_lon, max_lat
            except Exception as e:
                logger.warning(f"Geometric validation skipped: {str(e)}")
                item_min_lon, item_min_lat, item_max_lon, item_max_lat = min_lon, min_lat, max_lon, max_lat
            # ---------------------------------------------
            
            # STEP 2: Save metadata footprint as requested
            if current_out_raster:
                try:
                    import json
                    footprint_path = str(current_out_raster).replace('.tif', '_footprint.geojson')
                    with open(footprint_path, 'w') as f:
                        json.dump(best_scene.to_dict(), f)
                    logger.info(f"Saved footprint GeoJSON to: {footprint_path}")
                except Exception as e:
                    logger.warning(f"Failed to save scene footprint: {e}")
            
            if bands and isinstance(bands, str):
                band_keys = [b.strip().lower() for b in bands.split(',')]
            else:
                band_keys = ["red", "green", "blue", "nir"]
                
            band_urls = []
            resolved_names = []
            for bk in band_keys:
                if bk in best_scene.assets:
                    band_urls.append(best_scene.assets[bk].href)
                    resolved_names.append(bk.upper())
                elif bk == "b01" and "coastal" in best_scene.assets: band_urls.append(best_scene.assets["coastal"].href); resolved_names.append("B01 (Coastal Aerosol) - 443nm")
                elif bk == "b02" and "blue" in best_scene.assets: band_urls.append(best_scene.assets["blue"].href); resolved_names.append("B02 (Blue) - 490nm")
                elif bk == "b03" and "green" in best_scene.assets: band_urls.append(best_scene.assets["green"].href); resolved_names.append("B03 (Green) - 560nm")
                elif bk == "b04" and "red" in best_scene.assets: band_urls.append(best_scene.assets["red"].href); resolved_names.append("B04 (Red) - 665nm")
                elif bk == "b05" and "rededge1" in best_scene.assets: band_urls.append(best_scene.assets["rededge1"].href); resolved_names.append("B05 (Red Edge 1) - 705nm")
                elif bk == "b06" and "rededge2" in best_scene.assets: band_urls.append(best_scene.assets["rededge2"].href); resolved_names.append("B06 (Red Edge 2) - 740nm")
                elif bk == "b07" and "rededge3" in best_scene.assets: band_urls.append(best_scene.assets["rededge3"].href); resolved_names.append("B07 (Red Edge 3) - 783nm")
                elif bk == "b08" and "nir" in best_scene.assets: band_urls.append(best_scene.assets["nir"].href); resolved_names.append("B08 (NIR) - 842nm")
                elif bk == "b8a" and "nir08" in best_scene.assets: band_urls.append(best_scene.assets["nir08"].href); resolved_names.append("B8A (Narrow NIR) - 865nm")
                elif bk == "b09" and "nir09" in best_scene.assets: band_urls.append(best_scene.assets["nir09"].href); resolved_names.append("B09 (Water Vapour) - 945nm")
                elif bk == "b11" and "swir16" in best_scene.assets: band_urls.append(best_scene.assets["swir16"].href); resolved_names.append("B11 (SWIR 1) - 1610nm")
                elif bk == "b12" and "swir22" in best_scene.assets: band_urls.append(best_scene.assets["swir22"].href); resolved_names.append("B12 (SWIR 2) - 2202nm")
                elif bk == "aot" and "aot" in best_scene.assets: band_urls.append(best_scene.assets["aot"].href); resolved_names.append("AOT (Aerosol Optical Thickness)")
                elif bk == "wvp" and "wvp" in best_scene.assets: band_urls.append(best_scene.assets["wvp"].href); resolved_names.append("WVP (Water Vapour)")
                elif bk == "scl" and "scl" in best_scene.assets: band_urls.append(best_scene.assets["scl"].href); resolved_names.append("SCL (Scene Classification)")
                else:
                    logger.warning(f"Band {bk} not found in asset, skipping.")
            
            if not band_urls:
                logger.error(f"No valid bands selected for {best_scene.id}.")
                continue
            
            with rasterio.Env(
                GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
                GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
                GDAL_HTTP_MULTIPLEX="YES",
                GDAL_HTTP_VERSION="2",
                VSI_CACHE="TRUE",
                VSI_CACHE_SIZE="100000000",
                CPL_VSIL_CURL_ALLOWED_EXTENSIONS="tif"
            ):
                with rasterio.open(band_urls[0]) as src0:
                    from rasterio.warp import transform_bounds
                    from rasterio.vrt import WarpedVRT
                    from rasterio.enums import Resampling
                    from magpi.env import env
                    
                    target_crs = f"EPSG:{env.outputCoordinateSystem}" if env.outputCoordinateSystem else src0.crs
                    
                    target_bounds = transform_bounds('EPSG:4326', target_crs, item_min_lon, item_min_lat, item_max_lon, item_max_lat)
                    
                    with WarpedVRT(src0, crs=target_crs, resampling=Resampling.bilinear) as vrt:
                        window = from_bounds(*target_bounds, vrt.transform).round_offsets().round_lengths()
                        
                        out_meta = vrt.meta.copy()
                        out_meta.update({
                            "driver": "GTiff", 
                            "count": len(band_urls), 
                            "height": window.height, 
                            "width": window.width, 
                            "transform": vrt.window_transform(window),
                            "nodata": 0
                        })
                        
                        with rasterio.open(current_out_raster, "w", **out_meta) as dest:
                            for i, url in enumerate(band_urls, start=1):
                                logger.info(f"Streaming Band {i} into unified grid...")
                                with rasterio.open(url) as src_band:
                                    with WarpedVRT(src_band, crs=target_crs, resampling=Resampling.bilinear) as band_vrt:
                                        dest.write(band_vrt.read(1, window=window), i)
                                        dest.set_band_description(i, resolved_names[i-1])
                                
            logger.info(f"Saved {len(band_urls)}-Band STAC chip to: {current_out_raster}")
            downloaded_rasters.append(current_out_raster)
            
        if not downloaded_rasters:
            return Result(None, status=3)
            
        # Return the list of downloaded rasters (or single if only one)
        if len(downloaded_rasters) == 1:
            return Result(downloaded_rasters[0])
        else:
            # Result objects can wrap a list in their path attribute natively in MagPI
            res = Result(downloaded_rasters[0])
            res.path = downloaded_rasters # Overwrite with list
            res.output = downloaded_rasters
            return res
    except Exception as e:
        import logging
        logger = logging.getLogger("MagPI_WFS")
        logger.error(f"Data pull failed: {e}")
        from .objects import Result
        return Result(None, status=3)

# Backward compatibility wrapper
def PullSentinel2(extent, out_raster, max_cloud_cover=10, date_range="2023-01-01/2023-12-31", item_ids=None, bands=None):
    return PullSTAC(extent, out_raster, "sentinel-2-c1-l2a", "https://earth-search.aws.element84.com/v1", max_cloud_cover, date_range, item_ids, bands)

def PullSentinel1(extent, out_raster, date_range="2023-01-01/2023-12-31", item_ids=None):
    logger.info("Initializing Sentinel-1 SAR Pull (Planetary Computer STAC)...")
    try:
        from .env import env
        out_raster = env.resolve_path(out_raster, intent="input")
        import rasterio
        from rasterio.windows import from_bounds
        
        if hasattr(extent, 'output'):
            extent = extent.output
            
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())

        search_url = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
        payload = { "collections": ["sentinel-1-rtc"] }
        
        if item_ids and isinstance(item_ids, str):
            item_ids = [i.strip() for i in item_ids.split(',')]
            
        if item_ids:
            payload["ids"] = item_ids
            payload["limit"] = len(item_ids)
        else:
            formatted_date = str(date_range).strip()
            if "T" not in formatted_date:
                try:
                    start_d, end_d = formatted_date.split('/')
                    formatted_date = f"{start_d.strip()}T00:00:00Z/{end_d.strip()}T23:59:59Z"
                except Exception: pass 
                
            payload["bbox"] = [min_lon, min_lat, max_lon, max_lat]
            payload["datetime"] = formatted_date
            payload["limit"] = 1
        
        response = requests.post(search_url, json=payload)
        if not response.ok:
            logger.error(f"PC STAC API Error: {response.text}")
            return Result(None, status=3)
            
        stac_data = response.json()
        features = stac_data.get('features', [])
        if not features:
            logger.warning(f"No Sentinel-1 SAR data found for {date_range}")
            return Result(None, status=3)
            
        item = features[0]
        
        # --- OMNI-OPTIMIZED GEOMETRIC VALIDATION ---
        try:
            from shapely.geometry import box
            req_box = box(min_lon, min_lat, max_lon, max_lat)
            scene_bbox = item.get('bbox', None)
            if scene_bbox and len(scene_bbox) == 4:
                scene_box = box(scene_bbox[0], scene_bbox[1], scene_bbox[2], scene_bbox[3])
                if not req_box.intersects(scene_box):
                    logger.error(f"Geometric Mismatch: Requested map extent does not intersect SAR item {item.get('id')}")
                    return Result(None, status=3)
                intersect_box = req_box.intersection(scene_box)
                min_lon, min_lat, max_lon, max_lat = intersect_box.bounds
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"Geometric validation skipped: {str(e)}")
        # ---------------------------------------------
        
        # Get VV and VH polarizations
        assets = item.get('assets', {})
        band_urls = []
        if 'vv' in assets: band_urls.append(assets['vv']['href'])
        if 'vh' in assets: band_urls.append(assets['vh']['href'])
        
        if not band_urls:
            logger.warning("Sentinel-1 item found, but missing VV/VH assets.")
            return Result(None, status=3)
            
        # Optional: For Planetary Computer, you usually need a SAS token.
        # We will attempt to fetch a SAS token anonymously
        token_res = requests.get("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-1-rtc")
        if token_res.ok:
            sas_token = token_res.json().get('token', '')
            band_urls = [f"{url}?{sas_token}" for url in band_urls]

        # Use Rasterio to window read and merge
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS="tif,tiff"):
            with rasterio.open(band_urls[0]) as src0:
                from rasterio.warp import transform_bounds
                from rasterio.vrt import WarpedVRT
                from rasterio.enums import Resampling
                
                target_crs = f"EPSG:{env.outputCoordinateSystem}" if env.outputCoordinateSystem else src0.crs
                target_bounds = transform_bounds('EPSG:4326', target_crs, min_lon, min_lat, max_lon, max_lat)
                
                with WarpedVRT(src0, crs=target_crs, resampling=Resampling.bilinear) as vrt:
                    window = from_bounds(*target_bounds, vrt.transform).round_offsets().round_lengths()
                    out_meta = vrt.meta.copy()
                    out_meta.update({
                        "driver": "GTiff", 
                        "count": len(band_urls), 
                        "height": window.height, 
                        "width": window.width, 
                        "transform": vrt.window_transform(window)
                    })
                    
                    with rasterio.open(out_raster, "w", **out_meta) as dest:
                        for i, url in enumerate(band_urls, start=1):
                            logger.info(f"Streaming SAR Polarization {i} into grid...")
                            with rasterio.open(url) as src_band:
                                with WarpedVRT(src_band, crs=target_crs, resampling=Resampling.bilinear) as band_vrt:
                                    dest.write(band_vrt.read(1, window=window), i)
                                    
        logger.info(f"Saved Sentinel-1 SAR chip to: {out_raster}")
        return Result(out_raster)
    except Exception as e:
        logger.error(f"SAR Data pull failed: {e}")
        return Result(None, status=3)

def PullUSGSElevation(extent, out_raster, resolution_width=1000, resolution_height=1000):
    logger.info("Initializing Z-Axis Data Pull (USGS 3DEP WCS)...")
    try:
        from .env import env
        out_raster = env.resolve_path(out_raster, intent="input")
        if hasattr(extent, 'output'):
            extent = extent.output
            
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())

        wcs_url = (f"https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer"
                   f"?request=GetCoverage&service=WCS&version=1.0.0&coverage=3DEPElevation"
                   f"&bbox={min_lon},{min_lat},{max_lon},{max_lat}&crs=EPSG:4326&format=GeoTIFF_Float32"
                   f"&width={resolution_width}&height={resolution_height}")
        
        response = requests.get(wcs_url, stream=True)
        response.raise_for_status()
        with open(out_raster, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192): fd.write(chunk)

        logger.info(f"Z-Axis Elevation Model saved to: {out_raster}")
        return Result(out_raster)
    except Exception as e:
        logger.error(f"Elevation pull failed: {e}")
        return Result(None, status=3)

def PullNLCD(extent, out_raster, year=2021, product="Land_Cover"):
    try:
        from .env import env
        out_raster = env.resolve_path(out_raster, intent="input")
        import numpy as np
        if hasattr(extent, 'output'):
            extent = extent.output
            
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())

        # FIX: Calculate exact WCS pixel dimensions based on native 30m NLCD resolution!
        lon_dist = (max_lon - min_lon) * 111320 * np.cos(np.radians((min_lat + max_lat) / 2))
        lat_dist = (max_lat - min_lat) * 111320
        width_px = max(10, int(abs(lon_dist) / 30.0))
        height_px = max(10, int(abs(lat_dist) / 30.0))

        coverage_id = f"mrlc_display:NLCD_{year}_{product}_L48"
        wcs_url = (f"https://www.mrlc.gov/geoserver/wcs?service=WCS&version=1.0.0&request=GetCoverage"
                   f"&coverage={coverage_id}&bbox={min_lon},{min_lat},{max_lon},{max_lat}"
                   f"&crs=EPSG:4326&format=GeoTIFF&width={width_px}&height={height_px}")

        logger.info(f"Streaming NLCD matrix directly from MRLC WCS...")
        response = requests.get(wcs_url, stream=True)
        
        if not response.ok:
            logger.error(f"WCS Error: {response.status_code} - Is the year/product available via MRLC?")
            return Result(None, status=3)
            
        with open(out_raster, 'wb') as fd:
            for chunk in response.iter_content(chunk_size=8192):
                fd.write(chunk)
                
        logger.info(f"Sovereign Label Pull Complete. Saved NLCD chip to: {out_raster}")
        return Result(out_raster)

    except Exception as e:
        logger.error(f"NLCD Data pull failed: {e}")
        return Result(None, status=3)

def PullScienceBase(item_id, out_folder):
    """
    MagPI ScienceBase API Integration (The Golden Key)
    Uses the USGS sciencebasepy library to pull raw assets via their digital Object ID.
    """
    logger.info(f"Connecting to USGS ScienceBase Catalog for Item ID: {item_id}...")
    try:
        import sciencebasepy
        
        if not os.path.exists(out_folder):
            os.makedirs(out_folder)
            
        sb = sciencebasepy.SbSession()
        logger.info("Fetching item metadata...")
        item_json = sb.get_item(item_id)
        
        title = item_json.get("title", "Unknown Asset")
        logger.info(f"Found Asset: {title}. Commencing sovereign download...")
        
        sb.get_item_files(item_json, out_folder)
        logger.info(f"Successfully pulled ScienceBase assets to: {out_folder}")
        
        return Result(out_folder)
    except ImportError:
        logger.error("Missing dependency! Please run: pip install sciencebasepy")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"ScienceBase Pull failed: {e}")
        return Result(None, status=3)

def PullCopernicusData(extent, out_feature_class, collection="SENTINEL-1", product_type="IW_SLC__1S", start_date=None, end_date=None, cdse_token=None):
    """
    Connects to the official Copernicus Data Space Ecosystem (CDSE) API.
    Utilizes OData string filters to accurately query the satellite archive.
    """
    logger.info(f"Connecting to Copernicus Data Space Ecosystem (CDSE)...")
    logger.info(f"Querying Collection: {collection} | Product: {product_type}")
    
    try:
        import json
        if hasattr(extent, 'output'):
            extent = extent.output
            
        if hasattr(extent, 'XMin'): 
            min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        elif isinstance(extent, str) and (extent.endswith('.shp') or extent.endswith('.geojson') or os.path.exists(extent)):
            import geopandas as gpd
            gdf = gpd.read_file(extent)
            if gdf.crs and not gdf.crs.is_geographic:
                gdf = gdf.to_crs("EPSG:4326")
            min_lon, min_lat, max_lon, max_lat = gdf.total_bounds
        else: 
            min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())

        # Construct the OData query (compliant with the user's provided spec)
        odata_filter = f"Collection/Name eq '{collection}' and Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/OData.CSC.StringAttribute/Value eq '{product_type}')"
        
        # Add Date constraints if provided
        if start_date and end_date:
            # Enforce DateTimeOffset formatting
            if not start_date.endswith("Z"): start_date += "Z"
            if not end_date.endswith("Z"): end_date += "Z"
            odata_filter += f" and ContentDate/Start ge {start_date} and ContentDate/Start le {end_date}"
            
        # OData endpoint
        cdse_url = f"https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter={odata_filter}&$top=1"
        
        logger.info(f"Compiling OData Request: {cdse_url}")
        
        headers = {}
        if cdse_token and cdse_token != "DEMO_TOKEN_REQUIRED":
            headers["Authorization"] = f"Bearer {cdse_token}"
            logger.info("CDSE Authentication Token detected.")
        else:
            logger.warning("No CDSE Authentication Token provided! Querying metadata only.")
            
        response = requests.get(cdse_url, headers=headers)
        if not response.ok:
            logger.error(f"CDSE API Error ({response.status_code}): {response.text}")
            return Result(None, status=3)
            
        data = response.json()
        items = data.get("value", [])
        
        if not items:
            logger.warning("No Copernicus products found matching this OData query.")
            return Result(None, status=3)
            
        best_item = items[0]
        logger.info(f"Found Asset: {best_item.get('Name')} | Size: {best_item.get('ContentLength', 0) / (1024*1024):.2f} MB")
        
        # In Phase 7, without a robust CDSE download manager, we return a mock file representing the dataset
        with open(out_feature_class, 'w') as f:
            f.write(json.dumps(best_item, indent=4))
            
        logger.info(f"SUCCESS: Copernicus Metadata saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Copernicus Pull failed: {e}")
        return Result(None, status=3)