# magpi/na.py
import geopandas as gpd
import logging
from .objects import Result

logger = logging.getLogger("MagPI_NetworkAnalyst")

def Solve(start_point, end_point, out_route_features, network_type='drive'):
    """
    MagPI Translation of arcpy.na.Solve (Simplified MVP).
    Uses osmnx to dynamically download road networks and find the shortest path.
    """
    logger.info(f"Executing Open-Source Network Solve ({network_type})...")
    try:
        import osmnx as ox
        import networkx as nx
        from shapely.geometry import LineString

        # start_point and end_point expect (Lat, Lon) tuples
        logger.info(f"Downloading street network data around origin {start_point}...")
        
        # Fetch the street network surrounding the start point
        # 10,000 meters (10km) radius by default for the MVP
        G = ox.graph_from_point(start_point, dist=10000, network_type=network_type)
        
        # Find the closest physical intersections on the road graph
        orig_node = ox.distance.nearest_nodes(G, start_point[1], start_point[0])
        dest_node = ox.distance.nearest_nodes(G, end_point[1], end_point[0])
        
        logger.info("Calculating shortest driving path via Dijkstra's algorithm...")
        # Calculate shortest path based on physical road length
        route = nx.shortest_path(G, orig_node, dest_node, weight='length')
        
        # Convert the list of node IDs into a continuous geometry line
        route_nodes = ox.graph_to_gdfs(G, edges=False).loc[route]
        route_line = LineString(route_nodes.geometry.tolist())
        
        # Package and save
        gdf = gpd.GeoDataFrame(geometry=[route_line], crs="EPSG:4326")
        gdf.to_file(out_route_features)
        
        logger.info(f"Network Solve complete. Route saved to: {out_route_features}")
        return Result(out_route_features)

    except ImportError:
        logger.error("Missing dependency. Run: conda install -c conda-forge osmnx networkx -y")
        return Result(None, status=3)
    except Exception as e:
        logger.error(f"Failed to solve network route: {e}")
        return Result(None, status=3)