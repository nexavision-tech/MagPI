# magpi/humangeo.py
import os
import json
import logging
import requests
from .objects import Result
from .env import env

logger = logging.getLogger("MagPI_HumanGeo")

def OSMFeatureExtractor(bbox_extent, feature_type, out_vector):
    """
    Scrapes vector features from OpenStreetMap via the Overpass API.
    feature_type can be: "buildings", "roads", "water", "amenities", "landuse"
    bbox_extent should be a string: "ymin,xmin,ymax,xmax" or a Result object from an Extent tool.
    """
    logger.info(f"Initiating Global Human Geography Scraper (Overpass API)...")
    
    out_vector = env.resolve_path(out_vector)
    
    # Resolve bbox
    bbox_str = ""
    if hasattr(bbox_extent, 'name'):
        # If it's a file, try to extract bounds using geopandas/rasterio
        try:
            import geopandas as gpd
            gdf = gpd.read_file(bbox_extent.name)
            bounds = gdf.to_crs("EPSG:4326").total_bounds # [xmin, ymin, xmax, ymax]
            bbox_str = f"{bounds[1]},{bounds[0]},{bounds[3]},{bounds[2]}"
        except Exception:
            try:
                import rasterio
                with rasterio.open(bbox_extent.name) as src:
                    from rasterio.warp import transform_bounds
                    bounds = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
                    bbox_str = f"{bounds[1]},{bounds[0]},{bounds[3]},{bounds[2]}"
            except Exception as e:
                logger.error(f"Failed to extract bounds from {bbox_extent.name}: {e}")
                return Result(None, status=3)
    elif isinstance(bbox_extent, dict) and 'ymin' in bbox_extent:
        # Dictionary from UI Core Extent
        bbox_str = f"{bbox_extent['ymin']},{bbox_extent['xmin']},{bbox_extent['ymax']},{bbox_extent['xmax']}"
    else:
        # Assume it's a string "ymin,xmin,ymax,xmax"
        bbox_str = str(bbox_extent)

    if not bbox_str:
        logger.error("Invalid Bounding Box provided.")
        return Result(None, status=3)

    logger.info(f"Target Extent (WGS84): [{bbox_str}]")
    logger.info(f"Target Feature: {feature_type.upper()}")

    # Define Overpass queries based on type
    queries = {
        "buildings": f'way["building"]({bbox_str});relation["building"]({bbox_str});',
        "roads": f'way["highway"]({bbox_str});',
        "water": f'way["natural"="water"]({bbox_str});relation["natural"="water"]({bbox_str});',
        "amenities": f'node["amenity"]({bbox_str});way["amenity"]({bbox_str});',
        "landuse": f'way["landuse"]({bbox_str});relation["landuse"]({bbox_str});'
    }
    
    query_body = queries.get(feature_type.lower())
    if not query_body:
        logger.warning(f"Unknown feature type '{feature_type}', defaulting to 'buildings'")
        query_body = queries["buildings"]

    overpass_query = f"""
    [out:json][timeout:60];
    (
      {query_body}
    );
    out body;
    >;
    out skel qt;
    """

    try:
        logger.info("Executing remote request to Overpass API...")
        response = requests.post("https://overpass-api.de/api/interpreter", data=overpass_query, timeout=65)
        response.raise_for_status()
        
        data = response.json()
        if not data.get("elements"):
            logger.warning("Query successful, but no features found in the specified extent.")
            return Result(None, status=2)

        # We must convert Overpass JSON to GeoJSON. 
        # For a robust pipeline, osmnx or directly translating nodes to geometries is needed.
        # Here we implement a lightweight manual translation for points and simple polygons to avoid massive dependencies.
        logger.info(f"Downloaded {len(data['elements'])} raw OSM elements. Compiling geometries...")
        
        nodes = {el['id']: (el['lon'], el['lat']) for el in data['elements'] if el['type'] == 'node'}
        
        features = []
        for el in data['elements']:
            tags = el.get('tags', {})
            if el['type'] == 'node' and tags:
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [el['lon'], el['lat']]
                    },
                    "properties": tags
                })
            elif el['type'] == 'way' and tags:
                coords = [nodes[n_id] for n_id in el.get('nodes', []) if n_id in nodes]
                if len(coords) < 2: continue
                
                # If first and last point are the same, it's a polygon
                is_poly = coords[0] == coords[-1] and len(coords) >= 4
                geom_type = "Polygon" if is_poly else "LineString"
                geom_coords = [coords] if is_poly else coords
                
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": geom_type,
                        "coordinates": geom_coords
                    },
                    "properties": tags
                })

        geojson = {
            "type": "FeatureCollection",
            "features": features
        }

        # Write out to GeoJSON (or let Geopandas convert to SHP/GPKG based on out_vector extension)
        import geopandas as gpd
        gdf = gpd.GeoDataFrame.from_features(geojson['features'], crs="EPSG:4326")
        
        if out_vector.endswith('.shp'):
            # SHP doesn't like complex tags or mixed geometry types easily, but geopandas handles basics
            gdf.to_file(out_vector, driver="ESRI Shapefile")
        elif out_vector.endswith('.gpkg') or out_vector.endswith('.sqlite'):
            gdf.to_file(out_vector, driver="GPKG")
        else:
            with open(out_vector, 'w') as f:
                json.dump(geojson, f)

        logger.info(f"SUCCESS: Exported {len(features)} vector features to {out_vector}")
        return Result(out_vector)

    except Exception as e:
        logger.error(f"OSM Extraction failed: {e}")
        return Result(None, status=3)

