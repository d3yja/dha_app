// Builds data/cms_templates.json, the prototype complaint template, from samples/Complaints.csv.
//   node pipeline/build_cms_templates.js
// The template is a stand-in until the real CMS publishes its own (GET /taxonomy). It holds:
//   - the common fields every complaint carries, and where the app fills them from
//   - 8 template groups, each with the extra questions it asks and its rules
//   - all sub-categories seen in the CSV, with group, volume, paid flag and median resolution time
//   - a small word model (naive Bayes over descriptions + hand-written keywords) to classify free text

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSV = path.join(ROOT, 'samples', 'Complaints.csv');
const OUT = path.join(ROOT, 'data', 'cms_templates.json');

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const COMMON_FIELDS = [
  { field: 'category', source: 'classification', label: 'Category' },
  { field: 'sub_category', source: 'classification', label: 'Problem type' },
  { field: 'description', source: 'resident', label: 'What is happening' },
  { field: 'complaint_type', source: 'intent', label: 'Complaint, suggestion or report' },
  { field: 'request_source', source: 'channel', label: 'Channel' },
  { field: 'member_cnic', source: 'profile', label: 'CNIC' },
  { field: 'membership_no', source: 'profile', label: 'Membership number' },
  { field: 'member_name', source: 'profile', label: 'Name' },
  { field: 'membership_type', source: 'profile', label: 'Membership type' },
  { field: 'membership_status', source: 'profile', label: 'Membership status' },
  { field: 'phase', source: 'profile', label: 'Phase' },
  { field: 'sector', source: 'profile', label: 'Sector' },
  { field: 'street', source: 'profile', label: 'Street' },
  { field: 'house', source: 'profile', label: 'House' },
  { field: 'lat_approx', source: 'profile', label: 'Latitude' },
  { field: 'lng_approx', source: 'profile', label: 'Longitude' },
  { field: 'followup_name', source: 'profile', label: 'Contact name' },
  { field: 'followup_cell', source: 'profile', label: 'Contact mobile' },
  { field: 'priority', source: 'group', label: 'Priority' },
  { field: 'is_paid', source: 'payment', label: 'Paid' },
];

// Questions are asked only when the answer is not already in the resident's words or profile.
const GROUPS = {
  home_visit: {
    label: 'Home service visit', priority: 0,
    questions: [
      { id: 'visit_time', ask: 'When is someone at home for the visit?', type: 'choice',
        options: ['Morning (9 to 12)', 'Afternoon (12 to 4)', 'Evening (4 to 8)', 'Any time today'] },
    ],
    rules: ['A confirmed visit time reduces "Cancel/Not at Home".'],
  },
  paid_delivery: {
    label: 'Paid delivery', priority: 0,
    questions: [],
    rules: ['Water Bowzer: one order per 48 hours; paid service.', 'Garbage Bags: asks which month was missed.'],
  },
  outside: {
    label: 'Outside the house', priority: 0,
    questions: [
      { id: 'spot', ask: 'Where exactly is it?', type: 'choice',
        options: ['In front of my house', 'On the street', 'In an empty plot nearby', 'In the park or green area'], allowText: true },
    ],
    rules: ['Location defaults to the resident\'s home; the resident can describe another spot.'],
  },
  outage: {
    label: 'Supply outage', priority: 0,
    questions: [
      { id: 'since', ask: 'Since when?', type: 'choice', options: ['Less than an hour', 'A few hours', 'Since yesterday', 'More than a day'] },
      { id: 'extent', ask: 'Is it the whole house, or are neighbours also affected?', type: 'choice',
        options: ['Only part of my house', 'My whole house', 'Neighbours too'] },
    ],
    rules: ['Before submitting, checks for an open complaint of the same type in the same street.'],
  },
  safety: {
    label: 'Safety emergency', priority: 1,
    questions: [
      { id: 'where_inside', ask: 'Is it inside or outside the house?', type: 'choice', options: ['Inside the house', 'Outside the house'] },
    ],
    rules: ['Safety advice and emergency numbers first; priority urgent; minimum questions.'],
  },
  billing: {
    label: 'Billing', priority: 0,
    questions: [
      { id: 'bill_month', ask: 'Which month\'s bill is it about?', type: 'choice', options: ['This month', 'Last month', 'Older'], allowText: true },
      { id: 'payment_ref', ask: 'If you have already paid, what is the payment reference? (write "none" if not paid)', type: 'text' },
    ],
    rules: ['Bill lookup offered first; consumer ID from the profile.'],
  },
  report_others: {
    label: 'Report about others', priority: 0,
    questions: [
      { id: 'happening_now', ask: 'Is it happening right now?', type: 'choice', options: ['Yes, right now', 'No, it happened earlier'] },
      { id: 'spot', ask: 'Where is it?', type: 'choice', options: ['Next to my house', 'On my street', 'Elsewhere in the sector'], allowText: true },
    ],
    rules: ['Ongoing security issue: security control room number shown.'],
  },
  general: {
    label: 'General or suggestion', priority: 0,
    questions: [],
    rules: ['Knowledge-base answer offered first; otherwise routed as written.'],
  },
};

