# Production-Readiness Security Audit — 2026-05-28

**Auditor:** security-compliance-agent (Head of Security & Compliance)
**Build under audit:** post-B0 (Postgres + R2 live), pre-`PAYWALL_PUBLIC`, dogfood-imminent
**State assumed:**
- `database: true`, `storage.configured: true` (bucket `maincharacter-lookmax`) per `/health`
- `PAYWALL_PUBLIC=false`, `WHATSAPP_SEND_MODE=allowlist`, Razorpay = `rzp_test_*`
- No real user paying yet; founder + comp account about to dogfood
- All 14 numbered concerns from the brief were walked through the actual source

This audit verifies what shipped, not what was promised. Findings cross-checked against
`security/audit-login-gate.md` and `security/audit-pre-public-launch.md`; carry-overs are
labelled. The three pre-existing BLOCKERS gating `PAYWALL_PUBLIC` are **unchanged** and are
restated at the bottom rather than re-found here.

---

## TL;DR Verdict

**Founder may begin dogfood TONIGHT.** Nothing in the live surface area is a P0 against the
dogfood threat model (founder + 3 allowlisted admins, no real money, no external traffic
of consequence at scale). Two P0s exist, both pre-existing, both gating the **next** flip
(`PAYWALL_PUBLIC=true`) — not dogfood.

**The single most-must-fix-before-founder-dogfoods item:** `RAZORPAY_WEBHOOK_SECRET` should
be confirmed set in Render BEFORE the founder does the first paywall click-through with
test keys. If it's empty, `verifyWebhookSignature` returns false (services/razorpay.js:165)
and the webhook 400s, which means a real subscription created via the dogfood path will
never flip `lookmaxxingActive=true` — and the next person who clicks pay (real or test)
silently never activates. This is a UX-killer in dogfood, not a security risk yet, but
trivially fixable in 2 minutes. **[VERIFY in Render env panel before flip.]** If already
set, no action.

**The single most-must-fix-before-`PAYWALL_PUBLIC`:** **BLOCKER-2** (no Privacy Policy / no
DPDPA consent capture / no 18+ gate). Biometric photos hit Gemini (US) and R2 with no
disclosed lawful basis. Lawyer review + new pages. External long pole; start now.

**Total findings, this audit only:**
- P0: **0 new** (3 pre-existing BLOCKERS remain, see §"Pre-existing BLOCKERS")
- P1: **5 new** (4 must fix before `PAYWALL_PUBLIC`, 1 must fix before WhatsApp goes live)
- P2: **6 new** (must fix before international expansion / first real cohort)
- P3: **4 new** (polish / hygiene)

---

## Findings

### P1 — Must fix before public launch (PAYWALL_PUBLIC=true)

#### P1-1. Photo uploads accept any content-type and any bytes that fit under 8/10 MB

- **Area:** upload validation, biometric-data integrity
- **What's wrong:** `multer` config in `/Users/chitranshu/Desktop/MainComponent/routes/audit.js:20-23`
  and `/Users/chitranshu/Desktop/MainComponent/routes/lookmax.js:27-30` set `fileSize` and
  `files` caps but **no `fileFilter`**. The route handlers then trust `req.file.mimetype`
  (the client-asserted header) and `f.buffer` directly. No magic-byte sniff, no
  whitelist of `image/jpeg|png|webp`, no rejection of zero-byte or sub-512-byte files.
  An attacker can `POST /api/audit/photos` with `Content-Type: image/jpeg` and bytes
  that are an HTML page, a `.exe`, or arbitrary garbage, and the server will accept
  and store it; Gemini will see garbage and the fallback path runs.
- **What's at risk:**
  1. Garbage uploads burn Gemini quota (paired with P1-3 below).
  2. R2 bucket fills with non-image objects (cost + DPDPA hygiene — we tell users
     "these are biometric photos", not arbitrary files).
  3. `/uploads/{userId}/{filename}` (server.js:225) serves the stored bytes verbatim
     with whatever extension the path encodes; combined with the file-name being
     server-generated (`mirror-{Date.now()}.jpg` — photos.js:44) this isn't a stored-XSS
     because browsers won't execute a `.jpg`, BUT if R2 ever serves with the
     attacker-asserted mimetype (`storage.put(key, buf, contentType)` — storage.js:115
     forwards the client mimetype to R2 PutObject), a presigned URL fetched by the
     browser could be served with `Content-Type: text/html` and become XSS.
