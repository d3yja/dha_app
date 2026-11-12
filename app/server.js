// DHA Resident Helpdesk prototype server.
// Zero dependencies: serves the UI, the knowledge base (from ../data CSVs), the guarded live AI
// agent (agent_server.js + guard.js, talking to any OpenAI-compatible endpoint), settings,
// and mock complaints.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { spawn } = require('child_process');
const { Retriever } = require('./retrieval');
const { Guard, declinedNote } = require('./guard');
const agentServer = require('./agent_server');
const cms = require('./cms_stub/cms');
const cmsClient = require('./core/cms_client');
const portal = require('./core/portal');
const intake = require('./core/intake');
const market = require('./core/market');
const demo = require('./core/demo');
const intent = require('./core/intent');
const urdu = require('./core/urdu');
const membershipStub = require('./membership_stub/membership');
const membershipClient = require('./core/membership_client');
const applications = require('./core/applications');

const PORT = Number(process.env.PORT) || 5173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.resolve(ROOT, '..', 'data');
const STORE_DIR = path.join(ROOT, 'store');
const SETTINGS_FILE = path.join(STORE_DIR, 'settings.json');

const DB_FILE = path.join(DATA_DIR, 'dha.sqlite');
const MODEL_SERVER = path.resolve(ROOT, '..', 'pipeline', 'model_server.py');
const LOCAL_MODELS_URL = 'http://127.0.0.1:5174/v1';

fs.mkdirSync(STORE_DIR, { recursive: true });
const retriever = new Retriever(DB_FILE);
const guard = new Guard({ storeDir: STORE_DIR, modelsUrl: LOCAL_MODELS_URL });

// ---------- CSV ----------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const KB_FILES = {
  services: '01_service_catalogue.csv',
  fees: '02_fees_charges.csv',
  steps: '03_procedure_steps.csv',
  documents: '04_document_requirements.csv',
  forms: '05_forms_catalogue.csv',
  contacts: '06_contacts_directory.csv',
  phases: '07_phases_jurisdiction.csv',
  stampRules: '08_stamp_paper_rules.csv',
  slas: '09_sla_validity.csv',
  eligibility: '10_eligibility_rules.csv',
  offices: '14_offices_counters.csv',
  payments: '15_payment_channels.csv',
  facilities: '18_facilities_amenities.csv',
  projects: '19_projects_master.csv',
  notices: '20_notices.csv',
  faqs: '21_faq_approved_answers.csv',
  glossary: '22_glossary.csv',
  standards: '13_building_standards.csv',
  fines: '11_fines_penalties.csv',
  regularization: '12_regularization_charges.csv',
};

function loadKb() {
  const kb = {};
  for (const [key, file] of Object.entries(KB_FILES)) {
    const p = path.join(DATA_DIR, file);
    // Prefer the SQLite build; fall back to the CSV files if it has not been built.
    if (retriever.ready) kb[key] = retriever.table(file.replace(/^\d+_/, '').replace(/\.csv$/, ''));
    else kb[key] = fs.existsSync(p) ? parseCsv(fs.readFileSync(p, 'utf8')) : [];
  }
  kb.source = retriever.ready ? 'sqlite' : 'csv';
  // Personal-looking mobiles are flagged for review: never expose them to residents.
  kb.contacts = kb.contacts.filter(c => c.visibility !== 'internal_review');
  // Bank account numbers are restricted until Finance verifies them.
  kb.payments = kb.payments.map(({ account_no, ...rest }) => rest);
  kb.loadedAt = new Date().toISOString();
  return kb;
}

let kbCache = null;
function getKb() {
  if (!kbCache) kbCache = loadKb();
  return kbCache;
}

// ---------- Settings ----------

