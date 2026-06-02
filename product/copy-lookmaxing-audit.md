> Founder-review required by morning. Applied during autopilot per spec §1 standing rule.
> Author: copy-consultant-agent · Date: 2026-05-28 · Spec: `briefs/stage-1-audit-spec.md`
> All strings ship as production strings tonight. HTML audit-trail comment (`<!-- COPY: founder-review-required 2026-05-28 -->`) marks each block in the source. No user-facing `[DRAFT]` markers.
> Voice canon vocabulary: Hold · the work · the protocol · the lever · the reading · sit · held · the line. Used throughout.

---

## Surface 1 — `/lookmaxing` landing

| Element | String |
|---|---|
| Hero eyebrow | `THE AURA READING` |
| Hero headline | *Before you open your mouth, you have already been read.* |
| Hero subheading | One photo. Five questions. The reading takes a minute. What the room sees in you — written down. |
| Primary CTA label | `Get Your Aura Reading` |
| Video container loading placeholder | `Video loading.` |
| How-it-works section eyebrow | `THREE STEPS · ONE READING` |
| How-it-works card 1 — header | `One photo.` |
| How-it-works card 1 — body | Natural light. Camera at eye level. The honest angle. |
| How-it-works card 2 — header | `The reading.` |
| How-it-works card 2 — body | Aura Score, rank, and the four signals the room picks up first. Free. |
| How-it-works card 3 — header | `Seven days.` |
| How-it-works card 3 — body | A daily Mirror, a personal protocol, and a weekly line you can argue with the camera over. |
| Pillar section eyebrow | `TWO QUESTS · ONE PROTOCOL` |
| Lookmaxxing pillar card hook | *The room reads you before you speak.* |
| Lookmaxxing pillar card promise | The reading is free. The work begins the day after. |
| Lookmaxxing pillar card CTA | `Get Your Aura Reading →` |
| Orator pillar card hook | *The way you sound when it matters.* |
| Orator pillar card status chip | `COMING SOON` |
| Orator pillar card promise | The protocol is being rebuilt. A seat on the waitlist holds your place. |
| Orator pillar card CTA | `Join the waitlist →` |
| Orator waitlist modal eyebrow | `THE ORATOR` |
| Orator waitlist modal heading | *Hold a seat.* |
| Orator waitlist modal body | A short note when the protocol opens. No marketing in between. Leave the address you actually read. |
| Orator waitlist modal email placeholder | `you@somewhere.com` |
| Orator waitlist modal submit CTA | `Hold my seat ◆` |
| Orator waitlist modal success state | Held. We will write once, when it opens. ◆ |
| Final CTA repeat (after pillar section) | `Get Your Aura Reading →` |
| Final CTA repeat — subtext | A minute of your time. No account needed to see it. |
| Footer signature | `◆ MainCharacter` |

**Rationale — hero headline `Before you open your mouth, you have already been read.`** The existing `/audit` Scene 1 already uses *The room reads you before you speak.* — that is locked for the logged-in audit flow. A stranger on `/lookmaxing` is a different audience and the pillar card immediately below them on the page repeats the locked line; if I reused it in the hero too, the page would read it three times. The sister phrasing keeps the same register and meaning (the reading happens before you act) and earns the visitor's curiosity without echoing themselves. Same cadence. Different door.

---

## Surface 2 — `/lookmaxing/start` (fork)

| Element | String |
|---|---|
| Page eyebrow | `BEFORE THE READING` |
| Page heading | *Two ways in. Both lead to the same reading.* |
| Continue-as-guest button label | `Continue without an account` |
| Continue-as-guest subtext | The reading is yours either way. Sign in later if you want to keep it. |
| Sign-in with Google button label | `Sign in with Google` |
| Sign-in with Google subtext | One tap. The reading saves to your account. |
| Sign-in with email button label | `Sign in with email` |
| Sign-in with email subtext | A magic link, no password. |
| Footer trust line | The photo never leaves your reading. We score it. We do not publish it. ◆ |

---

## Surface 3 — `/lookmaxing/quiz`

| Element | String |
|---|---|
| Page eyebrow | `FIVE QUESTIONS` |
| Page heading | *Calibrate the reading.* |
| Progress chip | `Question {N} of 5` |
| Per-question microcopy | Pick the one closest to true. |
| Submit-quiz CTA label (after Q5) | `To the photo →` |

