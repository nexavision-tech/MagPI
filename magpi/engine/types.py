from shapely.geometry import box
import json

class MagPI_AOI:
    """Standardized Area of Interest object for MagPI engine.
    Wraps a shapely bounding box polygon to provide a uniform interface
    for extents, clipping bounds, and WFS querying.
    """
    def __init__(self, xmin, ymin, xmax, ymax):
        self.xmin = float(xmin)
        self.ymin = float(ymin)
        self.xmax = float(xmax)
        self.ymax = float(ymax)
        self.geometry = box(self.xmin, self.ymin, self.xmax, self.ymax)

    @property
    def XMin(self): return self.xmin
    @property
    def YMin(self): return self.ymin
    @property
    def XMax(self): return self.xmax
    @property
    def YMax(self): return self.ymax

    def to_json(self):
        return json.dumps({
            "xmin": self.xmin,
            "ymin": self.ymin,
            "xmax": self.xmax,
            "ymax": self.ymax,
            "wkt": self.geometry.wkt
        })

    def __str__(self):
        return f"MagPI_AOI(Extents: {self.xmin}, {self.ymin} -> {self.xmax}, {self.ymax})"

    def bounds(self):
        return (self.xmin, self.ymin, self.xmax, self.ymax)
