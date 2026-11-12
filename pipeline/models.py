"""Local CPU inference for the BGE-M3 embedder and the BGE reranker (int8 ONNX)."""
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODELS = Path(__file__).resolve().parent.parent / "models"


def _session(path):
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])


def _batch(encodings):
    width = max(len(e.ids) for e in encodings)
    ids = np.zeros((len(encodings), width), dtype=np.int64)
    mask = np.zeros((len(encodings), width), dtype=np.int64)
    for i, e in enumerate(encodings):
        ids[i, :len(e.ids)] = e.ids
        mask[i, :len(e.ids)] = 1
    return {"input_ids": ids, "attention_mask": mask}


class Embedder:
    """BGE-M3 dense vectors: CLS token, L2-normalised, 1024 dimensions."""
    name = "bge-m3"

    def __init__(self, max_len=512):
        d = MODELS / "bge-m3"
        self.tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        self.tok.enable_truncation(max_len)
        self.tok.no_padding()  # some tokenizer.json files pad every input to 512 tokens; _batch pads per batch
        self.sess = _session(d / "model_int8.onnx")

    def embed(self, texts, batch_size=8):
        out = []
        order = sorted(range(len(texts)), key=lambda i: len(texts[i]))  # similar lengths batch faster
        for s in range(0, len(order), batch_size):
            idx = order[s:s + batch_size]
            enc = self.tok.encode_batch([texts[i] for i in idx])
            hidden = self.sess.run(["last_hidden_state"], _batch(enc))[0][:, 0]
            hidden /= np.linalg.norm(hidden, axis=1, keepdims=True) + 1e-12
            out.extend(zip(idx, hidden))
        out.sort(key=lambda x: x[0])
        return np.stack([v for _, v in out]).astype(np.float32)


class Reranker:
    """BGE reranker v2 m3: relevance score in 0..1 for (query, passage) pairs."""
    name = "bge-reranker-v2-m3"

    def __init__(self, max_len=320):  # 512 doubles the CPU time for little gain on these short passages
        d = MODELS / "bge-reranker-v2-m3"
        self.tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        self.tok.enable_truncation(max_len)
        self.tok.no_padding()  # some tokenizer.json files pad every input to 512 tokens; _batch pads per batch
        self.sess = _session(d / "model_int8.onnx")

    def score(self, query, passages, batch_size=4):
        scores = []
        for s in range(0, len(passages), batch_size):
            enc = self.tok.encode_batch([(query, p) for p in passages[s:s + batch_size]])
            logits = self.sess.run(["logits"], _batch(enc))[0][:, 0]
            scores.extend((1 / (1 + np.exp(-logits))).tolist())
        return scores


class PromptGuard:
    """Meta Prompt Guard 2 (22M, int8 ONNX): probability that a text is a jailbreak or prompt injection."""
    name = "prompt-guard-2-22m"

    def __init__(self, max_len=512):
        d = MODELS / "prompt-guard-2-22m"
        self.tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        self.tok.enable_truncation(max_len)
        self.tok.no_padding()  # some tokenizer.json files pad every input to 512 tokens; _batch pads per batch
        self.sess = _session(d / "model.quant.onnx")

    def score(self, texts, batch_size=8):
        scores = []
        for s in range(0, len(texts), batch_size):
            logits = self.sess.run(["logits"], _batch(self.tok.encode_batch(texts[s:s + batch_size])))[0]
            e = np.exp(logits - logits.max(axis=1, keepdims=True))
            scores.extend((e[:, 1] / e.sum(axis=1)).tolist())
        return scores
