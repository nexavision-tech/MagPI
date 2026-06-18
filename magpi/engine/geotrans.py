import logging
import pyproj
from pyproj import Transformer, CRS

logger = logging.getLogger("MagPI_GaiaCore")

class GaiaTransform:
    """
    Gaia Core: High-precision geodetic math and coordinate transformations.
    Prioritizes OGC-compliant operations using pyproj.
    """
    def __init__(self):
        self._transformer_cache = {}
        logger.info("Gaia Core Engine Initialized.")

    def _get_transformer(self, src_crs, tgt_crs):
        key = (src_crs, tgt_crs)
        if key not in self._transformer_cache:
            try:
                self._transformer_cache[key] = Transformer.from_crs(src_crs, tgt_crs, always_xy=True)
            except Exception as e:
                logger.error(f"Gaia Core Failed to create transformer {src_crs} -> {tgt_crs}: {e}")
                raise ValueError(f"Invalid CRS transformation: {src_crs} to {tgt_crs}")
        return self._transformer_cache[key]

    def transform_point(self, x, y, src_crs="EPSG:4326", tgt_crs="EPSG:3857"):
        """
        Transform a single (x, y) coordinate pair from src_crs to tgt_crs.
        """
        if src_crs == tgt_crs:
            return x, y
            
        transformer = self._get_transformer(src_crs, tgt_crs)
        return transformer.transform(x, y)

    def transform_bounds(self, xmin, ymin, xmax, ymax, src_crs="EPSG:4326", tgt_crs="EPSG:3857"):
        """
        Transform a bounding box from src_crs to tgt_crs.
        Returns (new_xmin, new_ymin, new_xmax, new_ymax)
        """
        if src_crs == tgt_crs:
            return xmin, ymin, xmax, ymax
            
        transformer = self._get_transformer(src_crs, tgt_crs)
        
        # Transform all 4 corners to find the new bounding box
        coords = [
            (xmin, ymin),
            (xmax, ymin),
            (xmax, ymax),
            (xmin, ymax)
        ]
        
        transformed = [transformer.transform(x, y) for x, y in coords]
        
        xs = [pt[0] for pt in transformed]
        ys = [pt[1] for pt in transformed]
        
        return min(xs), min(ys), max(xs), max(ys)

    def get_crs_metadata(self, epsg_code):
        """
        Retrieve OGC metadata for a given CRS.
        """
        try:
            crs = CRS.from_string(epsg_code)
            return {
                "name": crs.name,
                "is_geographic": crs.is_geographic,
                "is_projected": crs.is_projected,
                "unit": crs.axis_info[0].unit_name if crs.axis_info else "unknown",
                "authority": crs.to_authority()
            }
        except Exception as e:
            logger.error(f"Failed to retrieve CRS metadata for {epsg_code}: {e}")
            return None

# Global Singleton Instance
gaia = GaiaTransform()
