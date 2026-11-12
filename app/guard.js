// Input and output guards for the helpdesk agent (OWASP LLM01 prompt injection, LLM10 unbounded use).
//
// Input, in order:
//   1. limits      per-IP rate limit and message length
//   2. split       a message is cut into its separate requests ("...? also write code")
//   3. rules       known injection phrasings, fake role tags, encoded payloads (English and Roman Urdu)
//   4. classifier  Meta Prompt Guard 2 (22M) on the model server, /v1/classify
//   5. scope       each part is compared by meaning (BGE-M3) with in-scope and out-of-scope examples
// Any attack signal blocks the whole message. Off-topic parts are declined, the DHA part is answered.
//
// Output (live AI answers): no code, no unknown links, every phone number and rupee amount must
// appear in this turn's tool data, cited ids must be real, and the system prompt must not leak.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXAMPLES_FILE = path.join(__dirname, 'guard', 'scope_examples.json');
const MAX_CHARS = 500;
const ATTACK_THRESHOLD = 0.8;

// ---------- 1. Limits ----------

const LIMITS = { perMinute: 10, perDay: 150 };
const hits = new Map(); // ip -> timestamps (ms)

function rateLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 864e5);
  const lastMinute = list.filter(t => now - t < 6e4).length;
  if (lastMinute >= LIMITS.perMinute) return 'You are sending messages very quickly. Please wait a minute and try again.';
  if (list.length >= LIMITS.perDay) return 'You have reached today\'s limit for questions. Please call the DHA helpline on 051-111-555-400.';
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return null;
}

// ---------- 2. Split a message into its requests ----------

const IMPERATIVE = 'write|tell|give|make|create|explain|translate|solve|generate|ignore|forget|pretend|act|show|list|calculate|code|draw|compose|sing|summari[sz]e|likh|likho|batao|bata|sunao|banao';
const SPLIT = new RegExp(`(?:[?!;\\n]+|\\.(?=\\s|$)|\\b(?:also|and also|plus|btw|by the way|then|saath hi|sath hi)\\b|\\b(?:and|aur|or)\\s+(?=(?:${IMPERATIVE})\\b))`, 'i');

function splitIntents(text) {
  const parts = text.split(SPLIT).map(s => s.replace(/^[\s,:-]+|[\s,:-]+$/g, '')).filter(Boolean);
  const out = [];
  for (const p of parts) {
    // Fragments of one or two words ("ok", "10 marla") belong to the part before them.
    if (out.length && p.split(/\s+/).length <= 2 && !new RegExp(`^(${IMPERATIVE})\\b`, 'i').test(p)) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.length ? out : [text.trim()];
}

// ---------- 3. Attack rules ----------

const ATTACK_RULES = [
  [/\b(ignore|disregard|forget|override|bypass)\b.{0,30}\b(previous|prior|above|earlier|your|system|these)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?|directions?|restrictions?)/i, 'override instructions'],
  [/\b(system|hidden|initial|original|developer)\s*(prompt|message|instructions?)\b/i, 'asks for system prompt'],
  [/\b(reveal|show|print|repeat|output|leak|display|tell me)\b.{0,30}\b(your|system|hidden|initial|secret)\s+(prompt|instructions|rules|configuration)\b|\bapi[ -]?keys?\b/i, 'asks for secrets'],
  // Not "act as": residents ask whether a relative can act as their attorney.
  [/\b(you are now|from now on,? you|pretend (to be|you are|you're)|roleplay|role-play|simulate being|you're no longer|imagine you are)\b/i, 'role change'],
  [/\b(DAN|jailbreak|developer mode|god mode|do anything now|no (rules|restrictions|filters|limits))\b/i, 'jailbreak keyword'],
  [/<\/?\s*(system|assistant|user|tool|instructions?|im_start|im_end)\s*>|\[\/?(INST|SYS)\]|<\|[a-z_]+\|>|^\s*(system|assistant)\s*:/im, 'fake role tags'],
  [/\b(hidayat|hidayaat|instructions?|rules?|qawaid)\b.{0,30}\b(bhool|bhul|bhoolo|bhool jao|chhor|chor do|ignore karo|nazar andaz)/i, 'override instructions (Roman Urdu)'],
  [/\b(system prompt|apni hidayat|apne rules|api key)\b.{0,30}\b(batao|bata do|dikhao|likho)/i, 'asks for secrets (Roman Urdu)'],
  [/[A-Za-z0-9+/]{60,}={0,2}/, 'encoded payload'],
  [/(.{3,20})\1{8,}/, 'repetition flood'],
];

function attackRules(text) {
  return ATTACK_RULES.filter(([re]) => re.test(text)).map(([, why]) => why);
}

// ---------- Helpers ----------

async function postJson(url, body, apiKey, timeoutMs = 20000) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || json.error || `HTTP ${res.status}`);
  return json;
}