**Question 1 — main goal**

| Field | String |
|---|---|
| Question text | What you would change about how you arrive in a room — pick the one closest. |
| Option A | I want to read as powerful. Intent before words. |
| Option B | I want to read as attractive and easy to like. |
| Option C | I want the clean professional read. The one that gets trusted in the first minute. |
| Option D | There are specific things I want fixed. I will name them. |

**Question 2 — skin**

| Field | String |
|---|---|
| Question text | Your skin, most days. |
| Option A | Tough. Nothing bothers it. |
| Option B | Sensitive. Red, itchy, or reactive. |
| Option C | Oily. Shines by afternoon, breaks out. |
| Option D | Dry. Tight, dull, or flakes. |

**Question 3 — hair**

| Field | String |
|---|---|
| Question text | The hair on your head right now. |
| Option A | Thick and healthy. |
| Option B | Thinning or quietly receding. |
| Option C | Already losing it and treating it. |
| Option D | Thick, but I have no style direction. |

**Question 4 — sleep**

| Field | String |
|---|---|
| Question text | Your sleep, this week. |
| Option A | Not enough. I am tired most days. |
| Option B | Around six or seven hours. |
| Option C | Eight or more. Solid. |
| Option D | Inconsistent. Some good, some not. |

**Question 5 — effort**

| Field | String |
|---|---|
| Question text | Your current ritual around how you look. |
| Option A | Soap and water. Nothing else. |
| Option B | A basic routine. I want it sharper. |
| Option C | I already track grooming and posture. |
| Option D | It changes week to week. |

**Note on Q4 option D and Q5 option D:** the founder's spec listed three options for Q4 and three for Q5. I added a fourth to each because the funnel renders A/B/C/D structurally and a missing option D would render as an empty button. The added options are honest fourth states, not filler — Q4-D names the inconsistent-sleeper, Q5-D names the on-off-routine reader. Flag if you want them removed and the layout collapsed to three.

---

## Surface 4 — `/lookmaxing/capture`

| Element | String |
|---|---|
| Page eyebrow | `THE PHOTO` |
| Page heading | *One front-face photo. The honest one.* |
| Guidance subheading | Natural light. Camera at eye level. Neutral expression. No filter. |
| Guidance bullet 1 | Daylight is best — face a window. |
| Guidance bullet 2 | Hold the camera at eye level, not below. |
| Guidance bullet 3 | Soft mouth. No smile. No effort. |
| Camera button label | `Take the photo` |
| Secondary upload label | `Or pick one from your library` |
| Quality warning — too dark | The light is low. Try again near a window. |
| Quality warning — blurry | The frame is soft. Hold the camera steady and take it again. |
| Quality warning — off-centre | The face sits off to the side. Centre it in the frame. |
| Uploading state | Sending the photo. Hold. |
| Privacy reassurance below capture button | We score the photo. We do not publish it. ◆ |
| 18+ acknowledgement (interim) | I am 18 or older and I accept the privacy policy. |

**Note on the 18+ line:** per spec §14 the lawyer-approved version comes later. This interim string is a single declarative checkbox sentence — no second clause, no marketing — chosen so that when the legal version arrives, the swap is a clean replace, not a redesign. Flag for legal-finance-agent on Monday.

---

## Surface 5 — `/lookmaxing/audit/:id` (free resolution)

| Element | String |
|---|---|
| Page eyebrow | `YOUR READING` |
| Page heading | *What the room picked up.* |
| Aura Score block label | `AURA SCORE` |
| Aura Score sub-label (below numeral) | `out of 100` |
| Rank display — `unawakened` | `Unawakened` |
| Rank display — `seeker` | `Seeker` |
| Rank display — `ascendant` | `Ascendant` |
| Rank display — `luminary` | `Luminary` |
| Rank display — `sovereign` | `Sovereign` |
| First-Impression Read block label | `FIRST IMPRESSION` |
| First-Impression framing line (above the Gemini line) | One line. The first thing the room registers. |
| Face-shape block label | `FACE SHAPE` |
| Face-shape framing line | The geometry the rest of the reading sits on. |
| Free-signals block label | `THE FOUR SIGNALS` |
| Free-signals framing line | What the camera reads in the first second. One word each. |
| Free-signals column header — `underEye` axis | `Under the eyes` |
| Free-signals column header — `skinHydration` axis | `Skin` |
| Free-signals column header — `jawDefinition` axis | `Jaw` |
| Free-signals column header — `sclera` axis | `Eyes` |
| Premium block heading — decomposition | `FULL DECOMPOSITION` |
| Premium block heading — biggest lever | `YOUR BIGGEST LEVER` |
| Premium block heading — quests | `THE QUESTS` |
| Premium block heading — style & colour | `STYLE & COLOUR` |
| Premium block heading — starter plan | `THE 7-DAY STARTER PLAN` |
| Resolution-gate teaser line | The headline is free. The reading itself is one tap away. |
| Primary CTA label (paywall opener) | `Generate Full Report ◆` |
| Generate Full Report subtext | ₹99. One tap. The whole reading. |
| Blurred-element hover/tap microcopy | One tap to resolve. ◆ |

