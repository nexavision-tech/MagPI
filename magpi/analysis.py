# magpi/analysis.py
import geopandas as gpd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Analysis")

def Buffer(in_features, out_feature_class, buffer_distance_or_field, 
           line_side="FULL", line_end_type="ROUND", dissolve_option="NONE", 
           dissolve_field=None, method="PLANAR"):
    """MagPI Translation of arcpy.analysis.Buffer."""
    logger.info(f"Executing Open-Source Buffer on: {in_features}")
    
    try:
        gdf = gpd.read_file(in_features)
        
        # Parse the distance string (e.g., "10 Meters" -> 10.0)
        try:
            dist_val = float(buffer_distance_or_field.split(" ")[0])
        except (ValueError, AttributeError):
            dist_val = float(buffer_distance_or_field)

        # Apply vectorized geometry math (Native C-speed via Shapely)
        buffered_gdf = gdf.copy()
        buffered_gdf.geometry = gdf.geometry.buffer(dist_val)
        
        # Save output
        buffered_gdf.to_file(out_feature_class)
        logger.info(f"Buffer complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to buffer: {e}")
        return Result(None, status=3)


def Clip(in_features, clip_features, out_feature_class, cluster_tolerance=None):
    """MagPI Translation of arcpy.analysis.Clip."""
    logger.info(f"Executing Open-Source Clip on: {in_features}")
    try:
        gdf_in = gpd.read_file(in_features)
        gdf_clip = gpd.read_file(clip_features)
        
        clipped_gdf = gpd.clip(gdf_in, gdf_clip)
        clipped_gdf.to_file(out_feature_class)
        
        logger.info(f"Clip complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to clip: {e}")
        return Result(None, status=3)


def Intersect(in_features, out_feature_class, join_attributes="ALL", cluster_tolerance=None, output_type="INPUT"):
    """
    MagPI Translation of arcpy.analysis.Intersect.
    Handles single inputs (self-intersect) or multiple inputs via GeoPandas overlay.
    """
    logger.info(f"Executing Open-Source Intersect on: {in_features}")
    try:
        # Legacy scripts pass a list or a semicolon-separated string for multiple inputs
        if isinstance(in_features, str):
            feature_list = [f.strip() for f in in_features.split(';')]
        else:
            feature_list = in_features

        if len(feature_list) < 2:
            logger.warning("Intersect requires at least 2 layers. Passing input through.")
            gdf = gpd.read_file(feature_list[0])
            gdf.to_file(out_feature_class)
            return Result(out_feature_class)

        # Iteratively intersect all layers in the list
        base_gdf = gpd.read_file(feature_list[0])
        for feat in feature_list[1:]:
            overlay_gdf = gpd.read_file(feat)
            base_gdf = gpd.overlay(base_gdf, overlay_gdf, how='intersection')
            
        base_gdf.to_file(out_feature_class)
        logger.info(f"Intersect complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to intersect: {e}")
        return Result(None, status=3)


def Erase(in_features, erase_features, out_feature_class, cluster_tolerance=None):
    """
    MagPI Translation of arcpy.analysis.Erase.
    ESRI locks this behind an 'Advanced' license. MagPI does it for free.
    """
    logger.info(f"Executing Open-Source Erase on: {in_features}")
    try:
        gdf_in = gpd.read_file(in_features)
        gdf_erase = gpd.read_file(erase_features)
        
        erased_gdf = gpd.overlay(gdf_in, gdf_erase, how='difference')
        erased_gdf.to_file(out_feature_class)
        
        logger.info(f"Erase complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to erase: {e}")
        return Result(None, status=3)

