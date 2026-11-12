// Construction guidance: the stages of building a house in DHA, worked out for one plot size from DHA's own
// data (procedure PRC-CONSTRUCTION, services, fees, building standards, fines and regularization charges
// from the Byelaws 2022, updated 2023). Guidance only: DHA's Building Control workflow is not connected yet.
// Shared by the "Build a house" screen and the assistant's get_building_rules tool (browser and server).

import * as K from './kb.js';

const kb = () => K.kb();
const SQFT_PER_SQYD = 9;

// The order follows PRC-CONSTRUCTION. Titles are short plain-language labels; everything else comes from data.
export const STAGES = [
  { key: 'possession', step: 1, title: 'Take possession and get the site plan', service: 'SVC-POSSESSION', fines: [] },
  { key: 'drawings', step: 2, title: 'Get your drawings approved', service: 'SVC-DRAWING', fines: ['FIN-003'], regs: ['REG-21'] },
  { key: 'contractor', step: 3, title: 'Register your contractor and labour', service: 'SVC-CONTRACTOR-SEC', fines: [] },
  { key: 'demarcation', step: 4, title: 'Get the plot demarcated', service: 'SVC-DEMARCATION', fines: ['FIN-011'], rules: ['Monsoon restriction on excavation / demarcation'] },
  { key: 'construction', step: 5, title: 'Build, with inspections at each stage', service: null,
    fines: ['FIN-005', 'FIN-006', 'FIN-007', 'FIN-009', 'FIN-015', 'FIN-023', 'FIN-016'],
    rules: ['Construction working hours - winter', 'Construction working hours - summer', 'Green cloth on under-construction buildings', 'Construction completion period'] },
  { key: 'occupation', step: 6, title: 'Get the NOC to move in', service: 'SVC-OCC-NOC', fines: ['FIN-012'] },
  { key: 'completion', step: 7, title: 'Get the completion certificate', service: 'SVC-COMPLETION', fines: ['FIN-018'] },
  { key: 'connections', step: 8, title: 'Get permanent water and sewerage connections', service: 'SVC-SERVICE-CONN', fines: [] },
];

const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
// missing: no usable value in the data; unconfirmed: a value DHA still has to confirm (shown with a badge).
const missing = r => !r || r.value === '' || /merged cell|not legible/i.test(`${r.value} ${r.notes}`);
const unconfirmed = r => !r || K.isUnconfirmed(r.status) || missing(r);
const marla = sqyd => sqyd / 25;
export const sizeLabel = sqyd => {
  const k = sqyd / 500;
  const name = Number.isInteger(k) ? `${k} Kanal` : `${+(sqyd / 25).toFixed(2)} Marla`;
  return `${name} (${sqyd} sq yd)`;
};

// Standards for this plot size: the size band rows plus the general rows (no size range).
export function standardsFor(sqyd) {
  const rows = (kb().standards || []).filter(r => r.status !== 'superseded');
  const inBand = r => {
    const from = num(r.plot_size_from_sqyd), to = num(r.plot_size_to_sqyd);
    if (from == null && to == null) return false;
    return sqyd >= (from ?? 0) && sqyd <= (to ?? Infinity);
  };
  const band = rows.filter(r => r.category.startsWith('Residential') && inBand(r));
  const general = rows.filter(r => num(r.plot_size_from_sqyd) == null && num(r.plot_size_to_sqyd) == null);
  const pick = (list, param) => list.find(r => r.parameter === param) || null;
  return { band, general, pick: param => pick(band, param) || pick(general, param), byParam: param => pick(general, param) };
}

// What can be built on a plot of this size, with the numbers worked out.
export function buildingRules(sqyd) {
  const s = standardsFor(sqyd);
  const plotSqft = sqyd * SQFT_PER_SQYD;
  const gf = s.pick('Max ground floor covered area (incl. car porch)');
  const ff = s.pick('Max first floor covered area');
  const gfPct = gf && !missing(gf) ? num(gf.value) : null;
  const gfSqft = gfPct != null ? Math.round(plotSqft * gfPct / 100) : null;
  // Upper floor: worked out only where the rule is a plain number of the ground floor.
  let ffSqft = null;
  if (gfSqft != null && ff && !missing(ff)) {
    if (/^Footprint of GF area$/i.test(ff.value)) ffSqft = gfSqft;
    else if (/^90% of GF/i.test(ff.value)) ffSqft = Math.round(gfSqft * 0.9);
  }
  const setback = p => {
    const r = s.pick(p);
    return r ? { value: r.value, unit: r.unit, notes: r.notes, clause: r.bylaw_clause, id: r.std_id, confirm: unconfirmed(r) } : null;
  };
  const g = p => { const r = s.byParam(p); return r ? { value: r.value, unit: r.unit, id: r.std_id, clause: r.bylaw_clause, confirm: unconfirmed(r) } : null; };
  return {
    sqyd, size: sizeLabel(sqyd), plot_sqft: plotSqft, marla: marla(sqyd),
    clause: gf?.bylaw_clause || s.band[0]?.bylaw_clause || '',
    ground_floor: gf ? { pct: gfPct, sqft: gfSqft, text: gf.value, id: gf.std_id, confirm: unconfirmed(gf), missing: missing(gf) } : null,
    first_floor: ff ? { text: /merged cell/i.test(ff.value) ? 'Please ask Building Control for this plot size' : ff.value, sqft: ffSqft, id: ff.std_id, confirm: unconfirmed(ff), missing: missing(ff) } : null,
    setbacks: {
      front: setback('Front setback (COS)'),
      rear: setback('Rear setback'),
      side_porch: setback('Side setback (car porch side)'),
      side_other: setback('Side setback (other side)'),
    },
    storeys: g('Maximum number of storeys'),
    height: g('Maximum building height incl. water tank / mumty'),
    room: g('Minimum habitable room area'),
    extinguishers: g('Fire extinguishers'),
    structural: s.general.filter(r => r.category === 'Structural').map(r => ({ id: r.std_id, text: r.parameter, value: `${r.value}${r.unit ? ` ${r.unit}` : ''}` })),
    construction: s.general.filter(r => r.category === 'Construction rules').map(r => ({ id: r.std_id, text: r.parameter, value: r.value, unit: r.unit })),
  };
}

