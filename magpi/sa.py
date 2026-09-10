import logging
import rasterio
import numpy as np
import os
from .objects import Result

logger = logging.getLogger("MagPI_SpatialAnalyst")

def RasterCalculator(expression, output_raster):
    """
    MagPI Translation of arcpy.sa.RasterCalculator.
    Evaluates map algebra expressions on rasters.
    """
    logger.info(f"Executing Open-Source RasterCalculator: {expression}")
    try:
        # Example expression parsing (very simple for now)
        # e.g., "raster1.tif + raster2.tif"
        import re
        
        # Find all .tif files in the expression
        rasters = re.findall(r'[\w\/\.\-]+\.tif+', expression)
        if not rasters:
            logger.error("No valid rasters found in expression.")
            return Result(None, status=3)
            
        data_dict = {}
        meta = None
        for r in set(rasters):
            with rasterio.open(r) as src:
                data_dict[r] = src.read(1).astype('float32')
                if not meta:
                    meta = src.meta.copy()
                    
        # Replace raster paths with dict access in expression
        eval_expr = expression
        for r in set(rasters):
            eval_expr = eval_expr.replace(r, f"data_dict['{r}']")
            
        # Execute map algebra
        np.seterr(divide='ignore', invalid='ignore')
        out_data = eval(eval_expr)
        
        meta.update({"driver": "GTiff", "dtype": out_data.dtype.name})
        with rasterio.open(output_raster, "w", **meta) as dest:
            dest.write(out_data, 1)
            
        logger.info(f"RasterCalculator complete. Saved to: {output_raster}")
        return Result(output_raster)
    except Exception as e:
        logger.error(f"Failed to execute RasterCalculator: {e}")
        return Result(None, status=3)

def ExtractByMask(in_raster, in_mask_data, output_raster):
    """
    MagPI Translation of arcpy.sa.ExtractByMask.
    """
    logger.info(f"Executing Open-Source ExtractByMask on: {in_raster} using mask {in_mask_data}")
    try:
        import geopandas as gpd
        from rasterio.mask import mask
        
        with rasterio.open(in_raster) as src:
            if str(in_mask_data).endswith('.shp') or str(in_mask_data).endswith('.geojson'):
                mask_gdf = gpd.read_file(in_mask_data)
                if mask_gdf.crs != src.crs:
                    mask_gdf = mask_gdf.to_crs(src.crs)
                shapes = mask_gdf.geometry.values
                out_image, out_transform = mask(src, shapes, crop=True)
            else:
                # If mask is another raster
                with rasterio.open(in_mask_data) as msk:
                    mask_data = msk.read(1)
                    # Create geometries from mask pixels where value > 0
                    # For simplicity, we just do a direct numpy multiplication if they match
                    # (Assuming they match in dimensions and crs for this simplified version)
                    if src.shape == msk.shape:
                        src_data = src.read()
                        out_image = src_data * (mask_data > 0)
                        out_transform = src.transform
                    else:
                        raise ValueError("Raster mask shape mismatch. Vector masks are preferred.")

            out_meta = src.meta.copy()
            out_meta.update({
                "driver": "GTiff",
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform
            })
            
            with rasterio.open(output_raster, "w", **out_meta) as dest:
                dest.write(out_image)
                
        logger.info(f"ExtractByMask complete. Saved to: {output_raster}")
        return Result(output_raster)
    except Exception as e:
        logger.error(f"Failed to execute ExtractByMask: {e}")
        return Result(None, status=3)

# Import Reclassify from IA to maintain drop-in namespace compatibility
from .ia import Reclassify

def Slope(in_raster, output_measurement="DEGREE", z_factor=1, method="PLANAR"):
    """MagPI Translation of arcpy.sa.Slope"""
    import whitebox
    from .env import env
    
    logger.info(f"Executing Open-Source Slope on: {in_raster}")
    
    # Check if this is a Raster object or a string
    in_raster_path = str(in_raster) 
    
    # Determine absolute output path
    # If the script expects a returned Raster object but also creates a temporary file...
    import uuid
    import os
    out_raster_path = env.resolve_path(f"slope_{uuid.uuid4().hex[:8]}.tif", intent="scratch")
    
    wbt = whitebox.WhiteboxTools()
    # Whitebox prints a lot, silence it
    wbt.verbose = False
    
    try:
        units = "degrees" if output_measurement.upper() == "DEGREE" else "percent"
        # WhiteboxTools slope expects Z factor as an argument
        res = wbt.slope(in_raster_path, out_raster_path, zfactor=z_factor, units=units)
        if res != 0:
            logger.error("WhiteboxTools Slope execution failed.")
            return Result(None, status=3)
        
        logger.info(f"Slope complete. Saved to: {out_raster_path}")
        return Raster(out_raster_path)
    except Exception as e:
        logger.error(f"Failed to execute Slope: {e}")
        return Result(None, status=3)


