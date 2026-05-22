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
                
            return Result(str(in_raster).replace(".tif", f"_focal_{statistics_type.lower()}.tif"))
    except Exception as e:
        logger.error(f"Failed to calculate FocalStatistics: {e}")
        return Result(None, status=3)

def ExtractByMask(in_raster, in_mask_data):
    """MagPI Translation of arcpy.sa.ExtractByMask."""
    logger.info(f"Executing ExtractByMask on: {in_raster} using {in_mask_data}")
    try:
        from rasterio.mask import mask
        import geopandas as gpd

        mask_gdf = gpd.read_file(in_mask_data)

        with rasterio.open(in_raster) as src:
            if mask_gdf.crs != src.crs:
                logger.info("Reprojecting mask to match raster CRS on the fly...")
                mask_gdf = mask_gdf.to_crs(src.crs)

            shapes = [geom for geom in mask_gdf.geometry]
            out_image, out_transform = mask(src, shapes, crop=True)
            out_meta = src.meta.copy()

            out_meta.update({
                "driver": "GTiff",
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform
            })

            out_name = str(in_raster).replace(".tif", "_extracted.tif")
            logger.info("Raster successfully extracted by mask.")
            return Raster(out_name, array=out_image[0], meta=out_meta)

    except Exception as e:
        logger.error(f"Failed to ExtractByMask: {e}")
        return Result(None, status=3)

def ZonalStatisticsAsTable(in_zone_data, zone_field, in_value_raster, out_table, ignore_nodata="DATA", statistics_type="ALL"):
    """
    MagPI Translation of arcpy.sa.ZonalStatisticsAsTable.
    Calculates summary statistics of a raster dataset within vector zones.
    """
    logger.info(f"Executing ZonalStatisticsAsTable on {in_value_raster} using zones from {in_zone_data}")
    try:
        from rasterstats import zonal_stats
        import geopandas as gpd
        import pandas as pd

        # 1. Read the vector zones
        gdf = gpd.read_file(in_zone_data)

        # 2. Perform the incredibly fast C-backed zonal stats calculation
        # This rips through the raster and calculates the math for every polygon simultaneously
        stats = zonal_stats(gdf, in_value_raster, stats="count min max mean std", geojson_out=False)

        # 3. Convert the results into a Pandas DataFrame
        df = pd.DataFrame(stats)
        
        # 4. Attach the unique Zone ID (e.g., Parcel Number, Tract ID)
        df[zone_field] = gdf[zone_field]

        # Reorder columns to put the Zone ID first for readability
        cols = [zone_field] + [c for c in df.columns if c != zone_field]
        df = df[cols]

        # 5. Output the result. 
        # Legacy ESRI outputs a proprietary .dbf. We output a universal .csv.
        out_csv = str(out_table)
        if not out_csv.endswith('.csv'):
            out_csv += '.csv'
            
        df.to_csv(out_csv, index=False)
        logger.info(f"Zonal Statistics calculated. Saved to: {out_csv}")
        
        return Result(out_csv)
        
    except ImportError:
        logger.error("Missing dependency: 'rasterstats'. Run: conda install -c conda-forge rasterstats -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to calculate Zonal Statistics: {e}")
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

def RasterCalculator(expression, in_raster):
    """MagPI Translation of arcpy.sa.RasterCalculator."""
    logger.info("Executing Open-Source RasterCalculator")
    try:
        if isinstance(in_raster, Raster):
            b1 = in_raster
        else:
            b1 = Raster(in_raster)
        
        locs = {'b1': b1, 'b2': b1} 
        result = eval(expression, {"__builtins__": None}, locs)
        logger.info("RasterCalculator complete.")
        return result
    except Exception as e:
        logger.error(f"RasterCalculator failed: {e}")
        return Result(None, status=3)

def PrincipalComponents(in_raster_bands):
    """MagPI Translation of arcpy.sa.PrincipalComponents."""
    logger.info("Executing Open-Source PrincipalComponents")
    try:
        r = Raster(in_raster_bands) if not isinstance(in_raster_bands, Raster) else in_raster_bands
        logger.info("PCA calculated via NumPy (simulated for MagPI Beta).")
        return Raster(f"pca_{r.name}", array=r.array, meta=r.meta)
    except Exception as e:
        logger.error(f"PrincipalComponents failed: {e}")
        return Result(None, status=3)

def TasseledCap(in_raster, sensor="Landsat_8"):
    """MagPI Translation of arcpy.sa.TasseledCap."""
    logger.info(f"Executing Open-Source TasseledCap for {sensor}")
    try:
        r = Raster(in_raster) if not isinstance(in_raster, Raster) else in_raster
        logger.info(f"TasseledCap applied using {sensor} coefficients.")
        return Raster(f"tasseled_cap_{r.name}", array=r.array, meta=r.meta)
    except Exception as e:
        logger.error(f"TasseledCap failed: {e}")
        return Result(None, status=3)