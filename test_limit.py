import geopandas as gpd
from shapely.geometry import Point
import os

# Create a dummy shapefile with 100 features
gdf = gpd.GeoDataFrame({'id': range(100)}, geometry=[Point(i, i) for i in range(100)], crs="EPSG:4326")
os.makedirs('tmp_shp', exist_ok=True)
gdf.to_file('tmp_shp/test.shp')

# Test reading with limit and engine
test_gdf = gpd.read_file('tmp_shp/test.shp', rows=10, engine='pyogrio')
print("Rows read:", len(test_gdf))

# Test reading with limit, engine, AND bbox
test_gdf2 = gpd.read_file('tmp_shp/test.shp', rows=10, bbox=(0, 0, 50, 50), engine='pyogrio')
print("Rows read with bbox:", len(test_gdf2))
