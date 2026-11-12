// The helpdesk agent. Two brains share one toolset:
//  - simulated: a rule-based planner that calls the tools, in the browser (no AI service needed)
//  - live: any OpenAI-compatible model (Groq, OpenRouter, vLLM, Ollama) that decides which
//    tools to call. That loop runs on the server (../../agent_server.js), which imports the
//    tools from this file; the browser only sends the resident's question to /api/agent.

import * as K from './kb.js';
import * as B from './build.js';

// Data access for the tools. The browser calls the HTTP API; the server swaps in direct calls.
let API = {
  async search(body) {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json;
  },
  complaints: async qs => (await fetch(`/api/complaints?${qs}`)).json(),
  rates: async q => (await fetch(`/api/market/rates?${new URLSearchParams(Object.entries(q).filter(([, v]) => v))}`)).json(),
};
export function setApi(api) { API = { ...API, ...api }; }

// Demo sign-in (public/js/portal.js keeps the CNIC in localStorage). The server checks it.
function uiLang() {
  try { return globalThis.localStorage?.getItem('dha-lang') || 'en'; } catch { return 'en'; }
}

function cnicHeader() {
  try { const c = globalThis.localStorage?.getItem('dha-cnic'); return c ? { 'X-Demo-CNIC': c } : {}; } catch { return {}; }
}

// ---------- Tools ----------

export const TOOL_SCHEMAS = [
  {
    name: 'search_knowledge',
    description: 'Search DHA services, approved FAQs and glossary. Use first for any "how do I", "what is", or unclear question. Returns service_ids and FAQ ids.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Short search phrase in English, e.g. "transfer plot gift"' } }, required: ['query'] },
  },
  {
    name: 'get_service_details',
    description: 'Full details for one service: who can apply, steps, documents, forms, current fees, time taken, eligibility, stamp paper and contacts.',
    parameters: { type: 'object', properties: { service_id: { type: 'string', description: 'e.g. SVC-TFR-NORMAL' } }, required: ['service_id'] },
  },
  {
    name: 'search_documents',
    description: 'Search the full text of DHA Byelaws & Regulations 2023, procedure documents, forms, fines, building standards and notices. Use for rules and permissions (what is allowed, limits, heights, basements, covered area, setbacks, fines, penalties, construction rules, tenancy, security rules), and for anything search_knowledge does not answer. Returns passages with their source and clause.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'A clear English search query with the key terms, e.g. "basement permission depth residential plot"' } }, required: ['query'] },
  },
  {
    name: 'lookup_fees',
    description: 'Look up current fees and charges (Schedule of Charges). Optional plot size in square yards (1 kanal = 500, 10 marla = 250, 5 marla = 125).',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "transfer fee residential", "membership fee", "duplicate allotment letter"' }, plot_size_sqyd: { type: 'number' } }, required: ['query'] },
  },
  {
    name: 'find_contacts',
    description: 'Find DHA phone numbers and offices for a topic (e.g. "complaints", "security control room phase II", "NDC", "E-Tag").',
    parameters: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
  },
  {
    name: 'find_forms',
    description: 'Find downloadable DHA forms by name or purpose.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_phase_info',
    description: 'Jurisdiction (Islamabad or Rawalpindi), security office, site office for a phase or project. Jurisdiction decides stamp paper value and pay order payee.',
    parameters: { type: 'object', properties: { phase: { type: 'string', description: 'e.g. "Phase II", "DHA Valley"' } }, required: ['phase'] },
  },
  {
    name: 'get_latest_notices',
    description: 'Current DHA notices and announcements (fee changes, surcharges, ballots).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_building_rules',
    description: 'How to build a house in DHA, for a plot size: the 8 steps from possession to moving in (with time and fees for that size), and the building limits (ground and first floor covered area, front, rear and side setbacks, storeys, height). Use for "how do I build / construct a house", "what can I build on my plot", covered area or setbacks for a plot size. For other rules (basements, boundary walls, ramps, fines for a specific violation) use search_documents.',
    parameters: {
      type: 'object',
      properties: { plot_size: { type: 'string', description: 'e.g. "10 Marla", "1 Kanal", "250 sq yd". Leave out if unknown.' } },
    },
  },
  {
    name: 'lookup_plot_prices',
    description: 'Market price range (min-max, Rs) of DHA plots and houses by phase, sector and size, from the DHA Property Exchange price benchmark (PVBM). Use for questions about plot or house prices, rates or value, or buying a plot. Also shows a link to DHA plots for sale on the marketplace.',
    parameters: {
      type: 'object',
      properties: {
        phase: { type: 'string', description: 'e.g. "2", "Phase V", "7", "Margalla Enclave"' },
        sector: { type: 'string', description: 'e.g. "E", "F-1", "Pine Hills", "Bluebell"' },
        size: { type: 'string', description: 'e.g. "1 Kanal", "10 Marla", "5 Marla"' },
        use: { type: 'string', enum: ['residential', 'commercial', 'house'] },
      },
    },
  },
  {
    name: 'start_complaint',
    description: 'Show the resident a button that opens the guided complaint reporter (it fills their address and contact from their signed-in profile and asks only what is missing), for them to confirm and submit. Use whenever the resident reports a problem (water, electricity, street light, sewerage, garbage, roads, parks, mosquitoes, security). Never claim the complaint is filed; the resident submits it.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['water', 'electricity', 'streetlight', 'sewerage', 'garbage', 'roads', 'parks', 'dengue', 'security', 'other'] },
        description: { type: 'string', description: "The problem in the resident's words" },
        phase: { type: 'string' },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_my_account',
    description: "The signed-in resident's OWN account: plots and membership numbers, overdue and next instalments, unpaid society bills, and how to pay. Use for: my dues, my instalments, pay for my plot, are my bills paid, what do I owe. Tells you if they are not signed in or have no property.",
    parameters: { type: 'object', properties: { focus: { type: 'string', enum: ['dues', 'bills'], description: 'dues = plot instalments; bills = monthly society bills' } } },
  },
  {
    name: 'get_my_applications',
    description: "The signed-in member's OWN applications with DHA from the membership portal: site plan and possession, building plan approval, where each one is, who has to act, and any fee voucher to pay. Use for: status of my site plan, my building plan, when do I get possession, pay my voucher.",
    parameters: { type: 'object', properties: { focus: { type: 'string', enum: ['site_plan', 'building_plan', 'voucher'] } } },
  },
  {
    name: 'get_my_complaints',
    description: "The signed-in resident's own complaints (open, waiting for their answer, closed) from the complaint system. Use when they ask about their complaints without giving a number.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'track_complaint',
    description: 'Get the progress of complaints by complaint number (e.g. CMP-2026-10412) or mobile number.',
    parameters: { type: 'object', properties: { complaint_id: { type: 'string' }, mobile: { type: 'string' } } },
  },
];

