from magpi.engine.nodes.core_nodes import SpatialExtentNode
from magpi.engine.nodes.mgt_nodes import BufferNode
import logging
import sys

logging.basicConfig(level=logging.INFO, stream=sys.stdout)

aoi = SpatialExtentNode(id="n1", params={"xmin": 0, "ymin": 0, "xmax": 10, "ymax": 10})
aoi.execute()

buf = BufferNode(id="n2", params={"distance": 50, "unit": "Meters"})
buf.inputs["in"] = aoi.output
buf.execute()

print("Buffer Output:", getattr(buf.output, 'output', None))
