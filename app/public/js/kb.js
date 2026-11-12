// Knowledge base access and retrieval tools.
// Both agent modes (simulated and live LLM) call the same tools, so answers
// always come from the extracted DHA data, never from the model's memory.

let KB = null;
let INDEX = null;

export async function loadKb() {
  const res = await fetch('/api/kb');
  return setKb(await res.json());
}

// The server runs the same tools for the live agent and loads the data directly.
export function setKb(data) {
  KB = data;
  INDEX = buildIndex(KB);
  return KB;
}

export const kb = () => KB;

// ---------- Text helpers ----------

const STOP = new Set(('a an the i im my me we our you your to of for in on and or is are am do does did how what when where which who whom ' +
  'can could get got need needs want wants please tell about with from at by be it its this that there their them was were will would should ' +
  'shall have has had any some much many dha kya ka ki ke ko hai hain mein main mujhe mera meri mere kaise kahan kab se aur ya bhi karna karne ' +
  'krna krne chahiye chahye hum ap aap apna apni').split(' '));

const SYN = {
  sell: ['transfer', 'sale'], selling: ['transfer', 'sale'], sold: ['transfer', 'sale'], sale: ['transfer'],
  bechna: ['transfer', 'sale'], bechne: ['transfer', 'sale'], bech: ['transfer', 'sale'], farokht: ['transfer', 'sale'],
  buy: ['purchase', 'transfer', 'sales'], buying: ['purchase', 'transfer'], purchase: ['transfer'], kharid: ['purchase', 'transfer'], kharidna: ['purchase', 'transfer'],
  gift: ['hiba'], hiba: ['gift'], tohfa: ['gift'], son: ['gift'], daughter: ['gift'],
  death: ['heir', 'widow', 'legal'], died: ['heir', 'widow'], dead: ['heir', 'widow'], passed: ['heir', 'widow'], wafat: ['heir', 'widow'],
  inherit: ['heir', 'legal'], inheritance: ['heir', 'legal'], virasat: ['heir'], warasat: ['heir'], husband: ['widow', 'heir'], wife: ['widow', 'heir'],
  abroad: ['gpa', 'overseas'], overseas: ['gpa', 'abroad'], bahir: ['abroad', 'gpa'], foreign: ['abroad', 'gpa'],
  attorney: ['gpa', 'spa', 'power'],
  lost: ['duplicate'], missing: ['duplicate'], gum: ['duplicate'], stolen: ['duplicate'], misplaced: ['duplicate'],
  loan: ['lien', 'mortgage'], bank: ['lien', 'mortgage'], mortgage: ['lien'], financing: ['lien', 'mortgage'],
  tag: ['etag'], etag: ['tag'], gate: ['etag', 'sticker'], car: ['etag', 'sticker', 'vehicle'], vehicle: ['etag'], gari: ['etag', 'vehicle'], gaari: ['etag', 'vehicle'],
  maid: ['servant'], driver: ['servant'], naukar: ['servant'], cook: ['servant'], guard: ['servant'], chowkidar: ['servant'], staff: ['servant'],
  tenant: ['rent', 'renting'], rent: ['renting', 'tenancy'], kiraya: ['rent', 'renting'], kirayedar: ['rent', 'renting', 'tenant'], landlord: ['rent', 'renting'],
  vacate: ['vacation'], leaving: ['vacation'],
  makan: ['house'], ghar: ['house'], home: ['house'], kothi: ['house'],
  bijli: ['electricity'], pani: ['water'],
  map: ['drawing'], naqsha: ['drawing'], construct: ['construction', 'drawing'], build: ['construction', 'drawing', 'building'], tameer: ['construction'],
  graveyard: ['burial'], qabristan: ['burial'], funeral: ['burial'], janaza: ['burial'], bury: ['burial'], grave: ['burial'],
  wajibat: ['dues'], clearance: ['ndc'], ndc: ['demand', 'certificate'], dues: ['statement'],
  panel: ['solar'], panels: ['solar'],
  qabza: ['possession'], possession: ['site'],
  spelling: ['correction', 'name'], wrong: ['correction'],
  dog: ['pet', 'dogs'], kutta: ['dog', 'pet'],
  camera: ['cctv'], footage: ['cctv'], recording: ['cctv'], video: ['cctv'],
  verify: ['verification'], check: ['verification'],
  card: ['membership'],
  dealer: ['dealer'], agent: ['dealer'], estate: ['dealer'],
  labour: ['contractor'], mazdoor: ['labour', 'contractor'], thekedar: ['contractor'],
  jaldi: ['urgent'], fast: ['urgent'], quick: ['urgent'], quickly: ['urgent'],
  merge: ['amalgamation'], combine: ['amalgamation'], join: ['amalgamation'],
  portal: ['member', 'portal'], online: ['portal'], login: ['portal'], app: ['portal'],
  email: ['information', 'resident'], ebill: ['email', 'bill'],
  kaghzat: ['documents'], kaghaz: ['documents'], kagzat: ['documents'], jurmana: ['fine', 'penalty'], ijazat: ['permission', 'allowed'],
  chhat: ['roof'], deewar: ['wall'], diwar: ['wall'], unchi: ['height'], uncha: ['height'], unchai: ['height'],
  banana: ['construction', 'build'], banane: ['construction', 'build'], dafan: ['burial'], dafnane: ['burial'],
  kachra: ['garbage', 'waste'], kiraye: ['rent', 'renting', 'tenant'],
  shara: ['conditions', 'eligibility'], sharait: ['conditions', 'eligibility'], naksha: ['drawing'], tahkhana: ['basement'],
};

