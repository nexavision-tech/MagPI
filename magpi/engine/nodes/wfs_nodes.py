# magpi/engine/nodes/wfs_nodes.py
from ..node import Node
from .registry import register_node
from magpi.wfs import PullSentinel2
import logging

logger = logging.getLogger("MagPI_WFSNodes")

@register_node('wfs_sentinel2')
class PullSentinel2Node(Node):
    def execute(self):
        extents = self.inputs.get("extent") or self.inputs.get("in")
        if extents is None:
            logger.info("DEBUG MAGPI WFS: extents is None (No connection detected).")
        else:
            logger.info(f"DEBUG MAGPI WFS: extents is type {type(extents)}")
            if isinstance(extents, list):
                for idx, item in enumerate(extents):
                    logger.info(f"DEBUG MAGPI WFS: extents[{idx}] is type {type(item)} -> {str(item)[:100]}")
            else:
                logger.info(f"DEBUG MAGPI WFS: extents value is type {type(extents)} -> {str(extents)[:100]}")
                
        # If extents is a flat list of 4 floats (a single bbox), we must wrap it so the loop treats it as one extent!
        if not isinstance(extents, list) or (isinstance(extents, list) and len(extents) == 4 and all(isinstance(x, (int, float)) for x in extents)):
            extents = [extents]
            
        p = self.params
        date_range = f"{p.get('start_date', 'today')}/{p.get('end_date', 'today')}"
        max_cc = p.get('max_cloud_cover', 10)
        item_ids = p.get('selected_items', None)
        
        # Parse band boolean flags from UI
        selected_bands = []
        for band in ['b01','b02','b03','b04','b05','b06',
                     'b07','b08','b8a','b09','b11','b12',
                     'aot','wvp','scl']:
                     
            if p.get(f'band_{band}'):
                selected_bands.append(band.upper())
        bands = ",".join(selected_bands) if selected_bands else None
        
        if item_ids:
            logger.info(f"Pulling Sentinel-2 data using explicitly selected Item IDs: {item_ids}")
        else:
            logger.info(f"Pulling Sentinel-2 data for dates {date_range} with max cloud cover {max_cc}")
        
        self.output = []
        import os
        for i, extent in enumerate(extents):
            suffix = f"_{i}" if len(extents) > 1 else ""
            out_filename = f"s2_cloud_extract_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            out_folder = p.get('out_folder')
            if out_folder:
                out_filename = os.path.join(out_folder, out_filename)
            out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
            
            if os.path.exists(out_path):
                logger.info(f"Found cached Sentinel-2 pull: {out_path}. Skipping download.")
                from magpi.objects import Result
                res = Result(out_path)
            else:
                res = PullSentinel2(extent, out_filename, max_cloud_cover=max_cc, date_range=date_range, item_ids=item_ids, bands=bands)
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"PullSentinel2 failed for extent {i}")
            self.output.append(res)
        
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('wfs_sentinel1')
class PullSentinel1Node(Node):
    def execute(self):
        extents = self.inputs.get("extent") or self.inputs.get("in")
        if not isinstance(extents, list):
            extents = [extents]
            
        p = self.params
        date_range = f"{p.get('start_date', '2023-01-01')}/{p.get('end_date', '2023-12-31')}"
        
        item_ids = p.get('selected_items', None)
        
        selected_bands = []
        for band in ['vv', 'vh', 'hh', 'hv']:
            if p.get(f'band_{band}'):
                selected_bands.append(band.upper())
        bands = ",".join(selected_bands) if selected_bands else None
        
        if item_ids:
            logger.info(f"Pulling Sentinel-1 SAR data using explicitly selected Item IDs: {item_ids}")
        else:
            logger.info(f"Pulling Sentinel-1 SAR data for dates {date_range}")
        
        from magpi.wfs import PullSentinel1
        import os
        
        self.output = []
        for i, extent in enumerate(extents):
            suffix = f"_{i}" if len(extents) > 1 else ""
            out_filename = f"s1_sar_extract_{self.id.split('_')[1] if '_' in self.id else '1'}{suffix}.tif"
            out_folder = p.get('out_folder')
            if out_folder:
                out_filename = os.path.join(out_folder, out_filename)
            out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
            
            if os.path.exists(out_path):
                logger.info(f"Found cached Sentinel-1 SAR pull: {out_path}. Skipping download.")
                from magpi.objects import Result
                res = Result(out_path)
            else:
                res = PullSentinel1(extent, out_filename, date_range=date_range, item_ids=item_ids, bands=bands)
                if hasattr(res, 'status') and res.status == 3:
                    raise Exception(f"PullSentinel1 failed for extent {i}")
            self.output.append(res)
            
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('wfs_copernicus')
class WFSCopernicusNode(Node):
    def execute(self):
        extents = self.inputs.get("extent") or self.inputs.get("in")
        if not isinstance(extents, list):
            extents = [extents]
            
        p = self.params
        collection = p.get('collection', 'SENTINEL-1')
        product_type = p.get('product_type', 'IW_SLC__1S')
        start_date = p.get('start_date', '2024-01-01T00:00:00Z')
        end_date = p.get('end_date', '2024-12-31T23:59:59Z')
        cdse_token = p.get('cdse_token', 'DEMO_TOKEN_REQUIRED')
        
        from magpi.wfs import PullCopernicusData
        
        self.output = []
        for i, extent in enumerate(extents):
            suffix = f"_{i}" if len(extents) > 1 else ""
            out_feature_class = f"copernicus_metadata{suffix}.json"
            out_folder = p.get('out_folder')
            if out_folder:
                out_feature_class = os.path.join(out_folder, out_feature_class)
            res = PullCopernicusData(extent, out_feature_class, collection, product_type, start_date, end_date, cdse_token)
            if hasattr(res, 'status') and res.status == 3:
                raise Exception(f"PullCopernicusData failed for extent {i}")
            self.output.append(res)
            
        if len(self.output) == 1:
            self.output = self.output[0]

@register_node('wfs_arcgis_rest')
class PullArcGISRestNode(Node):
    def execute(self):
        extent = self.inputs.get("extent") or self.inputs.get("in")
        p = self.params
        
        url = p.get("service_url")
        width = p.get("width", 1024)
        height = p.get("height", 1024)
        fmt = p.get("format", "tiff")
        
        if not url:
            raise ValueError("ArcGIS REST service URL is required.")
        if not extent:
            raise ValueError("Spatial Extent is required to query an ArcGIS REST service.")
            
        import os
        from magpi.wfs import PullArcGISRest
        out_filename = f"arcgis_pull_{self.id[-4:]}.{fmt}"
        out_path = os.path.join(os.environ.get('MAGPI_OUTPUT', '.'), out_filename)
        
        logger.info(f"Pulling from ArcGIS REST MapServer/ImageServer: {url}")
        self.output = PullArcGISRest(url, extent, out_path, width=width, height=height, format=fmt)
