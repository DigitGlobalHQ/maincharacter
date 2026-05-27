# Conversion Opportunities — Lookmaxxing / Aura++ Funnel

> Owner: Head of Conversion, MainCharacter
> Date: 2026-05-28
> Scope: ANALYSIS ONLY — no code changed. Every idea is an addition/tweak within the existing architecture, brand-voice compliant per CLAUDE.md §2.
> Grounded in: `product/audit-lookmaxxing-pre-launch.md`, `growth/research-india-aesthetic-market.md`, `security/audit-pre-public-launch.md`, plus direct reads of `public/audit.html`, `public/paywall.html`, `public/paywall-waitlist.html`, `routes/api.js`.

---

## The funnel, as it actually stands today

```
Landing (/) → Begin Audit → /audit (quiz 12 + 3 photos) → analysis → Aura Score + diagnosis
   → "See Your Protocol →" → /paywall
        ├── PAYWALL_PUBLIC=false (NOW): paywall-waitlist.html → join waitlist (DEAD-ENDS personalisation)
        └── PAYWALL_PUBLIC=true (flip): paywall.html (3 cards) → /api/payment/subscribe → Razorpay → /payment-confirmed → /lookmax/
```

**No analytics are wired.** There is no event log, no funnel instrumentation, no `/api/event` sink. The admin dashboard (P1-M) shows Orator-only counts and zero Lookmaxxing funnel metrics. **Before any A/B test can be *read*, step-level event capture must exist.** This is the precondition for everything below — it is Idea 0, not optional.

Every back-of-envelope MRR figure below is anchored to the three CLAUDE.md scale points: **1,000 / 5,000 / 12,500 paid subscribers**. At the blended ARPU we use ₹1,200 (between Orator ₹799, Lookmaxxing ₹1,499, Aura++ ₹1,999 — Lookmaxxing-led launch skews above ₹799). Where an idea moves a *specific* step, I state the step and the arithmetic. These are directional sizing, not forecasts — we have no live baseline yet.

---

## IDEA 0 (precondition, not counted in the 5–10) — Step-level funnel instrumentation

Without this, no test below is measurable and we will "call winners" on vibes. A minimal append-only event sink (`audit_started`, `quiz_completed`, `photos_submitted`, `analysis_shown`, `paywall_viewed`, `card_selected{plan}`, `subscribe_clicked`, `subscription_activated`, `first_mirror`) keyed by the existing `auditSessionToken` / user id, surfaced as funnel counts on `/admin`, is the foundation. Small backend addition reusing the existing JSON-CRUD pattern (move to Postgres with the rest). **Do this first or the rest is guesswork.** Build: Small. Voice: green (no user-facing copy). Dependency: none. Risk: low.

---

## IDEA 1 — Carry the audit personalisation through the conversion seam (fix P0-3)

