# Lookmaxxing — Pre-Launch Product Audit

> Surface-by-surface walk of the full Lookmaxxing journey, end-to-end, as a real Android mid-range user would experience it. Grounded in source (file:line). Analysis only — no code changed. Charter: no rewrites; additions/removals/tweaks only. Brand voice findings that reach a user are P0 per CLAUDE.md §2.
>
> Auditor: Head of Product Audit. Date: 2026-05-28. Scope: `/`, `/audit`, `/paywall` (waitlist + public modes), `/payment-confirmed`, `/lookmax/*`, `/admin`, plus a dedicated brand-voice sweep.

---

## Severity legend

- **P0** — blocks public launch (breaks revenue, breaks trust, or violates the non-negotiable Consultant voice in front of a user).
- **P1** — meaningful conversion or retention drag; fix before launch ideally.
- **P2** — polish; fix soon after launch.
- **P3** — nice-to-have.

---

## THE HEADLINE FINDING (read this first)

**A real paying Lookmaxxing customer cannot log in to the product they just paid for.** Everything else is secondary to this. Detail in P0-1.

---

## 1. Landing page — `/` → `landing.html`

The landing page is strong, on-brand, and locked copy is intact. It is fundamentally an **Orator-first** page; Lookmaxxing is a guest. Findings are mostly about routing a Lookmaxxing-curious visitor cleanly into the audit.

### P1-A — The Lookmaxxing CTA is a one-way trip into a gated paywall during the dogfood window
- **Location:** `landing.html:1153-1165` (pillar card → `/audit`), `landing.html:1265` (`/audit?intent=bundle`), and the flow's terminus `audit.html:319` → `/paywall`.
- **What's wrong:** Every Lookmaxxing path on the landing page funnels to `/audit`, which ends at `/paywall`. While `PAYWALL_PUBLIC=false` (current state per server.js:151-156), `/paywall` serves the waitlist page. So the entire landing → audit → paywall Lookmaxxing journey currently dead-ends at a "join the waitlist" form, not a purchase. That is correct *by design for dogfood*, but it means the landing page is advertising a product the visitor cannot yet buy.
- **Why it matters:** Pre-launch this is fine. The moment `PAYWALL_PUBLIC` flips, this becomes the live revenue path — so it must be re-walked at flip time. Flagging so it is not forgotten.
- **Suggested direction:** No code change now. Add to the launch checklist: "re-walk landing → audit → paywall the instant PAYWALL_PUBLIC=true." (Tracked here, not a rewrite.)

### P2-A — "How It Works" timeline is 100% Orator; a Lookmaxxing visitor sees no Lookmaxxing journey
- **Location:** `landing.html:1178-1237` ("Seven days. Five minutes a day. One voice note at 7:45am.").
- **What's wrong:** A visitor who clicked in for Lookmaxxing scrolls into a timeline entirely about voice notes and the Orator 7-day arc. There is no "how Lookmaxxing works" (daily mirror → weekly reveal → Day-30 re-audit) anywhere on the page.
- **Why it matters:** Lookmaxxing is the higher-ARPU pillar (₹1,499 vs ₹799) and the intended ad lead-magnet. A curious visitor gets no mental model of the daily ritual before being asked to audit.
- **Suggested direction:** Post-launch, consider a small parallel Lookmaxxing timeline strip (mirror → protocol → reveal → re-audit). Not a rewrite of the existing locked timeline — an addition. Defer; document as future consideration.

### P3-A — Dead "Coming Soon" modal code references a removed concept
- **Location:** `landing.html:1486-1495` — `openComingSoon`/`names = { aesthetic: 'The Aesthetic', sage: 'The Sage' }`.
- **What's wrong:** The modal JS still names "The Aesthetic" (the old name for Lookmaxxing) and is wired for a pillar that is now live. The Sage strip at `landing.html:1170` is a static line that does not open this modal, so `openComingSoon` appears to be unreachable dead code.
- **Why it matters:** Low — it's invisible to users. But the string "The Aesthetic" is the pre-rename name; if any path ever triggers it, it is off-current-brand.
- **Suggested direction:** Verify nothing calls `openComingSoon`; if confirmed dead, remove the orphan modal + handlers in a later cleanup. Document, don't rush.

### P3-B — Footer Privacy / Terms / Contact links are `href="#"`
- **Location:** `landing.html:1417-1419`.
- **What's wrong:** All three footer links go nowhere. For a paid product collecting photos and processing payments in India (DPDPA), live Privacy + Terms are not optional at launch.
- **Why it matters:** Trust signal + legal. A user about to upload face photos and pay ₹1,499/mo who clicks "Privacy" and gets nothing reads "side project."
- **Suggested direction:** This is a legal-finance/security workstream, not a copy rewrite — but the *links* must resolve before launch. Raising to **P1** specifically because photo data + payments are involved (see P1-G).

---

## 2. `/audit` funnel — `public/audit.html` + `routes/audit.js`

The single biggest drop-off risk in the entire funnel is Scene 3 (photos). Walking each scene:

### Scene 1 (Hook) — `audit.html:92-98`
Clean. On-brand. No findings.

### Scene 2 (Quiz, 12 questions) — `audit.html:101-105, 145-169`

#### P2-B — 12 one-at-a-time questions before any reward is a long pre-photo gauntlet
- **Location:** `audit.html:145-169` (QUIZ array, 12 items).
- **What's wrong:** 12 sequential taps with no progress affordance beyond a thin bar (`audit.html:102`). Mid-range Android users on the move will feel this. There is no "X of 12" count, no back button to fix a misclick.
- **Why it matters:** Every question is a drop-off point before the user has invested anything (no photo yet = easy to bail).
- **Suggested direction:** Small additions only: add a "Question N of 12" label near the progress bar, and a back affordance. No copy rewrite. P2 because the funnel still works.

