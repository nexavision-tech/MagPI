# magpi/wfs.py
import geopandas as gpd
import logging
import requests
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