- **Fix:** add a `fileFilter` to both multer instances that rejects any mimetype not
  in `{image/jpeg, image/png, image/webp}`; THEN re-encode the buffer through
  `sharp(buf).rotate().jpeg({quality:82}).toBuffer()` BEFORE writing to R2/local.
  Sharp throws on non-image input → enforces magic-byte validity. This also fixes
  P1-2 (EXIF) for free.
- **Block dogfood?** No — founder/admin won't upload `evil.exe`. Block `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

#### P1-2. Photo buffers are sent to R2 and re-served to Gemini with EXIF metadata intact

- **Area:** biometric privacy, DPDPA / GDPR
- **What's wrong:** `storage.put()` (`/Users/chitranshu/Desktop/MainComponent/services/storage.js:105-124`)
  writes the **client-supplied buffer verbatim** to R2. `sharp` is only invoked from
  `storage.saveImage()` (storage.js:218-231), and that codepath is now only reached as a
  **fallback** when R2 is unconfigured (audit.js:78-89, lookmax.js:81-89). With R2 live,
  EVERY shipping selfie/baseline goes raw → R2. EXIF on phone photos commonly carries
  GPS lat/long, camera serial, timestamp with sub-second precision. None of that is
  stripped.
- **What's at risk:** DPDPA + GDPR data-minimisation principle violated for biometric +
  precise-geolocation data. Any future leak of R2 contents (signed-URL expiry race, bucket
  misconfiguration, employee error) leaks not just faces but also home addresses by GPS.
- **Fix:** pipe every photo buffer through `sharp(buf).rotate().resize({...}).jpeg({...}).toBuffer()`
  BEFORE `storage.put()`. Sharp by default does NOT preserve EXIF (only `withMetadata()`
  does), so a normal pipeline strips it. Same change resolves the magic-byte half of P1-1.
- **Block dogfood?** No — founder photos are not adversarial to themselves. Block
  `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

#### P1-3. No per-user / per-IP cap on Gemini-spending POSTs

- **Area:** cost ceiling, abuse
- **What's wrong:** `/api/audit/analyze`, `/api/audit/photos`, `/api/lookmax/mirror`,
  `/api/lookmax/hair/photo` are covered only by the **`globalLimiter` (200/min/IP)** mounted
  at `/Users/chitranshu/Desktop/MainComponent/server.js:111`. There is no audit/mirror/hair-specific
  limit. `services/gemini.js:25-37` and `services/vision.js:41-47` have a **process-wide**
  10 RPM Gemini gate, but that just makes calls **fall back** to deterministic stubs —
  it does NOT prevent an attacker from burning all 10 RPM continuously, which means
  legitimate concurrent users see fallback diagnoses (correctness regression) rather
  than failing the attacker. There is also no per-user-per-day cap on audit submissions.
- **What's at risk:** an adversary with a single IP can issue 200/min audit-analyze
  calls, each carrying ≤24 MB of base64 image data, sustaining Gemini cost. Even with
  the process-wide gate flipping callers into fallback, the upload accept/decode/store
  path still runs (R2 PUT cost, sharp CPU once P1-1/2 land). At a Razorpay payout level
  this is ad-spend grade burn potential the first day after going public.
- **Fix:** add a tier-2 limiter (~10/min/IP) specifically on `/api/audit/(analyze|photos)`
  and `/api/lookmax/(mirror|hair/photo)` mounted BEFORE the global limiter; plus a
  per-`audit_session` and per-`userToken` daily cap stored in Postgres (e.g.
  `audit_analyses_today INTEGER` reset per IST midnight). Refuse with 429.
- **Block dogfood?** No — founder won't DDoS himself. Block `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

#### P1-4. Admin login has no per-IP lockout — only `tightLimiter` (10/min/IP)

- **Area:** brute-force resistance on admin auth
- **What's wrong:** `/api/admin/login` is rate-limited by `tightLimiter` (10/min/IP) at
  `/Users/chitranshu/Desktop/MainComponent/server.js:106`, and the password is bcrypt-compared
  (`/Users/chitranshu/Desktop/MainComponent/lib/auth.js:42-53` — `bcrypt.compareSync` is
  constant-time per the bcryptjs library). There is **no per-IP failed-login lockout
  after N attempts** (the lookmax-auth cooldown pattern at `routes/lookmax-auth.js:101-129`
  was NOT copied here). 10 attempts/min × 60 min × 24 h = 14,400 guesses/day per IP. A
  10-character mixed-case admin password is still well out of reach, but a weak one
  (e.g. `Aurora-Mirror-2026!` — entropy ≈ 60 bits, manageable for a determined attacker
  given enough IPs) is uncomfortable. There is also **no admin IP allowlist** option.
