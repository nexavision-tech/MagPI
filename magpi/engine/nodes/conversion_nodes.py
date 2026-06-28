# magpi/engine/nodes/conversion_nodes.py
from ..node import Node
from .registry import register_node
import logging

logger = logging.getLogger('MagPI_ConversionNodes')

@register_node('conv_raster_to_polygon')
class RasterToPolygonNode(Node):
    def execute(self):
        raster = self.inputs.get('raster') or self.inputs.get('in')
        p = self.params
        out_polygon = p.get('out_polygon_features', f'raster_polygons_{self.id[-4:]}.shp')
        bg_value = p.get('background_value', 0)

        import os
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_polygon)
        from magpi.conversion import RasterToPolygon
        self.output = RasterToPolygon(raster, out_path, background_value=bg_value)
