// Builds the prototype data: store/core.sqlite (people, plots, memberships, residences, installments, bills)
// store/cms_stub.sqlite (the CMS stub, loaded with samples/Complaints.csv) and store/membership_stub.sqlite (the
// membership portal stub, loaded with DHA's sample dump: data/membership_sample.json from samples/DHA_Sample_Data_n.xlsx).
//   node core/seed.js
// Every person is keyed by CNIC. People in the CMS export are masked, so each masked membership number gets a
// synthetic CNIC that keeps the export's last CNIC digit. Five demo personas cover the stages of the journey.
// All money values here are demo values, not DHA figures.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const cms = require('../cms_stub/cms');
const market = require('./market');
const membership = require('../membership_stub/membership');

const ROOT = path.resolve(__dirname, '..', '..');
const CSV = path.join(ROOT, 'samples', 'Complaints.csv');

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

const hashInt = (s, mod) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 12), 16) % mod;

function syntheticCnic(memberKey, maskedCnic) {
  const last = /\d$/.test(maskedCnic.trim()) ? maskedCnic.trim().slice(-1) : String(hashInt(memberKey + 'd', 10));
  const region = ['37405', '37406', '61101', '61102'][hashInt(memberKey + 'r', 4)];
  return `${region}-${String(1000000 + hashInt(memberKey, 9000000))}-${last}`;
}

const PHASE_LABEL = p => (p ? `Phase ${p}` : '');

// ---------- Demo personas ----------

const TODAY = new Date();
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date, not UTC
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// A payment plan that started so that instalment `next` falls due `inDays` from the reset, keeping the demo's story current.
const planStart = (next, inDays) => iso(addDays(addMonths(TODAY, -3 * next), inDays));
const BILAL_START = planStart(6, 20); // instalments 1-3 paid, 4 and 5 overdue, 6 due in 20 days
const FARAH_SECOND_START = planStart(11, 25); // instalments 1-10 paid, 11 due in 25 days

const PERSONAS = [
  { persona: 'prospect', label: 'Prospect: looking to buy a plot', cnic: '61101-4827315-2', name: 'Ayesha Khan', mobile: '03001112233' },
  { persona: 'member', label: 'Member: paying installments', cnic: '37405-6612093-5', name: 'Bilal Ahmed', mobile: '03214455667',
    plot: { plot_id: 'PH6-C1-412', phase: '6', sector: 'C1', street: '4', plot_no: '412', size_label: '1 Kanal (500 sq yd)', category: 'Residential', lat: 33.5, lng: 73.21 },
    membership: { membership_no: 'DHAI-6C1-0412', membership_type: 'Allottee', status: 'Active', allotted_on: BILAL_START, document: 'Allotment certificate' },
    plan: { total: 15500000, booking: 2325000, start: BILAL_START, quarters: 12, paidQuarters: 3 } },
  { persona: 'builder', label: 'Owner-builder: about to build', cnic: '37405-2290871-4', name: 'Sana Malik', mobile: '03335566778',
    plot: { plot_id: 'PH2-J-23', phase: '2', sector: 'J', street: '9', plot_no: '23', size_label: '10 Marla (250 sq yd)', category: 'Residential', lat: 33.54, lng: 73.15 },
    membership: { membership_no: 'DHAI-2J-0023', membership_type: 'Allottee', status: 'Active', allotted_on: '2019-03-02', document: 'Allotment letter' },
    plan: { total: 9800000, booking: 1960000, start: '2019-03-02', quarters: 8, paidQuarters: 8 } },
  { persona: 'resident', label: 'Resident: lives in DHA', cnic: '61101-7734520-9', name: 'Imran Qureshi', mobile: '03015556677',
    plot: { plot_id: 'PH2-E-3-14', phase: '2', sector: 'E', street: '3', plot_no: '14', size_label: '10 Marla (250 sq yd)', category: 'Residential', lat: 33.53, lng: 73.16, built: 1 },
    membership: { membership_no: 'DHAI-2E-0314', membership_type: 'Owner', status: 'Active', allotted_on: '2012-08-15', document: 'Allotment letter' },
    plan: { total: 4200000, booking: 840000, start: '2012-08-15', quarters: 8, paidQuarters: 8 },
    residence: { consumer_id: 'CN-2E-0314', since: '2016-01-10' } },
  { persona: 'resident_member', label: 'Resident and member of a second plot', cnic: '37405-9081726-1', name: 'Farah Siddiqui', mobile: '03458899001',
    plot: { plot_id: 'PH1-F-10-7', phase: '1', sector: 'F', street: '10', plot_no: '7', size_label: '1 Kanal (500 sq yd)', category: 'Residential', lat: 33.53, lng: 73.17, built: 1 },
    membership: { membership_no: 'DHAI-1F-1007', membership_type: 'Owner', status: 'Active', allotted_on: '2008-04-01', document: 'Allotment letter' },
    plan: { total: 3100000, booking: 620000, start: '2008-04-01', quarters: 8, paidQuarters: 8 },
    residence: { consumer_id: 'CN-1F-1007', since: '2010-06-01' },
    second: {
      plot: { plot_id: 'PH5-K-88', phase: '5', sector: 'K', street: '2', plot_no: '88', size_label: '2 Kanal (1000 sq yd)', category: 'Residential', lat: 33.52, lng: 73.09 },
      membership: { membership_no: 'DHAI-5K-0088', membership_type: 'Allottee', status: 'Active', allotted_on: FARAH_SECOND_START, document: 'Allotment letter' },
      plan: { total: 92500000, booking: 13875000, start: FARAH_SECOND_START, quarters: 12, paidQuarters: 10 } } },
];

