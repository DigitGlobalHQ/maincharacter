# Security Re-Audit — Login Gate (P0-1)

**Date:** 2026-05-28
**Auditor:** security-compliance-agent (Head of Security & Compliance)
**Scope:** Login Gate feature only (spec `product/spec-login-gate.md`, QA sign-off
`product/qa-signoff-login-gate.md`). Independent verification in source — sign-offs
treated as claims, not proofs.
**Gate:** FINAL security gate before the founder may flip `LOOKMAX_EMAIL_LOGIN=true`.

---

## VERDICT — TL;DR

### A. `LOOKMAX_EMAIL_LOGIN=true` (dogfood, founder + allowlisted testers): **SIGN-OFF — GO.**

Every promise in spec §9 is verified against the shipped code. No new BLOCKER, no new HIGH. The
only deviations from spec are strictly-more-secure (D-2: shared ipCooldown across both
endpoints) or harmless-cosmetic (D-1 blank preheader, D-3 placeholder mirror CTA, D-4 blank
loading-state copy). All three of the founder-controlled prerequisites must be set in Render
before the flip (see "One-line founder instructions" below).

### B. `PAYWALL_PUBLIC=true` (first cohort ≤50 paying users): **BLOCK — STOP.**

The three BLOCKERS from `audit-pre-public-launch.md` are **NOT** addressed by this feature and
remain open. The login-gate work only resolves the AUTH-class findings (MEDIUM rate-limit,
MEDIUM JWT_SECRET fallback, HIGH PII-in-logs *for the new routes*); the BLOCKERS are
compliance/data-lifecycle/secrets, an orthogonal class of work.

Remaining BLOCKERS that gate `PAYWALL_PUBLIC=true` (unchanged from prior audit):
- **BLOCKER-1.** Committed `.env` history with un-rotated live Gemini + Razorpay keys.
- **BLOCKER-2.** No Privacy Policy / no consent capture / no 18+ gate — DPDPA non-compliance
  for biometric photo collection.
- **BLOCKER-3.** No `/api/user/delete`, no `/api/user/export`, no photo retention/deletion
  mechanism — biometric data has no lifecycle.

Plus one Login-Gate-specific P1 that gates `PAYWALL_PUBLIC=true` (not the dogfood flag): the
`confirmed.mirrorCta` placeholder copy on `payment-confirmed.html` (QA D-3 — non-security
finding QA already flagged, restated here for completeness).

---

