# Build Brief — NOW-2: The Day-30 Re-Audit (the renewal engine)

> Owner: Head of Retention, MainCharacter. Date: 2026-05-28.
> Mode: ANALYSIS / DRAFT ONLY. No source code changed. This is a build-ready brief to hand to feature-product-agent → copy-consultant-agent (founder approves all copy) → backend + frontend.
> Lineage: ROADMAP_TO_1CR §1 NOW-2; audit P1-L ("Day-30 Re-Audit sold but unbuilt") + P2-K (discarded `deltaVsBaseline`); opportunities-retention Idea 1 + Idea 2; opportunities-features Idea 4.
> Hard constraints (non-negotiable): Consultant voice (CLAUDE.md §2 — no emoji but ◆, no exclamation marks, no hype), the deferral list (Postgres / R2 / ffmpeg / VAPID / WhatsApp-live), founder-approval on every user-facing string (CLAUDE.md §6.5), test-first (CLAUDE.md §6.6).

---

## 1. The bet in one paragraph

The paywall already sells a "Day-30 Re-Audit" (`paywall.html:134`), but it does not exist anywhere in the product (audit P1-L: no route, no UI, no scheduler). NOW-2 builds it as the single proof-of-progress moment that justifies paying ₹1,499 for a second month. Here is the end-to-end experience after this ships: a paid Lookmaxxing subscriber logs in (via the NOW-0/0-B1 login that must land first), does their daily mirror and protocol for a month, and on or after their 30th day the dashboard surfaces one calm, pull-based card — "Your 30 days are complete. Sit for the second reading." No push, no notification needed. They tap it, re-run the exact same audit funnel they already know (now flagged `reAudit:true`, against the baseline scores captured at signup), and receive a side-by-side: their Day-1 reading next to their Day-30 reading, the eight axes with per-axis deltas drawn on the gold trajectory canvas reused from the Weekly Reveal, and the original leverage-point axis called out by name and movement. The Consultant frames it honestly — a rise reads as measured movement (never confetti), and a *drop* reads as signal pointing at the protocol lever (never failure, never a bare red minus). It closes on the Mirror Level they have reached and one quiet line on what month two builds. Crucially it lands a few days *before* the renewal charge, so the answer to the only question a slow-payoff subscriber actually has at Day 30 — "is this working?" — arrives in their own data, before the money question.

---

## 2. Concrete feature list (new vs reused)

**REUSED (already in the codebase — do not rebuild):**
- The entire audit funnel: `/api/audit/session` → `/quiz` → `/photos` → `/analyze` → `/result/:token` (`routes/audit.js`), the 8-axis Gemini Vision scorer (`services/vision.scoreAesthetic` + `data/lookmax-prompts.buildAestheticPrompt`), and the result render scenes (`audit.html` Scene 5/6). **No new AI, no new model.**
- The `reAudit` flag — **already accepted and stored** at `audit.js:27` (`AuditSession.createSession({ reAudit: !!reAudit })`). Today nothing reads it downstream; NOW-2 is what gives it meaning.
- The stored baseline scores: `AuditSession.aestheticScores`, reachable via `user.auditSessionId`. `loadBaseline(user)` already exists at `lookmax.js:123-132` and is the read path to clone.
- The trajectory canvas: `reveal.html:83-95` `drawTrajectory(scores)` draws a gold polyline (`#e8b84b`) from a `scores[]` array, axis 0–100. Directly reusable to draw a baseline→Day-30 line (per-axis or overall).
- The Mirror Level computation: `mirrorLevelFor(score)` + `overallOf(axes)` (`lookmax.js:34-47`), already exported.
- The pull-trigger anchor: `user.lookmaxxingStartedAt`, set at payment activation (`api.js:685`). `daysSincePayment = (now - lookmaxxingStartedAt) / 86400000`.
- The dashboard tile surface: `GET /api/lookmax/dashboard` (`lookmax.js:266`) and `public/lookmax/index.html` — the card slots in here.

