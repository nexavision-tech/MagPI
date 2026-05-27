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

@register_node('mgt_intersect')
class IntersectNode(Node):
    def execute(self):
        in_features = self.inputs.get("in")
        # in_features could be a list if multiple edges are connected to the 'in' handle
        out_filename = f"intersect_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing Intersect on {in_features}")
        from magpi.analysis import Intersect
        self.output = Intersect(in_features, out_path)

@register_node('mgt_erase')
class EraseNode(Node):
    def execute(self):
        in_features = self.inputs.get("in")
        erase_features = self.inputs.get("erase")
        out_filename = f"erase_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing Erase on {in_features} using {erase_features}")
        from magpi.analysis import Erase
        self.output = Erase(in_features, erase_features, out_path)

@register_node('mgt_merge')
class MergeNode(Node):
    def execute(self):
        in_features = self.inputs.get("in")
        out_filename = f"merge_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Executing Merge on {in_features}")
        from magpi.management import Merge
        self.output = Merge(in_features, out_path)

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

@register_node('mgt_pyramids')
class BuildPyramidsNode(Node):
    def execute(self):
        in_rasters = self.inputs.get("in")
        if not isinstance(in_rasters, list):
            in_rasters = [in_rasters]
            
        p = self.params
        build_p = p.get('build_pyramids', True)
        calc_s = p.get('calculate_stats', True)
        
        logger.info(f"Executing BuildPyramidsAndStats")
        from magpi.management import BuildPyramidsAndStats
        
        self.output = []
        for r in in_rasters:
            try:
                res = BuildPyramidsAndStats(r, build_pyramids=build_p, calculate_stats=calc_s)
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute BuildPyramidsAndStats on {r}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('mgt_extract_band')
class BandExtractorNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        band_index = p.get('band_index', 1)
        
        out_filename = f"band_{band_index}_extract_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Extracting Band {band_index} from {in_raster}")
        
        try:
            import rasterio
            with rasterio.open(in_raster) as src:
                if band_index < 1 or band_index > src.count:
                    raise ValueError(f"Band index {band_index} out of range (1-{src.count})")
                    
                meta = src.meta.copy()
                meta.update({"count": 1})
                
                with rasterio.open(out_path, 'w', **meta) as dst:
                    dst.write(src.read(band_index), 1)
                    
            self.output = out_path
        except Exception as e:
            logger.error(f"Band extraction failed: {e}")
            raise
