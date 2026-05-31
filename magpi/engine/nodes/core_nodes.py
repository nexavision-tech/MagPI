# magpi/engine/nodes/core_nodes.py
from ..node import Node
from .registry import register_node
from ..types import MagPI_AOI
import logging

logger = logging.getLogger("MagPI_CoreNodes")

@register_node('core_extent')
class SpatialExtentNode(Node):
    def execute(self):
        p = self.params
        logger.info(f"Creating Spatial Extent: {p.get('xmin')}, {p.get('ymin')} to {p.get('xmax')}, {p.get('ymax')}")
        # In a real arcpy environment this would be an arcpy.Extent object.
        # Here we mock it by returning a dictionary representing the bounds.
        self.output = MagPI_AOI(p.get("xmin"), p.get("ymin"), p.get("xmax"), p.get("ymax"))

@register_node('core_create_vector')
class CreateVectorNode(Node):
    def execute(self):
        in_extent = self.inputs.get("extent")
        p = self.params
        out_filename = p.get('out_feature_class', f"new_vector_{self.id[-4:]}.shp")
        out_path = __import__('os').path.join(__import__('os').environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Creating empty vector layer: {out_path}")
        import geopandas as gpd
        
        if in_extent and hasattr(in_extent, 'xmin'):
            import shapely.geometry
            polygon = shapely.geometry.box(in_extent.xmin, in_extent.ymin, in_extent.xmax, in_extent.ymax)
            gdf = gpd.GeoDataFrame(geometry=[polygon], crs=p.get('crs', 'EPSG:4326'))
        else:
            # Empty
            gdf = gpd.GeoDataFrame(geometry=[], crs=p.get('crs', 'EPSG:4326'))
            
        gdf.to_file(out_path)
        self.output = out_path

@register_node('core_create_raster')
class CreateRasterNode(Node):
    def execute(self):
        in_extent = self.inputs.get("extent")
        p = self.params
        out_filename = p.get('out_raster', f"new_raster_{self.id[-4:]}.tif")
        out_path = __import__('os').path.join(__import__('os').environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Creating empty raster layer: {out_path}")
        import rasterio
        from rasterio.transform import from_bounds
        import numpy as np
        
        cell_size = p.get('cell_size', 30)
        fill_value = p.get('fill_value', 0)
        
        if in_extent and hasattr(in_extent, 'xmin'):
            width = int((in_extent.xmax - in_extent.xmin) / cell_size)
            height = int((in_extent.ymax - in_extent.ymin) / cell_size)
            transform = from_bounds(in_extent.xmin, in_extent.ymin, in_extent.xmax, in_extent.ymax, width, height)
            
            data = np.full((1, height, width), fill_value, dtype=np.float32)
            
            with rasterio.open(
                out_path, 'w', driver='GTiff',
                height=height, width=width,
                count=1, dtype=data.dtype,
                crs=p.get('crs', 'EPSG:4326'),
                transform=transform
            ) as dst:
                dst.write(data)
                
            self.output = out_path
        else:
            raise ValueError("CreateRaster requires an input Spatial Extent (AOI) to define bounds.")

@register_node('load_raster')
class LoadRasterNode(Node):
    def execute(self):
        p = self.params
        
        # Determine file_path: favor dynamic input 'path_in' over static param 'file_path'
        file_path = self.inputs.get('path_in', [p.get('file_path')])[0]
        
        if not file_path:
            raise ValueError("LoadRaster requires a 'file_path' parameter or 'path_in' connection.")
        logger.info(f"Loading Raster: {file_path}")
        
        from magpi.env import env
        import os
        resolved_path = env.resolve_path(file_path, intent="input")
        if not os.path.exists(resolved_path):
            raise FileNotFoundError(f"Input Raster not found: {resolved_path}")
            
        # Check for dynamic override of CRS
        override_crs = self.inputs.get('set_crs')
        if isinstance(override_crs, list) and override_crs: override_crs = override_crs[0]
        if override_crs:
            logger.info(f"Input Raster: Dynamic CRS override triggered -> {override_crs}")
            import rasterio
            from rasterio.warp import calculate_default_transform, reproject, Resampling
            import tempfile
            
            with rasterio.open(resolved_path) as src:
                if str(src.crs) != str(override_crs):
                    logger.info(f"Input Raster: Warping raster from {src.crs} to {override_crs} in scratch space.")
                    transform, width, height = calculate_default_transform(
                        src.crs, override_crs, src.width, src.height, *src.bounds)
                    kwargs = src.meta.copy()
                    kwargs.update({
                        'crs': override_crs,
                        'transform': transform,
                        'width': width,
                        'height': height
                    })
                    
                    warped_path = os.path.join(env.scratchWorkspace, f"warped_{os.path.basename(resolved_path)}")
                    
                    with rasterio.open(warped_path, 'w', **kwargs) as dst:
                        for i in range(1, src.count + 1):
                            reproject(
                                source=rasterio.band(src, i),
                                destination=rasterio.band(dst, i),
                                src_transform=src.transform,
                                src_crs=src.crs,
                                dst_transform=transform,
                                dst_crs=override_crs,
                                resampling=Resampling.nearest)
                    resolved_path = warped_path
            
        import rasterio
        try:
            with rasterio.open(resolved_path) as src:
                crs_str = str(src.crs)
                bounds = list(src.bounds)
        except:
            crs_str = None
            bounds = None
            
        self.output = {
            'raster': resolved_path,
            'path_out': resolved_path,
            'crs': crs_str,
            'extent': bounds
        }

@register_node('load_vector')
class LoadVectorNode(Node):
    def execute(self):
        p = self.params
        
        # Determine file_path: favor dynamic input 'path_in' over static param 'file_path'
        file_path = self.inputs.get('path_in', [p.get('file_path')])[0]
        
        if not file_path:
            raise ValueError("LoadVector requires a 'file_path' parameter or 'path_in' connection.")
        logger.info(f"Loading Vector: {file_path}")
        
        from magpi.env import env
        import os
        resolved_path = env.resolve_path(file_path, intent="input")
        if not os.path.exists(resolved_path):
            raise FileNotFoundError(f"Input Vector not found: {resolved_path}")
            
        # Check for dynamic override of CRS
        override_crs = self.inputs.get('set_crs')
        if isinstance(override_crs, list) and override_crs: override_crs = override_crs[0]
        if override_crs:
            logger.info(f"Input Vector: Dynamic CRS override triggered -> {override_crs}")
            import geopandas as gpd
            gdf = gpd.read_file(resolved_path)
            
            # Simple string check for CRS equality
            current_crs_str = str(gdf.crs) if gdf.crs else ""
            if current_crs_str != str(override_crs):
                logger.info(f"Input Vector: Reprojecting from {current_crs_str} to {override_crs} in scratch space.")
                if gdf.crs is None:
                    gdf.set_crs(override_crs, allow_override=True, inplace=True)
                else:
                    gdf = gdf.to_crs(override_crs)
                
                reproj_path = os.path.join(env.scratchWorkspace, f"reproj_{os.path.basename(resolved_path)}")
                gdf.to_file(reproj_path)
                resolved_path = reproj_path
            
        layer_name = p.get('layer_name')
        
        # Get metadata to pass forward
        import geopandas as gpd
        try:
            gdf = gpd.read_file(resolved_path)
            crs_str = str(gdf.crs) if gdf.crs else None
            bounds = gdf.total_bounds.tolist() if gdf.crs else None
        except:
            crs_str = None
            bounds = None
            
        self.output = {
            'vector': (resolved_path, layer_name) if layer_name else resolved_path,
            'path_out': resolved_path,
            'crs': crs_str,
            'extent': bounds
        }

@register_node('core_date_variable')
class DateVariableNode(Node):
    def execute(self):
        # Simply outputs the date parameter so it can be wired downstream
        date_str = self.params.get("date", "2024-01-01")
        self.output = date_str
        logger.info(f"Date Variable Node evaluated to: {date_str}")

@register_node('db_export_postgis')
class ExportPostGISNode(Node):
    def execute(self):
        import geopandas as gpd
        import sqlalchemy
        import json
        import os
        from magpi.management import _resolve_features
        
        in_features = self.inputs.get('in_dataset')
        if not in_features:
            raise ValueError("PostGIS Exporter requires an input dataset.")
            
        p = self.params
        conn_name = p.get('connection_name')
        table_name = p.get('table_name', 'new_table')
        if_exists = p.get('if_exists', 'replace')
        
        # Load registry to find connection string
        registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'db_connections.json')
        conn_string = None
        if os.path.exists(registry_path):
            with open(registry_path, 'r') as f:
                data = json.load(f)
                for conn in data.get("connections", []):
                    if conn.get("name") == conn_name:
                        conn_string = conn.get("connection_string")
                        break
                        
        if not conn_string:
            raise ValueError(f"PostGIS Connection '{conn_name}' not found in registry.")
            
        logger.info(f"Exporting data to PostGIS: {conn_name} -> table: {table_name}")
        
        gdf = _resolve_features(in_features)
        engine = sqlalchemy.create_engine(conn_string)
        
        gdf.to_postgis(table_name, engine, if_exists=if_exists)
        logger.info("Successfully pushed to PostGIS.")
        
        self.output = f"postgis://{conn_name}/{table_name}"
