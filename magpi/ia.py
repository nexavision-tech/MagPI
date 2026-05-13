# magpi/ia.py
import rasterio
import numpy as np
import logging
import os
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

def ExportTrainingDataForDeepLearning(in_raster, out_folder, in_class_data=None, image_chip_format="TIFF", tile_size_x=256, tile_size_y=256, stride_x=256, stride_y=256, output_nofeature_tiles="ONLY_TILES_WITH_FEATURES", metadata_format="PASCAL_VOC"):
    """
    MagPI Translation of arcpy.ia.ExportTrainingDataForDeepLearning.
    (Skeleton Phase) - This is the primary bridge to PyTorch/CuPy. 
    It chips massive rasters into 256x256 squares for Neural Network ingestion.
    """
    logger.info(f"Initializing Deep Learning Export Pipeline for: {in_raster}")
    logger.warning("Deep Learning export is currently in Skeleton Phase. Awaiting MagPI PyTorch Connectors.")
    
    if not os.path.exists(out_folder):
        os.makedirs(out_folder)
        
    logger.info(f"Target tile dimensions: {tile_size_x}x{tile_size_y}. Stride: {stride_x},{stride_y}")
    logger.info(f"Destination: {out_folder}")
    
    # In future iterations, we will use rasterio.windows.Window to rapidly slice the array
    # and geopandas.clip to generate the matching label masks.
    
    return Result(out_folder)