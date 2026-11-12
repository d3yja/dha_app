// Hybrid retrieval over data/dha.sqlite:
//   1. BM25 keyword search (SQLite FTS5)          — exact terms: NDC, 236C, clause numbers
//   2. Dense vector search (BGE-M3, cosine)        — meaning and paraphrase, Urdu
//   3. Reciprocal Rank Fusion of both lists
//   4. Cross-encoder rerank of the fused top N     — final ordering
// Embedding and rerank calls go to OpenAI/TEI-style HTTP endpoints, so the
// local model server can be swapped for Ollama, vLLM or TEI in Settings.

const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const STOP = new Set(('a an the i im my me we our you your to of for in on and or is are am do does did how what when where which who ' +
  'can could get got need want please tell about with from at by be it its this that there their them was were will would should ' +
  'shall have has had any some much many dha kya ka ki ke ko hai hain mein main mujhe mera meri mere kaise kahan kab se aur ya bhi ' +
  'karna karne chahiye hum ap aap apna apni').split(' '));

const RRF_K = 60;

class Retriever {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.vectors = null;
    this.ids = [];
    this.meta = {};
    this.queryCache = new Map();
    this.load();
  }

  get ready() { return this.loaded; }

  // The file is opened per call (about 1 ms) so pipeline/build_db.py can replace it while the app runs.
  withDb(fn) {
    const db = new DatabaseSync(this.dbPath, { readOnly: true });
    try { return fn(db); } finally { db.close(); }
  }

  load() {
    this.loaded = false;
    this.vectors = null;
    this.ids = [];
    this.queryCache.clear();
    if (!fs.existsSync(this.dbPath)) return;
    this.withDb(db => {
      this.meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map(r => [r.key, r.value]));
      const rows = db.prepare('SELECT chunk_id, vec FROM chunk_vectors ORDER BY chunk_id').all();
      const dim = Number(this.meta.embed_dim) || 0;
      this.ids = rows.map(r => r.chunk_id);
      this.vectors = dim && rows.length ? new Float32Array(rows.length * dim) : null;
      rows.forEach((r, i) => this.vectors.set(new Float32Array(r.vec.buffer, r.vec.byteOffset, dim), i * dim));
      this.dim = dim;
      const byType = db.prepare('SELECT source_type, COUNT(*) n FROM chunks GROUP BY source_type').all();
      this.byType = Object.fromEntries(byType.map(r => [r.source_type, r.n]));
    });
    this.loaded = true;
  }

  table(name) {
    return this.withDb(db => db.prepare(`SELECT * FROM "${name.replace(/"/g, '')}"`).all().map(r => ({ ...r })));
  }

  stats() {
    if (!this.loaded) return { ready: false };
    return { ready: true, ...this.meta, vectors: this.ids.length, byType: this.byType };
  }

  // ---------- Stage 1: keyword ----------
  bm25(query, k = 30) {
    const terms = [...new Set(String(query).toLowerCase().match(/[a-z0-9][a-z0-9.]*[a-z0-9]|[a-z0-9]/g) || [])]
      .filter(t => !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
    if (!terms.length) return [];
    const match = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
    try {
      return this.withDb(db => db.prepare(`SELECT rowid AS id, bm25(chunks_fts, 1.5, 1.0) AS score FROM chunks_fts
        WHERE chunks_fts MATCH ? ORDER BY score LIMIT ?`).all(match, k)).map(r => ({ id: r.id, score: -r.score }));
    } catch {
      return [];
    }
  }

  // ---------- Stage 2: vectors ----------
  vectorSearch(qvec, k = 30) {
    if (!this.vectors || qvec.length !== this.dim) return [];
    const n = this.ids.length, dim = this.dim, scores = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * dim;
      for (let j = 0; j < dim; j++) s += this.vectors[off + j] * qvec[j];
      scores[i] = s;
    }
    const top = [];
    for (let i = 0; i < n; i++) {
      if (top.length < k) { top.push(i); if (top.length === k) top.sort((a, b) => scores[b] - scores[a]); continue; }
      if (scores[i] > scores[top[k - 1]]) {
        top[k - 1] = i;
        for (let j = k - 1; j > 0 && scores[top[j]] > scores[top[j - 1]]; j--) [top[j], top[j - 1]] = [top[j - 1], top[j]];
      }
    }
    if (top.length < k) top.sort((a, b) => scores[b] - scores[a]);
    return top.map(i => ({ id: this.ids[i], score: scores[i] }));
  }

  async embedQuery(query, cfg) {
    const key = `${cfg.baseUrl}|${cfg.model}|${query}`;
    if (this.queryCache.has(key)) return this.queryCache.get(key);
    const json = await postJson(`${cfg.baseUrl}/embeddings`, { input: [query], model: cfg.model }, cfg.apiKey, 30000);
    const vec = Float32Array.from(json.data[0].embedding);
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    if (this.queryCache.size > 500) this.queryCache.clear();
    this.queryCache.set(key, vec);
    return vec;
  }

  // ---------- Full pipeline ----------
  async search(query, { k = 5, mode = 'rerank', keywords = '', cfg = {}, rerankTop = 10, types = null } = {}) {
    if (!this.loaded) throw Object.assign(new Error('Search database not built. Run: python -I pipeline/build_db.py'), { status: 503 });
    const timings = {};
    const stages = [];
    const notes = [];
    let t = Date.now();

    const useKeyword = mode !== 'vector';
    const useVector = mode !== 'bm25';
    const kw = useKeyword ? this.bm25(`${query} ${keywords}`, 40) : [];
    timings.keyword_ms = Date.now() - t;
    if (useKeyword) stages.push('keyword');

    let vec = [];
    if (useVector) {
      t = Date.now();
      try {
        if (!this.vectors) throw new Error('database has no vectors');
        if (cfg.embedding?.model && this.meta.embed_model && !cfg.embedding.model.toLowerCase().includes(this.meta.embed_model)) {
          notes.push(`Embedding model "${cfg.embedding.model}" differs from the one used to build the index (${this.meta.embed_model}); results may be poor.`);
        }
        vec = this.vectorSearch(await this.embedQuery(query, cfg.embedding), 40);
        stages.push('vector');
      } catch (e) {
        notes.push(`Vector search skipped: ${e.message}`);
      }
      timings.vector_ms = Date.now() - t;
    }

    // Reciprocal Rank Fusion
    const fused = new Map();
    const add = (list, label) => list.forEach((r, rank) => {
      const f = fused.get(r.id) || { id: r.id, rrf: 0, ranks: {} };
      f.rrf += 1 / (RRF_K + rank + 1);
      f.ranks[label] = rank + 1;
      if (label === 'vector') f.similarity = r.score;
      fused.set(r.id, f);
    });
    add(kw, 'keyword');
    add(vec, 'vector');
    const ordered = [...fused.values()].sort((a, b) => b.rrf - a.rrf);
    let results = this.withDb(db => {
      const stmt = db.prepare('SELECT * FROM chunks WHERE chunk_id = ?');
      return ordered.map(f => ({ ...f, chunk: stmt.get(f.id) }));
    });
    if (types?.length) results = results.filter(r => types.includes(r.chunk.source_type));
    if (stages.length === 2) stages.push('fusion');

    if (mode === 'rerank' && cfg.reranker?.enabled !== false && results.length) {
      t = Date.now();
      const pool = results.slice(0, rerankTop);
      try {
        const json = await postJson(`${cfg.reranker.baseUrl}/rerank`, {
          // Roman Urdu questions are reranked with their English keywords added, which the reranker reads better.
          model: cfg.reranker.model, query: keywords ? `${query} (${keywords})` : query,
          documents: pool.map(r => `${r.chunk.header}\n${r.chunk.text}`.slice(0, 1000)), top_n: pool.length,
        }, cfg.reranker.apiKey, 60000);
        const scores = new Map((json.results || json.data || []).map(x => [x.index, x.relevance_score ?? x.score]));
        pool.forEach((r, i) => { r.rerank = scores.get(i) ?? 0; });
        results = [...pool.sort((a, b) => b.rerank - a.rerank), ...results.slice(rerankTop)];
        stages.push('rerank');
      } catch (e) {
        notes.push(`Rerank skipped: ${e.message}`);
      }
      timings.rerank_ms = Date.now() - t;
    }

    return {
      query, mode, stages, timings, notes,
      results: results.slice(0, k).map(r => ({
        chunk_id: r.id, source_type: r.chunk.source_type, title: r.chunk.title, header: r.chunk.header, text: r.chunk.text,
        page: r.chunk.page, clause: r.chunk.clause, year: r.chunk.year, status: r.chunk.status, caution: r.chunk.caution,
        service_ids: r.chunk.service_ids, url: r.chunk.url, ranks: r.ranks, similarity: r.similarity, rerank: r.rerank,
      })),
    };
  }
}

async function postJson(url, body, apiKey, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${url} timed out`);
    if (e.cause?.code === 'ECONNREFUSED' || /fetch failed/.test(e.message)) throw new Error(`cannot reach ${url}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { Retriever };