- **What's at risk:** admin compromise = full user-DB read + broadcast WhatsApp send +
  rank-promotion. The blast radius is exactly the user base.
- **Fix:** (a) reuse the `ipCooldown` pattern from `routes/lookmax-auth.js` for
  `/api/admin/login`: 3 fails → 5-min cooldown, shared map cap. (b) Add an optional
  `ADMIN_IP_ALLOWLIST` env var; when set, reject all non-allowlisted IPs at the
  middleware level **before** the password check. Both are <30 lines.
- **Block dogfood?** No (founder is the only one logging in, from their own IP).
  Block `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

#### P1-5. Legacy plaintext `x-admin-password` header is still accepted when `ADMIN_PASSWORD_HASH` is unset

- **Area:** secrets handling
- **What's wrong:** `/Users/chitranshu/Desktop/MainComponent/routes/admin.js:42-54`
  (`requireAuth`) falls back to the `x-admin-password` header check when
  `auth.hashConfigured()` returns false (lib/auth.js:28-30). Per the prior handoff,
  `ADMIN_PASSWORD_HASH` IS set in Render env (handoff §8), in which case the legacy
  path auto-disables. **[VERIFY]** the env var is actually populated on the live Render
  instance — if it's not, every admin endpoint will accept a plaintext password header
  matching `ADMIN_PASSWORD` (or the documented `'maincharacter2026'` default at
  lib/auth.js:51). The CLAUDE.md landmine #4 is in this exact condition until verified.
- **What's at risk:** if `ADMIN_PASSWORD_HASH` is somehow unset on the live instance
  (Render env wipes, accidental deletion, redeploy quirk), the entire admin surface
  becomes "send a header with `maincharacter2026`" away from compromise.
- **Fix:** verification step, no code change required if hash is set. Optional hardening:
  delete the legacy fallback entirely at `routes/admin.js:48-52` — the founder has
  already moved to JWT, the fallback is now historical baggage.
- **Block dogfood?** No (founder has the hash set). Block `PAYWALL_PUBLIC` if VERIFY fails.
- **Owner:** founder (verify); backend-agent (delete fallback when verified).

---

### P2 — Must fix before international expansion / first paid cohort

#### P2-1. `webhookGuard: "open"` — WhatsApp webhook accepts unsigned requests when `WHATSAPP_APP_SECRET` unset

- **Area:** webhook auth
- **What's wrong:** `services/whatsapp.js:200-217` returns
  `{ok: true, mode: 'open'}` when `WHATSAPP_APP_SECRET` is empty, so the webhook handler
  at `routes/api.js:174-184` admits any POST and processes it. **Today, with WhatsApp
  Cloud API dormant (no real Meta traffic), the only payloads that hit
  `/api/webhook/whatsapp` POST are forgeries.** A forger can:
  1. POST a fake `entry[].changes[].value.messages[]` body that impersonates ANY user
     by `from` (parsed at routes/api.js:213).
  2. The user is found via `User.getUserByPhone(phone)` (api.js:269).
  3. The forger can send `STOP` (pauses the victim), `CONTINUE` (triggers a Razorpay
     payment-link send to the victim — currently dormant, but the code runs), or any
     daily-protocol response (which calls `gemini.scoreUserResponse(name, day, words,
     text, ...)` and burns Gemini quota with attacker-controlled text wrapped in the
     injection-guard delimiters — safe in itself but cost-bearing).
- **What's at risk pre-launch:** quota burn + chronicle pollution + state mutation
  on test/seeded users. No real users yet. Once WhatsApp goes live, this is a HIGH
  finding (user impersonation across the entire installed base).
- **Fix:** set `WHATSAPP_APP_SECRET` in Render env. Code is correct — it just needs
  the secret to flip from `open` to `hmac` mode (services/whatsapp.js:236-238).
- **Block dogfood?** No (no real WhatsApp traffic, founder unlikely to forge against
  themselves). MUST be set before `WHATSAPP_SEND_MODE=all`.
- **Owner:** founder (env var).

#### P2-2. PII (raw phone + name) logged unmasked in `routes/api.js` (carry-over from prior audits)

- **Area:** DPDPA — PII in logs
- **What's wrong:** the `lib/log-mask.js` helper exists and is used everywhere in
  `routes/lookmax-auth.js`, but **`routes/api.js` still emits raw phone + name** at:
  - api.js:114 (`Idempotent: ${existing.phone}`)
  - api.js:131 (`${user.name} (${user.phone})`)
  - api.js:257, 267, 273 (webhook log: raw phone + senderName + truncated text body)
  - api.js:506 (`${phone} joined ${pillar} waitlist`)
  - api.js:726, 731, 795, 798, 810, 843 (payment events: raw phone + name)
  - admin.js:120 (`Custom message to ${phone}: ...`)
  - services/scheduler.js:58, 83, 85, 107, 109, 145 (raw phone + name in cron logs)
  - services/whatsapp.js:175, 180 (raw normalised phone on retry failure)
- **What's at risk:** Render's log retention bundles every line; DPDPA Article 8(5)
  requires the data fiduciary to minimise the personal data processed. Raw phone + name
  in cloud-vendor logs is a documented audit failure. Same finding was already
  carry-over MEDIUM in audit-login-gate.md (C-1).
- **Fix:** mechanical: wrap every interpolated phone in `maskPhone(...)` and every name
  in `name.split(' ')[0].slice(0,1) + '***'` (or simpler: drop names from logs entirely
  and key by token). One PR, ~30 sites.
- **Block dogfood?** No. Block `PAYWALL_PUBLIC` or have it land in the same week.
- **Owner:** backend-agent.

#### P2-3. JWT lives in `localStorage` — any XSS leaks the session

- **Area:** session security
- **What's wrong:** the lookmax JWT is written to `localStorage` at
  `/Users/chitranshu/Desktop/MainComponent/public/lookmax/app.js:11-13` and
  `/Users/chitranshu/Desktop/MainComponent/public/payment-confirmed.html:225`. CSP is
  intentionally disabled (`server.js:72`, comment "v1: pages use inline styles + CDN
  scripts"), so any reflected/stored XSS anywhere on the origin can `localStorage.
  getItem('lookmax.token')` and exfiltrate the 24h JWT. The JWT is the entire identity
  proof (`lib/lookmax-auth.js:40-57` — no rotation, no device binding). User-controlled
  data flows: audit goals text (input), name (input), quiz answers (input), photo
  filenames (server-generated — safe), Gemini-returned `consultantLine` and `diagnosis`
  text (Gemini output, untrusted in principle, currently rendered into HTML in
  `audit.html` and the mirror PWA without explicit escape).
- **What's at risk:** XSS via the audit `diagnosis` field (Gemini-controlled) or a
  future user-visible field would lift the JWT and the attacker gets 24h of access to
  the user's photos, scores, mirror history. Note: post-P1-1/2 with Sharp re-encode,
  upload-path XSS via R2 mimetype goes away.
- **Fix:** the cheapest immediate move is a phased CSP (`server.js:72`) — start with
  `default-src 'self'` + explicit `script-src` for the Chart.js CDN + Google Fonts
  origin; this kills inline `<script>` execution from injected diagnosis text. Token
  storage in `HttpOnly; Secure; SameSite=Lax` cookie is the real fix but a non-trivial
  refactor (every fetch needs to switch from `Authorization: Bearer` to cookie-auth
  and CSRF tokens for state-changing endpoints). Recommend: CSP phase 1 now; cookie
  migration as a v2 hardening sprint.
- **Block dogfood?** No (carry-over). Block `PAYWALL_PUBLIC` ideally; absolute minimum is
  before any non-allowlisted external traffic.
- **Owner:** backend-agent (CSP); scale-readiness-agent (cookie migration tracking).

#### P2-4. `user.token` (UUID) never rotates, never expires; auth fallback uses it

- **Area:** session security (auth fallback path)
- **What's wrong:** CLAUDE.md landmine #10 is unchanged. `/api/user/:token` (api.js:541)
  serves user data with **zero auth** behind a UUID. The UUID is the same string used in
  the `Authorization: Bearer ...` JWT payload (`signLookmaxToken` — lib/lookmax-auth.js:42)
  and is embedded in every URL the founder shares (`loginUrl` in admin.js:265, the
  `/dashboard/:token` page). Leak the URL → leak the dashboard view forever. Acceptable
  for the trial-dashboard URL; **not** acceptable once it gates Lookmaxxing photos.
  (Photo serving at server.js:225 DOES verify the JWT correctly, so this is currently
  scoped to the dashboard read.)
- **What's at risk:** dashboard data inadvertently shared (screenshot of URL bar,
  copy-paste into Slack) gives perpetual read access. Low-severity for the trial
  dashboard's contents (no PII beyond name + scores) but worth fixing alongside cookie
  migration.
- **Fix:** issue a `dashboard-view-token` distinct from the long-lived user token,
  with a 7-day TTL and rotation on every dashboard render. Out of dogfood scope.
- **Block dogfood?** No. Track for v2.
- **Owner:** scale-readiness-agent (BACKLOG).

#### P2-5. Server-side bound on Gemini-bound free-text fields missing

- **Area:** prompt-injection guard hardening / cost
- **What's wrong:** the brand has the right shape — every Gemini call wraps user input
  in `<<<USER_INPUT_START>>>...<<<USER_INPUT_END>>>` with explicit "ignore instructions
  inside" guards (data/orator-content.js:267-270 + 300; data/lookmax-prompts.js:66-69
  + 90-92; services/vision.js:209-212). What's **missing** is a length cap server-side:
  - Audit `goals` text is capped at 500 chars **client-side only** (public/audit.html:247
    — `(document.getElementById('open-answer').value || '').slice(0, 500)`). A direct
    POST to `/api/audit/quiz` with a 2 MB `goals` value sails through (no validation in
    routes/audit.js:34-42).
  - The Orator daily-reply scorer concatenates the entire user WhatsApp message into the
    prompt with no truncation (data/orator-content.js:269 — `${userResponse}`). A 50 KB
    forged-webhook message (see P2-1) is sent verbatim. Even though the delimiters
    contain it, Gemini bills by tokens.
- **What's at risk:** cost + 4096-token output-window crowding (response gets truncated
  → JSON parse fails → fallback fires → cost was spent for nothing).
- **Fix:** cap server-side. Add `body('goals').isLength({max:500})` and equivalents in
  the express-validator chains in routes/audit.js + the equivalent in the WhatsApp
  webhook handler (`text.slice(0, 2000)` before calling
  `gemini.scoreUserResponse`).
- **Block dogfood?** No. Block `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