function insertPlan(membership_no, plan) {
  const ins = db.open().prepare('INSERT INTO installments (membership_no, no, label, due_date, amount, paid_amount, paid_on) VALUES (?,?,?,?,?,?,?)');
  ins.run(membership_no, 0, 'Booking', plan.start, plan.booking, plan.booking, plan.start);
  const each = Math.round((plan.total - plan.booking) / plan.quarters);
  for (let i = 1; i <= plan.quarters; i++) {
    const due = addMonths(new Date(plan.start), 3 * i);
    const paid = i <= plan.paidQuarters;
    const amount = i === plan.quarters ? plan.total - plan.booking - each * (plan.quarters - 1) : each; // last one absorbs rounding
    ins.run(membership_no, i, `Installment ${i} of ${plan.quarters}`, iso(due), amount, paid ? amount : 0, paid ? iso(due) : null);
  }
}

function insertBills(consumer_id) {
  const ins = db.open().prepare('INSERT INTO bills (consumer_id, month, amount, due_date, paid_on, payment_ref) VALUES (?,?,?,?,?,?)');
  for (let i = 5; i >= 0; i--) {
    const m = addMonths(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), -i);
    const month = iso(m).slice(0, 7);
    const paid = i > 0;
    const due = paid ? iso(new Date(m.getFullYear(), m.getMonth(), 15)) : iso(addDays(TODAY, 10)); // the current bill is never overdue after a reset
    const amount = 6200 + hashInt(consumer_id + month, 9) * 150;
    ins.run(consumer_id, month, amount, due, paid ? iso(new Date(m.getFullYear(), m.getMonth(), 10 + hashInt(month, 5))) : null,
      paid ? `1B${hashInt(consumer_id + month + 'r', 90000000) + 10000000}` : null);
  }
}

