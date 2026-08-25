// Keeps signed-in sessions in the same database the rest of the app already uses.
//
// This used to be the `connect-sqlite3` package, which quietly brought a second,
// older SQLite driver along with it. That driver needed a compiler toolchain to
// install, and the toolchain is what produced the "7 vulnerabilities" warning on
// every deploy — all of it in build machinery, none of it in the running site.
// Since we already ship better-sqlite3 for the tickets, sessions can simply share
// it, and the second driver disappears along with the warning.
//
// express-session only asks a store for a handful of things; the rest of the
// Store base class fills itself in from these.

const session = require('express-session');
const { db } = require('./db');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

// A session with no explicit expiry still has to go eventually, or the row would
// sit there for ever. This matches the 12-hour cookie set in server.js.
const FALLBACK_TTL_MS = 1000 * 60 * 60 * 12;

function expiryOf(sess) {
  const cookieExpiry = sess && sess.cookie && sess.cookie.expires;
  if (cookieExpiry) return new Date(cookieExpiry).getTime();
  return Date.now() + FALLBACK_TTL_MS;
}

const stmts = {
  get: db.prepare(`SELECT data, expires_at FROM sessions WHERE sid = ?`),
  set: db.prepare(`INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
                   ON CONFLICT(sid) DO UPDATE SET expires_at = excluded.expires_at,
                                                  data       = excluded.data`),
  touch: db.prepare(`UPDATE sessions SET expires_at = ? WHERE sid = ?`),
  destroy: db.prepare(`DELETE FROM sessions WHERE sid = ?`),
  clear: db.prepare(`DELETE FROM sessions`),
  length: db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?`),
  all: db.prepare(`SELECT sid, data FROM sessions WHERE expires_at > ?`),
  reap: db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`)
};

class BetterSqliteStore extends session.Store {
  constructor() {
    super();
    // Clear out anything that expired while the site was asleep, then keep
    // tidying hourly. unref() so this timer never holds the process open.
    this.reap();
    this.timer = setInterval(() => this.reap(), 1000 * 60 * 60);
    if (this.timer.unref) this.timer.unref();
  }

  reap() {
    try { stmts.reap.run(Date.now()); } catch (err) {
      console.error('[sessions] cleanup failed:', err.message);
    }
  }

  get(sid, cb) {
    try {
      const row = stmts.get.get(sid);
      if (!row) return cb(null, null);
      if (row.expires_at <= Date.now()) {
        stmts.destroy.run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.data));
    } catch (err) {
      // A session we cannot read is treated as absent: the person is asked to
      // sign in again, rather than meeting an error page.
      return cb(null, null);
    }
  }

  set(sid, sess, cb) {
    try {
      stmts.set.run(sid, expiryOf(sess), JSON.stringify(sess));
      return cb(null);
    } catch (err) { return cb(err); }
  }

  // Called on every request because `rolling: true` keeps extending the session
  // while somebody is actually working.
  touch(sid, sess, cb) {
    try {
      stmts.touch.run(expiryOf(sess), sid);
      return cb(null);
    } catch (err) { return cb(err); }
  }

  destroy(sid, cb) {
    try {
      stmts.destroy.run(sid);
      return cb(null);
    } catch (err) { return cb(err); }
  }

  length(cb) {
    try { return cb(null, stmts.length.get(Date.now()).n); }
    catch (err) { return cb(err); }
  }

  clear(cb) {
    try { stmts.clear.run(); return cb(null); }
    catch (err) { return cb(err); }
  }

  all(cb) {
    try {
      return cb(null, stmts.all.all(Date.now()).map(r => JSON.parse(r.data)));
    } catch (err) { return cb(err); }
  }
}

module.exports = BetterSqliteStore;
