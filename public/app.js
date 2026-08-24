const URGENCY_LABEL = { low: 'Low', normal: 'Normal', urgent: 'Urgent' };
const STATUS_LABEL = { open: 'Open', received: 'Received', completed: 'Completed' };
const POLL_MS = 5000;

let tickets = [];
let dismissedIds = [];
let me = null;
let rev = 0;
let currentFilter = 'all';
let currentTab = 'new';
let selectedUrgency = 'normal';
let selectedRole = 'staff';
let pollTimer = null;

// ------------------------------------------------------------------ api ----

async function api(path, options) {
  const res = await fetch(path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  }, options || {}));

  let body = {};
  try { body = await res.json(); } catch (e) { /* empty body */ }

  if (res.status === 401 && me) {
    // Session expired while the tab was open — drop back to the sign-in screen
    // rather than leaving a dead page behind.
    showLogin('Your session has expired. Please sign in again.');
    throw new Error('signed out');
  }
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

// A sleeping host is not a broken portal. The trial host stops the service when
// nobody has used it for a while, and for a few seconds either side of waking up
// its router answers as though nothing is there. Read requests retry quietly
// rather than dropping somebody onto an empty screen.
//
// Only ever use this for reads. Retrying a sign-in would burn through the
// login attempt limit on a mistyped password.
async function apiRetry(path, tries = 5) {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await api(path);
    } catch (ex) {
      if (ex.message === 'signed out') throw ex;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error('The server did not answer. It may still be waking up — please try again in a moment.');
}

// --------------------------------------------------------------- helpers ----

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' +
         d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const isAdmin = () => !!me && me.role === 'admin';

function screen(which) {
  document.getElementById('gateScreen').style.display = which === 'login' ? 'flex' : 'none';
  document.getElementById('pwScreen').style.display = which === 'password' ? 'flex' : 'none';
  document.getElementById('appRoot').style.display = which === 'app' ? 'block' : 'none';
}

// -------------------------------------------------------------- sign in ----

function showLogin(message) {
  me = null;
  tickets = [];
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  document.getElementById('gateErr').textContent = message || '';
  document.getElementById('loginPassword').value = '';
  screen('login');
  document.getElementById('loginEmail').focus();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('gateErr');
  const btn = document.getElementById('loginSubmit');
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const out = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      })
    });
    me = out.user;
    document.getElementById('loginPassword').value = '';
    await afterSignIn();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

async function afterSignIn() {
  if (me.mustChangePassword) {
    document.getElementById('pwWho').textContent = me.email;
    screen('password');
    document.getElementById('pwCurrent').focus();
    return;
  }
  document.body.classList.toggle('is-admin', isAdmin());
  // Load the board before showing it. Handing somebody an empty screen because
  // the first read happened to fail looks like the portal has lost their work.
  await refresh(true);
  screen('app');
  if (!pollTimer) pollTimer = setInterval(poll, POLL_MS);
}

