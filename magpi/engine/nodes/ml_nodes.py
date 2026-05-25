# magpi/engine/nodes/ml_nodes.py
from ..node import Node
from .registry import register_node
import logging

logger = logging.getLogger("MagPI_MLNodes")

@register_node('ml_pytorch_inference')
class PyTorchInferenceNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in_raster")
        in_model = self.inputs.get("in_model") or self.params.get("model_script_path")
        p = self.params
        
        # Get dynamic properties
        out_raster = p.get('out_raster', f"pytorch_inference_out_{self.id}.tif")
        tile_size = int(p.get('tile_size', 256))
        batch_size = int(p.get('batch_size', 4))
        device = p.get('device', 'cpu')
        
        logger.info(f"Executing PyTorch Inference on {in_raster} using model {in_model}")
        from magpi.ml import PyTorchInference
        
        try:
            self.output = PyTorchInference(
                in_raster=in_raster, 
                model_script_path=in_model, 
                out_raster=out_raster, 
                tile_size=tile_size, 
                batch_size=batch_size, 
                device=device
            )
            if hasattr(self.output, 'status') and self.output.status == 3:
                raise Exception("PyTorchInference returned status 3 (Error).")
        except Exception as e:
            logger.error(f"Failed to execute PyTorchInference: {e}")
            raise
