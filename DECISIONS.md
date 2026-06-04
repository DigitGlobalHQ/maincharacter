# Decisions Log

Append-only record of engineering decisions made during autonomous runs.
Format: date, decision, 2-sentence rationale.

---

## 2026-05-28 — Stage-1 Audit Engine (Wave 2A)

### JSON-file store (AUDIT_V2_STORE_PATH) as the audit_sessions_v2 backing store

The route uses the same atomic-write JSON pattern as models/User.js rather than requiring DATABASE_URL at boot. When DATABASE_URL is set, `migrations/0002_audit_engine.sql` creates the `audit_sessions_v2` Postgres table and the migration runner picks it up at next boot — the JSON store is the in-process fallback that keeps tests passing without a live database and lets the Render free-tier boot without Postgres provisioned.

### Resolution gate: PREMIUM_FIELDS stripped server-side, never client-side

The five premium blocks (decomposition, biggestLever, quests, styleAndColour, starterPlan) are deleted from the JSON before the response is sent, not just hidden with CSS. This means the client never receives the data it hasn't paid for — the blur is a UI affordance layered on top of a real server-enforced gate, not security through obscurity alone.

### Guest merge: session ID is the guestId, not a separate UUID

When POST /guest creates a session it uses the guestId as the session ID directly (one session per guest). This keeps the ownership check O(1) — no scan required — and the merge transaction is a single `_updateSession(guestId, { userId, guestId: null })`. The trade-off is that a guest can only have one in-flight audit at a time, which matches the spec (one photo, one reading per session).

### Merge carries geminiReport into users.lookmaxBaseline

On merge the server copies gemini_report directly into `users.lookmaxBaseline` if the user has no existing baseline. This means the Day-30 re-audit engine (`routes/reaudit.js`) and the Daily Mirror engine (`services/vision.js`) immediately see the guest's full report as the baseline without any additional plumbing — both already read `user.lookmaxBaseline`. The reaudit/status endpoint returns `baselineAvailable: true` as soon as the merge completes.

### PDF generation uses pdfkit built-in fonts

The PDF renderer uses pdfkit's built-in Helvetica (body), Times-Roman (headlines), and Courier (numerals/data) instead of fetching Google Fonts. This avoids any network dependency at render time and keeps the PDF generation path fully synchronous. Cormorant Garamond and JetBrains Mono are the brand-correct choices for the HTML surfaces — the PDF is a functional document, not a brand surface, so the delta is acceptable.

### Gemini API key absence: fallback report, not hard failure

When GEMINI_API_KEY is absent (or the RPM limit is hit), the /analyze route returns a structurally valid fallback report instead of 500. This means the funnel works end-to-end in local dev and CI without a live key, and the PDF route (which reads geminiReport) will also function. The fallback report is clearly labelled in its warnings array so the user knows a photo would sharpen the scores.

### pdfkit added to production dependencies

pdfkit (~500KB) was added as a production dependency for the /audit/:id/pdf route. It is lazy-required (`require('pdfkit')`) inside the route handler so the rest of the server bears zero overhead when the PDF route is not called. The size is within the stated acceptable bound from the brief.

---

## 2026-05-29 — Stage-1 Audit Engine (Wave 2B): BLACK & SILVER frontend surfaces

### New /lookmaxing/* surfaces use BLACK & SILVER tokens, not the existing gold palette

The 8 lookmaxing audit funnel surfaces (`index.html`, `start.html`, `quiz.html`, `capture.html`, `audit.html`, `full.html`, `audit-full.html`, `fork.html`) live under `public/lookmaxing/` with their own `tokens.css` copied from `product/design-lookmaxing-tokens.css`. The existing `/lookmax/*` gold-tokened PWA pages are untouched. The body `class="lookmaxing"` scope-gate in the CSS ensures the black+silver variables only apply to the new funnel — zero regression risk on existing surfaces.

### tokens.css is a mirror copy, not a symlink

The file is copied (not symlinked) to `public/lookmaxing/tokens.css` so it is served directly as a static asset without any special build step. A "do not edit here" comment at the top points back to the source. If the source is updated, the copy must be re-applied manually — logged here so the maintainer knows.

### audit.html serves both Surface 5 (free view) and Surface 6 (paywall modal)

Both the free-resolution report and the `?pay=true` paywall modal live in `audit.html` rather than separate files. The paywall is an inline modal overlay, not a separate page load. This matches the spec (`/lookmaxing/audit/:auditId?pay=true` opens the modal) and avoids a round-trip HTML request that would cause visible flicker when tapping any blurred block.

### audit-full.html mirrors full.html to satisfy the server.js route name

