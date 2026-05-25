from magpi.engine.types import MagPI_AOI
from magpi.analysis import _resolve_features
import logging

logging.basicConfig(level=logging.INFO)

aoi = MagPI_AOI(0, 0, 10, 10)
print(f"XMin exists: {hasattr(aoi, 'XMin')}")

try:
    gdf = _resolve_features(aoi)
    print(f"Success! Type: {type(gdf)}")
except Exception as e:
    print(f"Failed! {e}")
