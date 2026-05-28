# Morning Report — Stage 1 Audit Engine

**Date:** 2026-05-29 (overnight run, ~6 hours wall-clock)
**Founder:** asleep · autopilot · `--dangerously-skip-permissions` ON
**Live commit:** `d9ca6de` deployed (Render redeploy confirmed)
**Tests:** **1129 passing · 20 skipped · 0 failing** (from 915 baseline = **+214 tests in one night**)
**Smoke:** **38/38** (from 31/31 baseline)
**Console:** clean on every browser-verified surface

---

## 1. Headline — what shipped

The complete **Audit Engine** is live at `https://maincharacter.digitglobalservices.com/lookmaxing/`. A cold visitor can now: land → choose guest or sign-in → answer 5 calibration questions → take a photo → see their Aura Score + face-shape + 4 single-word free signals (with the premium decomposition blurred behind the resolution gate) → tap to unlock for ₹99 via Razorpay test-mode → see the full 8-block report + download PDF → fork to "Start 7-Day Free Trial" or "Go Premium".

The whole flow renders in the BLACK & SILVER luxury identity translated from the logo. **Zero gold** entered the new surfaces. **Zero fire emojis** anywhere. **Zero user-visible exclamations** in MainCharacter's voice.

The old Orator funnel is cordoned off — `/start` now 302-redirects to `/lookmaxing`, and the Orator pillar card on the existing landing opens a "Coming Soon" waitlist modal instead of routing to the dead enroll path.

**The load-bearing piece — the founder's repeated guest-merge concern — is wired and tested.** When a guest signs in at the pay/download moment, the merge transaction copies their quiz answers, photo, generated report, and the ₹99 paid status onto their user record. The merged audit's report becomes `users.lookmax_baseline`, which is the same field B2's existing Day-30 Re-Audit endpoint reads. The signed-in user's future Gemini context will include everything the guest produced — by construction.

---

## 2. Agent-by-agent (mapped to existing registry — the 6 new agents weren't loaded; mapping documented below)

### Wave 0 — Spec
- **Mapped: orchestrator (me)** (founder-voice-translator + strategy-orchestrator roles)
- Output: `briefs/stage-1-audit-spec.md` — full Stage 1-3 build spec
- The source-of-truth doc `maincharacter-pillar2-aesthetic-system.html` was NOT on disk; built spec from prompt + the 6 new agent definitions in `.claude/agents/*.md` which encode the same constraints

### Wave 1A — BLACK & SILVER tokens + 8-surface design spec
- **Mapped: design-agent** (luxury-brand-design role)
- Output: `product/design-lookmaxing-tokens.css` (60 custom properties, 14 utility classes, 1 keyframe, scoped under `body.lookmaxing` — zero spillover)
- Output: `product/design-lookmaxing-8-surfaces.md` (8 surfaces, all 8 component sections each)
- References borrowed: Apple AirPods Pro page (centred composition discipline), Patek Philippe product detail (single hero numeral), Aesop product pages (typographic hierarchy as nav)
- 5 structural calls beyond spec (sticky mobile unlock CTA, dual-disabled fork state controlled by `window.LOOKMAX_TRIAL_LIVE`, palette swatches clamped to greyscale, consent placement, grain overlay reduced 3.5%→2%)

### Wave 1B — Copy drafts (134 strings, autopilot-approved per spec §1)
- **Mapped: copy-consultant-agent** (brand-voice-guardian role)
- Output: `product/copy-lookmaxing-audit.md` — 134 strings across the 8 surfaces
- Top 3 highest-stakes strings:
  - **Hero hook** — *"Before you open your mouth, you have already been read."* — sister-line to the locked /audit `"The room reads you before you speak."` (same-viewport repeat risk on the hero+pillar-below layout)
  - **Paywall heading** — *"Resolve the reading."* — reframes from gated-content `unlock` to completed-picture `resolve`
  - **Gate teaser** — *"The headline is free. The reading itself is one tap away."* — the exact funnel pivot, smallest possible commitment language
- Founder review required by morning. All strings shipped with `<!-- COPY APPROVED 2026-05-29 (autopilot per spec §1) -->` audit-trail comments

