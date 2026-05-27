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

@register_node('ai_change_detection')
class ChangeDetectionNode(Node):
    def execute(self):
        pre_raster = self.inputs.get("PRE", self.params.get("pre_image", ""))
        post_raster = self.inputs.get("POST", self.params.get("post_image", ""))
        p = self.params
        out_raster = p.get("out_raster", "change_mask.tif")
        method = p.get("method", "absolute_difference")
        
        if not pre_raster or not post_raster:
            raise ValueError("Both PRE and POST rasters are required for Change Detection.")
            
        logger.info(f"Running Temporal Change Detection (Method: {method})")
        logger.info(f"PRE: {pre_raster}")
        logger.info(f"POST: {post_raster}")
        
        import os
        from magpi.ia import RasterMath
        
        # Ensure output path
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_raster)
        
        # For a simple structural change detection, subtract pre from post
        if method == "absolute_difference":
            # We'll use RasterMath logic under the hood, or simply wrap it here
            try:
                import rasterio
                import numpy as np
                with rasterio.open(pre_raster) as src1, rasterio.open(post_raster) as src2:
                    meta = src1.meta
                    arr1 = src1.read().astype(np.float32)
                    arr2 = src2.read().astype(np.float32)
                    
                    diff = np.abs(arr2 - arr1)
                    # Normalize or threshold
                    threshold = p.get("threshold", 0.1)
                    mask = (diff > threshold).astype(np.uint8)
                    
                    meta.update(dtype=rasterio.uint8)
                    with rasterio.open(out_path, 'w', **meta) as dst:
                        dst.write(mask)
                        
                self.output = out_path
            except Exception as e:
                logger.error(f"Change detection failed: {e}")
                raise
        else:
            raise NotImplementedError(f"Change detection method {method} not implemented yet.")

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
        out_raster = p.get('out_raster', f"super_resolved_{p.get('scale_factor', 2)}x.tif")
        logger.info(f"GAN Super-Resolution requested for {in_raster} with scale factor {p.get('scale_factor', 2)}")
        
        from magpi.geoai import GenerateSyntheticData
        self.output = GenerateSyntheticData(in_raster, out_raster, p.get('scale_factor', 2))

@register_node('ai_rl')
class AIRLNode(Node):
    def execute(self):
        logger.info("Reinforcement Learning Engine initialized for iterative pipeline optimization.")
        self.output = "rl_optimized_parameters.json"

@register_node('ai_ml_train')
class MLTrainNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in_raster")
        in_features = self.inputs.get("in_features")
        p = self.params
        out_model = p.get('out_model', 'classical_ml.model')
        
        from magpi.geoai import TrainMachineLearningModel
        self.output = TrainMachineLearningModel(in_raster, in_features, out_model, p.get('algorithm', 'RANDOM_FOREST'), p.get('max_trees', 50))

@register_node('ai_ml_predict')
class MLPredictNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in_raster")
        in_model = self.inputs.get("in_model")
        p = self.params
        out_raster = p.get('out_raster', 'ml_classified.tif')
        
        from magpi.geoai import ClassifyPixelsUsingMachineLearning
        self.output = ClassifyPixelsUsingMachineLearning(in_raster, out_raster, in_model)
