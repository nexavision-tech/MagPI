import os
import logging

logger = logging.getLogger("MagPI_Objects")

class Result:
    def __init__(self, output, status=0):
        self.output = output
        self.status = status # 0 = success, anything else is error

    def getOutput(self, index):
        return self.output

class Extent:
    def __init__(self, XMin, YMin, XMax, YMax, spatial_reference=None):
        self.XMin = float(XMin)
        self.YMin = float(YMin)
        self.XMax = float(XMax)
        self.YMax = float(YMax)
        self.spatialReference = spatial_reference

    def __str__(self):
        return f"{self.XMin} {self.YMin} {self.XMax} {self.YMax}"

class SpatialReference:
    def __init__(self, crs_input):
        self.name = str(crs_input)
        self.factoryCode = crs_input

class Describe:
    def __init__(self, dataset):
        self.dataType = "Unknown"
        self.shapeType = "N/A"
        self.bandCount = 1
        self.extent = None
        self.spatialReference = "Unknown"
        self.wgs84_extent = None # NEW: Stores Lat/Lon for the React Map!
        
        if hasattr(dataset, 'output'):
            dataset = dataset.output
        
        if not isinstance(dataset, str) or not os.path.exists(dataset):
            logger.warning(f"Describe failed: {dataset} not found.")
            return
            
        file_lower = dataset.lower()
        
        if file_lower.endswith(('.tif', '.img', '.jp2', '.png', '.h5')):
            self.dataType = "RasterDataset"
            try:
                import rasterio
                from rasterio.warp import transform_bounds
                with rasterio.open(dataset) as src:
                    self.bandCount = src.count
                    bounds = src.bounds
                    self.extent = Extent(bounds.left, bounds.bottom, bounds.right, bounds.top)
                    self.spatialReference = SpatialReference(src.crs)
                    
                    # MAGIC PROJECTION: Transform the native CRS to Lat/Lon (EPSG:4326) for the Leaflet UI!
                    try:
                        wgs = transform_bounds(src.crs, 'EPSG:4326', bounds.left, bounds.bottom, bounds.right, bounds.top)
                        # Leaflet needs [[min_lat, min_lon], [max_lat, max_lon]]
                        self.wgs84_extent = [[wgs[1], wgs[0]], [wgs[3], wgs[2]]]
                    except Exception as e:
                        logger.debug(f"Could not project bounds to WGS84: {e}")

            except Exception as e:
                logger.error(f"Failed to describe raster: {e}")
                
        elif file_lower.endswith(('.shp', '.geojson', '.gdb')):
            self.dataType = "FeatureClass"
            try:
                import geopandas as gpd
                import fiona
                
                # Use fiona to get the true total bounds without loading geometries into memory
                with fiona.open(dataset) as src:
                    bounds = src.bounds
                    self.extent = Extent(bounds[0], bounds[1], bounds[2], bounds[3])
                
                # Still read 1 row just to get the shapeType for the UI
                gdf = gpd.read_file(dataset, rows=1)
                self.shapeType = gdf.geom_type[0] if len(gdf) > 0 else "Unknown"
                self.spatialReference = SpatialReference(gdf.crs)
            except Exception as e:
                logger.error(f"Failed to describe vector: {e}")