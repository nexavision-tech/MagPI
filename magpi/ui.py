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
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger("MagPI_UI")

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
                    import io
                    import logging
                    log_stream = io.StringIO()
                    log_handler = logging.StreamHandler(log_stream)
                    log_handler.setFormatter(logging.Formatter('[%(levelname)s]: %(message)s'))
                    root_logger = logging.getLogger()
                    root_logger.addHandler(log_handler)
                    
                    payload = json.loads(post_data.decode('utf-8'))
                    logger.info("Received OOP Pipeline Execution Request from Canvas.")
                    
                    from magpi.engine import PipelineRunner
                    runner = PipelineRunner()
                    runner.load_from_json(payload)
                    success = runner.run()
                    
                    root_logger.removeHandler(log_handler)
                    captured_logs = log_stream.getvalue()
                    
                    response = {
                        "status": "success" if success else "error",
                        "logs": captured_logs
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

    try:
        httpd = socketserver.TCPServer(("", port), MagPIAPIHandler)
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
        logger.error(f"Port {port} is busy. Try another port.")
    except KeyboardInterrupt:
        print("\n")
        logger.info("Shutting down MagPI Daemon API...")
        httpd.shutdown()
        logger.info("Daemon Offline.")