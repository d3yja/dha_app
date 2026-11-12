// CMS stub: stands in for DHA's deployed complaints system until the real one is connected.
// It runs inside the same Node process for the demo but behaves like a separate service on the same stack:
//   - its own database (store/cms_stub.sqlite), seeded from samples/Complaints.csv with the same columns
//   - its own REST API under /cms/api (the contract the real CMS integration must offer)
//   - it pushes every status change to the app (POST {APP_EVENTS_URL}) with a shared key: integration is two-way
// Field-team actions (assign, resolve, not at home) are simulated through /cms/api/_sim/* for demos.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const STORE_DIR = path.resolve(__dirname, '..', 'store');
const CMS_DB = path.join(STORE_DIR, 'cms_stub.sqlite');
const TEMPLATES = path.resolve(__dirname, '..', '..', 'data', 'cms_templates.json');

const EVENT_KEY = process.env.CMS_EVENT_KEY || 'demo-shared-secret';
const OPEN_STATUSES = ['Submitted', 'In Process', 'Pending', 'Reopen'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS complaints (
  complaint_id INTEGER PRIMARY KEY, reference TEXT UNIQUE NOT NULL, complaint_date TEXT NOT NULL,
  category TEXT, sub_category TEXT, status TEXT, request_source TEXT, complaint_type TEXT, internal_external TEXT,
  priority INTEGER DEFAULT 0, description TEXT, membership_no TEXT, member_name TEXT, membership_type TEXT,
  member_phone TEXT, member_cnic TEXT, membership_status TEXT, followup_name TEXT, followup_cell TEXT,
  phase TEXT, sector TEXT, street TEXT, house TEXT, lat_approx REAL, lng_approx REAL,
  is_paid INTEGER DEFAULT 0, paid_at TEXT, updated_at TEXT, assigned_managers TEXT, assigned_resources TEXT,
  first_assigned_at TEXT, status_flow TEXT, status_change_count INTEGER DEFAULT 1, resolved_at TEXT,
  resolution_time_hours REAL, details_json TEXT, idempotency_key TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS complaint_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT NOT NULL, at TEXT NOT NULL, status TEXT, note TEXT, actor TEXT
);
CREATE INDEX IF NOT EXISTS ix_cms_cnic ON complaints(member_cnic);
CREATE INDEX IF NOT EXISTS ix_cms_area ON complaints(phase, sector, street, sub_category, status);
CREATE INDEX IF NOT EXISTS ix_cms_ev ON complaint_events(reference);
`;

let db = null;
function open() {
  if (db) return db;
  fs.mkdirSync(STORE_DIR, { recursive: true });
  db = new DatabaseSync(CMS_DB);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
function reset() {
  // Drop and recreate the tables rather than deleting the file, so a reseed works while the server has it open.
  const d = open();
  d.exec('PRAGMA foreign_keys = OFF;');
  for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) d.exec(`DROP TABLE IF EXISTS "${name}"`);
  d.exec(SCHEMA);
  d.exec('PRAGMA foreign_keys = ON; VACUUM;');
  return d;
}

let templates = null;
function taxonomy() {
  if (!templates) templates = JSON.parse(fs.readFileSync(TEMPLATES, 'utf8'));
  return templates;
}

// CMS timestamps look like the export: "2026-11-04 12:25:19", local time.
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const flowEntry = (status, at) => `${status} [${at.slice(0, 16)}]`;

function newReference(id) {
  const t = new Date();
  return `C${String(t.getMinutes()).padStart(2, '0')}${String(t.getSeconds()).padStart(2, '0')}${String(id).padStart(8, '0')}`;
}

// ---------- Seeding (called by core/seed.js) ----------

function seedFromCsv(rows, mapPerson) {
  const d = reset();
  const ins = d.prepare(`INSERT INTO complaints (complaint_id, reference, complaint_date, category, sub_category, status, request_source,
    complaint_type, internal_external, priority, description, membership_no, member_name, membership_type, member_phone, member_cnic,
    membership_status, followup_name, followup_cell, phase, sector, street, house, lat_approx, lng_approx, is_paid, paid_at, updated_at,
    assigned_managers, assigned_resources, first_assigned_at, status_flow, status_change_count, resolved_at, resolution_time_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ev = d.prepare('INSERT INTO complaint_events (reference, at, status, note, actor) VALUES (?,?,?,?,?)');
  const seen = new Set();
  d.exec('BEGIN');
  for (const r of rows) {
    if (seen.has(r.reference)) continue; // a few references repeat in the export
    seen.add(r.reference);
    const p = mapPerson(r);
    ins.run(Number(r.complaint_id), r.reference, r.complaint_date, r.category, r.sub_category, r.status, r.request_source,
      r.complaint_type.toLowerCase().replace(/s$/, ''), r.internal_external, Number(r.priority) || 0, r.description, p.membership_no,
      p.name, r.membership_type, p.mobile, p.cnic, r.membership_status, p.name, p.mobile, r.phase, r.sector, r.street, p.house,
      Number(r.lat_approx) || null, Number(r.lng_approx) || null, Number(r.is_paid) || 0, r.paid_at || null, r.updated_at,
      r.assigned_managers, r.assigned_resources, r.first_assigned_at || null, r.status_flow, Number(r.status_change_count) || 1,
      r.resolved_at || null, r.resolution_time_hours === '' ? null : Number(r.resolution_time_hours));
    for (const part of r.status_flow.split(' -> ')) {
      const m = part.match(/^(.*) \[(.*)\]$/);
      if (m) ev.run(r.reference, `${m[2]}:00`, m[1], null, 'cms');
    }
  }
  d.exec('COMMIT');
  return seen.size;
}

// ---------- Queries ----------

function rowOut(c) {
  if (!c) return null;
  const { details_json, idempotency_key, ...rest } = c;
  return { ...rest, details: details_json ? JSON.parse(details_json) : {}, open: OPEN_STATUSES.includes(c.status) };
}

function getComplaint(ref) {
  const d = open();
  const c = rowOut(d.prepare('SELECT * FROM complaints WHERE reference = ?').get(ref));
  if (!c) return null;
  c.events = d.prepare('SELECT at, status, note, actor FROM complaint_events WHERE reference = ? ORDER BY id').all(ref);
  return c;
}

function listComplaints(q) {
  const where = [], args = [];
  const eq = (col, v) => { if (v) { where.push(`${col} = ?`); args.push(v); } };
  eq('member_cnic', q.cnic); eq('phase', q.phase); eq('sector', q.sector); eq('street', q.street);
  eq('sub_category', q.sub_category); eq('category', q.category); eq('followup_cell', q.mobile); eq('reference', q.reference);
  if (q.updated_since) { where.push('updated_at > ?'); args.push(q.updated_since); }
  if (q.since) { where.push('complaint_date > ?'); args.push(q.since); }
  if (q.open === '1') where.push(`status IN (${OPEN_STATUSES.map(() => '?').join(',')})`), args.push(...OPEN_STATUSES);
  const limit = Math.min(Number(q.limit) || 50, 200);
  const sql = `SELECT * FROM complaints ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY complaint_date DESC LIMIT ${limit}`;
  return open().prepare(sql).all(...args).map(rowOut);
}

// ---------- Commands ----------

const REQUIRED = ['category', 'sub_category', 'description', 'request_source', 'member_cnic', 'phase', 'sector', 'street', 'followup_cell'];

function validate(p) {
  const missing = REQUIRED.filter(f => !String(p[f] ?? '').trim());
  const sub = taxonomy().sub_categories.find(s => s.category === p.category && s.sub_category === p.sub_category);
  const errors = [];
  if (p.category && p.sub_category && !sub) errors.push(`Unknown category/sub-category: ${p.category} / ${p.sub_category}`);
  return { missing, errors, sub };
}

function createComplaint(p, idempotencyKey) {
  const d = open();
  if (idempotencyKey) {
    const prev = d.prepare('SELECT reference FROM complaints WHERE idempotency_key = ?').get(idempotencyKey);
    if (prev) return { status: 200, body: getComplaint(prev.reference), replay: true };
  }
  const v = validate(p);
  if (v.missing.length || v.errors.length) return { status: 422, body: { error: 'Complaint does not match the template', missing: v.missing, errors: v.errors } };
  const id = (d.prepare('SELECT MAX(complaint_id) AS m FROM complaints').get().m || 650000) + 1;
  const ref = newReference(id);
  const at = stamp();
  d.prepare(`INSERT INTO complaints (complaint_id, reference, complaint_date, category, sub_category, status, request_source, complaint_type,
    internal_external, priority, description, membership_no, member_name, membership_type, member_phone, member_cnic, membership_status,
    followup_name, followup_cell, phase, sector, street, house, lat_approx, lng_approx, is_paid, paid_at, updated_at, status_flow,
    status_change_count, details_json, idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, ref, at, p.category, p.sub_category, 'Submitted', p.request_source, p.complaint_type || 'complaint', 'External',
    Number(p.priority) || 0, String(p.description).slice(0, 2000), p.membership_no || null, p.member_name || null, p.membership_type || null,
    p.followup_cell || null, p.member_cnic, p.membership_status || null, p.followup_name || p.member_name || null, p.followup_cell,
    p.phase, p.sector, p.street, p.house || null, Number(p.lat_approx) || null, Number(p.lng_approx) || null,
    p.is_paid ? 1 : 0, p.is_paid ? at : null, at, flowEntry('Submitted', at), 1, JSON.stringify(p.details || {}), idempotencyKey || null);
  d.prepare('INSERT INTO complaint_events (reference, at, status, note, actor) VALUES (?,?,?,?,?)')
    .run(ref, at, 'Submitted', `Received through ${p.request_source}.`, 'integration');
  return { status: 201, body: getComplaint(ref) };
}

const listeners = [];
function onEvent(fn) { listeners.push(fn); }

function changeStatus(ref, status, note, actor = 'cms') {
  const d = open();
  const c = d.prepare('SELECT * FROM complaints WHERE reference = ?').get(ref);
  if (!c) return null;
  const at = stamp();
  const previous = c.status;
  const resolved = status === 'Resolved';
  const hours = resolved ? Math.round((new Date(at.replace(' ', 'T')) - new Date(c.complaint_date.replace(' ', 'T'))) / 360000) / 10 : c.resolution_time_hours;
  d.prepare(`UPDATE complaints SET status = ?, updated_at = ?, status_flow = ?, status_change_count = status_change_count + 1,
    resolved_at = CASE WHEN ? THEN ? ELSE resolved_at END, resolution_time_hours = ? WHERE reference = ?`)
    .run(status, at, `${c.status_flow} -> ${flowEntry(status, at)}`, resolved ? 1 : 0, at, hours, ref);
  d.prepare('INSERT INTO complaint_events (reference, at, status, note, actor) VALUES (?,?,?,?,?)').run(ref, at, status, note || null, actor);
  const event = { type: 'complaint.status_changed', id: crypto.randomUUID(), at, reference: ref, previous, status, note: note || null,
    member_cnic: c.member_cnic, category: c.category, sub_category: c.sub_category, actor };
  for (const fn of listeners) Promise.resolve().then(() => fn(event)).catch(e => console.error(`[cms] event delivery failed: ${e.message}`));
  return getComplaint(ref);
}

function addInfo(ref, text, actor = 'resident') {
  const d = open();
  if (!d.prepare('SELECT 1 FROM complaints WHERE reference = ?').get(ref)) return null;
  const at = stamp();
  d.prepare('UPDATE complaints SET updated_at = ? WHERE reference = ?').run(at, ref);
  d.prepare('INSERT INTO complaint_events (reference, at, status, note, actor) VALUES (?,?,?,?,?)').run(ref, at, null, String(text).slice(0, 1000), actor);
  return getComplaint(ref);
}

// Field-team simulation for demos: what the real CMS does when staff act on a complaint.
const STAFF = ['Staff_3677', 'Staff_7412', 'Staff_20215', 'Staff_63'];
function simulateAdvance(ref) {
  const c = open().prepare('SELECT status, sub_category FROM complaints WHERE reference = ?').get(ref);
  if (!c) return null;
  const staff = STAFF[ref.charCodeAt(ref.length - 1) % STAFF.length];
  if (['Submitted', 'Reopen', 'Pending'].includes(c.status)) {
    open().prepare('UPDATE complaints SET assigned_resources = ?, first_assigned_at = COALESCE(first_assigned_at, ?) WHERE reference = ?').run(`${staff} (In Process)`, stamp(), ref);
    return changeStatus(ref, 'In Process', `Assigned to the ${c.sub_category} team (${staff}).`, 'field-team');
  }
  if (c.status === 'In Process') return changeStatus(ref, 'Resolved', 'Work completed by the field team.', 'field-team');
  return getComplaint(ref);
}

// ---------- REST API (/cms/api) ----------

async function handle(req, res, url, { readBody, send }) {
  const p = url.pathname.replace(/^\/cms\/api/, '');
  const q = Object.fromEntries(url.searchParams);
  let m;
  if (p === '/taxonomy' && req.method === 'GET') {
    const t = taxonomy();
    return send(res, 200, { version: t.version, statuses: t.statuses, common_fields: t.common_fields, groups: t.groups,
      sub_categories: t.sub_categories.map(({ model, examples, ...s }) => s) });
  }
  if (p === '/complaints' && req.method === 'GET') return send(res, 200, listComplaints(q));
  if (p === '/complaints' && req.method === 'POST') {
    const r = createComplaint(await readBody(req), req.headers['idempotency-key']);
    return send(res, r.status, r.body);
  }
  if ((m = p.match(/^\/complaints\/(\w+)$/)) && req.method === 'GET') {
    const c = getComplaint(m[1]);
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/complaints\/(\w+)\/info$/)) && req.method === 'POST') {
    const c = addInfo(m[1], (await readBody(req)).text);
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/complaints\/(\w+)\/reopen$/)) && req.method === 'POST') {
    const b = await readBody(req);
    const c = changeStatus(m[1], 'Reopen', b.reason ? `Reopened by the resident: ${String(b.reason).slice(0, 300)}` : 'Reopened by the resident.', 'resident');
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/complaints\/(\w+)\/feedback$/)) && req.method === 'POST') {
    const b = await readBody(req);
    const c = b.resolved
      ? changeStatus(m[1], 'Closed', 'The resident confirmed the problem is fixed.', 'resident')
      : changeStatus(m[1], 'Reopen', `The resident says it is not fixed${b.note ? ': ' + String(b.note).slice(0, 300) : '.'}`, 'resident');
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/complaints\/(\w+)\/cancel$/)) && req.method === 'POST') {
    const c = changeStatus(m[1], 'Cancel', 'Cancelled by the resident.', 'resident');
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/_sim\/complaints\/(\w+)\/advance$/)) && req.method === 'POST') {
    const c = simulateAdvance(m[1]);
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/_sim\/complaints\/(\w+)\/status$/)) && req.method === 'POST') {
    const b = await readBody(req);
    if (!taxonomy().statuses.includes(b.status)) return send(res, 400, { error: 'Unknown status' });
    const c = changeStatus(m[1], b.status, b.note, 'field-team');
    return c ? send(res, 200, c) : send(res, 404, { error: 'Not found' });
  }
  return send(res, 404, { error: 'Unknown CMS route' });
}

module.exports = { open, reset, seedFromCsv, taxonomy, getComplaint, listComplaints, createComplaint, changeStatus,
  addInfo, simulateAdvance, onEvent, handle, EVENT_KEY, OPEN_STATUSES, stamp };
