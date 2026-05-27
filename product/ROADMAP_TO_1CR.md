# Roadmap to ₹1Cr MRR — Lookmaxxing / Aura++

> Owner: Head of Product, MainCharacter
> Date: 2026-05-28
> Mode: ANALYSIS ONLY. No code, no specs. One ranked roadmap, deduped across three opportunity lists, the pre-launch product audit, the security audit, and market research.
> Sources synthesized: `product/opportunities-features.md`, `product/opportunities-conversion.md`, `product/opportunities-retention.md`, `product/audit-lookmaxxing-pre-launch.md`, `security/audit-pre-public-launch.md`, `growth/research-india-aesthetic-market.md`.

---

## How to read this document

There are two fundamentally different kinds of work below, and conflating them is the single most dangerous mistake the founder can make:

1. **§0 — Launch Prerequisites (GATES).** Non-negotiable. These are not "bets" with an ROI; they are the things that must be true before `PAYWALL_PUBLIC=true` can be flipped at all. Skipping any one of them means either real customers cannot use what they paid for, or the company is breaking Indian law (DPDPA) while collecting facial biometrics. **You do not rank a gate. You clear it.**

2. **§1–§4 — Growth opportunities (BETS).** Ranked by ROI × risk × buildability-in-current-architecture. These move MRR. Most of them are *blocked from reaching a real user until §0 is done* — that dependency is called out per item.

**The honest sequencing truth:** almost every retention and conversion bet in §1 is downstream of the login gate (audit P0-1). You can *build* them now, but they reach zero paying customers until a non-admin buyer can log in. So §0 is not "boring infra we'll get to" — it is the literal precondition for any of the MRR math below to be real.

### The MRR arithmetic anchor (used throughout)

₹1Cr MRR is reachable two ways (CLAUDE.md §1):
- **~12,500 paid @ ₹799** (Orator-only ARPU), or
- **~5,000 Aura++ @ ₹1,999** (the bundle path needs **less than half the bodies**).

This is why the two structural multipliers — **bundle/ARPU expansion** and **churn reduction** — outrank raw acquisition everywhere below. At ₹1,499 ARPU, the retention math (`LTV = ARPU ÷ churn`) shows cutting churn 12%→7% is a +72% LTV swing on the same spend. The path to ₹1Cr is much shorter through the denominator (churn) and through ARPU (bundle) than through the numerator (new signups).

---

## §0 — Launch Prerequisites (GATES — clear these before any production flag flips)

These come from the audit P0s and the security BLOCKERS. They are grouped by **who does the work**, because three of them are founder/lawyer actions that cannot be coded around and gate the engineering work.

### §0-A — FOUNDER ACTIONS (cannot be delegated to engineering; some have lead time)