const DEFAULT_SETTINGS = {
  mode: 'simulated', // 'simulated' | 'live'
  activeProvider: 'groq',
  temperature: 0.2,
  providers: {
    groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', apiKey: '' },
    openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', apiKey: '' },
    vllm: { label: 'vLLM (self-hosted)', baseUrl: 'http://localhost:8000/v1', model: 'Qwen/Qwen2.5-7B-Instruct', apiKey: '' },
    ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', apiKey: '' },
    custom: { label: 'Other OpenAI-compatible', baseUrl: '', model: '', apiKey: '' },
  },
  retrieval: {
    rerankTop: 10,
    embedding: { baseUrl: LOCAL_MODELS_URL, model: 'bge-m3', apiKey: '' },
    // Off by default: on a laptop CPU it adds about 1 s per passage for a small accuracy gain. Turn on with a GPU server.
    reranker: { baseUrl: LOCAL_MODELS_URL, model: 'bge-reranker-v2-m3', apiKey: '', enabled: false },
  },
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function getSettings() {
  const saved = readJson(SETTINGS_FILE, {});
  const merged = { ...DEFAULT_SETTINGS, ...saved, providers: {} };
  for (const id of Object.keys(DEFAULT_SETTINGS.providers)) {
    merged.providers[id] = { ...DEFAULT_SETTINGS.providers[id], ...(saved.providers?.[id] || {}) };
  }
  const r = saved.retrieval || {};
  merged.retrieval = {
    ...DEFAULT_SETTINGS.retrieval, ...r,
    embedding: { ...DEFAULT_SETTINGS.retrieval.embedding, ...(r.embedding || {}) },
    reranker: { ...DEFAULT_SETTINGS.retrieval.reranker, ...(r.reranker || {}) },
  };
  return merged;
}

function maskKey(key) {
  if (!key) return '';
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function publicSettings(s) {
  const providers = {};
  for (const [id, p] of Object.entries(s.providers)) {
    const { apiKey, ...rest } = p;
    providers[id] = { ...rest, hasKey: Boolean(apiKey), keyPreview: maskKey(apiKey) };
  }
  const strip = ({ apiKey, ...rest }) => ({ ...rest, hasKey: Boolean(apiKey), keyPreview: maskKey(apiKey) });
  const retrieval = { ...s.retrieval, embedding: strip(s.retrieval.embedding), reranker: strip(s.retrieval.reranker) };
  return { ...s, providers, retrieval };
}

function updateSettings(patch) {
  const s = getSettings();
  if (patch.mode === 'simulated' || patch.mode === 'live') s.mode = patch.mode;
  if (patch.activeProvider && s.providers[patch.activeProvider]) s.activeProvider = patch.activeProvider;
  if (typeof patch.temperature === 'number') s.temperature = Math.max(0, Math.min(1, patch.temperature));
  for (const [id, p] of Object.entries(patch.providers || {})) {
    if (!s.providers[id]) continue;
    const target = s.providers[id];
    if (typeof p.baseUrl === 'string') target.baseUrl = p.baseUrl.trim().replace(/\/+$/, '');
    if (typeof p.model === 'string') target.model = p.model.trim();
    // An empty key field means "keep the saved key"; clearKey removes it.
    if (typeof p.apiKey === 'string' && p.apiKey.trim()) target.apiKey = p.apiKey.trim();
    if (p.clearKey) target.apiKey = '';
  }
  const rp = patch.retrieval || {};
  if (Number.isFinite(rp.rerankTop)) s.retrieval.rerankTop = Math.max(5, Math.min(50, Math.round(rp.rerankTop)));
  for (const part of ['embedding', 'reranker']) {
    const src = rp[part];
    if (!src) continue;
    const target = s.retrieval[part];
    if (typeof src.baseUrl === 'string') target.baseUrl = src.baseUrl.trim().replace(/\/+$/, '');
    if (typeof src.model === 'string') target.model = src.model.trim();
    if (typeof src.apiKey === 'string' && src.apiKey.trim()) target.apiKey = src.apiKey.trim();
    if (src.clearKey) target.apiKey = '';
    if (typeof src.enabled === 'boolean') target.enabled = src.enabled;
  }
  writeJson(SETTINGS_FILE, s);
  ensureModelServer();
  if (rp.embedding) initGuard();
  return s;
}

// ---------- LLM proxy ----------

function providerHeaders(id, p) {
  const h = { 'Content-Type': 'application/json' };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (id === 'openrouter') {
    h['HTTP-Referer'] = 'http://localhost';
    h['X-Title'] = 'DHA Resident Helpdesk Prototype';
  }
  return h;
}

async function callProvider(providerId, pathSuffix, body) {
  const s = getSettings();
  const id = providerId && s.providers[providerId] ? providerId : s.activeProvider;
  const p = s.providers[id];
  if (!p.baseUrl) throw Object.assign(new Error('No base URL set for this provider.'), { status: 400 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(p.baseUrl + pathSuffix, {
      method: body ? 'POST' : 'GET',
      headers: providerHeaders(id, p),
      body: body ? JSON.stringify({ model: p.model, temperature: s.temperature, ...body }) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) {
      const msg = json?.error?.message || json?.message || text.slice(0, 300) || res.statusText;
      throw Object.assign(new Error(`${p.label} returned ${res.status}: ${msg}`), { status: 502 });
    }
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('The AI service took too long to answer.'), { status: 504 });
    if (!e.status) e.message = `Could not reach ${p.label} at ${p.baseUrl} (${e.cause?.code || e.message})`;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Local embedding / rerank model server ----------

let modelProc = null;
let modelStatus = 'not started';

async function localModelsUp() {
  try { return (await fetch(LOCAL_MODELS_URL.replace(/\/v1$/, '/health'), { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

// Start pipeline/model_server.py when Settings point at the default local URL and nothing is listening.
async function ensureModelServer() {
  const r = getSettings().retrieval;
  const wantsLocal = [r.embedding.baseUrl, r.reranker.enabled && r.reranker.baseUrl].includes(LOCAL_MODELS_URL);
  if (!wantsLocal || modelProc || process.env.AUTO_MODEL_SERVER === '0' || !fs.existsSync(MODEL_SERVER)) return;
  if (await localModelsUp()) { modelStatus = 'running (external)'; return; }
  modelStatus = 'starting';
  modelProc = spawn(process.env.PYTHON || 'python', ['-I', MODEL_SERVER, '--port', '5174'], { stdio: ['ignore', 'pipe', 'pipe'] });
  modelProc.stdout.on('data', d => {
    const line = String(d).trim();
    if (/ready/.test(line)) modelStatus = 'running';
    console.log(`[models] ${line}`);
  });
  modelProc.stderr.on('data', d => console.error(`[models] ${String(d).trim()}`));
  modelProc.on('exit', code => { modelStatus = `stopped (exit ${code})`; modelProc = null; });
}
process.on('exit', () => modelProc?.kill());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

// ---------- Complaints: the CMS (stub mounted at /cms/api) and the portal around it ----------

// The CMS stub tells the app about status changes the way the real CMS will: an HTTP POST to /api/cms-events
// carrying the shared key. It runs in this process only for the prototype.
cms.onEvent(ev => fetch(`http://localhost:${PORT}/api/cms-events`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CMS-Key': cms.EVENT_KEY }, body: JSON.stringify(ev),
}));

// The membership portal stub tells the app about application and voucher changes the same way.
membershipStub.onEvent(ev => fetch(`http://localhost:${PORT}/api/membership-events`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Membership-Key': membershipStub.EVENT_KEY }, body: JSON.stringify(ev),
}));

// Demo sign-in: the browser sends the chosen persona's CNIC. A real deployment uses DHA's member login.
function cnicOf(req) {
  const cnic = String(req.headers['x-demo-cnic'] || '');
  return /^\d{5}-\d{7}-\d$/.test(cnic) && portal.me(cnic) ? cnic : null;
}
function requireCnic(req) {
  const cnic = cnicOf(req);
  if (!cnic) throw Object.assign(new Error('Please sign in first.'), { status: 401 });
  return cnic;
}

const STAGE_INDEX = { Submitted: 0, Reopen: 0, Pending: 1, 'In Process': 2, Resolved: 3, Closed: 4, Cancel: 4, 'Cancel/Not at Home': 4 };

// The old complaint shape, still used by the chat agent's track_complaint tool.
function agentShape(c) {
  return {
    id: c.reference, categoryLabel: c.sub_category, category: c.category, status: c.status, stageIndex: STAGE_INDEX[c.status] ?? 0,
    phase: c.phase ? `Phase ${c.phase}` : '', sector: c.sector ? `Sector ${c.sector}` : '', street: c.street ? `Street ${c.street}` : '',
    house: c.house ? `House ${c.house}` : '', team: c.assigned_resources || '', createdAt: c.complaint_date,
    events: (c.events?.length ? c.events : [{ note: c.status }]).map(e => ({ at: e.at, note: e.note || e.status || '' })),
  };
}

function normalizeMobile(m) {
  return String(m || '').replace(/\D/g, '').replace(/^92/, '0');
}

async function myComplaints(cnic) {
  const own = await cmsClient.list({ cnic, limit: 50 });
  const ownRefs = new Set(own.map(c => c.reference));
  const followed = [];
  for (const ref of portal.followed(cnic)) if (!ownRefs.has(ref)) followed.push(await cmsClient.get(ref).catch(() => null));
  return [...own.map(c => ({ ...c, relation: 'mine' })), ...followed.filter(Boolean).map(c => ({ ...c, relation: 'following' }))]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

async function myComplaint(cnic, ref) {
  const c = await cmsClient.get(ref).catch(e => { if (e.status === 404) return null; throw e; });
  if (!c || (c.member_cnic !== cnic && !portal.isFollower(cnic, ref))) throw Object.assign(new Error('Complaint not found'), { status: 404 });
  return { ...c, relation: c.member_cnic === cnic ? 'mine' : 'following' };
}

// Requests to DO something for the signed-in person (a service at home, their dues, bills or complaints)
// are answered from the portals before any search or model call (core/intent.js).
const intentAnswer = (text, cnic) => intent.answer(text, { cnic, kb: getKb(), listMine: myComplaints, applications: applications.answer })
  .catch(e => { console.error(`Intent answer failed: ${e.message}`); return null; });

// ---------- Shared data access (HTTP routes and the server-side agent) ----------

function searchDocs({ query, k, mode, keywords, types }) {
  if (!query || !String(query).trim()) throw Object.assign(new Error('query is required'), { status: 400 });
  const r = getSettings().retrieval;
  return retriever.search(String(query).slice(0, 500), {
    k: Math.min(Number(k) || 5, 20), mode: ['bm25', 'vector', 'hybrid', 'rerank'].includes(mode) ? mode : 'rerank',
    keywords: String(keywords || '').slice(0, 300), types, cfg: r, rerankTop: r.rerankTop,
  });
}

async function findComplaints(params) {
  const id = String(params.get('id') || '').trim().toUpperCase().replace(/\s/g, '');
  const mobile = normalizeMobile(params.get('mobile'));
  let list = [];
  if (id) list = [await cmsClient.get(id).catch(() => null)].filter(Boolean);
  else if (mobile) list = await cmsClient.list({ mobile, limit: 10 });
  const full = await Promise.all(list.map(c => (c.events ? c : cmsClient.get(c.reference))));
  return full.map(agentShape);
}

// The scope router needs the embedding service, which may still be starting: retry for a few minutes.
let guardInitTimer = null;
function initGuard(attempt = 0) {
  clearTimeout(guardInitTimer);
  guard.init(getSettings().retrieval.embedding).then(() => {
    if (guard.router.ready) console.log('Guard: scope router ready');
    else if (attempt < 40) guardInitTimer = setTimeout(() => initGuard(attempt + 1), 5000);
    else console.log(`Guard: scope router unavailable (${guard.router.error}); using word lists`);
  });
}

// ---------- Guarded live agent ----------

async function handleAgent(req, res) {
  const { text, sessionId, lang } = await readBody(req);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const emit = ev => res.write(JSON.stringify(ev) + '\n');
  try {
    const s = getSettings();
    if (s.mode !== 'live') throw new Error('Live AI is turned off in Settings.');
    emit({ type: 'step', label: 'Checking your message…', pending: true });
    const g = await guard.checkInput(text, req.socket.remoteAddress);
    if (g.message) return emit({ type: 'blocked', status: g.status, message: g.message });
    emit({ type: 'step', label: g.declined.length ? 'Message checked — answering the DHA part only' : 'Message checked', done: true });
    const cnic = cnicOf(req);
    const direct = await intentAnswer(g.question, cnic);
    if (direct) {
      for (const st of direct.steps) emit({ type: 'step', label: st.label, done: true });
      agentServer.remember(sessionId, g.question, direct.text);
      return emit({ type: 'result', text: direct.text + declinedNote(g.declined), cards: direct.cards, steps: direct.steps, citations: direct.citations || [], intent: direct.intent });
    }
    const p = s.providers[s.activeProvider];
    const out = await agentServer.runLive({
      question: g.question, declined: g.declined, sessionId, lang,
      providerLabel: `${p.label} · ${p.model}`, cnic, signedInAs: cnic ? portal.me(cnic)?.name : null,
      callLLM: body => callProvider(null, '/chat/completions', body),
      emit,
    });
    if (out.fallback) emit({ type: 'fallback', reason: out.reason, question: urdu.toRoman(g.question), declined: g.declined });
    else {
      emit({ type: 'result', ...out });
      portal.log(cnicOf(req), 'question_answered'); // counted on the demo panel
    }
  } catch (e) {
    emit({ type: 'error', message: e.message });
  } finally {
    res.end();
  }
}

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2e6) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
  });
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/kb' && req.method === 'GET') {
    if (url.searchParams.get('reload')) { retriever.load(); kbCache = null; agentServer.reloadKb(getKb()); }
    return send(res, 200, getKb());
  }
  if (p === '/api/search' && req.method === 'POST') {
    return send(res, 200, await searchDocs(await readBody(req)));
  }
  if (p === '/api/search/status' && req.method === 'GET') {
    return send(res, 200, {
      ...retriever.stats(), modelServer: modelStatus, localModelsUp: await localModelsUp(),
      guard: { scopeRouter: guard.router.ready ? 'ready' : `word lists only${guard.router.error ? ` (${guard.router.error})` : ''}` },
    });
  }
  if (p === '/api/settings' && req.method === 'GET') return send(res, 200, publicSettings(getSettings()));
  if (p === '/api/settings' && req.method === 'POST') return send(res, 200, publicSettings(updateSettings(await readBody(req))));

  // There is deliberately no open chat proxy: the browser can only ask questions, through the guard.
  if (p === '/api/guard' && req.method === 'POST') {
    const { text } = await readBody(req);
    const g = await guard.checkInput(text, req.socket.remoteAddress);
    if (!g.message) g.answer = await intentAnswer(g.question || text, cnicOf(req));
    if (g.question) g.question = urdu.toRoman(g.question);
    return send(res, 200, g);
  }
  if (p === '/api/agent' && req.method === 'POST') return handleAgent(req, res);
  if (p === '/api/agent/reset' && req.method === 'POST') {
    agentServer.resetSession((await readBody(req)).sessionId);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/llm/models' && req.method === 'GET') {
    const json = await callProvider(url.searchParams.get('provider'), '/models');
    const ids = (json.data || json.models || []).map(m => m.id || m.name).filter(Boolean).sort();
    return send(res, 200, { models: ids });
  }
  if (p === '/api/llm/test' && req.method === 'POST') {
    const { provider } = await readBody(req);
    const started = Date.now();
    const json = await callProvider(provider, '/chat/completions', {
      messages: [{ role: 'user', content: 'Reply with the single word: OK' }], max_tokens: 20,
    });
    return send(res, 200, { ok: true, ms: Date.now() - started, reply: json.choices?.[0]?.message?.content || '' });
  }

  // Chat agent's track tool (by reference or mobile), now answered from the CMS.
  if (p === '/api/complaints' && req.method === 'GET') return send(res, 200, await findComplaints(url.searchParams));

  // ----- Portal (demo sign-in by persona) -----
  if (p === '/api/personas' && req.method === 'GET') return send(res, 200, portal.personas());
  if (p === '/api/me' && req.method === 'GET') {
    const cnic = requireCnic(req);
    return send(res, 200, { ...portal.me(cnic), unread: portal.unread(cnic) });
  }
  if (p === '/api/intake/quick' && req.method === 'GET') return send(res, 200, intake.quickList(10));
  if (p === '/api/intake' && req.method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, await intake.turn({ sessionId: b.id, cnic: requireCnic(req), text: b.text, choice: b.choice, key: b.key }));
  }
  if (p === '/api/my/complaints' && req.method === 'GET') return send(res, 200, await myComplaints(requireCnic(req)));
  if (p === '/api/my/bills/pay' && req.method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, portal.payBill(requireCnic(req), b.consumer_id, b.channel)); // demo: no money moves
  }
  let m;
  if ((m = p.match(/^\/api\/my\/complaints\/(\w+)$/)) && req.method === 'GET') return send(res, 200, await myComplaint(requireCnic(req), m[1]));
  if ((m = p.match(/^\/api\/my\/complaints\/(\w+)\/(feedback|info|simulate|cancel)$/)) && req.method === 'POST') {
    const cnic = requireCnic(req);
    const c = await myComplaint(cnic, m[1]);
    const b = await readBody(req);
    const own = c.relation === 'mine';
    if (m[2] !== 'simulate' && !own) return send(res, 403, { error: 'Only the person who made the complaint can do this.' });
    let out;
    if (m[2] === 'feedback') {
      out = await cmsClient.feedback(c.reference, !!b.resolved, b.note);
      portal.clearActions(cnic, c.reference);
      portal.log(cnic, b.resolved ? 'confirmed_fixed' : 'reopened', { ref: c.reference });
    } else if (m[2] === 'info') {
      if (!String(b.text || '').trim()) return send(res, 400, { error: 'Please write something to add.' });
      out = await cmsClient.addInfo(c.reference, String(b.text).slice(0, 1000));
      portal.log(cnic, 'info_added', { ref: c.reference });
    } else if (m[2] === 'cancel') {
      out = await cmsClient.cancel(c.reference);
      portal.log(cnic, 'cancelled', { ref: c.reference });
    } else {
      out = await cmsClient.simulateAdvance(c.reference); // demo: what the field team does in the CMS
    }
    return send(res, 200, { ...out, relation: c.relation });
  }
  // ----- Applications with DHA (site plan, building plan) and their fee vouchers, from the membership portal -----
  if (p === '/api/my/applications' && req.method === 'GET') {
    const cnic = requireCnic(req);
    const list = await applications.forCnic(cnic);
    if (url.searchParams.get('view') === '1' && list.length) portal.log(cnic, 'application_checked', { n: list.length });
    return send(res, 200, list);
  }
  if ((m = p.match(/^\/api\/my\/applications\/(\d+)\/(pay|simulate)$/)) && req.method === 'POST') {
    const cnic = requireCnic(req);
    const a = await applications.one(cnic, m[1]);
    if (m[2] === 'pay') {
      const b = await readBody(req);
      await membershipClient.simulatePay(a.id, b.channel); // demo: no money moves
      portal.log(cnic, 'voucher_paid_online', { application_id: a.id, amount: a.voucher_due?.amount });
    } else {
      await membershipClient.simulateAdvance(a.id); // demo: what the DHA office does in the membership portal
    }
    return send(res, 200, await applications.one(cnic, a.id));
  }
  if (p === '/api/membership-events' && req.method === 'POST') {
    if (req.headers['x-membership-key'] !== membershipStub.EVENT_KEY) return send(res, 401, { error: 'Bad membership portal key' });
    return send(res, 200, applications.handleEvent(await readBody(req)));
  }
  if (p === '/api/notifications' && req.method === 'GET') return send(res, 200, portal.notifications(requireCnic(req)));
  if (p === '/api/notifications/count' && req.method === 'GET') {
    const cnic = requireCnic(req);
    return send(res, 200, { unread: portal.unread(cnic), latest: portal.latestUnread(cnic) });
  }
  // ----- Demo control panel (#/demo) -----
  if (p === '/api/demo/summary' && req.method === 'GET') return send(res, 200, demo.summary(url.searchParams.get('share')));
  if (p === '/api/demo/advance' && req.method === 'POST') {
    // The field-team simulator for any portal complaint, so the presenter can move one on without signing in as its owner.
    const { ref } = await readBody(req);
    if (!ref) return send(res, 400, { error: 'ref is required' });
    return send(res, 200, await cmsClient.simulateAdvance(ref));
  }
  if (p === '/api/demo/reset' && req.method === 'POST') {
    require('./core/seed').seed(); // rebuilds core.sqlite and the CMS stub from samples/Complaints.csv
    return send(res, 200, { ok: true });
  }
  if (p === '/api/notifications/read' && req.method === 'POST') {
    portal.markRead(requireCnic(req), (await readBody(req)).id || 'all');
    return send(res, 200, { ok: true });
  }

  // ----- DHA Marketplace (simulated) -----
  if (p === '/api/market/filters' && req.method === 'GET') return send(res, 200, market.filters());
  // ----- Construction checklist (guidance only) -----
  if (p === '/api/build/progress' && req.method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, portal.setBuildStage(requireCnic(req), b.membership_no, b.stage, !!b.done));
  }
  if (p === '/api/market/rates' && req.method === 'GET') return send(res, 200, market.lookupRates(Object.fromEntries(url.searchParams)));
  if (p === '/api/market/plots' && req.method === 'GET') return send(res, 200, market.list(Object.fromEntries(url.searchParams), cnicOf(req)));
  if ((m = p.match(/^\/api\/market\/plots\/([\w-]+)$/)) && req.method === 'GET') {
    const plot = market.get(m[1], cnicOf(req));
    return plot ? send(res, 200, plot) : send(res, 404, { error: 'Plot not found' });
  }
  if ((m = p.match(/^\/api\/market\/plots\/([\w-]+)\/book$/)) && req.method === 'POST') {
    return send(res, 200, market.book(m[1], requireCnic(req), (await readBody(req)).plan));
  }
  if (p === '/api/market/bookings' && req.method === 'GET') return send(res, 200, market.myBookings(requireCnic(req)));
  if ((m = p.match(/^\/api\/market\/bookings\/([\w-]+)\/(pay|cancel)$/)) && req.method === 'POST') {
    const cnic = requireCnic(req);
    return send(res, 200, m[2] === 'pay' ? market.pay(m[1], cnic) : market.cancel(m[1], cnic));
  }

  // ----- CMS -> app events (webhook) -----
  if (p === '/api/cms-events' && req.method === 'POST') {
    if (req.headers['x-cms-key'] !== cms.EVENT_KEY) return send(res, 401, { error: 'Bad CMS key' });
    return send(res, 200, portal.handleCmsEvent(await readBody(req)));
  }
  return send(res, 404, { error: 'Unknown API route' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/cms/api/')) await cms.handle(req, res, url, { readBody, send });
    else if (url.pathname.startsWith('/membership/api/')) await membershipStub.handle(req, res, url, { readBody, send });
    else if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    send(res, e.status || 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`DHA Resident Helpdesk prototype running at http://localhost:${PORT}`);
  console.log(retriever.ready
    ? `Knowledge base: ${DB_FILE} (${retriever.stats().chunks} chunks, ${retriever.stats().vectors} vectors)`
    : `Knowledge base: CSV files in ${DATA_DIR} (run pipeline/build_db.py for document search)`);
  ensureModelServer();
  initGuard();
  intake.setContacts(() => getKb().contacts);
  console.log(`CMS: ${cmsClient.BASE}${process.env.CMS_BASE_URL ? '' : ' (built-in stub; run core/seed.js to rebuild its data)'}`);
  console.log(`Membership portal: ${membershipClient.BASE}${process.env.MEMBERSHIP_BASE_URL ? '' : ' (built-in stub with DHA\'s sample dump; run core/seed.js to rebuild)'}`);
  agentServer.init({
    kb: getKb(),
    search: searchDocs,
    complaints: qs => findComplaints(new URLSearchParams(qs)),
    rates: q => market.lookupRates(q),
    account: (cnic, focus) => intent.accountAnswer(cnic, focus || 'dues', getKb()),
    myComplaints: cnic => intent.complaintsAnswer(cnic, myComplaints),
    myApplications: (cnic, focus) => applications.answer(cnic, focus),
  }).catch(e => console.error(`Live agent could not load: ${e.message}`));
});