const GROUP_OF = {
  'Plumbing|Plumber': 'home_visit', 'Plumbing|Geyser': 'home_visit', 'Plumbing|Pipe Fitter': 'home_visit',
  'Plumbing|Motor Fitting/Repairing': 'home_visit', 'Plumbing|Gas Heater': 'home_visit', 'Electricity|Electrician': 'home_visit',
  'Electricity|AC  Technician': 'home_visit', 'Service and Maintenance|Carpenter': 'home_visit', 'Sanitation|Sanitary Worker': 'home_visit',
  'Electricity|Electricity Out of Order': 'outage', 'Electricity|Phase Missing': 'outage', 'Electricity|Fluctuation': 'outage',
  'Electricity|Loose Connection': 'outage', 'Electricity|Meter Connection': 'outage', 'Community Services|Shortage Of Water Supply': 'outage',
  'Water Supply|Dirty Water': 'outage', 'Water Supply|Dusty Water': 'outage', 'Water Supply|Rusty Water': 'outage',
  'SUI Gas|Low Pressure': 'outage', 'TV & Internet|Low Pressure': 'outage',
  'Plumbing|Leakage Complaints': 'safety', 'SUI Gas|Leakage Complaints': 'safety', 'Electricity|Short Circuit': 'safety',
  'Electricity|DB / Tranformer Door Open': 'safety', 'IT & Telecom Svcs|Manhole Covers': 'safety',
  'Service and Maintenance|Sewerage Man hole damage': 'safety', 'Service and Maintenance|Water Man hole cover missing': 'safety',
  'Service and Maintenance|Water man hole damage': 'safety', 'IT & Telecom Svcs|Overhead Cable': 'safety', 'Utility Bills|Leakage Complaints': 'safety',
  'Water Bowzer|Water Bowzer': 'paid_delivery', 'Garbage|Garbage Bags': 'paid_delivery',
  'Utility Bills|Bill Not Received': 'billing', 'Utility Bills|Bill Not Available on Inet/1Bill': 'billing',
  'Utility Bills|Bill Not Available on Website/Member Portal': 'billing', 'Utility Bills|Bill Already Paid': 'billing',
  'Utility Bills|Wrong Bill': 'billing', 'Utility Bills|Wrong Arrears': 'billing', 'Utility Bills|Excess Amount': 'billing',
  'Utility Bills|SMS not Received': 'billing',
  'Security|Suspected Activity': 'report_others', 'Security|Loudspeaker Party at Home': 'report_others', 'Security|Resident Behaviour': 'report_others',
  'Building Control|Irregularity in House Construction': 'report_others', 'Traffic|Rash Driving': 'report_others',
  'Community Services|Price Control (Over Pricing)': 'report_others',
  'Other|Others': 'general', 'DHAI Main Office|General Complaints': 'general', 'Community Services|Inhouse Community Svcs Obsns': 'general',
  'IT & Telecom Svcs|Mobile App Issue': 'general', 'Security|Etag': 'general', 'Schools|DHAI-R APS&C Sec B,Ph-I': 'general',
  'Security|Security Pass Processing': 'general', 'IT & Telecom Svcs|DB Shift': 'general', 'Building Control|CGI Sheets': 'general',
  'Town Planning|Survey/Surveyor': 'general',
};