| # | Gate | Source | Why it blocks launch | Gates which flip |
|---|------|--------|----------------------|------------------|
| 0-A1 | **Rotate the leaked keys.** Gemini + Razorpay secrets are in git history and verified NOT rotated (identical hashes). Revoke old, issue new, set in Render only. Log in DECISIONS.md. | Security BLOCKER #1 | Anyone with repo access holds live keys. History scrub is optional; rotation is the real fix. | All flips |
| 0-A2 | **Engage an India data-protection lawyer** to draft a DPDPA-compliant Privacy Policy + Terms covering biometric/sensitive photo data, cross-border processing to Google/Gemini (US), retention & deletion, Data Fiduciary contact, Data Principal rights, and 18+ restriction. | Security BLOCKER #2 | Collecting facial photos with no published notice/consent is DPDPA non-compliance. Security explicitly does NOT sign off on legal text. **This has external lead time — start now.** | `PAYWALL_PUBLIC` |
| 0-A3 | **Set the production secrets in Render** (not in any committed file): `RAZORPAY_WEBHOOK_SECRET` (currently empty → every webhook rejected → no subscription ever activates), `WHATSAPP_APP_SECRET`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET` (64-char random). | Security #2, #4, MEDIUM findings | Empty webhook secret silently means paid users never get activated. Weak/derived JWT + plaintext admin fallback are live until set. | `rzp_live_*`, `PAYWALL_PUBLIC`, `WHATSAPP_SEND_MODE=all` |
| 0-A4 | **Decide the launch login model (P0-1)** and **confirm the Razorpay flip order (P0-4):** (a) mint a Lookmaxxing session at payment-confirmed, or (b) gate launch on WhatsApp OTP being live. Then: set webhook secret → swap to `rzp_live_*` → test one real ₹ subscription end-to-end → only then flip `PAYWALL_PUBLIC`. | Audit P0-1, P0-4 | A real paying customer currently has **no door they can log in through.** And flipping the paywall on test keys charges nobody / on live keys without webhook secret activates nobody. | `PAYWALL_PUBLIC`, `rzp_live_*` |

### §0-B — ENGINEERING ACTIONS (build before launch; each is a known leak or a compliance build)

| # | Gate | Source | What it is |
|---|------|--------|-----------|
| 0-B1 | **Fix the login path (P0-1).** Implement whichever model the founder picks in 0-A4 (recommend: mint a Lookmaxxing session in the payment-confirmed flow — the webhook already knows the paying user). **This is the headline blocker — the entire `/lookmax/*` surface is unreachable for the exact person the paywall just charged.** | Audit P0-1 | The single most launch-threatening issue. Nothing in §1–§3 reaches a real customer until this is done. |
| 0-B2 | **Photo-upload failure recovery (P0-2).** On decode failure, stop resolving the original unprocessed file; show a specific recoverable message; drop `capture` on full-body so the gallery works; add an upload progress indicator; confirm server-side `sharp` handles HEIC. | Audit P0-2, Conversion Idea 4 | Verified in source: large/HEIC Android photos silently fail the whole audit at the highest-intent step. This is pure recovered revenue, not a marginal lift — highest-confidence number in the funnel. |
| 0-B3 | **Build photo deletion + data-subject endpoints (BLOCKER).** `/api/user/delete` (purge record + all `/tmp`/R2 objects), `/api/user/export` (DPDPA portability), and a scheduled delete-after-N-days job. Add the consent checkbox + 18+ confirmation before photo upload; serve the legal pages once 0-A2 delivers text; wire the dead `href="#"` footer links. | Security BLOCKER #2 & #3, Audit P1/P3-B | Biometric data currently has no retention, deletion, or portability mechanism. Most serious compliance exposure in the system. |
| 0-B4 | **Remove the `🔥` voice violation (P0-5).** Four occurrences across dashboard, mirror, protocol. Replace with text/`◆`. | Audit P0-5 | Brand-voice violations that reach a user are P0 by charter. The `🔥` is the single most "generic streak app" signal and sits on every primary surface daily. One fix pattern. |
| 0-B5 | **Patch the unguarded prompt-injection site (HIGH) + mask PII in logs (HIGH).** Wrap `user.name` + raw chronicle replies in `services/gemini.js:85` with the delimiter+guard pattern used at the other three sites; add a masking helper at the PII log call sites. | Security #5, #6 | Known landmine flagged as fixed when it isn't; raw phones/names/message text ship to log aggregators (DPDPA). Both are small, both are pre-launch. |

> **Gate summary for the founder:** Before you flip `PAYWALL_PUBLIC`, ALL of §0-A and §0-B must be done. The long-pole items are **0-A2 (lawyer — external lead time)** and **0-B1 (login) + 0-B3 (deletion/consent)**. Start the lawyer engagement today; it will outlast the engineering.

---

## §1 — Top 3 NOW (highest ROI × lowest risk × ships in current architecture)

> These are the three bets to build the moment §0 clears (and several can be built *in parallel* with §0 since they're code-ready). Each names the exact funnel metric, target lift, MRR impact at the three scale points, and the agent build sequence. **MRR figures are directional sizing anchored to 1K / 5K / 12.5K paid subs, not forecasts — we have no live baseline yet (Idea 0 below is what creates one).**

### NOW-0 (PRECONDITION, not counted in the 3) — Funnel + cohort instrumentation

**This is Idea 0 from conversion and the admin-dashboard gap (P1-M), merged. It is not optional and not a "bet" — without it every number below is called on vibes.** A minimal append-only event sink (`audit_started`, `quiz_completed`, `photos_submitted`, `analysis_shown`, `paywall_viewed`, `card_selected{plan}`, `subscribe_clicked`, `subscription_activated`, `first_mirror`) keyed by the existing session/user id, surfaced as funnel + cohort tiles on `/admin` (Day-7/Day-30 retention, median streak, Trial→Paid, MRR, cancel-reasons, involuntary-vs-voluntary split). Build: Small, reuses JSON-CRUD pattern. Voice: green (no user copy). **Build this first or the rest is guesswork.** Agents: backend (event sink) + frontend (admin tiles), feature-product specs the event schema.

---

### NOW-1 — Carry the audit personalisation through the conversion seam + rescue the warm cohort

*(Merges: features Idea 2 "Warm Capture", conversion Idea 1 "echo through the seam" + Idea 7 "abandoned-audit recovery", audit P0-3 + P2-O.)*

- **Goal:** Stop throwing away the warmest cohort in the product — echo the user's real Aura Score + leverage point on the waitlist/paywall page, and (once a channel + consent are live) send exactly one dignified follow-up to audit-finishers who bounced.
- **Funnel metric + target lift:** `audit-complete → paywall-action` (the highest-drop seam, audit's own P0-3). Target **+3–5pp** on the seam, plus recovery of **3–5%** of abandoners via the one follow-up.
- **MRR impact:** at **1K paid** ~₹40–60k/mo combined (echo + recovery); at **5K paid** ~₹1.5–2L/mo; at **12.5K paid** ~₹4–5L/mo (where audit volume is the firehose). Cheapest large lever we have because the traffic is already paid for.
- **Build sequence:** feature-product (spec the echo + the single-message recovery rule) → copy-consultant + **founder copy approval** (the echo line and the follow-up string) → frontend (echo, reuse the `loadAuditSummary` pattern already on `paywall.html:195-210`) → backend (queued follow-up via dormant `sendAuditConfirmation` + messaging-mode kill-switch). **The echo half ships today (safe). The follow-up half is GATED on §0-A2 consent + a live channel** — do not send outreach to a contact captured without consent.
- **Dependency on §0:** echo is independent and can ship pre-launch; the follow-up is gated on consent (0-A2/0-B3) and a live channel.

### NOW-2 — Day-30 Re-Audit, built as the renewal engine

*(Merges: features Idea 4 "The Re-Audit", retention Idea 1, audit P1-L; it is also the hard dependency for conversion Idea 5's risk-reversal.)*

- **Goal:** Build the side-by-side Day-30 reading that the paywall **already sells but does not exist** — the proof-of-progress moment that justifies the ₹1,499 subscription past month one.
- **Funnel metric + target lift:** `Day-30 → Month-2 retention`. Target **+8pp** of the at-risk Month-1 cohort converted to Month-2 (conservative for a personalised proof moment vs a blank renewal charge), cutting effective churn ~12%→~8-9%.
- **MRR impact (retained, recurring every month after):** ~**₹1.2L/mo at 1K paid**, ~**₹6L/mo at 5K**, ~**₹15L/mo at 12.5K** (8pp of base × ARPU). This is the single highest-leverage retention item, and not building it is a refund/trust liability because it's already sold.
- **Build sequence:** feature-product (spec the side-by-side + the Day-30 trigger as **pull-based first** — a "your 30 days are complete" card when `daysSincePayment >= 30`, no push needed) → copy-consultant + **founder approval (incl. the down-delta copy specifically** — a score that dropped must read as signal, never failure) → backend (reuse the existing `reAudit:true` flag at `audit.js:27` + stored baseline) → frontend (reuse the `reveal.html` canvas trajectory). No new AI, no new model.
- **Dependency on §0:** requires login (0-B1) so a user can reach the PWA. **Strongly wants R2** so baseline photos survive to Day 30 (in `/tmp` they're wiped on redeploy → nothing to compare against). The push nudge is a later enhancement; the pull card works without scheduler/VAPID.

### NOW-3 — Honest bundle pull (checkout tag) + earned-moment Aura++ cross-sell

*(Merges: features Idea 3 "Aura++ Bridge", conversion Idea 6 "honest bundle pull", retention Idea 10 "cross-sell at earned moments", audit P2-I. Two facets of one ARPU lever.)*

- **Goal:** Move single-pillar payers to the ₹1,999 Aura++ bundle — the structural moat no competitor fills (research §5.4) — via (a) an honest, audit-tied bundle framing at checkout, and (b) a once-only cross-sell triggered by a real milestone (Mirror Level rise / positive Day-30 re-audit), replacing today's always-on banner.
- **Funnel metric + target lift:** **ARPU** (the most scale-durable lever — it multiplies every subscriber, no extra acquisition cost). Target: shift bundle attach from ~24% → ~30% of buyers (+₹40–50 blended ARPU); and **+12%** of Lookmaxxing subs upgrading at an earned moment.
- **MRR impact:** at **1K paid** ~₹40–50k/mo; at **5K paid** ~₹2–3L/mo; at **12.5K paid** ~₹5–7.5L/mo — pure margin. Critically, the bundle path compresses the bodies needed for ₹1Cr from ~12,500 to ~5,000.
- **Build sequence:** feature-product (spec the single-variable tag A/B — "Most chosen" vs "Saves ₹299" vs "voice and presence as one arc" — and the earned-moment trigger logic, one-offer-then-silence) → copy-consultant + **founder approval** → frontend (tag A/B on `paywall.html`; trigger change on the dashboard cross-sell) → backend (event trigger off Mirror Level / re-audit). Bundle auto-pricing already exists (`api.js:534-539`). **Remove the unapproved "Founder access to The Consultant chat" bullet (P3-D) before this card is tested** — it promises an unbuilt feature.
- **Dependency on §0:** the checkout tag A/B needs the public paywall live (`PAYWALL_PUBLIC`) and instrumentation (NOW-0). The earned-moment trigger needs login (0-B1) and is best paired with NOW-2's re-audit trigger. **Do not enable the live Aura++ *upgrade-to-Orator* offer until WhatsApp is live** — selling a second pillar that can't be delivered is the P2-E failure class.

> **Why these three:** NOW-1 stops a verified leak at the warmest point (acquisition/activation, cheapest lever). NOW-2 is the biggest retention number and it's already sold (refund risk if absent). NOW-3 is the biggest ARPU number and the moat. Together they hit all three of the MRR multipliers — recover the funnel, hold the cohort, lift the ARPU — without un-deferring anything except (ideally) R2 for NOW-2.

---

## §2 — Next 5 (second-wave bets, queued after the Top 3)

1. **UPI Autopay default + transparency line + one-click dignified cancel.** *(Merges: features Idea 6, conversion Idea 2 + Idea 8, retention Idea 7, audit P2-H/P1-I.)* Make UPI Autopay the default checkout method (53% of Indian recurring payments, frictionless under ₹15,000) with one transparent line ("Billed monthly. Cancel anytime. No hidden weekly charge.") positioned against the Umax weekly-trap — **paired hard with the one-click cancel + one optional reason picker**, because "cancel anytime" without the mechanism is a dark pattern. Cancel is also a near-certain DPDPA/Razorpay launch expectation and the precondition for any honest paid acquisition. Moves `paywall→sub` (+2–4pp), lifts renewal success (less involuntary churn), and feeds the cancel-reason retention roadmap. ~₹40–60k → ₹2–3L → ₹5–7L MRR across scale. Voice green. **Gated on `rzp_live_*` + 0-A3 webhook secret + login (0-B1).**

2. **UPI Autopay involuntary-churn recovery (dunning).** *(Retention Idea 8.)* On `subscription.halted`/failed-charge, hold the account in a "held, not ended" state and send a calm, non-blaming re-auth nudge ("Your bank, not you. The work is held."). Involuntary churn is typically 20–40% of all churn and the cheapest to recover (intent-to-stay already exists). ~₹1.1L/mo at 5K, ~₹2.8L/mo at 12.5K — among the highest-certainty recoveries. **Hard dependency on Postgres** (the security audit notes the JSON-wipe is *itself* a synthetic involuntary-churn source — a webhook flips a flag on a record that vanishes on redeploy). Voice green.

3. **"vs Day 1" baseline delta on the daily Mirror.** *(Retention Idea 2, audit P2-K.)* Surface the already-computed-but-discarded `deltaVsBaseline` as one quiet line on every mirror reveal. Day-over-day delta is noisy and often negative (demotivating week one); the cumulative-vs-baseline number trends reliably up. Smallest build in the whole roadmap (data already flows to the client). Moves Day-7 retention / median streak. ~₹30–40k/mo at 5K, compounding into the Day-30 cohort. Suppress when delta ≤0; never a red minus on the daily surface. **Needs a durable baseline (R2/Postgres) and the first-reading onboarding (item 5) for direct buyers.** Voice green.

4. **Mirror Level ladder + The Pause.** *(Retention Idea 3 + Idea 4.)* Make the Mirror Level ladder legible (current band + distance to next + a restrained threshold-crossing reveal), and give one non-bankable "Pause" per month to protect streaks from the single most common involuntary break (sick/travel/no light). The dignified, earned inversion of gamification — status, not points-for-points, built in deliberate contrast to the removed `🔥`. Moves Day-30 / Month-3 survival (~2–4pp off back-end churn, the most expensive cohort). ~₹1.5–3L/mo at 5K. **Must follow 0-B4 (`🔥` removal).** Voice green with a hard "no flames, no Level up!!" guard.

5. **First-Reading onboarding for direct buyers.** *(Features Idea 8, audit P2-P.)* When a paid user opens `/lookmax/` with no audit on file (the bundle buyer who skipped the funnel), route them through the audit (account attached) before the dashboard — otherwise tiles, deltas, and protocol all degrade to null and the first session is empty (early-churn signal). Reuses the audit funnel end-to-end. Activation → retention; low glamour, high leverage on the retention denominator, and it guarantees the baseline that NOW-2 and item 3 need. Small build. **Depends on login (0-B1).** Voice green.

---

## §3 — Backlog (tracked, not forgotten — lower priority or blocked by deferred infra)

- **Shareable Aura Card / Hair Trajectory Reveal (viral artifacts).** *(Merges features Idea 1 + Idea 5, conversion Idea 3, audit P1-E.)* Canvas-rendered obsidian-and-gold share cards (audit result; Norwood trajectory with evidence-tier tags) — the press-safe, dignified version of the before/after format research says is the underserved high-credibility lane. **Why backlog not Top-3:** the viral coefficient pays off most at *scale* (least at launch, where audit volume is small), and the share copy is the single riskiest brand surface (yellow — the category's whole disease is shame-driven sharing). Build the recoverable-result *link* as part of NOW-1; defer the share-creative push until the funnel is proven and copy is founder-locked. No R2/ffmpeg needed (canvas + `navigator.share`). Watch the medical-claims line on the hair card.
- **Risk-reversal "30-day measurable-change-or-pause" promise on the ₹1,499 tier.** *(Conversion Idea 5, research move #2.)* Highest upside on the highest-ARPU tier, but the only idea that can *lose* money if pause-rate is high — and it **hard-depends on NOW-2 (Day-30 re-audit) existing** plus a Razorpay billing-pause path and legal-finance unit-economics sign-off. Queue it *after* NOW-2 ships and shows real positive-delta rates.
- **Day-3 dip recovery message.** *(Retention Idea 5.)* High-ROI Day-7 lever (one specific, data-anchored mentor line at the statistical dropout point), but **blocked on a delivery channel** (WhatsApp DRY-RUN / VAPID unprovisioned). Build dormant; in-PWA banner fallback works channel-free. Only fire when the leverage-axis data exists (suppress, never go generic).
- **Win-back sequence for cancelled subs.** *(Retention Idea 6.)* 7 days silence → one specific line → done. Pure incremental MRR against a written-off cohort (~₹60k/mo at 5K, ~₹1.5L at 12.5K). **Needs a channel + cancel-data from §2-item-1 + Postgres** for queue durability + DPDPA lawful-basis confirmation for post-cancel contact.
- **The Circle — bring-two cohort enrolment.** *(Features Idea 7.)* India-native group-buy/referral. **Soft-blocked on Postgres** (a referral graph on ephemeral `users.json` is lost money), and discount mechanics need legal-finance/conversion unit-economics validation. Lower priority than the *bundle pull* (NOW-3), which lifts ARPU instead of discounting it. Voice yellow ("refer & earn" is off-brand; must be "walk it with two others").
- **Regional-language Consultant nudges (Hindi first).** *(Retention Idea 9.)* Medium-confidence India-specific retention edge for the non-English-preferring cohort. Explicitly post-launch; **needs founder-approved native-speaker translations**, never machine output, and only for short operational nudges — the crafted Consultant copy stays English. Voice yellow.
- **Real stitched/scored Weekly Reveal MP4.** Depends on **ffmpeg** (deferral list). The client-side canvas slideshow stub is a sufficient v1. The reveal's hardcoded "airs Friday at 8pm" (P1-K) should be softened to a non-time-specific line until a real scheduled delivery exists.
- **Landing-page Lookmaxxing "how it works" strip + 12-question quiz polish (count/back).** *(Audit P2-A, P2-B.)* Real conversion polish, but additive and post-launch; the funnel works without them.
- **Infra un-defer track (route to scale-readiness-agent):** **R2** (durable baselines — unblocks NOW-2 quality + §2 item 3), then **Postgres** (stops silent de-activation-on-redeploy, which is itself involuntary churn; unblocks §2-item-2 dunning, win-back, cohort). These are not product features but they gate the items above and become *prerequisites the moment real money flows at sustained volume* — sequence by revenue threshold, not by feature.

---

## §4 — Killed (considered and explicitly rejected — do not relitigate)

- **Consultant live-chat / AI coach.** Promised on the Aura++ card as an unapproved placeholder (P3-D) and does not exist. A free-form chat is a large surface, a fresh prompt-injection vector (we already have one unguarded site, security §5), a per-message brand-voice liability, and a support/cost sink. **Out of scope until the baseline funnel is healthy. Remove/soften the card bullet — do not build it.**
- **Leaderboards / public Mirror Level rankings.** Turns the private status arc into a comparison-and-shame mechanic — exactly the toxic lane research §4 told us to avoid. The Mirror Level stays private.
- **Streak gamification (fire emoji, streak freezes, etc.).** The `🔥` is already a P0 voice violation being removed (0-B4). Doubling down is the "generic streak app" signal we differentiate against. (The Pause in §2-item-4 is the *dignified* exception — discipline-framed, not points-for-points.)
- **BetterMe-style quiz-/region-/ad-variable pricing.** "Confusing by design" pricing (research §1C) directly violates the anti-hype rule and the no-dark-patterns hard rule. Our transparent monthly price *is* the trust differentiator.
- **Fake scarcity / decoy pricing / "only 2 left" on the paywall.** Explicitly out of bounds (hard rule: no dark patterns). The bundle pull in NOW-3 is *earned and honest* or it isn't built.
- **Chasing peak-virality hooks (PSL ratings, mewing, "mog everyone," shame-then-triumph before/afters).** Research §4's honest verdict: these are fundamentally incompatible with the Consultant voice and are a press/brand-safety landmine. Our reach play is the calmer adjacent lane (evidence-vs-scam, quiet measured trajectory), not these.

---

## One-page sequencing view

```
START NOW (parallel):
  §0-A2 lawyer engagement (longest external lead time — start today)
  §0 engineering gates (login, photo-fail, deletion/consent, 🔥, prompt-guard)
  NOW-0 instrumentation (so launch metrics exist on day one)

THEN (founder clears 0-A1/0-A3/0-A4 flips in order):
  rotate keys → set webhook secret → rzp_live → test ₹1 sub → flip PAYWALL_PUBLIC

ON/AROUND LAUNCH (build code-ready now, light up at flip):
  NOW-1 seam echo (ship pre-launch) + recovery (gated on consent+channel)
  NOW-2 Day-30 re-audit (wants R2)
  NOW-3 bundle tag A/B + earned cross-sell

NEXT 5: autopay+cancel → involuntary-churn dunning (needs Postgres) →
        baseline delta → Mirror Level ladder + Pause → first-reading onboarding

BACKLOG / KILLED: as listed above.
```

*End of roadmap. No source files modified. Every item respects the Consultant voice (CLAUDE.md §2), the locked-copy rules (§6.3/§6.5), the deferral list (Postgres/R2/ffmpeg/VAPID/WhatsApp-live), and the founder-approval checkpoints (§9). All user-facing copy must be drafted by copy-consultant-agent and founder-approved before shipping.*
