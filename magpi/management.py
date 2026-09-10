# magpi/management.py
import geopandas as gpd
import pandas as pd
import os
import logging
import shutil
import re
from .objects import Result

logger = logging.getLogger("MagPI_Management")

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
        
    if isinstance(features, tuple) and len(features) == 2:
        file_path, layer_name = features
        logger.info(f"[_resolve_features] Calling gpd.read_file on {file_path} with layer={layer_name}")
        return gpd.read_file(file_path, layer=layer_name)
        
    logger.info("[_resolve_features] Calling gpd.read_file.")
    return gpd.read_file(features)

def GetCount(in_rows):
    logger.info(f"Executing GetCount on: {in_rows}")
    try:
        gdf = _resolve_features(in_rows)
        count = len(gdf)
        logger.info(f"Count result: {count}")
        return Result(count)
    except Exception as e:
        logger.error(f"Failed to get count: {e}")
        return Result(0, status=3)

def CopyFeatures(in_features, out_feature_class, config_keyword=None, spatial_grid_1=None, spatial_grid_2=None, spatial_grid_3=None):
    logger.info(f"Copying features from {in_features} to {out_feature_class}")
    try:
        gdf = _resolve_features(in_features)
        gdf.to_file(out_feature_class)
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to copy features: {e}")
        return Result(None, status=3)

def Delete(in_data, data_type=None):
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
    logger.info(f"Executing Open-Source Project (Reprojection) on: {in_dataset}")
    try:
        gdf = _resolve_features(in_dataset)
        
        if hasattr(out_coor_system, 'factoryCode'):
            target_crs = f"EPSG:{out_coor_system.factoryCode}"
        elif isinstance(out_coor_system, str):
            target_crs = out_coor_system
        else:
            target_crs = str(out_coor_system)
            
        logger.info(f"Targeting CRS: {target_crs}")
        
        projected_gdf = gdf.to_crs(target_crs)
        projected_gdf.to_file(out_dataset)
        logger.info(f"Reprojection complete. Saved to: {out_dataset}")
        
        return Result(out_dataset)
        
    except Exception as e:
        logger.error(f"Failed to project dataset: {e}")
        return Result(None, status=3)

def Merge(inputs, output, field_mappings=None, add_source="NO_SOURCE_INFO"):
    logger.info(f"Executing Open-Source Merge on: {inputs}")
    try:
        if isinstance(inputs, str):
            inputs = [f.strip() for f in inputs.split(';')]
        
        gdfs = []
        for f in inputs:
            if os.path.exists(f):
                gdfs.append(_resolve_features(f))
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
    logger.info(f"Executing Open-Source JoinField on {in_data} using {join_table}")
    try:
        gdf = _resolve_features(in_data)
        
        if str(join_table).endswith('.csv'):
            df = pd.read_csv(join_table)
        else:
            df = _resolve_features(join_table).drop(columns='geometry', errors='ignore')

        gdf[in_field] = gdf[in_field].astype(str)
        df[join_field] = df[join_field].astype(str)

        if fields:
            if isinstance(fields, str):
                fields = [f.strip() for f in fields.split(';')]
            if join_field not in fields:
                fields.append(join_field)
            df = df[fields]

        logger.info(f"Merging tables on {in_field} == {join_field}...")
        merged_gdf = gdf.merge(df, how='left', left_on=in_field, right_on=join_field)

        if in_field != join_field and join_field in merged_gdf.columns:
            merged_gdf = merged_gdf.drop(columns=[join_field])

        merged_gdf.to_file(in_data)
        logger.info(f"Join complete. Data saved back to: {in_data}")
        return Result(in_data)

    except Exception as e:
        logger.error(f"Failed to execute JoinField: {e}")
        return Result(None, status=3)

def AddField(in_table, field_name, field_type, field_precision=None, field_scale=None, field_length=None, field_alias=None, field_is_nullable="NULLABLE", field_is_required="NON_REQUIRED", field_domain=""):
    logger.info(f"Adding field '{field_name}' of type '{field_type}' to {in_table}")
    try:
        gdf = _resolve_features(in_table)
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
    logger.info(f"Calculating field '{field}' on {in_table}")
    try:
        gdf = _resolve_features(in_table)
        pandas_expr = re.sub(r'!([^!]+)!', r"gdf['\1']", expression)
        gdf[field] = eval(pandas_expr)
        gdf.to_file(in_table)
        logger.info(f"CalculateField complete. Internal expression used: {pandas_expr}")
        return Result(in_table)
    except Exception as e:
        logger.error(f"Failed to calculate field. Error: {e}")
        return Result(None, status=3)

