# RUNBOOK — MainCharacter operations

Practical playbook for incidents and routine ops. Pair with `/health` and the
`/admin` dashboard.

---

## 🔴 KILL SWITCH — stop all outgoing messaging immediately

Set in Render env and redeploy (or restart):

```
WHATSAPP_SEND_MODE=off
```

`off` = dry-run, the app never calls any provider (WhatsApp, SMS, or email).
Use this the moment you suspect a send loop. `allowlist` (the default) restricts
sends to `ADMIN_PHONE` / `ADMIN_EMAIL` (+ `WHATSAPP_ALLOWLIST` / `EMAIL_ALLOWLIST`).
`all` = normal production. Confirm via `GET /health` → `messaging.mode`.

---

## WhatsApp not delivering (or stuck in DRY-RUN)

1. `GET /health` → `messaging.configured`. If `false`, the Meta credentials
   aren't set yet — every send is an intentional DRY-RUN (not an outage). Set the
   `WHATSAPP_*` env vars (see "flip WhatsApp from DRY-RUN to live" below).
2. Check logs for `[WHATSAPP:DRY-RUN]` (creds/mode), `[WHATSAPP:FAIL]` /
   `[WHATSAPP:RETRY]` (real send errors). `sendMessageSafe` retries once and never
   throws (returns `null` on total failure), so the funnel won't crash.
3. If `messaging.mode` shows `allowlist`/`off`, that's the gate, not an outage —
   flip to `all` when ready.
4. If Meta's API is genuinely down, scheduled sends are lost (no queue yet —
   see BACKLOG). On recovery, `checkMissedMessages()` on the next boot re-sends
   today's missed morning messages. As a stopgap, fall back to email/SMS.

## Gemini is rate-limited or erroring

- The service self-limits to 10 RPM and **falls back automatically** to
  `generateFallbackScoring` (reasonable scores + a per-day Consultant message),
  so scoring never blocks a reply. Look for `[GEMINI:FALLBACK]` /
  `[GEMINI:ERROR]` in logs.
- If fallback is firing constantly: verify `GEMINI_API_KEY`, check quota in
  Google AI Studio. No code change needed to recover.

## How to refund a payment

1. Razorpay Dashboard → Payments → find the payment → **Refund**.
2. Razorpay fires `refund.processed` / a subscription event to
   `/api/payment/webhook`. We do not yet auto-downgrade on refund — manually
   set the user's `subscriptionStatus` (see "manually promote/edit a user").
3. Note it in the user's record / support log.

## How to manually promote or edit a user

JSON store (current): the DB is `data/users.json`, **keyed by phone**. On
Render free tier this resets on redeploy — prefer the admin API:

- Promote rank: `POST /api/admin/promote` `{ "phone": "...", "rank": "seeker" }`
  with `Authorization: Bearer <admin-jwt>`.
- Get a token: `POST /api/admin/login` `{ "password": "<admin pw>" }`.
- Inspect: `GET /api/admin/user/:phone` (Bearer).
- Send a one-off message: `POST /api/admin/send-message` `{ phone, message }`
  (subject to `WHATSAPP_SEND_MODE`).

There is no rank/subscription edit endpoint beyond `promote` yet; for
`subscriptionStatus` changes, edit `data/users.json` directly on the host (or
add an admin endpoint — BACKLOG).

## Render free-tier keep-alive (uptime pinger)

Render's free tier sleeps the instance after 15 minutes of no inbound traffic.
When the instance sleeps, `node-cron` dies with it and scheduled morning messages
are missed until the next boot.

**Current mitigation — already active:** cron-job.org pings `GET /health` every
5 minutes, which keeps the instance awake around the clock.

### Set up a new pinger (if cron-job.org job is lost)

