// REST client for DHA's membership portal. The app reaches the membership portal only through this file, so
// connecting the real web services is a change of MEMBERSHIP_BASE_URL (and of field mapping, if theirs differ).
//   MEMBERSHIP_BASE_URL  default http://localhost:<PORT>/membership/api (the stub mounted in server.js)
//   MEMBERSHIP_API_KEY   sent as X-Api-Key when set

const PORT = Number(process.env.PORT) || 5173;
const BASE = (process.env.MEMBERSHIP_BASE_URL || `http://localhost:${PORT}/membership/api`).replace(/\/$/, '');
const KEY = process.env.MEMBERSHIP_API_KEY || '';
const TIMEOUT_MS = 8000;

class MembershipError extends Error {
  constructor(status, body) {
    super(body?.error || `Membership portal answered ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function call(method, path, { body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')) : '';
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (KEY) headers['X-Api-Key'] = KEY;
  let res;
  try {
    res = await fetch(BASE + path + qs, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new MembershipError(503, { error: `The membership portal is not reachable (${e.name === 'TimeoutError' ? 'timed out' : e.message}).` });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new MembershipError(res.status, json);
  return json;
}

module.exports = {
  BASE,
  MembershipError,
  members: cnic => call('GET', '/members', { query: { cnic } }),
  applications: query => call('GET', '/applications', { query }), // { cnic } or { membership_no }
  application: id => call('GET', `/applications/${Number(id)}`),
  // Demo only: the stub's office and payment simulators. The real portal has its own payment gateway.
  simulateAdvance: id => call('POST', `/_sim/applications/${Number(id)}/advance`, { body: {} }),
  simulatePay: (id, channel) => call('POST', `/_sim/applications/${Number(id)}/pay`, { body: { channel } }),
};
