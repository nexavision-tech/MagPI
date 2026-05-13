# magpi/ia.py
import rasterio
from rasterio.windows import Window
import numpy as np
import geopandas as gpd
import logging
import os
import random
import csv
from .objects import Result
from .sa import Raster

logger = logging.getLogger("MagPI_ImageAnalyst")

def NDVI(in_raster, nir_band_id=4, red_band_id=1):
    """
    MagPI Translation of arcpy.ia.NDVI.
    Calculates the Normalized Difference Vegetation Index using Near-Infrared and Red bands.
    Formula: (NIR - Red) / (NIR + Red)
    """
    logger.info(f"Executing Open-Source NDVI on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            # Check if the raster actually has enough bands
            if src.count < max(nir_band_id, red_band_id):
                logger.error(f"NDVI Failed: Raster only has {src.count} bands. Requires at least {max(nir_band_id, red_band_id)}.")
                return Result(None, status=3)

            logger.info(f"Reading Band {nir_band_id} (NIR) and Band {red_band_id} (Red) into memory...")
            nir = src.read(nir_band_id).astype('float32')
            red = src.read(red_band_id).astype('float32')
            
            # Suppress divide-by-zero warnings for empty pixel regions
            np.seterr(divide='ignore', invalid='ignore')
            
            # The C-backend NumPy Band Math
            ndvi_array = (nir - red) / (nir + red)
            
            # Clean up NaNs from divide-by-zero back to a standard NoData value (-9999.0)
            ndvi_array = np.nan_to_num(ndvi_array, nan=-9999.0)
            
            out_meta = src.meta.copy()
            out_meta.update({
                "driver": "GTiff",
                "count": 1,
                "dtype": 'float32',
                "nodata": -9999.0
            })
            
            out_name = str(in_raster).replace(".tif", "_NDVI.tif")
            
            with rasterio.open(out_name, 'w', **out_meta) as dst:
                dst.write(ndvi_array, 1)
                
            logger.info(f"NDVI calculation complete. Saved to: {out_name}")
            return Raster(out_name, array=ndvi_array, meta=out_meta)
            
    except Exception as e:
        logger.error(f"Failed to calculate NDVI: {e}")
        return Result(None, status=3)

def ExportTrainingDataForDeepLearning(in_raster, out_folder, in_class_data=None, image_chip_format="TIFF", tile_size_x=256, tile_size_y=256, stride_x=128, stride_y=128, meta_data_format="PASCAL_VOC", shuffle_chips=True, apply_jitter=False):
    """
    MagPI Translation of arcpy.ia.ExportTrainingDataForDeepLearning.
    Chips massive rasters into small training tensors for PyTorch/TensorFlow.
    *Enhanced with MagPI Jitter & Anti-Spatial-Autocorrelation Shuffling.*
    """
    logger.info(f"Executing Open-Source Deep Learning Export on: {in_raster}")
    try:
        if not os.path.exists(out_folder):
            os.makedirs(out_folder)
            
        img_folder = os.path.join(out_folder, "images")
        label_folder = os.path.join(out_folder, "labels")
        os.makedirs(img_folder, exist_ok=True)
        os.makedirs(label_folder, exist_ok=True)

        chip_manifest = [] # To track and shuffle our data

        with rasterio.open(in_raster) as src:
            logger.info(f"Source Raster: {src.width}x{src.height} pixels, {src.count} bands.")
            logger.info(f"Chipping into {tile_size_x}x{tile_size_y} tensors with stride {stride_x}...")
            
            chip_count = 0
            
            # Slide the window across the massive raster
            for j in range(0, src.height - tile_size_y + 1, stride_y):
                for i in range(0, src.width - tile_size_x + 1, stride_x):
                    
                    # Apply Jitter (Data Augmentation Shift) if requested
                    offset_x = random.randint(-10, 10) if apply_jitter else 0
                    offset_y = random.randint(-10, 10) if apply_jitter else 0
                    
                    # Ensure jitter doesn't push us off the edge of the image
                    win_x = max(0, min(i + offset_x, src.width - tile_size_x))
                    win_y = max(0, min(j + offset_y, src.height - tile_size_y))
                    
                    window = Window(win_x, win_y, tile_size_x, tile_size_y)
                    chip_array = src.read(window=window)
                    
                    # Skip chips that are mostly NoData/Black (e.g., edges of aerial photos)
                    if np.all(chip_array == 0):
                        continue
                        
                    chip_name = f"chip_{chip_count:06d}.tif"
                    out_path = os.path.join(img_folder, chip_name)
                    
                    out_meta = src.meta.copy()
                    out_meta.update({
                        "height": tile_size_y,
                        "width": tile_size_x,
                        "transform": src.window_transform(window)
                    })
                    
                    with rasterio.open(out_path, "w", **out_meta) as dest:
                        dest.write(chip_array)
                        
                    # Add to manifest for shuffling
                    chip_manifest.append({"image": chip_name, "label": "unclassified_for_now"})
                    chip_count += 1
                    
        # The Shuffling Protocol: Destroy Spatial Auto-Correlation
        if shuffle_chips:
            logger.info("Shuffling training data to prevent spatial auto-correlation...")
            random.shuffle(chip_manifest)
            
        # Write the manifest CSV for PyTorch Dataloaders to read
        manifest_path = os.path.join(out_folder, "train_manifest.csv")
        with open(manifest_path, 'w', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=["image", "label"])
            writer.writeheader()
            for row in chip_manifest:
                writer.writerow(row)
                    
        logger.info(f"Deep Learning Export complete. Generated {chip_count} training chips at {out_folder}")
        return Result(out_folder)

    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge rasterio numpy -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to export training data: {e}")
        return Result(None, status=3)