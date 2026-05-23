# magpi/engine/nodes/ia_nodes.py
from ..node import Node
from .registry import register_node
import logging

logger = logging.getLogger("MagPI_IANodes")

@register_node('ia_ndvi')
class NDVINode(Node):
    def execute(self):
        in_rasters = self.inputs.get("in")
        if not isinstance(in_rasters, list):
            in_rasters = [in_rasters]
            
        p = self.params
        nir = p.get('nir_band', 4)
        red = p.get('red_band', 3)
        
        logger.info(f"Executing NDVI with NIR={nir} RED={red}")
        from magpi.ia import NDVI
        
        self.output = []
        for r in in_rasters:
            try:
                res = NDVI(r, nir_band_id=nir, red_band_id=red)
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"NDVI failed on raster {r}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute NDVI on {r}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('ia_pansharpen')
class PansharpenNode(Node):
    def execute(self):
        in_rasters = self.inputs.get("in")
        if not isinstance(in_rasters, list):
            in_rasters = [in_rasters]
            
        p = self.params
        method = p.get('method', 'IHS')
        
        logger.info(f"Executing Pansharpen using method {method}")
        from magpi.ia import Pansharpen
        
        self.output = []
        for i, r in enumerate(in_rasters):
            suffix = f"_{i}" if len(in_rasters) > 1 else ""
            out_filename = f"pansharpened_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            try:
                res = Pansharpen(r, r, out_filename, method=method) # Using same raster as pan_raster for mock
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"Pansharpen failed on raster {r}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute Pansharpen on {r}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('ia_reclassify')
class ReclassifyNode(Node):
    def execute(self):
        in_rasters = self.inputs.get("in")
        if not isinstance(in_rasters, list):
            in_rasters = [in_rasters]
            
        p = self.params
        remap = p.get('remap_string', '')
        
        logger.info(f"Executing Reclassify")
        from magpi.ia import Reclassify
        
        self.output = []
        for i, r in enumerate(in_rasters):
            suffix = f"_{i}" if len(in_rasters) > 1 else ""
            out_filename = f"reclassified_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            try:
                res = Reclassify(r, out_filename, remap_string=remap)
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"Reclassify failed on raster {r}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute Reclassify on {r}: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('ia_raster_math')
class RasterMathNode(Node):
    def execute(self):
        # Dual inputs
        in_a = self.inputs.get("in1")
        in_b = self.inputs.get("in2")
        
        # We need to handle list comprehensions if A and B are lists of the same length
        is_a_list = isinstance(in_a, list)
        is_b_list = isinstance(in_b, list)
        
        if is_a_list and not is_b_list: in_b = [in_b] * len(in_a)
        elif is_b_list and not is_a_list: in_a = [in_a] * len(in_b)
        elif not is_a_list and not is_b_list:
            in_a = [in_a]
            in_b = [in_b]
            
        p = self.params
        expr = p.get('expression', 'A - B')
        
        logger.info(f"Executing Raster Math: {expr}")
        from magpi.ia import RasterMath
        
        self.output = []
        for i, (ra, rb) in enumerate(zip(in_a, in_b)):
            suffix = f"_{i}" if len(in_a) > 1 else ""
            out_filename = f"raster_math_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            try:
                res = RasterMath(ra, rb, expression=expr, out_raster=out_filename)
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"Raster Math failed on {ra} and {rb}")
                self.output.append(res)
            except Exception as e:
                logger.error(f"Failed to execute Raster Math: {e}")
                raise
                
        if len(self.output) == 1:
            self.output = self.output[0]
