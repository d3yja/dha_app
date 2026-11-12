// Complaint intake: turns a resident's own words into a complaint the CMS accepts.
//   1. Classify the text against the CMS template (naive Bayes over the call-center export + keywords).
//      Sure → pick it; unsure → offer the top three; nothing recognised → offer the common ones.
//   2. Fill every field the CMS needs from the resident's profile (CNIC, membership, address, mobile).
//   3. Checks before filing: an open complaint of their own, the same outage already reported on the street,
//      the 48-hour water bowzer rule, a bill lookup for billing complaints, safety advice for emergencies.
//   4. Ask only the template questions the text did not already answer.
//   5. Show a summary, then submit to the CMS with an idempotency key.
// "Talk to a person" is offered at every step and creates a hand-off record for the Complaint Office.

const crypto = require('crypto');
const T = require('../../data/cms_templates.json');
const cms = require('./cms_client');
const portal = require('./portal');
const db = require('./db');
const { toRoman } = require('./urdu');

const REQUEST_SOURCE = 'Resident Portal'; // the export has Incoming Call, Android, iOS, Walk In; DHA to confirm the value
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// ---------- Classifier ----------

const STOP = new Set(T.model.stop || []);
const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));
const SUBS = T.sub_categories;
const BY_KEY = Object.fromEntries(SUBS.map(s => [s.key, s]));
const VOCAB = new Set(SUBS.flatMap(s => Object.keys(s.model.counts)));
const V = T.model.vocab_size;

function classify(text, group) {
  const toks = tokens(text).filter(t => VOCAB.has(t));
  const pool = group ? SUBS.filter(s => s.group === group) : SUBS;
  const scored = pool.map(s => {
    let lp = (T.model.prior_alpha ?? 1) * Math.log((s.count + 1) / (T.model.prior_total + SUBS.length));
    for (const t of toks) lp += Math.log(((s.model.counts[t] || 0) + 1) / (s.model.total + V));
    return { key: s.key, lp };
  });
  const max = Math.max(...scored.map(x => x.lp));
  const z = scored.reduce((a, x) => a + Math.exp(x.lp - max), 0);
  return { known: toks.length, ranked: scored.map(x => ({ key: x.key, p: Math.exp(x.lp - max) / z })).sort((a, b) => b.p - a.p) };
}

const SAFETY_RX = /\b(gas\s*(leak|leakage|smell|ki\s*boo|ki\s*bu)|smell(s|ing)?\s*(of\s*)?gas|spark(s|ing)?|short\s*circuit|fire|aag|smoke|dhuan|dhuwan|current\s*(lag|aa)|shock|naked\s*wires?|open\s*wires?|wires?\s*(hanging|exposed|latak)|transformer\s*(door|box)?\s*open|manhole\s*(open|cover\s*missing|uncovered)|open\s*manhole)\b/i;

