# MAINCHARACTER — NIGHT 3 AUTOPILOT PROMPT (Wati removal + Cloud API + SMS + Email + Paywall)

> **How to use this file.**
> Open `MainComponent` in VS Code. In the integrated terminal, run `claude --dangerously-skip-permissions`. Paste **everything between `===== BEGIN PASTE =====` and `===== END PASTE =====`** below as your first message. Hit Enter. Walk away.

---

## ===== BEGIN PASTE =====

You are the **acting CTO and sole engineer** of MainCharacter. The founder is asleep. You are running solo, on autopilot, for the next several hours. Read `CLAUDE.md` in full before anything else. Re-read sections 2 (brand voice), 4 (landmines), and 6 (rules of engagement) every time you start a new sub-task.

**Context — what shipped in Nights 1 + 2.**
- Night 1 (16 commits): auth hardening, webhook signature, prompt-injection guard, tests, CI, smoke, logger, rate limiting, helmet, idempotent enrol, `WATI_SEND_MODE` kill switch (currently `allowlist`).
- Night 2 (8 commits): Night-1 bug fixes (`START NOW` lexicon, Wati webhook signature), landing page → 2 pillars + Aura++ reveal section, free `/audit` funnel end-to-end with Gemini Vision 8-axis scoring, Razorpay Subscriptions backend + bundle math, webhook flips `oratorActive`/`lookmaxxingActive` per pillar.
- Deferred: P4.1 paywall page, P4.4 post-payment confirmation, P5-P11 (PWA shell, mirror, protocol, hair tracker, weekly reveal, Day-30, cross-sell), plus founder infra actions (Postgres, R2, VAPID, ffmpeg).
- Tests: 154 passing. Live `/health`: healthy. Production stable.

