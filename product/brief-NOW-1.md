# Build-Ready Brief — NOW-1: Carry the audit personalisation through the conversion seam + rescue the warm cohort

> Owner: Head of Conversion (lead), feature-product perspective folded in.
> Date: 2026-05-28. Mode: ANALYSIS / DRAFT ONLY — no source code changed in producing this brief.
> Source roadmap item: `product/ROADMAP_TO_1CR.md` §1 NOW-1. Merges conversion Ideas 1 + 7, features Idea 2 "Warm Capture", audit P0-3 + P2-O.
> Grounded in direct reads of: `public/audit.html`, `public/paywall.html`, `public/paywall-waitlist.html`, `routes/api.js`, `routes/audit.js`, `services/email.js`, `models/EarlyAccess.js`, `lib/messaging-mode.js`.
> Every user-facing string here is labelled `DRAFT — founder approval required` per CLAUDE.md §6 rule 5 / §9 checkpoint 7.

---

## 1. The bet in one paragraph

A user finishes the free audit — twelve questions, three photos — and sees their real Aura Score and the one axis that is their leverage point. Today that personalisation dies the instant they tap "See Your Protocol": they land on a generic waitlist (or, post-flip, a paywall) that never once mentions the score they just earned, and if they bounce they are never heard from again. NOW-1 closes both leaks. **First (ships pre-launch, channel-free):** the waitlist page echoes their actual score and leverage point above the form — the same echo the public paywall already does — so the momentum from "here is your specific weakness" flows straight into the ask instead of evaporating. The result also becomes recoverable: a "keep this reading" link to the page that already exists, so closing the tab no longer destroys a five-minute investment. **Second (gated on consent + a live channel):** an audit-finisher who gave us a contact and consented, then bounced without subscribing, receives exactly one dignified follow-up — "Your reading is held. <axis> was your leverage point. The work is yours when you're ready. ◆" — never a sequence, never urgency, never a second message. End to end: the warmest cohort in the product stops being thrown away, the spell is not broken at the seam, and the bounce is recoverable once and only once.

---

## 2. Concrete feature list

### Ships pre-launch / channel-free (no consent, no channel, no Razorpay needed)

- **F1 — Waitlist audit echo (fixes P0-3).**
  - Page: `public/paywall-waitlist.html`.
  - Reuse: the exact `loadAuditSummary()` pattern from `public/paywall.html:189-210` — read `auditSessionToken` (already parsed at `paywall-waitlist.html:95`), `fetch('/api/audit/result/' + token)`, compute the average of `data.scores` as the Aura Score, map `data.weakestAxis` through the `AXIS_LABELS` dict, render one line above the form.
  - Data fields consumed: `scores` (object), `weakestAxis` (string) — both already returned by `GET /api/audit/result/:sessionToken` (`routes/audit.js:137-149`). No new endpoint.
  - New markup: one `.audit-summary` block (copy the CSS rule from `paywall.html:43-50`) inserted between the lede (`paywall-waitlist.html:70`) and the form (`:72`). Hidden by default; shown only on a successful fetch.
  - Failure behaviour: if the fetch 404s/409s (expired >24h, or analysis incomplete), show nothing — identical guard to `paywall.html:199` (`if (!res.ok) return;`). The form still works.

- **F2 — Harden the existing public-paywall echo (pre-empts the flip).**
  - Page: `public/paywall.html`. The echo already exists and works; the only change is to confirm it degrades silently on an expired/forbidden token (it does at `:199`) and to share the `AXIS_LABELS` map and rendering with F1 so the two pages cannot drift. No copy change to the existing line.
  - This is a no-risk consolidation so that when `PAYWALL_PUBLIC` flips, the seam the user hits is already personalised on both sides of the gate.

