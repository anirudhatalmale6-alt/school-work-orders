// Account and sample-data seeding.
//
// Two jobs:
//   1. Create the first administrator on a brand new database, so somebody can
//      get in. This is the normal, permanent behaviour.
//   2. Optionally re-create a set of named accounts and a handful of sample
//      tickets. That exists for the trial period on a free host, where the
//      database is wiped whenever the service sleeps — without it, the portal
//      would come back up empty and look broken. Both steps only ever run when
//      the relevant table is empty, so they never touch real data.
//
// Real staff email addresses are supplied through the host's settings, never
// committed here.

const bcrypt = require('bcryptjs');
const { db, bumpRev, getSetting, setSetting } = require('./db');
const { generateTempPassword } = require('./passwords');

// "Name | email | role | password" — one per line, or separated by semicolons.
// Role is 'admin' or 'staff'; leave the password off and one is generated and
// printed to the log.
function parseSeedUsers(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, email, role, password] = line.split('|').map((f) => (f || '').trim());
      if (!name || !email) return null;
      return {
        name,
        email: email.toLowerCase(),
        role: role === 'admin' ? 'admin' : 'staff',
        password: password || generateTempPassword(),
        generated: !password
      };
    })
    .filter(Boolean);
}

function insertUser({ name, email, role, password, mustChange }) {
  db.prepare(`INSERT INTO users (email, name, password_hash, role, must_change_password, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(email, name, bcrypt.hashSync(password, 12), role, mustChange ? 1 : 0, new Date().toISOString());
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function seedUsers() {
  const empty = db.prepare('SELECT COUNT(*) c FROM users').get().c === 0;
  if (!empty) return;

  const created = [];

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.org').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || generateTempPassword();
  created.push({
    ...insertUser({
      name: process.env.ADMIN_NAME || 'Administrator',
      email: adminEmail,
      role: 'admin',
      password: adminPassword,
      // A password supplied by the host is deliberate, so it is left alone; a
      // generated one is temporary and has to be replaced at first sign-in.
      mustChange: !process.env.ADMIN_PASSWORD
    }),
    plainPassword: process.env.ADMIN_PASSWORD ? null : adminPassword
  });

  for (const u of parseSeedUsers(process.env.SEED_USERS)) {
    if (u.email === adminEmail) continue;
    // Named accounts are handed out in advance, so they are not forced through
    // a password change — that would break every time a free host restarts.
    created.push({ ...insertUser({ ...u, mustChange: false }), plainPassword: u.generated ? u.password : null });
  }

  console.log('\n=== accounts created on this empty database ===');
  for (const u of created) {
    console.log(`  ${u.role.padEnd(5)}  ${u.email}` + (u.plainPassword ? `   password: ${u.plainPassword}` : ''));
  }
  console.log('==============================================\n');
}

const SAMPLE_TICKETS = [
  {
    title: 'Ceiling tile stained and sagging',
    location: 'Room 114',
    description: 'Water mark above the window, getting bigger since last week.',
    urgency: 'normal',
    status: 'received',
    hoursAgo: 52
  },
  {
    title: 'Cafeteria door will not latch',
    location: 'Cafeteria — east door',
    description: 'Door swings back open unless you pull it hard. Security concern at dismissal.',
    urgency: 'urgent',
    status: 'open',
    hoursAgo: 20
  },
  {
    title: 'Two overhead lights out',
    location: 'Library',
    description: 'Back corner over the reading table.',
    urgency: 'low',
    status: 'open',
    hoursAgo: 8
  },
  {
    title: 'Gym water fountain not running',
    location: 'Gym — north wall',
    description: 'No water at all. The one by the locker rooms still works.',
    urgency: 'normal',
    status: 'pending',
    pendingReason: 'Waiting on the replacement valve — ordered Tuesday, due end of the week.',
    hoursAgo: 70
  },
  {
    title: 'Thermostat stuck at 78',
    location: 'Room 208',
    description: 'Room is very warm all afternoon regardless of the setting.',
    urgency: 'normal',
    status: 'completed',
    completionNote: 'Replaced the batteries and recalibrated. Holding at 71 now.',
    hoursAgo: 96
  },
  {
    title: 'Playground gate hinge loose',
    location: 'Lower playground',
    description: 'Bottom hinge has worked its way loose from the post.',
    urgency: 'normal',
    status: 'completed',
    completionNote: 'New hardware fitted and the post packed out.',
    hoursAgo: 140
  }
];

function seedSampleTickets() {
  if (process.env.DEMO_TICKETS !== '1') return;
  if (db.prepare('SELECT COUNT(*) c FROM tickets').get().c > 0) return;

  const users = db.prepare('SELECT * FROM users WHERE active = 1 ORDER BY id').all();
  if (!users.length) return;
  const admins = users.filter((u) => u.role === 'admin');
  if (!admins.length) return;

  // Spread the samples over several names so the board looks like a real week's
  // work rather than one person filing everything.
  const requesters = users.filter((u) => u.role === 'staff');
  const pool = requesters.length >= 2 ? requesters : users;
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

  db.transaction(() => {
    SAMPLE_TICKETS.forEach((s, i) => {
      const requester = pool[i % pool.length];
      const admin = admins[i % admins.length];
      const id = 'demo' + (i + 1);
      const submitted = at(s.hoursAgo);

      db.prepare(`INSERT INTO tickets
        (id, title, location, description, urgency, status, requester_id, requester_name,
         date_submitted, date_received, date_pending, pending_reason, date_completed, completion_note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id, s.title, s.location, s.description, s.urgency, s.status,
          requester.id, requester.name, submitted,
          s.status === 'open' ? null : at(s.hoursAgo - 2),
          s.status === 'pending' ? at(s.hoursAgo - 4) : null,
          s.pendingReason || '',
          s.status === 'completed' ? at(s.hoursAgo - 5) : null,
          s.completionNote || ''
        );

      db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at)
        VALUES (?, 'submitted', ?, ?, ?)`).run(id, requester.id, requester.name, submitted);
      if (s.status !== 'open') {
        db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at)
          VALUES (?, 'received', ?, ?, ?)`).run(id, admin.id, admin.name, at(s.hoursAgo - 2));
      }
      if (s.status === 'pending') {
        db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at, note)
          VALUES (?, 'pending', ?, ?, ?, ?)`)
          .run(id, admin.id, admin.name, at(s.hoursAgo - 4), s.pendingReason || '');
      }
      if (s.status === 'completed') {
        db.prepare(`INSERT INTO ticket_history (ticket_id, action, user_id, user_name, at, note)
          VALUES (?, 'completed', ?, ?, ?, ?)`)
          .run(id, admin.id, admin.name, at(s.hoursAgo - 5), s.completionNote || '');
      }
    });
    bumpRev();
  })();

  console.log(`Seeded ${SAMPLE_TICKETS.length} sample tickets (DEMO_TICKETS=1).`);
}

// The emergency contact is normally typed in on the Staff tab and stays put.
// These settings only fill it in when it has never been set, which matters on the
// free trial host: that wipes the database when it sleeps, and without this the
// notice would quietly disappear from the form overnight.
function seedEmergencyContact() {
  const name = (process.env.EMERGENCY_CONTACT_NAME || '').trim();
  const phone = (process.env.EMERGENCY_CONTACT_PHONE || '').trim();
  if (!name || !phone) return;
  if (getSetting('emergency_name') || getSetting('emergency_phone')) return;

  setSetting('emergency_name', name);
  setSetting('emergency_phone', phone);
  setSetting('emergency_note', (process.env.EMERGENCY_CONTACT_NOTE || '').trim());
  console.log(`Emergency contact set from the host settings: ${name}.`);
}

function seed() {
  seedUsers();
  seedEmergencyContact();
  seedSampleTickets();
}

module.exports = { seed, parseSeedUsers };