## Item-by-Item Verification (16 audit items)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `tightLimiter` (10/min) mounted on `/api/lookmax/auth`, ordering correct vs. global limiter, all auth endpoints inherit | **PASS** | `server.js:108` — `app.use('/api/lookmax/auth', tightLimiter)` mounted BEFORE `server.js:109` `app.use('/api', globalLimiter)`. Express matches `/api/lookmax/auth/*` against the tighter prefix first and the per-IP counter is the 10/min one; the broader `/api` limiter then runs but is the higher cap, so 10/min is the binding constraint. All five auth endpoints in `routes/lookmax-auth.js` (admin-login, request-otp, verify-otp, request-link, consume-link, exchange-first-login) sit under the prefix and inherit. Resolves prior MEDIUM. |
| 2 | PII masking in logs — `lib/log-mask.js` correct outputs; every log line in `routes/lookmax-auth.js` uses the helper; no raw email/phone/token in any log call | **PASS** (with carry-over note) | `lib/log-mask.js:22-54` — `maskEmail` returns `j***@gmail.com`, `maskPhone` returns `*****3210` (last-4), `maskToken` returns `[redacted]`. Grep of `routes/lookmax-auth.js`: 20 log call sites, every one wraps user data in `maskEmail(...)` / `maskPhone(...)` / `maskToken(...)`. Zero raw `email`/`phone`/`token` variables interpolated. The admin-login line (311, 320) and the legacy OTP lines (348, 351) were ALSO converted (in-scope cleanup). `routes/api.js` lines 72/208/695 (the prior audit's HIGH finding sites) are out of scope for THIS feature and remain unmasked — but `lib/log-mask.js` is the reusable helper that closes them when backend-agent does that pass. |
| 3 | No enumeration — `/auth/request-link` always returns `{status:'sent'}`; `consume-link` + `exchange-first-login` return single identical error for every failure mode; cooldown does NOT produce a distinguishing response | **PASS** | `request-link` (`routes/lookmax-auth.js:152-199`) returns `{status:'sent'}` on EVERY exit path: flag off, blank email, throttled, no-match user, sent. No status-code branching, no early-return timing tell beyond the linear-scan that already exists for any user-by-field lookup (acceptable per spec §8 — 256-bit token search space). `consume-link` (203-251) and `exchange-first-login` (255-303) both use the single helper `tokenExpiredOrUsed(res)` (126-128) returning `{error: 'link expired or already used'}` 401 for: cooldown active, missing token, token not found, already-consumed, expired. No branch returns a distinguishing message; cooldown returns the same generic error (210, 262). |
| 4 | Single-use enforcement at data layer — successful consume NULLs token field AND sets consumedAt; second lookup by null token impossible; no race window | **PASS** (with documented v1 caveat) | `consume-link` 241-245 writes `{magicLinkToken: null, magicLinkExpiresAt: null, magicLinkConsumedAt: <iso>}` BEFORE issuing the JWT. Subsequent lookup via `getUserByMagicLinkToken(token)` (131-134) scans `u.magicLinkToken === token` — once nulled, NO record matches (a passed-in non-null `token` can never equal `null`). Same pattern for `exchange-first-login` (293-297). **Caveat (documented in spec §6, accepted v1):** The JSON store has no row-level lock between `getUserByMagicLinkToken` (220) and `User.updateUser` (241). Two simultaneous consumes from the same valid token could both pass the read step. Two issues: (a) realistic concurrency for a single human clicking once is zero; (b) when the second `updateUser` lands the data simply overwrites with the same null values — no second JWT mint can happen because both branches see `magicLinkConsumedAt: null` at read time, but **both could mint a JWT** in the worst-case race. This is the JSON-store reality and is the documented v1 trade-off (spec §8 closing paragraph). Postgres + `UPDATE ... WHERE consumedAt IS NULL RETURNING *` is the durable fix. Not a new BLOCKER, **flagged as LOW** for the v1 window. |
| 5 | Token entropy + opacity — both tokens are `crypto.randomBytes(32).toString('hex')` (256 bit); NOT JWTs; stored server-side only; never returned to client after first use | **PASS** | `magicLinkToken`: `routes/lookmax-auth.js:185` — `crypto.randomBytes(32).toString('hex')`. `firstLoginToken`: `routes/api.js:703` — same call. Both are 64-character hex strings (256 bits raw). Neither is a JWT — both are opaque random values, stored on `user.magicLinkToken` / `user.firstLoginToken`. `consume-link` 241 / `exchange-first-login` 293 NULL the field after first use; subsequent `/me` / status responses never expose either. The only place either token leaves the server is (a) the magic-link URL in the email (`services/email.js:158`, `magicLinkToken` only) and (b) `/api/payment/status` JSON body to the same browser that just paid (`routes/api.js:610-617`, `firstLoginToken` only, only when the four conditions all hold). |
| 6 | Tokens in URLs and logs — `magicLinkToken` URL-encoded in email URL, never logged; `firstLoginToken` NEVER in URL, only JSON body over HTTPS, POSTed not GETed | **PASS** | `services/email.js:158` — `${baseUrl()}/lookmax/login?token=${encodeURIComponent(token)}` — encoded. `services/email.js:198` — receipt magic URL also encoded. `consume-link` handler logs `maskToken(token)` = `[redacted]` at every error path (224); never logs the raw token value. `firstLoginToken`: grepped server-wide — appears in (a) `/api/payment/status` response body (`routes/api.js:631`, HTTPS JSON), (b) the receipt email body URL (`services/email.js:198` — note: this is `firstLoginToken` in the BACKUP magic-link URL inside the receipt, expected per spec §6), (c) `payment-confirmed.html:138` POST body to `/api/lookmax/auth/exchange-first-login`. Never in any URL the client navigates to or any log call. The receipt-email URL exposure is the spec-intended F2 fallback and is single-use + 15-min TTL like every other magic-link URL. |
| 7 | `JWT_SECRET` startup guard — when `LOOKMAX_EMAIL_LOGIN=true` AND `JWT_SECRET` unset, module throws at boot; when flag off the fallback chain remains | **PASS** | `lib/lookmax-auth.js:23-28` — `if (process.env.LOOKMAX_EMAIL_LOGIN === 'true' && !process.env.JWT_SECRET) throw new Error(...)` executes at module load (top-level), not inside `signLookmaxToken`. The fallback chain `JWT_SECRET → ADMIN_JWT_SECRET → ADMIN_PASSWORD_HASH → 'maincharacter-lookmax-dev'` (30-37) only applies when the flag is off — when the flag is on the boot guard refuses to start. Verified by three guard tests in `tests/lookmax-auth-guard.test.js`. This is the right design: flipping the flag without a strong secret is a hard fail, not a silent fallback. Resolves prior MEDIUM (for the flag-on state). |
| 8 | Per-email throttle (3/15min), per-IP cooldown (3-fail/5min) — maps don't leak unbounded; cooldown applies to both endpoints; throttles cannot be bypassed by header manipulation | **PASS** | (a) `emailThrottle` map (74-94): capped at `EMAIL_THROTTLE_MAP_CAP = 10_000` entries; oldest key evicted when full (88-91). FIFO eviction is crude but bounded. The per-key timestamp arrays are bounded by `EMAIL_THROTTLE_MAX = 3`. No unbounded growth. (b) `ipCooldown` map (101-123): no explicit map cap (theoretical OOM risk if an attacker rotates IPs — but each entry is ~80 bytes and the practical attack ceiling is small at 10/min globally per IP from the tightLimiter). LOW finding flagged. (c) Cooldown is **shared** between `consume-link` (209) and `exchange-first-login` (261) — both call `ipCooled(ip)`/`ipRecordFailure(ip)`/`ipRecordSuccess(ip)` against the same map. Spec §8 only required it for consume-link; shipped is strictly stricter (QA D-2 — confirmed). (d) IP derivation: `req.ip` (lookmax-auth.js:206, 258) — populated by Express. `server.js:65` sets `app.set('trust proxy', 1)` — trusts EXACTLY one hop (Render's load balancer). This means an attacker cannot spoof `x-forwarded-for` to forge the rate-limited IP — Express takes the rightmost-but-one value, which Render itself injects. Correct. |
| 9 | Cross-user isolation — QA's 7 tests in `tests/qa-cross-user-isolation.test.js` actually verify what they claim; `verifyLookmaxToken` returns null for tampered/wrong-scope/wrong-secret tokens | **PASS** | `lib/lookmax-auth.js:49-57` — `verifyLookmaxToken` calls `jwt.verify(token, jwtSecret())` and rejects unless `decoded.scope === 'lookmax'`. Any signature mismatch throws (caught at 54, returns null); any wrong scope returns null at 53. `requireLookmaxAuth` (64-76) returns 401 on null, then fetches the user by the **decoded** `userId` — never by client-supplied identifiers. QA tests cover: valid A→A (correct), valid B→B not A (correct), tampered with wrong-secret→401 (correct), correct-secret but `scope:admin`→401 (correct), correct-secret but no scope→401 (correct), valid A token cannot resolve B (correct), signature-stripped→401 (correct). All 7 tests verify what they claim. No path exists where a JWT for userId A attaches `req.lookmaxUser` for any other user. |
| 10 | Fail-closed when Resend down — `email.sendMagicLink` returns `{result:'dry-run'}`; `request-link` still returns `{status:'sent'}` so client sees normal "check inbox"; no PII in DRY-RUN log line; no JWT minted | **PASS** | `services/email.js:117-120` — when `!isConfigured()` returns `{result:'dry-run'}` (no throw). `sendMagicLink` (155-164) is wrapped in `.catch()` at `lookmax-auth.js:193-195` so even a transport throw doesn't crash the request. `request-link` returns `{status:'sent'}` regardless (response written at 198 BEFORE the catch fires — actually written synchronously after the fire-and-forget). DRY-RUN log line (`services/email.js:118`): `log.info('DRY-RUN', \`credentials not configured. Would have sent "${subject}" to ${to}\`)` — **CAVEAT FOUND:** the recipient email `${to}` IS logged in plaintext in `services/email.js:118` when DRY-RUN fires. This is an existing email-service log line, NOT a new login-gate finding (it predates this feature; same line logs at 109, 113), but it means a magic-link request flowing through `request-link → sendMagicLink → sendEmail (DRY-RUN)` emits a log line with the raw email address. **LOW (carry-over):** the pre-existing `services/email.js` log lines do not use the new `lib/log-mask.js` helper. Fix: route `services/email.js` log lines through `maskEmail` too. Not a new finding (file untouched by this feature except `sendMagicLink` was added); flagged so backend-agent picks it up in the broader PII pass. No JWT is minted in any DRY-RUN path. |
| 11 | Open redirect — post-success navigation is HARDCODED `/lookmax/`; no `?next=` / `?redirect=` parameter consumed | **PASS** | `public/lookmax/login.html:248` — `location.href = '/lookmax/'` (hardcoded literal). `public/payment-confirmed.html:201` — `location.href = '/lookmax/'` (hardcoded literal). Grep for `next=`, `redirect=`, `returnTo`, `continue=` across `/lookmax/` JS files: zero occurrences. Explicit non-feature per spec §9 and confirmed in source. |
| 12 | CSRF posture — JSON-only bodies; `Authorization` header for JWT (not cookies); no form-encoded body acceptance on new endpoints | **PASS** (with one pre-existing nuance) | Login-gate endpoints all read `req.body.email` / `req.body.token` / `req.body.firstLoginToken` as JSON; the frontend POSTs `Content-Type: application/json` (`login.html:166`, `payment-confirmed.html:137`). JWT stored in `localStorage` (`login.html:247`, `payment-confirmed.html:113`), sent as `Authorization: Bearer ...` by `requireLookmaxAuth` (`lib/lookmax-auth.js:65-67`). **Nuance:** `server.js:82` mounts `app.use(express.urlencoded({extended: true}))` app-wide, so the new endpoints WILL parse a form-encoded body if one is sent — but they read `req.body.email/token/firstLoginToken` either way, and no cookie auth is involved, so a CSRF from a different origin still cannot attach the victim's JWT (no cookie session). Real-world CSRF risk: zero (no ambient credentials). Pre-existing; not a new finding. |
| 13 | Magic-link email XSS — `{{name}}` in template HTML-escaped before insertion; `<script>` in user name does not execute | **PASS** | `services/email.js:69-76` — `esc()` escapes `& < > "` (XSS-safe set for HTML text contexts). `renderTemplate` (85-94) calls `esc(v)` for every token UNLESS the key ends in `_html` (88) — `name` does not end in `_html` so it is escaped. `magicLinkUrl` is also auto-escaped — but URL escaping (encodeURIComponent on the token at `services/email.js:158`) plus HTML escaping of the resulting string is correct: the token cannot break out of either context. Confirmed by manual trace: user name `<script>alert(1)</script>` would render as `&lt;script&gt;alert(1)&lt;/script&gt;` in the email body. Inert. |
| 14 | `paywall-receipt.html` magic-link section XSS — `{{magicLinkSection_html}}` conditionally rendered; `magicUrl` HTML-escaped within it | **PASS** | `services/email.js:196-213` — `magicLinkSection_html` is built only `if (firstLoginToken)` (197). Inside the section the `magicUrl` interpolation uses `${esc(magicUrl)}` (208) — explicit `esc()` call. The token has already been `encodeURIComponent`-wrapped (198), so double-defence applies. Note that this string ends in `_html` so `renderTemplate` will NOT re-escape it when substituted into the receipt template (88) — but the `esc()` call at 208 happens BEFORE that, ensuring the URL itself is HTML-safe. Net: safe in both contexts. |
| 15 | CSP / security headers | **CAVEAT (pre-existing, MEDIUM, unchanged)** | `server.js:70` — `app.use(helmet({contentSecurityPolicy: false}))`. All other helmet headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.) apply. **CSP is intentionally disabled** for v1 (DECISIONS.md 2026-05-26: landing/admin pages use inline styles + CDN scripts). The login.html and payment-confirmed.html pages now handle JWTs in localStorage — but the same-origin browsers' localStorage is already protected from cross-origin reads by SOP regardless of CSP. The CSP-absent risk is XSS via a future bug elsewhere on the origin leaking the JWT. **Not a NEW finding**, pre-existing posture. MEDIUM, tracked as the existing BACKLOG CSP follow-up. |
| 16 | DPDPA posture vs the flag flip — Login Gate does NOT close any of the three prior BLOCKERS | **CONFIRMED — BLOCKERS REMAIN** | This feature is an auth/UX feature; it does not touch (a) `.env` history rotation, (b) Privacy Policy / consent / 18+ gate, (c) `/api/user/delete` / `/api/user/export` / photo retention. **`LOOKMAX_EMAIL_LOGIN=true` is the dogfood-readiness gate**, NOT the public-launch gate. **`PAYWALL_PUBLIC=true` is the public-launch gate** and remains blocked on BLOCKER-1/2/3 from the prior audit. |