document.getElementById('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('pwErr');
  const next = document.getElementById('pwNext').value;
  err.textContent = '';

  if (next !== document.getElementById('pwConfirm').value) {
    err.textContent = 'The two new passwords do not match.';
    return;
  }
  try {
    await api('/api/change-password', {
      method: 'POST',
      body: JSON.stringify({ current: document.getElementById('pwCurrent').value, next })
    });
    document.getElementById('pwForm').reset();
    me.mustChangePassword = false;
    await afterSignIn();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

// ----------------------------------------------------------- live state ----

async function refresh(force) {
  const state = await apiRetry('/api/state');
  rev = state.rev;
  me = state.user;
  tickets = state.tickets;
  dismissedIds = state.dismissed;
  document.body.classList.toggle('is-admin', isAdmin());
  renderAll();
  if (force && isAdmin()) renderUsers().catch(() => {});
}

// Cheap poll: /api/rev is a single integer, so a quiet portal costs almost
// nothing, and any change anywhere pulls the full board within a few seconds.
async function poll() {
  if (!me || document.hidden) return;
  try {
    const out = await api('/api/rev');
    if (out.rev !== rev) await refresh();
  } catch (e) { /* transient network blip — the next tick retries */ }
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

// ---------------------------------------------------------------- render ----

function renderIdentity() {
  const box = document.getElementById('identityBox');
  if (!me) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="live-dot"></span>Signed in as <b>${escapeHtml(me.name)}</b>`
    + `${isAdmin() ? ' · maintenance' : ''}`
    + ` <button id="changePwBtn">change password</button>`
    + ` <button id="signOutBtn">sign out</button>`;
  document.getElementById('signOutBtn').onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    showLogin('You have been signed out.');
  };
  document.getElementById('changePwBtn').onclick = () => {
    document.getElementById('pwWho').textContent = me.email;
    document.getElementById('pwCurrent').placeholder = 'Current password';
    document.getElementById('pwErr').textContent = '';
    screen('password');
    document.getElementById('pwCurrent').focus();
  };
  document.getElementById('roleNote').textContent = isAdmin()
    ? 'You are on the maintenance team — you can change the status of any request.'
    : 'Status changes are made by the maintenance team.';
  document.getElementById('f-requester').textContent = me.name;
}

function switchTab(name) {
  if (name === 'staff' && !isAdmin()) return;
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  renderAll();
  if (name === 'staff') renderUsers().catch(() => {});
}

function renderToast() {
  const area = document.getElementById('toastArea');
  if (!me) { area.innerHTML = ''; return; }
  const newlyDone = tickets.filter(t => t.requesterId === me.id && t.status === 'completed' && !dismissedIds.includes(t.id));
  if (newlyDone.length === 0) { area.innerHTML = ''; return; }
  const word = newlyDone.length === 1 ? 'request has' : 'requests have';
  area.innerHTML = `<div class="toast">
    <span>✓ ${newlyDone.length} of your ${word} been marked complete.</span>
    <button id="viewCompletedBtn">View</button>
  </div>`;
  document.getElementById('viewCompletedBtn').onclick = () => switchTab('mine');
}

function ticketCard(t, opts) {
  opts = opts || {};
  const canAct = isAdmin() && t.status !== 'completed';
  let actions = '';
  if (canAct) {
    if (t.status === 'open') {
      actions += `<button class="action-btn" data-action="receive" data-id="${t.id}">Mark Received</button>`;
    }
    actions += `<button class="action-btn primary" data-action="complete" data-id="${t.id}">Mark Completed</button>`;
  }
  const note = (t.status === 'completed' && t.completionNote)
    ? `<div class="ticket-note">Completion note: ${escapeHtml(t.completionNote)}</div>` : '';
  const ackBtn = opts.showAck
    ? `<div class="ticket-actions"><button class="action-btn" data-action="ack" data-id="${t.id}">Got it — dismiss</button></div>` : '';

  return `
  <div class="ticket ${opts.highlight ? 'notify-card' : ''}">
    <div class="ticket-top">
      <div>
        <div class="ticket-id">#${t.id.slice(-5).toUpperCase()}</div>
        <div class="ticket-title">${escapeHtml(t.title)}</div>
        <div class="ticket-date">Requested ${fmtDate(t.dateSubmitted)}</div>
      </div>
      <div class="stamp ${t.status}">${STATUS_LABEL[t.status]}</div>
    </div>
    <div class="ticket-meta">
      <span>📍 ${escapeHtml(t.location || '—')}</span>
      <span>🙋 ${escapeHtml(t.requester || '—')}</span>
      <span>⚑ ${URGENCY_LABEL[t.urgency] || 'Normal'}</span>
      ${t.dateReceived ? `<span>📥 Received ${fmtDate(t.dateReceived)}</span>` : ''}
      ${t.dateCompleted ? `<span>✅ Completed ${fmtDate(t.dateCompleted)}</span>` : ''}
    </div>
    ${t.description ? `<div class="ticket-desc">${escapeHtml(t.description)}</div>` : ''}
    ${note}
    ${actions ? `<div class="ticket-actions">${actions}</div>` : ''}
    ${ackBtn}
  </div>`;
}

function renderBoard() {
  const list = document.getElementById('boardList');
  let filtered = tickets.slice();
  if (currentFilter !== 'all') filtered = filtered.filter(t => t.status === currentFilter);
  document.getElementById('boardCount').textContent = tickets.filter(t => t.status !== 'completed').length;
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">No requests here yet.</div>`;
    return;
  }
  list.innerHTML = filtered.map(t => ticketCard(t)).join('');
  list.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleAction));
}

