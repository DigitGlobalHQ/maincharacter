# Decisions Log

Append-only record of engineering decisions made during autonomous runs.
Format: date, decision, 2-sentence rationale.

---

## 2026-05-28 — B0 overnight build (Postgres + R2 photo storage)

### lib/db.js — singleton pg.Pool with SSL=require for Neon
A single pool is created once on `db.init()` and reused across all requests; SSL
`rejectUnauthorized: false` is used because Neon's cert chain varies by region
and the connection string itself provides the trust anchor.

### lib/migrate.js — thin ordered runner, not Prisma/Knex
A 30-line custom runner was chosen over Prisma/Knex to avoid adding a build
step and to keep the migration files as plain readable SQL that the founder can
inspect and audit directly.

### Migration bootstraps schema_migrations before reading it
The runner emits a `CREATE TABLE IF NOT EXISTS schema_migrations` guard before
querying it, so the very first boot (before 0001_init.sql runs) doesn't fail
on a missing table.

### db.init() called non-blocking in app.listen callback
The Postgres init and migration run are fire-and-async from inside `app.listen`,
so a cold boot does not delay the first HTTP response even if Neon takes a few
seconds to wake up; failures are logged but never crash the process.

---

## 2026-05-26 — Overnight autopilot run

### Outgoing WhatsApp locked to allowlist by default (`WATI_SEND_MODE`)
`services/wati.js` now reads `WATI_SEND_MODE` (`all` | `allowlist` | `off`). It
**defaults to `allowlist`** (sends only to `ADMIN_PHONE` plus any numbers in
`WATI_ALLOWLIST`). Rationale: pushing to `main` auto-deploys to production and
the scheduler fires sends on boot; right after a spam-loop incident the safe
default is admin-only, recoverable with one env var (`WATI_SEND_MODE=all`)
rather than risking a repeat blast to real users.

### Deploy strategy: push to main, auto-deploy
Founder explicitly approved committing + pushing to `main` (Render auto-deploys
each push). Rationale: founder wants to wake to live progress; every push is
gated on `npm test` + `npm run smoke` passing, and behaviour-changing features
are flagged off by default so a deploy cannot break the working trial funnel.

### Live messaging restricted to ADMIN_PHONE for this run
Founder approved real sends only to `ADMIN_PHONE`; all other recipients are
blocked by the allowlist guard above. Rationale: lets the Day-1 funnel be
verified for real without any chance of messaging real trial users while the
founder sleeps.

### Rate limiting excludes webhook paths (deviates from brief's 30/min)
Global 200/min, with 10/min on /enroll, /waitlist and /admin/login; webhook
paths are skipped entirely. Rationale: all Wati and Razorpay webhook traffic
originates from a single provider IP, so an IP-based limit there would drop
legitimate user replies under load — the public enrol/login endpoints are the
real abuse targets and carry the tight limits instead.

### Helmet CSP disabled for v1
helmet is enabled with contentSecurityPolicy:false. Rationale: the landing and
admin pages rely on inline styles and CDN scripts (Chart.js, Google Fonts); a
strict CSP would break rendering, so we ship the other helmet headers now and
leave a proper CSP as a follow-up.

### Postgres migration drafted but NOT wired live
P1.1 (Prisma/Supabase) requires a `DATABASE_URL` to test against, which is a
founder action. Rationale: swapping the live persistence layer overnight with
no DB to validate against would risk data loss / a broken funnel on a system
that auto-deploys, so the JSON store remains the default and the migration is
queued in BACKLOG with the schema prepared.

---

## 2026-05-26 — Night 2 product decisions

These were decided by founder + CTO before the run; encoded here per the brief.

1. **Audit is fully free, no gate to view results.** The user sees their complete
   Aura Score + Consultant diagnosis with no email/phone gate; the paywall comes
   *after* the diagnosis. Maximises top-of-funnel signal; we accept reduced lead
   capture.
2. **Identity: phone required, email optional.** Phone is the primary identifier
   (consistent with Orator). Email is collected at the paywall for receipts +
   digests, but checkout can complete with phone alone.
3. **Aura++ is a status, not a SKU.** Two flags `oratorActive` + `lookmaxxingActive`;
   `auraPlusPlus` is computed (`both true`). Bundle price ₹1,999/mo applies
   automatically when both are selected at checkout.
4. **Channels:** Orator on WhatsApp; Lookmaxxing is web-only PWA. WhatsApp may
   send Lookmaxxing *nudges* (mirror reminder, reveal ready) to consenting users,
   but no Lookmaxxing protocol content flows over WhatsApp.
