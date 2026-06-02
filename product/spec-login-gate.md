# Spec — Login Gate (P0-1)

> Owner: feature-product-agent (Head of Product)
> Date: 2026-05-28
> Audit source: `product/audit-lookmaxxing-pre-launch.md` P0-1
> Roadmap source: `product/ROADMAP_TO_1CR.md` §0-B1
> Security findings addressed: `security/audit-pre-public-launch.md` MEDIUM (rate-limit), MEDIUM (JWT_SECRET), HIGH (PII in logs)
> Status: **SPEC — awaiting founder approval before build (§9 checkpoint #2).**

---

## 1. Bet (one paragraph)

A real paying Lookmaxxing customer must be able to **walk through the door they just paid for, on the same device, within the same minute, without typing a password or waiting for a WhatsApp message that can't be sent yet.** Today they cannot — OTP login is dormant (WhatsApp Cloud API DRY-RUN), and the only working door rejects every non-admin phone. We close this gate with two seams: (a) the Razorpay `subscription.activated` webhook mints a **one-shot, single-use login session** and the redirect-back page (`/payment-confirmed`) picks it up and silently signs the buyer in; and (b) for every subsequent login (returning user, second device, cleared storage, expired token) we deliver an **email magic link via Resend**, on a 15-minute TTL, single-use, rate-limited, that drops them into `/lookmax/` with a fresh 24h JWT. Phone remains the primary identifier (landmine #7 preserved), but **email becomes a required field at Lookmaxxing checkout** (it is optional today and that is exactly why we cannot deliver a recovery channel). When WhatsApp OTP eventually goes live, it coexists as a secondary login surface — it does not replace this; this is the floor.

## 2. Auth method chosen + rationale

**Chosen: Email magic link (Resend) + post-payment one-shot session mint.**

### Why this and not the other two

| Option | Why rejected / accepted |
|---|---|
| Phone + password set at checkout | **Rejected.** No new send-channel dependency, but password *reset* needs a channel. With WhatsApp DRY-RUN and SMS gated on DLT approval, the only working reset channel is email anyway — so this collapses into "email-based recovery on top of a password the user will forget within a week." Indian-user UX reality (criterion 5): forgotten-password rate is high; we'd be building two surfaces (password + email reset) when one (magic link) suffices. Net: more code, more failure modes, same dependency. |
| Phone + SMS OTP (MSG91) | **Rejected on lead time.** MSG91 itself is ~30 min of setup (one founder action: `MSG91_AUTH_KEY`), but India SMS is DLT-regulated — the OTP template ID (`MSG91_TEMPLATE_ID_OTP`) requires **DLT registration of the principal entity + template approval**, which is a 1–4 week external process. This is the same class of blocker that has WhatsApp OTP dormant today; choosing SMS just moves the block, doesn't unblock anything. Criterion 1 (fastest-to-unblock) fails outright. |
| **Email + magic link (Resend)** | **CHOSEN.** Single founder action (`RESEND_API_KEY` + `RESEND_FROM_EMAIL` — already listed in env table, Resend is already built at `services/email.js`, already templated, already gated through `lib/messaging-mode`). Domain verification at Resend is hours, not weeks — no DLT-equivalent. Magic links are single-use, TTL-bounded, rate-limit-friendly, and survive every `WHATSAPP_SEND_MODE` value. Honest about Indian email weakness (criterion 5) by **eliminating the need to ever click an email on the happy path** — the payment-confirmed redirect carries a one-shot session token minted server-side at the webhook, so the buyer never has to leave the tab. The email magic link is the *recovery* surface (returning, second device, lost token), not the first-login surface. |

### What this implicitly requires

- **Email becomes a required field at Lookmaxxing checkout.** Today `paywall.html:169-170` marks it "optional — for receipts." For any user whose `pendingPillars` includes `lookmaxxing`, the field becomes required. Orator-only checkout keeps email optional (Orator delivers over WhatsApp; this is a Lookmaxxing-pillar gate). Field-level change only; no rewrite of the locked card copy.
- **`RESEND_API_KEY` must be set in Render before build merges.** Add to `FOUNDER_ACTIONS_THIS_WEEK.md` as item #9 (the founder confirms separately, this spec assumes it lands).
- **The `subscription.activated` webhook code path now needs to mint a one-shot session** and persist its handle on the user record so `/payment-confirmed` can pick it up. Detailed in §6.

## 3. The full flow (happy path + every realistic failure mode)

### Happy path — first login of a fresh paying buyer (the >90% case)

```
1. User completes /paywall → /api/payment/subscribe → Razorpay short_url
2. User pays on Razorpay's hosted page
3. Razorpay → POST /api/payment/webhook (signature verified, processPaymentEvent runs)
     ↳ lookmaxxingActive=true is set on the user (existing code, api.js:683)
     ↳ NEW: mintFirstLoginToken(user) → writes user.firstLoginToken + firstLoginExpiresAt (15 min TTL)
     ↳ NEW: sendPaywallReceipt() includes the magic-link URL as a backup
4. Razorpay redirects user's browser → /payment-confirmed?razorpay_subscription_id=sub_xxx
5. payment-confirmed.html calls GET /api/payment/status?subscriptionId=sub_xxx (existing)
6. NEW: status response now includes { firstLoginToken } when found && lookmaxxingActive
7. NEW: payment-confirmed.html, on success, does:
     - LM.setToken(<JWT minted by exchanging firstLoginToken via POST /api/lookmax/auth/exchange>)
     - The "Open the mirror at /lookmax/" step becomes a button that just navigates there;
       no second auth required.
8. User lands on /lookmax/, dashboard loads, first ritual begins.
```

The webhook also fires the existing `sendPaywallReceipt` email which now embeds the magic-link URL (`/lookmax/login?token=<firstLoginToken>`) as a belt-and-braces recovery path in case the browser closes between step 4 and step 7.

### Happy path — returning user (second device, cleared storage, expired JWT)

```
1. User visits /lookmax/ → app.js requireSession() finds no token → /lookmax/login
2. NEW login.html: single email field + "Send link" button.
3. POST /api/lookmax/auth/request-link { email }
     ↳ Find user by email (User.getUserByEmail — NEW lookup helper).
     ↳ Mint a magicLinkToken (32 bytes hex), TTL 15 min, single-use.
     ↳ Persist { magicLinkToken, magicLinkExpiresAt, magicLinkConsumedAt:null } on the user.
     ↳ Send via Resend: subject "◆ Your Lookmaxxing entry link". Body: link + 1-line "expires in 15 min".
     ↳ Response: ALWAYS { status: 'sent' } regardless of whether the email maps to a user
        (no enumeration — see §9).
4. User opens email on phone, taps link → /lookmax/login?token=<magicLinkToken>
5. NEW: login.html on load, if URL has ?token, POST /api/lookmax/auth/consume-link { token }
     ↳ Validate token: exists, not expired, not consumed.
     ↳ Mark consumedAt=now, clear the token fields.
     ↳ Return { jwt, user }. JWT is a normal 24h Lookmaxxing token (existing signLookmaxToken).
6. login.html: LM.setToken(jwt) → location.href='/lookmax/'.
```

### Failure modes — explicit catalog

| # | Failure mode | What happens | Recovery |
|---|---|---|---|
| F1 | Webhook fires AFTER /payment-confirmed loads (Razorpay redirect beats the webhook by 1–5s — verified, see audit P1-H) | `/api/payment/status` returns `{found:false}` (api.js:587). Today's UI shows the error box. **NEW: page auto-polls status every 3s for 30s before showing the manual-refresh state.** Once `{found:true, firstLoginToken}` lands, the auto-exchange runs. | Auto-poll resolves it within seconds. If 30s elapses with no webhook, the user sees the existing "being verified" copy AND a "Send me an email link instead" button that goes to /lookmax/login. |
| F2 | User closes the tab between Razorpay redirect and /payment-confirmed loading (battery dies, parent calls, etc.) | The webhook has already fired and minted `firstLoginToken`. The receipt email containing the magic link arrives in their inbox. | They open the email and tap the link → standard consume-link path. |
| F3 | User loses the email entirely (typo at checkout, junk folder, blocked sender) | `/lookmax/login` request-link returns `{status:'sent'}` (enumeration-safe) but no email ever arrives. | (a) Founder/admin can resend the receipt manually from `/admin` (later — out of scope for THIS spec, see §12). (b) Admin login still exists for the founder as a debugging seam. (c) Future: WhatsApp OTP when live. Documented as **a real risk we accept** for v1 — flagged in §11 acceptance criteria for QA. |
| F4 | Magic link expired (>15 min since issue) | `/api/lookmax/auth/consume-link` returns `{ error: 'link expired or already used' }` (same message — see §9 no-enumeration). | login.html shows: "This link is no longer valid. Send a new one ↓" — re-shows the email input. User re-requests. |
| F5 | Bot replays the magic link from server logs / a hijacked email account | The link is single-use (`magicLinkConsumedAt` is set on first consume). Second attempt returns the same generic `{ error: 'link expired or already used' }`. | None needed — first legitimate use already happened. We log the replay attempt (without the token value) for security review. |
| F6 | Brute force the magic link by guessing 32-byte hex tokens | 256-bit search space. Rate-limit `/auth/consume-link` at 10/min/IP via `tightLimiter` (security audit MEDIUM). Three consecutive failures from one IP → 5-min cooldown (in-memory). | Cooldown auto-expires. |
| F7 | Brute force the request-link endpoint to spam someone's email | Rate-limit `/auth/request-link` at 10/min/IP via `tightLimiter`. Also: per-email throttle of 3 requests / 15 min (in-memory map keyed by lowercased email). | Throttle silently absorbs the 4th+ request (still returns `{status:'sent'}`). |
| F8 | User changes their email post-signup (out of scope, see §12) | They cannot log in via email magic link to the new address. | v1: contact support. Future: in-product email-change flow with verification (BACKLOG). |
| F9 | `RESEND_API_KEY` is unset / Resend outage | `sendEmail` returns `{ result: 'dry-run' }` or throws. The user sees "Could not send the link. Try again in a moment." | They retry. If Resend is genuinely down, the founder can re-mint a `firstLoginToken` from `/admin` (later) or seed an admin login (existing path) for the affected user. **Fails closed** per criterion 4. |
| F10 | The user's `users.json` record is wiped on Render redeploy mid-session (landmine #1) | Their stored `magicLinkToken` / `firstLoginToken` vanishes. `requireLookmaxAuth` returns 404 (lib/lookmax-auth.js:59). | They re-request a magic link, which fails (no user record). They re-enter the audit/paywall flow — but money was lost on the original purchase. **Known landmine — this spec does NOT fix it.** Postgres migration (§0-B in roadmap) is the real fix. Flagged as a launch-risk in §13. |
| F11 | Multiple browser tabs/devices request links simultaneously | Each request overwrites the previous `magicLinkToken` on the user record (last-write-wins). Only the most recent link works. | The user clicks the newest link in their inbox. Documented as **expected behaviour**. |
| F12 | User pastes the URL with an extra trailing character / mangled token | `consume-link` validation fails with the generic expired/used message. | Re-request. |
| F13 | Email arrives but `?token=` is stripped by an email-client URL preview / corporate proxy | Token lost mid-flight. | Re-request. (Mitigation: also include the raw token in the email body as plain text so they can paste it. v2 nice-to-have, **deferred for v1** to keep scope tight.) |
| F14 | Admin clicks an Orator-only user's magic link by accident | The token is bound to the user's `email`, and `consume-link` mints a JWT for that user (not the consumer). On the device the link was opened on, the JWT lets them act as that user — same as the legitimate user opening it. | **This is correct behaviour** — magic links are bearer credentials. The 15-min TTL + single-use is the mitigation. Documented for ops awareness. |

## 4. Screens needed (one-line purpose each)

| Screen | Purpose |
|---|---|
| `public/lookmax/login.html` (REPLACE existing) | Single email input + "Send entry link" button. On `?token=` query param present, auto-consume and redirect into `/lookmax/`. Also handles the "link expired" + "check your inbox" empty states. |
| `public/lookmax/login.html` "Check your inbox" state | After successful request-link: shows "An entry link is on its way to {masked-email}. It expires in 15 minutes." + a passive "Send another →" affordance after a 60s delay. |
| `public/payment-confirmed.html` (MODIFY existing) | When `status` response includes `firstLoginToken`, auto-exchange + LM.setToken silently. Convert the "Open the mirror at /lookmax/" step (line 92) from a copy line into a `<button>` that does `location.href='/lookmax/'`. Add the F1 auto-poll loop. |
| `public/paywall.html` (MODIFY existing) | Make the email field `required` whenever the user has selected pillars including `lookmaxxing` (UI affordance + client validation; server enforces). No copy rewrite — just an `aria-required` change and a validation line. |
| `/lookmax/admin-login` (KEEP unchanged) | Existing admin escape hatch. No change. Documented as the debugging seam. |

Design-agent produces layouts for the two NEW states on login.html (request + check-inbox + error) and the modified step on payment-confirmed.html in a follow-up brief.

## 5. User-facing copy slots

All strings marked `[copy-consultant TBD]` are drafted by copy-consultant-agent and **founder-approved** (CLAUDE.md §9 checkpoint #7) before merge.

### On `public/lookmax/login.html`

| Slot id | Where | Constraint |
|---|---|---|
| `login.eyebrow` | top eyebrow | Must be `◆ MainCharacter` (locked, do not redraft). |
| `login.headline` | h1 | [copy-consultant TBD] — replaces "Lookmaxxing". One short serif line. |
| `login.sub` | sub-line | [copy-consultant TBD] — replaces "The mirror is honest. Enter to begin." |
| `login.email.label` | input label | [copy-consultant TBD] — likely "Your email". |
| `login.email.placeholder` | input placeholder | [copy-consultant TBD] |
| `login.cta` | button | [copy-consultant TBD] — short, restrained ("Send entry link" is the placeholder). |
| `login.checkInbox.headline` | post-request state | [copy-consultant TBD] — must reference the masked email + 15-min window without hype. |
| `login.checkInbox.resend` | resend affordance (60s delay) | [copy-consultant TBD] |
| `login.error.expired` | failure state | [copy-consultant TBD] — must NOT distinguish "expired" from "already used" (§9 no-enumeration). One line. |
| `login.error.network` | network/Resend fail | [copy-consultant TBD] |
| `login.footer` | footer-note | [copy-consultant TBD] — replaces "Daily mirror. Daily ritual. Weekly reveal." |

### In `services/email.js` template `magic-link.html` (NEW template file)

| Slot id | Where | Constraint |
|---|---|---|
| `email.magic.subject` | Subject line | [copy-consultant TBD] — Consultant voice, no exclamation, no emoji except ◆. |
| `email.magic.preheader` | Preheader | [copy-consultant TBD] |
| `email.magic.headline` | h1 inside email | [copy-consultant TBD] |
| `email.magic.body` | one short paragraph | [copy-consultant TBD] — mentions 15-minute window. |
| `email.magic.cta` | button label inside email | [copy-consultant TBD] — likely "Enter Lookmaxxing". |
| `email.magic.fallback` | fallback plain-link line | [copy-consultant TBD] — "If the button does not work, paste this in your browser." |
| `email.magic.security` | one-line security note at the bottom | [copy-consultant TBD] — "If you did not request this, ignore — the link expires in 15 minutes and can only be used once." |

### In `public/payment-confirmed.html` step

| Slot id | Where | Constraint |
|---|---|---|
| `confirmed.mirrorCta` | Replaces step text "Open the mirror at /lookmax/ — your daily ritual begins tomorrow morning." with a button + supporting line | [FOUNDER COPY] — this is a step on the locked payment-confirmed flow. Founder approves the button label + supporting line directly; no [copy-consultant TBD] drafting. |
| `confirmed.pollingState` | the auto-poll "your subscription is being verified" line | [copy-consultant TBD] — must read as quiet patience, not error. Replaces the current error-styled "being verified" copy (audit P1-H). |
| `confirmed.fallbackEmailLink` | the F1-failure escape "Send me an email link instead" affordance | [copy-consultant TBD] |

### In the receipt email (modify existing `paywall-receipt.html` template)

| Slot id | Where | Constraint |
|---|---|---|
| `receipt.firstLogin.line` | one new paragraph below the existing receipt body | [copy-consultant TBD] — explains the embedded magic link is a backup for "if the tab closed". One line. |
| `receipt.firstLogin.cta` | button | [copy-consultant TBD] — same wording as `email.magic.cta` ideally, for consistency. |

## 6. Backend surface area

### Routes to add / modify in `routes/lookmax-auth.js`

```js
// NEW — request a magic link (replaces the OTP request as the primary path).
POST /api/lookmax/auth/request-link
  Body: { email: string }
  Response (always 200): { status: 'sent' }   // enumeration-safe
  Side effects:
    - normalise email (lowercase, trim)
    - if a User with that email exists:
        - mint magicLinkToken = crypto.randomBytes(32).toString('hex')
        - User.updateUser(phone, {
            magicLinkToken,
            magicLinkExpiresAt: Date.now() + 15*60*1000,
            magicLinkConsumedAt: null,
          })
        - email.sendMagicLink({ user, token: magicLinkToken })  (NEW helper)
    - if not: log a "no-match request" line WITHOUT logging the email value
        (PII masking — security HIGH finding). Still returns { status: 'sent' }.

// NEW — consume a magic link, issue a JWT.
POST /api/lookmax/auth/consume-link
  Body: { token: string }
  Response 200: { token: <jwt>, user: publicUser(user) }
  Response 401: { error: 'link expired or already used' }   // single generic message
  Side effects:
    - lookup user by magicLinkToken (constant-time compare against each candidate? NO —
      tokens are random + indexed by user, so linear scan of users with non-null
      magicLinkToken; acceptable at JSON-store scale, revisit at Postgres migration).
    - validate: token matches, not expired, not consumed
    - on success: User.updateUser(phone, {
        magicLinkToken: null,
        magicLinkExpiresAt: null,
        magicLinkConsumedAt: new Date().toISOString(),
      })
    - sign + return signLookmaxToken(user)  (reuses lib/lookmax-auth.js — unchanged)

// NEW — exchange a one-shot post-payment firstLoginToken for a JWT.
POST /api/lookmax/auth/exchange-first-login
  Body: { firstLoginToken: string }
  Response 200: { token: <jwt>, user: publicUser(user) }
  Response 401: { error: 'link expired or already used' }   // same generic message
  Side effects: identical to consume-link, but reads/clears the
                firstLoginToken / firstLoginExpiresAt fields instead.
                TTL: 15 minutes from webhook mint.

// KEEP — admin-login route, unchanged (debugging seam, founder + ADMIN_PHONES).
POST /api/lookmax/auth/admin-login   (existing, unchanged)

// MODIFY — the existing OTP routes stay in place but become NO-OP-ROUTED:
POST /api/lookmax/auth/request-otp   →  returns { status: 'unavailable',
                                                  message: 'Use the email entry link.' }
                                       (existing 'unavailable' branch, just always)
POST /api/lookmax/auth/verify-otp    →  unchanged. Will resurface when WhatsApp OTP
                                       is enabled (see §10 coexistence plan).

// KEEP — /me, /auth/logout unchanged.
```

### Modifications in `routes/api.js`

```js
// In processPaymentEvent (api.js ~line 668, PAID_EVENTS branch):
// AFTER the existing `if (pillars.includes('lookmaxxing'))` block (line 683-686):

if (pillars.includes('lookmaxxing')) {
  updates.lookmaxxingActive = true;
  if (!user.lookmaxxingStartedAt) updates.lookmaxxingStartedAt = new Date().toISOString();
  // NEW: mint a one-shot first-login token so /payment-confirmed can sign the
  // buyer in silently. 15-min TTL, single-use. Cleared on first exchange.
  updates.firstLoginToken = crypto.randomBytes(32).toString('hex');
  updates.firstLoginExpiresAt = Date.now() + 15 * 60 * 1000;
  updates.firstLoginConsumedAt = null;
}

// In the email.sendPaywallReceipt call (api.js ~line 705):
// Pass through the firstLoginToken so the receipt embeds the magic-link URL
// as a backup.
email.sendPaywallReceipt({
  user: updatedUser,
  plan: notes.plan,
  subscriptionId,
  firstLoginToken: updatedUser.firstLoginToken,  // NEW
})
```

### Modifications in `routes/api.js` `/api/payment/status` (line 582)

```js
// Add ONE field to the response when found && lookmaxxingActive:
// (firstLoginToken is single-use; we return it once and trust the client to
//  exchange immediately. The auto-poll on payment-confirmed.html means this is
//  delivered server-side over HTTPS, never in a log, never in a URL.)

res.json({
  ...existing,
  firstLoginToken: (user.lookmaxxingActive && !user.firstLoginConsumedAt
                    && user.firstLoginExpiresAt > Date.now())
                   ? user.firstLoginToken
                   : null,
});
```

### Modifications in `models/User.js`

```js
// NEW field-level lookup:
function getUserByEmail(email) {
  if (!email) return null;
  const target = String(email).trim().toLowerCase();
  const users = loadUsers();
  return Object.values(users).find(u => (u.email || '').toLowerCase() === target) || null;
}
module.exports.getUserByEmail = getUserByEmail;

// In createUser default shape (line 59-91) — add three nullable fields:
magicLinkToken: null,
magicLinkExpiresAt: null,
magicLinkConsumedAt: null,
firstLoginToken: null,
firstLoginExpiresAt: null,
firstLoginConsumedAt: null,
```

No migration is needed for existing records — `updateUser` writes the fields lazily; `getUserByEmail` tolerates absence.

### Modifications in `services/email.js`

```js
// NEW: sendMagicLink({ user, token, label })
async function sendMagicLink({ user, token, label = 'Your Lookmaxxing entry link' } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };
  const url = `${baseUrl()}/lookmax/login?token=${encodeURIComponent(token)}`;
  const html = renderTemplate('magic-link.html', {
    name: user.name || 'Seeker',
    magicLinkUrl: url,
  });
  return sendEmail({ to: user.email, subject: label, html });
}

// MODIFY sendPaywallReceipt to accept firstLoginToken and inject into template:
// (new {{magicLinkUrl}} token in data/email-templates/paywall-receipt.html)
```

NEW template file: `data/email-templates/magic-link.html` (small, mirrors `paywall-receipt.html` markup; copy slots per §5).

### Modifications in `server.js`

```js
// Apply tightLimiter to ALL /api/lookmax/auth/* routes (security MEDIUM).
app.use('/api/lookmax/auth', tightLimiter);   // 10/min — was global 200/min
```

This single line replaces the existing only-/api/enroll-and-friends targeting and addresses the security audit's "auth/OTP endpoints under-rate-limited at 200/min" finding for ALL auth subroutes, not just the magic-link ones (so admin-login + verify-otp + exchange-first-login + request-link + consume-link are all 10/min).

## 7. Session model

- **JWT TTL:** unchanged — 24h. Existing `signLookmaxToken` (`lib/lookmax-auth.js:27`) is reused as-is.
- **Refresh strategy:** none. After 24h the user is bounced to `/lookmax/login` and re-requests a magic link. **Rationale:** refresh tokens add a second credential surface; for a daily-ritual product where the user opens the PWA most days, a fresh magic-link request once per 24h is acceptable UX and a strictly simpler/safer model. Revisit if engagement data shows weekly (non-daily) opens dominate.
- **Client-side storage:** unchanged — `localStorage` under key `lookmax.token` (app.js:7-13). Matches the existing pattern. **Acknowledged risk:** localStorage is readable by any script on the origin; we have no third-party scripts on `/lookmax/*` today (verified — `app.js`, `app.css`, Google Fonts only) and a strict CSP follow-up is on BACKLOG (Night-1 decision).
- **Cross-user isolation:** unchanged — JWT carries `userId` + `phone`; `requireLookmaxAuth` (lookmax-auth.js:51) fetches the live user and attaches as `req.lookmaxUser`; every PWA route uses `req.lookmaxUser.token` (the user's own UUID) — there is no path where a JWT for user A can read user B's data (verified against `routes/lookmax.js` and the `/uploads/:userId/:filename` route at server.js:217).
- **Magic-link tokens are NOT JWTs.** They are 32-byte random hex strings stored on the user record. They authenticate **only** the act of exchanging for a JWT — they are not a session credential and are never sent back to the client after first use. **Why:** keeping them opaque + server-side means a leaked link cannot be replayed past its single use, and the magic link surface area in JWT-decoding tooling is zero.
- **`firstLoginToken` follows the same rules** as magic-link tokens — single-use, 15-min TTL, hex-32, opaque, stored server-side, distinct field from `magicLinkToken` so race conditions between "I just paid + the receipt email arrived simultaneously" don't trample each other.

## 8. Rate limiting + abuse

- `app.use('/api/lookmax/auth', tightLimiter)` — **10/min/IP** across the whole auth namespace (closes security audit MEDIUM).
- **Per-email throttle:** `/auth/request-link` additionally throttles **3 requests / 15 min per lowercased-email** via an in-memory `Map<email, number[]>` (timestamps). 4th+ request returns `{status:'sent'}` but skips the actual send. Keeps inbox-spam attacks cheap to absorb.
- **Per-IP brute-force cooldown on `/auth/consume-link`:** **3 consecutive failures from one IP → 5-min cooldown**, also in-memory `Map<ip, {fails:number, cooldownUntil:number}>`. While cooled, returns `{ error: 'link expired or already used' }` (same generic message — no enumeration of cooldown state).
- **Constant-time concerns:** for v1 (JSON store), `getUserByMagicLinkToken` is a linear scan; we accept the small timing leak (presence of a non-null token vs not) because the search space is 256-bit random — far outside guessable. Postgres migration will index on token hash; documented.
- **In-memory state caveat:** the throttle and cooldown maps reset on every Render redeploy. Acceptable for v1 (Render redeploys are infrequent and reset every map type in the app, including the existing `express-rate-limit` store). Postgres + Redis is on the roadmap; flagged.
- **No CAPTCHA in v1.** Justification: tightLimiter at 10/min + the per-email throttle + Resend's own send-rate limits make a useful attack uneconomic, and a CAPTCHA on login is a real Indian-user-UX cost. Revisit if abuse signal appears in logs.

## 9. Security checklist this spec satisfies

| Security audit finding | How this spec addresses it |
|---|---|
| **`JWT_SECRET` weak fallback (MEDIUM)** | Spec **depends on** `JWT_SECRET` being set in Render before build merges (founder action #5 in FOUNDER_ACTIONS_THIS_WEEK.md). Build PR will refuse to enable the magic-link flow if `process.env.JWT_SECRET` is unset at boot — adds a hard guard to lib/lookmax-auth.js, escalating today's silent fallback to a startup error. (One-line addition; documented in the backend brief.) |
| **`/api/lookmax/auth/*` under-rate-limited (MEDIUM)** | `app.use('/api/lookmax/auth', tightLimiter)` — 10/min, replaces today's 200/min global only. Closes the finding for the entire auth namespace, including admin-login + the dormant OTP routes. |
| **PII in logs unmasked (HIGH)** | `routes/lookmax-auth.js` log lines that today emit `${normalised}` (phone) will be wrapped through a new `lib/log-mask.js` helper that returns `mask(phone)` (last-4 only) and `mask(email)` (first-char + domain). All NEW log lines in `request-link`, `consume-link`, `exchange-first-login` use the helper. The existing `admin-login` log line at line 54 / 64 is **also** updated in the same PR (in-scope cleanup). The mask helper is reusable for the broader §0-B5 PII-masking work. |
| **No credential in URL or log** | Magic-link tokens ARE in the URL (necessarily — that's how email links work). Mitigation: (a) 15-min TTL, (b) single-use, (c) never logged on either request-link or consume-link paths (the new mask helper drops the `token` key entirely). The `firstLoginToken` is **never** in a URL — it crosses only `/api/payment/status` → `/api/lookmax/auth/exchange-first-login` over HTTPS, and is cleared from the user record on first exchange. |
| **No enumeration via different error messages** | (a) `/auth/request-link` always returns `{status:'sent'}` whether the email matches or not. (b) `/auth/consume-link` and `/auth/exchange-first-login` return one single error `{ error: 'link expired or already used' }` for ALL failure modes (token missing, expired, consumed, malformed). (c) `getUserByEmail` returning null is silently absorbed. |
| **Single-use enforcement** | `magicLinkConsumedAt` and `firstLoginConsumedAt` fields are set on first successful exchange; subsequent lookups see them as non-null and refuse. The token fields themselves are also nulled out (`magicLinkToken: null`) to make replay logically impossible at the data layer, not just policy. |
| **Bot replay + brute force** | tightLimiter + per-email throttle + per-IP cooldown documented in §8. Token entropy = 256 bits; guessing-attack search space is intractable. |
| **CSRF** | All auth POSTs accept JSON-only bodies; no cookie auth (JWT is in `Authorization` header from localStorage). Standard JSON-API CSRF posture; no change. |
| **Open redirect on `/lookmax/login?token=`** | The token consume returns a JWT and the client navigates to a hardcoded `/lookmax/` — there is no user-supplied redirect target in the spec. Explicit non-feature. |

## 10. Feature flag plan

- **Flag:** `LOOKMAX_EMAIL_LOGIN` (env var, default `false`).
- **What it gates:**
  - `/api/lookmax/auth/request-link` returns `{ status: 'sent' }` but no-ops when off (mirrors current OTP dormancy pattern at `lookmax-auth.js:74-76`).
  - `/api/lookmax/auth/consume-link` returns the generic 401 when off.
  - `/api/lookmax/auth/exchange-first-login` returns 401 when off.
  - The webhook **still** mints `firstLoginToken` (so the data is there to opt-in mid-cohort), but if `LOOKMAX_EMAIL_LOGIN=false`, the `/api/payment/status` response omits the field.
  - `public/lookmax/login.html` renders the email form when the flag is on (read via a `/api/lookmax/auth/method` discovery endpoint returning `{ method: 'email' | 'otp' | 'admin-only' }`), and renders the legacy "OTP unavailable" admin-fallback when off. **Same file, conditional render — no separate page to maintain.**
- **Rollout sequence:**
  1. Merge code with `LOOKMAX_EMAIL_LOGIN=false` everywhere. No user-visible change. Smoke + Vitest pass.
  2. **Dogfood (founder + 2-3 friends with seeded user records):** set `LOOKMAX_EMAIL_LOGIN=true` in Render with `WHATSAPP_SEND_MODE=allowlist`. Resend will only send to `ADMIN_EMAIL` + `EMAIL_ALLOWLIST` — dogfooders must be on that allowlist. Founder runs the full flow on their own device (pay → email arrives → click → land in /lookmax/).
  3. **10% (or initial cohort):** flip `WHATSAPP_SEND_MODE=all` and `PAYWALL_PUBLIC=true` (founder-only flips). The flag stays on. Watch logs for `auth/request-link` request rate, `auth/consume-link` success rate, F1 auto-poll resolution times.
  4. **100%:** no separate flip — once the cohort behaviour holds for 48h, this IS 100%.
- **Rollback:** set `LOOKMAX_EMAIL_LOGIN=false`. Magic-link routes go dormant. Existing JWTs remain valid for their 24h TTL. New buyers still get `firstLoginToken` minted but cannot exchange it — they hit the admin-only login wall (i.e., we are back to today's pre-launch state for new buyers). **The rollback IS the gate to flipping `PAYWALL_PUBLIC=false`** in the same Render save.
- **When WhatsApp OTP eventually comes online (later milestone):** they coexist as alternative login surfaces. The `/api/lookmax/auth/method` discovery endpoint returns `{ methods: ['email', 'otp'] }`; login.html offers both ("Send entry link" or "Send WhatsApp code"). Email magic link remains the floor and the recovery surface; OTP becomes the preferred path for the WhatsApp-first user. **This spec does NOT replace OTP — it precedes it and outlasts it.**

## 11. Acceptance criteria

QA will run all of these against the build PR before merge. Each is binary pass/fail.

- [ ] A non-admin user (test phone not in `ADMIN_PHONES`) can complete the full happy path: pay → land on `/payment-confirmed` → silently arrive at `/lookmax/` with their data loaded, **with no manual login step**.
- [ ] After the above, refresh `/lookmax/` — the session persists (existing JWT works).
- [ ] In a fresh Incognito window, visit `/lookmax/` — bounced to `/lookmax/login` (no token).
- [ ] Enter the test user's email → `{status:'sent'}` returned in <500ms → email arrives in Resend test inbox within 60s containing a valid 32-hex token URL.
- [ ] Click the link in the email on a fresh device → land in `/lookmax/` with the same user's data.
- [ ] Manipulate the JWT in localStorage to point at a different `userId` → `/api/lookmax/me` returns 401 OR a user whose data does not match (whichever cleaner — verify by reading `lib/lookmax-auth.js` against current code: it verifies the JWT signature so a tampered token returns 401, and a token for a real user B does return B's data — **cross-user isolation is the JWT signature check + each route using `req.lookmaxUser.token` for the lookup**, both of which exist).
- [ ] Cannot consume the same magic link twice — second attempt returns `{ error: 'link expired or already used' }`.
- [ ] Cannot consume an expired magic link — same generic error.
- [ ] `/auth/request-link` with a non-existent email returns `{status:'sent'}` (no enumeration). No email actually sent. Log line written through the masking helper (no plaintext email in logs).
- [ ] `/auth/consume-link` hammered 11 times in 60s from one IP → 429 from tightLimiter on the 11th. After 3 failed valid-token attempts, the next 4 attempts return generic error even with a valid token (cooldown).
- [ ] `/auth/request-link` called 4 times for the same email in 15 min → all return `{status:'sent'}` but only the first 3 actually call `email.sendMagicLink` (verifiable via `__setTransport` test seam).
- [ ] When `RESEND_API_KEY` is unset, `/auth/request-link` returns `{status:'sent'}` and the DRY-RUN line is logged (no crash, no different response code).
- [ ] When `LOOKMAX_EMAIL_LOGIN=false`, `/api/lookmax/auth/request-link` POST returns the generic `{status:'sent'}` empty response and no email is sent.
- [ ] F1 (race) reproducible by manually delaying the webhook handler 5s: `/payment-confirmed` auto-polls and resolves silently within the 30s window.
- [ ] No PII (raw phone, raw email, magic-link token value) appears in any log line emitted by the new routes — verified by grepping the test log output.
- [ ] Smoke test (`npm run smoke`) passes with the flag on AND off.
- [ ] No locked copy is changed (CLAUDE.md §2 / §6.3). The only voice-bearing strings added are the §5 slots, all marked `[copy-consultant TBD]` + founder-approved before merge.
- [ ] Login fails closed if Resend is down for an extended period (verified by injecting a `throw` into the test transport): user sees `[copy-consultant TBD]` network-error copy and can retry; no JWT issued, no user state corrupted.

## 12. Out of scope

This spec explicitly does NOT cover the following. Each is a real concern, but bundling it expands the scope past the launch gate. They are tracked in `BACKLOG.md`.

- **WhatsApp OTP path** — left dormant exactly as today (`lookmax-auth.js:42-88` unchanged for OTP routes). When WhatsApp goes live + `WHATSAPP_OTP_ENABLED=true`, the OTP route resurrects automatically; the coexistence plan is documented in §10 but the OTP UI/wiring on login.html lives in a future spec.
- **Password recovery / change** — there are no passwords in this spec (admin password unchanged at `/admin-login`, that's separate). N/A.
- **Email-change-after-signup** — a paying user whose email was typo'd at checkout cannot self-recover. They contact support (manual reconciliation by founder via `/admin`). v2 needs an in-product flow with verification at both old + new addresses; tracked separately.
- **Phone-number change** — same as above; not addressed.
- **Social login (Google, Apple)** — explicit non-feature. Adds OAuth surface area + brand-voice burden + Indian-mobile-onboarding mismatch. Killed.
- **CAPTCHA on login** — see §8 rationale.
- **In-product subscription management / cancel** — audit P2-H, separate spec, blocked on roadmap.
- **Postgres migration** — landmine #1; required for `users.json` durability (F10) and for token-by-hash indexing at scale. Tracked in roadmap §2 dunning item. This spec **knows** it is built on ephemeral JSON and the F10 failure mode is accepted for the launch cohort; the durable fix is Postgres.
- **R2 photo lifecycle** — orthogonal compliance work (security BLOCKER #3).
- **Audit-completion login** (mint a session for a user who finished the audit but hasn't paid) — interesting but not on the gate. Out of scope.

## 13. Dependencies in order

Build cannot begin until **all** of these have landed (founder confirms in the build kickoff brief):

1. **`JWT_SECRET`** set in Render (FOUNDER_ACTIONS_THIS_WEEK.md item #5). Spec adds a startup guard that refuses to enable the flag if unset.
2. **`ADMIN_PASSWORD_HASH`** set in Render (item #6). Not directly used by this spec but is the upstream for the `lib/auth.js` fallback chain that `lib/lookmax-auth.js` falls through; with `JWT_SECRET` set explicitly the chain is bypassed, but we want the founder to have done #5 + #6 together as one Render sitting.
3. **`RESEND_API_KEY`** set in Render. **NEW** founder action — add as item #9 to `FOUNDER_ACTIONS_THIS_WEEK.md` in the same PR that opens the build. Resend itself takes ~30 min: sign up, verify the sending domain (`maincharacter.digitglobalservices.com`), grab the API key, paste in Render. No DLT-style external lead time.
4. **`RESEND_FROM_EMAIL`** set in Render (e.g., `consultant@maincharacter.digitglobalservices.com`). Implicit in #3 but listed for completeness.
5. **`ADMIN_EMAIL` + `EMAIL_ALLOWLIST`** set in Render for the dogfood window — dogfooders' emails go in `EMAIL_ALLOWLIST` so Resend will actually deliver under `WHATSAPP_SEND_MODE=allowlist` (`lib/messaging-mode.js:74-83`).
6. `RAZORPAY_WEBHOOK_SECRET` set (FOUNDER_ACTIONS item #4). The `firstLoginToken` mint happens inside `processPaymentEvent` — if the webhook signature fails because the secret is empty, no token is ever minted, and the entire happy path collapses to the F2 email-only fallback. **Hard dependency** for the silent first-login experience.
7. (Soft dependency — does not block build, blocks `PAYWALL_PUBLIC=true` flip) The whole §0 launch-prerequisite list in the roadmap, especially DPDPA legal text + photo deletion endpoints.

**Build is NOT blocked on:** Postgres, R2, ffmpeg, VAPID, WhatsApp Cloud API credentials, MSG91/DLT. This spec works against the current JSON store and the dormant WhatsApp/SMS channels by design.

## 14. Build estimate

| Track | Estimate |
|---|---|
| Autopilot hours (backend + frontend + tests + briefs follow-up) | ~10 hr |
| Founder hours (this week) | ~1.5 hr (Resend signup + domain verify + paste 2 env vars + 1 happy-path dogfood walkthrough + sign off the §5 copy slots) |
| Wall-clock days | **2 working days** end-to-end if Resend domain DNS verifies cleanly; +1 day if DNS propagation is slow. Build can start the moment dependency #1, #3, #4 land — #2, #5, #6, #7 can land in parallel. |

## 15. Kill criterion

**If this doesn't move "non-admin paying-Lookmaxxing-users who reach `/lookmax/` within 10 minutes of payment" from 0% (today's baseline) to ≥85% in the first 14 days post-launch, we remove it.**

The "remove it" path is to flip `LOOKMAX_EMAIL_LOGIN=false`, revert the paywall flip, and rebuild on a different auth model (likely SMS OTP if DLT approval lands by then, otherwise hold launch). The metric is instrumentable via NOW-0 (event sink): `subscription_activated` + `first_pwa_session_within_10min` ratio per user. If we cannot measure the metric (NOW-0 not built yet), this spec **does not ship** — instrumentation is a precondition of the kill check.

---

## Three briefs

Saved as:
- `briefs/design-login-gate.md`
- `briefs/backend-login-gate.md`
- `briefs/frontend-login-gate.md`

Each brief inherits this spec verbatim where relevant and re-states only the parts that agent owns.
