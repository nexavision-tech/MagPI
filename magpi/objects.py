# magpi/objects.py
import os
import logging

logger = logging.getLogger("MagPI_Objects")

class Result:
    """
    MagPI Translation of arcpy.Result.
    Acts as a wrapper for tool outputs to maintain legacy compatibility.
    """
    def __init__(self, output, status=0):
        self.output = output
        self.status = status # 0 = Success, 1 = Warning, 3 = Error
        
    def getOutput(self, index=0):
        """Mimics arcpy.Result.getOutput(0)"""
        if isinstance(self.output, list):
            return self.output[index] if index < len(self.output) else None
        return self.output

    def __str__(self):
        return str(self.output)


class Extent:
    """MagPI Translation of arcpy.Extent."""
    def __init__(self, XMin, YMin, XMax, YMax):
        self.XMin = XMin
        self.YMin = YMin
        self.XMax = XMax
        self.YMax = YMax
        
    def __str__(self):
        return f"{self.XMin} {self.YMin} {self.XMax} {self.YMax}"


class Describe:
    """
    MagPI Translation of arcpy.Describe.
    Extracts metadata from geospatial datasets natively using GeoPandas and Rasterio.
    """
    def __init__(self, dataset):
        self.dataset = str(dataset)
        self.dataType = "Unknown"
        self.spatialReference = None
        self.extent = None
        self.bandCount = 1
        self.shapeType = "Unknown"
        
        try:
            if not os.path.exists(self.dataset):
                from .env import env
                workspace_path = os.path.join(env.workspace if env.workspace else ".", self.dataset)
                if os.path.exists(workspace_path):
                    self.dataset = workspace_path
                else:
                    logger.warning(f"Describe: Dataset does not exist: {self.dataset}")
                    return
                
            # Check if Raster
            if self.dataset.lower().endswith(('.tif', '.png', '.jpg', '.img', '.jp2')):
                import rasterio
                self.dataType = "RasterDataset"
                with rasterio.open(self.dataset) as src:
                    self.bandCount = src.count
                    self.spatialReference = src.crs
                    bounds = src.bounds
                    self.extent = Extent(bounds.left, bounds.bottom, bounds.right, bounds.top)
                    
            # Check if Vector
            elif self.dataset.lower().endswith(('.shp', '.geojson', '.gpkg', '.dbf')):
                import geopandas as gpd
                self.dataType = "FeatureClass"
                # We read only 1 row to get the metadata instantly without loading the whole file into RAM
                gdf = gpd.read_file(self.dataset, rows=1) 
                self.spatialReference = gdf.crs
                self.shapeType = gdf.geom_type[0] if not gdf.empty else "Unknown"
                
                # To get the true extent, we have to read the bounds. 
                # (Can be optimized later with Fiona directly)
                bounds = gpd.read_file(self.dataset).total_bounds
                self.extent = Extent(bounds[0], bounds[1], bounds[2], bounds[3])
                
        except Exception as e:
            logger.error(f"Describe failed for {self.dataset}: {e}")