// Resident and member portal screens: demo sign-in, report a problem (guided chat), my complaints,
// notifications and my account (properties, installments, bills). Everything personal is fetched
// from the server with the signed-in CNIC; the server talks to the CMS.

import * as K from './kb.js';
import * as B from './build.js';
import * as AP from './applications.js';
import * as I from './i18n.js';

let H = null; // helpers from app.js: icon, esc, md, backBtn, render
export function init(helpers) {
  H = helpers;
  AP.init({ icon: H.icon, esc: H.esc, fmt, fmtDate, rs });
  renderTop();
  if (S.cnic) startPolling();
}

const S = {
  cnic: load(),
  name: null,
  unread: 0,
  intake: null,     // last reply from /api/intake
  log: [],          // the report conversation shown on screen
  receipt: null,    // the bill payment just made, shown as a receipt in My account
  busy: false,
  pollTimer: null,
};

function load() {
  try { return localStorage.getItem('dha-cnic') || null; } catch { return null; }
}
function save(cnic) {
  try { cnic ? localStorage.setItem('dha-cnic', cnic) : localStorage.removeItem('dha-cnic'); } catch { /* storage may be blocked */ }
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(S.cnic ? { 'X-Demo-CNIC': S.cnic } : {}), ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { signOut(false); }
  if (!res.ok) throw Object.assign(new Error(json.error || `Error ${res.status}`), { status: res.status });
  return json;
}

