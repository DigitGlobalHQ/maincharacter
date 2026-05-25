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
- Wati for WhatsApp send/receive
- Razorpay for payments
- Vitest + supertest for tests; ESLint + Prettier

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
| `npm run smoke` | Boot the server (scheduler off, Wati dry-run) and probe key routes |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## ⚠ The one switch you must know: `WATI_SEND_MODE`

Outgoing WhatsApp is gated in `services/wati.js`:

- `all` — send to everyone (normal production)
- `allowlist` — send only to `ADMIN_PHONE` + `WATI_ALLOWLIST` (**default**)
- `off` — dry-run, never call the Wati API

It **defaults to `allowlist`** so a redeploy (which reboots the scheduler and
can send on boot) cannot blast real users. **To go live to real users, set
`WATI_SEND_MODE=all` in Render env.** `/health` reports the current mode.

## Architecture

```
server.js          Express entry: helmet, rate-limit, pages, /webhook shim,
                   /health, error handler, scheduler boot
routes/api.js      /api/enroll, webhook handler, waitlist, user, payment + webhook
routes/admin.js    /api/admin/* (JWT auth via lib/auth)
services/wati.js   send guard (WATI_SEND_MODE), sendMessage(Safe), templates
services/gemini.js scoring + evolution assessment (+ fallback)
services/razorpay.js orders, payment links, webhook signature verify
services/scheduler.js node-cron minute tick (gated by RUN_SCHEDULER)
models/User.js     JSON CRUD (USERS_FILE_PATH overridable for tests)
data/orator-content.js  7-day Consultant copy + Gemini scoring prompt
lib/log.js  lib/auth.js  lib/sentry.js   logger / admin auth / error monitoring
```

Data flow: enrol → welcome → user replies `START NOW` → Day 1 → daily reply →
Gemini score → evening feedback → cron sends next day → Day 7 report →
`CONTINUE` → Razorpay link → **paid webhook → `/api/payment/webhook` →
user marked active**.

## Testing & CI

`tests/` runs against a temp store (`USERS_FILE_PATH`) with `WATI_SEND_MODE=off`,
so tests never touch real data or send messages. `.github/workflows/ci.yml`
runs lint + test + smoke on every push/PR.

## Deploy

Render auto-deploys on push to `main` (`render.yaml`, `npm start`). Set secrets
in the Render dashboard, not in git. See `BACKLOG.md` → FOUNDER ACTIONS for the
full env checklist (rotate keys, set `WATI_SEND_MODE`, `ADMIN_PASSWORD_HASH`,
webhook secrets, etc.). Operational playbook: `RUNBOOK.md`.
