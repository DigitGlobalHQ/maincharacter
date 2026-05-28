# Design — Lookmaxxing Audit Funnel (`/audit`)

> Surface: `public/audit.html` — all 6 scenes (Hook → Quiz → Photos → Analysis → Result).
> Locked tokens only. F3 from `product/brief-NOW-1.md` adds the "keep this reading" affordance on Scene 6.
> Quiz copy is flagged `TODO copy review` at `audit.html:87-90`; this spec does not propose new quiz strings.

---

## 1. Status of current execution

End-to-end functional. Twelve questions, three photos, an 8s-minimum dwell on the reveal so it never feels fake-instant, a polite gold spinner, a single-axis "weakest" callout in violet on the result. Three frictions, in order of damage: (a) **Scene 1 hook is cold** — eyebrow + headline + one-line lede + a button on the left edge — it works but it does not signal what the user is about to commit five minutes to (no count-of-steps, no "what happens after," no trust beat); (b) the **quiz progress bar fills to 100% by the time the open-ended Goals scene loads** because the progress maths uses `qIndex / QUIZ.length` and the open scene is the 12th — the user sees a full bar with one more step, which reads as broken; (c) the **result scene drops the user into a price-ask CTA ("See Your Protocol →") with no way to save the reading they just earned** — F3 is the fix and is the load-bearing addition in this spec.

A fourth softer point: photo scene line "the truth, not the angle" is on-voice but stranded as an h2; could carry a discreet privacy beat ("Your photos are scored, not stored as your identity" or similar) — flagged to copy-consultant-agent, not designed here.

## 2. The change

**Six small interventions, none rewrites of locked copy:**

1. **Scene 1 — add a three-step "what happens" map** below the hook, above the button. Three numbered tiers (`I` `II` `III`) in serif italic, no bar, no fills, just a visual rhythm that says "Twelve answers · Three photos · One reading." Pulls trust forward and pre-commits the user to the format.
2. **Scene 2 — fix the progress maths and add a per-category eyebrow that does not lie.** Progress = `(qIndex + 1) / QUIZ.length` (currently `qIndex / QUIZ.length`). Show "Question N of 12" in the existing `.q__cat` slot to the right of the category name, separated by a `·`. The category eyebrow stays violet (`--aesthetic`) so the user sees the category bouncing across Skin · Hair · Jaw · Body · Lifestyle · Goals.
3. **Scene 3 (Photos) — restructure as a 3-up grid on desktop, 1-up stack on mobile**, and add a per-tile micro-instruction below the existing label/sub. Currently all three uploads stack vertically even on a wide screen, wasting the visual moment. Add a single quiet line at the bottom: "We score the photos. We do not publish them. ◆" — `[COPY DRAFT NEEDED]` — flagged.
4. **Scene 4 (Analysis) — replace the 4-line text ticker with a 6-line ticker keyed to the 8 axes the Vision pass actually scores**, and let the rotating line ride beside the spinner instead of below it on desktop. The current 4 lines do not match the 8 axes the Gemini scorer returns; that's a small lie of presentation. Use the same axes the Mirror uses (`AXIS_LABELS` in `mirror.html:62-66`). No new copy in voice — just rotate axis names: `Skin clarity…` `Jaw geometry…` `Eye area…` `Hair density…` `Posture…` `Facial harmony…`. Last two axes `Expression` and `Body composition` round out to six visible lines plus a final beat: `Composing the reading…`.
5. **Scene 6 (Result) — F3 affordance.** Below the diagnosis, above the existing "See Your Protocol →" button, insert a quiet link-row: `◆ Keep this reading` (gold, underlined, 0.78rem, sans). On tap: copy `${origin}/audit/result/${sessionToken}` to clipboard; if `navigator.share` exists, also offer the share sheet via a second small affordance (`◆ Share`). Toast on success — 2.5s gold-bordered pill at the top, dismisses on tap or auto-fade. Brief NOW-1 §3 step 2 is the source.
6. **Scene 6 — re-hierarchy the score callout.** Today the `score__num` (6rem gold serif) sits at the top, axes below, then diagnosis paragraph, then CTA. Keep that order — but tighten: the **axes block** is the diagnostic; the **diagnosis paragraph** is The Consultant's interpretation; **F3 link-row** sits between diagnosis and CTA as a third movement, not as a sibling to the CTA. The CTA itself stays in its current position.

## 3. Layout specification

### Mobile (360–767px) — single column, scenes are full-viewport