#### P2-6. CORS not configured — Express default is no CORS headers, but `cors` npm package isn't installed either; verify the production assumption is "same-origin only"

- **Area:** CORS
- **What's wrong:** grep across `server.js` + `routes/` + `package.json` for `cors|CORS|
  Access-Control` returns ZERO hits. There is no explicit CORS middleware. The Express
  default is to send no CORS response headers; browsers will then refuse cross-origin
  reads. **This is the secure default** — the entire app is same-origin
  (`maincharacter.digitglobalservices.com`). However, a future contributor adding the
  `cors` package with `app.use(cors())` (which permits `*` by default) would silently
  open every endpoint cross-origin, which would let `evil.com` script-call
  `/api/lookmax/me` and steal the user's data via the `?token=` query-string fallback
  (lib/lookmax-auth.js:67).
- **What's at risk:** future-proofing — not currently exploitable.
- **Fix:** add an explicit, restrictive policy now so the default isn't accidentally
  loosened later: `app.use((req,res,next) => { res.setHeader('Access-Control-Allow-
  Origin', process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com');
  next(); })` BEFORE any other middleware. Block other origins explicitly. Also: remove
  the `?token=` query-string fallback for JWT in `lib/lookmax-auth.js:67` and
  `server.js:226` — tokens belong in headers only.
- **Block dogfood?** No. Block `PAYWALL_PUBLIC`.
- **Owner:** backend-agent.

---

### P3 — Polish / hygiene

#### P3-1. Security headers — CSP intentionally off; HSTS / Frame-Options / Referrer-Policy delivered by Helmet defaults

- `server.js:72` — `helmet({ contentSecurityPolicy: false })`. Helmet default sends
  `Strict-Transport-Security: max-age=15552000; includeSubDomains`, `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, etc.
