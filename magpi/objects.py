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
        self.spatialReference = SpatialReference("Unknown")
        self.wgs84_extent = None
        self.name = ""
        self.baseName = ""
        self.catalogPath = ""
        self.path = ""
        self.extension = ""
        self.fields = []
        
        if hasattr(dataset, 'output'):
            dataset = dataset.output
        
        if not isinstance(dataset, str):
            self.name = str(dataset)
            return

        self.catalogPath = dataset
        self.path, self.name = os.path.split(dataset)
        self.baseName, self.extension = os.path.splitext(self.name)
        
        if not os.path.exists(dataset):
            logger.warning(f"Describe failed: {dataset} not found.")
            return
            
        file_lower = dataset.lower()
        
        if file_lower.endswith(('.tif', '.img', '.jp2', '.png', '.h5', '.grid')):
            self.dataType = "RasterDataset"
            self.format = self.extension.strip('.').upper()
            self.compressionType = "LZ77"
            self.isInteger = False
            self.noDataValue = "-9999"
            try:
                import rasterio
                from rasterio.warp import transform_bounds
                with rasterio.open(dataset) as src:
                    self.bandCount = src.count
                    bounds = src.bounds
                    self.extent = Extent(bounds.left, bounds.bottom, bounds.right, bounds.top)
                    self.spatialReference = SpatialReference(src.crs)
                    
                    try:
                        wgs = transform_bounds(src.crs, 'EPSG:4326', bounds.left, bounds.bottom, bounds.right, bounds.top)
                        self.wgs84_extent = [[wgs[1], wgs[0]], [wgs[3], wgs[2]]]
                    except Exception as e:
                        logger.debug(f"Could not project bounds to WGS84: {e}")
            except Exception as e:
                logger.error(f"Failed to describe raster: {e}")
                
        elif file_lower.endswith(('.shp', '.geojson', '.gdb', '.gpkg', '.sqlite')):
            self.dataType = "FeatureClass"
            self.hasM = False
            self.hasZ = False
            self.hasSpatialIndex = True
            self.shapeFieldName = "geometry"
            self.OIDFieldName = "OBJECTID"
            self.featureType = "Simple"
            try:
                import geopandas as gpd
                import pyogrio
                
                info = pyogrio.read_info(dataset)
                bounds = info['total_bounds']
                self.extent = Extent(bounds[0], bounds[1], bounds[2], bounds[3])
                self.fields = [type('Field', (), {'name': k, 'type': 'String', 'length': 255}) for k in info['fields']]
                
                self.shapeType = str(info['geometry_type'])
                if hasattr(info, 'crs'):
                    self.spatialReference = SpatialReference(info['crs'])
            except Exception as e:
                logger.error(f"Failed to describe vector: {e}")
        elif file_lower.endswith(('.dbf', '.csv', '.txt')):
            self.dataType = "Table"
            self.hasOID = False

    def __getattr__(self, item):
        """
        Universal mock proxy for exhaustive arcpy.Describe properties.
        If a script requests a property (like 'isVersioned' or 'hasFAT') that
        we haven't explicitly computed, safely return a mocked default to avoid crashes.
        """
        item_lower = item.lower()
        if "name" in item_lower:
            return ""
        if item_lower.startswith("is") or item_lower.startswith("has"):
            return False
        if "type" in item_lower:
            return "Unknown"
        if "count" in item_lower:
            return 0
        if "length" in item_lower or "width" in item_lower:
            return 0
        
        logger.debug(f"Describe object defaulting property request: '{item}'")
        return None