---

## NEW Findings Introduced by This Feature

| ID | Severity | Finding | Evidence | Fix | Owner |
|---|---|---|---|---|---|
| **L-1** | LOW | `services/email.js:118` DRY-RUN log line emits the raw recipient email when `RESEND_API_KEY` is unset. With `LOOKMAX_EMAIL_LOGIN=true` and Resend not yet wired, every `request-link` call from a matching email flows through this and writes the plaintext address to stdout. | `services/email.js:118` (also `:109`, `:113`) — `log.info('DRY-RUN', \`... to ${to}\`)`. | Wrap `${to}` through `require('../lib/log-mask').maskEmail(to)` in all three log calls in `services/email.js` (DRY-RUN, suppressed, blocked). Trivial diff. | backend-agent |
| **L-2** | LOW | `ipCooldown` map (`routes/lookmax-auth.js:101`) has no explicit size cap (unlike `emailThrottle`). An attacker rotating IPs at the tightLimiter ceiling (10/min/IP) creates a slow but unbounded map growth. At 80 bytes/entry and 10/min per source IP, exploiting this would take days and is bounded by Node heap — but the asymmetry vs. the email map is worth closing. | `routes/lookmax-auth.js:101-123` vs. `:73-94`. | Add a `IP_COOLDOWN_MAP_CAP = 10_000` and identical FIFO eviction. ~5 lines. | backend-agent |
| **L-3** | LOW | Single-use enforcement at the data layer has a small TOCTOU race window between `getUserByMagicLinkToken` (read) and `User.updateUser` (write) in the JSON store. Two genuinely concurrent consumes of the same valid token could each mint a JWT before either sees `magicLinkConsumedAt: null`. | `routes/lookmax-auth.js:220` → `241` (no lock). Spec §8 documents this as a v1 trade-off (linear scan note). | Acceptable for v1 dogfood — human clicks are not concurrent and the token is single-use against any other replay. Postgres migration brings `UPDATE ... WHERE consumedAt IS NULL RETURNING *` as the durable fix. Track in BACKLOG. | scale-readiness-agent (Postgres migration) |
| **C-1** | CARRY-OVER (MEDIUM) | The prior audit HIGH "PII in logs unmasked" finding for `routes/api.js:72, 208, 695` is OUT OF SCOPE for this feature but the new `lib/log-mask.js` helper is the canonical fix. Until backend-agent runs that broader pass, those three log sites still emit raw PII. | `routes/api.js:72, 208, 695`. | Apply `maskEmail` / `maskPhone` at those sites. Same helper, no new code. | backend-agent (separate ticket) |
| **C-2** | CARRY-OVER (MEDIUM) | CSP remains disabled (`server.js:70`). Login + payment-confirmed pages now handle JWTs in localStorage; an XSS bug anywhere on the origin would leak them. | `server.js:70`. | Phased CSP — start with `default-src 'self'` + explicit allow-list for Google Fonts + Chart.js CDN. Larger work; pre-existing BACKLOG. | backend-agent (BACKLOG) |

