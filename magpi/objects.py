# magpi/objects.py
import logging
import os
from pathlib import Path

logger = logging.getLogger("MagPI_Objects")

class Result:
    """Duck-typed mimic of the arcpy.Result object."""
    def __init__(self, output_value, status=4):
        self._output = output_value
        self.status = status
        self.messageCount = 0

    def __getitem__(self, index):
        if index == 0: return self._output
        else: return None

    def getOutput(self, index):
        return self.__getitem__(index)

class DescribeObject:
    """
    Duck-typed mimic of the arcpy.Describe object.
    Now actually interrogates the real data using open-source libraries!
    """
    def __init__(self, dataset_path):
        self.catalogPath = str(Path(dataset_path).resolve())
        self.name = os.path.basename(dataset_path)
        self.baseName = os.path.splitext(self.name)[0]
        self.extension = os.path.splitext(self.name)[1].replace(".", "")
        self.dataType = self._determine_data_type()
        
        # Extended Properties
        self.spatialReference = None
        self.shapeType = None
        self.bandCount = None

        self._interrogate_data()

    def _determine_data_type(self):
        ext = self.extension.lower()
        if ext in ['shp', 'gpkg', 'geojson']: return "FeatureClass"
        elif ext in ['tif', 'png', 'jpg', 'img']: return "RasterDataset"
        elif ext == 'gdb': return "Workspace"
        return "Unknown"

    def _interrogate_data(self):
        from .classes import SpatialReference
        
        if self.dataType == "RasterDataset":
            import rasterio
            try:
                with rasterio.open(self.catalogPath) as src:
                    self.bandCount = src.count
                    if src.crs:
                        self.spatialReference = SpatialReference(src.crs.to_string())
            except Exception as e:
                logger.warning(f"Failed to read raster metadata: {e}")
                
        elif self.dataType == "FeatureClass":
            import geopandas as gpd
            try:
                # Read just the first row to get the schema fast
                gdf = gpd.read_file(self.catalogPath, rows=1) 
                if not gdf.empty:
                    self.shapeType = gdf.geom_type[0]
                if gdf.crs:
                    self.spatialReference = SpatialReference(gdf.crs.name)
            except Exception as e:
                logger.warning(f"Failed to read vector metadata: {e}")

def Describe(dataset):
    return DescribeObject(dataset)