const norm = v => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return Float32Array.from(v, x => x / n);
};
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const topMean = (arr, k = 3) => arr.sort((a, b) => b - a).slice(0, k).reduce((s, x) => s + x, 0) / Math.min(k, arr.length);

// ---------- 5. Scope router ----------

// Words that only make sense in a DHA conversation, and words that mark a general-purpose request.
const DHA_TERMS = /\b(dha|plot|plots|house|ghar|makan|kanal|marla|sq ?yd|transfer|allotment|ndc|membership|member|phase|sector|byelaws?|bylaws?|fee|fees|charges|dues|bill|bills|installment|instalment|complaint|shikayat|water|pani|bijli|electricity|sewerage|gutter|garbage|kachra|street ?light|security|e-?tag|sticker|pass|tenant|kiraye?|rent|basement|boundary|construction|naqsha|drawing|map approval|possession|affidavit|stamp paper|gift|hiba|heirs?|valley|form|notice|surcharge|helpline|contractor|architect|mosquito|dengue|park|road)\b/i;
const OUT_MARKERS = /\b(code|coding|python|javascript|java|c\+\+|html|sql|program|function|algorithm|bubble sort|essay|poem|poetry|story|joke|lateefa|lyrics|song|recipe|biryani|homework|equation|maths?|physics|chemistry|cricket|football|movie|film|weather|mausam|bitcoin|crypto|stocks?|forex|politic\w*|election|vote|religio\w*|girlfriend|boyfriend|hack\w*|bomb|weapon|passport|nadra|bahria|translate|summari[sz]e|cv|resume)\b/i;

const CREATE_REQUEST = /\b(write|likh\w*|compose|generate|create|make|banao|sunao)\b.{0,25}\b(code|program|script|function|poem|poetry|nazm|essay|story|kahani|joke|lateefa|song|lyrics|rap)\b/i;

class ScopeRouter {
  constructor(storeDir) {
    this.cacheFile = path.join(storeDir, 'scope_vectors.json');
    this.examples = null;
    this.ready = false;
    this.error = '';
  }

  async init(embedCfg) {
    try {
      const ex = JSON.parse(fs.readFileSync(EXAMPLES_FILE, 'utf8'));
      const texts = [...ex.in_scope, ...ex.out_of_scope];
      const key = crypto.createHash('sha1').update(`${embedCfg.model}\n${texts.join('\n')}`).digest('hex');
      let cache = null;
      try { cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); } catch { /* none yet */ }
      let vecs;
      if (cache?.key === key) vecs = cache.vectors;
      else {
        vecs = [];
        for (let i = 0; i < texts.length; i += 16) {
          const json = await postJson(`${embedCfg.baseUrl}/embeddings`, { input: texts.slice(i, i + 16), model: embedCfg.model }, embedCfg.apiKey, 120000);
          vecs.push(...json.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
        }
        fs.writeFileSync(this.cacheFile, JSON.stringify({ key, vectors: vecs }));
      }
      vecs = vecs.map(norm);
      this.examples = {
        in: vecs.slice(0, ex.in_scope.length),
        out: vecs.slice(ex.in_scope.length),
      };
      this.cfg = embedCfg;
      this.ready = true;
      this.error = '';
    } catch (e) {
      this.ready = false;
      this.error = e.message;
    }
  }