- **F3 — "Keep this reading" recovery link on the audit result (fixes P1-E, channel-free half).**
  - Page: `public/audit.html`, Scene 6 result (`renderResult`, `:290-311`).
  - Reuse: the result page route already exists — `GET /audit/result/:token` (`server.js:165`) serves a standalone result page, and the client holds `sessionToken` at handoff (`audit.html:317`).
  - New UI: a single restrained affordance on the result scene — "Keep this reading" — that copies `${origin}/audit/result/${sessionToken}` to the clipboard (and, where `navigator.share` exists, offers the native share sheet with the same URL). No image generation, no canvas (the share-card is explicitly Backlog, not NOW-1).
  - Data field: none new. Purely the existing token + existing route.
  - DPDPA guard (verify, don't assume): confirm `/api/audit/result/:token` and the `/audit/result/:token` page return scores/diagnosis only and never a photo URL. `routes/audit.js:141-148` returns no image URLs — good; the standalone page at `server.js:165` must be re-checked to confirm the same.

### Gated on consent + a live channel (DO NOT ship ahead of §0-A2 lawyer copy + a live Resend/WhatsApp channel)

- **F4 — Consent + contact capture at the waitlist form (precondition for F5).**
  - Page: `public/paywall-waitlist.html` form (`:72-83`); endpoint `POST /api/waitlist/early-access` (`routes/api.js:458-476`); model `EarlyAccess.add` (`models/EarlyAccess.js:45-61`).
  - New fields: (a) an **optional email input** (today only name + phone are captured — `:74-80`), so an email-channel follow-up is possible without WhatsApp being live; (b) a **single explicit consent checkbox** — "I'd like one reminder of my reading. ◆" — stored as a boolean on the EarlyAccess entry; (c) persist a `consentFollowupAt` timestamp and `consentChannel` (`email`|`whatsapp`) when ticked.
  - Model change: extend `EarlyAccess.add` to accept and store `email`, `followupConsent` (bool), `consentAt` (ISO), and reuse the existing `sourceAuditSessionToken` (already stored at `:55`) as the link back to the score/axis for the follow-up body.
  - This is the **consent gate** security BLOCKER #3 / §0-B3 requires. No follow-up may reference a contact captured without this tick.

- **F5 — Exactly-one abandoned-audit follow-up (fixes P2-O).**
  - Trigger rule (precise, single-fire): an EarlyAccess entry where `followupConsent === true` AND `sourceAuditSessionToken` resolves to a completed audit AND the phone/email is NOT present as an active subscriber in `User` (i.e. they bounced) AND `followupSentAt` is unset AND `now - consentAt >= 20h` (sit-with-it window) → send one message, then stamp `followupSentAt`. The `followupSentAt` stamp makes a second send structurally impossible.
  - Reuse: `email.sendAuditConfirmation({ user, auditSessionToken })` already exists (`services/email.js:194-205`) and already builds the result URL — adapt it (or add a sibling `sendAuditRecovery`) for the recovery body; route every send through the shared kill-switch (`lib/messaging-mode.js` `isEmailAllowed` / `isPhoneAllowed`) so it is DRY-RUN-safe until `WHATSAPP_SEND_MODE=all`.
  - Channel: email-first (Resend) because it has the shortest path to live; WhatsApp variant lights up later behind the same guard. Body references the user's real score + axis pulled from `sourceAuditSessionToken`.
  - Delivery mechanism: a small pull/cron evaluation reusing the existing scheduler pattern (`services/scheduler.js`). **Note the landmine:** Render free tier sleeps and `data/early-access.json` is wiped on redeploy — so for launch this is acceptable-but-lossy; durable queueing is a Postgres dependency tracked in §2/§3 of the roadmap, not this brief.

---

## 3. User experience walkthrough

### Path A — finisher who reaches the waitlist (pre-launch, live today)

1. User completes audit → Scene 6 shows score + diagnosis (unchanged).
2. **F3:** Below the diagnosis, a quiet line + control appears.
   - `DRAFT — founder approval required:` "Keep this reading. It stays where you can find it."
   - Tapping copies the result link (toast: `DRAFT — founder approval required:` "Link copied. Your reading is saved.").
3. User taps "See Your Protocol →" → `/paywall` → waitlist mode.
4. **F1:** Above the "Hold my place" form, the echo renders:
   - `DRAFT — founder approval required:` "Your Aura Score: **62/100**. Hair density is your leverage point. Hold your place — the first cohort is walked in by hand."
   - (Score and axis are the user's real values; only the framing sentence is draft. If the token is expired, this block is silently absent and the page reads exactly as it does today.)
5. **F4:** The form now offers an optional email field and one consent line.
   - `DRAFT — founder approval required:` consent label "Send me one reminder of my reading. Nothing more." (unticked by default — no pre-checked boxes, ever).
6. User submits → existing confirmation (unchanged): "You're on the list. When the doors open, yours opens first. ◆ MainCharacter" (`routes/api.js:474`).

### Path B — finisher who reaches the public paywall (post-flip)

1. Same audit finish + F3 recovery link.
2. `/paywall` public mode already echoes the score/axis (`paywall.html:189-210`) — **F2** only guarantees it degrades cleanly and shares the axis map with F1. No new copy.

### Path C — the bounce, recovered once (gated)

1. User consented at step 5 (F4), then closed the tab without subscribing.
2. ~20h later, the single follow-up fires (F5), email-first:
   - `DRAFT — founder approval required:` Subject: "Your reading is held." Body: "Your reading is held. Hair density was your leverage point — the one place the work pays back fastest. It is here when you are ready. ◆ MainCharacter" followed by the result link.
3. No second message exists. If they return and subscribe, nothing further fires. If they ignore it, silence — that is the design.

All draft strings: no exclamation marks, no emoji except ◆, specific to what the user did, end on quiet confidence. Founder approves each at Phase 2 start (CLAUDE.md §9 checkpoint 7).

---

## 4. KPIs to track

Event vocabulary aligns with NOW-0 instrumentation: `audit_started`, `quiz_completed`, `photos_submitted`, `analysis_shown`, `paywall_viewed`, `card_selected`, `subscribe_clicked`, `subscription_activated`. NOW-1 adds three first-class events and reads the seam between two existing ones.

**Log location:** the NOW-0 append-only event sink (JSON-CRUD pattern, `data/events.json` → Postgres later), keyed by `auditSessionToken` then `userId`. Surfaced on `/admin` (the new Lookmaxxing funnel tiles from P1-M / NOW-0). New events emitted by NOW-1: `audit_result_kept` (F3 link copied/shared), `recovery_consent_given` (F4 tick), `recovery_sent` and `recovery_reconverted` (F5).

**Primary funnel metric (the thing this bet moves):**
- `analysis_shown → paywall_action` seam rate — where `paywall_action` = `waitlist_joined` (pre-launch) or `subscribe_clicked` (post-flip). This is audit P0-3's seam. Target **+3–5pp**.
  - /admin tile name: **"Seam: Result → Action"** (with the pp delta vs the no-echo baseline).

**Leading indicators (read in days):**
- Echo render rate: `% of paywall_viewed where audit-echo successfully rendered` (catches token-expiry / fetch-failure regressions). /admin tile: **"Echo shown %"**.
- `audit_result_kept` rate: `% of analysis_shown that copied/shared the reading` (F3 adoption). /admin tile: **"Readings kept %"**.
- `recovery_consent_given` rate: `% of waitlist_joined that ticked consent` (F4 — also the size of the addressable recovery pool). /admin tile: **"Follow-up consent %"**.

**Lagging indicators (read in weeks):**
- Seam lift sustained over ≥100 conversions per arm before any call (hard rule: no winner under 100 conversions/variant).
- `recovery_reconverted` rate: `% of recovery_sent who subsequently subscribe within 7d`. Target recovery of **3–5%** of consented abandoners. /admin tile: **"Recovered subs"**.
- Net seam contribution to `subscription_activated` (the only number that is real revenue).

**Counter-metrics (the lines we must not cross — trust is the moat):**
- **Over-messaging guard:** `messages_per_recovered_user` must stay at exactly 1.0. Any value >1.0 is a P0 regression — the follow-up is one-shot by design (`followupSentAt` stamp). /admin tile: **"Msgs / abandoner (cap 1.0)"**.
- **Unsubscribe / complaint rate on the follow-up** — if email complaint rate >0.3% or any "stop messaging me" reply appears, halt F5. The dignified positioning is worth more than the recovered points.
- **Consent integrity:** `recovery_sent` to a contact with `followupConsent !== true` must be **zero** — assert it in a test, alert on any nonzero.
- **Echo-on-stale guard:** an echo must never render a wrong/another user's score — verify the per-token fetch and the silent-404 path (showing nothing is always safer than showing wrong).

---

## 5. Out of scope

- **Login (P0-1) / minting a session.** NOW-1 does not fix how a paid user logs in — it is a hard upstream dependency (§0-B1), not part of this brief.
- **The shareable Aura *image* card** (canvas-rendered obsidian/gold artifact). F3 ships the recoverable *link* only; the share-creative push is roadmap Backlog and the riskiest brand surface — deferred until the funnel is proven and copy is founder-locked.
- **Photo-upload failure recovery (P0-2).** Separate roadmap item (conversion Idea 4); not folded here.
- **UPI Autopay default + transparency line, one-click cancel, bundle tag A/B** — NOW-2/NOW-3 and §2 items; not this brief.
- **Day-30 re-audit, first-reading onboarding, abandoned-audit *sequences*.** F5 is exactly one message, forever; any multi-touch nurture is explicitly out of scope and off-brand.
- **WhatsApp-channel follow-up as the launch default.** Email-first; the WhatsApp variant is the same code behind the same guard but is not the path we light up first.
- **Postgres / durable queue.** F5 runs on the existing JSON store + scheduler with the known redeploy-loss caveat; durable queueing is a scale-readiness call, not this brief.
- **Removing the unapproved Aura++ "Consultant chat" bullet (P3-D)** and the `🔥` removal (P0-5) — separate §0 gates, called out in NOW-3 / 0-B4.

---

## 6. Dependencies in order

**Pre-launch / channel-free half (F1, F2, F3) — buildable now:**
1. **NOW-0 instrumentation live** — so the seam lift is measurable, not vibes (roadmap precondition). F1/F3 can ship before it, but cannot be *read* without it.
2. `GET /api/audit/result/:sessionToken` — already live (`routes/audit.js:137`). No work.
3. Confirm `/audit/result/:token` standalone page (`server.js:165`) returns scores/diagnosis only, no photo URLs (DPDPA spot-check) — verification, not a build.
4. Founder copy approval for the F1 echo framing sentence and the F3 "keep this reading" line (§9 checkpoint 7).

**Consent + channel half (F4, F5) — gated, do not ship ahead of these:**
5. **§0-A2 — lawyer-drafted DPDPA Privacy Policy + Terms** covering biometric photo data and outreach lawful basis. External lead time — the long pole. No outreach to a captured contact may precede this.
6. **§0-B3 — consent infrastructure** (the checkbox + 18+ confirmation + deletion/export endpoints). F4's tick is part of this surface.
7. **A live channel** — Resend (`RESEND_API_KEY` set) for email-first, and/or WhatsApp Meta creds + `WHATSAPP_SEND_MODE=all`. Until then F5 is DRY-RUN-safe behind `lib/messaging-mode.js` and sends nothing.
8. **Founder copy approval** for the single F5 follow-up subject + body (§9 checkpoint 7).
9. **`EarlyAccess` model extension** (email, `followupConsent`, `consentAt`, `followupSentAt`) — small JSON-CRUD change, test-first per §6 rule 6.

**Build order:** NOW-0 → F2 (consolidate, zero-risk) → F1 (echo) → F3 (recovery link) → [gate: 5,6,7,8] → F4 (consent capture) → F5 (one follow-up). Echo + recovery-link ship at/around launch; the follow-up lights up only after the gate clears.

---

## 7. Honest build estimate

| Piece | Claude Code autopilot | Founder hours | Notes |
|---|---|---|---|
| F2 echo consolidation + DPDPA spot-check | ~1.5 h | — | Lowest risk; shared axis map + silent-fail guard. |
| F1 waitlist echo (+ tests) | ~2 h | 0.25 h (approve echo line) | Reuses `loadAuditSummary`; one markup block + CSS copy. |
| F3 "keep this reading" link (+ tests) | ~2.5 h | 0.25 h (approve line) | Clipboard + `navigator.share`; route already exists. |
| Instrumentation hooks for NOW-1 events | ~1.5 h | — | Assumes NOW-0 sink exists; adds 4 emit points + 4 admin tiles. |
| F4 consent + email capture + model extension (+ tests) | ~3 h | 0.5 h (approve consent label, confirm 18+/consent wording with lawyer) | Gated; do not deploy ahead of legal. |
| F5 one-shot follow-up (+ regression test for the 1.0 cap & consent-required assertions) | ~3.5 h | 0.5 h (approve subject + body) | Gated on live channel; DRY-RUN-safe before. |
| QA: brand-voice sweep + smoke + counter-metric tests | ~2 h | 0.5 h (read seam end-to-end) | Per §7 Definition of Done. |

- **Total Claude Code autopilot:** ~16 hours (~9 h for the pre-launch/channel-free half F1–F3 + instrumentation + QA; ~7 h for the gated F4–F5 half).
- **Total founder hours:** ~2.75 h (copy approvals + one legal/consent wording confirmation + one end-to-end walk).
- **Wall-clock:** the channel-free half is **~2 days** once NOW-0 lands. The gated half is **blocked on §0-A2 (lawyer — external lead time, likely the multi-day/week long pole) and a live channel**, so its wall-clock is "≈1 day of build, whenever the legal + channel gate clears." Start the lawyer engagement now so it is not the thing the funnel waits on.

---

*End of brief. No source files modified. All user-facing strings are DRAFT pending founder approval (CLAUDE.md §2 voice, §6 rule 5, §9 checkpoint 7). The follow-up half (F4/F5) must not ship ahead of the DPDPA consent/legal gate and a live channel.*
