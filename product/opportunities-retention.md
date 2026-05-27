# Lookmaxxing — Retention Opportunities

> Prepared by: Head of Retention, MainCharacter
> Date: 2026-05-28
> Charter: cohort survival (Day-7 / Day-30 / Month-3), re-engagement, milestone reveals, Day-30 Re-Audit, win-back. Analysis only — no code. Every idea is an addition within the existing architecture (CLAUDE.md §3 / handoff §6). Brand voice (CLAUDE.md §2) and the deferral list (handoff §9) are hard constraints, not aspirations.

---

## The retention thesis (read this first)

Lookmaxxing is a **slow-payoff** product. Real skin/jaw/hair change takes weeks. The market research is blunt about the consequence: **results-delay is the #1 churn driver in aesthetic subscriptions** (growth/research-india-aesthetic-market.md §"What this means" — Traya's 5-month money-back guarantee exists precisely to hold people through the lag). At ₹1,499 ARPU, the entire P&L turns on whether a subscriber survives the gap between "I paid" and "I can see it working."

So the retention job is narrow and specific: **make invisible early progress feel visible**, and **convert the Day-30 Re-Audit from a sold-but-unbuilt promise (audit P1-L) into the month-2 renewal engine.** Everything below serves one of those two goals, plus the involuntary-churn and win-back edges.

### Why churn reduction is the biggest MRR lever (the compounding model)

MRR at steady state ≈ (monthly new paid) ÷ (monthly churn rate). Churn is the denominator — it compounds every month, acquisition does not. A subscriber's lifetime value is `ARPU ÷ churn`. At ₹1,499:

| Monthly churn | Avg lifetime | LTV per Lookmaxxing sub |
|---|---|---|
| 12% | 8.3 mo | ₹12,450 |
| 9% | 11.1 mo | ₹16,650 |
| 7% | 14.3 mo | ₹21,450 |
| 5% | 20.0 mo | ₹29,980 |

Cutting churn from 12% → 7% is a **+72% LTV swing on the same acquisition spend.** It also raises the steady-state subscriber count for a fixed acquisition rate: at 1,000 new paid/mo, steady-state base = `1000 ÷ churn` → 8,333 subs at 12% vs 14,286 at 7%. The path to ₹1Cr MRR (~6,600 Aura++ or ~12,500 Orator-equivalent subs) is **much shorter through the denominator than the numerator.** This is why retention, not acquisition, is the headline MRR multiplier — and why the ideas below are modelled on churn-points-saved, not vanity engagement.

### Honest infra reality (what I am NOT allowed to assume)

Per handoff §9 and the security audit, these are deferred and gate several ideas:
- **WhatsApp sends are DRY-RUN** until Meta approves the WABA. Any nudge/win-back over WhatsApp is *built now, dormant until live*.
- **Push (VAPID) is not provisioned.** No web push exists yet (5-min founder task, but not done).
- **R2 is not provisioned** → photos live in volatile `/tmp`, wiped on redeploy. Any before/after that depends on **persisted** baseline photos is fragile until R2 lands.
- **ffmpeg is not in the container** → real Weekly Reveal MP4 is deferred; only the client-side canvas slideshow stub exists.
- **Postgres is deferred** → `users.json` is wiped on redeploy, silently de-activating paid subscribers (security audit §2 durability note). This is itself an *involuntary churn source* and is called out in Idea 8.
- **No login path for non-admin paying users** (audit P0-1) and **Day-30 Re-Audit does not exist** (audit P1-L). Retention cannot begin until P0-1 is fixed; the strongest retention asset (Idea 1) is the build-out of P1-L.

I plan around all of this. Where an idea needs a deferred dependency, I say so and give the in-the-meantime fallback.

---

## Idea 1 — Day-30 Re-Audit, built as the renewal moment (not a marketing bullet)

