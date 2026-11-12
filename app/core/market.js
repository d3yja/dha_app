// DHA Marketplace (simulated): DHA-owned plots for sale, booked by token, allotted on down payment.
// Modelled on the official inventory on dhamarketplace.com (plot, phase, sector, size, status, token amount,
// base price, 1/2/3-year plan prices). Prices come from the PVBM market benchmark (data/pvbm_rates.json),
// which DHA shared as the rate source for the prototype. Everything here is keyed by CNIC.
//
// Demo assumptions (DHA to confirm), kept together so they are easy to change:
const RULES = {
  priceFromBenchmark: 'min',   // listing price = lower end of the PVBM range for that phase, sector and size
  tokenPct: 0.01,              // token amount 1% of price (as on the live marketplace listings)
  tokenMin: 100000,
  holdHours: 72,               // a paid token holds the plot this long for the down payment
  downPct: 0.25,               // down payment (token included) for instalment plans
  plans: [
    { id: 'lump', label: 'Full payment', markup: 0, quarters: 0, note: 'Pay the rest at once, no instalments' },
    { id: '1yr', label: '1-year plan', markup: 0.06, quarters: 4 },
    { id: '2yr', label: '2-year plan', markup: 0.12, quarters: 8 },
    { id: '3yr', label: '3-year plan', markup: 0.18, quarters: 12 },
  ],
};

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const portal = require('./portal');

const RATES_FILE = path.resolve(__dirname, '..', '..', 'data', 'pvbm_rates.json');
let ratesCache = null;
function rates() {
  if (!ratesCache) ratesCache = JSON.parse(fs.readFileSync(RATES_FILE, 'utf8'));
  return ratesCache;
}

const hashInt = (s, mod) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 12), 16) % mod;
const round = (n, to = 50000) => Math.round(n / to) * to;
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

const KIND_LABEL = { plot: 'Plot', balloted: 'Balloted plot', certificate: 'Allotment certificate (no plot number yet)', non_balloted: 'Non-balloted file' };

// ---------- Inventory (built by core/seed.js) ----------

