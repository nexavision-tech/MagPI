# magpi/engine/nodes/photogrammetry_nodes.py
from magpi.engine.node import Node
from magpi.engine.nodes.registry import register_node
import magpi.photogrammetry as photo

@register_node('photo_shadow_mask')
class ShadowParallaxMaskNode(Node):
    def execute(self):
        solar_azimuth = self.params.get("solar_azimuth", 135.0)
        solar_elevation = self.params.get("solar_elevation", 45.0)
        in_buildings = self.inputs.get("in_buildings", self.params.get("in_buildings"))
        out_mask = self.params.get("out_mask", "shadow_mask.tif")
        
        self.output = photo.ShadowParallaxMask(solar_azimuth, solar_elevation, in_buildings, out_mask)

@register_node('photo_tie_points')
class AutoTiePointNode(Node):
    def execute(self):
        raster_a = self.inputs.get("raster_a", self.params.get("raster_a"))
        raster_b = self.inputs.get("raster_b", self.params.get("raster_b"))
        method = self.params.get("method", "SHADOW_CORNERS")
        out_points = self.params.get("out_points", "tie_points.shp")
        
        self.output = photo.AutomatedTiePointGeneration(raster_a, raster_b, method, out_points)
