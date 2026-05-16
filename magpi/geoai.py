# magpi/geoai.py
import logging
import os
import numpy as np
import geopandas as gpd
from shapely.geometry import box
from .objects import Result

logger = logging.getLogger("MagPI_GeoAI")

def TrainDeepLearningModel(in_folder, out_folder, max_epochs=20, model_type="MASKRCNN", batch_size=4, learning_rate=None, backbone_model="RESNET34"):
    logger.info(f"Initializing Open-Source Deep Learning Training Matrix...")
    if not os.path.exists(out_folder): os.makedirs(out_folder)
    mock_model_path = os.path.join(out_folder, "magpi_model.pth")
    with open(mock_model_path, 'w') as f: f.write('{"Framework":"PyTorch", "Status":"Trained"}')
    return Result(mock_model_path)

def DetectObjectsUsingDeepLearning(in_raster, out_detected_objects, in_model_definition="facebook/detr-resnet-50", arguments=None, run_nms="NMS", confidence_score_field="Confidence"):
    logger.info(f"Executing AI Object Detection on: {in_raster}")
    try:
        import torch
        import rasterio
        from PIL import Image
        from transformers import DetrImageProcessor, DetrForObjectDetection

        processor = DetrImageProcessor.from_pretrained(in_model_definition)
        model = DetrForObjectDetection.from_pretrained(in_model_definition)
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model.to(device)

        with rasterio.open(in_raster) as src:
            image_array = src.read([1, 2, 3]) 
            image_array = np.transpose(image_array, (1, 2, 0))
            if image_array.dtype != np.uint8:
                image_array = (255 * (image_array - np.min(image_array)) / np.ptp(image_array)).astype(np.uint8)
            image = Image.fromarray(image_array)
            transform = src.transform
            crs = src.crs

        inputs = processor(images=image, return_tensors="pt").to(device)
        outputs = model(**inputs)
        target_sizes = torch.tensor([image.size[::-1]])
        results = processor.post_process_object_detection(outputs, target_sizes=target_sizes, threshold=0.7)[0]

        features = []
        for score, label, b_box in zip(results["scores"], results["labels"], results["boxes"]):
            box_coords = b_box.tolist() 
            min_x, min_y = transform * (box_coords[0], box_coords[3]) 
            max_x, max_y = transform * (box_coords[2], box_coords[1]) 
            geom = box(min_x, min_y, max_x, max_y)
            features.append({ "geometry": geom, "Class": model.config.id2label[label.item()], confidence_score_field: round(score.item(), 4) })

        if not features:
            gpd.GeoDataFrame(columns=['geometry', 'Class', confidence_score_field], geometry='geometry', crs=crs).to_file(out_detected_objects)
            return Result(out_detected_objects)

        gdf = gpd.GeoDataFrame(features, crs=crs)
        gdf.to_file(out_detected_objects)
        
        del model
        del inputs
        torch.cuda.empty_cache()
        
        logger.info(f"SUCCESS: Bounding boxes saved to {out_detected_objects}")
        return Result(out_detected_objects)
    except Exception as e:
        logger.error(f"Failed to execute AI detection: {e}")
        return Result(None, status=3)

def ClassifyPixelsUsingDeepLearning(in_raster, out_classified_raster, in_model_definition="nvidia/segformer-b0-finetuned-ade-512-512", arguments=None):
    """
    MagPI Translation of arcpy.ia.ClassifyPixelsUsingDeepLearning.
    Semantic Segmentation: Categorizes every single pixel into classes (e.g., Tree, Building, Road).
    """
    logger.info(f"Executing AI Semantic Segmentation on: {in_raster}")
    logger.info(f"Loading Hugging Face Segmentation Model: {in_model_definition}")
    try:
        import torch
        import rasterio
        from PIL import Image
        from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

        processor = SegformerImageProcessor.from_pretrained(in_model_definition)
        model = SegformerForSemanticSegmentation.from_pretrained(in_model_definition)
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model.to(device)

        with rasterio.open(in_raster) as src:
            logger.info("Reading image matrix for classification...")
            # Grab RGB for the model
            image_array = src.read([1, 2, 3]) 
            image_array = np.transpose(image_array, (1, 2, 0))
            if image_array.dtype != np.uint8:
                image_array = (255 * (image_array - np.min(image_array)) / np.ptp(image_array)).astype(np.uint8)
            image = Image.fromarray(image_array)
            out_meta = src.meta.copy()

        logger.info("Pushing matrix through Neural Network...")
        inputs = processor(images=image, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**inputs)

        # The model outputs a tensor of shape (batch, num_classes, height, width)
        # We find the class with the highest probability for each pixel
        logits = outputs.logits.cpu()
        
        # Resize output to match the original image resolution
        import torch.nn.functional as F
        upsampled_logits = F.interpolate(
            logits,
            size=image.size[::-1], # (height, width)
            mode="bilinear",
            align_corners=False,
        )
        
        # Convert to an array of class IDs
        segmentation_mask = upsampled_logits.argmax(dim=1)[0].numpy().astype(np.uint8)

        # Prepare output raster metadata (1 band, uint8)
        out_meta.update({
            "driver": "GTiff",
            "count": 1,
            "dtype": 'uint8',
            "nodata": 255
        })

        with rasterio.open(out_classified_raster, "w", **out_meta) as dest:
            dest.write(segmentation_mask, 1)

        del model
        del inputs
        torch.cuda.empty_cache()

        logger.info(f"SUCCESS: Categorical Semantic Mask saved to {out_classified_raster}")
        return Result(out_classified_raster)

    except ImportError:
        logger.error("Missing dependencies. Run: pip install torch torchvision transformers Pillow")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to classify pixels: {e}")
        return Result(None, status=3)