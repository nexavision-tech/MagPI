# magpi/ia.py
import os
import logging
import numpy as np
from .objects import Result

logger = logging.getLogger("MagPI_ImageAnalyst")

def NDVI(in_raster, nir_band_id=4, red_band_id=1):
    """
    MagPI Translation of arcpy.ia.NDVI.
    Calculates Normalized Difference Vegetation Index using vectorized NumPy math.
    Formula: (NIR - Red) / (NIR + Red)
    """
    if hasattr(in_raster, 'name'): raster_path = in_raster.name
    elif hasattr(in_raster, 'output'): raster_path = in_raster.output
    else: raster_path = str(in_raster)

    out_raster = raster_path.replace(".tif", "_NDVI.tif")
    logger.info(f"Executing Open-Source NDVI Calculation on: {raster_path}")

    try:
        import rasterio
        with rasterio.open(raster_path) as src:
            # Read the requested bands as 32-bit floats to avoid integer division errors
            nir = src.read(nir_band_id).astype('float32')
            red = src.read(red_band_id).astype('float32')
            
            # Suppress division-by-zero warnings for empty pixels
            np.seterr(divide='ignore', invalid='ignore')
            
            # Vectorized Matrix Math (Blazing Fast)
            ndvi = (nir - red) / (nir + red)
            
            # Handle NaN values (where NIR+Red was 0)
            ndvi = np.nan_to_num(ndvi, nan=-1.0)
            
            out_meta = src.meta.copy()
            out_meta.update({
                "driver": "GTiff",
                "count": 1,
                "dtype": 'float32'
            })
            
            with rasterio.open(out_raster, "w", **out_meta) as dest:
                dest.write(ndvi, 1)

        logger.info(f"NDVI successfully generated: {out_raster}")
        return Result(out_raster)

    except Exception as e:
        logger.error(f"NDVI Calculation failed: {e}")
        return Result(None, status=3)

def ExportTrainingDataForDeepLearning(in_raster, out_folder, in_class_data=None, image_chip_format="TIFF", tile_size_x=256, tile_size_y=256, stride_x=128, stride_y=128, output_nofeature_tiles="ONLY_TILES_WITH_FEATURES", metadata_format="Classified_Tiles", start_index=0, class_value_field=None, buffer_radius=None, input_mask_polygons=None, rotation_angle=0, reference_system="MAP_SPACE", processing_mode="PROCESS_AS_MOSAICKED_IMAGE", blacken_around_feature="NO_BLACKEN", crop_mode="FIXED_SIZE", input_point_features=None, target_classes=None, shuffle_chips=False):
    """
    MagPI Translation of arcpy.ia.ExportTrainingDataForDeepLearning.
    Slices massive optical rasters and their corresponding ground-truth label rasters
    into perfectly paired Tensors (Chips) for PyTorch / TensorFlow Semantic Segmentation.
    """
    if hasattr(in_raster, 'name'): raster_path = in_raster.name
    elif hasattr(in_raster, 'output'): raster_path = in_raster.output
    else: raster_path = str(in_raster)

    label_path = None
    if in_class_data:
        if hasattr(in_class_data, 'name'): label_path = in_class_data.name
        elif hasattr(in_class_data, 'output'): label_path = in_class_data.output
        else: label_path = str(in_class_data)

    logger.info(f"Initializing Deep Learning Tensor Chipper...")
    logger.info(f"Source Imagery: {raster_path}")
    if label_path: logger.info(f"Ground Truth Labels: {label_path}")
    logger.info(f"Target Tile Size: {tile_size_x}x{tile_size_y} px (Stride: {stride_x} px)")

    try:
        import rasterio
        from rasterio.windows import Window
        
        images_dir = os.path.join(out_folder, "images")
        labels_dir = os.path.join(out_folder, "labels")
        os.makedirs(images_dir, exist_ok=True)
        if label_path: os.makedirs(labels_dir, exist_ok=True)

        chip_count = 0
        
        with rasterio.open(raster_path) as src_img:
            src_lbl = rasterio.open(label_path) if label_path else None
            
            width = src_img.width
            height = src_img.height
            
            # Sliding window iteration
            for y in range(0, height - tile_size_y + 1, stride_y):
                for x in range(0, width - tile_size_x + 1, stride_x):
                    
                    window = Window(x, y, tile_size_x, tile_size_y)
                    img_array = src_img.read(window=window)
                    
                    # Check for Nodatas or empty chips
                    if np.all(img_array == 0) or np.all(img_array == src_img.nodata):
                        continue
                    
                    chip_name = f"chip_{chip_count:05d}.tif"
                    img_out = os.path.join(images_dir, chip_name)
                    
                    # Write Image Chip
                    out_meta = src_img.meta.copy()
                    out_meta.update({
                        "height": tile_size_y,
                        "width": tile_size_x,
                        "transform": src_img.window_transform(window)
                    })
                    with rasterio.open(img_out, "w", **out_meta) as dest_img:
                        dest_img.write(img_array)
                    
                    # Write corresponding Label Chip
                    if src_lbl:
                        lbl_array = src_lbl.read(window=window)
                        lbl_out = os.path.join(labels_dir, chip_name)
                        lbl_meta = src_lbl.meta.copy()
                        lbl_meta.update({
                            "height": tile_size_y,
                            "width": tile_size_x,
                            "transform": src_lbl.window_transform(window)
                        })
                        with rasterio.open(lbl_out, "w", **lbl_meta) as dest_lbl:
                            dest_lbl.write(lbl_array)
                            
                    chip_count += 1

            if src_lbl: src_lbl.close()
            
        logger.info(f"SUCCESS: Generated {chip_count} training tensors in {out_folder}")
        return Result(out_folder)

    except ImportError:
        logger.error("Missing dependency: 'rasterio'.")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to export deep learning tensors: {e}")
        return Result(None, status=3)