const short = (s, n = 240) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');

function feeRow(r) {
  return { fee_id: r.fee_id, name: K.feeLabel(r), size: K.feeSize(r) || undefined, amount: K.feeAmount(r), conditions: short(r.conditions, 160) || undefined, status: r.status };
}

export async function runTool(name, args, ctx = {}) {
  switch (name) {
    case 'get_my_account':
    case 'get_my_applications':
    case 'get_my_complaints': {
      if (!API.account) return { data: { error: 'Not available here' }, step: 'Account data is not available' };
      const r = name === 'get_my_account' ? API.account(ctx.cnic, args.focus)
        : name === 'get_my_applications' ? await API.myApplications(ctx.cnic, args.focus) : await API.myComplaints(ctx.cnic);
      return {
        // source_id gives the model something real to cite (it otherwise cites the tool's name).
        data: { source_id: { get_my_account: 'MY-ACCOUNT', get_my_applications: 'MY-APPLICATIONS', get_my_complaints: 'MY-COMPLAINTS' }[name], summary: r.text, details: r.cards?.[0] || null, signed_in: !!ctx.cnic, payment_channels: (r.citations || []).map(id => ({ pay_id: id })) },
        card: r.cards?.[0] || null,
        step: r.steps?.at(-1)?.label || 'Read your account',
      };
    }
    case 'search_knowledge': {
      const hits = K.search(args.query || '', { limit: 6 });
      return {
        data: hits.map(h => h.kind === 'service'
          ? { type: 'service', service_id: h.id, name: h.ref.service_name, category: h.ref.category }
          : h.kind === 'faq'
            ? { type: 'faq', faq_id: h.id, question: h.ref.question, answer: h.ref.draft_answer, related_service_id: h.ref.related_service_id, status: h.ref.status }
            : { type: 'glossary', term: h.id, meaning: h.ref.meaning, full_form: h.ref.full_form }),
        step: `Searched DHA information for “${args.query}” — ${hits.length} matches`,
      };
    }
    case 'get_service_details': {
      const b = K.serviceBundle(args.service_id);
      if (!b) return { data: { error: 'Unknown service_id' }, step: `Service ${args.service_id} not found` };
      const s = b.service;
      return {
        data: {
          service_id: s.service_id, name: s.service_name, who_can_apply: s.who_can_apply, channel: s.channel,
          physical_presence_required: s.physical_presence_required, time_taken: s.sla, status: s.status,
          steps: b.steps.map(x => `${x.step_no}. ${x.action}${x.office_or_desk ? ` (${x.office_or_desk})` : ''}${x.time_taken ? ` [${x.time_taken}]` : ''}`),
          documents: b.documents.map(d => `${d.document_name} — from ${d.required_from || 'applicant'}${d.original_or_copy ? `, ${d.original_or_copy}` : ''}${d.attested_by ? `, attested by ${d.attested_by}` : ''}${d.mandatory_or_conditional === 'Conditional' ? ` (only if ${d.condition})` : ''}`),
          forms: b.forms.map(f => ({ form_id: f.form_id, title: f.title })),
          fees: b.fees.slice(0, 18).map(feeRow),
          timings: b.slas.map(x => `${x.item}: ${x.normal_time}${x.validity ? `; valid ${x.validity}` : ''}${x.urgent_option ? `; urgent: ${x.urgent_option}` : ''}`),
          eligibility: b.eligibility.map(e => `${e.rule}${e.exception ? ` (Exception: ${e.exception})` : ''}`),
          stamp_paper: b.stamps.map(r => `${r.instrument}: Rs ${r.stamp_paper_value_pkr} ${r.paper_type} for ${r.jurisdiction}`),
          contacts: b.contacts.map(c => `${c.topic}: ${c.phone}${c.extension ? ` ext ${c.extension}` : ''}`),
        },
        card: { type: 'service', id: s.service_id },
        step: `Opened “${s.service_name}” — ${b.steps.length} steps, ${b.documents.length} documents, ${b.fees.length} fees`,
      };
    }
    case 'search_documents': {
      let json;
      try {
        json = await API.search({ query: args.query || '', keywords: K.expandTerms(args.query || ''), k: 5 });
      } catch (e) {
        return { data: { error: e.message }, step: `Document search unavailable (${e.message})` };
      }
      const results = json.results;
      const ms = Object.values(json.timings).reduce((a, b) => a + b, 0);
      return {
        data: results.map(r => ({ id: r.chunk_id, source: r.header, text: short(r.text, 1100), year: r.year || undefined, status: r.status, caution: r.caution || undefined, relevance: r.rerank != null ? Number(r.rerank.toFixed(2)) : undefined })),
        card: results.length ? { type: 'sources', results: results.slice(0, 3), stages: json.stages } : null,
        step: `Searched DHA documents (${json.stages.join(' + ')}, ${ms} ms) — best: ${results[0] ? short(results[0].header.split(' › ').slice(-2).join(' › '), 70) : 'nothing found'}`,
        raw: json,
      };
    }
    case 'lookup_fees': {
      const rows = feeSearch(args.query || '', args.plot_size_sqyd);
      return {
        data: rows.length ? rows.map(feeRow) : { note: 'No matching fee in the published Schedule of Charges.' },
        card: rows.length ? { type: 'fees', ids: rows.map(r => r.fee_id), sqyd: args.plot_size_sqyd, title: args.query } : null,
        step: `Checked the Schedule of Charges for “${args.query}”${args.plot_size_sqyd ? ` (${args.plot_size_sqyd} sq yd)` : ''} — ${rows.length} fees`,
      };
    }
    case 'find_contacts': {
      const list = K.contactsForTopic('', args.topic || '');
      return {
        data: list.map(c => ({ contact_id: c.contact_id, topic: c.topic, office: c.office, phone: c.phone, extension: c.extension, email: c.email, phase: c.phase })),
        card: list.length ? { type: 'contacts', ids: list.map(c => c.contact_id) } : null,
        step: `Looked up phone numbers for “${args.topic}” — ${list.length} found`,
      };
    }
    case 'find_forms': {
      const list = formSearch(args.query || '');
      return {
        data: list.map(f => ({ form_id: f.form_id, title: f.title, purpose: f.purpose, who_signs: f.who_signs, submit_to: f.submit_to, stamp_paper: f.stamp_paper_required })),
        card: list.length ? { type: 'forms', ids: list.map(f => f.form_id) } : null,
        step: `Searched the forms library for “${args.query}” — ${list.length} forms`,
      };
    }
    case 'get_phase_info': {
      const q = String(args.phase || '').toLowerCase().replace(/phase\s*/, 'phase ').trim();
      const roman = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi', 7: 'vii' };
      const norm = q.replace(/phase (\d)/, (_, d) => `phase ${roman[d]}`);
      const row = K.kb().phases.find(p => p.phase_or_project.toLowerCase() === norm) || K.kb().phases.find(p => p.phase_or_project.toLowerCase().includes(norm));
      return { data: row || { error: 'Phase not found' }, step: `Checked jurisdiction for ${args.phase}` };
    }
    case 'get_latest_notices': {
      const list = K.kb().notices.filter(n => n.status === 'active' || n.status === 'needs_content').slice(0, 8);
      return {
        data: list.map(n => ({ notice_id: n.notice_id, title: n.title, date: n.issue_date || n.effective_from, summary: n.summary, status: n.status })),
        card: { type: 'notices', ids: list.map(n => n.notice_id) },
        step: `Read ${list.length} current notices`,
      };
    }
    case 'get_building_rules': {
      const sqyd = args.plot_size ? B.sqydFrom(args.plot_size) : null;
      const g = B.buildGuide(sqyd || 250);
      const r = g.rules;
      const stages = g.stages.map(s => ({ step: s.no, stage: s.title, time: s.time, fees: s.fees.filter(f => f.amount != null).map(f => `${f.label}: ${K.rupees(f.amount)}${f.how && f.how !== 'fixed' ? ` (${f.how})` : ''}`) }));
      if (!sqyd) {
        return {
          data: { note: 'Plot size not given: these are the steps. Building limits depend on the plot size, so ask for it.', stages, source: g.source },
          card: { type: 'build-guide', sqyd: null },
          step: 'Read the construction steps (Byelaws Annex D)',
        };
      }
      const gf = r.ground_floor, sb = r.setbacks, ftx = v => (v ? (String(v.value) === '0' ? 'none' : `${v.value} ${v.unit}`) : 'not given');
      const limits = [
        gf && { std_id: gf.id, rule: 'Ground floor covered area (car porch included)', value: gf.missing ? 'not readable in the Byelaws text; ask Building Control' : `${gf.pct}% of the plot, about ${gf.sqft} sq ft`, confirm_with_dha: gf.confirm },
        r.first_floor && { std_id: r.first_floor.id, rule: 'First floor covered area', value: r.first_floor.text + (r.first_floor.sqft ? ` (about ${r.first_floor.sqft} sq ft)` : ''), confirm_with_dha: r.first_floor.confirm },
        sb.front && { std_id: sb.front.id, rule: 'Front setback (open space)', value: ftx(sb.front) + (sb.front.notes ? `; ${sb.front.notes}` : '') },
        sb.rear && { std_id: sb.rear.id, rule: 'Rear setback', value: ftx(sb.rear) },
        sb.side_porch && { std_id: sb.side_porch.id, rule: 'Side setback, car porch side', value: ftx(sb.side_porch) },
        sb.side_other && { std_id: sb.side_other.id, rule: 'Side setback, other side', value: ftx(sb.side_other) },
        r.storeys && { std_id: r.storeys.id, rule: 'Maximum storeys', value: r.storeys.value },
        r.height && { std_id: r.height.id, rule: 'Maximum height including water tank and mumty', value: ftx(r.height) },
      ].filter(Boolean);
      return {
        data: { plot: r.size, plot_area: `${r.plot_sqft} sq ft`, bylaw_clause: r.clause, limits, stages, source: g.source },
        card: { type: 'build-guide', sqyd },
        step: `Read the building limits for ${r.size} (Byelaws ${r.clause}) and the 8 construction steps`,
      };
    }
    case 'lookup_plot_prices': {
      const r = await API.rates(args);
      const rows = r.rates || [];
      const mn = n => `Rs ${(n / 1e6).toFixed(n % 1e6 ? 2 : 1).replace(/\.?0+$/, '')} million`;
      return {
        data: rows.length
          ? { source_id: 'PVBM', source: `DHA Property Exchange, Price Valuation Benchmarking (${r.period})`, status: r.status, rates: rows.slice(0, 30).map(x => ({ phase: x.phase_label, sector: x.sector, size: x.size, type: x.use === 'house' ? 'built house' : `${x.use} ${x.kind.replace('_', '-')}`, price_range: `${mn(x.min)} to ${mn(x.max)} (Rs ${x.min.toLocaleString('en-US')} to Rs ${x.max.toLocaleString('en-US')})` })) }
          : { source_id: 'PVBM', note: 'No benchmark price for that phase, sector or size.' },
        card: rows.length ? { type: 'plot-prices', rows: rows.slice(0, 12), period: r.period, query: args } : null,
        step: `Checked the DHA price benchmark (${r.period}) — ${rows.length} prices`,
      };
    }
    case 'start_complaint':
      return {
        data: { opened: true, note: 'A "Continue to report it" button is now shown. After sign-in, the reporter takes the address and mobile from the signed-in profile, asks only for what is missing (for example a visit time), and shows a summary to confirm. Do not tell the resident to enter their phase or plot number.' },
        card: { type: 'complaint-start', prefill: { category: args.category, description: args.description || '', phase: args.phase || '' } },
        step: `Prepared a ${COMPLAINT_TYPES.find(c => c.id === args.category)?.label.toLowerCase() || ''} complaint`,
      };
    case 'track_complaint': {
      const qs = args.complaint_id ? `id=${encodeURIComponent(args.complaint_id)}` : args.mobile ? `mobile=${encodeURIComponent(args.mobile)}` : '';
      const list = qs ? await API.complaints(qs) : [];
      return {
        data: list.length ? list.map(c => ({ id: c.id, type: c.categoryLabel, status: c.status, location: [c.phase, c.sector, c.street, c.house].filter(Boolean).join(', '), last_update: c.events.at(-1).note, team: c.team })) : { note: qs ? 'No complaint found' : 'Need a complaint number or mobile number' },
        card: { type: 'complaint-status', ids: list.map(c => c.id), list },
        step: qs ? `Checked the complaint system — ${list.length} complaint${list.length === 1 ? '' : 's'} found` : 'Asked for a complaint number',
      };
    }
    default:
      return { data: { error: `Unknown tool ${name}` }, step: `Unknown tool ${name}` };
  }
}

