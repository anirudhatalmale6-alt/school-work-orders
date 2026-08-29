# Work Orders — running the portal

Everything a non-developer needs to look after the maintenance portal day to day.
No coding involved in any of the tasks below.

---

## 1. Who can do what

**Staff** — submit a request, track their own requests under *My Requests*, see
the whole board, read the audit log. They cannot change the status of anything.

**Administrators** — everything staff can do, plus:
- the *Mark Received*, *Mark Pending* and *Mark Completed* buttons on every ticket
- the **Staff** tab, for adding people, resetting passwords and setting the
  emergency contact

Keep at least two administrators. The portal will refuse to remove the last one,
so the school cannot lock itself out.

---

## 2. The four statuses

**Open** — submitted, nobody has picked it up yet.

**Received** — someone on the maintenance team has seen it and it is in hand.

**Pending** — seen, but standing still: waiting on a part, a vendor or an
approval. Press **Mark Pending** and the portal asks what it is waiting on. Type
a short line — *"waiting on the part, ordered Tuesday"* — and the person who
raised the request sees it on their own card and gets it by email. That one line
is the whole point of the button: it is what stops them ringing the maintenance
office to ask. Leave the box empty if you would rather not say, and it still
goes on hold.

When the part turns up, press **Take off hold** and it goes back to Received.
Pending requests still count in the Board tally — nothing hides by being on hold.

**Completed** — done. The completion note is optional and is shown to the
requester.

Any status can go straight to Completed, and anything not yet complete can be
put on hold, so nobody has to walk a request through the steps in order.

---

## 3. The emergency notice

The yellow line at the top of the New Request form — *"Do not use this form.
Call ... directly on ..."*.

**Staff** tab → **Emergency contact** → type the name and number → **Save
contact**. It appears immediately for everyone; nothing needs restarting. The
number is a link, so on a phone it dials with one tap.

Leave both boxes empty and press Save to take the notice off the form
altogether. The optional extra line is for saying what counts — *"flooding, gas,
power, or anything unsafe"*.

The number is kept in the school's own database, not written into the code, so
whoever is on call can be changed by the office in ten seconds and no personal
mobile number ever sits in the source repository.

---

## 4. Adding a new staff member

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

## 5. Resetting a forgotten password

1. **Staff** tab → find the person → **Reset password**.
2. Confirm. Their old password stops working straight away.
3. A new temporary password appears in the green box. Pass it on to them.
4. They will be asked to set a new one of their own at the next sign-in.

You never see anyone's real password, including your own — the portal only
stores a scrambled (hashed) version. That is deliberate: a copy of the database
is of no use to anyone who gets hold of it.

---

## 6. When someone leaves

**Staff** tab → **Switch off**. Their sign-in stops working immediately, but
their old tickets and audit-log entries stay intact, so the history stays
readable. **Switch back on** reverses it if they return.

---

## 7. Password rules

Enforced by the server, so they cannot be skipped:

- at least 10 characters
- at least one letter and one number
- not a commonly used password (`password123`, `school2026`, and similar)
- not the same as the person's own email address

---

## 8. Restarting the portal

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

## 9. Is it actually up?

Visit `/healthz` on the portal address, e.g.
`https://workorders.yourschool.org/healthz`. A page reading `{"ok":true}` means
the service is alive. If that page fails to load, the service is down; a restart
is the first thing to try.

---

## 10. Backups

The whole portal — every ticket, account and audit entry — lives in one file:
`workorders.db`, inside the data folder.

- **On Render:** the disk is backed up by Render, and the file can be downloaded
  from the service shell.
- **On a droplet:** copy `/opt/work-orders/data/workorders.db` somewhere safe on
  a schedule. Ask me and I will set up a nightly copy.

Restoring is a matter of putting that one file back and restarting.

---

## 11. Email notifications

Optional and off unless SMTP details have been configured on the host. When on:

- all administrators are emailed when a new request comes in, with `URGENT —` at
  the front of the subject line when the request was marked urgent
- the person who raised a request is emailed when it is **marked received**, so
  they know it has been picked up without having to open the portal
- the person who raised a request is emailed when it is **put on hold**, with the
  reason, and again when it is taken off hold
- the person who raised a request is emailed again when it is marked complete

**Telling someone about urgent requests only.** A facilities director who does
not hold an administrator account can still be alerted. Add their address to
`URGENT_ALERT_EMAILS` in the host's settings — several addresses separated by
commas, semicolons or one per line. They are added to the urgent emails only;
ordinary requests still go to administrators alone. Somebody who is already an
administrator will not receive two copies.

If the mail server ever misbehaves, the portal carries on working normally —
submitting a ticket never depends on an email going out.

---

## 12. While it is still on the free trial host

Before the portal moves to its permanent home it runs on a free plan, which
behaves differently in two ways worth knowing about:

- **It falls asleep after fifteen minutes with nobody using it.** The next
  person to open the link waits about a minute while it wakes up. Open the link
  a couple of minutes before showing it to anyone and it will be ready.
- **A free plan has no permanent storage.** Anything added — new requests,
  status changes, accounts created from the Staff tab, the emergency contact
  typed in on the Staff tab — is lost when it falls asleep. It comes back with
  the starting accounts and a few example requests rather than an empty screen,
  so it always looks right, but it is not a place to keep anything real yet.

  The emergency contact is the one thing worth pinning down during the trial,
  since a blank notice looks like a fault. Set `EMERGENCY_CONTACT_NAME` and
  `EMERGENCY_CONTACT_PHONE` in the host's settings and it is put back every time
  the service wakes up. Those two are only ever used to fill in a blank — once
  the paid plan is on and someone has typed a contact into the Staff tab, what
  they typed wins and stays.

Both of these disappear on the paid plan, which is a setting change on the same
service — no rebuilding, no new address.

---

## 13. Things worth knowing

- The board refreshes itself every few seconds, so an admin marking a job
  complete appears on a teacher's screen without anyone reloading the page.
- Sign-in sessions last 12 hours; after that people are asked to sign in again.
- Ten failed sign-in attempts from the same place in fifteen minutes blocks
  further tries for a while. That is deliberate, and it clears on its own.
- The audit log is tied to the signed-in account, not a typed-in name, so it is
  a genuine record of who did what and when.