5. **Storage:** Postgres via Prisma if `DATABASE_URL` is set, else JSON files with
   a startup warning. Photos/videos to Cloudflare R2 if `R2_*` set, else local
   `/tmp/maincharacter-uploads` with a BACKLOG warning (volatile on Render).
6. **Build order:** P1 (bug fixes) → P2 (landing) → P3 (audit) → P4 (paywall +
   subscriptions) → P5 (PWA shell) → P6 (mirror) → P7 (protocol) → P8 (hair) →
   P9 (reveal) → P10 (re-audit) → P11 (cross-sell) → P12 (deploy + verify).

### P1.2 — Wati webhook verification: HMAC-preferred, IP-fallback, open-with-warning
`services/wati.verifyWebhookRequest` verifies `x-wati-signature` (HMAC-SHA256 of
the raw body) when `WATI_WEBHOOK_SECRET` is set; falls back to a
`WATI_WEBHOOK_ALLOWED_IPS` allowlist; else accepts unsigned and warns at boot.
Rationale: Wati's current plan does not document a signature header, so we ship
both strategies and let the founder pick by setting an env var — but we must not
hard-reject today, or every real user reply would 401 in production before the
secret is configured (the funnel would silently break). The boot banner prints
the active guard mode so the gap is visible, and BACKLOG tracks setting the secret.

### P0.3 — heavy/native deps (sharp, @aws-sdk/client-s3, web-push, ffmpeg) are lazy-required, NOT added to package.json yet
`services/storage.js` (and later push/video) `require()` these inside try/catch
and degrade gracefully: no `sharp` → store the original image without resize; no
`@aws-sdk` or no `R2_*` → write to a local uploads dir; no `web-push` → push
no-ops. Rationale: adding `sharp` to `package.json` makes it build natively on
every Render deploy — if that build fails, `npm install` fails and the WHOLE app
(including the working Orator funnel) stops deploying. We will not risk the live
deploy overnight for storage features the founder must finish configuring anyway
(R2 bucket, VAPID keys). The installs are queued as a single founder action in
BACKLOG; until then the audit funnel works end-to-end against local storage.

---

## 2026-05-27 — Night 3 channel migration decisions

Decided by founder + CTO before the run; encoded here per the brief. Wati is
removed; channels become Meta WhatsApp Cloud API (Orator), MSG91 SMS (Lookmaxxing
OTP), Resend email (receipts/reports). All new outbound respects the renamed
`WHATSAPP_SEND_MODE` (`all`/`allowlist`/`off`), default `allowlist` (admin-only).

1. **Wati is OUT.** Delete `services/wati.js`, remove `WATI_*` env vars from
   `.env.example` / `render.yaml` / docs. No Wati fallback provider — the founder
   explicitly does not want it.
2. **WhatsApp = Meta Cloud API directly.** New `services/whatsapp.js` uses Meta
   Graph API v18.0. DORMANT until env vars present — if `WHATSAPP_ACCESS_TOKEN`
   is empty, sends log `[whatsapp] DRY-RUN — credentials not configured` and
   return a stub success, keeping the code path live for tests without real sends.
3. **SMS = MSG91.** New `services/sms.js` for Lookmaxxing PWA OTP. DRY-RUN if
   `MSG91_AUTH_KEY` empty.
4. **Email = Resend.** New `services/email.js` for paywall receipts, Day-7
   Evolution Report HTML, audit confirmation, weekly reveal notifications.
   DRY-RUN if `RESEND_API_KEY` empty.
5. **Renaming.** `WATI_SEND_MODE` → `WHATSAPP_SEND_MODE` (same semantics). On
   boot, if `WATI_SEND_MODE` is set but `WHATSAPP_SEND_MODE` is not, mirror the
   value and log a deprecation notice. Legacy var removed from `render.yaml` /
   `.env.example`. Centralised in `lib/messaging-mode.js` so WhatsApp, SMS and
   email share one kill-switch (the variable is now generic "messaging mode").
6. **Webhook endpoints.** `/api/webhook/wati` → `/api/webhook/whatsapp`. Keep
   `/api/webhook/wati` as a 308 redirect for 30 days so cached Wati config does
   not 404. Delete after the window via a tracked BACKLOG item.
7. **Webhook signature.** Meta signs with `x-hub-signature-256` (HMAC-SHA256 of
   raw body using app secret). Replaces Wati signature verification. Until
   `WHATSAPP_APP_SECRET` is set, accept unsigned webhooks and warn at boot (same
   pattern as the Night-1 Wati handling) so real user replies don't 401 pre-config.
