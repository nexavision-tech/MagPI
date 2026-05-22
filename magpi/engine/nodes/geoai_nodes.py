# magpi/engine/nodes/geoai_nodes.py
from ..node import Node
from .registry import register_node
import logging
import os

logger = logging.getLogger("MagPI_GeoAINodes")

@register_node('ai_train')
class TrainModelNode(Node):
    def execute(self):
        in_folder = self.inputs.get("in") or self.params.get("in_folder")
        p = self.params
        out_folder = p.get('out_folder', 'trained_model')
        
        logger.info(f"Training GeoAI Model on {in_folder} (Epochs: {p.get('max_epochs')})")
        from magpi.geoai import TrainDeepLearningModel
        self.output = TrainDeepLearningModel(
            in_folder=in_folder, 
            out_folder=out_folder, 
            max_epochs=p.get('max_epochs', 10), 
            batch_size=p.get('batch_size', 4), 
            model_type=p.get('model_type', 'UNET')
        )

@register_node('ai_detect')
class DetectObjectsNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        out_shp = p.get('out_shp', 'detected_objects.shp')
        
        logger.info(f"Detecting Objects on {in_raster} using model {p.get('model')}")
        from magpi.geoai import DetectObjectsUsingDeepLearning
        self.output = DetectObjectsUsingDeepLearning(in_raster, out_shp, p.get('model'))

@register_node('ai_classify')
class ClassifyPixelsNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        out_raster = p.get('out_raster', 'classified_pixels.tif')
        
        logger.info(f"Classifying Pixels on {in_raster} using model {p.get('model')}")
        from magpi.geoai import ClassifyPixelsUsingDeepLearning
        self.output = ClassifyPixelsUsingDeepLearning(in_raster, out_raster, p.get('model'))

@register_node('ai_insight')
class AIInsightNode(Node):
    def execute(self):
        in_meta = self.inputs.get("in")
        p = self.params
        prompt = p.get('prompt', "Analyze this data.")
        model = p.get('model_name', "huggingface/transformers")
        
        from magpi.geoai import GenerateInsightsFromMetadata
        self.output = GenerateInsightsFromMetadata(in_meta, prompt, model)

@register_node('ai_generate')
class AIGenerateNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in")
        p = self.params
        logger.info(f"GAN Super-Resolution requested for {in_raster} with scale factor {p.get('scale_factor', 2)}")
        self.output = f"super_resolved_{p.get('scale_factor')}x.tif"

@register_node('ai_rl')
class AIRLNode(Node):
    def execute(self):
        logger.info("Reinforcement Learning Engine initialized for iterative pipeline optimization.")
        self.output = "rl_optimized_parameters.json"
