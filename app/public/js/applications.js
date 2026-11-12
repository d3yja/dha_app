// A member's applications with DHA (site plan, building plan) and their fee vouchers, as the membership portal
// reports them (via /api/my/applications). Used on Build a house and My account.

let H = null; // { icon, esc, fmt, fmtDate, rs } from portal.js
export function init(helpers) { H = helpers; }

const CHANNEL_OPTIONS = [['ipg', 'Debit or credit card (online)'], ['eft', 'Bank transfer (EFT)'], ['rda', 'Roshan Digital Account (overseas)']];
const dateOf = at => (at ? H.fmtDate(String(at).slice(0, 10)) : '');
const daysText = d => (d < 1 ? 'less than a day' : `about ${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);

// One line per application under a plot in My account.
export function lines(list, membershipNo) {
  const { icon, esc, rs, fmtDate } = H;
  if (!list.length) return '';
  return `<h3 style="margin-top:18px">Applications with DHA</h3>${list.map(a => `<a class="note b-link ${a.who === 'you' ? 'note-warn' : ''}" style="margin-top:8px" href="#/build?m=${encodeURIComponent(membershipNo)}">
    ${icon(a.done ? 'check' : a.who === 'you' ? 'alert' : 'clock', 'inline-ic')} <span><b>${esc(a.title)}: ${esc(a.label)}.</b>
    <span>${a.voucher_due ? `Fee voucher ${rs(a.voucher_due.amount)}, ${a.voucher_due.overdue ? 'overdue' : `due ${fmtDate(a.voucher_due.due_date)}`}.` : esc(a.who === 'you' ? a.next : '')}</span></span>${icon('right')}</a>`).join('')}`;
}

// The applications section on Build a house. failed: the membership portal could not be reached.
export function block(list, failed) {
  const { icon } = H;
  if (failed) return `<div class="note note-warn" style="margin-bottom:16px">${icon('alert', 'inline-ic')} The membership portal could not be reached, so your applications cannot be shown right now.</div>`;
  if (!list.length) return `<div class="card"><h2 style="margin-top:0">Your applications with DHA</h2><p class="muted" style="margin:0">No site plan or building plan application on this plot yet. The steps below show how to start.</p></div>`;
  return `<h2>Your applications with DHA</h2>${list.map(card).join('')}`;
}

function charges(x) {
  const { esc, rs } = H;
  return `<table class="p-table"><thead><tr><th>Charge</th><th>Amount</th></tr></thead><tbody>
    ${x.items.map(i => `<tr><td>${esc(i.description)}${i.gst ? ` <span class="muted small">incl. GST ${rs(i.gst)}</span>` : ''}</td><td class="amt">${rs(i.amount_with_gst)}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="amt"><b>${rs(x.amount)}</b></td></tr></tbody></table>
    ${x.waived.length ? `<p class="small muted" style="margin:6px 0 0">Not charged: ${esc(x.waived.join('; '))}.</p>` : ''}`;
}

function card(a) {
  const { icon, esc, rs, fmt, fmtDate } = H;
  const v = a.voucher_due;
  const paid = a.vouchers.filter(x => x.status === 'paid');
  const pill = a.done ? '<span class="status-pill ok">Done</span>' : a.who === 'you' ? '<span class="status-pill">Your turn</span>' : '<span class="status-pill off">With DHA</span>';
  const voucher = v ? `<div class="note ${v.overdue ? 'note-danger' : 'note-warn'}" style="margin-top:14px">
      <b>${icon('banknote', 'inline-ic')} Fee voucher: ${rs(v.amount)}, ${v.overdue ? `overdue since ${fmtDate(v.due_date)}` : `due by ${fmtDate(v.due_date)}`}</b>
      <details class="p-sched" style="margin-top:8px"><summary>What the voucher is for (${v.items.length} charges)</summary>${charges(v)}</details>
      <form class="a-pay" data-action="a-pay" data-id="${a.id}">
        <div class="field"><label for="a-ch-${a.id}">Pay by</label><select id="a-ch-${a.id}" name="channel">${CHANNEL_OPTIONS.map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
        <button class="btn">${icon('lock')}Pay ${rs(v.amount)} (demo payment)</button>
      </form>
      <p class="small muted" style="margin:8px 0 0">Demo: no money moves. These payment methods are the ones recorded in DHA's membership portal; DHA to confirm the details.</p></div>` : '';
  const paidList = paid.length ? `<details class="p-sched"><summary>Paid vouchers (${paid.length})</summary>${paid.map(x => `<p class="small" style="margin:8px 0 4px"><b>${rs(x.paid_amount || x.amount)}</b> paid ${dateOf(x.paid_at)}${x.channel ? ` ${esc(x.channel)}` : ''}${x.transaction_id ? ` · reference ${esc(x.transaction_id)}` : ''}</p>${charges(x)}`).join('')}</details>` : '';
  const history = `<details class="p-sched"><summary>History (${a.history.length} update${a.history.length === 1 ? '' : 's'})</summary><ul class="a-hist">${a.history.map(h => `<li><b>${esc(h.label)}</b> <span class="muted small">${fmt(h.at)}</span>${h.remarks && !/^(ok|new submission)$/i.test(h.remarks) ? `<br><span class="small">${esc(h.remarks)}</span>` : ''}</li>`).join('')}</ul></details>`;
  const officeCanAct = !a.done && !v && a.status !== 'Under Development';
  return `<div class="card ${a.who === 'you' ? 'p-unread' : ''}">
    <div class="card-head"><div><span class="muted small">${esc(a.title)} · ${esc(a.office)} · application ${esc(a.code)}</span>
      <h3 style="margin:2px 0 0"><span>${esc(a.label)}</span> <span class="muted small" style="font-weight:400">since ${dateOf(a.updated_at)}</span></h3></div>${pill}</div>
    <ol class="a-steps" aria-label="Steps">${a.steps.map(st => `<li class="${st.state}">${st.state === 'done' ? '✓ ' : ''}${esc(st.label)}</li>`).join('')}</ol>
    <p style="margin:0">${a.stopped && a.who === 'you' ? `${icon('alert', 'inline-ic')} ` : ''}<span>${esc(a.next)}</span>${a.who === 'dha' && a.usual_days ? ` <span class="muted">This step usually takes ${daysText(a.usual_days)}.</span>` : ''}</p>
    ${voucher}${paidList}${history}
    <div class="btn-row" style="margin-top:10px">
      ${officeCanAct ? `<button class="btn btn-ghost btn-small" data-action="a-sim" data-id="${a.id}">${icon('clock')}Demo: DHA office takes the next step</button>` : ''}
      <a class="btn btn-ghost btn-small" href="#/contacts">${icon('phone')}${esc(a.office)} phone numbers</a></div>
    <p class="small muted" style="margin:8px 0 0">From DHA's membership portal (sample data).</p>
  </div>`;
}
