import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from telegram_log import cambodia_now, send_telegram_message


class StorefrontHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.send_error(404)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/log":
            self.send_error(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                raise ValueError("request is too large")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            event = str(payload.get("event", "unknown"))[:80]
            product = str(payload.get("product", "unknown product"))[:200]
            price = str(payload.get("price", "Not specified"))[:80]
            message = (
                "MengHeng Productions\n"
                f"Event: {event}\n"
                f"Product: {product}\n"
                f"Price: {price}\n"
                f"Time: {cambodia_now().strftime('%Y-%m-%d %H:%M:%S ICT')}"
            )
            sent = send_telegram_message(message)
            response = {"ok": sent}
            status = 200 if sent else 502
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            response = {"ok": False, "error": str(exc)}
            status = 400

        body = json.dumps(response).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    host = os.getenv("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), StorefrontHandler)
    print(f"Storefront running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStorefront stopped.")
    finally:
        server.server_close()