  // Returns one verdict per part: { text, scope: 'in' | 'out', margin, why }
  async classify(parts) {
    let vecs = null;
    if (this.ready) {
      try {
        const json = await postJson(`${this.cfg.baseUrl}/embeddings`, { input: parts, model: this.cfg.model }, this.cfg.apiKey);
        vecs = json.data.sort((a, b) => a.index - b.index).map(d => norm(d.embedding));
      } catch { /* fall back to word lists */ }
    }
    return parts.map((text, i) => {
      const dha = DHA_TERMS.test(text);
      const off = OUT_MARKERS.test(text);
      if (!vecs) return { text, scope: CREATE_REQUEST.test(text) || (off && !dha) ? 'out' : 'in', margin: null, why: 'word lists only' };
      const sIn = topMean(this.examples.in.map(v => dot(v, vecs[i])));
      const sOut = topMean(this.examples.out.map(v => dot(v, vecs[i])));
      const margin = Number((sIn - sOut).toFixed(3));
      let scope;
      if (CREATE_REQUEST.test(text)) scope = 'out'; // "write a poem about my house" mentions a DHA word but is not a DHA question
      else if (off && !dha) scope = margin > 0.08 ? 'in' : 'out';
      else if (dha) scope = margin > -0.08 ? 'in' : 'out';
      else scope = margin >= 0 ? 'in' : 'out';
      return { text, scope, margin, why: `meaning ${margin >= 0 ? '+' : ''}${margin}${dha ? ', DHA words' : ''}${off ? ', off-topic words' : ''}` };
    });
  }
}

// ---------- Input guard ----------

const REFUSAL = 'I can only help with DHA Islamabad-Rawalpindi matters: procedures, fees, forms, rules, phone numbers and complaints.\n\nWhat would you like to know about DHA?';

class Guard {
  constructor({ storeDir, modelsUrl }) {
    this.router = new ScopeRouter(storeDir);
    this.modelsUrl = modelsUrl;
    this.log = [];
  }

  init(embedCfg) { return this.router.init(embedCfg); }

  async classifier(texts) {
    try {
      const json = await postJson(`${this.modelsUrl}/classify`, { input: texts }, '', 10000);
      return json.data.sort((a, b) => a.index - b.index).map(d => d.malicious);
    } catch {
      return null;
    }
  }

  // -> { status: 'ok' | 'partial' | 'off_topic' | 'attack' | 'limited', question, declined, message, checks }
  async checkInput(text, ip) {
    const checks = [];
    const limited = rateLimit(ip || 'local');
    if (limited) return { status: 'limited', message: limited, declined: [], checks: ['rate limit'] };
    text = String(text || '').replace(/[\u0000-\u0008\u000b-\u001f​-‏‪-‮⁦-⁩]/g, '').trim();
    if (!text) return { status: 'off_topic', message: REFUSAL, declined: [], checks };
    if (text.length > MAX_CHARS) {
      return { status: 'limited', message: `Please ask in a shorter message (under ${MAX_CHARS} letters). One question at a time works best.`, declined: [], checks: ['too long'] };
    }

    const parts = splitIntents(text);
    const rules = attackRules(text);
    const scores = await this.classifier([text, ...(parts.length > 1 ? parts : [])]);
    const maxScore = scores ? Math.max(...scores) : null;
    checks.push(`split into ${parts.length} part${parts.length === 1 ? '' : 's'}`);
    checks.push(rules.length ? `rules: ${rules.join(', ')}` : 'rules: clean');
    checks.push(scores ? `Prompt Guard: ${maxScore.toFixed(3)}` : 'Prompt Guard: unavailable');
    // Prompt Guard alone over-flags harmless DHA wording ("show me the instructions for the transfer form"),
    // so without a rule hit it blocks a DHA-worded message only when it is nearly certain.
    const classifierAttack = (maxScore ?? 0) >= (DHA_TERMS.test(text) ? 0.999 : ATTACK_THRESHOLD);
    if (rules.length || classifierAttack) {
      this.record({ text, status: 'attack', rules, maxScore });
      return { status: 'attack', message: REFUSAL, declined: [], checks };
    }

    const verdicts = await this.router.classify(parts);
    checks.push(...verdicts.map(v => `“${v.text.slice(0, 50)}” → ${v.scope} (${v.why})`));
    const inParts = verdicts.filter(v => v.scope === 'in').map(v => v.text);
    const declined = verdicts.filter(v => v.scope === 'out').map(v => v.text);
    const status = !inParts.length ? 'off_topic' : declined.length ? 'partial' : 'ok';
    if (status !== 'ok') this.record({ text, status, declined });
    return {
      status,
      question: inParts.join('. ').replace(/\.\s*\./g, '.'),
      declined,
      message: status === 'off_topic' ? REFUSAL : null,
      checks,
    };
  }

