# magpi/ui.py
import http.server
import socketserver
import webbrowser
import os
import threading
import logging
import time

logger = logging.getLogger("MagPI_UI")

def LaunchCanvas(port=8080):
    """
    Spins up a lightweight, local HTTP server to host the MagPI Node Builder UI.
    Automatically opens the user's default web browser to the Canvas.
    """
    # Find the absolute path to the magpi/gui directory
    module_dir = os.path.dirname(os.path.abspath(__file__))
    gui_dir = os.path.join(module_dir, 'gui')
    
    if not os.path.exists(gui_dir):
        logger.error(f"GUI directory not found at {gui_dir}. Please create it and add index.html.")
        return

    # Create a quiet handler so we don't spam the terminal with HTTP GET requests
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=gui_dir, **kwargs)
        def log_message(self, format, *args):
            pass # Shush the logs

    try:
        httpd = socketserver.TCPServer(("", port), QuietHandler)
        
        # Run the server in a separate background thread
        thread = threading.Thread(target=httpd.serve_forever)
        thread.daemon = True
        thread.start()
        
        url = f"http://localhost:{port}"
        logger.info(f"MagPI Canvas Server active on {url}")
        
        # Open the user's web browser automatically
        webbrowser.open(url)
        
        print("\n" + "="*50)
        print(f"🧭 MagPI Visual Node Editor is running!")
        print(f"🌐 View at: {url}")
        print("🛑 Press [Ctrl+C] to shut down the server.")
        print("="*50 + "\n")
        
        # Keep the main thread alive until the user kills it
        while True:
            time.sleep(1)
            
    except OSError as e:
        logger.error(f"Port {port} is busy. Try another port.")
    except KeyboardInterrupt:
        print("\n")
        logger.info("Shutting down MagPI Canvas Server...")
        httpd.shutdown()
        logger.info("Server Offline.")