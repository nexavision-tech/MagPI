# magpi/ddd.py
import numpy as np
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_3DAnalyst")

def LasDatasetToRaster(in_las, out_raster, value_field="ELEVATION", interpolation_type="BINNING AVERAGE", sampling_type="CELLSIZE", sampling_value=1.0):
    """
    MagPI Translation of arcpy.ddd.LasDatasetToRaster.
    Converts a .las or .laz point cloud into a gridded GeoTIFF Raster.
    """
    logger.info(f"Executing Open-Source LasDatasetToRaster on: {in_las}")
    try:
        import laspy
        import rasterio
        from rasterio.transform import from_origin
        from rasterio.crs import CRS
        
        # 1. Read the LAZ/LAS file
        logger.info("Reading Point Cloud into memory...")
        las = laspy.read(in_las)
        
        x = las.x
        y = las.y
        z = las.z
        
        # 2. Determine Bounding Box and Grid Dimensions
        cell_size = float(sampling_value)
        min_x, max_x = np.min(x), np.max(x)
        min_y, max_y = np.min(y), np.max(y)
        
        width = int(np.ceil((max_x - min_x) / cell_size))
        height = int(np.ceil((max_y - min_y) / cell_size))
        
        logger.info(f"Generating {width}x{height} raster grid (Cell Size: {cell_size})...")
        
        # Create the Affine Transform Matrix
        transform = from_origin(min_x, max_y, cell_size, cell_size)
        
        # 3. Robust Digitize Points into Grid (Binning)
        # We invert the transform matrix to map real-world X/Y to pixel Col/Row instantly
        inv_transform = ~transform
        col_indices, row_indices = inv_transform * (x, y)
        
        # Ensure they are integers and bounded correctly
        col_indices = np.clip(np.floor(col_indices).astype(int), 0, width - 1)
        row_indices = np.clip(np.floor(row_indices).astype(int), 0, height - 1)
        
        # 4. Calculate the Cell Values
        # Using a standard NoData value instead of NaN for better QGIS stat support
        nodata_val = -9999.0
        grid = np.full((height, width), nodata_val, dtype=np.float32)
        
        # Fast vectorized binning (Maximum Elevation)
        flat_indices = row_indices * width + col_indices
        flat_grid = grid.ravel()
        np.maximum.at(flat_grid, flat_indices, z)
        grid = flat_grid.reshape((height, width))
        
        # 5. Extract CRS
        crs = None
        try:
            parsed_crs = las.header.parse_crs()
            if parsed_crs:
                crs = parsed_crs
                logger.info(f"Extracted CRS from Lidar VLR metadata: {crs.name}")
        except Exception as e:
            logger.debug(f"Could not auto-parse CRS from LAS header: {e}")

        if crs is None:
            from .env import env
            if env.outputCoordinateSystem:
                if hasattr(env.outputCoordinateSystem, 'factoryCode'):
                    crs = CRS.from_epsg(env.outputCoordinateSystem.factoryCode)
                else:
                    crs = CRS.from_string(str(env.outputCoordinateSystem))
                logger.info(f"Applying ArcPy Environment CRS fallback: {crs}")
            else:
                logger.warning("No CRS found. Output will be 'Unknown'.")
        
        # 6. Write to GeoTIFF
        with rasterio.open(
            out_raster, 'w', driver='GTiff',
            height=height, width=width,
            count=1, dtype=str(grid.dtype),
            crs=crs, transform=transform,
            nodata=nodata_val
        ) as dst:
            dst.write(grid, 1)
            
        logger.info(f"Lidar to Raster complete. Saved to: {out_raster}")
        return Result(out_raster)
        
    except ImportError:
        logger.error("Missing dependency: 'laspy' is required. Run: conda install -c conda-forge laspy lazrs-python -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to process Lidar: {e}")
        return Result(None, status=3)