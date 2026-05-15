# magpi/objects.py
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
        
        # Handle if a Result object or Extent was passed instead of a string
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
                with rasterio.open(dataset) as src:
                    self.bandCount = src.count
                    self.extent = f"XMin: {src.bounds.left:.2f}, YMin: {src.bounds.bottom:.2f}, XMax: {src.bounds.right:.2f}, YMax: {src.bounds.top:.2f}"
                    self.spatialReference = SpatialReference(src.crs)
            except Exception as e:
                logger.error(f"Failed to describe raster: {e}")
                
        elif file_lower.endswith(('.shp', '.geojson', '.gdb')):
            self.dataType = "FeatureClass"
            try:
                import geopandas as gpd
                gdf = gpd.read_file(dataset, rows=1)
                self.shapeType = gdf.geom_type[0]
                self.extent = f"Bounds: {gdf.total_bounds}"
                self.spatialReference = SpatialReference(gdf.crs)
            except Exception as e:
                logger.error(f"Failed to describe vector: {e}")