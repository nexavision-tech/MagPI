# magpi/core.py
import os
import glob
import logging
from .env import env

logger = logging.getLogger("MagPI_Core")

def _get_workspace():
    if not env.workspace:
        logger.warning("arcpy.env.workspace is not set. Defaulting to current directory.")
        return "."
    return env.workspace

def ListFeatureClasses(wild_card=None, feature_type=None, feature_dataset=None):
    """
    MagPI Translation of arcpy.ListFeatureClasses.
    Scans the current arcpy.env.workspace for vector geometries (.shp, .gpkg, .geojson).
    """
    workspace = _get_workspace()
    
    # Common open-source vector formats
    vector_extensions = ["*.shp", "*.geojson", "*.gpkg", "*.sqlite"]
    
    found_files = []
    for ext in vector_extensions:
        search_pattern = os.path.join(workspace, ext)
        found_files.extend(glob.glob(search_pattern))
        
    # Extract just the basenames to mimic arcpy behavior
    basenames = [os.path.basename(f) for f in found_files]
    
    # Apply wildcard filtering if requested (e.g., "*roads*")
    if wild_card:
        import fnmatch
        basenames = fnmatch.filter(basenames, wild_card)
        
    logger.info(f"ListFeatureClasses found {len(basenames)} vector datasets in {workspace}")
    return basenames

def ListRasters(wild_card=None, raster_type=None):
    """
    MagPI Translation of arcpy.ListRasters.
    Scans the current arcpy.env.workspace for raster images (.tif, .png, .img).
    """
    workspace = _get_workspace()
    
    raster_extensions = ["*.tif", "*.tiff", "*.img", "*.jp2", "*.png"]
    
    found_files = []
    for ext in raster_extensions:
        search_pattern = os.path.join(workspace, ext)
        found_files.extend(glob.glob(search_pattern))
        
    basenames = [os.path.basename(f) for f in found_files]
    
    if wild_card:
        import fnmatch
        basenames = fnmatch.filter(basenames, wild_card)
        
    logger.info(f"ListRasters found {len(basenames)} raster datasets in {workspace}")
    return basenames

def ListFiles(wild_card=None):
    """
    MagPI Translation of arcpy.ListFiles.
    Lists all files in the workspace, with optional wildcard filtering.
    """
    workspace = _get_workspace()
    search_pattern = os.path.join(workspace, "*")
    found_files = glob.glob(search_pattern)
    
    basenames = [os.path.basename(f) for f in found_files if os.path.isfile(f)]
    
    if wild_card:
        import fnmatch
        basenames = fnmatch.filter(basenames, wild_card)
        
    return basenames

def Exists(dataset):
    """
    MagPI Translation of arcpy.Exists.
    Checks if a dataset exists in the file system or workspace.
    """
    if os.path.exists(dataset):
        return True
        
    # If not a direct path, check inside the workspace
    workspace_path = os.path.join(_get_workspace(), dataset)
    if os.path.exists(workspace_path):
        return True
        
    return False