**What it does.** Turns the audit P1-L gap into the product's strongest retention asset. At Day 30, the PWA surfaces a "Your 30-day reading is ready" entry that re-runs the existing audit funnel with `reAudit:true` (the flag already exists at `audit.js:27`) against the user's stored baseline. The output is a **side-by-side**: baseline Aura Score + 8 axes vs today's, with the per-axis deltas shown as gold trajectory lines and the original "leverage point" axis called out ("Your jaw axis was the leverage point on Day 1. It has moved +N. The reading does not flatter you — this is measured."). It closes with the Mirror Level the user has reached and a single quiet line on what month two builds. This lands ~3-5 days *before* the first renewal charge, so the proof-of-progress arrives before the money question.

**Why it helps the user.** It answers the only question a slow-payoff subscriber actually has at Day 30: "is this working?" — with their own data, not a hype line. It is the dignified inversion of the "rate my face" verdict the category is built on (research §4): diagnosis → measured movement, never shame.

**Why it helps MRR.** This is the single highest-leverage item in the entire retention surface. It directly attacks the #1 churn driver (results-delay) exactly at the renewal decision point. Funnel metric: **Day-30 → Month-2 retention.** Model: if it converts even an extra 8 percentage points of the at-risk Month-1 cohort into Month-2 (a conservative figure for a personalised proof-of-progress moment vs a blank renewal charge), and Month-1 base churn is ~12%, this cuts effective churn to ~8-9% — worth roughly the 12%→9% row above (+34% LTV). Back-of-envelope monthly MRR retained that would otherwise have churned at Month 1: **~₹1.2L at 1,000 paid, ~₹6L at 5,000 paid, ~₹15L at 12,500 paid** (8pp of the base × ARPU, recurring every month thereafter because saved subs keep paying). It is also *sold already* on the paywall — not building it is a refund/trust liability (audit P1-L).

**Build difficulty.** Medium. The audit engine, `reAudit` flag, baseline storage, and vision scoring all exist. The work is: a Day-30 trigger (scheduler check on `lookmaxxingActive` + days-since-baseline), a PWA entry tile, and a side-by-side reveal view (reuses Scene 5/6 components). No new AI, no new model.

**Brand voice compatibility.** Green. This *is* the brand — "the measurement is the product" (handoff §2). Copy must be drafted by copy-consultant-agent and founder-approved; do not improvise the Consultant lines.