def Clip(in_raster, rectangle, out_raster, in_template_dataset=None, nodata_value=None, clipping_geometry="NONE", maintain_clipping_extent="NO_MAINTAIN_EXTENT"):
    if hasattr(in_raster, 'name'):
        raster_path = in_raster.name
    elif hasattr(in_raster, 'output'):
        raster_path = in_raster.output
    else:
        raster_path = str(in_raster)

    logger.info(f"Executing Open-Source Raster Clip on: {raster_path}")
    try:
        import rasterio
        from rasterio.windows import from_bounds
        from rasterio.warp import transform_bounds
        from .objects import Result, Extent

        if hasattr(rectangle, 'XMin'):
            minx, miny, maxx, maxy = rectangle.XMin, rectangle.YMin, rectangle.XMax, rectangle.YMax
        elif isinstance(rectangle, str):
            parts = rectangle.split()
            minx, miny, maxx, maxy = map(float, parts)
        else:
            logger.error("Invalid rectangle provided to Clip.")
            return Result(None, status=3)

        with rasterio.open(raster_path) as src:
            if -180 <= minx <= 180 and -90 <= miny <= 90:
                minx, miny, maxx, maxy = transform_bounds('EPSG:4326', src.crs, minx, miny, maxx, maxy)

            window = from_bounds(minx, miny, maxx, maxy, src.transform)
            window = window.round_offsets().round_lengths()
            
            clipped_array = src.read(window=window)
            
            out_meta = src.meta.copy()
            out_meta.update({
                "driver": "GTiff",
                "height": window.height,
                "width": window.width,
                "transform": src.window_transform(window)
            })
            
            with rasterio.open(out_raster, "w", **out_meta) as dest:
                dest.write(clipped_array)
                
                # CRITICAL FIX: Preserve Color Interpretation (Stop Band 4 from becoming Alpha)
                try:
                    dest.colorinterp = src.colorinterp
                except Exception as e:
                    logger.debug(f"Could not copy colorinterp: {e}")
                
        logger.info(f"Raster Clip complete. Saved to: {out_raster}")
        return Result(out_raster)

    except ImportError as e:
        logger.error(f"Missing dependency (Make sure rasterio is installed): {e}")
        from .objects import Result
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to clip raster: {e}")
        from .objects import Result
        return Result(None, status=3)

def BuildPyramidsAndStats(in_raster, build_pyramids=True, calculate_stats=True):
    """
    MagPI Translation of arcpy.management.BuildPyramids / CalculateStatistics.
    Bakes multi-resolution overviews and statistical profiles directly into the GeoTIFF headers.
    """
    # Duck-type the input to get the file path string
    if hasattr(in_raster, 'name'):
        raster_path = in_raster.name
    elif hasattr(in_raster, 'output'):
        raster_path = in_raster.output
    else:
        raster_path = str(in_raster)

    logger.info(f"Executing Open-Source Build Pyramids/Stats on: {raster_path}")
    
    try:
        import rasterio
        from rasterio.enums import Resampling
        import numpy as np

        with rasterio.open(raster_path, 'r+') as src:
            if calculate_stats:
                logger.info(f"Calculating array statistics for {src.count} bands...")
                # Calculate stats for each band and bake them into the TIFF tags
                for i in range(1, src.count + 1):
                    band = src.read(i)
                    valid_data = band[band != src.nodata] if src.nodata is not None else band
                    
                    if valid_data.size > 0:
                        stats = {
                            'STATISTICS_MINIMUM': float(np.min(valid_data)),
                            'STATISTICS_MAXIMUM': float(np.max(valid_data)),
                            'STATISTICS_MEAN': float(np.mean(valid_data)),
                            'STATISTICS_STDDEV': float(np.std(valid_data))
                        }
                        src.update_tags(i, **stats)
                logger.info("Statistics baked successfully.")

            if build_pyramids:
                logger.info("Building multi-resolution internal overviews (Pyramids)...")
                # Build overviews at 1/2, 1/4, 1/8, and 1/16 resolution
                factors = [2, 4, 8, 16]
                src.build_overviews(factors, Resampling.nearest)
                src.update_tags(ns='rio_overview', resampling='nearest')
                logger.info("Pyramids generated successfully.")

        from .objects import Result
        return Result(raster_path)

    except ImportError:
        logger.error("Missing dependency: numpy or rasterio.")
        from .objects import Result
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to build pyramids/stats: {e}")
        from .objects import Result
        return Result(None, status=3)
