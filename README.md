# MainCharacter

WhatsApp-first personal-growth platform. Users enrol once and receive a daily
protocol from a persona called **The Consultant**, reply by text or voice, get
scored by Gemini, and on Day 7 receive an Evolution Report and a paid upgrade
offer. The live pillar is **The Orator** (7-day speech protocol).

> New here? Read `CLAUDE.md` first — it is the source of truth for product,
> brand voice, and the rules of engagement. Then read `DECISIONS.md` and
> `BACKLOG.md`.

## Stack

- Node 18+ / Express 5
- JSON-file persistence (`data/users.json`) — **ephemeral on Render free tier**;
  Postgres migration is queued in `BACKLOG.md`
- Gemini (`@google/generative-ai`) for scoring
- **Channels (Night 3):** Meta WhatsApp Cloud API (`services/whatsapp.js`) for the
  Orator channel, MSG91 (`services/sms.js`) for SMS/OTP, Resend (`services/email.js`)
  for email. All three are DORMANT/DRY-RUN until their credentials are set, and all
  share one kill-switch (`WHATSAPP_SEND_MODE`). See `WHATSAPP_CLOUD_API_SETUP.md`.
- Razorpay for payments (recurring Subscriptions)
- Vitest + supertest for tests; ESLint + Prettier

### Channel matrix

| Channel | Service | Used for | Live when |
|---|---|---|---|
| WhatsApp | `services/whatsapp.js` (Meta Cloud API v18) | Orator daily protocol, alerts | `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` set |
| SMS / OTP | `services/sms.js` (MSG91 v5) | Lookmaxxing PWA login, SMS fallback | `MSG91_AUTH_KEY` set |
| Email | `services/email.js` (Resend) | Receipts, Day-7 report, audit confirmation | `RESEND_API_KEY` set |

## Quick start

```bash
npm install
cp .env.example .env   # fill in values (never commit .env)
npm start              # boots server.js on PORT (default 3000)
```

Then visit `http://localhost:3000` (landing), `/start` (enrol), `/admin`.

## Scripts

| Script | What it does |
|---|---|
| `npm start` | Run the server (+ scheduler unless `RUN_SCHEDULER=false`) |
| `npm test` | Vitest unit/integration suite |
| `npm run test:coverage` | Coverage report (services/routes/lib/models) |
| `npm run smoke` | Boot the server (scheduler off, messaging dry-run) and probe key routes |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## ⚠ The one switch you must know: `WHATSAPP_SEND_MODE`

All outgoing messaging (WhatsApp, SMS, email) is gated by one mode, read in
`lib/messaging-mode.js`:

- `all` — send to everyone (normal production)
- `allowlist` — send only to `ADMIN_PHONE` / `ADMIN_EMAIL` (+ extras) (**default**)
- `off` — dry-run, never call any provider API

It **defaults to `allowlist`** so a redeploy (which reboots the scheduler and
can send on boot) cannot blast real users. **To go live to real users, set
`WHATSAPP_SEND_MODE=all` in Render env.** `/health` reports the current mode under
`messaging.mode`. (The legacy `WATI_SEND_MODE` is still read as a fallback for a
30-day deprecation window.)

## Architecture

```
server.js          Express entry: helmet, rate-limit, pages, /paywall,
                   /payment-confirmed, /health, error handler, scheduler boot
routes/api.js      /api/enroll, /api/webhook/whatsapp, waitlist, user,
                   payment (subscribe/status/webhook)
routes/admin.js    /api/admin/* (JWT auth via lib/auth) incl. /test-sms
services/whatsapp.js  Meta Cloud API send + webhook verify (DRY-RUN until creds)
services/sms.js       MSG91 OTP/SMS (DRY-RUN until MSG91_AUTH_KEY)
services/email.js     Resend receipts/reports (DRY-RUN until RESEND_API_KEY)
lib/messaging-mode.js shared all/allowlist/off kill-switch for all channels
services/gemini.js    scoring + evolution assessment (+ fallback)
services/razorpay.js  orders, subscriptions, signature verify
services/scheduler.js node-cron minute tick (gated by RUN_SCHEDULER)
models/User.js        JSON CRUD (USERS_FILE_PATH overridable for tests)
data/orator-content.js  7-day Consultant copy + Gemini scoring prompt
data/email-templates/   dark/gold inline-CSS email templates
lib/log.js  lib/auth.js  lib/sentry.js   logger / admin auth / error monitoring
```

Data flow: enrol → welcome → user replies `START NOW` → Day 1 → daily reply →
Gemini score → evening feedback → cron sends next day → Day 7 report (WhatsApp +
email). Revenue: audit/paywall → `/api/payment/subscribe` → Razorpay checkout →
`/payment-confirmed` → **`/api/payment/webhook` flips `oratorActive`/`lookmaxxingActive`
+ fires the receipt email**.

## Testing & CI

`tests/` runs against a temp store (`USERS_FILE_PATH`) with
`WHATSAPP_SEND_MODE=off`, so tests never touch real data or send messages.
`.github/workflows/ci.yml` runs lint + test + smoke on every push/PR.

## Deploy

Render auto-deploys on push to `main` (`render.yaml`, `npm start`). Set secrets
in the Render dashboard, not in git. See `BACKLOG.md` → NIGHT 3 FOUNDER ACTIONS
for the full env checklist (Meta Cloud API, MSG91, Resend, set
`WHATSAPP_SEND_MODE`, webhook secrets, etc.) and `WHATSAPP_CLOUD_API_SETUP.md`
for the WhatsApp setup. Operational playbook: `RUNBOOK.md`.