1. Go to [cron-job.org](https://cron-job.org) → New cronjob.
2. URL: `https://maincharacter.digitglobalservices.com/health`
3. Schedule: every 5 minutes (`*/5 * * * *`).
4. Expected HTTP status: 200. Enable failure notification emails.

`GET /health` is lightweight — it checks a few env vars and returns a JSON
object. It does NOT run heavy queries or DB scans on the hot path (confirmed;
see `server.js`). Safe to ping frequently.

### Optional: external cron driving the scheduler tick

If you want the scheduler to be driven by an external cron rather than the
in-process `node-cron`, use:

```
POST https://maincharacter.digitglobalservices.com/api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` must be set in Render env. The endpoint runs one scheduler tick
(same logic as the in-process cron every 60s). External cron interval: 60s or
5 minutes, your preference. Note: this does not replace the `/health` pinger —
both are needed (pinger keeps instance warm; tick drives scheduling).

### Upgrade path

Upgrading to Render Starter ($7/mo) eliminates the sleep issue entirely and is
the recommended long-term fix once MRR justifies it.

---

## Admin can't log in

- `POST /api/admin/login` validates against `ADMIN_PASSWORD_HASH` (bcrypt) if
  set, else plaintext `ADMIN_PASSWORD` (legacy). Generate a hash:
  `node -e "console.log(require('./lib/auth').hashPassword('YOUR_PW'))"`.
- Tokens are HS256, 12h, signed with `ADMIN_JWT_SECRET`. Rotating that secret
  invalidates all sessions.

## Scheduler not firing (free-tier dyno asleep)

Render free dynos sleep after ~15 min idle, killing `node-cron`. Stopgap:
configure cron-job.org to `GET /health` every 5 min (BACKLOG). Proper fix: run
the scheduler in a dedicated worker (`RUN_SCHEDULER` flag is already in place)
on a paid always-on instance.

## Deploy / rollback

- Push to `main` → Render auto-deploys. CI (lint + test + smoke) gates the
  branch.
- Rollback: in the Render dashboard, redeploy a previous successful deploy, or
  `git revert <sha> && git push`.
- After any deploy, check `GET /health`: `status: healthy`, expected
  `config.*`, and the intended `messaging.mode`.

---

## How to flip WhatsApp from DRY-RUN to live

WhatsApp is DORMANT until the Meta Cloud API credentials are present. Full setup:
`WHATSAPP_CLOUD_API_SETUP.md`. Quick version:

1. Paste into Render env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
2. Redeploy, then `curl https://maincharacter.digitglobalservices.com/health | jq .messaging`
   → expect `"configured": true` and `"webhookGuard": "hmac"`.
3. Send a test to ADMIN_PHONE: `POST /api/admin/send-message` `{ phone: ADMIN_PHONE, message: "◆ test" }`
   (Bearer admin JWT). With `WHATSAPP_SEND_MODE=allowlist`, only ADMIN_PHONE delivers.
4. When verified, set `WHATSAPP_SEND_MODE=all` to reach real users.

## How to test MSG91 OTP without spending money

- Keep `WHATSAPP_SEND_MODE=allowlist` so only ADMIN_PHONE can receive.
- `POST /api/admin/test-sms` `{ "phone": "<ADMIN_PHONE>" }` (Bearer admin JWT)
  sends a fresh OTP via MSG91 to that number (one SMS = a few paise). The
  response includes `result` and `configured`; the OTP itself is hidden in
  production. If `MSG91_AUTH_KEY` is unset, it returns a DRY-RUN (spends nothing).

## How to roll back to Wati if the Cloud API fails

You cannot — **Wati is gone** (removed Night 3, DECISIONS.md). There is no Wati
fallback. If the Meta Cloud API is failing, set `WHATSAPP_SEND_MODE=off` (all
WhatsApp becomes DRY-RUN, no errors) and rely on email (Resend) + SMS (MSG91)
until Meta is healthy. The legacy `/api/webhook/wati` path 308-redirects to
`/api/webhook/whatsapp` for 30 days; do not re-point anything at Wati.

## Webhooks rejecting (Razorpay 400)

`/api/payment/webhook` returns 400 unless the `x-razorpay-signature` matches
`RAZORPAY_WEBHOOK_SECRET`. If payments aren't upgrading users: confirm the
secret is set in Render AND configured identically in the Razorpay dashboard
webhook.