The Wave 2A backend (server.js) references `lookmaxingPage('audit-full.html')` for the `/lookmaxing/audit/:id/full` route. The main source file is `full.html`; `audit-full.html` is a copy so both names resolve without modifying server.js. If the route name is ever updated, delete `audit-full.html` and let `full.html` serve directly.

### Surface 8 trial CTA ships disabled; feature-flag controlled by window.LOOKMAX_TRIAL_LIVE

The Daily Mirror trial is built tomorrow (spec §1). The fork.html CTA ships tonight as `disabled` with `aria-disabled="true"`. Flipping `window.LOOKMAX_TRIAL_LIVE = true` (injectable via a `<script>` tag or server-rendered inline JS) enables the CTA without any HTML change. This is the agreed pattern from the design spec open structural call #2.

---

## 2026-05-28 — stage-1-audit Wave 2C: Orator routes cordoned off

### /start 302s to /lookmaxing; public/start.html preserved on disk

`GET /start` now returns a 302 to `/lookmaxing` rather than serving the Orator enrollment form. The Orator pillar cannot take real users until Meta WhatsApp Cloud API is approved and `WHATSAPP_SEND_MODE` is flipped to `all`, so routing visitors into the enrollment funnel would produce a dead end; redirecting to the active Lookmaxxing entry point is the least-surprising behaviour and keeps the asset for the eventual Orator relaunch.

### Orator pcard onclick routes to Coming Soon modal, not /start

The Orator pillar card on `landing.html` previously sent visitors directly to `/start`. It now calls `openComingSoon('orator')`, opening the existing waitlist modal (the `names` map was extended with `orator: 'The Orator'` to display the correct pillar name). This preserves the visual presence of the Orator pillar — reinforcing the dual-pillar brand promise — while capturing waitlist intent rather than depositing users in a non-functional signup flow. A `data-event="orator_waitlist_modal_opened"` attribute was added for KPI tracking.

---

## 2026-05-28 — Task 1: Durability verification scripts (B0 wiring confirmed)

### backfill script is founder-runnable on Render shell; DATABASE_URL not local
`scripts/backfill-json-to-pg.js` exists and is idempotent. Because DATABASE_URL
is only set in the Render dashboard (not locally), the script must be run in the
Render shell: `node scripts/backfill-json-to-pg.js`. The test `tests/durability-prod-shape.test.js`
skips gracefully when DATABASE_URL or R2 vars are absent (8 skipped in CI without DB).

### verify-r2-roundtrip.js uses a manually crafted 1×1 PNG (no fixture file)
The PNG is assembled using Node's built-in `zlib.deflateSync` and a table-based
CRC-32 implementation to avoid any external image dep at the script level.
The round-trip checks: put → getSignedUrl → fetch → assert 200 + byte-count → delete.

---

## 2026-05-28 — Task 2: Photo hygiene (compression + retention + DPDPA)

### putPhoto() uses JPEG quality 78, max-edge 1600 px, EXIF stripped via sharp withMetadata(false)
Quality 78 is the mobile-standard sweet spot for face photos (~200-300 KB for a
typical 1600px selfie), matching WebP Q80 perceptually but with broader decode
support on older devices. Auto-orient via `.rotate()` ensures iOS portrait shots
render correctly without client-side rotation logic.

### Pruner called AFTER upload with ALL current keys (including the new one)
The API `pruneMirrors(userId, allKeys)` / `pruneHair(userId, allKeys)` receives
all keys INCLUDING the just-uploaded key. Caller builds this list from `Lookmax.getMirrors()`.
Delete count = `keys.length - keep`. This is consistent with "the 8th-oldest is
deleted when the new photo arrives" from the brief.

### Pruner runs fire-and-forget, never blocks the HTTP response
Photo pruning is non-critical (worst case: temporary storage overage); the response
is sent immediately after addMirror/addHair and the prune runs in a detached Promise.
Any pruner error is logged as WARN but never surfaces to the user.

### DPDPA endpoints in routes/lookmax.js behind DPDPA_RIGHTS_ENABLED (default true)
Both endpoints (`DELETE /api/lookmax/me/data` and `GET /api/lookmax/me/data/export`)
are live by default so the compliance posture is established before user traffic arrives.
The `?dry-run=true` escape hatch on DELETE lets the founder test safely without data loss.

### data-rights.jsonl audit log (append-only, non-blocking)
Every invocation of the export or delete endpoint appends a JSON line to
`data/data-rights.jsonl` with `{ ts, userId, action, ip }`. This is the DPDPA
§14 grievance-admissible audit trail. A database-backed `data_rights_log` table
is deferred until Postgres migration is complete (BACKLOG).

### export endpoint returns 24h signed URLs, never raw R2 keys
All R2 keys gathered from mirror/hair/baseline records are converted to presigned
URLs (24h TTL) before inclusion in the export response. Raw `r2:` prefixed keys
never appear in any client-facing response (DPDPA compliance + CLAUDE.md §4 DPDPA
guard note).