**Dependencies.** Requires audit P0-1 (login) fixed first — a user must be able to reach the PWA. Strongly wants **R2** so the baseline photos survive to Day 30 (in `/tmp` they're wiped on any redeploy → re-audit has nothing to compare against). Wants Postgres for the same durability reason. Does NOT need WhatsApp/ffmpeg/VAPID. The reveal is pull-based in-PWA, so it works without push — though a Day-30 WhatsApp nudge (once live) would lift open rate.

**Risk.** If a user's score went *down* (lighting, weight, a bad month), the side-by-side could demoralise at the worst moment. Mitigation: the Consultant frames regressions honestly but as signal, never as failure, and always points at the protocol lever — never a bare lower number. Founder must approve the down-delta copy specifically.

---

## Idea 2 — "vs Day 1" baseline delta on the daily Mirror (the already-computed, never-shown signal)

**What it does.** Surfaces `deltaVsBaseline` — which the backend already computes and returns but the UI throws away (audit P2-K, `lookmax.js:100,108`) — as a single quiet line on every daily Mirror reveal: "vs your Day 1 reading: +N." Today the Mirror only shows day-over-day delta, which is noisy (sleep, lighting, angle swing it ±3 daily) and often *negative*, which is demotivating in week one. The cumulative-vs-baseline number trends reliably upward over weeks and is the motivating figure.

**Why it helps the user.** Day-over-day noise makes a slow-payoff product feel like it isn't working ("I scored lower than yesterday"). The baseline delta is the line that makes invisible cumulative progress visible early — the core retention thesis, delivered on the highest-frequency surface, every single day.

**Why it helps MRR.** Funnel metric: **Day-7 retention and median streak length** (the leading indicators of Day-30 survival). The daily Mirror is the core habit loop; making its primary number trend *up* instead of jitter is the cheapest possible reduction in first-week disillusionment. Modest but compounding: even a +3-5pp lift in Day-7 mirror retention feeds directly into a larger Day-30 base. At scale this is a fraction-of-a-churn-point improvement that costs almost nothing to ship — high ROI, low headline number. Call it **~₹30-40K/mo retained at 5,000 paid**, more as it compounds into the Day-30 cohort.

**Build difficulty.** Small. The data already flows to the client (P2-K). It is one line of rendered markup plus a label. No backend change.

**Brand voice compatibility.** Green, with one guard: it must never become a hype counter. "vs your Day 1 reading: +4" in restrained type, no exclamation, no fire. Copy is a single label — still route to founder for sign-off per CLAUDE.md §6 rule 5.

**Dependencies.** Needs a stored baseline to diff against — same R2/Postgres durability caveat as Idea 1 (in `/tmp`, baseline can vanish). For a direct-paid user with no audit baseline (audit P2-P), there is nothing to diff — so this couples with fixing the "first run does an audit" gap. No WhatsApp/push/ffmpeg needed.

**Risk.** Early-week baseline deltas can be negative or flat (real change is slow). If shown raw on a bad day it can sting. Mitigation: when the cumulative delta is ≤0, suppress the number and show the Consultant's process line instead ("Week one is calibration, not result"), never a red minus sign on the daily surface.

---

## Idea 3 — Mirror Level as a status ladder with a visible "next threshold"

**What it does.** The Mirror Levels (Raw → Polished → Magnetic → Radiant → Sovereign) already exist as a computed badge but are static — you're a level, with no sense of the climb. This makes the ladder *legible*: show the current level, the score band it sits in, and the distance to the next ("Polished. 4 points of average from Magnetic."). When a user crosses a threshold, the next Mirror reveal marks the ascension with a single restrained Consultant line and the new badge — a milestone reveal that fires *only when the underlying metric actually crosses* (no fake confetti).

**Why it helps the user.** A status ladder with a visible next rung converts a slow, abstract journey into a concrete near-term goal. It reframes "am I improving?" (unanswerable day to day) into "I'm 4 points from Magnetic" (concrete, achievable). It's the dignified, earned version of gamification — status, not points-for-points.

**Why it helps MRR.** Funnel metric: **Day-30 retention and Month-3 survival.** Rank ladders are the most durable retention mechanic in subscription products because the *next* rung is always just ahead — there's always a reason to stay one more month. It also feeds Idea 1: crossing a Mirror Level between Day 1 and Day 30 is a concrete renewal-justifying event. Modelled as a Month-2/Month-3 churn reducer: ~2-4pp off churn for engaged users → at 5,000 paid, **~₹1.5-3L/mo retained** at the back end of the cohort where churn is most expensive (these are the long-lifetime subs).

**Build difficulty.** Small-Medium. Level computation exists (handoff §7.7). Work is: surface the band + distance-to-next on the dashboard/mirror, and add the threshold-crossing reveal moment. No new scoring.

**Brand voice compatibility.** Green, with a guard: this is exactly where "generic streak app" energy creeps in. No badges-with-flames, no "Level up!!". The Consultant marks an ascension the way a mentor would — once, quietly, with specificity ("You crossed into Magnetic. Skin clarity carried it."). The audit already flagged the `🔥` streak emoji as a P0 voice violation (P0-5) — this idea must be built in deliberate contrast to that.

**Dependencies.** Needs the P0-5 `🔥` removal done first (otherwise we're layering a dignified ladder on top of a voice violation). No deferred infra required — pure computation + UI.

**Risk.** A user stuck just below a threshold for weeks could feel the ladder is rigged. Mitigation: never show a countdown that can go backwards on a bad day; show the *best* recent level reached and frame the band, not a teasing single-point gap that jitters.

---

## Idea 4 — The Pause (one streak-protection day per month, framed as discipline)

**What it does.** Gives each subscriber one "Pause" per month — a day they can miss the Mirror without breaking their streak. The Consultant frames it as a deliberate rest the user *spends*, not leniency the app grants: "You have one Pause this month. THE PAUSE is discipline, not absence. The streak holds." When used, the week-strip shows the day as a held ◆ rather than a broken gap.

**Why it helps the user.** Streak mechanics are brittle: one missed day (sick, travelling, no light for a selfie) breaks a 20-day streak and the demoralised user often just quits — the classic "I broke it so why bother" churn. A monthly Pause removes the single most common involuntary streak-break without removing the discipline frame.

**Why it helps MRR.** Funnel metric: **median streak length and Day-30 retention.** Streak-break is a well-documented churn trigger in daily-habit products; protecting it directly extends the median streak, and longer streaks correlate with survival to renewal. Conservative: ~2-3pp off early churn. At 5,000 paid, **~₹1-2L/mo retained.** Cheap to build, attacks a specific known failure mode.

**Build difficulty.** Small. Add a `pausesRemaining` field reset monthly, a check in the streak-increment logic (currently in `Lookmax`/scheduler), and the held-◆ rendering on the week strip.

**Brand voice compatibility.** Green. "THE PAUSE" fits the capitalised-emphasis pattern (CLAUDE.md §2) and the dignity frame perfectly. Copy needs founder sign-off but the concept is squarely on-voice.

**Dependencies.** None deferred — pure logic + UI. No WhatsApp/push/R2/ffmpeg. Wants Postgres for durability (the pause count is per-user state that `/tmp`/JSON-wipe would reset, but a reset that *gives back* a pause is harmless — fail-open).

**Risk.** Could be gamed (user banks pauses to fake long streaks). Mitigation: one per calendar month, non-bankable, and the Mirror Level (Idea 3, score-based not streak-based) remains the *honest* status signal — so the streak is the habit loop and the level is the truth. They reinforce, they don't lie.

---

## Idea 5 — Day-3 dip recovery message, anchored to the user's own audit data

**What it does.** Day 3 is statistically when first-week dropouts happen. On the morning of Day 3, if the user has been active, the Consultant sends one specific message anchored to their actual audit — not a generic nudge: "Your [weakest-axis] was the leverage point in your reading. Today's Mirror is the third data point. Three readings is where calibration begins — the line is forming." It references the real leverage-point axis the audit already stored. It is a *mentor checking in*, never a "you haven't logged in" guilt-trip.

**Why it helps the user.** The Day-3 dropout is usually someone who hasn't yet seen any payoff and is quietly deciding it's not for them. A specific, data-anchored line from a mentor — naming their actual leverage axis — re-establishes the "this is calibrated to me" feeling exactly when doubt peaks.

**Why it helps MRR.** Funnel metric: **Day-7 retention** (the gateway to everything downstream). Catching the Day-3 dip is the cheapest Day-7 lift available because it's one message to a known at-risk moment. Even a +5pp Day-7 retention improvement widens every cohort that follows. Feeds the whole funnel — hard to isolate a clean number, but as a leading indicator it's among the highest-ROI touches.

**Build difficulty.** Small-Medium. The scheduler already does per-user day-indexed sends (Orator morning logic) and per-user mirror nudges — this is the same pattern keyed to Lookmaxxing day-3 + the stored leverage axis. The constraint is delivery channel.

**Brand voice compatibility.** Green — *if and only if* it stays specific and never references absence. The hard rule (no guilt-trip, the Consultant doesn't beg) means this must anchor to data the user has, never to what they haven't done. Founder-approved copy mandatory; this is high-stakes voice territory.

**Dependencies.** **Delivery is the blocker.** WhatsApp is DRY-RUN until Meta approval; push needs VAPID (not provisioned). So this is *built now, dormant until a channel is live.* In-the-meantime fallback: surface the Day-3 line as an in-PWA banner on next open (no channel needed) — lower reach but zero infra. No "fake personalization" risk because the leverage axis is real data we hold.

**Risk.** If the leverage-axis data is missing (direct-paid user, no audit — P2-P), the message would fall back to generic, which violates the no-fake-personalization rule. Mitigation: only fire the anchored version when the axis exists; otherwise suppress entirely (silence beats generic).

---

## Idea 6 — Win-back sequence for cancelled subs (silence, then one specific line)

**What it does.** When a subscription cancels (`subscription.cancelled` webhook already flips the flag, handoff §7.5), the user enters a win-back queue: **7 days of complete silence**, then exactly one message — "The work paused on Day [N]. Your strongest axis was [axis], and it had moved +[delta] by the time you stepped away. The mirror is still here when you are." One low-pressure CTA to resume. No second message, no escalation, no discount-begging.

**Why it helps the user.** It respects the decision (silence first), then offers a single dignified door back, anchored to the real progress they'd been making — which is often the thing they forgot when they cancelled in a busy week.

**Why it helps MRR.** Funnel metric: **re-engagement conversion (% of cancelled subs who resubscribe within 60 days).** Win-back is pure incremental MRR — these are subs already counted as churned. Even a 5-10% win-back rate on cancellations is meaningful: at 12,500 paid with ~10% monthly churn (~1,250 cancellations/mo), an 8% win-back = ~100 resubs/mo = **~₹1.5L/mo recovered MRR**, recurring. At 5,000 paid, ~₹60K/mo. It's found money against a cohort otherwise written off.

**Build difficulty.** Medium. Needs: a cancellation-timestamp + cancel-day-N + last-known-best-axis stored on the user record (cheap), a 7-day-delay queue (the scheduler can poll for `cancelledAt + 7d` matches), and the message send.

**Brand voice compatibility.** Green. This is the textbook on-brand win-back — silence, specificity, one quiet CTA, no begging. The hard rules (no churn-friction, no "Wait! Special offer!", no guilt) are satisfied by design. Founder-approved copy mandatory.

**Dependencies.** **Delivery channel** — WhatsApp (DRY-RUN until Meta) or email (Resend, dormant but wired). Email is the more realistic near-term channel here since a cancelled user may not have WhatsApp opted-in. Needs the cancel-reason + cancel-day data captured at cancellation time (couples with Idea 7). Wants Postgres so cancelled-user records survive to day 7 (JSON-wipe would lose the queue). No ffmpeg/VAPID/R2 strictly needed.

**Risk.** Messaging a cancelled user can read as not-respecting-the-cancel if mistimed or repeated. Mitigation: exactly one message, 7-day silence first, hard frequency cap, honour any unsubscribe instantly. DPDPA: only message users with a lawful basis to contact post-cancel — route through security-compliance before going live.

---

## Idea 7 — One-tap cancel + one optional reason (frictionless exit that feeds retention intelligence)

**What it does.** Builds the missing self-serve cancel (audit P2-H: "Profile" tab manages nothing today) as **one click + one optional reason picker** — no retention-specialist popup, no "are you sure?" gauntlet, no surprise discount. The reason picker (one tap, skippable: "results too slow / too expensive / no time / achieved my goal / other") is the only addition, and it's optional. Cancellation reason data flows to the admin dashboard.

**Why it helps the user.** A clean, honest exit is a trust signal that *increases* the odds of a future return (and feeds Idea 6's win-back). Cancel-friction is the most resented dark pattern in subscriptions and is squarely against the brand's anti-hype dignity.

**Why it helps MRR.** Two ways. (1) **Reduces involuntary/resentful churn**: paradoxically, easy-cancel products retain better because users don't pre-emptively cancel to avoid a feared friction-fight, and they return more readily. (2) **Cancellation-reason data is the retention roadmap** — if "results too slow" dominates, it validates doubling down on Ideas 1-2; if "too expensive" dominates, it points at a Traya-style risk-reversal (research §"3 moves" #2). Indirect MRR via better-targeted future plays, plus it's a near-certain DPDPA/Razorpay self-serve-cancel requirement at launch (audit P2-H open question #6). Hard to price directly; it's an enabler for everything else and a compliance necessity.

**Build difficulty.** Small-Medium. Razorpay subscription cancel API call + a profile panel (which P1-I/P2-H already say must exist for logout/account anyway) + a reason enum stored on the user + an admin tile.

**Brand voice compatibility.** Green. This is the *enforcement* of the hard rule "No churn-friction. Cancel must be one click + one optional reason." Reason-picker labels need founder sign-off (keep them plain, not Consultant-voiced — a form is a form).

**Dependencies.** Couples with the Profile/account panel (audit P1-I logout, P2-H). Needs the admin dashboard extension (audit P1-M says admin lacks Lookmaxxing metrics anyway — add a cancel-reasons tile there). No deferred infra. Wants Postgres so reason data isn't wiped.

**Risk.** Making cancel *too* prominent could marginally raise voluntary cancels. Accepted: the brand bar (no dark patterns) and the win-back loop (Idea 6) make this net-positive, and the reason data is worth more than the marginal saved cancel.

---

## Idea 8 — UPI Autopay involuntary-churn recovery (the silent India-specific killer)

**What it does.** Catches subscribers who churn *involuntarily* — not because they chose to leave, but because a UPI Autopay/card debit failed (insufficient balance, mandate paused, bank glitch). On the `subscription.halted` / failed-charge webhook (handoff §7.5 already handles `.halted`), instead of silently de-activating, the Consultant sends one calm line: "The renewal didn't go through — your bank, not you. The work is held, not ended. Re-authorise here." with a single Razorpay re-auth link. A short retry window keeps the account in a "held" (not cancelled) state.

**Why it helps the user.** Involuntary churn is the most frustrating kind — the user *wanted* to stay and got silently cut off. Catching it preserves their streak, their Mirror Level, and their baseline, and fixes a problem they didn't know they had.

**Why it helps MRR.** Funnel metric: **involuntary churn rate** — typically 20-40% of *all* churn in subscription businesses, and the cheapest to recover because intent-to-stay already exists. Research §2 confirms UPI Autopay is now 53% of recurring payments and sits under the ₹15,000 no-re-auth ceiling — so most renewals are frictionless, but the *failures* (balance/mandate issues) still happen and are pure recoverable MRR. If involuntary churn is even 25% of a 10% total churn (i.e., 2.5pp), recovering 60% of it claws back ~1.5pp of total churn. At 12,500 paid that's ~190 subs/mo = **~₹2.8L/mo recovered**; at 5,000 paid ~₹1.1L/mo. This is among the highest-certainty MRR recoveries in the whole list.

**Build difficulty.** Medium. The `.halted`/failed-charge webhook handling exists; the work is the "held" grace state + dunning sequence (1-3 spaced re-auth nudges over ~5-7 days) + the re-auth link. **Critically, this also requires fixing the Postgres durability gap** — the security audit (§2) notes a webhook can flip a flag on a record that vanishes on redeploy, which is *itself* a synthetic involuntary-churn source. So this idea has a hard infra dependency that's worth surfacing loudly.

**Brand voice compatibility.** Green. "Your bank, not you. Held, not ended." is exactly the dignified, non-blaming frame. No guilt, no panic. Founder-approved copy mandatory.

**Dependencies.** **Postgres (handoff §9) is effectively a precondition** — without durable user records, involuntary de-activation is happening *for free* on every redeploy and no dunning logic can fix that. Razorpay's subscription retry/halt config must be set. Delivery channel: WhatsApp (DRY-RUN until Meta) or email (Resend, dormant) — email is the safer dunning channel. Wants the cancel/held state model from Idea 7.

**Risk.** Dunning that's too aggressive feels like nagging for money. Mitigation: max 2-3 calm, spaced messages over ~7 days, then clean stop; never escalate tone. Honour the brand's no-begging rule even about money.

---

## Idea 9 — Regional-language Consultant nudges (India-specific reach into the at-risk cohort)

**What it does.** Offers the daily Mirror nudge and key retention touches (Day-3 dip, Day-30 Re-Audit alert) in the user's chosen language — Hindi first, then Tamil/Telugu/etc. — *only* for the short transactional nudges, while the core Consultant assessment copy stays in its crafted English voice (or gets a founder-approved transliteration). A one-time language preference at onboarding.

**Why it helps the user.** The target is young Indian men 18-30 (handoff §2), a large slice of whom are more comfortable transacting in their first language. A nudge that lands in Hindi feels closer; a wall of crafted English may feel like distance. Lowering the language barrier on the *operational* touches reduces the friction that quietly compounds into churn.

**Why it helps MRR.** Funnel metric: **Day-7/Day-30 retention within the non-English-preferring cohort** — a segment that may currently churn faster purely on comprehension/comfort friction. Hard to size precisely without cohort data (flagged as a measurement need), but if this cohort is even 30% of the base and churns 3-4pp worse on language friction, closing half that gap is a real cohort-level lift. Treat as **a medium-confidence, India-specific edge** — model conservatively at ~₹50K-1L/mo retained at 5,000 paid, pending cohort data.

**Build difficulty.** Medium. Short nudge strings are few and translatable; the *risk and cost* is that translation must not violate the Consultant voice — this needs human/founder translation, not machine output, for anything the user reads as "the Consultant speaking."

**Brand voice compatibility.** Yellow. The Consultant's voice (cadence, restraint, "◆") is crafted in English; a careless translation could flatten it into generic app-voice in another language. The mitigation — keep the *crafted* assessment copy English/founder-approved, translate only short operational nudges, and have a native speaker who understands the brand do it — is exactly why this is yellow, not green. Do not machine-translate Consultant copy. Founder owns sign-off per language.

**Dependencies.** Delivery channel (WhatsApp DRY-RUN / push deferred) for the nudges; in-PWA language toggle works without a channel. Needs founder-approved translations (a copy-consultant + native-speaker workstream, not an engineering one). No R2/ffmpeg.

**Risk.** A bad translation does more brand damage than no translation. Mitigation: ship English-only at launch, add languages one at a time only when a native-speaker founder-approved translation exists. This is explicitly a *post-launch* edge, not a launch blocker.

---

## Idea 10 — Aura++ cross-sell as an expansion play, triggered by an earned moment (not a banner)

**What it does.** Today the cross-sell is a static dashboard banner shown when `!oratorActive` (audit P2-I). This replaces the always-on banner with a *triggered* expansion moment: when a Lookmaxxing subscriber hits a genuine high point — crosses a Mirror Level (Idea 3), or completes the Day-30 Re-Audit with positive deltas (Idea 1) — the Consultant offers the Orator pillar once, framed as the natural next axis: "You've moved how you look. How you sound is the other half of presence. Aura++ holds both — ₹1,999, one step." One offer, tied to a real achievement, then it goes quiet.

**Why it helps the user.** A cross-sell tied to a moment of earned momentum ("you just proved this works — here's the other half") is relevant and welcome; an always-on banner is wallpaper the user learns to ignore. It also genuinely serves the user's identity arc (voice + presence as one self, research §5 whitespace #4).

**Why it helps MRR.** Funnel metric: **ARPU expansion (₹1,499 → ₹1,999) and bundle attach rate.** This is the explicit conversion goal (handoff §"the bundle is the conversion goal"). Expansion is the second MRR multiplier after churn reduction: every Lookmaxxing sub upgraded to Aura++ adds ₹500/mo *and* — critically — Aura++ subs churn slower (two pillars = two reasons to stay, higher switching cost). If even 12% of Lookmaxxing subs upgrade at an earned moment: at 5,000 Lookmaxxing subs that's 600 × ₹500 = **+₹3L/mo expansion MRR**; at 12,500, +₹7.5L/mo. And the path to ₹1Cr is *dramatically* shorter at ₹1,999 ARPU (~5,000 subs) than ₹799 (~12,500) — expansion compresses the subscriber count needed (handoff §5 economics).

**Build difficulty.** Small-Medium. The cross-sell UI exists; the work is changing the *trigger* from a static flag to an event (level-cross / positive re-audit) and adding the one-time-then-quiet logic so it doesn't nag.

**Brand voice compatibility.** Green. "You've moved how you look. How you sound is the other half." is on-voice and non-pushy. The risk is frequency, not tone — solved by one-offer-then-silence. Founder-approved copy mandatory.

**Dependencies.** Best paired with Idea 3 (level-cross trigger) and Idea 1 (re-audit trigger) — it has no good trigger without them, so it's *third in priority after those two.* The Orator pillar itself needs WhatsApp live to deliver (DRY-RUN until Meta) — so the *cross-sell can be shown* now but the *purchased Orator experience* is dormant until WhatsApp approval. Don't sell what can't yet be delivered: gate the live cross-sell on Orator delivery being real.

**Risk.** Selling Orator before WhatsApp is live = a paid-for-but-dead second pillar (same failure class as audit P2-E "voice or text both work" promising an unbuilt feature). Mitigation: do not enable the live Aura++ upgrade offer until WhatsApp sends are live. Until then, soft "coming" framing only, or hold the idea.

---

## Priority order (dependency-aware)

1. **Idea 1 — Day-30 Re-Audit** (highest MRR; it's already sold; needs login fixed + R2)
2. **Idea 2 — "vs Day 1" baseline delta** (smallest build, daily impact, data already flows)
3. **Idea 7 — One-tap cancel + reason** (compliance necessity + feeds Ideas 6 & all future plays)
4. **Idea 3 — Mirror Level ladder** (durable Month-3 retention; needs P0-5 🔥 fix first)
5. **Idea 8 — UPI Autopay involuntary-churn recovery** (high-certainty recovery; needs Postgres)
6. **Idea 4 — The Pause** (small, attacks a specific known churn trigger)
7. **Idea 5 — Day-3 dip recovery** (high ROI; blocked on a delivery channel)
8. **Idea 6 — Win-back sequence** (incremental MRR; needs a channel + cancel data from Idea 7)
9. **Idea 10 — Aura++ cross-sell at earned moments** (expansion; needs Ideas 1/3 as triggers + Orator live)
10. **Idea 9 — Regional-language nudges** (post-launch edge; needs native-speaker translations)

## Cross-cutting infra asks that unblock multiple ideas

- **Fix audit P0-1 (login).** Without it, NO retention idea reaches a real customer. Absolute precondition.
- **Provision R2.** Unblocks durable baselines for Ideas 1 & 2 (the before/after proof).
- **Migrate to Postgres.** Stops the silent de-activation-on-redeploy that is itself involuntary churn (Idea 8), and preserves the win-back/cancel/pause state (Ideas 4, 6, 7).
- **Get a delivery channel live** (WhatsApp via Meta, or activate the dormant Resend email, or provision VAPID). Ideas 5, 6, 8, 9 are all *built-but-dormant* until one exists. In the meantime, in-PWA banners are the channel-free fallback.

---

## How I'd measure all of this (the retention dashboard)

The admin panel currently shows Orator metrics only and is blind to Lookmaxxing (audit P1-M). Before any of these ship, the founder needs the cohort instrumentation to know if they worked:

- **Day-7 retention** — % who take a Mirror on Day 7 after their first Mirror (Ideas 2, 4, 5)
- **Day-30 retention** — % still `lookmaxxingActive` at day 30 (Ideas 1, 3)
- **Month-3 survival** — % still active at day 90 (Ideas 3, 10)
- **Median streak length** (Ideas 4, 2)
- **Day-30 Re-Audit completion rate** and **positive-delta rate** (Idea 1)
- **Cancellation reasons** distribution (Idea 7) — the retention roadmap
- **Involuntary vs voluntary churn split** (Idea 8)
- **Win-back conversion** — % cancelled who resub within 60 days (Idea 6)
- **Aura++ attach / expansion rate** (Idea 10)

Hand the dashboard build to feature-product-agent + backend-agent (extends audit P1-M's recommended admin tiles). Without it, every idea above is a guess.

---

*End of analysis. No source files modified. Every idea is an addition within the existing architecture, respects the deferral list (handoff §9), and obeys the Consultant voice + hard retention rules (no guilt-trip, no churn-friction, no fake personalization). All user-facing copy must be drafted by copy-consultant-agent and founder-approved before shipping (CLAUDE.md §6 rule 5).*
