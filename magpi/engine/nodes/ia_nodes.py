# magpi/engine/nodes/ia_nodes.py
from ..node import Node
from .registry import register_node
import logging

logger = logging.getLogger("MagPI_IANodes")

@register_node('ia_ndvi')
class NDVINode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        logger.info(f"Executing NDVI on {in_raster} with NIR={p.get('nir_band')} RED={p.get('red_band')}")
        from magpi.ia import NDVI
        self.output = NDVI(in_raster, nir_band_id=p.get('nir_band', 4), red_band_id=p.get('red_band', 3))

@register_node('ia_pansharpen')
class PansharpenNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        out_filename = f"pansharpened_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        logger.info(f"Executing Pansharpen on {in_raster} using method {p.get('method')}")
        from magpi.ia import Pansharpen
        self.output = Pansharpen(in_raster, in_raster, out_filename, method=p.get('method', 'IHS'))

@register_node('ia_reclassify')
class ReclassifyNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        out_filename = f"reclassified_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        logger.info(f"Executing Reclassify on {in_raster}")
        from magpi.ia import Reclassify
        self.output = Reclassify(in_raster, out_filename, remap_string=p.get('remap_string', ''))