function renderMine() {
  const list = document.getElementById('mineList');
  const mine = tickets.filter(t => me && t.requesterId === me.id);
  document.getElementById('mineCount').textContent = mine.filter(t => t.status !== 'completed').length;
  if (mine.length === 0) {
    list.innerHTML = `<div class="empty">You haven't submitted any requests yet.</div>`;
    return;
  }
  list.innerHTML = mine.map(t => {
    const isNewlyDone = t.status === 'completed' && !dismissedIds.includes(t.id);
    return ticketCard(t, { highlight: isNewlyDone, showAck: isNewlyDone });
  }).join('');
  list.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', handleAction));
}

function renderAudit() {
  const list = document.getElementById('auditList');
  const entries = [];
  tickets.forEach(t => (t.history || []).forEach(h => {
    entries.push(Object.assign({}, h, { ticketTitle: t.title, ticketId: t.id }));
  }));
  entries.sort((a, b) => new Date(b.at) - new Date(a.at));
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty">No activity recorded yet.</div>`;
    return;
  }
  const actionText = { submitted: 'submitted', received: 'marked received', completed: 'marked completed' };
  list.innerHTML = entries.map(h => `
    <div class="audit-row">
      <div class="audit-time">${fmtDate(h.at)}</div>
      <div class="audit-body">
        <span class="audit-action ${h.action}">${h.action}</span>
        <b>${escapeHtml(h.by)}</b> ${actionText[h.action] || h.action}
        “${escapeHtml(h.ticketTitle)}” <span style="color:var(--ink-soft)">(#${h.ticketId.slice(-5).toUpperCase()})</span>
        ${h.note ? `<br><span style="color:var(--ink-soft)">Note: ${escapeHtml(h.note)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderAll() {
  renderIdentity();
  renderToast();
  if (currentTab === 'board') renderBoard();
  if (currentTab === 'mine') renderMine();
  if (currentTab === 'audit') renderAudit();
}

// --------------------------------------------------------------- actions ----

async function handleAction(e) {
  const id = e.currentTarget.dataset.id;
  const action = e.currentTarget.dataset.action;
  e.currentTarget.disabled = true;
  try {
    if (action === 'receive') {
      await api(`/api/tickets/${encodeURIComponent(id)}/receive`, { method: 'POST' });
    } else if (action === 'complete') {
      const note = window.prompt('Add a short completion note (optional):', '') || '';
      await api(`/api/tickets/${encodeURIComponent(id)}/complete`, {
        method: 'POST', body: JSON.stringify({ note })
      });
    } else if (action === 'ack') {
      await api(`/api/tickets/${encodeURIComponent(id)}/ack`, { method: 'POST' });
    }
    await refresh();
  } catch (ex) {
    if (ex.message !== 'signed out') { alert(ex.message); await refresh().catch(() => {}); }
  }
}

document.getElementById('urgencyGroup').addEventListener('click', (e) => {
  const opt = e.target.closest('.urgency-opt');
  if (!opt) return;
  selectedUrgency = opt.dataset.level;
  document.querySelectorAll('#urgencyGroup .urgency-opt').forEach(o => o.classList.toggle('sel', o === opt));
});

document.getElementById('submitBtn').addEventListener('click', async () => {
  const title = document.getElementById('f-title').value.trim();
  const location = document.getElementById('f-location').value.trim();
  const desc = document.getElementById('f-desc').value.trim();
  const note = document.getElementById('formNote');

  if (!title || !location) {
    note.textContent = 'Please fill in what needs fixing and the location.';
    note.style.color = 'var(--stamp-red)';
    return;
  }
  try {
    await api('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title, location, description: desc, urgency: selectedUrgency })
    });
  } catch (ex) {
    note.textContent = ex.message;
    note.style.color = 'var(--stamp-red)';
    return;
  }

  document.getElementById('f-title').value = '';
  document.getElementById('f-location').value = '';
  document.getElementById('f-desc').value = '';
  selectedUrgency = 'normal';
  document.querySelectorAll('#urgencyGroup .urgency-opt').forEach(o => o.classList.toggle('sel', o.dataset.level === 'normal'));
  note.textContent = 'Request submitted. You can track it under "My Requests."';
  note.style.color = 'var(--stamp-green)';

  await refresh();
  setTimeout(() => switchTab('mine'), 700);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.panel)));

