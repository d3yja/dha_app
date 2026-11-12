// Membership portal stub: stands in for DHA's membership portal until its web services are connected.
// Like the CMS stub, it runs in the same Node process for the demo but behaves like a separate service:
//   - its own database (store/membership_stub.sqlite), loaded from DHA's sample dump (data/membership_sample.json,
//     made from samples/DHA_Sample_Data_n.xlsx), keeping DHA's table and column names
//   - its own REST API under /membership/api (the contract the real web services should offer)
//   - it pushes application and voucher changes to the app (POST {APP}/api/membership-events) with a shared key
// Office actions (scrutiny, voucher generation, approval) and voucher payments are simulated under /membership/api/_sim/*.
//
// The dump keeps site plans (directorate 3) and building plans (directorate 2) in two tables with the same
// columns; both are tpbc_user_processes, so they are one table here.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const STORE_DIR = path.resolve(__dirname, '..', 'store');
const DB_FILE = path.join(STORE_DIR, 'membership_stub.sqlite');
const SAMPLE = path.resolve(__dirname, '..', '..', 'data', 'membership_sample.json');
const EVENT_KEY = process.env.MEMBERSHIP_EVENT_KEY || 'demo-membership-secret';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tbl_memrecords (
  u_id INTEGER PRIMARY KEY, membershipno TEXT UNIQUE NOT NULL, memname TEXT, plotno TEXT, psize TEXT, phase TEXT, sector TEXT,
  street TEXT, plno TEXT, cnic TEXT NOT NULL, allotdate TEXT, rel TEXT, relname TEXT, currmemstatus TEXT, memid INTEGER,
  plotid INTEGER, share TEXT, mobno TEXT, email TEXT, consumerid TEXT, surchargeid TEXT, mailaddrs TEXT, ownertype TEXT,
  mstatus TEXT, dhatype TEXT, propertytype TEXT, block TEXT, zone TEXT
);
CREATE TABLE IF NOT EXISTS tp_properties (
  id TEXT PRIMARY KEY, property_code TEXT UNIQUE, property_no TEXT, size_text TEXT, size_marla REAL, total_size_feet REAL,
  dimensions_front_side TEXT, is_subplot INTEGER, area_id INTEGER, category_id INTEGER, project_id TEXT,
  property_status_id INTEGER, property_type_id INTEGER, created_on TEXT, updated_on TEXT
);
CREATE TABLE IF NOT EXISTS tpbc_user_processes (
  id INTEGER PRIMARY KEY, tpbc_process_id INTEGER, tpbc_directorate_id INTEGER, tpbc_category_id INTEGER, tpbc_phase_id TEXT,
  tpbc_process_timeline_id INTEGER, code TEXT, membership_no TEXT, plot_no TEXT, status TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS tpbc_user_process_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tpbc_user_process_id INTEGER NOT NULL, status TEXT, remarks TEXT, is_show_user INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS tpbc_user_process_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tpbc_user_process_id INTEGER NOT NULL, challan_type_id INTEGER, transaction_id TEXT,
  bank_type TEXT, amount INTEGER, due_date TEXT, fine_amount INTEGER, proc_fee INTEGER, status TEXT, remarks TEXT,
  paid_amount INTEGER, paid_at TEXT, verified_at TEXT, credit_date TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS payment_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tpbc_user_process_payment_id INTEGER NOT NULL, tpbc_directorate_id INTEGER,
  description TEXT, amount_without_gst INTEGER, gst INTEGER, amount_with_gst INTEGER, remarks TEXT
);
CREATE INDEX IF NOT EXISTS ix_mem_cnic ON tbl_memrecords(cnic);
CREATE INDEX IF NOT EXISTS ix_proc_mem ON tpbc_user_processes(membership_no);
CREATE INDEX IF NOT EXISTS ix_stat_proc ON tpbc_user_process_statuses(tpbc_user_process_id);
CREATE INDEX IF NOT EXISTS ix_pay_proc ON tpbc_user_process_payments(tpbc_user_process_id);
CREATE INDEX IF NOT EXISTS ix_pd_pay ON payment_details(tpbc_user_process_payment_id);
`;

let db = null;
function open() {
  if (db) return db;
  fs.mkdirSync(STORE_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
function reset() {
  const d = open();
  for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) d.exec(`DROP TABLE IF EXISTS "${name}"`);
  d.exec(SCHEMA);
  return d;
}
const tx = fn => { const d = open(); d.exec('BEGIN'); try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } };

// Timestamps as the dump writes them, without the "+05" offset: "2026-10-25 09:23:55" (Pakistan time).
const ts = v => (v == null ? null : String(v).slice(0, 19));
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const date = v => (v == null ? null : String(v).slice(0, 10));
const bool = v => (v === true || v === 'True' || v === 1 || v === '1' ? 1 : 0);

const MEM_COLS = ['u_id', 'membershipno', 'memname', 'plotno', 'psize', 'phase', 'sector', 'street', 'plno', 'cnic', 'allotdate', 'rel', 'relname',
  'currmemstatus', 'memid', 'plotid', 'share', 'mobno', 'email', 'consumerid', 'surchargeid', 'mailaddrs', 'ownertype', 'mstatus', 'dhatype',
  'propertytype', 'block', 'zone'];
const PROP_COLS = ['id', 'property_code', 'property_no', 'size_text', 'size_marla', 'total_size_feet', 'dimensions_front_side', 'is_subplot',
  'area_id', 'category_id', 'project_id', 'property_status_id', 'property_type_id', 'created_on', 'updated_on'];

function insertRow(table, cols, row) {
  open().prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map(c => row[c] ?? null));
}

// ---------- Seeding (called by core/seed.js) ----------

function loadSample() {
  return JSON.parse(fs.readFileSync(SAMPLE, 'utf8')).sheets;
}

// identity(row) gives each member record its demo identity: { cnic, mobno } (the dump masks both).
function seedFromSample(identity) {
  const s = loadSample();
  reset();
  tx(() => {
    for (const r of s.tbl_memrecords) insertRow('tbl_memrecords', MEM_COLS, { ...r, ...identity(r), allotdate: date(r.allotdate) });
    for (const r of s.tp_properties) insertRow('tp_properties', PROP_COLS, { ...r, is_subplot: bool(r.is_subplot), created_on: ts(r.created_on), updated_on: ts(r.updated_on) });
    const proc = open().prepare(`INSERT INTO tpbc_user_processes (id, tpbc_process_id, tpbc_directorate_id, tpbc_category_id, tpbc_phase_id,
      tpbc_process_timeline_id, code, membership_no, plot_no, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const r of [...s.site_plan, ...s.house_construction]) {
      proc.run(r.id, r.tpbc_process_id, r.tpbc_directorate_id, r.tpbc_category_id, String(r.tpbc_phase_id), r.tpbc_process_timeline_id, r.code,
        r.membership_no, r.plot_no, r.status, ts(r.created_at), ts(r.updated_at));
    }
    const st = open().prepare('INSERT INTO tpbc_user_process_statuses (id, tpbc_user_process_id, status, remarks, is_show_user, created_at) VALUES (?,?,?,?,?,?)');
    for (const r of s.tpbc_user_process_statuses) st.run(r.id, r.tpbc_user_process_id, r.status, r.remarks, bool(r.is_show_user), ts(r.created_at));
    const pay = open().prepare(`INSERT INTO tpbc_user_process_payments (id, tpbc_user_process_id, challan_type_id, transaction_id, bank_type, amount,
      due_date, fine_amount, proc_fee, status, remarks, paid_amount, paid_at, verified_at, credit_date, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const r of s.tpbc_user_process_payments) {
      pay.run(r.id, r.tpbc_user_process_id, r.challan_type_id, r.transaction_id, r.bank_type, r.amount, date(r.due_date), r.fine_amount,
        r.proc_fee, r.status, r.remarks, r.paid_amount, ts(r.paid_at), ts(r.verified_at), date(r.credit_date), ts(r.created_at));
    }
    const pd = open().prepare(`INSERT INTO payment_details (id, tpbc_user_process_payment_id, tpbc_directorate_id, description, amount_without_gst,
      gst, amount_with_gst, remarks) VALUES (?,?,?,?,?,?,?,?)`);
    for (const r of s.payment_details) pd.run(r.id, r.tpbc_user_process_payment_id, r.tpbc_directorate_id, r.description, r.amount_without_gst, r.gst, r.amount_with_gst, r.remarks);
  });
  return s.tbl_memrecords.length;
}

// Demo personas are added the same way the real portal would hold them.
function addMember(row, property) {
  insertRow('tbl_memrecords', MEM_COLS, { u_id: nextId('tbl_memrecords', 'u_id'), memid: null, plotid: null, share: '1', currmemstatus: '1', mstatus: '1', surchargeid: '0', ...row });
  if (property) insertRow('tp_properties', PROP_COLS, { id: crypto.randomUUID(), is_subplot: 0, property_type_id: 1, property_status_id: 36, ...property });
}
const nextId = (table, col = 'id') => (open().prepare(`SELECT MAX(${col}) AS m FROM ${table}`).get().m || 0) + 1;

// A voucher priced like the first sample voucher of the same directorate (the dump's own fee heads and amounts).
function createVoucher(procId, directorate, { dueDays = 10, at = stamp(), status = 'pending' } = {}) {
  const d = open();
  const tpl = d.prepare(`SELECT p.id FROM tpbc_user_process_payments p JOIN tpbc_user_processes u ON u.id = p.tpbc_user_process_id
    WHERE u.tpbc_directorate_id = ? ORDER BY p.id LIMIT 1`).get(directorate);
  const items = tpl ? d.prepare('SELECT description, amount_without_gst, gst, amount_with_gst, remarks FROM payment_details WHERE tpbc_user_process_payment_id = ?').all(tpl.id) : [];
  const amount = items.reduce((s, x) => s + (x.amount_with_gst || 0), 0);
  const due = new Date(at.replace(' ', 'T'));
  due.setDate(due.getDate() + dueDays);
  const id = nextId('tpbc_user_process_payments');
  d.prepare(`INSERT INTO tpbc_user_process_payments (id, tpbc_user_process_id, challan_type_id, amount, due_date, fine_amount, status, remarks, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, procId, 1, amount, stamp(due).slice(0, 10), 0, status, items.find(x => x.remarks)?.remarks || null, at);
  const ins = d.prepare('INSERT INTO payment_details (tpbc_user_process_payment_id, tpbc_directorate_id, description, amount_without_gst, gst, amount_with_gst, remarks) VALUES (?,?,?,?,?,?,?)');
  for (const x of items) ins.run(id, directorate, x.description, x.amount_without_gst, x.gst, x.amount_with_gst, x.remarks);
  return id;
}

