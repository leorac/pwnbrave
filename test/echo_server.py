#!/usr/bin/env python3
import sys
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8910

PAGE = b"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>PwnBrave echo</title></head>
<body style="font:14px system-ui;background:#1b1d21;color:#eee">
<h3>PwnBrave echo</h3>
<p>Watch the terminal: one line per request, with the injected color.</p>
<img src="/img" width="1" height="1">
<iframe src="/frame" width="200" height="40" style="border:1px solid #444"></iframe>
<script src="/app.js"></script>
</body></html>"""


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        color = self.headers.get("X-PwnFox-Color", "<NONE>")
        via = "proxy " if self.path.startswith("http://") else "direct"
        path = urlsplit(self.path).path or "/"
        print("%s host=%-16s path=%-12s dest=%-10s X-PwnFox-Color=%-10s Cookie=%s"
              % (via, self.headers.get("Host", "-"), path, self.headers.get("Sec-Fetch-Dest", "-"),
                 color, self.headers.get("Cookie", "-")), flush=True)

        if path.startswith("/p"):
            body, ctype = PAGE, "text/html; charset=utf-8"
        elif path == "/frame":
            body, ctype = b"<body style='font:12px system-ui'>iframe</body>", "text/html; charset=utf-8"
        elif path == "/app.js":
            body, ctype = b"fetch('/xhr');", "text/javascript"
        else:
            body, ctype = b"ok", "text/plain"

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", "default-src 'self'")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    print(f"echo server on http://127.0.0.1:{PORT}/p", flush=True)
    Server(("127.0.0.1", PORT), Handler).serve_forever()
