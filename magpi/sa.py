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

class Raster:
    """
    MagPI Translation of arcpy.sa.Raster.
    Wrapper object for lazy map algebra evaluation.
    """
    def __init__(self, path):
        self.path = path
        
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
