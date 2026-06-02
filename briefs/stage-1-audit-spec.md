# Stage 1–3 — Lookmaxxing Audit Engine — Build Spec

> Author: orchestrator (founder-voice-translator role) · Date: 2026-05-29
> Source-of-truth doc `maincharacter-pillar2-aesthetic-system.html` was NOT found on disk (searched repo + `/Users/chitranshu`). Spec built from the founder's overnight prompt + the 6 new agent definitions in `.claude/agents/*.md` which all reference the same constraints.
> Hand-off: strategy-orchestrator (me) sequences and dispatches the build waves.

---

## 1. Scope — TONIGHT only

- **STAGE 1 — Landing** at `/lookmaxing` (cold visitor → "Get Your Aura Reading" CTA)
- **STAGE 2 — Fork + 5-question calibration quiz** (guest vs sign-in; equal weight; sign-in not required yet)
- **STAGE 3 — Capture → Free Audit → ₹99 paywall → Merge → Premium Fork**

**Out of scope tonight (design contracts only, no build):**
- The Daily Mirror 7-day trial — Sharpness Score, daily tasks, night log, weekly weigh-in, time-lapse. (Built tomorrow night.)

**Untouched (do NOT modify):**
- Existing Postgres + R2 durability layer
- Existing `/lookmax/*` daily-use surfaces (post-paid) — they stay gold-tokened for now
- Existing KPI infra, scheduler, push, MP4
- Existing tests (must stay green)

**Disabled (route removal + redirect):**
- `/start`, `/orator/*`, `/handoff` → 404 OR 302 to `/lookmaxing` (pick 302; cleaner UX)

**Orator pillar:** stays VISIBLE on `/lookmaxing` landing but gated with "Coming Soon" + waitlist modal. Hook line: *"The way you sound when it matters."*

---

## 2. Brand identity (LOCKED — luxury-brand-design role)

- Background: `--mc-black: #000000`, `--mc-near-black: #0a0a0a`
- Silver gradient: `#e8e8e8 → #c0c0c0 → #8a8a8a` (use for borders, accents, monogram, score numerals)
- White highlight: `#ffffff` (sparingly; on primary CTA + key focus moments only)
- **Light-point glow:** soft white radial (max 24px blur, low opacity) — echoes the logo's single dot. Used as primary CTA glow + section reveals + active state of key controls. **One per screen, max.**
- **NO gold. NO warm tones.** All Aesthetic-System-doc gold mockups translate to silver.

**Typography:**
- Display/headlines: **Cormorant Garamond** (italic for emotional weight, regular for authority) — already loaded in existing pages, reuse
- Body: **Sora** (already loaded)
- Data/scores/labels: **JetBrains Mono** (new — Google Fonts)

**Wide letter-spacing on small-caps labels** for the premium feel.

**Restraint test (every element):** if it's decorative and not load-bearing for clarity or feeling, cut it.

**This applies to ALL new `/lookmaxing` surfaces ONLY.** Existing `/lookmax/*` pages stay on their current gold tokens. Full-product migration is a separate follow-up decision (logged in MORNING_REPORT.md).

---

## 3. The 8 surfaces (frontend-agent ships, design-agent specs)

