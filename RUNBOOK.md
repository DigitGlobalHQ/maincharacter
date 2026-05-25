# RUNBOOK — MainCharacter operations

Practical playbook for incidents and routine ops. Pair with `/health` and the
`/admin` dashboard.

---

## 🔴 KILL SWITCH — stop all outgoing WhatsApp immediately

Set in Render env and redeploy (or restart):

```
WATI_SEND_MODE=off
```

`off` = dry-run, the app never calls the Wati API. Use this the moment you
suspect a send loop. `allowlist` (the default) restricts sends to `ADMIN_PHONE`
+ `WATI_ALLOWLIST`. `all` = normal production. Confirm via `GET /health` →
`wati.sendMode`.

---

## Wati is down / messages not delivering

1. `GET /health` → confirm `config.wati: true`.
2. Check logs for `[WATI:FAIL]` / `[WATI:RETRY]`. `sendMessageSafe` already
   retries once and never throws (returns `null` on total failure), so the
   funnel won't crash — messages are just dropped.
3. If `sendMode` shows `allowlist`/`off`, that's the gate, not an outage —
   flip to `all` when ready.
4. If Wati's API is genuinely down, scheduled sends are lost (no queue yet —
   see BACKLOG for a retry queue). On recovery, `checkMissedMessages()` on the
   next boot re-sends today's missed morning messages.

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
  (subject to `WATI_SEND_MODE`).

There is no rank/subscription edit endpoint beyond `promote` yet; for
`subscriptionStatus` changes, edit `data/users.json` directly on the host (or
add an admin endpoint — BACKLOG).

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
  `config.*`, and the intended `wati.sendMode`.

## Webhooks rejecting (Razorpay 400)

`/api/payment/webhook` returns 400 unless the `x-razorpay-signature` matches
`RAZORPAY_WEBHOOK_SECRET`. If payments aren't upgrading users: confirm the
secret is set in Render AND configured identically in the Razorpay dashboard
webhook.
