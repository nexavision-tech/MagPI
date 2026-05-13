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

def Dissolve(in_features, out_feature_class, dissolve_field=None, statistics_fields=None, multi_part="MULTI_PART", unsplit_lines="DISSOLVE_LINES"):
    """
    MagPI Translation of arcpy.management.Dissolve.
    Melts polygons/lines together based on a shared attribute using GeoPandas.
    """
    logger.info(f"Executing Open-Source Dissolve on: {in_features}")
    try:
        gdf = gpd.read_file(in_features)
        
        # If no field is provided, dissolve everything into one massive polygon
        if not dissolve_field:
            logger.info("No dissolve field provided. Dissolving all features into a single geometry...")
            # Unary union melts everything, then we wrap it back into a GeoDataFrame
            dissolved_geom = gdf.geometry.unary_union
            dissolved_gdf = gpd.GeoDataFrame(geometry=[dissolved_geom], crs=gdf.crs)
        else:
            logger.info(f"Dissolving based on field: {dissolve_field}...")
            # Handle multiple dissolve fields if passed as a semi-colon string
            if isinstance(dissolve_field, str):
                dissolve_fields = [f.strip() for f in dissolve_field.split(';')]
            else:
                dissolve_fields = dissolve_field
                
            # GeoPandas dissolve handles the heavy lifting instantly
            dissolved_gdf = gdf.dissolve(by=dissolve_fields, as_index=False)
            
            # TODO: Implement statistics_fields (sum, mean, max) mapping during dissolve
            if statistics_fields:
                logger.warning("statistics_fields logic is currently in Skeleton Phase. Fields dropped during dissolve.")

        # Handle the MultiPart flag
        if multi_part.upper() == "SINGLE_PART":
            logger.info("Exploding MultiPolygons to SingleParts...")
            dissolved_gdf = dissolved_gdf.explode(index_parts=False).reset_index(drop=True)

        dissolved_gdf.to_file(out_feature_class)
        logger.info(f"Dissolve complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to dissolve features: {e}")
        return Result(None, status=3)

def MultipartToSinglepart(in_features, out_feature_class):
    """
    MagPI Translation of arcpy.management.MultipartToSinglepart.
    Explodes MultiPolygons and MultiLineStrings into individual geometric features.
    """
    logger.info(f"Executing Open-Source MultipartToSinglepart on: {in_features}")
    try:
        gdf = gpd.read_file(in_features)
        
        # The GeoPandas .explode() method is an instant C-backed vector operation
        logger.info("Exploding complex geometries...")
        exploded_gdf = gdf.explode(index_parts=False).reset_index(drop=True)
        
        exploded_gdf.to_file(out_feature_class)
        logger.info(f"Multipart to Singlepart complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to explode multipart features: {e}")
        return Result(None, status=3)
    
def CalculateGeometryAttributes(in_features, geometry_property, length_unit="", area_unit="", coordinate_system=""):
    """
    MagPI Translation of arcpy.management.CalculateGeometryAttributes.
    geometry_property expects a list of lists: [["Field_Name", "PROPERTY_TYPE"], ...]
    Valid Properties: AREA, LENGTH, CENTROID_X, CENTROID_Y
    """
    logger.info(f"Executing Open-Source CalculateGeometryAttributes on: {in_features}")
    try:
        gdf = gpd.read_file(in_features)
        
        # Check if CRS is Geographic (Lat/Lon). Area/Length math requires Projected CRS (feet/meters)
        if gdf.crs and gdf.crs.is_geographic:
            logger.warning("Dataset is in Geographic CRS (Lat/Lon). Area/Length calculations will be in decimal degrees, which may be inaccurate. Consider projecting first.")

        # Handle the ESRI parameter structure: e.g., [["SQ_FEET", "AREA"], ["X_COORD", "CENTROID_X"]]
        if isinstance(geometry_property, str):
            logger.error("geometry_property must be a list of lists. E.g., [['MyAreaField', 'AREA']]")
            return Result(None, status=3)

        for prop in geometry_property:
            field_name = prop[0]
            calc_type = prop[1].upper()
            
            logger.info(f"Calculating {calc_type} into field '{field_name}'...")
            
            if calc_type == "AREA":
                gdf[field_name] = gdf.geometry.area
                # Basic unit conversion could be added here based on area_unit parameter
            elif calc_type == "LENGTH" or calc_type == "PERIMETER":
                gdf[field_name] = gdf.geometry.length
            elif calc_type == "CENTROID_X":
                gdf[field_name] = gdf.geometry.centroid.x
            elif calc_type == "CENTROID_Y":
                gdf[field_name] = gdf.geometry.centroid.y
            else:
                logger.warning(f"Geometry property '{calc_type}' is not yet supported in MagPI.")

        gdf.to_file(in_features)
        logger.info(f"Geometry attributes calculated and saved back to: {in_features}")
        return Result(in_features)
        
    except Exception as e:
        logger.error(f"Failed to calculate geometry attributes: {e}")
        return Result(None, status=3)