function feeSearch(query, sqyd) {
  const q = new Set(K.tokenize(query));
  const fees = K.kb().fees.filter(f => f.status !== 'superseded');
  let rows = fees.map(f => {
    const toks = new Set(K.tokenize(`${f.fee_name} ${f.category.replace(/_/g, ' ')} ${f.property_type} ${f.transaction_type} ${f.conditions}`));
    let s = 0;
    for (const t of q) if (toks.has(t)) s++;
    return { f, s };
  }).filter(x => x.s > 0);
  const max = Math.max(0, ...rows.map(x => x.s));
  rows = rows.filter(x => x.s === max).map(x => x.f);
  if (sqyd) {
    const sized = rows.filter(r => K.sizeMatches(r, sqyd));
    const unsized = rows.filter(r => !r.size_from && !r.size_to);
    if (sized.length) rows = [...sized, ...unsized];
  }
  return rows.slice(0, 12);
}

function formSearch(query) {
  const q = new Set(K.tokenize(query));
  return K.kb().forms.filter(f => f.status !== 'missing' && f.download_url).map(f => {
    const toks = new Set(K.tokenize(`${f.title} ${f.purpose}`));
    let s = 0;
    for (const t of q) if (toks.has(t)) s++;
    return { f, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6).map(x => x.f);
}

export const COMPLAINT_TYPES = [
  { id: 'water', label: 'Water supply', emoji: '💧', re: /water|pani|leak|pipe|pressure|tank|tanker/ },
  { id: 'electricity', label: 'Electricity', emoji: '⚡', re: /electric|bijli|power|outage|voltage|transformer|wire|light (is )?gone|no light/ },
  { id: 'streetlight', label: 'Street light', emoji: '💡', re: /street ?light|lamp|pole/ },
  { id: 'sewerage', label: 'Sewerage / drain', emoji: '🚰', re: /sewer|drain|gutter|manhole|overflow|nali|smell/ },
  { id: 'garbage', label: 'Garbage / cleaning', emoji: '🗑️', re: /garbage|trash|waste|kachra|clean|sweep|dustbin|rubbish/ },
  { id: 'roads', label: 'Road / footpath', emoji: '🛣️', re: /road|pothole|footpath|speed ?breaker|sarak|street (is )?broken/ },
  { id: 'parks', label: 'Park / trees', emoji: '🌳', re: /park|tree|grass|plant|branch/ },
  { id: 'dengue', label: 'Mosquitoes / spray', emoji: '🦟', re: /mosquito|dengue|spray|fogg|machhar/ },
  { id: 'security', label: 'Security concern', emoji: '🛡️', re: /security|theft|thief|suspicious|chori|noise|stray|guard/ },
  { id: 'other', label: 'Something else', emoji: '📝', re: /$^/ },
];

// ---------- Simulated agent ----------

const sleep = ms => new Promise(r => setTimeout(r, ms));

const RX = {
  greet: /^(hi|hello|hey|salam|salaam|aoa|assalam|asalam|good (morning|evening|afternoon))\b/,
  thanks: /^(thanks|thank you|shukriya|jazak|ok thanks|great)\b/,
  track: /\btrack|status of (my )?complaint|my complaint|complaint status|cmp-?\s?\d|ticket/,
  complaint: /complain|shikayat|report (a )?problem|not working|broken|kharab|leak|no water|no electricity|no light|blocked|overflow|not collected|pothole|outage|band hai|nahi aa raha|nahi a rha/,
  personal: /\bmy (bill|dues|payment|installment|instalment|plot status|account|balance|file)|have i paid|did i pay|is my bill|bill paid|installment|instalment|my transfer status|outstanding/,
  contact: /phone|number|contact|helpline|whom (should|do) i call|who do i call|kis se|emergency|uan|call centre|call center/,
  fees: /\b(fees?|costs?|charges?|how much|kitna|kitne|price|rates?|paise|amount)\b/,
  market: /\b(plot|plots|kanal|marla|house|ghar)\b.*\b(price|prices|rate|rates|qeemat|qimat|value|worth|kitne\s*ka|kitnay\s*ka|for sale|buy|kharid\w*)\b|\b(price|prices|rate|rates|qeemat|qimat|how much|cost|buy|kharid\w*)\b.*\b(plot|plots|kanal|marla)\b|\bmarketplace\b|\bplots? for sale\b/,
  forms: /\bform|download|affidavit|undertaking|specimen|template|deed/,
  notices: /notice|news|latest|announcement|surcharge|circular/,
  policy: /\b(allowed|allow|permitted|permission|ijazat|can i (build|make|construct|keep|install|put|park|run|cut|extend|cover|raise|add)|is it (allowed|legal|ok)|rules?|bye?laws?|regulations?|height|basement|storeys?|floors?|covered area|setback|boundary wall|parapet|ramp|fines?|penalt\w*|violation|maximum|minimum|limit|working hours|noise|generator|pets?|dogs?|commercial activity|tuition|home business|encroach\w*|porch|mumty|servant quarter|car parking|water tank|demolish\w*|unch[ia]i?|uncha|deewar|diwar|chhat|tahkhana|jurmana|kitni|kitna)\b/,
};

function sourceLabel(r) {
  if (r.clause && /byelaw|fine|regularization|building_standard/.test(r.source_type)) return `DHA Byelaws, clause ${r.clause}`;
  if (r.source_type === 'faq') return "DHA's FAQ";
  if (r.source_type === 'notice') return 'a DHA notice';
  return `the DHA document “${r.title}”`;
}

const QUALIFIER = /\b(gift|hiba|heirs?|died|death|deceased|widow|senior|out ?station|overseas|abroad|commercial|mortgage|duplicate|lost|urgent)\b/g;

// Answer from the Byelaws and documents; returns null when nothing relevant enough was found.
async function answerFromDocuments(text, call, steps, cards, { onTopic = false } = {}) {
  const r = await call('search_documents', { query: text });
  // Neither score alone separates off-topic questions from Roman Urdu ones, so accept a passage when the
  // reranker is confident or when keyword and meaning search both rank it in their top 10.
  const results = r.raw?.results || [];
  const both = results.find(x => x.ranks?.keyword <= 10 && x.ranks?.vector <= 10);
  // A rules question (onTopic) may also take a top-3 passage that keyword search ranks highly: meaning search
  // is weak on Roman Urdu, while the synonym-expanded keyword search is not.
  const keywordTop = onTopic ? results.slice(0, 3).find(x => x.ranks?.keyword <= 3) : null;
  const best = results.find(x => x.rerank >= 0.2) || both || keywordTop || (!r.raw?.stages.includes('vector') ? results[0] : null);
  if (!best) {
    if (cards.at(-1)?.type === 'sources') cards.pop();
    return null;
  }
  const caution = best.caution ? `\n\n**Note:** ${best.caution}` : '';
  return {
    text: `Here is what ${sourceLabel(best)} says:\n\n“${short(best.text.replace(/\n+/g, ' '), 450)}”${caution}\n\nI've listed the most relevant passages below. Rules can change, so please confirm with DHA before you build or pay.`,
    cards, steps,
  };
}

export async function runSimulated(text, onStep) {
  const t = text.toLowerCase().trim();
  const steps = [];
  const cards = [];
  const call = async (name, args) => {
    onStep?.({ label: pendingLabel(name, args), pending: true });
    await sleep(350 + Math.random() * 350);
    const r = await runTool(name, args);
    steps.push({ tool: name, args, label: r.step });
    onStep?.({ label: r.step, done: true });
    if (r.card) cards.push(r.card);
    return r;
  };
  onStep?.({ label: 'Understanding your question…', pending: true });
  await sleep(300);
  onStep?.({ label: 'Understood the question', done: true });

  if (RX.greet.test(t) && t.split(/\s+/).length <= 4) {
    return { text: 'Wa Alaikum Assalam! I can help you with DHA procedures, fees, forms and phone numbers, and I can register or track a complaint for you.\n\nWhat would you like to do?', cards: [{ type: 'quick-actions' }], steps };
  }
  if (RX.thanks.test(t)) return { text: "You're welcome. If you need anything else, I am here.", cards: [], steps };

  const id = text.match(/cmp-?\s?(\d{4}-?)?\d{4,5}/i)?.[0];
  const mobile = text.replace(/[\s-]/g, '').match(/(\+?92|0)3\d{9}/)?.[0];
  if (RX.track.test(t) || id) {
    if (!id && !mobile) return { text: 'Please tell me your **complaint number** (for example CMP-2026-10412) or the **mobile number** you gave when you made the complaint.', cards: [{ type: 'track-form' }], steps };
    const r = await call('track_complaint', id ? { complaint_id: id.toUpperCase().replace(/\s/g, '') } : { mobile });
    const list = r.card.list;
    if (!list.length) return { text: "I couldn't find a complaint with that number. Please check the number, or call the Complaint Office on **1092**.", cards: [{ type: 'contacts', ids: ['CON-002'] }], steps };
    const c = list[0];
    return { text: list.length === 1 ? `Your complaint **${c.id}** (${c.categoryLabel}) is at: **${c.status}**.\n\nLatest update: ${c.events.at(-1).note}` : `I found **${list.length} complaints** for this mobile number. The newest is **${c.id}** — ${c.status}.`, cards, steps };
  }

  const ctype = COMPLAINT_TYPES.find(c => c.re.test(t));
  if (RX.complaint.test(t) && !RX.fees.test(t) && !/how (do|can|to)|procedure/.test(t)) {
    await call('start_complaint', { category: ctype?.id || 'other', description: text });
    const emergency = ctype?.id === 'security' ? '\n\n**If this is an emergency, call the Security helpline 0800-34247 now.**' : '';
    return { text: `I'm sorry about this. I have started a **${(ctype?.label || 'service').toLowerCase()} complaint** for you. Please check the details and press **Continue** — it takes about one minute.${emergency}`, cards, steps };
  }

  const size = K.parseSize(t);
  const buildWords = /\b(build|building|construct\w*|tameer|banana|banane|banwana|naqsha|naksha)\b/.test(t);
  const askLimits = /\b(covered area|setbacks?|how much (can i|area|of the plot)|kitna (bana|cover)\w*|storeys?|floors?|height|open space)\b/.test(t);
  const askSteps = /\b(how (do|can|to)|steps?|process|procedure|start|kaise|tareeq\w*|guide|kya karna)\b/.test(t);
  const otherRule = /\b(basement|tahkhana|boundary wall|parapet|ramp|mumty|solar|fine|fines|jurmana|penalt\w*|without approval|complaint|neighbou?r)\b/.test(t);
  if (!otherRule && ((askLimits && (size || buildWords)) || (buildWords && askSteps && /\b(house|home|ghar|makan|plot|kothi)\b/.test(t)))) {
    const r = await call('get_building_rules', size ? { plot_size: `${size} sq yd` } : {});
    if (!size) return { text: 'Building a house in DHA takes **8 steps**, from taking possession and getting your drawings approved to the completion certificate and the water connection. Choose your plot size in the guide to see what you can build and what each step costs.', cards, steps };
    const d = r.data, lim = name => d.limits.find(x => x.rule.startsWith(name));
    const gf = lim('Ground floor'), front = lim('Front'), rear = lim('Rear'), h = lim('Maximum height'), st = lim('Maximum storeys');
    const gfText = gf && !/not readable/.test(gf.value)
      ? `cover up to **${gf.value.replace(/^(\d+)% of the plot, about (.*)$/, '$1%** of the plot on the ground floor (about $2, car porch included)')}${gf.confirm_with_dha ? ' (please confirm with DHA)' : ''}`
      : 'cover the share of the ground that Building Control allows (the Byelaws text is not readable for this size, so ask them)';
    return { text: `On a **${d.plot}** plot you can ${gfText}, build **${st?.value || 2} storeys** up to **${h?.value}**, and leave **${front.value.split(';')[0]}** open in front and **${rear.value}** at the back (DHA Byelaws clause ${d.bylaw_clause}).\n\nThere are 8 steps from possession to moving in. The guide shows each step with its fees for your plot size and the fines to avoid.`, cards, steps };
  }

  if (RX.market.test(t) && !/\b(transfer|fee|fees|charges|ndc|tax)\b/.test(t)) {
    const ph = t.match(/\b(?:phase|ph)[\s-]*(\d|vii|vi|iv|v|iii|ii|i)\b/)?.[1];
    const sec = text.match(/\bsector\s+([a-z][\w-]*)/i)?.[1];
    const sz = t.match(/\b(\d+(?:\.\d+)?)\s*(kanal|marla)\b/);
    const use = /\bcommercial\b/.test(t) ? 'commercial' : /\b(house|ghar|built)\b/.test(t) ? 'house' : /\bplot/.test(t) ? 'residential' : undefined;
    const args = { phase: ph, sector: sec, size: sz ? `${sz[1]} ${sz[2][0].toUpperCase()}${sz[2].slice(1)}` : undefined, use };
    if (!args.phase && !args.size) {
      return { text: 'DHA sells plots directly on the **DHA Marketplace**: choose a phase, size and budget, book with a token, and pay by instalments.\n\nTell me a phase and size (for example **10 Marla in Phase 2**) and I will show you the market price range.', cards: [{ type: 'plot-prices', rows: [], query: args }], steps };
    }
    const r = await call('lookup_plot_prices', args);
    const rows = r.card?.rows || [];
    if (!rows.length) return { text: 'I could not find a benchmark price for that. Try a phase and size, for example **1 Kanal in Phase 5**, or browse the plots DHA is selling.', cards: [{ type: 'plot-prices', rows: [], query: args }], steps };
    const mn = n => `Rs ${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    const lo = Math.min(...rows.map(x => x.min)), hi = Math.max(...rows.map(x => x.max));
    const what = [args.size, args.use === 'commercial' ? 'commercial plots' : args.use === 'house' ? 'houses' : 'plots', rows[0].phase_label && args.phase ? `in ${rows[0].phase_label}` : '', args.sector ? `Sector ${rows[0].sector}` : ''].filter(Boolean).join(' ');
    return { text: `According to DHA Property Exchange's price benchmark for **${r.card.period}**, ${what} cost between **${mn(lo)} and ${mn(hi)}**${rows.length > 1 ? ', depending on the sector and type' : ''}. These are market prices to guide you, not an official DHA price list.\n\nDHA's own plots for sale, with payment plans, are on the Marketplace.`, cards, steps };
  }

  if (RX.personal.test(t)) {
    await call('find_contacts', { topic: 'finance account statement' });
    return { text: 'Your dues, instalments and bills are in **My account**. Sign in to see them, or ask me "what are my dues?". The Finance Directorate can also help on the numbers below.', cards: [{ type: 'coming-soon' }, ...cards], steps };
  }

  if (RX.notices.test(t)) {
    await call('get_latest_notices', {});
    return { text: 'Here are the current DHA notices I know about.', cards, steps };
  }

  if (RX.contact.test(t) && !RX.fees.test(t)) {
    const topic = t.replace(RX.contact, ' ').replace(/\b(of|for|the|what|is|give|me|please|dha)\b/g, ' ').trim() || 'general enquiries';
    if (/emergency|fire|security/.test(t)) {
      cards.push({ type: 'contacts', ids: K.EMERGENCY_IDS });
      return { text: 'These numbers are for urgent help. **Security helpline 0800-34247** works 24 hours.', cards, steps };
    }
    const r = await call('find_contacts', { topic });
    if (!r.data.length) cards.push({ type: 'contacts', ids: ['CON-001', 'CON-002'] });
    return { text: r.data.length ? 'Here are the numbers you can call. Tap a number to call it.' : "I couldn't find a specific number for that, so here is the main DHA helpline.", cards, steps };
  }

  // Rules and permissions live in the Byelaws, not in the service catalogue.
  if (RX.policy.test(t) && !/\b(how (do|can|to) i (apply|get)|procedure|documents?)\b/.test(t)) {
    const fromDocs = await answerFromDocuments(text, call, steps, cards, { onTopic: true });
    if (fromDocs) return fromDocs;
  }

  // Knowledge questions: retrieve, then go deeper on the best service.
  const r = await call('search_knowledge', { query: text });
  const hits = K.search(text, { limit: 6 });
  // A gift, heirs or urgent case only fits when the question says so; a plain "transfer fee" is a normal transfer.
  const fitsCase = s => {
    const q = s.toLowerCase().match(QUALIFIER);
    return !q || q.some(w => t.includes(w));
  };
  const topFaq = hits.find(h => h.kind === 'faq');
  const topSvc = hits.find(h => h.kind === 'service' && fitsCase(h.ref.service_name)) || hits.find(h => h.kind === 'service');
  const topGloss = hits[0]?.kind === 'glossary' ? hits[0] : null;
  const sqyd = K.parseSize(text);

  if (topGloss && /what is|what does|meaning|matlab|stand for/.test(t)) {
    const g = topGloss.ref;
    return { text: `**${g.term}**${g.full_form ? ` (${g.full_form})` : ''}: ${g.meaning}`, cards, steps };
  }

  if (!topSvc && !topFaq) {
    const fromDocs = await answerFromDocuments(text, call, steps, cards);
    if (fromDocs) return fromDocs;
    return {
      text: "I'm sorry, I couldn't find this in DHA's published information. A DHA staff member can help — please call the helpline below, or try asking in a different way.",
      cards: [{ type: 'contacts', ids: ['CON-001', 'CON-002'] }],
      steps,
    };
  }

  // Only reuse an FAQ answer when it answers the same kind of question (fee vs time vs how-to).
  const svcScore = topSvc?.score || 0;
  const faqFits = topFaq && topFaq.score >= svcScore * 1.15 && questionKind(topFaq.ref.question) === questionKind(t)
    && fitsCase(topFaq.ref.question);
  const svcId = (faqFits && topFaq.ref.related_service_id) || topSvc?.id || topFaq?.ref.related_service_id;
  let svc = K.service(svcId);
  let answer = faqFits ? topFaq.ref.draft_answer : '';
  let feeLead = '';

  // For fee questions, prefer the service that actually carries the named fee.
  let focus = null;
  if (RX.fees.test(t)) {
    focus = svc ? focusFees(K.feesFor(svc.fee_ids), text) : { rows: [], narrowed: false };
    if (!focus.narrowed || !fitsCase(svc.service_name)) {
      const candidates = [...hits.filter(x => x.kind === 'service').map(x => x.ref), ...K.kb().services].filter(x => fitsCase(x.service_name));
      for (const ref of candidates) {
        const f = focusFees(K.feesFor(ref.fee_ids), text);
        if (f.narrowed) { svc = ref; focus = f; answer = ''; break; }
      }
    }
  }

  if (RX.forms.test(t)) {
    await call('find_forms', { query: text });
  }
  if (svc) await call('get_service_details', { service_id: svc.service_id });
  if (focus && svc) {
    const rows = focus.rows;
    cards.unshift({ type: 'fees', ids: rows.map(x => x.fee_id), sqyd, title: svc.service_name, serviceId: svc.service_id });
    steps.push({ label: `Matched ${rows.length} current fees from the Schedule of Charges (Dec 2022)` });
    onStep?.({ label: steps.at(-1).label, done: true });
    const hit = sqyd && rows.find(r => K.sizeMatches(r, sqyd));
    if (hit && !answer) answer = `For a plot of about **${sqyd} sq yd**, the ${K.feeLabel(hit).toLowerCase()} is **${K.feeAmount(hit)}**. Other charges for this service are listed below.`;
    else if (rows.length === 1 && !answer && rows[0].conditions && (rows[0].category.endsWith('_modifier') || rows[0].rate_basis === 'rule')) feeLead = `**${rows[0].conditions}.**\n\n`;
    else if (rows.length === 1 && !answer) feeLead =`The **${K.feeLabel(rows[0])}** fee is **${K.feeAmount(rows[0])}**${K.isUnconfirmed(rows[0].status) ? ' (please confirm with DHA)' : ''}.\n\n`;
  }

  if (!answer && svc) {
    const b = K.serviceBundle(svc.service_id);
    const bits = [];
    if (b.service.who_can_apply) bits.push(`**Who applies:** ${b.service.who_can_apply}`);
    if (b.service.physical_presence_required && b.service.physical_presence_required !== 'Unknown') bits.push(`**Do you need to go in person?** ${b.service.physical_presence_required}`);
    if (b.service.sla) bits.push(`**Time taken:** ${b.service.sla}`);
    if (b.steps.length) bits.push(`There are **${b.steps.length} steps** and **${b.documents.length} documents** — I've put them in a checklist below that you can print.`);
    else bits.push('DHA has not published the step-by-step procedure for this yet, so please call the office below before you visit.');
    answer = `${feeLead}Here is how **${svc.service_name.toLowerCase()}** works.\n\n${bits.join('\n')}`;
  }
  if (RX.fees.test(t) && svc && !sqyd && K.feesFor(svc.fee_ids).some(f => f.size_from || f.size_to)) {
    answer += '\n\nFees depend on plot size — choose your plot size in the fee box to see your amount.';
  }
  return { text: answer, cards, steps, sources: r.data.slice(0, 3) };
}

function questionKind(q) {
  q = q.toLowerCase();
  if (/\b(fees?|charges?|cost|how much|kitna|kitne|price|rates?|paise)\b/.test(q)) return 'fee';
  if (/\b(how long|kab|time|days|kitne din|when will)\b/.test(q)) return 'time';
  if (/\b(documents?|papers|kaghaz)\b/.test(q)) return 'docs';
  return 'general';
}

const GENERIC_FEE_WORDS = new Set(['fee', 'charge', 'cost', 'much', 'plot', 'kanal', 'marla', 'price', 'rate', 'amount', 'sq', 'yd', 'yard', 'house', 'kitna', 'kitne', 'paise', 'residential', 'normal']);

// Narrow a service's fee list to the fee the resident named (e.g. "membership fee").
function focusFees(rows, text) {
  const want = K.tokenize(text).filter(w => !GENERIC_FEE_WORDS.has(w) && !/^\d/.test(w));
  if (!want.length) return { rows, narrowed: false };
  const named = rows.filter(r => {
    const toks = new Set(K.tokenize(`${r.fee_name} ${r.category.replace(/_/g, ' ')}`));
    return want.some(w => toks.has(w));
  });
  return named.length ? { rows: named, narrowed: true } : { rows, narrowed: false };
}

export function pendingLabel(name, args) {
  if (name === 'get_my_account') return 'Reading your account…';
  if (name === 'get_my_complaints') return 'Checking your complaints…';
  if (name === 'get_my_applications') return 'Checking your applications in the membership portal…';
  return {
    search_knowledge: 'Searching DHA procedures and FAQs…',
    get_service_details: 'Reading the procedure, documents and fees…',
    search_documents: 'Searching the Byelaws and DHA documents…',
    lookup_fees: 'Checking the Schedule of Charges…',
    find_contacts: 'Finding the right office and phone number…',
    find_forms: 'Looking for the forms…',
    get_phase_info: 'Checking phase jurisdiction…',
    get_latest_notices: 'Reading latest notices…',
    start_complaint: 'Preparing your complaint…',
    track_complaint: 'Checking the complaint system…',
    lookup_plot_prices: 'Checking DHA plot prices…',
    get_building_rules: 'Reading the building rules and steps…',
  }[name] || `Running ${name}…`;
}

// Keep tool results valid JSON within a size budget by shortening the longest lists.
export function fitJson(data, limit = 9000) {
  let s = JSON.stringify(data);
  if (s.length <= limit) return s;
  const copy = Array.isArray(data) ? { items: [...data] } : { ...data };
  for (let i = 0; i < 20 && s.length > limit; i++) {
    const [key] = Object.entries(copy).filter(([, v]) => Array.isArray(v) && v.length > 1)
      .sort((a, b) => JSON.stringify(b[1]).length - JSON.stringify(a[1]).length)[0] || [];
    if (!key) break;
    copy[key] = copy[key].slice(0, Math.ceil(copy[key].length / 2));
    copy.note = 'Some lists were shortened; the full detail is shown to the resident on screen.';
    s = JSON.stringify(copy);
  }
  return s.length <= limit ? s : JSON.stringify({ note: 'Result too large', preview: s.slice(0, limit - 200) });
}

export function dedupeCards(cards) {
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    const key = c.type + ':' + (c.id || (c.ids || []).join(','));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  // Keep the screen calm: at most one card of each kind and four in total.
  const byType = new Map();
  for (const c of out) if (!byType.has(c.type)) byType.set(c.type, c);
  return [...byType.values()].slice(0, 4);
}

// ---------- Asking ----------

// One id per browser tab; the server keeps the live conversation history under it.
const SESSION_ID = (() => {
  try {
    let id = sessionStorage.getItem('dha-session');
    if (!id) sessionStorage.setItem('dha-session', id = crypto.randomUUID());
    return id;
  } catch { return crypto.randomUUID(); }
})();

export function resetSession() {
  fetch('/api/agent/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: SESSION_ID }) }).catch(() => {});
}

function declinedNote(declined) {
  if (!declined?.length) return '';
  const list = declined.map(d => `“${d.length > 80 ? d.slice(0, 80) + '…' : d}”`).join(', ');
  return `\n\nI have only answered the DHA part of your message. I can't help with ${list}.`;
}

const blockedReply = g => ({ text: g.message, cards: g.status === 'limited' ? [] : [{ type: 'quick-actions' }], steps: [], guard: g.status });

// Built-in answers: the server's guard still checks the message first (scope, injection, limits).
async function askSimulated(text, onStep) {
  let g = null;
  try {
    const res = await fetch('/api/guard', { method: 'POST', headers: { 'Content-Type': 'application/json', ...cnicHeader() }, body: JSON.stringify({ text }) });
    g = await res.json();
  } catch { /* the guard is unreachable: the rule-based agent cannot be misused, so carry on */ }
  if (g?.message) return { ...blockedReply(g), mode: 'simulated' };
  if (g?.answer) {
    for (const st of g.answer.steps) onStep?.({ label: st.label, done: true });
    return { ...g.answer, text: g.answer.text + declinedNote(g?.declined), mode: 'simulated' };
  }
  const r = await runSimulated(g?.question || text, onStep);
  return { ...r, text: r.text + declinedNote(g?.declined), mode: 'simulated' };
}

// Live AI: the whole loop runs on the server, which streams progress as one JSON object per line.
async function askLive(text, onStep) {
  const res = await fetch('/api/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...cnicHeader() }, body: JSON.stringify({ text, sessionId: SESSION_ID, lang: uiLang() }),
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `server error ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === 'step') onStep?.(ev);
      else if (ev.type === 'blocked') return { ...blockedReply(ev), mode: 'live' };
      else if (ev.type === 'result') return { ...ev, mode: 'live' };
      else if (ev.type === 'error') throw new Error(ev.message);
      else if (ev.type === 'fallback') {
        onStep?.({ label: 'Using built-in answers instead', done: true, warn: true });
        const r = await runSimulated(ev.question, onStep);
        return { ...r, text: r.text + declinedNote(ev.declined), mode: 'simulated', fallback: ev.reason, fallbackNote: 'The AI answer did not pass our checks, so this answer uses built-in information.' };
      }
    }
  }
  throw new Error('the server closed the connection');
}

export async function ask(text, history, settings, onStep) {
  if (settings.mode === 'live') {
    try {
      return await askLive(text, onStep);
    } catch (e) {
      onStep?.({ label: `AI service unavailable — using built-in answers (${e.message})`, done: true, warn: true });
      return { ...(await askSimulated(text, onStep)), fallback: e.message };
    }
  }
  return askSimulated(text, onStep);
}
