import os
import geopandas as gpd
from sqlalchemy import create_engine

print("[INFO] MagPI ✨ Enterprise Database Link Initializing...")

# 1. Define the connection to the native PostGIS Database using Environment Variables!
# We NEVER hardcode passwords in scripts that get pushed to public GitHub repos!
DB_CONNECTION_URL = os.environ.get("MAGPI_DB_URL")

if not DB_CONNECTION_URL:
    print("[ERROR] MAGPI_DB_URL environment variable is not set!")
    print("Please run this in your terminal before running the script:")
    print("export MAGPI_DB_URL='postgresql://magpi_admin:M%40gP1e_DB_Secure@127.0.0.1:5432/magpi_enterprise'")
    print("(Note how the @ symbol in the password must be URL-encoded as %40!)")
    exit(1)


try:
    print("[INFO] Connecting to magpi_enterprise Database...")
    engine = create_engine(DB_CONNECTION_URL)
    
    # 2. Load the sample OSM buildings we generated in step 01
    shapefile_path = "OSM_Buildings_Clipped.shp"
    
    if not os.path.exists(shapefile_path):
        print(f"[ERROR] Could not find {shapefile_path}.")
        print("Please run '01_vector_clip_and_buffer.py' first to generate the sample data!")
        exit(1)
        
    print(f"[INFO] Reading {shapefile_path} into memory...")
    gdf = gpd.read_file(shapefile_path)
    
    # 3. Push the vector data directly into PostGIS!
    table_name = "osm_buildings_gaza"
    print(f"[INFO] Injecting {len(gdf)} features into PostGIS table '{table_name}'...")
    
    # to_postgis automatically creates the table and geometry columns
    gdf.to_postgis(
        name=table_name,
        con=engine,
        if_exists="replace", # If we run this script twice, it replaces the old table
        index=False
    )
    
    print("[SUCCESS] ✨ Data successfully written to Enterprise Database!")
    print("You can now view this table in pgAdmin or publish it as a layer in GeoServer!")
    
except Exception as e:
    print(f"[ERROR] Failed to push to PostGIS: {e}")
