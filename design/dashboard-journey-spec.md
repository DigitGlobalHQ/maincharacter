# Design Spec — "Your Journey" (Lookmaxxing dashboard history + analytics)

**Date:** 2026-06-02
**Surface:** `public/lookmax/index.html` (the gold-theme dashboard home)
**Stylesheet of record:** `public/lookmax/app.css` — the `--gold / --obsidian / --ink` token set. NOT `body.lookmaxing` (the black-and-silver `/lookmaxing/*` audit theme). This section inherits the dashboard's existing gold cards.
**Status:** SPEC ONLY — founder reviews before any build. No code in this document.

---

## 0. Goal of the section (one line)

Give a returning user a calm, chronological record of every reading they have taken and the few honest trends that record reveals — so the dashboard feels like a journal of their evolution, not just a "today" screen.

---

## 1. Placement (additive — nothing existing is touched)

A single new region appended to `#page`, inserted **after** the cross-sell slot / push-prompt slot and **before** the `.footer-note`. New container only:

```
<div id="journey-section"></div>
```

No existing card (Saved Aura Reading, Mirror tile, Protocol/Hair tiles, This-week strip, cross-sell, push prompt) is restyled, reordered, or rewritten. The This-week 7-dot strip stays exactly where it is; the Journey section's mirror module is the *longer-horizon* view, not a replacement.

The section opens with one quiet section header (not a card), so the eye registers a new chapter:

```
─────────────────────────────────
  YOUR JOURNEY                          ← eyebrow, .muted, 12px, letter-spacing 1px, uppercase
  Every reading, in order.              ← Cormorant italic, h2 (22px), --ink   [TODO copy review]
─────────────────────────────────
```

Header block: `margin-top: 32px; margin-bottom: 16px;`. A hairline rule (`1px solid var(--line)`) sits above the eyebrow to separate it from the "today" surfaces.

---

## 2. Module list (priority order)

Priority is by data-certainty and emotional payoff. Every user has Module 1. Later modules only render when their data exists, and each has an explicit low-data state.

1. **Readings Timeline** (the spine — always present)
2. **Aura Score Over Time** (sparkline of 2–6 points)
3. **8-Axis Before → After** (baseline vs latest re-audit)
4. **Mirror Consistency** (full history: total + month heatmap)
5. **Hair Trend** (hairlineScore + Norwood over time)

Render order on screen follows this priority. Modules 2–5 each sit in their own `.card`; spacing between cards is the existing `margin-bottom: 16px` from `.card`.

---

## 3. Per-module layout

All measurements mobile-first at 360px. All cards use the existing `.card` (border `1px solid var(--line)`, radius 16px, bg `--panel`, padding `22px 20px`). Accent rule on the top edge only where noted (`border-top: 3px solid var(--gold)` = existing `.card--gold`).

### Module 1 — Readings Timeline (the spine)

A vertical list, newest first, of every reading (baseline + each Day-30 re-audit). Each row is a tappable link that re-opens the full reading. This is the answer to "see all his previous checks."

```
┌─ .card ─────────────────────────────────────┐
│ YOUR READINGS                    3 readings  │  ← eyebrow + count, muted
│                                              │
│  ◆ ─┐                                        │
│     │  Re-audit                  02 Jun 26   │  ← serif italic label + date
│     │  72  ASCENDANT             ▲ +6        │  ← score (serif 28px) · rank · delta
│     │                              View ◆    │  ← affordance, gold
│  ◆ ─┤                                        │
│     │  Re-audit                  03 May 26   │
│     │  66  SEEKER                ▲ +5        │
│     │                              View ◆    │
│  ◆ ─┘                                        │
│        Baseline reading          03 Apr 26   │
│        61  SEEKER                  —         │  ← baseline has no delta
│                                    View ◆    │
└──────────────────────────────────────────────┘
```

