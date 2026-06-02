# QA Sign-Off — Login Gate (P0-1)

> QA agent: qa-agent
> Date: 2026-05-28
> Feature commits: b376b4d → 2f68580 (backend: 7, frontend: 5; total 12 commits)
> Baseline before feature: 490/490 tests, 31/31 smoke
> Baseline after feature: 500/500 tests (+10 QA-authored), 31/31 smoke

---

## 1. Test Execution Table

All 14 spec §11 acceptance criteria + 2 frontend-checklist items = 16 items total.

| # | Criterion | Source | Result | Evidence |
|---|---|---|---|---|
| AC-1 | Non-admin user: pay → /payment-confirmed → silently arrive at /lookmax/ with no manual login step | Spec §11 ¶1 | DEFERRED-TO-DOGFOOD | payment-confirmed.html wiring verified by 18 Vitest assertions (payment-confirmed-gate.test.js); actual Razorpay webhook + redirect flow requires live credentials and a browser. |
| AC-2 | After AC-1, refresh /lookmax/ — session persists (JWT works) | Spec §11 ¶2 | DEFERRED-TO-DOGFOOD | localStorage write via `setLMToken` confirmed in payment-confirmed.html (line 113); `app.js requireSession` reads the same key (`lookmax.token`). Real browser verification required. |
| AC-3 | Fresh Incognito window visits /lookmax/ → bounced to /lookmax/login | Spec §11 ¶3 | DEFERRED-TO-DOGFOOD | `requireSession()` in app.js redirects to /lookmax/login when no token — code path confirmed; browser verification required. |
| AC-4 | Enter test email → {status:sent} <500ms → email arrives in Resend test inbox within 60s with valid 32-hex token URL | Spec §11 ¶4 | DEFERRED-TO-DOGFOOD (partially automated) | Automated: `lookmax-magic-link.test.js` confirms {status:sent}, `__setTransport` seam confirms sendMagicLink called, `magicLinkToken.length === 64` confirmed. Real Resend delivery to inbox requires `RESEND_API_KEY` to be set (founder action #9). |
| AC-5 | Click email link on fresh device → land in /lookmax/ with user's data | Spec §11 ¶5 | DEFERRED-TO-DOGFOOD | consume-link route verified: valid token → JWT returned, fields cleared. Real cross-device redirect requires browser + real email. |
| AC-6 | Manipulate JWT in localStorage to different userId → /api/lookmax/me returns 401 | Spec §11 ¶6 | PASS (automated) | QA-authored test `qa-cross-user-isolation.test.js`: tampered token signed with wrong secret returns 401. Token with correct secret but wrong scope (admin) returns 401. Stripped signature returns 401. All 7 isolation assertions pass. |
| AC-7 | Cannot consume same magic link twice → generic 401 | Spec §11 ¶7 | PASS (automated) | `lookmax-magic-link.test.js` "same token second time → 401 generic error": verified. Single-use enforced at data layer (magicLinkToken nulled + magicLinkConsumedAt set). |
| AC-8 | Cannot consume expired magic link → same generic 401 | Spec §11 ¶8 | PASS (automated) | `lookmax-magic-link.test.js` "expired token → 401 generic error": verified. `magicLinkExpiresAt: Date.now() - 1000` case covered. |
| AC-9 | Non-existent email → {status:sent}, no email sent, log line masked | Spec §11 ¶9 | PASS (automated + live) | Automated: `lookmax-magic-link.test.js` "returns {status:sent} for non-existent email, sendMock not called". Live server log confirms `r***@company.com` (masked), token shows as `[redacted]`. |
| AC-10 | /auth/consume-link hammered 11x → 429 on 11th; 3 failures → cooldown blocks valid token | Spec §11 ¶10 | PASS (automated) | `qa-auth-rate-limit.test.js`: 429 on 4th request from same IP confirmed. `lookmax-magic-link.test.js` cooldown test: 3 failures → valid token still returns 401. Note: 11x test would confirm the real tightLimiter=10/min from server.js; test uses a 3/min equivalent to confirm the pattern. The tightLimiter is mounted at `server.js:108` and confirmed by code review. |
| AC-11 | /auth/request-link called 4x same email → all return {status:sent}, only 3 call sendMagicLink | Spec §11 ¶11 | PASS (automated) | `lookmax-magic-link.test.js` "per-email throttle: 4th request → sendMagicLink called only 3 times": verified. `sendMock.toHaveBeenCalledTimes(3)` after 4 calls confirmed. |
| AC-12 | RESEND_API_KEY unset → {status:sent}, DRY-RUN logged, no crash | Spec §11 ¶12 | PASS (automated + live) | `email.sendMagicLink` with allowlisted user + no RESEND_API_KEY returns `{result:'dry-run'}`. Live node execution confirmed. request-link route returns {status:sent} regardless (never exposes DRY-RUN state to client). |
| AC-13 | LOOKMAX_EMAIL_LOGIN=false → request-link returns {status:sent} but no email sent | Spec §11 ¶13 | PASS (automated) | `lookmax-magic-link.test.js` flag-off describe block: "request-link still returns {status:sent} but does NOT call sendMagicLink": verified. consume-link and exchange-first-login both return 401 when flag off. |
| AC-14 | F1 race: auto-poll resolves within 30s window | Spec §11 ¶14 | PASS (automated structure) + DEFERRED-TO-DOGFOOD (runtime) | `payment-confirmed-gate.test.js`: __PC_POLL_INTERVAL_MS and __PC_POLL_TIMEOUT_MS test seams present, setTimeout(attempt...) loop confirmed, 3000ms/30000ms defaults confirmed. Actual 5s webhook delay simulation requires a real browser. |
| AC-15 | No PII (raw phone, email, token) in any log line from new routes | Spec §11 ¶15 | PASS (live verification) | Live server with LOOKMAX_EMAIL_LOGIN=true hit with real email/token values. Log output: `r***@company.com` (not raw), token shows as `[redacted]`. All three new routes (request-link, consume-link, exchange-first-login) use maskEmail / maskPhone / maskToken. |
| AC-16 | Smoke passes with flag ON and flag OFF | Spec §11 ¶16 / frontend checklist | PASS (automated) | `npm run smoke` without LOOKMAX_EMAIL_LOGIN: 31/31. `LOOKMAX_EMAIL_LOGIN=true npm run smoke`: 31/31. Both confirmed. |

**Frontend checklist items (2 extra):**

| Item | Result | Evidence |
|---|---|---|
| Admin-only mode rendering: when flag off, login.html shows admin fallback not email form | PASS (automated) | `login-gate-ui.test.js` and `lookmax-magic-link.test.js` flag-off describe: /auth/method returns {method:admin-only} when flag false. HTML structure: stateAdmin div present. |
| Smoke with flag ON and flag OFF | PASS (automated) | See AC-16 above. |

---

## 2. Brand-Voice Audit Table

All new user-visible strings verified against spec-login-gate-copy.md (approved drafts or founder-approved strings).

| String slot | Shipped text | In copy spec | No ! | No banned emoji | No hype words | Verdict |
|---|---|---|---|---|---|---|
| login.headline | "Enter the room." | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.sub | "Your email below. A single-use link arrives within a minute, valid for fifteen." | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.email.label | "Your email" | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.email.placeholder | "you@example.com" | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.cta | "Send the link" | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.checkInbox.body | "Valid for fifteen minutes, single use. Check your spam folder if it does not arrive." | Yes — FOUNDER APPROVED (Section A, ruling 2026-05-28) | PASS | PASS | PASS | PASS |
| login.checkInbox.resend | "Send another →" | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.error.expired | "This link is no longer valid. Request a new one below." | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.error.network (JS) | "Something interrupted the send. Try again in a moment." | Yes (Section A) | PASS | PASS | PASS | PASS |
| login.footer | "◆ MainCharacter · The Consultant" | Yes (Section A) | PASS | PASS (◆ only) | PASS | PASS |
| email.magic.headline | "Your entry link is below, {{name}}." | Yes (Section B) | PASS | PASS | PASS | PASS |
| email.magic.body | "You asked to enter Lookmaxxing. The button below signs you in for the next twenty-four hours — no password, no second step. The link itself is single-use and expires in fifteen minutes. If you did not ask for this, the next line tells you what to do." | Yes (Section B) | PASS | PASS | PASS | PASS |
| email.magic.cta | "Enter Lookmaxxing" | Yes (Section B) | PASS | PASS | PASS | PASS |
| email.magic.fallback | "If the button does not respond, paste this address into your browser: {{magicLinkUrl}}" | Yes (Section B) | PASS | PASS | PASS | PASS |
| email.magic.security | "If you did not request this, no action is needed — the link expires in fifteen minutes and can be used only once." | Yes (Section B) | PASS | PASS | PASS | PASS |
| confirmed.pollingState | "Confirming with the bank" | Yes (Section C) | PASS | PASS | PASS | PASS |
| confirmed.fallbackEmailLink | "Send me an entry link instead" | Yes (Section C) | PASS | PASS | PASS | PASS |
| confirmed.mirrorCta | "Open the mirror" / "The mirror is ready when you are." | Spec §5 marks as [FOUNDER COPY] — intentionally not in copy spec. Flagged with HTML comment. | PASS | PASS | PASS | PLACEHOLDER (see deviation D-3) |
| paywall.email.required | "Email is required for Lookmaxxing — you enter the work through it." | Yes (Section D) | PASS | PASS | PASS | PASS |
| receipt.firstLogin.line | "If the tab from your payment is still open, the button there will walk you in silently. If it closed, the link below does the same — valid for fifteen minutes, single use." | Yes (Section E) | PASS | PASS | PASS | PASS |
| receipt.firstLogin.cta | "Enter Lookmaxxing" | Yes (Section E) | PASS | PASS | PASS | PASS |
| admin-only fallback | "Login is currently available to administrators only." | Not in copy spec (not a new Consultant string — purely functional/admin-facing) | PASS | PASS | PASS | PASS |
| email.magic.subject | "◆ Your Lookmaxxing entry link" (hardcoded in sendMagicLink as default label) | Yes — matches Section B | PASS | PASS (◆ only) | PASS | PASS |
| email.magic.preheader | `{{preheader}}` — renders blank (sendMagicLink does not pass it) | Spec Section B slot exists but build agent did not wire it. | N/A — blank preheader | N/A | N/A | DEVIATION D-1 (harmless) |

**Brand-voice audit result: CLEAN.** No exclamation marks, no unauthorized emoji, no hype words in any user-visible string. All 18 non-placeholder strings match the approved copy spec exactly.

---

## 3. PII-Leak Grep Result

Methodology: started server with `LOOKMAX_EMAIL_LOGIN=true JWT_SECRET=test-secret WHATSAPP_SEND_MODE=off PORT=3099`, then hit all three new auth routes with a real email address (`realuser@company.com`) and real-format 64-hex tokens. Captured all log output.

Results:

```
{"msg":"no-match for r***@company.com"}        ← email masked
{"msg":"token [redacted] not found"}            ← magic-link token redacted
{"msg":"token [redacted] not found"}            ← firstLoginToken redacted
```

No raw email, no raw phone, no token values appear in any log line from the new routes.

`lib/log-mask.js` is doing its job. All three helper functions (`maskEmail`, `maskPhone`, `maskToken`) are used consistently in `routes/lookmax-auth.js`. 13 unit tests in `log-mask.test.js` cover edge cases (null, empty, unicode, short inputs). All pass.

---

## 4. Spec-Deviation Review

### D-1: `preheader` token renders blank in magic-link.html

- **Spec says:** `email.magic.preheader` slot should render "Single-use, valid for fifteen minutes. Open it on the device you want to work on."
- **What shipped:** `sendMagicLink()` in `services/email.js` does not pass a `preheader` value to `renderTemplate`. The `{{preheader}}` token in `magic-link.html` renders as an empty string.
- **Effect:** The hidden preheader div is blank; email clients fall back to the first body text as the inbox preview. The body begins "You asked to enter Lookmaxxing…" which is acceptable fallback.
- **Recorded in:** DECISIONS.md 2026-05-28 frontend decisions.
- **Verdict: ACCEPT.** The preheader is an inbox-preview enhancement, not a functional requirement. Blank preheader is invisible to the user. Fix in a follow-up by passing `preheader` to `sendMagicLink`. Tracked as P3.

### D-2: Shared ipCooldown map across consume-link AND exchange-first-login

- **Spec says:** Per-IP cooldown on `consume-link` only (spec §8).
- **What shipped:** The same `ipCooldown` Map is checked and written by both `consume-link` AND `exchange-first-login`. A brute-force attack on one endpoint triggers cooldown on the other from the same IP.
- **Recorded in:** DECISIONS.md 2026-05-28 backend decisions.
- **Verdict: ACCEPT.** This is strictly more secure than the spec required. A single IP hammering either auth endpoint getting cooled is the correct posture. No user-facing degradation — a legitimate user who fails 3 times on consume-link (wrong tokens) is cooled from exchange-first-login too, but would have the same IP triggering the cooldown only if they're also brute-forcing exchange. Documented.

### D-3: confirmed.mirrorCta is a placeholder, not approved copy

- **Spec says:** confirmed.mirrorCta is marked [FOUNDER COPY] — the founder writes it directly.
- **What shipped:** Button label is "Open the mirror", supporting line is "The mirror is ready when you are." An HTML comment `<!-- FOUNDER COPY: button label + supporting line for confirmed.mirrorCta -->` flags it.
- **Recorded in:** DECISIONS.md 2026-05-28 frontend decisions.
- **Effect:** When a Lookmaxxing buyer lands on /payment-confirmed, they see placeholder copy. Not a wrong copy — the default is restrained, not hype. But it is not The Consultant's approved voice.
- **Verdict: ACCEPT for now, BLOCK ON for public launch.** The paywall flag (`PAYWALL_PUBLIC`) is off by default, so no paying user will see this during dogfood. Founder must approve confirmed.mirrorCta before `PAYWALL_PUBLIC=true`. This is a P1 if paywall goes public without it; it is not a P0 blocker for dogfood. Flagged.

### D-4: login.loading state is a blank paragraph

- **Spec says:** "A brief `[copy-consultant TBD] login.loading` line covers the consume-link round-trip."
- **What shipped:** `<p class="hint"><!-- TODO copy review login.loading --></p>` — no visible text.
- **Effect:** During token consumption (typically <500ms) or method discovery, the user sees an empty card. The aria `role="status"` and `aria-live="polite"` are present for screen readers, but there is nothing to announce.
- **Verdict: ACCEPT as P2.** The duration is sub-second in normal conditions. Does not break flow. Copy needed for accessibility and slow-connection users. Tracked as P2 backlog item.

### D-5: Smoke does not check email-form presence when flag=on

- **What shipped:** The smoke script checks `GET /lookmax/login → 200` but does not assert the email input is rendered when `LOOKMAX_EMAIL_LOGIN=true`.
- **Spec §11 ¶16:** "Smoke test passes with the flag on AND off."
- **Verdict: ACCEPT.** The 200 check passes in both modes. The email form presence in flag-on mode is covered by `login-gate-ui.test.js` (HTML structure assertions). Full browser state transition testing is in the dogfood checklist.

---

## 5. Dogfood-Only Verification Items

These cannot be confirmed by automated tests. The founder must verify each before flipping `LOOKMAX_EMAIL_LOGIN=true` for the first cohort. Each item includes the precise repro step.

| # | Item | Repro steps |
|---|---|---|
| D1 | State transitions render correctly (opacity crossfade on login.html) | Visit /lookmax/login with LOOKMAX_EMAIL_LOGIN=true in browser. Submit a valid email. Confirm the card fades from request state to check-inbox state smoothly. No flash of empty/wrong state. |
| D2 | Countdown timer ticks in real time | After submitting an email, watch the "Send another in Xs." countdown. Confirm it decrements every ~1s, reaches 0, and the "Send another →" button fades in. |
| D3 | Real-device redirect flow (email → click → /lookmax/) | On a mobile device, use the seeded test user. Request a magic link. Open the email on the same device. Tap the link. Confirm /lookmax/ loads with the user logged in. |
| D4 | iOS Safari 16px font-zoom prevention | Open /lookmax/login on iPhone Safari. Focus the email input. Confirm the page does not zoom (meta viewport has `initial-scale=1.0` — but Safari requires `font-size: 16px` on inputs; verify no zoom occurs). |
| D5 | Screen-reader announcement of state changes | Use VoiceOver (iOS) or TalkBack (Android). Submit an email. Confirm the "aria-live=polite" check-inbox region is announced. Confirm error state is announced via role=alert. |
| D6 | PWA install prompt on payment-confirmed | After paying on a supported Android Chrome, confirm the "Install the app" button appears and tapping it triggers the PWA install prompt. |
| D7 | Cross-client email rendering (Gmail, Outlook, Apple Mail) | Send a real magic-link email to the founder's addresses on Gmail + Apple Mail on mobile. Confirm the template renders: gold CTA button visible, no broken images, font fallback (Sora → Arial) acceptable, ◆ diamond renders. |
| D8 | F1 webhook-race: payment-confirmed auto-poll | With a browser developer-tools network throttle, delay the /api/payment/status call by manually pausing the request. Confirm the loading state shows "Confirming with the bank" with animated dots. After 30s with no webhook, confirm the error block shows with "Send me an entry link instead". |
| D9 | Silent first-login: JWT in localStorage after exchange | After payment-confirmed silently exchanges the firstLoginToken, open DevTools → Application → Local Storage. Confirm `lookmax.token` is set. Navigate to /lookmax/ and confirm dashboard loads without re-auth. |
| D10 | confirmed.mirrorCta: "Open the mirror" button navigates correctly | As Lookmaxxing buyer on payment-confirmed, click "Open the mirror". Confirm it navigates to /lookmax/. With JWT set (from D9), confirm the user is logged in on arrival. |
| D11 | Paywall email-required validation | On /paywall with PAYWALL_PUBLIC=true, select Lookmaxxing card. Click Begin without entering email. Confirm error message "Email is required for Lookmaxxing — you enter the work through it." appears. Confirm the "(optional — for receipts)" span is hidden. |

---

## 6. Locked-Copy Regression

- `data/orator-content.js`: zero diff vs. pre-feature baseline. Confirmed by `git diff fe14c34..HEAD -- data/orator-content.js` returning no output. `orator-content.test.js` inline snapshot passes (35 words, Day 1 prompt verbatim, signature mark intact).
- `landing.html`: zero diff vs. pre-feature baseline. `git diff fe14c34..HEAD -- landing.html` returned no output.
- Locked pillar card copy, rank ladder copy: not in the diff. `landing.test.js` passes (6 tests).

---

## 7. Definition of Done Checklist (CLAUDE.md §7)

| Item | Status |
|---|---|
| Code merged to main | PASS — 12 commits on main |
| Unit tests pass (`npm test`) | PASS — 500/500 (includes 10 new QA tests) |
| Smoke test passes (`npm run smoke`) | PASS — 31/31, flag off and on |
| Server boots cleanly with current .env | PASS — boots with expected dormant-channel warnings only |
| `/health` returns 200 | PASS — confirmed in smoke |
| DECISIONS.md updated | PASS — 4 backend + 1 frontend decision entries appended 2026-05-28 |
| BACKLOG.md updated | NOT VERIFIED — qa-agent cannot confirm; backend/frontend agents' responsibility |
| Manual happy-path run-through documented | DEFERRED — founder dogfood is the manual run-through; documented in §5 above |

---

## 8. Feature Flag Default Verification

`LOOKMAX_EMAIL_LOGIN` defaults to `false` (not set). Confirmed:
- `emailLoginEnabled()` returns `false` when env var is unset.
- `/auth/method` returns `{method:'admin-only'}` when unset (automated test + smoke).
- All new routes are behaviorally no-ops or return 401 when flag off (automated tests).
- The webhook still mints `firstLoginToken` regardless (data is there, just not returned by /api/payment/status when flag off — correct per spec §10).

Boot guard: `lib/lookmax-auth.js` throws at load time if `LOOKMAX_EMAIL_LOGIN=true && !JWT_SECRET`. Tested live. Three Vitest tests in `lookmax-auth-guard.test.js` cover the throw/no-throw matrix.

---

## 9. Final Verdict

**SIGN-OFF** — with the following conditions:

**P0 issues: ZERO.**

**P1 issue (1) — must resolve before `PAYWALL_PUBLIC=true`:**
- `confirmed.mirrorCta` is placeholder copy ("Open the mirror" / "The mirror is ready when you are."). Founder must write the approved replacement before the paywall opens to paying users.

**P2 issues tracked as backlog (ship with dogfood, fix before cohort):**
- `login.loading` state is blank (no visible copy during <500ms load). Wire `[copy-consultant TBD]` copy after copy-consultant drafts it.
- `email.magic.preheader` renders blank. Wire by passing `preheader` to `sendMagicLink()`.
- Smoke does not assert email-form presence in flag-on mode. Extend smoke script.

**Items DEFERRED-TO-DOGFOOD: 11** (see §5).

---

## 10. What the Founder Must Know Before Flipping `LOOKMAX_EMAIL_LOGIN=true`

**The single prerequisite that is not yet done:** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must be set in Render, and the sending domain must be verified at Resend (~30 min total — founder action #9 in FOUNDER_ACTIONS_THIS_WEEK.md).

Without Resend: the silent first-login path (payment-confirmed → exchange-firstLoginToken → JWT) works fine without Resend. But the magic-link recovery surface (returning user, second device, cleared storage, F1 fallback) will DRY-RUN — the user sees "check your inbox" but nothing arrives. During dogfood with `WHATSAPP_SEND_MODE=allowlist`, only addresses on the allowlist (`ADMIN_EMAIL` + `EMAIL_ALLOWLIST`) receive real email, so the founder and 2-3 dogfooders must be on that allowlist.

Flip sequence: set `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in Render → verify domain → add dogfooders to `EMAIL_ALLOWLIST` → then set `LOOKMAX_EMAIL_LOGIN=true`. Do NOT flip `PAYWALL_PUBLIC=true` until (a) dogfood confirms the full flow and (b) founder writes approved copy for `confirmed.mirrorCta`.
