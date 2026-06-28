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
        
        def progress_callback(node_id, status, current_idx, total_nodes, **kwargs):
            JOB_REGISTRY[job_id]['progress'] = int((current_idx / max(1, total_nodes)) * 100)
            JOB_REGISTRY[job_id]['node_status'][node_id] = status
            
            derived = kwargs.get('derived', [])
            if derived:
                if 'derived_outputs' not in JOB_REGISTRY[job_id]:
                    JOB_REGISTRY[job_id]['derived_outputs'] = []
                for d in derived:
                    JOB_REGISTRY[job_id]['derived_outputs'].append({'node_id': node_id, 'path': d})
                    
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

def LaunchCanvas(port=8282):
    module_dir = os.path.dirname(os.path.abspath(__file__))
    gui_dir = os.path.join(module_dir, 'gui', 'dist')
    
    if not os.path.exists(gui_dir):
        logger.warning(f"GUI dir not found at {gui_dir}. Serving API only.")

    class MagPIAPIHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            # Hardcode MIME types to bypass broken OS registries and prevent Vite module loading errors
            if not hasattr(self, 'extensions_map'):
                self.extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
            self.extensions_map.update({
                '.js': 'application/javascript',
                '.jsx': 'application/javascript',
                '.mjs': 'application/javascript',
                '.css': 'text/css',
                '.html': 'text/html',
                '.svg': 'image/svg+xml'
            })
            
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
            elif parsed_path.path == '/api/fishnet':
                self.handle_fishnet(parsed_path.query)
            elif parsed_path.path == '/api/vector_image':
                self.handle_vector_image(parsed_path.query)
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
            elif parsed_path.path == '/api/profiles':
                self.handle_profiles_get()
            elif parsed_path.path == '/api/list_files':
                self.handle_list_files(parsed_path.query)
            elif parsed_path.path == '/api/db_tables':
                self.handle_db_tables(parsed_path.query)
            elif parsed_path.path == '/api/list_layers':
                self.handle_list_layers(parsed_path.query)
            elif parsed_path.path == '/api/vector_data':
                self.handle_vector_data(parsed_path.query)
            elif parsed_path.path == '/api/create_folder':
                self.handle_create_folder(parsed_path.query)
            elif parsed_path.path == '/api/delete_file':
                self.handle_delete_file(parsed_path.query)
            elif parsed_path.path == '/api/relaunch':
                self.handle_relaunch(parsed_path.query)
            elif parsed_path.path.startswith('/api/'):
                self.send_response(404)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error": "Endpoint not found"}')
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
                    
                    bbox = payload.get('bbox', [-180, -90, 180, 90])
                    date_range = payload.get('date_range', '2023-01-01/2023-12-31')
                    sensor = payload.get('sensor', 'wfs_sentinel2')
                    
                    if sensor == 'wfs_sentinel1':
                        from magpi.wfs import QuerySentinel1
                        res_obj = QuerySentinel1(bbox, date_range)
                    else:
                        from magpi.wfs import QuerySentinel2
                        max_cloud_cover = payload.get('max_cloud_cover', 20)
                        res_obj = QuerySentinel2(bbox, max_cloud_cover, date_range)
                        
                    if isinstance(res_obj, dict) and ("results" in res_obj or "features" in res_obj):
                        payload = res_obj
                    else:
                        payload = {"results": res_obj}
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(payload).encode('utf-8'))
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
                        
                    # Save to save_dir or magpi_workspace/
                    save_dir = payload.get('save_dir')
                    if not save_dir:
                        workspace_dir = os.path.join(os.getcwd(), 'magpi_workspace')
                        save_dir = workspace_dir
                    
                    os.makedirs(save_dir, exist_ok=True)
                    file_path = os.path.join(save_dir, project_name)
                    
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
                    
            elif parsed_path.path == '/api/profiles':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_profiles_post(payload)
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/save_geojson':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_save_geojson(payload)
                except Exception as e:
                    logger.error(f"Save GeoJSON API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/spatial_modify':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_spatial_modify(payload)
                except Exception as e:
                    logger.error(f"Spatial Modify API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/vector_formula':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_vector_formula(payload)
                except Exception as e:
                    logger.error(f"Vector Formula API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                    
            elif parsed_path.path == '/api/vector_edit':
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                try:
                    payload = json.loads(post_data.decode('utf-8'))
                    self.handle_vector_edit(payload)
                except Exception as e:
                    logger.error(f"Vector Edit API failed: {e}")
                    self.send_response(500)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_vector_edit(self, payload):
            try:
                import geopandas as gpd
                file_path = payload.get('file_path')
                layer_name = payload.get('layer_name')
                edits = payload.get('edits') # Format: { row_index: { col_name: new_val } }
                
                if not file_path or not edits:
                    raise ValueError("file_path and edits are required")
                    
                kwargs = {}
                if layer_name:
                    kwargs['layer'] = layer_name
                    
                gdf = gpd.read_file(file_path, **kwargs)
                
                for r_idx, col_edits in edits.items():
                    r_idx = int(r_idx)
                    for col, val in col_edits.items():
                        if col in gdf.columns:
                            gdf.at[r_idx, col] = val
                            
                gdf.to_file(file_path, **kwargs)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": f"Updated {len(edits)} rows"}).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"Vector Edit execution failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                
        def handle_vector_formula(self, payload):
            try:
                import geopandas as gpd
                file_path = payload.get('file_path')
                layer_name = payload.get('layer_name')
                new_col = payload.get('new_column')
                formula = payload.get('formula')
                
                if not file_path or not new_col or not formula:
                    raise ValueError("file_path, new_column, and formula are required")
                    
                kwargs = {}
                if layer_name:
                    kwargs['layer'] = layer_name
                    
                gdf = gpd.read_file(file_path, **kwargs)
                
                # Formula support using eval. This is local so risk is minimal, but we provide local context
                # Formula format: e.g. "['Area'] * 10" or "['col1'] + ['col2']"
                import re
                # Convert "['ColName']" to "gdf['ColName']"
                processed_formula = re.sub(r'\[([^\]]+)\]', r'gdf[\1]', formula)
                
                gdf[new_col] = eval(processed_formula)
                            
                gdf.to_file(file_path, **kwargs)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": f"Added column {new_col}"}).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"Vector Formula execution failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_profiles_get(self):
            try:
                profiles_path = os.path.join(os.getcwd(), 'magpi_workspace', 'profiles.json')
                current_profile_path = os.path.join(os.getcwd(), 'magpi_workspace', 'current_profile.txt')
                
                profiles = []
                if os.path.exists(profiles_path):
                    with open(profiles_path, 'r') as f:
                        profiles = json.load(f)
                else:
                    profiles = [
                        {"id": "test_user1", "name": "Analyst (test_user1)", "role": "analyst"},
                        {"id": "test_user2", "name": "Analyst (test_user2)", "role": "analyst"},
                        {"id": "gda", "name": "System Admin (GDA)", "role": "admin"}
                    ]
                    os.makedirs(os.path.dirname(profiles_path), exist_ok=True)
                    with open(profiles_path, 'w') as f:
                        json.dump(profiles, f, indent=2)
                        
                current_profile_id = "test_user1"
                if os.path.exists(current_profile_path):
                    with open(current_profile_path, 'r') as f:
                        current_profile_id = f.read().strip()
                        
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "profiles": profiles,
                    "current_profile_id": current_profile_id
                }).encode('utf-8'))
            except Exception as e:
                logger.error(f"Profiles GET failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_profiles_post(self, payload):
            try:
                current_profile_path = os.path.join(os.getcwd(), 'magpi_workspace', 'current_profile.txt')
                profile_id = payload.get('profile_id')
                if not profile_id:
                    raise ValueError("Missing profile_id")
                
                os.makedirs(os.path.dirname(current_profile_path), exist_ok=True)
                with open(current_profile_path, 'w') as f:
                    f.write(profile_id)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "profile_id": profile_id}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_save_geojson(self, payload):
            try:
                import geopandas as gpd
                import json
                import shutil
                from shapely.geometry import shape
                
                file_path = payload.get('file_path')
                features = payload.get('features', [])
                bbox_str = payload.get('bbox')  # Optional: scope edits to a spatial region
                
                if not file_path:
                    raise ValueError("Missing file_path in payload")
                
                if not features:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "message": "No features to save."}).encode('utf-8'))
                    return
                    
                import os
                
                # Create backup before modifying
                if os.path.exists(file_path):
                    backup_path = file_path + '.bak'
                    try:
                        if file_path.endswith('.shp'):
                            # For shapefiles, backup all associated files
                            base = file_path[:-4]
                            for ext in ['.shp', '.shx', '.dbf', '.prj', '.cpg']:
                                src = base + ext
                                if os.path.exists(src):
                                    shutil.copy2(src, src + '.bak')
                        else:
                            shutil.copy2(file_path, backup_path)
                        logger.info(f"Backup created: {backup_path}")
                    except Exception as be:
                        logger.warning(f"Could not create backup: {be}")
                
                    # Read existing data
                    try:
                        existing_gdf = gpd.read_file(file_path)
                        if existing_gdf.crs is None:
                            existing_gdf.set_crs(epsg=4326, inplace=True)
                    except Exception as re:
                        logger.warning(f"Could not read existing file for merge: {re}")
                        existing_gdf = None
                else:
                    existing_gdf = None
                
                # Build GeoDataFrame from incoming edited features
                feature_collection = {
                    "type": "FeatureCollection",
                    "features": features
                }
                edited_gdf = gpd.GeoDataFrame.from_features(feature_collection)
                if edited_gdf.crs is None:
                    edited_gdf.set_crs(epsg=4326, inplace=True)
                
                if existing_gdf is not None and len(existing_gdf) > 0:
                    # MERGE strategy: replace features within the bbox, keep everything else
                    if bbox_str:
                        parts = [float(x) for x in bbox_str.split(',')]
                        xmin, ymin, xmax, ymax = parts
                        # Expand bbox slightly to catch boundary features
                        eps = 0.0001
                        from shapely.geometry import box
                        import pandas as pd
                        edit_box = box(xmin - eps, ymin - eps, xmax + eps, ymax + eps)
                        
                        # Keep features OUTSIDE the edit bbox from original file
                        outside_mask = ~existing_gdf.geometry.intersects(edit_box)
                        kept_gdf = existing_gdf[outside_mask].copy()
                        
                        # Combine: original features outside bbox + edited features
                        merged_gdf = gpd.GeoDataFrame(
                            pd.concat([kept_gdf, edited_gdf], ignore_index=True),
                            crs=existing_gdf.crs
                        )
                    else:
                        # No bbox scope: try to match by properties and update geometries
                        # Build a lookup from existing features
                        import pandas as pd
                        
                        # Use property-based matching
                        existing_props = existing_gdf.drop(columns='geometry').to_dict('records')
                        edited_props = edited_gdf.drop(columns='geometry').to_dict('records')
                        
                        # Track which existing rows were updated
                        updated_indices = set()
                        new_features = []
                        
                        for i, edited_row in edited_gdf.iterrows():
                            e_props = {k: v for k, v in edited_row.items() if k != 'geometry'}
                            matched = False
                            for j, exist_row in existing_gdf.iterrows():
                                if j in updated_indices:
                                    continue
                                ex_props = {k: v for k, v in exist_row.items() if k != 'geometry'}
                                if e_props == ex_props:
                                    # Found match — update geometry
                                    existing_gdf.at[j, 'geometry'] = edited_row.geometry
                                    updated_indices.add(j)
                                    matched = True
                                    break
                            if not matched:
                                new_features.append(edited_row)
                        
                        if new_features:
                            new_gdf = gpd.GeoDataFrame(new_features, crs=existing_gdf.crs)
                            merged_gdf = gpd.GeoDataFrame(
                                pd.concat([existing_gdf, new_gdf], ignore_index=True),
                                crs=existing_gdf.crs
                            )
                        else:
                            merged_gdf = existing_gdf
                    
                    logger.info(f"Merge save: {len(existing_gdf)} existing + {len(edited_gdf)} edited = {len(merged_gdf)} total")
                else:
                    # No existing file — just save the edited features
                    merged_gdf = edited_gdf
                
                # Save merged result
                if file_path.endswith('.geojson'):
                    merged_gdf.to_file(file_path, driver='GeoJSON')
                elif file_path.endswith('.shp'):
                    merged_gdf.to_file(file_path, driver='ESRI Shapefile')
                elif file_path.endswith('.gpkg'):
                    merged_gdf.to_file(file_path, driver='GPKG')
                else:
                    merged_gdf.to_file(file_path)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": f"Merged {len(edited_gdf)} edited features into {len(merged_gdf)} total in {file_path}"}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Save GeoJSON failed: {e}")
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_spatial_modify(self, payload):
            try:
                import geopandas as gpd
                import json
                
                action = payload.get('action')
                features = payload.get('features', [])
                
                if not features:
                    raise ValueError("No features provided for spatial modification.")
                    
                feature_collection = {
                    "type": "FeatureCollection",
                    "features": features
                }
                
                gdf = gpd.GeoDataFrame.from_features(feature_collection)
                
                if action == 'merge':
                    if len(gdf) < 2:
                        raise ValueError("Need at least 2 features to merge.")
                    merged_geom = gdf.geometry.unary_union
                    merged_feature = gdf.iloc[[0]].copy()
                    merged_feature.geometry = [merged_geom]
                    result_geojson = json.loads(merged_feature.to_json())
                    
                elif action == 'split':
                    exploded = gdf.explode(index_parts=True).reset_index(drop=True)
                    result_geojson = json.loads(exploded.to_json())
                elif action == 'snap':
                    reference_features = payload.get('reference_features', [])
                    tolerance = payload.get('tolerance', 0.001)
                    if not reference_features:
                        raise ValueError("No reference features provided to snap to.")
                    
                    ref_collection = {
                        "type": "FeatureCollection",
                        "features": reference_features
                    }
                    ref_gdf = gpd.GeoDataFrame.from_features(ref_collection)
                    ref_union = ref_gdf.geometry.unary_union
                    
                    from shapely.ops import snap
                    # Snap the selected features to the combined geometry of the reference features
                    gdf.geometry = gdf.geometry.apply(lambda geom: snap(geom, ref_union, tolerance))
                    result_geojson = json.loads(gdf.to_json())
                else:
                    raise ValueError(f"Unknown action: {action}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "result": result_geojson}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Spatial Modify failed: {e}")
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

        def handle_vector_data(self, query):
            try:
                params = parse_qs(query)
                file_path = params.get('file', [''])[0]
                limit = int(params.get('limit', ['100'])[0])
                offset = int(params.get('offset', ['0'])[0])
                layer_name = params.get('layer_name', [''])[0]
                bbox_param = params.get('bbox', [''])[0]

                if not file_path:
                    raise ValueError("Missing file parameter")

                if file_path.startswith('~/'):
                    file_path = os.path.expanduser(file_path)

                import geopandas as gpd
                import pandas as pd
                import datetime
                
                def safe_serialize(obj):
                    if pd.isna(obj):
                        return None
                    if isinstance(obj, (datetime.datetime, datetime.date)):
                        return obj.isoformat()
                    return str(obj)
                
                # Reading the entire shapefile can be slow for 471k rows, 
                # but we'll read it and slice it for now. 
                # Future optimization: use fiona to slice directly or read in chunks.
                kwargs = {}
                if layer_name:
                    kwargs['layer'] = layer_name
                if bbox_param:
                    try:
                        coords = [float(x) for x in bbox_param.split(',')]
                        if len(coords) == 4:
                            kwargs['bbox'] = tuple(coords)
                    except ValueError:
                        pass
                
                if 'bbox' in kwargs:
                    gdf = gpd.read_file(file_path, **kwargs)
                    gdf = gdf.iloc[offset : offset + limit]
                else:
                    kwargs['rows'] = slice(offset, offset + limit)
                    gdf = gpd.read_file(file_path, **kwargs)
                
                # Convert geometry to WKT for display if it exists
                if 'geometry' in gdf.columns:
                    gdf['geometry'] = gdf['geometry'].apply(lambda x: x.wkt if x else None)
                    
                # Replace NaNs with None for JSON serialization
                gdf = gdf.replace({pd.NA: None, float('nan'): None})
                
                # Convert any datetime columns to string to prevent JSON serialization errors
                for col in gdf.select_dtypes(include=['datetime', 'datetimetz']).columns:
                    gdf[col] = gdf[col].astype(str)
                
                columns = list(gdf.columns)
                rows = gdf.to_dict(orient='records')
                
                response_body = json.dumps({
                    "columns": columns,
                    "rows": rows,
                    "count": len(rows),
                    "offset": offset,
                    "limit": limit
                }, default=safe_serialize).encode('utf-8')
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(response_body)

            except Exception as e:
                import traceback
                logger.error(f"Vector Data API failed: {e}")
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

        def handle_fishnet(self, query):
            try:
                from urllib.parse import parse_qs
                import json
                
                qs = parse_qs(query)
                bbox_str = qs.get('bbox', [''])[0]
                rows = int(qs.get('rows', ['10'])[0])
                cols = int(qs.get('cols', ['10'])[0])
                
                if not bbox_str:
                    raise ValueError("Missing bbox parameter")
                
                w, s, e, n = map(float, bbox_str.split(','))
                
                cell_w = (e - w) / cols
                cell_h = (n - s) / rows
                
                features = []
                for i in range(rows):
                    for j in range(cols):
                        cell_s = s + i * cell_h
                        cell_n = s + (i + 1) * cell_h
                        cell_w_lon = w + j * cell_w
                        cell_e_lon = w + (j + 1) * cell_w
                        
                        geom = {
                            "type": "Polygon",
                            "coordinates": [[
                                [cell_w_lon, cell_s],
                                [cell_e_lon, cell_s],
                                [cell_e_lon, cell_n],
                                [cell_w_lon, cell_n],
                                [cell_w_lon, cell_s]
                            ]]
                        }
                        
                        features.append({
                            "type": "Feature",
                            "geometry": geom,
                            "properties": {
                                "id": f"R{i}C{j}",
                                "row": i,
                                "col": j
                            }
                        })
                
                import os
                import time
                
                workspace = os.path.join(os.getcwd(), 'magpi_workspace')
                os.makedirs(workspace, exist_ok=True)
                
                fishnet_id = f"fishnet_{int(time.time())}"
                fishnet_path = os.path.join(workspace, f"{fishnet_id}.geojson")
                
                with open(fishnet_path, 'w') as f:
                    json.dump({"type": "FeatureCollection", "features": features}, f)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "file": fishnet_path}).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"Fishnet generation failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))


        def handle_vector_image(self, query):
            try:
                import geopandas as gpd
                import pandas as pd
                import io
                import pyogrio
                import os
                import geolibre_wasm as gl
                from shapely.geometry import Polygon
                
                params = parse_qs(query)
                file_path = params.get('file', [''])[0]
                layer_name = params.get('layer_name', [''])[0]
                bbox_str = params.get('bbox', [''])[0]
                color = params.get('color', ['#3388ff'])[0]
                
                if not file_path or not bbox_str:
                    raise ValueError("Missing file or bbox parameter")
                
                # Parse bbox: west, south, east, north
                w, s, e, n = map(float, bbox_str.split(','))
                bbox = (w, s, e, n)
                
                if file_path.startswith('~/'):
                    file_path = os.path.expanduser(file_path)
                
                kwargs = {}
                if layer_name:
                    kwargs['layer'] = layer_name
                
                # Fetch geometries within the bbox instantly using pyogrio spatial index
                gdf = pyogrio.read_dataframe(file_path, bbox=bbox, max_features=50000, **kwargs)
                
                if gdf.empty:
                    # Return empty transparent 1x1 PNG
                    self.send_response(200)
                    self.send_header('Content-type', 'image/png')
                    self.end_headers()
                    self.wfile.write(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0bIDAT\x08\x99c\xf8\x0f\x04\x00\x09\xfb\x03\xfd\xe3U\xf2\x9c\x00\x00\x00\x00IEND\xaeB`\x82')
                    return

                if gdf.crs and gdf.crs.to_epsg() != 4326:
                    gdf = gdf.to_crs(epsg=4326)

                # EXTENT TRICK: Add 4 microscopic polygons at the exact bounding box corners.
                # This forces GeoLibre's rendering canvas to match the exact dimensions of the
                # requested Leaflet map tile without distorting the interior buildings!
                epsilon = 1e-8
                bl = Polygon([(w, s), (w+epsilon, s), (w, s+epsilon)])
                br = Polygon([(e, s), (e-epsilon, s), (e, s+epsilon)])
                tl = Polygon([(w, n), (w+epsilon, n), (w, n-epsilon)])
                tr = Polygon([(e, n), (e-epsilon, n), (e, n-epsilon)])
                
                corner_gdf = gpd.GeoDataFrame(geometry=[bl, br, tl, tr], crs="EPSG:4326")
                # Ensure geometry column exists and matches
                if 'geometry' in gdf.columns:
                    # Drop other columns to make json export smaller and faster
                    gdf = gdf[['geometry']]
                
                gdf = gpd.GeoDataFrame(pd.concat([gdf, corner_gdf], ignore_index=True), crs="EPSG:4326")
                geojson_bytes = gdf.to_json().encode('utf-8')
                
                # Image dimensions based on precise aspect ratio
                aspect_ratio = (e - w) / (n - s) if (n - s) != 0 else 1
                out_w = 800
                out_h = int(out_w / aspect_ratio)
                
                # Process color for GeoLibre (#rrggbbaa)
                if len(color) == 7:
                    fill_color = color + "80" # 50% opacity
                    stroke_color = color + "ff"
                else:
                    fill_color = color
                    stroke_color = color

                # Run pure-Rust WASM vector renderer!
                res = gl.run_tool(
                    "render_vector_png",
                    args=[
                        "--input=/work/in.geojson",
                        "--output=/work/out.png",
                        f"--width={out_w}",
                        f"--height={out_h}",
                        f"--fill={fill_color}",
                        f"--stroke={stroke_color}",
                        "--stroke_width=1.0",
                        "--background=transparent"
                    ],
                    input={"in.geojson": geojson_bytes}
                )
                
                if res.exit_code != 0:
                    raise Exception(f"GeoLibre WASM failed: {res.stdout.decode('utf-8', errors='ignore')}")

                self.send_response(200)
                self.send_header('Content-type', 'image/png')
                self.end_headers()
                self.wfile.write(res.files['out.png'])
                
            except Exception as e:
                import traceback
                logger.error(f"GeoLibre vector image error: {traceback.format_exc()}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_geojson(self, query):
            qs = parse_qs(query)
            target_file = qs.get('file', [''])[0]
            layer_name = qs.get('layer_name', [''])[0]
            limit_str = qs.get('limit', ['10000'])[0]
            bbox_str = qs.get('bbox', [''])[0]
            try:
                limit = int(limit_str)
            except ValueError:
                limit = 10000
            
            try:
                import geopandas as gpd
                logger.info(f"API Request: Streaming GeoJSON for {target_file} (layer: {layer_name}, limit: {limit}, bbox: {bbox_str})")
                
                if not os.path.exists(target_file):
                    raise FileNotFoundError(f"File not found: {target_file}")
                    
                # Read file with a limit to prevent crashing on massive datasets
                kwargs = {'rows': limit, 'engine': 'pyogrio'}
                if layer_name:
                    kwargs['layer'] = layer_name
                
                if bbox_str:
                    try:
                        minx, miny, maxx, maxy = map(float, bbox_str.split(','))
                        bbox_tuple = (minx, miny, maxx, maxy)
                        
                        # Read file info to get CRS
                        import pyogrio
                        from shapely.geometry import box
                        
                        info_kwargs = {}
                        if layer_name:
                            info_kwargs['layer'] = layer_name
                        file_info = pyogrio.read_info(target_file, **info_kwargs)
                        file_crs = file_info.get('crs')
                        
                        if file_crs:
                            bbox_gdf = gpd.GeoDataFrame(geometry=[box(*bbox_tuple)], crs="EPSG:4326")
                            bbox_gdf = bbox_gdf.to_crs(file_crs)
                            kwargs['bbox'] = tuple(bbox_gdf.total_bounds)
                        else:
                            kwargs['bbox'] = bbox_tuple
                            
                    except Exception as bbox_err:
                        logger.warning(f"Failed to parse or reproject bbox: {bbox_err}")
                    
                gdf = gpd.read_file(target_file, **kwargs)
                if len(gdf) == limit:
                    logger.warning(f"GeoJSON preview limited to {limit} features for {target_file}")
                if gdf.crs and not gdf.crs.is_geographic:
                    gdf = gdf.to_crs("EPSG:4326")
                
                # Prevent hardware-accelerated Canvas/WebGL crashes (e.g. GNOME freezing) 
                # caused by corrupted shapefile vertices with Float Max coordinates.
                if not gdf.empty:
                    b = gdf.bounds
                    # WGS84 coordinates should be strictly within -180/180 and -90/90, 
                    # but we use 1000 as a very safe buffer for weird antimeridian wrapping
                    valid_mask = (b['minx'] >= -1000) & (b['maxx'] <= 1000) & \
                                 (b['miny'] >= -1000) & (b['maxy'] <= 1000)
                    invalid_count = (~valid_mask).sum()
                    if invalid_count > 0:
                        logger.warning(f"CRITICAL: Dropping {invalid_count} corrupted features with massive coordinates to prevent browser/GPU crashes.")
                        gdf = gdf[valid_mask]
                
                # Removed aggressive geometry simplification to stream pure vertices
                    
                # Convert any datetime columns to string to prevent JSON serialization errors
                for col in gdf.select_dtypes(include=['datetime', 'datetimetz']).columns:
                    gdf[col] = gdf[col].astype(str)
                    
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

                    dst_array = np.full((src.count, height, width), np.nan, dtype=np.float32)

                    reproject(
                        source=rasterio.band(src, list(range(1, src.count + 1))),
                        destination=dst_array,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=dst_crs,
                        dst_nodata=np.nan,
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
                    "extent": [desc.extent.XMin, desc.extent.YMin, desc.extent.XMax, desc.extent.YMax] if (desc.extent and hasattr(desc.extent, 'XMin')) else "Unknown",
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

        def handle_db_tables(self, query):
            qs = parse_qs(query)
            conn_name = qs.get('connection', [''])[0]
            
            try:
                registry_path = os.path.join(os.getcwd(), 'magpi_workspace', 'db_connections.json')
                if not os.path.exists(registry_path):
                    raise ValueError("No database connections found.")
                with open(registry_path, 'r') as f:
                    data = json.load(f)
                    
                conn_str = None
                for c in data.get("connections", []):
                    if c.get("name") == conn_name:
                        conn_str = c.get("connection_string")
                        break
                        
                if not conn_str:
                    raise ValueError(f"Connection {conn_name} not found.")
                
                # Use sqlalchemy to get tables
                from sqlalchemy import create_engine
                from sqlalchemy import inspect
                from magpi.db import fix_connection_string
                
                engine = create_engine(fix_connection_string(conn_str))
                inspector = inspect(engine)
                schemas = inspector.get_schema_names()
                
                tables_out = []
                for schema in schemas:
                    # Ignore internal schemas
                    if schema in ['information_schema', 'pg_catalog', 'pg_toast', 'topology']:
                        continue
                    try:
                        tables = inspector.get_table_names(schema=schema)
                    except:
                        tables = []
                    try:
                        views = inspector.get_view_names(schema=schema)
                    except:
                        views = []
                    
                    for t in tables:
                        tables_out.append({"schema": schema, "table": t, "type": "table"})
                    for v in views:
                        tables_out.append({"schema": schema, "table": v, "type": "view"})
                        
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"tables": tables_out}).encode('utf-8'))
                
            except Exception as e:
                logger.error(f"DB Tables API failed: {e}")
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
                                    tree.append({"name": entry.name, "path": entry.path, "type": "folder", "is_dir": True, "children": children})
                            else:
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in ['.shp', '.geojson', '.gpkg', '.sqlite', '.db', '.tif', '.tiff', '.vrt', '.img', '.nc']:
                                    tree.append({"name": entry.name, "path": entry.path, "type": ext.replace('.', ''), "is_dir": False})
                    except PermissionError:
                        pass
                    return sorted(tree, key=lambda x: (not x.get('is_dir', False), x['name']))

                from urllib.parse import parse_qs
                params = parse_qs(query)
                workspace_path = params.get('workspace', [os.path.join(os.getcwd(), 'magpi_workspace')])[0]
                output_path = params.get('output', [os.path.join(os.getcwd(), 'magpi_output')])[0]
                test_data_path = os.path.join(os.getcwd(), 'test_data')
                external_paths = params.get('external', [])
                
                catalog = []
                if os.path.exists(workspace_path):
                    catalog.append({"name": os.path.basename(workspace_path), "path": workspace_path, "type": "folder", "is_dir": True, "children": build_tree(workspace_path)})
                if os.path.exists(output_path):
                    catalog.append({"name": os.path.basename(output_path), "path": output_path, "type": "folder", "is_dir": True, "children": build_tree(output_path)})
                if os.path.exists(test_data_path):
                    catalog.append({"name": "test_data", "path": test_data_path, "type": "folder", "is_dir": True, "children": build_tree(test_data_path)})
                
                for ext_path in external_paths:
                    if os.path.exists(ext_path):
                        catalog.append({"name": os.path.basename(ext_path), "path": ext_path, "type": "folder", "is_dir": True, "children": build_tree(ext_path)})

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

        def handle_create_folder(self, query):
            try:
                from urllib.parse import parse_qs, unquote
                params = parse_qs(query)
                workspace = params.get('workspace', [''])[0]
                name = params.get('name', [''])[0]
                if not workspace or not name:
                    raise ValueError("Missing workspace or folder name")
                
                new_path = os.path.join(workspace, name)
                os.makedirs(new_path, exist_ok=True)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "path": new_path}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Create Folder API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_delete_file(self, query):
            try:
                from urllib.parse import parse_qs, unquote
                import shutil
                params = parse_qs(query)
                path = params.get('path', [''])[0]
                if not path or not os.path.exists(path):
                    raise ValueError("Invalid path")
                
                if os.path.isdir(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                logger.error(f"Delete File API failed: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

        def handle_relaunch(self, query):
            from urllib.parse import parse_qs
            import subprocess
            import sys
            import threading
            import time
            
            qs = parse_qs(query)
            new_port = int(qs.get('port', ['8282'])[0])
            
            logger.info(f"Relaunching Daemon on port {new_port}")
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "relaunching", "port": new_port}).encode('utf-8'))
            
            # Spawn a new daemon process
            subprocess.Popen([sys.executable, "-c", f"import magpi.ui; magpi.ui.LaunchCanvas(port={new_port})"])
            
            # Kill current process after a short delay
            def seppuku():
                time.sleep(1)
                os._exit(0)
            threading.Thread(target=seppuku).start()
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
                                from magpi.db import fix_connection_string
                                engine = sqlalchemy.create_engine(fix_connection_string(conn["connection_string"]))
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