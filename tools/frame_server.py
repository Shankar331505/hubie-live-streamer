"""Tiny local server: the rig page POSTs rendered frames here so ffmpeg can build preview videos."""
import http.server, os, sys, json
OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin','*'); self.send_header('Access-Control-Allow-Headers','*'); self.send_header('Access-Control-Allow-Methods','POST,OPTIONS')
    def do_OPTIONS(self): self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        n=int(self.headers.get('Content-Length',0)); body=self.rfile.read(n)
        if self.path.startswith('/frame'):
            i=int(self.path.split('i=')[1]); open(f'{OUT}/f{i:05d}.jpg','wb').write(body)
        elif self.path.startswith('/meta'):
            open(f'{OUT}/meta.json','wb').write(body)
        self.send_response(200); self._cors(); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8766),H).serve_forever()
