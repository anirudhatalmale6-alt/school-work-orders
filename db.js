const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'workorders.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name                 TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'staff',
  active               INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL,
  last_login_at        TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  location        TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  urgency         TEXT NOT NULL DEFAULT 'normal',
  status          TEXT NOT NULL DEFAULT 'open',
  requester_id    INTEGER NOT NULL REFERENCES users(id),
  requester_name  TEXT NOT NULL,
  date_submitted  TEXT NOT NULL,
  date_received   TEXT,
  date_completed  TEXT,
  completion_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  action    TEXT NOT NULL,
  user_id   INTEGER REFERENCES users(id),
  user_name TEXT NOT NULL,
  at        TEXT NOT NULL,
  note      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_history_ticket ON ticket_history(ticket_id);

CREATE TABLE IF NOT EXISTS dismissals (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, ticket_id)
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Columns added after the first version shipped. Adding them here rather than in
// the CREATE TABLE above means a database that already holds real requests picks
// them up on the next start, without anyone having to touch it.
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('tickets', 'date_pending', 'TEXT');
addColumn('tickets', 'pending_reason', `TEXT NOT NULL DEFAULT ''`);

// `rev` is bumped on every write so browsers can cheaply poll for changes.
db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('rev', '1')`).run();

// Small pieces of text the office can change for itself — the emergency contact
// shown on the request form, for instance. Kept in the database rather than in
// the code so nobody needs a developer to correct a phone number.
function getSetting(key, fallback = '') {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get('setting:' + key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run('setting:' + key, String(value));
}

function bumpRev() {
  db.prepare(`UPDATE meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'rev'`).run();
}

function getRev() {
  return Number(db.prepare(`SELECT value FROM meta WHERE key = 'rev'`).get().value);
}

module.exports = { db, bumpRev, getRev, getSetting, setSetting, DATA_DIR };
