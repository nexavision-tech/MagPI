# magpi/analysis.py
import geopandas as gpd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Analysis")

def _resolve_features(features):
    logger.info(f"[_resolve_features] Input type: {type(features)}, value: {features}")
    if hasattr(features, 'output'):
        features = features.output
        logger.info(f"[_resolve_features] Unwrapped Result output. New type: {type(features)}")
    if hasattr(features, 'XMin'):
        logger.info("[_resolve_features] Features has XMin. Converting to GeoDataFrame.")
        import shapely.geometry
        polygon = shapely.geometry.box(features.XMin, features.YMin, features.XMax, features.YMax)
        crs = getattr(features, 'spatialReference', "EPSG:4326") or "EPSG:4326"
        return gpd.GeoDataFrame(geometry=[polygon], crs=crs)
    logger.info("[_resolve_features] Calling gpd.read_file.")
    return gpd.read_file(features)

def Buffer(in_features, out_feature_class, buffer_distance_or_field, 
           line_side="FULL", line_end_type="ROUND", dissolve_option="NONE", 
           dissolve_field=None, method="PLANAR"):
    """MagPI Translation of arcpy.analysis.Buffer."""
    logger.info(f"Executing Open-Source Buffer on: {in_features}")
    try:
        gdf = _resolve_features(in_features)
        
        try:
            dist_val = float(buffer_distance_or_field.split(" ")[0])
        except (ValueError, AttributeError):
            dist_val = float(buffer_distance_or_field)

        unit = "Meters"
        if isinstance(buffer_distance_or_field, str) and " " in buffer_distance_or_field:
            unit = buffer_distance_or_field.split(" ")[1]

        is_geographic = gdf.crs and gdf.crs.is_geographic
        if is_geographic and unit in ["Meters", "Kilometers", "Feet", "Miles"]:
            logger.info("Projecting to local CRS for accurate distance buffering...")
            original_crs = gdf.crs
            centroid = gdf.geometry.iloc[0].centroid
            local_crs = f"+proj=aeqd +lat_0={centroid.y} +lon_0={centroid.x} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
            gdf = gdf.to_crs(local_crs)
            
            if unit == "Kilometers": dist_val *= 1000
            elif unit == "Feet": dist_val *= 0.3048
            elif unit == "Miles": dist_val *= 1609.34
            
            buffered_gdf = gdf.copy()
            buffered_gdf.geometry = gdf.geometry.buffer(dist_val)
            buffered_gdf = buffered_gdf.to_crs(original_crs)
        else:
            buffered_gdf = gdf.copy()
            buffered_gdf.geometry = gdf.geometry.buffer(dist_val)
        
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
        gdf_in = _resolve_features(in_features)
        gdf_clip = _resolve_features(clip_features)
        
        clipped_gdf = gpd.clip(gdf_in, gdf_clip)
        clipped_gdf.to_file(out_feature_class)
        
        logger.info(f"Clip complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to clip: {e}")
        return Result(None, status=3)

def Intersect(in_features, out_feature_class, join_attributes="ALL", cluster_tolerance=None, output_type="INPUT"):
    """MagPI Translation of arcpy.analysis.Intersect."""
    logger.info(f"Executing Open-Source Intersect on: {in_features}")
    try:
        if isinstance(in_features, str):
            feature_list = [f.strip() for f in in_features.split(';')]
        else:
            feature_list = in_features

        if len(feature_list) < 2:
            logger.warning("Intersect requires at least 2 layers. Passing input through.")
            gdf = _resolve_features(feature_list[0])
            gdf.to_file(out_feature_class)
            return Result(out_feature_class)

        base_gdf = _resolve_features(feature_list[0])
        for feat in feature_list[1:]:
            overlay_gdf = _resolve_features(feat)
            base_gdf = gpd.overlay(base_gdf, overlay_gdf, how='intersection')
            
        base_gdf.to_file(out_feature_class)
        logger.info(f"Intersect complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to intersect: {e}")
        return Result(None, status=3)

def Erase(in_features, erase_features, out_feature_class, cluster_tolerance=None):
    """MagPI Translation of arcpy.analysis.Erase."""
    logger.info(f"Executing Open-Source Erase on: {in_features}")
    try:
        gdf_in = _resolve_features(in_features)
        gdf_erase = _resolve_features(erase_features)
        
        erased_gdf = gpd.overlay(gdf_in, gdf_erase, how='difference')
        erased_gdf.to_file(out_feature_class)
        
        logger.info(f"Erase complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to erase: {e}")
        return Result(None, status=3)

def SpatialJoin(target_features, join_features, out_feature_class, join_operation="JOIN_ONE_TO_ONE", join_type="KEEP_ALL", match_option="INTERSECT"):
    """
    MagPI Translation of arcpy.analysis.SpatialJoin.
    Merges the attributes of one layer into another based on their spatial relationship.
    """
    logger.info(f"Executing Open-Source SpatialJoin: {target_features} <- {join_features}")
    try:
        target_gdf = _resolve_features(target_features)
        join_gdf = _resolve_features(join_features)

        # Reproject on the fly if CRSs don't match (crucial for spatial joins)
        if target_gdf.crs != join_gdf.crs:
            logger.info("CRSs do not match. Reprojecting join features to match target...")
            join_gdf = join_gdf.to_crs(target_gdf.crs)

        # Translate ESRI match options to GeoPandas predicates
        predicate_map = {
            "INTERSECT": "intersects",
            "CONTAINS": "contains",
            "WITHIN": "within",
            "TOUCHES": "touches"
        }
        predicate = predicate_map.get(match_option.upper(), "intersects")

        # Translate ESRI join types (KEEP_ALL = Left Join, KEEP_COMMON = Inner Join)
        how = "left" if join_type.upper() == "KEEP_ALL" else "inner"

        # The C-backed rtree spatial index makes this instant
        logger.info(f"Applying '{how}' join using '{predicate}' predicate...")
        joined_gdf = gpd.sjoin(target_gdf, join_gdf, how=how, predicate=predicate)
        
        # Clean up the auto-generated index column from GeoPandas
        if 'index_right' in joined_gdf.columns:
            joined_gdf = joined_gdf.drop(columns=['index_right'])

        joined_gdf.to_file(out_feature_class)
        logger.info(f"Spatial Join complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)

    except Exception as e:
        logger.error(f"Failed to execute Spatial Join: {e}")
        return Result(None, status=3)

def Select(in_features, out_feature_class, where_clause=""):
    """
    MagPI Translation of arcpy.analysis.Select.
    Extracts features from an input layer based on a SQL query and saves them to a new file.
    """
    logger.info(f"Executing Open-Source Select on: {in_features}")
    try:
        gdf = _resolve_features(in_features)
        
        if where_clause:
            logger.info(f"Applying SQL filter: {where_clause}")
            # Translating basic SQL '=' to Pandas '==' for seamless translation
            pandas_query = where_clause.replace(" = ", " == ")
            try:
                gdf = gdf.query(pandas_query)
            except Exception as q_err:
                logger.error(f"Pandas evaluation failed for where_clause. Error: {q_err}")
                return Result(None, status=3)
                
        gdf.to_file(out_feature_class)
        logger.info(f"Select complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to execute Select: {e}")
        return Result(None, status=3)