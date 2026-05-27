# Brief — NOW-3: Honest bundle pull (checkout tag) + earned-moment Aura++ cross-sell

> Owner: Head of Conversion, MainCharacter. Date: 2026-05-28.
> Mode: BUILD-READY BRIEF — analysis/draft only. No source code changed in producing this.
> Sources: `product/ROADMAP_TO_1CR.md` (§1 NOW-3, §0 gates, §4 Killed), `product/opportunities-features.md` (Idea 3 "Aura++ Bridge"), `product/opportunities-conversion.md` (Idea 6 "honest bundle pull"), `product/opportunities-retention.md` (Idea 10 "cross-sell at earned moments"), `product/audit-lookmaxxing-pre-launch.md` (P2-I, P3-D). Code read: `public/paywall.html`, `routes/api.js:525-576`, `routes/lookmax.js:34-93`, `public/lookmax/index.html:40-89`, `models/User.js:84-273`.
> All user-facing strings below are drafts marked `DRAFT — founder approval required`. Founder owns The Consultant voice (CLAUDE.md §6 rule 5 / §9 checkpoint 7). Nothing here ships copy.

---

## 0. Grounding facts (verified in source — load-bearing for the build)

- **Aura++ is NOT a SKU.** It is a computed flag: `auraPlusPlus = oratorActive && lookmaxxingActive` (`models/User.js:273`). The checkout *plan* for "both pillars" resolves to the ₹1,999 bundle plan, but the entitlement is the AND of two booleans. We test framing of a card; we do not create a product.
- **Bundle auto-pricing already exists.** `POST /api/payment/subscribe` resolves both-pillars → bundle plan via `razorpay.resolvePlanForPillars(pillars)` (`api.js:534-539`). The Aura++ card already passes `begin(['orator','lookmaxxing'])` (`paywall.html:153`). **No pricing code is in scope for this brief.**
- **The Aura++ card today carries an unapproved bullet** promising an unbuilt feature: `"Founder access to The Consultant chat"` (`paywall.html:151`, `<!-- TODO copy review -->`). Roadmap §4 Killed: do not build the chat; remove/soften the bullet. **This must happen before the card is A/B-tested** — testing a card that lies invalidates the result and is a refund/voice liability (P3-D).
- **The current tag is generic.** `<div class="tag">Most chosen</div>` (`paywall.html:141`). This is the control variant of the A/B.
- **The dashboard cross-sell is always-on, not earned.** `public/lookmax/index.html:76-82` shows the banner whenever `!d.user.oratorActive`, every load, forever. This is the "wallpaper banner" Idea 10 replaces with a one-offer-then-silence earned trigger. The banner deep-links to `/paywall?upgrade=auraplus&from=lookmax`.
- **Mirror Level is computed + persisted per mirror.** `mirrorLevelFor(score)` maps avg score → `raw|polished|magnetic|radiant|sovereign` (`lookmax.js:35-41`); on each mirror submit the new level is written to `User.mirrorLevel` (`lookmax.js:93`). The earned-moment trigger reads a *rise* in this field. The User record has room for new flags (`models/User.js:84-87`).

---

## 1. The bet in one paragraph

The bundle is the structural moat (research §5.4: "voice and presence as one identity arc" is whitespace no competitor fills) and the shortest road to ₹1Cr — ~5,000 Aura++ subs at ₹1,999 versus ~12,500 solo subs at ₹799. NOW-3 lifts ARPU, the most scale-durable lever, without spending a rupee more on acquisition, through two honest moves. First, at checkout, we run a single-variable A/B on the Aura++ card's tag — "Most chosen" (control) vs "Saves ₹299/mo" vs "Voice and presence, one arc" — to learn which honest framing actually moves buyers to the bundle, with no scarcity, no decoy, no center-card trickery. Second, inside the product, we delete the always-on "Add The Orator" wallpaper banner and replace it with a once-only cross-sell that fires only at a genuinely earned moment — the user crosses a Mirror Level (e.g. Raw → Polished) or completes a positive Day-30 re-audit — where The Consultant observes the real progress and offers the second pillar as the natural other half, then goes silent for good. One offer at a moment of earned belief, then quiet. Before any of this is tested, the unapproved "Consultant chat" bullet comes off the Aura++ card so we are never testing a promise we cannot keep.

---

## 2. Concrete feature list (bullet by bullet)

