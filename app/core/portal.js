// Member and resident portal data, read from core.sqlite, plus notifications and CMS event handling.
// Every lookup is by CNIC, the one ID shared across the portals and the CMS.

const crypto = require('crypto');
const db = require('./db');

const today = () => new Date().toISOString().slice(0, 10);

// The CMS stores membership_type and membership_status as codes; these labels are a guess until DHA confirms them.
const MEMBERSHIP_TYPE = { 0: 'Not a member (tenant or family)', 1: 'Member', 2: 'Member (second property)' };

function personas() {
  return db.all('SELECT cnic, name, persona, persona_label AS label FROM persons WHERE persona IS NOT NULL ORDER BY rowid');
}

function installmentSummary(membership_no) {
  const rows = db.all('SELECT no, label, due_date, amount, paid_amount, paid_on FROM installments WHERE membership_no = ? ORDER BY no', membership_no);
  if (!rows.length) return null;
  const t = today();
  const schedule = rows.map(r => ({ ...r, state: r.paid_amount >= r.amount ? 'paid' : r.due_date < t ? 'overdue' : 'upcoming' }));
  const overdue = schedule.filter(r => r.state === 'overdue');
  const next = schedule.find(r => r.state === 'upcoming');
  return {
    schedule,
    total: rows.reduce((s, r) => s + r.amount, 0),
    paid: rows.reduce((s, r) => s + r.paid_amount, 0),
    overdue_count: overdue.length,
    overdue_amount: overdue.reduce((s, r) => s + r.amount - r.paid_amount, 0),
    next_due: next ? { label: next.label, due_date: next.due_date, amount: next.amount } : null,
    remaining: schedule.filter(r => r.state !== 'paid').length,
  };
}

function bills(consumer_id) {
  const rows = db.all('SELECT month, amount, due_date, paid_on, payment_ref FROM bills WHERE consumer_id = ? ORDER BY month DESC', consumer_id);
  const t = today();
  return rows.map(r => ({ ...r, state: r.paid_on ? 'paid' : r.due_date < t ? 'overdue' : 'due' }));
}

// Society bills paid in the app. Demo: no money moves. The channels are the ones in DHA's membership portal, plus 1Bill.
const BILL_CHANNELS = { ipg: 'Debit or credit card', '1bill': '1Bill', eft: 'Bank transfer (EFT)', rda: 'Roshan Digital Account' };

function payBill(cnic, consumerId, channel) {
  if (!db.get('SELECT 1 AS ok FROM residences WHERE cnic = ? AND consumer_id = ?', cnic, consumerId)) throw Object.assign(new Error('That bill is not in your account.'), { status: 404 });
  if (!BILL_CHANNELS[channel]) throw Object.assign(new Error('Please choose how to pay.'), { status: 400 });
  const unpaid = bills(consumerId).filter(b => b.state !== 'paid');
  if (!unpaid.length) throw Object.assign(new Error('This bill is already paid.'), { status: 409 });
  const ref = `DEMO${String(Date.now()).slice(-9)}`;
  const amount = unpaid.reduce((s, b) => s + b.amount, 0);
  db.tx(() => unpaid.forEach(b => db.run('UPDATE bills SET paid_on = ?, payment_ref = ? WHERE consumer_id = ? AND month = ?', today(), ref, consumerId, b.month)));
  notify(cnic, { kind: 'payment', title: 'Society bill paid', body: `Rs ${amount.toLocaleString('en-PK')} received. Reference ${ref}.` });
  log(cnic, 'bill_paid_online', { consumer_id: consumerId, amount, channel });
  return { ok: true, amount, reference: ref, channel: BILL_CHANNELS[channel] };
}

