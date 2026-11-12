"""Local embedding + reranking service (CPU, ONNX).

Speaks the same HTTP shapes as vLLM / Text Embeddings Inference, so the app can
point at either this or a hosted server:
  POST /v1/embeddings  {"input": str | [str], "model": "bge-m3"}
       -> {"data": [{"index": i, "embedding": [...]}], "model": ...}
  POST /v1/rerank      {"query": str, "documents": [str], "top_n": int}
       -> {"results": [{"index": i, "relevance_score": float}], "model": ...}
  POST /v1/classify    {"input": [str]}   (Prompt Guard 2: jailbreak / injection detector)
       -> {"data": [{"index": i, "malicious": float}], "model": ...}
  GET  /health

Run: python -I pipeline/model_server.py [--port 5174]
"""
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from models import Embedder, PromptGuard, Reranker  # noqa: E402

PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 5174
_models = {}
_lock = threading.Lock()  # one inference at a time keeps CPU latency predictable


def model(kind):
    if kind not in _models:
        _models[kind] = {"embed": Embedder, "rerank": Reranker, "guard": PromptGuard}[kind]()
    return _models[kind]


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    def do_GET(self):
        if self.path.rstrip("/") in ("/health", "/v1/models", "/v1/health"):
            return self._send(200, {"ok": True, "data": [{"id": Embedder.name}, {"id": Reranker.name}, {"id": PromptGuard.name}], "loaded": list(_models)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            t0 = time.time()
            if self.path.endswith("/embeddings"):
                texts = body.get("input", [])
                texts = [texts] if isinstance(texts, str) else texts
                with _lock:
                    vecs = model("embed").embed(texts)
                return self._send(200, {"object": "list", "model": Embedder.name, "ms": round((time.time() - t0) * 1000),
                                        "data": [{"object": "embedding", "index": i, "embedding": v.tolist()} for i, v in enumerate(vecs)]})
            if self.path.endswith("/rerank"):
                docs = [d if isinstance(d, str) else d.get("text", "") for d in body.get("documents", [])]
                with _lock:
                    scores = model("rerank").score(body.get("query", ""), docs)
                order = sorted(range(len(docs)), key=lambda i: -scores[i])[: body.get("top_n") or len(docs)]
                return self._send(200, {"model": Reranker.name, "ms": round((time.time() - t0) * 1000),
                                        "results": [{"index": i, "relevance_score": scores[i]} for i in order]})
            if self.path.endswith("/classify"):
                texts = body.get("input", [])
                texts = [texts] if isinstance(texts, str) else texts
                with _lock:
                    scores = model("guard").score(texts)
                return self._send(200, {"model": PromptGuard.name, "ms": round((time.time() - t0) * 1000),
                                        "data": [{"index": i, "malicious": p} for i, p in enumerate(scores)]})
            self._send(404, {"error": "not found"})
        except Exception as e:
            self._send(500, {"error": str(e)})


if __name__ == "__main__":
    print(f"Model server loading on http://127.0.0.1:{PORT} …", flush=True)
    model("embed")
    model("guard")  # the reranker loads on first use: it is off by default and needs about 600 MB
    print(f"Model server ready on http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