8. **Number 9958533994 kept.** Founder moves the same number from Wati to their
   own Meta Business Manager. No DB migration needed; code treats it as-is.
9. **Render env vars to add** (founder pastes once Meta approved):
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
   (generated UUID — see WHATSAPP_CLOUD_API_SETUP.md), `MSG91_AUTH_KEY`,
   `MSG91_TEMPLATE_ID_OTP`, `MSG91_SENDER_ID`, `RESEND_API_KEY`,
   `RESEND_FROM_EMAIL`, `ADMIN_EMAIL`.
10. **No PWA work tonight.** P5–P11 from V2 (PWA shell, mirror, protocol, etc.)
    stay deferred. Tonight is channel migration + closing the revenue gap only.

### Generated `WHATSAPP_VERIFY_TOKEN` (decision #9)
A random token is required for Meta's webhook GET-handshake. Generated value to
paste into Render (documented in WHATSAPP_CLOUD_API_SETUP.md). Rationale: the
value only needs to match between Render env and the Meta App webhook config, so
generating it now lets the founder copy one value into both places.

---

## 2026-05-27 — Night 4 Lookmaxxing PWA decisions

Decided by founder + CTO before the run; encoded here per the brief. Razorpay is
now LIVE in production and the Orator pillar is blocked on Meta approval, so
tonight ships the web-only Lookmaxxing PWA end-to-end with a paywall safety gate.

1. **`PAYWALL_PUBLIC` defaults to `false`.** While `false`, `/paywall` serves a
   "Launching this weekend — join the waitlist" page that captures phone + name
   to an `EarlyAccess` store; no Razorpay flow is reachable. When `true`, the
   Night-3 paywall logic runs unchanged. Rationale: Razorpay keys are now live,
   so the gate guarantees the founder's dogfood window cannot trigger a real
   charge; the founder personally flips the flag after validation.
2. **Founder seed route** — `POST /api/admin/seed-test-user` (admin-JWT-gated),
   body `{ phone, name, weakestAxis? }`. Upserts a User with `oratorActive:true`
   + `lookmaxxingActive:true` (so `auraPlusPlus` computes true), a pre-completed
   synthetic `AuditSession` (8 mid-range axes, one weakest at 35), and today's
   personalised protocol. Returns `{ user, loginUrl }`. Rationale: lets the
   founder dogfood the full ritual without going through live Razorpay.
3. **Admin bypass login** — `POST /api/lookmax/auth/admin-login`, body
   `{ phone, password }`, validates `isAdminPhone(phone)` + bcrypt against
   `ADMIN_PASSWORD_HASH`, returns a Lookmaxxing-scoped JWT (24h). The OTP path
   stays the default UI but shows "OTP currently unavailable — admin login only"
   until WhatsApp Cloud API is live + approved. Rationale: Meta is not approved
   yet, so OTP cannot deliver; admin login unblocks dogfooding immediately.
4. **Multi-admin allowlist** — new `ADMIN_PHONES` (comma-separated) and
   `ADMIN_EMAILS` (comma-separated); a `lib/admin.js` helper checks these,
   falling back to the singular `ADMIN_PHONE` / `ADMIN_EMAIL`. Every reader of
   the singular vars routes through the helper. Rationale: more than one operator
   needs admin access without re-deploying per phone.
5. **Photo storage to `/tmp`.** Mirror + hair photos save to
   `/tmp/maincharacter-uploads/{userId}/{date}.jpg`, served token-gated at
   `/uploads/...`. Every save logs a volatility warning; R2 migration is a
   week-2 BACKLOG item. Rationale: we are testing ritual logic, not data
   permanence; R2 needs founder-provisioned credentials.
6. **Weekly reveal stubbed.** `public/lookmax/reveal.html` ships the full UX
   (share buttons, timing copy, week framing); the artefact is a client-rendered
   canvas slideshow of the week's selfies. Real MP4 generation waits on ffmpeg in
   the Render container (BACKLOG). Rationale: the page UX is identical either
   way; ffmpeg is a container change the founder must make.
7. **Founder receives every protocol item.** No demographic/state filtering — the
   founder sees minoxidil, ketoconazole, retinoid, and explicit "DO NOT use jaw
   exercisers" copy. Rationale: human-in-the-loop decision #4; the founder is
   Customer #1 and must review the full library.
8. **No payment flow in founder dogfood.** The founder uses the seed route; the
   audit + paywall pages remain visitable (paywall shows the waitlist page until
   `PAYWALL_PUBLIC=true`) but the founder never touches Razorpay. Rationale:
   keeps the live-key blast radius at zero during testing.