def Aspect(in_raster, method="PLANAR"):
    """MagPI Translation of arcpy.sa.Aspect"""
    import whitebox
    from .env import env
    
    logger.info(f"Executing Open-Source Aspect on: {in_raster}")
    
    in_raster_path = str(in_raster) 
    import uuid
    out_raster_path = env.resolve_path(f"aspect_{uuid.uuid4().hex[:8]}.tif", intent="scratch")
    
    wbt = whitebox.WhiteboxTools()
    wbt.verbose = False
    
    try:
        res = wbt.aspect(in_raster_path, out_raster_path)
        if res != 0:
            logger.error("WhiteboxTools Aspect execution failed.")
            return Result(None, status=3)
        
        logger.info(f"Aspect complete. Saved to: {out_raster_path}")
        return Raster(out_raster_path)
    except Exception as e:
        logger.error(f"Failed to execute Aspect: {e}")
        return Result(None, status=3)


def Hillshade(in_raster, azimuth=315, altitude=45, model_shadows="NO_SHADOWS", z_factor=1):
    """MagPI Translation of arcpy.sa.Hillshade"""
    import whitebox
    from .env import env
    
    logger.info(f"Executing Open-Source Hillshade on: {in_raster}")
    
    in_raster_path = str(in_raster) 
    import uuid
    out_raster_path = env.resolve_path(f"hillshade_{uuid.uuid4().hex[:8]}.tif", intent="scratch")
    
    wbt = whitebox.WhiteboxTools()
    wbt.verbose = False
    
    try:
        res = wbt.hillshade(in_raster_path, out_raster_path, azimuth=azimuth, altitude=altitude, zfactor=z_factor)
        if res != 0:
            logger.error("WhiteboxTools Hillshade execution failed.")
            return Result(None, status=3)
        
        logger.info(f"Hillshade complete. Saved to: {out_raster_path}")
        return Raster(out_raster_path)
    except Exception as e:
        logger.error(f"Failed to execute Hillshade: {e}")
        return Result(None, status=3)

def ZonalStatisticsAsTable(in_zone_data, zone_field, in_value_raster, out_table, ignore_nodata="DATA", statistics_type="ALL"):
    """MagPI Translation of arcpy.sa.ZonalStatisticsAsTable"""
    import whitebox
    from .env import env
    
    logger.info(f"Executing Open-Source ZonalStatisticsAsTable")
    
    in_zone_path = str(in_zone_data)
    in_value_path = str(in_value_raster)
    out_table_path = env.resolve_path(out_table)
    
    wbt = whitebox.WhiteboxTools()
    wbt.verbose = False
    
    try:
        # Note: WhiteboxTools zonal_statistics requires a raster or vector input. 
        # For vector inputs, wbt.zonal_statistics supports Shapefile and GeoJSON.
        stat = "all" if statistics_type.upper() == "ALL" else statistics_type.lower()
        res = wbt.zonal_statistics(i=in_zone_path, features=in_zone_path, value=in_value_path, out_table=out_table_path, stat=stat)
        if res != 0:
            logger.error("WhiteboxTools ZonalStatisticsAsTable execution failed.")
            return Result(None, status=3)
        
        logger.info(f"ZonalStatisticsAsTable complete. Saved to: {out_table_path}")
        return Result(out_table_path)
    except Exception as e:
        logger.error(f"Failed to execute ZonalStatisticsAsTable: {e}")
        return Result(None, status=3)

class Raster:
    """
    MagPI Translation of arcpy.sa.Raster.
    Wrapper object for lazy map algebra evaluation.
    """
    def __init__(self, path):
        self.path = path
        self.catalogPath = path # Required for Describe object compatibility
        
    def __add__(self, other):
        if isinstance(other, Raster):
            return f"{self.path} + {other.path}"
        return f"{self.path} + {other}"
        
    def __sub__(self, other):
        if isinstance(other, Raster):
            return f"{self.path} - {other.path}"
        return f"{self.path} - {other}"
        
    def __str__(self):
        return self.path
        
    def __repr__(self):
        return self.path