**Scene 1 (Hook)** — currently `padding: 64px 24px`. Keep. Insert below the lede `<p>`, above the `.btn`:

```
┌─────────────────────────────┐
│  THE AESTHETIC AUDIT        │  eyebrow 0.7rem .3em --gold
│                             │
│  The room reads you         │  h1 clamp(2.2rem,8vw,3.4rem) serif italic
│  before you speak.          │
│                             │
│  Five minutes. One          │  p --ink-dim 1.1rem
│  reading. Yours.            │
│                             │
│  I  Twelve answers          │  NEW: 3-tier map, gap 12px, vertical
│  II  Three photos           │  --gold roman numerals, --ink labels
│  III One reading            │  0.85rem sans
│                             │
│  ┌───────────────────────┐  │  .btn (existing) — full-width on mobile
│  │  BEGIN AUDIT          │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**Scene 2 (Quiz)** — progress bar at top (existing), category + Q-counter row, question, options/textarea.

```
┌─────────────────────────────┐
│  ▓▓▓▓▓▓░░░░░░░░░░░          │  progress 2px --gold, width % corrected
│  SKIN · 1 OF 12             │  q__cat --aesthetic, NEW counter inline
│                             │
│  Your morning ritual when   │  q__text 1.6rem serif (locked)
│  you look at the mirror —   │
│  what happens after?        │
│                             │
│  ┌───────────────────────┐  │  .opt — 16px padding, --surface bg
│  │ I cleanse, moisturise │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Water and out the door│  │
│  └───────────────────────┘  │
│  ...                        │
└─────────────────────────────┘
```

**Scene 3 (Photos)** — stack three uploads vertically on mobile (already does); add micro-instruction inside each tile.

```
┌─────────────────────────────┐
│  THE READING                │  eyebrow
│                             │
│  Stand in natural light.    │  h2 1.8rem serif (locked-ish)
│  Camera at eye level.       │
│  Neutral expression. We     │
│  need the truth, not        │
│  the angle.                 │
│                             │
│  ┌───────────────────────┐  │  .upload tile
│  │ Front face            │  │  b 1rem
│  │ Straight on, eyes level│  │  span --ink-faint 0.82rem
│  │            ◆ (gold)    │  │  check
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Side profile          │  │
│  │ Jaw and neck line     │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Full body             │  │
│  │ Posture, head to feet │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │  .btn (disabled until 3/3)
│  │  SUBMIT FOR READING   │  │
│  └───────────────────────┘  │
│                             │
│  We score the photos. We    │  NEW privacy beat
│  do not publish them. ◆     │  --ink-faint 0.78rem serif italic
└─────────────────────────────┘
```

**Scene 4 (Analysis)** — centred spinner + rotating axis line.

```
┌─────────────────────────────┐
│                             │
│           READING           │  eyebrow
│                             │
│            ◯                │  spinner 40×40, --gold
│                             │
│  Mapping skin signal…       │  analysis__line --ink-dim 1.1rem
│                             │  serif italic, ticker
└─────────────────────────────┘
```

**Scene 5/6 (Result)** —

```
┌─────────────────────────────┐
│  YOUR AURA SCORE            │  eyebrow
│                             │
│         67                  │  score__num 6rem serif --gold
│         /100                │  small 1.4rem --ink-faint
│                             │
│  Skin clarity     74        │  axes — each 6px bar
│  ━━━━━━━━━━━━━━━            │
│  Jaw definition   62        │
│  ━━━━━━━━━━                 │
│  Hair density     45 ◀ weak │  --aesthetic weak callout
│  ━━━━━━                     │
│  ...                        │
│                             │
│  Your hair density is       │  diagnosis 1.25rem serif
│  the leverage point. ...    │  multi-paragraph
│                             │
│  ─────────────────────────  │  NEW: divider 1px --line
│  ◆ Keep this reading        │  NEW: F3 link-row 0.78rem --gold
│  ◆ Share                    │  NEW (only if navigator.share)
│  ─────────────────────────  │
│                             │
│  ┌───────────────────────┐  │  existing CTA
│  │  SEE YOUR PROTOCOL →  │  │
│  └───────────────────────┘  │
│                             │
│  Your reading is free.      │  muted, locked
│  No account needed to       │
│  see it.                    │
└─────────────────────────────┘
```

### Desktop (≥1024px) — deltas

- Scene 1: hook left-aligned in 640px column (current `.scene` max-width). Add the 3-tier "what happens" map as a horizontal row at ≥768px — three columns, gap 24px.
- Scene 3: photo uploads in a `grid-template-columns: 1fr 1fr 1fr; gap: 14px;` at ≥768px. Tile aspect 1:1, with the inputs centred. Submit button below the grid, full-width within the 640px column.
- Scene 4: spinner and rotating line side-by-side on a single row at ≥768px.
- Scene 6: F3 row sits as a horizontal flex (`Keep this reading` left, `Share` right) when both affordances exist.

## 4. States required (per scene)

### Scene 1 (Hook)
| State | Behaviour |
|---|---|
| Default | As specced. |
| Loading | Begin button shows after `startAudit` fires; brief 100ms before scene swap. No spinner needed. |
| Error | `startAudit` API failure: existing `alert('Could not start. Try again.')` is too app-y. Replace with inline `.err` row in `--bad` under the button: "We could not begin the audit. Try once more." Re-enable the button. `[COPY DRAFT NEEDED]` |
| Empty | N/A |

### Scene 2 (Quiz)
| State | Behaviour |
|---|---|
| Default | Question 1 of 12. Progress bar 8.3% (1/12). |
| Selected | `.opt.sel` outline `--gold`, bg `rgba(232,184,75,0.06)`. |
| Disabled (open question, empty textarea) | Reveal button greyed at 0.4 opacity. |
| Error | Existing `.err` row shows under the question. |
| Empty (textarea blank on Goals) | Reveal button disabled. |
| Loading (POST `/api/audit/quiz` on submit) | Button text "Sending…", button disabled, 600ms timeout before scene swap. |

### Scene 3 (Photos)
| State | Behaviour |
|---|---|
| Default | Three empty `.upload` tiles, submit disabled. |
| Selected (one filled) | `.upload.done` border solid `--gold`, check ◆ visible at opacity 1. Submit still disabled. |
| Ready (3/3) | Submit enabled, full-opacity gold border. |
| Loading | Submit text "Uploading…", disabled. Existing behaviour. |
| Error | `.err` row "Upload failed. Try again." Existing. |

### Scene 4 (Analysis)
| State | Behaviour |
|---|---|
| Default | Spinner + rotating line, 8s minimum dwell. |
| Error | Existing `'The reading failed. Refresh to try again.'` — degrade to an in-place `.err` row with a "Try again" button instead of asking for refresh. `[COPY DRAFT NEEDED]` for the button label. |

### Scene 6 (Result)
| State | Behaviour |
|---|---|
| Default | Score, axes, diagnosis, F3 row, CTA. |
| F3 link copied | 2.5s toast pill top-centre: `Link copied. The reading is saved. ◆` `[COPY DRAFT NEEDED]`. `--surface` bg, 1px `--gold` border, padding 10px 18px. Disappears on tap. |
| F3 share opened (native) | No toast — system share sheet provides feedback. |
| Empty (no scores in response) | Failure mode: render the existing `analysis__line` failure. No half-broken result page. |

## 5. Motion

- Scene transitions: existing `@keyframes fade` (0.6s, fade + 16px translate). Keep.
- Spinner: existing 1s linear rotation. Keep.
- Axis bars: existing `.axis__fill` 0.8s ease width. Keep.
- F3 toast: 0.18s fade-in, 2.2s hold, 0.3s fade-out. CSS only.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` — disable scene fade-in, disable spinner rotation (replace with a static `◆` glyph), disable axis bar transition, toast holds with no fade.