| # | URL | What | States needed |
|---|---|---|---|
| 1 | `/lookmaxing` | Landing (hero + video + how-it-works + pillars + footer) | default; video-loading placeholder; video-loaded; waitlist modal open/closed/submitted |
| 2 | `/lookmaxing/start` | Fork: [Continue as guest] · [Sign in with Google/email] | default; google-redirecting; email-magic-link-sent |
| 3 | `/lookmaxing/quiz` | 5 questions, one at a time, with progress bar | per-question default; selected; submitting next; error |
| 4 | `/lookmaxing/capture` | Photo upload/take with guidance overlay | camera-permission-pending; capture-live; reviewing; quality-warning; uploading; uploaded |
| 5 | `/lookmaxing/audit/:auditId` | Free-resolution report (Aura Score, headline, face-shape, 4 single-word signals, blurred premium blocks) | loading (Gemini ~5-8s); ready; error-retry |
| 6 | `/lookmaxing/audit/:auditId?pay=true` | ₹99 unlock paywall (UPI-first, Razorpay test-mode) | default; razorpay-modal-open; processing; success-redirect |
| 7 | `/lookmaxing/audit/:auditId/full` | Full report (all premium blocks resolved) + PDF download button | resolved; pdf-generating; pdf-ready |
| 8 | `/lookmaxing/fork` | "Start 7-Day Free Trial" OR "Go Premium" | default; trial-coming-soon placeholder; premium-coming-soon placeholder |

**Auth prompt timing:** ONLY at step 6 (when guest taps "Unlock") OR step 7 (when guest taps "Download PDF"). Never before.

---

## 4. The 5 calibration questions (audit-funnel-architect role)

Founder's draft (per overnight prompt) — copy-consultant-agent rewrites into Consultant voice. Keep meaning + A/B/C/D structure.

- **Q1 — main goal:** powerful/intense · attractive&likable · clean professional "CEO" · fix messy features
- **Q2 — skin:** tough (nothing bothers it) · sensitive (red, itchy) · oily (shiny, breakouts) · dry (tight, dull)
- **Q3 — hair:** thick & healthy · thinning/receding · already treating loss · thick but no style clue
- **Q4 — sleep:** not enough (always tired) · ~6–7h · 8+h great
- **Q5 — effort:** zero (soap & water) · basic routine, want more · already track grooming & posture

**Stored as:** array of `{ questionId, choice, label }` on the audit session. Passed verbatim to Gemini as structured context tags.

---

## 5. The free/premium resolution gate (audit-funnel-architect locks this)

| Block | Free / Premium | Renders as |
|---|---|---|
| 1. Aura Score (0–100) + rank | FREE | Large silver numeral + rank label |
| 2. First-Impression Read | FREE | One Cormorant italic line |
| 3. Face-shape label + 4 single-word signals | FREE | Pill + 4 labels (e.g. `Tired`, `Hydrated`, `Loose`, `Bright`) |
| 4. Full decomposition (30+ metrics, 8 regions) | PREMIUM | Visible structure but BLURRED text (CSS `filter: blur(6px)`) |
| 5. Your biggest lever | PREMIUM | Blurred line w/ a partial reveal of the metric name |
| 6. The quests | PREMIUM | Blurred bulleted list (length visible, content blurred) |
| 7. Style & colour notes | PREMIUM | Blurred 2-paragraph block |
| 8. 7-day starter plan | PREMIUM | Blurred 7-row table |

**Gate trigger:** any tap on a blurred element OR on a "Generate Full Report ◆" CTA → opens `?pay=true` modal.

**Blur execution (luxury-brand-design):** `filter: blur(6px) saturate(0.8)` with a faint silver overlay gradient. Visually conveys substance behind it; unreadable.

---

## 6. The 8 report blocks — Gemini structured output schema (gemini-prompt-engineer role)

```json
{
  "auraScore": 0,
  "rank": "unawakened | seeker | ascendant | luminary | sovereign",
  "firstImpression": "one Consultant-voice line, ≤18 words, no exclamations",
  "faceShape": "oval | round | square | rectangular | heart | diamond | triangle",
  "freeSignals": [
    { "label": "Tired", "axis": "underEye" },
    { "label": "Hydrated", "axis": "skinHydration" },
    { "label": "Loose", "axis": "jawDefinition" },
    { "label": "Bright", "axis": "sclera" }
  ],
  "decomposition": {
    "skin":        [{ "metric": "clarity", "score": 0, "cause": "...", "fix": "..." }, ...],
    "hair":        [...],
    "jawAndFace":  [...],
    "bodyAndPosture": [...],
    "lifestyleSignals": [...]
  },
  "biggestLever": { "metric": "underEye", "score": 38, "rationale": "..." },
  "quests": [
    { "metric": "underEye", "task": "Cold spoon under-eye 30s, mornings — 7 nights", "library": "puffinessUnderEye" }
  ],
  "styleAndColour": { "haircut": "...", "palette": ["..."], "avoid": ["..."] },
  "starterPlan": [
    { "day": 1, "morning": "...", "evening": "..." }, ...
  ],
  "context": {
    "boneStructure": "presented for context, never scored",
    "hairDensity": "...",
    "colouring": "..."
  },
  "warnings": ["any safety flag the model raised"]
}
```

