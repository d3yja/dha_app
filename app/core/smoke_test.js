// End-to-end check of the complaint loop against a running server:
//   intake → CMS create → field-team update → CMS event → notification → resident feedback → CMS closed.
//   node core/smoke_test.js [baseUrl]      (default http://localhost:5173)
// It files real complaints in the CMS stub and sells a marketplace plot; reset the demo afterwards (Settings, or node core/seed.js).

const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 5173}`;
const IMRAN = '61101-7734520-9';
const FARAH = '37405-9081726-1';
let failures = 0;

async function api(cnic, method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': cnic }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error || ''}`);
  return json;
}
const intake = (cnic, body) => api(cnic, 'POST', '/api/intake', body);
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' (' + detail + ')' : ''}`);
  if (!ok) failures++;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. A plumber visit, visit time taken from the text.
  let r = await intake(IMRAN, { text: 'kitchen tap is leaking, someone can come in the evening' });
  check('classified as Plumber', r.key === 'Plumbing|Plumber', r.key);
  check('visit time detected from text', r.summary?.some(x => x.label === 'Visit time' && /Evening/.test(x.value)));
  check('address filled from profile', r.summary?.some(x => x.label === 'Where' && /Street 3/.test(x.value)));
  r = await intake(IMRAN, { id: r.id, choice: 'submit' });
  const ref = r.ref;
  check('submitted to the CMS', r.done && /^C\d{12}$/.test(ref || ''), ref);
  const again = await intake(IMRAN, { id: r.id, choice: 'submit' });
  check('a repeated submit does not file twice', !again.ref || again.ref === ref);

  // 2. The CMS record matches the template.
  const c = await (await fetch(`${BASE}/cms/api/complaints/${ref}`)).json();
  check('CMS has the complaint', c.reference === ref && c.status === 'Submitted');
  check('CMS fields filled', c.member_cnic === IMRAN && c.phase === '2' && c.sector === 'E' && c.street === '3' && c.followup_cell === '03015556677');
  check('request source is the portal', c.request_source === 'Resident Portal');

  // 3. Field team acts in the CMS → event → notification.
  await api(IMRAN, 'POST', `/api/my/complaints/${ref}/simulate`);
  await wait(300);
  let notes = await api(IMRAN, 'GET', '/api/notifications');
  check('notified: team assigned', notes.some(n => n.ref === ref && /team assigned/.test(n.title)));
  await api(IMRAN, 'POST', `/api/my/complaints/${ref}/simulate`);
  await wait(300);
  notes = await api(IMRAN, 'GET', '/api/notifications');
  const resolved = notes.find(n => n.ref === ref && n.kind === 'resolved');
  check('notified: resolved, with confirm/reopen', resolved && resolved.actions.includes('confirm'));

  // 4. Resident says it is fixed → CMS Closed, buttons cleared, no self-notification.
  const fb = await api(IMRAN, 'POST', `/api/my/complaints/${ref}/feedback`, { resolved: true });
  check('CMS closed after confirmation', fb.status === 'Closed', fb.status);
  await wait(300);
  notes = await api(IMRAN, 'GET', '/api/notifications');
  check('resolution buttons cleared', !notes.some(n => n.ref === ref && n.actions.length));
  check('no notification for own action', !notes.some(n => n.ref === ref && /closed/.test(n.title)));

  // 5. Area outage: a neighbour already reported it → follow instead of a new complaint.
  r = await intake(IMRAN, { text: 'pani nahi aa raha' });
  check('street duplicate found', r.step === 'street_dup', r.step);
  if (r.step === 'street_dup') {
    r = await intake(IMRAN, { id: r.id, choice: 'follow' });
    const mine = await api(IMRAN, 'GET', '/api/my/complaints');
    check('followed complaint listed', mine.some(x => x.reference === r.ref && x.relation === 'following'));
  }

  // 6. Own open complaint of the same type → offer to add to it.
  r = await intake(IMRAN, { text: 'fan not working' });
  check('own open complaint found', r.step === 'own_dup', r.step);

  // 7. Water bowzer 48-hour rule.
  r = await intake(FARAH, { text: 'water tanker chahiye abhi' });
  for (let i = 0; i < 4 && r.step === 'question'; i++) r = await intake(FARAH, { id: r.id, choice: r.options[0].value });
  if (r.step === 'confirm') r = await intake(FARAH, { id: r.id, choice: 'submit' });
  check('first bowzer order filed', r.done && !!r.ref, r.ref);
  r = await intake(FARAH, { text: 'water bowzer required' });
  check('second bowzer within 48h explained', r.done && /48 hours/.test(r.messages.map(m => m.text).join(' ')));

  // 8. Billing: bill shown first.
  r = await intake(IMRAN, { text: 'my bill was not received' });
  if (r.step === 'pick') r = await intake(IMRAN, { id: r.id, choice: 'Utility Bills|Bill Not Received' });
  check('bill lookup offered first', r.step === 'bill_check', r.step);

  // 9. Safety: advice and urgent priority.
  r = await intake(IMRAN, { text: 'sparking from the switch board in the lounge' });
  check('safety advice shown', r.messages.some(m => m.kind === 'safety'));
  check('marked urgent', r.summary?.some(x => x.label === 'Priority'));

  // 10. Talk to a person.
  r = await intake(IMRAN, { text: 'hello' });
  r = await intake(IMRAN, { id: r.id, choice: '__human' });
  check('hand-off created', /H-[A-Z0-9]+/.test(r.messages[0].text));

  // 11. CMS webhook rejects a wrong key.
  const bad = await fetch(`${BASE}/api/cms-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CMS-Key': 'wrong' }, body: '{}' });
  check('webhook rejects a bad key', bad.status === 401);

  // 12. Agent track tool reads the CMS.
  const t = await (await fetch(`${BASE}/api/complaints?id=${ref}`)).json();
  check('agent tracking reads the CMS', t[0]?.id === ref && t[0].status === 'Closed');

  // 13. Marketplace: a prospect books a plot, pays, and becomes a member with an instalment schedule.
  const AYESHA = '61101-4827315-2';
  const SANA = '37405-2290871-4';
  const before = await api(AYESHA, 'GET', '/api/me');
  const list = await api(AYESHA, 'GET', '/api/market/plots?phase=5&size=1%20Kanal&use=residential');
  const plot = list.plots[0];
  check('plots listed with price and token', list.total > 0 && plot.base_price > 0 && plot.token_amount >= 100000, plot?.listing_id);
  const detail = await api(AYESHA, 'GET', `/api/market/plots/${plot.listing_id}`);
  check('price is the low end of the benchmark', detail.benchmark.length > 0 && Math.abs(detail.base_price - detail.benchmark[0].min) <= 50000);
  const plan = detail.plans.find(p => p.id === '2yr');
  check('2-year plan has 8 quarterly instalments', plan.quarters === 8 && plan.total > detail.base_price);
  const bk = await api(AYESHA, 'POST', `/api/market/plots/${plot.listing_id}/book`, { plan: '2yr' });
  check('token booking holds the plot', bk.status === 'token_paid' && bk.plot.status === 'On hold' && !!bk.hold_until);
  const other = await fetch(`${BASE}/api/market/plots/${plot.listing_id}/book`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': SANA }, body: JSON.stringify({ plan: 'lump' }) });
  check('someone else cannot book a held plot', other.status === 409, other.status);
  const hidden = await api(SANA, 'GET', '/api/market/plots?phase=5&size=1%20Kanal&use=residential');
  check('held plot hidden from others', !hidden.plots.some(x => x.listing_id === plot.listing_id));
  const paid = await api(AYESHA, 'POST', `/api/market/bookings/${bk.id}/pay`);
  check('down payment allots the plot', paid.status === 'allotted' && /^DHAI-/.test(paid.membership_no || ''), paid.membership_no);
  const after = await api(AYESHA, 'GET', '/api/me');
  const mem = after.memberships.find(m => m.membership_no === paid.membership_no);
  check('buyer is now a member', !before.roles.includes('member') && after.roles.includes('member'));
  check('instalment schedule created', mem?.installments.schedule.length === 9 && mem.installments.paid === plan.down && mem.installments.total === plan.total);
  const buyerNotes = await api(AYESHA, 'GET', '/api/notifications');
  check('buyer notified of booking and allotment', buyerNotes.some(n => /booked/.test(n.title)) && buyerNotes.some(n => /allotted/i.test(n.title)));
  const rates = await (await fetch(`${BASE}/api/market/rates?phase=V&size=1%20Kanal&sector=F-1`)).json();
  check('price lookup for the assistant', rates.rates.length === 1 && !!rates.period && rates.rates[0].min === detail.benchmark[0].min);

  // 14. Construction guidance: rules data loaded, and the owner's own checklist.
  const kbAll = await (await fetch(`${BASE}/api/kb`)).json();
  check('building rules data loaded', kbAll.standards?.length > 40 && kbAll.fines?.length > 20 && kbAll.regularization?.length > 10);
  const sanaMe = await api(SANA, 'GET', '/api/me');
  const sanaPlot = sanaMe.memberships[0];
  check('builder has seeded progress (possession; her drawings are with Building Control in the membership portal)', sanaPlot.build_done.includes('possession') && !sanaPlot.build_done.includes('drawings'), sanaPlot.build_done.join(','));
  const ticked = await api(SANA, 'POST', '/api/build/progress', { membership_no: sanaPlot.membership_no, stage: 'demarcation', done: true });
  check('stage ticked', ticked.done.includes('demarcation'));
  const unticked = await api(SANA, 'POST', '/api/build/progress', { membership_no: sanaPlot.membership_no, stage: 'demarcation', done: false });
  check('stage unticked', !unticked.done.includes('demarcation'));
  const notMine = await fetch(`${BASE}/api/build/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': IMRAN }, body: JSON.stringify({ membership_no: sanaPlot.membership_no, stage: 'drawings', done: true }) });
  check("cannot tick someone else's plot", notMine.status === 404, notMine.status);
  const badStage = await fetch(`${BASE}/api/build/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': SANA }, body: JSON.stringify({ membership_no: sanaPlot.membership_no, stage: 'roof', done: true }) });
  check('unknown stage rejected', badStage.status === 400, badStage.status);

  // 15. Demo control panel: baseline from the CMS export, live counters from this run, what-if, field-team simulator.
  const sum = await (await fetch(`${BASE}/api/demo/summary?share=0.5`)).json();
  check('baseline excludes portal complaints', sum.baseline.total > 7000 && !sum.baseline.channels.some(x => x.channel === 'Resident Portal'), sum.baseline.total);
  check('baseline is mostly phone', sum.baseline.phone_share > 0.8, sum.baseline.phone_share.toFixed(2));
  check('live counts this run', sum.live.portal_complaints >= 1 && sum.live.saved.find(x => x.event === 'submitted').n >= 1 && sum.live.calls_saved >= 1, sum.live.calls_saved);
  const sc = sum.scenario;
  const total = rows => rows.reduce((t, x) => t + x.n, 0);
  check('what-if keeps the complaint total', Math.abs(total(sc.before) - total(sc.after)) <= 1 && sc.after.find(x => x.channel === 'Resident Portal').n === sc.moved);
  check('what-if lowers call-center load', sc.call_center.load_after === sc.call_center.load_before - sc.call_center.complaint_calls_saved - sc.call_center.feedback_calls_saved && sc.call_center.load_after < sc.call_center.load_before);
  const zero = await (await fetch(`${BASE}/api/demo/summary?share=0`)).json();
  check('what-if at 0% changes nothing', zero.scenario.moved === 0 && zero.scenario.call_center.load_after === zero.scenario.call_center.load_before);
  await intake(IMRAN, { text: 'street light outside my house is not working' }).then(x => intake(IMRAN, { id: x.id, choice: 'submit' }));
  const openList = (await (await fetch(`${BASE}/api/demo/summary`)).json()).live.open_portal_complaints;
  const target = openList[0];
  const moved = target && await (await fetch(`${BASE}/api/demo/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: target.reference }) })).json();
  check('demo field-team simulator moves a complaint on', !!moved && moved.status !== target.status, `${target?.status} → ${moved?.status}`);

  // 16. Intent first: requests to DO something are answered from the portals, not with a procedure.
  const BILAL = '37405-6612093-5';
  // One call through the real chat route (guard + intent) proves the wiring; the rest call core/intent.js
  // directly against the same data, so the guard's 10-a-minute limit does not fail the test.
  const viaGuard = await (await fetch(`${BASE}/api/guard`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': IMRAN }, body: JSON.stringify({ text: 'i want a water bowser at my home' }) })).json();
  check('"I want a water bowser" opens a bowser request (chat route)', viaGuard.answer?.intent === 'service_request' && viaGuard.answer.cards[0]?.type === 'complaint-request' && viaGuard.answer.cards[0].key === 'Water Bowzer|Water Bowzer', viaGuard.status);
  const intentMod = require('./intent');
  const kbData = await (await fetch(`${BASE}/api/kb`)).json();
  const listMine = async cnic => (await (await fetch(`${BASE}/cms/api/complaints?cnic=${cnic}&limit=50`)).json()).map(c => ({ ...c, relation: 'mine' }));
  require('./intake').setContacts(() => kbData.contacts);
  const askChat = (cnic, text) => intentMod.answer(text, { cnic, kb: kbData, listMine });
  let a;
  a = await askChat(IMRAN, 'mujhe plumber chahiye');
  check('Roman Urdu request for a plumber', a?.intent === 'service_request' && a.cards[0]?.key === 'Plumbing|Plumber');
  a = await askChat(BILAL, 'i want to pay the dues of my plot');
  check('"pay the dues of my plot" reads the account', a?.intent === 'my_account' && a.cards[0]?.type === 'account' && /2 instalments overdue/.test(a.text) && /Askari Bank/.test(a.text), a?.text?.slice(0, 80));
  a = await askChat(AYESHA, 'what are my dues');
  check('buyer from step 13 sees her new plot in "my dues"', a?.intent === 'my_account' && a.cards[0]?.type === 'account' && a.cards[0].plots.some(p => p.membership_no === paid.membership_no));
  a = await askChat(SANA, 'what are my dues');
  check('fully paid plot: says nothing is due', a?.intent === 'my_account' && /fully paid/.test(a.text));
  a = await askChat(null, 'i want to pay the dues of my plot');
  check('signed out: asks to sign in and comes back', a?.intent === 'my_account' && a.cards[0]?.type === 'signin' && a.cards[0].q === 'i want to pay the dues of my plot');
  a = await askChat(IMRAN, 'is my bill paid');
  check('bills question shows the bill', a?.intent === 'my_account' && /Society bill/.test(a.text));
  a = await askChat(IMRAN, 'show my complaints');
  check('"my complaints" lists them without a number', a?.intent === 'my_complaints' && /Open/.test(a.text));
  a = await askChat(IMRAN, 'gas ki boo aa rahi hai');
  check('gas smell: safety advice first', a?.intent === 'report_problem' && /^\*\*If you smell gas/.test(a.text));
  for (const q of ['how do i get a water bowser', 'water bowser charges', 'what are the transfer dues', 'i want to transfer my plot to my son', 'i want to buy a plot in phase 5']) {
    check(`information question stays information: "${q}"`, (await askChat(IMRAN, q)) === null);
  }

  // 17. Membership portal: DHA's sample dump behind its own REST API; applications, vouchers and events.
  const memDb = require('../membership_stub/membership').open();
  const recs = memDb.prepare('SELECT cnic FROM tbl_memrecords WHERE memid IS NOT NULL').all(); // the dump's rows (the personas are added after)
  check('sample dump loaded with a unique demo CNIC each', recs.length >= 502 && new Set(recs.map(r => r.cnic)).size === recs.length && recs.every(r => /^\d{5}-\d{7}-\d$/.test(r.cnic)), recs.length);
  const sample = memDb.prepare("SELECT cnic, membershipno FROM tbl_memrecords WHERE membershipno = 'HP/345062'").get();
  const memRows = await (await fetch(`${BASE}/membership/api/members?cnic=${sample.cnic}`)).json();
  check('membership API finds a sample member by CNIC', memRows[0]?.membershipno === 'HP/345062' && memRows[0].dimensions_front_side === '35x65');
  const sampleMe = await api(sample.cnic, 'GET', '/api/me');
  check('sample member can sign in and sees the plot', sampleMe.memberships.some(m => m.membership_no === 'HP/345062' && /250 sq yd/.test(m.size_label)));
  let apps = await api(SANA, 'GET', '/api/my/applications');
  const bp = apps.find(x => x.kind === 'building_plan');
  check('Sana: building plan has a voucher to pay', bp?.status === 'Voucher Generated' && bp.who === 'you' && bp.voucher_due?.amount > 0 && bp.voucher_due.items.length > 0);
  check('hidden statuses are not shown to the member', apps.every(x => x.history.every(h => h.status !== 'Voucher Verified')));
  const paidApp = await api(SANA, 'POST', `/api/my/applications/${bp.id}/pay`, { channel: 'eft' });
  check('demo payment marks the voucher paid', paidApp.status === 'Voucher Paid' && !paidApp.voucher_due && paidApp.vouchers.some(v => v.status === 'paid' && v.paid_amount === v.amount + 100));
  const approved = await api(SANA, 'POST', `/api/my/applications/${bp.id}/simulate`);
  check('office step approves the drawings', approved.status === 'Approved' && approved.done);
  await wait(400);
  const sanaNotes = await api(SANA, 'GET', '/api/notifications');
  check('member is notified of payment and approval', sanaNotes.filter(n => n.kind === 'application').length >= 2 && sanaNotes[0].ref === `app:${bp.membership_no}`);
  apps = await api(FARAH, 'GET', '/api/my/applications');
  check('Farah: site plan waits for missing documents', apps.some(x => x.status === 'Incomplete Documents' && x.who === 'you' && x.steps.some(s => s.state === 'stuck')));
  const bilalApps = await api(BILAL, 'GET', '/api/my/applications');
  check('Bilal: plot under development', bilalApps.some(x => x.status === 'Under Development'));
  const otherApp = await fetch(`${BASE}/api/my/applications/${bp.id}/simulate`, { method: 'POST', headers: { 'X-Demo-CNIC': FARAH } });
  check('cannot act on someone else\'s application', otherApp.status === 404, otherApp.status);
  const badKey = await fetch(`${BASE}/api/membership-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('membership events need the shared key', badKey.status === 401);
  const appsAnswer = require('./applications').answer;
  const askApps = (cnic, text) => intentMod.answer(text, { cnic, kb: kbData, listMine, applications: appsAnswer });
  a = await askApps(FARAH, 'where is my site plan');
  check('"where is my site plan" reads the membership portal', a?.intent === 'my_applications' && /Documents missing/.test(a.text) && a.cards[0]?.type === 'applications');
  a = await askApps(null, 'is my building plan approved');
  check('applications signed out: asks to sign in', a?.intent === 'my_applications' && a.cards[0]?.type === 'signin');
  check('"how do I get a site plan" stays information', (await askApps(FARAH, 'how do i get a site plan')) === null);

  // 18. Urdu script (typed, or from a phone's Urdu keyboard) is understood like Roman Urdu.
  const urdu = require('./urdu');
  check('Urdu script becomes words the rules know', /pani nahi aa raha/.test(urdu.toRoman('پانی نہیں آ رہا')) && urdu.toRoman('no water') === 'no water');
  a = await askChat(IMRAN, 'پانی نہیں آ رہا');
  check('Urdu: "no water" opens the water report', a?.intent === 'report_problem' && a.cards[0]?.key === 'Community Services|Shortage Of Water Supply', a?.cards?.[0]?.key);
  a = await askChat(IMRAN, 'مجھے پلمبر چاہیے');
  check('Urdu: request for a plumber', a?.intent === 'service_request' && a.cards[0]?.key === 'Plumbing|Plumber');
  a = await askChat(IMRAN, 'میرا بل کتنا ہے');
  check('Urdu: "how much is my bill" reads the account and offers to pay', a?.intent === 'my_account' && /Society bill/.test(a.text) && a.cards[0]?.can_pay_bill === true);
  a = await askChat(IMRAN, 'کچن میں گیس کی بو آ رہی ہے');
  check('Urdu: gas smell gets safety advice first', a?.intent === 'report_problem' && /^\*\*If you smell gas/.test(a.text));
  check('Urdu: a how-to question stays information', (await askChat(IMRAN, 'پلاٹ ٹرانسفر کیسے کریں')) === null);
  r = await intake(IMRAN, { text: 'واش روم کا فلش لیک کر رہا ہے، صبح کوئی آ سکتا ہے' });
  check('Urdu complaint: plumber, morning visit, no questions asked', r.key === 'Plumbing|Plumber' && r.step === 'confirm' && r.summary?.some(x => x.label === 'Visit time' && /Morning/.test(x.value)), `${r.key} ${r.step}`);
  check('Urdu complaint keeps the resident\'s own words', r.summary?.some(x => x.label === 'Details' && /فلش/.test(x.value)));
  await intake(IMRAN, { id: r.id, choice: 'cancel' });

  // 19. Paying a society bill in the app (demo: no money moves).
  const billBefore = (await api(IMRAN, "GET", "/api/me")).residences[0];
  check('Imran has a bill to pay that is not overdue', billBefore.outstanding > 0 && billBefore.bills[0].state === "due", billBefore.bills[0].state);
  const billPaid = await api(IMRAN, "POST", "/api/my/bills/pay", { consumer_id: billBefore.consumer_id, channel: '1bill' });
  check('bill payment returns a receipt', billPaid.amount === billBefore.outstanding && /^DEMO\d+$/.test(billPaid.reference) && billPaid.channel === '1Bill');
  const billAfter = (await api(IMRAN, 'GET', '/api/me')).residences[0];
  check('bill shows as paid with the reference', billAfter.outstanding === 0 && billAfter.bills[0].payment_ref === billPaid.reference);
  check('payment sends a notification', (await api(IMRAN, 'GET', '/api/notifications')).some(n => n.kind === 'payment' && n.body.includes(billPaid.reference)));
  const paidTwice = await fetch(`${BASE}/api/my/bills/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': IMRAN }, body: JSON.stringify({ consumer_id: billBefore.consumer_id, channel: 'ipg' }) });
  check('a paid bill cannot be paid twice', paidTwice.status === 409, paidTwice.status);
  const notMyBill = await fetch(`${BASE}/api/my/bills/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Demo-CNIC': FARAH }, body: JSON.stringify({ consumer_id: billBefore.consumer_id, channel: 'ipg' }) });
  check('cannot pay someone else\'s bill', notMyBill.status === 404, notMyBill.status);
  a = await askChat(IMRAN, 'is my bill paid');
  check('after paying, the assistant says the bill is paid', /all paid/.test(a?.text || '') && !a.cards[0]?.can_pay_bill);

  // 20. The demo story after a reset: dates that stay current, and plain figures for Sana's plot.
  const bilalMe = await api(BILAL, 'GET', '/api/me');
  const bi = bilalMe.memberships[0].installments;
  check('Bilal: two instalments overdue, the next one still ahead', bi.overdue_count === 2 && bi.next_due?.due_date > new Date().toISOString().slice(0, 10), `${bi.overdue_count} ${bi.next_due?.due_date}`);
  check('Sana\'s plot is 10 Marla', /10 Marla/.test((await api(SANA, 'GET', '/api/me')).memberships[0].size_label));
  const demoSum = await (await fetch(`${BASE}/api/demo/summary`)).json();
  check('demo panel knows when the data was reset', !!demoSum.seeded_at && demoSum.baseline.to < new Date().toISOString().slice(0, 10), `${demoSum.seeded_at} ${demoSum.baseline.to}`);
  check('demo panel counts the bill paid online', demoSum.live.saved.some(x => x.event === "bill_paid_online" && x.n === 1));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