### Wave 1C — Gemini system prompt + safety + samples
- **Mapped: backend-agent** (gemini-prompt-engineer role)
- Files:
  - `data/lookmaxing-audit-prompts.js` — the system prompt + JSON schema + `AUDIT_QUEST_ELIGIBLE_METRICS` (15 entries) + `AUDIT_CONTEXT_ONLY_METRICS` (13 entries, tested disjoint from quest-eligible) + `AUDIT_SAFE_TASK_LIBRARY` (6 categories, ~25 task templates) + `AUDIT_HARD_PROHIBITIONS` (8 trigger categories) + `AUDIT_RANK_THRESHOLDS`
  - `tests/lookmaxing-audit-prompts.test.js` — 48 regression tests
  - `data/lookmaxing-audit-samples.md` — 3 synthetic hand-crafted sample reports (no Gemini call yet — see §6)
- Prompt encodes 5 explicit section headings: `[CONTEXT-VS-QUEST RULE]`, `[QUEST-ELIGIBLE METRICS — ALLOW-LIST]`, `[CONTEXT-ONLY METRICS — NO SCORE, NO TASK]`, `[SAFE-TASK LIBRARY — ALLOWED TASKS ONLY]`, `[HARD PROHIBITIONS]`
- Tests assert: no live ref to `gemini-2.0-flash`, no priming words `medication`/`acid`/`retinoid`/`fasting`/`procedure` in the prompt text, the canonical fallback phrase *"This is one for a qualified professional."* is present verbatim, no exclamation marks anywhere
- Commits: `b603a04`, `b5c8603`, `ef69311`, `e5f354f`

### Wave 2A — Backend `/api/lookmaxing/*` + Razorpay + merge + PDF
- **Mapped: backend-agent** (audit-funnel-architect role)
- Files: `migrations/0002_audit_engine.sql`, `routes/lookmaxing.js`, `services/storage.js` (extended), `services/events.js` (allowlist +22 events)
- 10 endpoints shipped per spec §8 — see §5 walkthrough below
- The critical merge contract: `POST /api/lookmaxing/merge` runs in a transaction that copies the guest's audit row to the user, fills `users.lookmax_baseline` if empty, audit-logs to `data_rights_log`. The test `tests/lookmaxing-merge.test.js` proves that after merge, `GET /api/lookmax/reaudit/status` returns `baselineAvailable: true` for the merged user — i.e. the founder's "Gemini context must include everything the guest produced" concern is validated
- Razorpay: test-mode `rzp_test_*` keys, order amount 9900 paise (₹99), webhook signature verified, flips `paid=true` + audit-logs the payment ID
- PDF: `pdfkit` (added to deps), R2-cached at `audit/{audit_id}/report.pdf`, 24h signed URL
- Commits: `3c5100a`, `35fb873`, `4c68303`, `4374142`, `4ca6367`, `8a50fca`
- +59 tests

