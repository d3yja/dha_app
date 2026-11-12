// REST client for the CMS. The app reaches the CMS only through this file, so swapping the stub for the
// real CMS is a change of CMS_BASE_URL (and of field mapping, if the real template differs).
//   CMS_BASE_URL  default http://localhost:<PORT>/cms/api (the stub mounted in server.js)
//   CMS_API_KEY   sent as X-Api-Key when set

const PORT = Number(process.env.PORT) || 5173;
const BASE = (process.env.CMS_BASE_URL || `http://localhost:${PORT}/cms/api`).replace(/\/$/, '');
const KEY = process.env.CMS_API_KEY || '';
const TIMEOUT_MS = 8000;

class CmsError extends Error {
  constructor(status, body) {
    super(body?.error || `CMS answered ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, { body, query, idempotencyKey } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')) : '';
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (KEY) headers['X-Api-Key'] = KEY;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let res;
  try {
    res = await fetch(BASE + path + qs, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new CmsError(503, { error: `The complaint system is not reachable (${e.name === 'TimeoutError' ? 'timed out' : e.message}).` });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new CmsError(res.status, json);
  return json;
}

let taxonomyCache = null;

module.exports = {
  BASE,
  CmsError,
  async taxonomy() {
    if (!taxonomyCache) taxonomyCache = await call('GET', '/taxonomy');
    return taxonomyCache;
  },
  list: query => call('GET', '/complaints', { query }),
  get: ref => call('GET', `/complaints/${encodeURIComponent(ref)}`),
  create: (complaint, idempotencyKey) => call('POST', '/complaints', { body: complaint, idempotencyKey }),
  addInfo: (ref, text) => call('POST', `/complaints/${encodeURIComponent(ref)}/info`, { body: { text } }),
  feedback: (ref, resolved, note) => call('POST', `/complaints/${encodeURIComponent(ref)}/feedback`, { body: { resolved, note } }),
  reopen: (ref, reason) => call('POST', `/complaints/${encodeURIComponent(ref)}/reopen`, { body: { reason } }),
  cancel: ref => call('POST', `/complaints/${encodeURIComponent(ref)}/cancel`, { body: {} }),
  // Demo only: the stub's field-team simulator. The real CMS has no such route.
  simulateAdvance: ref => call('POST', `/_sim/complaints/${encodeURIComponent(ref)}/advance`, { body: {} }),
};