// Plain names for the most common sub-categories; the rest use the CMS name.
const FRIENDLY = {
  'Plumbing|Plumber': 'Plumber (taps, leaks, flush, drains in the house)',
  'Water Bowzer|Water Bowzer': 'Water tanker (bowzer) delivery',
  'Electricity|Electrician': 'Electrician (switches, fans, wiring in the house)',
  'Horticulture|Actions Wild Growth Cutting': 'Wild grass or bushes to cut',
  'Electricity|Street Light': 'Street light not working',
  'Electricity|Electricity Out of Order': 'No electricity',
  'Service and Maintenance|Carpenter': 'Carpenter (doors, locks, windows)',
  'Community Services|Shortage Of Water Supply': 'No water, or low water supply',
  'Sanitation|Sanitary Worker': 'Sanitary worker (blocked drain or gutter)',
  'Garbage|Garbage Bags': 'Garbage bags not delivered',
  'Community Services|Cleanliness': 'Area needs cleaning',
  'Horticulture|Tree Trimming': 'Tree branches to trim',
  'Roads & Streets|Road Cleaning': 'Road needs sweeping',
  'Horticulture|Horticulture Cleanliness': 'Park or green belt needs cleaning',
  'Electricity|Phase Missing': 'One electricity phase missing',
  'Sanitation|Outdoor Sewerage Line': 'Sewerage overflowing outside',
  'Garbage|Garbage Collection': 'Garbage not collected',
  'Plumbing|Geyser': 'Geyser not working',
  'Plumbing|Leakage Complaints': 'Gas leak in the house',
  'SUI Gas|Leakage Complaints': 'Gas leak (Sui gas line)',
  'Dengue|Dengue Spray': 'Mosquito (dengue) spray',
  'Electricity|Fluctuation': 'Voltage going up and down',
  'Electricity|Short Circuit': 'Short circuit or sparking',
  'Stray Animals|Stray Dogs/Cats': 'Stray dogs or cats',
  'Roads & Streets|Damaged Road': 'Damaged road or pothole',
  'Utility Bills|Bill Not Received': 'Utility bill not received',
  'Utility Bills|Bill Already Paid': 'Bill already paid but still showing',
  'Utility Bills|Wrong Bill': 'Wrong bill amount',
  'Security|Suspected Activity': 'Suspicious activity',
  'Security|Loudspeaker Party at Home': 'Loud music or party noise',
  'Building Control|Irregularity in House Construction': 'Irregular construction nearby',
  'Other|Others': 'Something else',
};
const DUP_NAMES = new Set(SUBS.map(s => s.sub_category).filter((n, i, a) => a.indexOf(n) !== i));
const label = key => FRIENDLY[key] || (DUP_NAMES.has(BY_KEY[key].sub_category) ? `${BY_KEY[key].sub_category} (${BY_KEY[key].category})` : BY_KEY[key].sub_category);

function quickList(n = 10) {
  return SUBS.filter(s => s.key !== 'Other|Others').sort((a, b) => b.count - a.count).slice(0, n).map(s => ({ key: s.key, label: label(s.key), group: s.group }));
}

// ---------- Questions ----------

const monthName = offset => new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

function questionsFor(key) {
  const sub = BY_KEY[key];
  const qs = [...(T.groups[sub.group]?.questions || [])];
  if (key === 'Water Bowzer|Water Bowzer') {
    qs.push({ id: 'when', ask: 'When do you need the water tanker?', type: 'choice', options: ['As soon as possible', 'This evening', 'Tomorrow morning'] });
    qs.push({ id: 'payment', ask: 'A water tanker is a paid service, charged at DHA\'s current rate. How would you like to pay?', type: 'choice', options: ['Pay now (demo)', 'Pay on delivery'] });
  }
  if (key === 'Garbage|Garbage Bags') {
    qs.push({ id: 'month', ask: 'Which month\'s garbage bags did you not get?', type: 'choice', options: [monthName(0), monthName(-1)], allowText: true });
  }
  return qs;
}

const Q_LABEL = { visit_time: 'Visit time', spot: 'Exact spot', since: 'Since', extent: 'Who is affected', where_inside: 'Inside or outside',
  bill_month: 'Bill month', payment_ref: 'Payment reference', happening_now: 'Happening now', when: 'Needed', payment: 'Payment', month: 'Month' };

// Answers the resident already gave in their own words.
const DETECT = {
  visit_time: [[/\b(morning|subah|9\s*am|10\s*am|11\s*am)\b/i, 0], [/\b(afternoon|dopahar|zuhr|1\s*pm|2\s*pm|3\s*pm)\b/i, 1], [/\b(evening|shaam|sham|after\s*office|[4-8]\s*pm)\b/i, 2], [/\b(any\s*time|kisi\s*bhi\s*waqt|kabhi\s*bhi)\b/i, 3]],
  since: [[/\b(just\s*now|abhi\s*abhi|few\s*minutes|half\s*an\s*hour)\b/i, 0], [/\b(since\s*morning|subah\s*se|few\s*hours|\d\s*hours?|ghant[ey])\b/i, 1], [/\b(yesterday|kal\s*se|since\s*last\s*night|raat\s*se)\b/i, 2], [/\b(\d+\s*days?|din\s*se|week|hafta)\b/i, 3]],
  extent: [[/\b(neighbou?rs?|whole\s*street|poori\s*gali|puri\s*gali|whole\s*area|sab\s*ghar|everyone)\b/i, 2], [/\b(whole\s*house|poore\s*ghar|pure\s*ghar|entire\s*house)\b/i, 1]],
  where_inside: [[/\b(kitchen|room|inside|andar|bathroom|lounge|meter\s*inside)\b/i, 0], [/\b(outside|bahar|street|pole|road|lawn|gate)\b/i, 1]],
  happening_now: [[/\b(right\s*now|abhi|now|currently|going\s*on)\b/i, 0], [/\b(yesterday|last\s*night|earlier|kal)\b/i, 1]],
  spot: [[/\b(in\s*front\s*of\s*(my|the|our)\s*(house|home|gate)|outside\s*(my|the|our)\s*(house|home|gate)|ghar\s*ke\s*(samne|saamne|aage|bahar))\b/i, 0], [/\b(empty|khali|vacant)\s*plot\b/i, 2], [/\b(park|green\s*belt|green\s*area)\b/i, 3]],
  when: [[/\b(urgent|asap|abhi|right\s*now|jaldi)\b/i, 0], [/\b(evening|shaam|tonight)\b/i, 1], [/\b(tomorrow|kal\s*subah)\b/i, 2]],
};

