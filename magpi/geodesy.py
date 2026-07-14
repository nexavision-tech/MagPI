import pygeodesy
import logging

class MagPIGeodesy:
    def __init__(self):
        # We use Karney's exact geodesic calculations on the WGS84 ellipsoid
        self.ellipsoid = pygeodesy.Ellipsoids.WGS84

    def calculate_footprint(self, coords: list):
        """
        Given a list of (lat, lon) vertices defining a real estate parcel or bunker footprint,
        calculates the precise geodesic area (in square meters) and perimeter.
        """
        try:
            # Create LatLon points using the exact WGS84 ellipsoidal model
            points = [pygeodesy.ellipsoidalExact.LatLon(lat, lon) for lat, lon in coords]
            
            # Calculate the area and perimeter of the polygon
            area, perimeter = pygeodesy.areaOf(points, radius=self.ellipsoid.a)
            
            return {
                "area_sq_meters": area,
                "perimeter_meters": perimeter
            }
        except Exception as e:
            logging.error(f"Failed to calculate footprint: {e}")
            return None

    def distance_between_nodes(self, node_a, node_b):
        """
        Calculates the precise distance in meters between two geolocated OSINT nodes.
        node_a and node_b should be (lat, lon) tuples.
        """
        lat1, lon1 = node_a
        lat2, lon2 = node_b
        p1 = pygeodesy.ellipsoidalExact.LatLon(lat1, lon1)
        p2 = pygeodesy.ellipsoidalExact.LatLon(lat2, lon2)
        
        # distance in meters
        distance = p1.distanceTo(p2)
        return distance
