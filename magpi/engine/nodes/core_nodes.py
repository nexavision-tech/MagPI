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
        file_path = p.get('file_path')
        if not file_path:
            raise ValueError("LoadRaster requires a 'file_path' parameter.")
        logger.info(f"Loading Raster: {file_path}")
        
        from magpi.env import env
        resolved_path = env.resolve_path(file_path, intent="input")
        if not __import__('os').path.exists(resolved_path):
            raise FileNotFoundError(f"Input Raster not found: {resolved_path}")
            
        self.output = resolved_path

@register_node('load_vector')
class LoadVectorNode(Node):
    def execute(self):
        p = self.params
        file_path = p.get('file_path')
        if not file_path:
            raise ValueError("LoadVector requires a 'file_path' parameter.")
        logger.info(f"Loading Vector: {file_path}")
        
        from magpi.env import env
        resolved_path = env.resolve_path(file_path, intent="input")
        if not __import__('os').path.exists(resolved_path):
            raise FileNotFoundError(f"Input Vector not found: {resolved_path}")
            
        self.output = resolved_path

@register_node('core_date_variable')
class DateVariableNode(Node):
    def execute(self):
        # Simply outputs the date parameter so it can be wired downstream
        date_str = self.params.get("date", "2024-01-01")
        self.output = date_str
        logger.info(f"Date Variable Node evaluated to: {date_str}")