- **Recommendation:** add a phased CSP as outlined in P2-3. Also explicitly set
  `Permissions-Policy: camera=(self)` so embedded iframes can't ask for camera — relevant
  for `/lookmax/mirror`.
- **Owner:** backend-agent. Tracked in BACKLOG.

#### P3-2. `/api/events` rate-limit silent-drop is good; allowlist-not-revealed is good; FIFO eviction verified

- `routes/api.js:38-87` — `eventsRateLimit` middleware. 60/min/IP, 1000-IP map cap,
  FIFO eviction at routes/api.js:64. Unknown event names drop silently (204) at line
  74 — no allowlist disclosure. Props size capped at 2 KB at line 79. Confirmed: PII
  patterns stripped by `services/events.js:91` (`/phone|email|password|^name$/i`).
- **PASS.** Nothing to fix; flagged for completeness because the brief asked.

#### P3-3. Razorpay webhook signature verification path is correct; **needs `RAZORPAY_WEBHOOK_SECRET` set in Render**

- `services/razorpay.js:164-176` — `crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)`
  on `req.rawBody` (the raw body buffer captured at `server.js:79-82`), with constant-time
  compare (`timingSafeEqual`). Returns false (→ 400) when the secret is unset OR the
  signature is missing — fail-closed. **However:** if `RAZORPAY_WEBHOOK_SECRET` is empty
  in Render, EVERY incoming webhook 400s, which means **`subscription.activated` will
  never fire `lookmaxxingActive=true`** for a real payer. This is the TL;DR's
  "most-must-fix-before-dogfood" item.