def FeatureToPoint(in_features, out_feature_class, point_location="CENTROID"):
    """
    MagPI Translation of arcpy.management.FeatureToPoint.
    Converts polygons or lines into points (Address points, centroids, etc.)
    """
    logger.info(f"Executing Open-Source FeatureToPoint on: {in_features}")
    try:
        gdf = gpd.read_file(in_features)
        
        if point_location.upper() == "INSIDE":
            # representative_point() guarantees the point falls INSIDE the polygon 
            # (unlike a centroid, which can fall outside a horseshoe-shaped building)
            logger.info("Generating internal representative points...")
            gdf.geometry = gdf.geometry.representative_point()
        else:
            # Default to mathematical center of gravity
            logger.info("Generating mathematical centroids...")
            gdf.geometry = gdf.geometry.centroid
            
        gdf.to_file(out_feature_class)
        logger.info(f"FeatureToPoint complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
        
    except Exception as e:
        logger.error(f"Failed to convert features to points: {e}")
        return Result(None, status=3)
    
def RepairGeometry(in_features, delete_null="DELETE_NULL", validation_method="ESRI"):
    """
    MagPI Translation of arcpy.management.RepairGeometry.
    Fixes self-intersecting polygons, null geometries, and unclosed rings.
    """
    logger.info(f"Executing Open-Source RepairGeometry on: {in_features}")
    try:
        from shapely.validation import make_valid
        
        gdf = gpd.read_file(in_features)
        original_count = len(gdf)

        # 1. Handle Null/Empty Geometries
        if delete_null.upper() == "DELETE_NULL":
            logger.info("Dropping null/empty geometries...")
            gdf = gdf.dropna(subset=['geometry'])
            gdf = gdf[~gdf.is_empty]
            
        # 2. Repair Broken Topologies (The Shapely make_valid engine)
        logger.info("Applying C-backed topology repair algorithms (make_valid)...")
        # Apply the fix only to geometries that are actually invalid to save time
        invalid_mask = ~gdf.is_valid
        
        if invalid_mask.any():
            logger.info(f"Found {invalid_mask.sum()} invalid geometries. Repairing...")
            gdf.loc[invalid_mask, 'geometry'] = gdf.loc[invalid_mask, 'geometry'].apply(
                lambda geom: make_valid(geom) if geom is not None else None
            )
        else:
            logger.info("All geometries are already valid. No repair needed.")

        # 3. Save the repaired data back to disk
        gdf.to_file(in_features)
        
        final_count = len(gdf)
        if final_count < original_count:
            logger.warning(f"RepairGeometry dropped {original_count - final_count} unrecoverable features.")
            
        logger.info(f"Geometry repair complete. Data saved back to: {in_features}")
        return Result(in_features)

    except Exception as e:
        logger.error(f"Failed to repair geometry: {e}")
        return Result(None, status=3)

def Eliminate(in_features, out_feature_class, selection, ex_where_clause=""):
    """
    MagPI Translation of arcpy.management.Eliminate.
    Merges selected "sliver" polygons into adjacent polygons that share the longest border.
    (Skeleton Phase - Implements basic Area-based dissolution)
    """
    logger.info(f"Executing Open-Source Eliminate on: {in_features}")
    logger.warning("Eliminate is in Skeleton Phase. Converting slivers based on selection criteria.")
    try:
        gdf = gpd.read_file(in_features)
        
        # If selection is passed as a layer file with an active selection, 
        # or if we are approximating the "selection" via a SQL clause
        if ex_where_clause:
            logger.info(f"Applying filter: {ex_where_clause}")
            pandas_query = ex_where_clause.replace(" = ", " == ")
            try:
                sliver_mask = gdf.eval(pandas_query)
            except Exception as q_err:
                logger.error(f"Failed to evaluate selection clause: {q_err}")
                return Result(None, status=3)
        else:
            # Fallback: Assume the input IS the selection (e.g., area < 10 sq meters)
            logger.info("No selection clause provided. Executing bypass.")
            gdf.to_file(out_feature_class)
            return Result(out_feature_class)

        # Separate the good polygons from the bad slivers
        slivers = gdf[sliver_mask]
        good_polys = gdf[~sliver_mask]
        
        logger.info(f"Found {len(slivers)} slivers to eliminate. Merging into largest neighbors...")
        
        # NOTE: A true topological "shared longest boundary" merge requires 
        # complex spatial indexing and shared-edge length calculations. 
        # For the skeleton, we spatial join the slivers to the good polygons
        # and dissolve them.
        
        if not slivers.empty and not good_polys.empty:
            # Drop slivers, we will rebuild this mathematically later. 
            # For now, we return the cleaned dataset.
            good_polys.to_file(out_feature_class)
            logger.info(f"Slivers dropped. Clean features saved to: {out_feature_class}")
        else:
            gdf.to_file(out_feature_class)
            
        return Result(out_feature_class)

    except Exception as e:
        logger.error(f"Failed to eliminate slivers: {e}")
        return Result(None, status=3)

def ProjectRaster(in_raster, out_raster, out_coor_system, resampling_type="NEAREST", cell_size=None, geographic_transform=None, Registration_Point=None, in_coor_system=None):
    """
    MagPI Translation of arcpy.management.ProjectRaster.
    Warps a raster image from one coordinate system to another.
    """
    logger.info(f"Executing Open-Source ProjectRaster on: {in_raster}")
    try:
        import rasterio
        from rasterio.warp import calculate_default_transform, reproject, Resampling
        from rasterio.crs import CRS

        # Map ESRI resampling keywords to Rasterio Enums
        resampling_map = {
            "NEAREST": Resampling.nearest,
            "BILINEAR": Resampling.bilinear,
            "CUBIC": Resampling.cubic,
            "MAJORITY": Resampling.mode
        }
        resamp_method = resampling_map.get(resampling_type.upper(), Resampling.nearest)

        # Parse target CRS
        if hasattr(out_coor_system, 'factoryCode'):
            dst_crs = CRS.from_epsg(out_coor_system.factoryCode)
        else:
            dst_crs = CRS.from_string(str(out_coor_system))

        with rasterio.open(in_raster) as src:
            logger.info(f"Projecting from {src.crs} to {dst_crs}...")
            
            # Calculate the mathematical transformation matrix
            transform, width, height = calculate_default_transform(
                src.crs, dst_crs, src.width, src.height, *src.bounds, resolution=cell_size
            )
            
            kwargs = src.meta.copy()
            kwargs.update({
                'crs': dst_crs,
                'transform': transform,
                'width': width,
                'height': height
            })

            with rasterio.open(out_raster, 'w', **kwargs) as dst:
                for i in range(1, src.count + 1):
                    reproject(
                        source=rasterio.band(src, i),
                        destination=rasterio.band(dst, i),
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=dst_crs,
                        resampling=resamp_method
                    )
                    
            logger.info(f"Raster projection complete. Saved to: {out_raster}")
            return Result(out_raster)
            
    except ImportError:
        logger.error("Missing dependency: 'rasterio'. Run: conda install -c conda-forge rasterio -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to project raster: {e}")
        return Result(None, status=3)

def Resample(in_raster, out_raster, cell_size, resampling_type="NEAREST"):
    """
    MagPI Translation of arcpy.management.Resample.
    Changes the spatial resolution (pixel size) of a raster.
    """
    logger.info(f"Executing Open-Source Resample on: {in_raster} to cell size {cell_size}")
    try:
        import rasterio
        from rasterio.enums import Resampling

        resampling_map = {
            "NEAREST": Resampling.nearest,
            "BILINEAR": Resampling.bilinear,
            "CUBIC": Resampling.cubic,
            "MAJORITY": Resampling.mode
        }
        resamp_method = resampling_map.get(resampling_type.upper(), Resampling.nearest)

        # Parse cell size (ESRI sometimes passes "X Y")
        if isinstance(cell_size, str) and " " in cell_size:
            cell_x = float(cell_size.split(" ")[0])
            cell_y = float(cell_size.split(" ")[1])
        else:
            cell_x = cell_y = float(cell_size)

        with rasterio.open(in_raster) as src:
            # Calculate new dimensions based on the new cell size
            scale_factor_x = src.res[0] / cell_x
            scale_factor_y = src.res[1] / cell_y
            
            new_width = int(src.width * scale_factor_x)
            new_height = int(src.height * scale_factor_y)
            
            # Adjust the transform matrix to the new dimensions
            new_transform = src.transform * src.transform.scale(
                (src.width / new_width),
                (src.height / new_height)
            )
            
            logger.info(f"Resampling raster from {src.width}x{src.height} to {new_width}x{new_height}...")
            
            # Read the data using the resampling algorithm (happens entirely in C)
            data = src.read(
                out_shape=(src.count, new_height, new_width),
                resampling=resamp_method
            )
            
            out_meta = src.meta.copy()
            out_meta.update({
                "transform": new_transform,
                "width": new_width,
                "height": new_height
            })
            
            with rasterio.open(out_raster, "w", **out_meta) as dst:
                dst.write(data)
                
            logger.info(f"Resampling complete. Saved to: {out_raster}")
            return Result(out_raster)
            
    except Exception as e:
        logger.error(f"Failed to resample raster: {e}")
        return Result(None, status=3)

def MosaicToNewRaster(input_rasters, output_location, raster_dataset_name_with_extension, coordinate_system_for_the_raster=None, pixel_type="8_BIT_UNSIGNED", cellsize=None, number_of_bands=1, mosaic_method="LAST", mosaic_colormap_mode="FIRST"):
    """
    MagPI Translation of arcpy.management.MosaicToNewRaster.
    Stitches multiple rasters together into a single, massive GeoTIFF.
    """
    logger.info("Executing Open-Source MosaicToNewRaster")
    try:
        import rasterio
        from rasterio.merge import merge
        import os
        
        # Handle ESRI semi-colon delimited strings
        if isinstance(input_rasters, str):
            input_rasters = [f.strip() for f in input_rasters.split(';')]
            
        logger.info(f"Mosaicking {len(input_rasters)} rasters...")
        
        # Open all rasters simultaneously using a context manager list
        src_files_to_mosaic = []
        for fp in input_rasters:
            if os.path.exists(fp):
                src = rasterio.open(fp)
                src_files_to_mosaic.append(src)
            else:
                logger.warning(f"Mosaic input not found: {fp}")

        if not src_files_to_mosaic:
            logger.error("No valid input rasters found to mosaic.")
            return Result(None, status=3)

        # The pure C-backend merge algorithm
        mosaic, out_trans = merge(src_files_to_mosaic)

        # Get metadata from the first file to act as the template
        out_meta = src_files_to_mosaic[0].meta.copy()
        
        out_meta.update({
            "driver": "GTiff",
            "height": mosaic.shape[1],
            "width": mosaic.shape[2],
            "transform": out_trans,
            "count": mosaic.shape[0]  # Update band count
        })
        
        # Apply target CRS if requested
        if coordinate_system_for_the_raster:
            if hasattr(coordinate_system_for_the_raster, 'factoryCode'):
                out_meta.update({"crs": f"EPSG:{coordinate_system_for_the_raster.factoryCode}"})
            else:
                out_meta.update({"crs": str(coordinate_system_for_the_raster)})

        out_path = os.path.join(output_location, raster_dataset_name_with_extension)
        
        with rasterio.open(out_path, "w", **out_meta) as dst:
            dst.write(mosaic)
            
        # Clean up memory
        for src in src_files_to_mosaic:
            src.close()
            
        logger.info(f"Mosaic complete. Saved to: {out_path}")
        return Result(out_path)
        
    except Exception as e:
        logger.error(f"Failed to mosaic rasters: {e}")
        return Result(None, status=3)