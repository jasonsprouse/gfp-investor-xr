import http.server
import socketserver
import socket
import os
import sys
import mimetypes

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Fix Windows Registry bug where .js is incorrectly registered as text/plain
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('text/html', '.html')
mimetypes.add_type('image/x-icon', '.ico')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('video/mp4', '.mp4')
mimetypes.add_type('video/webm', '.webm')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '': 'application/octet-stream',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def guess_type(self, path):
        # Force strict MIME type for JavaScript and Video files
        clean_path = path.split('?')[0].split('#')[0]
        if clean_path.endswith('.js') or clean_path.endswith('.mjs'):
            return 'application/javascript'
        if clean_path.endswith('.mp4'):
            return 'video/mp4'
        if clean_path.endswith('.webm'):
            return 'video/webm'
        if clean_path.endswith('.css'):
            return 'text/css'
        if clean_path.endswith('.ico'):
            return 'image/x-icon'
        return super().guess_type(path)

    def end_headers(self):
        # Enable CORS, WebXR, and video streaming headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    local_ip = get_local_ip()
    
    print("=" * 60)
    print("  GOOD FAITH PARADIGM - MULTI-THREADED VR/XR SERVER")
    print("=" * 60)
    print(f"  Local PC Browser : http://localhost:{PORT}")
    print(f"  VR Headset / LAN : http://{local_ip}:{PORT}")
    print(f"  JavaScript MIME  : {mimetypes.guess_type('main.js')[0]}")
    print("=" * 60)

    server = ThreadedHTTPServer(("", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        server.shutdown()
        sys.exit(0)