**Context-vs-quest enforcement at the prompt level:** the system prompt includes an allow-list of quest-eligible metrics. The model is told: if it's unsure whether something is changeable, treat it as context — no score, no task. Any task it assigns must come from the SAFE-TASK LIBRARY allow-list (see §7).

---

## 7. Safe-task library (gemini-prompt-engineer encodes as prompt allow-list)

**Tasks the model MAY assign:**
- `skincareBasics`: gentle cleanse, moisturise, SPF, reduce face-touching, clean pillowcase, patch-test
- `puffinessUnderEye`: cold-water splash, cold spoon/roller under-eye, sleep-on-back, reduce late salt, reduce late screens
- `hydrationSleep`: water through the day, consistent sleep/wake, screens-off-early, dark room
- `groomingShape`: beard line/shape guidance, brow tidy, haircut-to-face-shape suggestions, neckline cleanup
- `posturePresence`: chin-tuck cue, shoulders-back cue, desk-setup tip, camera-angle/lighting tip
- `wardrobeColour`: wear palette colours, avoid clashing colours, fit guidance

**HARD PROHIBITIONS (model REFUSES — every time):**
- No medical claims/diagnoses/"cures"
- No prescription/medication/supplement names or dosages
- No retinoid/acid strengths
- No extreme caloric restriction / fasting / "drop water weight" by dehydration
- No cosmetic-procedure recommendations
- No shaming, no pathologising unchangeable traits

**Edge-case fallback:** *"This is one for a qualified professional."* Zero instruction follows.

---

## 8. Backend contracts (backend-agent)

### Data model — new tables (migrations/0002_audit_engine.sql)
- `audit_sessions_v2` — guest_id (uuid) | user_id (uuid, null until merge) | quiz_answers (jsonb) | photo_storage_key (text) | gemini_report (jsonb) | paid (bool) | paid_at (timestamptz) | razorpay_payment_id (text) | created_at | expires_at (24h TTL for unmerged guest sessions)
- `comp_grants_v2_audit` — existing structure reused via separate flag
- Migration runner: `lib/migrate.js` picks it up at boot

### Routes (`routes/lookmaxing.js` — new file)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/lookmaxing/guest` | none | Mint guest_id, return cookie |
| POST | `/api/lookmaxing/quiz` | guest_id OR user_id | Persist 5 answers |
| POST | `/api/lookmaxing/photo` | guest_id OR user_id | Multer upload, sharp compress (reuse existing `services/storage.putPhoto`), persist key |
| POST | `/api/lookmaxing/analyze` | guest_id OR user_id | Trigger Gemini, persist `gemini_report`, return free-resolution view |
| GET  | `/api/lookmaxing/audit/:id` | guest_id-matches OR user_id-matches | Return audit; free or full based on `paid` flag |
| POST | `/api/lookmaxing/pay/order` | guest_id OR user_id | Razorpay order create (₹99, test-mode) |
| POST | `/api/lookmaxing/pay/webhook` | Razorpay signature | Flip `paid=true`, fire KPI event |
| POST | `/api/lookmaxing/merge` | user JWT + guest_id cookie | Merge guest → user; copy quiz/photo/report/paid status; delete guest row |
| GET  | `/api/lookmaxing/audit/:id/pdf` | guest-or-user-must-own + paid | Generate PDF via the existing `pdf` skill or pdfkit; signed-URL R2 |
| GET  | `/api/lookmaxing/waitlist/orator` | none | (Use existing `/api/waitlist`?) |

