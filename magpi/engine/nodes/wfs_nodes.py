# magpi/engine/nodes/wfs_nodes.py
from ..node import Node
from .registry import register_node
from magpi.wfs import PullSentinel2
import logging

logger = logging.getLogger("MagPI_WFSNodes")

@register_node('wfs_sentinel2')
class PullSentinel2Node(Node):
    def execute(self):
        extent = self.inputs.get("in")
        p = self.params
        
        out_filename = f"s2_cloud_extract_{self.id.split('_')[1] if '_' in self.id else '1'}.tif"
        date_range = f"{p.get('start_date', '2023-01-01')}/{p.get('end_date', '2023-12-31')}"
        max_cc = p.get('max_cloud_cover', 10)
        
        logger.info(f"Pulling Sentinel-2 data for dates {date_range} with max cloud cover {max_cc}")
        
        # Call the functional implementation from the legacy matrix
        self.output = PullSentinel2(extent, out_filename, max_cloud_cover=max_cc, date_range=date_range)