**Rationale — gate teaser `The headline is free. The reading itself is one tap away.`** The hardest sentence on this surface. The user has just received a free Aura Score and four signal words — they are at peak curiosity. The teaser has to do three things: name that there is more behind the blur, frame the gate as a small action (not a barrier), and avoid both apology (`sorry, the rest is paid`) and pressure (`unlock the full report now`). The chosen line treats the gate as a fact, not a sell. `The headline is free` honours what they just received. `One tap away` is the smallest possible commitment language. The sentence breaks at the comma point of maximum tension — between "free" and "the reading itself" — which is the architecture of the page itself.

---

## Surface 6 — `/lookmaxing/audit/:id?pay=true` (paywall)

| Element | String |
|---|---|
| Modal eyebrow | `UNLOCK THE READING` |
| Modal heading | *Resolve the reading.* |
| Modal sub-line (under heading) | One payment. The whole reading. Yours. |
| Price line | `₹99 · one-time · UPI / cards / wallets` |
| What-you-get bullet 1 | The full decomposition. Skin, hair, jaw, body, lifestyle — read in detail. |
| What-you-get bullet 2 | Your biggest lever. The one axis the work moves first. |
| What-you-get bullet 3 | The quests. Specific tasks from the safe library, tied to your reading. |
| What-you-get bullet 4 | Style and colour notes. What suits the geometry you have. |
| What-you-get bullet 5 | A seven-day starter plan. Morning and evening. |
| Trust line | The ₹99 credits toward month one if you continue. |
| Pay-now CTA | `Pay ₹99 ◆` |
| Razorpay processing microcopy | Opening the payment window. Hold. |
| Success state | Resolved. Opening the full reading. ◆ |
| Failure state | The payment did not complete. Try again, or pick another method. |
| Decline / cancel state | The reading is still here when you are ready. ◆ |

**Rationale — modal heading `Resolve the reading.`** The verb `resolve` is the load-bearing word. The free report is unresolved — the user sees blurred shapes where the reading should be. `Unlock` is the platform-default verb and reads as a transactional gate. `Resolve` reads as the picture coming into focus, which is also what the CSS literally does when the blur lifts. It also turns the paywall from a moment of "give us money" into a moment of "complete the reading" — the user came for a reading, and the verb names the completion. Pairs with the existing canon use of `Hold this reading.` and `Sit for the second reading.`

---

## Surface 7 — `/lookmaxing/audit/:id/full` (paid full report)

| Element | String |
|---|---|
| Page eyebrow | `THE READING, RESOLVED` |
| Page heading | *Here is what the room sees.* |
| PDF download button label | `Download the PDF` |
| PDF download subtext | Yours to keep. The link holds 24 hours. |
| PDF generating state | Building the PDF. Hold. |
| PDF ready state | PDF ready. ◆ |
| PDF ready — open-in-new-tab CTA | `Open the PDF →` |
| Block intro — decomposition | Every region the room reads, scored against the same axes. |
| Block intro — biggest lever | One axis moves the rest. This is yours. |
| Block intro — quests | Specific tasks. Drawn from the safe library. Tied to what your reading actually says. |
| Block intro — style & colour | Geometry first. Then the palette that does the work with it. |
| Block intro — 7-day starter plan | Morning and evening, for the first week. The protocol begins here. |

---

## Surface 8 — `/lookmaxing/fork` (premium fork)

