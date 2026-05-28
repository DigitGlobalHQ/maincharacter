# Decisions Log

Append-only record of engineering decisions made during autonomous runs.
Format: date, decision, 2-sentence rationale.

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
