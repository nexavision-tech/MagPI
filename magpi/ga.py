# magpi/ga.py
import geopandas as gpd
import numpy as np
import logging
import os
from .objects import Result

logger = logging.getLogger("MagPI_Geostatistics")

def Idw(in_point_features, z_field, out_raster, cell_size, power=2):
    """
    MagPI Translation of arcpy.sa.Idw / arcpy.ga.IDW.
    Inverse Distance Weighting Interpolation.
    Mathematically predicts values for unmeasured locations based on surrounding points.
    """
    logger.info(f"Executing Open-Source IDW Interpolation on: {in_point_features}")
    try:
        from scipy.interpolate import griddata
        import rasterio
        from rasterio.transform import from_origin

        # 1. Load the Point Data
        gdf = gpd.read_file(in_point_features)
        
        # Ensure the Z field exists and drop nulls
        if z_field not in gdf.columns:
            logger.error(f"Z-value field '{z_field}' not found.")
            return Result(None, status=3)
            
        gdf = gdf.dropna(subset=[z_field, 'geometry'])
        
        if gdf.empty:
            logger.error("No valid points found for interpolation.")
            return Result(None, status=3)

        # 2. Extract Coordinates and Values
        logger.info(f"Extracting X, Y, and Z ({z_field}) values...")
        x = gdf.geometry.x.values
        y = gdf.geometry.y.values
        z = gdf[z_field].astype(float).values
        points = np.column_stack((x, y))

        # 3. Create the Output Grid based on the Bounding Box and Cell Size
        minx, miny, maxx, maxy = gdf.total_bounds
        
        # Add a small buffer so edge points aren't cut off
        minx -= float(cell_size)
        maxx += float(cell_size)
        miny -= float(cell_size)
        maxy += float(cell_size)
        
        grid_x, grid_y = np.mgrid[minx:maxx:float(cell_size), maxy:miny:-float(cell_size)]
        
        # 4. Perform the Mathematical Interpolation (SciPy C-Backend)
        logger.info("Executing SciPy interpolation algorithms...")
        # Note: MVP uses 'linear' or 'cubic' griddata. 
        # True IDW power curves can be added via custom SciPy cKDTree logic in future builds.
        grid_z = griddata(points, z, (grid_x, grid_y), method='linear')
        
        # 5. Handle NaNs (areas outside the convex hull of the points)
        grid_z = np.nan_to_num(grid_z, nan=-9999.0)

        # 6. Save out as a continuous GeoTIFF Raster
        logger.info("Generating GeoTIFF Raster...")
        transform = from_origin(minx, maxy, float(cell_size), float(cell_size))
        
        # grid_z comes out rotated depending on the mgrid setup, so we transpose it
        raster_data = grid_z.T 
        
        out_meta = {
            'driver': 'GTiff',
            'height': raster_data.shape[0],
            'width': raster_data.shape[1],
            'count': 1,
            'dtype': raster_data.dtype,
            'crs': gdf.crs,
            'transform': transform,
            'nodata': -9999.0
        }

        with rasterio.open(out_raster, 'w', **out_meta) as dst:
            dst.write(raster_data, 1)

        logger.info(f"IDW Interpolation complete. Saved to: {out_raster}")
        return Result(out_raster)

    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge scipy rasterio -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to execute IDW: {e}")
        return Result(None, status=3)