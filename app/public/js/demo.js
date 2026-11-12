// Demo control panel (#/demo), for staff presenting the prototype to DHA:
//   1. Before / after: complaints by channel from the CMS export, and a what-if slider (a scenario, not a target)
//   2. Live: what this demo session did online that would otherwise have been a call
//   3. Controls: start as a persona on the right screen, move a portal complaint on (field team), reset the data
// Numbers come from /api/demo/summary (core/demo.js), which names its sources.

let H = null; // helpers from app.js: icon, esc, render
export function init(helpers) { H = helpers; }

const D = { share: 0, data: null, timer: null };

// Where each persona's part of the demo starts.
const SCRIPT = {
  prospect: { go: '#/market', show: 'Browse DHA plots, see prices from PVBM and book one with a token' },
  member: { go: '#/my-account', show: 'Overdue instalment, payment schedule and society bills' },
  builder: { go: '#/build', show: 'Step-by-step building guide with limits, fees and fines for the plot' },
  resident: { go: '#/report', show: 'Report a problem in plain words; follow it to "fixed"' },
  resident_member: { go: '#/my-complaints', show: 'Complaints, notifications and confirming a fix online' },
};

const CHANNEL_COLOR = { 'Incoming Call': 'var(--accent)', 'Walk In': '#8a8f8c', Android: '#3b6fb6', iOS: '#6d8fc7', 'Resident Portal': 'var(--primary)' };
const CHANNEL_LABEL = { 'Incoming Call': 'Phone (1092)', 'Walk In': 'Walk in', Android: 'Android app', iOS: 'iOS app', 'Resident Portal': 'Resident portal' };
const n0 = n => Math.round(n).toLocaleString('en-PK');
const pct = x => `${Math.round(x * 100)}%`;

async function load() {
  const r = await fetch(`/api/demo/summary?share=${D.share}`);
  if (!r.ok) throw new Error(`Could not load the demo summary (${r.status})`);
  D.data = await r.json();
  return D.data;
}

export async function demoView() {
  const { icon, esc, backBtn } = H;
  let s;
  try { s = await load(); } catch (e) { return `${backBtn()}<div class="note note-danger">${esc(e.message)}</div>`; }
  const b = s.baseline;
  return `${backBtn('#/settings', 'Settings')}
    <h1>Demo control panel</h1>
    <p class="muted">For DHA staff presenting the prototype. The goal this shows: fewer calls to the call center.</p>
    ${resetAge(s.seeded_at)}

    <div class="card">
      <h2>Complaints by channel: before and after</h2>
      <p class="small muted" style="margin-top:0">Before: ${n0(b.total)} complaints in the CMS export, ${esc(fmtDay(b.from))} to ${esc(fmtDay(b.to))}
        (${b.days} days, about ${n0(b.per_day)} a day). <b>${pct(b.phone_share)}</b> came in by phone.</p>
      <div id="demo-scenario">${scenarioHtml(s.scenario)}</div>
      <div class="field" style="margin-top:18px">
        <label for="demo-share"><b>What if</b> <span id="demo-share-val">${pct(D.share)}</span> of phone complaints were made in the portal instead?</label>
        <input id="demo-share" type="range" min="0" max="100" step="5" value="${Math.round(D.share * 100)}" data-action="demo-share" style="width:100%">
        <p class="small muted" style="margin:4px 0 0">A scenario to discuss, not a target: DHA set no targets for the prototype. The same share of outbound feedback calls is replaced by the resident answering "fixed / not fixed" in the portal.</p>
      </div>
    </div>

    <div class="card">
      <h2>Most phoned-in problems</h2>
      <p class="small muted" style="margin-top:0">The portal's guided report covers all of these first.</p>
      <div class="demo-bars">${b.top_phone.map(t => bar(t.sub_category, t.share, `${n0(t.n)} (${pct(t.share)} of phone complaints)`, 'var(--accent)', b.top_phone[0].share)).join('')}</div>
    </div>

    <div id="demo-live">${liveHtml(s.live)}</div>

    <div class="card">
      <h2>Run the demo</h2>
      <p class="small muted" style="margin-top:0">Each button signs in as that person and opens the screen for their part.</p>
      <div class="list-buttons">${s.personas.map(p => {
        const sc = SCRIPT[p.persona] || { go: '#/', show: '' };
        return `<button class="list-btn" data-action="p-signin" data-cnic="${esc(p.cnic)}" data-next="${esc(sc.go)}">
          <span class="lb-left"><span class="lb-icon">${icon('users')}</span><span>${esc(p.name)} <span class="sub">${esc(p.label)} · ${esc(sc.show)}</span></span></span>${icon('right')}</button>`;
      }).join('')}</div>
      <div class="btn-row">
        <button class="btn btn-ghost" data-action="demo-refresh">${icon('clock')}Refresh numbers</button>
        <button class="btn btn-ghost" data-action="demo-reset">Reset demo data</button>
      </div>
    </div>

    <p class="small muted">Sources: ${esc(b.source)}; ${esc(s.call_center.source)} (calls answered, feedback calls). The complaint mix and the call totals come from different periods and are shown separately, never added together. Each online action counts as one call, a plain rule for DHA to check against its own call reasons.</p>`;
}

