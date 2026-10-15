"""Assistant IA — backend local (bibliothèque standard uniquement).

- Sert le site statique (website/) sur http://127.0.0.1:PORT
- Garde la clé API côté serveur (backend/.env, jamais envoyée au navigateur)
- Proxy POST /api/chat -> Gemini (modèle figé, longueur et débit limités)

Lancement : double-cliquer start-server.bat
"""
import json
import os
import re
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "website")


def load_env():
    cfg = {}
    p = os.path.join(HERE, ".env")
    if os.path.isfile(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    cfg[k.strip()] = v.strip().strip("\"'")
    return cfg


ENV = load_env()
API_KEY = os.environ.get("GEMINI_API_KEY", ENV.get("GEMINI_API_KEY", ""))
MODEL = os.environ.get("GEMINI_MODEL", ENV.get("GEMINI_MODEL", "gemini-3.5-flash"))
PORT = int(os.environ.get("ES_PORT", ENV.get("ES_PORT", "8000")))
RATE_PER_MIN = int(os.environ.get("ES_RATE_PER_MIN", ENV.get("ES_RATE_PER_MIN", "20")))
MAX_TOKENS = int(os.environ.get("ES_MAX_TOKENS", ENV.get("ES_MAX_TOKENS", "1200")))
ALLOWED_MODELS = {"gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash"}
if MODEL not in ALLOWED_MODELS:
    MODEL = "gemini-3.5-flash"

UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
SYSTEM = ("Tu es un tuteur de physique (FSA Agadir, parcours Électronique et Systèmes). "
          "Réponds en français, avec les extraits fournis comme sources prioritaires. "
          "Si l'étudiant demande un exercice, guide étape par étape sans tout donner "
          "d'un coup sauf demande explicite. Termine en citant les fichiers sources utilisés.")

_hits = {}
_hits_lock = __import__("threading").Lock()


def allowed(ip):
    now = time.time()
    with _hits_lock:
        lst = [t for t in _hits.get(ip, []) if now - t < 60]
        if len(lst) >= RATE_PER_MIN:
            _hits[ip] = lst
            return False
        lst.append(now)
        _hits[ip] = lst
        return True


MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".json": "application/json",
        ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
        ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"}


class Handler(BaseHTTPRequestHandler):
    server_version = "ES-Backend/1.0"

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json(200, {"ok": True, "model": MODEL,
                                    "key_configured": bool(API_KEY)})
        rel = "index.html" if path in ("/", "") else unquote(path.lstrip("/"))
        full = os.path.normpath(os.path.join(WEB, rel))
        if not full.startswith(os.path.normpath(WEB) + os.sep) and full != os.path.normpath(WEB):
            return self._json(404, {"error": "not found"})
        if os.path.isdir(full):
            full = os.path.join(full, "index.html")
        if not os.path.isfile(full):
            return self._json(404, {"error": "not found"})
        try:
            with open(full, "rb") as f:
                body = f.read()
        except OSError:
            return self._json(404, {"error": "not found"})
        self.send_response(200)
        self.send_header("Content-Type", MIME.get(os.path.splitext(full)[1].lower(),
                                                  "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlparse(self.path).path != "/api/chat":
            return self._json(404, {"error": "not found"})
        if not API_KEY:
            return self._json(503, {"error": "assistant non configuré (clé manquante)"})
        ip = self.client_address[0]
        if not allowed(ip):
            return self._json(429, {"error": "trop de requêtes, réessaie dans une minute"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > 32768:
            return self._json(400, {"error": "requête invalide"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return self._json(400, {"error": "requête invalide"})
        q = str(data.get("question", ""))[:2000].strip()
        if not q:
            return self._json(400, {"error": "question vide"})
        srcs = data.get("sources", [])
        if not isinstance(srcs, list):
            srcs = []
        ctx_parts = []
        for s in srcs[:6]:
            if not isinstance(s, dict):
                continue
            name = str(s.get("name", ""))[:200]
            text = str(s.get("text", ""))[:1500]
            if text.strip():
                ctx_parts.append(f"[Source — {name}]\n{text}")
        ctx = "\n\n".join(ctx_parts) if ctx_parts else "(aucun passage trouvé)"
        payload = json.dumps({
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": "Extraits de mes documents :\n" + ctx +
                 "\n\nMa question : " + q}
            ],
            "max_tokens": MAX_TOKENS,
        }).encode("utf-8")
        req = urllib.request.Request(
            UPSTREAM, data=payload,
            headers={"Content-Type": "application/json",
                     "Authorization": "Bearer " + API_KEY},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                up = json.loads(r.read().decode("utf-8"))
        except Exception:
            return self._json(502, {"error": "le service IA ne répond pas, réessaie"})
        try:
            ans = up["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            return self._json(502, {"error": "réponse IA invalide, réessaie"})
        return self._json(200, {"answer": ans})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Site : http://127.0.0.1:{PORT}/  (Ctrl+C pour arrêter)")
    print(f"Clé configurée : {'oui' if API_KEY else 'NON — voir backend/.env'}")
    srv.serve_forever()