function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

export function tokenize(s) {
  return String(s || '').toLowerCase().replace(/e-tag/g, 'etag').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(t => t && !STOP.has(t)).map(stem);
}

function expandQuery(s) {
  const raw = String(s || '').toLowerCase().replace(/e-tag/g, 'etag').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Map();
  for (const r of raw) {
    if (STOP.has(r)) continue;
    out.set(stem(r), 1);
    for (const syn of SYN[r] || SYN[stem(r)] || []) if (!out.has(stem(syn))) out.set(stem(syn), 0.7);
  }
  return out;
}

// English synonyms for Roman Urdu / everyday words, added to keyword search.
export function expandTerms(s) {
  return [...expandQuery(s)].filter(([, w]) => w < 1).map(([t]) => t).join(' ');
}

// ---------- Index ----------

function buildIndex(kb) {
  const faqsByService = {};
  for (const f of kb.faqs) {
    if (!f.related_service_id) continue;
    (faqsByService[f.related_service_id] ||= []).push(`${f.question} ${f.alternative_phrasings}`);
  }
  const stepsByProc = {};
  for (const s of kb.steps) (stepsByProc[s.procedure_id] ||= []).push(s.action);

  const docs = [];
  for (const s of kb.services) {
    docs.push({
      kind: 'service', id: s.service_id, ref: s,
      fields: [
        [tokenize(s.service_name), 3],
        [tokenize(s.category), 1.2],
        [tokenize(s.who_can_apply), 0.6],
        [tokenize((faqsByService[s.service_id] || []).join(' ')), 1],
        [tokenize((stepsByProc[s.procedure_id] || []).join(' ')), 0.25],
      ],
    });
  }
  for (const f of kb.faqs) {
    docs.push({
      kind: 'faq', id: f.faq_id, ref: f,
      fields: [[tokenize(f.question), 3], [tokenize(f.alternative_phrasings), 2.5], [tokenize(f.draft_answer), 0.4]],
    });
  }
  for (const g of kb.glossary) {
    docs.push({ kind: 'glossary', id: g.term, ref: g, fields: [[tokenize(g.term), 3], [tokenize(g.full_form), 2], [tokenize(g.urdu_or_roman_urdu), 2], [tokenize(g.meaning), 0.4]] });
  }
  const df = new Map();
  for (const d of docs) {
    d.sets = d.fields.map(([toks, w]) => [new Set(toks), w]);
    const all = new Set(d.fields.flatMap(f => f[0]));
    for (const t of all) df.set(t, (df.get(t) || 0) + 1);
  }
  return { docs, df, n: docs.length };
}

function scoreDoc(d, q) {
  let score = 0, hits = 0;
  for (const [t, qw] of q) {
    const idf = Math.log(1 + INDEX.n / (INDEX.df.get(t) || 0.5));
    let best = 0;
    for (const [set, w] of d.sets) {
      if (set.has(t)) best = Math.max(best, w);
      else if (t.length >= 5) for (const x of set) if (x.length >= 5 && (x.startsWith(t) || t.startsWith(x))) { best = Math.max(best, w * 0.6); break; }
    }
    if (best) { score += best * idf * qw; hits++; }
  }
  return hits ? score * (0.6 + 0.4 * hits / q.size) : 0;
}

