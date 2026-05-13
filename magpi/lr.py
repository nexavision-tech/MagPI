# magpi/lr.py
import geopandas as gpd
import pandas as pd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_LinearReferencing")

def MakeRouteEventLayer(in_routes, route_id_field, in_table, in_event_properties, out_layer, offset_field=None):
    """
    MagPI Translation of arcpy.lr.MakeRouteEventLayer.
    Takes a table of events (e.g., Mile Marker accidents) and snaps them to physical line geometries.
    """
    logger.info(f"Executing Open-Source Linear Referencing (MakeRouteEventLayer)...")
    try:
        from shapely.geometry import Point

        # 1. Load the physical route lines (The Roads/Pipelines)
        routes_gdf = gpd.read_file(in_routes)
        
        # 2. Load the event table (The Accidents/Mile Markers)
        if str(in_table).endswith('.csv'):
            events_df = pd.read_csv(in_table)
        else:
            events_df = gpd.read_file(in_table)

        # 3. Parse the ESRI event properties string
        # Format: "RouteID POINT MeasureField" or "RouteID LINE FromMeasure ToMeasure"
        props = in_event_properties.split(" ")
        if len(props) < 3:
            logger.error("Invalid in_event_properties string.")
            return Result(None, status=3)
            
        event_route_id = props[0]
        event_type = props[1].upper()
        
        # 4. Perform the Relational Join (Match Accident Route ID to Road Route ID)
        logger.info(f"Joining events to routes on: {event_route_id} == {route_id_field}")
        
        # Ensure ID fields are strings for a clean match
        routes_gdf[route_id_field] = routes_gdf[route_id_field].astype(str)
        events_df[event_route_id] = events_df[event_route_id].astype(str)
        
        merged = events_df.merge(routes_gdf[[route_id_field, 'geometry']], 
                                 left_on=event_route_id, 
                                 right_on=route_id_field, 
                                 how='inner')
                                 
        if merged.empty:
            logger.warning("No matching routes found for the provided events.")
            return Result(None, status=2)

        # 5. The Core Math: Interpolate the Measures
        logger.info(f"Interpolating {event_type} measures along route geometries...")
        
        geometries = []
        for idx, row in merged.iterrows():
            line_geom = row['geometry']
            
            if pd.isna(line_geom) or line_geom is None:
                geometries.append(None)
                continue
                
            if event_type == "POINT":
                measure_field = props[2]
                measure_val = float(row[measure_field])
                
                # Shapely interpolate finds the exact mathematical coordinate along the line!
                # Note: This assumes the line geometry's total length matches the measure system.
                # In a full deployment, we normalize based on explicitly defined M-values.
                pt = line_geom.interpolate(measure_val)
                geometries.append(pt)
                
            elif event_type == "LINE":
                logger.warning("LINE events are currently in Skeleton Phase. Interpolating as Point centroids.")
                # Skeleton logic: just find the midpoint of the line event for now
                from_measure = float(row[props[2]])
                to_measure = float(row[props[3]])
                mid_measure = (from_measure + to_measure) / 2.0
                pt = line_geom.interpolate(mid_measure)
                geometries.append(pt)
                
            else:
                geometries.append(None)

        # 6. Apply Geometry and Save
        merged['geometry'] = geometries
        
        # Drop rows where geometry failed to calculate
        merged = merged.dropna(subset=['geometry'])
        
        # Re-cast to GeoDataFrame
        event_gdf = gpd.GeoDataFrame(merged, geometry='geometry', crs=routes_gdf.crs)
        
        event_gdf.to_file(out_layer)
        logger.info(f"Route events successfully mapped. Saved to: {out_layer}")
        return Result(out_layer)

    except Exception as e:
        logger.error(f"Failed to generate route event layer: {e}")
        return Result(None, status=3)

def LocateFeaturesAlongRoutes(in_features, in_routes, route_id_field, radius_or_tolerance, out_table, out_event_properties=""):
    """
    MagPI Translation of arcpy.lr.LocateFeaturesAlongRoutes.
    Takes physical points (e.g., a GPS location) and calculates its Mile Marker value on a nearby road.
    """
    logger.info(f"Executing Open-Source Linear Referencing (LocateFeaturesAlongRoutes)...")
    logger.warning("LocateFeaturesAlongRoutes is in Skeleton Phase.")
    
    try:
        # 1. Load data
        points_gdf = gpd.read_file(in_features)
        routes_gdf = gpd.read_file(in_routes)
        
        # In a full build, this requires a nearest-neighbor spatial join (sjoin_nearest)
        # combined with Shapely's line.project(point) to find the exact M-value distance.
        
        logger.info("Spatial projection logic pending. Returning empty MVP table.")
        # Create an empty CSV for the MVP
        pd.DataFrame().to_csv(out_table)
        
        return Result(out_table)
        
    except Exception as e:
        logger.error(f"Failed to locate features along routes: {e}")
        return Result(None, status=3)