- The left rail is a 1px `var(--line)` vertical line; each node is the gold `◆` (the only icon, ~10px) sitting on the rail. Newest node may be `--gold`, older nodes `--muted` ◆ — quiet, not loud.
- Row label ("Baseline reading" / "Re-audit"): Cormorant italic, 16px, `--ink`. [TODO copy review on exact labels]
- Date: Sora, 12px, `--muted`, right-aligned. Format `DD Mon YY`.
- Score: Cormorant **non-italic** numerals, 28px, `--gold` (this is a data numeral, score-as-emotion). Rank beside it: Sora 11px uppercase letter-spacing 1px `--muted`.
- Delta vs previous reading: `▲ +6` in `--good`, `▼ -4` in `--bad`, `—` in `--muted` for baseline. (Triangles are text glyphs, not an icon set — acceptable, but if founder prefers, replace with the words "up / down".) [TODO copy review]
- Each row is one `<a>` wrapping to the full reading (`/lookmaxing/audit/:id` or its `/full` variant, same routing the existing Saved Aura Reading card uses). Whole row is the 44px-min tap target; "View ◆" is the visible affordance, gold 13px.
- Hover/focus: row border-free, but the `◆ View` shifts to `--gold-bright`-equivalent (we only have `--gold`; use opacity 1 vs resting 0.85). Keep it subtle.
- Long lists: show newest 4, then a `Show all readings ◆` ghost link that expands in place (no new page). At 2–6 points expansion is rarely needed, but spec it so it never overflows.

### Module 2 — Aura Score Over Time (sparkline)

Designed for **2–6 points**, never a dense chart. Inline SVG line + dots, no library.

```
┌─ .card ─────────────────────────────────────┐
│ AURA OVER TIME                               │
│                                              │
│   80 ┊                                  ●72  │  ← latest dot labelled, gold
│      ┊                         ●66           │
│   60 ┊           ●61 ────────                │
│      ┊                                       │
│   40 ┊                                       │
│      └───────────────────────────────────    │
│       Apr            May            Jun       │  ← date ticks, muted 11px
│                                              │
│   +11 since baseline                         │  ← summary line, --good  [TODO copy]
└──────────────────────────────────────────────┘
```

- SVG, ~100% width × 120px tall. Y-axis is implicit; only two faint reference gridlines (40, 80 or min/max framing) in `var(--line)`.
- Line: 1.5px stroke `--gold` at 0.6 opacity. Dots: 5px radius, `--panel` fill with `--gold` stroke; **latest** dot solid `--gold` and slightly larger (6px) with its score labelled in Cormorant 14px.
- X positions are evenly spaced by index (not time-scaled) — with ~30-day cadence this reads cleanly and avoids cramped early points. Date label under each dot, `--muted` 11px; if labels collide at 360px, show only first/middle/last.
- Summary line beneath: net delta baseline→latest, `--good`/`--bad`. [TODO copy review]
- No fill gradient under the line (gradients banned except gold radial glows). Flat line only.

### Module 3 — 8-Axis Before → After

Baseline-vs-latest comparison. Horizontal paired bars (more legible on a 360px phone than a radar, and trivially buildable with the existing `.bar` pattern). Radar is explicitly **not** chosen for v1 — noted in Out of Scope rationale.

```
┌─ .card ─────────────────────────────────────┐
│ WHERE YOU'VE MOVED          Baseline → Now   │
│                                              │
│  Skin clarity                      58 → 70   │
│  ░░░░░░░░░░▓▓▓▓░░░░░░░░░░░░          ▲ +12   │  ← baseline bar (muted) + gain (gold)
│  Jaw definition                    64 → 66   │
│  ░░░░░░░░░░░░▓▓░░░░░░░░░░░░          ▲ +2     │
│  ...  (8 axes total)                         │
│  Symmetry                          70 → 68   │
│  ░░░░░░░░░░░░░░░░░░ (no gain seg)   ▼ -2     │  ← regression: bar shorter, delta --bad
└──────────────────────────────────────────────┘
```