// Resident wording differs from the call-center shorthand in the CSV ("PLUMBER REQ"), so the model also gets
// hand-written keywords in English and Roman Urdu, counted as if each appeared in several descriptions.
const KEYWORDS = {
  'Plumbing|Plumber': 'plumber plumbing tap nalka leak leaking pipe flush commode sink basin drain blocked choke washroom bathroom toilet kitchen pani tanki tank overflow',
  'Plumbing|Geyser': 'geyser gizer geezer garam hot water heater pilot',
  'Plumbing|Leakage Complaints': 'gas leak leakage smell boo',
  'SUI Gas|Leakage Complaints': 'gas leak leakage smell sui',
  'SUI Gas|Low Pressure': 'gas pressure low slow nahi aa',
  'Electricity|Electrician': 'electrician switch socket fan light bulb wiring board breaker trip mcb',
  'Electricity|Electricity Out of Order': 'electricity bijli light gone power outage supply off nahi',
  'Electricity|Phase Missing': 'phase missing one phase single',
  'Electricity|Fluctuation': 'fluctuation voltage up down flicker',
  'Electricity|Short Circuit': 'short circuit spark sparking fire burning smoke',
  'Electricity|Street Light': 'street light streetlight pole lamp dark andhera',
  'Electricity|DB / Tranformer Door Open': 'transformer db box door open wires exposed',
  'Water Bowzer|Water Bowzer': 'bowzer bowser tanker water tanker wb',
  'Community Services|Shortage Of Water Supply': 'water supply no water pani nahi shortage low',
  'Community Services|Cleanliness': 'clean cleanliness dirty kachra safai',
  'Water Supply|Dirty Water': 'dirty water ganda smelly muddy',
  'Service and Maintenance|Carpenter': 'carpenter door lock window wood cupboard hinge',
  'Sanitation|Sanitary Worker': 'sanitary worker sweeper gutter',
  'Sanitation|Outdoor Sewerage Line': 'sewerage sewer manhole overflow gutter street drain blocked outside',
  'Garbage|Garbage Bags': 'garbage bags shopper bag bags not delivered',
  'Garbage|Garbage Collection': 'garbage collection kachra utha uthaya pick lifted trash collected',
  'Horticulture|Actions Wild Growth Cutting': 'wild growth grass jhariyan bushes empty plot cutting',
  'Horticulture|Tree Trimming': 'tree trimming branches branch darakht',
  'Roads & Streets|Road Cleaning': 'road cleaning street sweeping dust',
  'Roads & Streets|Damaged Road': 'road damaged pothole potholes broken road gadha gaddha khadda',
  'Dengue|Dengue Spray': 'dengue spray mosquito mosquitoes machar machhar fogging',
  'Stray Animals|Stray Dogs/Cats': 'stray dog dogs cat cats kutte kutta bite bit',
  'Utility Bills|Bill Not Received': 'bill bills received aya mila',
  'Utility Bills|Bill Already Paid': 'already paid bill paid again',
  'Utility Bills|Wrong Bill': 'wrong bill incorrect',
  'Security|Suspected Activity': 'suspicious suspect thief chor stranger',
  'Security|Loudspeaker Party at Home': 'loud music loudspeaker noise party',
  'Building Control|Irregularity in House Construction': 'construction illegal irregular building neighbour construction',
};
const KEYWORD_WEIGHT = 20;
// Priors from the export are raised to this power: call volume says little about one resident's words.
const PRIOR_ALPHA = 0.5;