- **Name:** Personalised paywall/waitlist echo — "your score, your leverage point, then the ask"
- **What it does:** Today, the public paywall already echoes the audit ("Your Aura Score: NN/100. <axis> is your leverage point." — `paywall.html:195-210`, fed by `/api/audit/result/:token`), but the *currently live* waitlist page (`paywall-waitlist.html`) throws all of that away — the `auditSessionToken` is passed to the API at `:95` but never shown to the user. This reuses the exact existing echo pattern on the waitlist page (and hardens it on the public paywall) so the moment after a personalised Aura Score, the user sees that score reflected back above the form ("Your Aura Score was 62. Hair density is your leverage point. Hold your place — the first cohort is walked in by hand."). One existing line of personalisation, moved 50 lines of code, onto the highest-drop page in the funnel.
- **Why it helps the user:** The spell is not broken. The momentum from "here is your specific weakness" flows directly into the ask, instead of evaporating into a generic form that could belong to any product. It respects the work they just did (12 questions + 3 photos).
- **Why it helps MRR:** Moves **audit-complete → paywall-action** (waitlist signup now, subscription at flip). This is the single highest-leverage break in the product (audit's own P0-3). A conservative 3–5pp lift on the seam. If 10,000 audits/mo complete and the seam converts at, say, 12% → 16%, that is 400 extra warm leads/mo into the paid funnel; at an 8% lead→paid that is ~32 extra subs/mo ≈ ₹38k MRR added per month at current-ish traffic. At 5K-paid-scale traffic the same 4pp seam lift compounds to roughly **₹1.5–2L MRR**; at 12.5K-paid scale, **₹4–5L MRR**. It is the cheapest large lever we have.
- **Build difficulty:** Small (reuse `loadAuditSummary` pattern on the waitlist page).
- **Brand voice compatibility:** green — echoing the user's real score/axis is *exactly* the "always specific, reference what they did" rule (§2). No new hype.
- **Dependencies:** none new — `/api/audit/result/:token` exists and works. Copy line needs founder sign-off (§6 rule 7).
- **Risk:** low. Only risk is showing a stale/expired session (>24h) — guard by hiding the echo if the fetch 404s (the public paywall already does this).

---

## IDEA 2 — UPI Autopay as the default, framed against the weekly-billing trap

- **Name:** "Billed monthly. Cancel anytime. No weekly surprise." — UPI Autopay default + transparency line
- **What it does:** Ensures Razorpay Subscriptions offers **UPI Autopay as the default method** at checkout (research §2: 53% of Indian recurring payments, frictionless under the ₹15,000 ceiling — all our prices qualify), and adds one transparent payment-method line on the paywall positioning us explicitly against the Umax-style weekly-billing disguise ("$3.99/week" that hides the annualised cost). A/B: control = current paywall, no payment-framing line; variant = adds a single restrained line near the cards ("Billed monthly by UPI Autopay. Cancel in one tap. No hidden weekly charge.").
- **Why it helps the user:** UPI Autopay is the payment method Indian users already trust for recurring debits; cards mean re-auth friction and failure. The transparency line removes the #1 fear the category has trained into users (the paywall-trap apps), which is "what am I actually signing up to pay."
- **Why it helps MRR:** Moves **paywall-view → subscription-started** (the big one). Reducing checkout-method friction + payment anxiety is a classic 2–4pp lift on the final tap, and UPI Autopay also lifts **renewal success** (fewer failed recurring debits → less involuntary churn, which protects Day-30 retention). At 1K paid, a 3pp final-tap lift plus ~2pp fewer failed renewals is worth roughly **₹40–60k MRR**; at 5K, **₹2–3L**; at 12.5K, **₹5–7L** — and the renewal-success half compounds because it is recurring, not one-time.
- **Build difficulty:** Small (Razorpay subscription config + one copy line). Note: the subscribe flow already exists end-to-end (`api.js:525-576`); this is method-ordering + a line.
- **Brand voice compatibility:** green — "cancel anytime, no hidden charge" is dignified honesty, the opposite of a dark pattern. Must avoid exclamation; phrase as a calm statement.
- **Dependencies:** Razorpay must be live (`rzp_live_*` + `RAZORPAY_WEBHOOK_SECRET` set — security blocker #1/#2 and audit P0-4). Cannot ship the live-payment half until those flip in order.
- **Risk:** low. The "cancel in one tap" claim is a *promise we must keep* — pairs hard with Idea 8 (one-click cancel). Do not ship the claim without the mechanism, or it becomes a dark pattern by omission.

---

## IDEA 3 — Make the free audit result saveable and shareable (fix P1-E + the viral loop)

- **Name:** "Keep your reading" — save/recover + dignified share of the Aura Score
- **What it does:** The audit result currently lives only in the browser tab; close it and the Aura Score + diagnosis are gone forever (`audit.html` holds the only `sessionToken` in memory; the 24h server session is unreachable without it). This surfaces the existing `/audit/result/:token` link with a small "Keep this reading" affordance (copy-link / get-on-WhatsApp once channels are live) and a restrained "this is shareable" nudge on the result screen — framed as *measured trajectory*, never a "rate my face" verdict (research §4: the dignified inversion of the rating trend). No score-as-worth framing.
- **Why it helps the user:** They don't lose a personalised result they invested 5+ minutes earning. They can come back to it, sit with it, and decide to subscribe later — and share it with a friend without it feeling like the toxic PSL-score screenshot.
- **Why it helps MRR:** Two effects. (1) **Recovery:** a saveable result + a recoverable link is the prerequisite for the abandoned-audit nudge (Idea 7) — it turns the warmest cohort from un-reachable to re-engageable. (2) **Viral coefficient:** each shared reading is a top-of-funnel landing visit at zero CAC. Even a modest k=0.08 (1 in 12 sharers drives a new audit) compounds: at 10k audits/mo that is ~800 extra audits/mo feeding the whole funnel. At 1K paid this is small (~₹15–25k MRR via recovered + referred subs); at 5K it is ~₹1–1.5L; at 12.5K, where organic share volume is highest, **₹3–4L MRR** and falling CAC — the lever that matters *most* at scale, least at launch.
- **Build difficulty:** Small (the route exists; this is wiring + one nudge). Share-to-WhatsApp depends on channels being live.
- **Brand voice compatibility:** yellow — share copy is the single riskiest brand surface (the category's whole disease is shame-driven sharing). Must be the "Day 1 vs Day 30, quietly" register (research §4). Founder/copy-consultant sign-off mandatory before any share string ships.
- **Dependencies:** WhatsApp/email channels for the "send me this" path (DRY-RUN until Meta live). Copy-link/screenshot path works today. DPDPA: a shareable result URL must not leak photos — confirm `/audit/result/:token` returns scores/diagnosis only, never image URLs (security #6).
- **Risk:** medium — entirely a voice/safety risk on the share creative, not a technical one. Get the copy right or don't ship the share half.

---

## IDEA 4 — Rescue the highest-intent drop: photo-upload failure recovery (fix P0-2)

- **Name:** Don't lose them at the photo step — specific failure messaging + downscale hardening
- **What it does:** Photo upload is the highest-investment, highest-intent moment in the free funnel and it silently fails on large/HEIC Android photos: on `img.onerror` the client resolves the *original* unprocessed file (`audit.html:247`), which can exceed the server's 8MB limit (`audit.js:20-23`) → Multer rejects → user sees only "Upload failed. Try again." → same files fail again → hard dead-end after 12 questions. This (a) on decode failure shows a specific, recoverable message ("This photo couldn't be read — try a JPG or a fresh camera shot"), (b) drops `capture` on the full-body input so the gallery is available (no realistic self-capture path otherwise — P1-B), and (c) adds an upload progress indicator so a slow connection doesn't look frozen (P1-C). Not a new flow — guardrails on the existing one.
- **Why it helps the user:** The most committed users — the ones who answered every question and are *trying* to give us their photos — stop hitting an unexplained wall. They get a clear, actionable recovery instead of a dead-end.
- **Why it helps MRR:** Moves **audit-start → audit-complete**, and the audit explicitly calls Scene 3 "the single biggest drop-off risk in the entire funnel." If photo failure is silently killing even 8–12% of high-intent completers on mid-range Android (the target device), recovering half of that is a 4–6pp completion lift feeding *every* downstream step. At 1K paid this is worth ~₹50–80k MRR (more completions → more paywall views → more subs); at 5K, ~₹2.5–4L; at 12.5K, **₹6–9L** — and unlike copy tests this is pure recovered loss, not a marginal lift. Highest-confidence number in this doc because the failure is verified in source, not hypothesised.
- **Build difficulty:** Small-to-Medium (client guardrails + confirm server-side `sharp` HEIC re-encode; if sharp can't decode HEIC, document the limitation and message accordingly).
- **Brand voice compatibility:** green — error copy is restrained and specific (exactly §2). One short line; founder sign-off.
- **Dependencies:** none new. Confirm `sharp` is installed and handles HEIC (audit flags this as unconfirmed).
- **Risk:** low. The only risk is *not* doing it — this is a known revenue leak at the most expensive step.

---

## IDEA 5 — Risk-reversal: a bounded, honest "measurable-change-or-pause" promise on the ₹1,499 tier

- **Name:** The Traya-style de-risker, in Consultant voice
- **What it does:** Traya wins a higher price point (₹1,800–₹3,200/mo) partly on a 5-month money-back guarantee (research §1, §2 — "a de-risker we currently lack"). This adds a bounded, honest risk-reversal to the Lookmaxxing/Aura++ cards: a "30-day measurable-change-or-pause" promise — if your Aura Score hasn't measurably moved by the Day-30 re-audit, we pause your billing, no questions. This is *not* "money back, get rich" hype; it is the mentor saying "the work is measurable, and we stand behind the measurement." A/B: control = current cards; variant = adds one risk-reversal line under the Lookmaxxing + Aura++ price.
- **Why it helps the user:** Directly attacks the ~80%-pay-nothing willingness-to-pay reality (research §2): the felt risk of ₹1,499/mo for an unproven outcome is the barrier, not the price level. A bounded pause-not-refund promise lowers the cost of saying yes without insulting their intelligence.
- **Why it helps MRR:** Moves **paywall-view → subscription-started** on the higher-ARPU tiers specifically — the most valuable conversions to lift. Guarantees on outcome-uncertain purchases routinely lift conversion 5–15%; even a cautious 4pp on the ₹1,499/₹1,999 cards is high-value per conversion. At 1K paid skewed to Lookmaxxing, ~₹60k–1L MRR; at 5K, ~₹3–4L; at 12.5K, **₹7–10L**. The catch: it only nets positive if the Day-30 re-audit *exists* (P1-L — currently sold but not built) and genuinely shows movement, otherwise the pause-rate eats the lift.
- **Build difficulty:** Medium — the promise is one copy line, but honouring it requires the Day-30 re-audit (P1-L) to be real, plus a billing-pause path in Razorpay. Do not ship the claim before both exist.
- **Brand voice compatibility:** yellow — guarantees skate close to hype. "Measurable-change-or-pause" stays on-voice (honest, specific, no exclamation); "money-back guarantee!!" does not. Founder + legal-finance must approve the exact wording and the unit economics before any public claim (research explicitly flags: "validate unit economics first").
- **Dependencies:** Day-30 re-audit must be built (P1-L). Razorpay billing-pause mechanism. Legal sign-off on the promise wording (DPDPA/consumer). Unit-economics check on expected pause rate.
- **Risk:** medium-high — the only idea here that can *lose* money if pause-rate is high or the re-audit shows no movement. Gate hard behind unit economics. Worth testing precisely because the upside is on the highest-ARPU tiers.

---

## IDEA 6 — Honest bundle pull at checkout (Aura++ as the natural next step, not a center-card trick)

- **Name:** "You're strong in voice, weakest in presence — most people take both" — earned bundle nudge
- **What it does:** The bundle (Aura++ ₹1,999, saves ₹299) is a structural whitespace no competitor fills (research §5.4: "voice + presence as one identity arc is unoccupied"). The current "Most chosen" tag on the Aura++ card (`paywall.html:141`) is fine but generic. This A/B tests the Aura++ card's framing — **one variable, one change** — using the user's *actual audit* to earn the bundle nudge, not a manufactured center-card bias. Variants (test sequentially, never multivariate): (A control) "Most chosen"; (B) "Saves ₹299/mo"; (C) "Both pillars — voice and presence as one arc." All three pass the voice bar; we let the data, not a guess, pick. The earned-personalisation layer: when the audit reveals a clear leverage point, the bundle nudge can reference it honestly ("Your presence is your leverage point — Aura++ pairs it with the voice work"). **No fake scarcity, no "only 2 left," no decoy pricing.**
- **Why it helps the user:** A user who came for Lookmaxxing gets an honest, specific reason the bundle might fit *them* — tied to their own diagnosis — rather than a generic "everyone picks this." If the bundle isn't right for them, the single-pillar cards are equally clear.
- **Why it helps MRR:** Moves **ARPU**, not just conversion rate — the highest-leverage variable of all, because it multiplies every subscriber. Shifting even 6% of single-pillar buyers to the ₹1,999 bundle raises blended ARPU materially. If 30% of buyers take Aura++ vs 24% baseline, blended ARPU rises ~₹40–50. At 1K paid that is ~₹40–50k MRR; at 5K, ~₹2–2.5L; at 12.5K, **₹5–6L MRR** — pure margin, no extra acquisition cost. ARPU lift is the most scale-durable lever in the doc.
- **Build difficulty:** Small (tag-copy A/B + optional audit-tie line). The bundle pricing already auto-applies when both pillars are selected (`api.js:534-539`).
- **Brand voice compatibility:** green for the three tag variants and the honest audit-tie; **red** for any scarcity/decoy framing — those are explicitly out of bounds (hard rule: no dark patterns). The "Founder access to The Consultant chat" bullet (`paywall.html:151`, TODO copy review) promises an unbuilt feature — must be approved/removed before this card is tested (P3-D).
- **Dependencies:** Idea 0 (to read which tag wins). Public paywall live for the real test; can pre-test tag copy in a soft way on the waitlist's pillar-intent. Founder copy sign-off.
- **Risk:** low, *if* we stay inside the no-dark-patterns rule. The discipline is: one change per test, ≥100 conversions per variant before calling it (hard rule), and never reach for scarcity.

---

## IDEA 7 — Abandoned-audit recovery (the warmest cohort gets a dignified nudge)

- **Name:** "Your reading is still here" — single, restrained re-engagement of audit-completers who didn't convert
- **What it does:** A user who finished a free audit, saw their Aura Score, and bounced at the paywall is the warmest re-engagement cohort in the product and currently gets *zero* follow-up (P2-O). The 24h server session exists (`audit.js`) and a dormant `sendAuditConfirmation` email service already exists. This wires **one** dignified nudge (email and/or WhatsApp once live) referencing their actual score and leverage point: "Your reading is still here. <axis> was your leverage point. The work is yours when you're ready. ◆" One message, not a sequence — no nagging, no manufactured urgency.
- **Why it helps the user:** Many drop at the paywall for reasons unrelated to interest (interrupted, wanted to think, on mobile data). A single calm reminder of their own result respects that without harassing them. No "limited time" pressure.
- **Why it helps MRR:** Moves **audit-complete → subscription-started** by recovering warm intent that currently leaks 100%. Even recovering 3–5% of abandoners is meaningful because these are pre-qualified, high-intent users. At 10k audits/mo with a 12% seam, ~8,800 abandon; recovering 4% = ~350 re-engaged, at 8% paid = ~28 subs/mo ≈ ₹33k MRR/mo *added recurring*. At 5K-scale traffic, ~₹1.5–2L; at 12.5K, **₹4–5L**. Compounds with Idea 1 (better seam = fewer abandoners to chase) and Idea 3 (saveable result = recoverable contact).
- **Build difficulty:** Small-to-Medium (the email service + 24h session exist; this is wiring + a scheduled job, gated on a captured contact at audit time — which today we only get at the paywall/waitlist, so this depends on capturing email/phone earlier or on Idea 1+3).
- **Brand voice compatibility:** green — single, specific, no urgency, ends with ◆. This is the textbook Consultant register. Founder sign-off on the line.
- **Dependencies:** Channels live (WhatsApp Meta / Resend — DRY-RUN until set). A captured contact for abandoners (today contact is only collected at the form they abandoned — so this needs an earlier opt-in or pairs with Idea 3's save-link). DPDPA consent for outreach.
- **Risk:** low-medium. Risk is volume/cadence creep — strictly one message. Two becomes nagging and breaks the dignified positioning.

---

## IDEA 8 — One-click dignified cancel (defensive, but a precondition for paid acquisition)

- **Name:** The cancel flow that protects the brand and unlocks paid spend
- **What it does:** There is no in-product way to cancel or manage a subscription (P2-H: the "Profile" tab just reloads the dashboard). The hard rule is explicit: "Cancel-flow first. If we're going to optimize for paid acquisition, the cancel-flow must be one click and dignified — not a maze." This adds a minimal account panel (plan, next billing, **one-tap cancel**, logout — P1-I) that cancels the Razorpay subscription cleanly, with a calm confirmation ("Your work pauses here. The door stays open. ◆") and no retention-maze, no guilt screen, no "are you sure you want to lose your progress" dark pattern.
- **Why it helps the user:** They can leave with dignity — which, paradoxically, is what makes them comfortable starting. The fear of being trapped (the category's reputation: "subscription-heavy, multiple paywalls, aggressive auto-renewal") is a real pre-purchase barrier.
- **Why it helps MRR:** Two ways. (1) It is the *precondition* for honest paid acquisition and the "cancel anytime" claim in Idea 2 — without it those are dark patterns and we can't ethically run ads. (2) Counter-intuitively, easy cancel *raises* trial→paid and reduces chargebacks/disputes (which Razorpay penalises) and 1-star "scam" reviews (which the category is drowning in — research §1). The MRR effect is indirect: it doesn't lift a funnel step directly, it *unlocks* the paid-acquisition engine that fills the top of the funnel and protects the LTV of everyone we acquire. At 12.5K-paid scale, avoiding even a 1% chargeback/dispute rate and the review-reputation damage is worth far more than its build cost — call it **₹2–4L MRR protected** at scale, mostly via lower involuntary churn and sustained ad eligibility.
- **Build difficulty:** Medium (account panel + Razorpay subscription-cancel call + the existing `LM.logout` wiring, P1-I).
- **Brand voice compatibility:** green — a dignified cancel *is* the brand. Confirmation copy needs founder sign-off but the register is clear.
- **Dependencies:** P0-1 (login) must be fixed first — a paying user can't reach any account panel today. Razorpay subscription-cancel API. DPDPA self-serve expectations (legal-finance to confirm whether self-cancel is launch-required).
- **Risk:** low. The only "risk" is the instinct to add retention friction — which is explicitly forbidden and off-brand. Build it clean.

---

## Priority stack (sequencing for ₹1Cr path)

| # | Idea | Step moved | Build | Voice | When |
|---|------|-----------|-------|-------|------|
| 0 | Funnel instrumentation | (all — measurement) | S | green | **First, blocking** |
| 1 | Audit echo through the seam | complete→action | S | green | Pre-launch (fixes P0-3) |
| 4 | Photo-failure recovery | start→complete | S/M | green | Pre-launch (fixes P0-2) |
| 8 | One-click cancel | unlocks paid acq | M | green | Before any ad spend |
| 2 | UPI Autopay default + transparency | paywall→sub | S | green | At `rzp_live` flip |
| 6 | Honest bundle pull (tag A/B) | ARPU | S | green | At public paywall |
| 7 | Abandoned-audit recovery | complete→sub | S/M | green | When channels live |
| 3 | Saveable/shareable result | recovery + viral | S | yellow | When channels live |
| 5 | Risk-reversal guarantee | paywall→sub (high tier) | M | yellow | After Day-30 re-audit built |

**The order is deliberate:** measure first (0), stop the two verified revenue leaks at the seam and the photo step (1, 4 — these are also audit P0s), make cancel dignified before we ever buy traffic (8), then optimise the live checkout (2, 6), then the recovery/viral compounders (7, 3) that pay off most at scale, and last the highest-upside-but-highest-risk guarantee (5) once its dependency (Day-30 re-audit) is real.

**A/B discipline (per hard rules):** one change per test; never call a winner with <100 conversions per variant unless the lift is huge and consistent; do not A/B the locked copy (landing hero, rank ladder, Day-7 report). The three tag variants in Idea 6 and the transparency line in Idea 2 are the cleanest single-variable tests to run first once Idea 0 is live and the paywall is public.

**Hard-rule compliance:** no fake scarcity, no hidden auto-renewal (Idea 2 discloses it, Idea 8 makes it cancellable), no roach-motel cancel (Idea 8 is one click). All variant copy stays in the anti-hype Consultant register; every user-facing line above is flagged for founder sign-off per §6 rule 7.