  record(entry) {
    this.log.push({ at: new Date().toISOString(), ...entry });
    if (this.log.length > 200) this.log.shift();
    console.log(`[guard] ${entry.status}: ${JSON.stringify(entry).slice(0, 300)}`);
  }
}

function declinedNote(declined) {
  if (!declined?.length) return '';
  const list = declined.map(d => `“${d.length > 80 ? d.slice(0, 80) + '…' : d}”`).join(', ');
  return `\n\nI have only answered the DHA part of your message. I can't help with ${list}.`;
}

// ---------- Output guard ----------

const ALLOWED_HOSTS = /(^|\.)dhai-r\.com\.pk$|(^|\.)dhai\.com\.pk$/i;
const KNOWN_NUMBERS = ['051111555400', '080034247', '03235013000', '1092'];
const digits = s => s.replace(/\D/g, '');

// Typography the model may use: non-breaking hyphens and spaces would hide numbers from the checks.
const plainText = s => s.replace(/[‐-―−﹘﹣－]/g, '-').replace(/[    ]/g, ' ');
// Plot-size conversions the model may state without looking them up (5 marla = 125 sq yd … 4 kanal).
const SIZE_NUMBERS = new Set(['125', '250', '500', '1000', '2000', '20']);
const PLOT_UNITS = new Set(['1', '2', '4', '5', '8', '10', '20']); // "1 kanal", "10 marla"…

