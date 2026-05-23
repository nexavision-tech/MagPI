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
        in_rasters = self.inputs.get("in")
        if not isinstance(in_rasters, list):
            in_rasters = [in_rasters]
            
        p = self.params
        out_crs = p.get('out_crs', 'EPSG:4326')
        
        logger.info(f"Executing ProjectRaster on {in_rasters} to {out_crs}")
        from magpi.management import ProjectRaster
        
        self.output = []
        for i, r in enumerate(in_rasters):
            suffix = f"_{i}" if len(in_rasters) > 1 else ""
            out_filename = f"proj_raster_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
            try:
                res = ProjectRaster(r, out_path, out_crs, resampling_type=p.get('resampling', 'NEAREST'))
                if hasattr(res, 'status') and res.status == 4:
                    raise Exception(f"ProjectRaster failed on raster {r}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute ProjectRaster on {r}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]


@register_node('mgt_project_vector')
class ProjectVectorNode(Node):
    def execute(self):
        in_features = self.inputs.get("in")
        if not isinstance(in_features, list):
            in_features = [in_features]
            
        p = self.params
        out_crs = p.get('out_crs', 'EPSG:4326')
        
        logger.info(f"Executing Project Vector on {in_features} to {out_crs}")
        from magpi.management import Project
        
        self.output = []
        for i, f in enumerate(in_features):
            suffix = f"_{i}" if len(in_features) > 1 else ""
            base_filename = p.get('out_feature_class', f"proj_vector_{self.id.split('_')[1] if '_' in self.id else '1'}.shp")
            if len(in_features) > 1:
                name, ext = os.path.splitext(base_filename)
                out_filename = f"{name}{suffix}{ext}"
            else:
                out_filename = base_filename
                
            out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
            try:
                res = Project(f, out_path, out_crs)
                if hasattr(res, 'status') and res.status == 4:
                    raise Exception(f"Project Vector failed on feature {f}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute Project Vector on {f}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('mgt_array_index')
class ArrayIndexerNode(Node):
    def execute(self):
        in_payload = self.inputs.get("in")
        p = self.params
        idx = int(p.get('index', 0))
        
        logger.info(f"Extracting index {idx} from payload {in_payload}")
        
        if isinstance(in_payload, list):
            if idx < 0 or idx >= len(in_payload):
                raise Exception(f"Array Index {idx} out of bounds for array of length {len(in_payload)}")
            self.output = in_payload[idx]
        else:
            if idx != 0:
                logger.warning(f"Array Index {idx} requested, but payload is not a list. Returning item as index 0.")
            self.output = in_payload
