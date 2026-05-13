# magpi/conversion.py
import geopandas as gpd
import os
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Conversion")

def FeatureClassToFeatureClass(in_features, out_path, out_name, where_clause=None, field_mapping=None, config_keyword=None):
    """MagPI Translation of arcpy.conversion.FeatureClassToFeatureClass."""
    out_full_path = os.path.join(out_path, out_name)
    logger.info(f"Converting Feature Class: {in_features} -> {out_full_path}")
    
    try:
        gdf = gpd.read_file(in_features)
        
        if where_clause:
            logger.info(f"Applying SQL filter: {where_clause}")
            try:
                gdf = gdf.query(where_clause)
            except Exception as q_err:
                logger.warning(f"Complex SQL where_clause failed Pandas evaluation. Writing unfiltered. Error: {q_err}")
                
        gdf.to_file(out_full_path)
        logger.info("Conversion complete.")
        return Result(out_full_path)
        
    except Exception as e:
        logger.error(f"Failed to convert Feature Class: {e}")
        return Result(None, status=3)

def ExportFeatures(in_features, out_features, where_clause=None, use_field_alias_as_name="NOT_USE_ALIAS", field_mapping=None, sort_field=None):
    """MagPI Translation of arcpy.conversion.ExportFeatures."""
    logger.info(f"Exporting Features: {in_features} -> {out_features}")
    
    try:
        gdf = gpd.read_file(in_features)
        
        if where_clause:
            try:
                gdf = gdf.query(where_clause)
            except Exception as q_err:
                logger.warning(f"SQL filter failed: {q_err}")
                
        if sort_field:
            sort_col = sort_field.split()[0]
            ascending = "DESC" not in sort_field.upper()
            if sort_col in gdf.columns:
                gdf = gdf.sort_values(by=sort_col, ascending=ascending)
                
        gdf.to_file(out_features)
        logger.info("Export complete.")
        return Result(out_features)
        
    except Exception as e:
        logger.error(f"Failed to export features: {e}")
        return Result(None, status=3)

def RasterToOtherFormat(Input_Rasters, Output_Workspace, Raster_Format="TIFF"):
    """MagPI Translation of arcpy.conversion.RasterToOtherFormat."""
    import rasterio
    logger.info(f"Converting Rasters to {Raster_Format} in {Output_Workspace}")
    
    format_map = {"TIFF": "GTiff", "PNG": "PNG", "JPEG": "JPEG", "GRID": "AAIGrid"}
    target_driver = format_map.get(Raster_Format.upper(), "GTiff")
    
    if isinstance(Input_Rasters, str):
        Input_Rasters = [f.strip() for f in Input_Rasters.split(';')]
        
    results = []
    for in_raster in Input_Rasters:
        try:
            filename = os.path.basename(in_raster)
            name_only = os.path.splitext(filename)[0]
            ext = ".tif" if target_driver == "GTiff" else f".{Raster_Format.lower()}"
            out_raster = os.path.join(Output_Workspace, name_only + ext)
            
            with rasterio.open(in_raster) as src:
                profile = src.profile
                profile.update(driver=target_driver)
                with rasterio.open(out_raster, 'w', **profile) as dst:
                    dst.write(src.read())
                    
            logger.info(f"Successfully converted: {out_raster}")
            results.append(out_raster)
        except Exception as e:
            logger.error(f"Failed to convert raster {in_raster}: {e}")
            
    return Result(results[0] if results else None)

def RasterToPolygon(in_raster, out_polygon_features, simplify="SIMPLIFY", raster_field="Value", create_multipart_features="SINGLE_OUTER_PART", max_vertices_per_feature=None):
    """
    MagPI Translation of arcpy.conversion.RasterToPolygon.
    Converts gridded raster pixels into smooth vector geometry footprints.
    """
    import rasterio
    from rasterio import features
    import numpy as np

    logger.info(f"Executing Open-Source RasterToPolygon on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            image = src.read(1)
            
            # Mask out the NoData pixels so we only draw polygons around actual features
            if src.nodata is not None:
                # Handle both exact matches and floating point nan
                if np.isnan(src.nodata):
                    mask = ~np.isnan(image)
                else:
                    mask = image != src.nodata
            else:
                mask = None

            logger.info("Tracing pixel boundaries into vector shapes via Rasterio C-backend...")
            # rasterio.features.shapes returns a generator of (GeoJSON_polygon, pixel_value)
            results = (
                {'properties': {raster_field: float(v)}, 'geometry': s}
                for i, (s, v) in enumerate(features.shapes(image, mask=mask, transform=src.transform))
            )

            # Instantly load the GeoJSON shapes into a GeoPandas dataframe
            gdf = gpd.GeoDataFrame.from_features(list(results))
            
            if src.crs:
                gdf.set_crs(src.crs, inplace=True)

            gdf.to_file(out_polygon_features)
            logger.info(f"Raster successfully converted to Polygon. Saved to: {out_polygon_features}")
            return Result(out_polygon_features)
            
    except Exception as e:
        logger.error(f"Failed to convert Raster to Polygon: {e}")
        return Result(None, status=3)