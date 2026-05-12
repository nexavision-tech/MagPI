# magpi/management.py
import geopandas as gpd
import os
import logging
import shutil
from .objects import Result

logger = logging.getLogger("MagPI_Management")

def GetCount(in_rows):
    """
    MagPI Translation of arcpy.management.GetCount.
    Reads the dataset and returns the length of the GeoDataFrame.
    """
    logger.info(f"Executing GetCount on: {in_rows}")
    try:
        gdf = gpd.read_file(in_rows)
        count = len(gdf)
        logger.info(f"Count result: {count}")
        return Result(count)
    except Exception as e:
        logger.error(f"Failed to get count: {e}")
        return Result(0, status=3) # Status 3 implies failure

def CopyFeatures(in_features, out_feature_class, config_keyword=None, spatial_grid_1=None, spatial_grid_2=None, spatial_grid_3=None):
    """
    MagPI Translation of arcpy.management.CopyFeatures.
    """
    logger.info(f"Copying features from {in_features} to {out_feature_class}")
    try:
        gdf = gpd.read_file(in_features)
        # Bypassing legacy spatial_grid parameters as GeoPandas handles spatial indexing natively
        gdf.to_file(out_feature_class)
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to copy features: {e}")
        return Result(None, status=3)

def Delete(in_data, data_type=None):
    """
    MagPI Translation of arcpy.management.Delete.
    Detects if the target is a file or a directory (like a .gdb) and removes it.
    """
    logger.info(f"Attempting to delete: {in_data}")
    if os.path.exists(in_data):
        try:
            if os.path.isdir(in_data):
                shutil.rmtree(in_data)
            else:
                os.remove(in_data)
            logger.info(f"Successfully deleted {in_data}")
            return Result(True)
        except Exception as e:
            logger.error(f"Failed to delete {in_data}: {e}")
            return Result(False, status=3)
    else:
        logger.warning(f"Data not found for deletion: {in_data}")
        return Result(True) # Legacy ArcPy usually returns true if it's already gone
