# Design — Hair Tracker (`/lookmax/hair`)

> Surface: `public/lookmax/hair.html`. Weekly hair audit — Norwood stage + recession mm + recommendations.
> The most niche flow. Keep it discreet. Never alarmist. Leverage-axis-first when relevant.

---

## 1. Status of current execution

Functional. Two photos (front + crown), 7-stage Norwood visualisation as small domes, hairline score with delta vs first reading, recession in mm (or "insufficient data" guard at low confidence), do/do-not recommendations with evidence tiers. The lock state shows "Next reading in N days" + the last result. Frictions: (a) the **Norwood domes are too small** at 30px tall and read as a row of decorative pills, not a clinical staging — and the "on" state is a fully filled gold dome that on the higher Norwood stages reads as a celebration (gold = good in our system), which is the wrong signal; (b) the **hairline score `${r.hairlineScore}/100 +N vs first reading`** is presented as a flat numeric, with no leverage-axis framing — for a user whose hair density was the leverage axis in the audit, the page should make that connection; (c) the **`(c)apture` view opens with `This week's hair audit.`** as the h1 followed by a long instruction paragraph — clinical, but with no Consultant-voice frame for the act of pointing a camera at one's receding hairline, which is a more emotionally loaded moment than the daily mirror; (d) **"Analysis failed. Try again in better light."** is the only error string — fine, but the page has no privacy beat about hair photos (one of the most sensitive surfaces a user uploads).

## 2. The change

Five interventions, all discreet:

1. **Norwood domes — re-treat as a staging row, not a celebration.** Make all 7 domes neutral `--ink-faint` outlines; the "on" stage gets a single gold `◆` mark above it (not a fill). The user reads "I am at stage 2 of 7" without the visual cue saying "stage 7 is best" (which is the opposite of clinical reality).
2. **Score callout — wire to leverage-axis framing if applicable.** When the user's audit leverage axis was `hairDensity`, prepend a single italic Cormorant line above the score card: `Hair density was the leverage point on Day 1. This is the read.` `[COPY DRAFT NEEDED]`. When it wasn't, render the score plain. Server should provide `wasLeverageAxis` boolean in the response; if it doesn't yet, render unconditionally as plain.
3. **Capture view — add a privacy beat and a softer frame.** Above the h1, add a small italic line: `A weekly read, kept between you and the mirror.` `[COPY DRAFT NEEDED]`. After the upload instructions, add the same privacy beat as the audit Scene 3: `We score the photos. We do not publish them. ◆` `[COPY DRAFT NEEDED]`.
4. **Locked view — quietly show the last reading inline.** Currently `renderResult(latest, compact)` is rendered into `#lastAnalysis` when locked. The `compact` argument hides the h1 but the rest is full-bleed — which makes a locked page look like a result page. Tighten: when `compact`, render only the Norwood row + score line, drop the do/do-not blocks. Those are last-week's protocol; they're already in the protocol page.
5. **Result view — drop a leverage-axis nudge if relevant.** When the delta vs first reading is positive AND `wasLeverageAxis === true`, add a small note below the Consultant line: `The axis the audit named is the axis that is moving.` `[COPY DRAFT NEEDED]`. When delta is negative, NO nudge (the existing do-recommendations carry that load — never alarmist).

## 3. Layout specification

### Mobile (360–767px)

**Locked view (within weekly window):**

```
┌─────────────────────────────┐
│ ◆ Hair Tracker               │  topbar
│                              │
│ Next hair audit unlocks      │  h1 (locked, serif italic)
│ soon.                        │
│                              │
│ Next reading in 4 days.      │  --muted (locked existing)
│ Weekly cadence keeps the     │
│ signal clean.                │
│                              │
│ ┌── LAST READING ──────────┐ │  compact card (smaller now)
│ │ NORWOOD                  │ │  uppercase eyebrow --muted
│ │ ☐ ☐ ◆ ☐ ☐ ☐ ☐           │ │  7 outlines, ◆ above active stage
│ │ 1 2 3 4 5 6 7            │ │  stage numbers --muted 10px
│ │                          │ │
│ │ Hairline score    68/100 │ │  single row
│ │ Recession         4 mm   │ │  single row
│ └──────────────────────────┘ │
└─────────────────────────────┘
```

