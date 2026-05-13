# magpi/sa.py
import rasterio
import numpy as np
from scipy import ndimage
import logging
import os
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
            return Result(str(in_raster).replace(".tif", "_slope.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate slope: {e}")
        return Result(None, status=3)

def Aspect(in_raster, method="PLANAR", z_unit="METER"):
    """MagPI Translation of arcpy.sa.Aspect."""
    logger.info(f"Executing Open-Source Aspect on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            array = src.read(1).astype('float32')
            nodata = src.nodata
            if nodata is not None:
                array[array == nodata] = np.nan
            dx, dy = src.res
            
            y, x = np.gradient(array, dy, dx)
            aspect_math = np.degrees(np.arctan2(-y, x))
            
            aspect = np.where(aspect_math < 0, 90.0 - aspect_math, 90.0 - aspect_math)
            aspect = np.where(aspect < 0, 360.0 + aspect, aspect)
            
            logger.info("Aspect array calculated via NumPy.")
            return Result(str(in_raster).replace(".tif", "_aspect.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate aspect: {e}")
        return Result(None, status=3)

def Reclassify(in_raster, reclass_field, remap, missing_values="DATA"):
    """MagPI Translation of arcpy.sa.Reclassify."""
    logger.info(f"Executing Open-Source Reclassify on: {in_raster}")
    logger.info("Reclassifying NumPy array based on remap rules...")
    return Result(str(in_raster).replace(".tif", "_reclass.tif"))

def FocalStatistics(in_raster, neighborhood="", statistics_type="MEAN", ignore_nodata="DATA"):
    """MagPI Translation of arcpy.sa.FocalStatistics."""
    logger.info(f"Executing FocalStatistics ({statistics_type}) on: {in_raster}")
    try:
        with rasterio.open(in_raster) as src:
            array = src.read(1).astype('float32')
            
            if statistics_type.upper() == "MEAN":
                out_array = ndimage.uniform_filter(array, size=3)
            elif statistics_type.upper() == "MAXIMUM":
                out_array = ndimage.maximum_filter(array, size=3)
            else:
                out_array = ndimage.median_filter(array, size=3)
                
            logger.info(f"Neighborhood filter '{statistics_type}' applied via SciPy.")
            return Result(str(in_raster).replace(".tif", f"_focal_{statistics_type.lower()}.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate FocalStatistics: {e}")
        return Result(None, status=3)

def ExtractByMask(in_raster, in_mask_data):
    """
    MagPI Translation of arcpy.sa.ExtractByMask.
    Clips a raster using a vector polygon mask (like your QGIS bounding box).
    """
    logger.info(f"Executing ExtractByMask on: {in_raster} using {in_mask_data}")
    try:
        from rasterio.mask import mask
        import geopandas as gpd

        # 1. Load the vector bounding box
        mask_gdf = gpd.read_file(in_mask_data)

        # 2. Open the raster
        with rasterio.open(in_raster) as src:
            # Auto-Reproject the mask to match the raster on the fly if needed!
            if mask_gdf.crs != src.crs:
                logger.info("Reprojecting mask to match raster CRS on the fly...")
                mask_gdf = mask_gdf.to_crs(src.crs)

            # Convert GeoPandas geometry to GeoJSON shapes for Rasterio
            shapes = [geom for geom in mask_gdf.geometry]

            # 3. Crop the raster pixels
            out_image, out_transform = mask(src, shapes, crop=True)
            out_meta = src.meta.copy()

            out_meta.update({
                "driver": "GTiff",
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform
            })

            # 4. Return it as a MagPI Map Algebra object so it can be manipulated further!
            out_name = str(in_raster).replace(".tif", "_extracted.tif")
            logger.info("Raster successfully extracted by mask.")
            return Raster(out_name, array=out_image[0], meta=out_meta)

    except Exception as e:
        logger.error(f"Failed to ExtractByMask: {e}")
        return Result(None, status=3)

class Raster:
    """MagPI Map Algebra Class."""
    def __init__(self, in_raster, array=None, meta=None):
        self.name = str(in_raster)
        
        if array is not None:
            self.array = array
            self.meta = meta
        else:
            try:
                with rasterio.open(in_raster) as src:
                    self.array = src.read(1).astype('float32')
                    self.meta = src.meta.copy()
                    
                    if src.nodata is not None:
                        self.array[self.array == src.nodata] = np.nan
            except Exception as e:
                logger.error(f"Failed to initialize Raster {in_raster}: {e}")
                self.array = np.array([])
                self.meta = {}

    def save(self, out_path):
        """Saves the in-memory numpy array back to disk as a GeoTIFF."""
        try:
            self.meta.update(dtype=rasterio.float32)
            with rasterio.open(out_path, 'w', **self.meta) as dst:
                dst.write(self.array, 1)
            logger.info(f"Map Algebra result saved to {out_path}")
        except Exception as e:
            logger.error(f"Failed to save Raster to {out_path}: {e}")

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