**No new HIGH. No new BLOCKER.** All three L-findings are non-blocking for the dogfood flip; all
are good housekeeping that should land before `PAYWALL_PUBLIC=true`.

---

## Pre-existing BLOCKERS That Remain Unaddressed

Restated verbatim from `security/audit-pre-public-launch.md` — these gate **`PAYWALL_PUBLIC=true`**,
not `LOOKMAX_EMAIL_LOGIN=true`:

1. **BLOCKER-1 — Committed `.env` history with un-rotated leaked keys.** Gemini and Razorpay key
   secrets are identical between the historical commits and current on-disk `.env`. Rotation has
   not happened. Founder action only.
2. **BLOCKER-2 — No Privacy Policy / no consent / no 18+ gate.** Required by DPDPA for biometric
   photo collection. Lawyer review required for the text; engineering then wires pages, consent
   checkbox, and 18+ confirmation. Combined founder + backend-agent action.
3. **BLOCKER-3 — No photo deletion, no `/api/user/delete`, no `/api/user/export`.** Biometric
   data has no retention, deletion, or portability mechanism. backend-agent action.

Plus the QA-flagged P1 specific to Login Gate (NOT a security finding — copy compliance):

- **P1 — `confirmed.mirrorCta` placeholder copy** on `payment-confirmed.html`. Founder writes
  approved copy before `PAYWALL_PUBLIC=true`. (Already on QA's blocker list at §9 of the sign-off.)

---

## One-Line Founder Instructions

**To flip `LOOKMAX_EMAIL_LOGIN=true` (dogfood):** Set `JWT_SECRET` (≥64 chars random),
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL`, and `EMAIL_ALLOWLIST` (dogfooders) in
Render; verify the Resend sending domain; then flip the flag. You may proceed.

**To flip `PAYWALL_PUBLIC=true` (first cohort ≤50):** Do NOT proceed. Rotate Gemini + Razorpay
keys (BLOCKER-1), publish a DPDPA-compliant Privacy Policy + consent capture + 18+ gate
(BLOCKER-2), ship `/api/user/delete` + `/api/user/export` + photo retention (BLOCKER-3), AND
land founder-approved `confirmed.mirrorCta` copy. Then re-audit.

---

## Relevant File Paths

- `/Users/chitranshu/Desktop/MainComponent/server.js` — `app.set('trust proxy', 1)` (65),
  `tightLimiter` mount (108), helmet config (70).
- `/Users/chitranshu/Desktop/MainComponent/routes/lookmax-auth.js` — all five new auth routes
  + throttle/cooldown maps + helper.
- `/Users/chitranshu/Desktop/MainComponent/lib/lookmax-auth.js` — JWT boot guard (23-28),
  scope enforcement (53), `requireLookmaxAuth` (64-76).
- `/Users/chitranshu/Desktop/MainComponent/lib/log-mask.js` — `maskEmail` / `maskPhone` /
  `maskToken` helpers.
- `/Users/chitranshu/Desktop/MainComponent/services/email.js` — `sendMagicLink` (155),
  `sendPaywallReceipt` magic-link section (172-213), HTML escaping `esc()` + `renderTemplate`,
  DRY-RUN log line **L-1** (118).
- `/Users/chitranshu/Desktop/MainComponent/routes/api.js` — `firstLoginToken` mint (700-705),
  `/api/payment/status` conditional response (607-617), receipt thread-through (727-734).
- `/Users/chitranshu/Desktop/MainComponent/public/lookmax/login.html` — three states + hardcoded
  navigation to `/lookmax/` (248).
- `/Users/chitranshu/Desktop/MainComponent/public/payment-confirmed.html` — silent exchange
  (133-148), hardcoded navigation (201), localStorage write (113).
- `/Users/chitranshu/Desktop/MainComponent/data/email-templates/magic-link.html` — escaped
  `{{name}}` + `{{magicLinkUrl}}`.
- `/Users/chitranshu/Desktop/MainComponent/data/email-templates/paywall-receipt.html` —
  `{{magicLinkSection_html}}` conditional injection (61).
- `/Users/chitranshu/Desktop/MainComponent/models/User.js` — six new fields (95-100),
  `getUserByEmail` (133-141).
- `/Users/chitranshu/Desktop/MainComponent/tests/qa-cross-user-isolation.test.js` — 7 isolation
  tests, all verified to test what they claim.
- `/Users/chitranshu/Desktop/MainComponent/security/audit-pre-public-launch.md` — prior audit
  that LOGGED the three BLOCKERS still gating `PAYWALL_PUBLIC=true`.
