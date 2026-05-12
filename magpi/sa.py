# magpi/sa.py
import rasterio
import numpy as np
from scipy import ndimage
import logging
from .objects import Result

logger = logging.getLogger("MagPI_SpatialAnalyst")

def Slope(in_raster, out_measurement="DEGREE", z_factor=1, method="PLANAR", z_unit="METER"):
    """
    MagPI Translation of arcpy.sa.Slope.
    Reads a raster into a NumPy array and calculates slope using pure math.
    Returns an in-memory Raster object mimic (to be saved or chained).
    """
    logger.info(f"Executing Open-Source Slope on: {in_raster}")
    
    try:
        with rasterio.open(in_raster) as src:
            # Read the raster band into a NumPy array
            array = src.read(1).astype('float32')
            
            # Handle NoData values to prevent math errors
            nodata = src.nodata
            if nodata is not None:
                array[array == nodata] = np.nan
                
            # Get cell resolution (dx, dy)
            dx, dy = src.res
            
            # Calculate gradients (Rise over Run)
            y, x = np.gradient(array, dy, dx)
            
            # Calculate slope
            if out_measurement.upper() == "DEGREE":
                slope = np.degrees(np.arctan(np.sqrt(x*x + y*y) * z_factor))
            else: # PERCENT_RISE
                slope = np.sqrt(x*x + y*y) * z_factor * 100
                
            logger.info("Slope array calculated successfully.")
            
            # Note: A full MagPI implementation will write this 'slope' array 
            # back to a GeoTIFF using the src.meta profile.
            # For now, we return a Result object simulating success.
            return Result("in_memory_slope_raster")

    except Exception as e:
        logger.error(f"Failed to calculate slope: {e}")
        return Result(None, status=3)

def FocalStatistics(in_raster, neighborhood, statistics_type="MEAN", ignore_nodata="DATA"):
    """
    MagPI Translation of arcpy.sa.FocalStatistics.
    Uses SciPy's ultra-fast ndimage generic filters.
    """
    logger.info(f"Executing Open-Source FocalStatistics on: {in_raster}")
    # Skeleton logic placeholder
    # Will use scipy.ndimage.generic_filter(array, function, size=3)
    logger.warning("FocalStatistics logic pending array writing implementation.")
    return Result("in_memory_focal_raster")
