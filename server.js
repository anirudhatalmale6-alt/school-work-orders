require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { db, bumpRev, getRev, DATA_DIR } = require('./db');
const { validatePassword, describeRules, generateTempPassword } = require('./passwords');
const mailer = require('./mailer');
const { seed } = require('./seed');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// How much somebody may type into each box on a request. The browser reads these
// from /api/me rather than carrying its own copy, so the counter under the box and
// the check on the server can never drift apart and disagree with each other.
// Details is deliberately generous: a caretaker describing a leak should never be
// asked to be briefer.
const LIMITS = { title: 300, location: 200, description: 20000 };

// Render / DigitalOcean / nginx all terminate TLS in front of us; without this the
// secure cookie is never set and nobody can stay logged in.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '64kb' }));

if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET is not set. Refusing to start in production with a guessable session key.');
  process.exit(1);
}

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: 'wo.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 1000 * 60 * 60 * 12 // 12 hours — a school day plus a margin
  }
}));

// ---------------------------------------------------------------- helpers ----

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: !!u.active,
    mustChangePassword: !!u.must_change_password,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at
  };
}

function currentUser(req) {
  if (!req.session.userId) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!u || !u.active) return null;
  return u;
}

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Please sign in.' });
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access only.' });
  }
  next();
}

// A user with an expired temporary password can sign in and change it, but must
// not be able to reach any of the ticket endpoints until they do.
function requirePasswordSet(req, res, next) {
  if (req.user.must_change_password) {
    return res.status(403).json({ error: 'Set a new password before continuing.', mustChangePassword: true });
  }
  next();
}

function uid() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function ticketRow(t, history) {
  return {
    id: t.id,
    title: t.title,
    location: t.location,
    description: t.description,
    urgency: t.urgency,
    status: t.status,
    requesterId: t.requester_id,
    requester: t.requester_name,
    dateSubmitted: t.date_submitted,
    dateReceived: t.date_received,
    dateCompleted: t.date_completed,
    completionNote: t.completion_note,
    history: history.filter(h => h.ticket_id === t.id).map(h => ({
      action: h.action,
      by: h.user_name,
      at: h.at,
      note: h.note
    }))
  };
}

function adminEmails() {
  return db.prepare(`SELECT email FROM users WHERE role = 'admin' AND active = 1`)
    .all().map(r => r.email);
}

// ------------------------------------------------------------------ auth ----

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Same response either way, so the form can't be used to discover which
  // addresses have accounts.
  const ok = u && u.active && await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start a session. Please try again.' });
    req.session.userId = u.id;
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), u.id);
    res.json({ user: publicUser(u) });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('wo.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json({
    user: u ? publicUser(u) : null,
    passwordRules: describeRules(),
    mailEnabled: mailer.enabled,
    limits: LIMITS
  });
});

app.post('/api/change-password', requireAuth, async (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');

  if (!await bcrypt.compare(current, req.user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is not correct.' });
  }
  const problem = validatePassword(next, req.user.email);
  if (problem) return res.status(400).json({ error: problem });

  const hash = await bcrypt.hash(next, 12);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hash, req.user.id);
  res.json({ ok: true });
});

// --------------------------------------------------------------- tickets ----

app.get('/api/rev', requireAuth, (req, res) => {
  res.json({ rev: getRev() });
});

app.get('/api/state', requireAuth, requirePasswordSet, (req, res) => {
  const tickets = db.prepare('SELECT * FROM tickets ORDER BY date_submitted DESC').all();
  const history = db.prepare('SELECT * FROM ticket_history ORDER BY at ASC').all();
  const dismissed = db.prepare('SELECT ticket_id FROM dismissals WHERE user_id = ?')
    .all(req.user.id).map(r => r.ticket_id);

  res.json({
    rev: getRev(),
    user: publicUser(req.user),
    tickets: tickets.map(t => ticketRow(t, history)),
    dismissed
  });
});

app.post('/api/tickets', requireAuth, requirePasswordSet, async (req, res) => {
  const title = String(req.body.title || '').trim();
  const location = String(req.body.location || '').trim();
  const description = String(req.body.description || '').trim();
  const urgency = ['low', 'normal', 'urgent'].includes(req.body.urgency) ? req.body.urgency : 'normal';

  if (!title || !location) {
    return res.status(400).json({ error: 'Please fill in what needs fixing and the location.' });
  }
  // Say which box is too long and by how much. The old message named no field,
  // so somebody with a long request had to guess which one to cut down.
  const tooLong = [
    ['What needs fixing', title, LIMITS.title],
    ['Location / Room', location, LIMITS.location],
    ['Details', description, LIMITS.description]
  ].find(([, value, max]) => value.length > max);

  if (tooLong) {
    const [label, value, max] = tooLong;
    return res.status(400).json({
      error: `"${label}" is ${value.length.toLocaleString('en-US')} characters. `
           + `The limit is ${max.toLocaleString('en-US')} — please shorten it by `
           + `${(value.length - max).toLocaleString('en-US')}.`
    });
  }

  const id = uid();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`INSERT INTO tickets
      (id, title, location, description, urgency, status, requester_id, requester_name, date_submitted)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
      .run(id, title, location, description, urgency, req.user.id, req.user.name, now);
    db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at)
      VALUES (?, 'submitted', ?, ?, ?)`)
      .run(id, req.user.id, req.user.name, now);
    bumpRev();
  })();

  res.json({ ok: true, id });

  mailer.send({
    to: adminEmails().join(','),
    subject: `[Work Orders] ${urgency === 'urgent' ? 'URGENT — ' : ''}${title}`,
    text: `${req.user.name} submitted a new request.\n\n`
        + `What: ${title}\nWhere: ${location}\nUrgency: ${urgency}\n\n`
        + `${description || '(no further details given)'}\n`
  });
});

