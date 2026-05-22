# magpi/engine/nodes/mgt_nodes.py
from ..node import Node
from .registry import register_node
import logging
import os

logger = logging.getLogger("MagPI_MGTNodes")

@register_node('mgt_clip')
class ClipNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        in_extent = self.inputs.get("extent")
        p = self.params
        
        # Fallback to manual extent if no AOI provided
        if not in_extent:
            from ..types import MagPI_AOI
            in_extent = MagPI_AOI(p.get("xmin", 0), p.get("ymin", 0), p.get("xmax", 0), p.get("ymax", 0))
            
        out_filename = f"aoi_clip_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing Clip on {in_raster} using extent {in_extent}")
        from magpi.management import Clip
        self.output = Clip(in_raster, in_extent, out_path)

@register_node('mgt_buffer')
class BufferNode(Node):
    def execute(self):
        in_features = self.inputs.get("in")
        p = self.params
        dist_str = f"{p.get('distance', 100)} {p.get('unit', 'Meters')}"
        out_filename = f"buffer_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing Buffer on {in_features} with distance {dist_str}")
        from magpi.analysis import Buffer
        self.output = Buffer(in_features, out_path, dist_str)

@register_node('mgt_project_raster')
class ProjectRasterNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        out_crs = p.get('out_crs', 'EPSG:4326')
        out_filename = f"proj_raster_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing ProjectRaster on {in_raster} to {out_crs}")
        from magpi.management import ProjectRaster
        self.output = ProjectRaster(in_raster, out_path, out_crs, resampling_type=p.get('resampling', 'NEAREST'))