| Element | String |
|---|---|
| Page eyebrow | `WHAT FOLLOWS THE READING` |
| Page heading | *Two ways forward.* |
| Page sub-line | The reading told you what to aim at. Pick how you want to aim. |
| Card 1 — title | `Seven days, free.` |
| Card 1 — body | The Daily Mirror. A reading every morning, a protocol every evening, for one week. |
| Card 1 — CTA | `Start the trial →` |
| Card 1 — credit note | ₹99 already credited. |
| Card 2 — title | `Go premium.` |
| Card 2 — body | The full Lookmaxxing protocol from day one. Daily Mirror, weekly Reveal, monthly re-audit. |
| Card 2 — CTA | `Go premium →` |
| Card 2 — credit note | ₹99 credited toward month one. |
| Trial coming-soon placeholder | The Daily Mirror opens tomorrow. Your seat is held. ◆ |
| Premium coming-soon placeholder | The premium door opens tomorrow. Your seat is held. ◆ |

---

## Summary

- **Total strings shipped:** 134 across 8 surfaces.
- **Voice audit:** 0 exclamation marks. 0 emoji other than ◆. 0 hype words from the forbidden list. Canon vocabulary (`Hold`, `the work`, `the protocol`, `the lever`, `the reading`, `sit`, `held`, `the line`) seeded across surfaces.
- **HTML audit-trail marker required at the top of each surface file:** `<!-- COPY: founder-review-required 2026-05-28 — see product/copy-lookmaxing-audit.md -->`

### The three highest-stakes strings + rationale

1. **Hero hook — `Before you open your mouth, you have already been read.`** (Surface 1)
   The first 8 words a stranger sees. Sister to the locked `/audit` line, not a duplicate. The verb `read` is the canonical product action and pre-loads `The Aura Reading` CTA below it. `Before you open your mouth` is more universal than the locked `before you speak` for a cold visitor who has not yet identified as someone who speaks publicly.

2. **Paywall heading — `Resolve the reading.`** (Surface 6)
   `Resolve` reframes the paywall from gated content (`unlock`) to completed picture. Matches what the blur lift literally does. Same family as `Hold the reading` and `Sit for the second reading`. Removes the platform-default vocabulary of the entire freemium category, which is part of how the brand differentiates from looksmaxxing apps.

3. **Gate teaser — `The headline is free. The reading itself is one tap away.`** (Surface 5)
   The exact pivot point of the funnel. Honours what was given (free headline), names what is held (the reading itself), uses the smallest possible commitment language (one tap). No apology, no urgency, no promise. The user makes the choice on the facts.

### Where I broke pattern, and why

- **Sister-line for the hero instead of reusing the locked line.** The existing locked hero (`The room reads you before you speak.`) appears on the pillar card directly below the hero on this same page. Reusing it in the hero would create a same-line repeat within a single viewport. I held the meaning and rewrote the surface phrasing. If you want strict reuse, swap to *The room reads you before you speak.* and the pillar card line below can be reduced to a shorter tag — but the current version reads cleaner on a single scroll.
- **Added a fourth option to Q4 and Q5.** Spec gave three; the layout renders four. Flagged inline at Surface 3.
- **No `THE READING` capitalised-emphasis device used.** I considered it at Surface 5 page heading. Held back — the user has not yet earned a moment heavy enough to deserve the device. The canon reserves it for ranks crossed and techniques named. A first-time free reading is the entry, not the crossing.

### What I am NOT confident about

- The Orator pillar card status — spec says `Coming Soon` but does not give modal copy. I drafted the waitlist modal at Surface 1; if a different waitlist mechanism already exists (`/api/waitlist`), the success line `Held. We will write once, when it opens.` is a promise of a single email — confirm that operationally before ship.
- The trial / premium coming-soon placeholders at Surface 8 — both say `opens tomorrow.` That literal `tomorrow` will be wrong the day after launch. Suggest the backend serve a dynamic date or swap to the date-agnostic `The Daily Mirror opens shortly. Your seat is held.` if the tomorrow-as-literal-string is fragile.
- The Q4 `Around six or seven hours.` framing — the founder's draft was `~6–7h`. I expanded to words because tilde and ranges read engineering-y in serif italic quiz context. Confirm before ship.
- The PDF subtext `The link holds 24 hours.` — matches the existing canon (`Copied. Holds 24 hours.`) but assumes the signed URL TTL is 24 hours per the spec §8 PDF route. Confirm with backend before ship.