- Each axis: label (Sora 14px `--ink`) + `58 → 70` mono-ish numerals right-aligned (`--muted` for baseline, `--ink` for now).
- Single bar, height 7px (existing `.bar`): the baseline portion fills in `--muted`/`--line`-tinted gold at low opacity; the **gain** segment (delta) extends in solid `--gold`. For a regression, no gold gain segment; the "now" value bar is simply shorter and the delta reads `--bad`.
- Delta chip on the right: `▲ +12` `--good` / `▼ -2` `--bad` / `—` `--muted`.
- 8 axes stacked vertically; ~10px gap. No horizontal scroll.
- Axis labels are locked to whatever the audit already names them — **do not invent axis names**; mirror the exact keys the re-audit returns (skinClarity, jawDefinition, etc.). [TODO copy review on display labels]

### Module 4 — Mirror Consistency (full history)

Goes beyond the existing this-week 7-dot strip: lifetime total + a month-grid heatmap of mirror days.

```
┌─ .card ─────────────────────────────────────┐
│ THE MIRROR, OVER TIME                        │
│                                              │
│        47                                    │  ← total count, Cormorant 44px gold
│        mornings logged          [TODO copy]  │
│                                              │
│  May                                         │
│  S  M  T  W  T  F  S                         │
│  ·  ●  ●  ·  ●  ●  ·                         │  ← ● = logged (gold), · = empty (line)
│  ●  ●  ●  ●  ·  ●  ●                         │
│  ●  ·  ●  ●  ●  ●  ·                         │
│  ...                                         │
│                                              │
│  Longest streak  9 days        [TODO copy]   │  ← muted summary
└──────────────────────────────────────────────┘
```