### 2.0 PRE-TEST CLEANUP (must land before the card is A/B-tested)
- **Remove the unapproved "Founder access to The Consultant chat" bullet** from the Aura++ card (`paywall.html:151`). Per Roadmap §4 Killed: do not build the chat. Replace with an already-true, founder-approved bullet OR simply drop the line (the card already lists five honest bullets). Founder approves the replacement/removal. **This is a hard gate — testing a card that promises an unbuilt feature is invalid and a refund liability (P3-D).**

### 2.1 FACET A — Single-variable tag A/B on the Aura++ card (checkout)
- **One variable, three variants.** Vary ONLY the `.tag` text on the Aura++ card (`paywall.html:141`). Nothing else changes — same price, same bullets, same card position (Aura++ stays third/right; this is NOT a center-card-bias test). Hard rule: one change per test.
  - **Control (A):** `Most chosen` (current copy — keep verbatim).
  - **Variant (B):** `Saves ₹299/mo` (the honest, literal economic fact — bundle ₹1,999 vs ₹799+₹1,499=₹2,298).
  - **Variant (C):** `Voice and presence, one arc` `DRAFT — founder approval required` (the identity-arc framing, research §5.4).
- **Assignment:** deterministic bucket on a stable id (the existing `auditSessionToken` if present, else a first-touch random id persisted client-side), so a returning visitor sees the same variant. Even 3-way split.
- **Honest-framing guard (build-time assertion):** the variant set is a fixed allowlist of the three strings above. No code path may inject scarcity ("Only N left"), countdowns, decoy pricing, or fake "X people chose this" counters. (Roadmap §4 Killed; hard rule: no dark patterns.)
- **Instrumentation:** every paywall render logs `paywall_viewed{variant}`; every card tap logs `card_selected{plan, variant}`; subscribe + activation carry the variant through (see §4). Without this the test is unreadable (NOW-0 dependency).
- **No A/B on locked copy.** The landing hero, rank ladder, and Day-7 report are off-limits (hard rule). Only the tag string is tested.
- **Note:** bundle auto-pricing is untouched (`api.js:534-539` already correct).

### 2.2 FACET B — Earned-moment Aura++ cross-sell (one offer, then silence)
- **Remove the always-on banner.** Delete the unconditional `!d.user.oratorActive` cross-sell render block (`public/lookmax/index.html:76-82`). It becomes a no-op until an earned moment fires.
- **Define the earned moments (triggers).** The cross-sell becomes eligible to show ONLY when, for a `lookmaxxingActive && !oratorActive` user, one of these is true:
  1. **Mirror Level rise** — the persisted `User.mirrorLevel` crosses upward versus the last-seen level (e.g. `raw → polished`). Detected by comparing the new level written at `lookmax.js:93` against a stored `lastCrossSellLevel` / `mirrorLevelSeen`.
  2. **Positive Day-30 re-audit** — the NOW-2 re-audit completes with a net-positive overall delta vs baseline. (This trigger is dormant until NOW-2 ships; build the hook, gate the firing.)
- **One-offer-then-silence logic (new user-record state).** Add to the User record (room exists, `models/User.js:84-87`):
  - `auraCrossSellShownAt` (timestamp, null until shown) — once set, the cross-sell never shows again. This is the silence guarantee.
  - `auraCrossSellTrigger` (`'mirror_level' | 're_audit'`) — which moment fired it (for analytics).
  - `auraCrossSellDismissedAt` (timestamp) — user dismissed; also enforces silence.
  - The offer renders at most ONCE per user, ever. After show OR dismiss OR accept, it is permanently quiet. No re-show on next level, no monthly re-prompt. (Idea 10: "one offer, tied to a real achievement, then it goes quiet"; the counter-metric in §4 guards this.)
