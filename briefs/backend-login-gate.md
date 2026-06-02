# Brief — backend-agent — Login Gate

> Parent spec: `product/spec-login-gate.md` (read §6, §7, §8, §9 in full before writing code)
> CLAUDE.md §6 rules apply: test-first (Vitest), no console.log, snapshot any locked copy you touch, no `.env` weakening, smoke test passes before commit.

## What you own

Build the backend surface for email-magic-link login + post-payment one-shot session mint. All routes go behind feature flag `LOOKMAX_EMAIL_LOGIN` (default `false`).

## Files you will touch (exhaustive list — read each before editing)

- `routes/lookmax-auth.js` — add 3 routes, modify the OTP routes to route to "use email" message.
- `routes/api.js` — modify `processPaymentEvent` (~line 668) + `/api/payment/status` (~line 582).
- `lib/lookmax-auth.js` — add a one-line startup guard: throw on boot if `LOOKMAX_EMAIL_LOGIN==='true' && !process.env.JWT_SECRET`. Do NOT weaken the existing fallback chain otherwise; the guard is additive.
- `lib/log-mask.js` — NEW. `mask(phone) → '91••••5678'`, `mask(email) → 'n•••@example.com'`. Pure functions, fully tested.
- `models/User.js` — add `getUserByEmail`, add the 6 nullable fields to the `createUser` default shape (`magicLinkToken`, `magicLinkExpiresAt`, `magicLinkConsumedAt`, `firstLoginToken`, `firstLoginExpiresAt`, `firstLoginConsumedAt`). Do NOT modify existing field defaults.
- `services/email.js` — add `sendMagicLink({ user, token, label })`, modify `sendPaywallReceipt` to accept + render `firstLoginToken` into the template.
- `data/email-templates/magic-link.html` — NEW. Mirror existing `paywall-receipt.html` markup. Copy slots from spec §5 — use `{{magicLinkUrl}}` token only; all human-readable copy is `[copy-consultant TBD]` placeholders.
- `data/email-templates/paywall-receipt.html` — modify to include `{{magicLinkUrl}}` block (also `[copy-consultant TBD]`).
- `server.js` — add `app.use('/api/lookmax/auth', tightLimiter)` (one line, replaces the absence of any auth-scoped limiter).
- `routes/lookmax-auth.js` — also update existing log lines (line 54, 64, 83, 86) to use the new mask helper. In-scope cleanup per security audit HIGH.

## What you do NOT touch

- `lib/lookmax-auth.js` JWT issuance (`signLookmaxToken`, `verifyLookmaxToken`, `requireLookmaxAuth`) — reused as-is. Do not change TTL, do not change scope claim, do not add refresh tokens.
- `services/whatsapp.js`, `services/sms.js` — unchanged.
- `lib/messaging-mode.js` — unchanged. The email magic link inherits the existing email allowlist guard.
- `lib/auth.js` — unchanged. Admin password path is separate.
- Any locked copy. The Consultant voice strings in templates are `[copy-consultant TBD]`; do not invent.

## Route specifications

See spec §6 for the full signatures. Quick reference:

| Route | Method | Body | Success | Error |
|---|---|---|---|---|
| `/api/lookmax/auth/request-link` | POST | `{email}` | always 200 `{status:'sent'}` | n/a — enumeration-safe |
| `/api/lookmax/auth/consume-link` | POST | `{token}` | 200 `{token:<jwt>, user}` | 401 `{error:'link expired or already used'}` |
| `/api/lookmax/auth/exchange-first-login` | POST | `{firstLoginToken}` | 200 `{token:<jwt>, user}` | 401 `{error:'link expired or already used'}` |
| `/api/lookmax/auth/method` | GET | — | 200 `{methods:['email'\|'otp'\|'admin']}` | n/a (used by login.html to render the right form) |

Existing routes: `admin-login` unchanged; `request-otp` returns `{status:'unavailable', message:'Use the email entry link.'}` whenever `LOOKMAX_EMAIL_LOGIN==='true'`; `verify-otp` unchanged (resurfaces with WhatsApp OTP).

## Test plan (Vitest, test-first)

Write each test BEFORE the implementation it covers. Smoke test must still pass at every commit.

