const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

function genToken(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
}

const DEFAULT_SETTINGS = {
  org_name: 'Eventcraft',
  base_url: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: ''
};

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      starts_at INTEGER NOT NULL,            -- epoch ms UTC
      ends_at INTEGER,
      location TEXT DEFAULT '',              -- physical address or virtual link
      is_virtual INTEGER NOT NULL DEFAULT 0,
      cover_url TEXT DEFAULT '',
      questions_json TEXT NOT NULL DEFAULT '[]',  -- [{key,label,required}]
      published INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ticket_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_cents INTEGER NOT NULL DEFAULT 0,          -- integer cents, always
      earlybird_price_cents INTEGER,                   -- optional early-bird price (cents)
      earlybird_until INTEGER,                         -- epoch ms; early-bird active strictly before this
      quantity INTEGER NOT NULL DEFAULT 0,             -- 0 = unlimited
      sold INTEGER NOT NULL DEFAULT 0,
      payment_link TEXT DEFAULT '',                    -- BYO Stripe Payment Link (no platform fee)
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      tier_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      custom_answers_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'confirmed',        -- confirmed | waitlist | cancelled
      price_cents INTEGER NOT NULL DEFAULT 0,          -- price locked at registration time
      ticket_token TEXT UNIQUE,                        -- QR check-in code (confirmed only)
      checked_in_at INTEGER,
      stripe_payment_id TEXT DEFAULT '',
      paid INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    CREATE INDEX IF NOT EXISTS idx_tiers_event ON ticket_tiers(event_id);
    CREATE INDEX IF NOT EXISTS idx_regs_event ON registrations(event_id, status);
    CREATE INDEX IF NOT EXISTS idx_regs_tier ON registrations(tier_id, status);
  `);

  return db;
}

function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function setSettings(db, patch) {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) up.run(k, String(v ?? ''));
  }
}

module.exports = { openDb, genToken, slugify, getSettings, setSettings, DEFAULT_SETTINGS };