### Reverted a stray native `bcrypt` dependency
An uncommitted `bcrypt` (native) addition was found in package.json at the start
of the run; reverted it. Rationale: the codebase authenticates with pure-JS
`bcryptjs` everywhere (lib/auth.js), and a native build can fail on the Render
deploy and take the whole app down (DECISIONS.md Night-2 P0.3). All Night-4
password hashing continues through `bcryptjs`.

---

## 2026-05-28 — Phase 1 + Phase 1.5 Discovery & Planning run (analysis/draft only)

### Persisted the security audit to file myself
`security-compliance-agent` returned its full pre-launch audit inline but did not write
`security/audit-pre-public-launch.md`. The orchestrator wrote the file from the agent's
returned content verbatim. Rationale: the deliverable path was a required output, and the
content was complete — re-running the agent would have burned tokens for no new information.

### gemini.js:85 prompt-injection fix deferred (not written this run)
The security audit found `generateEvolutionAssessment()` (services/gemini.js:85) concatenates
`user.name` + raw user replies into a Gemini prompt with no delimiter/guard, unlike the other
three guarded call sites. The fix was NOT written this run because the Phase 1.5 task is
analysis/draft-only with a hard stop before any code. Instead it was logged as item #8 in
FOUNDER_ACTIONS_THIS_WEEK.md as an isolated, founder-authorizable ~1hr fix independent of the
Top-3 build. Rationale: respect the explicit "do not start Phase 2 build" boundary while not
losing the finding.

### bcrypt vs bcryptjs in the founder checklist
FOUNDER_ACTIONS item #6 (set ADMIN_PASSWORD_HASH) specifies `bcryptjs`, confirmed against
lib/auth.js and the prior Night-4 decision that reverted a native `bcrypt` addition. Rationale:
native bcrypt can fail the Render build; the whole codebase hashes via bcryptjs.

### Women-market question scoped as research-only
`growth/future-market-question-women.md` is research notes for a LATER decision. Recommendation
recorded: separate sibling brand (shared backend), revisit at ~₹40L MRR sustained 3 months.
No features proposed, no focus split — men-first stands. Rationale: matches the founder's
explicit "do not recommend splitting focus now" instruction.

---

## 2026-05-28 — Phase 2 spec: Login Gate (P0-1) interim auth method

### Email magic link (Resend) chosen as the interim Lookmaxxing login, paired with a one-shot session mint at /payment-confirmed
`product/spec-login-gate.md` selects email + magic link (Resend) as the v1 auth method while WhatsApp
OTP remains dormant; the `subscription.activated` webhook additionally mints a single-use 15-min
`firstLoginToken` so /payment-confirmed silently logs the buyer in without an email round-trip.
Rationale: Resend has no DLT-style external lead time (single founder action — `RESEND_API_KEY`), is
already built and gated through the messaging-mode kill-switch, and lets us deliver a "no manual
login" first-touch on the happy path while keeping email as a durable recovery channel. SMS OTP (MSG91)
was rejected on DLT template-approval lead time (1–4 weeks); phone+password was rejected because its
reset path collapses to the same email dependency anyway, with strictly more failure modes.

---

## 2026-05-28 — Login-gate spec approved + founder rulings (Phase 2 Step 2)

### Auth method: Email magic link via Resend + one-shot firstLoginToken (silent first login)
Buyer pays → Razorpay `subscription.activated` webhook mints a 15-min single-use
`firstLoginToken` on the user record → `/payment-confirmed` exchanges it silently for
a 24h JWT → user lands in `/lookmax/` with no manual auth step. Email magic link is the
recovery surface (returning user, second device, cleared storage, F1 webhook-race fallback).
Phone+password rejected — collapses to same email-recovery dependency. SMS OTP via MSG91
rejected — 1-4 week DLT template-approval lead time, same class of blocker as the dormant
WhatsApp OTP. See `product/spec-login-gate.md` and `briefs/{backend,frontend,design}-login-gate.md`.

### GATE — PAYWALL_PUBLIC cohort cap ≤50 paid users until Postgres lands
Founder ruling 2026-05-28. Spec accepts the F10 risk (data/users.json wipe on Render
redeploy locks out paying users post-session) for dogfood + first cohort only. The public
paywall flip MUST NOT open to unbounded traffic until the Postgres migration is complete.
Rationale: every record wiped between deploy and Postgres is a refund — bounded risk is
acceptable for dogfood/launch validation; unbounded risk is not. Tracked in STATUS.md as
an explicit launch gate that survives session boundaries.

