# Work Orders — campus maintenance ticket portal

A hosted version of the school's work-order log: staff sign in with their own
account, submit maintenance requests, and track them; the maintenance team moves
tickets through *Received* and *Completed*.

The screen design and the workflow come from the original single-file prototype.
What has been added underneath it is a real server, a database, and per-person
logins — the prototype stored everything in the browser through an API that only
exists on claude.ai, so it could not save anything once hosted anywhere else.

For day-to-day running (adding staff, resetting passwords, restarting the
service) see **[HANDOFF.md](HANDOFF.md)**.

## What it does

- Email + password sign-in for every staff member, passwords hashed with bcrypt
- Two roles: staff, and administrators who can change ticket status and manage accounts
- Password rules enforced server-side; temporary passwords must be changed at first sign-in
- Rate-limited sign-in, HTTP-only session cookies, `secure` in production, CSP via helmet
- Board refreshes itself every few seconds, so status changes appear without a reload
- Audit log recorded against the signed-in account, not a typed-in name
- Optional email notifications (new request → admins, completed → requester)
- `/healthz` endpoint for uptime checks

## Stack

Node 20+, Express 5, SQLite (better-sqlite3). No build step, no bundler — the
front end is plain HTML/CSS/JS served straight from `public/`.

## Running locally

```
npm install
cp .env.example .env      # set SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start
```

First start creates the first administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
and prints it to the log. Every later account is created from the **Staff** tab.

## Deploying

**Render** (recommended for a small school): `render.yaml` sets up the service,
a 1 GB disk for the database, HTTPS, health checks and automatic restarts.
Set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` in the dashboard;
`SESSION_SECRET` is generated for you.

**Any VPS:** `deploy/work-orders.service` is a systemd unit that restarts the app
on crash and starts it on boot. Put a reverse proxy in front of it for HTTPS.

**Docker:** `docker build -t work-orders . && docker run -p 3000:3000 -v wo-data:/var/data --env-file .env work-orders`

## Configuration

All settings are environment variables — see `.env.example`. `DATA_DIR` must
point at persistent storage, otherwise the database is wiped on each deploy.