function seed() {
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
  db.reset();
  const d = db.open();

  // Phase centroids from the export's coordinates, used when a complaint has none (92% of them).
  const cent = {};
  for (const r of rows) {
    const lat = Number(r.lat_approx), lng = Number(r.lng_approx);
    if (lat > 33.4 && lat < 33.8 && lng > 72.9 && lng < 73.4) (cent[r.phase] ||= []).push([lat, lng]);
  }
  const centroid = p => {
    const a = cent[p];
    if (!a?.length) return [33.53, 73.13];
    return [a.reduce((s, x) => s + x[0], 0) / a.length, a.reduce((s, x) => s + x[1], 0) / a.length].map(v => Math.round(v * 1000) / 1000);
  };

  // People from the CMS export: one per masked membership number.
  const people = new Map();
  const insPerson = d.prepare('INSERT INTO persons (cnic, name, mobile) VALUES (?,?,?)');
  const insPlot = d.prepare('INSERT OR IGNORE INTO plots (plot_id, phase, sector, street, plot_no, size_label, category, lat, lng, built) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insMember = d.prepare('INSERT OR IGNORE INTO memberships (membership_no, cnic, plot_id, membership_type, status, allotted_on, document) VALUES (?,?,?,?,?,?,?)');
  const insRes = d.prepare('INSERT OR IGNORE INTO residences (cnic, plot_id, consumer_id, since) VALUES (?,?,?,?)');

  db.tx(() => {
    for (const r of rows) {
      const key = r.membership_no_masked || `ANON_${r.complaint_id}`;
      if (people.has(key)) continue;
      const cnic = syntheticCnic(key, r.member_cnic || '');
      const house = String(101 + hashInt(key + 'h', 300)); // persona houses are below 100, so they never collide
      const n = people.size + 1;
      const p = { cnic, name: `Resident ${String(n).padStart(4, '0')}`, mobile: `03${String(10 + hashInt(key + 'm', 40))}${String(1000000 + hashInt(key + 'n', 9000000))}`,
        membership_no: key, house };
      people.set(key, p);
      insPerson.run(cnic, p.name, p.mobile);
      const plot_id = `PH${r.phase || 'X'}-${r.sector || 'X'}-${r.street || 'X'}-${house}`;
      const [lat, lng] = centroid(r.phase);
      insPlot.run(plot_id, r.phase, r.sector, r.street, house, null, 'Residential', lat, lng, 1);
      insMember.run(key, cnic, plot_id, r.membership_type, r.membership_status, null, null);
      insRes.run(cnic, plot_id, `CN-${hashInt(key + 'c', 900000) + 100000}`, null);
    }

    for (const p of PERSONAS) {
      d.prepare('INSERT INTO persons (cnic, name, mobile, persona, persona_label) VALUES (?,?,?,?,?)').run(p.cnic, p.name, p.mobile, p.persona, p.label);
      for (const part of [p, p.second].filter(x => x?.plot)) {
        const pl = part.plot;
        insPlot.run(pl.plot_id, pl.phase, pl.sector, pl.street, pl.plot_no, pl.size_label, pl.category, pl.lat, pl.lng, pl.built || 0);
        const m = part.membership;
        insMember.run(m.membership_no, p.cnic, pl.plot_id, m.membership_type, m.status, m.allotted_on, m.document);
        insertPlan(m.membership_no, part.plan);
      }
      if (p.residence) {
        insRes.run(p.cnic, p.plot.plot_id, p.residence.consumer_id, p.residence.since);
        insertBills(p.residence.consumer_id);
      }
    }
  });

  // The CMS stub, loaded with the export.
  const n = cms.seedFromCsv(rows, r => people.get(r.membership_no_masked || `ANON_${r.complaint_id}`));

  // Give the two resident personas a history in the CMS: reassign a few export complaints from their own street.
  const c = cms.open();
  const assign = (persona, where, count) => {
    const p = PERSONAS.find(x => x.persona === persona);
    const refs = c.prepare(`SELECT reference FROM complaints WHERE ${where} ORDER BY complaint_date DESC LIMIT ${count}`).all().map(x => x.reference);
    for (const ref of refs) {
      c.prepare(`UPDATE complaints SET member_cnic = ?, member_name = ?, followup_name = ?, followup_cell = ?, member_phone = ?, membership_no = ?,
        phase = ?, sector = ?, street = ?, house = ?, lat_approx = ?, lng_approx = ? WHERE reference = ?`)
        .run(p.cnic, p.name, p.name, p.mobile, p.mobile, p.membership.membership_no, p.plot.phase, p.plot.sector, p.plot.street, p.plot.plot_no, p.plot.lat, p.plot.lng, ref);
    }
    return refs;
  };
  const imran = [
    ...assign('resident', "sub_category = 'Water Bowzer' AND status = 'Resolved' AND complaint_date < datetime('now','-3 days')", 1),
    ...assign('resident', "sub_category = 'Electrician' AND status = 'In Process'", 1),
    ...assign('resident', "sub_category = 'Plumber' AND status IN ('Resolved','Closed') AND complaint_date < datetime('now','-7 days')", 1),
  ];
  const farah = assign('resident_member', "sub_category = 'Street Light' AND status = 'Resolved'", 1);

  // A neighbour of the resident persona reported a water outage an hour ago: drives the "already reported for your street" demo.
  const neighbour = [...people.values()][7];
  const imranP = PERSONAS.find(x => x.persona === 'resident');
  const out = cms.createComplaint({ category: 'Community Services', sub_category: 'Shortage Of Water Supply', description: 'NO SUPPLY SINCE MORNING',
    request_source: 'Incoming Call', member_cnic: neighbour.cnic, member_name: neighbour.name, membership_no: neighbour.membership_no,
    phase: imranP.plot.phase, sector: imranP.plot.sector, street: imranP.plot.street, house: '18', followup_cell: neighbour.mobile }, 'seed-neighbour-outage');
  const hourAgo = cms.stamp(new Date(Date.now() - 3600000));
  c.prepare('UPDATE complaints SET complaint_date = ?, updated_at = ?, status_flow = ? WHERE reference = ?').run(hourAgo, hourAgo, `Submitted [${hourAgo.slice(0, 16)}]`, out.body.reference);
  c.prepare('UPDATE complaint_events SET at = ? WHERE reference = ?').run(hourAgo, out.body.reference);

  // A starting notification for Farah: her street-light complaint was resolved and waits for her confirmation.
  const farahP = PERSONAS.find(x => x.persona === 'resident_member');
  for (const ref of farah) {
    db.run('INSERT INTO notifications (cnic, at, kind, title, body, ref, actions) VALUES (?,?,?,?,?,?,?)', farahP.cnic, new Date(Date.now() - 2 * 3600000).toISOString(),
      'resolved', 'Street Light: marked resolved', 'The field team says the work is done. Is the problem fixed?', ref, JSON.stringify(['confirm', 'reopen']));
  }

  const listings = market.seedInventory();
  const members = seedMembership(centroid);

  // Sana is about to build: she has possession and her building plan is with Building Control (see seedMembership).
  const sanaP = PERSONAS.find(x => x.persona === 'builder');
  [['possession', 60]].forEach(([stage, daysAgo]) =>
    db.run('INSERT INTO build_progress (membership_no, stage, done_at) VALUES (?,?,?)', sanaP.membership.membership_no, stage, new Date(Date.now() - daysAgo * 86400000).toISOString()));

  d.exec('CREATE TABLE IF NOT EXISTS demo_meta (k TEXT PRIMARY KEY, v TEXT)');
  db.run("INSERT OR REPLACE INTO demo_meta (k, v) VALUES ('seeded_at', ?)", new Date().toISOString());

  console.log(`core.sqlite: ${db.get('SELECT COUNT(*) n FROM persons').n} people, ${db.get('SELECT COUNT(*) n FROM plots').n} plots, ` +
    `${db.get('SELECT COUNT(*) n FROM memberships').n} memberships, ${db.get('SELECT COUNT(*) n FROM installments').n} installments, ${db.get('SELECT COUNT(*) n FROM bills').n} bills`);
  console.log(`membership_stub.sqlite: ${members.records} member records from ${path.basename(SAMPLE_XLSX)}, ${members.applications} applications, ${members.vouchers} vouchers`);
  console.log(`marketplace: ${listings} DHA plots for sale, priced from the PVBM benchmark (${market.rates().period})`);
  console.log(`cms_stub.sqlite: ${n} complaints from the export, plus 1 neighbour outage (${out.body.reference})`);
  console.log(`Personas: ${PERSONAS.map(p => `${p.name} (${p.cnic})`).join(', ')}`);
  console.log(`Resident persona complaints: ${imran.join(', ')}; resident+member: ${farah.join(', ')}`);
}

// ---------- Membership portal (DHA's sample dump) ----------

const SAMPLE_XLSX = path.join(ROOT, 'samples', 'DHA_Sample_Data_n.xlsx'); // converted by pipeline/build_membership_sample.py

// The dump masks CNIC and mobile ("61***-*******-8", "03**-****201"). DHA's rule is that CNICs are unique, so
// every record gets its own demo CNIC that keeps the digits the mask shows (province and district, check digit).
function fillMask(mask, seed, taken) {
  for (let attempt = 0; ; attempt++) {
    let i = 0;
    const out = String(mask).replace(/\*/g, () => String(hashInt(`${seed}|${attempt}|${i++}`, 10)));
    if (!taken || !taken.has(out)) { taken?.add(out); return out; }
  }
}

const sizeFromFeet = sqft => {
  const sqyd = Math.round(sqft / 9);
  const k = sqyd / 500;
  return `${Number.isInteger(k) ? `${k} Kanal` : `${+(sqyd / 25).toFixed(2)} Marla`} (${sqyd} sq yd)`;
};
const title = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const propertyCode = pl => `${pl.phase} /${pl.sector.padEnd(2)} /${pl.plot_no.padStart(6, '0')}/01`; // the dump's plot code format

function seedMembership(centroid) {
  const taken = new Set([...db.all('SELECT cnic FROM persons').map(r => r.cnic)]);
  const ids = new Map();
  const n = membership.seedFromSample(r => {
    const id = { cnic: fillMask(r.cnic, `cnic${r.u_id}`, taken), mobno: fillMask(r.mobno, `mob${r.u_id}`).replace('-', '') };
    ids.set(r.u_id, id);
    return id;
  });

  // The app's own copy of who owns what (members and residents are joined by CNIC here; applications and vouchers stay in the portal).
  const s = membership.loadSample();
  const props = new Map(s.tp_properties.map(p => [p.property_code, p]));
  const d = db.open();
  const insPerson = d.prepare('INSERT OR IGNORE INTO persons (cnic, name, mobile) VALUES (?,?,?)');
  const insPlot = d.prepare('INSERT OR IGNORE INTO plots (plot_id, phase, sector, street, plot_no, size_label, category, lat, lng, built, property_code, dimensions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const insMember = d.prepare('INSERT OR IGNORE INTO memberships (membership_no, cnic, plot_id, membership_type, status, allotted_on, document) VALUES (?,?,?,?,?,?,?)');
  db.tx(() => {
    for (const r of s.tbl_memrecords) {
      const id = ids.get(r.u_id);
      const p = props.get(r.plotno) || {};
      const plot_id = `MBR-${r.plotno.replace(/[\s/]+/g, '-')}`; // the plot code is unique
      const [lat, lng] = centroid(r.phase);
      insPerson.run(id.cnic, title(r.memname), id.mobno);
      insPlot.run(plot_id, r.phase, r.sector, r.street, r.plno, p.total_size_feet ? sizeFromFeet(p.total_size_feet) : r.psize, r.propertytype, lat, lng, 0, r.plotno, p.dimensions_front_side || null);
      insMember.run(r.membershipno, id.cnic, plot_id, r.ownertype === 'Join Owner' ? 'Joint owner' : r.ownertype, 'Active', r.allotdate?.slice(0, 10), null);
    }
  });

  // The personas' plots are in the membership portal too, so their applications come from the same service.
  for (const p of PERSONAS) {
    for (const part of [p, p.second].filter(x => x?.plot)) {
      const pl = part.plot;
      const code = propertyCode(pl);
      const sqyd = Number(pl.size_label.match(/\((\d+)/)[1]);
      db.run('UPDATE plots SET property_code = ? WHERE plot_id = ?', code, pl.plot_id);
      membership.addMember({ membershipno: part.membership.membership_no, memname: p.name.toUpperCase(), plotno: code, psize: `${sqyd}  Sq Yds`,
        phase: pl.phase, sector: pl.sector, street: pl.street, plno: pl.plot_no, cnic: p.cnic, allotdate: part.membership.allotted_on, mobno: p.mobile,
        consumerid: p.residence?.consumer_id || null, ownertype: 'Owner', dhatype: 'DHA Islamabad', propertytype: pl.category, block: pl.sector },
        { property_code: code, property_no: pl.plot_no, size_text: `${sqyd}  Sq Yds`, size_marla: sqyd / 25, total_size_feet: sqyd * 9 });
    }
  }
  const app = (persona, which, directorate, steps) => {
    const p = PERSONAS.find(x => x.persona === persona);
    const part = which === 'second' ? p.second : p;
    membership.addApplication({ membership_no: part.membership.membership_no, plot_no: propertyCode(part.plot), phase: part.plot.phase, directorate,
      process_id: directorate === 3 ? 1 : 5, timeline_id: directorate === 3 ? 10 : 1, steps });
  };
  // Sana: site plan issued two months ago; her building plan has a fee voucher to pay (due in 4 days).
  app('builder', 'first', 3, [['Submitted', 70, 'New Submission'], ['Scrutiny of Documents for Site Plan', 68, 'ok'], ['Voucher Generated', 67], ['Voucher Paid', 64], ['Collected', 62, 'Site Plan']]);
  app('builder', 'first', 2, [['Submitted', 9, 'New Submission'], ['Under Scrutiny', 7, 'OK'], ['Voucher Generated', 6]]);
  // Farah's second plot: the site plan check found documents missing.
  app('resident_member', 'second', 3, [['Submitted', 5, 'New Submission'], ['Scrutiny of Documents for Site Plan', 4, 'ok'], ['Incomplete Documents', 2, 'Incomplete Documents']]);
  // Bilal: paid for the site plan, but his plot is still under development.
  app('member', 'first', 3, [['Submitted', 20, 'New Submission'], ['Scrutiny of Documents for Site Plan', 19, 'ok'], ['Voucher Generated', 18], ['Voucher Paid', 15], ['Under Development', 14, 'Plot under development']]);

  const m = membership.open();
  return { records: n, applications: m.prepare('SELECT COUNT(*) n FROM tpbc_user_processes').get().n, vouchers: m.prepare('SELECT COUNT(*) n FROM tpbc_user_process_payments').get().n };
}

if (require.main === module) seed();
module.exports = { seed, PERSONAS };
