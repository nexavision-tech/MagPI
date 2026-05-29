# magpi/engine/nodes/plenum_nodes.py
from magpi.engine.node import Node
from magpi.engine.nodes.registry import register_node
import magpi.plenum as plenum

@register_node('plenum_fits_ingest')
class FITSIngestorNode(Node):
    def execute(self):
        file_path = self.inputs.get("file_path", self.params.get("file_path"))
        out_raster = self.params.get("out_raster", "fits_converted.tif")
        
        self.output = plenum.IngestFITS(file_path, out_raster)

@register_node('plenum_space_weather')
class SpaceWeatherNode(Node):
    def execute(self):
        out_json = self.params.get("out_json", "space_weather.json")
        self.output = plenum.StreamSpaceWeather(out_json)

@register_node('plenum_starlink')
class StarlinkTrackerNode(Node):
    def execute(self):
        out_vector = self.params.get("out_vector", "starlink_mesh.geojson")
        self.output = plenum.StarlinkConstellationTracker(out_vector)
