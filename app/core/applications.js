// A member's applications with DHA (site plan and building plan), read from the membership portal and put in
// plain words: where it is, who has to act next, how long the next step usually takes, and any voucher to pay.
//
// The membership portal sends only ID codes for the process, directorate and timeline; DHA has not yet sent
// their names. Everything marked "DHA to confirm" below is our reading of the sample dump.

const client = require('./membership_client');
const portal = require('./portal');
const db = require('./db');

// Directorate 3 handles site plans and possession, 2 building plans (from the fee heads on their vouchers).
const DIRECTORATE = {
  3: { kind: 'site_plan', title: 'Site plan and possession', office: 'Town Planning' },
  2: { kind: 'building_plan', title: 'Building plan approval', office: 'Building Control' },
};

// The visible steps in order, and what each status means for the member. days: median time to the next step in
// the sample dump (DHA to confirm with the real timelines, tpbc_process_timeline_id).
const FLOW = {
  site_plan: ['Submitted', 'Scrutiny of Documents for Site Plan', 'Voucher Generated', 'Voucher Paid', 'Collected'],
  building_plan: ['Submitted', 'Under Scrutiny', 'Voucher Generated', 'Voucher Paid', 'Approved'],
};
const STATUS = {
  Submitted: { label: 'Received', who: 'dha', next: 'DHA checks your documents.', days: 1.5 },
  'Scrutiny of Documents for Site Plan': { label: 'Documents being checked', who: 'dha', next: 'If they are complete, DHA issues a fee voucher.', days: 1.2 },
  'Under Scrutiny': { label: 'Drawings being checked', who: 'dha', next: 'If they meet the byelaws, DHA issues a fee voucher.', days: 1.4 },
  'Incomplete Documents': { label: 'Documents missing', pos: 1, who: 'you', next: 'Some documents are missing or incomplete. Submit them to the office so the check can continue.', stop: true },
  Observation: { label: 'Changes needed', pos: 1, who: 'you', next: 'Building Control has observations on the drawings. Ask your architect to revise them and resubmit.', stop: true },
  'Voucher Generated': { label: 'Fee voucher issued', who: 'you', next: 'Pay the voucher by its due date. DHA continues once the payment is verified.' },
  'Voucher Paid': { label: 'Fee paid', who: 'dha', next: 'DHA verifies the payment and completes the application.', days: 0.5 },
  Collected: { label: 'Site plan issued', who: null, next: 'Done. Next for most owners: drawings for Building Control.', done: true },
  'Under Development': { label: 'Plot under development', pos: 4, who: 'dha', next: 'The plot is still being developed, so the site plan and possession wait until the area is ready.', stop: true },
  Approved: { label: 'Drawings approved', who: null, next: 'Done. You can register your contractor and get the plot demarcated.', done: true },
};

// How vouchers are paid, from the bank_type values in the membership portal's payments (DHA to confirm the details).
const CHANNELS = {
  ipg: 'online by debit or credit card',
  eft: 'by bank transfer (EFT)',
  rda: 'from a Roshan Digital Account (overseas Pakistanis)',
  'non-rda': 'by transfer from a bank abroad',
};

const today = () => new Date().toISOString().slice(0, 10);
// The portal's plot code "2 /J  /000023/01" (phase / sector / plot number / sub-plot) in words.
function plotText(code) {
  const m = String(code || '').match(/^\s*([\w]+)\s*\/\s*([\w]+)\s*\/\s*0*(\d+)\s*\/\s*(\d+)/);
  if (!m) return String(code || '').replace(/\s+/g, ' ');
  return `Plot ${m[3]}${m[4] !== '01' ? ` (part ${Number(m[4])})` : ''}, Sector ${m[2]}, Phase ${m[1]}`;
}
const shape = a => {
  const dir = DIRECTORATE[a.tpbc_directorate_id] || { kind: 'other', title: `DHA application (directorate ${a.tpbc_directorate_id})`, office: 'DHA' };
  const s = STATUS[a.status] || { label: a.status, who: 'dha', next: '' };
  const flow = FLOW[dir.kind] || [];
  // A status off the main path (documents missing, plot under development) sits at the step it holds up.
  const at = flow.includes(a.status) ? flow.indexOf(a.status) : s.pos ?? 0;
  const vouchers = a.vouchers.map(v => ({
    id: v.id, amount: v.amount, due_date: v.due_date, status: v.status, paid_amount: v.paid_amount, paid_at: v.paid_at,
    channel: v.bank_type ? CHANNELS[v.bank_type] || v.bank_type : null, transaction_id: v.transaction_id,
    overdue: v.status === 'pending' && v.due_date < today(), items: v.items.filter(x => x.amount_with_gst > 0),
    waived: v.items.filter(x => !x.amount_with_gst && x.remarks).map(x => `${x.description} (${x.remarks})`),
  }));
  return {
    id: a.id, code: a.code, kind: dir.kind, title: dir.title, office: dir.office,
    process_id: a.tpbc_process_id, timeline_id: a.tpbc_process_timeline_id,
    membership_no: a.membership_no, plot_no: a.plot_no, plot: plotText(a.plot_no), status: a.status, label: s.label, who: s.who, next: s.next,
    usual_days: s.days || null, done: !!s.done, stopped: !!s.stop,
    steps: flow.map((f, i) => ({ status: f, label: STATUS[f]?.label || f, state: i < at || (i === at && s.done) ? 'done' : i === at ? (s.stop ? 'stuck' : 'now') : 'todo' })),
    history: a.history.map(h => ({ status: h.status, label: STATUS[h.status]?.label || h.status, remarks: h.remarks, at: h.at })),
    submitted_at: a.created_at, updated_at: a.updated_at,
    voucher_due: vouchers.find(v => v.status === 'pending') || null, vouchers,
  };
};

