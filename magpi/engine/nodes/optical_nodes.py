# magpi/engine/nodes/optical_nodes.py
from magpi.engine.node import Node
from magpi.engine.nodes.registry import register_node
import magpi.optical as optical

@register_node('optical_atm_corr')
class AtmosphericCorrectionNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in_raster", self.params.get("in_raster"))
        metadata_xml = self.inputs.get("metadata_xml", self.params.get("metadata_xml"))
        method = self.params.get("method", "DOS")
        out_raster = self.params.get("out_raster", "corrected_raster.tif")
        
        self.output = optical.AtmosphericCorrection(in_raster, metadata_xml, out_raster, method)

@register_node('optical_rpc_ortho')
class OrthorectifyRPCNode(Node):
    def execute(self):
        in_raster = self.inputs.get("in_raster", self.params.get("in_raster"))
        in_dem = self.inputs.get("in_dem", self.params.get("in_dem"))
        in_rpc_txt = self.inputs.get("in_rpc_txt", self.params.get("in_rpc_txt"))
        out_raster = self.params.get("out_raster", "ortho_raster.tif")
        
        self.output = optical.OrthorectifyRPC(in_raster, in_rpc_txt, in_dem, out_raster)