### Spam-folder copy line: pragmatic over voice-pure
Founder ruling 2026-05-28. `login.checkInbox.body` uses "Check your spam folder if it does
not arrive." rather than the voice-pure "the folder where your inbox sends things it does
not recognise." Rationale: in a recovery moment, clarity over register — "spam folder" is
a noun (not hype) and matches the literal label in Gmail/Outlook for Indian users on slow
connections. Locked into `product/spec-login-gate-copy.md`.

### Resend setup deferred to founder-action item #9; build proceeds in parallel
Founder will set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + verify the sending domain
(~30 min) as item #9 in `FOUNDER_ACTIONS_THIS_WEEK.md`. Build does NOT block on this —
silent first-login works for the happy path without Resend (the `firstLoginToken`
exchange happens on `/payment-confirmed` over HTTPS). Only the email magic-link recovery
surface and the receipt-email fallback degrade until Resend is live; spec already covers
that with the `sendEmail` DRY-RUN path returning `{result:'dry-run'}` and the login
flow returning `{status:'sent'}` regardless (no enumeration, no crash). Build merges with
`LOOKMAX_EMAIL_LOGIN=false` by default so nothing user-visible changes until founder
flips it after Resend is live.

---

## 2026-05-28 — Login Gate backend shipped (6 commits)

### Per-IP cooldown map is module-level and shared across consume-link + exchange-first-login
Both endpoints share the same `ipCooldown` Map in `routes/lookmax-auth.js`. A cooldown
triggered by brute-forcing consume-link also gates exchange-first-login from the same IP.
Rationale: this is the desired behaviour (the same IP is suspicious regardless of which
endpoint it is hammering); the shared map was the simpler and safer design vs. two maps
that could be played off each other.

### Throttle/cooldown maps reset on Render redeploy (accepted v1 risk)
The per-email throttle and per-IP cooldown maps are in-process memory. A Render redeploy
resets them. Rationale: Render free-tier redeploys are infrequent and every other in-process
map (express-rate-limit store) has the same property — this is a documented v1 trade-off
tracked in the spec §8. The Postgres + Redis migration (roadmap §2) will add a durable
cooldown store.

### `require('crypto')` is inline inside processPaymentEvent for the firstLoginToken mint
Node's built-in `crypto` module is required inline (inside the function) rather than at
file top to keep the diff surgical (one block inside an existing large function). Rationale:
the spec says "two surgical mods" and adding a top-level require would change two areas of
the file instead of one; inline require for a built-in is idiomatic Node and has no
performance cost (Node caches it on first require).

### magic-link.html template is a stub — frontend-agent must replace the body markup
`data/email-templates/magic-link.html` ships a functional but minimal template (matches
the paywall-receipt.html structure). All human-readable copy slots are marked
`[copy-consultant TBD]` per spec §5. The template renders the `{{magicLinkUrl}}` token
and the `{{name}}` token correctly. Frontend-agent must replace the markup and copy before
the flag is flipped to `LOOKMAX_EMAIL_LOGIN=true` in production.

---

## 2026-05-28 — Login Gate frontend shipped (4 commits)

### magic-link.html template filled with full inline-style HTML
Full paywall-receipt.html-convention email built: table-based, preheader hidden div,
Cormorant italic headline, body (4 sentences per approved copy), gold CTA button, fallback
URL row, security note, signature. All copy from founder-approved spec-login-gate-copy.md
Section B. The preheader token `{{preheader}}` is rendered by renderTemplate() which blanks
any unsupplied tokens — sendMagicLink() in email.js does not yet pass preheader so it
renders as empty (blank preheader is harmless — client falls back to body text).
Rationale: spec says frontend-agent fills the template; stub replacement satisfies the
build-brief requirement; preheader can be wired in a follow-up when sendMagicLink() is
extended.

### paywall.html email-required: client-side only, server enforces
Email field becomes `aria-required` + submit-blocked when Lookmaxxing is in the pillar
selection. The `(optional — for receipts)` span is hidden via JS when the field becomes
required. Label text itself is NOT changed (locked copy until copy-consultant provides
a conditional version per brief §5). The `data-required="lookmax"` attribute is a
semantic marker for future automated selectors. Rationale: brief §5 says "do NOT touch
the email label… until copy-consultant provides a conditional version"; the error message
on submit is the v1 enforcement.