- Big number: total mornings logged, Cormorant non-italic 44px `--gold`, with a `--muted` caption.
- Heatmap: one calendar month (default = current month) as a 7-col grid of dots. `●` 11px `--gold` for a logged day, `·` `--line` outline for a missed day, blank cells for days outside the month. Reuse the visual language of `.weekstrip .dot` (gold fill on, line border off) so it feels native.
- Two binary states only (logged / not) — we do NOT have per-day intensity worth shading, so avoid a multi-step heat ramp (would imply data we don't have).
- Month switcher: `‹ May ›` ghost arrows (text chevrons) to page months, only as far back as the user's first mirror. If only one month of data, no arrows.
- Footer summary: longest streak in days, `--muted`. [TODO copy review]

### Module 5 — Hair Trend

`hairlineScore` (0–100) + Norwood stage across hair readings over time. Hair readings are weekly-ish and may be sparse.

```
┌─ .card ─────────────────────────────────────┐
│ HAIRLINE                                     │
│                                              │
│   68            Norwood II        [stable]   │  ← score serif 28px gold · stage · trend pill
│                                              │
│   ●──●──●──●  (mini sparkline, same style    │  ← same sparkline spec as Module 2,
│                as Module 2, shorter)          │     compact 80px tall
│                                              │
│   Stage held at II for 3 readings [TODO copy]│
└──────────────────────────────────────────────┘
```

- Current `hairlineScore`: Cormorant 28px `--gold`. Norwood stage: `--ink` 14px (e.g. "Norwood II").
- Trend pill (reuse `.badge`): "stable" / "improving" / "receding" — but **wording is copy-review**; default to neutral framing, never alarmist. [TODO copy review — The Consultant voice; do not call a user "balding"]
- Mini sparkline identical spec to Module 2, 80px tall, only `hairlineScore` plotted.
- If Norwood went backwards, the line still renders honestly; the summary sentence stays restrained.

---

## 4. Data contract — `GET /api/lookmax/me/history`

Authenticated like the existing dashboard call (`LM.api`, bearer token). One round-trip feeds the whole section. The frontend renders only the modules whose arrays are non-empty. **Design only around these fields — nothing else exists.**

```jsonc
{
  "user": {
    "name": "Aman",
    "mirrorLevel": "polished",          // raw|polished|magnetic|radiant|sovereign
    "joinedAt": "2026-04-03"
  },

  // Module 1 + 2 — the spine. Ordered OLDEST → NEWEST (frontend reverses for display).
  // 1 entry for a brand-new user (baseline only); grows by 1 every ~30 days.
  "readings": [
    {
      "id": "aud_abc123",              // for the row's link to the full reading
      "type": "baseline",              // "baseline" | "reaudit"
      "date": "2026-04-03",            // ISO date
      "auraScore": 61,                 // 0–100
      "rank": "seeker",                // unawakened|seeker|ascendant|luminary|sovereign
      "href": "/lookmaxing/audit/aud_abc123",  // server decides /full vs resolve, like Saved Aura card
      "paid": true                     // optional; lets FE pick label if needed
    },
    {
      "id": "aud_def456",
      "type": "reaudit",
      "date": "2026-05-03",
      "auraScore": 66,
      "rank": "seeker",
      "href": "/lookmaxing/audit/aud_def456",
      "paid": true
    }
    // ...up to ~6 typical
  ],

  // Module 3 — 8-axis before→after. Present only when ≥1 re-audit exists.
  // `baseline` = first reading's axes; `latest` = most recent reading's axes.
  // Keys MUST match the audit's existing axis keys verbatim (do not rename).
  "axes": {
    "baseline": {
      "skinClarity": 58, "jawDefinition": 64, "symmetry": 70,
      "hairlineScore": 60, "eyeArea": 55, "facialHarmony": 62,
      "leanness": 50, "grooming": 66
    },
    "latest": {
      "skinClarity": 70, "jawDefinition": 66, "symmetry": 68,
      "hairlineScore": 68, "eyeArea": 60, "facialHarmony": 66,
      "leanness": 58, "grooming": 72
    }
  },
  // null when no re-audit yet (Module 3 hides).

  // Module 4 — mirror consistency.
  "mirrors": {
    "totalCount": 47,
    "longestStreak": 9,                // days
    "firstDate": "2026-04-04",
    "loggedDates": [                    // ISO dates with a logged mirror, ascending
      "2026-05-01", "2026-05-02", "2026-05-04"
      // FE builds the month grid from this; absent = missed
    ]
  },
  // mirrors.loggedDates may be []; totalCount 0 for a brand-new user.

  // Module 5 — hair trend. Present only when ≥1 hair reading exists.
  "hair": {
    "current": { "hairlineScore": 68, "norwoodStage": "II", "date": "2026-06-01" },
    "history": [                        // ascending, for the mini sparkline
      { "date": "2026-04-10", "hairlineScore": 64, "norwoodStage": "II" },
      { "date": "2026-05-10", "hairlineScore": 66, "norwoodStage": "II" },
      { "date": "2026-06-01", "hairlineScore": 68, "norwoodStage": "II" }
    ]
  }
  // null when hair never unlocked/read (Module 5 hides).
}
```

**Contract rules for backend:**
- `readings` is the only guaranteed-non-empty array (always ≥1 = baseline).
- `axes`, `hair` are `null` until their data exists. `mirrors` always present but may be zero/empty.
- Deltas are computed **client-side** from adjacent `readings` entries — backend does not need to send them.
- All dates ISO `YYYY-MM-DD`. No timezone gymnastics; date-only is enough.
- Norwood stage is a string the audit already produces; FE does not interpret it beyond display.

---

## 5. Empty / low-data states (REQUIRED — the most important part)

A brand-new paid user has exactly **1 reading** and **0–few mirrors**. The section must feel intentional, not broken, with almost no data.

### Section-level
- If `readings.length === 1` AND `mirrors.totalCount === 0` AND `axes === null` AND `hair === null`: render a **single quiet "first chapter" card** instead of five sparse modules — avoids a wall of empty states.

```
┌─ .card --gold ──────────────────────────────┐
│ YOUR JOURNEY                                 │
│                                              │
│ "This is your baseline. Everything after     │  ← Cormorant italic, --ink
│  this is movement."          [TODO copy]     │
│                                              │
│  ◆  Baseline reading        03 Apr 26        │  ← the one timeline row, tappable
│     61  SEEKER                  View ◆        │
│                                              │
│  Your next reading unlocks in 27 days.       │  ← --muted [TODO copy — use real Day-30 count]
└──────────────────────────────────────────────┘
```

### Per-module low-data
- **Module 1 (Timeline):** with 1 reading, shows the single baseline row, no left-rail connector needed (one node). No "show all" link.
- **Module 2 (Aura over time):** with 1 point, **do not draw a line**. Show one dot centered with its score, and a `--muted` caption: "One reading so far. The line begins at your next." [TODO copy]. With exactly 2 points, draw the line normally.
- **Module 3 (Axes):** hidden entirely until a re-audit exists (no baseline-vs-baseline). When hidden, no placeholder — the card simply isn't rendered. Optionally a one-line teaser inside the first-chapter card: "Your 8-axis comparison appears after your first re-audit." [TODO copy]
- **Module 4 (Mirror):** `totalCount === 0` → big number shows `0`, caption "Your first morning is waiting." [TODO copy]; heatmap renders the current month as all-empty dots (still legible, sets the expectation). `1–6` mirrors: number + current-month grid; hide "longest streak" line until ≥1 streak ≥2.
- **Module 5 (Hair):** hidden until first hair reading. With exactly 1 hair reading: show score + Norwood, no sparkline, caption "Tracking begins now." [TODO copy].

### Error / loading
- **Loading:** while `GET /api/lookmax/me/history` is in flight, the section shows one skeleton card — a `.card` with `min-height: 140px` and a faint `--line` shimmer (or static, if reduced-motion). No spinner spam.
- **Error / network fail:** the entire section is **omitted silently** (like the existing `renderAuraReading().catch(() => {})` pattern). The "today" dashboard above must never be blocked by a Journey fetch failure. Optionally a single muted retry link: "Couldn't load your journey. Retry ◆" [TODO copy].
- **Disabled state:** N/A — nothing here is a form control; rows are links.

---

## 6. Motion

Sparing, per brand. Reuse existing keyframes; introduce nothing celebratory.

- **Section reveal:** the existing `fadeIn` (0.4s ease, opacity only) on the section container on first render. No slide, no stagger.
- **Bars (Module 3):** reuse `.bar > span { transition: width .9s ease }` — bars grow from 0 to value once, on first paint. Identical to the audit reveal feel.
- **Sparkline (Module 2/5):** optional single stroke-draw of the line (SVG `stroke-dashoffset` 0.9s ease) on first paint; dots fade in after. If this adds risk, ship static — it is non-essential.
- **No pulse** on Journey cards (pulse is reserved for the "take today's mirror" CTA). No confetti, no count-up odometers on the score numbers.
- **`prefers-reduced-motion`:** all of the above collapse to instant — bars render at final width, sparkline draws instantly, no fade. Honour the existing global reduce block.

---

## 7. Copy slots (ALL draft — `TODO copy review`)

Every string below is a placeholder for the copy-consultant + founder. Do NOT ship invented Consultant-voice lines.

| Slot | Placeholder (draft) |
|---|---|
| Section eyebrow | `YOUR JOURNEY` |
| Section subhead | "Every reading, in order." |
| Timeline eyebrow / count | `YOUR READINGS` · "3 readings" |
| Reading row labels | "Baseline reading" / "Re-audit" |
| Row affordance | "View ◆" |
| Aura-over-time title | `AURA OVER TIME` |
| Aura summary line | "+11 since baseline" |
| Aura 1-point caption | "One reading so far. The line begins at your next." |
| Axes title | `WHERE YOU'VE MOVED` (header "Baseline → Now") |
| Axes pre-reaudit teaser | "Your 8-axis comparison appears after your first re-audit." |
| Mirror title | `THE MIRROR, OVER TIME` |
| Mirror count caption | "mornings logged" |
| Mirror 0-state caption | "Your first morning is waiting." |
| Mirror streak line | "Longest streak — 9 days" |
| Hair title | `HAIRLINE` |
| Hair trend pill | "stable" / "improving" / "receding" (neutral framing only) |
| Hair summary | "Stage held at II for 3 readings" |
| First-chapter card | "This is your baseline. Everything after this is movement." |
| Next-reading countdown | "Your next reading unlocks in 27 days." |
| Error retry | "Couldn't load your journey. Retry ◆" |

Brand guardrails on all of the above: no exclamation marks, no hype, no "balding"/alarmist language on hair, no emoji except ◆.

---

## 8. Mobile-first + breakpoints

Designed at **360px**. Container inherits `.page` (`max-width: 560px`, `padding: 26px 18px`).

- **360px (default):** every module full-width, single column. Timeline rows stack. Axes bars stack 8 deep. Mirror heatmap is a 7-col grid at ~32px cells (within 44px tap tolerance for the month chevrons, not the dots). Sparkline scales to container width.
- **768px:** still single-column within the 560px page cap (the dashboard never goes wider than 560 — keep it). Use the extra breathing room only as larger internal padding if anything; do NOT introduce a 2-up grid that would clash with the existing single-column dashboard rhythm. Modules 2 and 5 may sit side-by-side ONLY if founder later asks; default keeps them stacked.
- **1024px+:** unchanged from 768 (page is capped at 560px). Sparklines and heatmap simply have more comfortable internal whitespace.

Rationale: the dashboard is a capped-width column today; the Journey section must not break that vertical rhythm. Most users are mid-range Android at 360–412px — everything is verified to fit and tap there first.

---

## 9. Accessibility

- **Contrast:** `--ink #f4f1ea` on `--panel #0d0d0f` ≈ 16:1 (pass AAA). `--gold #e8b84b` on `--panel` ≈ 9:1 (pass AA/AAA for large numerals). `--muted #8a877f` on `--panel` ≈ 4.7:1 — acceptable for secondary text ≥14px; never use `--muted` below 13px for essential info. Delta colors `--good #6fd8a0` / `--bad #d98b8b` on `--panel` both clear 4.5:1; **never encode meaning by color alone** — always pair with the `▲/▼/—` glyph or word.
- **Structure:** section is a `<section aria-labelledby="journey-heading">`; the subhead is the labelled heading (`<h2 id="journey-heading">`). Each module card is a `<section>`/`<article>` with its own visible heading. Timeline is an ordered list `<ol>` (chronology is meaningful), each reading an `<li>` containing the `<a>`.
- **Tap targets:** every timeline row link ≥44px tall. Month chevrons ≥44×44. Heatmap dots are non-interactive (decorative data), so the 44px rule doesn't gate them; they carry an accessible label on the grid, not per-dot.
- **Keyboard:** all links/chevrons reachable in DOM order, visible focus ring (reuse the page's focus styles). "Show all readings" toggle is a real `<button aria-expanded>`.
- **Screen-reader labels:**
  - Sparkline SVG: `role="img"` with `aria-label` summarizing e.g. "Aura score over 3 readings: 61 in April, 66 in May, 72 in June." (FE composes from data.) Decorative gridlines `aria-hidden`.
  - Heatmap: `role="img"`, `aria-label` "Mirror logged on 18 of 31 days in May." Don't read 31 dots individually.
  - Axis bars: each row reads "Skin clarity: 58 baseline, 70 now, up 12." Delta glyph has `aria-hidden`; the word is in the label.
  - Reading rows: link text reads "Re-audit, 2 June, score 72, Ascendant, up 6. View reading."
- **Reduced motion:** honoured globally (§6).

---

## 10. Token usage notes (locked tokens only)

| Use | Token |
|---|---|
| Section/card bg | `--panel #0d0d0f` (existing `.card`) |
| Page bg / glows | unchanged (`--obsidian` + existing aubergine/gold radials) |
| Hairlines, rails, empty dots | `--line #1d1d20` |
| Primary text, axis labels | `--ink #f4f1ea` |
| Secondary text, dates, captions, eyebrows | `--muted #8a877f` (≥13px only) |
| Score numerals, ◆ nodes, sparkline line, logged dots, gain bars, accents | `--gold #e8b84b` |
| Positive delta | `--good #6fd8a0` (+ glyph) |
| Negative delta | `--bad #d98b8b` (+ glyph) |
| Headlines (subhead, row labels, first-chapter line) | Cormorant Garamond **italic** |
| Score/count numerals | Cormorant Garamond **non-italic** (data, not headline) |
| Eyebrows, labels, dates, captions, deltas | Sora |

Forbidden here, restated: no new colors, no `--aesthetic` violet as fill (it's the audit theme, not this gold dashboard), no gradients except the existing gold radial glows, no drop shadows beyond the existing ambient card border, no icon set other than ◆, no emoji, no exclamation marks.

---

## 11. Frontend-implementation notes (for `frontend-agent`)

- **Patterns to copy directly:**
  - The whole render flow mirrors `renderAuraReading()` in `public/lookmax/index.html` — fetch, guard, build innerHTML, fail silent on error. Copy that error posture exactly (`.catch(() => {})`).
  - Score-numeral styling is already in that file (Cormorant 44px). Reuse.
  - Bars: reuse `.bar` / `.bar > span` from `app.css` for Module 3 (width transition included).
  - Dots: reuse `.weekstrip .dot` / `.dot.on` visual language for the Module 4 heatmap.
  - Pills: reuse `.badge` for the hair trend pill.
  - Cards: reuse `.card` and `.card--gold` (top rule). Section reveal: reuse the inline `fadeIn` keyframe already in the page's `<style>`.
- **New CSS** (scoped, additive — put in the page's existing `<style>` block, not in shared `app.css` unless founder wants it shared): timeline left-rail + node layout, sparkline SVG sizing, heatmap grid. Keep it ~60–90 lines; no new tokens.
- **Sparkline:** hand-build inline SVG (`<polyline>` + `<circle>`s). No D3, no Chart.js. Compute points from `readings` array; evenly space on X by index.
- **Heatmap:** generate the month grid in JS from `mirrors.loggedDates`; a Set lookup per day. Pure CSS grid (`grid-template-columns: repeat(7, 1fr)`).
- **Assets needed:** none. No images, no fonts beyond the two already loaded, no new icons.
- **Analytics:** fire one `journey_section_viewed` event (matching the existing `window.mc.track` pattern) on first render, and `journey_reading_clicked` with `{ readingId, type }` on row tap — mirror the existing `data-event` convention.
- **Do not** touch the existing dashboard fetch (`/api/lookmax/dashboard`); this is a second, independent call so the two surfaces fail independently.

---

## 12. Out of scope (explicit)

- **No redesign** of any existing dashboard card or the locked audit/reveal surfaces. Additive only.
- **No radar chart** for the 8 axes in v1 — paired horizontal bars are more legible at 360px and reuse an existing pattern. Radar can be revisited if the founder requests it, but it is not in this spec.
- **No charting library** of any kind. Inline SVG + CSS only.
- **No per-day intensity heatmap** (we only have logged/not-logged; a heat ramp would imply data we don't have).
- **No new colors/fonts/icons.** No `--aesthetic` violet in this gold surface.
- **No editing/deleting readings**, no notes, no journaling text input — this is a read-only record.
- **No cross-pillar (Orator) history** here — Lookmaxxing only.
- **No new copy shipped** — every string is `TODO copy review` for the founder/copy-consultant.
- **No changes to the `GET /api/lookmax/dashboard` payload** — Journey gets its own endpoint.

---

*This is a design specification. No code is included or implied as final. Build proceeds only after founder review.*
