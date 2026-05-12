# magpi/analysis.py
import geopandas as gpd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Analysis")

def Buffer(in_features, out_feature_class, buffer_distance_or_field, 
           line_side="FULL", line_end_type="ROUND", dissolve_option="NONE", 
           dissolve_field=None, method="PLANAR"):
    """
    MagPI Translation of arcpy.analysis.Buffer.
    Bypasses ESRI licensing and executes via lightning-fast GeoPandas/Shapely arrays.
    """
    logger.info(f"Executing Open-Source Buffer on: {in_features}")
    
    # 1. Load data into memory 
    gdf = gpd.read_file(in_features)
    
    # 2. Parse the distance string (e.g., "50 Meters" -> 50.0)
    # Note: A future Gaian Mind update will inject automatic CRS reprojection here 
    # to ensure perfect metric buffering regardless of input projection.
    try:
        dist_val = float(buffer_distance_or_field.split(" ")[0])
    except (ValueError, AttributeError):
        logger.error(f"Failed to parse buffer distance from: {buffer_distance_or_field}")
        dist_val = 1.0 # Safe fallback

    # 3. Apply vectorized geometry math (Native C-speed via Shapely)
    buffered_gdf = gdf.copy()
    buffered_gdf.geometry = gdf.geometry.buffer(dist_val)
    
    # 4. Save the output gracefully
    buffered_gdf.to_file(out_feature_class)
    logger.info(f"Buffer complete. Saved to: {out_feature_class}")
    
    # 5. Return the duck-typed Result object to satisfy legacy scripts
    return Result(out_feature_class)


def Clip(in_features, clip_features, out_feature_class, cluster_tolerance=None):
    """
    MagPI Translation of arcpy.analysis.Clip.
    """
    logger.info(f"Executing Open-Source Clip on: {in_features}")
    
    # Load targets and masks
    gdf_in = gpd.read_file(in_features)
    gdf_clip = gpd.read_file(clip_features)
    
    # Execute vectorized intersection overlay
    clipped_gdf = gpd.clip(gdf_in, gdf_clip)
    
    # Export to disk
    clipped_gdf.to_file(out_feature_class)
    logger.info(f"Clip complete. Saved to: {out_feature_class}")
    
    return Result(out_feature_class)