### login.html: token-on-load consumes immediately; admin-only mode degrades gracefully
When `/api/lookmax/auth/method` network errors, the page falls back to `stateAdmin` (same
as admin-only flag). This is the conservative choice — an unreachable server should not
hang the page in the loading state. The resend button is re-cloned on each startResendCountdown()
call to detach any prior click listeners (avoids listener accumulation on multiple resend taps).
window.__LM_RESEND_DELAY_MS and window.__PC_POLL_INTERVAL_MS / window.__PC_POLL_TIMEOUT_MS
are the documented test seams per design spec §6.6.

### payment-confirmed.html: app.js NOT loaded; localStorage written directly
app.js is deliberately absent on payment-confirmed.html (brief §5: "would pull in the nav,
install-prompt, SW registration on a page that does not want any of them"). The one-line
localStorage.setItem('lookmax.token', jwt) uses the same key the app.js LM.setToken()
writes (verified: app.js line 7 uses 'lookmax.token'). Rationale: brief §5 explicitly
says to use this pattern rather than loading app.js.

### confirmed.mirrorCta left as FOUNDER COPY placeholder
The mirror button default label is "Open the mirror" and the supporting line is
"The mirror is ready when you are." per the spec placeholder. These are intentionally
non-approved defaults — a FOUNDER COPY comment in the HTML flags them for replacement.
Rationale: spec §5 and brief §4 both state confirmed.mirrorCta is [FOUNDER COPY];
frontend-agent must not improvise in The Consultant's voice for this slot.

---

## 2026-05-28 — Security follow-up: L-1 + L-2 from audit-login-gate.md

### L-1: maskEmail applied to all three DRY-RUN/suppressed/blocked log lines in services/email.js
`services/email.js` now requires `maskEmail` from `lib/log-mask.js` and wraps every `${to}` in
the three guard-path log calls (mode=off, allowlist-blocked, credentials-not-configured). All
other log calls in the file that emit `to` are on the live-send success/error paths and remain
unmasked (the email must appear in send-confirmed / error logs for operator debugging). Rationale:
log-mask.js already existed as the canonical helper; the three guard paths fire in DRY-RUN which
is the high-frequency state before Resend is configured — these are the highest-risk lines.

### L-2: IP_COOLDOWN_MAP_CAP = 10_000 + FIFO eviction added to ipRecordFailure
`routes/lookmax-auth.js` mirrors the `emailThrottle` FIFO cap pattern exactly: constant defined
alongside the map, eviction fires inside `ipRecordFailure` before each `ipCooldown.set()` call.
The eviction runs only when the map is at-or-above cap (10k entries, ~800KB worst-case), which
is unreachable under normal operation but closes the theoretical unbounded-growth asymmetry
the audit flagged.

---

## 2026-05-28 — Razorpay recurring-payments blocker discovered during dogfood

Founder attempted the first end-to-end payment test of the new login gate. Razorpay
hosted checkout returned **"seller does not support recurring payments"** even though the
subscription object was created successfully (`sub_Suhr5kDlLNt5Gg`). Root cause: the
Razorpay account does NOT have Subscriptions / recurring payments enabled — an account-level
flag that requires a Razorpay support ticket + (typically) GST cert, MOA/AOA, and a
brief description of the recurring product.

**Status:** No code change required. The codebase is doing the right thing — creating
subscription objects via `services/razorpay.js createSubscription()`. The blocker is
purely a Razorpay-account-side enablement.

**Impact:** Gates the entire revenue flow. Until Razorpay enables Subscriptions on this
account, NO subscription can be charged — silent-first-login cannot be dogfooded end-to-end,
NOW-1/2/3 cannot reach real paying users.

**Action:** Logged as FOUNDER_ACTIONS_THIS_WEEK.md item #10 with a 🚨 banner at the top
of that file. Founder opens the Razorpay support ticket; 1-3 business days typical wait.

**Dogfood workaround during the wait:** Use `POST /api/admin/seed-test-user` (existing
admin endpoint at `routes/admin.js:198`) to create a synthetic Aura++ user with seeded
audit + protocol. Walk the Lookmaxxing PWA screens (dashboard / mirror / protocol / hair)
via that seeded user. Limitation: seed-test-user does NOT mint a `firstLoginToken` (only
the Razorpay webhook does), so the silent-first-login path on `/payment-confirmed` remains
untested until Razorpay enables recurring. The Lookmaxxing screens themselves are fully
walkable.

**PAYWALL_PUBLIC flip-back:** Founder flipped to `true` for the test, but since no
checkout can complete on the blocked account, kept on `true` provides zero benefit and
non-zero exposure (a real visitor could attempt and fail confusingly). Flipped back to
`false` immediately on discovery of the blocker.

---

## 2026-05-28 — P1 landing page console error fix

**Deferred `#coming-soon-modal` backdrop listener into `DOMContentLoaded`:** The modal div is declared after the closing `</script>` tag, so `getElementById('coming-soon-modal')` returned `null` at IIFE execution time — throwing `TypeError: Cannot read properties of null (reading 'addEventListener')` on every page load. Wrapped the three-line listener wiring in `document.addEventListener('DOMContentLoaded', …)` so it runs after the full DOM is parsed. Three regression tests added to `tests/landing.test.js` to guard this ordering permanently.

**Regression (a89c646) — `</script>` literal inside a JS comment truncated the script block:** The explanatory comment text referenced the literal string `</script>`, which the HTML parser treated as the actual end-tag, truncating the IIFE and causing `SyntaxError: Unexpected end of input`. Fixed by rewriting the comment to avoid the substring. A new test in `tests/landing.test.js` ("no `</script>` literal inside script bodies") now parses all script blocks and asserts none contains the closing-tag literal — preventing the same class of bug in future edits.

---

## 2026-05-28 — NOW-1: F1 waitlist audit echo, F2 shared helper, F3 recovery link

### F1 — Waitlist audit echo (`public/paywall-waitlist.html`)
Inserted one `.audit-summary` block between the lede and the form in `paywall-waitlist.html`. The block is hidden by default and shown only on a successful `GET /api/audit/result/:token` fetch via the shared `loadAuditEcho` helper. On 404/409/network error it stays hidden — the form is unaffected. Rationale: carries the personalisation momentum from Scene 6 into the ask, closing audit P0-3 seam, without risking any degradation on expired/missing tokens.

### F2 — Shared audit-echo consolidation (`public/shared/audit-echo.js`)
Extracted `AXIS_LABELS` map and `loadAuditSummary` logic from `paywall.html` into a new file `public/shared/audit-echo.js` (served by the existing `express.static` for `public/`). Both `paywall.html` and `paywall-waitlist.html` load it via `<script src="/shared/audit-echo.js">`. The degradation guard (`if (!res.ok) return`) is preserved inside `loadAuditEcho`. Rationale: single source of truth prevents the axis-label map from drifting between the two pages; zero new infrastructure (plain static file, no bundler).

---

## 2026-05-28 — B5: KPI instrumentation infrastructure

### Event sink design (`services/events.js`)
File-backed JSONL today (append-only, `data/events.jsonl`); Postgres post-B0 via the same interface. Backend auto-selected by `EVENTS_BACKEND` env var — if unset and `DATABASE_URL` is present, Postgres is chosen; otherwise JSONL. Rationale: JSONL is safe to ship before B0 because the interface is identical; migrating later is one env-var flip plus the Postgres schema from the spec. No third-party SDK — DPDPA biometric data means zero new processors before legal review (spec §0 principle 2).

### /api/events rate limit pattern
Used a dedicated in-memory `Map<ip, [timestamps]>` capped FIFO at 1000 IPs (mirrors the L-2 fix pattern from the auth surface). Sliding 60-event / 1-minute window per IP. Silent 204 on reject — never 429 — so scrapers do not learn they are throttled. Rationale: a global `express-rate-limit` instance here would share state with auth endpoints; isolating to a local Map gives tighter semantics and easier testing.

### Anonymous ID via localStorage
Spec §2.6 permits localStorage (survives reload, does not cross subdomains). Cookie alternative was considered but localStorage is simpler for PWA contexts and requires no SameSite/Secure header tuning. The field is `mc_anon_id`, a 32-byte random hex, never rotated, cleared only on localStorage.clear().

### Admin funnel tile performance caveat
Tiles read the whole JSONL file on every `/api/admin/funnel` call. Fine for ≤100k events (~1MB, under 200ms). Once the file passes 100k lines the read should move to Postgres. Noted in BACKLOG. The tile computation is JSONL-agnostic — same query shape works for Postgres.

### F3 — "Keep this reading" recovery link (`public/audit.html`)
Added a ghost-button affordance below the Scene 6 result content. On mobile UAs with `navigator.share` it invokes the native share sheet; on all other contexts it writes `${origin}/audit/result/${sessionToken}` to the clipboard and shows a one-line confirmation that fades after 4s (with `prefers-reduced-motion` guard). The confirmation text and button label are marked `[COPY DRAFT — founder approval]`. The `data-event="recover_link_action"` attribute is present for future KPI wiring. DPDPA check performed: `GET /api/audit/result/:token` returns scores/diagnosis/weakestAxis only — no photo URLs. `GET /audit/result/:token` (server.js:169) serves `audit.html` — no API response at all. Shareable link is safe.

---

## 2026-05-28 — Design-spec structural lift: 6 Lookmaxxing surfaces

Structural-only pass across mirror, protocol, hair, reveal, login, payment-confirmed.
No new user-visible Consultant-voice strings shipped without approval. Copy-deferred
slots are HTML comments (`<!-- TODO copy: ... — design-lookmax-{surface}.md §N -->`).

### mirror.html — Chart.js replaced with vanilla canvas
Chart.js (80KB CDN dep, render-block) removed. Replaced with a ~50-line vanilla
`drawTrend()` using canvas2d — same visual output (polyline + dots + y-grid).
Rationale: spec §4 calls this out as a perf requirement for mid-range Android;
the `drawTrajectory` pattern from reveal.html was the reference.

### mirror.html — 3-beat staged reveal
Score count-up at t=0; level+consultant fade at t=2s; axis bars stagger 80ms each
+ trend card at t=2.6s. All gated behind `prefers-reduced-motion` (instant when
reduced). Rationale: spec §2.3 — the daily mirror is the highest-leverage moment
in the product; rhythm earns it.

### mirror.html — rotline 2200ms, streak badge Day N
Was 1600ms; slowed to 2200ms per spec §2.2 so the user sees ~3 axis names before
the reveal. Streak badge changed from `🔥` (CLAUDE.md §2 violation) to `Day N`
plain count (founder-approved format).

### protocol.html — tier chip promoted to header row
Moved from inside `.instruction` (collapsed) to always-visible title-row. Rationale:
spec §2.1 — the evidence tier is the single most credibility-loaded element; showing
it requires no user action.

### protocol.html — 44px box tap target + CTA glow
Checkbox tap area extended to 44×44 via ::before pseudo-element without enlarging
the visual box. completeBtn gains `.btn--complete-ready` box-shadow glow at ≥80%
completion — single 0.6s transition, then static (spec §5 — not infinite pulse).

### hair.html — Norwood domes re-treated
Removed gold fill on .nw.on .dome (gold = good in our system; stage 7 gold would
read as "best", opposite of clinical reality). All 7 domes are neutral --muted
outlines; active stage gets a ◆ glyph above it via .nw__mark. Rationale:
design-lookmax-hair.md §2.1.

### hair.html — compact locked view
renderResult(r, compact=true) now returns only Norwood row + score lines. Previously
it showed the full result including do/do-not recommendations from last week — those
are already in the current protocol page.

### reveal.html — trajectory separated from stage
Canvas was `position:absolute` inside .stage, overlapping user faces. Moved to a
separate .traj-card below the stage. Rationale: spec §2.1 — the line overlapping
the face "looks like a chart bug not a feature."

### reveal.html — Day-30 side-by-side shell
showDay30() renderer added; activated by `?mode=day30`. Fetches
`/api/lookmax/reaudit/result` (B2 backend, not yet live). Renders a graceful empty
shell when the endpoint is absent. Photo grid, paired-bar axis list, two-point
trajectory canvas, Consultant+close line regions all present but awaiting server
data and copy approval. Down-delta: --ink (never --bad) per spec §11.

### reveal.html — share controls restructured
Replaced 2×2 button grid with: primary Share button (navigator.share or clipboard)
+ three text mini-links (instagram/tiktok/whatsapp) with 44px tap targets.
Clipboard toast uses approved F3 copy "Copied. Holds 24 hours." lifted from
audit.html. data-share="..." attrs retained for existing test contract.

### login.html — consume-error recoloured
class="err" → class="login-error-note" with gold left-border + --muted text.
Rationale: spec §2.3 — the red was punitive for a system error; Consultant-voice
pattern (same as .consultant block) is the right register. fadeIn() now has
prefers-reduced-motion guard.

### payment-confirmed.html — waiting state breath + CTA hierarchy
◆ breath animation (mc-breath, 4s opacity, pure CSS) added above "Confirming with
the bank". Mirror CTA lifted from .steps into standalone .pc-mirror-cta block.
Receipt collapsed from 3-row to single dot-separated line. Hidden compat elements
id="rPlan/rAmount/rNext" retained for existing test contracts. All existing API
contracts, copy, and test seams preserved.

### Copy-deferred count by surface
- mirror: 7 TODO copy comments
- protocol: 5 TODO copy comments
- hair: 5 TODO copy comments
- reveal: 9 TODO copy comments
- login: 1 TODO copy comment (#stateLoading body line)
- payment-confirmed: 1 TODO copy comment (Orator-only disabled-button)
Total: 28 strings awaiting copy-consultant approval + founder sign-off.
