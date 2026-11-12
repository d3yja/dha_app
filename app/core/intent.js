// Intent first: before any search or AI call, decide whether the resident wants something DONE for them
// (a service at their home, their own dues, bills or complaints) rather than information. Those requests
// are answered from the portals with the signed-in CNIC, not from the knowledge base.
//
//   "i want a water bowser at my home"   -> service request: open the guided reporter for Water Bowzer
//   "i want to pay the dues of my plot"  -> my account: overdue and next instalments, how to pay
//   "is my bill paid" / "my complaints"  -> my bills / my complaints
//   "status of my site plan", "pay my voucher" -> my applications with DHA (membership portal)
//   "how do i get a water bowser", "water bowser charges", "what are transfer dues" -> null (knowledge base)
//
// Used by the live agent (server.js, before the model is called) and by the built-in agent (/api/guard
// returns the answer with the guard result), so both modes behave the same. Deterministic on purpose:
// these are the answers that must not depend on how a model reads the question.

const intake = require('./intake');
const portal = require('./portal');
const urdu = require('./urdu');

// Asking about something, not asking for it.
const INFO = /\b(how (do|does|can|to|much|long|many)|procedure|process|steps?|charges?|fees?|costs?|price|rates?|kitn[ae]|kitne|kaise|kese|kaisay|what is|what are the|kya hai|rules?|timings?|allowed|eligib\w*|documents?|forms?|apply|tareeqa|tareeka)\b/;
// Asking for it to be done.
const REQUEST = /\b(i (want|need|would like|require)|i'?d like|we (want|need)|please (send|arrange|book|get)|send|arrange|book|order|get me|need (a|an|the|some)|want (a|an|the)|chahiye|chahie|chaiye|chahye|bhej\w*|mangwa\w*|bula\w*|dila\w*|kar ?do|bhijwa\w*)\b/;
// Reporting a problem.
const PROBLEM = /\b(not working|broken|kharab|leak\w*|no water|no electricity|no light|blocked|overflow\w*|not collected|pothole|outage|band hai|nahi aa ?raha|nahi a rha|nahi chal|tripp\w*|spark\w*|smell|boo|gas|wrong|galat|not received|nahi mila|stuck|burst|choked|fell|fallen|damaged|complain\w*|shikayat)\b/;

// Office procedures (transfer, buying, approvals): "I want to transfer my plot" is a how-to, not a home visit.
const ADMIN = /\b(transfer\w*|buy|purchase|sell|sale|noc|ndc|allot\w*|possession|membership|map|drawings?|approval|registration|register|mutation|gift|heirs?|lease|rent out|tenant|e-?tag|sticker|card)\b/;
const MINE = /\b(my|mine|me|i|mera|meri|mere|mujhe|hamara|hamari|apna|apni)\b/;
const DUES = /\b(dues|due|installments?|instalments?|outstanding|balance|arrears|payable|owe|kist|qist\w*|baqaya|payment plan|surcharge)\b/;
const PAY_PLOT = /\bpay\b.*\b(plot|membership|file|house|property)\b|\b(plot|membership|file)\b.*\b(pay|payment|dues)\b/;
const BILLS = /\b(bills?|utility|maintenance charges?|conservancy)\b/;
const BILL_ASK = /\b(paid|unpaid|pay|due|outstanding|how much|kitna|amount|show|check|see|status|latest|last|pending|clear)\b/;
const MY_COMPLAINTS = /\b(my|mera|meri|mere)\b.{0,30}\b(complaints?|shikayat\w*|requests?)\b|\b(complaints?|shikayat)\b.{0,20}\b(status|update|progress)\b/;
// Own applications with DHA: site plan and possession, building plan, their fee vouchers.
const APP = /\b(site ?plan|building plan|house plan|naqsh[ae]|map approval|drawings? (approval|status|approved)|(my|meri|mera) application|application status|vouchers?|challan|possession)\b/;
const APP_STATUS = /\b(status|update|progress|where|stuck|pending|approved|ready|when|kab|kahan)\b/;
const APP_HOWTO = /\b(how (do|to|can|much)|procedure|steps? (to|for)|documents? (required|needed)|requirements?|what documents|kaise|tareeqa|fees? for|charges? for)\b/;
const COMPLAINT_NO = /\bC\d{12}\b|cmp-?\s?\d/i;

function detect(text) {
  const t = urdu.toRoman(text).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const mine = MINE.test(t);
  const info = INFO.test(t);

  // Own complaints (a complaint number is a lookup the existing tracker already handles).
  if (MY_COMPLAINTS.test(t) && !COMPLAINT_NO.test(t) && !REQUEST.test(t.replace(/\bcomplaints?\b/g, ''))) return { intent: 'my_complaints' };

  // Own applications (site plan, building plan) and their vouchers: "where is my site plan", "pay my voucher".
  if (APP.test(t) && (mine || APP_STATUS.test(t)) && !APP_HOWTO.test(t)) {
    const focus = /site ?plan|possession/.test(t) ? 'site_plan' : /building|house plan|naqsh|map|drawing/.test(t) ? 'building_plan' : 'voucher';
    return { intent: 'my_applications', focus };
  }

  // Own money: plot dues and instalments, or society bills. "What are the transfer dues" has no "my" and stays
  // a knowledge question; "how do I pay my dues" is personal (show the dues, then how to pay).
  if ((DUES.test(t) || PAY_PLOT.test(t)) && (mine || /\bpay\b/.test(t)) && !/\btransfer\b/.test(t)) return { intent: 'my_account', focus: 'dues' };
  if (BILLS.test(t) && mine && BILL_ASK.test(t) && !/\b(wrong|incorrect|not received|nahi mila|galat|extra|double)\b/.test(t)) return { intent: 'my_account', focus: 'bills' };

  // Danger first (gas smell, sparks, fire, open manhole): the same check the guided reporter uses.
  if (intake.SAFETY_RX.test(t)) {
    const c = intake.classify(t, 'safety');
    return { intent: 'report_problem', key: c.ranked[0].key, confidence: +c.ranked[0].p.toFixed(2), safety: true };
  }

  // A service at home, or a problem to fix: the complaint classifier says which of the CMS's sub-categories.
  const request = REQUEST.test(t) && !info && !ADMIN.test(t);
  const problem = PROBLEM.test(t) && !info && !ADMIN.test(t.replace(/\bgas\b/g, ''));
  if (request || problem) {
    const c = intake.classify(t);
    const top = c.ranked[0];
    if (c.known && top && top.p >= (request ? 0.6 : 0.75) && !(request && top.key.startsWith('Utility Bills|'))) {
      return { intent: request ? 'service_request' : 'report_problem', key: top.key, confidence: +top.p.toFixed(2) };
    }
  }
  return null;
}

const rs = n => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
const day = d => d ? new Date(`${d}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const monthName = m => new Date(`${m}-01T00:00`).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
const plotLine = m => [m.size_label, m.plot_no && `Plot ${m.plot_no}`, m.street && `Street ${m.street}`, m.sector && `Sector ${m.sector}`, m.phase && `Phase ${m.phase}`].filter(Boolean).join(', ');

// How dues are paid, from 15_payment_channels.csv (PAY-01 general dues; PAY-09 online, not published yet).
function payHow(kb) {
  const p = id => (kb?.payments || []).find(x => x.pay_id === id);
  const bank = p('PAY-01');
  const online = p('PAY-09');
  if (!bank) return { ids: [], text: 'Ask the Finance Directorate how to pay.' };
  const list = v => v.split(/;\s*/).map(x => x.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1');
  const where = bank.bank.replace(/\s*\(any branch\)/i, '');
  const parts = [
    `**How to pay:** at any ${where} branch by ${list(bank.accepted_modes)}${bank.status === 'needs_confirmation' ? ' (please confirm with DHA)' : ''}.`,
    // Worded as a sentence: some models stall on the bare list "cash, cheques, out-station pay orders".
    bank.not_accepted && /cash/i.test(bank.not_accepted) ? 'Cash and cheques are not accepted, and neither is a pay order from a bank outside the city.' : bank.not_accepted && `Not accepted: ${list(bank.not_accepted).replace(' or ', ', ')}.`,
    online?.status === 'missing' && 'DHA has not yet published the details for paying online; the Finance Directorate can tell you.',
  ];
  return { ids: [bank, online].filter(Boolean).map(x => x.pay_id), text: parts.filter(Boolean).join(' ') };
}

const PAY_BILL_HERE = '**You can pay this bill here in the app.** Press **Pay this bill** below (demo payment).';

function accountAnswer(cnic, focus, kb) {
  if (!cnic) {
    return {
      text: focus === 'bills'
        ? 'Your bills are personal, so I need to know who you are first. Please **sign in**, then ask me again or open **My account**.'
        : 'Your dues are personal, so I need to know who you are first. Please **sign in**: I will then show what is overdue on your plot, what is due next, and how to pay.',
      cards: [{ type: 'signin', next: '#/ask', reason: focus === 'bills' ? 'to see your bills' : 'to see your dues' }],
      steps: [{ label: 'Understood: you are asking about your own account' }, { label: 'Not signed in, so your account cannot be read' }],
    };
  }
  const me = portal.me(cnic);
  const plots = me.memberships.map(m => ({
    membership_no: m.membership_no, plot: plotLine(m), status: m.status,
    paid_up: !m.installments || m.installments.remaining === 0,
    overdue_count: m.installments?.overdue_count || 0, overdue_amount: m.installments?.overdue_amount || 0,
    next_due: m.installments?.next_due || null, remaining: m.installments?.remaining || 0,
    overdue: (m.installments?.schedule || []).filter(r => r.state === 'overdue').map(r => ({ label: r.label, due_date: r.due_date, amount: r.amount - r.paid_amount })),
  }));
  const homes = me.residences.map(r => ({
    consumer_id: r.consumer_id, address: plotLine(r), outstanding: r.outstanding,
    unpaid: r.bills.filter(b => b.state !== 'paid').map(b => ({ month: b.month, amount: b.amount, due_date: b.due_date, state: b.state })),
    last_paid: r.bills.find(b => b.state === 'paid') || null,
  }));
  const steps = [{ label: 'Understood: you are asking about your own account' }, { label: `Read ${me.name}'s account from the member and resident portals` }];
  const card = { type: 'account', focus, name: me.name, plots, homes };

  if (!plots.length && !homes.length) {
    return {
      text: `${me.name}, there is no DHA plot or house registered under your CNIC, so you have no dues to pay.\n\nIf you want to buy a plot, DHA's own plots for sale, with payment plans, are on the **Marketplace**.`,
      cards: [{ type: 'no-property' }], steps,
    };
  }

  const lines = [];
  const showDues = focus === 'dues' || !homes.length;
  const showBills = focus === 'bills' || !plots.length || homes.some(h => h.outstanding);
  if (showDues) {
    if (!plots.length) lines.push('You have no plot membership, so there are no plot instalments to pay.');
    for (const p of plots) {
      if (p.overdue_count) {
        lines.push(`**${p.plot}** (${p.membership_no}): **${p.overdue_count} instalment${p.overdue_count > 1 ? 's' : ''} overdue, ${rs(p.overdue_amount)}** in total${p.overdue[0] ? `, the oldest due on ${day(p.overdue[0].due_date)}` : ''}.${p.next_due ? ` Next: ${p.next_due.label}, ${rs(p.next_due.amount)} on ${day(p.next_due.due_date)}.` : ''}`);
      } else if (p.next_due) {
        lines.push(`**${p.plot}** (${p.membership_no}): nothing overdue. Next: ${p.next_due.label}, **${rs(p.next_due.amount)}** on ${day(p.next_due.due_date)}.`);
      } else {
        lines.push(`**${p.plot}** (${p.membership_no}): fully paid. No instalments are due.`);
      }
    }
  }
  if (showBills) {
    for (const h of homes) {
      lines.push(h.outstanding
        ? `**Society bill** for ${h.address}: **${rs(h.outstanding)} unpaid** (${h.unpaid.map(b => `${monthName(b.month)}, ${b.state === 'overdue' ? 'overdue since' : 'due by'} ${day(b.due_date)}`).join('; ')}).`
        : `**Society bill** for ${h.address}: all paid${h.last_paid ? ` (last paid ${day(h.last_paid.paid_on?.slice(0, 10))})` : ''}.`);
    }
  }
  const plotDue = showDues && plots.some(p => p.overdue_count || p.next_due);
  const billDue = showBills && homes.some(h => h.outstanding);
  const how = payHow(kb);
  return {
    text: `${me.name}, here is what I found:\n\n${lines.map(l => `- ${l}`).join('\n')}${billDue ? `\n\n${PAY_BILL_HERE}` : ''}${plotDue ? `\n\n${how.text}` : ''}\n\nThe full schedule and payment history are in **My account**.`,
    cards: [{ ...card, can_pay_bill: billDue }], steps, citations: plotDue ? how.ids : [],
  };
}

async function complaintsAnswer(cnic, listMine) {
  if (!cnic) {
    return {
      text: 'To show your complaints I need to know who you are. Please **sign in**, or give me the **complaint number** or the **mobile number** you used.',
      cards: [{ type: 'signin', next: '#/my-complaints', reason: 'to see your complaints' }, { type: 'track-form' }],
      steps: [{ label: 'Understood: you are asking about your own complaints' }],
    };
  }
  const all = await listMine(cnic);
  const open = all.filter(c => ['Submitted', 'In Process', 'Pending', 'Reopen'].includes(c.status));
  const waiting = all.filter(c => c.status === 'Resolved' && c.relation === 'mine');
  const steps = [{ label: 'Understood: you are asking about your own complaints' }, { label: `Checked the complaint system: ${all.length} complaint${all.length === 1 ? '' : 's'} on your CNIC` }];
  if (!all.length) return { text: 'You have no complaints with DHA. If something needs fixing, tell me what it is and I will start one.', cards: [], steps };
  const line = c => `**${c.reference}** · ${c.sub_category}: **${c.status}**${c.relation === 'following' ? ' (a complaint you follow)' : ''}`;
  const parts = [];
  if (open.length) parts.push(`**Open (${open.length}):**\n${open.slice(0, 5).map(c => `- ${line(c)}`).join('\n')}`);
  if (waiting.length) parts.push(`**Waiting for your answer:** the team says ${waiting.length === 1 ? 'this is' : 'these are'} fixed. Please tell us if ${waiting.length === 1 ? 'it is' : 'they are'}.\n${waiting.slice(0, 3).map(c => `- ${line(c)}`).join('\n')}`);
  if (!parts.length) parts.push(`None of your complaints are open. The latest is ${line(all[0])}.`);
  return { text: parts.join('\n\n'), cards: [{ type: 'my-complaints', list: [...waiting, ...open].slice(0, 4).map(c => ({ ref: c.reference, sub: c.sub_category, status: c.status })) }], steps };
}

function complaintAnswer(d, text, signedIn, phase) {
  const name = intake.label(d.key);
  const safety = d.safety ? `${intake.safetyAdvice(d.key, urdu.toRoman(text), phase).text}\n\n` : '';
  const sub = intake.BY_KEY[d.key];
  const service = d.intent === 'service_request';
  const paid = sub?.paid ? ' It is a paid service; the reporter shows how to pay.' : '';
  return {
    text: service
      ? `Sure, I can arrange a **${name.toLowerCase()}** for you.${paid}\n\nPress **Continue** below. ${signedIn ? 'Your address and mobile come from your profile, so' : 'After you sign in, your address and mobile come from your profile, and'} I will only ask what is missing (for example a time), then show a summary for you to confirm before it goes to the complaint system.`
      : `${safety}I'm sorry about this. This looks like a **${name.toLowerCase()}** problem.\n\nPress **Continue** below. ${signedIn ? 'Your address and mobile come from your profile, so' : 'After you sign in, your address and mobile come from your profile, and'} I will only ask what is missing, then show a summary for you to confirm.`,
    cards: [{ type: 'complaint-request', key: d.key, label: name, text, service, paid: !!sub?.paid }],
    steps: [{ label: `Understood: ${service ? 'a request for' : 'a problem with'} ${name.toLowerCase()} (${Math.round(d.confidence * 100)}% sure)` }],
  };
}

// Returns an answer ({ text, cards, steps, intent }) or null when the knowledge base should answer.
async function answer(text, { cnic, kb, listMine, applications }) {
  const d = detect(text);
  if (!d) return null;
  let out;
  if (d.intent === 'my_applications' && !applications) return null;
  if (d.intent === 'my_account') out = accountAnswer(cnic, d.focus, kb);
  else if (d.intent === 'my_applications') out = await applications(cnic, d.focus);
  else if (d.intent === 'my_complaints') out = await complaintsAnswer(cnic, listMine);
  else out = complaintAnswer(d, text, !!cnic, cnic && portal.me(cnic)?.home?.phase);
  portal.log(cnic, 'intent_answered', { intent: d.intent, key: d.key, focus: d.focus });
  out.cards = out.cards.map(c => (c.type === 'signin' ? { ...c, q: String(text).slice(0, 300) } : c));
  return { ...out, intent: d.intent };
}

module.exports = { detect, answer, accountAnswer, complaintsAnswer };
