// Core prototype data (store/core.sqlite): the systems of record the portals read through adapters.
// CNIC is the unique ID across every portal and the CMS (decision of 5 Nov 2026).
// Built by core/seed.js; the CMS stub keeps its own database (cms_stub/cms.js).

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const STORE_DIR = path.resolve(__dirname, '..', 'store');
const CORE_DB = path.join(STORE_DIR, 'core.sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS persons (
  cnic TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT, email TEXT,
  persona TEXT,              -- demo persona key, NULL for people seeded from the CMS export
  persona_label TEXT
);
CREATE TABLE IF NOT EXISTS plots (
  plot_id TEXT PRIMARY KEY, phase TEXT, sector TEXT, street TEXT, plot_no TEXT,
  size_label TEXT, category TEXT, lat REAL, lng REAL, built INTEGER DEFAULT 0,
  property_code TEXT, dimensions TEXT   -- from the membership portal (tp_properties): '1 /C  /000014/01', '35x65'
);
CREATE TABLE IF NOT EXISTS memberships (
  membership_no TEXT PRIMARY KEY, cnic TEXT NOT NULL REFERENCES persons(cnic), plot_id TEXT REFERENCES plots(plot_id),
  membership_type TEXT, status TEXT, allotted_on TEXT, document TEXT
);
CREATE TABLE IF NOT EXISTS residences (
  cnic TEXT NOT NULL REFERENCES persons(cnic), plot_id TEXT NOT NULL REFERENCES plots(plot_id),
  consumer_id TEXT, since TEXT, PRIMARY KEY (cnic, plot_id)
);
CREATE TABLE IF NOT EXISTS installments (
  membership_no TEXT NOT NULL, no INTEGER NOT NULL, label TEXT, due_date TEXT, amount INTEGER,
  paid_amount INTEGER DEFAULT 0, paid_on TEXT, PRIMARY KEY (membership_no, no)
);
CREATE TABLE IF NOT EXISTS bills (
  consumer_id TEXT NOT NULL, month TEXT NOT NULL, amount INTEGER, due_date TEXT, paid_on TEXT, payment_ref TEXT,
  PRIMARY KEY (consumer_id, month)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cnic TEXT NOT NULL, at TEXT NOT NULL, kind TEXT, title TEXT, body TEXT,
  ref TEXT, actions TEXT, read INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS follows (
  cnic TEXT NOT NULL, ref TEXT NOT NULL, at TEXT, PRIMARY KEY (cnic, ref)
);
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY, cnic TEXT NOT NULL, at TEXT NOT NULL, status TEXT, summary TEXT, transcript TEXT
);
CREATE TABLE IF NOT EXISTS channel_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, cnic TEXT, event TEXT, detail TEXT
);
-- DHA Marketplace (simulated): DHA-owned plots for sale and bookings against them (core/market.js)
CREATE TABLE IF NOT EXISTS market_plots (
  listing_id TEXT PRIMARY KEY, phase TEXT, phase_label TEXT, sector TEXT, street TEXT, plot_no TEXT,
  use TEXT, kind TEXT, size TEXT, sqyd INTEGER, base_price INTEGER, token_amount INTEGER,
  status TEXT NOT NULL DEFAULT 'Available',  -- Available, On hold, Sold
  hold_cnic TEXT, hold_until TEXT, rate_min INTEGER, rate_max INTEGER, rate_page INTEGER
);
CREATE TABLE IF NOT EXISTS build_progress (    -- the owner's own construction checklist (guidance only; not DHA's workflow)
  membership_no TEXT NOT NULL, stage TEXT NOT NULL, done_at TEXT NOT NULL, PRIMARY KEY (membership_no, stage)
);
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES market_plots(listing_id), cnic TEXT NOT NULL REFERENCES persons(cnic),
  plan TEXT, plan_json TEXT, price INTEGER, token_amount INTEGER, token_ref TEXT, token_paid_at TEXT,
  down_ref TEXT, down_paid_at TEXT, membership_no TEXT,
  status TEXT NOT NULL,                      -- token_paid, allotted, expired, cancelled
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_market ON market_plots(status, phase, use, size);
CREATE INDEX IF NOT EXISTS ix_notif ON notifications(cnic, read);
CREATE INDEX IF NOT EXISTS ix_member_cnic ON memberships(cnic);
`;

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(STORE_DIR, { recursive: true });
  db = new DatabaseSync(CORE_DB);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function reset() {
  // Drop and recreate the tables rather than deleting the file, so a reseed works while the server has it open.
  const d = open();
  d.exec('PRAGMA foreign_keys = OFF;');
  for (const { name } of d.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) d.exec(`DROP TABLE IF EXISTS "${name}"`);
  d.exec(SCHEMA);
  d.exec('PRAGMA foreign_keys = ON; VACUUM;');
  return d;
}

const all = (sql, ...p) => open().prepare(sql).all(...p);
const get = (sql, ...p) => open().prepare(sql).get(...p);
const run = (sql, ...p) => open().prepare(sql).run(...p);

function tx(fn) {
  const d = open();
  d.exec('BEGIN');
  try { const r = fn(); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; }
}

module.exports = { open, reset, all, get, run, tx, CORE_DB, STORE_DIR };
