# magpi/engine/nodes/humangeo_nodes.py
from magpi.engine.node import Node
from magpi.engine.nodes.registry import register_node
import magpi.humangeo as humangeo

@register_node('humangeo_osm_extract')
class OSMFeatureExtractorNode(Node):
    def execute(self):
        bbox_extent = self.inputs.get("bbox_extent", self.params.get("bbox_extent"))
        feature_type = self.params.get("feature_type", "buildings")
        out_vector = self.params.get("out_vector", "osm_features.geojson")
        
        self.output = humangeo.OSMFeatureExtractor(bbox_extent, feature_type, out_vector)

@register_node('humangeo_worldpop')
class WorldPopIngestorNode(Node):
    def execute(self):
        iso3_country = self.inputs.get("iso3_country", self.params.get("iso3_country", "HTI"))
        year = self.params.get("year", "2020")
        out_raster = self.params.get("out_raster", "worldpop_density.tif")
        
        self.output = humangeo.WorldPopIngestor(iso3_country, year, out_raster)