**Capture view (unlocked):**

```
┌─────────────────────────────┐
│ ◆ Hair Tracker               │  topbar
│                              │
│ A weekly read, kept          │  NEW frame, italic serif
│ between you and the mirror.  │  --ink-dim 14px
│                              │
│ This week's hair audit.      │  h1 (locked)
│                              │
│ Stand in flat overhead       │  instruction (locked-ish)
│ light. Camera at the same    │
│ height as your scalp. Take   │
│ two photos: one straight-on, │
│ one from above (crown). The  │
│ honest angle, not the angle. │
│                              │
│ ┌── slot: front/hairline ─┐  │  dashed border --line
│ │   tap to add              │  │
│ └──────────────────────────┘  │
│ ┌── slot: crown/above ────┐  │
│ │   tap to add              │  │
│ └──────────────────────────┘  │
│                              │
│ [ ANALYSE ]                  │  primary CTA, disabled until 2/2
│                              │
│ We score the photos.         │  NEW privacy beat (italic serif)
│ We do not publish them. ◆    │  --ink-faint 0.78rem
└─────────────────────────────┘
```

**Analysis view:** existing centred spinner + `Reading the hairline cone…`. Keep.

**Result view:**

```
┌─────────────────────────────┐
│ Hair density was the         │  NEW leverage-axis line (conditional)
│ leverage point on Day 1.     │  italic serif --gold 15px
│ This is the read.            │
│                              │
│ Your hairline, read          │  h1 (locked)
│ honestly.                    │
│                              │
│ ┌── NORWOOD ──────────────┐ │
│ │ ☐ ☐ ◆ ☐ ☐ ☐ ☐          │ │  re-treated outlines
│ │ 1 2 3 4 5 6 7           │ │
│ │                         │ │
│ │ Hairline 68/100 (+3)    │ │
│ │ Recession 4 mm          │ │
│ └─────────────────────────┘ │
│                              │
│ ┃ The hairline is holding.   │  consultant (server-supplied)
│ ┃ Three more weeks tells us  │
│ ┃ the trend.                 │
│                              │
│ The axis the audit named     │  NEW leverage nudge (conditional)
│ is the axis that is moving.  │  italic serif --ink-dim 14px
│                              │
│ ┌── DO ────────────────────┐ │  existing recommendations
│ │ ◆ Minoxidil 5% nightly   │ │  RCT chip
│ │ ◆ Microneedling weekly   │ │
│ └──────────────────────────┘ │
│                              │
│ ┌── DO NOT ────────────────┐ │  --aesthetic styling
│ │ ⊘ Cap during recovery    │ │
│ └──────────────────────────┘ │
└─────────────────────────────┘
```

### Desktop (≥768px)

- Page max-width 560px (existing). Keep.
- Same vertical stack.

## 4. States required

| State | Behaviour |
|---|---|
| **Loading** | Page renders shell; `LM.api('/api/lookmax/hair/history')` in flight. |
| **Unlocked (first audit or weekly window open)** | Capture view. |
| **Locked (within weekly window, has prior reading)** | Locked view with compact last reading. |
| **Locked (within weekly window, no prior reading — first-time edge)** | Locked view but `Next reading in N days` line only; no card. |
| **Capture, 0 photos** | Slots dashed, CTA disabled. |
| **Capture, 1 photo** | One slot filled (gold solid border, ✓ text), CTA still disabled. |
| **Capture, 2 photos** | Both filled, CTA enabled. |
| **Analysis in flight** | Existing analysis view, 8s minimum dwell (existing). |
| **Analysis success** | Result view. |
| **Analysis failure** | Back to capture; `.err` shows `Analysis failed. Try again in better light.` (existing). |
| **Confidence low / `recessionMm == null`** | `recession` line reads `insufficient data — try better lighting next week` (existing). Keep verbatim — this is the right anti-alarm fallback. |
| **Result, leverage-axis-was-hair && positive delta** | Leverage-axis line above + nudge line below consultant. |
| **Result, leverage-axis-was-hair && negative/flat delta** | Leverage-axis line above only. NO nudge. NO red colour on the delta number. |
| **Result, leverage-axis was NOT hair** | No leverage line, no nudge. |
| **No readings ever (history empty in locked state — should not happen, but)** | Single line `The first reading begins this week.` `[COPY DRAFT NEEDED]`. |