1. `tests/unit/log-mask.test.js` — phone + email masking, edge cases (empty, short, unicode, null).
2. `tests/unit/user-getByEmail.test.js` — exists / missing / mixed-case / trim / multiple users with same email (returns first).
3. `tests/unit/lookmax-auth.request-link.test.js`:
   - returns `{status:'sent'}` for unknown email (no `email.sendMagicLink` call)
   - returns `{status:'sent'}` for known email AND calls `sendMagicLink` once (use `__setTransport` to assert)
   - persists `magicLinkToken` + `magicLinkExpiresAt` on the user
   - 4th request for same email in 15 min: `{status:'sent'}` but `sendMagicLink` called only 3 times
   - log line is masked (assert no plaintext email in the test log buffer)
4. `tests/unit/lookmax-auth.consume-link.test.js`:
   - valid token → JWT + user, fields cleared on the user
   - same token a second time → 401 generic
   - expired token → 401 generic
   - malformed token → 401 generic
   - tokens from other users do not cross-authenticate
5. `tests/unit/lookmax-auth.exchange-first-login.test.js` — mirror of consume-link, against the `firstLogin*` fields.
6. `tests/unit/api.processPaymentEvent.test.js` (extend existing if present) — assert that on `subscription.activated` with lookmaxxing pillar, `firstLoginToken` is minted (32-hex) and `firstLoginExpiresAt` is 15 min ahead.
7. `tests/unit/api.paymentStatus.test.js` — `firstLoginToken` is present in the response only when `LOOKMAX_EMAIL_LOGIN=true` AND user.lookmaxxingActive AND not consumed AND not expired.
8. `tests/unit/server.rateLimit.test.js` — 11th POST to `/api/lookmax/auth/request-link` from the same IP within 60s returns 429.
9. **Smoke addition** — extend `npm run smoke` to walk: POST request-link (mocked email) → read the seeded token from the test User store → POST consume-link → assert a valid JWT comes back → assert `/api/lookmax/me` returns the right user with that JWT.

## Security checklist (from spec §9, do not skip any)

- [ ] All new log lines pass through `lib/log-mask.js`. No raw phone or email in any new log line.
- [ ] One-line startup guard added to `lib/lookmax-auth.js`: if `LOOKMAX_EMAIL_LOGIN==='true' && !process.env.JWT_SECRET`, throw at boot with a clear message.
- [ ] tightLimiter mounted on `/api/lookmax/auth/*`.
- [ ] Per-email throttle (3/15min) implemented as an in-memory `Map` with a periodic prune (size cap 10k entries — drop oldest).
- [ ] Per-IP cooldown (3 consecutive failures → 5 min) on `consume-link` and `exchange-first-login` — same pattern.
- [ ] `magicLinkToken` and `firstLoginToken` are `crypto.randomBytes(32).toString('hex')`. Never logged. Never returned outside the success response.
- [ ] Single-use enforced at the data layer: both `Consumed` field set AND `Token` field nulled on success.
- [ ] Single generic error message string across all 401 paths.
- [ ] Magic-link URLs use `encodeURIComponent` on the token.
- [ ] `getUserByEmail` is case-insensitive + trimmed.
- [ ] `RESEND_API_KEY` unset → `sendMagicLink` returns `{result:'dry-run'}`, `/auth/request-link` still returns `{status:'sent'}`, no crash.

## Commit cadence

One conventional commit per logical change:
- `feat(auth): add log-mask helper + tests`
- `feat(auth): user.getByEmail + magic-link/firstLogin fields`
- `feat(auth): email magic-link routes behind LOOKMAX_EMAIL_LOGIN`
- `feat(payments): mint firstLoginToken on lookmaxxing subscription.activated`
- `feat(security): tightLimiter on /api/lookmax/auth/*; PII masking on auth logs`
- `feat(email): sendMagicLink + receipt firstLoginToken integration`

Push to `main` after each green commit (CLAUDE.md §6 rule 2). Smoke test must pass.

## What you escalate (do not decide alone)

- If `lib/lookmax-auth.js` fallback-chain removal feels needed: do NOT remove it in this PR. Add the additive startup guard only. Log a `BACKLOG.md` item for cleanup.
- If any locked-copy file needs touching beyond inserting `{{magicLinkUrl}}` token placeholders: stop, escalate to founder.
- If `processPaymentEvent` refactor seems necessary beyond the two `updates.*` additions: stop, escalate.
