// Demo control panel (#/demo): the before/after view of complaints by channel, live counters of the calls
// this demo session did not need, and the field-team simulator. For staff showing the prototype to DHA.
//
// "Before" comes from DHA's own records, not from assumptions:
//   - the CMS export (samples/Complaints.csv, loaded into the CMS stub): complaints by request_source
//   - the Call Center Report for 1-31 Jan 2025 (samples/*.pptx): calls answered, outbound feedback calls,
//     complaints through each source
// "After" is either what happened in this demo (live, from channel_log and the CMS stub) or a what-if the
// presenter sets with a slider. DHA set no targets for the prototype (design doc), so the what-if is labelled
// a scenario and starts at 0.

const db = require('./db');
const cms = require('../cms_stub/cms');
const portal = require('./portal');

const PORTAL_SOURCE = 'Resident Portal'; // core/intake.js REQUEST_SOURCE
const PHONE_SOURCES = ['Incoming Call'];

// Call Center Report (1-31) Jan 2025, slides 2-3.
const CALL_CENTER_JAN_2025 = {
  source: 'Call Center Report (1-31) Jan 2025',
  calls_answered: 12397,
  feedback_calls: 3043, // outbound calls asking residents whether a complaint was fixed
  complaints_by_source: { 'Incoming Calls': 5783, 'Mobile App / Member Portal': 412, Web: 239, Email: 32, 'Walk In': 27 },
};

// What each portal action stands in for at the call center. One call each: a deliberately plain rule that
// DHA can check against its own call reasons.
const CALL_EQUIVALENT = {
  submitted: { label: 'Complaints made online', instead: 'a call to 1092 to log it' },
  followed_existing: { label: 'Joined a complaint already open nearby', instead: 'a duplicate complaint call' },
  info_added: { label: 'Details added online', instead: 'a call to add details' },
  self_served: { label: 'Answered without a complaint (e.g. bill lookup)', instead: 'a call that did not need a complaint' },
  rule_explained: { label: 'Rule explained (e.g. water bowser 48 h)', instead: 'a call about the rule' },
  confirmed_fixed: { label: 'Fix confirmed online', instead: 'an outbound feedback call' },
  reopened: { label: 'Reopened online', instead: 'an outbound feedback call' },
  question_answered: { label: 'Questions answered by the assistant', instead: 'a helpline call' },
  application_checked: { label: 'Site plan or building plan status checked online', instead: 'a call to ask where the application is' },
  voucher_paid_online: { label: 'Fee voucher paid online', instead: 'a call or visit about the voucher' },
  bill_paid_online: { label: 'Society bill paid online', instead: 'a bank visit or a call about the bill' },
};
// Logged, but not a call saved: the resident still needed a person.
const NOT_SAVED = { handoff: 'Passed to a person (call-center handoff)', intake_abandoned: 'Started a report and left' };

// core/seed.js adds this one demo complaint from a neighbour; it is dated at the last reset and is not part of the export.
const SEEDED_NEIGHBOUR = 'NO SUPPLY SINCE MORNING';

function baseline() {
  const d = cms.open();
  const range = d.prepare('SELECT MIN(complaint_date) AS first, MAX(complaint_date) AS last FROM complaints WHERE request_source != ? AND description != ?').get(PORTAL_SOURCE, SEEDED_NEIGHBOUR);
  const rows = d.prepare('SELECT request_source AS channel, COUNT(*) AS n FROM complaints WHERE request_source != ? AND description != ? GROUP BY 1 ORDER BY 2 DESC').all(PORTAL_SOURCE, SEEDED_NEIGHBOUR);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const days = Math.max(1, Math.round((Date.parse(range.last.replace(' ', 'T')) - Date.parse(range.first.replace(' ', 'T'))) / 864e5));
  const phone = rows.filter(r => PHONE_SOURCES.includes(r.channel)).reduce((s, r) => s + r.n, 0);
  // The sub-categories residents phone in most: the first candidates for the portal.
  const topPhone = d.prepare(`SELECT sub_category, COUNT(*) AS n FROM complaints WHERE request_source IN (${PHONE_SOURCES.map(() => '?').join(',')})
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`).all(...PHONE_SOURCES);
  return {
    source: 'CMS export (samples/Complaints.csv)',
    from: range.first.slice(0, 10), to: range.last.slice(0, 10), days, total, phone,
    phone_share: total ? phone / total : 0,
    per_day: total / days,
    channels: rows.map(r => ({ channel: r.channel, n: r.n, share: r.n / total })),
    top_phone: topPhone.map(r => ({ sub_category: r.sub_category, n: r.n, share: r.n / phone })),
  };
}

