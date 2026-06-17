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

def RasterToPolygon(in_raster, out_polygon_features, simplify="SIMPLIFY", value_field="Value", background_value=0):
    """
    MagPI Translation of arcpy.conversion.RasterToPolygon.
    Converts a classified AI mask (pixels) into a Vector Shapefile/GeoJSON (polygons).
    """
    if hasattr(in_raster, 'name'): raster_path = in_raster.name
    elif hasattr(in_raster, 'output'): raster_path = in_raster.output
    else: raster_path = str(in_raster)

    logger.info(f"Initiating Vector Extraction: {os.path.basename(raster_path)} -> Polygons")

    try:
        import rasterio
        from rasterio.features import shapes
        from shapely.geometry import shape
        import geopandas as gpd

        with rasterio.open(raster_path) as src:
            image = src.read(1)
            
            # Mask out the background (e.g. 0) so we don't draw massive polygons for empty space
            if background_value is not None:
                mask = image != background_value
            else:
                mask = None

            logger.info("Tracing pixel boundaries and converting to mathematical geometry...")
            
            # Extract the shapes using rasterio's blazing fast C-engine
            results = (
                {'properties': {value_field: v}, 'geometry': s}
                for i, (s, v) in enumerate(
                    shapes(image, mask=mask, transform=src.transform)
                )
            )

            geoms = list(results)
            
            if not geoms:
                logger.warning("No features found to extract! (Is the image entirely background?)")
                return Result(None, status=3)

            # Convert to a GeoDataFrame
            logger.info(f"Generated {len(geoms)} raw vector features. Compiling to file...")
            gdf = gpd.GeoDataFrame.from_features(geoms, crs=src.crs)
            
            # Save the vectors
            gdf.to_file(out_polygon_features)
            
        logger.info(f"SUCCESS: Vector extraction complete. Saved to: {out_polygon_features}")
        return Result(out_polygon_features)

    except ImportError:
        logger.error("Missing dependency! Run: conda install geopandas shapely -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Raster to Polygon conversion failed: {e}")
        return Result(None, status=3)

def ExportToPostGIS(in_features, connection_string, table_name):
    """MagPI Translation of arcpy.conversion.ExportToPostGIS."""
    logger.info(f"Exporting features to PostGIS: {table_name}")
    try:
        import geopandas as gpd
        from sqlalchemy import create_engine
        from magpi.db import fix_connection_string
        
        gdf = gpd.read_file(in_features)
        engine = create_engine(fix_connection_string(connection_string))
        gdf.to_postgis(table_name, engine, if_exists='replace')
        
        logger.info(f"Export to PostGIS complete: {table_name}")
        return Result(table_name)
    except Exception as e:
        logger.error(f"Failed to export to PostGIS: {e}")
        return Result(None, status=3)