// The story's dates ("a neighbour reported this an hour ago") are set when the data is reset.
function resetAge(at) {
  const { esc, icon } = H;
  if (at && Date.now() - Date.parse(at) < 12 * 3600000) return '';
  const when = at ? `Demo data was last reset on ${new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` : 'Demo data has not been reset since this panel was added.';
  return `<div class="note note-warn" style="margin-bottom:14px">${icon('alert', 'inline-ic')} ${esc(when)} Press <b>Reset demo data</b> below shortly before presenting, so the dates look current.</div>`;
}

function fmtDay(d) {
  return new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function bar(label, frac, value, color, max = 1) {
  const { esc } = H;
  return `<div class="demo-bar"><span class="demo-bar-label">${esc(label)}</span>
    <span class="demo-bar-track"><span style="width:${Math.max(0.5, (frac / max) * 100)}%;background:${color}"></span></span>
    <span class="demo-bar-value">${esc(value)}</span></div>`;
}

function stack(title, rows) {
  const { esc } = H;
  const total = rows.reduce((t, r) => t + r.n, 0) || 1;
  const shown = rows.filter(r => r.n > 0);
  return `<div class="demo-stack">
    <div class="demo-stack-head"><b>${esc(title)}</b><span class="small muted">${n0(total)} a month</span></div>
    <div class="demo-stack-bar" role="img" aria-label="${esc(title)}: ${shown.map(r => `${CHANNEL_LABEL[r.channel] || r.channel} ${pct(r.n / total)}`).join(', ')}">
      ${shown.map(r => `<span style="flex:${r.n};background:${CHANNEL_COLOR[r.channel] || '#999'}" title="${esc(CHANNEL_LABEL[r.channel] || r.channel)}: ${n0(r.n)}">${r.n / total >= 0.08 ? pct(r.n / total) : ''}</span>`).join('')}
    </div></div>`;
}

function scenarioHtml(sc) {
  const { esc } = H;
  const channels = [...new Set([...sc.before, ...sc.after].map(r => r.channel))];
  const cc = sc.call_center;
  return `${stack('Before (CMS export)', sc.before)}
    ${stack(sc.share ? `After (what if ${pct(sc.share)} move)` : 'After (move the slider)', sc.after)}
    <div class="demo-legend">${channels.map(c => `<span><i style="background:${CHANNEL_COLOR[c] || '#999'}"></i>${esc(CHANNEL_LABEL[c] || c)}</span>`).join('')}</div>
    <div class="demo-kpis">
      <div><b>${n0(cc.load_before)}</b><span>calls in January 2025, the latest call-center report we have: answered + feedback calls</span></div>
      <div><b>${n0(cc.complaint_calls_saved)}</b><span>complaint calls not needed</span></div>
      <div><b>${n0(cc.feedback_calls_saved)}</b><span>feedback calls not needed</span></div>
      <div class="demo-kpi-main"><b>${n0(cc.load_after)}</b><span>calls that month in this scenario (${pct(cc.load_before ? 1 - cc.load_after / cc.load_before : 0)} fewer)</span></div>
    </div>`;
}

function liveHtml(l) {
  const { esc, icon } = H;
  const ev = a => ({ submitted: 'made a complaint', followed_existing: 'joined an open complaint', info_added: 'added details',
    self_served: 'got an answer without a complaint', rule_explained: 'had a rule explained', confirmed_fixed: 'confirmed a fix',
    reopened: 'reopened a complaint', question_answered: 'asked the assistant', handoff: 'was passed to a person',
    intake_abandoned: 'left a report unfinished', intake_started: 'started a report', cms_event: 'got a CMS update',
    cancelled: 'cancelled a complaint', plot_booked: 'booked a plot', plot_allotted: 'paid the down payment',
    booking_cancelled: 'cancelled a booking', build_stage_done: 'ticked a building step', build_stage_undone: 'unticked a building step',
    application_checked: 'checked an application', intent_answered: 'got an answer from their own account', voucher_paid_online: 'paid a fee voucher',
    bill_paid_online: 'paid a society bill', membership_event: 'got a membership portal update' }[a] || a.replace(/_/g, ' '));
  const time = at => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `<div class="card">
    <h2>Live in this demo</h2>
    <div class="demo-kpis">
      <div class="demo-kpi-main"><b>${n0(l.calls_saved)}</b><span>calls not needed so far</span></div>
      <div><b>${n0(l.portal_complaints)}</b><span>complaints made in the portal</span></div>
      <div><b>${n0(l.status_updates_sent)}</b><span>status updates sent (no "what is happening?" call)</span></div>
      <div><b>${n0(l.not_saved.find(x => x.event === 'handoff')?.n || 0)}</b><span>passed to a person</span></div>
    </div>
    <table class="demo-table"><thead><tr><th>Done online</th><th>Instead of</th><th>Count</th></tr></thead><tbody>
      ${l.saved.map(r => `<tr${r.n ? '' : ' class="muted"'}><td>${esc(r.label)}</td><td>${esc(r.instead)}</td><td>${r.n}</td></tr>`).join('')}
    </tbody></table>

    <h3 style="margin-top:22px">Field team (CMS simulator)</h3>
    ${l.open_portal_complaints.length
      ? `<p class="small muted" style="margin-top:0">Moves a complaint on as the field team would in the CMS: Submitted → In Process → Resolved. The resident gets a notification each time.</p>
        <div class="list-buttons">${l.open_portal_complaints.map(c => `<button class="list-btn" data-action="demo-advance" data-ref="${esc(c.reference)}">
          <span>${esc(c.reference)} · ${esc(c.sub_category)}<span class="sub">${esc(c.member_name || '')} · ${esc(c.status)} → ${c.status === 'In Process' ? 'Resolved' : 'In Process'}</span></span>${icon('right')}</button>`).join('')}</div>`
      : '<p class="small muted">No open portal complaints yet. Start as Imran and report a problem, then move it on from here.</p>'}

    <h3 style="margin-top:22px">Recent activity</h3>
    ${l.activity.length
      ? `<ul class="demo-activity">${l.activity.map(a => `<li><span class="muted">${time(a.at)}</span> ${esc(a.name || 'A visitor')} ${esc(ev(a.event))}${a.detail?.ref ? ` <span class="muted">(${esc(a.detail.ref)})</span>` : ''}</li>`).join('')}</ul>`
      : '<p class="small muted">Nothing yet in this demo.</p>'}
  </div>`;
}

async function refreshLive() {
  const s = await load();
  const el = document.getElementById('demo-live');
  if (el) el.innerHTML = liveHtml(s.live);
}

export function onInput(t) {
  if (t.dataset.action !== 'demo-share') return false;
  D.share = Number(t.value) / 100;
  document.getElementById('demo-share-val').textContent = pct(D.share);
  clearTimeout(D.timer);
  D.timer = setTimeout(async () => {
    const s = await load();
    const el = document.getElementById('demo-scenario');
    if (el) el.innerHTML = scenarioHtml(s.scenario);
  }, 120);
  return true;
}

export async function onClick(a, el) {
  switch (a) {
    case 'demo-refresh': await refreshLive(); return true;
    case 'demo-advance':
      el.disabled = true;
      try {
        const r = await fetch('/api/demo/advance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: el.dataset.ref }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Error ${r.status}`);
      } catch (e) { alert(e.message); }
      setTimeout(refreshLive, 300); // the CMS event reaches the app a moment later
      return true;
    case 'demo-reset':
      if (!confirm('Rebuild all demo data (people, bills, plots, CMS complaints)? Everything done in this demo is cleared.')) return true;
      el.disabled = true;
      await fetch('/api/demo/reset', { method: 'POST' });
      H.render();
      return true;
  }
  return false;
}
