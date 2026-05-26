# ☀ Morning Digest — Night 3 (channel migration)

Good morning. Wati is out. Meta WhatsApp Cloud API, MSG91, and Resend are in.
The revenue loop now closes end to end. Everything is deployed and verified live.

## What shipped (8 commits this run)

| P | Commit | What |
|---|---|---|
| P0 | `chore(night3): pre-flight` | 10 decisions → DECISIONS.md, founder checklist + 11 env vars → BACKLOG, installed `resend` |
| P2 | `feat(whatsapp): Meta Cloud API service` | `services/whatsapp.js` (Graph v18, send/template/retry, `x-hub-signature-256` verify, GET challenge, DRY-RUN) + `lib/messaging-mode.js` shared kill-switch |
| P1 | `refactor(messaging): remove Wati` | deleted `services/wati.js`; migrated every caller; `/webhook/wati`→`/webhook/whatsapp` + 308 redirect; `WATI_SEND_MODE`→`WHATSAPP_SEND_MODE`; `/health` messaging block |
| P3 | `feat(sms): MSG91 SMS/OTP` | `services/sms.js` (sendOtp/sendSms/generateOtp) + admin `/api/admin/test-sms` |
| P4 | `feat(email): Resend service + templates` | `services/email.js` + 3 dark/gold templates; wired receipt into the Razorpay webhook + Day-7 report email |
| P5 | `feat(paywall): 3-card paywall page` | `public/paywall.html` (Orator/Lookmaxxing/Aura++) + audit→paywall handoff with Aura summary |
| P6 | `feat(payment): post-payment confirmation` | `public/payment-confirmed.html` + `GET /api/payment/status` (signature-verified) + first-Orator Day-1 scheduling |
| P7 | `docs: align CLAUDE.md/README/RUNBOOK/BACKLOG` | full doc sweep to the new channels + ARCHIVED — WATI |

## Health (live, verified)

`GET /health` →
- `status: healthy`, `environment: production`
- `messaging: { provider: whatsapp-cloudapi, mode: allowlist, configured: false, webhookGuard: open }`
- `config.sms.configured: false`, `config.email.configured: false`, `config.razorpay: true`

`configured: false` everywhere is **correct and expected** — credentials aren't
pasted yet, so every channel is in safe DRY-RUN. **No real messages went to
anyone.** The kill-switch (`WHATSAPP_SEND_MODE=allowlist`) is intact.

## Live funnel checks (all pass)

- `/audit` → 200 · `/paywall` → 200 (3 cards) · `/payment-confirmed` → 200
- `POST /api/webhook/wati` → 308 → `/api/webhook/whatsapp`
- `GET /api/webhook/whatsapp` challenge with a bad token → 403

## Tests

211 passing (was 154), 25 files. Smoke 19/19. CI green. New suites:
`whatsapp`, `messaging-mode`, `sms`, `email`, `paywall`, `payment-confirmed`.

## ⚠ Your move (in order) — see BACKLOG.md → NIGHT 3 FOUNDER ACTIONS

1. Cancel Wati; free the number; create Meta Business Manager + WABA; add 9958533994.
2. Generate the Meta token + note phone-number-id / WABA-id; re-submit templates.
3. MSG91: wallet + auth key + DLT OTP template id. Resend: verify the sending domain.
4. Paste the **11 new env vars** into Render (list + the generated
   `WHATSAPP_VERIFY_TOKEN` are in BACKLOG.md). Full guide: `WHATSAPP_CLOUD_API_SETUP.md`.
5. Smoke a real OTP to ADMIN_PHONE (`POST /api/admin/test-sms`), then a WhatsApp
   test to ADMIN_PHONE, then flip `WHATSAPP_SEND_MODE=all`.

## Review before going live

- **Copy review queue** (BACKLOG): the 3 email templates and the paywall Aura++
  "Founder access to The Consultant chat" bullet are drafted + flagged `TODO copy review`.
- 30-day cleanup TODO is logged: remove the `/webhook/wati` 308 redirects + the
  legacy `WATI_SEND_MODE` fallback after ~2026-06-26.

## Not touched (still deferred — needs a fresh prompt)

PWA shell, mirror, protocol, hair tracker, weekly reveal, Day-30, cross-sell
automation (V4). Postgres migration. The audit funnel does not collect email
yet, so `sendAuditConfirmation` + `/audit/result/:token` are built but dormant.

— Your CTO for the night ◆
