# magpi/engine/nodes/etl_nodes.py
from ..node import Node
from .registry import register_node
from magpi.analysis import SpatialJoin
import logging

logger = logging.getLogger("MagPI_ETLNodes")

@register_node('etl_spatial_join')
class SpatialJoinNode(Node):
    def validate(self):
        if "in1" not in self.inputs:
            logger.error("Spatial Join requires a Target Feature (in1)")
            return False
        if "in2" not in self.inputs:
            logger.error("Spatial Join requires a Join Feature (in2)")
            return False
        return True

    def execute(self):
        target_features = self.inputs.get("in1")
        join_features = self.inputs.get("in2")
        join_operation = self.params.get("join_operation", "JOIN_ONE_TO_ONE")
        
        out_filename = f"spatial_join_{self.id.split('_')[1] if '_' in self.id else '1'}.shp"
        
        logger.info(f"Performing Spatial Join ({join_operation}) into {out_filename}")
        self.output = SpatialJoin(target_features, join_features, out_filename, join_operation)