const STOP = new Set('the a an is are in of to for and or at on from by with this that it its be have has please kindly sir req required require request issue problem urgent asap house home ghar mera meri hai ha hy ka ki ke ko se main mein ma me kar karna krna krni karni hain not working work chal raha rahi rahe hua gaya kharab chahiye'.split(' '));
const tokens = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));

const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
const subs = new Map();
for (const r of rows) {
  const key = `${r.category}|${r.sub_category}`;
  if (!subs.has(key)) subs.set(key, { rows: [] });
  subs.get(key).rows.push(r);
}

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Naive Bayes counts per sub-category (Laplace smoothing applied at classification time).
const vocab = new Map();
const subcats = [];
for (const [key, { rows: rs }] of subs) {
  const [category, sub_category] = key.split('|');
  const counts = {};
  let total = 0;
  for (const r of rs) for (const t of new Set(tokens(r.description))) { counts[t] = (counts[t] || 0) + 1; total++; }
  for (const t of tokens(KEYWORDS[key])) { counts[t] = (counts[t] || 0) + KEYWORD_WEIGHT; total += KEYWORD_WEIGHT; }
  for (const t of Object.keys(counts)) vocab.set(t, (vocab.get(t) || 0) + counts[t]);
  const hours = rs.map(r => parseFloat(r.resolution_time_hours)).filter(Number.isFinite);
  subcats.push({
    key, category, sub_category,
    group: GROUP_OF[key] || 'outside',
    count: rs.length,
    share_pct: Math.round(1000 * rs.length / rows.length) / 10,
    paid: rs.filter(r => r.is_paid === '1').length > rs.length / 2,
    median_resolution_hours: hours.length ? Math.round(median(hours) * 10) / 10 : null,
    p90_resolution_hours: hours.length ? Math.round([...hours].sort((a, b) => a - b)[Math.floor(hours.length * 0.9)] * 10) / 10 : null,
    examples: [...new Set(rs.map(r => r.description.trim()).filter(d => d.length > 12 && !/\[number removed\]|test/i.test(d)))].slice(0, 3),
    model: { total, counts },
  });
}
// Keep words seen at least twice overall, so the file stays small.
for (const s of subcats) {
  for (const t of Object.keys(s.model.counts)) if ((vocab.get(t) || 0) < 2) { s.model.total -= s.model.counts[t]; delete s.model.counts[t]; }
}
subcats.sort((a, b) => b.count - a.count);

const groups = Object.fromEntries(Object.entries(GROUPS).map(([id, g]) => {
  const members = subcats.filter(s => s.group === id);
  return [id, { ...g, share_pct: Math.round(10 * members.reduce((n, s) => n + s.share_pct, 0)) / 10, sub_categories: members.length }];
}));

const out = {
  version: 1,
  source: 'samples/Complaints.csv',
  built_at: new Date().toISOString(),
  complaints: rows.length,
  period: { from: rows.map(r => r.complaint_date).sort()[0], to: rows.map(r => r.complaint_date).sort().at(-1) },
  statuses: ['Submitted', 'In Process', 'Pending', 'Resolved', 'Closed', 'Cancel', 'Cancel/Not at Home', 'Reopen'],
  common_fields: COMMON_FIELDS,
  groups,
  sub_categories: subcats,
  model: { vocab_size: [...vocab.keys()].filter(t => vocab.get(t) >= 2).length, prior_total: rows.length, prior_alpha: PRIOR_ALPHA, stop: [...STOP] },
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}: ${subcats.length} sub-categories, ${Object.keys(groups).length} groups, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
for (const [id, g] of Object.entries(groups)) console.log(`  ${id.padEnd(14)} ${String(g.sub_categories).padStart(3)} sub-categories  ${g.share_pct}%`);