- **The offer surface.** A single dignified card on the dashboard (reusing the existing `card--gold card--cta` styling already in `index.html`), shown on the first dashboard load after an eligible trigger. Contains: one Consultant line referencing the *actual* milestone, the bundle math (₹1,999, saves ₹299), one "Add The Orator" CTA deep-linking to `/paywall?upgrade=auraplus&from=lookmax`, and a quiet dismiss. No second CTA, no urgency, no countdown.
- **Live-delivery gate (HARD — see §5).** The cross-sell may be *shown* now, but the live Aura++ *upgrade-to-Orator purchase* must NOT be enabled until WhatsApp is live, because the Orator pillar is WhatsApp-delivered. Selling a pillar that cannot be delivered is the P2-E failure class. Until WhatsApp is live: either keep the offer in soft "coming" framing OR hold Facet B entirely. Facet A (checkout tag) does not have this constraint — the buyer at the public paywall is choosing pillars at first purchase, where WhatsApp delivery is the existing Orator launch dependency anyway.
- **Anti-nag fail-safe.** If the user-record state is lost (JSON-wipe on redeploy, landmine #1), the offer may re-show once — acceptable fail-open for a single dignified card, but flagged: durable state (Postgres) makes the silence guarantee real. Until then, cap by also checking `oratorActive` (a user who already bought is never shown).

### 2.3 What is explicitly NOT being built here
- No Consultant chat (Roadmap §4 Killed; bullet removed in §2.0).
- No pricing/checkout changes (auto-pricing exists).
- No center-card-bias reordering (that would be a second variable; hard rule: one change per test).
- No scarcity/decoy/urgency mechanics of any kind.

---

## 3. User experience walkthrough

### 3.1 Checkout path (Facet A — public paywall, `PAYWALL_PUBLIC=true`)
1. User finishes the free audit, sees their Aura Score + leverage point, taps "See Your Protocol →", lands on `/paywall` (public mode → `paywall.html`).
2. `loadAuditSummary()` (`paywall.html:195-210`) echoes their real score: "Your Aura Score: 62/100. Hair density is your leverage point." (existing, on-voice, NOW-1 territory — unchanged here).
3. Three cards render: Orator ₹799 / Lookmaxxing ₹1,499 / Aura++ ₹1,999. The Aura++ card shows the user's assigned **tag variant**:
   - A: `Most chosen`
   - B: `Saves ₹299/mo`
   - C: `Voice and presence, one arc` `DRAFT — founder approval required`
   - All other Aura++ card copy identical across variants. The `"Founder access to The Consultant chat"` bullet is GONE (§2.0). Replacement bullet, if any: `DRAFT — founder approval required`.
4. `paywall_viewed{variant}` logs on render.
5. User fills name + WhatsApp + optional email, taps "Begin →" on a card. `card_selected{plan, variant}` logs. For Aura++, `plan: 'aura'`.
6. `POST /api/payment/subscribe` resolves the bundle plan automatically (`api.js:534-539`), returns the Razorpay short_url; the variant is recorded on the user/event so `subscription_activated` can be attributed.
7. Razorpay → `/payment-confirmed`. Standard flow. No copy change in scope here.

**Honest framing only.** No card claims scarcity. The bundle is presented as a true economic fact (saves ₹299) or a true identity statement (one arc) or the true social fact (most chosen, IF it remains true once we have data — if it stops being most-chosen, the founder must retire that tag; an untrue "most chosen" would be a dark pattern).

### 3.2 Earned-moment cross-sell path (Facet B — inside the PWA)
1. A Lookmaxxing-only subscriber (`lookmaxxingActive && !oratorActive`) does their daily mirror. Their average score crosses a band — `mirrorLevelFor` returns `polished` where the last seen was `raw` (`lookmax.js:35-41,93`).
2. On the next dashboard load, the eligibility check sees `mirrorLevel` rose AND `auraCrossSellShownAt` is null AND `!oratorActive`. The earned-moment card renders ONCE. `cross_sell_shown{trigger:'mirror_level'}` logs; `auraCrossSellShownAt` is set.
3. The card (Consultant voice):
   > **DRAFT — founder approval required**
   > "You crossed into Polished. Presence is moving — measured, not flattered.
   > How you sound is the other half of presence. The Orator works the voice the way the mirror works the face.
   > Aura++ holds both. ₹1,999 a month — ₹299 less than the two apart.
   > Add The Orator → · Not now"
   > (No exclamation marks. Only `◆` permitted as emoji. One CTA + one quiet dismiss.)
4. If the user taps "Add The Orator →": `cross_sell_accepted{trigger}` logs; deep-link to `/paywall?upgrade=auraplus&from=lookmax`. Because they already hold Lookmaxxing, the upgrade resolves to the Orator add-on at the bundle delta (entitlement becomes the AND → Aura++). **Live purchase gated on WhatsApp being live (§5).**
5. If the user taps "Not now" or simply leaves: `auraCrossSellDismissedAt` set (or `auraCrossSellShownAt` already enforces it). The card never appears again. Silence.
6. Positive Day-30 re-audit path (dormant until NOW-2): on a net-positive re-audit completion, same one-offer-then-silence card with `trigger:'re_audit'` and a re-audit-anchored Consultant line `DRAFT — founder approval required` (e.g. "Thirty days. The jaw axis moved +N — your own measurement. The voice is the half you haven't worked yet.").

**Down-delta / no-rise safety:** the cross-sell fires only on a *rise* or a *positive* re-audit. A flat or down month shows nothing — we never cross-sell off a bad reading. (Mirrors the NOW-2 down-delta dignity rule.)

---

## 4. KPIs to track

> Log location: the NOW-0 append-only event sink (`audit_started … first_mirror`), keyed by session/user id, surfaced on `/admin`. New events/fields below extend that schema. Until NOW-0 lands, none of this is readable — it is a hard dependency (§6).

### Leading metrics (move first)
- `paywall_viewed{variant}` — denominator for the tag A/B (per variant).
- `card_selected{plan, variant}` — specifically `card_selected{plan:'aura', variant}`: the immediate signal of which tag pulls toward the bundle.
- `cross_sell_shown{trigger}` — how often an earned moment fires (mirror_level vs re_audit).
- `cross_sell_accepted{trigger}` — taps on "Add The Orator" from the earned card.

### Lagging metrics (the money)
- **Bundle attach rate** = `subscription_activated{plan:'aura'}` ÷ all `subscription_activated`. Per-variant for Facet A. Target: shift ~24% → ~30% of buyers (+₹40–50 blended ARPU).
- **Cross-sell conversion** = `subscription_activated` attributable to a prior `cross_sell_accepted` ÷ `cross_sell_shown`. Target: +12% of eligible Lookmaxxing subs upgrade at an earned moment (Idea 10).
- **Blended ARPU** = total MRR ÷ active paid subs. The headline NOW-3 number; the whole bet is judged here.

### Counter-metrics (the guard — do NOT let the cross-sell nag and lift churn)
- **Cross-sell-cohort churn delta** = Day-30/Day-60 churn of users shown the cross-sell vs matched users not yet shown. If the offer cohort churns *higher*, the offer is reading as a nag — pull it. This is the explicit Idea 10 risk ("over-prompting damages the dignity positioning").
- **Cross-sell re-show count** = count of users who saw the card more than once. Target: ZERO (the one-offer-then-silence guarantee). Any non-zero value is a bug (state-loss / logic error), not a tuning knob.
- **Dismiss rate** = `auraCrossSellDismissedAt` set ÷ `cross_sell_shown`. A high dismiss rate with low churn delta = harmless; high dismiss + high churn = the offer is mistimed (firing at a non-earned moment).

### /admin tiles (names)
- **"Bundle attach rate"** (with per-variant breakdown when the A/B is live).
- **"Aura++ tag A/B"** (variant → card_selected{aura} → activated, with conversions-per-variant so the ≥100-conversions-per-variant rule is visible before any winner is called).
- **"Earned cross-sell"** (shown / accepted / dismissed / re-shown=0, plus the churn-delta guard).
- **"Blended ARPU"** (the top-line NOW-3 number, trended).

### A/B discipline (hard rules, restated)
- One change per test (only the tag string).
- Do NOT call a winner with <100 conversions per variant unless the lift is huge and consistent. At ~10k audits/mo and a ~12–16% seam, a 3-way split reaches 100 `card_selected{aura}` per variant in a readable window; below that, hold the call. Surface conversions-per-variant on the admin tile so the founder never calls early.
- The cross-sell (Facet B) is a product change, not an A/B — measure pre/post on bundle attach and the churn counter, not a split.

---

## 5. Out of scope (explicit)

- **Do NOT enable the live Aura++ upgrade-to-Orator purchase until WhatsApp is live.** The Orator pillar is WhatsApp-delivered (CLAUDE.md §1); WhatsApp is DRY-RUN until Meta creds are set (landmine #5). Selling a second pillar that cannot be delivered is the **P2-E failure class** (the "voice or text both work" broken-promise pattern). Until WhatsApp sends are live: hold Facet B's *live purchase*, or use founder-approved soft "coming" framing only. The earned-moment card may be *built and shown* in dogfood, but the buy button must not transact a real Orator subscription pre-WhatsApp.
- **No Consultant chat.** Removed, not built (§2.0, Roadmap §4 Killed).
- **No pricing/checkout/plan-resolution changes** — bundle auto-pricing already works (`api.js:534-539`).
- **No center-card-bias / card-reordering test** — that is a second variable and violates one-change-per-test. The Aura++ card stays in its current position.
- **No scarcity, no decoy pricing, no "only N left," no fake counters, no urgency timers** — hard rule, Roadmap §4 Killed.
- **No A/B on locked copy** (landing hero, rank ladder, Day-7 report).
- **NOW-2 re-audit itself is not built here** — Facet B builds the *hook* for the re-audit trigger; the re-audit engine is NOW-2's scope.

---

## 6. Dependencies in order

1. **NOW-0 instrumentation (PRECONDITION).** The event sink + `/admin` tiles must exist or neither facet is measurable. `paywall_viewed{variant}`, `card_selected{plan,variant}`, `cross_sell_shown/accepted{trigger}`, `subscription_activated{plan,variant}`. Without this we "call winners on vibes" (forbidden).
2. **Public paywall live (`PAYWALL_PUBLIC=true`)** — required for Facet A to run on real buyers (gated behind all of Roadmap §0-A/§0-B; founder-only flip, §9 checkpoint 3). The tag A/B cannot read on the waitlist page.
3. **Pre-test cleanup (§2.0)** — remove the unapproved chat bullet BEFORE the card is tested. Founder copy approval.
4. **Login fixed (0-B1)** — Facet B lives inside `/lookmax/`, unreachable by a real paying user until login works (P0-1). Hard precondition for the earned-moment trigger.
5. **Best paired with NOW-2 (Day-30 re-audit)** — the re-audit trigger has no event to fire on until NOW-2 ships. Build the hook now (mirror-level trigger works standalone); light the re-audit trigger when NOW-2 lands.
6. **Founder copy approval (§9 checkpoint 7)** — every DRAFT string here (tag variant C, the earned-moment Consultant lines, the chat-bullet replacement). Nothing user-facing ships without it.
7. **WhatsApp live (for Facet B live purchase only)** — see §5. Facet A does not need it (Orator's WhatsApp dependency is the existing launch gate either way).
8. **Durable state (Postgres) — soft.** The one-offer-then-silence guarantee and the per-variant attribution survive a redeploy only with durable storage (landmine #1). Fail-open is acceptable for a single card, but the silence guarantee is only truly real on Postgres. Flag to scale-readiness; not a launch blocker for the test.

---

## 7. Honest build estimate

Assumes NOW-0 instrumentation already exists (it is the precondition, costed separately in its own brief). This estimate is ONLY the NOW-3 increment on top of NOW-0.

| Work item | Claude Code (autopilot) | Founder | Notes |
|---|---|---|---|
| §2.0 Remove chat bullet + wire replacement | 0.5 h | 0.5 h (approve replacement copy) | One line in `paywall.html`; founder must approve the bullet that replaces it. |
| §2.1 Facet A — tag A/B (assignment, render, 3 variants, event wiring) | 3–4 h | 1 h (approve variant C copy) | Deterministic bucketing on stable id; allowlist guard against non-honest variants; pass variant through to `subscribe`/activation events. |
| §2.2 Facet B — earned-moment cross-sell (remove banner, trigger logic, one-offer-then-silence state, dashboard card) | 5–7 h | 1.5 h (approve earned-moment Consultant lines, both triggers) | New User fields, level-rise detection vs stored `lastCrossSellLevel`, render-once card, dismiss handling, `oratorActive` fail-safe. Re-audit trigger hook only (firing gated on NOW-2). |
| Vitest coverage (bucketing determinism, one-offer-then-silence never re-shows, honest-variant allowlist, trigger fires only on rise/positive) | 2–3 h | — | Test-first per §6.6. Regression test that the cross-sell never shows twice and never shows to `oratorActive` users. |
| /admin tile wiring (4 tiles in §4) | 1.5–2 h | 0.5 h (eyeball the tiles) | Extends the NOW-0 admin surface. |
| Brand-voice + smoke pass, DECISIONS.md/BACKLOG.md, commit | 1 h | 0.5 h (final copy sign-off on live strings) | §7 Definition of Done. |
| **Subtotal** | **~13–17.5 h autopilot** | **~5.5 h founder** | |

- **Claude Code autopilot:** ~13–17.5 hours of focused build (≈ two working sessions).
- **Founder hours:** ~5–6 hours, almost entirely copy approval (every DRAFT string) + flipping `PAYWALL_PUBLIC` after §0 gates + a manual happy-path walk-through.
- **Wall-clock:** **~3–4 days** assuming NOW-0 is live and §0 launch gates are cleared. Facet A can ship the day the public paywall flips; Facet B's mirror-level trigger ships with login (0-B1); Facet B's re-audit trigger lights up only when NOW-2 lands (so the full bet is "done" when NOW-2 is done — pair them).

> No source files modified in producing this brief. Every user-facing string is a DRAFT pending founder approval (§9 checkpoint 7). The bet respects the hard rules: no dark patterns, no fake scarcity, no decoy pricing, one change per test, ≥100 conversions/variant before a call, cancel-flow dignity unaffected, and the WhatsApp-delivery gate on the live Orator upsell (P2-E).
