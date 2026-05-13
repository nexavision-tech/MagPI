# magpi/geocoding.py
import geopandas as gpd
import pandas as pd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_Geocoding")

def GeocodeAddresses(in_table, address_locator, in_address_fields, out_feature_class, out_relationship_type="STATIC"):
    """
    MagPI Translation of arcpy.geocoding.GeocodeAddresses.
    Uses OpenStreetMap (Nominatim) to geocode addresses for free.
    """
    logger.info(f"Executing Open-Source GeocodeAddresses on: {in_table}")
    try:
        from geopy.geocoders import Nominatim
        from geopy.extra.rate_limiter import RateLimiter
        from shapely.geometry import Point

        # 1. Load the tabular data
        if str(in_table).endswith('.csv'):
            df = pd.read_csv(in_table)
        else:
            df = gpd.read_file(in_table)

        # 2. Extract the address column
        # Note: in_address_fields assumes the exact column name containing the full string address.
        address_col = in_address_fields
        if address_col not in df.columns:
            logger.error(f"Address field '{address_col}' not found in table.")
            return Result(None, status=3)

        logger.info("Connecting to OpenStreetMap (Nominatim) geocoding service...")
        geolocator = Nominatim(user_agent="magpi_sovereign_geocoder")
        
        # Apply rate limiting to respect OSM free-tier servers (1 request per second)
        geocode_with_delay = RateLimiter(geolocator.geocode, min_delay_seconds=1)

        logger.info(f"Geocoding addresses from '{address_col}'... (Rate limited for free tier)")
        
        # Perform the geocoding
        df['location'] = df[address_col].apply(geocode_with_delay)
        
        # Extract point geometry
        df['geometry'] = df['location'].apply(lambda loc: Point(loc.longitude, loc.latitude) if loc else None)
        
        # Drop the raw location object
        df = df.drop(columns=['location'])
        
        failures = df['geometry'].isna().sum()
        if failures > 0:
            logger.warning(f"Failed to geocode {failures} addresses. Dropping nulls.")
            df = df.dropna(subset=['geometry'])

        if df.empty:
            logger.error("No addresses were successfully geocoded.")
            return Result(None, status=3)

        # Convert to GeoDataFrame and save
        gdf = gpd.GeoDataFrame(df, geometry='geometry', crs="EPSG:4326")
        
        # Reproject if environment specifies
        from .env import env
        if env.outputCoordinateSystem:
            target_crs = f"EPSG:{env.outputCoordinateSystem}" if isinstance(env.outputCoordinateSystem, int) else str(env.outputCoordinateSystem)
            logger.info(f"Auto-Reprojecting geocoded points to: {target_crs}")
            gdf = gdf.to_crs(target_crs)

        gdf.to_file(out_feature_class)
        
        logger.info(f"Geocoding complete. Saved to: {out_feature_class}")
        return Result(out_feature_class)

    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge geopy -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to geocode addresses: {e}")
        return Result(None, status=3)