# magpi/listing.py
import os
import fnmatch
import logging
from .env import env

logger = logging.getLogger("MagPI_Listing")

def ListFeatureClasses(wild_card=None, feature_type=None, feature_dataset=None):
    """
    MagPI Translation of arcpy.ListFeatureClasses.
    Scans the current arcpy.env.workspace for vector files.
    """
    if not env.workspace or not os.path.exists(env.workspace):
        logger.warning("Workspace not set or does not exist. Cannot list feature classes.")
        return []

    logger.info(f"Scanning workspace for Feature Classes: {env.workspace}")
    valid_exts = ('.shp', '.gpkg', '.geojson')
    results = []
    
    try:
        for f in os.listdir(env.workspace):
            if f.lower().endswith(valid_exts):
                if wild_card:
                    # Translate ESRI wildcard (*) to Python fnmatch
                    if fnmatch.fnmatch(f.lower(), wild_card.lower()):
                        results.append(f)
                else:
                    results.append(f)
        return results
    except Exception as e:
        logger.error(f"Error listing feature classes: {e}")
        return []

def ListRasters(wild_card=None, raster_type=None):
    """
    MagPI Translation of arcpy.ListRasters.
    Scans the current arcpy.env.workspace for raster files.
    """
    if not env.workspace or not os.path.exists(env.workspace):
        logger.warning("Workspace not set or does not exist. Cannot list rasters.")
        return []

    logger.info(f"Scanning workspace for Rasters: {env.workspace}")
    valid_exts = ('.tif', '.tiff', '.png', '.jpg', '.img')
    results = []
    
    try:
        for f in os.listdir(env.workspace):
            if f.lower().endswith(valid_exts):
                if wild_card:
                    if fnmatch.fnmatch(f.lower(), wild_card.lower()):
                        results.append(f)
                else:
                    results.append(f)
        return results
    except Exception as e:
        logger.error(f"Error listing rasters: {e}")
        return []
