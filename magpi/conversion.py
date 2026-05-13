# magpi/conversion.py
import geopandas as gpd
import os
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Conversion")

def FeatureClassToFeatureClass(in_features, out_path, out_name, where_clause=None, field_mapping=None, config_keyword=None):
    """
    MagPI Translation of arcpy.conversion.FeatureClassToFeatureClass.
    Reads a vector dataset, optionally filters it via SQL, and writes it to a new location/format.
    """
    out_full_path = os.path.join(out_path, out_name)
    logger.info(f"Converting Feature Class: {in_features} -> {out_full_path}")
    
    try:
        # 1. Load the data into pure RAM
        gdf = gpd.read_file(in_features)
        
        # 2. Process the MVP Where Clause
        if where_clause:
            logger.info(f"Applying SQL filter: {where_clause}")
            # Translating basic SQL to Pandas query syntax
            # e.g., "POPULATION > 1000" works natively in pandas.query()
            try:
                gdf = gdf.query(where_clause)
            except Exception as q_err:
                logger.warning(f"Complex SQL where_clause failed Pandas evaluation. Writing unfiltered. Error: {q_err}")
                
        # 3. Write to the new format (GeoPandas infers the format from the out_name extension!)
        gdf.to_file(out_full_path)
        
        logger.info("Conversion complete.")
        return Result(out_full_path)
        
    except Exception as e:
        logger.error(f"Failed to convert Feature Class: {e}")
        return Result(None, status=3)

def ExportFeatures(in_features, out_features, where_clause=None, use_field_alias_as_name="NOT_USE_ALIAS", field_mapping=None, sort_field=None):
    """
    MagPI Translation of arcpy.conversion.ExportFeatures.
    This is the newer ArcGIS Pro equivalent of FeatureClassToFeatureClass.
    """
    logger.info(f"Exporting Features: {in_features} -> {out_features}")
    
    try:
        gdf = gpd.read_file(in_features)
        
        if where_clause:
            try:
                gdf = gdf.query(where_clause)
            except Exception as q_err:
                logger.warning(f"SQL filter failed: {q_err}")
                
        if sort_field:
            # Sort the dataframe by the requested column
            sort_col = sort_field.split()[0] # Handle "Field ASC" or "Field DESC" strings
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
    """
    MagPI Translation of arcpy.conversion.RasterToOtherFormat.
    Uses Rasterio to translate imagery files.
    """
    import rasterio
    logger.info(f"Converting Rasters to {Raster_Format} in {Output_Workspace}")
    
    # Standardize the target driver for rasterio
    format_map = {
        "TIFF": "GTiff",
        "PNG": "PNG",
        "JPEG": "JPEG",
        "GRID": "AAIGrid" # Arc/Info ASCII Grid
    }
    target_driver = format_map.get(Raster_Format.upper(), "GTiff")
    
    # Handle single string or list of rasters
    if isinstance(Input_Rasters, str):
        Input_Rasters = [f.strip() for f in Input_Rasters.split(';')]
        
    results = []
    for in_raster in Input_Rasters:
        try:
            filename = os.path.basename(in_raster)
            name_only = os.path.splitext(filename)[0]
            
            # Construct new extension based on format
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
            
    # Return the first result to mimic ArcPy standard output behavior, but technically it did batch
    return Result(results[0] if results else None)