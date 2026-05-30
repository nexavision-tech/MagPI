import http.server
import socketserver
import webbrowser
import os
import json
import threading
import logging
import time
import tempfile
import subprocess
from datetime import datetime
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger("MagPI_UI")

JOB_FILE = os.path.join(os.getcwd(), 'magpi_workspace', '.magpi_jobs.json')
JOB_REGISTRY = {}

def load_jobs():
    global JOB_REGISTRY
    if os.path.exists(JOB_FILE):
        try:
            with open(JOB_FILE, 'r') as f:
                JOB_REGISTRY = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load jobs: {e}")
            JOB_REGISTRY = {}

def save_jobs():
    try:
        os.makedirs(os.path.dirname(JOB_FILE), exist_ok=True)
        with open(JOB_FILE, 'w') as f:
            sorted_jobs = sorted(JOB_REGISTRY.values(), key=lambda x: x.get('started', ''), reverse=True)
            limited_jobs = {job['id']: job for job in sorted_jobs[:50]}
            json.dump(limited_jobs, f)
    except Exception as e:
        logger.error(f"Failed to save jobs: {e}")

def execute_pipeline_background(job_id, payload):
    try:
        import io
        import logging
        log_stream = io.StringIO()
        log_handler = logging.StreamHandler(log_stream)
        log_handler.setFormatter(logging.Formatter('[%(levelname)s]: %(message)s'))
        
        root_logger = logging.getLogger()
        root_logger.addHandler(log_handler)
        
        JOB_REGISTRY[job_id]['status'] = 'Running'
        JOB_REGISTRY[job_id]['progress'] = 0
        JOB_REGISTRY[job_id]['node_status'] = {}
        save_jobs()
        
        from magpi.engine import PipelineRunner
        runner = PipelineRunner()
        runner.load_from_json(payload)
        
        def progress_callback(node_id, status, current_idx, total_nodes):
            JOB_REGISTRY[job_id]['progress'] = int((current_idx / max(1, total_nodes)) * 100)
            JOB_REGISTRY[job_id]['node_status'][node_id] = status
            JOB_REGISTRY[job_id]['logs'] = log_stream.getvalue().split('\n')
            save_jobs()
            
        success = runner.run(progress_callback=progress_callback)
        
        root_logger.removeHandler(log_handler)
        
        JOB_REGISTRY[job_id]['status'] = 'Finished' if success else 'Failed'
        JOB_REGISTRY[job_id]['progress'] = 100
        JOB_REGISTRY[job_id]['logs'] = log_stream.getvalue().split('\n')
        save_jobs()
        
    except Exception as e:
        JOB_REGISTRY[job_id]['status'] = 'Failed'
        if 'logs' not in JOB_REGISTRY[job_id]:
            JOB_REGISTRY[job_id]['logs'] = []
        JOB_REGISTRY[job_id]['logs'].append(f"Error: {str(e)}")
        save_jobs()