def WorldPopIngestor(iso3_country, year, out_raster):
    """
    Downloads high-resolution population density rasters directly from WorldPop Hub.
    Example iso3_country: 'HTI' for Haiti, 'PSE' for Palestine.
    """
    logger.info(f"Initiating WorldPop High-Res Population Ingestor...")
    
    iso3 = str(iso3_country).lower().strip()
    year = str(year).strip()
    out_raster = env.resolve_path(out_raster)
    
    # Construct standard WorldPop Unconstrained Global Mosaic URL
    # Format: https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/HTI/hti_ppp_2020.tif
    url = f"https://data.worldpop.org/GIS/Population/Global_2000_2020/{year}/{iso3.upper()}/{iso3}_ppp_{year}_1km.tif"
    
    logger.info(f"Requesting target: {iso3.upper()} ({year})")
    logger.info(f"Endpoint: {url}")
    
    try:
        # To avoid actual massive downloads during dev, we'll try streaming the header, 
        # and if it exists, we download a chunk or simulate success if requested.
        # Actually, let's just do a GET request and stream it to the out_raster.
        with requests.get(url, stream=True) as r:
            r.raise_for_status()
            
            # Let's ensure the directory exists
            os.makedirs(os.path.dirname(out_raster), exist_ok=True)
            
            with open(out_raster, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
        logger.info(f"SUCCESS: WorldPop Dataset ingested to {out_raster}")
        return Result(out_raster)
        
    except requests.exceptions.HTTPError as he:
        if he.response.status_code == 404:
             logger.warning(f"WorldPop dataset not found for {iso3.upper()} in {year}. Trying alternate 100m resolution endpoint...")
             alt_url = f"https://data.worldpop.org/GIS/Population/Global_2000_2020/{year}/{iso3.upper()}/{iso3}_ppp_{year}.tif"
             try:
                 with requests.get(alt_url, stream=True) as r_alt:
                     r_alt.raise_for_status()
                     with open(out_raster, 'wb') as f:
                         for chunk in r_alt.iter_content(chunk_size=8192):
                             f.write(chunk)
                 logger.info(f"SUCCESS: Alternate 100m WorldPop Dataset ingested to {out_raster}")
                 return Result(out_raster)
             except Exception as e_alt:
                 logger.error(f"Failed to find any WorldPop datasets for {iso3.upper()} ({year}). HTTP 404.")
                 return Result(None, status=3)
        else:
             logger.error(f"HTTP Error during WorldPop download: {he}")
             return Result(None, status=3)
    except Exception as e:
        logger.error(f"WorldPop Ingest failed: {e}")
        return Result(None, status=3)
