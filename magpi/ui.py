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