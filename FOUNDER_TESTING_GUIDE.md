# Founder Testing Guide — Lookmaxxing PWA (Night-4)

You are **Customer #1.** This is how to install the Lookmaxxing PWA on your phone
tomorrow morning and run the full daily ritual for 2-3 days. No real payment is
involved — you use the admin seed route, and the paywall is gated
(`PAYWALL_PUBLIC=false`), so no Razorpay charge can fire while you test.

**Base URL:** `https://maincharacter.digitglobalservices.com`

---

## 0. One-time: get an admin token

The seed route is admin-gated. Grab a short-lived admin JWT:

```bash
# Returns { "token": "...", "expiresIn": "12h" }
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"<YOUR_ADMIN_PASSWORD>"}'
```

Copy the `token` value. Use it as `Bearer <token>` below. (Or open `/admin`,
log in, and copy the token your browser stores.)

---

## 1. Seed your test account

```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/seed-test-user \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"phone":"918595833852","name":"Chitranshu","weakestAxis":"hairDensity"}'
```

The response includes a `loginUrl`:
`https://maincharacter.digitglobalservices.com/lookmax/admin-login?phone=918595833852`

This creates a fully-activated **Aura++** account (Orator + Lookmaxxing both on),
a synthetic completed audit with `hairDensity` as the weakest axis, and today's
personalised protocol. Save the `loginUrl`.

> The seed is **idempotent** — running it again updates the same account, it
> never creates a duplicate. Re-run with a different `weakestAxis` to test the
> three scenarios below.

---

## 2. Install the PWA on your phone

1. Open the `loginUrl` on your phone (Safari on iOS, Chrome on Android).
2. Enter your **admin phone + password** on the admin-login screen.
3. You land on the Lookmaxxing dashboard.
4. Tap the browser **Share** → **Add to Home Screen**. The app installs with the
   gold ◆ icon and opens full-screen (standalone) from then on.

> The standard OTP login is intentionally dormant ("OTP currently unavailable")
> until Meta approves the WhatsApp display name. Admin login is your path for now.

---

## 3. Day 1 — your first mirror

1. Open **Mirror** (bottom nav).
2. Allow camera access. Take a selfie in **natural light, camera at eye level.**
   (If the live camera doesn't open, tap **Use a photo** — older iOS Safari.)
3. Watch the analysis dwell (~5s) → your score animates 0 → final, the 8 axes
   fill in with deltas, and The Consultant leaves one observation.
4. Note: photos are stored to `/tmp`. **If a Render redeploy happens during your
   test window, the photos vanish** — that is expected (we're testing logic, not
   data permanence). R2 durable storage is a week-2 item.

## 4. Day 1 — review your protocol

1. Open **Protocol**. You'll see 5-7 "do" items weighted to your weakest axis,
   plus violet "do-not" reminders (e.g. *DO NOT use jaw exercisers*).
2. Tap a card to expand the instruction + evidence tier
   (RCT-supported / Mechanism-supported / Observational).
3. Check items off as you do them through the day.
4. Tap **Complete the day** before bed. ≥80% of items checked carries the streak.

## 5. Day 2-3 — repeat the ritual

- Mirror first thing in the morning, protocol through the day.
- Watch the **streak** grow (a mirror within 30h of the last keeps it alive) and
  the **14-day trend chart** fill in.
- The dashboard's week strip lights a gold dot for each day you complete a mirror.

## 6. End of week — hair audit

- The hair audit unlocks **6 days** after your last reading. To test sooner,
  re-seed (resets nothing destructive) or wait out the cooldown.
- Stand in **flat overhead light.** Take two photos: one straight-on (hairline),
  one from above (crown). Both are required.
- You'll get a Norwood-stage estimate, a hairline score, and an evidence-based
  DO / DO-NOT list tuned to your stage.

## 7. Weekly reveal

- Unlocks once you have **4 of 7** mirrors in the week. Until then the reveal
  page shows the lock screen with your progress dots.
- The preview is a client-rendered slideshow of your selfies with a gold score
  trajectory. The full stitched MP4 ships once ffmpeg lands in the container.

---

## What to look for (and note in DOGFOOD_NOTES.md)

- **Consultant voice consistency** — any "great job!", exclamation marks, or
  emojis other than ◆ are bugs. Flag them.
- **Score calibration** — does a 65 *feel* like a 65? Is the weakest axis right?
- **Protocol relevance** — does the personalised item set match your actual
  weakest areas?
- **UX friction** — any step that took more than ~30 seconds to figure out.

## How to file bugs

Keep a running log in **`DOGFOOD_NOTES.md`** at the repo root. One block per issue:

```
## 2026-05-28 08:40 IST
What I did:     Took my first mirror.
What I expected: A score and 8 axis bars.
What happened:   Score showed but the trend chart was empty.
```

The next autopilot run reads `DOGFOOD_NOTES.md` and fixes everything in priority order.

---

## Three test scenarios

Re-seed with a different `weakestAxis` to verify the protocol adapts:

### 1. Skin-weakest user
```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/seed-test-user \
  -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
  -d '{"phone":"918595833852","name":"Chitranshu","weakestAxis":"skinClarity"}'
```
**Expect:** the protocol leans into skin items (sunscreen, retinoid, gentle
cleanse) and the skin do-nots (over-exfoliation, retinoid+niacinamide).

### 2. Hair-weakest user
```bash
... -d '{"phone":"918595833852","name":"Chitranshu","weakestAxis":"hairDensity"}'
```
**Expect:** the protocol is hair-heavy (minoxidil, ketoconazole, microneedling)
and the hair tracker is the obvious next step on the dashboard.

### 3. Posture-weakest user
```bash
... -d '{"phone":"918595833852","name":"Chitranshu","weakestAxis":"posture"}'
```
**Expect:** the protocol surfaces movement items (thoracic extension, upper-back
strength, screen height) and the "don't force military posture" reminder.

---

## When you're ready to go public

1. Validate the ritual feels right across 2-3 days.
2. Review the protocol/hair copy (all flagged `// TODO copy review` — see
   `BACKLOG.md → COPY REVIEW QUEUE`).
3. Only then flip **`PAYWALL_PUBLIC=true`** in Render. Until that moment, the
   paywall safely collects a waitlist and charges no one.

◆ MainCharacter