// evidence: every tool result of this turn as text; ids: every id seen in those results;
// question: the resident's own words (numbers they gave may be repeated back).
function checkOutput(rawAnswer, citations, evidence, ids, canary, question = '') {
  const answer = plainText(rawAnswer);
  evidence = plainText(evidence);
  const problems = [];
  if (/```|^\s*(def |class \w+[:(]|import \w|from \w+ import|function \w+\s*\(|#include|public static|console\.log|print\()/m.test(answer)) problems.push('contains code');
  if (canary && answer.includes(canary)) problems.push('repeats the internal reference');
  if (/resident_question|tool_data|final_answer|system prompt|my instructions|\b(search_knowledge|get_service_details|search_documents|lookup_fees|find_contacts|find_forms|get_phase_info|get_latest_notices|start_complaint|track_complaint|lookup_plot_prices|get_building_rules|get_my_account|get_my_applications|get_my_complaints)\b/i.test(answer)) problems.push('talks about its own instructions or tools');
  // Some models slip into another script mid-answer (Qwen: "pay订单s"). Residents read English or Urdu only.
  if (/[぀-ヿ㐀-鿿가-힯Ѐ-ӿ]/.test(answer)) problems.push('contains words in another language');
  // A long answer that stops mid-word or mid-sentence was cut off; ask again rather than show half a sentence.
  // An Urdu answer often ends on an English name in a list ("… CNIC"), so there only a dangling comma, bracket or dash counts.
  const urduAnswer = /[؀-ۿ]/.test(answer);
  if (answer.length > 200 && (urduAnswer ? /[,،(\-–—]\s*$/ : /[a-z,(\-–—]\s*$/i).test(answer.trim()) && !/[.!?:)*]\s*$/.test(answer.trim())) problems.push('the answer stops mid-sentence; finish it');

  for (const m of answer.matchAll(/https?:\/\/([^\s/)]+)[^\s)]*/gi)) {
    if (!ALLOWED_HOSTS.test(m[1]) && !evidence.includes(m[0])) problems.push(`link not from DHA data (${m[1]})`);
  }

  // Grounding: every phone number, rupee amount, measured quantity and clause number must be in tool data.
  const evDigits = evidence.replace(/(\d)[\s,-]+(?=\d)/g, '$1');
  const evNumbers = new Set([...evidence.replace(/(\d),(?=\d{3})/g, '$1').matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]));
  const qNumbers = new Set([...plainText(question).matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]));
  let rest = answer;
  let checked = 0;
  for (const m of answer.matchAll(/(?:\+92[\s-]?|\b0)\d{2,4}(?:[\s-]?\d{2,5}){1,3}\b|\b\d{3}(?:[\s-]\d{3}){2,3}\b/g)) {
    const d = digits(m[0]).replace(/^92/, '0');
    if (d.length < 7) continue;
    rest = rest.replace(m[0], ' ');
    checked++;
    if (!KNOWN_NUMBERS.includes(d) && !evDigits.includes(d)) problems.push(`phone number not in DHA data (${m[0]})`);
  }
  for (const m of rest.matchAll(/\bRs\.?\s*([\d,]+(?:\.\d+)?)/gi)) {
    const d = m[1].replace(/,/g, '');
    checked++;
    if (!evNumbers.has(d)) problems.push(`amount not in DHA data (Rs ${m[1]})`);
  }
  for (const m of rest.matchAll(/\b(\d{1,2}(?:\.\d{1,3}){1,4})\b(?!\s*(?:m|ft|feet|%))/g)) {
    if (!/clause|section|byelaw|bylaw|regulation/i.test(rest.slice(Math.max(0, m.index - 25), m.index))) continue;
    checked++;
    if (!evidence.includes(m[1])) problems.push(`clause not in DHA data (${m[1]})`);
  }
  for (const m of rest.matchAll(/(\d+(?:\.\d+)?)\s*(?:working\s+)?(?:days?|hours?|hrs|weeks?|months?|years?|ft|feet|foot|metres?|meters?|%|percent|marlas?|kanals?|sq\.?\s?(?:yds?|yards?)|square\s+yards?)\b/gi)) {
    const n = m[1];
    checked++;
    const plotSize = /marla|kanal/i.test(m[0]) && PLOT_UNITS.has(n);
    if (!evNumbers.has(n) && !qNumbers.has(n) && !SIZE_NUMBERS.has(n) && !plotSize) problems.push(`"${m[0]}" not in DHA data`);
  }

  // Citations are optional, but the ones given must be real (an invented id is a sign of invented facts).
  const list = (Array.isArray(citations) ? citations : []).map(String);
  const valid = [...new Set(list.flatMap(c => (ids.has(c) ? [c] : [...ids].filter(id => id.length >= 3 && c.includes(id)))))];
  if (list.length && !valid.length && checked) problems.push(`cites ids that were never looked up (${list.slice(0, 3).join(', ')})`);
  if (answer.length > 2500) problems.push('answer too long');
  return { ok: !problems.length, problems, citations: valid, checked };
}

module.exports = { Guard, checkOutput, declinedNote, splitIntents, attackRules, REFUSAL, LIMITS };
