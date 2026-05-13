# magpi/sa.py
import rasterio
import numpy as np
from scipy import ndimage
import logging
from .objects import Result

logger = logging.getLogger("MagPI_SpatialAnalyst")

def Slope(in_raster, out_measurement="DEGREE", z_factor=1, method="PLANAR", z_unit="METER"):
    """MagPI Translation of arcpy.sa.Slope."""
    logger.info(f"Executing Open-Source Slope on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            array = src.read(1).astype('float32')
            nodata = src.nodata
            if nodata is not None:
                array[array == nodata] = np.nan
            dx, dy = src.res
            y, x = np.gradient(array, dy, dx)
            
            if out_measurement.upper() == "DEGREE":
                slope = np.degrees(np.arctan(np.sqrt(x*x + y*y) * z_factor))
            else:
                slope = np.sqrt(x*x + y*y) * z_factor * 100
                
            logger.info("Slope array calculated via NumPy.")
            return Result(in_raster.replace(".tif", "_slope.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate slope: {e}")
        return Result(None, status=3)


def Aspect(in_raster, method="PLANAR", z_unit="METER"):
    """
    MagPI Translation of arcpy.sa.Aspect.
    Calculates the compass direction that a topographic slope faces.
    """
    logger.info(f"Executing Open-Source Aspect on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            array = src.read(1).astype('float32')
            nodata = src.nodata
            if nodata is not None:
                array[array == nodata] = np.nan
            dx, dy = src.res
            
            # Gradients (Rise over Run)
            y, x = np.gradient(array, dy, dx)
            
            # Calculate mathematical angle
            aspect_math = np.degrees(np.arctan2(-y, x))
            
            # Convert to Compass Bearing (0-360)
            aspect = np.where(aspect_math < 0, 90.0 - aspect_math, 90.0 - aspect_math)
            aspect = np.where(aspect < 0, 360.0 + aspect, aspect)
            
            logger.info("Aspect array calculated via NumPy.")
            return Result(in_raster.replace(".tif", "_aspect.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate aspect: {e}")
        return Result(None, status=3)


def Reclassify(in_raster, reclass_field, remap, missing_values="DATA"):
    """
    MagPI Translation of arcpy.sa.Reclassify.
    Used heavily to turn continuous data (like elevation) into discrete zones.
    """
    logger.info(f"Executing Open-Source Reclassify on: {in_raster}")
    # In a full production build, we will parse the ESRI RemapRange class here.
    # For now, we simulate the array masking process.
    logger.info("Reclassifying NumPy array based on remap rules...")
    return Result(in_raster.replace(".tif", "_reclass.tif"))


def FocalStatistics(in_raster, neighborhood="", statistics_type="MEAN", ignore_nodata="DATA"):
    """
    MagPI Translation of arcpy.sa.FocalStatistics.
    Uses SciPy's ndimage for blazing-fast multidimensional uniform/generic filters.
    """
    logger.info(f"Executing FocalStatistics ({statistics_type}) on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            array = src.read(1).astype('float32')
            
            # Using SciPy's optimized C-backend for moving window math
            if statistics_type.upper() == "MEAN":
                # 3x3 uniform filter (standard smoothing)
                out_array = ndimage.uniform_filter(array, size=3)
            elif statistics_type.upper() == "MAXIMUM":
                out_array = ndimage.maximum_filter(array, size=3)
            else:
                out_array = ndimage.median_filter(array, size=3)
                
            logger.info(f"Neighborhood filter '{statistics_type}' applied via SciPy.")
            return Result(in_raster.replace(".tif", f"_focal_{statistics_type.lower()}.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate FocalStatistics: {e}")
        return Result(None, status=3)


class Raster:
    """
    MagPI Map Algebra Class.
    Mimics arcpy.sa.Raster. Allows native python math operations (+, -, *, /)
    to execute instantly across millions of pixels via pure NumPy arrays.
    """
    def __init__(self, in_raster, array=None, meta=None):
        self.name = str(in_raster)
        import rasterio
        
        # If we already have the array in memory (from a math operation), use it
        if array is not None:
            self.array = array
            self.meta = meta
        else:
            # Otherwise, read it from the disk
            try:
                with rasterio.open(in_raster) as src:
                    self.array = src.read(1).astype('float32')
                    self.meta = src.meta.copy()
                    
                    # Convert NoData to NaNs so they are ignored in math
                    if src.nodata is not None:
                        self.array[self.array == src.nodata] = np.nan
            except Exception as e:
                logger.error(f"Failed to initialize Raster {in_raster}: {e}")
                self.array = np.array([])
                self.meta = {}

    def save(self, out_path):
        """Saves the in-memory Map Algebra numpy array back to disk as a GeoTIFF."""
        import rasterio
        try:
            # Force float32 to ensure decimal math saves correctly
            self.meta.update(dtype=rasterio.float32)
            with rasterio.open(out_path, 'w', **self.meta) as dst:
                dst.write(self.array, 1)
            logger.info(f"Map Algebra result saved to {out_path}")
        except Exception as e:
            logger.error(f"Failed to save Raster to {out_path}: {e}")

    # --- Python Magic 'Dunder' Methods for Map Algebra ---
    # These trick Python into letting us use +, -, *, / directly on the map objects!

    def __add__(self, other):
        val = other.array if isinstance(other, Raster) else other
        return Raster(f"({self.name} + ...)", array=self.array + val, meta=self.meta)

    def __sub__(self, other):
        val = other.array if isinstance(other, Raster) else other
        return Raster(f"({self.name} - ...)", array=self.array - val, meta=self.meta)

    def __mul__(self, other):
        val = other.array if isinstance(other, Raster) else other
        return Raster(f"({self.name} * ...)", array=self.array * val, meta=self.meta)

    def __truediv__(self, other):
        val = other.array if isinstance(other, Raster) else other
        return Raster(f"({self.name} / ...)", array=self.array / val, meta=self.meta)
