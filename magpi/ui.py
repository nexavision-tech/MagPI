# magpi/ui.py
import http.server
import socketserver
import webbrowser
import os
import json
import threading
import logging
import time
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger("MagPI_UI")

def LaunchCanvas(port=8080):
    module_dir = os.path.dirname(os.path.abspath(__file__))
    gui_dir = os.path.join(module_dir, 'gui')
    
    # In dev mode, the user might be running Vite on 5173. 
    # This server will run on 8080 to provide the API backend.
    if not os.path.exists(gui_dir):
        logger.warning(f"GUI dir not found at {gui_dir}. Serving API only.")

    class MagPIAPIHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            if os.path.exists(gui_dir):
                super().__init__(*args, directory=gui_dir, **kwargs)
            else:
                super().__init__(*args, **kwargs)

        def end_headers(self):
            # Crucial: Allow your Vite dev server (localhost:5173) to talk to this Python API (localhost:8080)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            super().end_headers()

        def do_OPTIONS(self):
            self.send_response(200)
            self.end_headers()

        def do_GET(self):
            parsed_path = urlparse(self.path)
            
            # API ROUTE: The Native OS File Browser
            if parsed_path.path == '/api/browse':
                self.handle_browse(parsed_path.query)
            else:
                # Serve normal web files if available
                super().do_GET()

        def handle_browse(self, query):
            qs = parse_qs(query)
            # Default to the current working directory, or process a specific path
            target_dir = qs.get('dir', [os.getcwd()])[0]

            # Handle the Linux home directory shortcut
            if target_dir == '~':
                target_dir = os.path.expanduser('~')

            try:
                target_dir = os.path.abspath(target_dir)
                items = os.listdir(target_dir)
                
                folders = []
                files = []
                
                for item in items:
                    # Skip hidden files
                    if item.startswith('.'): continue
                    
                    full_path = os.path.join(target_dir, item)
                    if os.path.isdir(full_path):
                        folders.append(item)
                    else:
                        files.append(item)

                folders.sort()
                files.sort()

                response = {
                    "current_dir": target_dir,
                    "parent_dir": os.path.dirname(target_dir),
                    "folders": folders,
                    "files": files
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

        def log_message(self, format, *args):
            pass # Shush the standard HTTP logs so we don't spam the terminal

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
        
        while True:
            time.sleep(1)
            
    except OSError:
        logger.error(f"Port {port} is busy. Try another port.")
    except KeyboardInterrupt:
        print("\n")
        logger.info("Shutting down MagPI Daemon API...")
        httpd.shutdown()
        logger.info("Daemon Offline.")