function me(cnic) {
  const person = db.get('SELECT cnic, name, mobile, email, persona, persona_label AS label FROM persons WHERE cnic = ?', cnic);
  if (!person) return null;
  const memberships = db.all(`SELECT m.membership_no, m.membership_type, m.status, m.allotted_on, m.document, p.*
    FROM memberships m LEFT JOIN plots p ON p.plot_id = m.plot_id WHERE m.cnic = ? ORDER BY m.allotted_on`, cnic)
    .map(m => ({ ...m, installments: installmentSummary(m.membership_no), build_done: buildDone(m.membership_no) }));
  const residences = db.all(`SELECT r.consumer_id, r.since, p.* FROM residences r JOIN plots p ON p.plot_id = r.plot_id WHERE r.cnic = ?`, cnic)
    .map(r => {
      const b = r.consumer_id ? bills(r.consumer_id) : [];
      return { ...r, bills: b, outstanding: b.filter(x => x.state !== 'paid').reduce((s, x) => s + x.amount, 0) };
    });
  const roles = [];
  if (memberships.length) roles.push('member');
  if (residences.length) roles.push('resident');
  if (memberships.some(m => !m.built)) roles.push('plot_owner');
  if (!roles.length) roles.push('prospect');

  // Home address for complaints: where they live, else their first plot.
  const res = residences[0];
  const mem = res ? memberships.find(m => m.plot_id === res.plot_id) || memberships[0] : memberships[0];
  const place = res || mem;
  const home = place ? {
    plot_id: place.plot_id, phase: place.phase, sector: place.sector, street: place.street, house: place.plot_no,
    lat: place.lat, lng: place.lng, consumer_id: res?.consumer_id || null,
    membership_no: mem?.membership_no || null, membership_type: mem?.membership_type || null, membership_status: mem?.status || null,
    lives_here: !!res,
  } : null;
  return { ...person, roles, home, memberships, residences };
}

const addressLine = h => h ? [h.house && `House ${h.house}`, h.street && `Street ${h.street}`, h.sector && `Sector ${h.sector}`, h.phase && `Phase ${h.phase}`].filter(Boolean).join(', ') : '';

// ---------- Notifications ----------

function notify(cnic, { kind, title, body, ref, actions }) {
  db.run('INSERT INTO notifications (cnic, at, kind, title, body, ref, actions) VALUES (?,?,?,?,?,?,?)',
    cnic, new Date().toISOString(), kind, title, body || null, ref || null, actions ? JSON.stringify(actions) : null);
}

function notifications(cnic) {
  return db.all('SELECT * FROM notifications WHERE cnic = ? ORDER BY id DESC LIMIT 50', cnic)
    .map(n => ({ ...n, actions: n.actions ? JSON.parse(n.actions) : [], read: !!n.read }));
}

const unread = cnic => db.get('SELECT COUNT(*) AS n FROM notifications WHERE cnic = ? AND read = 0', cnic).n;
const latestUnread = cnic => db.get('SELECT id, title, body, ref, kind FROM notifications WHERE cnic = ? AND read = 0 ORDER BY id DESC LIMIT 1', cnic) || null;

function markRead(cnic, id) {
  if (id === 'all') db.run('UPDATE notifications SET read = 1 WHERE cnic = ?', cnic);
  else db.run('UPDATE notifications SET read = 1 WHERE cnic = ? AND id = ?', cnic, Number(id));
}

// Resolution notices carry Confirm / Not fixed buttons; once the resident answers, they go.
function clearActions(cnic, ref) {
  db.run("UPDATE notifications SET actions = NULL, read = 1 WHERE cnic = ? AND ref = ? AND actions IS NOT NULL", cnic, ref);
}

function follow(cnic, ref) {
  db.run('INSERT OR IGNORE INTO follows (cnic, ref, at) VALUES (?,?,?)', cnic, ref, new Date().toISOString());
}
const followed = cnic => db.all('SELECT ref FROM follows WHERE cnic = ?', cnic).map(r => r.ref);
const isFollower = (cnic, ref) => !!db.get('SELECT 1 FROM follows WHERE cnic = ? AND ref = ?', cnic, ref);

// ---------- Construction checklist (the owner ticks stages; DHA's Building Control workflow comes later) ----------

const BUILD_STAGES = ['possession', 'drawings', 'contractor', 'demarcation', 'construction', 'occupation', 'completion', 'connections'];

function buildDone(membershipNo) {
  return db.all('SELECT stage FROM build_progress WHERE membership_no = ?', membershipNo).map(r => r.stage);
}