export function search(query, { kinds = ['service', 'faq', 'glossary'], limit = 5 } = {}) {
  const q = expandQuery(query);
  if (!q.size) return [];
  return INDEX.docs.filter(d => kinds.includes(d.kind))
    .map(d => ({ kind: d.kind, id: d.id, ref: d.ref, score: scoreDoc(d, q) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------- Lookups ----------

export const service = id => KB.services.find(s => s.service_id === id);
export const faq = id => KB.faqs.find(f => f.faq_id === id);
export const form = id => KB.forms.find(f => f.form_id === id);
export const contact = id => KB.contacts.find(c => c.contact_id === id);
export const fee = id => KB.fees.find(f => f.fee_id === id);

const split = v => String(v || '').split(';').map(x => x.trim()).filter(Boolean);

export function feesFor(ids) {
  const out = [];
  for (const id of split(ids)) {
    const rows = id.endsWith('*') ? KB.fees.filter(f => f.fee_id.startsWith(id.slice(0, -1))) : KB.fees.filter(f => f.fee_id === id);
    for (const r of rows) if (r.status !== 'superseded' && !out.includes(r)) out.push(r);
  }
  return out;
}

export function contactsForTopic(topic, extraQuery = '') {
  if (!topic && !extraQuery) return [];
  const t = String(topic || '').toLowerCase();
  let list = t ? KB.contacts.filter(c => c.topic.toLowerCase().startsWith(t) || c.directorate.toLowerCase() === t) : [];
  if (!list.length) {
    const q = expandQuery(`${topic} ${extraQuery}`);
    list = KB.contacts.map(c => {
      const toks = new Set(tokenize(`${c.topic} ${c.office} ${c.directorate} ${c.role}`));
      let s = 0;
      for (const [w, qw] of q) if (toks.has(w)) s += qw;
      return { c, s };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.c);
  }
  return list.slice(0, 6);
}

export const EMERGENCY_IDS = ['CON-002', 'CON-003', 'CON-062', 'CON-001'];

export function serviceBundle(id) {
  const s = service(id);
  if (!s) return null;
  const steps = s.procedure_id ? KB.steps.filter(x => x.procedure_id === s.procedure_id).sort((a, b) => a.step_no - b.step_no) : [];
  const documents = s.procedure_id ? KB.documents.filter(x => x.procedure_id === s.procedure_id) : [];
  const formIds = split(s.form_ids);
  const forms = formIds.map(form).filter(Boolean);
  const stamps = KB.stampRules.filter(r => formIds.includes(r.form_id));
  return {
    service: s,
    steps,
    documents,
    forms,
    fees: feesFor(s.fee_ids),
    slas: KB.slas.filter(x => x.service_id === id),
    eligibility: KB.eligibility.filter(x => x.service_id === id),
    stamps,
    faqs: KB.faqs.filter(x => x.related_service_id === id),
    contacts: contactsForTopic(s.contact_topic),
  };
}

// ---------- Formatting ----------

export function rupees(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `Rs ${v.toLocaleString('en-PK')}` : n;
}

export function feeAmount(r) {
  const basis = r.rate_basis || '';
  if (!r.amount) return r.conditions || 'See conditions';
  if (basis.includes('percent')) return `${r.amount}% ${basis.replace(/^percent_?/, '').replace(/_/g, ' ')}`.trim();
  if (basis === 'fixed' || !basis) return rupees(r.amount);
  return `${rupees(r.amount)} ${basis.replace(/_/g, ' ')}`;
}

export function feeSize(r) {
  const unit = r.size_unit || '';
  if (r.size_from && r.size_to) return `${r.size_from}–${r.size_to} ${unit}`;
  if (r.size_from && !r.size_to) return `${r.size_from}+ ${unit}`;
  if (!r.size_from && r.size_to) return `up to ${r.size_to} ${unit}`;
  return '';
}

export function feeLabel(r) {
  const who = r.owner_type && !['any', 'individual', 'individual_or_corporate'].includes(r.owner_type) ? r.owner_type.replace(/_/g, ' ') : '';
  const prop = r.property_type && r.property_type !== 'any' ? r.property_type : '';
  const name = r.category === 'reissuance_fee' ? `Re-issue of ${r.fee_name}` : r.fee_name;
  return [name, prop, who].filter(Boolean).join(' · ');
}

// Plot sizes as residents say them; DHA treats 1 kanal as 500 sq yd.
export const PLOT_SIZES = [
  { label: '5 Marla', sqyd: 125 },
  { label: '8 Marla', sqyd: 200 },
  { label: '10 Marla', sqyd: 250 },
  { label: '1 Kanal', sqyd: 500 },
  { label: '2 Kanal', sqyd: 1000 },
];

export function sizeMatches(r, sqyd) {
  if (!sqyd || r.size_unit !== 'sq yd' || (!r.size_from && !r.size_to)) return false;
  const from = Number(r.size_from || 0), to = r.size_to ? Number(r.size_to) : Infinity;
  return sqyd >= from && sqyd <= to;
}

export function parseSize(text) {
  const m = String(text).toLowerCase().match(/(\d+(?:\.\d+)?)\s*(marla|kanal|sq\.?\s*y(?:ar)?ds?|sq\s*yd|yards?|syd)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2].startsWith('marla')) return n * 25;
  if (m[2].startsWith('kanal')) return n * 500;
  return n;
}

export function phones(str) {
  return String(str || '').split(/[;/]|,(?=\s*0)/).map(p => p.trim()).filter(Boolean).map(part => {
    const m = part.match(/\+?\d[\d\s-]{2,}\d/);
    if (!m) return null;
    let num = m[0].replace(/-\d$/, ''); // "051-9254452-3" lists a range; dial the first
    return { display: part.replace(/\s+/g, ' '), tel: num.replace(/[^\d+]/g, '') };
  }).filter(Boolean);
}

export function isUnconfirmed(status) {
  return ['needs_confirmation', 'draft_needs_dha_approval', 'missing', 'needs_content'].includes(status);
}