function live() {
  const counts = Object.fromEntries(db.all('SELECT event, COUNT(*) AS n FROM channel_log GROUP BY event').map(r => [r.event, r.n]));
  const saved = Object.entries(CALL_EQUIVALENT).map(([event, v]) => ({ event, ...v, n: counts[event] || 0 }));
  const notSaved = Object.entries(NOT_SAVED).map(([event, label]) => ({ event, label, n: counts[event] || 0 }));
  const notified = db.get("SELECT COUNT(*) AS n FROM notifications WHERE kind IN ('status', 'resolved', 'followed', 'application')").n;
  const d = cms.open();
  const portalComplaints = d.prepare('SELECT COUNT(*) AS n FROM complaints WHERE request_source = ?').get(PORTAL_SOURCE).n;
  const open = d.prepare(`SELECT reference, sub_category, status, member_name, phase, sector, complaint_date FROM complaints
    WHERE request_source = ? AND status IN (${cms.OPEN_STATUSES.map(() => '?').join(',')}) ORDER BY complaint_date DESC LIMIT 8`)
    .all(PORTAL_SOURCE, ...cms.OPEN_STATUSES);
  const activity = db.all(`SELECT l.at, l.event, l.detail, p.name FROM channel_log l LEFT JOIN persons p ON p.cnic = l.cnic
    ORDER BY l.id DESC LIMIT 15`).map(r => ({ ...r, detail: safeJson(r.detail) }));
  return {
    calls_saved: saved.reduce((s, r) => s + r.n, 0),
    saved, not_saved: notSaved,
    status_updates_sent: notified, // each is a "what is happening with my complaint?" call nobody had to make
    portal_complaints: portalComplaints,
    open_portal_complaints: open,
    activity,
  };
}

function safeJson(s) {
  try { return s ? JSON.parse(s) : null; } catch { return s; }
}

// What-if: `share` (0-1) of phone complaints move to the portal, and the same share of outbound feedback calls
// is replaced by the resident's own "fixed / not fixed" answer in the portal. Scaled to a month of the CMS export.
function scenario(share) {
  const s = Math.min(1, Math.max(0, Number(share) || 0));
  const b = baseline();
  const month = 30 / b.days;
  const before = b.channels.map(c => ({ channel: c.channel, n: Math.round(c.n * month) }));
  const moved = Math.round(b.phone * month * s);
  const after = before.map(c => ({ ...c, n: PHONE_SOURCES.includes(c.channel) ? c.n - Math.round(c.n * s) : c.n }));
  after.push({ channel: PORTAL_SOURCE, n: moved });
  // Call-center load uses the deck's own month (Jan 2025), so its numbers are not mixed with the export's.
  const cc = CALL_CENTER_JAN_2025;
  const ccComplaintCalls = Math.round(cc.complaints_by_source['Incoming Calls'] * s);
  const feedbackSaved = Math.round(cc.feedback_calls * s);
  const loadBefore = cc.calls_answered + cc.feedback_calls;
  return {
    share: s, per: 'month',
    before, after, moved,
    call_center: { source: cc.source, load_before: loadBefore, complaint_calls_saved: ccComplaintCalls, feedback_calls_saved: feedbackSaved,
      load_after: loadBefore - ccComplaintCalls - feedbackSaved },
  };
}

function summary(share) {
  let seededAt = null;
  try { seededAt = db.get("SELECT v FROM demo_meta WHERE k = 'seeded_at'")?.v || null; } catch { /* data from before this table existed */ }
  return { baseline: baseline(), call_center: CALL_CENTER_JAN_2025, live: live(), scenario: scenario(share), personas: portal.personas(), seeded_at: seededAt };
}

module.exports = { summary, scenario, baseline, live, PORTAL_SOURCE, CALL_EQUIVALENT };