### Guest → user merge (THE concern the founder raised)
1. Guest creates `audit_sessions_v2` row with `guest_id = G123`, `user_id = null`
2. User signs in (Google / magic-link) → server issues JWT for `user_id = U456`
3. Client calls `POST /api/lookmaxing/merge` with JWT + `guest_id` cookie
4. Server runs in a transaction:
   - SELECT audit_sessions_v2 WHERE guest_id = G123 AND user_id IS NULL
   - UPDATE SET user_id = U456, guest_id = NULL
   - If user already has prior audits, the merged one becomes their **baseline** for the Daily Mirror trial (set `users.lookmaxBaseline = {...}` from the merged report — same field B0/B2 already use)
   - DELETE FROM guest_sessions WHERE guest_id = G123
   - Audit-log to `data_rights_log` (`{userId, action: 'guest_merge', guestId: 'G123', ts}`)
5. Returns the canonical audit URL for the now-authenticated user

**Future Gemini context guarantee:** because the merged audit lands in the same `users.lookmaxBaseline` field the Daily Mirror engine already reads, the signed-in user's downstream LLM calls naturally include everything the guest produced. No new memory plumbing needed.

### Razorpay test-mode
- Order amount: `9900` paise (₹99)
- Currency: INR
- Notes: `{ auditId, source: 'lookmaxing_audit_unlock' }`
- Webhook event: `payment.captured` → flip `paid = true`
- ₹99 credit toward month one: store `users.paywallCredits += 99` at successful payment; subscription endpoint subtracts it from first month's invoice (logic stubbed — full impl when subscription path lands)

### Frontend instrumentation events (existing `services/events.js`)
- `lookmaxing_landing_viewed` (trackOnce)
- `lookmaxing_video_played`, `lookmaxing_video_watched_50`, `lookmaxing_video_watched_90`
- `lookmaxing_cta_clicked` (primary hero / repeat)
- `lookmaxing_fork_guest`, `lookmaxing_fork_signin`
- `lookmaxing_quiz_started`, `lookmaxing_quiz_q{N}_answered`, `lookmaxing_quiz_completed`
- `lookmaxing_photo_uploaded`
- `lookmaxing_audit_generated`, `lookmaxing_audit_viewed`
- `lookmaxing_paywall_viewed`, `lookmaxing_paywall_blurred_metric_tapped`, `lookmaxing_pay_initiated`, `lookmaxing_pay_succeeded`, `lookmaxing_pay_failed`
- `lookmaxing_merge_completed`
- `lookmaxing_pdf_downloaded`
- `lookmaxing_fork_trial`, `lookmaxing_fork_premium`
- `orator_waitlist_joined`

Allowlist these in `services/events.js`.

---

## 9. The video container (landing-page-conversion-architect role)

- Black, silver-bordered 16:9, directly below the hero headline + sub
- States:
  - **Empty (default tonight):** subtle "Video loading…" placeholder in JetBrains Mono small-caps, centered, silver. **NEVER a broken embed.**
  - **Embedded (when founder pastes YouTube link):** autoplay-muted, loop, minimal controls, no related videos, `disablekb=0`, `modestbranding=1`, `rel=0`
- HTML comment marker: `<!-- REPLACE WITH YOUTUBE EMBED — autoplay-muted, loop, minimal controls -->`

---

## 10. Mobile-first (360px)

- Hero headline + sub + primary CTA all above the fold at 360×640 viewport
- Video container slots in below the fold (acceptable; user must scroll)
- Quiz one-question-per-screen renders the whole question + 4 options above the fold
- Capture screen camera button is a thumb-reachable 56×56 minimum
- Free report Aura Score numeral renders at full visual weight on 360px

