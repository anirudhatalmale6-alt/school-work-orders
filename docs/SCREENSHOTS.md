# Work Orders — what it looks like

All names, rooms and passwords below are throwaway test data from a local test
run. Nothing here is real school data.

---

### 1. Sign in

One account per person, instead of the single shared `SCHOOL2026` passcode.

![Sign-in screen](screenshots/1-signin.png)

---

### 2. Submitting a request

Same slip as the prototype. "Submitted by" is now filled in from the account you
signed in with, so nobody can raise a ticket under someone else's name.

![New request form](screenshots/2-staff-new-request.png)

---

### 3. The board, seen by a teacher

Everyone can see every request and its status. No status buttons, no Staff tab.

![Board as staff](screenshots/3-staff-board.png)

---

### 4. The same board, seen by an administrator

Mark Received and Mark Completed on every open ticket, plus the Staff tab.

![Board as administrator](screenshots/5-admin-board.png)

---

### 5. The completion notice

When an administrator marks a job complete, the person who raised it gets the
banner at the top and the highlighted card, with the completion note. It appears
on its own within a few seconds — no reloading.

![Completion notice](screenshots/8-staff-completion-notice.png)

---

### 6. Audit log

Recorded against the account that was signed in, not a typed-in name.

![Audit log](screenshots/9-audit-log.png)

---

### 7. Managing staff

Add a person, reset a forgotten password, promote someone to administrator, or
switch off an account when they leave.

![Staff tab](screenshots/10-staff-admin.png)

---

### 8. A newly created account

The temporary password is shown once. The person is forced to choose their own
the first time they sign in.

![New account password](screenshots/11-new-account-password.png)

---

### 9. On a phone

The board on a 390px-wide screen — how most staff will actually raise a ticket.

![Mobile board](screenshots/12-mobile-board.png)

---
---

# The 29 August changes

The school colours, the Pending status and the emergency notice. Everything
below is a local test run — invented names, invented rooms, and a placeholder
phone number, because this page is public.

---

### 10. School colours, and the emergency notice

Navy, gold and white, taken from the High Point Academy site. The yellow line at
the top of the request form is the emergency contact — the number is a link, so
on a phone it dials with one tap.

![New request form in the school colours](screenshots/13-emergency-notice.png)

---

### 11. Pending on the filter row

A fourth chip alongside All / Open / Received / Completed. Maintenance now has
three buttons on a request: Mark Received, Mark Pending, Mark Completed.

![Board filter row with Pending](screenshots/14-board-pending-filter.png)

---

### 12. A request on hold, and why

Pressing Mark Pending asks what the request is waiting on. That line shows on
the card for everyone — including the person who raised it — and is emailed to
them. When the part arrives, Take off hold puts it back to Received.

![A pending request showing its reason](screenshots/15-pending-card.png)

---

### 13. Setting the emergency contact

On the Staff tab. Whoever is on call can be changed by the office in a few
seconds, without a developer and without restarting anything. Clearing both
boxes removes the notice from the form.

![Emergency contact setting](screenshots/16-emergency-setting.png)

---

### 14. The audit log

Going on hold and coming off hold are recorded like every other action, with the
reason attached.

![Audit log with pending entries](screenshots/17-audit-log.png)

---

### 15. On a phone

![The portal on a phone](screenshots/18-phone.png)

---
---

# Easier to read

Asked for on 29 August: darker lettering, and something other than pale grey
around the edges. Same local test run — invented names and rooms.

---

### 16. Before and after, side by side

The wording, the boxes and the layout are untouched. What changed is that the
small capital labels went from a pale grey-blue to nearly black and up from
under 11px to about 13px, the example text inside each box got darker, the
outlines went from a faint grey to blue, and the surround behind the white slip
is a deeper blue-grey so the form stands out from the page instead of blending
into it.

The example text in an empty box is deliberately still a shade lighter than
something actually typed in — otherwise an empty box looks like a filled one.
Say the word if you would rather it were fully black.

![Before and after](screenshots/19-before-after.png)

---

### 17. The board

The status stamps used to be the faintest thing on a card, which is backwards —
the status is the first thing anyone looks for. They keep the tilted rubber
stamp look but are now solid colour on a tint, instead of a mottled outline.

![The board, easier to read](screenshots/20-board-readability.png)

---

### 18. On a phone

Two things were running off the right-hand edge of a phone screen: the row of
tabs (once Staff appears, for administrators) and the row of status chips once
Pending was added. Both now wrap onto a second line, so nothing sits off screen
where it cannot be reached. Typing boxes are also 16px, which stops iPhones
zooming the page in when someone taps into one.

![The portal on a phone](screenshots/21-phone-readability.png)