function setBuildStage(cnic, membershipNo, stage, done) {
  if (!BUILD_STAGES.includes(stage)) throw Object.assign(new Error('Unknown stage.'), { status: 400 });
  const m = db.get('SELECT membership_no FROM memberships WHERE membership_no = ? AND cnic = ?', membershipNo, cnic);
  if (!m) throw Object.assign(new Error('That plot is not in your account.'), { status: 404 });
  if (done) db.run('INSERT OR REPLACE INTO build_progress (membership_no, stage, done_at) VALUES (?,?,?)', membershipNo, stage, new Date().toISOString());
  else db.run('DELETE FROM build_progress WHERE membership_no = ? AND stage = ?', membershipNo, stage);
  log(cnic, done ? 'build_stage_done' : 'build_stage_undone', { membership_no: membershipNo, stage });
  return { membership_no: membershipNo, done: buildDone(membershipNo) };
}

function log(cnic, event, detail) {
  db.run('INSERT INTO channel_log (at, cnic, event, detail) VALUES (?,?,?,?)', new Date().toISOString(), cnic || null, event,
    detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail));
}

// ---------- CMS → app events ----------

const STATUS_TEXT = {
  'In Process': { title: 'team assigned', body: 'A field team is working on it.' },
  Pending: { title: 'on hold', body: 'The team has put it on hold.' },
  Resolved: { title: 'marked resolved', body: 'The field team says the work is done. Is the problem fixed?' },
  Closed: { title: 'closed', body: 'This complaint is now closed.' },
  Reopen: { title: 'reopened', body: 'The complaint is open again and goes back to the team.' },
  Cancel: { title: 'cancelled', body: 'This complaint was cancelled.' },
  'Cancel/Not at Home': { title: 'team could not get in', body: 'The team visited but no one was at home. You can ask for another visit.' },
};

function handleCmsEvent(ev) {
  if (!ev || ev.type !== 'complaint.status_changed' || !ev.reference) return { ok: false, error: 'Unknown event' };
  db.open().exec('CREATE TABLE IF NOT EXISTS cms_events (id TEXT PRIMARY KEY, at TEXT, reference TEXT, status TEXT)');
  if (!db.run('INSERT OR IGNORE INTO cms_events (id, at, reference, status) VALUES (?,?,?,?)', ev.id || crypto.randomUUID(), ev.at, ev.reference, ev.status).changes) {
    return { ok: true, duplicate: true };
  }

  const text = STATUS_TEXT[ev.status] || { title: ev.status.toLowerCase(), body: '' };
  const title = `${ev.sub_category}: ${text.title}`;
  const body = [text.body, ev.note].filter(Boolean).join(' ');
  const owner = ev.member_cnic && db.get('SELECT cnic FROM persons WHERE cnic = ?', ev.member_cnic);
  let n = 0;
  if (owner) {
    // Nothing to tell the resident about their own action (feedback, reopen, cancel).
    if (ev.actor !== 'resident') {
      const actions = ev.status === 'Resolved' ? ['confirm', 'reopen'] : ev.status === 'Cancel/Not at Home' ? ['reopen'] : null;
      if (ev.status === 'Resolved' || ev.status === 'Cancel/Not at Home') clearActions(owner.cnic, ev.reference);
      notify(owner.cnic, { kind: ev.status === 'Resolved' ? 'resolved' : 'status', title, body, ref: ev.reference, actions });
      n++;
    }
  }
  for (const f of db.all('SELECT cnic FROM follows WHERE ref = ? AND cnic != ?', ev.reference, ev.member_cnic || '')) {
    notify(f.cnic, { kind: 'followed', title: `${title} (a complaint you follow)`, body: text.body, ref: ev.reference });
    n++;
  }
  log(ev.member_cnic, 'cms_event', { ref: ev.reference, status: ev.status, notified: n });
  return { ok: true, notified: n };
}

module.exports = { personas, me, addressLine, notify, notifications, unread, latestUnread, markRead, clearActions, follow, followed, isFollower,
  log, handleCmsEvent, MEMBERSHIP_TYPE, buildDone, setBuildStage, payBill };