#### P3-C — Quiz copy is still an unapproved draft in production
- **Location:** `audit.html:87-90` and `:144` — `// TODO copy review`: only Q1 is brief-verbatim; Q2-Q12 are "a working draft pending founder voice approval."
- **What's wrong:** Per CLAUDE.md §6 rule 5, unapproved Consultant copy should not ship to users. These 11 questions are user-facing and unapproved.
- **Why it matters:** The questions read on-voice to me (restrained, specific, no violations), so this is low-risk — but it is technically shipping un-approved copy. Founder should approve or revise the 11 drafts before public launch.
- **Suggested direction:** Founder sign-off pass on Q2-Q12. No structural change. P3 because no voice violation is present; it's a process gap.

### Scene 3 (Photos) — `audit.html:107-118, 224-266` + `routes/audit.js:44-84`

#### P0-2 — Photo upload has no per-file size guard or friendly failure; large mobile photos can silently fail the whole audit
- **Location:** client `audit.html:237-250` (`downscale`) + `audit.html:252-266` (`submitPhotos`); server `routes/audit.js:20-23` (`fileSize: 8MB`, `files: 3`).
- **What's wrong:**
  - The client downscales to 1024px via canvas (`audit.html:241`), which usually keeps files small. **But** if `img.onerror` fires (HEIC from an iPhone shared to an Android, corrupt file, or a format the canvas can't decode), the code resolves with the *original* file (`audit.html:247`). A raw 12MP Android photo can exceed the server's 8MB limit. Multer then rejects the request, and the user sees only the generic `'Upload failed. Try again.'` (`audit.html:263`) — with no explanation, no size hint, and the same files will fail again on retry. That is a hard dead-end mid-funnel, after the user has already done 12 questions.
  - HEIC specifically: Android Chrome cannot always decode HEIC into canvas; `onerror` → original HEIC uploaded → Gemini Vision / sharp may reject it.
- **Why it matters:** This is the highest-investment, highest-intent moment in the free funnel. A silent, unrecoverable failure here destroys the conversion and the trust. On mid-range Android with big default camera resolutions, this is not an edge case.
- **Suggested direction (additions only):** (1) On `img.onerror`, surface a specific message ("This photo couldn't be read — try a JPG or a fresh camera shot") instead of resolving the original blindly. (2) Make the Scene-3 error copy specific about size/format. (3) Confirm server-side sharp re-encode handles HEIC; if not, document the limitation. No rewrite — guardrails on an existing path.

#### P1-B — `capture` attributes force the camera and can block gallery uploads on some Android builds
- **Location:** `audit.html:112` (`capture="user"`), `:113` (`capture="user"`), `:114` (`capture="environment"`).
- **What's wrong:** `capture` is a hard hint to open the camera directly. Many users want to pick an existing flattering/standardised photo from the gallery; some Android WebViews and browsers will not offer a gallery picker at all when `capture` is set. For a "full body" shot especially, a self-taken-on-the-spot camera capture is awkward (who is holding the phone?).
- **Why it matters:** Real friction + drop-off on the full-body photo, which has no realistic self-capture path for a solo user.
- **Suggested direction:** Consider dropping `capture` on at least the full-body input so the gallery is available (the mirror selfie can keep `capture="user"`). Small attribute tweak, not a rewrite. P1 because full-body self-capture is genuinely hard.

#### P1-C — No upload progress; "Uploading…" with three photos on a slow connection looks frozen
- **Location:** `audit.html:253-254` (`btn.textContent = 'Uploading…'`).
- **What's wrong:** Three image uploads over a mid-range mobile connection with only a static "Uploading…" label and a disabled button. No spinner, no percentage, no timeout. If the network stalls, the user has no signal whether to wait or bail.
- **Why it matters:** Perceived-failure abandonment right before the payoff.
- **Suggested direction:** Add a lightweight spinner/indeterminate state to the existing button or scene. No new architecture. P1.

### Scene 4 (Analysis) — `audit.html:120-125, 268-288`

#### P1-D — Analysis failure tells the user to refresh, which destroys the session and forces a full restart
- **Location:** `audit.html:284-287` — on analyze error: `lineEl.textContent = 'The reading failed. Refresh to try again.'`.
- **What's wrong:** "Refresh to try again" reloads `audit.html`, which resets `sessionToken`, `answers`, and `photoFiles` (all in-memory, `audit.html:139-142`). The user is dumped back at Scene 1 and must re-do 12 questions and re-upload 3 photos. The session and photos still exist server-side (`routes/audit.js` persists them), and `/api/audit/analyze` is explicitly re-runnable (`audit.js:86`), but the client throws all of that away.
- **Why it matters:** A transient Gemini hiccup becomes total funnel loss at the most expensive step.
- **Suggested direction:** Replace "Refresh to try again" with an in-place retry button that re-calls `/api/audit/analyze` with the existing `sessionToken` (no reload). The backend already supports it. Addition, not a rewrite. P1 (borderline P0 given how late it occurs).

#### P2-C — Minimum 8s artificial dwell, but the rotating line only cycles 4 generic lines
- **Location:** `audit.html:270-283` (4 lines, 2s interval, min 8s hold).
- **What's wrong:** Functional and on-brand. Minor: if Gemini takes the full ~45s the four lines loop visibly. Acceptable.
- **Suggested direction:** None required. Noted for completeness.

### Scene 5/6 (Score + Diagnosis) — `audit.html:127-135, 290-320`

#### P1-E — The free audit result is ephemeral and unrecoverable; there is no "save / send me this" affordance
- **Location:** `audit.html:134` ("Your reading is free. No account needed to see it.") + session is 24h server-side but the *client* holds the only handle (`sessionToken` in memory).
- **What's wrong:** The result lives only in the current tab. Close the tab, lose the Aura Score and diagnosis forever (the 24h server session is unreachable without the token). The handoff to paywall carries the token (`audit.html:316-319`), but there is no email-it / save-link / screenshot-prompt. The handoff brief (§13.4) explicitly wants the audit to be screenshot-able and viral — yet the page does nothing to encourage capture or recovery.
- **Why it matters:** This is the lead magnet. An un-saveable, un-shareable result kills the viral loop and the abandoned-audit recovery path.
- **Suggested direction:** Add a small "screenshot this / get it on WhatsApp" nudge and/or surface the existing `/audit/result/:token` link. The route already exists (`audit.js:136`, and server.js:165 serves a result page). Wiring, not new architecture. P1.

#### P0-3 — "See Your Protocol →" leads to a waitlist wall with zero acknowledgement of the protocol just promised
- **Location:** `audit.html:133` (CTA "See Your Protocol →") → `toPaywall()` (`audit.html:313-320`) → `/paywall` which serves `paywall-waitlist.html` while gated.
- **What's wrong:** The user is told "See Your Protocol," clicks, and lands on "The Chamber opens this weekend. Add your number" (`paywall-waitlist.html:69`). There is no protocol, and crucially **the waitlist page never references the audit the user just completed** — the `auditSessionToken` is passed (`paywall-waitlist.html:95`) and sent to the API but is never shown back to the user. The momentum from a personalised Aura Score evaporates into a generic waitlist form.
- **Why it matters:** This is the conversion seam. Even in waitlist mode, dropping all personalisation ("Your Aura Score was 62, hairDensity is your leverage point — hold your place") is a large, avoidable momentum loss. Tagged P0 because it sits exactly on the money path and is the first thing to break the spell.
- **Suggested direction:** Have the waitlist page read the audit summary (the public-mode paywall already does exactly this at `paywall.html:195-210` via `/api/audit/result/`) and echo one personalised line above the form. Reuse of an existing pattern, not a rewrite. Fix before launch.

---

## 3. `/paywall` — waitlist mode AND public mode

Gating logic confirmed at `server.js:151-156`: `PAYWALL_PUBLIC === 'true'` → `paywall.html`; else `paywall-waitlist.html`.

### Waitlist mode (`paywall-waitlist.html`) — current live state

#### P0-3 (continued) — no audit echo (see above).

#### P2-D — "opens this weekend" is a hardcoded, decaying promise
- **Location:** `paywall-waitlist.html:69` ("The Chamber opens this weekend.") and `:90` ("The discipline arrives soon.").
- **What's wrong:** "This weekend" is time-specific and will be wrong the moment the weekend passes. A waitlisted user returning Monday sees a stale promise.
- **Why it matters:** Small trust erosion; makes the product look unattended.
- **Suggested direction:** Founder to confirm whether to keep date-specific. If kept, it needs a manual update cadence; safer is the already-present timeless line. Minor copy decision for the founder — flagged, not rewritten.

### Public mode (`paywall.html`) — behaviour when `PAYWALL_PUBLIC=true` is flipped

I read the gating + the page so I can describe exactly what a user will hit at flip time:

- Server starts serving `paywall.html` (3 cards: Orator ₹799 / Lookmaxxing ₹1,499 / Aura++ ₹1,999 "Most chosen"). `paywall.html:108-155`.
- If arriving from the audit, `loadAuditSummary()` (`paywall.html:195-210`) fetches `/api/audit/result/:token` and shows "Your Aura Score: NN/100. <axis> is your leverage point." — good, personalised, on-brand.
- User picks a card → `begin([pillars])` (`paywall.html:218-253`) validates name + `^[6-9]\d{9}$` Indian mobile + optional email, POSTs `/api/payment/subscribe`, and on success does `window.location.href = data.url` (the Razorpay short_url). Backend confirmed at `api.js:525-576`; both pillars → Aura++ bundle automatically (`api.js:534-539`).

#### P0-4 — Public paywall will charge LIVE money the instant the flag flips, and the codebase still has `rzp_test_*` keys per the handoff; mismatch risk
- **Location:** `server.js:341-357` (the guard warns but does not block), `api.js:525-576`. Handoff §"What's in env" says `RAZORPAY_KEY_ID = rzp_test_*` while KYC is live.
- **What's wrong:** This is a configuration/sequencing landmine, not a page bug, but it lives on the paywall path. If `PAYWALL_PUBLIC=true` flips while test keys are in place, real users hit a test checkout (no money, confused users). If live keys are in but `RAZORPAY_WEBHOOK_SECRET` is unset (handoff lists it as NOT set), the `subscription.activated` webhook signature check fails and **paid users never get activated** (`api.js:733`+ verifies signature).
- **Why it matters:** Either ordering produces paying-or-trying users who do not get the product. Direct revenue + trust hit.
- **Suggested direction:** This belongs on the launch checklist as a hard ordered gate: (1) set `RAZORPAY_WEBHOOK_SECRET`, (2) swap to `rzp_live_*`, (3) test one real ₹ subscription end-to-end, (4) only then flip `PAYWALL_PUBLIC`. No code change — sequencing discipline. P0 because it is on the money path.

#### P1-F — Selecting a card does not visibly select anything; the form sits below with a passive note
- **Location:** `paywall.html:108-174`. The three card buttons each call `begin([...])` immediately (`:121, :136, :153`), but the contact form (`:157-174`) is a separate block below with `selectedNote` text. On mobile (cards stack, `:52`), the user taps "Begin →" on a card *before* scrolling to fill name/phone — `begin()` then fails validation with "Your name, first." (`:227`) pointing at a form they may not have seen.
- **What's wrong:** The interaction model is ambiguous: is the card a selector or the submit? It's the submit, but the inputs are elsewhere. On a stacked mobile layout this is a real ordering trap.
- **Why it matters:** Friction at the final purchase tap.
- **Suggested direction:** Small UX tweak — on card tap, scroll the form into view and/or move the inputs above the buttons in the mobile stack. No rewrite. P1 (live-revenue UX).

#### P2-E — "Voice or text both work" promises a feature that is not built
- **Location:** `paywall.html:119` (Orator card: "Voice or text both work").
- **What's wrong:** CLAUDE.md §4 landmine #9 / handoff note: voice notes are not handled. This is an Orator card, slightly out of Lookmaxxing scope, but it ships on the same paywall a Lookmaxxing/Aura++ buyer reads.
- **Why it matters:** A paying Aura++ user who sends a voice note and gets nothing back experiences a broken promise.
- **Suggested direction:** Out of pure-Lookmaxxing scope; flag to the Orator track. Either ship voice handling or soften the bullet. P2 for this audit's scope.

#### P3-D — Aura++ "Founder access to The Consultant chat" is an unapproved placeholder bullet shipping to users
- **Location:** `paywall.html:151` (`<!-- TODO copy review -->`).
- **What's wrong:** Per CLAUDE.md §6 rule 5, this is unapproved copy on a live purchase card, and it promises a "Consultant chat" feature that does not exist in the codebase.
- **Why it matters:** Promising an unbuilt feature on the highest-tier card is a future support/refund liability.
- **Suggested direction:** Founder to approve, revise, or remove the bullet before flip. P3 (single bullet) but should not survive launch.

---

## 4. `/payment-confirmed` — `public/payment-confirmed.html` + `/api/payment/status`

Reads `razorpay_subscription_id` from URL (`payment-confirmed.html:69`), calls `/api/payment/status` (`api.js:582-620`), renders state. Logic is sound. Three states confirmed:

- **Success:** `d.found && (oratorActive || lookmaxxingActive)` → headline "The Chamber is open, {name}. ◆", personalised steps, receipt. Clean.
- **Pending (webhook not landed):** `status` returns `{found:false}` (`api.js:587-591`) → page calls `showError()` → shows "Your payment is being verified. Please refresh in a moment…" (`payment-confirmed.html:61-64`). Reasonable.
- **Failure / no sub id:** `!subscriptionId` → `showError()`. Reasonable.

### P1-G — The post-payment "Open the mirror at /lookmax/" instruction leads a paying user into a login they cannot pass (links to P0-1)
- **Location:** `payment-confirmed.html:92` (`'Open the mirror at /lookmax/ — your daily ritual begins tomorrow morning.'`).
- **What's wrong:** This step directs a freshly-paid Lookmaxxing user to `/lookmax/`, which requires a session. A non-admin paying user has no working way to get one (see P0-1). So the very first post-purchase instruction leads to a wall.
- **Why it matters:** First action after paying ₹1,499 fails. Worst possible first-run moment.
- **Suggested direction:** Fix P0-1 (auth). This step is correct copy; it just points at a broken door.

### P1-H — "found:false" success-pending state collapses into the generic "error" box; a user who genuinely paid sees an error-styled message
- **Location:** `api.js:587-591` returns `{found:false}`; `payment-confirmed.html:118` (`if (!res.ok || !d.found) { showError(); }`).
- **What's wrong:** The webhook can legitimately lag a few seconds behind the redirect. During that window a paid user sees the `#error` block (`payment-confirmed.html:61`), which reads like a failure even though copy says "being verified." There is no auto-retry/poll — the user must manually refresh.
- **Why it matters:** A paying customer's first screen says (in error styling) "being verified… contact support." Some will think payment failed and either retry (double charge risk) or churn.
- **Suggested direction:** Add a short auto-poll (e.g., re-fetch `/api/payment/status` every ~3s for ~30s) before showing the manual-refresh/error state. Small addition to the existing `load()`. P1.

### P2-F — "Next billing" date is fabricated client-trust-wise (always now + 30 days)
- **Location:** `api.js:605` (`nextBilling = now + 30 days`), rendered at `payment-confirmed.html:126`.
- **What's wrong:** The next-billing date is computed as a flat +30 days regardless of the actual Razorpay subscription cycle/anchor. The receipt shows a date that may not match what Razorpay actually charges.
- **Why it matters:** Minor now, but a receipt date that disagrees with the bank charge date is a support ticket and a small trust ding.
- **Suggested direction:** Pull the real next-charge date from the subscription object when available, or omit the row until known. P2.

### P2-G — "Install the app" button appears but PWA install is non-deterministic and silently does nothing if `beforeinstallprompt` never fired
- **Location:** `payment-confirmed.html:102-107, 129-133`.
- **What's wrong:** The install affordance only works if Chrome fired `beforeinstallprompt` before the tap. On iOS Safari (no such event) and on Android when the event hasn't fired, tapping "Install the app" does nothing with no feedback.
- **Why it matters:** Dead-feeling button right after purchase.
- **Suggested direction:** If no `deferredPrompt`, show brief manual instructions ("Use your browser menu → Add to Home Screen") instead of a no-op. Small addition. P2.

---

## 5. `/lookmax/*` — the PWA (login, dashboard, mirror, protocol, hair, reveal)

### P0-1 — A real paying Lookmaxxing customer has NO working login path (the single most launch-threatening issue)
- **Location:** `routes/lookmax-auth.js:42-66` (admin-login gated to `adminLib.isAdminPhone`), `:68-88` (`otpAvailable()` requires `whatsapp.isConfigured() && WHATSAPP_OTP_ENABLED === 'true'`), `public/lookmax/login.html:31, 65-68` (OTP returns "unavailable" → routes to admin login).
- **What's wrong:** Two login doors exist:
  1. **OTP login** (`/lookmax/login`) — dormant. `otpAvailable()` is false until WhatsApp Cloud API is configured AND `WHATSAPP_OTP_ENABLED=true`. Per handoff, WhatsApp is pending Meta approval and these env vars are unset. So `request-otp` returns `{status:'unavailable'}` and the page bounces the user to admin login (`login.html:65-67`).
  2. **Admin login** (`/lookmax/admin-login`) — `auth/admin-login` rejects any phone not in `ADMIN_PHONES` (`lookmax-auth.js:53`). A paying customer is not an admin.
  - Net: a non-admin paying Lookmaxxing user is bounced from OTP → admin login → rejected. **There is no door they can walk through.** The whole `/lookmax/*` surface (dashboard, mirror, protocol, hair, reveal) is unreachable for the exact person the paywall just charged.
- **Why it matters:** This breaks the product for every real customer the moment payments go live, even if WhatsApp/Razorpay are perfectly configured — because login is bound to WhatsApp OTP, and OTP is the only customer door. The Razorpay → payment-confirmed → "Open the mirror" path (P1-G) leads here and dies.
- **Suggested direction:** Two viable additions (founder/eng decision, not a rewrite):
  (a) Issue a Lookmaxxing session as part of the payment-confirmed flow (the webhook already knows the paying user; mint a `signLookmaxToken` and hand it to `/payment-confirmed` → deep-link into `/lookmax/`), or
  (b) Gate launch on WhatsApp OTP being live + `WHATSAPP_OTP_ENABLED=true` and verify the OTP path end-to-end.
  Either way: **do not flip `PAYWALL_PUBLIC` until a non-admin test user can log in.** This is the gate.

### P0-5 — `🔥` emoji ships in the live streak badge across the PWA (Consultant voice violation, user-facing)
- **Location:** `public/lookmax/index.html:20` (`0 🔥`) and `:50`; `public/lookmax/mirror.html:143`; `public/lookmax/protocol.html:51`.
- **What's wrong:** CLAUDE.md §2 is explicit: the only permitted emoji is `◆`. The fire emoji renders on the dashboard header, after every mirror reveal, and on the protocol screen — i.e., on every primary surface, every day.
- **Why it matters:** Brand-voice findings that reach a user are P0 by charter. The 🔥 is the single most "generic streak app" signal in the product and it sits on the most-viewed surfaces. It directly contradicts the anti-hype positioning.
- **Suggested direction:** Replace `🔥` with a text or `◆` treatment (e.g., "Streak 5" or "5 ◆"). Pure string/markup change, four occurrences. Must fix before launch.

### Dashboard — `public/lookmax/index.html`

#### P1-I — No logout control anywhere in the PWA, despite `LM.logout` existing
- **Location:** `app.js:39` defines `logout`, `app.js:96` exports it, `app.js:42-56` `renderNav` builds a 5-item bottom nav with **no logout entry**. Grep confirms `logout` is referenced only in `app.js` — never wired to a button.
- **What's wrong:** A user (especially on a shared device, common in India) cannot sign out. The JWT persists in `localStorage` for 24h with no escape hatch.
- **Why it matters:** Trust + privacy (this product holds face photos). Also blocks the founder/admins from switching accounts during dogfood without clearing storage.
- **Suggested direction:** Add a logout affordance to the Profile view (the dashboard is the "profile" nav target, `app.js:48`). `LM.logout()` already exists. Wiring only. P1.

#### P2-H — The "Profile" nav tab is just the dashboard; there is no actual profile/account surface
- **Location:** `app.js:48` (`{ key: 'profile', label: 'Profile', ic: '◆', href: '/lookmax/' }`).
- **What's wrong:** "Profile" implies account info (name, plan, billing, logout, subscription management). It just reloads the dashboard. No way to see plan, manage/cancel subscription, or update anything.
- **Why it matters:** Razorpay/DPDPA expectations include a way to manage/cancel a recurring subscription. Absence is a churn-friction and a compliance gap.
- **Suggested direction:** Post-launch, add a minimal profile/account panel (plan, next billing, cancel link, logout). Defer; document. P2 (P1 if Razorpay/legal requires self-serve cancel at launch — confirm with legal-finance).

#### P2-I — Cross-sell banner only checks `oratorActive`; an Orator-only buyer who adds Lookmaxxing sees no cross-sell, and bundle math nuance is shown as raw copy
- **Location:** `index.html:76-82` (cross-sell shows only when `!d.user.oratorActive`).
- **What's wrong:** Logic is fine for the common Lookmaxxing-only case. Minor: the copy "₹799/mo. Or upgrade to Aura++ ₹1,999 (saves ₹299)" is dense for a small banner.
- **Suggested direction:** Acceptable for launch. Note for later trimming. P2/P3.

### Mirror — `public/lookmax/mirror.html`

#### P1-J — Camera-permission denial has a fallback, but a hard `getUserMedia` rejection shows no guidance
- **Location:** `mirror.html:81-91`. On `getUserMedia` throw, it hides the live video and rewires Capture → file input. Good. But there is no message telling the user *why* the live preview vanished or that they can still proceed via "Use a photo."
- **What's wrong:** A user who denied camera permission sees the live preview disappear with no explanation; the primary button silently changes label to "Open camera." Confusing.
- **Why it matters:** First daily ritual; camera permission denial is common on Android. Silent fallback reads as broken.
- **Suggested direction:** Add a one-line note in the catch block ("Camera unavailable — add a photo instead."). Small addition. P1.

#### P2-J — No loading skeleton on dashboard/mirror first paint; tiles/score appear as "—" then pop
- **Location:** `index.html:18-23` (`—`, `0 🔥`, `Raw` placeholders), `mirror.html:23` (`—` badges).
- **What's wrong:** Initial render shows dash placeholders until the async `dashboard`/`me` calls resolve. On a cold Render dyno (free tier sleeps, handoff §8) the first request can take seconds, so the user stares at "—".
- **Why it matters:** Perceived slowness on the exact mid-range-Android + cold-start combination that is the target user.
- **Suggested direction:** Lightweight skeleton/shimmer or a "Loading your mirror…" line. Small addition. P2.

#### P2-K — `deltaVsBaseline` is computed and returned but never shown; "vs your audit baseline" is a wasted signal
- **Location:** route returns `deltaVsBaseline` (`lookmax.js:100, 108`); `mirror.html:158-166` only renders `deltaVsYesterday`.
- **What's wrong:** The product's core promise is "the gap is measurable" against the baseline (the audit). The mirror shows day-over-day deltas but not progress-vs-baseline, which is the more motivating number.
- **Why it matters:** Under-delivering on the headline value prop on the daily surface.
- **Suggested direction:** Surface the baseline delta somewhere on the reveal (a single "vs Day 1" line). Data already flows. Addition. P2.

### Protocol — `public/lookmax/protocol.html`

#### P2-L — "No protocol yet. Take a mirror to generate one." can be a circular dead-end
- **Location:** `protocol.html:46` (catch → that message). Backend `lookmax.js:139-146` actually auto-generates a protocol on `GET /protocol/today` via `ensureProtocolToday`, so this catch mostly fires on a real error, not an empty state.
- **What's wrong:** If `ensureProtocolToday` throws (e.g., no audit on file for a non-seeded user), the user is told to "take a mirror," but taking a mirror does not generate a protocol (protocol generation is audit-driven, `lookmax.js:142-144`). Potential circular instruction.
- **Why it matters:** Edge-case dead-end for users without a baseline audit (which, post-P0-1 fix, could include direct-paid users who never did the audit).
- **Suggested direction:** Confirm the no-audit path; make the empty-state instruction accurate. P2.

### Hair — `public/lookmax/hair.html`

#### P2-M — Hair tracker is reachable before any mirror/audit and is the only feature with no obvious entry guard, but the analysis "⌃" glyph + "Reading the hairline cone…" is opaque
- **Location:** `hair.html:53` (`⌃` as the analysis glyph), `:54` ("Reading the hairline cone…").
- **What's wrong:** The non-◆ glyph `⌃` (and `⊘` for do-nots, `◈ ☰ ⌃ ▷` in the nav at `app.js:44-48`) are decorative Unicode symbols, not emoji, so not a hard voice violation — but they are inconsistent with the "◆ as the only iconography" visual rule (CLAUDE.md §4 / handoff §4). "Reading the hairline cone…" is also slightly jargon-y.
- **Why it matters:** Visual-brand consistency, not a P0 voice break. Low.
- **Suggested direction:** Consider standardising nav/analysis glyphs toward ◆-family or simple text labels. Founder call. P2/P3.

#### P3-E — Hair "front" photo uses `capture="user"` but "crown" uses `capture="environment"` — a solo user cannot photograph their own crown
- **Location:** `hair.html:45-46`.
- **What's wrong:** The crown/from-above shot is physically impossible to self-capture cleanly; `capture="environment"` forces the rear camera with no gallery fallback on some builds.
- **Why it matters:** The hero feature's required second photo is hard to produce alone.
- **Suggested direction:** Allow gallery selection for the crown photo (drop `capture`), and/or add guidance ("ask someone, or use a phone propped overhead"). Small. P3 (P2 given it's the "hero" feature).

### Reveal — `public/lookmax/reveal.html`

#### P1-K — "It airs Friday at 8pm" is a hardcoded claim with no scheduled delivery behind it
- **Location:** `reveal.html:36` ("It airs Friday at 8pm. Here is the preview.").
- **What's wrong:** There is no scheduler/notification that delivers a reveal on Friday 8pm (the reveal route is a pull-only preview, `lookmax.js:317-334`; the only cron mentioned is a 6:30am mirror nudge, all DRY-RUN). The page asserts a broadcast moment that does not exist.
- **Why it matters:** Sets an expectation the system does not meet → "it said Friday 8pm and nothing happened." Trust ding + a missed retention ritual.
- **Suggested direction:** Either soften the copy to not promise a specific airtime, or wire a real Friday reveal-ready notification before promising it. Founder copy call + possible scheduler addition. P1.

#### P2-N — Reveal unlock requires 4 mirrors in the *current week*, but a new user mid-week may never reach 4 and the locked copy doesn't explain the window
- **Location:** `lookmax.js:319-324` (counts mirrors with `createdAt >= now-7d`... actually a rolling 7-day window, not calendar week), `reveal.html:30` ("Your reveal unlocks at 4 of 7.").
- **What's wrong:** Backend uses a rolling 7-day window (`weekAgo = now - 7d`), front-end says "4 of 7" implying a 7-slot week. A user who starts Thursday and takes daily mirrors will unlock on a rolling basis, which is fine, but the "this week" framing on the dashboard week strip (calendar-based, `lookmax.js:287-288, 304-311`) and the rolling reveal window can disagree, confusing the user about how close they are.
- **Why it matters:** Mismatched mental models on a motivational surface.
- **Suggested direction:** Align the reveal window and the week-strip semantics, or clarify copy. P2.

#### P3-F — Share deep-links to `instagram://`, `snssdk1233://` (TikTok) will silently fail on desktop and on phones without the app, with no graceful in-page fallback feedback
- **Location:** `reveal.html:101-108`.
- **What's wrong:** The try/catch around `location.href = 'instagram://library'` won't catch a failed app-scheme navigation (it doesn't throw); on a device without the app the user just sees nothing happen.
- **Why it matters:** Broken-feeling share buttons undercut the viral loop.
- **Suggested direction:** Prefer `navigator.share` first where available; fall back to the UTM web link. Minor. P3.

### Missing journey steps across `/lookmax/*`

#### P1-L — The promised "Day-30 Re-Audit" does not exist anywhere
- **Location:** Promised at `paywall.html:134` and `payment-confirmed`/marketing; **no route, no UI, no scheduler**. Grep for re-audit/Day-30 in `routes/lookmax.js` returns nothing; `audit.js` has a `reAudit` flag (`audit.js:27`) but nothing in the PWA ever triggers a re-audit.
- **What's wrong:** A headline Lookmaxxing deliverable (the Day-30 side-by-side, the core "measurement is the product" payoff) is sold but not built into the user journey. The audit engine supports `reAudit`, but the PWA never surfaces it.
- **Why it matters:** The 30-day re-audit is the retention and proof moment that justifies the ₹1,499 subscription past month one. Selling it without delivering it is a churn-and-refund risk.
- **Suggested direction:** Either build the Day-30 re-audit entry into the PWA (it can reuse the audit funnel with `reAudit:true` + the existing baseline) or remove the bullet from the paywall until built. Founder/eng decision. P1 (revenue-justification feature).

#### P2-O — No abandoned-audit recovery and no paywall exit-intent
- **Location:** funnel-wide. The audit session lives 24h server-side (`audit.js`), `sendAuditConfirmation` email exists in services (handoff §6) but is dormant, and nothing re-engages a user who completed the audit but didn't join the waitlist / pay.
- **What's wrong:** The highest-intent users (finished a free audit, saw their score, then bounced at the paywall) get zero follow-up.
- **Why it matters:** This is the warmest re-engagement cohort in the whole product.
- **Suggested direction:** Post-launch, when WhatsApp/email channels are live, wire an abandoned-audit nudge using the existing 24h session + `sendAuditConfirmation`. Defer; document. P2.

#### P2-P — No post-purchase Day-1 ritual / onboarding for a fresh Lookmaxxing buyer
- **Location:** Dashboard assumes an existing baseline and protocol. A direct-paid user (who bought from the bundle without doing the free audit) has no audit baseline, so the dashboard tiles, mirror deltas, and protocol generation all degrade (`lookmax.js:123-132` returns null baseline; protocol falls back).
- **What's wrong:** No "do your first audit now" gate for buyers who skipped the funnel. First run is empty and undirected.
- **Why it matters:** Weak first session = early churn.
- **Suggested direction:** On first PWA open with no audit, route the user into the audit (with their account attached) before the dashboard. Addition reusing the audit funnel. P2.

---

## 6. `/admin` — north-star metrics on the dashboard?

Served from `public/admin.html` (server.js:196). NOTE: there is a second, orphaned `admin.html` at the repo root with React-style JSX and `🔥` — it is **not** served and should be treated as dead (see P3-G).

### P1-M — The admin dashboard shows Orator metrics only; the section-8 north-star metrics are largely absent, and Lookmaxxing is invisible
- **Location:** `admin.html:336, 422-428` (5 stat cards: Total Users, Active Today, Trial Done, Paid, Avg Improvement) backed by `routes/admin.js:58-104`.
- **What's wrong:** CLAUDE.md §8 names six north-star metrics: Enrolments, D1 Start rate, D7 Completion rate, Trial→Paid, MRR, WhatsApp deliverability. The admin shows: total users, active today, trial-complete count, paid count, avg score improvement. Missing/absent: **D1 start rate, D7 completion rate, Trial→Paid conversion %, MRR (₹), WhatsApp deliverability**, and the entire Lookmaxxing funnel (audit sessions started/completed, waitlist size, mirror DAU, mirror streaks, hair readings). `avgImprovement` (`admin.js:67-79`) is computed from Orator 4-axis scores only — it will read 0/blank for a Lookmaxxing-only world.
- **Why it matters:** The founder is told (§8) to "see them on the dashboard, not in console logs." For a Lookmaxxing launch, the founder currently has no Lookmaxxing dashboard at all — they'd be flying blind on the pillar being launched.
- **Suggested direction:** Add Lookmaxxing tiles to the existing stats bar (waitlist count is already in `/health` via `EarlyAccess.count()`; audit sessions exist in `AuditSession`; mirror/streak in `Lookmax`). Compute Trial→Paid and MRR from existing user flags. Additions to the existing stats endpoint + bar, not a rewrite. P1.

### P2-Q — Admin "Send" / "Broadcast" use `alert()` and go through WhatsApp, which is DRY-RUN; founder gets a success alert for messages that never send
- **Location:** `admin.html:520-524` (`alert('Message sent.')`), `routes/admin.js:114-179` (sends via `whatsapp.sendMessage`/`sendMessageSafe`, DRY-RUN until Meta creds).
- **What's wrong:** During the dogfood/pre-WhatsApp window, the admin UI confirms "Message sent." even though the send was a logged no-op. Misleading operational signal.
- **Why it matters:** Founder may believe outreach went out when it didn't.
- **Suggested direction:** Reflect DRY-RUN state in the admin response/UI ("queued — DRY-RUN, WhatsApp not live"). Small. P2.

### P3-G — Orphan `admin.html` at repo root contains `🔥` and an entirely different (React) admin prototype
- **Location:** `/admin.html:389, 540` (root, not `public/`). Not served by any route.
- **What's wrong:** Dead duplicate file with a brand-voice violation inside it. Harmless to users (unreachable) but confusing to anyone reading the repo and a latent risk if someone ever wires it up.
- **Why it matters:** Repo hygiene; avoids a future accidental 🔥 ship.
- **Suggested direction:** Delete the root `admin.html` in a cleanup pass after confirming nothing references it. P3.

---

## 7. Dedicated brand-voice sweep

Method: grepped all user-facing HTML (`landing.html`, `index.html`/`audit.html`, `public/**/*.html`) and copy-bearing routes/services for emoji ≠ ◆, exclamation marks, and hype words ("Amazing", "Great job", "Awesome", "Let's go", "🎉", etc.).

### Confirmed violations (user-facing) — all P0 per charter

| File:line | Offending string | Why it violates |
|---|---|---|
| `public/lookmax/index.html:20` | `0 🔥` (streak badge default) | Emoji ≠ ◆ on the dashboard header |
| `public/lookmax/index.html:50` | `(d.streak \|\| 0) + ' 🔥'` | Emoji ≠ ◆ rendered live on dashboard |
| `public/lookmax/mirror.html:143` | `(r.streak \|\| 0) + ' 🔥'` | Emoji ≠ ◆ after every mirror reveal |
| `public/lookmax/protocol.html:51` | `(state.streak \|\| 0) + ' 🔥'` | Emoji ≠ ◆ on the protocol screen |

→ Consolidated as **P0-5**. Four occurrences, one fix pattern.

### NOT violations (verified, do not flag)

- `landing.html:1325, 1329, 1333` — `"Keep going! You're doing great! 🎉"`, `"Don't break your streak!"`, `"New content available!"`. These are inside the **"What other apps say"** contrast column (`landing.html:1319-1340`). The exclamation marks and 🎉 are deliberately quoting the *wrong* voice to contrast with MainCharacter's. On-brand by design. Locked-copy-adjacent. **Leave as-is.**
- `landing.html:1170` Sage strip, all `◆` usages, `paywall.html` `◆` bullets, `payment-confirmed.html` `◆` — compliant.
- `app.js:44-48` nav glyphs `◈ ☰ ⌃ ▷` and `hair.html` `⌃`/`⊘` — decorative Unicode symbols, not emoji. Not a hard §2 violation, but inconsistent with "◆ as the only iconography" (raised as P2-M, not here).
- `/admin.html` (root) `🔥` at `:389, :540` — in a **dead, unserved** file (P3-G), not user-facing.

### Placeholder copy still in production (process violations, not voice violations)

| File:line | Issue |
|---|---|
| `audit.html:87-90, 144` | `// TODO copy review` — 11 of 12 quiz questions are unapproved drafts (P3-C) |
| `paywall.html:151` | `// TODO copy review` — Aura++ "Founder access to The Consultant chat" bullet, promises unbuilt feature (P3-D) |
| `paywall-waitlist.html:4` | `// TODO copy review` on the whole page (copy reads on-brand; founder sign-off needed) |
| `index.html` (lookmax), `mirror.html`, `reveal.html` | `// TODO copy review` headers — copy reads on-brand; founder sign-off needed |
| `routes/admin.js:221-222` | `// TODO copy review` synthetic diagnosis — internal seed only, never user-facing in prod. OK. |

These are not voice violations (the copy that's present is restrained and on-voice), but per CLAUDE.md §6 rule 5 they are unapproved strings shipping to users. Founder should do an approval pass before launch.

---

## Findings index by severity

**P0 — blocks public launch (5)**
- **P0-1** No working login for a real paying Lookmaxxing customer (`lookmax-auth.js:42-88`, `login.html:65-67`). *The single most launch-threatening issue.*
- **P0-2** Photo upload silent/unrecoverable failure on large or HEIC mobile photos (`audit.html:237-266`, `audit.js:20-23`).
- **P0-3** Audit → paywall(waitlist) drops all personalisation; "See Your Protocol" lands on a generic waitlist with no audit echo (`audit.html:133`, `paywall-waitlist.html`).
- **P0-4** Razorpay live-key / webhook-secret / PAYWALL_PUBLIC sequencing can charge or fail-to-activate real users (`server.js:341-357`, `api.js:582-620,733`). Checklist gate.
- **P0-5** `🔥` emoji on every primary PWA surface — Consultant voice violation (`index.html:20,50`, `mirror.html:143`, `protocol.html:51`).

**P1 — fix before launch ideally (13)**
- P1-A landing Lookmaxxing path re-walk at flip time · P1-B `capture` blocks gallery (esp. full-body) · P1-C no upload progress · P1-D analysis failure forces full restart · P1-E no save/share/recover of free audit result · P1-F paywall card-vs-form selection trap on mobile · P1-G post-payment step points at broken login · P1-H paid-but-pending shows error-styled box, no auto-poll · P1-I no logout in PWA · P1-J camera-denied fallback has no message · P1-K reveal "airs Friday 8pm" with no delivery · P1-L Day-30 Re-Audit sold but not built · P1-M admin lacks north-star + all Lookmaxxing metrics.
- (P3-B footer Privacy/Terms raised to P1 given photo+payment data.)

**P2 — fix soon after launch (16)**
- P2-A no Lookmaxxing "how it works" on landing · P2-B 12-question gauntlet, no count/back · P2-C analysis dwell (no-op) · P2-D "opens this weekend" decays · P2-E "voice or text both work" unbuilt (Orator) · P2-F fabricated next-billing date · P2-G install button no-op feedback · P2-H "Profile" tab is not a profile (cancel/manage gap) · P2-I cross-sell copy density · P2-J no loading skeletons on cold start · P2-K baseline delta computed but hidden · P2-L protocol empty-state circular instruction · P2-M non-◆ glyphs vs iconography rule · P2-N reveal window vs week-strip mismatch · P2-O no abandoned-audit recovery / exit-intent · P2-P no post-purchase Day-1 onboarding for direct buyers · P2-Q admin "sent" alert during DRY-RUN.

**P3 — nice-to-have (7)**
- P3-A dead "Coming Soon" modal naming "The Aesthetic" · P3-C unapproved quiz draft copy · P3-D unapproved Aura++ chat bullet · P3-E crown photo `capture` self-capture impossible · P3-F share app-scheme silent fails · P3-G orphan root `admin.html` with 🔥.

---

## Open questions for the founder

1. **Login (P0-1):** For the first public cohort, do we (a) mint a Lookmaxxing session at payment-confirmed and deep-link them in, or (b) hard-gate launch on WhatsApp OTP being live + `WHATSAPP_OTP_ENABLED=true`? This determines the launch date.
2. **Day-30 Re-Audit (P1-L):** Build it into the PWA before launch, or remove the bullet from the paywall until it exists? It is the month-2 retention justification.
3. **Razorpay state (P0-4):** Are live keys (`rzp_live_*`) and `RAZORPAY_WEBHOOK_SECRET` set yet? Confirm the exact flip order before `PAYWALL_PUBLIC=true`.
4. **Privacy / Terms (P1/legal):** When do live Privacy + Terms pages land? Photo data + recurring payments make these launch-blocking, not polish.
5. **Quiz + placeholder copy (P3-C/P3-D):** Will you do an approval pass on the 11 draft quiz questions and the Aura++ "Consultant chat" bullet before launch, or should those be flagged to copy-consultant-agent?
6. **Subscription self-cancel (P2-H):** Does Razorpay/legal require in-product cancel at launch, or is email-to-support acceptable for the first cohort?
7. **Reveal airtime (P1-K):** Keep the "Friday 8pm" promise (and wire delivery), or soften to a non-time-specific line for launch?

---

*End of audit. No source files were modified. All findings are additions/removals/tweaks within the existing architecture, per charter.*