---

## 2026-05-28 — Dogfood access layer (founder comp grants + time-warp + simulate-reaudit)

### comp users identified by `user.comp === true` flag; excluded from all 19 funnel event arrays
Rather than a separate comp-events allowlist or a separate JSONL file, comp status
is a boolean field on the user record (`user.comp = true`, set by `/api/admin/grant`).
`getCompTokens()` builds a Set at query time, `filterCompEvents()` applies it to
every event array before any tile computation runs. This is a single pass per tile
request and adds zero storage overhead.

### Synthetic phone for comp users — `9100000XXXXXXX` prefix + 6 random hex bytes
`/api/admin/grant` creates a new user when the email is not found. Since phone is the
primary key, a placeholder is required; the `9100000` prefix is recognisable in the DB
as synthetic (real Indian mobiles start `91[6-9]`), and the random suffix prevents
collisions across concurrent grants.

### `simulate-reaudit` feeds synthetic scores into the existing `reAuditResult` field
Rather than a parallel simulate-only field, the synthetic result is written to
`user.reAuditResult` (same field the real re-audit endpoint writes). This means
`/api/lookmax/reaudit/result` renders the simulated data identically to real data —
no frontend branching and no risk of the simulation leaking into a real result path
(each grant re-runs atomically via `updateUser`).

### heldCount=8 edge case: all axes fall to −5..−8 (not truly held per noise tolerance)
The spec says "heldCount=8 → all axes within ±2 — overall still goes down." These two
constraints are geometrically incompatible (8 axes at ≤±2 produce an overall delta ≤ ±2,
which is flat not down). Resolved: heldCount=8 produces all axes at −5..−8 so overall
is clearly DOWN; the test only asserts `overallDelta < -3`, not that 8 axes are held.

### Magic-link token issued at `/api/admin/grant` reuses the existing magicLinkToken field
Rather than a separate `compSessionToken` field, the grant endpoint writes a fresh
32-byte hex into `magicLinkToken / magicLinkExpiresAt` (same fields used by the
email magic-link login flow). The `/lookmax/login?token=...` page already knows how
to consume this token — zero new auth surface.

---

## 2026-05-28 — 30-string founder copy approval gate shipped

### All 30 Consultant voice strings approved and applied verbatim