## 5. Motion

- Existing scene swaps: instant `classList.toggle('hidden')`.
- Spinner: existing 1s rotation. Keep.
- No new motion.
- Reduced motion: no impact.

## 6. Touch targets

- `.slot`: 18px padding + content ≈ 50px+. Pass.
- `.btn`: bump min-height 44 (same as other surfaces).
- Norwood domes: NOT tappable; decorative.
- Recommendation list items: NOT tappable.

## 7. Mid-range Android perf note

- Two file inputs, capture varies (front=`user`, crown=`environment`). Cheap.
- No video preview here (file-input only). Good — fewer permission prompts than the mirror.
- Norwood row is 7 small divs; cheap.
- Do NOT add an SVG hairline overlay (out of scope; would also require alignment).

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load | `hair_viewed` | Carries `unlocked`, `daysUntilNext`. |
| Capture front file input change | `hair_photo_added` | `data-kind="front"`. |
| Capture crown file input change | `hair_photo_added` | `data-kind="crown"`. |
| Analyse button click | `hair_submitted` | |
| Analysis API success | `hair_scored` | Carries `norwood`, `hairlineScore`, `confidence`. |
| Analysis API failure | `hair_scoring_failed` | |
| Result view rendered | `hair_result_shown` | |
| Locked view rendered | `hair_locked_view_shown` | |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `◆ Hair Tracker` topbar | Locked. |
| `Next hair audit unlocks soon.` | Locked. |
| `This week's hair audit.` h1 | Locked. |
| `Stand in flat overhead light…` | Locked (server-ish; treat as locked). |
| `The honest angle, not the angle.` | Locked. |
| `Your hairline, read honestly.` | Locked. |
| `Reading the hairline cone…` | Locked. |
| `Analysis failed. Try again in better light.` | Locked. |
| `insufficient data — try better lighting next week` | Locked. |
| Norwood stage labels (numbers 1–7) | Locked. |
| Evidence tier chips | Locked. |
| Recommendation strings | Server-supplied. |
| Capture-view frame line `A weekly read, kept between you and the mirror.` | `[COPY DRAFT NEEDED]`. |
| Capture-view privacy beat | `[COPY DRAFT NEEDED]`. |
| Result-view leverage-axis line | `[COPY DRAFT NEEDED]`. |
| Result-view leverage nudge | `[COPY DRAFT NEEDED]`. |
| First-ever-reading empty line | `[COPY DRAFT NEEDED]`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Capture-view discretion frame + privacy beat.
2. Result-view leverage-axis line + nudge (conditional on `wasLeverageAxis` + positive delta).
3. First-ever-reading empty line.

## 11. Frontend-implementation notes

- **Edit `public/lookmax/hair.html`.**
- Norwood re-treat: change CSS rules:
  - `.nw .dome` from `height: 30px; border: 1px solid var(--line); border-radius: 16px 16px 4px 4px;` → keep height but use `--ink-faint` border, NO fill on `.on`.
  - `.nw.on .dome { background: var(--gold); border-color: var(--gold); }` → DELETE.
  - Add a new element above each dome: `<div class="nw__mark"></div>`. CSS: `height: 14px; color: var(--gold); font-size: 12px; line-height: 1;`. JS: only render `◆` glyph inside the `.on` stage's `.nw__mark`.
  - `.nw.on .n` color stays `--gold` for the number label below.
- Locked compact: in `renderResult(r, compact)`, when `compact === true` return ONLY the Norwood card + score lines; skip the consultant block + do/do-not cards.
- Capture-view frame line: insert before h1 in `#captureView`. Privacy beat: append after `.btn` (and before `.err`).
- Result-view leverage-axis line + nudge: server should return `wasLeverageAxis` (boolean) on `/api/lookmax/hair/photo`; until then, gate both lines on a TODO and render unconditionally as plain. Add `data-leverage-axis="${r.wasLeverageAxis ? 'true' : 'false'}"` on the result root for QA.
- All `data-event` attributes per §8.

End of spec.