def Dissolve(in_features, out_feature_class, dissolve_field=None):
    logger.info(f"Executing Open-Source Dissolve on: {in_features}")
    try:
        import geopandas as gpd
        gdf = _resolve_features(in_features)
        
        if dissolve_field:
            logger.info(f"Dissolving by field: {dissolve_field}")
            dissolved_gdf = gdf.dissolve(by=dissolve_field)
        else:
            logger.info("Dissolving all features into a single geometry...")
            # create a dummy column to dissolve on
            gdf['_dissolve_dummy'] = 1
            dissolved_gdf = gdf.dissolve(by='_dissolve_dummy')
            dissolved_gdf = dissolved_gdf.drop(columns=['_dissolve_dummy'])
            
        dissolved_gdf.to_file(out_feature_class)
        logger.info(f"Dissolve complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Failed to dissolve features: {e}")
        return Result(None, status=3)

def CreateFishnet(out_feature_class, extent, cell_width=2560, cell_height=2560):
    logger.info(f"Forging Spatial Fishnet Grid ({cell_width}m x {cell_height}m cells)...")
    try:
        import geopandas as gpd
        from shapely.geometry import box
        import numpy as np
        
        if hasattr(extent, 'XMin'): min_lon, min_lat, max_lon, max_lat = extent.XMin, extent.YMin, extent.XMax, extent.YMax
        else: min_lon, min_lat, max_lon, max_lat = map(float, str(extent).split())
        
        from .env import env
        crs = f"EPSG:{env.outputCoordinateSystem}" if env.outputCoordinateSystem else "EPSG:3857"
        
        bounds_gdf = gpd.GeoDataFrame({'geometry': [box(min_lon, min_lat, max_lon, max_lat)]}, crs="EPSG:4326")
        metric_bounds = bounds_gdf.to_crs(crs).total_bounds
        m_xmin, m_ymin, m_xmax, m_ymax = metric_bounds
        
        x_coords = np.arange(m_xmin, m_xmax, cell_width)
        y_coords = np.arange(m_ymin, m_ymax, cell_height)
        
        polygons = []
        for x in x_coords:
            for y in y_coords:
                polygons.append(box(x, y, x + cell_width, y + cell_height))
                
        grid = gpd.GeoDataFrame({'geometry': polygons, 'Grid_ID': range(1, len(polygons)+1)}, crs=crs)
        grid.to_file(out_feature_class)
        
        logger.info(f"SUCCESS: Fishnet of {len(polygons)} tiles saved to: {out_feature_class}")
        return Result(out_feature_class)
    except Exception as e:
        logger.error(f"Fishnet generation failed: {e}")
        return Result(None, status=3)

def ProjectRaster(in_raster, out_raster, out_crs, resampling_type="NEAREST"):
    if hasattr(in_raster, 'name'): raster_path = in_raster.name
    else: raster_path = str(in_raster)

    logger.info(f"Initiating Geospatial Projection: {os.path.basename(raster_path)} -> {out_crs}")
    try:
        import rasterio
        from rasterio.warp import calculate_default_transform, reproject, Resampling
        
        from rasterio.crs import CRS
        resampling_enum = getattr(Resampling, resampling_type.lower(), Resampling.nearest)
        dst_crs_str = out_crs if ':' in out_crs else f"EPSG:{out_crs}"
        dst_crs = CRS.from_user_input(dst_crs_str)
        
        with rasterio.open(raster_path) as src:
            transform, width, height = calculate_default_transform(src.crs, dst_crs, src.width, src.height, *src.bounds)
            kwargs = src.meta.copy()
            kwargs.update({'crs': dst_crs, 'transform': transform, 'width': width, 'height': height})
            
            with rasterio.open(out_raster, 'w', **kwargs) as dst:
                for i in range(1, src.count + 1):
                    reproject(
                        source=rasterio.band(src, i),
                        destination=rasterio.band(dst, i),
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=dst_crs,
                        resampling=resampling_enum
                    )
                try:
                    dst.colorinterp = src.colorinterp
                except:
                    pass
                dst.update_tags(COPYRIGHT="Generated by MagPI - NexaVision.tech")
                
        logger.info(f"SUCCESS: Projected raster saved to: {out_raster}")
        return Result(out_raster)
    except Exception as e:
        logger.error(f"Projection failed: {e}")
        return Result(None, status=3)