## 6. Touch targets

- All `.opt` buttons: 16+16+lineheight ≈ 56px tall. Pass.
- `.upload` tiles: 18+18+content ≈ 80px tall. Pass.
- `.btn` primary: 14+14+12 ≈ 42px — bump to `padding: 14px 30px` already; consider `min-height: 44px` to be safe.
- F3 link-row affordances: must be 44×44 minimum — give the `Keep this reading` and `Share` controls each a `padding: 12px 16px; min-height: 44px;` even if the visible text is short.

## 7. Mid-range Android perf note

- Do NOT add a backdrop-filter to the toast (cheap solid bg + border).
- The existing spinner (border-radius 50% + animation) is fine.
- Existing `downscale(file, 1024)` in `audit.html:237-250` already keeps uploads under ~150KB — keep that. Do NOT add EXIF stripping or face-detection on the client (server's job).
- One Google Fonts request (lines 8-10 of `audit.html`) — keep as is. Don't add a third weight.
- The 8-second analysis dwell is intentional; do not animate it heavier than the current spinner.

## 8. KPI event hooks

Frontend-agent attaches `data-event` (these align with NOW-0 vocabulary):

| Element | Event | Notes |
|---|---|---|
| Scene 1 `Begin Audit` button | `audit_started` | Fires on click before API call. |
| Each `.opt` button in Scene 2 | `quiz_option_selected` | `data-q-id`, `data-q-index`, `data-cat` attrs. |
| `Reveal My Reading →` button on Scene 2 last question | `quiz_completed` | Fires before POST. |
| Scene 3 each upload `change` | `photo_added` | `data-kind="front|side|body"`. |
| Scene 3 `Submit for Reading` | `photos_submitted` | |
| Scene 4 visible (scene-analysis active) | `analysis_shown` | Fires on scene swap. |
| Scene 6 visible (scene-result active) | `result_shown` | Carries `data-overall-score` derived after render. |
| F3 `Keep this reading` | `audit_result_kept` | NOW-1 F3 event. `data-method="copy"`. |
| F3 `Share` (if shown) | `audit_result_kept` | `data-method="share"`. |
| Scene 6 `See Your Protocol →` | `paywall_viewed_intent` | Fires before location.href change. |

All events log to the NOW-0 sink keyed by `sessionToken`.

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| Scene 1 eyebrow `THE AESTHETIC AUDIT` | Locked. |
| Scene 1 h1 `The room reads you before you speak.` | Locked. |
| Scene 1 lede `Five minutes. One reading. Yours.` | Locked. |
| Scene 1 button `Begin Audit` | Locked. |
| Quiz strings (12 questions) | Flagged `TODO copy review` at source — not in scope here. |
| Scene 3 h2 truth-not-the-angle | Locked. |
| Scene 6 muted footer `Your reading is free. No account needed to see it.` | Locked. |
| 3-tier map labels (Scene 1) | `[COPY DRAFT NEEDED]` — see §10 |
| Privacy beat (Scene 3) | `[COPY DRAFT NEEDED]` |
| Error replacement strings (Scenes 1, 4) | `[COPY DRAFT NEEDED]` |
| F3 link labels `Keep this reading`, `Share` | `[COPY DRAFT NEEDED]` |
| F3 toast `Link copied. The reading is saved. ◆` | `[COPY DRAFT NEEDED]` (NOW-1 brief has draft) |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Scene 1 "what happens" 3-tier map labels — proposed `Twelve answers / Three photos / One reading` but founder/copy must own.
2. Scene 3 privacy beat — proposed `We score the photos. We do not publish them. ◆` — founder owns whether to use Consultant cadence or stay legalistic.
3. Scene 1 begin-error inline copy (currently `alert()` — bad UX).
4. Scene 4 analysis-failure inline copy + Try-again button label.
5. F3 affordance labels + toast text — NOW-1 brief §3 has draft; founder approves.

## 11. Frontend-implementation notes

- **Edit `public/audit.html` only.** Single-file pattern is the convention.
- Fix progress maths at `audit.html:192` — change `((qIndex) / QUIZ.length)` to `((qIndex + 1) / QUIZ.length)`.
- Inject category counter inline: at `audit.html:194`, change `<div class="q__cat">${q.cat}</div>` to `<div class="q__cat">${q.cat} · ${qIndex + 1} of ${QUIZ.length}</div>`.
- Add the 3-tier map to `#scene-hook` before the `.btn`. New CSS class `.hook-map`, flex column on mobile, flex row on `min-width: 768px`. Use existing `--gold` for numerals.
- Restructure `.uploads` rule for `grid-template-columns: 1fr 1fr 1fr` at `min-width: 768px`.
- F3 affordances — vanilla JS: `navigator.clipboard.writeText(...)` with a try/catch fallback to `document.execCommand('copy')` on older WebView. `navigator.share` feature-test before rendering the Share button.
- Toast — create a single `<div class="audit-toast" role="status" aria-live="polite">` at body-root, populate textContent on action, add `.audit-toast--show` class, remove after 2500ms.
- All `data-event` attributes per §8 — wire to a single delegated listener that pushes to `window.__mc_events = window.__mc_events || []` (NOW-0 will swap this for the real sink later); also dispatch a CustomEvent('mc:event', {detail:{...}}) so the future sink can subscribe non-destructively.
- Use existing axis label dict from `mirror.html:62-66` to keep Scene 4 ticker honest — DO NOT duplicate; lift it into a shared inline constant on this page (the two pages don't share JS today).
- F3 toast respects `prefers-reduced-motion` — fade in/out replaced with instant show/hide.

End of spec.