function detect(q, text) {
  for (const [rx, i] of DETECT[q.id] || []) if (rx.test(text)) return q.options[i];
  return null;
}

// ---------- Sessions ----------

const sessions = new Map();

function getSession(id, cnic) {
  const now = Date.now();
  for (const [k, v] of sessions) if (now - v.touched > SESSION_TTL_MS) sessions.delete(k);
  const s = id && sessions.get(id);
  if (s && s.cnic === cnic) { s.touched = now; return s; }
  const fresh = { id: crypto.randomUUID(), cnic, touched: now, step: 'describe', text: '', key: null, answers: {}, auto: {}, checked: {}, transcript: [], priority: 0 };
  sessions.set(fresh.id, fresh);
  portal.log(cnic, 'intake_started');
  return fresh;
}

const HUMAN = { label: 'Talk to a person', value: '__human' };

function reply(s, messages, extra = {}) {
  for (const m of messages) s.transcript.push({ who: 'agent', text: m.text });
  return { id: s.id, step: s.step, messages, options: [], allowText: false, ...extra, key: s.key, label: s.key ? label(s.key) : null };
}
const say = (text, kind) => ({ text, kind });

const fmtTime = at => new Date(String(at).replace(' ', 'T')).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const hoursSince = at => (Date.now() - new Date(String(at).replace(' ', 'T'))) / 3600000;

// ---------- Contacts from the knowledge base ----------