// DHA sells plots, so inventory is made from the benchmark's plot rows (not houses, files or certificates).
function seedInventory() {
  const d = db.open();
  const ins = d.prepare(`INSERT INTO market_plots (listing_id, phase, phase_label, sector, street, plot_no, use, kind, size, sqyd,
    base_price, token_amount, status, rate_min, rate_max, rate_page) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let n = 0;
  const used = new Set();
  db.tx(() => {
    for (const r of rates().rates) {
      if (!['residential', 'commercial'].includes(r.use) || !['plot', 'balloted'].includes(r.kind)) continue;
      const key = `${r.phase}|${r.sector}|${r.size}|${r.use}|${r.kind}`;
      const count = 1 + hashInt(key, 2);
      for (let i = 0; i < count; i++) {
        const sectorCode = r.sector.replace(/\s*\(.*\)/, '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 6).toUpperCase();
        let no = 1 + hashInt(key + i, 480), id;
        do { id = `MP-${r.phase}-${sectorCode}-${r.use[0].toUpperCase()}${no}`; } while (used.has(id) && ++no);
        used.add(id);
        const plotNo = String(no);
        const street = r.use === 'commercial' ? `Commercial ${1 + hashInt(key + 's' + i, 6)}` : String(1 + hashInt(key + 's' + i, 28));
        const price = round(r.min);
        const token = Math.max(RULES.tokenMin, round(price * RULES.tokenPct, 10000));
        if (ins.run(id, r.phase, r.phase_label, r.sector, street, plotNo, r.use, r.kind, r.size, r.sqyd, price, token, 'Available', r.min, r.max, r.page).changes) n++;
      }
    }
  });
  return n;
}

function planOptions(price) {
  return RULES.plans.map(p => {
    const total = round(price * (1 + p.markup), 1000);
    const down = p.quarters ? round(total * RULES.downPct, 1000) : total;
    const each = p.quarters ? Math.round((total - down) / p.quarters) : 0;
    return { id: p.id, label: p.label, total, down, quarters: p.quarters, each, note: p.note || (p.quarters ? `${Math.round(RULES.downPct * 100)}% down, then ${p.quarters} quarterly instalments` : '') };
  });
}

// A hold whose time ran out puts the plot back on sale.
function expireHolds() {
  const now = new Date().toISOString();
  const expired = db.all("SELECT b.id, b.listing_id, b.cnic FROM bookings b JOIN market_plots m ON m.listing_id = b.listing_id WHERE b.status = 'token_paid' AND m.hold_until < ?", now);
  for (const b of expired) {
    db.run("UPDATE bookings SET status = 'expired' WHERE id = ?", b.id);
    db.run("UPDATE market_plots SET status = 'Available', hold_cnic = NULL, hold_until = NULL WHERE listing_id = ?", b.listing_id);
    portal.notify(b.cnic, { kind: 'market', title: `Booking ${b.id} expired`, body: 'The down payment was not received in time, so the plot is back on sale.' });
  }
}

function listingOut(m, cnic) {
  return { ...m, kind_label: KIND_LABEL[m.kind] || m.kind, mine: !!cnic && m.hold_cnic === cnic, hold_cnic: undefined };
}

function filters() {
  expireHolds();
  const rows = db.all("SELECT phase, phase_label, use, size, sqyd, MIN(base_price) lo, MAX(base_price) hi, COUNT(*) n FROM market_plots WHERE status = 'Available' GROUP BY phase, phase_label, use, size, sqyd");
  const phases = [...new Map(rows.map(r => [r.phase, { id: r.phase, label: r.phase_label }])).values()];
  const sizes = [...new Map(rows.sort((a, b) => a.sqyd - b.sqyd).map(r => [r.size, { id: r.size, sqyd: r.sqyd }])).values()];
  return {
    phases, sizes, uses: ['residential', 'commercial'],
    price: { min: Math.min(...rows.map(r => r.lo)), max: Math.max(...rows.map(r => r.hi)) },
    available: rows.reduce((s, r) => s + r.n, 0),
    benchmark: { source: rates().source, period: rates().period, status: rates().status },
    rules: { tokenPct: RULES.tokenPct, holdHours: RULES.holdHours, downPct: RULES.downPct },
  };
}

function list(q, cnic) {
  expireHolds();
  const where = ["(status = 'Available' OR (status = 'On hold' AND hold_cnic = ?))"], args = [cnic || ''];
  const eq = (c, v) => { if (v) { where.push(`${c} = ?`); args.push(v); } };
  eq('phase', q.phase); eq('use', q.use); eq('size', q.size); eq('sector', q.sector);
  if (q.min) { where.push('base_price >= ?'); args.push(Number(q.min)); }
  if (q.max) { where.push('base_price <= ?'); args.push(Number(q.max)); }
  const order = q.sort === 'price_desc' ? 'base_price DESC' : q.sort === 'size' ? 'sqyd DESC, base_price' : 'base_price';
  const limit = Math.min(Number(q.limit) || 60, 200);
  const rows = db.all(`SELECT * FROM market_plots WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`, ...args);
  const total = db.get(`SELECT COUNT(*) n FROM market_plots WHERE ${where.join(' AND ')}`, ...args).n;
  return { total, plots: rows.map(m => listingOut(m, cnic)) };
}

function benchmarkFor(m) {
  return rates().rates.filter(r => r.phase === m.phase && r.size === m.size && r.use === m.use && (r.sector === m.sector || r.sector === 'All sectors'));
}

function get(id, cnic) {
  expireHolds();
  const m = db.get('SELECT * FROM market_plots WHERE listing_id = ?', id);
  if (!m) return null;
  const booking = cnic ? db.get("SELECT * FROM bookings WHERE listing_id = ? AND cnic = ? ORDER BY created_at DESC LIMIT 1", id, cnic) : null;
  const sectorRates = rates().rates.filter(r => r.phase === m.phase && r.sector === m.sector && r.use === m.use)
    .map(r => ({ size: r.size, kind: r.kind, min: r.min, max: r.max }));
  const houses = rates().rates.filter(r => r.phase === m.phase && r.use === 'house' && r.size === m.size);
  return {
    ...listingOut(m, cnic), plans: planOptions(m.base_price), benchmark: benchmarkFor(m), sector_rates: sectorRates, built_house_rate: houses[0] || null,
    period: rates().period, booking: booking ? bookingOut(booking) : null,
    available: m.status === 'Available' || (m.status === 'On hold' && m.hold_cnic === cnic),
  };
}

// ---------- Booking ----------

function bookingOut(b) {
  const m = db.get('SELECT * FROM market_plots WHERE listing_id = ?', b.listing_id);
  return { ...b, plan_detail: JSON.parse(b.plan_json), plan_json: undefined, plot: m ? listingOut(m) : null, hold_until: m?.hold_until };
}

function myBookings(cnic) {
  expireHolds();
  return db.all('SELECT * FROM bookings WHERE cnic = ? ORDER BY created_at DESC', cnic).map(bookingOut);
}

const payRef = () => `1B${Date.now().toString().slice(-8)}${crypto.randomInt(10, 99)}`;
const err = (status, message) => Object.assign(new Error(message), { status });

// Step 1: choose a plan and pay the token (demo payment). The plot is held for the buyer.
function book(id, cnic, planId) {
  expireHolds();
  const person = db.get('SELECT * FROM persons WHERE cnic = ?', cnic);
  if (!person) throw err(401, 'Please sign in first.');
  const m = db.get('SELECT * FROM market_plots WHERE listing_id = ?', id);
  if (!m) throw err(404, 'Plot not found.');
  if (m.status !== 'Available') throw err(409, m.hold_cnic === cnic ? 'You have already booked this plot.' : 'Sorry, this plot has just been booked by someone else.');
  const plan = planOptions(m.base_price).find(p => p.id === planId);
  if (!plan) throw err(400, 'Please choose a payment plan.');
  const open = db.get("SELECT COUNT(*) n FROM bookings WHERE cnic = ? AND status = 'token_paid'", cnic).n;
  if (open >= 2) throw err(409, 'You already have two bookings waiting for a down payment. Complete or cancel one first.');

  const bid = `BK-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();
  const until = new Date(now.getTime() + RULES.holdHours * 3600000).toISOString();
  db.tx(() => {
    db.run("UPDATE market_plots SET status = 'On hold', hold_cnic = ?, hold_until = ? WHERE listing_id = ? AND status = 'Available'", cnic, until, id);
    db.run(`INSERT INTO bookings (id, listing_id, cnic, plan, plan_json, price, token_amount, token_ref, token_paid_at, status, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, bid, id, cnic, plan.id, JSON.stringify(plan), plan.total, m.token_amount, payRef(), now.toISOString(), 'token_paid', now.toISOString());
  });
  portal.notify(cnic, { kind: 'market', title: `Plot ${m.plot_no}, ${m.phase_label} ${m.sector}: booked`, body: `Token received. Pay the ${plan.quarters ? 'down payment' : 'balance'} by ${new Date(until).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} to get the allotment.` });
  portal.log(cnic, 'plot_booked', { booking: bid, listing: id, plan: plan.id });
  return bookingOut(db.get('SELECT * FROM bookings WHERE id = ?', bid));
}

// Step 2: down payment (or full balance). DHA allots the plot: the buyer becomes a member.
function pay(bookingId, cnic) {
  expireHolds();
  const b = db.get('SELECT * FROM bookings WHERE id = ? AND cnic = ?', bookingId, cnic);
  if (!b) throw err(404, 'Booking not found.');
  if (b.status !== 'token_paid') throw err(409, b.status === 'expired' ? 'This booking has expired.' : 'This booking is already complete.');
  const m = db.get('SELECT * FROM market_plots WHERE listing_id = ?', b.listing_id);
  const plan = JSON.parse(b.plan_json);
  const now = new Date();
  const membershipNo = `DHAI-${m.phase}${m.sector.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}-${m.use === 'commercial' ? 'C' : ''}${m.plot_no.padStart(4, '0')}`;
  const plotId = `PH${m.phase}-${m.sector.replace(/\s+/g, '')}-${m.street.replace(/\s+/g, '')}-${m.plot_no}${m.use === 'commercial' ? 'C' : ''}`;
  const sizeLabel = `${m.size} (${m.sqyd} sq yd)`;
  const ref = payRef();
  db.tx(() => {
    db.run('INSERT OR IGNORE INTO plots (plot_id, phase, sector, street, plot_no, size_label, category, lat, lng, built) VALUES (?,?,?,?,?,?,?,?,?,0)',
      plotId, m.phase, m.sector, m.street, m.plot_no, sizeLabel, m.use === 'commercial' ? 'Commercial' : 'Residential', null, null);
    db.run('INSERT INTO memberships (membership_no, cnic, plot_id, membership_type, status, allotted_on, document) VALUES (?,?,?,?,?,?,?)',
      membershipNo, cnic, plotId, 'Allottee', 'Active', isoDate(now), 'Provisional allotment letter (marketplace)');
    const ins = db.open().prepare('INSERT INTO installments (membership_no, no, label, due_date, amount, paid_amount, paid_on) VALUES (?,?,?,?,?,?,?)');
    ins.run(membershipNo, 0, plan.quarters ? 'Token and down payment' : 'Full payment', isoDate(now), plan.down, plan.down, isoDate(now));
    for (let i = 1; i <= plan.quarters; i++) {
      const amount = i === plan.quarters ? plan.total - plan.down - plan.each * (plan.quarters - 1) : plan.each;
      ins.run(membershipNo, i, `Instalment ${i} of ${plan.quarters}`, isoDate(addMonths(now, 3 * i)), amount, 0, null);
    }
    db.run("UPDATE market_plots SET status = 'Sold', hold_until = NULL WHERE listing_id = ?", m.listing_id);
    db.run("UPDATE bookings SET status = 'allotted', down_ref = ?, down_paid_at = ?, membership_no = ? WHERE id = ?", ref, now.toISOString(), membershipNo, b.id);
  });
  portal.notify(cnic, { kind: 'market', title: `Plot allotted: membership ${membershipNo}`, body: `Welcome to DHA as a member. Plot ${m.plot_no}, ${m.phase_label}, Sector ${m.sector} is now in My account${plan.quarters ? ', with your instalment schedule' : ''}.` });
  portal.log(cnic, 'plot_allotted', { booking: b.id, membership_no: membershipNo });
  return bookingOut(db.get('SELECT * FROM bookings WHERE id = ?', b.id));
}

function cancel(bookingId, cnic) {
  const b = db.get("SELECT * FROM bookings WHERE id = ? AND cnic = ? AND status = 'token_paid'", bookingId, cnic);
  if (!b) throw err(404, 'No open booking with that number.');
  db.tx(() => {
    db.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", b.id);
    db.run("UPDATE market_plots SET status = 'Available', hold_cnic = NULL, hold_until = NULL WHERE listing_id = ?", b.listing_id);
  });
  portal.log(cnic, 'booking_cancelled', { booking: b.id });
  return bookingOut(db.get('SELECT * FROM bookings WHERE id = ?', b.id));
}

// ---------- Rates (for the assistant and the plot page) ----------

function lookupRates({ phase, sector, size, use } = {}) {
  const norm = s => String(s || '').toLowerCase().replace(/^phase\s*/, '').replace(/[^a-z0-9]/g, '');
  const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7' };
  const ph = norm(phase);
  const phaseId = ROMAN[ph] || ph;
  const rows = rates().rates.filter(r =>
    (!phaseId || norm(r.phase) === phaseId || norm(r.phase_label).includes(phaseId)) &&
    (!sector || norm(r.sector) === norm(sector) || norm(r.sector).startsWith(norm(sector))) &&
    (!size || norm(r.size) === norm(size) || norm(r.size).startsWith(norm(size))) &&
    (!use || r.use === use));
  return { source: rates().source, period: rates().period, status: rates().status, count: rows.length, rates: rows.slice(0, 40) };
}

module.exports = { RULES, seedInventory, filters, list, get, book, pay, cancel, myBookings, lookupRates, planOptions, rates };
