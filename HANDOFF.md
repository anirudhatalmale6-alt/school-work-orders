# Work Orders — running the portal

Everything a non-developer needs to look after the maintenance portal day to day.
No coding involved in any of the tasks below.

---

## 1. Who can do what

**Staff** — submit a request, track their own requests under *My Requests*, see
the whole board, read the audit log. They cannot change the status of anything.

**Administrators** — everything staff can do, plus:
- the *Mark Received* and *Mark Completed* buttons on every ticket
- the **Staff** tab, for adding people and resetting passwords

Keep at least two administrators. The portal will refuse to remove the last one,
so the school cannot lock itself out.

---

## 2. Adding a new staff member

1. Sign in as an administrator.
2. Open the **Staff** tab.
3. Enter their full name and email address, choose *Staff* or *Administrator*,
   and press **Create account**.
4. A green box appears with a temporary password, e.g. `anchor-meadow-6214`.
   **Write it down or send it to them before you leave the page** — it is stored
   scrambled and cannot be shown again.
5. They sign in with their email and that temporary password. The portal
   immediately asks them to choose their own password before letting them in.

The name you type here is the name that appears on their tickets and in the
audit log, so spell it the way the school refers to them.

---

## 3. Resetting a forgotten password

1. **Staff** tab → find the person → **Reset password**.
2. Confirm. Their old password stops working straight away.
3. A new temporary password appears in the green box. Pass it on to them.
4. They will be asked to set a new one of their own at the next sign-in.

You never see anyone's real password, including your own — the portal only
stores a scrambled (hashed) version. That is deliberate: a copy of the database
is of no use to anyone who gets hold of it.

---

## 4. When someone leaves

**Staff** tab → **Switch off**. Their sign-in stops working immediately, but
their old tickets and audit-log entries stay intact, so the history stays
readable. **Switch back on** reverses it if they return.

---

## 5. Password rules

Enforced by the server, so they cannot be skipped:

- at least 10 characters
- at least one letter and one number
- not a commonly used password (`password123`, `school2026`, and similar)
- not the same as the person's own email address

---

## 6. Restarting the portal

Almost never needed — the service is set to restart itself automatically after a
crash, and to start again on its own if the server reboots.

**If it is hosted on Render:** sign in at render.com → click the **work-orders**
service → **Manual Deploy** → **Restart service**. Takes about 30 seconds.

**If it is hosted on a DigitalOcean droplet:** connect to the server and run

    sudo systemctl restart work-orders

To check it is running:

    sudo systemctl status work-orders

To read the last hundred lines of the log if something looks wrong:

    sudo journalctl -u work-orders -n 100

---

## 7. Is it actually up?

Visit `/healthz` on the portal address, e.g.
`https://workorders.yourschool.org/healthz`. A page reading `{"ok":true}` means
the service is alive. If that page fails to load, the service is down; a restart
is the first thing to try.

---

## 8. Backups

The whole portal — every ticket, account and audit entry — lives in one file:
`workorders.db`, inside the data folder.

- **On Render:** the disk is backed up by Render, and the file can be downloaded
  from the service shell.
- **On a droplet:** copy `/opt/work-orders/data/workorders.db` somewhere safe on
  a schedule. Ask me and I will set up a nightly copy.

Restoring is a matter of putting that one file back and restarting.

---

## 9. Email notifications

Optional and off unless SMTP details have been configured on the host. When on:

- all administrators are emailed when a new request comes in
- the person who raised a request is emailed when it is marked complete

If the mail server ever misbehaves, the portal carries on working normally —
submitting a ticket never depends on an email going out.

---

## 10. While it is still on the free trial host

Before the portal moves to its permanent home it runs on a free plan, which
behaves differently in two ways worth knowing about:

- **It falls asleep after fifteen minutes with nobody using it.** The next
  person to open the link waits about a minute while it wakes up. Open the link
  a couple of minutes before showing it to anyone and it will be ready.
- **A free plan has no permanent storage.** Anything added — new requests,
  status changes, accounts created from the Staff tab — is lost when it falls
  asleep. It comes back with the starting accounts and a few example requests
  rather than an empty screen, so it always looks right, but it is not a place
  to keep anything real yet.

Both of these disappear on the paid plan, which is a setting change on the same
service — no rebuilding, no new address.

---

## 11. Things worth knowing

- The board refreshes itself every few seconds, so an admin marking a job
  complete appears on a teacher's screen without anyone reloading the page.
- Sign-in sessions last 12 hours; after that people are asked to sign in again.
- Ten failed sign-in attempts from the same place in fifteen minutes blocks
  further tries for a while. That is deliberate, and it clears on its own.
- The audit log is tied to the signed-in account, not a typed-in name, so it is
  a genuine record of who did what and when.