- **Test-by-describing (per brief — do not actually send to live):** to forge,
  `POST /api/payment/webhook` with body `{event:'subscription.activated', payload:
  {subscription:{entity:{notes:{phone:'+919876543210',plan:'lookmaxxing'},
  id:'sub_test_x'}}}}`, `x-razorpay-signature: <wrong>` → server returns
  `400 {"error":"invalid signature"}`. With a CORRECT HMAC computed using
  `RAZORPAY_WEBHOOK_SECRET`, the body is processed and the user record flips.
- **Action:** founder verifies the env var is set in Render dashboard before any
  paywall click-through. No code change.
- **Owner:** founder.

#### P3-4. `/api/lookmax/me/data` DELETE / GET-export endpoints — NOT YET SHIPPED

- Grep for `/me/data|user/delete|user/export` across routes/ + server.js returns zero
  hits. The durability agent's planned endpoints are NOT in this build. This is
  unchanged from BLOCKER-3 in `audit-pre-public-launch.md`. When they land, the audit
  checklist already in the user instruction is the right one:
  - DELETE purges Postgres rows + every R2 key in `user.lookmaxBaseline.photoStorageKeys`
    + every key in `mirror/{userToken}/*` + `hair/{userToken}/*`. Use S3 ListObjectsV2
    then DeleteObjects, not single deletes (matters once a user has 30+ daily mirrors).
  - Export response strips storageKey/`r2:` prefix; if photos are included, use signed
    URLs only (`storage.getSignedUrl(key, 900)` — services/storage.js:138).
  - Auth-gated by `requireLookmaxAuth` (lib/lookmax-auth.js:64).
  - Rate-limited tightly (1/hour/userToken for export — full export is expensive; 1/day
    for delete — irreversible, prevent ragequit then regret).
  - Audit-logged as `events.track('user_data_exported'|'user_data_deleted', ...)`.
- **Block dogfood?** No (founder can self-delete via Postgres). Block `PAYWALL_PUBLIC` —
  this IS BLOCKER-3.
- **Owner:** backend-agent.

#### P3-5. R2 client + pg Pool — singletoned correctly; no leak path under graceful failures

- **pg Pool** (`lib/db.js:55-61`) singletoned in `_pool`; `max:10`, 30s idle timeout,
  5s connect timeout. Errors on idle client logged at `lib/db.js:63-66`, never crash.
  Query path requires `init()` — if Postgres goes down mid-request the next `db.query()`
  rejects with a pg error, the route's try/catch returns 500 cleanly (verified for
  `/health` at server.js:298-301). **No leak path.**
- **R2 S3Client** (`services/storage.js:69-87`) singletoned in `_s3Client`; same module
  cached for the process lifetime. Per-request `PutObjectCommand`/`GetObjectCommand`
  instances are throwaway value objects (correct AWS SDK v3 pattern). If R2 fails,
  `storage.put` returns `{key:null, dryRun:true}` — the audit/mirror handlers fall
  through to local storage (`saveImage` path), so an R2 outage degrades to local-only
  rather than failing the request. **Good.**
- **Caveat:** the local fallback writes to `/tmp/maincharacter-uploads/...` (photos.js:19),
  which means if R2 is down AND Render redeploys before R2 recovers, the photo is lost
  silently. Once paying users exist, "best-effort durability" deserves a metric/alert.
  No fix needed for dogfood.

