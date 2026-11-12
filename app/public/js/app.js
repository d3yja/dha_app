import * as K from './kb.js';
import { ask, resetSession, COMPLAINT_TYPES } from './agent.js';
import * as P from './portal.js';
import * as B from './build.js';
import * as DM from './demo.js';
import * as I from './i18n.js';

// ---------- Icons (Lucide-style strokes) ----------

const ICONS = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  list: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  back: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  settings: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10.7l-5.8 1.9L12 18.4l-1.9-5.8L4 10.7l5.8-1.9z"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  banknote: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15M9 3.236v15"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------- Helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function md(s) {
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  let html = '', list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of esc(s).split('\n')) {
    const l = raw.trim();
    let m;
    if ((m = l.match(/^[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else { close(); if (l) html += `<p>${inline(l.replace(/^#+\s*/, ''))}</p>`; }
  }
  close();
  return html;
}

const confirmBadge = status => K.isUnconfirmed(status)
  ? `<span class="badge badge-warn" title="DHA is still checking this information">${icon('info')}Please confirm with DHA</span>` : '';

function telLinks(str, ext) {
  const list = K.phones(str);
  if (!list.length) return `<span class="muted">${esc(str || 'Number not published')}</span>`;
  return `<span class="tel-list">${list.map(p => `<a class="tel" href="tel:${esc(p.tel)}">${icon('phone')}${esc(p.display)}</a>`).join('')}${ext ? `<span class="muted small">ext ${esc(ext)}</span>` : ''}</span>`;
}

function contactRows(list) {
  return list.map(c => `
    <div class="contact-row">
      <div class="who"><b>${esc(c.topic)}</b><span>${esc([c.office, c.phase !== 'All' ? c.phase : ''].filter(Boolean).join(' · '))}</span>
        ${c.email ? `<span>${esc(c.email)}</span>` : ''}</div>
      ${telLinks(c.phone, c.extension)}
    </div>`).join('');
}

function formRows(list) {
  return list.map(f => `
    <div class="form-row">
      <div><b>${esc(f.title)}</b><div class="muted small">${esc([f.purpose, f.who_signs && `Signed by ${f.who_signs}`, f.stamp_paper_required && `Stamp paper: ${f.stamp_paper_required}`].filter(Boolean).join(' · '))}</div></div>
      ${f.download_url
        ? `<a class="btn btn-secondary btn-small" href="${esc(f.download_url)}" target="_blank" rel="noopener">${icon('download')}Download</a>`
        : '<span class="badge">Not online — ask at office</span>'}
    </div>`).join('');
}

function sortFees(rows) {
  return [...rows].sort((a, b) => a.category.localeCompare(b.category) || Number(a.size_from || 0) - Number(b.size_from || 0));
}

function feeTable(rows, sqyd) {
  const sized = rows.some(r => r.size_from || r.size_to);
  const chips = sized ? `
    <div class="no-print" style="margin-bottom:12px">
      <div class="small muted" style="margin-bottom:6px">Choose your plot size to see your fee:</div>
      <div class="chips">${K.PLOT_SIZES.map(p => `<button class="chip ${sqyd === p.sqyd ? 'on' : ''}" data-action="fee-size" data-sqyd="${p.sqyd}">${p.label} <span class="muted small">&nbsp;(${p.sqyd} sq yd)</span></button>`).join('')}</div>
    </div>` : '';
  return `${chips}
    <table class="fee-table">
      <thead><tr><th>Fee</th>${sized ? '<th>Plot size</th>' : ''}<th>Amount</th></tr></thead>
      <tbody>${sortFees(rows).map(r => `
        <tr data-from="${esc(r.size_from)}" data-to="${esc(r.size_to)}" data-unit="${esc(r.size_unit)}" class="${K.sizeMatches(r, sqyd) ? 'hl' : ''}">
          <td>${esc(K.feeLabel(r))}${r.conditions ? `<div class="muted small">${esc(r.conditions.replace(/_/g, ' '))}</div>` : ''}${K.isUnconfirmed(r.status) ? '<div><span class="badge badge-warn">Please confirm</span></div>' : ''}</td>
          ${sized ? `<td>${esc(K.feeSize(r))}</td>` : ''}
          <td class="amt">${esc(K.feeAmount(r))}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="small muted" style="margin-top:8px">From the DHA Schedule of Charges (from 1 Dec 2022) and later notices. Pay by pay order or bank draft — not cash or cheque.</p>`;
}

function highlightFees(root, sqyd) {
  root.querySelectorAll('tr[data-unit]').forEach(tr => {
    const r = { size_from: tr.dataset.from, size_to: tr.dataset.to, size_unit: tr.dataset.unit };
    tr.classList.toggle('hl', K.sizeMatches(r, sqyd));
  });
  root.querySelectorAll('[data-action="fee-size"]').forEach(b => b.classList.toggle('on', Number(b.dataset.sqyd) === sqyd));
}

function backBtn(href = '#/', label = 'Back') {
  return `<a class="btn btn-ghost back" href="${href}">${icon('back')}${label}</a>`;
}

// ---------- State ----------

const state = {
  settings: null,
  chat: loadChat(),
  busy: false,
  editProv: null,
  models: {},
};

function loadChat() {
  try { return JSON.parse(sessionStorage.getItem('dha-chat') || '[]'); } catch { return []; }
}
function saveChat() {
  try { sessionStorage.setItem('dha-chat', JSON.stringify(state.chat.slice(-30))); } catch { /* storage may be blocked */ }
}

// ---------- Service categories ----------

const CATS = [
  { key: 'property', label: 'Buying, selling or gifting property', sub: 'Transfers, power of attorney, legal heirs', cats: ['Transfer'], icon: 'home' },
  { key: 'finance', label: 'Dues, NDC and bank loan papers', sub: 'Statement of dues, No Demand Certificate, lien', cats: ['Finance'], icon: 'banknote' },
  { key: 'records', label: 'Allotment letter and membership', sub: 'Collect, duplicate, address or name change', cats: ['Allotment', 'Membership', 'Verification'], icon: 'file' },
  { key: 'building', label: 'Building a house', sub: 'Possession, drawings, completion, solar', cats: ['Town Planning', 'Construction'], icon: 'building' },
  { key: 'security', label: 'E-Tag, car sticker and staff passes', sub: 'Vehicle entry, servants, CCTV', cats: ['Security'], icon: 'shield' },
  { key: 'renting', label: 'Renting out or vacating', sub: 'NOC for tenants', cats: ['Tenancy'], icon: 'key' },
  { key: 'utilities', label: 'Bills, connections and online services', sub: 'Utility bill, water, member portal', cats: ['Utilities', 'Digital'], icon: 'bolt' },
  { key: 'valley', label: 'DHA Valley files', sub: 'File opening, endorsement, conversion', cats: ['DHA Valley'], icon: 'map' },
  { key: 'community', label: 'Community and other', sub: 'Burial, pets, sales lounge, DHA shops', cats: ['Community', 'Sales', 'Business Development'], icon: 'users' },
  { key: 'register', label: 'For professionals and vendors', sub: 'Architects, contractors, suppliers, dealers', cats: ['Registration'], icon: 'briefcase' },
];
const POPULAR = ['SVC-TFR-NORMAL', 'SVC-NDC', 'SVC-AL-DUP', 'SVC-ETAG-RES', 'SVC-SERVANT-PASS', 'SVC-RENT-NOC-HOUSE', 'SVC-DRAWING', 'SVC-BURIAL'];
const SHORT_NAMES = {
  'SVC-TFR-NORMAL': 'Sell / transfer a plot', 'SVC-NDC': 'Get an NDC', 'SVC-AL-DUP': 'Lost allotment letter', 'SVC-ETAG-RES': 'E-Tag for my car',
  'SVC-SERVANT-PASS': 'Pass for maid or driver', 'SVC-RENT-NOC-HOUSE': 'Rent out my house', 'SVC-DRAWING': 'Approve house drawing', 'SVC-BURIAL': 'Burial in DHA graveyard',
};

// ---------- Views ----------

function homeView() {
  const notices = K.kb().notices.filter(n => n.status === 'active').slice(0, 3);
  return `
    <section class="hello">
      <h1>Assalam-o-Alaikum.<br>How can we help you today?</h1>
      <p class="muted">Ask in your own words, or tap one of the big buttons below.</p>
      <form class="askbox" data-action="home-ask">
        <input name="q" dir="auto" placeholder="For example: How do I transfer my plot to my son?" aria-label="Type your question" autocomplete="off">
        <button class="btn" type="submit">${icon('send')}Ask</button>
      </form>
    </section>
    <div id="for-you"></div>
    <section class="tiles">
      <a class="tile" href="#/ask"><div class="tile-icon">${icon('chat')}</div><div><strong>Ask a question</strong><span>Our assistant answers using DHA's official procedures</span></div></a>
      <a class="tile" href="#/services"><div class="tile-icon">${icon('list')}</div><div><strong>How do I…?</strong><span>Steps, documents and fees for every DHA service</span></div></a>
      <a class="tile tile-accent" href="#/report"><div class="tile-icon">${icon('alert')}</div><div><strong>Report a problem</strong><span>Tell us in your own words: plumber, water, electricity, street lights and more</span></div></a>
      <a class="tile tile-accent" href="#/my-complaints"><div class="tile-icon">${icon('clock')}</div><div><strong>My complaints</strong><span>See every update, and tell us when it is fixed</span></div></a>
      <a class="tile" href="#/market"><div class="tile-icon">${icon('map')}</div><div><strong>Buy a plot</strong><span>DHA plots for sale, prices and payment plans</span></div></a>
      <a class="tile" href="#/build"><div class="tile-icon">${icon('building')}</div><div><strong>Build a house</strong><span>Steps, building limits, fees and fines for your plot size</span></div></a>
      <a class="tile" href="#/contacts"><div class="tile-icon">${icon('phone')}</div><div><strong>Phone numbers</strong><span>Emergency, security, offices and helplines</span></div></a>
      <a class="tile" href="#/forms"><div class="tile-icon">${icon('file')}</div><div><strong>Forms</strong><span>Download and print DHA forms</span></div></a>
      <a class="tile wide-tile" href="#/my-account"><div class="tile-icon">${icon('banknote')}</div>
        <div style="flex:1"><strong>My property, installments and bills</strong><br><span>Plot details, payment plan and overdue installments, society bills and payment history</span></div>${icon('right')}</a>
    </section>
    ${notices.length ? `<section class="section"><h2>${icon('bell', 'inline-ic')} Latest notices</h2><div class="notice-list">
      ${notices.map(n => `<div class="notice"><strong>${esc(n.title)}</strong><span class="muted small">${esc(n.issue_date || n.effective_from)}</span><div>${esc(n.summary)}</div></div>`).join('')}
    </div></section>` : ''}`;
}

function servicesView(catKey) {
  const services = K.kb().services.filter(s => s.status !== 'missing');
  if (catKey) {
    const cat = CATS.find(c => c.key === catKey);
    const list = services.filter(s => cat.cats.includes(s.category));
    return `${backBtn('#/services', 'All topics')}
      <h1>${esc(cat.label)}</h1>
      ${catKey === 'building' ? `<a class="card b-link" href="#/build" style="margin-bottom:16px">${icon('building', 'inline-ic')} <span><b>Step-by-step guide for your plot</b> From possession to moving in: building limits, fees and fines for your plot size.</span>${icon('right')}</a>` : ''}
      <div class="list-buttons">${list.map(s => `
        <a class="list-btn" href="#/service/${s.service_id}"><span>${esc(s.service_name)}<span class="sub">${esc(s.who_can_apply)}</span></span>${icon('right')}</a>`).join('')}
      </div>`;
  }
  return `${backBtn()}
    <h1>How do I…?</h1>
    <p class="muted">Most asked:</p>
    <div class="chips" style="margin-bottom:24px">${POPULAR.map(id => `<a class="chip" href="#/service/${id}">${esc(SHORT_NAMES[id])}</a>`).join('')}</div>
    <p class="muted">Or choose a topic:</p>
    <div class="list-buttons">${CATS.map(c => `
      <a class="list-btn" href="#/services/${c.key}"><span class="lb-left"><span class="lb-icon">${icon(c.icon)}</span><span>${esc(c.label)}<span class="sub">${esc(c.sub)}</span></span></span>${icon('right')}</a>`).join('')}
    </div>`;
}

function serviceView(id) {
  if (id === 'SVC-COMPLAINT') { location.hash = '#/complaint'; return ''; }
  const b = K.serviceBundle(id);
  if (!b) return `${backBtn('#/services')}<p>Service not found.</p>`;
  const s = b.service;
  const cat = CATS.find(c => c.cats.includes(s.category));
  const facts = [
    ['Who applies', s.who_can_apply],
    ['Go in person?', s.physical_presence_required],
    ['How long', s.sla],
    ['How to apply', s.channel],
  ].filter(([, v]) => v && v !== 'Unknown');

  const stampsByInstrument = {};
  for (const r of b.stamps) (stampsByInstrument[r.instrument] ||= []).push(r);

  return `
    ${backBtn(cat ? `#/services/${cat.key}` : '#/services')}
    <section class="svc-hero">
      <div class="card-head"><span class="badge">${esc(s.category)}</span>${confirmBadge(s.status)}</div>
      <h1>${esc(s.service_name)}</h1>
      <div class="facts">${facts.map(([k, v]) => `<div class="fact"><b>${k}</b>${esc(v)}</div>`).join('')}</div>
      <div class="btn-row no-print">
        <button class="btn btn-secondary" data-action="print">${icon('print')}Print checklist</button>
        <a class="btn btn-secondary" href="#/ask?q=${encodeURIComponent('Tell me about ' + s.service_name)}">${icon('chat')}Ask about this</a>
      </div>
    </section>

    ${b.eligibility.length ? `<div class="card" style="margin-top:14px"><h2>Before you start</h2><ul>${b.eligibility.map(e => `<li>${esc(e.rule)}${e.exception ? ` <span class="muted">(${esc(e.exception)})</span>` : ''}</li>`).join('')}</ul></div>` : ''}

    ${b.steps.length ? `<div class="card" style="margin-top:14px"><h2>Steps</h2><ol class="steps">${b.steps.map(x => `
      <li><div>${esc(x.action)}<div class="meta">${esc([x.performed_by, x.office_or_desk, x.time_taken].filter(Boolean).join(' · '))}</div>${x.notes ? `<div class="meta">${esc(x.notes)}</div>` : ''}</div></li>`).join('')}</ol></div>`
      : `<div class="note note-warn" style="margin-top:14px">DHA has not published step-by-step instructions for this service yet. Please call the office below before you visit.</div>`}

    ${b.documents.length ? `<div class="card" style="margin-top:14px"><div class="card-head"><h2>Documents to bring</h2><span class="muted small no-print">Tick each one as you get it ready</span></div>
      <ul class="checklist">${b.documents.map((d, i) => `
        <li><label><input type="checkbox" id="doc-${i}"><span>${esc(d.document_name)}
          <span class="meta">${esc([d.required_from && `From: ${d.required_from}`, d.original_or_copy, d.copies && d.copies !== '1' && `${d.copies} copies`, d.attested_by && `Attested by ${d.attested_by}`, d.stamp_paper && `Stamp paper: ${d.stamp_paper}`, d.mandatory_or_conditional === 'Conditional' && d.condition && `Only if: ${d.condition}`].filter(Boolean).join(' · '))}</span></span></label></li>`).join('')}
      </ul></div>` : ''}

    ${b.stamps.length ? `<div class="card" style="margin-top:14px"><h2>Stamp paper</h2>
      <p class="small muted">The value depends on whether your phase falls in Islamabad or Rawalpindi.</p>
      <table><thead><tr><th>Paper</th><th>Where</th><th>Value</th></tr></thead><tbody>
      ${Object.entries(stampsByInstrument).map(([inst, rows]) => rows.map((r, i) => `<tr>${i === 0 ? `<td rowspan="${rows.length}">${esc(inst)}<div class="muted small">${esc(r.paper_type)}${r.attested_by ? ` · attested by ${esc(r.attested_by)}` : ''}</div></td>` : ''}<td>${esc(r.jurisdiction)}</td><td class="amt">${K.rupees(r.stamp_paper_value_pkr)}</td></tr>`).join('')).join('')}
      </tbody></table></div>` : ''}

    ${b.fees.length ? `<div class="card fee-card" style="margin-top:14px"><h2>Fees</h2>${feeTable(b.fees)}</div>` : ''}

    ${b.slas.length ? `<div class="card" style="margin-top:14px"><h2>How long it takes</h2><table><thead><tr><th>Item</th><th>Normal time</th><th>Valid for</th></tr></thead><tbody>
      ${b.slas.map(x => `<tr><td>${esc(x.item)}${x.urgent_option ? `<div class="muted small">Urgent: ${esc(x.urgent_option)}</div>` : ''}</td><td>${esc(x.normal_time)}</td><td>${esc(x.validity || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}

    ${b.forms.length ? `<div class="card" style="margin-top:14px"><h2>Forms you need</h2>${formRows(b.forms)}</div>` : ''}

    ${b.contacts.length ? `<div class="card" style="margin-top:14px"><h2>Who to contact</h2>${contactRows(b.contacts)}</div>` : ''}

    ${b.faqs.length ? `<div class="card no-print" style="margin-top:14px"><h2>Common questions</h2>${b.faqs.map(f => `
      <details style="margin-bottom:10px"><summary><b>${esc(f.question)}</b></summary><p style="margin-top:8px">${esc(f.draft_answer)}</p>${confirmBadge(f.status)}</details>`).join('')}</div>` : ''}

    <p class="small muted" style="margin-top:18px">Source: ${esc(s.source)}</p>`;
}

// ---------- Chat ----------

const SUGGESTIONS = [
  'How do I transfer my plot to my son?',
  'What documents do I need for an NDC?',
  'I lost my allotment letter',
  'Transfer fee for 1 kanal plot',
  'How do I get a pass for my driver?',
  'There is no water in my house',
  'Track complaint CMP-2026-10412',
  'Are my bills paid?',
];

function modeBadge() {
  const s = state.settings;
  if (s.mode === 'live') {
    const p = s.providers[s.activeProvider];
    return `<span class="badge badge-live">${icon('spark')}Live AI · ${esc(p.label)} · ${esc(p.model)}</span>`;
  }
  return `<span class="badge">${icon('spark')}Built-in answers (demo mode)</span>`;
}

function chatView() {
  return `
    <div class="chat">
      <div class="chat-head">
        <h1 style="margin:0">Ask a question</h1>
        <div class="btn-row" style="margin:0">${modeBadge()}${state.chat.length ? `<button class="btn btn-ghost btn-small" data-action="clear-chat">Start again</button>` : ''}</div>
      </div>
      <div class="msgs" id="msgs">${state.chat.length ? state.chat.map(renderMsg).join('') : emptyChat()}</div>
      <form class="chat-input" data-action="chat-send">
        <textarea name="q" rows="1" dir="auto" placeholder="Type your question here…" aria-label="Type your question"></textarea>
        <button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>${icon('send')}Send</button>
      </form>
    </div>`;
}

function emptyChat() {
  return `
    <div class="msg msg-agent"><div class="avatar">${icon('spark')}</div><div class="bubble">
      <div class="text"><p><strong>Assalam-o-Alaikum!</strong> I am the DHA help assistant. I can explain procedures, documents and fees, give you the right phone number, and register or track a complaint.</p>
      <p>You can type in English or Urdu. Try one of these:</p></div>
      <div class="chips">${SUGGESTIONS.map(q => `<button class="chip" data-action="suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    </div></div>`;
}

function renderMsg(m, i) {
  if (m.role === 'user') return `<div class="msg msg-user" dir="auto">${esc(m.text)}</div>`;
  const steps = m.steps || [];
  const shown = I.trMsg(m.text);
  const english = I.isUr() && !I.hasUrdu(shown);
  return `
    <div class="msg msg-agent"><div class="avatar">${icon('spark')}</div><div class="bubble">
      ${steps.length ? `<details class="trace"><summary>${icon('check')}Checked ${steps.length} source${steps.length === 1 ? '' : 's'}${m.mode === 'live' ? ' · live AI' : ''}</summary>
        <ol>${steps.map(s => `<li class="${s.warn ? 'warn' : ''}">${esc(s.label)}</li>`).join('')}</ol></details>` : ''}
      ${m.fallback ? `<div class="note note-warn small" style="margin-bottom:10px">${esc(m.fallbackNote || 'The AI service could not be reached, so this answer uses built-in information.')}</div>` : ''}
      ${english && m.text.length > 120 ? `<div class="small muted" style="margin-bottom:8px">This answer is in English because it comes from DHA's published information.</div>` : ''}
      <div class="text"${I.isUr() ? ` dir="${english ? 'ltr' : 'rtl'}"` : ''}>${md(shown)}</div>
      ${m.cards?.length ? `<div class="cards">${m.cards.map((c, j) => renderCard(c, i, j)).join('')}</div>` : ''}
      <div class="feedback no-print">Not what you needed? <a href="tel:+9251111555400">Call DHA 111-555-400</a> or <a href="#/services">browse all services</a>.</div>
    </div></div>`;
}

function renderCard(c) {
  switch (c.type) {
    case 'service': {
      const b = K.serviceBundle(c.id);
      if (!b) return '';
      const s = b.service;
      return `<div class="card"><div class="card-head"><h3>${esc(s.service_name)}</h3>${confirmBadge(s.status)}</div>
        ${b.steps.length ? `<ol class="small" style="margin:0 0 10px;padding-left:1.3em">${b.steps.slice(0, 4).map(x => `<li>${esc(x.action)}</li>`).join('')}${b.steps.length > 4 ? `<li class="muted">…and ${b.steps.length - 4} more steps</li>` : ''}</ol>` : ''}
        <div class="chips small" style="margin-bottom:12px">
          ${b.steps.length ? `<span class="badge">${b.steps.length} steps</span>` : ''}${b.documents.length ? `<span class="badge">${b.documents.length} documents</span>` : ''}${b.forms.length ? `<span class="badge">${b.forms.length} forms</span>` : ''}${b.fees.length ? `<span class="badge">${b.fees.length} fees</span>` : ''}
        </div>
        <a class="btn btn-block" href="#/service/${s.service_id}">${icon('list')}See full steps and checklist</a></div>`;
    }
    case 'fees': {
      const rows = c.ids.map(K.fee).filter(Boolean);
      if (!rows.length) return '';
      return `<div class="card fee-card"><h3>Fees${c.title ? ` — ${esc(c.title)}` : ''}</h3>${feeTable(rows, c.sqyd)}</div>`;
    }
    case 'contacts': {
      const list = c.ids.map(K.contact).filter(Boolean);
      return `<div class="card"><h3>Phone numbers</h3>${contactRows(list)}</div>`;
    }
    case 'forms': {
      const list = c.ids.map(K.form).filter(Boolean);
      return `<div class="card"><h3>Forms</h3>${formRows(list)}</div>`;
    }
    case 'notices': {
      const list = K.kb().notices.filter(n => c.ids.includes(n.notice_id));
      return `<div class="card"><h3>Notices</h3><div class="notice-list">${list.map(n => `<div class="notice"><strong>${esc(n.title)}</strong><div class="small">${esc(n.summary)}</div>${n.link ? `<a class="small" href="${esc(n.link)}" target="_blank" rel="noopener">Open notice</a>` : ''}</div>`).join('')}</div></div>`;
    }
    case 'complaint-start': {
      const t = COMPLAINT_TYPES.find(x => x.id === c.prefill.category) || COMPLAINT_TYPES.at(-1);
      return `<div class="card" style="border-color:var(--accent)"><div class="card-head"><h3>${t.emoji} ${esc(t.label)} complaint</h3><span class="badge badge-warn">Not sent yet</span></div>
        ${c.prefill.description ? `<p class="muted p-quote" dir="auto">“${esc(c.prefill.description)}”</p>` : ''}
        <a class="btn btn-accent btn-block" href="#/report?text=${encodeURIComponent(c.prefill.description || t.label)}">${icon('alert')}Continue to report it</a></div>`;
    }
    case 'complaint-status': {
      if (!c.list?.length) return '';
      return c.list.slice(0, 3).map(x => `<div class="card"><div class="card-head"><h3>${esc(x.id)} · ${esc(x.categoryLabel)}</h3><span class="status-pill ${x.stageIndex >= 3 ? 'ok' : ''}">${esc(x.status)}</span></div>
        <p class="small">${esc(x.events.at(-1).note)}</p><a class="btn btn-secondary btn-block" href="#/track/${esc(x.id)}">${icon('clock')}See full progress</a></div>`).join('');
    }
    case 'build-guide': {
      const g = B.buildGuide(c.sqyd || 250);
      const r = g.rules;
      const pct = r.ground_floor && !r.ground_floor.missing ? `${r.ground_floor.pct}% (about ${r.ground_floor.sqft.toLocaleString('en-PK')} sq ft)` : 'ask Building Control';
      const ftv = v => (v ? (String(v.value) === '0' ? 'none' : `${v.value} ${v.unit}`) : '');
      return `<div class="card"><div class="card-head"><h3>${icon('building', 'inline-ic')} ${c.sqyd ? `Building on a ${esc(r.size)} plot` : 'Building a house: the steps'}</h3><span class="badge">Byelaws ${esc(c.sqyd ? r.clause : 'Annex D')}</span></div>
        ${c.sqyd ? `<div class="facts"><div class="fact"><b>Ground floor</b>${pct}${r.ground_floor?.confirm && !r.ground_floor?.missing ? ' <span class="badge badge-warn">Please confirm with DHA</span>' : ''}</div>
          <div class="fact"><b>Front / back / sides</b>${ftv(r.setbacks.front)} / ${ftv(r.setbacks.rear)} / ${ftv(r.setbacks.side_porch)}, ${ftv(r.setbacks.side_other)}</div>
          <div class="fact"><b>Height</b>${esc(r.storeys?.value || '')} storeys, ${esc(ftv(r.height))}</div></div>` : ''}
        <ol class="steps" style="margin-top:14px">${g.stages.map(s => `<li><div>${esc(s.title)}<div class="meta">${esc(s.time || '')}</div></div></li>`).join('')}</ol>
        <a class="btn btn-block" style="margin-top:14px" href="#/build${c.sqyd ? `?size=${c.sqyd}` : ''}">${icon('building')}Open the step-by-step guide</a></div>`;
    }
    case 'plot-prices': {
      const q = c.query || {};
      const link = `#/market?${new URLSearchParams(Object.entries({ phase: (c.rows[0]?.phase) || '', size: q.size || '', use: q.use === 'commercial' ? 'commercial' : '' }).filter(([, v]) => v))}`;
      const mn = n => (n / 1e6).toFixed(2).replace(/\.?0+$/, '');
      return `<div class="card"><div class="card-head"><h3>${icon('banknote', 'inline-ic')} Market prices${c.period ? ` · ${esc(c.period)}` : ''}</h3><span class="badge badge-warn">Benchmark, not a price list</span></div>
        ${c.rows.length ? `<table class="p-table"><thead><tr><th>Where</th><th>Size</th><th>Rs million</th></tr></thead><tbody>
        ${c.rows.map(r => `<tr><td>${esc(r.phase_label)}, ${esc(r.sector)}${r.use !== 'residential' || r.kind !== 'plot' ? ` <span class="muted small">(${esc(r.use === 'house' ? 'built house' : r.use === 'commercial' ? 'commercial' : r.kind.replace('_', '-'))})</span>` : ''}</td><td>${esc(r.size)}</td><td class="amt">${mn(r.min)} – ${mn(r.max)}</td></tr>`).join('')}</tbody></table>
        <p class="small muted" style="margin:8px 0 0">Source: DHA Property Exchange, Price Valuation Benchmarking.</p>` : ''}
        <a class="btn btn-secondary btn-block" style="margin-top:12px" href="${link}">${icon('map')}See DHA plots for sale</a></div>`;
    }
    case 'signin': {
      const back = c.q ? `#/ask?q=${encodeURIComponent(c.q)}` : (c.next || '#/ask');
      return `<div class="card"><h3>${icon('lock', 'inline-ic')} Sign in ${esc(c.reason || '')}</h3>
        <p class="small muted" style="margin:0 0 12px">Demo: choose a person. In the real portal you sign in with your CNIC and a code sent to your mobile.</p>
        <a class="btn btn-block" href="#/signin?next=${encodeURIComponent(back)}">${icon('lock')}Sign in</a></div>`;
    }
    case 'account': {
      const rs = n => `Rs ${Number(n || 0).toLocaleString('en-PK')}`;
      const day = d => (d ? new Date(`${d}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
      const plots = c.focus === 'bills' ? [] : c.plots;
      const rows = [
        ...plots.map(p => `<tr><td>${esc(p.plot)}<div class="small muted">${esc(p.membership_no)}</div></td><td>${p.overdue_count
          ? `<span class="badge badge-warn">${p.overdue_count} overdue</span><div class="amt">${rs(p.overdue_amount)}</div>`
          : p.next_due ? '<span class="badge badge-ok">Up to date</span>' : '<span class="badge badge-ok">Fully paid</span>'}</td><td>${p.next_due ? `${esc(p.next_due.label)}<div class="small">${rs(p.next_due.amount)} · ${day(p.next_due.due_date)}</div>` : '—'}</td></tr>`),
        ...c.homes.map(h => `<tr><td>Society bill<div class="small muted">${esc(h.address)}</div></td><td>${h.outstanding
          ? `<span class="badge badge-warn">Unpaid</span><div class="amt">${rs(h.outstanding)}</div>` : '<span class="badge badge-ok">Paid</span>'}</td><td>${h.unpaid[0] ? `Due ${day(h.unpaid[0].due_date)}` : '—'}</td></tr>`),
      ];
      return `<div class="card"><div class="card-head"><h3>${icon('banknote', 'inline-ic')} ${esc(c.name)}: ${c.focus === 'bills' ? 'bills' : 'dues'}</h3><span class="badge badge-live">From your account</span></div>
        ${rows.length ? `<table class="p-table"><thead><tr><th>What</th><th>Now</th><th>Next</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : ''}
        ${c.can_pay_bill ? `<a class="btn btn-accent btn-block" style="margin-top:12px" href="#/my-account?pay=1">${icon('lock')}Pay this bill</a>` : ''}
        <a class="btn ${c.can_pay_bill ? 'btn-secondary' : ''} btn-block" style="margin-top:12px" href="#/my-account">${icon('banknote')}Open My account</a></div>`;
    }
    case 'applications':
      return `<div class="card"><h3>${icon('building', 'inline-ic')} Your applications with DHA</h3><div class="list-buttons">${c.list.map(x => `<a class="list-btn" href="#/build?m=${encodeURIComponent(x.membership_no)}"><span>${esc(x.title)} · ${esc(x.plot)}<span class="sub">${esc(x.label)}${x.voucher ? ` · voucher Rs ${Number(x.voucher.amount).toLocaleString('en-PK')} ${x.voucher.overdue ? 'overdue' : 'to pay'}` : ''}</span></span>${icon('right')}</a>`).join('')}</div></div>`;
    case 'build-link':
      return `<a class="card" href="#/build" style="display:block;text-decoration:none;color:inherit"><h3>${icon('building', 'inline-ic')} Build a house: the steps</h3><p class="small muted" style="margin:0">Possession and site plan, drawings, contractor, demarcation and completion, with fees for your plot size.</p></a>`;
    case 'no-property':
      return `<a class="card" href="#/market" style="display:block;text-decoration:none;color:inherit"><h3>${icon('map', 'inline-ic')} DHA plots for sale</h3><p class="small muted" style="margin:0">Choose a phase, size and budget; book with a token and pay by instalments.</p></a>`;
    case 'complaint-request': {
      const link = `#/report?text=${encodeURIComponent(c.text)}`;
      let signed = false;
      try { signed = !!localStorage.getItem('dha-cnic'); } catch { /* storage blocked */ }
      const href = signed ? link : `#/signin?next=${encodeURIComponent(link)}`;
      return `<div class="card" style="border-color:var(--accent)"><div class="card-head"><h3>${icon(c.service ? 'spark' : 'alert', 'inline-ic')} ${esc(c.label)}</h3><span class="badge badge-warn">Not sent yet</span></div>
        <p class="muted p-quote" dir="auto">“${esc(c.text)}”</p>${c.paid ? '<p class="small" style="margin-top:0">Paid service: the next step shows how to pay.</p>' : ''}
        <a class="btn btn-accent btn-block" href="${href}">${icon('alert')}${signed ? 'Continue' : 'Sign in and continue'}</a></div>`;
    }
    case 'my-complaints':
      return `<div class="card"><h3>${icon('clock', 'inline-ic')} Your complaints</h3><div class="list-buttons">${c.list.map(x => `<a class="list-btn" href="#/my-complaints/${esc(x.ref)}"><span>${esc(x.ref)} · ${esc(x.sub)}<span class="sub">${esc(x.status)}</span></span>${icon('right')}</a>`).join('')}</div>
        <a class="btn btn-secondary btn-block" style="margin-top:12px" href="#/my-complaints">${icon('list')}All my complaints</a></div>`;
    case 'sources':
      return `<div class="card"><div class="card-head"><h3>From DHA documents</h3><span class="badge" title="How these passages were found">${esc((c.stages || []).join(' + '))}</span></div>
        ${c.results.map(sourceBlock).join('')}</div>`;
    case 'track-form':
      return `<form class="card askbox" data-action="track-inline" style="margin:0"><input name="q" placeholder="Complaint number or mobile number" aria-label="Complaint number or mobile number"><button class="btn" type="submit">${icon('search')}Find</button></form>`;
    case 'coming-soon':
      return `<a class="card" href="#/my-account" style="display:block;text-decoration:none;color:inherit"><h3>${icon('banknote', 'inline-ic')} My property, installments and bills</h3><p class="small muted" style="margin:0">Sign in to see your plot, payment plan and society bills.</p></a>`;
    case 'quick-actions':
      return `<div class="chips">
        <a class="chip" href="#/services">How do I…?</a><a class="chip" href="#/report">Report a problem</a><a class="chip" href="#/my-complaints">My complaints</a><a class="chip" href="#/contacts">Phone numbers</a></div>`;
    default: return '';
  }
}

function sourceBlock(r) {
  const text = r.text.replace(/\n+/g, ' ');
  return `<div class="source">
    <div class="source-head">${esc(r.header)}</div>
    <p>${esc(text.length > 380 ? text.slice(0, 380) + '…' : text)}</p>
    <div class="source-foot">
      ${r.caution ? `<span class="badge badge-warn">${esc(r.caution)}</span>` : ''}${confirmBadge(r.status)}
      ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${icon('external', 'inline-ic')} Open document${r.page ? ` (page ${r.page})` : ''}</a>` : ''}
    </div></div>`;
}

async function sendChat(text) {
  text = text.trim();
  if (!text || state.busy) return;
  const history = state.chat.filter(m => m.text).map(m => ({ role: m.role, text: m.text }));
  state.chat.push({ role: 'user', text });
  state.busy = true;
  render();
  const msgs = $('#msgs');
  const live = document.createElement('div');
  live.className = 'msg msg-agent';
  live.innerHTML = `<div class="avatar">${icon('spark')}</div><div class="bubble"><div class="live-steps"></div></div>`;
  msgs.appendChild(live);
  const stepsEl = live.querySelector('.live-steps');
  live.scrollIntoView({ behavior: 'smooth', block: 'end' });
  const shown = [];
  const onStep = s => {
    const last = stepsEl.lastElementChild;
    if (s.done && last?.dataset.pending) last.remove();
    const row = document.createElement('div');
    row.className = 's';
    if (s.pending) row.dataset.pending = '1';
    row.innerHTML = s.pending ? `<span class="spinner"></span>${esc(s.label)}` : `${icon(s.warn ? 'alert' : 'check')}${esc(s.label)}`;
    stepsEl.appendChild(row);
    if (s.done) shown.push(s);
    live.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };
  let result;
  try {
    result = await ask(text, history, state.settings, onStep);
  } catch (e) {
    result = { text: `Sorry, something went wrong (${e.message}). Please try again or call 051-111-555-400.`, cards: [], steps: [] };
  }
  const warnSteps = shown.filter(s => s.warn).map(s => ({ label: s.label, warn: true }));
  state.chat.push({ role: 'assistant', text: result.text, cards: result.cards, steps: [...warnSteps, ...(result.steps || [])], mode: result.mode, fallback: result.fallback, fallbackNote: result.fallbackNote });
  state.busy = false;
  saveChat();
  render();
  const all = document.querySelectorAll('.msg-agent');
  all[all.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Tracking ----------

async function trackView(id) {
  if (!id) {
    return `${backBtn()}
      <h1>Track my complaint</h1>
      <form class="askbox" data-action="track-search">
        <input name="q" placeholder="Complaint number or mobile number" aria-label="Complaint number or mobile number" autocomplete="off">
        <button class="btn" type="submit">${icon('search')}Find</button>
      </form>
      <p class="muted small">Demo: try <a href="#" data-action="track-try" data-q="C023220650627">C023220650627</a> or mobile <a href="#" data-action="track-try" data-q="03015556677">0301 5556677</a>. Signed in? See <a href="#/my-complaints">My complaints</a>.</p>
      <div id="track-results"></div>`;
  }
  const list = await (await fetch(`/api/complaints?id=${encodeURIComponent(id)}`)).json();
  const c = list[0];
  if (!c) return `${backBtn('#/track')}<p>No complaint found with number ${esc(id)}.</p>`;
  const fmt = at => new Date(String(at).replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const done = c.stageIndex >= 3;
  return `${backBtn('#/track')}
    <div class="card">
      <div class="card-head"><div><span class="muted small">Complaint number</span><h1 style="margin:0">${esc(c.id)}</h1></div><span class="status-pill ${done ? 'ok' : ''}">${esc(c.status)}</span></div>
      <div class="facts">
        <div class="fact"><b>Problem</b>${esc(c.categoryLabel)}</div>
        <div class="fact"><b>Where</b>${esc([c.phase, c.sector, c.street].filter(Boolean).join(', '))}</div>
        <div class="fact"><b>Made on</b>${fmt(c.createdAt)}</div>
        ${c.team ? `<div class="fact"><b>Team</b>${esc(c.team)}</div>` : ''}
      </div>
      <ol class="timeline">${c.events.map((e, i) => `<li class="${i === c.events.length - 1 && !done ? 'current' : 'done'}"><span class="dot">${i === c.events.length - 1 && !done ? '' : icon('check')}</span><div><div class="t-meta">${e.at ? fmt(e.at) : ''}</div><div>${esc(e.note)}</div></div></li>`).join('')}</ol>
      <p class="small muted">Is this your complaint? <a href="#/my-complaints/${esc(c.id)}">Sign in</a> to add information or tell us when it is fixed.</p>
      <div class="btn-row"><a class="btn btn-call" href="tel:1092">${icon('phone')}Call Complaint Office 1092</a></div>
    </div>`;
}

async function trackSearch(q) {
  q = q.trim();
  const digits = q.replace(/\D/g, '');
  const isMobile = /^(0|92)?3\d{9}$/.test(digits) && !/^c\d/i.test(q);
  const list = await (await fetch(`/api/complaints?${isMobile ? 'mobile' : 'id'}=${encodeURIComponent(q)}`)).json();
  if (list.length === 1 && !isMobile) { location.hash = `#/track/${list[0].id}`; return; }
  const el = $('#track-results');
  if (!el) return;
  el.innerHTML = list.length
    ? `<div class="list-buttons">${list.map(c => `<a class="list-btn" href="#/track/${esc(c.id)}"><span>${esc(c.id)} · ${esc(c.categoryLabel)}<span class="sub">${esc(c.status)} — ${esc(c.events.at(-1).note)}</span></span>${icon('right')}</a>`).join('')}</div>`
    : `<div class="note note-warn">No complaint found for “${esc(q)}”. Please check the number, or call the Complaint Office on <a href="tel:1092"><b>1092</b></a>.</div>`;
}

// ---------- Contacts, forms, coming soon ----------

function contactsView() {
  const all = K.kb().contacts;
  const emergency = K.EMERGENCY_IDS.map(K.contact).filter(Boolean);
  return `${backBtn()}
    <h1>Phone numbers</h1>
    <div class="card" style="border-color:var(--danger)"><h2>Urgent help</h2>${contactRows(emergency)}</div>
    <div class="card"><h2>Find an office</h2>
      <div class="field"><input data-action="filter-contacts" placeholder="Type a topic, e.g. NDC, E-Tag, Phase II security" aria-label="Search phone numbers"></div>
      <div id="contact-list">${contactRows(all)}</div>
    </div>`;
}

function formsView() {
  const forms = K.kb().forms.filter(f => f.download_url && f.status !== 'missing');
  return `${backBtn()}
    <h1>Forms</h1>
    <p class="muted">Tap Download to open the form. Print it, fill it in, and take it to the office named in the service steps.</p>
    <div class="card">
      <div class="field"><input data-action="filter-forms" placeholder="Search forms, e.g. transfer, NDC, servant" aria-label="Search forms"></div>
      <div id="form-list">${formRows(forms)}</div>
    </div>`;
}

// ---------- Settings ----------

async function loadSettings() {
  state.settings = await (await fetch('/api/settings')).json();
}

function settingsView() {
  const s = state.settings;
  const id = state.editProv || s.activeProvider;
  const p = s.providers[id];
  const models = state.models[id] || [];
  return `${backBtn()}
    <h1>Settings</h1>
    <p class="muted">For DHA staff and demos. Residents never need this page.</p>

    <div class="card"><h2>How should the assistant answer?</h2>
      <div class="mode-grid">
        <label class="mode ${s.mode === 'simulated' ? 'on' : ''}"><input type="radio" name="mode" value="simulated" data-action="set-mode" ${s.mode === 'simulated' ? 'checked' : ''}>
          <b>Built-in answers</b><span class="small muted">Rule-based agent over the DHA data. No AI service or internet needed. Best for reliable demos.</span></label>
        <label class="mode ${s.mode === 'live' ? 'on' : ''}"><input type="radio" name="mode" value="live" data-action="set-mode" ${s.mode === 'live' ? 'checked' : ''}>
          <b>Live AI</b><span class="small muted">An open-source model on an OpenAI-compatible endpoint decides which DHA tools to use. Falls back to built-in answers if it fails.</span></label>
      </div>
    </div>

    <div class="card"><h2>AI service</h2>
      <div class="prov-tabs">${Object.entries(s.providers).map(([pid, pp]) => `<button class="chip ${pid === id ? 'on' : ''} ${pid === s.activeProvider ? 'active-prov' : ''}" data-action="edit-prov" data-id="${pid}">${esc(pp.label)}</button>`).join('')}</div>
      <form data-action="save-prov" data-id="${id}">
        <div class="field"><label for="p-url">Base URL</label><input id="p-url" name="baseUrl" value="${esc(p.baseUrl)}" placeholder="https://…/v1">
          <span class="hint">${esc(PROVIDER_HINTS[id] || '')}</span></div>
        <div class="field"><label for="p-key">API key</label><input id="p-key" name="apiKey" type="password" autocomplete="off" placeholder="${p.hasKey ? `Saved (${esc(p.keyPreview)}) — leave empty to keep` : id === 'ollama' || id === 'vllm' ? 'Usually not needed for local servers' : 'Paste your API key'}">
          ${p.hasKey ? `<button type="button" class="btn btn-ghost btn-small" data-action="clear-key" data-id="${id}" style="justify-self:start">Remove saved key</button>` : ''}</div>
        <div class="field"><label for="p-model">Model</label><input id="p-model" name="model" value="${esc(p.model)}" list="model-list" placeholder="model id">
          <datalist id="model-list">${models.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
          <span class="hint">Choose a model that supports tool (function) calling.${models.length ? ` ${models.length} models loaded — start typing to pick.` : ''}</span></div>
        <div class="btn-row">
          <button class="btn" type="submit">${icon('check')}Save</button>
          <button class="btn btn-secondary" type="button" data-action="use-prov" data-id="${id}" ${id === s.activeProvider ? 'disabled' : ''}>${id === s.activeProvider ? 'In use' : 'Use this service'}</button>
          <button class="btn btn-ghost" type="button" data-action="load-models" data-id="${id}">Load models</button>
          <button class="btn btn-ghost" type="button" data-action="test-prov" data-id="${id}">Test connection</button>
        </div>
        <div class="test-result" id="test-result"></div>
      </form>
      <div class="field" style="margin-top:18px"><label for="temp">Creativity (temperature): <span id="temp-val">${s.temperature}</span></label>
        <input id="temp" type="range" min="0" max="1" step="0.1" value="${s.temperature}" data-action="set-temp"><span class="hint">Keep low (0–0.3) so answers stay factual.</span></div>
      <p class="small muted">API keys are stored on this server in <code>app/store/settings.json</code> and are never sent back to the browser.</p>
    </div>

    <div class="card"><h2>Document search</h2>
      <p class="small muted">Keyword search (SQLite FTS5) + meaning search (embeddings) → fused → optionally reranked. Embedding and reranker endpoints use the TEI / vLLM API, so Ollama, vLLM or Text Embeddings Inference can replace the built-in local model server.</p>
      <div id="search-status" class="note small" style="margin-bottom:14px">Checking…</div>
      <form data-action="save-retrieval">
        <div class="grid-2">
          <div class="field"><label for="e-url">Embedding endpoint</label><input id="e-url" name="eUrl" value="${esc(s.retrieval.embedding.baseUrl)}"></div>
          <div class="field"><label for="e-model">Embedding model</label><input id="e-model" name="eModel" value="${esc(s.retrieval.embedding.model)}"><span class="hint">Must match the model used to build the index (bge-m3).</span></div>
        </div>
        <div class="field"><label for="e-key">Embedding API key</label><input id="e-key" name="eKey" type="password" autocomplete="off" placeholder="${s.retrieval.embedding.hasKey ? `Saved (${esc(s.retrieval.embedding.keyPreview)})` : 'Not needed for the local server'}"></div>
        <label class="small" style="display:flex;gap:10px;align-items:center;margin:4px 0 12px"><input type="checkbox" name="rOn" ${s.retrieval.reranker.enabled ? 'checked' : ''} style="width:24px;height:24px"> Use reranker (slightly more accurate; about 1 second per passage on a laptop CPU, so best with a GPU server)</label>
        <div class="grid-2">
          <div class="field"><label for="r-url">Reranker endpoint</label><input id="r-url" name="rUrl" value="${esc(s.retrieval.reranker.baseUrl)}"></div>
          <div class="field"><label for="r-model">Reranker model</label><input id="r-model" name="rModel" value="${esc(s.retrieval.reranker.model)}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="r-key">Reranker API key</label><input id="r-key" name="rKey" type="password" autocomplete="off" placeholder="${s.retrieval.reranker.hasKey ? `Saved (${esc(s.retrieval.reranker.keyPreview)})` : 'Not needed for the local server'}"></div>
          <div class="field"><label for="r-top">Passages to rerank</label><input id="r-top" name="rTop" type="number" min="5" max="50" value="${s.retrieval.rerankTop}"></div>
        </div>
        <button class="btn" type="submit">${icon('check')}Save search settings</button>
      </form>
      <form data-action="test-search" style="margin-top:20px">
        <label class="small" for="ts-q"><b>Try a search</b></label>
        <div class="askbox" style="margin:6px 0 0">
          <input id="ts-q" name="q" placeholder="e.g. basement ki ijazat hai?" autocomplete="off">
          <select name="mode" aria-label="Search mode" style="font:inherit;border:2px solid var(--line);border-radius:14px;padding:0 10px;min-height:60px;background:var(--surface)">
            <option value="rerank">Full (hybrid + rerank)</option><option value="hybrid">Hybrid, no rerank</option><option value="bm25">Keyword only</option><option value="vector">Meaning only</option>
          </select>
          <button class="btn" type="submit">${icon('search')}Search</button>
        </div>
      </form>
      <div id="test-search-out" style="margin-top:12px"></div>
    </div>

    <div class="card"><h2>Demo data</h2>
      <div class="btn-row" style="margin-top:0">
        <a class="btn" href="#/demo">${icon('spark')}Open the demo control panel</a>
        <button class="btn btn-ghost" data-action="reset-complaints">Reset demo data (people, bills, CMS complaints)</button>
        <button class="btn btn-ghost" data-action="reload-kb">Reload DHA data from CSV files</button>
      </div>
      <p class="small muted" style="margin-top:10px">Knowledge base: ${K.kb().services.length} services, ${K.kb().fees.length} fees, ${K.kb().steps.length} steps, ${K.kb().documents.length} documents, ${K.kb().forms.length} forms, ${K.kb().contacts.length} public contacts, ${K.kb().faqs.length} FAQs. Loaded ${new Date(K.kb().loadedAt).toLocaleString()}.</p>
    </div>`;
}

const PROVIDER_HINTS = {
  groq: 'Groq: https://api.groq.com/openai/v1 — e.g. llama-3.3-70b-versatile, openai/gpt-oss-120b, qwen/qwen3-32b',
  openrouter: 'OpenRouter: https://openrouter.ai/api/v1 — e.g. meta-llama/llama-3.3-70b-instruct, qwen/qwen-2.5-72b-instruct',
  vllm: 'vLLM: http://<server>:8000/v1 — start vLLM with --enable-auto-tool-choice --tool-call-parser <parser> for tool calls',
  ollama: 'Ollama: http://localhost:11434/v1 — e.g. qwen2.5:7b or llama3.1:8b (tool-capable models)',
  custom: 'Any server that implements the OpenAI /chat/completions API (LM Studio, LocalAI, TGI…)',
};

async function saveSettings(patch) {
  const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  state.settings = await res.json();
}

function providerPatchFromForm(form) {
  const fd = new FormData(form);
  return { providers: { [form.dataset.id]: { baseUrl: fd.get('baseUrl'), model: fd.get('model'), apiKey: fd.get('apiKey') } } };
}

async function loadSearchStatus() {
  const el = $('#search-status');
  if (!el) return;
  try {
    const s = await (await fetch('/api/search/status')).json();
    el.innerHTML = s.ready
      ? `Index: <b>${s.chunks}</b> passages from <b>${s.documents}</b> documents (${Object.entries(s.byType || {}).map(([k, v]) => `${esc(k.replace('_', ' '))} ${v}`).join(', ')}) · vectors: <b>${s.vectors}</b> (${esc(s.embed_model || 'none')}) · built ${esc(new Date(s.built_at).toLocaleString())}<br>Local model server: <b>${esc(s.modelServer)}</b>${s.localModelsUp ? ' ✓' : ''}`
      : 'Search database not built yet. Run <code>python -I pipeline/extract.py</code> then <code>python -I pipeline/build_db.py</code>.';
  } catch (e) {
    el.textContent = `Could not read search status (${e.message})`;
  }
}

// ---------- Router ----------

async function render() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  let html;
  switch (parts[0]) {
    case undefined: html = homeView(); break;
    case 'services': html = servicesView(parts[1]); break;
    case 'service': html = serviceView(parts[1]); break;
    case 'ask': html = chatView(); break;
    case 'complaint': location.hash = '#/report'; return;
    case 'report': html = P.reportView(params); break;
    case 'my-complaints': html = await P.complaintsView(parts[1]); break;
    case 'notifications': html = await P.notificationsView(); break;
    case 'signin': html = await P.signinView(params); break;
    case 'market': html = await P.marketView(parts[1], params); break;
    case 'build': html = await P.buildView(params); break;
    case 'track': html = await trackView(parts[1]); break;
    case 'contacts': html = contactsView(); break;
    case 'forms': html = formsView(); break;
    case 'my-account': html = await P.accountView(params); break;
    case 'settings': html = settingsView(); break;
    case 'demo': html = await DM.demoView(); break;
    default: html = homeView();
  }
  // Staff pages stay in English; DHA's own procedures are shown as published, left to right.
  const staff = ['settings', 'demo'].includes(parts[0]);
  view.toggleAttribute('data-no-tr', staff);
  view.dir = staff || parts[0] === 'service' ? 'ltr' : '';
  if (I.isUr() && ['service', 'services', 'build', 'forms', 'contacts'].includes(parts[0])) {
    html = `<p class="small muted i-note" dir="rtl">${icon('info', 'inline-ic')} <span>DHA procedures, fees and Byelaws are shown in English, as DHA publishes them.</span></p>${html}`;
  }
  view.innerHTML = html;
  P.afterRender(parts[0], params);
  if (parts[0] === 'settings') loadSearchStatus();
  if (parts[0] === 'ask') {
    const q = params.get('q');
    if (q) { history.replaceState(null, '', '#/ask'); sendChat(q); return; }
    if (!state.busy) $('.chat-input textarea')?.focus();
  }
}

let lastRoute = '';
window.addEventListener('hashchange', () => {
  const route = location.hash.split('?')[0];
  if (route !== lastRoute) window.scrollTo(0, 0);
  lastRoute = route;
  render();
});

// ---------- Events ----------

view.addEventListener('submit', async e => {
  const form = e.target;
  const action = form.dataset.action;
  if (!action) return;
  e.preventDefault();
  const q = form.q?.value || '';
  if (await P.onSubmit(action, form)) return;
  if (action === 'home-ask' && q.trim()) location.hash = `#/ask?q=${encodeURIComponent(q.trim())}`;
  if (action === 'chat-send') sendChat(q);
  if (action === 'track-search' && q.trim()) trackSearch(q);
  if (action === 'track-inline' && q.trim()) sendChat(/^\s*c\d/i.test(q) ? `Track complaint ${q}` : `Track my complaint, mobile ${q}`);
  if (action === 'save-retrieval') {
    const fd = new FormData(form);
    await saveSettings({ retrieval: {
      rerankTop: Number(fd.get('rTop')),
      embedding: { baseUrl: fd.get('eUrl'), model: fd.get('eModel'), apiKey: fd.get('eKey') },
      reranker: { baseUrl: fd.get('rUrl'), model: fd.get('rModel'), apiKey: fd.get('rKey'), enabled: fd.get('rOn') === 'on' },
    } });
    render();
  }
  if (action === 'test-search' && q.trim()) {
    const out = $('#test-search-out');
    out.innerHTML = '<div class="live-steps"><div class="s"><span class="spinner"></span>Searching…</div></div>';
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, keywords: K.expandTerms(q), mode: form.mode.value, k: 5 }) });
    const j = await res.json();
    if (!res.ok) { out.innerHTML = `<div class="note note-danger">${esc(j.error)}</div>`; return; }
    out.innerHTML = `<p class="small muted">Stages: <b>${esc(j.stages.join(' → ') || 'none')}</b> · ${Object.entries(j.timings).map(([k2, v]) => `${esc(k2.replace('_ms', ''))} ${v} ms`).join(' · ')}</p>
      ${j.notes.map(n => `<div class="note note-warn small">${esc(n)}</div>`).join('')}
      ${j.results.map((r, i) => `<div class="small muted" style="margin-top:8px">#${i + 1} · keyword rank ${r.ranks.keyword || '–'} · meaning rank ${r.ranks.vector || '–'}${r.rerank != null ? ` · rerank ${r.rerank.toFixed(2)}` : ''}</div>${sourceBlock(r)}`).join('')}`;
  }
  if (action === 'save-prov') {
    await saveSettings(providerPatchFromForm(form));
    $('#test-result').innerHTML = '<div class="note">Saved.</div>';
    render();
  }
});

view.addEventListener('keydown', e => {
  if (P.onKeydown(e)) return;
  if (e.target.matches('.chat-input textarea') && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat(e.target.value);
  }
});

view.addEventListener('input', e => {
  const t = e.target;
  if (DM.onInput(t)) return;
  if (t.dataset.action === 'filter-contacts') {
    const q = t.value.trim();
    const list = q ? K.contactsForTopic('', q) : K.kb().contacts;
    const loose = q ? K.kb().contacts.filter(c => `${c.topic} ${c.office} ${c.phase}`.toLowerCase().includes(q.toLowerCase())) : [];
    const merged = [...new Set([...loose, ...list])];
    $('#contact-list').innerHTML = merged.length ? contactRows(merged) : '<p class="muted">No match. Try another word, or call 051-111-555-400.</p>';
  }
  if (t.dataset.action === 'filter-forms') {
    const q = t.value.trim().toLowerCase();
    const forms = K.kb().forms.filter(f => f.download_url && f.status !== 'missing' && (!q || `${f.title} ${f.purpose}`.toLowerCase().includes(q)));
    $('#form-list').innerHTML = forms.length ? formRows(forms) : '<p class="muted">No form found.</p>';
  }
  if (t.dataset.action === 'set-temp') $('#temp-val').textContent = t.value;
});

view.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.action === 'set-mode') { await saveSettings({ mode: t.value }); render(); }
  if (t.dataset.action === 'set-temp') await saveSettings({ temperature: Number(t.value) });
});