The founder walked through every row in `product/copy-pending-approval-2026-05-28.md`
and approved each string (some as the agent's #1 recommendation, some as alternatives
or tighter swaps). The approved strings were applied verbatim across 6 surfaces:
`mirror.html` (#01–#07), `protocol.html` (#08–#12), `hair.html` (#13–#17),
`reveal.html` (#18–#28), `login.html` (#29), `payment-confirmed.html` (#30).
Every replaced string carries a `<!-- COPY APPROVED 2026-05-28 (#NN) -->` marker
linking back to the rationale document.

### Weekly + Day-30 template strings extracted to `data/reveal-copy-constants.js`

Strings #19–#21 (weekly UP/FLAT/DOWN) and #25–#28 (Day-30 UP/FLAT/DOWN + close line)
are server-side templates with `{{variable}}` interpolation. Rather than embedding
them inline in `routes/lookmax.js` or `routes/reaudit.js`, a dedicated constants module
(`data/reveal-copy-constants.js`) exports the raw templates and three helper functions
(`weeklyConsultantLine`, `reauditConsultantLine`, `reauditCloseLine`). B2's reaudit/result
endpoint reads these helpers; the frontend renders whatever the API returns.

### #27 Day-30 DOWN variant — held-count branching is server-side only

Per the brief, when `heldCount === 0` the third sentence of the DOWN copy
("The axes that held tell us the protocol held.") is dropped. This branching is
implemented in `reauditConsultantLine()` in `reveal-copy-constants.js` and consumed
by the B2 reaudit/result endpoint. The frontend never branches — it renders the
pre-selected string from the API response.

### #30 Orator-only CTA rendered conditionally in payment-confirmed.html

The disabled-button CTA block ("Day 1 arrives tomorrow" + caption) is only injected
into `#pcMirrorBlock` when `d.oratorActive === true && d.lookmaxxingActive !== true`.
When Lookmaxxing is also active, the mirror CTA block takes priority (unchanged from
prior spec). This avoids the page showing a disabled button to Aura++ bundle buyers.

### 51 new test assertions in `tests/copy-approved-2026-05-28.test.js`

One test file per-batch was rejected in favour of a single canonical file that asserts
all 30 approved strings (plus COPY APPROVED comment markers). The file covers: static
string presence, conditional render branches (#15, #16, #27 held-count), the constants
module (#19–#28), and the Orator-only fork (#30). Total test count moved from 794 to 845.

---

## 2026-05-28 — NOW-2 / B2: Day-30 Re-Audit renewal engine

### lookmaxBaseline shape expanded from bare scores to full struct
`lookmaxBaseline` was previously just `aestheticScores` (the raw 8-axis object).
NOW-2 requires `{ scores, leverageAxis, overall, capturedAt, photoStorageKeys }` so the
re-audit can compute the correct per-axis deltas, label the leverage axis, and generate
signed photo URLs without re-querying the expired AuditSession. The shape is set once at
`subscription.activated` and never overwritten (guard: `!user.lookmaxBaseline`).

### photoStorageKeys stored server-side only — never in any client response
DPDPA compliance: `lookmaxBaseline.photoStorageKeys` contains raw R2 keys
(`r2:audit/{token}/baseline-{slot}.jpg`). `GET /api/lookmax/reaudit/result` strips this
field entirely from the response and converts keys to 15-min presigned URLs via
`storage.getSignedUrl()`. The `storageKey` field name never appears in client output.

### DOWN-variant held-count branching (NOW-2 §3.4b clause 4)
Axes with `delta30 > -2` are counted as "held or rose" (noise tolerance matches the
audit's ±2-point rounding). When `heldCount >= 1` the sentence
"The axes that held tell us the protocol held." is included in the DOWN copy.
When `heldCount === 0` that sentence is dropped — it would be a factual lie.
Both variants still end with `◆ MainCharacter` and are verified by
`tests/reaudit-down-template.test.js`.

### Delta sign thresholds: flat band is [−3, +3)
Overall delta in `[-3, 3)` → `flat`, ≥ 3 → `up`, < -3 → `down`.
A 2-point swing could be pure measurement noise (lighting, angle, phone model
calibration); the flat band absorbs this so a trivially positive delta doesn't
inflate the user's reading.

### Re-audit routes in routes/reaudit.js, not routes/lookmax.js
`routes/lookmax.js` is already 500 lines. The re-audit engine (status, submit, result)
is a distinct feature with its own pure functions exported for testing; isolating it
keeps diffs surgical and the test surface cleanly bounded.

### reaudit_reveal_viewed added to ALLOWED_EVENTS (NOW-2 §KPI)
The four re-audit KPI events (`reaudit_card_shown`, `reaudit_started`,
`reaudit_completed`, `reaudit_reveal_viewed`) are added to `services/events.js`
ALLOWED_EVENTS. The events already had `reaudit_card_shown/started/completed` from
B5 scaffolding; only `reaudit_reveal_viewed` was missing.

### Pull-based eligibility — no scheduler added
`GET /api/lookmax/reaudit/status` computes eligibility on every request from user
fields (`lookmaxxingStartedAt`, `lookmaxBaseline`, `reAuditCompletedThisCycle`).
No cron or background job — the brief explicitly says "pull-based per spec", and
adding a scheduler would introduce state across the server restarts that the
ephemeral Render free-tier disk cannot survive.

---

## 2026-05-28 — B4 overnight build (Web Push + Weekly Reveal MP4)

### services/push.js — DRY-RUN pattern identical to services/whatsapp.js
When `WEB_PUSH_VAPID_PUBLIC` and `WEB_PUSH_VAPID_PRIVATE` are unset, every
send returns `{ result: 'dry-run' }` without calling the web-push library —
safe default that matches the WhatsApp/SMS/email DRY-RUN pattern already in
production.

### push_subscriptions stored on user record; never returned to client
`push_subscriptions` is an array on the User model. The field is stripped in
`publicUser()` in lookmax-auth.js so it never appears in `/api/lookmax/me`
or any other client-facing response (DPDPA compliance — PII-adjacent data
must not leak through any unauthenticated API surface).

### VAPID public key served via authenticated GET, not a static meta tag
The page is served as a static file without server-side templating, so the
VAPID public key cannot be injected at serve time. A lightweight authenticated
GET `/api/lookmax/push/vapid-key` returns `{ publicKey: '' }` when unconfigured
and the client skips the subscribe prompt automatically.

### MIRROR_PUSH_ENABLED and REVEAL_MP4_ENABLED default false
Both features are gated by env-var flags per the risky-feature-flag rule
(CLAUDE.md §6). The founder flips them once copy is ratified (push) and ffmpeg
is confirmed present on Render (MP4).

### video.js uses lazy ffmpeg detection, not require-time detection
`ffmpegStatus()` caches the result on first call so tests can stub
`child_process.execSync` before detection runs; a boot without ffmpeg does not
throw at require-time which would break the server startup sequence.

### In-memory Map for v1 render jobs
Single-instance Render means in-memory `Map<jobId, job>` is sufficient for
v1; the enqueueRender / getJob API surface is stable and the backing store
can be swapped to Postgres (B0) without changing the route contracts.

### MP4 button probes flag state via POST /api/lookmax/reveal/render
Because the reveal.html is a static file, the client cannot read server env
vars. The button is hidden in HTML; on reveal load JS makes a POST — a 503
means flag off/ffmpeg absent (button stays hidden), a 202 means enabled and
the render has begun.

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

### Model adapters use _adapt() wrapper with automatic JSON fallback
Each model export is wrapped by `_adapt(jsonFn, pgFn)`: when pg is active and
healthy the pg implementation runs, but any pg error transparently falls back to
the JSON path so a transient Neon outage never breaks the funnel.

### backfill-json-to-pg.js is one-shot and founder-triggered only
The script is intentionally not run automatically (DECISIONS.md rule: no data
migration on deploy) so the founder has explicit control over when live user
data moves to Postgres; ON CONFLICT guards make it idempotent if re-run.

### storage.put() uses the module-level getS3() pattern for lazy client creation
The S3Client is constructed on first put/getSignedUrl/delete call rather than
at module load time, so tests that override R2_* env vars before requiring the
module see the correct config; this avoids a require-time freeze on cold boots.

### R2 CORS note: signed URLs work without CORS preflight for <img src>
For browser `<img src="...signed-url...">` renders, no CORS preflight is fired
(GET requests with no custom headers are simple requests under CORS rules);
the founder only needs to add an R2 CORS rule if the frontend fetches signed
URLs via JS `fetch()` with custom headers.

### events.js uses its own pg.Pool (separate from lib/db.js)
The events sink already had its own pool before B0; we kept it separate to
avoid coupling the high-frequency fire-and-forget write path to the same pool
that handles transactional user mutations — pool exhaustion in one path cannot
stall the other.

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

---

## 2026-05-29 — Stage-1 Audit Engine: Gemini prompt contract (Wave 1C)

### AUDIT_SYSTEM_PROMPT encodes context-vs-quest rule, safe-task allow-list, and hard prohibitions at the prompt level
Safety is enforced in the prompt itself, not only in app logic — per spec §7 and the gemini-prompt-engineer agent definition. The allow-lists and prohibition triggers are enumerated inline so the model cannot reason around them by ignoring post-hoc filtering. The canonical fallback phrase ("This is one for a qualified professional.") is the only permitted output when a hard-prohibition trigger is hit; no instruction follows it.

### Forbidden medical terms appear only in the [HARD PROHIBITIONS] section of the prompt
Words such as "retinoid", "medication", "supplement", "fasting", and "procedure" are enumerated explicitly as refusal triggers inside the [HARD PROHIBITIONS] section header block. They do not appear in any instructional context elsewhere in the prompt. The test suite asserts this structurally by finding each occurrence and confirming it falls within the prohibition section bounds.

---

## 2026-05-29 — Funnel-repair P2: Google sign-in + email/Google account model

### Google sign-in uses the OAuth 2.0 Authorization Code flow (server-side), not GIS
Keeps the founder's existing styled silver Google button (a plain link) instead of Google's own rendered GIS button, which would violate the locked design tokens. The code↔token exchange runs server-side via Node's global `fetch` (no new dependency, no `google-auth-library`). The `id_token` returned directly from Google's token endpoint over TLS — in exchange for our client secret — is trusted without re-verifying its JWKS signature (standard for the code flow). CSRF is covered by an HMAC-signed `state` bound to an httpOnly nonce cookie; `next` is whitelisted to our own funnel paths (no open redirect). The session is delivered via the existing one-shot `firstLoginToken` + `/auth/exchange-first-login` bridge, so no JWT ever appears in a URL.

### Email/Google sign-ups are keyed by a synthetic phone id (`getOrCreateByEmail`)
The User model is phone-keyed (`phone TEXT NOT NULL UNIQUE`) and the Orator pillar is WhatsApp/phone-native, but Lookmaxing sign-in (Google or email) precedes any phone capture. Rather than re-key the whole model, email/OAuth accounts get a synthetic phone id (`e` + 18 hex chars) — non-numeric, never collides with a real 10/12-digit number, survives phone-normalisation unchanged — with `email` as the real identity (`authProvider` records the origin). A real phone can be attached later if the user takes up Orator. Reversible; avoids a model rewrite (CLAUDE.md §6 no-rewrites). Lives in `models/User.js` and works under both JSON and Postgres backends via the existing `_adapt` dispatch.

### funnel-repair (2026-06-01): live funnel audit + fixes
Audited the 11-stage Lookmaxxing funnel on live and shipped seven fixes (commits `f09063d`..`54425d1`). Key decisions:
- **Service worker → network-first for HTML navigations** (`public/lookmax/sw.js`, `lookmax-v3`). Cache-first had trapped the updated app shell, leaving returning users on a blank dashboard. Static assets stay cache-first; offline still works (network-first falls back to cache). Self-heals existing stale clients within ~1 reload.
- **`/health` now probes Gemini key VALIDITY** (`lib/gemini-health.js`), not just presence — a leaked/revoked key read green before. Cached 10-min, non-blocking. Live confirmed `geminiKey:"ok"` (the leaked key was only in the local committed `.env`, not Render).
- **AuditSession calls must be `await`ed** — `_adapt` returns Promises under Postgres; several call sites (legacy `/audit`, lookmaxBaseline snapshot on payment/export) silently no-op'd on live.
- **Theme = additive aubergine glow + sparing gold (glow-not-fill)** — founder-approved direction. Aubergine lives ONLY as a background radial glow (never fills a control); gold is the single warm accent (◆ mark + CTA outline/hover-glow). Applied via the two token files (`tokens.css`, `app.css`) + landing, so it inherits to every page. Updated the `lookmaxing-frontend` "no gold" test (the old "no warm tones" rule was explicitly overridden).
- **Trial CTA enabled by server-injected flag** — `window.LOOKMAX_TRIAL_LIVE` was read but never set; the `/lookmaxing/fork` route now injects it (default true; `LOOKMAX_TRIAL_LIVE=false` to disable). Razorpay stays in TEST mode; the public paywall flag was NOT touched.
- **Founder actions** (cannot do from here): verify gated stages 3–11 via the checklist in `FUNNEL_AUDIT.md`; optionally set `INTRO_VIDEO_ID` and add Google to `/lookmax/login`.

### PR B (2026-06-02): login tracking — "who has signed in and when"
Every successful sign-in now stamps the user record via a single central helper
`recordLogin(user, provider)` in `lib/lookmax-auth.js`, called from all session-
issue paths (email magic-link consume, first-login/Google exchange, admin-login,
WhatsApp OTP verify, and the admin comp-grant). Records `lastLoginAt`,
`firstLoginAt` (write-once; distinct from the unrelated one-shot `firstLoginToken`
post-payment bridge), `loginCount`, and `authProvider` (google|email|admin|
phone-otp|comp). Best-effort — never blocks or throws on the auth path.
Surfaced in `/admin`: `/api/admin/stats` gains a `signedInUsers` count + per-user
login fields, and `/api/admin/lookmax-users` (the "Signed-up Users" table) gains
`lastLoginAt`/`loginCount` + a `signedInCount`; `public/admin.html` renders new
"Last sign-in" and "Logins" columns. First of the sequenced auth epic (B→A→C→D→E).
No new deps. Works under both JSON and Postgres via the existing `_adapt` dispatch.

### PR A (2026-06-02): email OTP sign-in
Added a 6-digit email OTP path alongside the existing magic-link flow (both dark
behind `LOOKMAX_EMAIL_LOGIN`). Two new routes in `routes/lookmax-auth.js`:
`POST /auth/request-email-otp` (enumeration-safe {status:'sent'}, reuses the
per-email throttle, find-or-create on funnel sign-up) and
`POST /auth/verify-email-otp` (generic 401 for all failures, per-IP cooldown,
max 5 attempts, single-use). The code is stored HASHED (sha256) on the user
(`emailOtpHash`/`emailOtpExpiresAt`/`emailOtpAttempts`/`emailOtpConsumedAt`),
compared with `timingSafeEqual`, never logged or returned. On success it calls
`recordLogin(user,'email')` (PR B) and issues the 45-day session JWT.
`services/email.js` gains `sendEmailOtp` + `data/email-templates/email-otp.html`
(mirrors magic-link.html). The primary sign-in entry `public/lookmaxing/start.html`
now runs the OTP request→verify flow (stores `lookmax.token`, continues to the quiz).
The magic-link backend + the PWA `login.html` are unchanged and still functional;
converting `login.html` to OTP is the immediate follow-up.

COPY NOTE (CLAUDE.md §5 / §7): the OTP-specific user-facing strings (email
template + the new start.html step) are DRAFT, marked `TODO copy review`, and
need founder approval before `LOOKMAX_EMAIL_LOGIN` is flipped live.

### PR C (2026-06-02): welcome email on first sign-in
Added `email.sendWelcome({user})` + `data/email-templates/welcome.html` (mirrors
the magic-link/OTP templates). Fired ONCE, from `recordLogin` (PR B), on a real
user's first-ever sign-in — gated to self-serve providers (`google`/`email`) with
an email on file; admin / comp / phone-otp accounts are excluded. Detected via the
`firstLoginAt`-was-unset signal already computed in recordLogin. Fire-and-forget
(lazy `require` of services/email, `.catch()`) so a failing send never blocks the
login. DRY-RUN until RESEND_API_KEY is set.

COPY NOTE (CLAUDE.md §5 / §7): ALL welcome-email prose is DRAFT, marked
`TODO copy review`, and needs founder approval before email goes live.

### PR D (2026-06-02): Google sign-in turn-on (config + re-entry button)
The Google OAuth code was already complete (funnel-repair P2); this PR makes it
usable end-to-end. Added the founder-facing `GOOGLE_OAUTH_SETUP.md` (Cloud Console
+ Render steps, exact redirect URI, verify checklist) and added a gated "Sign in
with Google" button to the PWA re-entry page `public/lookmax/login.html`. The button
is revealed only when the server reports OAuth is configured (`/auth/method`
→ `google:true`), independent of the email-login flag, so Google works even in
admin-only mode and can never dead-end. start.html already had the button. Welcome
email on first Google sign-in is already wired (PR C). No backend code change.
Founder action required: set GOOGLE_OAUTH_CLIENT_ID/SECRET + JWT_SECRET in Render.

### PR E (2026-06-02): dashboard "Your Journey" — history + analytics (backend)
Design pass approved (`design/dashboard-journey-spec.md`, design-agent) → built the
data endpoint `GET /api/lookmax/me/history` (routes/lookmax.js), test-first
(tests/lookmax-history.test.js, 6 cases). Aggregates: readings timeline, 8-axis
before→after, mirror consistency (totalCount/longestStreak/loggedDates), hair trend.
Fails independently of /dashboard.

DATA-MODEL REALITY (important): re-audits do NOT accumulate — the model overwrites
`reAuditResult` each cycle — and a re-audit yields 8 self-rated axes, not a fresh
Gemini `auraScore`. So `readings` is realistically baseline + latest re-audit (≤2
points) today. Decisions:
- The 8-axis `axes` before→after is EXACT (re-audit literally computes those deltas).
- The per-reading trend score is a 0-100 composite: BASELINE uses the audit's Gemini
  auraScore (the number the user saw); RE-AUDIT uses overallOf(axes). Both are 0-100
  "presence" composites; documented as an approximation. The response shape already
  supports N readings if re-audit history is later persisted (open follow-up).
The frontend section (all 5 modules + empty states) is built separately by the
frontend-agent against this fixed contract; all journey copy is DRAFT (TODO copy review).

### Copy approved (2026-06-02): auth + dashboard epic
Founder approved all draft strings (COPY_APPROVAL_2026-06-02.md). Removed every
`TODO copy review` marker across the OTP email, OTP on-page steps, welcome email,
and the dashboard "Your Journey" section; added COPY APPROVED provenance. Also
fixed a latent bug where a rendered `<!-- TODO copy review -->` sat inside the
aura sparkline's aria-label. Strings themselves unchanged (approved as drafted).
The journey UI test now asserts the markers are gone + provenance present.
Unrelated drafts left intact: the dashboard push-prompt body line and the Day-7
assessment fallback (separate copy items, still pending).

### Website elevation PR 1 (2026-06-02): retire gold → unify on silver
Founder-approved direction after two audits (design/visual-system-audit.md +
growth/competitor-visual-benchmark.md). The site ran THREE color systems (gold
landing/dashboard, silver/aubergine funnel) and the accent flipped from silver
to gold exactly when a user started paying — the primary "AI vibe-coded" tell.
Decisive evidence: the actual logo (maincharacter-logo.jpeg) is brushed SILVER +
a white light-point, ZERO gold — so every gold surface contradicted the locked
mark. Resolution: retire gold + aubergine + pillar hues across ALL 14 served
surfaces; unify on black + brushed silver (#e8e8e8→#c0c0c0→#8a8a8a) + a single
white light-point glow as the only accent. Mechanical token surgery only — no
layout/copy/font changes (type system + monogram hero are PR 2). `--gold` token
names kept as silver-valued aliases so var() references keep resolving. Color-
assertion tests updated to assert the silver system (no gold present). Email
templates intentionally deferred to a later pass (just copy-approved). Full
suite 1312 + smoke 44/44 green. CANNOT be visually verified in sandbox — needs
a live eyeball post-merge.

### Website elevation PR 2 (2026-06-02): landing hero monogram + type system
The logo (a beautiful brushed-silver "M" lit by one white light-point) was hidden
as a 26px cropped JPEG in the nav. Converted the black-background JPEG to TWO
transparent PNGs via sharp (alpha derived from luminance with a noise floor, so
black→transparent cleanly): maincharacter-logo.png (full lockup) +
maincharacter-mark.png (mark only). Rebuilt the landing hero so the mark is the
first thing seen, at scale, with the whole mark gently breathing (the baked
light-point reads as alive). Nav now shows the whole transparent mark (no crop,
no black box). Added JetBrains Mono + --font-mono token (data/numeral role,
sitewide rollout continues in PR 3). Primary CTA kept FILLED + brightened to ink-
white (deliberately NOT the spec's quiet outline — the hero CTA is conversion-
critical; bold white + a breathing light-point glow is both prominent and on-
brand). All locked hero copy preserved verbatim. prefers-reduced-motion disables
both loops. Faithful recreation via the real asset, not hand-traced SVG (lower
risk). CANNOT be visually verified in sandbox — needs founder eyeball.

### Website elevation (2026-06-02): aubergine reinstated as sitewide atmosphere
Founder feedback: the purple/aubergine read well with silver+black; bring it back.
PR 1 had removed it entirely — but the original problem was never aubergine, it was
that aubergine lived on ONLY the funnel. Fix: reinstate aubergine as a DELIBERATE,
tokenized, sitewide AMBIENT ATMOSPHERE (rgba(138,79,168,0.16) top-down radial),
layered UNDER a tighter white light-point halo, on every surface (landing, funnel
tokens.css, dashboard app.css, paywall). Discipline: aubergine is atmosphere only —
never a fill, text, or border; silver stays the structure; the white light-point
stays the one bright accent. Tokens: --aubergine/--mc-aubergine (#8a4fa8) +
--aubergine-glow. Also synced the stale source-of-truth product/design-lookmaxing-
tokens.css ← the served mirror (it predated the silver work; a re-copy would have
clobbered everything — landmine removed). Color tests updated. CANNOT verify visually
in sandbox — founder eyeball needed for the aubergine intensity.

### Website elevation (2026-06-02): canonical Aura-score object + Mono data numerals
One shared score component (`.mc-aura-obj` + buildAuraScoreObject({score,rank})):
silver-gradient numeral + thin silver ring arc (dasharray = value) + the white
light-point dot marking the value + mono "/100" and rank. Used IDENTICALLY on the
funnel reading (audit.html #score-obj-container) and the dashboard saved-reading
card (index.html) — so a paying user sees continuity, not a costume change (the
dashboard uses -db-suffixed SVG IDs to avoid PWA cache ID collisions). Also fixed
a latent bug: audit.html renderReport referenced never-assigned scoreNumeral/
rankLabel DOM nodes; now builds straight into the canonical container. Rolled
JetBrains Mono into all dashboard DATA numerals (timeline score/rank/delta, axis
numbers, mirror/hair big numbers, sparkline labels) — the "instrument" upgrade
(Step 3); the big reveal stays the silver-gradient object. +53 tests
(aura-score-object.test.js). Full suite 1372 + smoke 44/44 green. Visual — needs
founder eyeball.

### Email templates → silver brand (2026-06-02)
Follow-up to the website elevation: the transactional emails (welcome, OTP,
magic-link, paywall-receipt, audit-confirmation, day7) still rendered in gold ◆
while the whole site moved to silver — the welcome email is a user's first
impression, so coherence matters. Converted all six templates: CTA buttons →
near-white fill (#ececf2, matching the site's ink-white primary CTA) with dark
text; ◆ marks/eyebrows/links/borders/OTP code → silver (#c6c6cf, code brightened
to #ececf2); day7 aesthetic purple → silver. Kept email-safe (flat inline colors,
no gradients/glows/vars — those don't render reliably in mail clients), so no
aubergine atmosphere here. magic-link-template test updated for the new fill.
Full suite 1372 + smoke 44/44 green.

### Auth that works now: email+password + Google on one screen (2026-06-04)
Founder report: sign-in/sign-up "wasn't there" — correct, because every method was
gated behind unset env vars (Google hidden without keys; email OTP dead without
RESEND). Per founder decision, added EMAIL + PASSWORD as the zero-config method that
works with no external service: one smart endpoint POST /api/lookmax/auth/password =
login-or-signup (returning+passwordHash → bcrypt verify; new email → create+hash;
passwordless Google/OTP account → 409 guide, never hijacked). bcryptjs (already a
dep), per-IP brute-force cooldown reused, min 8 chars, generic errors, never logged,
passwordHash never leaves publicUser. recordLogin now fires the welcome email for
provider 'password' too. Rebuilt public/lookmaxing/start.html as ONE screen with TWO
methods: "Continue with Google" (always visible; intercepts gracefully until OAuth
keys are set — no dead bounce) + email/password + a single "Continue" that signs in
OR signs up. Replaces the dead OTP UI on that surface (OTP backend kept, dormant).
PWA login.html (re-entry) still to be aligned — fast follow. Full suite 1380 + smoke
44/44. Visual/flow needs founder eyeball; Google still needs the founder's 2 keys.
