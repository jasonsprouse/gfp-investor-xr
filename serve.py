import http.server
import socketserver
import socket
import os
import sys
import mimetypes
import urllib.parse

PORT = int(os.environ.get("PORT", 8080))
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
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
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
        return super().guess_type(clean_path)

    def end_headers(self):
        # Enable CORS, WebXR, and video streaming headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-ID, X-Payment-Token')
        self.send_header('Access-Control-Expose-Headers', 'WWW-Authenticate, Payment-Required, X-Payment-Token')
        super().end_headers()

    def _is_api_request(self):
        clean = self.path.split('?')[0].split('#')[0]
        return clean.startswith('/api/') or clean == '/api'

    def _is_dotfile_path(self):
        raw_clean = self.path.split('?')[0].split('#')[0]
        unquoted = urllib.parse.unquote(raw_clean)
        for target in (raw_clean, unquoted):
            if '\\' in target or '..' in target:
                return True
            parts = target.replace('\\', '/').split('/')
            for part in parts:
                if part.startswith('.') and part != '':
                    return True
        return False

    def do_OPTIONS(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        else:
            self.send_response(204)
            self.end_headers()

    def do_GET(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        elif self._is_dotfile_path():
            self.send_error(404, "File not found")
        else:
            super().do_GET()

    def do_HEAD(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        elif self._is_dotfile_path():
            self.send_error(404, "File not found")
        else:
            super().do_HEAD()

    def do_POST(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        else:
            self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self._is_api_request():
            import backend.api_handler
            backend.api_handler.handle_request(self)
        else:
            self.send_error(405, "Method Not Allowed")

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