---

## Compliance / DPDPA-specific snapshot

| Item | State | Note |
|---|---|---|
| Privacy Policy live, dated, linked from footer | **MISSING** | BLOCKER-2. Grep returns zero hits in landing.html or any public/*.html. |
| Consent capture at photo upload | **MISSING** | `/api/audit/photos` (routes/audit.js:46) writes biometric data with no consent record. |
| Sensitive personal data flagged in notice | **MISSING** | No notice exists. |
| Data Fiduciary contact published | **MISSING** | No `/contact`, no email in footer. |
| Data Principal request process documented | **MISSING** | RUNBOOK.md does not have a DPDPA section. |
| 18+ verification at signup | **MISSING** | `/start` (`public/start.html`) and `/audit` collect nothing about age. |
| `/api/user/delete` exists | **MISSING** | BLOCKER-3. |
| `/api/user/export` exists | **MISSING** | BLOCKER-3. |
| Photos in R2 have TTL/lifecycle | **MISSING** | R2 has no bucket lifecycle policy referenced anywhere; baseline photos persist indefinitely once paid. |
| Gemini DPA covers MainCharacter | **[VERIFY]** | Google's Gemini API standard terms include CCPA + DPA coverage; **founder must confirm the Cloud DPA is signed under the same Google account as `GEMINI_API_KEY`**. Relevant for both DPDPA Cross-Border-Transfer rules and GDPR (Gemini processes in the US). |
| Phone + email masked in logs | **PARTIAL** | New auth routes use `lib/log-mask`; legacy `routes/api.js` does not (P2-2). |

**Recommended legal counsel scope (do not sign off without):**
1. DPDPA-compliant Privacy Policy + Terms of Service draft, India-specific.
2. Sensitive-personal-data disclosure language for biometric photos (face, scalp).
3. Cross-border transfer notice for Gemini (US) + R2 (TBD on bucket region).
4. 18+ minor-protection language + consent-screen copy.
5. Medical/cosmetic claim review for Lookmaxxing hair/skin recommendations
   (data/lookmax-content.js + services/hair.js). The hair recommendations name specific
   compounds — minoxidil, finasteride, ketoconazole — which is borderline
   regulated-substance advice. The current copy frames finasteride as
   "consult dermatologist" which is the right hedge; lawyer needs to confirm that
   framing satisfies India's Drugs and Magic Remedies (Objectionable Advertisements)
   Act.
6. Razorpay ToS compliance — confirm KYC scope covers personal-growth coaching
   subscriptions, not regulated medical/wellness.

I do not sign off on any of the above; flagging only.

---

## Pre-existing BLOCKERS that remain (gating `PAYWALL_PUBLIC=true`, NOT dogfood)

Restated verbatim from `security/audit-pre-public-launch.md` and `security/audit-login-gate.md`.
None have moved.

1. **BLOCKER-1 — Committed `.env` history with un-rotated leaked keys.** Gemini + Razorpay
   key secrets are in git history. Rotation has not happened. Founder action only.
2. **BLOCKER-2 — No Privacy Policy / no consent / no 18+ gate.** DPDPA non-compliance for
   biometric photo collection. Lawyer review then backend wiring.
3. **BLOCKER-3 — No `/api/user/delete`, no `/api/user/export`, no photo retention/deletion.**
   Biometric data has no lifecycle. backend-agent action.

Plus the QA-flagged copy-compliance P1:
- **`confirmed.mirrorCta` placeholder copy** on `payment-confirmed.html`. Founder writes
  the approved string before `PAYWALL_PUBLIC=true`.

---

## Dogfood-readiness checklist (yes/no the founder can read in 30s)

| Gate | State |
|---|---|
| Founder may begin dogfood TONIGHT? | **YES.** No new P0 against the dogfood threat model. |
| Founder must do anything FIRST? | **Verify `RAZORPAY_WEBHOOK_SECRET` is set in Render** — if empty, paywall click-throughs silently never activate (services/razorpay.js:165). 2 minutes. Also verify `ADMIN_PASSWORD_HASH` is populated (P1-5). |
| Anything else blocking dogfood? | No. WhatsApp `webhookGuard: "open"` is acceptable because no real Meta traffic. |
| What blocks the NEXT flip (`PAYWALL_PUBLIC=true`)? | The 3 pre-existing BLOCKERS + the 5 new P1s above (#1-5 in this audit) + the founder-approved `mirrorCta` copy. |
| What blocks `WHATSAPP_SEND_MODE=all`? | P2-1 (`WHATSAPP_APP_SECRET`) — must be set. |
| What blocks `rzp_live_*`? | All `PAYWALL_PUBLIC` blockers + a successful end-to-end ₹1 test charge with live keys. |

**Verdict: ship dogfood, do not flip PAYWALL_PUBLIC until BLOCKERS 1-3 + P1-1 through P1-5
are closed.**

---

## Relevant file paths

- `/Users/chitranshu/Desktop/MainComponent/server.js` — rate-limit mounts (104-111), helmet
  (72), CORS-absent posture (no hits), trust proxy (67), payment-confirmed gate (157-162).
- `/Users/chitranshu/Desktop/MainComponent/routes/api.js` — webhook handlers, PII-in-logs
  carry-over (114, 131, 257, 267, 506, 726-843), payment status / firstLoginToken (641-692).
- `/Users/chitranshu/Desktop/MainComponent/routes/audit.js` — multer config without fileFilter
  (20-23), upload + R2 write path (45-101).
- `/Users/chitranshu/Desktop/MainComponent/routes/lookmax.js` — mirror + hair upload paths
  (27-30, 70-135, 205-253).
- `/Users/chitranshu/Desktop/MainComponent/routes/lookmax-auth.js` — gold-standard reference
  for masking + cooldown patterns (101-129).
- `/Users/chitranshu/Desktop/MainComponent/routes/admin.js` — admin auth (29-55), no IP
  lockout (P1-4), legacy plaintext fallback (48-52).
- `/Users/chitranshu/Desktop/MainComponent/routes/reaudit.js` — DPDPA-correct example: strips
  R2 keys from output (390-408), signed URLs only.
- `/Users/chitranshu/Desktop/MainComponent/services/storage.js` — `put()` writes raw client
  buffer to R2 (105-124); sharp only on legacy `saveImage` path (242-260).
- `/Users/chitranshu/Desktop/MainComponent/services/photos.js` — local /tmp writes; volatile
  (47-50).
- `/Users/chitranshu/Desktop/MainComponent/services/whatsapp.js` — webhook signature open
  mode (200-217, 236-238).
- `/Users/chitranshu/Desktop/MainComponent/services/razorpay.js` — webhook signature verify
  (164-176); needs `RAZORPAY_WEBHOOK_SECRET` set.
- `/Users/chitranshu/Desktop/MainComponent/services/gemini.js` — process-wide 10 RPM (25-37);
  no per-user cap.
- `/Users/chitranshu/Desktop/MainComponent/services/vision.js` — same pattern (41-47);
  prompt-injection guard verified (209-219).
- `/Users/chitranshu/Desktop/MainComponent/data/orator-content.js` — `getScoringPrompt`
  delimiters + guard (267-300); user input NOT length-capped.
- `/Users/chitranshu/Desktop/MainComponent/data/lookmax-prompts.js` — audit + mirror + hair
  prompt builders; injection guard verified (66-92).
- `/Users/chitranshu/Desktop/MainComponent/lib/auth.js` — admin password fallback (42-53).
- `/Users/chitranshu/Desktop/MainComponent/lib/lookmax-auth.js` — JWT boot guard (23-28),
  scope enforcement (53), `?token=` query fallback (67) — should be removed.
- `/Users/chitranshu/Desktop/MainComponent/lib/log-mask.js` — canonical helper, not yet
  used in `routes/api.js`.
- `/Users/chitranshu/Desktop/MainComponent/lib/db.js` — pg pool singleton (55-79).
- `/Users/chitranshu/Desktop/MainComponent/landing.html` — no Privacy Policy link
  (BLOCKER-2).
- `/Users/chitranshu/Desktop/MainComponent/public/audit.html` — 500-char client-side cap
  on `goals` (247) — server-side cap missing.
- `/Users/chitranshu/Desktop/MainComponent/public/lookmax/app.js` — JWT in localStorage
  (11-13).
- `/Users/chitranshu/Desktop/MainComponent/public/payment-confirmed.html` — JWT in
  localStorage (225).
- `/Users/chitranshu/Desktop/MainComponent/security/audit-pre-public-launch.md` — original
  source of the 3 BLOCKERS.
- `/Users/chitranshu/Desktop/MainComponent/security/audit-login-gate.md` — most recent
  audit; carry-overs traced here.

---

End of audit.