let kbContacts = () => [];
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' };
function controlRoom(phase) {
  const r = ROMAN[phase] || phase;
  return kbContacts().find(c => /control room \(24\/7/i.test(c.topic) && String(c.phase).replace(/^Phase\s*/i, '').split(/[^A-Z0-9]+/i).includes(r));
}
const contact = id => kbContacts().find(c => c.contact_id === id);

function safetyAdvice(key, text, phase) {
  const fire = contact('CON-062');
  const lines = [];
  if (/Leakage Complaints$/.test(key) && !/^Utility/.test(key)) {
    lines.push('**If you smell gas:** do not switch any light or fan on or off, do not light a flame, open the doors and windows, and take everyone outside.',
      'Call the Sui gas emergency line **1199** (SNGPL, national).');
  } else if (/Short Circuit|DB \/ Tranformer|Overhead Cable/.test(key) || /spark|short|fire|aag|smoke|shock|wire/i.test(text)) {
    lines.push('**Keep everyone away from the wires.** If it is safe, switch off the main breaker. Do not touch anything that is sparking, and do not use water on it.');
  } else {
    lines.push('**Keep children and others away from the spot** until the team arrives.');
  }
  if (/fire|aag|smoke|dhuan/i.test(text)) lines.push(`If there is a fire, call DHA Fire Fighting **${fire?.phone || '0323-5013000'}** or Rescue **1122** now.`);
  const cr = controlRoom(phase);
  if (cr) lines.push(`Security control room for your phase (24/7): **${cr.phone}**.`);
  return say(lines.join('\n\n'), 'safety');
}

// ---------- The conversation ----------

async function turn({ sessionId, cnic, text, choice, key }) {
  const me = portal.me(cnic);
  if (!me) throw Object.assign(new Error('Please sign in first.'), { status: 401 });
  const s = getSession(sessionId, cnic);
  text = String(text || '').trim().slice(0, 1000);
  if (text) s.transcript.push({ who: 'resident', text });
  else if (choice) s.transcript.push({ who: 'resident', text: `[${choice}]` });

  if (choice === '__human') return handoff(s, me);
  if (choice === '__restart') { sessions.delete(s.id); return turn({ cnic, text: '' }); }

  if (!me.home) {
    s.step = 'blocked';
    return reply(s, [say(`Complaints are made for a DHA house or plot, and ${me.name} has none registered yet. Once you own or live in a property in DHA, you can report problems here.`),
      say('For anything else, the DHA helpline is **051-111-555-400**.')], { options: [{ label: 'Back to home', value: '__home' }] });
  }

  // A quick-tap button starts with a sub-category already chosen.
  if (key && BY_KEY[key] && s.step === 'describe') {
    s.key = key;
    s.text = text || '';
    return next(s, me, []);
  }

  switch (s.step) {
    case 'describe': {
      if (!text) {
        return reply(s, [say(`Assalam-o-Alaikum ${me.name.split(' ')[0]}. What is the problem? Tell me in your own words, in English or Urdu.`)],
          { allowText: true, placeholder: 'For example: kitchen tap is leaking since morning', quick: quickList(8), options: [HUMAN] });
      }
      s.text = text;
      return pickCategory(s, me);
    }
    case 'pick': {
      if (choice === 'more') {
        return reply(s, [say('Here are all the common types. Pick the closest one, or describe the problem again in more detail.')],
          { allowText: true, options: [...quickList(20).map(q => ({ label: q.label, value: q.key })), { label: 'Something else', value: 'Other|Others' }, HUMAN] });
      }
      if (choice && BY_KEY[choice]) { s.key = choice; return next(s, me, []); }
      if (text) { s.text = `${s.text}. ${text}`; return pickCategory(s, me); }
      return pickCategory(s, me);
    }
    case 'own_dup': {
      const open = s.checked.ownOpen;
      if (choice === 'add') {
        await cms.addInfo(open.reference, `Resident added through the portal: ${s.text}`);
        portal.log(cnic, 'info_added', { ref: open.reference });
        s.step = 'done';
        return reply(s, [say(`Done. I added your message to complaint **${open.reference}**, so the same team sees it. You will get a notification when its status changes.`)],
          { done: true, ref: open.reference, options: [{ label: 'See that complaint', value: `__open:${open.reference}` }, { label: 'Report something else', value: '__restart' }] });
      }
      s.checked.own = true;
      return next(s, me, []);
    }
    case 'street_dup': {
      const other = s.checked.streetOpen;
      if (choice === 'follow') {
        portal.follow(cnic, other.reference);
        portal.log(cnic, 'followed_existing', { ref: other.reference, sub: s.key });
        s.step = 'done';
        return reply(s, [say(`You are now following complaint **${other.reference}**. You will get its updates, just like the person who reported it. No new complaint was needed.`)],
          { done: true, ref: other.reference, options: [{ label: 'See that complaint', value: `__open:${other.reference}` }, { label: 'Report something else', value: '__restart' }] });
      }
      s.checked.street = true;
      return next(s, me, []);
    }
    case 'bill_check': {
      if (choice === 'answered') {
        portal.log(cnic, 'self_served', { sub: s.key, via: 'bill lookup' });
        s.step = 'done';
        return reply(s, [say('Glad that helped. Your bills and payment history are always in **My account**.')],
          { done: true, options: [{ label: 'Open My account', value: '__account' }, { label: 'Report something else', value: '__restart' }] });
      }
      s.checked.bill = true;
      return next(s, me, []);
    }
    case 'question': {
      const q = s.pending;
      const answer = (choice && q.options?.includes(choice)) ? choice : text || choice;
      if (!answer) return askQuestion(s, q, []);
      s.answers[q.id] = answer;
      return next(s, me, []);
    }
    case 'confirm': {
      if (choice === 'submit') return submit(s, me);
      if (choice === 'cancel') {
        s.step = 'done';
        portal.log(cnic, 'intake_abandoned', { sub: s.key });
        return reply(s, [say('No problem, nothing was sent.')], { done: true, options: [{ label: 'Report something else', value: '__restart' }] });
      }
      if (choice === 'change') { s.key = null; s.answers = {}; s.checked = {}; s.step = 'pick'; return pickCategory(s, me, true); }
      if (text) { s.text = `${s.text}. ${text}`; return confirm(s, me, [say('Added to the details.')]); }
      return confirm(s, me, []);
    }
    case 'done': case 'blocked':
      sessions.delete(s.id);
      return turn({ cnic, text, choice });
  }
  return reply(s, [say('Sorry, something went wrong. Let us start again.')], { options: [{ label: 'Start again', value: '__restart' }] });
}

function pickCategory(s, me, forceList = false) {
  const understood = toRoman(s.text); // Urdu script, typed or spoken, is read through its Roman Urdu / English words
  const safety = SAFETY_RX.test(understood);
  const r = classify(understood, safety ? 'safety' : null);
  const [a, b] = r.ranked;
  if (!forceList && (safety || (r.known && a.p >= 0.55 && a.p - (b?.p || 0) >= 0.2))) {
    s.key = a.key;
    s.confidence = Math.round(a.p * 100);
    return next(s, me, []);
  }
  s.step = 'pick';
  if (!r.known && !forceList) {
    return reply(s, [say('I did not quite follow. Which of these is closest? Or tell me a bit more, for example "street light is off" or "geyser not working".')],
      { allowText: true, options: [...quickList(8).map(q => ({ label: q.label, value: q.key })), { label: 'Show more types', value: 'more' }, HUMAN] });
  }
  const top = r.ranked.filter(x => x.p >= 0.05).slice(0, 3);
  return reply(s, [say(top.length > 1 ? 'Which of these is it?' : 'Is it this?')],
    { allowText: true, options: [...top.map(x => ({ label: label(x.key), value: x.key })), { label: 'Something else', value: 'more' }, HUMAN] });
}

async function next(s, me, messages) {
  const sub = BY_KEY[s.key];
  const h = me.home;
  if (!s.checked.announced) {
    s.checked.announced = true;
    s.priority = T.groups[sub.group]?.priority || 0;
    if (sub.group === 'safety') {
      messages.push(say(`This sounds urgent: **${label(s.key)}**. I will mark it as urgent.`, 'warn'));
      messages.push(safetyAdvice(s.key, toRoman(s.text), h.phase));
    } else {
      messages.push(say(`I understand: **${label(s.key)}**.`));
    }
  }

  // 1. Their own open complaint of the same type (water tanker orders have their own 48-hour rule below).
  if (!s.checked.own && s.key !== 'Water Bowzer|Water Bowzer') {
    const mine = await cms.list({ cnic: me.cnic, sub_category: sub.sub_category, open: '1', limit: 5 });
    const open = mine.find(c => c.category === sub.category);
    if (open) {
      s.checked.ownOpen = open;
      s.step = 'own_dup';
      messages.push(say(`You already have an open ${sub.sub_category} complaint, **${open.reference}**, made ${fmtTime(open.complaint_date)}. It is **${open.status}**.`));
      return reply(s, messages, { options: [{ label: 'Add this to that complaint', value: 'add' }, { label: 'No, this is a new problem', value: 'new' }, HUMAN] });
    }
    s.checked.own = true;
  }

  // 2. Outage: has a neighbour already reported it for this street?
  if (sub.group === 'outage' && !s.checked.street) {
    const street = await cms.list({ phase: h.phase, sector: h.sector, street: h.street, sub_category: sub.sub_category, open: '1', limit: 5 });
    const other = street.find(c => c.member_cnic !== me.cnic && c.category === sub.category);
    if (other) {
      s.checked.streetOpen = other;
      s.step = 'street_dup';
      messages.push(say(`Someone on your street (Street ${h.street}, Sector ${h.sector}) already reported **${sub.sub_category}** at ${fmtTime(other.complaint_date)}. It is **${other.status}**, so the team already knows.`, 'info'));
      return reply(s, messages, { options: [{ label: 'Follow that complaint for updates', value: 'follow' }, { label: 'My house is different, report mine', value: 'new' }, HUMAN] });
    }
    s.checked.street = true;
  }

  // 3. Water bowzer: one order every 48 hours.
  if (s.key === 'Water Bowzer|Water Bowzer' && !s.checked.bowzer) {
    const recent = (await cms.list({ cnic: me.cnic, sub_category: 'Water Bowzer', limit: 3 })).find(c => hoursSince(c.complaint_date) < 48 && !/^Cancel$/.test(c.status));
    if (recent) {
      s.step = 'done';
      const nextAt = new Date(new Date(recent.complaint_date.replace(' ', 'T')).getTime() + 48 * 3600000);
      portal.log(me.cnic, 'rule_explained', { rule: 'bowzer_48h', ref: recent.reference });
      messages.push(say(`You ordered a water tanker on ${fmtTime(recent.complaint_date)} (**${recent.reference}**, ${recent.status}). DHA allows one tanker every 48 hours, so the next one can be ordered after **${fmtTime(nextAt)}**.`, 'info'));
      return reply(s, messages, { done: true, options: [{ label: 'See that order', value: `__open:${recent.reference}` }, HUMAN, { label: 'Report something else', value: '__restart' }] });
    }
    s.checked.bowzer = true;
  }

  // 4. Billing: show the bill first; often that is the answer.
  if (sub.group === 'billing' && !s.checked.bill) {
    const res = me.residences.find(r => r.consumer_id === h.consumer_id) || me.residences[0];
    if (res?.bills?.length) {
      const [last, prev] = res.bills;
      const line = b => `${new Date(b.month + '-01').toLocaleString('en-GB', { month: 'long', year: 'numeric' })}: Rs ${b.amount.toLocaleString('en-PK')}, ${b.state === 'paid' ? `paid on ${b.paid_on} (ref ${b.payment_ref})` : `due ${b.due_date}${b.state === 'overdue' ? ', overdue' : ''}`}`;
      s.step = 'bill_check';
      messages.push(say(`Here are your latest bills for consumer ID **${res.consumer_id}** (demo figures):\n\n- ${line(last)}${prev ? `\n- ${line(prev)}` : ''}`, 'info'));
      return reply(s, messages, { options: [{ label: 'That answers my question', value: 'answered' }, { label: 'I still want to complain', value: 'continue' }, HUMAN] });
    }
    s.checked.bill = true;
  }

  // 5. Template questions the text has not answered.
  for (const q of questionsFor(s.key)) {
    if (s.answers[q.id]) continue;
    const found = detect(q, toRoman(s.text));
    if (found) { s.answers[q.id] = found; s.auto[q.id] = true; continue; }
    return askQuestion(s, q, messages);
  }

  // Ongoing security matter: the phase control room, before filing.
  if (s.key.startsWith('Security|') && /right now/i.test(s.answers.happening_now || '') && !s.checked.room) {
    s.checked.room = true;
    const cr = controlRoom(h.phase);
    if (cr) messages.push(say(`Because it is happening now, please also call the **security control room for your phase: ${cr.phone}** (24/7).`, 'warn'));
  }
  return confirm(s, me, messages);
}

function askQuestion(s, q, messages) {
  s.step = 'question';
  s.pending = q;
  messages.push(say(q.ask));
  return reply(s, messages, { allowText: q.type === 'text' || !!q.allowText, placeholder: q.type === 'text' ? 'Type here' : 'Or type your own answer',
    options: [...(q.options || []).map(o => ({ label: o, value: o })), HUMAN] });
}

function payload(s, me) {
  const sub = BY_KEY[s.key];
  const h = me.home;
  const extras = Object.entries(s.answers).map(([k, v]) => `${Q_LABEL[k] || k}: ${v}`).join('; ');
  const type = sub.group === 'report_others' ? 'report' : /\b(suggest|suggestion|mashwara|tajweez|should\s+(add|make|have))\b/i.test(s.text) ? 'suggestion' : 'complaint';
  return {
    category: sub.category, sub_category: sub.sub_category,
    description: [s.text || label(s.key), extras && `(${extras})`].filter(Boolean).join(' '),
    complaint_type: type, request_source: REQUEST_SOURCE,
    member_cnic: me.cnic, membership_no: h.membership_no, member_name: me.name, membership_type: h.membership_type, membership_status: h.membership_status,
    phase: h.phase, sector: h.sector, street: h.street, house: h.house, lat_approx: h.lat, lng_approx: h.lng,
    followup_name: me.name, followup_cell: me.mobile, priority: s.priority,
    is_paid: s.answers.payment === 'Pay now (demo)',
    details: { answers: s.answers, auto_filled: Object.keys(s.auto), intake_id: s.id, classifier_confidence: s.confidence ?? null },
  };
}

function confirm(s, me, messages) {
  s.step = 'confirm';
  const p = payload(s, me);
  const sub = BY_KEY[s.key];
  const summary = [
    { label: 'Problem', value: label(s.key) },
    { label: 'Category', value: `${sub.category} › ${sub.sub_category}` },
    { label: 'Details', value: s.text || '—' },
    ...Object.entries(s.answers).map(([k, v]) => ({ label: Q_LABEL[k] || k, value: v + (s.auto[k] ? ' (from your message)' : '') })),
    { label: 'Where', value: portal.addressLine(me.home), note: 'from your profile' },
    { label: 'Contact', value: `${me.name}, ${me.mobile}`, note: 'from your profile' },
  ];
  if (s.priority) summary.unshift({ label: 'Priority', value: 'Urgent' });
  messages.push(say('Please check the details. I will send this to the DHA complaint system.'));
  return reply(s, messages, {
    summary, payloadPreview: p, allowText: true, placeholder: 'Anything to add? (optional)',
    options: [{ label: 'Send complaint', value: 'submit' }, { label: 'Wrong type, change it', value: 'change' }, { label: 'Cancel', value: 'cancel' }, HUMAN],
  });
}

async function submit(s, me) {
  const p = payload(s, me);
  let c;
  try {
    c = await cms.create(p, `intake-${s.id}`);
  } catch (e) {
    if (e.status === 422) {
      return reply(s, [say(`The complaint system did not accept it: ${[...(e.body.missing || []).map(f => `${f} is missing`), ...(e.body.errors || [])].join(', ')}. The Complaint Office can register it for you.`, 'warn')],
        { options: [HUMAN, { label: 'Start again', value: '__restart' }] });
    }
    return reply(s, [say(`${e.message} Please try again in a minute, or call the Complaint Office on **1092**.`, 'warn')], { options: [{ label: 'Try again', value: 'submit' }, HUMAN] });
  }
  s.step = 'done';
  s.ref = c.reference;
  portal.log(me.cnic, 'submitted', { ref: c.reference, sub: s.key, auto_filled: Object.keys(s.auto).length, asked: Object.keys(s.answers).length - Object.keys(s.auto).length });
  portal.notify(me.cnic, { kind: 'submitted', title: `${c.sub_category}: complaint registered`, body: `Reference ${c.reference}. We will tell you when the team picks it up.`, ref: c.reference });
  const sub = BY_KEY[s.key];
  const eta = sub.median_resolution_hours ? ` Most ${sub.sub_category.toLowerCase()} complaints are resolved within about **${sub.median_resolution_hours < 24 ? Math.max(1, Math.round(sub.median_resolution_hours)) + ' hours' : Math.round(sub.median_resolution_hours / 24) + ' days'}**.` : '';
  return reply(s, [say(`Your complaint is registered. Reference **${c.reference}**.${eta} You will get a notification here at every update.`, 'ok')],
    { done: true, ref: c.reference, complaint: c, options: [{ label: 'See my complaint', value: `__open:${c.reference}` }, { label: 'Report something else', value: '__restart' }] });
}

function handoff(s, me) {
  const id = `H-${Date.now().toString(36).toUpperCase()}`;
  db.run('INSERT INTO handoffs (id, cnic, at, status, summary, transcript) VALUES (?,?,?,?,?,?)', id, me.cnic, new Date().toISOString(), 'waiting',
    s.key ? `${label(s.key)}: ${s.text}` : s.text || 'Asked to talk to a person', JSON.stringify(s.transcript));
  portal.log(me.cnic, 'handoff', { id, step: s.step, sub: s.key });
  s.step = 'done';
  return reply(s, [say(`I have passed this conversation to the Complaint Office (request **${id}**), so you will not need to explain it again. They will call you on **${me.mobile}**.\n\nIf it is urgent, call **1092** now.`)],
    { done: true, options: [{ label: 'Call 1092', value: '__tel:1092' }, { label: 'Start again', value: '__restart' }] });
}

module.exports = { turn, classify, quickList, label, safetyAdvice, SAFETY_RX, setContacts: fn => { kbContacts = fn; }, SUBS, BY_KEY };