const signedIn = () => !!S.cnic;
const fmt = at => {
  if (!at) return '';
  const d = new Date(String(at).replace(' ', 'T'));
  return d.toLocaleString(I.loc(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: false });
};
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString(I.loc(), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const rs = n => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const monthLabel = m => new Date(m + '-01T00:00').toLocaleString(I.loc(), { month: 'long', year: 'numeric' });
const OPEN = ['Submitted', 'In Process', 'Pending', 'Reopen'];
const pillClass = s => (['Resolved', 'Closed'].includes(s) ? 'ok' : ['Cancel', 'Cancel/Not at Home'].includes(s) ? 'off' : '');
const STATUS_HELP = {
  Submitted: 'Received. Waiting for a team to be assigned.',
  'In Process': 'A field team is working on it.',
  Pending: 'On hold.',
  Reopen: 'Opened again. It goes back to the team.',
  Resolved: 'The team says the work is done.',
  Closed: 'Closed.',
  Cancel: 'Cancelled.',
  'Cancel/Not at Home': 'The team came but no one was at home.',
};

// ---------- Top bar: who is signed in, notification bell ----------

function renderTop() {
  let slot = document.getElementById('p-top');
  if (!slot) {
    slot = document.createElement('span');
    slot.id = 'p-top';
    slot.className = 'p-top';
    const nav = document.querySelector('.top-actions');
    nav.insertBefore(slot, nav.lastElementChild);
  }
  const { icon, esc } = H;
  slot.innerHTML = signedIn()
    ? `<a class="btn btn-ghost btn-icon-only p-bell" href="#/notifications" aria-label="Notifications${S.unread ? `, ${S.unread} new` : ''}" title="Notifications">${icon('bell')}${S.unread ? `<span class="p-count">${S.unread}</span>` : ''}</a>
       <a class="btn btn-ghost p-who" href="#/signin" title="Switch demo person">${icon('users')}<span>${esc((S.name || '').split(' ')[0] || 'Me')}</span></a>`
    : `<a class="btn btn-ghost" href="#/signin">${icon('lock')}Sign in</a>`;
}

async function refreshMe() {
  if (!S.cnic) return null;
  const me = await api('/api/me');
  S.name = me.name;
  S.unread = me.unread;
  renderTop();
  return me;
}

function startPolling() {
  clearInterval(S.pollTimer);
  refreshMe().catch(() => {});
  S.pollTimer = setInterval(pollNotifications, 6000);
}

// New notifications show a toast, and refresh the screen if it is about that complaint.
async function pollNotifications() {
  if (!S.cnic || document.hidden) return;
  let n;
  try { n = await api('/api/notifications/count'); } catch { return; }
  if (n.unread > S.unread && n.latest) {
    toast(n.latest);
    const route = location.hash;
    if (route.startsWith('#/notifications') || (n.latest.ref && route.includes(n.latest.ref)) || route === '#/my-complaints'
      || (String(n.latest.ref).startsWith('app:') && (route.startsWith('#/build') || route.startsWith('#/my-account')))) H.render();
  }
  if (n.unread !== S.unread) { S.unread = n.unread; renderTop(); }
}

const refLink = ref => (String(ref).startsWith('app:') ? `#/build?m=${encodeURIComponent(ref.slice(4))}` : `#/my-complaints/${ref}`);

function toast(note) {
  const { esc, icon } = H;
  const el = document.createElement('a');
  el.className = 'p-toast';
  el.href = note.ref ? refLink(note.ref) : '#/notifications';
  el.innerHTML = `${icon('bell')}<span><b>${esc(note.title)}</b>${note.body ? `<br><span class="small">${esc(note.body)}</span>` : ''}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('gone'), 6000);
  setTimeout(() => el.remove(), 6600);
}

function signOut(rerender = true) {
  S.cnic = null; S.name = null; S.unread = 0; S.intake = null; S.log = []; S.receipt = null;
  save(null);
  clearInterval(S.pollTimer);
  renderTop();
  if (rerender) H.render();
}

function needSignIn(next, what) {
  const { icon, backBtn } = H;
  return `${backBtn()}
    <div class="card"><h1>${icon('lock', 'inline-ic')} Please sign in</h1>
      <p>${what} is personal, so we need to know who you are first.</p>
      <a class="btn" href="#/signin?next=${encodeURIComponent(next)}">${icon('lock')}Sign in</a></div>`;
}

// ---------- Sign in (demo personas) ----------

const PERSONA_ICON = { prospect: 'search', member: 'banknote', builder: 'building', resident: 'home', resident_member: 'users' };

export async function signinView(params) {
  const { icon, esc, backBtn } = H;
  const people = await api('/api/personas');
  const next = params.get('next') || '#/';
  return `${backBtn()}
    <h1>Sign in</h1>
    <div class="note" style="margin-bottom:16px">${icon('info', 'inline-ic')} <b>Demo:</b> choose a person. In the real portal you sign in with your CNIC and the code DHA sends to your mobile.</div>
    <div class="list-buttons">
      ${people.map(p => `<button class="list-btn ${p.cnic === S.cnic ? 'p-current' : ''}" data-action="p-signin" data-cnic="${esc(p.cnic)}" data-next="${esc(next)}">
        <span class="lb-left"><span class="lb-icon">${icon(PERSONA_ICON[p.persona] || 'users')}</span>
        <span>${esc(p.name)}${p.cnic === S.cnic ? ' <span class="badge badge-ok">signed in</span>' : ''}<span class="sub">${esc(p.label)} · CNIC ${esc(p.cnic)}</span></span></span>${icon('right')}</button>`).join('')}
    </div>
    ${S.cnic ? `<button class="btn btn-ghost" style="margin-top:16px" data-action="p-signout">Sign out</button>` : ''}`;
}

// ---------- Report a problem (guided chat with the intake engine) ----------

export function reportView(params) {
  const { icon, backBtn } = H;
  if (!signedIn()) return needSignIn('#/report', 'Reporting a problem');
  const r = S.intake;
  return `${backBtn('#/', 'Home')}
    <div class="chat p-report">
      <div class="chat-head">
        <h1 style="margin:0">Report a problem</h1>
        ${S.log.length ? `<button class="btn btn-ghost btn-small" data-action="p-restart">Start again</button>` : ''}
      </div>
      <div class="msgs" id="p-msgs">${S.log.map(renderLine).join('')}${S.busy ? `<div class="live-steps"><div class="s"><span class="spinner"></span>Checking…</div></div>` : ''}</div>
      ${r && !S.busy ? renderControls(r) : ''}
    </div>`;
}

function renderLine(m) {
  const { icon, esc, md } = H;
  if (m.who === 'me') return `<div class="msg msg-user" dir="auto">${esc(m.text)}</div>`;
  const cls = m.kind ? ` p-${m.kind}` : '';
  return `<div class="msg msg-agent"><div class="avatar">${icon(m.kind === 'safety' ? 'alert' : 'spark')}</div><div class="bubble${cls}"><div class="text">${md(I.trMsg(m.text))}</div></div></div>`;
}

function renderControls(r) {
  const { icon, esc } = H;
  const tel = o => o.value.startsWith('__tel:') ? `<a class="btn btn-call" href="tel:${esc(o.value.slice(6))}">${icon('phone')}${esc(o.label)}</a>` : null;
  const btn = (o, i) => tel(o) || `<button class="${o.value === '__human' ? 'btn btn-ghost' : i === 0 && ['submit', 'follow', 'add', 'answered'].includes(o.value) ? 'btn' : 'chip'}" data-action="p-choose" data-value="${esc(o.value)}" data-label="${esc(o.label)}">${esc(o.label)}</button>`;
  return `
    ${r.summary ? `<div class="card review p-summary"><h2>Please check</h2><dl>${r.summary.map(x => `<dt>${esc(x.label)}</dt><dd${x.label === 'Details' ? ' class="p-quote" dir="auto"' : ''}>${esc(x.value)}${x.note ? ` <span class="muted small">(${esc(x.note)})</span>` : ''}</dd>`).join('')}</dl></div>` : ''}
    ${r.quick?.length ? `<p class="muted small" style="margin:0">Or tap one:</p><div class="chips">${r.quick.map(q => `<button class="chip" data-action="p-quick" data-key="${esc(q.key)}" data-label="${esc(q.label)}">${esc(q.label)}</button>`).join('')}</div>` : ''}
    ${r.options?.length ? `<div class="chips p-options">${r.options.map(btn).join('')}</div>` : ''}
    ${r.allowText ? `<form class="chat-input" data-action="p-say">
        <textarea name="q" rows="1" dir="auto" placeholder="${esc(r.placeholder || 'Type here…')}" aria-label="Your answer"></textarea>
        <button class="btn" type="submit">${icon('send')}Send</button></form>` : ''}`;
}

async function intakeTurn(body, shown) {
  if (shown) S.log.push({ who: 'me', text: shown });
  S.busy = true;
  H.render();
  try {
    const r = await api('/api/intake', { method: 'POST', body: { id: S.intake?.id, ...body } });
    S.intake = r;
    for (const m of r.messages) S.log.push({ who: 'agent', text: m.text, kind: m.kind });
    if (r.ref) refreshMe().catch(() => {});
  } catch (e) {
    S.log.push({ who: 'agent', text: `Sorry, that did not work: ${e.message}`, kind: 'warn' });
  }
  S.busy = false;
  H.render();
  requestAnimationFrame(() => {
    const last = document.querySelector('#p-msgs > :last-child');
    last?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.querySelector('.p-report .chat-input textarea')?.focus();
  });
}

function restartIntake(text) {
  S.intake = null;
  S.log = [];
  if (text) intakeTurn({ text }, text);
  else intakeTurn({});
}

// ---------- My complaints ----------

export async function complaintsView(ref) {
  const { icon, esc, backBtn } = H;
  if (!signedIn()) return needSignIn(ref ? `#/my-complaints/${ref}` : '#/my-complaints', 'Your complaint list');
  if (ref) return complaintDetail(ref);
  const list = await api('/api/my/complaints');
  const open = list.filter(c => OPEN.includes(c.status) || c.status === 'Resolved');
  const past = list.filter(c => !open.includes(c));
  const row = c => `<a class="list-btn" href="#/my-complaints/${esc(c.reference)}">
      <span class="lb-left"><span class="lb-icon">${icon(c.relation === 'following' ? 'users' : 'alert')}</span>
      <span>${esc(c.sub_category)} <span class="muted small">· ${esc(c.reference)}</span>
        <span class="sub">${c.relation === 'following' ? '<span>Following ·</span> ' : ''}<span>${esc(STATUS_HELP[c.status] || c.status)}</span> <span>Updated</span> ${fmt(c.updated_at)}</span></span></span>
      <span class="status-pill ${pillClass(c.status)}">${esc(c.status)}</span></a>`;
  return `${backBtn()}
    <div class="chat-head"><h1 style="margin:0">My complaints</h1><a class="btn btn-accent" href="#/report">${icon('alert')}Report a problem</a></div>
    ${!list.length ? '<p class="muted">You have no complaints. When you report a problem, it shows here with every update.</p>' : ''}
    ${open.length ? `<h2 style="margin-top:20px">Open</h2><div class="list-buttons">${open.map(row).join('')}</div>` : ''}
    ${past.length ? `<h2 style="margin-top:20px">Earlier</h2><div class="list-buttons">${past.map(row).join('')}</div>` : ''}`;
}

async function complaintDetail(ref) {
  const { icon, esc, backBtn } = H;
  let c;
  try { c = await api(`/api/my/complaints/${encodeURIComponent(ref)}`); } catch (e) {
    return `${backBtn('#/my-complaints')}<p>${esc(e.message)}</p>`;
  }
  const mine = c.relation === 'mine';
  const isOpen = OPEN.includes(c.status);
  const events = c.events || [];
  return `${backBtn('#/my-complaints', 'My complaints')}
    <div class="card">
      <div class="card-head"><div><span class="muted small">Complaint ${esc(c.reference)}${mine ? '' : ' · you are following this'}</span><h1 style="margin:0">${esc(c.sub_category)}</h1></div>
        <span class="status-pill ${pillClass(c.status)}">${esc(c.status)}</span></div>
      <p class="muted" style="margin:6px 0 0">${esc(STATUS_HELP[c.status] || '')}</p>
      ${c.status === 'Resolved' && mine ? `<div class="note p-ask"><b>Is the problem fixed?</b>
        <div class="btn-row"><button class="btn" data-action="p-feedback" data-ref="${esc(c.reference)}" data-ok="1">${icon('check')}Yes, it is fixed</button>
        <button class="btn btn-secondary" data-action="p-feedback" data-ref="${esc(c.reference)}" data-ok="0">No, still a problem</button></div></div>` : ''}
      ${c.status === 'Cancel/Not at Home' && mine ? `<div class="note note-warn p-ask"><b>The team could not get in.</b> Ask for another visit?
        <div class="btn-row"><button class="btn" data-action="p-feedback" data-ref="${esc(c.reference)}" data-ok="0">Ask for another visit</button></div></div>` : ''}
      <div class="facts">
        <div class="fact"><b>Type</b>${esc(c.category)} › ${esc(c.sub_category)}</div>
        <div class="fact"><b>Where</b>${esc([c.house && `House ${c.house}`, c.street && `Street ${c.street}`, c.sector && `Sector ${c.sector}`, c.phase && `Phase ${c.phase}`].filter(Boolean).join(', '))}</div>
        <div class="fact"><b>Made</b>${fmt(c.complaint_date)} · ${esc(c.request_source)}</div>
        ${c.assigned_resources ? `<div class="fact"><b>Team</b>${esc(c.sub_category)} team</div>` : ''}
        ${c.priority ? `<div class="fact"><b>Priority</b>Urgent</div>` : ''}
      </div>
      ${c.description ? `<p style="margin-top:14px" class="muted p-quote" dir="auto">“${esc(c.description)}”</p>` : ''}
      <h2 style="margin-top:18px">What has happened</h2>
      <ol class="timeline">${events.map((e, i) => {
        const last = i === events.length - 1;
        const cls = last && isOpen ? 'current' : 'done';
        return `<li class="${cls}"><span class="dot">${cls === 'done' ? icon('check') : ''}</span><div><div class="t-title">${esc(e.status || 'Note added')}</div>
          <div class="t-meta">${fmt(e.at)}${e.note ? ` — ${esc(e.note.replace(/\s*\(Staff_\d+\)/, ''))}` : ''}</div></div></li>`;
      }).join('')}</ol>
      ${mine && isOpen ? `<form class="askbox" data-action="p-info" data-ref="${esc(c.reference)}" style="margin-top:8px">
          <input name="q" placeholder="Add information for the team (optional)" aria-label="Add information for the team">
          <button class="btn btn-secondary" type="submit">Add</button></form>` : ''}
      <div class="btn-row">
        <a class="btn btn-call" href="tel:1092">${icon('phone')}Complaint Office 1092</a>
        ${mine && c.status === 'Submitted' ? `<button class="btn btn-ghost" data-action="p-cancel" data-ref="${esc(c.reference)}">Cancel complaint</button>` : ''}
        ${isOpen ? `<button class="btn btn-ghost p-demo" data-action="p-simulate" data-ref="${esc(c.reference)}" title="For demonstrations only: does what the field team does in the CMS">${icon('spark')}Simulate field team update (demo)</button>` : ''}
      </div>
    </div>`;
}

// ---------- Notifications ----------

export async function notificationsView() {
  const { icon, esc, backBtn } = H;
  if (!signedIn()) return needSignIn('#/notifications', 'Your notifications');
  const list = await api('/api/notifications');
  if (list.some(n => !n.read)) {
    api('/api/notifications/read', { method: 'POST', body: { id: 'all' } }).then(() => { S.unread = 0; renderTop(); }).catch(() => {});
  }
  return `${backBtn()}
    <h1>Notifications</h1>
    ${!list.length ? '<p class="muted">Nothing yet. Updates on your complaints will appear here.</p>' : ''}
    <div class="list-buttons">${list.map(n => `<div class="list-btn p-note ${n.read ? '' : 'p-unread'}" style="cursor:default">
      <span class="lb-left"><span class="lb-icon">${icon(n.kind === 'resolved' ? 'check' : n.kind === 'submitted' ? 'file' : n.kind === 'application' ? 'building' : n.kind === 'payment' ? 'banknote' : 'bell')}</span>
      <span><b>${esc(n.title)}</b><span class="sub"><span>${esc(n.body || '')}</span> <span>· ${fmt(n.at)}</span></span>
      ${n.actions.length ? `<span class="btn-row" style="margin-top:8px">${n.actions.includes('confirm') ? `<button class="btn btn-small" data-action="p-feedback" data-ref="${esc(n.ref)}" data-ok="1">Yes, fixed</button>` : ''}
        ${n.actions.includes('reopen') ? `<button class="btn btn-small btn-secondary" data-action="p-feedback" data-ref="${esc(n.ref)}" data-ok="0">${n.actions.includes('confirm') ? 'Not fixed' : 'Ask for another visit'}</button>` : ''}</span>` : ''}
      </span></span>${n.ref ? `<a class="btn btn-ghost btn-small" href="${esc(refLink(n.ref))}">Open</a>` : ''}</div>`).join('')}</div>`;
}

// ---------- My account (member portal + resident portal) ----------

export async function accountView(params) {
  const { icon, esc, backBtn } = H;
  if (!signedIn()) return needSignIn('#/my-account', 'Your account');
  const [me, bookings, apps] = await Promise.all([refreshMe(), api('/api/market/bookings').catch(() => []), api('/api/my/applications').catch(() => [])]);
  const roleLabel = { member: 'Member', resident: 'Resident', plot_owner: 'Plot owner', prospect: 'Not yet a member' };
  const parts = [`${backBtn()}
    <h1>${esc(me.name)}</h1>
    <p class="muted">CNIC ${esc(me.cnic)} · ${esc(me.mobile)} · ${me.roles.map(r => `<span class="badge">${esc(roleLabel[r] || r)}</span>`).join(' ')}</p>
    <p class="small muted">${icon('info', 'inline-ic')} Prototype: all amounts below are demo figures, not DHA records.</p>`, bookingsBlock(bookings)];

  if (!me.memberships.length && !me.residences.length) {
    parts.push(`<div class="card"><h2>No DHA property yet</h2><p>When you buy a plot or house, its details, installments and bills show here.</p>
      <div class="btn-row"><a class="btn" href="#/market">${icon('map')}See plots DHA is selling</a>
      <a class="btn btn-secondary" href="#/services/property">${icon('list')}How buying and transfer works</a></div></div>`);
  }

  for (const m of me.memberships) {
    const inst = m.installments;
    parts.push(`<div class="card">
      <div class="card-head"><div><span class="muted small">Membership ${esc(m.membership_no)}</span><h2 style="margin:0">${esc(m.size_label || '')} ${esc(m.category || '')} plot</h2></div>
        <span class="status-pill ok">${esc(m.status || '')}</span></div>
      <div class="facts">
        <div class="fact"><b>Plot</b>Plot ${esc(m.plot_no)}, Street ${esc(m.street)}, Sector ${esc(m.sector)}, Phase ${esc(m.phase)}</div>
        <div class="fact"><b>Type</b>${esc(m.membership_type || '')}${m.allotted_on ? ` since ${fmtDate(m.allotted_on)}` : ''}</div>
        <div class="fact"><b>Built</b>${m.built ? 'House built' : 'Empty plot'}</div>
        ${m.document ? `<div class="fact"><b>Document</b>${esc(m.document)}</div>` : ''}
      </div>
      ${inst ? installmentsBlock(inst) : ''}
      ${AP.lines(apps.filter(x => x.membership_no === m.membership_no), m.membership_no)}
      ${!m.built ? (() => { const next = B.STAGES.find(s => !(m.build_done || []).includes(s.key));
        return `<a class="note b-link" style="margin-top:14px" href="#/build?m=${esc(m.membership_no)}">${icon('building', 'inline-ic')} <span><b>${(m.build_done || []).length ? `Building: ${(m.build_done || []).length} of ${B.STAGES.length} steps done` : 'Planning to build?'}</b> ${next ? `<span>Next: ${esc(next.title.toLowerCase())}.</span>` : ''} <span>See the steps, limits and fees for this plot.</span></span>${icon('right')}</a>`; })() : ''}
    </div>`);
  }

  for (const r of me.residences) {
    parts.push(`<div class="card">
      <div class="card-head"><div><span class="muted small">Consumer ID ${esc(r.consumer_id)}</span><h2 style="margin:0">Society bills: House ${esc(r.plot_no)}, Street ${esc(r.street)}, Sector ${esc(r.sector)}, Phase ${esc(r.phase)}</h2></div>
        ${r.outstanding ? `<span class="status-pill">${rs(r.outstanding)} to pay</span>` : '<span class="status-pill ok">All paid</span>'}</div>
      <table class="p-table p-bills"><thead><tr><th>Month</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>
        ${r.bills.map(b => `<tr><td>${monthLabel(b.month)}</td><td class="amt">${rs(b.amount)}</td><td>${fmtDate(b.due_date)}</td>
          <td>${b.state === 'paid' ? `<span class="badge badge-ok">Paid ${fmtDate(b.paid_on)}</span> <span class="muted small p-ref">${esc(b.payment_ref)}</span>` : b.state === 'overdue' ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge badge-warn">To pay</span>'}</td></tr>`).join('')}
      </tbody></table>
      ${billPay(r, params)}
      <div class="btn-row"><a class="btn btn-accent" href="#/report">${icon('alert')}Report a problem at this house</a><a class="btn btn-secondary" href="#/my-complaints">${icon('clock')}My complaints</a></div>
    </div>`);
  }
  return parts.join('');
}

// Pay a society bill in the app (demo: no money moves). ?pay=1 comes from the home screen and the assistant.
const BILL_CHANNELS = [['ipg', 'Debit or credit card'], ['1bill', '1Bill'], ['eft', 'Bank transfer (EFT)'], ['rda', 'Roshan Digital Account']];

function billPay(r, params) {
  const { icon, esc } = H;
  const done = S.receipt && S.receipt.consumer_id === r.consumer_id ? S.receipt : null;
  if (done) {
    return `<div class="note p-unread p-receipt" style="margin-top:14px">${icon('check', 'inline-ic')} <b>Payment received</b>
      <div>Paid: ${rs(done.amount)}, reference ${esc(done.reference)}, by ${esc(done.channel)}.</div>
      <div class="btn-row no-print" style="margin-top:8px"><button class="btn btn-secondary btn-small" data-action="print">${icon('print')}Print receipt</button></div></div>`;
  }
  if (!r.outstanding) return '';
  return `<div class="note note-warn p-billpay ${params?.get('pay') ? 'p-focus' : ''}" id="bill-pay" style="margin-top:14px">
    <form class="a-pay" style="margin-top:0" data-action="bill-pay" data-id="${esc(r.consumer_id)}">
      <div class="field"><label for="bp-${esc(r.consumer_id)}">Pay by</label><select id="bp-${esc(r.consumer_id)}" name="channel">${BILL_CHANNELS.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
      <button class="btn">${icon('lock')}Pay ${rs(r.outstanding)} (demo payment)</button>
    </form>
    <p class="small muted" style="margin:8px 0 0">Demo: no money moves.</p></div>`;
}

// ---------- Home: what needs this person's attention today ----------

async function forYou() {
  const { icon, esc } = H;
  const [me, apps, complaints, bookings] = await Promise.all([refreshMe(), api('/api/my/applications').catch(() => []),
    api('/api/my/complaints').catch(() => []), api('/api/market/bookings').catch(() => [])]);
  const items = [];
  const add = (tone, ic, title, sub, action, href) => items.push({ tone, ic, title, sub, action, href });
  for (const c of complaints.filter(x => x.status === 'Resolved' && x.relation === 'mine')) {
    add('warn', 'check', `Is the ${c.sub_category} fixed? The team says it is done.`, `Complaint ${c.reference}`, 'Answer now', `#/my-complaints/${c.reference}`);
  }
  for (const m of me.memberships) {
    const i = m.installments;
    if (i?.overdue_count) add('danger', 'alert', `${i.overdue_count} instalment${i.overdue_count > 1 ? 's' : ''} overdue on plot ${m.plot_no}`, rs(i.overdue_amount), 'See details', '#/my-account');
  }
  for (const r of me.residences) {
    const b = r.bills.find(x => x.state !== 'paid');
    if (b) add(b.state === 'overdue' ? 'danger' : 'warn', 'banknote', `Society bill: ${rs(r.outstanding)} to pay by ${fmtDate(b.due_date)}`, `House ${r.plot_no}, Street ${r.street}, Sector ${r.sector}, Phase ${r.phase}`, 'Pay now', '#/my-account?pay=1');
  }
  for (const a of apps) {
    const v = a.voucher_due;
    if (v) add(v.overdue ? 'danger' : 'warn', 'building', `Fee voucher to pay: ${rs(v.amount)}, by ${fmtDate(v.due_date)}`, a.title, 'Pay the voucher', `#/build?m=${encodeURIComponent(a.membership_no)}`);
    else if (a.who === 'you' && !a.done) add('warn', 'file', 'Your application needs documents', a.title, 'See what is missing', `#/build?m=${encodeURIComponent(a.membership_no)}`);
  }
  for (const b of bookings.filter(x => x.status === 'token_paid')) {
    add('warn', 'clock', `Plot booking: pay ${rs(b.plan_detail.down - b.token_amount)} by ${until(b.hold_until)}`, '', 'Pay to confirm', `#/market/${b.listing_id}`);
  }
  const open = complaints.filter(c => OPEN.includes(c.status));
  if (open.length) add('', 'clock', `${open.length} open complaint${open.length > 1 ? 's' : ''}: ${[...new Set(open.map(c => c.sub_category))].slice(0, 3).join(', ')}`, '', 'Open', '#/my-complaints');
  for (const m of me.memberships.filter(x => !x.built && (x.build_done || []).length)) {
    const next = B.STAGES.find(s => !m.build_done.includes(s.key));
    add('', 'building', `Building Plot ${m.plot_no}: ${m.build_done.length} of ${B.STAGES.length} steps done`, next ? `Next: ${next.title}` : '', 'Open', `#/build?m=${encodeURIComponent(m.membership_no)}`);
  }
  for (const m of me.memberships) {
    const i = m.installments;
    if (i && !i.overdue_count && i.next_due) add('', 'banknote', `Next instalment: ${rs(i.next_due.amount)} on ${fmtDate(i.next_due.due_date)}`, `Plot ${m.plot_no}, Sector ${m.sector}, Phase ${m.phase}`, 'See details', '#/my-account');
  }
  if (!me.memberships.length && !me.residences.length && !bookings.length) {
    const f = await api('/api/market/filters').catch(() => null);
    add('', 'map', 'Looking for a plot?', f ? `${f.available} DHA plots for sale, with payment plans` : '', 'See plots for sale', '#/market');
  }
  const first = (me.name || '').split(' ')[0];
  return { first, html: `<section class="for-you"><h2>${icon('spark', 'inline-ic')} <span>For you today</span></h2>
    ${items.length ? `<div class="list-buttons">${items.slice(0, 5).map(x => `<a class="list-btn fy fy-${x.tone || 'plain'}" href="${esc(x.href)}">
      <span class="lb-left"><span class="lb-icon">${icon(x.ic)}</span><span><span>${esc(x.title)}</span>${x.sub ? `<span class="sub">${esc(x.sub)}</span>` : ''}</span></span>
      <span class="fy-go"><span>${esc(x.action)}</span>${icon('right')}</span></a>`).join('')}</div>`
      : `<div class="card"><b>Nothing needs your attention today.</b><p class="muted" style="margin:4px 0 0">Your bills, instalments, applications and complaints are all up to date.</p></div>`}
  </section>` };
}

async function fillForYou() {
  const slot = document.getElementById('for-you');
  if (!slot || !signedIn()) return;
  let out;
  try { out = await forYou(); } catch { return; }
  if (!slot.isConnected) return; // the person moved to another screen meanwhile
  slot.innerHTML = out.html;
  const h1 = document.querySelector('.hello h1');
  if (h1 && out.first) h1.replaceChild(document.createTextNode(`Assalam-o-Alaikum, ${out.first}.`), h1.firstChild);
}

function installmentsBlock(inst) {
  const { icon, esc } = H;
  const pct = Math.round(100 * inst.paid / inst.total);
  return `
    <h3 style="margin-top:18px">Payment plan</h3>
    ${inst.overdue_count ? `<div class="note note-danger">${icon('alert', 'inline-ic')} <b>${inst.overdue_count} installment${inst.overdue_count > 1 ? 's' : ''} overdue: ${rs(inst.overdue_amount)}.</b> Please pay, or contact Finance on 051-111-555-400.</div>` : ''}
    <div class="facts">
      <div class="fact"><b>Paid so far</b>${rs(inst.paid)} of ${rs(inst.total)} (${pct}%)</div>
      <div class="fact"><b>Next due</b>${inst.next_due ? `${rs(inst.next_due.amount)} on ${fmtDate(inst.next_due.due_date)}` : 'Nothing more due'}</div>
      <div class="fact"><b>Remaining</b>${inst.remaining} installment${inst.remaining === 1 ? '' : 's'}</div>
    </div>
    <div class="p-bar" aria-label="${pct}% paid"><span style="width:${pct}%"></span></div>
    <details class="p-sched"><summary>See the full schedule (${inst.schedule.length} payments)</summary>
      <table class="p-table"><thead><tr><th>Payment</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      ${inst.schedule.map(r => `<tr class="${r.state === 'overdue' ? 'p-over' : ''}"><td>${esc(r.label)}</td><td>${fmtDate(r.due_date)}</td><td class="amt">${rs(r.amount)}</td>
        <td>${r.state === 'paid' ? `<span class="badge badge-ok">Paid</span>` : r.state === 'overdue' ? '<span class="badge badge-danger">Overdue</span>' : '<span class="badge">Upcoming</span>'}</td></tr>`).join('')}
      </tbody></table></details>`;
}

// ---------- DHA Marketplace (simulated): plots DHA is selling ----------

const mil = n => `Rs ${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')} million`;
const useLabel = u => (u === 'commercial' ? 'Commercial' : 'Residential');
const until = at => new Date(at).toLocaleString(I.loc(), { hour12: false, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const DEMO_NOTE = 'Prototype: prices are the lower end of the DHA Property Exchange benchmark (PVBM). Plan terms, token and payments are demo only. DHA to confirm.';

export async function marketView(id, params) {
  return id ? plotView(id) : marketList(params);
}

async function marketList(params) {
  const { icon, esc, backBtn } = H;
  const q = Object.fromEntries([...params].filter(([, v]) => v));
  const [f, res, bookings] = await Promise.all([
    api('/api/market/filters'),
    api(`/api/market/plots?${new URLSearchParams(q)}`),
    signedIn() ? api('/api/market/bookings').catch(() => []) : [],
  ]);
  const open = bookings.filter(b => b.status === 'token_paid');
  const sel = (name, opts, label) => `<div class="field"><label for="mf-${name}">${label}</label><select id="mf-${name}" name="${name}">
    ${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(q[name] || '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const maxes = [5e6, 10e6, 20e6, 35e6, 50e6, 100e6].filter(v => v > f.price.min);
  return `${backBtn()}
    <h1>Buy a plot from DHA</h1>
    <p class="muted">${f.available} plots for sale by DHA. Book with a token, then pay the down payment to get the allotment.</p>
    <div class="note" style="margin-bottom:16px">${icon('info', 'inline-ic')} ${esc(DEMO_NOTE)}</div>
    ${open.map(b => `<a class="card p-unread" href="#/market/${esc(b.listing_id)}" style="display:block;text-decoration:none;color:inherit">
      <b>${icon('clock', 'inline-ic')} Booking ${esc(b.id)}: plot ${esc(b.plot?.plot_no)}, ${esc(b.plot?.phase_label)} ${esc(b.plot?.sector)}</b>
      <span class="small muted" style="display:block">Pay the ${b.plan_detail.quarters ? 'down payment' : 'balance'} by ${until(b.hold_until)} to get the allotment.</span></a>`).join('')}
    <form class="card p-filters" data-action="p-market-filter">
      ${sel('phase', [['', 'All phases'], ...f.phases.map(p => [p.id, p.label])], 'Phase')}
      ${sel('use', [['', 'Residential and commercial'], ['residential', 'Residential'], ['commercial', 'Commercial']], 'Type')}
      ${sel('size', [['', 'Any size'], ...f.sizes.map(s => [s.id, `${s.id} (${s.sqyd} sq yd)`])], 'Size')}
      ${sel('max', [['', 'Any price'], ...maxes.map(v => [v, `Up to ${mil(v)}`])], 'Budget')}
      ${sel('sort', [['', 'Lowest price first'], ['price_desc', 'Highest price first'], ['size', 'Largest first']], 'Sort')}
      <noscript><button class="btn">Show plots</button></noscript>
    </form>
    <p class="small muted" style="margin:4px 0 12px">${res.total ? `Showing ${res.plots.length} of ${res.total}` : 'No plots match. Try another phase, size or budget.'}</p>
    <div class="p-plots">${res.plots.map(m => `<a class="card p-plot" href="#/market/${esc(m.listing_id)}">
      <div class="card-head"><div><span class="muted small">${esc(m.phase_label)} · Sector ${esc(m.sector)}</span>
        <h3 style="margin:2px 0 0">${esc(m.size)} ${useLabel(m.use).toLowerCase()} plot</h3></div>
        ${m.mine ? '<span class="badge badge-warn">Your booking</span>' : `<span class="badge">${esc(m.kind_label)}</span>`}</div>
      <div class="p-price">${mil(m.base_price)}</div>
      <span class="small muted">Plot ${esc(m.plot_no)}, Street ${esc(m.street)} · ${m.sqyd} sq yd · token ${rs(m.token_amount)}</span></a>`).join('')}</div>
    <p class="small muted" style="margin-top:16px">Price guide: ${esc(f.benchmark.source.replace(/^PVBM-N\.pdf: /, ''))}, ${esc(f.benchmark.period)}.</p>`;
}

async function plotView(id) {
  const { icon, esc, backBtn } = H;
  let m;
  try { m = await api(`/api/market/plots/${encodeURIComponent(id)}`); } catch (e) {
    return `${backBtn()}<div class="card"><h1>Plot not found</h1><p>${esc(e.message)}</p><a class="btn" href="#/market">${icon('map')}See plots for sale</a></div>`;
  }
  const b = m.booking;
  const bench = m.benchmark[0];
  const where = `Plot ${esc(m.plot_no)}, Street ${esc(m.street)}, Sector ${esc(m.sector)}, ${esc(m.phase_label)}`;
  const parts = [`${backBtn()}
    <span class="muted small">Listing ${esc(m.listing_id)}</span>
    <h1 style="margin-top:2px">${esc(m.size)} ${useLabel(m.use).toLowerCase()} plot, ${esc(m.phase_label)}</h1>
    <div class="card">
      <div class="card-head"><div><span class="muted small">Price</span><div class="p-price p-price-lg">${mil(m.base_price)}</div></div>
        <span class="status-pill ${m.available || b?.status === 'allotted' ? 'ok' : 'off'}">${esc(b?.status === 'allotted' ? 'Allotted to you' : m.mine ? 'Booked by you' : m.status === 'Available' ? 'For sale' : m.status)}</span></div>
      <div class="facts">
        <div class="fact"><b>Location</b>${where}</div>
        <div class="fact"><b>Size</b>${esc(m.size)} (${m.sqyd} sq yd)</div>
        <div class="fact"><b>Type</b>${useLabel(m.use)} · ${esc(m.kind_label)}</div>
        <div class="fact"><b>Token to book</b>${rs(m.token_amount)}</div>
      </div>
      ${bench ? `<p class="small muted" style="margin:14px 0 0">${icon('info', 'inline-ic')} Market price for ${esc(m.size)} in Sector ${esc(bench.sector)}: <b>${mil(bench.min)} to ${mil(bench.max)}</b> (DHA Property Exchange benchmark, ${esc(m.period)}). This listing uses the lower end.</p>` : ''}
    </div>`];

  if (b && b.status === 'allotted') {
    parts.push(`<div class="card p-unread"><h2>${icon('check', 'inline-ic')} Plot allotted to you</h2>
      <p>Membership number <b>${esc(b.membership_no)}</b>. Down payment received (reference ${esc(b.down_ref)}).${b.plan_detail.quarters ? ` Your ${b.plan_detail.quarters} quarterly instalments are in My account.` : ''}</p>
      <p class="small muted">Prototype: in the real process DHA issues the allotment letter. The next steps are for DHA to confirm.</p>
      <a class="btn" href="#/my-account">${icon('banknote')}Open My account</a></div>`);
  } else if (b && b.status === 'token_paid') {
    const rest = b.plan_detail.down - b.token_amount;
    parts.push(`<div class="card p-unread"><h2>${icon('clock', 'inline-ic')} Booked: token received</h2>
      <p>Booking <b>${esc(b.id)}</b> · ${esc(b.plan_detail.label)} · token ${rs(b.token_amount)} paid (reference ${esc(b.token_ref)}).</p>
      <p>Pay <b>${rs(rest)}</b> (${b.plan_detail.quarters ? 'rest of the down payment' : 'the balance'}) by <b>${until(b.hold_until)}</b>. After that the plot goes back on sale.</p>
      <div class="btn-row"><button class="btn" data-action="p-mpay" data-id="${esc(b.id)}">${icon('banknote')}Pay ${rs(rest)} (demo payment)</button>
        <button class="btn btn-ghost" data-action="p-mcancel" data-id="${esc(b.id)}">Cancel booking</button></div>
      <p class="small muted" style="margin:10px 0 0">Demo: no money moves. A real payment would go through DHA's bank or 1Bill.</p></div>`);
  } else if (!m.available) {
    parts.push(`<div class="card"><h2>No longer for sale</h2><p>Someone else has booked this plot.</p><a class="btn btn-secondary" href="#/market?phase=${esc(m.phase)}&size=${encodeURIComponent(m.size)}">${icon('map')}Similar plots</a></div>`);
  }

  if (m.available && !(b && b.status === 'token_paid')) {
    parts.push(`<form class="card" data-action="p-book" data-id="${esc(m.listing_id)}">
      <h2>Choose how to pay</h2>
      <div class="p-plans">${m.plans.map((p, i) => `<label class="p-plan"><input type="radio" name="plan" value="${esc(p.id)}" ${i === 0 ? 'checked' : ''}>
        <span><b>${esc(p.label)}: ${rs(p.total)}</b><span class="sub">${p.quarters ? `${rs(p.down)} down (token included), then ${p.quarters} × ${rs(p.each)} every 3 months` : `${rs(p.total)} in one payment`}</span></span></label>`).join('')}</div>
      ${signedIn()
        ? `<button class="btn btn-block" style="margin-top:14px">${icon('lock')}Book with ${rs(m.token_amount)} token (demo payment)</button>
           <p class="small muted" style="margin:10px 0 0">The plot is held for you for 72 hours while you pay the down payment.</p>`
        : `<a class="btn btn-block" style="margin-top:14px" href="#/signin?next=${encodeURIComponent(`#/market/${m.listing_id}`)}">${icon('lock')}Sign in to book</a>
           <p class="small muted" style="margin:10px 0 0">Booking is in your name, by CNIC.</p>`}
      <p class="small muted" style="margin:10px 0 0">${esc(DEMO_NOTE)}</p></form>`);
  }

  const others = m.sector_rates.filter(r => r.size !== m.size || r.kind !== m.kind);
  if (others.length || m.built_house_rate) {
    parts.push(`<div class="card"><h3>Other market prices in ${esc(m.phase_label)}, Sector ${esc(m.sector)}</h3>
      <table class="p-table"><thead><tr><th>Size</th><th>Rs million</th></tr></thead><tbody>
      ${others.map(r => `<tr><td>${esc(r.size)}${r.kind !== 'plot' ? ` <span class="muted small">(${esc(r.kind.replace('_', '-'))})</span>` : ''}</td><td class="amt">${(r.min / 1e6).toFixed(2)} – ${(r.max / 1e6).toFixed(2)}</td></tr>`).join('')}
      ${m.built_house_rate ? `<tr><td>Built house, ${esc(m.built_house_rate.size)} <span class="muted small">(${esc(m.built_house_rate.sector)})</span></td><td class="amt">${(m.built_house_rate.min / 1e6).toFixed(2)} – ${(m.built_house_rate.max / 1e6).toFixed(2)}</td></tr>` : ''}
      </tbody></table><p class="small muted" style="margin:8px 0 0">DHA Property Exchange benchmark, ${esc(m.period)}. A guide, not a DHA price list.</p></div>`);
  }
  return parts.join('');
}

function bookingsBlock(bookings) {
  const { icon, esc } = H;
  const open = bookings.filter(b => b.status === 'token_paid');
  if (!open.length) return '';
  return `<div class="card p-unread"><h2>${icon('clock', 'inline-ic')} Plot bookings waiting for payment</h2>
    ${open.map(b => `<p><a href="#/market/${esc(b.listing_id)}"><b>${esc(b.id)}</b>: plot ${esc(b.plot?.plot_no)}, ${esc(b.plot?.phase_label)}, Sector ${esc(b.plot?.sector)}</a><br>
      <span class="small muted">${esc(b.plan_detail.label)} · pay ${rs(b.plan_detail.down - b.token_amount)} by ${until(b.hold_until)}</span></p>`).join('')}</div>`;
}

// ---------- Build a house (construction guidance; DHA's Building Control workflow comes later) ----------

const ft = v => (v == null ? '' : String(v.value) === '0' ? 'none' : `${v.value} ${v.unit || ''}`.trim());
const confirmTag = c => (c ? ' <span class="badge badge-warn">Please confirm with DHA</span>' : '');

export async function buildView(params) {
  const { icon, esc, backBtn } = H;
  const me = signedIn() ? await refreshMe().catch(() => null) : null;
  const plots = (me?.memberships || []).filter(m => (m.category || 'Residential') === 'Residential');
  let mem = plots.find(m => m.membership_no === params.get('m')) || null;
  if (!mem && !params.get('size')) mem = plots.find(m => !m.built) || null;
  const sqyd = mem ? B.sqydFrom(mem.size_label) : Number(params.get('size')) || null;
  const apps = mem ? await api('/api/my/applications?view=1').catch(() => null) : [];
  const mine = (apps || []).filter(a => a.membership_no === mem?.membership_no);

  const pickers = `<div class="card b-pick">
    ${plots.length ? `<p class="small muted" style="margin:0 0 8px">Your plots</p><div class="chips">${plots.map(m => `<a class="chip ${mem?.membership_no === m.membership_no ? 'chip-on' : ''}" href="#/build?m=${esc(m.membership_no)}">${icon('home', 'inline-ic')} Plot ${esc(m.plot_no)}, ${esc(m.sector)}, Phase ${esc(m.phase)}${m.built ? ' (built)' : ''}</a>`).join('')}</div>` : ''}
    <p class="small muted" style="margin:${plots.length ? '14px' : '0'} 0 8px">${plots.length ? 'Or see the rules for another size' : 'Choose a plot size'}</p>
    <div class="chips">${K.PLOT_SIZES.map(s => `<a class="chip ${!mem && sqyd === s.sqyd ? 'chip-on' : ''}" href="#/build?size=${s.sqyd}">${esc(s.label)}</a>`).join('')}</div>
  </div>`;
  const head = `${backBtn()}
    <h1>Build a house</h1>
    <p class="muted">The steps from possession to moving in, with the building limits, fees and fines for your plot size.</p>
    <div class="note" style="margin-bottom:16px">${icon('info', 'inline-ic')} Guidance from the DHA Byelaws 2022 (updated 2023) and the Schedule of Charges. ${mem ? 'Your site plan and building plan applications come from DHA\'s membership portal; the ticks in the steps below are your own checklist.' : 'Sign in to see your own site plan and building plan applications.'}</div>
    ${pickers}
    ${mem ? AP.block(mine, apps === null) : ''}`;
  if (!sqyd) return head;

  const g = B.buildGuide(sqyd, mem?.build_done || []);
  const r = g.rules;
  const done = g.stages.filter(s => s.done).length;
  const gf = r.ground_floor;
  const sb = r.setbacks;
  const parts = [head];

  parts.push(`<div class="card">
    <h2 style="margin-top:0">What you can build on a ${esc(r.size)} plot</h2>
    <div class="facts">
      <div class="fact"><b>Ground floor</b>${gf?.missing ? 'Please ask Building Control for this plot size' :`Up to ${gf.pct}% of the plot: about ${gf.sqft.toLocaleString('en-PK')} sq ft, car porch included`}${confirmTag(gf?.confirm && !gf?.missing)}</div>
      <div class="fact"><b>First floor</b>${r.first_floor ? `${esc(r.first_floor.text)}${r.first_floor.sqft ? ` (about ${r.first_floor.sqft.toLocaleString('en-PK')} sq ft)` : ''}${confirmTag(r.first_floor.confirm)}` : 'Ask Building Control'}</div>
      <div class="fact"><b>Open space in front</b>${ft(sb.front)}${sb.front?.notes ? `<span class="small muted" style="display:block">${esc(sb.front.notes.replace(/\s*\(Ch XIV\)/, ''))}</span>` : ''}</div>
      <div class="fact"><b>Back and sides</b>Back ${ft(sb.rear)} · porch side ${ft(sb.side_porch)} · other side ${ft(sb.side_other)}</div>
      <div class="fact"><b>Height</b>${r.storeys ? `${r.storeys.value} storeys, ` : ''}${r.height ? `at most ${ft(r.height)} including the water tank and mumty` : ''}</div>
      <div class="fact"><b>Also required</b>${r.room ? `Rooms at least ${ft(r.room)} · ` : ''}${r.extinguishers ? `${r.extinguishers.value} fire extinguishers` : ''}</div>
    </div>
    <p class="small muted" style="margin:12px 0 0">DHA Byelaws clause ${esc(r.clause)} and 8.54 general rules. Your architect works these into the drawings.</p>
  </div>`);

  if (mem) {
    parts.push(`<div class="card ${g.next ? 'p-unread' : ''}"><div class="card-head"><div><span class="muted small">Plot ${esc(mem.plot_no)}, Street ${esc(mem.street)}, Sector ${esc(mem.sector)}, Phase ${esc(mem.phase)}</span>
      <h2 style="margin:2px 0 0">${g.next ? `Next: ${esc(g.next.title)}` : 'All steps ticked'}</h2></div><span class="status-pill ${g.next ? '' : 'ok'}">${done} of ${g.stages.length} done</span></div>
      <div class="p-bar" aria-label="${done} of ${g.stages.length} steps done"><span style="width:${Math.round(100 * done / g.stages.length)}%"></span></div></div>`);
  } else if (!signedIn()) {
    parts.push(`<p class="small muted">${icon('lock', 'inline-ic')} <a href="#/signin?next=${encodeURIComponent('#/build')}">Sign in</a> to see this for your own plot and tick off the steps as you go.</p>`);
  }

  parts.push(`<h2>The steps</h2><ol class="b-stages">${g.stages.map(s => {
    const open = mem ? g.next?.key === s.key : s.no === 1;
    return `<li class="card b-stage ${s.done ? 'b-done' : ''}">
      <details ${open ? 'open' : ''}><summary><span class="b-no">${s.done ? icon('check') : s.no}</span><span class="b-title">${esc(s.title)}<span class="sub">${esc(s.time || '')}</span></span></summary>
      <div class="b-body">
        <p>${esc(s.action)}</p>
        ${s.who || s.office ? `<p class="small muted">${esc([s.who && `Who: ${s.who}`, s.office && `Where: ${s.office}`].filter(Boolean).join(' · '))}</p>` : ''}
        ${s.key === 'construction' ? `<p class="small"><b>Minimum building quality:</b> ${r.structural.map(x => `${esc(x.text.replace(/^Minimum /, '').replace(/^(\w)/, c => c.toLowerCase()))} ${esc(x.value)}`).join('; ')}.</p>` : ''}
        ${s.rules.length ? `<ul class="small">${s.rules.map(x => `<li>${esc(x.text.replace(/ - /, ', '))}: <b>${x.unit === 'time' ? 'until ' : ''}${esc(x.value)}${x.unit && !['time', 'date range'].includes(x.unit) ? ` ${esc(x.unit)}` : ''}</b></li>`).join('')}</ul>` : ''}
        ${s.fees.length ? `<table class="p-table"><thead><tr><th>Fee</th><th>Amount</th></tr></thead><tbody>${s.fees.map(f => `<tr><td>${esc(f.label)}<span class="small muted" style="display:block">${esc(f.how)}</span></td><td class="amt">${f.amount != null ? K.rupees(f.amount) : '—'}${confirmTag(f.confirm)}</td></tr>`).join('')}</tbody></table>` : ''}
        ${s.documents.length ? `<p class="small"><b>${s.documents.length} documents</b> to prepare${s.key === 'drawings' ? ', most of them from your registered architect and structure engineer' : ''}.</p>` : ''}
        ${s.fines.length || s.regs.length ? `<div class="note note-warn b-fines"><b>${icon('alert', 'inline-ic')} Avoid these fines</b><ul>${s.fines.map(f => `<li>${esc(f.violation)}: ${esc(B.fineText(f))}</li>`).join('')}${s.regs.map(x => `<li>${esc(x.item)}: ${esc(B.regText(x))}</li>`).join('')}</ul></div>` : ''}
        <div class="btn-row">
          ${s.service_id ? `<a class="btn btn-secondary btn-small" href="#/service/${esc(s.service_id)}">${icon('list')}Documents, forms and contacts</a>` : ''}
          ${mem ? `<button class="btn btn-small ${s.done ? 'btn-ghost' : ''}" data-action="b-stage" data-m="${esc(mem.membership_no)}" data-stage="${esc(s.key)}" data-done="${s.done ? '0' : '1'}">${s.done ? 'Not done yet' : `${icon('check')}Mark as done`}</button>` : ''}
        </div>
      </div></details></li>`;
  }).join('')}</ol>`);

  parts.push(`<details class="card p-sched"><summary><b>Built beyond the limits?</b> Regularization charges (${g.regularization.length})</summary>
    <p class="small muted">Small deviations can be regularized by paying these charges. Beyond the limit, the work is demolished.</p>
    <table class="p-table"><thead><tr><th>Item</th><th>Allowed up to</th><th>Charge</th></tr></thead><tbody>
    ${g.regularization.map(x => `<tr><td>${esc(x.item)}</td><td>${esc(x.max_allowed_deviation || '—')}</td><td class="amt">${esc(B.regText(x))}</td></tr>`).join('')}</tbody></table></details>
    <div class="btn-row"><a class="btn btn-secondary" href="#/ask?q=${encodeURIComponent(`Can I build a basement on a ${r.size.replace(/ \(.*/, '')} plot?`)}">${icon('chat')}Ask about building rules</a>
      <a class="btn btn-ghost" href="#/contacts">${icon('phone')}Building Control phone numbers</a></div>
    <p class="small muted">Source: ${esc(g.source)}.</p>`);
  return parts.join('');
}

// ---------- Events ----------

export function afterRender(route, params) {
  document.querySelector('.p-filters')?.addEventListener('change', e => e.currentTarget.requestSubmit());
  if (!route) fillForYou();
  if (route === 'my-account' && params.get('pay')) document.getElementById('bill-pay')?.scrollIntoView({ block: 'center' });
  if (route !== 'report' || !signedIn() || S.busy) return;
  // A problem sent from the chat or a link (?text=) is a new report: it replaces one left unfinished,
  // which used to keep the screen on the old report so "Continue" seemed to do nothing.
  const text = params.get('text');
  if (text) {
    history.replaceState(null, '', '#/report');
    restartIntake(text);
  } else if (!S.intake) {
    restartIntake('');
  }
}

export async function onClick(a, el) {
  switch (a) {
    case 'p-signin': {
      const changed = S.cnic !== el.dataset.cnic;
      S.cnic = el.dataset.cnic;
      save(S.cnic);
      if (changed) { S.intake = null; S.log = []; S.unread = 0; S.receipt = null; }
      startPolling();
      location.hash = el.dataset.next || '#/';
      return true;
    }
    case 'p-signout': signOut(); location.hash = '#/'; return true;
    case 'p-restart': restartIntake(''); return true;
    case 'p-quick': intakeTurn({ key: el.dataset.key }, el.dataset.label); return true;
    case 'p-choose': {
      const v = el.dataset.value;
      if (v === '__restart') { restartIntake(''); return true; }
      if (v === '__home') { location.hash = '#/'; return true; }
      if (v === '__account') { location.hash = '#/my-account'; return true; }
      if (v.startsWith('__open:')) { location.hash = `#/my-complaints/${v.slice(7)}`; return true; }
      intakeTurn({ choice: v }, el.dataset.label);
      return true;
    }
    case 'p-feedback': {
      el.disabled = true;
      await api(`/api/my/complaints/${el.dataset.ref}/feedback`, { method: 'POST', body: { resolved: el.dataset.ok === '1' } });
      await refreshMe();
      H.render();
      return true;
    }
    case 'p-simulate': {
      el.disabled = true;
      await api(`/api/my/complaints/${el.dataset.ref}/simulate`, { method: 'POST' });
      setTimeout(pollNotifications, 400);
      H.render();
      return true;
    }
    case 'p-mpay':
    case 'p-mcancel': {
      if (a === 'p-mcancel' && !confirm('Cancel this booking? The plot goes back on sale. (Demo: the token is not refunded here.)')) return true;
      el.disabled = true;
      try {
        await api(`/api/market/bookings/${el.dataset.id}/${a === 'p-mpay' ? 'pay' : 'cancel'}`, { method: 'POST' });
        await refreshMe();
        setTimeout(pollNotifications, 300);
      } catch (e) { alert(e.message); }
      H.render();
      return true;
    }
    case 'b-stage': {
      el.disabled = true;
      try { await api('/api/build/progress', { method: 'POST', body: { membership_no: el.dataset.m, stage: el.dataset.stage, done: el.dataset.done === '1' } }); }
      catch (e) { alert(e.message); }
      H.render();
      return true;
    }
    case 'a-sim': {
      el.disabled = true;
      try { await api(`/api/my/applications/${el.dataset.id}/simulate`, { method: 'POST' }); setTimeout(pollNotifications, 400); }
      catch (e) { alert(e.message); }
      H.render();
      return true;
    }
    case 'p-cancel': {
      if (!confirm('Cancel this complaint?')) return true;
      await api(`/api/my/complaints/${el.dataset.ref}/cancel`, { method: 'POST' });
      H.render();
      return true;
    }
  }
  return false;
}

export async function onSubmit(action, form) {
  if (action === 'p-market-filter') {
    const q = new URLSearchParams([...new FormData(form)].filter(([, v]) => v));
    location.hash = `#/market${q.size ? `?${q}` : ''}`;
    return true;
  }
  if (action === 'bill-pay') {
    const btn = form.querySelector('button');
    if (btn) btn.disabled = true;
    try {
      const r = await api('/api/my/bills/pay', { method: 'POST', body: { consumer_id: form.dataset.id, channel: form.channel.value } });
      S.receipt = { consumer_id: form.dataset.id, ...r };
      setTimeout(pollNotifications, 300);
    } catch (e) { alert(e.message); }
    H.render();
    return true;
  }
  if (action === 'a-pay') {
    const btn = form.querySelector('button');
    if (btn) btn.disabled = true;
    try {
      await api(`/api/my/applications/${form.dataset.id}/pay`, { method: 'POST', body: { channel: form.channel.value } });
      setTimeout(pollNotifications, 400);
    } catch (e) { alert(e.message); }
    H.render();
    return true;
  }
  if (action === 'p-book') {
    const btn = form.querySelector('button');
    if (btn) btn.disabled = true;
    try {
      await api(`/api/market/plots/${form.dataset.id}/book`, { method: 'POST', body: { plan: form.plan.value } });
      setTimeout(pollNotifications, 300);
    } catch (e) { alert(e.message); }
    H.render();
    return true;
  }
  const q = form.q?.value?.trim() || '';
  if (action === 'p-say' && q) { intakeTurn({ text: q }, q); return true; }
  if (action === 'p-info' && q) {
    await api(`/api/my/complaints/${form.dataset.ref}/info`, { method: 'POST', body: { text: q } });
    H.render();
    return true;
  }
  return action.startsWith('p-');
}

export function onKeydown(e) {
  if (e.target.matches('.p-report .chat-input textarea') && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const q = e.target.value.trim();
    if (q) intakeTurn({ text: q }, q);
    return true;
  }
  return false;
}
