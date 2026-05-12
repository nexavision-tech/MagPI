# magpi/classes.py
import logging

logger = logging.getLogger("MagPI_Classes")

class SpatialReference:
    """
    MagPI mimic of arcpy.SpatialReference.
    Future Gaian Mind updates will tie this directly to pyproj.CRS.
    """
    def __init__(self, item, text=None):
        logger.info(f"Instantiating MagPI SpatialReference for: {item}")
        self.name = str(item)
        self.factoryCode = item if isinstance(item, int) else 4326 # Default to WGS84

    def exportToString(self):
        return f"MAGPI_PROJCS_{self.name}"

class Extent:
    """
    MagPI mimic of arcpy.Extent. 
    Defines bounding boxes for raster and vector operations.
    """
    def __init__(self, XMin, YMin, XMax, YMax, spatial_reference=None):
        self.XMin = float(XMin)
        self.YMin = float(YMin)
        self.XMax = float(XMax)
        self.YMax = float(YMax)
        self.spatialReference = spatial_reference

    @property
    def polygon(self):
        from shapely.geometry import box
        return box(self.XMin, self.YMin, self.XMax, self.YMax)
