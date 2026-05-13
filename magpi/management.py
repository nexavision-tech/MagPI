# magpi/management.py
import geopandas as gpd
import pandas as pd
import os
import logging
import shutil
import re
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
        return Result(0, status=3)

def CopyFeatures(in_features, out_feature_class, config_keyword=None, spatial_grid_1=None, spatial_grid_2=None, spatial_grid_3=None):
    """MagPI Translation of arcpy.management.CopyFeatures."""
    logger.info(f"Copying features from {in_features} to {out_feature_class}")
    try:
        gdf = gpd.read_file(in_features)
        gdf.to_file(out_feature_class)
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to copy features: {e}")
        return Result(None, status=3)

def Delete(in_data, data_type=None):
    """
    MagPI Translation of arcpy.management.Delete.
    Detects if the target is a file or a directory and gracefully removes it.
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
        return Result(True)

def Project(in_dataset, out_dataset, out_coor_system, transform_method=None, in_coor_system=None, preserve_shape="NO_PRESERVE_SHAPE", max_deviation=None, vertical="NO_VERTICAL"):
    """
    MagPI Translation of arcpy.management.Project.
    Bypasses the proprietary projection engine using pyproj via GeoPandas.
    """
    logger.info(f"Executing Open-Source Project (Reprojection) on: {in_dataset}")
    try:
        gdf = gpd.read_file(in_dataset)
        
        # Extract the EPSG string from the duck-typed SpatialReference object, 
        # or handle it if the user passed a raw string (e.g., "EPSG:4326")
        if hasattr(out_coor_system, 'factoryCode'):
            target_crs = f"EPSG:{out_coor_system.factoryCode}"
        elif isinstance(out_coor_system, str):
            target_crs = out_coor_system
        else:
            target_crs = str(out_coor_system)
            
        logger.info(f"Targeting CRS: {target_crs}")
        
        # The magic one-liner that replaces thousands of lines of C++
        projected_gdf = gdf.to_crs(target_crs)
        
        projected_gdf.to_file(out_dataset)
        logger.info(f"Reprojection complete. Saved to: {out_dataset}")
        
        return Result(out_dataset)
        
    except Exception as e:
        logger.error(f"Failed to project dataset: {e}")
        return Result(None, status=3)

def Merge(inputs, output, field_mappings=None, add_source="NO_SOURCE_INFO"):
    """
    MagPI Translation of arcpy.management.Merge.
    Concatenates multiple vector datasets into a single output using Pandas.
    """
    logger.info(f"Executing Open-Source Merge on: {inputs}")
    try:
        if isinstance(inputs, str):
            inputs = [f.strip() for f in inputs.split(';')]
        
        gdfs = []
        for f in inputs:
            if os.path.exists(f):
                gdfs.append(gpd.read_file(f))
            else:
                logger.warning(f"Merge input not found: {f}")
        
        if not gdfs:
            raise ValueError("No valid inputs found for Merge.")
            
        merged_gdf = pd.concat(gdfs, ignore_index=True)
        merged_gdf.to_file(output)
        
        logger.info(f"Merge complete. Saved to: {output}")
        return Result(output)
    except Exception as e:
        logger.error(f"Failed to merge datasets: {e}")
        return Result(None, status=3)

def JoinField(in_data, in_field, join_table, join_field, fields=None):
    """
    MagPI Translation of arcpy.management.JoinField.
    Permanently joins the contents of a CSV/Table to a Shapefile/GeoDataFrame.
    """
    logger.info(f"Executing Open-Source JoinField on {in_data} using {join_table}")
    try:
        # 1. Load the target spatial data
        gdf = gpd.read_file(in_data)
        
        # 2. Load the tabular join data
        if str(join_table).endswith('.csv'):
            df = pd.read_csv(join_table)
        else:
            df = gpd.read_file(join_table).drop(columns='geometry', errors='ignore')

        # Convert join fields to strings to ensure they match (e.g. FIPS codes/GEOIDs)
        gdf[in_field] = gdf[in_field].astype(str)
        df[join_field] = df[join_field].astype(str)

        # 3. Filter specific fields if requested
        if fields:
            if isinstance(fields, str):
                fields = [f.strip() for f in fields.split(';')]
            if join_field not in fields:
                fields.append(join_field)
            df = df[fields]

        # 4. Perform the Relational Merge (Left Join)
        logger.info(f"Merging tables on {in_field} == {join_field}...")
        merged_gdf = gdf.merge(df, how='left', left_on=in_field, right_on=join_field)

        if in_field != join_field and join_field in merged_gdf.columns:
            merged_gdf = merged_gdf.drop(columns=[join_field])

        # 5. Overwrite the original target file
        merged_gdf.to_file(in_data)
        
        logger.info(f"Join complete. Data saved back to: {in_data}")
        return Result(in_data)

    except Exception as e:
        logger.error(f"Failed to execute JoinField: {e}")
        return Result(None, status=3)

def AddField(in_table, field_name, field_type, field_precision=None, field_scale=None, field_length=None, field_alias=None, field_is_nullable="NULLABLE", field_is_required="NON_REQUIRED", field_domain=""):
    """
    MagPI Translation of arcpy.management.AddField.
    Adds an empty/null column to the GeoDataFrame based on requested ESRI type.
    """
    logger.info(f"Adding field '{field_name}' of type '{field_type}' to {in_table}")
    try:
        gdf = gpd.read_file(in_table)
        
        ftype_upper = field_type.upper()
        if ftype_upper in ["TEXT", "STRING"]:
            gdf[field_name] = ""
        elif ftype_upper in ["SHORT", "LONG", "INTEGER"]:
            gdf[field_name] = pd.Series(dtype='Int64')
        elif ftype_upper in ["FLOAT", "DOUBLE"]:
            gdf[field_name] = pd.Series(dtype='float64')
        elif ftype_upper == "DATE":
            gdf[field_name] = pd.to_datetime(pd.Series(dtype='object'))
        else:
            gdf[field_name] = None
            
        gdf.to_file(in_table)
        logger.info(f"Field '{field_name}' added successfully.")
        return Result(in_table)
    except Exception as e:
        logger.error(f"Failed to add field: {e}")
        return Result(None, status=3)

def CalculateField(in_table, field, expression, expression_type="PYTHON3", code_block="", field_type=""):
    """
    MagPI Translation of arcpy.management.CalculateField.
    Evaluates a basic Python expression on a GeoPandas DataFrame.
    """
    logger.info(f"Calculating field '{field}' on {in_table}")
    try:
        gdf = gpd.read_file(in_table)
        
        # Basic translation of ESRI's !Field_Name! syntax to Pandas gdf['Field_Name'] syntax
        pandas_expr = re.sub(r'!([^!]+)!', r"gdf['\1']", expression)
        
        # Execute the calculation vectorized over the entire column at once
        gdf[field] = eval(pandas_expr)
        
        gdf.to_file(in_table)
        logger.info(f"CalculateField complete. Internal expression used: {pandas_expr}")
        return Result(in_table)
    except Exception as e:
        logger.error(f"Failed to calculate field. Complex code blocks may require manual translation. Error: {e}")
        return Result(None, status=3)