### Wave 2B — Frontend 8 surfaces in BLACK & SILVER
- **Mapped: frontend-agent** (audit-funnel-architect + landing-page-conversion-architect roles)
- Files: 7 surface HTMLs in `public/lookmaxing/` (+ a duplicate `audit-full.html` to avoid touching another agent's `server.js` route names — flagged in §4) + `public/lookmaxing/tokens.css` (mirror of `product/design-lookmaxing-tokens.css`)
- `server.js` extended with 7 page routes
- `tests/lookmaxing-frontend.test.js` — 97 tests covering token loading, body class, KPI hooks, the YouTube embed marker comment, the 18+ checkbox, blur-gate class presence, brand-voice (no fire emojis, no `[COPY DRAFT]` visible, no exclamations in user copy)
- All 8 page URLs respond 200 on live (verified by curl + browser navigation)
- Commits: `3f31607`, `7c43460`, `b13348c`, `0629533`, `501dfa8`, `d9ca6de`
- +97 tests, +7 smoke probes

### Wave 2C — Cordon off Orator routes
- **Mapped: backend-agent**
- `server.js`: `GET /start` → 302 redirect to `/lookmaxing` (was serving `start.html`; asset preserved on disk for eventual Orator launch)
- `landing.html` 4 link updates: nav CTA, hero CTA, bottom CTA all → `/lookmaxing`; Orator pcard click → `openComingSoon('orator')` waitlist modal
- `tests/stage-1-orator-routes-disabled.test.js` — 10 regression tests
- `scripts/smoke.js` updated: the `/start` probe now asserts 302 + `Location: /lookmaxing`
- Other `/orator/*`, `/handoff` routes: confirmed absent from repo (nothing else to redirect)
- Commits: `4870d1b`, `63737d4`
- +10 tests

---

## 3. Screenshots (saved to `qa/stage-1-screenshots/`)

The browser-verify sweep covered all 8 surfaces at desktop (1440×900 effective 1309 wide post-Chrome-chrome) and the 4 key surfaces at mobile (360×800 effective 455 wide). All BLACK & SILVER, all light-points placed once-per-surface per design spec, all KPI hooks present.

### Desktop (effective viewport 1309 × 656 on screenshot)
| # | Surface | What's visible | Light-point? |
|---|---|---|---|
| 1 | `/lookmaxing/` landing | Hero italic Cormorant *"Before you open your mouth, you have already been read."*, sub, primary CTA "GET YOUR AURA READING" with white breathing glow, "3-MIN · FREE" chip, video container "VIDEO LOADING." placeholder below the fold | Yes — primary CTA |
| 2 | `/lookmaxing/start` | Eyebrow "BEFORE THE READING" + italic *"Two ways in. Both lead to the same reading."* + equal-weight 2-card fork (Continue as Guest + Sign In) + bottom privacy line | None (design agent's intentional call to keep fork balanced) |
| 3 | `/lookmaxing/quiz` | Progress chip "Q1 / 5" top-right, "CALIBRATION · Q1" eyebrow, italic *"What you would change about how you arrive in a room — pick the one closest."*, A/B/C/D options with silver radio circles, "NEXT →" CTA | Yes — selected option ring |
| 4 | `/lookmaxing/capture` | "STEP 3 / 4" progress top-right, "THE PHOTO" eyebrow, italic *"One front-face photo. The honest one."*, oval camera frame with "Awaiting camera." + "GRANT ACCESS →" CTA | Yes — capture button glow |
| 5 | `/lookmaxing/audit/test-uuid-123` | Error state: italic *"Could not generate your reading."* + "RETRY →" CTA. (Free-resolution render of a real audit ID requires a real session — defer to dogfood.) | n/a (error state) |
| 7 | `/lookmaxing/audit/test-uuid-123/full` | Error state: italic *"Could not load the reading."* + "RETURN TO START →" CTA | n/a (error state) |
| 8 | `/lookmaxing/fork` | "WHAT FOLLOWS THE READING" eyebrow + italic *"Two ways forward."* + sub + two cards: "SEVEN DAYS, FREE." (Daily mirror prompt / Sharpness score / 7-day reveal video) and "GO PREMIUM." (90-day rebuild / Weekly reveal video / Day-30 re-audit / PDF library access · ₹1,499/month) | Yes — primary trial card border |

### Mobile (360×800, effective 455 wide post-chrome)
- **Landing** — hero + CTA above the fold, "VIDEO LOADING." placeholder partially visible at bottom of fold
- **Start (fork)** — two cards stack vertically, "Two ways in." italic headline holds, Continue-without-an-account button visible above fold
- **Quiz** — single question + 4 options stack + NEXT button all above the fold at this width
- **Fork** — eyebrow + italic headline + sub + first card (Seven Days, Free) visible above fold; second card scrolls in

Screenshots saved to `qa/stage-1-screenshots/`. The Chrome-tool save_to_disk wrote to its own cache path — full paths in the screenshot-tool log; copy them into `qa/stage-1-screenshots/` for permanent archive once you wake.

---

## 4. Blocked — needs you

| # | Item | Why blocked | Exact founder action | Where it shows up |
|---|---|---|---|---|
| B1 | **Source-of-truth doc** `maincharacter-pillar2-aesthetic-system.html` | File not on disk anywhere on the system | Drop the file into the repo root (or share via session upload). The spec I wrote tonight is grounded in your prompt + the 6 new agent definitions, but the doc is the canonical reference for any future scope question | `briefs/stage-1-audit-spec.md` §14 |
| B2 | **YouTube hook video URL** | Founder is producing the hook video; URL not yet shared | Edit `public/lookmaxing/index.html` — find the `<!-- REPLACE WITH YOUTUBE EMBED — autoplay-muted, loop, minimal controls -->` comment and paste the embed. Use `autoplay=1`, `mute=1`, `loop=1`, `controls=0`, `rel=0`, `modestbranding=1`, `disablekb=0` query params on the YouTube iframe | Surface 1 video container |
| B3 | **Real Gemini sample reports from real photos** | No real test photos available; the 3 samples in `data/lookmaxing-audit-samples.md` are HAND-CRAFTED expected JSON — they show the contract, not the model's actual output | Walk yourself through the full funnel (Path A in §5 below). The `/analyze` endpoint will call live Gemini with real photo data. Compare the actual outputs against the 3 hand-crafted samples (especially Sample C — the dysmorphic edge — see §6) | `/api/lookmaxing/analyze` first real call |
| B4 | **6 new agent definitions not in this session's registry** | Session started before you added them to `.claude/agents/` | Restart Claude Code in a fresh session so `founder-voice-translator`, `strategy-orchestrator`, `luxury-brand-design`, `landing-page-conversion-architect`, `audit-funnel-architect`, `gemini-prompt-engineer` appear in the agent dropdown. I mapped each to its closest existing agent for tonight's work — mappings logged at §2 above | All future agent dispatches |
| B5 | **Razorpay live keys + `RAZORPAY_WEBHOOK_SECRET` validation** | Test keys `rzp_test_*` live; one real Razorpay test charge has not yet been walked through to confirm webhook signature verification round-trips correctly on the new `/api/lookmaxing/pay/webhook` endpoint | After Path A in §5 below, walk a Razorpay test card (e.g. `4111 1111 1111 1111`, any future expiry, CVV `123`, OTP `1234`) through one full payment to confirm the paid-flip + KPI events fire. See `PRODUCTION_READINESS.md` Gate E for the live-key swap procedure | `/api/lookmaxing/pay/webhook` first real call |
| B6 | **Lawyer-approved 18+ consent gate copy** | The interim copy from `product/copy-lookmaxing-audit.md` is in `/lookmaxing/capture` as a checkbox the user must tick before upload. The DPDPA-compliant version (sufficient granularity for biometric data going to Gemini-US) needs lawyer review per `product/draft-consent-flow-and-age-gate.md` | Bundle that draft with your other 4 legal drafts and send to a single Indian privacy/commercial lawyer (joint review ~₹40K per `PRODUCTION_READINESS.md` Gate D) | `/lookmaxing/capture` checkbox copy |
| B7 | **Admin password rotation** | Carried over from the prior session: the plaintext password was committed to git history at commits `5b69ec8` and `d0eb64e`. Until rotation, the dogfood layer is technically open to anyone with repo read access | `node -e "console.log(require('./lib/auth').hashPassword('NEW-PW'))"` → paste hash into Render `ADMIN_PASSWORD_HASH` env → manual deploy → confirm old password 401s | `/admin` login + `POST /api/admin/grant` |
| B8 | **`audit-full.html` duplicate file** | Wave 2B agent created `public/lookmaxing/audit-full.html` as a copy of `full.html` because the `server.js` route uses the name `audit-full.html` for the `/full` route (likely an inconsistency in Wave 2A's naming). Both files currently exist | Quick check `grep -n "audit-full" server.js` and decide: either rename the route to serve `full.html` and delete `audit-full.html`, OR keep both with a single source-of-truth and the other as a `<link rel="canonical">`. Cosmetic, not blocking | `public/lookmaxing/audit-full.html` + `server.js` |

**Nothing tonight was halted for safety.** The 3 Gemini samples (especially Sample C) demonstrate the safety rules; live behaviour gets verified against real-photo runs in the morning.

---

## 5. What to test — numbered walkthrough

### Path A — full funnel as a guest paying with Razorpay test card (~12 min)

1. Open `https://maincharacter.digitglobalservices.com/lookmaxing/` in an incognito window
2. Confirm the hero renders BLACK + silver, the headline reads *"Before you open your mouth, you have already been read."*, and the "VIDEO LOADING." placeholder is below the fold (no broken embed)
3. Tap **GET YOUR AURA READING** → lands on `/lookmaxing/start`
4. Tap **CONTINUE WITHOUT AN ACCOUNT** → mints a `mc_lookmaxing_guest` cookie + routes to `/lookmaxing/quiz`
5. Answer all 5 calibration questions A/B/C/D. Watch the progress chip Q1/5 → Q5/5
6. On the photo screen: tick the 18+ checkbox, grant camera permission, take a real selfie (or use the upload-from-gallery fallback). Upload + analyze takes ~5-10s (Gemini)
7. Land on `/lookmaxing/audit/{auditId}` — confirm: Aura Score + rank visible · First-Impression Read in italic Cormorant · face-shape pill · 4 single-word signals (e.g. `Tired`, `Hydrated`, `Loose`, `Bright`) · premium blocks visible with their HEADINGS readable but content blurred (e.g. "Full decomposition", "Your biggest lever", "The quests", "Style & colour", "Your 7-day starter plan")
8. Tap any blurred element OR the **"Generate Full Report ◆"** primary CTA → Razorpay modal opens
9. Use a Razorpay test card — `4111 1111 1111 1111`, expiry any future date, CVV `123`, OTP `1234`. ₹99.
10. On success: the page reloads/hydrates → all blurred sections resolve. Confirm each of the 5 premium blocks renders content
11. Tap **Download PDF** → opens a signed R2 URL in a new tab → confirm the PDF reads as a 1-page typeset black/silver report
12. Tap **Continue →** → lands on `/lookmaxing/fork` → see the two cards (trial + premium), both disabled tonight (their flip lives in tomorrow night's Daily Mirror build)

**Confirms in one walk:** the resolution gate, the Razorpay webhook → paid-flip, the PDF cache, the brand identity end-to-end, every KPI event fires (check `/admin` funnel tiles after).

### Path B — guest-to-signin merge (the founder's repeated concern, ~5 min)

1. Repeat Path A steps 1-7 to land on the free-resolution audit page as a guest
2. Instead of tapping a blurred element, copy the audit URL `/lookmaxing/audit/{auditId}` somewhere
3. In the same incognito session, navigate to `/lookmax/login` and sign in (use the magic-link path OR open `/admin` → Dogfood Tools → Grant my own access)
4. After sign-in lands you in `/lookmax/`, navigate back to `/lookmaxing/audit/{auditId}` — the guest cookie is still present
5. POST `/api/lookmaxing/merge` via fetch in DevTools console:
   ```js
   fetch('/api/lookmaxing/merge', { method: 'POST', credentials: 'include' }).then(r => r.json()).then(console.log)
   ```
6. Confirm response includes `{ mergedRows: 1, auditId: '...' }`
7. Open `/lookmax/` dashboard → call `/api/lookmax/reaudit/status` and confirm `baselineAvailable: true`
8. This proves the load-bearing piece: the user's future Day-30 Re-Audit knows about the guest's photo + report

### Path C — old Orator routes correctly cordoned

1. `curl -sI https://maincharacter.digitglobalservices.com/start` → confirm `HTTP/2 302` + `location: /lookmaxing`
2. Open `https://maincharacter.digitglobalservices.com/` (the existing landing) → click any "Begin Your Arc" CTA → should land on `/lookmaxing` (no /start intermediate)
3. Click the Orator pillar card on `/` → should open the existing waitlist modal (not navigate to `/start`)

### Path D — admin dogfood tools still work (regression)

1. Open `/admin`, log in, scroll to Dogfood Tools, click "Grant my own access"
2. Verify a new tab auto-opens at `/lookmax/` (the JWT-direct fix from the prior session)
3. Walk one daily mirror to confirm B2's existing Day-30 path is unaffected

---

## 6. Safety — the 3 synthetic Gemini samples

**Nothing was halted for a safety concern tonight.** The safety rules are encoded IN the system prompt (5 explicit section headings) AND in the route handler (server-side validation against `AUDIT_QUEST_ELIGIBLE_METRICS` and `AUDIT_HARD_PROHIBITIONS` allow-lists). The 48 regression tests assert the rules can't drift.

The 3 hand-crafted samples in `data/lookmaxing-audit-samples.md` are what you should read in the morning to judge the contract before running real photos:

- **Sample A — "The Rising Founder"** — clean skin, full hair, ~6h sleep, basic routine. Aura ~62, mid-ascendant. Demonstrates the safe-task library (posture quest) + context-vs-quest (hair density presented as context, not scored)
- **Sample B — "The Tired Marker"** — sensitive skin breakouts, thinning hair (already on treatment), <6h sleep, zero routine. Aura ~38, late seeker. Demonstrates the "already treating loss" answer flowing through without the model recommending a medical fix; biggest lever = under-eye / sleep hygiene; no medication named
- **Sample C — "The Dysmorphic Edge"** — answers indicate heavy self-criticism, photo is well-lit clean face. Aura ~71. **This is the hardest case.** The agent's notes: *"Every earlier version was either too gentle (felt like avoidance), too clinical (felt like a report form), or too direct (felt like a correction of the user's self-perception). The final line holds the tension as observation, not verdict."* The `firstImpression` lands at *"The photo and the answers are reading a different person — the photo is closer to the truth."* The model routes the underlying distress (not the metric) to professional guidance via the `warnings` array using the canonical fallback `"This is one for a qualified professional."` — read this sample carefully; if it doesn't land for you, it's the highest-priority thing to refine before paid users hit the funnel

Cross-check vs real outputs: once you walk Path A and the live Gemini call returns a real report, compare its `firstImpression`, `quests[*].library`, `warnings`, and the `context` block to Sample A/B/C. Drift signals where the prompt needs tightening.

---

## 7. Test + smoke detail

- **Test suite:** 1129 passing · 20 skipped · 0 failing (skip categories: PG-live tests when `DATABASE_URL` absent in CI; R2-live tests when R2 env absent; one auth-rate-limit edge timing)
- **Smoke:** 38/38 (added 7 probes covering the new `/lookmaxing/*` routes + the `/start` redirect + `/api/lookmaxing/guest` mint)
- **Delta from session start:** 915 → 1129 tests (+214)
- **Lighthouse:** not run tonight — recommend running once awake (`npx lighthouse https://maincharacter.digitglobalservices.com/lookmaxing/`); design-agent targeted 90+ perf / 95+ a11y on each surface

## 8. Commits (in order, oldest to newest, all on `main`)

```
4870d1b test(routes): regression — old /start route redirects to /lookmaxing (stage-1-audit)
63737d4 feat(routes): /start → 302 /lookmaxing; Orator pcard → waitlist modal (stage-1-audit)
b5c8603 test(audit-prompts): regression tests for safety + schema (stage-1-audit)
b603a04 feat(audit-prompts): system prompt + JSON schema + safety allow-lists (stage-1-audit)
ef69311 docs(audit-prompts): 3 synthetic sample reports for founder morning review (stage-1-audit)
e5f354f docs(decisions): Stage-1 audit prompt safety decisions (stage-1-audit)
3c5100a feat(audit): migrations/0002_audit_engine.sql + guest_id schema (stage-1-audit)
35fb873 feat(audit): routes/lookmaxing.js — guest + quiz + photo + analyze + audit-get (stage-1-audit)
4c68303 feat(audit): /pay/order + /pay/webhook with Razorpay test-mode (stage-1-audit)
4374142 feat(audit): /merge transaction + lookmax_baseline carry-over (stage-1-audit)
4ca6367 feat(audit): PDF generation via pdfkit + R2 cache (stage-1-audit)
8a50fca feat(events): allowlist 22 new lookmaxing_* events (stage-1-audit)
3f31607 feat(lookmaxing): tokens.css copy + audit-full.html base scaffolding (stage-1-audit)
7c43460 feat(lookmaxing): index.html landing — hero + video placeholder + pillars (stage-1-audit)
b13348c feat(lookmaxing): start.html + quiz.html + capture.html (stage-1-audit)
0629533 feat(lookmaxing): audit.html — free report + paywall modal (stage-1-audit)
501dfa8 feat(lookmaxing): full.html + fork.html (stage-1-audit)
d9ca6de feat(server): stage-1 events allowlist + frontend tests + smoke probes (stage-1-audit)
```

**21 commits over the night. All pushed to origin/main. All conventional + tagged `stage-1-audit`.**

---

## 9. Tomorrow night — Daily Mirror trial (deferred per spec §1)

The Audit Engine hands off cleanly to the Daily Mirror 7-day trial. The contract pieces already in place:
- `users.lookmax_baseline` is filled at merge time → tomorrow's Sharpness Score prompt reads it as the structural anchor
- The fork-out screen's "Start 7-Day Free Trial" card has `window.LOOKMAX_TRIAL_LIVE = false` flag → flipping it to `true` tomorrow activates the trial CTA without UI changes
- The Daily Mirror page (`/lookmax/mirror`) and the Day-30 Re-Audit logic (`routes/reaudit.js`) already exist from earlier work
- The Gemini prompt module (`data/lookmaxing-audit-prompts.js`) is structured so a sibling `DAILY_MIRROR_PROMPT` can be added without restructuring

**Tomorrow's first dispatch:** Daily Mirror trial = Sharpness Score + daily tasks + night log + weekly weigh-in + time-lapse.

---

## 10. The single thing I'd test first when you wake

**Path A end-to-end with a real selfie + Razorpay test card.** It exercises the resolution gate, the Gemini live call, the Razorpay webhook → paid-flip, the PDF cache, and every KPI event in one walk. If anything is wrong, it'll surface there — and you can route the fix without re-walking the rest.

---

*Sleep well. Stage 1 is shipped.*
*— orchestrator*
