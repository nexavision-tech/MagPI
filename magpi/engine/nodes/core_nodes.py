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