def Append(inputs, target, schema_type="TEST", field_mapping=None, subtype=None):
    """
    MagPI Translation of arcpy.management.Append.
    Appends multiple feature classes or tables into an existing target dataset.
    """
    logger.info(f"Executing Open-Source Append into: {target}")
    try:
        target_gdf = _resolve_features(target)

        if isinstance(inputs, str):
            input_list = [f.strip() for f in inputs.split(';')]
        else:
            input_list = list(inputs)

        gdfs = [target_gdf]
        for inp in input_list:
            try:
                gdf = _resolve_features(inp)
                if gdf.crs != target_gdf.crs:
                    gdf = gdf.to_crs(target_gdf.crs)
                gdfs.append(gdf)
            except Exception as read_err:
                logger.warning(f"Skipping unreadable input '{inp}': {read_err}")

        appended = pd.concat(gdfs, ignore_index=True)
        appended.to_file(target)
        logger.info(f"Append complete. {len(appended)} total features in {target}")
        return Result(target)

    except Exception as e:
        logger.error(f"Failed to append: {e}")
        return Result(None, status=3)

def SummaryStatistics(in_table, out_table, statistics_fields, case_field=None):
    """
    MagPI Translation of arcpy.analysis.Statistics (Summary Statistics).
    Calculates aggregate statistics (SUM, MEAN, MIN, MAX, COUNT, STD, etc.)
    on fields, optionally grouped by a case field.
    """
    logger.info(f"Executing Open-Source SummaryStatistics on: {in_table}")
    try:
        gdf = _resolve_features(in_table)

        # Parse statistics_fields: expects list of [field, stat_type] pairs
        # or semicolon-separated "field STAT;field2 STAT2" string
        agg_dict = {}
        if isinstance(statistics_fields, str):
            pairs = statistics_fields.split(';')
            for pair in pairs:
                parts = pair.strip().split()
                if len(parts) >= 2:
                    field_name, stat_type = parts[0], parts[1].lower()
                    stat_map = {'sum': 'sum', 'mean': 'mean', 'min': 'min',
                                'max': 'max', 'count': 'count', 'std': 'std',
                                'range': lambda x: x.max() - x.min(),
                                'first': 'first', 'last': 'last'}
                    agg_dict[field_name] = stat_map.get(stat_type, stat_type)
        elif isinstance(statistics_fields, (list, tuple)):
            for item in statistics_fields:
                if isinstance(item, (list, tuple)) and len(item) >= 2:
                    field_name, stat_type = item[0], item[1].lower()
                    stat_map = {'sum': 'sum', 'mean': 'mean', 'min': 'min',
                                'max': 'max', 'count': 'count', 'std': 'std',
                                'range': lambda x: x.max() - x.min(),
                                'first': 'first', 'last': 'last'}
                    agg_dict[field_name] = stat_map.get(stat_type, stat_type)

        if case_field:
            if isinstance(case_field, str):
                case_field = [f.strip() for f in case_field.split(';')]
            result_df = gdf.groupby(case_field).agg(agg_dict).reset_index()
        else:
            result_df = pd.DataFrame(gdf.agg(agg_dict)).T

        # Flatten column names
        if hasattr(result_df.columns, 'levels'):
            result_df.columns = ['_'.join(col).strip('_') for col in result_df.columns]

        if str(out_table).endswith('.csv'):
            result_df.to_csv(out_table, index=False)
        else:
            result_df.to_csv(out_table + '.csv', index=False)

        logger.info(f"SummaryStatistics complete. Saved to: {out_table}")
        return Result(out_table)

    except Exception as e:
        logger.error(f"Failed to execute SummaryStatistics: {e}")
        return Result(None, status=3)

# Alias for ESRI's alternative name
Statistics = SummaryStatistics