async function forCnic(cnic) {
  return (await client.applications({ cnic })).map(shape);
}
async function one(cnic, id) {
  const a = shape(await client.application(id));
  const mine = (await client.members(cnic)).some(m => m.membershipno === a.membership_no);
  if (!mine) throw Object.assign(new Error('Application not found'), { status: 404 });
  return a;
}

// Chat answer: "what is the status of my site plan", "my building plan", "pay my voucher".
const rs = n => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const day = d => (d ? new Date(`${d.slice(0, 10)}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

async function answer(cnic, focus) {
  if (!cnic) {
    return {
      text: 'Your applications are personal, so I need to know who you are first. Please **sign in**: I will then show where your site plan or building plan is, and any fee voucher to pay.',
      cards: [{ type: 'signin', next: '#/build', reason: 'to see your applications' }],
      steps: [{ label: 'Understood: you are asking about your own application with DHA' }, { label: 'Not signed in, so the membership portal cannot be read' }],
    };
  }
  const me = portal.me(cnic);
  let list = await forCnic(cnic);
  const steps = [{ label: 'Understood: you are asking about your own application with DHA' },
    { label: `Checked the membership portal: ${list.length} application${list.length === 1 ? '' : 's'} on your plots` }];
  if (focus && focus !== 'voucher' && list.some(a => a.kind === focus)) list = list.filter(a => a.kind === focus);
  if (!list.length) {
    const plots = me?.memberships?.length;
    return {
      text: plots
        ? `${me.name}, there is no site plan or building plan application on your plot${plots > 1 ? 's' : ''} yet.\n\nThe **Build a house** guide shows the steps, documents and fees, starting with possession and the site plan.`
        : `${me?.name || 'You'}, there is no DHA plot under your CNIC, so there are no applications to show.`,
      cards: plots ? [{ type: 'build-link' }] : [{ type: 'no-property' }], steps,
    };
  }
  const line = a => {
    const v = a.voucher_due;
    const wait = a.usual_days ? ` This usually takes about ${a.usual_days < 1 ? 'a day' : `${Math.round(a.usual_days)} day${Math.round(a.usual_days) === 1 ? '' : 's'}`}.` : '';
    return `**${a.title}**, ${a.plot} (${a.membership_no}): **${a.label}** since ${day(a.updated_at)}. ${a.next}${a.who === 'dha' ? wait : ''}`
      + (v ? `\n  - **Voucher to pay: ${rs(v.amount)}**, ${v.overdue ? `**overdue since ${day(v.due_date)}**` : `due by ${day(v.due_date)}`}.` : '');
  };
  portal.log(cnic, 'application_checked', { n: list.length, via: 'chat' });
  const owes = list.some(a => a.voucher_due);
  const how = owes ? `\n\n**How to pay a voucher:** ${Object.values(CHANNELS).slice(0, 3).join(', ')}. These are the payment methods recorded in DHA's membership portal; please confirm the details with DHA.` : '';
  return {
    text: `${me.name}, here is where your applications are:\n\n${list.slice(0, 4).map(a => `- ${line(a)}`).join('\n')}${how}\n\nThe steps and vouchers are on **Build a house**.`,
    cards: [{ type: 'applications', list: list.slice(0, 4).map(a => ({ id: a.id, title: a.title, plot: a.plot, membership_no: a.membership_no,
      label: a.label, who: a.who, done: a.done, voucher: a.voucher_due ? { amount: a.voucher_due.amount, due_date: a.voucher_due.due_date, overdue: a.voucher_due.overdue } : null })) }],
    steps,
  };
}

// Membership portal → app events (POST /api/membership-events): tell the member when their application moves,
// so they do not have to call to ask. The ref links the notification to the plot's applications on Build a house.
function handleEvent(ev) {
  if (!ev || !['application.status_changed', 'voucher.paid'].includes(ev.type) || !ev.application_id) return { ok: false, error: 'Unknown event' };
  db.open().exec('CREATE TABLE IF NOT EXISTS membership_events (id TEXT PRIMARY KEY, at TEXT, application_id INTEGER, status TEXT)');
  if (!db.run('INSERT OR IGNORE INTO membership_events (id, at, application_id, status) VALUES (?,?,?,?)', ev.id, ev.at, ev.application_id, ev.status).changes) {
    return { ok: true, duplicate: true };
  }
  const owner = ev.member_cnic && db.get('SELECT cnic FROM persons WHERE cnic = ?', ev.member_cnic);
  if (!owner) return { ok: true, notified: 0 };
  const dir = DIRECTORATE[ev.directorate_id]?.title || 'Your application';
  const s = STATUS[ev.status] || { label: ev.status, next: '' };
  const title = ev.type === 'voucher.paid' ? `${dir}: payment received` : `${dir}: ${s.label.toLowerCase()}`;
  const body = ev.type === 'voucher.paid' ? `${rs(ev.amount)} received for ${plotText(ev.plot_no)}. ${s.next}` : `${plotText(ev.plot_no)}. ${s.next}`;
  portal.notify(owner.cnic, { kind: 'application', title, body, ref: `app:${ev.membership_no}` });
  portal.log(owner.cnic, 'membership_event', { application_id: ev.application_id, status: ev.status, type: ev.type });
  return { ok: true, notified: 1 };
}

module.exports = { forCnic, one, answer, shape, handleEvent, STATUS, DIRECTORATE, CHANNELS };