const fine = id => (kb().fines || []).find(f => f.fine_id === id && f.status !== 'superseded');
const reg = id => (kb().regularization || []).find(r => r.reg_id === id && r.status !== 'superseded');
const basis = b => ({ fixed: '', per_month: ' a month', per_ft: ' a foot', per_sqft: ' a sq ft', per_running_ft: ' a running foot', per_inch: ' an inch', per_meter: ' a meter' }[b] ?? ` ${String(b || '').replace(/_/g, ' ')}`);
export const fineText = f => `${K.rupees(f.amount_first)}${basis(f.rate_basis)}${f.amount_second ? `, then ${K.rupees(f.amount_second)}${f.amount_third ? ` and ${K.rupees(f.amount_third)}` : ''} for repeats` : ''}${f.additional ? ` (${f.additional.charAt(0).toLowerCase()}${f.additional.slice(1)})` : ''}`;
export const regText = r => `${K.rupees(r.amount)}${basis(r.rate_basis)}`;

// Fees for a stage, with the amount for this plot where the rate allows it.
function stageFees(key, rules) {
  const f = id => K.fee(id);
  const out = [];
  const add = (row, label, amount, how) => row && row.status !== 'superseded' && out.push({ id: row.fee_id, label, amount, how, confirm: K.isUnconfirmed(row.status) });
  if (key === 'possession') {
    const r = f('SITEPLAN-RES');
    if (r) add(r, 'Site plan and possession fee', Number(r.amount) * rules.marla, `${K.rupees(r.amount)} a marla × ${rules.marla} marla`);
    const u = f('SITEPLAN-URGENT');
    if (u) add(u, 'Urgent site plan (optional)', Number(u.amount), 'fixed');
  }
  if (key === 'drawings') {
    const r = f('BP-SCRUTINY-RES');
    if (r) {
      const area = rules.ground_floor?.sqft != null ? rules.ground_floor.sqft + (rules.first_floor?.sqft || 0) : null;
      add(r, 'Drawing scrutiny fee', area != null ? Number(r.amount) * area : null,
        area != null ? `${K.rupees(r.amount)} a sq ft × ${area.toLocaleString('en-PK')} sq ft (ground floor at the limit${rules.first_floor?.sqft ? ' plus first floor' : ''}; your architect's drawing sets the real area)` : `${K.rupees(r.amount)} a sq ft of covered area`);
    }
    const rev = f('BP-REV-RES');
    if (rev) add(rev, 'Revised drawing (only if you change it later)', Number(rev.amount), 'fixed');
  }
  if (key === 'completion') {
    const r = f('CC-HOUSE-FIRST');
    if (r) add(r, 'Completion certificate (first owner)', Number(r.amount), 'fixed');
  }
  if (key === 'connections') {
    const w = f('UTIL-WATER-METER');
    if (w) add(w, 'Water connection', Number(w.amount), 'per meter');
  }
  return out;
}

// The whole guide for a plot size. done: stage keys the owner has ticked.
export function buildGuide(sqyd, done = []) {
  const rules = buildingRules(sqyd);
  const steps = (kb().steps || []).filter(s => s.procedure_id === 'PRC-CONSTRUCTION');
  const stages = STAGES.map(st => {
    const step = steps.find(s => Number(s.step_no) === st.step);
    const svc = st.service ? K.service(st.service) : null;
    const extraRules = (st.rules || []).map(p => rules.construction.find(r => r.text === p)).filter(Boolean);
    return {
      key: st.key, no: st.step, title: st.title,
      action: step?.action || '', who: step?.performed_by || '', office: step?.office_or_desk || '',
      time: step?.time_taken || svc?.sla || '',
      service_id: svc?.service_id || null, service_name: svc?.service_name || null,
      documents: st.key === 'drawings' ? (kb().documents || []).filter(d => d.procedure_id === 'PRC-CONSTRUCTION' && d.variant === 'drawing_approval')
        : st.key === 'possession' ? (kb().documents || []).filter(d => d.procedure_id === 'PRC-POSSESSION') : [],
      fees: stageFees(st.key, rules),
      rules: extraRules,
      fines: st.fines.map(fine).filter(Boolean),
      regs: (st.regs || []).map(reg).filter(Boolean),
      done: done.includes(st.key),
    };
  });
  const next = stages.find(s => !s.done) || null;
  return {
    rules, stages, next,
    regularization: (kb().regularization || []).filter(r => r.property_type === 'Residential' && r.status !== 'superseded'),
    source: 'DHA Byelaws 2022 (updated 2023), Chapter XVI and Annex D; Schedule of Charges Dec 2022',
  };
}

// Plot size in sq yd from "1 Kanal (500 sq yd)", "10 marla", "250" etc.
export function sqydFrom(text) {
  const s = String(text || '');
  const m = s.match(/\((\d+)\s*sq\s*yd\)/i);
  if (m) return Number(m[1]);
  if (/^\d+(\.\d+)?$/.test(s.trim())) return Number(s);
  return K.parseSize(s);
}