def LaunchCanvas(port=8080):
    module_dir = os.path.dirname(os.path.abspath(__file__))
    gui_dir = os.path.join(module_dir, 'gui')
    
    if not os.path.exists(gui_dir):
        logger.warning(f"GUI dir not found at {gui_dir}. Serving API only.")

    class MagPIAPIHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            if os.path.exists(gui_dir):
                super().__init__(*args, directory=gui_dir, **kwargs)
            else:
                super().__init__(*args, **kwargs)

        def end_headers(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(200)
            self.end_headers()

        def do_GET(self):
            parsed_path = urlparse(self.path)
            if parsed_path.path == '/api/browse':
                self.handle_browse(parsed_path.query)
            elif parsed_path.path == '/api/describe':
                self.handle_describe(parsed_path.query)
            elif parsed_path.path == '/api/jobs':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(list(JOB_REGISTRY.values())).encode('utf-8'))
            elif parsed_path.path == '/api/geojson':
                self.handle_geojson(parsed_path.query)
            elif parsed_path.path == '/api/raster':
                self.handle_raster(parsed_path.query)
            elif parsed_path.path == '/api/raster_metadata':
                self.handle_raster_metadata(parsed_path.query)
            elif parsed_path.path == '/api/vector_metadata':
                self.handle_vector_metadata(parsed_path.query)
            elif parsed_path.path == '/api/load_project':
                self.handle_load_project(parsed_path.query)
            elif parsed_path.path == '/api/community_nodes':
                self.handle_community_nodes()
            elif parsed_path.path == '/api/references':
                self.handle_references()
            elif parsed_path.path == '/api/gis_servers':
                self.handle_gis_servers()
            elif parsed_path.path == '/api/databases':
                self.handle_databases()
            elif parsed_path.path == '/api/db_connections':
                self.handle_db_connections_get()
            elif parsed_path.path == '/api/list_files':
                self.handle_list_files(parsed_path.query)
            elif parsed_path.path == '/api/list_layers':
                self.handle_list_layers(parsed_path.query)
            else:
                super().do_GET()

        def do_POST(self):
            parsed_path = urlparse(self.path)
            
            if parsed_path.path == '/api/run':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    script_code = payload.get('code', '')
                    
                    logger.info("Received Pipeline Execution Request from Canvas.")
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.py', mode='w') as temp_script:
                        temp_script.write(script_code)
                        temp_filepath = temp_script.name
                        
                    logger.info(f"Executing Matrix Payload: {temp_filepath}")
                    
                    process = subprocess.Popen(
                        ['python', temp_filepath], 
                        stdout=subprocess.PIPE, 
                        stderr=subprocess.STDOUT, 
                        text=True
                    )
                    
                    output, _ = process.communicate()
                    
                    try: os.remove(temp_filepath)
                    except: pass
                    
                    response = {
                        "status": "success" if process.returncode == 0 else "error", 
                        "logs": output
                    }
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                    
                except Exception as e:
                    logger.error(f"Execution API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/stac_query':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    logger.info("Received STAC Query Request from Canvas.")
                    
                    # Call python stac query wrapper
                    from magpi.wfs import QuerySentinel2
                    
                    bbox = payload.get('bbox', [-180, -90, 180, 90])
                    date_range = payload.get('date_range', '2023-01-01/2023-12-31')
                    max_cloud_cover = payload.get('max_cloud_cover', 20)
                    
                    results = QuerySentinel2(bbox, max_cloud_cover, date_range)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"results": results}).encode('utf-8'))
                except Exception as e:
                    logger.error(f"STAC Query API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/run_pipeline':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    logger.info("Received OOP Pipeline Execution Request from Canvas.")
                    
                    job_id = f"pid-{os.getpid()}-{int(time.time())}"
                    JOB_REGISTRY[job_id] = {
                        'id': job_id,
                        'name': 'MagPI Visual Model Execution',
                        'target': 'Local Python',
                        'status': 'Queued',
                        'progress': 10,
                        'cost': 'N/A',
                        'time': '0 min',
                        'started': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'logs': []
                    }
                    
                    bg_thread = threading.Thread(target=execute_pipeline_background, args=(job_id, payload))
                    bg_thread.start()
                    
                    response = {
                        "status": "queued",
                        "job_id": job_id
                    }
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                except Exception as e:
                    logger.error(f"OOP Pipeline Execution API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

            elif parsed_path.path == '/api/save_project':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    logger.info("Received Project Save Request.")
                    
                    project_name = payload.get('project_name', 'untitled')
                    project_data = payload.get('project_data', {})
                    
                    # Force .mpjx extension
                    if not project_name.endswith('.mpjx'):
                        project_name += '.mpjx'
                        
                    # Save to magpi_workspace/projects/
                    workspace_dir = os.path.join(os.getcwd(), 'magpi_workspace')
                    projects_dir = os.path.join(workspace_dir, 'projects')
                    os.makedirs(projects_dir, exist_ok=True)
                    
                    file_path = os.path.join(projects_dir, project_name)
                    with open(file_path, 'w') as f:
                        json.dump(project_data, f, indent=2)
                        
                    response = {"status": "success", "file": file_path}
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                except Exception as e:
                    logger.error(f"Project Save API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/query':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_query(payload)
                except Exception as e:
                    logger.error(f"Query API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/db_connections':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_db_connections_post(payload)
                except Exception as e:
                    logger.error(f"DB Connections POST API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_raster_metadata(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            
            try:
                import rasterio
                if not os.path.exists(target_file):
                    raise FileNotFoundError(f"File not found: {target_file}")
                
                with rasterio.open(target_file) as src:
                    bands = src.count
                    crs = src.crs.to_string() if src.crs else "Unknown"
                    nodata = src.nodata
                    dtype = str(src.dtypes[0]) if len(src.dtypes) > 0 else "Unknown"
                    bounds = src.bounds
                    extent = [bounds.bottom, bounds.left, bounds.top, bounds.right]
                    rpc = src.tags(ns='RPC')
                    tags = src.tags()
                    descriptions = list(src.descriptions) if hasattr(src, 'descriptions') else []
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "bands": bands,
                        "crs": crs,
                        "nodata": nodata,
                        "dtype": dtype,
                        "extent": extent,
                        "rpc": rpc if rpc else None,
                        "tags": tags,
                        "descriptions": descriptions
                    }).encode('utf-8'))
                    
            except Exception as e:
                import traceback
                with open('/home/gda/MagPI/error.txt', 'w') as f:
                    f.write(traceback.format_exc())
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_vector_metadata(self, query):
            try:
                params = parse_qs(query)
                file_path = params.get('file', [''])[0]
                layer_name = params.get('layer', [''])[0]

                if not file_path:
                    raise ValueError("Missing file parameter")

                import fiona
                
                if file_path.startswith('~/'):
                    file_path = os.path.expanduser(file_path)

                kwargs = {}
                if layer_name:
                    kwargs['layer'] = layer_name

                with fiona.open(file_path, 'r', **kwargs) as src:
                    crs = 'N/A'
                    if hasattr(src, 'crs') and src.crs:
                        crs_val = src.crs
                        if hasattr(crs_val, 'to_epsg') and crs_val.to_epsg():
                            crs = f"EPSG:{crs_val.to_epsg()}"
                        elif isinstance(crs_val, dict) and 'init' in crs_val:
                            crs = str(crs_val['init']).upper()
                        else:
                            crs_str = crs_val.to_string() if hasattr(crs_val, 'to_string') else str(crs_val)
                            import re
                            epsg_match = re.search(r'AUTHORITY\["EPSG",\s*"(\d+)"\]', crs_str)
                            if epsg_match:
                                crs = f"EPSG:{epsg_match.group(1)}"
                            else:
                                crs = crs_str[:25] + "..." if len(crs_str) > 25 else crs_str
                    extent = list(src.bounds) if hasattr(src, 'bounds') and src.bounds else None
                    geom_type = src.schema.get('geometry', 'Unknown') if hasattr(src, 'schema') else 'Unknown'
                    
                    attributes = []
                    if hasattr(src, 'schema') and 'properties' in src.schema:
                        for prop_name, prop_type in src.schema.get('properties', {}).items():
                            attributes.append({"name": prop_name, "type": prop_type})
                            
                    feature_count = len(src)

                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "crs": crs,
                        "extent": extent,
                        "geometry": geom_type,
                        "feature_count": feature_count,
                        "attributes": attributes
                    }).encode('utf-8'))

            except Exception as e:
                import traceback
                with open("/tmp/magpi_vector_meta_err.txt", "w") as f:
                    f.write(traceback.format_exc())
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_load_project(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            
            try:
                if not os.path.exists(target_file):
                    raise FileNotFoundError(f"Project file not found: {target_file}")
                    
                with open(target_file, 'r') as f:
                    project_data = json.load(f)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "project_data": project_data}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Load Project API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_geojson(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            
            try:
                import geopandas as gpd
                logger.info(f"API Request: Streaming GeoJSON for {target_file}")
                
                if not os.path.exists(target_file):
                    raise FileNotFoundError(f"File not found: {target_file}")
                    
                gdf = gpd.read_file(target_file)
                if gdf.crs and not gdf.crs.is_geographic:
                    gdf = gdf.to_crs("EPSG:4326")
                    
                geojson_str = gdf.to_json()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(geojson_str.encode('utf-8'))
            except Exception as e:
                logger.error(f"GeoJSON API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_raster(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            cmap_name = qs.get('cmap', ['viridis'])[0]
            
            try:
                import rasterio
                import numpy as np
                import matplotlib.pyplot as plt
                import io
                import base64
                from rasterio.warp import calculate_default_transform, reproject, Resampling

                if not os.path.exists(target_file):
                    raise FileNotFoundError(f"File not found: {target_file}")
                    
                with rasterio.open(target_file) as src:
                    # Calculate transform to WGS84
                    dst_crs = 'EPSG:4326'
                    transform, width, height = calculate_default_transform(
                        src.crs, dst_crs, src.width, src.height, *src.bounds)
                        
                    # Limit size for preview
                    max_dim = 1024
                    if width > max_dim or height > max_dim:
                        scale = min(max_dim/width, max_dim/height)
                        width = int(width * scale)
                        height = int(height * scale)
                        transform, _, _ = calculate_default_transform(
                            src.crs, dst_crs, width, height, *src.bounds)

                    dst_array = np.zeros((src.count, height, width), dtype=np.float32)

                    reproject(
                        source=rasterio.band(src, list(range(1, src.count + 1))),
                        destination=dst_array,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=dst_crs,
                        resampling=Resampling.nearest)
                    
                    from rasterio.transform import array_bounds
                    bounds = array_bounds(height, width, transform)
                    wgs84_bounds = [[bounds[1], bounds[0]], [bounds[3], bounds[2]]] # [[ymin, xmin], [ymax, xmax]]

                    if src.count == 1:
                        data = dst_array[0]
                        nodata = src.nodatavals[0] if src.nodatavals else None
                        if nodata is not None:
                            mask = (data != nodata) & (~np.isnan(data))
                        else:
                            mask = ~np.isnan(data)
                            
                        valid_data = data[mask]
                        if len(valid_data) > 0:
                            vmin, vmax = np.percentile(valid_data, 2), np.percentile(valid_data, 98)
                            data = np.clip(data, vmin, vmax)
                            data = (data - vmin) / (vmax - vmin + 1e-6)
                        else:
                            data = np.zeros_like(data)
                            
                        try:
                            cmap = plt.get_cmap(cmap_name)
                        except:
                            cmap = plt.get_cmap('viridis')
                            
                        colored = cmap(data)
                        colored[~mask, 3] = 0 # Transparent for nodata
                        img_data = (colored * 255).astype(np.uint8)
                    else:
                        img_data = np.zeros((height, width, 4), dtype=np.uint8)
                        global_mask = np.zeros((height, width), dtype=bool)
                        for i in range(min(3, src.count)):
                            d = dst_array[i]
                            nodata = src.nodatavals[i] if src.nodatavals else None
                            if nodata is not None:
                                mask = (d != nodata) & (~np.isnan(d))
                            else:
                                mask = ~np.isnan(d)
                            global_mask |= mask
                            valid = d[mask]
                            if len(valid) > 0:
                                vmin, vmax = np.percentile(valid, 2), np.percentile(valid, 98)
                                d = np.clip(d, vmin, vmax)
                                d = (d - vmin) / (vmax - vmin + 1e-6)
                            img_data[:,:,i] = (d * 255).astype(np.uint8)
                        img_data[:,:,3][global_mask] = 255 # Alpha channel
                    
                    from PIL import Image
                    img = Image.fromarray(img_data, 'RGBA')
                    buffered = io.BytesIO()
                    img.save(buffered, format="PNG")
                    img_str = base64.b64encode(buffered.getvalue()).decode()
                    
                response = {
                    "image": f"data:image/png;base64,{img_str}",
                    "bounds": wgs84_bounds
                }
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                logger.error(f"Raster API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_describe(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            
            try:
                import magpi as arcpy
                logger.info(f"API Request: Describing {target_file}")
                desc = arcpy.Describe(target_file)
                
                if desc.dataType == "Unknown":
                     raise ValueError("Unrecognized data type or file not found.")
                
                sr_name = "Unknown"
                if desc.spatialReference:
                    if hasattr(desc.spatialReference, 'name'):
                        sr_name = desc.spatialReference.name
                    elif hasattr(desc.spatialReference, 'to_string'):
                        sr_name = str(desc.spatialReference.to_epsg() or "Custom CRS")
                    else:
                        sr_name = str(desc.spatialReference)

                response = {
                    "dataType": desc.dataType,
                    "shapeType": getattr(desc, 'shapeType', "N/A"),
                    "bandCount": getattr(desc, 'bandCount', 1),
                    "extent": str(desc.extent) if desc.extent else "Unknown",
                    "spatialReference": sr_name,
                    # NEW: Send the WGS84 Extent to the Web Map!
                    "wgs84_extent": getattr(desc, 'wgs84_extent', None)
                }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_browse(self, query):
            qs = parse_qs(query)
            target_dir = qs.get('dir', [os.getcwd()])[0]
            if target_dir == '~': target_dir = os.path.expanduser('~')
            try:
                target_dir = os.path.abspath(target_dir)
                items = os.listdir(target_dir)
                folders, files = [], []
                for item in items:
                    if item.startswith('.'): continue
                    full_path = os.path.join(target_dir, item)
                    if os.path.isdir(full_path): folders.append(item)
                    else: files.append(item)
                folders.sort()
                files.sort()
                response = { "current_dir": target_dir, "parent_dir": os.path.dirname(target_dir), "folders": folders, "files": files }
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def log_message(self, format, *args): pass 

        def handle_community_nodes(self):
            try:
                import magpi.engine.nodes.registry as registry
                workspace_dir = os.path.join(os.getcwd(), 'magpi_workspace')
                nodes = registry.load_community_nodes(workspace_dir)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "nodes": nodes}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Community Nodes API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_references(self):
            try:
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'academic_references.json')
                if os.path.exists(registry_path):
                    with open(registry_path, 'r') as f:
                        data = json.load(f)
                else:
                    data = {}
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "references": data}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Academic References API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_gis_servers(self):
            try:
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'gis_servers.json')
                if os.path.exists(registry_path):
                    with open(registry_path, 'r') as f:
                        data = json.load(f)
                else:
                    data = {"servers": []}
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "servers": data.get("servers", [])}).encode('utf-8'))
            except Exception as e:
                logger.error(f"GIS Servers API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_db_connections_get(self):
            try:
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'db_connections.json')
                if os.path.exists(registry_path):
                    with open(registry_path, 'r') as f:
                        data = json.load(f)
                else:
                    data = {"connections": []}
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "connections": data.get("connections", [])}).encode('utf-8'))
            except Exception as e:
                logger.error(f"DB Connections GET API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                
        def handle_db_connections_post(self, payload):
            try:
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'db_connections.json')
                if os.path.exists(registry_path):
                    with open(registry_path, 'r') as f:
                        data = json.load(f)
                else:
                    data = {"connections": []}
                
                # Verify payload has required fields
                if "name" not in payload or "connection_string" not in payload:
                    raise ValueError("Connection must have a name and connection_string.")
                    
                # Add to registry
                data["connections"].append(payload)
                
                with open(registry_path, 'w') as f:
                    json.dump(data, f, indent=2)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "connections": data["connections"]}).encode('utf-8'))
            except Exception as e:
                logger.error(f"DB Connections POST API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                
        def handle_list_layers(self, query):
            qs = parse_qs(query)
            file_path = qs.get('file_path', [''])[0]
            try:
                if not file_path or not os.path.exists(file_path):
                    raise FileNotFoundError("Valid file_path is required.")
                
                import fiona
                layers = fiona.listlayers(file_path)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "layers": layers}).encode('utf-8'))
            except Exception as e:
                logger.error(f"List Layers API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                
        def handle_list_files(self, query):
            # Recursively scans magpi_workspace and magpi_output for GIS files
            try:
                def build_tree(dir_path):
                    tree = []
                    try:
                        for entry in os.scandir(dir_path):
                            # Skip hidden directories like .git
                            if entry.name.startswith('.'): continue
                            
                            if entry.is_dir():
                                # Treat .gdb as a file for our purposes, since it's a Geodatabase
                                if entry.name.endswith('.gdb'):
                                    tree.append({"name": entry.name, "path": entry.path, "type": "gdb", "is_dir": False})
                                else:
                                    children = build_tree(entry.path)
                                    if children or entry.path.endswith('magpi_workspace') or entry.path.endswith('magpi_output'):
                                        tree.append({"name": entry.name, "path": entry.path, "type": "folder", "is_dir": True, "children": children})
                            else:
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in ['.shp', '.geojson', '.gpkg', '.sqlite', '.db', '.tif', '.tiff', '.vrt', '.img', '.nc']:
                                    tree.append({"name": entry.name, "path": entry.path, "type": ext.replace('.', ''), "is_dir": False})
                    except PermissionError:
                        pass
                    return sorted(tree, key=lambda x: (not x.get('is_dir', False), x['name']))

                base_dir = os.getcwd()
                
                workspace_path = os.path.join(base_dir, 'magpi_workspace')
                output_path = os.path.join(base_dir, 'magpi_output')
                test_data_path = os.path.join(base_dir, 'test_data')
                
                catalog = []
                if os.path.exists(workspace_path):
                    catalog.append({"name": "magpi_workspace", "path": workspace_path, "type": "folder", "is_dir": True, "children": build_tree(workspace_path)})
                if os.path.exists(output_path):
                    catalog.append({"name": "magpi_output", "path": output_path, "type": "folder", "is_dir": True, "children": build_tree(output_path)})
                if os.path.exists(test_data_path):
                    catalog.append({"name": "test_data", "path": test_data_path, "type": "folder", "is_dir": True, "children": build_tree(test_data_path)})

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "catalog": catalog}).encode('utf-8'))
            except Exception as e:
                logger.error(f"List Files API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_databases(self):
            try:
                import fiona
                output_dir = os.environ.get('MAGPI_OUTPUT', os.path.join(os.getcwd(), 'magpi_output'))
                databases = []
                
                # 1. Local Files
                if os.path.exists(output_dir):
                    for f in os.listdir(output_dir):
                        path = os.path.join(output_dir, f)
                        if f.endswith('.sqlite') or f.endswith('.db') or f.endswith('.gpkg') or f.endswith('.gdb'):
                            try:
                                layers = fiona.listlayers(path)
                                databases.append({
                                    "name": f,
                                    "path": path,
                                    "type": "gdb" if f.endswith(".gdb") else ("gpkg" if f.endswith(".gpkg") else "sqlite"),
                                    "layers": layers
                                })
                            except Exception as e:
                                logger.warning(f"Failed to list layers for {f}: {e}")
                                
                # 2. Remote PostGIS Connections
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'db_connections.json')
                if os.path.exists(registry_path):
                    try:
                        with open(registry_path, 'r') as f:
                            remote_conns = json.load(f).get("connections", [])
                        import sqlalchemy
                        for conn in remote_conns:
                            db_entry = {
                                "name": conn["name"],
                                "path": conn["connection_string"],
                                "type": "postgis",
                                "layers": []
                            }
                            try:
                                engine = sqlalchemy.create_engine(conn["connection_string"])
                                inspector = sqlalchemy.inspect(engine)
                                db_entry["layers"] = inspector.get_table_names()
                            except Exception as inner_e:
                                logger.warning(f"Failed to introspect PostGIS {conn['name']}: {inner_e}")
                                db_entry["error"] = str(inner_e)
                            databases.append(db_entry)
                    except Exception as e:
                        logger.warning(f"Failed to load remote DB connections: {e}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "databases": databases}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Databases API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_query(self, payload):
            try:
                import sqlite3
                import pandas as pd
                import geopandas as gpd
                
                db_path = payload.get('db_path')
                query = payload.get('query')
                
                if not db_path or not query:
                    raise ValueError("Both db_path and query must be provided.")
                
                if db_path.startswith('postgresql://'):
                    import sqlalchemy
                    engine = sqlalchemy.create_engine(db_path)
                    df = pd.read_sql_query(query, engine)
                elif not os.path.exists(db_path):
                    raise FileNotFoundError("Database not found.")
                elif db_path.endswith('.sqlite') or db_path.endswith('.db') or db_path.endswith('.gpkg'):
                    conn = sqlite3.connect(db_path)
                    df = pd.read_sql_query(query, conn)
                    conn.close()
                elif db_path.endswith('.gdb'):
                    raise NotImplementedError("Direct SQL querying of .gdb is not supported yet. Use GeoPandas in Python.")
                else:
                    raise ValueError("Unsupported database type for direct SQL querying.")
                    
                # Truncate large strings or geometries for display
                for col in df.columns:
                    if df[col].dtype == object or str(df[col].dtype) == 'geometry':
                        df[col] = df[col].astype(str).str.slice(0, 100)
                
                results = df.to_dict(orient='records')
                columns = df.columns.tolist()
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "columns": columns, "results": results[:100]}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Query execution failed: {e}")
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    load_jobs()

    try:
        class ReusableTCPServer(socketserver.TCPServer):
            allow_reuse_address = True
        httpd = ReusableTCPServer(("", port), MagPIAPIHandler)
        thread = threading.Thread(target=httpd.serve_forever)
        thread.daemon = True
        thread.start()
        logger.info(f"MagPI Daemon API active on http://localhost:{port}")
        print("\n" + "="*50)
        print(f"🧭 MagPI Daemon API & Canvas Server is running!")
        print(f"📡 API Port: {port}")
        print("🛑 Press [Ctrl+C] to shut down the server.")
        print("="*50 + "\n")
        while True: time.sleep(1)
    except OSError:
        logger.warning(f"Port {port} is busy. Attempting to terminate existing process...")
        try:
            pid_bytes = subprocess.check_output(f"lsof -t -i:{port}", shell=True)
            pid = pid_bytes.decode('utf-8').strip()
            if pid:
                logger.info(f"Killing zombie process {pid} on port {port}...")
                os.kill(int(pid), 9)
                time.sleep(1)
                LaunchCanvas(port)
        except Exception as e:
            logger.error(f"Failed to kill process on port {port}: {e}")
    except KeyboardInterrupt:
        print("\n")
        logger.info("Shutting down MagPI Daemon API...")
        httpd.shutdown()
        logger.info("Daemon Offline.")