// Seed helper: an application with its visible history. steps: [[status, daysAgo, remarks?], ...], oldest first.
function addApplication({ membership_no, plot_no, phase, directorate, process_id, timeline_id, steps }) {
  const d = open();
  const id = nextId('tpbc_user_processes');
  const when = days => stamp(new Date(Date.now() - days * 86400000));
  const last = steps.at(-1);
  d.prepare(`INSERT INTO tpbc_user_processes (id, tpbc_process_id, tpbc_directorate_id, tpbc_category_id, tpbc_phase_id, tpbc_process_timeline_id,
    code, membership_no, plot_no, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, process_id, directorate, directorate === 3 ? 2 : 1, phase, timeline_id, crypto.randomBytes(4).toString('base64url').slice(0, 6),
      membership_no, plot_no, last[0], when(steps[0][1]), when(last[1]));
  for (const [status, days, remarks] of steps) {
    if (status === 'Voucher Paid') { payVoucher(id, { at: when(days), quiet: true }); continue; } // adds the paid and hidden verified steps
    addStatus(id, status, remarks || null, true, when(days));
    if (status === 'Voucher Generated') createVoucher(id, directorate, { at: when(days), dueDays: 10 });
  }
  d.prepare('UPDATE tpbc_user_processes SET status = ?, updated_at = ? WHERE id = ?').run(last[0], when(last[1]), id);
  return id;
}

function addStatus(procId, status, remarks, visible = true, at = stamp()) {
  open().prepare('INSERT INTO tpbc_user_process_statuses (tpbc_user_process_id, status, remarks, is_show_user, created_at) VALUES (?,?,?,?,?)')
    .run(procId, status, remarks, visible ? 1 : 0, at);
}

// ---------- Reads ----------

function members({ cnic, membership_no }) {
  const where = cnic ? 'm.cnic = ?' : 'm.membershipno = ?';
  return open().prepare(`SELECT m.*, p.size_marla, p.total_size_feet, p.dimensions_front_side, p.is_subplot, p.area_id, p.category_id,
    p.property_status_id FROM tbl_memrecords m LEFT JOIN tp_properties p ON p.property_code = m.plotno WHERE ${where} ORDER BY m.allotdate`)
    .all(cnic || membership_no);
}

function vouchers(procId) {
  const d = open();
  return d.prepare('SELECT * FROM tpbc_user_process_payments WHERE tpbc_user_process_id = ? ORDER BY id').all(procId)
    .map(v => ({ ...v, items: d.prepare('SELECT description, amount_without_gst, gst, amount_with_gst, remarks FROM payment_details WHERE tpbc_user_process_payment_id = ? ORDER BY id').all(v.id) }));
}

// The member sees only the statuses DHA marks is_show_user (the dump hides "Voucher Verified").
function application(id, { all = false } = {}) {
  const d = open();
  const a = d.prepare('SELECT * FROM tpbc_user_processes WHERE id = ?').get(id);
  if (!a) return null;
  const history = d.prepare(`SELECT status, remarks, created_at AS at FROM tpbc_user_process_statuses WHERE tpbc_user_process_id = ? ${all ? '' : 'AND is_show_user = 1'}
    ORDER BY created_at, id`).all(id);
  return { ...a, history, vouchers: vouchers(id) };
}

function applications({ membership_no, cnic }) {
  const nos = membership_no ? [membership_no] : members({ cnic }).map(m => m.membershipno);
  if (!nos.length) return [];
  return open().prepare(`SELECT id FROM tpbc_user_processes WHERE membership_no IN (${nos.map(() => '?').join(',')}) ORDER BY created_at DESC`)
    .all(...nos).map(r => application(r.id));
}

// ---------- Changes (office and payment simulation) ----------

const listeners = [];
function onEvent(fn) { listeners.push(fn); }
function emit(type, procId, extra = {}) {
  const a = application(procId);
  const m = open().prepare('SELECT cnic, memname FROM tbl_memrecords WHERE membershipno = ?').get(a.membership_no);
  const ev = { type, id: crypto.randomUUID(), at: stamp(), application_id: a.id, membership_no: a.membership_no, plot_no: a.plot_no,
    member_cnic: m?.cnic || null, directorate_id: a.tpbc_directorate_id, process_id: a.tpbc_process_id, status: a.status, ...extra };
  for (const fn of listeners) Promise.resolve().then(() => fn(ev)).catch(e => console.error(`[membership] event delivery failed: ${e.message}`));
}

function setStatus(procId, status, remarks, { at = stamp(), quiet = false } = {}) {
  open().prepare('UPDATE tpbc_user_processes SET status = ?, updated_at = ? WHERE id = ?').run(status, at, procId);
  addStatus(procId, status, remarks, true, at);
  if (!quiet) emit('application.status_changed', procId, { remarks: remarks || null });
}

// The member pays the open voucher (demo: no money moves). The bank confirms it, then DHA verifies it (a hidden step).
function payVoucher(procId, { channel = 'ipg', at = stamp(), quiet = false } = {}) {
  const d = open();
  const v = d.prepare("SELECT * FROM tpbc_user_process_payments WHERE tpbc_user_process_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(procId);
  if (!v) return null;
  const fee = channel === 'ipg' ? Math.round(v.amount * 0.0095) : channel === 'eft' ? 100 : 0; // the dump's processing fees: about 1% by card, Rs 100 by transfer
  d.prepare(`UPDATE tpbc_user_process_payments SET status = 'paid', bank_type = ?, proc_fee = ?, paid_amount = ?, paid_at = ?, verified_at = ?,
    credit_date = ?, transaction_id = ? WHERE id = ?`).run(channel, fee, v.amount + fee, at, at, at.slice(0, 10), `DEMO${String(Date.now()).slice(-9)}`, v.id);
  setStatus(procId, 'Voucher Paid', 'Dues Paid. please proceed further', { at, quiet: true });
  addStatus(procId, 'Voucher Verified', 'ok', false, at);
  if (!quiet) emit('voucher.paid', procId, { voucher_id: v.id, amount: v.amount + fee });
  return application(procId);
}

// What DHA's office does next at each status (demo). Statuses waiting for the member (pay, fix documents) do not move.
const OFFICE_NEXT = {
  3: { Submitted: 'Scrutiny of Documents for Site Plan', 'Scrutiny of Documents for Site Plan': 'Voucher Generated', 'Incomplete Documents': 'Scrutiny of Documents for Site Plan', 'Voucher Paid': 'Collected' },
  2: { Submitted: 'Under Scrutiny', 'Under Scrutiny': 'Voucher Generated', Observation: 'Under Scrutiny', 'Voucher Paid': 'Approved' },
};
const OFFICE_REMARK = { 'Voucher Generated': 'Voucher generated for the dues', Collected: 'Site Plan', Approved: 'OK', 'Under Scrutiny': 'OK', 'Scrutiny of Documents for Site Plan': 'ok' };

function simulateAdvance(procId) {
  const a = application(procId);
  if (!a) return null;
  const next = OFFICE_NEXT[a.tpbc_directorate_id]?.[a.status];
  if (!next) return { ...a, unchanged: true };
  if (next === 'Voucher Generated') createVoucher(procId, a.tpbc_directorate_id);
  setStatus(procId, next, OFFICE_REMARK[next] || null);
  return application(procId);
}

// ---------- REST API (/membership/api) ----------

async function handle(req, res, url, { readBody, send }) {
  const p = url.pathname.replace(/^\/membership\/api/, '');
  const q = Object.fromEntries(url.searchParams);
  let m;
  if (p === '/members' && req.method === 'GET') {
    if (!q.cnic && !q.membership_no) return send(res, 400, { error: 'cnic or membership_no is required' });
    return send(res, 200, members(q));
  }
  if (p === '/applications' && req.method === 'GET') {
    if (!q.cnic && !q.membership_no) return send(res, 400, { error: 'cnic or membership_no is required' });
    return send(res, 200, applications(q));
  }
  if ((m = p.match(/^\/applications\/(\d+)$/)) && req.method === 'GET') {
    const a = application(Number(m[1]));
    return a ? send(res, 200, a) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/_sim\/applications\/(\d+)\/advance$/)) && req.method === 'POST') {
    const a = simulateAdvance(Number(m[1]));
    return a ? send(res, 200, a) : send(res, 404, { error: 'Not found' });
  }
  if ((m = p.match(/^\/_sim\/applications\/(\d+)\/pay$/)) && req.method === 'POST') {
    const b = await readBody(req);
    const channel = ['ipg', 'eft', 'rda', 'non-rda'].includes(b.channel) ? b.channel : 'ipg';
    const a = payVoucher(Number(m[1]), { channel });
    return a ? send(res, 200, a) : send(res, 409, { error: 'There is no unpaid voucher on this application.' });
  }
  return send(res, 404, { error: 'Unknown membership portal route' });
}

module.exports = { open, reset, seedFromSample, loadSample, addMember, addApplication, members, applications, application,
  simulateAdvance, payVoucher, onEvent, handle, EVENT_KEY, stamp };