document.getElementById('filterGroup').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  currentFilter = chip.dataset.filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
  renderBoard();
});

// ------------------------------------------------------ staff management ----

document.getElementById('roleGroup').addEventListener('click', (e) => {
  const opt = e.target.closest('.urgency-opt');
  if (!opt) return;
  selectedRole = opt.dataset.role;
  document.querySelectorAll('#roleGroup .urgency-opt').forEach(o => o.classList.toggle('sel', o === opt));
});

document.getElementById('addUserBtn').addEventListener('click', async () => {
  const note = document.getElementById('userNote');
  try {
    const out = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('u-name').value.trim(),
        email: document.getElementById('u-email').value.trim(),
        role: selectedRole
      })
    });
    const who = document.getElementById('u-name').value.trim();
    document.getElementById('u-name').value = '';
    document.getElementById('u-email').value = '';
    note.textContent = 'Account created.';
    note.style.color = 'var(--stamp-green)';
    showCredential(`Account created for ${who}.`, out.tempPassword);
    await renderUsers();
  } catch (ex) {
    note.textContent = ex.message;
    note.style.color = 'var(--stamp-red)';
  }
});

// The temporary password is shown once, here, and never stored in readable form —
// so it has to be handed over before this box is dismissed.
function showCredential(headline, tempPassword) {
  const list = document.getElementById('userList');
  const box = document.createElement('div');
  box.className = 'cred-box';
  box.innerHTML = `${escapeHtml(headline)}<br>Temporary password: <code>${escapeHtml(tempPassword)}</code>`
    + `<br>Pass this on to them. They will be asked to choose their own password the first time they sign in. `
    + `It is not shown again after you leave this page.`;
  list.parentNode.insertBefore(box, list);
}

async function renderUsers() {
  if (!isAdmin()) return;
  const out = await api('/api/users');
  const list = document.getElementById('userList');
  list.innerHTML = out.users.map(u => `
    <div class="user-row">
      <div class="user-main">
        <b>${escapeHtml(u.name)}</b>
        ${u.role === 'admin' ? '<span class="user-tag admin">Administrator</span>' : ''}
        ${u.active ? '' : '<span class="user-tag inactive">Switched off</span>'}
        <div class="user-meta">${escapeHtml(u.email)} · ${u.lastLoginAt ? 'last signed in ' + fmtDate(u.lastLoginAt) : 'never signed in'}${u.mustChangePassword ? ' · password not set yet' : ''}</div>
      </div>
      <div class="user-actions">
        <button class="action-btn" data-u="${u.id}" data-do="reset">Reset password</button>
        <button class="action-btn" data-u="${u.id}" data-do="role" data-role="${u.role === 'admin' ? 'staff' : 'admin'}">${u.role === 'admin' ? 'Make staff' : 'Make administrator'}</button>
        <button class="action-btn ${u.active ? 'danger' : ''}" data-u="${u.id}" data-do="active" data-active="${u.active ? '0' : '1'}">${u.active ? 'Switch off' : 'Switch back on'}</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-do]').forEach(btn => btn.addEventListener('click', handleUserAction));
}

async function handleUserAction(e) {
  const el = e.currentTarget;
  const id = el.dataset.u;
  try {
    if (el.dataset.do === 'reset') {
      if (!confirm('Reset this person\'s password? Their current password will stop working immediately.')) return;
      const out = await api(`/api/users/${id}/reset-password`, { method: 'POST' });
      showCredential('Password reset.', out.tempPassword);
    } else if (el.dataset.do === 'role') {
      await api(`/api/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role: el.dataset.role }) });
    } else if (el.dataset.do === 'active') {
      await api(`/api/users/${id}/active`, { method: 'POST', body: JSON.stringify({ active: el.dataset.active === '1' }) });
    }
    await renderUsers();
    await refresh();
  } catch (ex) {
    if (ex.message !== 'signed out') alert(ex.message);
  }
}

// ------------------------------------------------------------------ boot ----

(async function init() {
  try {
    const out = await api('/api/me');
    document.getElementById('pwRules').textContent = out.passwordRules;
    if (out.user) {
      me = out.user;
      await afterSignIn();
    } else {
      screen('login');
      document.getElementById('loginEmail').focus();
    }
  } catch (e) {
    screen('login');
  }
})();