**NEW (the actual build):**
- **Durable baseline snapshot on the User record.** *Load-bearing landmine:* `AuditSession` has a **24h TTL** (it is purged via `purgeExpired`, per `PROGRESS.log` P0.5). So `user.auditSessionId` will not resolve a session at Day 30 — `loadBaseline` returns null and there is nothing to compare. **At payment-activation (or first mirror), copy the baseline `aestheticScores`, `weakestAxis`/leverage axis, and a baseline photo reference onto a new durable field on the User record** (e.g. `lookmaxBaseline: { scores, leverageAxis, overall, capturedAt, photoStorageKey }`). This is the one piece that *must* be new and durable, independent of the 24h session.
- **A re-audit eligibility + state endpoint.** `GET /api/lookmax/reaudit/status` → `{ eligible: bool, daysSincePayment, completed: bool, baselineAvailable: bool }`. Eligible when `lookmaxxingActive && daysSincePayment >= 30 && !reAuditCompletedThisCycle && baselineAvailable`. Pull-based only — no scheduler, no push.
- **A re-audit submission path that diffs against the durable baseline.** Reuse the audit funnel with `reAudit:true` + `userToken`; on `/analyze` completion, compute per-axis deltas and overall delta against `user.lookmaxBaseline.scores` (the same arithmetic already in `lookmax.js:96-101` for `deltaVsBaseline`), and persist a `reAuditResult` (Day-30 scores + deltas + new Mirror Level + completedAt) on the User/Lookmax record so it is idempotent and re-viewable.
- **The dashboard pull-card.** When `reaudit/status.eligible`, render a single calm card on `index.html` ("Your 30 days are complete. Sit for the second reading.") deep-linking into the re-audit flow. When `completed`, the card becomes a "View your second reading" entry to the saved side-by-side.
- **The side-by-side reveal view.** A new view (its own page or a mode of the result scene) that renders: baseline overall vs Day-30 overall; the 8 axes as paired bars/numbers with signed deltas; the leverage-axis callout by name; the trajectory canvas (reused) drawn baseline→now; the Mirror Level reached; and the Consultant's framing line(s). This is the only substantial new front-end.
- **Down-delta presentation logic** (spec'd in §3) — a deterministic rule for how a flat or negative delta renders, so the UI never shows a bare red minus and the copy never reads as failure.
- **Instrumentation events** (depends on NOW-0): `re_audit_card_shown`, `re_audit_started`, `re_audit_completed`, plus delta sign captured (see §4).
- **(Deferred enhancement, NOT in v1 scope):** a Day-30 WhatsApp/push nudge. The pull-card works channel-free; the nudge rides later once a channel + VAPID are live.

---

## 3. User experience walkthrough (step by step)

> All Consultant lines below are marked **DRAFT — founder approval required** (CLAUDE.md §6.5). They are placeholders to convey intent and cadence; copy-consultant-agent drafts the finals, founder owns sign-off. Voice rules enforced throughout: no emoji but ◆, no exclamation marks, restrained, specific, ends in quiet confidence.

**Step 1 — Eligibility (silent).** Each dashboard load calls `GET /api/lookmax/reaudit/status`. For days 1–29, the card does not appear at all (no countdown, no teasing — a countdown that the user stares at for 29 days is anti-hype). The subscriber simply does their daily mirror.

**Step 2 — The card appears (Day 30+, pull-based).** On the first dashboard load where `daysSincePayment >= 30`, a single card surfaces above the daily tiles.
> **DRAFT — founder approval required:**
> *Heading:* "Thirty days of the work are complete."
> *Body:* "The second reading is ready. Sit for it when you have good light and a steady minute. This is the measured one — Day 1 beside today."
> *CTA:* "Begin the second reading ◆"

**Step 3 — The re-audit (familiar funnel).** Tapping the CTA opens the audit funnel with `reAudit:true` and the user's token attached. They retake the photos (and, optionally, re-answer a trimmed quiz — founder decision; recommend photos-only to lower friction since the quiz answers rarely move in 30 days). The dwell/analysis screen is the existing one. No new copy needed here beyond a one-line frame.
> **DRAFT — founder approval required (analysis dwell line):** "The first reading is held. This one sits beside it."

**Step 4 — The side-by-side reveal.** The payoff screen. Layout: baseline overall score and Day-30 overall score side by side; the trajectory canvas drawing the line between them; the eight axes listed with their baseline → today values and a signed delta each; the leverage axis called out by name; the Mirror Level reached.

**Step 4a — When the reading rose (the common, hoped-for case).** Anti-hype is mandatory. No confetti, no "Amazing," no exclamation. The Consultant states the movement plainly and credits the work, not the app.
> **DRAFT — founder approval required:**
> "Your jaw definition was the leverage point on Day 1. It has moved +9. Skin clarity carried the overall from 58 to 64. This is not flattery — it is the measurement. Thirty more days compounds it. ◆ MainCharacter"

**Step 4b — When a score DROPPED or stayed flat (THE CRITICAL CASE — spec'd explicitly).** A subscriber who paid ₹1,499 and sees a red minus at the renewal decision is the single worst-timed churn trigger in the product (opportunities-retention Idea 1 Risk). The rule is hard and deterministic:

1. **Never render a bare red minus and never a downward red trajectory on the reveal.** In the per-axis list, a negative delta is shown in neutral ink (`#f4f1ea`), not in a loss/red colour. The trajectory canvas, if overall fell, is drawn in muted gold (not red) and the framing carries the meaning — the line is never the verdict.
2. **A drop reads as SIGNAL, not failure, and always points at a protocol lever — never a bare lower number, never an apology, never hype to paper over it.** The Consultant names the most likely controllable cause (sleep, hydration, lighting/angle variance, a hard month) honestly, frames 30 days as calibration not conclusion, and points forward to the lever the protocol already targets.
3. **If the *overall* fell, lead with an axis that held or rose** (there is almost always one across eight axes), then address the dip as the thing the next 30 days works on. Do not open on the loss.
4. **If multiple axes fell and none rose** (rare, usually lighting/weight/a genuinely bad month), suppress the per-axis red entirely, show the trajectory muted, and let the Consultant speak to calibration and the single most actionable lever — never a wall of minuses.

> **DRAFT — founder approval required (single axis dipped, overall up or flat):**
> "Your skin clarity reads 3 below Day 1. Thirty days is short for skin, and a single morning's light swings it more than a month of work does. Hold the protocol. The reading is a data point, not a verdict — your jaw line moved +6 in the same window, and that is the structural one. ◆ MainCharacter"

> **DRAFT — founder approval required (overall dipped — the hardest case):**
> "The composite reads lower than Day 1. Before you read that as the work failing: most of this is the conditions of one photograph, not thirty days of discipline. Your posture held. The protocol does not change. A reading that drops is the month telling you where to aim the next one — and we now know exactly where. ◆ MainCharacter"

**Step 5 — The close (always).** Regardless of direction, the reveal ends on the Mirror Level reached and one forward line. The renewal is implicit — there is no "renew now" hard-sell button on this screen (that would convert the proof moment into a checkout, killing the dignity). The card simply leaves the subscriber having seen their own measured month.
> **DRAFT — founder approval required:** "You entered as Raw. You are reading Polished. Month two is where the line gets harder to argue with. ◆ MainCharacter"

**Step 6 — Re-viewable.** The side-by-side persists (`reAuditResult` on the record), so the subscriber can return to it from the dashboard ("View your second reading"). It is not a one-time ephemeral screen they can lose by closing the tab (the P1-E failure class).

---

## 4. KPIs to track (exact metric/event names, log location, admin tiles)

All events append to the NOW-0 event sink (the append-only JSON event store specified in ROADMAP §NOW-0), keyed by the existing user `token`. Surfaced as tiles on `/admin` (extends the P1-M admin gap). The retention dashboard (opportunities-retention §"How I'd measure") is the home for the lagging metrics.

**Leading indicators (days — watch within the first cohort to reach Day 30):**
- `re_audit_card_shown` — fired when `reaudit/status.eligible` first renders the card for a user. Tile: **"Re-Audit cards shown."**
- `re_audit_started` — fired on `/api/audit/session` with `reAudit:true`. Tile: **"Re-Audit started."**
- `re_audit_completed` — fired on the re-audit `/analyze` success. Tile: **"Re-Audit completed."**
- **`re_audit_completion_rate`** = `re_audit_completed / re_audit_card_shown`. The headline leading metric: did the card convert to a finished second reading. Tile: **"Re-Audit completion rate."**
- **`positive_delta_rate`** = share of completed re-audits where overall Day-30 delta > 0. The product-health canary: if this is low, the protocol/scoring needs work, not the copy. Captured as a `delta_sign` field (`up` / `flat` / `down`) on the `re_audit_completed` event. Tile: **"Positive-delta rate."**

**Lagging indicators (weeks/months — the actual money):**
- **`day30_to_month2_retention`** = % of users who reached Day 30 who are still `lookmaxxingActive` at Day 60 (i.e. the renewal charge succeeded and was not cancelled). This is the metric NOW-2 exists to move. Target from the roadmap: **+8pp** of the at-risk Month-1 cohort into Month-2, cutting effective churn ~12% → ~8–9%. Tile: **"Day-30 → Month-2 retention."**
- **`month2_retention_split_by_delta`** = Month-2 retention for `delta_sign = up` cohort vs `down/flat` cohort. This is how we *prove the bet*: if up-delta subscribers renew materially better than down-delta ones, the proof moment is doing its job; if there's no gap, the re-audit isn't the lever (or the copy isn't landing). The most important analytical cut.

**Counter-metrics (the things that would mean this backfired — watch these as hard as the wins):**
- **`down_delta_cancel_spike`** — cancellation rate within 72h of a `re_audit_completed` event where `delta_sign = down`, compared to the baseline cancel rate. **This is the single most important counter-metric: if a down-delta reveal is causing subscribers to cancel, the down-delta copy (Step 4b) has failed and must be revised or the reveal gated.** Tile: **"Post-re-audit cancels (down-delta)."**
- `re_audit_abandon_rate` = `(re_audit_started − re_audit_completed) / re_audit_started`. A high abandon (started the photos, never finished) flags friction in the funnel or anxiety about the result.
- `refund_requests_post_reaudit` — any refund/chargeback within 7 days of a re-audit, tagged by delta sign. Watches the "I paid and it told me I got worse" liability directly.

**Log location:** all of the above route through the NOW-0 event sink (append-only, JSON-CRUD pattern matching `models/`); the existing structured logger (`lib/log.js`, tag `LOOKMAX` / a new `REAUDIT` tag) carries the operational trace. No PII in events beyond the user token (DPDPA — see security §6 PII-masking).

---

## 5. Out of scope (explicitly NOT in NOW-2 v1)

- **Any push/WhatsApp Day-30 nudge.** Pull-card only. The nudge is a later enhancement gated on a live channel + VAPID (deferral list). Building it now violates the "plan around current state" rule.
- **The scheduler / cron Day-30 trigger.** Eligibility is computed on-read (`daysSincePayment >= 30`), not by a cron job. The Render free tier sleeps and kills cron (CLAUDE.md landmine #2) — a pull check sidesteps that entirely.
- **The risk-reversal "30-day measurable-change-or-pause" promise** (ROADMAP §3 backlog / conversion Idea 5). That *depends on* NOW-2 existing and on a Razorpay billing-pause path + legal-finance sign-off. Queue it after NOW-2 ships and shows real `positive_delta_rate`.
- **The daily "vs Day 1" baseline delta line on the Mirror** (NOW-2's sibling, §2-item-3 / retention Idea 2 / P2-K). Related and shares the durable-baseline dependency, but it is a separate, smaller build. NOW-2 *creates the durable baseline it needs*, so it should follow closely — but it is not this brief.
- **The earned-moment Aura++ cross-sell** triggered by a positive re-audit (NOW-3 / retention Idea 10). The positive re-audit is a trigger *source* for it, but the cross-sell itself is NOW-3.
- **A real stitched Re-Audit video.** ffmpeg is deferred. The side-by-side is a canvas + DOM render, exactly like the Weekly Reveal stub.
- **First-Reading onboarding for direct-bundle buyers with no baseline** (§2-item-5 / features Idea 8 / P2-P). NOW-2 *gates on a baseline existing* and degrades gracefully when absent (card simply does not show); it does not build the missing-baseline onboarding. That is a dependency to flag, not to build here.
- **Quiz re-answering UX polish.** Recommend photos-only re-audit for v1 to minimise friction; a full quiz retake is a founder decision, not a v1 requirement.

---

## 6. Dependencies, in order

1. **Login (0-B1) — ABSOLUTE PRECONDITION.** A non-admin paying subscriber currently has no working door into `/lookmax/*` (audit P0-1: OTP dormant, admin-login rejects customers). Until a real payer can log in, the re-audit card has no one to show to. Nothing in NOW-2 reaches a customer before this lands. This is the headline gate for the entire §1 roadmap.

2. **NOW-0 instrumentation.** The event sink must exist before NOW-2 ships, or every KPI in §4 is called on vibes — and the down-delta counter-metric (`down_delta_cancel_spike`) is the one that tells us if we are *hurting* retention. Shipping the reveal blind to that is reckless. Build NOW-0 first.

3. **R2 — STRONGLY WANTED (degrades hard without it). Be explicit about this:**
   - **What R2 protects:** the *durable baseline snapshot* (§2 "NEW") solves the **score numbers** surviving to Day 30 by copying them onto the User record — so the side-by-side *numbers* and deltas work even without R2. **But the baseline and Day-30 photos are the visual proof, and those are the most persuasive half of the reveal.**
   - **Audit baseline photos** go through `services/storage.js`, which *does* have an R2 path but falls back to local `/tmp` when `R2_*` is unset. **Mirror photos go through `services/photos.js`, which has NO R2 path at all — always `/tmp`** (it literally logs "volatile, will be lost on next Render redeploy" on every save, `photos.js:47`).
   - **What degrades without R2:** on any Render redeploy (which happens on every push), `/tmp` is wiped. The Day-1 baseline photo is gone before Day 30 arrives. The reveal then degrades to a **numbers-and-trajectory-only** side-by-side — the deltas still render (because the *numbers* are on the durable User record), but there is **no "see your Day-1 face beside your Day-30 face"** — which is the emotional core of the proof moment. The trajectory line and the per-axis deltas survive; the visual before/after does not.
   - **Recommendation:** provision R2 before NOW-2 reaches real money. Route both `storage.js` *and* `photos.js` through R2 (the latter needs the R2 path added — it has none today). Until then, ship the numbers-only side-by-side as a working-but-lesser v1 and label the photo half as the R2-gated enhancement. **Do not** promise the visual before/after on the paywall until R2 is live behind it.

4. **Durable baseline snapshot field (in-build, not infra).** Independent of R2 but must land *inside this build*: because `AuditSession` has a 24h TTL, the numeric baseline must be copied onto the User record at payment-activation/first-mirror. Without this, `loadBaseline` returns null at Day 30 and there is nothing to diff — the re-audit would have no "Day 1" side. This is the most important new line of backend work.

5. **Postgres — wanted, not blocking.** `users.json` is wiped on redeploy (landmine #1), which would lose the durable baseline and the `reAuditResult` along with the whole account. So Postgres makes NOW-2 *trustworthy at sustained volume*, but the feature is buildable and demonstrable on the JSON store for the first cohort. Sequence Postgres by revenue threshold (scale-readiness), not as a NOW-2 blocker.

**Order to build:** login (0-B1) → NOW-0 events → durable baseline snapshot → re-audit status/submit endpoints → dashboard card → side-by-side reveal → (R2 lights up the photo half). Provision R2 in parallel with the engineering.

---

## 7. Honest build estimate

Scope: backend (durable baseline snapshot at activation; `reaudit/status` + re-audit-submit-with-diff endpoints; persist `reAuditResult`; NOW-2 events), frontend (dashboard pull-card; the side-by-side reveal view reusing the trajectory canvas), and copy hand-off. Reuses the audit funnel, vision scorer, `reAudit` flag, baseline read path, trajectory canvas, and Mirror Level math — so the heavy lifting is integration and the reveal render, not new systems. Excludes the login gate, NOW-0, and R2 provisioning (counted as their own prerequisites above).

- **Claude Code autopilot hours:** ~14–20 hours of focused agent time. Breakdown: durable-baseline snapshot + tests ~2–3h; status/submit endpoints + delta diff + persistence + tests ~4–5h; dashboard card ~1–2h; side-by-side reveal view (the largest piece — paired-axis layout, delta rendering, down-delta neutral-ink logic, trajectory reuse) ~5–7h; NOW-2 event wiring + admin tiles ~2–3h. Test-first throughout (CLAUDE.md §6.6) is included in these numbers.
- **Founder hours:** ~3–5 hours, almost entirely **copy approval** — this feature is unusually copy-heavy because the down-delta framing (Step 4b) is the highest-stakes voice surface in the product and must be exact. Budget: ~2–3h reviewing/approving copy-consultant drafts (rise, single-dip, overall-dip, flat, close lines), ~1h R2 provisioning decision + setting `R2_*` env vars, ~1h dogfooding one real end-to-end re-audit (which requires login + a seeded ≥30-day account).
- **Wall-clock:** **~3–4 working days** once the prerequisites (login, NOW-0) are in place and R2 is decided. If R2 is provisioned in parallel, no added wall-clock; if deferred, ship the numbers-only v1 in the same window and add the photo half later. Add the prerequisite time separately — this estimate assumes login and the event sink already exist.

> Risk note on the estimate: the side-by-side reveal and the down-delta logic are where the hours concentrate and where the copy review is load-bearing. Under-investing in the down-delta path is the way this feature *causes* churn instead of preventing it — `down_delta_cancel_spike` (§4) is the metric that catches it, and the copy quality is what prevents it.

---

*End of brief. No source files modified. Every line respects the Consultant voice (CLAUDE.md §2), the deferral list (Postgres/R2/ffmpeg/VAPID/WhatsApp-live), and the founder-approval checkpoints (CLAUDE.md §6.5/§9). All DRAFT copy is placeholder pending copy-consultant-agent + founder sign-off.*
