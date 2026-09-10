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

class Point:
    def __init__(self, X=0.0, Y=0.0, Z=None, M=None, ID=None):
        self.X = float(X) if X is not None else 0.0
        self.Y = float(Y) if Y is not None else 0.0
        self.Z = Z
        self.M = M
        self.ID = ID

class Array:
    def __init__(self, items=None):
        self._items = list(items) if items is not None else []
    def add(self, item):
        self._items.append(item)
    def __iter__(self):
        return iter(self._items)
    def __len__(self):
        return len(self._items)
    def __getitem__(self, index):
        return self._items[index]

class Polygon:
    def __init__(self, inputs, spatial_reference=None, has_z=False, has_m=False):
        self.inputs = inputs
        self.spatial_reference = spatial_reference
    def getArea(self, method=None, units=None):
        from shapely.geometry import Polygon as shpPolygon
        # naive area calculation for MVP
        coords = [(pt.X, pt.Y) for pt in self.inputs]
        return shpPolygon(coords).area

class Polyline:
    def __init__(self, inputs, spatial_reference=None, has_z=False, has_m=False):
        self.inputs = inputs
        self.spatial_reference = spatial_reference
    def getLength(self, method=None, units=None):
        from shapely.geometry import LineString
        coords = [(pt.X, pt.Y) for pt in self.inputs]
        return LineString(coords).length