def CreateFeatureclass(out_path, out_name, geometry_type="POLYGON", template=None, has_m="DISABLED", has_z="DISABLED", spatial_reference=None):
    """
    MagPI Translation of arcpy.management.CreateFeatureclass.
    Creates an empty feature class with the specified geometry type.
    """
    import shapely
    full_path = os.path.join(out_path, out_name) if out_path else out_name
    logger.info(f"Creating empty feature class: {full_path} ({geometry_type})")
    try:
        crs = "EPSG:4326"
        if spatial_reference:
            if hasattr(spatial_reference, 'factoryCode'):
                crs = f"EPSG:{spatial_reference.factoryCode}"
            else:
                crs = str(spatial_reference)

        gdf = gpd.GeoDataFrame(columns=['geometry'], geometry='geometry', crs=crs)

        # If template provided, copy schema
        if template and os.path.exists(str(template)):
            template_gdf = _resolve_features(template)
            for col in template_gdf.columns:
                if col != 'geometry':
                    gdf[col] = pd.Series(dtype=template_gdf[col].dtype)

        gdf.to_file(full_path)
        logger.info(f"Empty feature class created: {full_path}")
        return Result(full_path)

    except Exception as e:
        logger.error(f"Failed to create feature class: {e}")
        return Result(None, status=3)

def DeleteField(in_table, drop_field):
    """
    MagPI Translation of arcpy.management.DeleteField.
    Removes one or more fields from a feature class or table.
    """
    logger.info(f"Deleting field(s) '{drop_field}' from {in_table}")
    try:
        gdf = _resolve_features(in_table)

        if isinstance(drop_field, str):
            fields_to_drop = [f.strip() for f in drop_field.split(';')]
        else:
            fields_to_drop = list(drop_field)

        # Never drop the geometry column
        fields_to_drop = [f for f in fields_to_drop if f != 'geometry' and f in gdf.columns]

        gdf = gdf.drop(columns=fields_to_drop)
        gdf.to_file(in_table)
        logger.info(f"DeleteField complete. Removed: {fields_to_drop}")
        return Result(in_table)

    except Exception as e:
        logger.error(f"Failed to delete field: {e}")
        return Result(None, status=3)

def AlterField(in_table, field, new_field_name=None, new_field_alias=None, field_type=None, field_length=None, field_is_nullable=None, clear_field_alias="FALSE"):
    """
    MagPI Translation of arcpy.management.AlterField.
    Renames or modifies properties of a field.
    """
    logger.info(f"Altering field '{field}' in {in_table}")
    try:
        gdf = _resolve_features(in_table)

        if field not in gdf.columns:
            logger.error(f"Field '{field}' not found in {in_table}")
            return Result(None, status=3)

        if new_field_name and new_field_name != field:
            gdf = gdf.rename(columns={field: new_field_name})
            logger.info(f"Renamed '{field}' -> '{new_field_name}'")

        if field_type:
            target_col = new_field_name if new_field_name else field
            type_map = {'TEXT': 'str', 'SHORT': 'int32', 'LONG': 'int64',
                        'FLOAT': 'float32', 'DOUBLE': 'float64'}
            pd_type = type_map.get(field_type.upper(), field_type)
            try:
                gdf[target_col] = gdf[target_col].astype(pd_type)
            except (ValueError, TypeError):
                logger.warning(f"Could not cast '{target_col}' to {pd_type}")

        gdf.to_file(in_table)
        logger.info(f"AlterField complete on {in_table}")
        return Result(in_table)

    except Exception as e:
        logger.error(f"Failed to alter field: {e}")
        return Result(None, status=3)

def SelectLayerByAttribute(in_layer_or_view, selection_type="NEW_SELECTION", where_clause="", invert_where_clause=None):
    """
    MagPI Translation of arcpy.management.SelectLayerByAttribute.
    Since MagPI operates on files (not in-memory layers), this returns a
    filtered GeoDataFrame that can be passed to subsequent tools.
    """
    logger.info(f"Executing Open-Source SelectLayerByAttribute on: {in_layer_or_view}")
    try:
        gdf = _resolve_features(in_layer_or_view)

        if where_clause:
            pandas_query = where_clause.replace(" = ", " == ")
            try:
                selected = gdf.query(pandas_query)
            except Exception:
                # Fallback: try eval
                mask = gdf.eval(pandas_query)
                selected = gdf[mask]

            if invert_where_clause:
                selected = gdf.drop(selected.index)

            logger.info(f"Selected {len(selected)} of {len(gdf)} features")
            return Result(selected)
        else:
            return Result(gdf)

    except Exception as e:
        logger.error(f"Failed to select by attribute: {e}")
        return Result(None, status=3)