app.post('/api/tickets/:id/receive', requireAuth, requirePasswordSet, requireAdmin, (req, res) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'That request no longer exists.' });
  if (t.status !== 'open') return res.status(409).json({ error: 'That request has already been picked up.' });

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE tickets SET status = 'received', date_received = ? WHERE id = ?`).run(now, t.id);
    db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at)
      VALUES (?, 'received', ?, ?, ?)`).run(t.id, req.user.id, req.user.name, now);
    bumpRev();
  })();
  res.json({ ok: true });
});

app.post('/api/tickets/:id/complete', requireAuth, requirePasswordSet, requireAdmin, (req, res) => {
  // Was capped at 2,000 and quietly cut the rest off, so a long note from
  // maintenance lost its ending with nobody told. Same generous limit as Details.
  const note = String(req.body.note || '').trim().slice(0, LIMITS.description);
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'That request no longer exists.' });
  if (t.status === 'completed') return res.status(409).json({ error: 'That request is already marked complete.' });

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE tickets SET status = 'completed', date_completed = ?, completion_note = ? WHERE id = ?`)
      .run(now, note, t.id);
    db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at, note)
      VALUES (?, 'completed', ?, ?, ?, ?)`).run(t.id, req.user.id, req.user.name, now, note);
    bumpRev();
  })();
  res.json({ ok: true });

  const requester = db.prepare('SELECT email FROM users WHERE id = ?').get(t.requester_id);
  mailer.send({
    to: requester && requester.email,
    subject: `[Work Orders] Completed — ${t.title}`,
    text: `${req.user.name} marked your request complete.\n\n`
        + `What: ${t.title}\nWhere: ${t.location}\n\n`
        + (note ? `Note from maintenance: ${note}\n` : '')
  });
});

app.post('/api/tickets/:id/ack', requireAuth, requirePasswordSet, (req, res) => {
  const t = db.prepare('SELECT id FROM tickets WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'That request no longer exists.' });
  db.prepare('INSERT OR IGNORE INTO dismissals (user_id, ticket_id) VALUES (?, ?)')
    .run(req.user.id, t.id);
  res.json({ ok: true });
});

// ----------------------------------------------------------- user admin ----

app.get('/api/users', requireAuth, requirePasswordSet, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY role DESC, name COLLATE NOCASE ASC').all();
  res.json({ users: users.map(publicUser) });
});

app.post('/api/users', requireAuth, requirePasswordSet, requireAdmin, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const role = req.body.role === 'admin' ? 'admin' : 'staff';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!name) return res.status(400).json({ error: 'Please enter the person\'s name.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'There is already an account with that email address.' });
  }

  const temp = generateTempPassword();
  db.prepare(`INSERT INTO users (email, name, password_hash, role, must_change_password, created_at)
    VALUES (?, ?, ?, ?, 1, ?)`)
    .run(email, name, await bcrypt.hash(temp, 12), role, new Date().toISOString());

  res.json({ ok: true, tempPassword: temp });
});

app.post('/api/users/:id/reset-password', requireAuth, requirePasswordSet, requireAdmin, async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No such account.' });

  const temp = generateTempPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
    .run(await bcrypt.hash(temp, 12), u.id);
  res.json({ ok: true, tempPassword: temp });
});

app.post('/api/users/:id/role', requireAuth, requirePasswordSet, requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No such account.' });
  const role = req.body.role === 'admin' ? 'admin' : 'staff';

  // Guard against the school locking itself out of its own portal.
  if (u.role === 'admin' && role === 'staff') {
    const admins = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1`).get().c;
    if (admins <= 1) return res.status(409).json({ error: 'This is the last administrator — promote someone else first.' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
  res.json({ ok: true });
});

app.post('/api/users/:id/active', requireAuth, requirePasswordSet, requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No such account.' });
  const active = req.body.active ? 1 : 0;

  if (!active) {
    if (u.id === req.user.id) return res.status(409).json({ error: 'You cannot switch off your own account.' });
    if (u.role === 'admin') {
      const admins = db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND active = 1`).get().c;
      if (admins <= 1) return res.status(409).json({ error: 'This is the last administrator — promote someone else first.' });
    }
  }

  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active, u.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- static ----

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/healthz', (req, res) => res.json({ ok: true }));

// ------------------------------------------------------------ first boot ----

seed();

app.listen(PORT, () => {
  console.log(`Work Orders running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
});