---

## 11. Sequencing (strategy-orchestrator)

**Wave 1 (parallel, ~20 min wall-clock):**
- A — design-agent: BLACK & SILVER token CSS + 8-surface design spec
- B — copy-consultant-agent: hero hook + 5 quiz q's (Consultant voice) + paywall + report block labels
- C — backend-agent: Gemini system prompt + structured JSON schema + 2-3 synthetic samples

**Wave 2 (parallel, ~30 min wall-clock):**
- A — backend-agent: routes/lookmaxing.js + migrations + guest/merge + Razorpay test + PDF generator + 30+ tests
- B — frontend-agent: 8 surfaces in BLACK & SILVER using Wave-1A tokens + Wave-1B copy + Wave-1C JSON shape

**Wave 2c (after 2A, ~5 min):**
- backend-agent: disable old Orator routes (`/start`, `/orator/*`, `/handoff` → 302 to `/lookmaxing`) + regression test

**Wave 3 (~15 min):**
- qa-agent: full test suite, smoke, brand-voice audit, sign-off file
- me: browser-verify each surface live (desktop + 360px), screenshots, regression fixes

**Wave 4 (~15 min):**
- me: MORNING_REPORT.md synthesis

---

## 12. Agent mapping (the 6 new agents aren't in this session's registry)

| New agent | Mapped to | Why |
|---|---|---|
| founder-voice-translator | orchestrator (me) | Spec-writing role |
| strategy-orchestrator | orchestrator (me) | Sequencing role |
| luxury-brand-design | design-agent (briefed with the BLACK & SILVER constraints) | Visual director |
| landing-page-conversion-architect | folded into design-agent's landing brief + frontend-agent | Landing convergence |
| audit-funnel-architect | feature-product-agent (spec) + backend-agent/frontend-agent (build) | Funnel architecture |
| gemini-prompt-engineer | backend-agent (gemini.js + vision.js live there) | Prompt + scoring |

**Founder follow-up:** restart Claude Code in a fresh session to pick up the 6 new agents from `.claude/agents/` for future work.

---

## 13. Definition of done (per surface)

- [ ] Renders cleanly at desktop 1440 + mobile 360
- [ ] Console clean (0 errors)
- [ ] Brand voice — 0 exclamations in MainCharacter's voice, 0 emojis except ◆
- [ ] BLACK & SILVER — 0 gold tokens, no warm colours
- [ ] KPI `data-event` attributes wired for the events listed in §8
- [ ] Tests added (string-match + structural)
- [ ] Browser-verified live; screenshot saved
- [ ] Audit-trail comment in source citing this spec

---

## 14. Skip-vs-stop log (live)

| Item | Status | Why | Founder action |
|---|---|---|---|
| Source-of-truth doc `maincharacter-pillar2-aesthetic-system.html` | **Skipped — needs you** | File not on disk anywhere | Drop it in repo root next session |
| YouTube hook video URL | **Skipped — needs you** | Founder will paste later | Replace `<!-- REPLACE WITH YOUTUBE EMBED -->` marker in `public/lookmaxing/index.html` |
| Real test photos for Gemini sample reports | **Skipped — needs you** | No test photos available; using synthetic prompts | Run 2-3 of your own photos through `/lookmaxing/audit` flow once awake |
| 6 new agents not in session registry | **Skipped — needs you** | Session started before they were added | Restart Claude Code in fresh session |
| Lawyer-approved 18+ consent gate copy | **Deferred** | Drafts exist in `product/draft-consent-flow-and-age-gate.md`; needs lawyer review per Gate D of `PRODUCTION_READINESS.md` | Not blocking tonight — `/lookmaxing` capture step adds a simple "I'm 18+ and accept the privacy policy" checkbox as interim |

(Updated by waves as they discover more.)