view.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'INPUT') return;
  const a = el.dataset.action;
  if (await P.onClick(a, el)) return;
  if (await DM.onClick(a, el)) return;
  switch (a) {
    case 'suggest': sendChat(el.dataset.q); break;
    case 'clear-chat': state.chat = []; resetSession(); saveChat(); render(); break;
    case 'print': window.print(); break;
    case 'fee-size': highlightFees(el.closest('.fee-card'), Number(el.dataset.sqyd)); break;
    case 'track-try': e.preventDefault(); $('input[name=q]').value = el.dataset.q; trackSearch(el.dataset.q); break;
    case 'edit-prov': state.editProv = el.dataset.id; render(); break;
    case 'use-prov': await saveSettings({ activeProvider: el.dataset.id, ...providerPatchFromForm(el.form) }); render(); break;
    case 'clear-key': await saveSettings({ providers: { [el.dataset.id]: { clearKey: true } } }); render(); break;
    case 'load-models': case 'test-prov': {
      const out = $('#test-result');
      await saveSettings(providerPatchFromForm(el.form));
      out.innerHTML = '<div class="live-steps"><div class="s"><span class="spinner"></span>Contacting the AI service…</div></div>';
      try {
        if (a === 'load-models') {
          const r = await fetch(`/api/llm/models?provider=${el.dataset.id}`);
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          state.models[el.dataset.id] = j.models;
          render();
          $('#test-result').innerHTML = `<div class="note">Loaded ${j.models.length} models.</div>`;
        } else {
          const r = await fetch('/api/llm/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: el.dataset.id }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          out.innerHTML = `<div class="note">${icon('check', 'inline-ic')} Connected in ${j.ms} ms. The model replied: “${esc(j.reply.slice(0, 80))}”</div>`;
        }
      } catch (err) {
        out.innerHTML = `<div class="note note-danger">${esc(err.message)}</div>`;
      }
      break;
    }
    case 'reset-complaints': await fetch('/api/demo/reset', { method: 'POST' }); alert('Demo data rebuilt from the CMS export.'); break;
    case 'reload-kb': await fetch('/api/kb?reload=1'); await K.loadKb(); render(); break;
  }
});

// ---------- Start ----------

document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
P.init({ icon, esc, md, backBtn, render });
const langBtn = $('#lang-btn');
langBtn.textContent = I.isUr() ? 'English' : 'اردو';
langBtn.addEventListener('click', () => { I.setLang(I.isUr() ? 'en' : 'ur'); location.reload(); });
I.start();
DM.init({ icon, esc, backBtn, render });
Promise.all([K.loadKb(), loadSettings()]).then(() => { lastRoute = location.hash.split('?')[0]; render(); });