**New direction from the founder.** Wati is being removed entirely. The replacement is:
- **WhatsApp Cloud API direct from Meta** for the Orator product channel (waiting on founder's Meta Business Manager setup; access token + phone number ID + WABA ID will be provided as env vars later).
- **MSG91** for SMS OTP (Lookmaxxing PWA login) and SMS fallback.
- **Resend** for email (audit receipts, Day-7 reports, weekly reveal notifications).

Your single objective for tonight:

> **Cleanly rip out the entire Wati integration, replace it with a Meta WhatsApp Cloud API service (waiting for credentials), wire MSG91 SMS and Resend email as the immediate launch channels, ship the deferred paywall + payment-confirmed pages so the revenue loop closes, and deploy to `https://maincharacter.digitglobalservices.com` with no broken funnels and no real outbound messages to anyone except `ADMIN_PHONE`.**

You will not finish everything. Execute the priority order. Commit after every meaningful step. Push to `main`. The founder will wake up to `git log --oneline | head -50` and `PROGRESS.log`.

---

## AUTOPILOT RULES (identical to Nights 1 + 2)

1. **Do not stop voluntarily.** Finish the current task, then move to the next.
2. **TRUE BLOCKER** = missing secret with no test/sandbox alternative, external service needing human action, destructive action that loses existing user data. Anything else: decide and proceed.
3. Decisions go to `DECISIONS.md` with 2-sentence rationale.
4. **Conventional Commits**, push after every change.
5. **Write the test first.** Vitest. ≥70% coverage on every new module.
6. **Run `npm test && npm run smoke` before every commit.** Fix before committing if red.
7. **Never break a working feature.** Feature flags default OFF for risky additions.
8. **No invented user-facing copy.** Use `// TODO copy review`. Surface in `BACKLOG.md → COPY REVIEW QUEUE`.
9. **Never weaken security.**
10. **`WHATSAPP_SEND_MODE` stays `allowlist`** (renamed from `WATI_SEND_MODE`). All new outbound user comms respect this. Only `ADMIN_PHONE` receives real messages during P-final verification. SMS and email follow the same `allowlist` semantics — only `ADMIN_PHONE` and `ADMIN_EMAIL` receive real sends until founder flips `allowlist → all`.
11. **Status updates.** One line per priority block to `PROGRESS.log` with ISO timestamp + commit subject.
12. **Token budget.** Read in slices, prefer Grep/Glob, reuse existing modules (`User`, `gemini`, `razorpay`, `lib/log`, `lib/auth`).

---

## PRODUCT DECISIONS ALREADY MADE (encode into DECISIONS.md on first run)

1. **Wati is OUT.** Delete `services/wati.js`, remove `WATI_*` env vars from `.env.example` / `render.yaml` / docs. Do NOT keep Wati as a fallback provider; the founder explicitly does not want it.
2. **WhatsApp = Meta Cloud API directly.** New service `services/whatsapp.js` uses Meta Graph API v18.0. Service is DORMANT until env vars are present — if `WHATSAPP_ACCESS_TOKEN` is empty, the service logs `[whatsapp] DRY-RUN — credentials not configured` and returns a stub success. This keeps the code path live for tests without sending real messages.
3. **SMS = MSG91.** New service `services/sms.js`. Used for Lookmaxxing PWA OTP. DRY-RUN if `MSG91_AUTH_KEY` empty.
4. **Email = Resend.** New service `services/email.js`. Used for paywall receipts, Day-7 Evolution Report HTML, audit confirmation, weekly reveal notifications. DRY-RUN if `RESEND_API_KEY` empty.
5. **Renaming.** `WATI_SEND_MODE` → `WHATSAPP_SEND_MODE`. Same semantics (`all` / `allowlist` / `off`). On boot, if `WATI_SEND_MODE` is set but `WHATSAPP_SEND_MODE` is not, mirror the value into the new var and log a deprecation notice. Remove the legacy var from `render.yaml` and `.env.example`.
6. **Webhook endpoints.** `/api/webhook/wati` → renamed to `/api/webhook/whatsapp`. Keep `/api/webhook/wati` as a redirect (HTTP 308 → new endpoint) for 30 days so any cached Wati webhook config doesn't 404. Delete after the 30-day window via a tracked `BACKLOG.md` item.
7. **Webhook signature.** Meta signs with `x-hub-signature-256` (HMAC-SHA256 of body using app secret). Replace the existing Wati signature verification with this. Until `WHATSAPP_APP_SECRET` is set, accept unsigned webhooks and log a startup warning (same pattern as Night-1 Wati signature handling).
8. **Number 9958533994.** The founder is keeping the same phone number. They're moving it from Wati to their own Meta Business Manager. Code should treat the number as-is, no migration needed in DB.
9. **Render env vars to add (founder must paste once Meta is approved):**
   - `WHATSAPP_ACCESS_TOKEN` (Meta system user token)
   - `WHATSAPP_PHONE_NUMBER_ID` (Meta phone number ID)
   - `WHATSAPP_BUSINESS_ACCOUNT_ID` (Meta WABA ID)
   - `WHATSAPP_APP_SECRET` (Meta app secret for webhook signature)
   - `WHATSAPP_VERIFY_TOKEN` (random string used during Meta webhook verification handshake — generate a UUID and document)
   - `MSG91_AUTH_KEY`
   - `MSG91_TEMPLATE_ID_OTP` (the DLT-approved OTP template ID)
   - `MSG91_SENDER_ID` (6-letter sender ID, e.g., `MAINCH`)
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (e.g., `consultant@maincharacter.digitglobalservices.com`)
   - `ADMIN_EMAIL` (founder's email for admin alerts)
10. **No PWA work tonight.** P5-P11 from V2 (PWA shell, mirror, protocol, etc.) are still deferred. Tonight is channel migration + closing the revenue gap, nothing more.

---

## PRIORITY ORDER (execute top-to-bottom)

### P0 — Pre-flight & continuity (~20 min)

P0.1 — Read `CLAUDE.md`, `BACKLOG.md`, `DECISIONS.md`, `PROGRESS.log`. Run `git log --oneline | head -30` to confirm Nights 1+2 are intact. Run `npm test && npm run smoke`. Both must pass.

P0.2 — Append the 10 decisions above to `DECISIONS.md` under a new section `## Night 3 channel migration decisions`.

P0.3 — Install new dependencies: `npm install resend` (web-push, sharp, @aws-sdk/client-s3 wait for V4 PWA work — do not install tonight unless any existing test imports them).

P0.4 — Update `BACKLOG.md → FOUNDER ACTIONS REQUIRED` with the new env vars from decision #9. Add a top section `## NIGHT 3 — FOUNDER ACTIONS (in this order):` with the operational checklist:
- [ ] Cancel Wati subscription in Wati dashboard.
- [ ] Free up phone number 9958533994 (delete WhatsApp Business App from phone if installed; wait 24h).
- [ ] Create personal Meta Business Manager at business.facebook.com.
- [ ] Create new WhatsApp Business Account inside it (display name: MainCharacter, category: Education).
- [ ] Add phone 9958533994 to that WABA.
- [ ] Wait for display name approval (24-72h).
- [ ] Generate system user access token with whatsapp_business_messaging + whatsapp_business_management permissions.
- [ ] Note: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID.
- [ ] Submit message templates for re-approval: welcome, day_one_morning, day_n_morning, evolution_report_ready, payment_confirmation, subscription_paused (same copy as Wati versions).
- [ ] Sign up for MSG91 at msg91.com, prepaid wallet ₹500, get auth key + DLT-approved OTP template ID.
- [ ] Sign up for Resend at resend.com, verify sending domain (maincharacter.digitglobalservices.com — add DNS records: SPF, DKIM).
- [ ] Paste all 11 new env vars into Render.
- [ ] Run smoke test: send an OTP to ADMIN_PHONE; confirm receipt.
- [ ] Flip WHATSAPP_SEND_MODE=all when ready to send to real users.

Commit P0. Push.

---

### P1 — Remove Wati from the codebase (~45 min)

P1.1 — **Delete `services/wati.js`.** Search the whole repo for `require.*wati` and `import.*wati`. Replace each with the new `services/whatsapp.js` interface (defined in P2).

P1.2 — **Remove WATI_* env vars** from `.env.example`. Mark them deprecated in a note at the top: `# WATI_* env vars removed in Night 3 migration. See DECISIONS.md.`. Keep `WATI_SEND_MODE` reading behavior in code for the 30-day deprecation window (decision #5).

P1.3 — **Update `render.yaml`** to remove WATI_* keys. Add the new keys (WHATSAPP_*, MSG91_*, RESEND_*) marked `sync: false`.

P1.4 — **Rename `WATI_SEND_MODE` → `WHATSAPP_SEND_MODE`** throughout the codebase. Add a compatibility shim in `server.js`: `process.env.WHATSAPP_SEND_MODE ||= process.env.WATI_SEND_MODE || 'allowlist'`. Log a deprecation warning at boot if only the old var is set.

P1.5 — **Update `/health` endpoint** to report the new mode + provider name: `messaging: { provider: 'whatsapp-cloudapi', mode: 'allowlist' }`.

P1.6 — **Remove Wati from `WATI_SETUP_MANUAL.md`** — replace contents with a banner: `# DEPRECATED — Wati was removed in Night 3 migration. See WHATSAPP_CLOUD_API_SETUP.md for the new setup.` (Create the new doc in P2.6.)

P1.7 — **Tests.** Update all existing tests that mocked `services/wati` to mock `services/whatsapp` instead. The interface is identical (`sendMessage`, `sendMessageSafe`, `sendTemplateMessage`), so most tests just need the import path updated.

Commit each P1 step. Push.

---

### P2 — Build WhatsApp Cloud API service (~1.5 hr) — DORMANT until credentials set

P2.1 — **`services/whatsapp.js` — public interface (identical to old Wati service for backward compatibility):**
```js
module.exports = {
  sendMessage(phone, text),          // free-form text within 24h session window
  sendMessageSafe(phone, text),      // wraps sendMessage with 1 retry + DRY-RUN handling
  sendTemplateMessage(phone, templateName, params), // outside 24h window
  verifyWebhookSignature(body, signature), // x-hub-signature-256
  verifyWebhookChallenge(mode, token, challenge),   // Meta's GET-handshake on first webhook attach
};
```

P2.2 — **Implementation.** Internally use Meta Graph API v18.0:
- Send: `POST https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with body `{ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }` and `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}`.
- Template send: same endpoint, body `{ messaging_product: 'whatsapp', to: phone, type: 'template', template: { name, language: { code: 'en' }, components: [...] } }`.
- Signature verify: `crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(rawBody).digest('hex')`, compare to `x-hub-signature-256` header (after stripping `sha256=` prefix).
- Challenge verify: when `req.query['hub.mode'] === 'subscribe'` and `req.query['hub.verify_token'] === WHATSAPP_VERIFY_TOKEN`, respond with `req.query['hub.challenge']`.

P2.3 — **DRY-RUN mode** — if any of `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` are empty: every send-method logs `[whatsapp] DRY-RUN — credentials not configured. Would have sent to {phone}: {text.slice(0,80)}...` and returns a stub `{ result: 'dry-run' }`. This is the default state on prod tonight (because founder hasn't pasted credentials yet) — no errors, no real sends.

P2.4 — **Send-mode guard.** Before any send, check `WHATSAPP_SEND_MODE`:
- `off` → log + return stub, no send.
- `allowlist` → only send if `phone === ADMIN_PHONE` else log + return stub.
- `all` → send normally.

P2.5 — **Webhook handler refactor.** In `routes/api.js`, the existing `POST /api/webhook/wati` becomes `POST /api/webhook/whatsapp`. Keep `/api/webhook/wati` as `app.use('/api/webhook/wati', (req, res, next) => { res.redirect(308, '/api/webhook/whatsapp'); })`. The new handler:
- For `GET /api/webhook/whatsapp` → run `verifyWebhookChallenge`.
- For `POST /api/webhook/whatsapp` → verify signature, parse Meta's payload format (`entry[0].changes[0].value.messages[0]` for incoming user messages; ignore status updates `entry[0].changes[0].value.statuses`), route the message to the same Orator command handlers (`handleStartNow`, `handleDailyResponse`, etc.).

P2.6 — **Doc:** create `WHATSAPP_CLOUD_API_SETUP.md` at repo root describing the operational steps (mirror of what's in BACKLOG.md FOUNDER ACTIONS but as a standalone reference doc).

P2.7 — **Tests.** Mock `axios.post` / `node-fetch`. Unit tests for: send (success, retry-on-fail-then-succeed, double-fail), template send, signature verify (good + bad + missing secret), challenge verify, send-mode allowlist gating, DRY-RUN when credentials missing.

Commit each. Push.

---

### P3 — MSG91 SMS service (~45 min) — ACTIVE for OTP

P3.1 — **`services/sms.js`:**
```js
module.exports = {
  sendOtp(phone, otp),               // sends a DLT-approved OTP template via MSG91
  sendSms(phone, message),           // generic SMS, DLT-approved template only
  generateOtp(),                     // returns a 6-digit string
};
```

P3.2 — **Implementation.** MSG91 API endpoint `https://control.msg91.com/api/v5/otp` with headers `authkey: {MSG91_AUTH_KEY}`, query params `template_id`, `mobile`, `otp`. For free-form SMS: `POST https://control.msg91.com/api/v5/flow` with template ID + variables.

P3.3 — **DRY-RUN** if `MSG91_AUTH_KEY` empty — same pattern as P2.3.

P3.4 — **Send-mode guard** — reuses `WHATSAPP_SEND_MODE` (the variable is now generic "messaging mode", not WhatsApp-specific; rename internally to `MESSAGING_SEND_MODE` if cleaner — log decision either way).

P3.5 — **Tests.** Mock MSG91. Unit tests for OTP send, SMS send, allowlist gating, DRY-RUN.

P3.6 — **Wire to Lookmaxxing OTP login.** The PWA OTP login flow that Night 2 deferred is still deferred to V4. Tonight just ship the SMS service so V4 can call it. No new routes wired tonight.

Commit each. Push.

---

### P4 — Resend email service (~45 min) — ACTIVE for receipts + reports

P4.1 — **`services/email.js`:**
```js
module.exports = {
  sendEmail({ to, subject, html, text, replyTo }),  // generic
  sendPaywallReceipt({ user, plan, subscriptionId }),
  sendAuditConfirmation({ user, auditSessionToken }),
  sendDay7EvolutionReport({ user }),
};
```

P4.2 — **Implementation.** Use the `resend` Node SDK: `const { Resend } = require('resend'); const resend = new Resend(RESEND_API_KEY); await resend.emails.send({ from: RESEND_FROM_EMAIL, to, subject, html, text });`.

P4.3 — **DRY-RUN** if `RESEND_API_KEY` empty.

P4.4 — **HTML templates.** Create `data/email-templates/` directory with:
- `paywall-receipt.html` — Consultant voice, confirms the plan + amount + dashboard link.
- `audit-confirmation.html` — sent immediately after audit completion to the email if provided; contains a magic link to view the audit result page (`/audit/result/:sessionToken`) so the user can return later.
- `day7-evolution-report.html` — HTML version of the Orator's Day-7 report, with the score table rendered as a clean table, lexicon as gold pills, and a CTA back to `/upgrade`.
- All templates use inline CSS, dark obsidian background, gold accents, Cormorant Garamond + Sora fonts via Google Fonts. Mark every piece of new copy with `// TODO copy review`.

P4.5 — **Wire post-payment email.** In the Razorpay webhook handler (`subscription.activated`), if `user.email` is present, call `sendPaywallReceipt`. Test with a mocked Razorpay event.

P4.6 — **Tests.** Mock Resend. Unit tests for each email function, template rendering, DRY-RUN, allowlist gating (use `ADMIN_EMAIL`).

Commit each. Push.

---

### P5 — Ship the deferred paywall page (~45 min)

P5.1 — **`public/paywall.html`.** Standalone page mounted at `GET /paywall` in `server.js`. Reads URL params: `auditSessionToken`, `intent` (optional, for cross-sell context). Three cards side-by-side on desktop, stacked on mobile.
- **Card 1 — The Orator**, ₹799/mo, 5 bullets: Daily WhatsApp Protocol, Weekly Evolution Reports, Unlimited Consultant access, Rank progression, Voice or text both work.
- **Card 2 — Lookmaxxing**, ₹1,499/mo, 5 bullets: Daily Mirror Score, Personalised Protocol, Hair Receding Tracker, Weekly Reveal video, Day-30 Re-Audit.
- **Card 3 — Aura++** (gold border, "Most chosen" eyebrow tag), ₹1,999/mo, "Both pillars · Saves ₹299/mo", 6 bullets: everything from both cards + Founder access to The Consultant chat (mark with `// TODO copy review`).
- All copy in the Consultant voice. No emojis except `◆`. No exclamation marks.
- Each card's CTA: `Begin →` button that POSTs to `/api/payment/subscribe`.

P5.2 — **Phone + email collection.** Below the cards, a thin form: phone (required, validated as 10-digit Indian mobile, normalised to `91XXXXXXXXXX`), email (optional but encouraged), name (required). On Begin click: validate, POST to `/api/payment/subscribe` with `{ planKey, phone, name, email, auditSessionToken }`, receive `{ subscriptionUrl }`, `window.location.href = subscriptionUrl`.

P5.3 — **Backend update.** `POST /api/payment/subscribe` already exists from Night 2; verify it handles all three plan keys (`orator-monthly-799`, `lookmaxxing-monthly-1499`, `aura-plus-monthly-1999`) and creates/upserts a User with the right pending flags. If the user already exists (same phone), update their record with email + name + audit link rather than creating a duplicate.

P5.4 — **Audit → paywall handoff.** In `/audit` scene 7 (paywall transition from Night 2's P3), redirect to `/paywall?auditSessionToken={token}`. The paywall page calls `GET /api/audit/result/:auditSessionToken` to show a 1-line summary at the top: `"Your Aura Score: 67/100. Skin clarity is your leverage point."` (composed from the audit result).

P5.5 — **Tests.** Snapshot the paywall HTML structure. Test the form submission flow end-to-end with mocked Razorpay. Test the audit→paywall handoff for valid + expired sessionTokens.

Commit each. Push.

---

### P6 — Ship the post-payment confirmation page (~30 min)

P6.1 — **`public/payment-confirmed.html`.** Mounted at `GET /payment-confirmed` in `server.js`. Reads URL params from Razorpay's callback: `razorpay_payment_id`, `razorpay_subscription_id`, `razorpay_signature` (when applicable). Page shows:
- Big serif headline in The Consultant voice: `"The Chamber is open, {name}. ◆"` (name from the user record if logged in; else "Seeker").
- 3-step "what happens next":
  1. If `oratorActive` is now true (or pending → soon to be active): `"Your first message arrives tomorrow morning at your preferred time."`
  2. If `lookmaxxingActive` is true (or pending): `"Open the mirror at /lookmax/ — your daily ritual begins tomorrow morning."` (with "Install the app" CTA — PWA install prompt button, even though PWA full build is Night 4).
  3. If Aura++ active: both of the above.
- A receipt summary (amount, plan, next billing date).
- Footer: `"◆ MainCharacter"`.

P6.2 — **Backend verification.** On page load, the frontend calls `GET /api/payment/status?subscriptionId=...` which verifies the signature, looks up the User by subscription ID, returns `{ name, plan, oratorActive, lookmaxxingActive, nextBillingDate, amount }`. If signature invalid or subscription not found, show a graceful error: `"Your payment is being verified. Please refresh in a moment, or contact support@maincharacter.digitglobalservices.com."`

P6.3 — **Trigger confirmation emails.** When the Razorpay webhook flips a user's `*Active` flag to true, queue `sendPaywallReceipt` via the email service. Already wired in P4.5; verify it fires.

P6.4 — **First Orator message scheduling.** If `oratorActive` becomes true and the user has not yet received any morning message, set `user.day = 0`, `awaitingResponse = false`, and let the existing scheduler send Day 1 at their preferred time tomorrow. Add a unit test for this transition.

P6.5 — **Tests.** Snapshot the confirmation page structure. Test the status endpoint for valid + invalid signatures. Test the first-Orator-message scheduling trigger.

Commit each. Push.

---

### P7 — Update CLAUDE.md and other docs (~20 min)

P7.1 — **CLAUDE.md** — section 5 (env vars table): remove WATI_* rows, add WHATSAPP_*, MSG91_*, RESEND_*, ADMIN_EMAIL. Update section 3 (architecture) — replace "Wati API" mentions with "WhatsApp Cloud API (Meta)". Update section 4 (landmines) — remove "Wati requests are not signature-verified" item (now handled), add new landmine: "WhatsApp number 9958533994 is in transition from Wati to Meta — until founder completes Meta setup, all outbound WhatsApp falls through to DRY-RUN mode."

P7.2 — **README.md** — if it exists, update with the new channel matrix. If not, create one — 1-page overview of: what MainCharacter is, how to run locally, environment, deploy. Aim at the next engineer.

P7.3 — **RUNBOOK.md** — add new sections:
- "How to flip WhatsApp from DRY-RUN to live" — paste the 4 WhatsApp env vars into Render, run `curl /health` to confirm provider state, send a test message via `/api/admin/send-message` to ADMIN_PHONE.
- "How to test MSG91 OTP without spending money" — use the `/api/admin/test-sms` admin route (create it in P3 if not already).
- "How to roll back to Wati if Cloud API fails" — answer: Wati is gone, cannot roll back. The fallback during Cloud API issues is to flip `WHATSAPP_SEND_MODE=off` and rely on email + SMS until Meta is back.

P7.4 — **BACKLOG.md** — move all Wati-related items to `## ARCHIVED — WATI (removed Night 3)` section. Add the Night-3 founder action list (already in P0.4).

Commit. Push.

---

### P8 — Deploy + verify live (~30 min)

P8.1 — `npm test`. All 154+ tests green (will be more like 200+ after this run).
P8.2 — `npm run smoke`. Green.
P8.3 — Push to `main`. Render auto-deploys.
P8.4 — `curl https://maincharacter.digitglobalservices.com/health | jq` — verify:
- `status: healthy`
- `messaging.provider: "whatsapp-cloudapi"`
- `messaging.mode: "allowlist"`
- `messaging.configured: false` (because credentials aren't set yet — this is expected and correct)
- `config.sms.configured: false`
- `config.email.configured: false`
- `config.razorpay: true`

P8.5 — **Verify the revenue funnel renders end-to-end:** `curl https://maincharacter.digitglobalservices.com/audit` returns the audit page HTML. `curl https://maincharacter.digitglobalservices.com/paywall` returns the paywall HTML.

P8.6 — **Verify Wati endpoints are properly retired:** `curl -X POST https://maincharacter.digitglobalservices.com/api/webhook/wati -d '{}'` returns a 308 redirect to `/api/webhook/whatsapp`.

P8.7 — Final commit: `chore: end of night-3 autopilot run — Wati removed, Cloud API + SMS + Email + paywall shipped, see PROGRESS.log`.

P8.8 — DM the founder a single WhatsApp message to ADMIN_PHONE summarising the run — but wait, WhatsApp is in DRY-RUN. Instead: write the digest to `PROGRESS.log` as the final entry, AND to a new file `MORNING_DIGEST.md` at repo root for the founder to read.

---

## OUTPUT FORMAT FOR `PROGRESS.log`

Same as Nights 1+2:
```
[2026-05-27T22:14:00Z] P0.1 done — Nights 1+2 verified, 154 tests green. Commit: chore(night3): pre-flight checks
[2026-05-27T22:31:00Z] P1.1 done — services/wati.js deleted, callers migrated. Commit: refactor(messaging): remove Wati integration
...
```

---

## IF YOU FINISH WITH TIME LEFT

Do NOT begin V4 PWA work without a fresh prompt. Instead:

1. Increase test coverage on `services/whatsapp.js`, `services/sms.js`, `services/email.js` toward 90%.
2. Add JSDoc to every new exported function.
3. Write a 1-page `WHATSAPP_CLOUD_API_SETUP.md` if not done in P2.6.
4. Add a small `/admin/messaging` page on the admin dashboard showing: current provider, current mode, last 20 outbound messages (dry-run + real, with timestamps), last 20 inbound webhooks.

Begin now. Read `CLAUDE.md` first.

## ===== END PASTE =====
