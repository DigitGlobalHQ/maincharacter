# Design — Weekly Reveal (`/lookmax/reveal`)

> Surface: `public/lookmax/reveal.html`. Weekly canvas preview + (per NOW-2) Day-30 side-by-side reveal.
> The 8-axis trajectory canvas already exists at `:83-95` — spec the framing around it and the NOW-2 Day-30 side-by-side that lives next to it.

---

## 1. Status of current execution

Half-built but on the right track. Locked state shows a 7-dot week strip + "Take more mirrors this week" line, unlocks at 4 of 7. Unlocked state renders a 9:16 stage that crossfades the week's selfies every 1.2s with a Cormorant italic caption overlaid; a `<canvas>` trajectory at the bottom of the stage draws a gold polyline of the week's scores. Four share buttons for Instagram / TikTok / WhatsApp / generic. A footer disclaimer that the full stitched MP4 awaits ffmpeg. Frictions: (a) the **stage stacks a polyline on top of crossfading photos with no separation** — the line is drawn into the same canvas plane, overlapping the user's face, which looks like a chart bug not a feature; (b) the **caption is single static text** — "Week N. The mirror has been honest. ◆ MainCharacter" — when it could carry a per-week Consultant beat tied to the user's actual delta; (c) the **share buttons are 4 in a 2×2 grid with platform names but no preview of what's being shared** — for a dignified product, the user should see the artefact before they push it to Instagram (this is the highest-stakes brand surface); (d) **NO Day-30 side-by-side mode exists yet** — NOW-2 §3 step 4 requires it, and this page is the natural home (it already owns the trajectory canvas).

## 2. The change

Five interventions:

1. **Separate the trajectory from the photo stage.** Move the trajectory canvas OUT of the absolute-positioned overlay and into its own card BELOW the stage, sized to 9:1 (full-width × ~60px tall). The stage is the photo. The card is the line. They speak together but do not collide.
2. **Caption gets per-week framing.** The static caption stays as a base but is supplemented by a single Consultant line below the stage, tied to delta: e.g. when the week's overall delta is `+N`, "The line is up. Week N held." `[COPY DRAFT NEEDED]`. When flat/down, neutral framing per NOW-2 §3 step 4b rules — never a red minus, never an apology. The Consultant line is server-supplied like the mirror's `consultantLine`.
3. **Share buttons — preview the artefact first.** Insert a single line above the share grid: `This is what shares — your week as a quiet line.` `[COPY DRAFT NEEDED]`. Reduce the 4-button grid to a 2-row treatment: row 1 primary `Share` (uses `navigator.share` if available, else generic link), row 2 a small text-only row of `instagram · tiktok · whatsapp` mini-links. The platform-specific shares are recovery, not primary.
4. **NOW-2 Day-30 side-by-side mode — new view.** When the user lands here via the Day-30 Re-Audit "View your second reading" entry (route param `?mode=day30`), render an alternate view: a horizontal pair (Day 1 photo · Day 30 photo) stacked vertically on mobile, side-by-side on desktop ≥640px; below, the 8-axis paired-bar list (baseline → today + signed delta); below that, the trajectory canvas reused as a single Day 1 → Day 30 line; the Consultant framing per NOW-2 down-delta rules (§3 step 4a/4b); the Mirror Level reached + the close line per NOW-2 §3 step 5.
5. **Stub note copy — keep, but soften.** Existing `The reveal is a preview. The full video — stitched, scored, with the soundtrack — arrives once the infrastructure lands. Soon. ◆` is honest and on-brand. Keep verbatim.

## 3. Layout specification

### Mobile (360–767px)

**Locked view (forming):**

```
┌─────────────────────────────┐
│ ◆ Weekly Reveal              │  topbar
│                              │
│ Your reveal is forming.      │  h1 (locked, serif italic)
│ Take more mirrors this week. │  --muted (locked)
│ Your reveal unlocks at 4     │
│ of 7.                        │
│                              │
│   ● ● ● ○ ○ ○ ○              │  weekstrip 7 dots
└─────────────────────────────┘
```

**Unlocked / weekly preview:**

```
┌─────────────────────────────┐
│ ◆ Weekly Reveal              │  topbar
│                              │
│ It airs Friday at 8pm.       │  preview lede --muted (locked)
│ Here is the preview.         │
│                              │
│ ┌─────────────────────────┐  │  STAGE — 9:16 aspect
│ │                         │  │  crossfading photos
│ │                         │  │  with caption overlay
│ │      [user photo        │  │
│ │       crossfade]        │  │
│ │                         │  │
│ │  Week N. The mirror has │  │  caption serif italic
│ │  been honest. ◆         │  │  bottom 14px text-shadow
│ │                         │  │
│ └─────────────────────────┘  │
│                              │
│ ┌── TRAJECTORY ──────────┐   │  NEW: separate card
│ │  /\        /\           │   │  9:1 aspect, --gold polyline
│ │ /  \  /\  /  \___       │   │  no photos, only the line
│ └────────────────────────┘    │
│                              │
│ The line is up. Week N       │  NEW: per-week Consultant beat
│ held. ◆                      │  serif italic 16px --ink
│                              │
│ This is what shares — your   │  NEW: share-frame line
│ week as a quiet line.        │  --muted serif italic 14px
│                              │
│ ┌──────────────────────────┐ │  primary Share CTA
│ │  SHARE ◆                 │ │  solid gold, navigator.share or
│ └──────────────────────────┘ │  generic link
│                              │
│ instagram · tiktok · whatsapp│  --gold link row, small
│                              │
│ The reveal is a preview.     │  stub note (locked)
│ The full video — stitched,   │
│ scored, with the soundtrack  │
│ — arrives once the           │
│ infrastructure lands. Soon.  │
│ ◆                            │
└─────────────────────────────┘
```

**Day-30 side-by-side mode (`?mode=day30`):**

```
┌─────────────────────────────┐
│ ◆ The Second Reading         │  NEW topbar variant
│                              │
│ Thirty days, beside Day 1.   │  h1 italic serif
│                              │
│ ┌─────────────┐              │  Day 1 photo, 1:1
│ │             │              │  caption "Day 1 — 24 May"
│ │  Day 1      │              │
│ │  (baseline) │              │
│ └─────────────┘              │
│ ┌─────────────┐              │  Day 30 photo, 1:1
│ │             │              │  caption "Day 30 — today"
│ │  Day 30     │              │
│ │  (today)    │              │
│ └─────────────┘              │
│                              │
│ 58  →  64  (+6)              │  overall score, large serif
│                              │  --ink for delta (never red)
│                              │
│ Skin clarity     54→60 (+6) │  axes paired bars
│ ━━━━━━━━━━━━━━━              │  baseline grey, today gold
│ ━━━━━━━━━━━━                 │
│ Jaw definition   62→66 (+4) │
│ ...                          │
│                              │
│ ┌── TRAJECTORY ──────────┐   │  Day 1 → Day 30 line
│ │ baseline ●─────────● today│   │  two-point gold line + dots
│ └────────────────────────┘    │
│                              │
│ ┃ Your jaw definition was    │  consultant (server-supplied)
│ ┃ the leverage point on      │  per NOW-2 §3 step 4a
│ ┃ Day 1. It has moved +4...  │
│                              │
│ You entered as Raw.          │  close line per NOW-2 §3 step 5
│ You are reading Polished.    │
│ Month two is where the line  │  italic serif --ink-dim 15px
│ gets harder to argue with.   │
│ ◆ MainCharacter              │
└─────────────────────────────┘
```

### Desktop (≥768px)

- Page max-width 560px (existing). Keep.
- Weekly preview: same vertical stack.
- Day-30 mode at ≥640px: Day 1 and Day 30 photos render side-by-side in a `grid-template-columns: 1fr 1fr; gap: 12px` row (was vertical on mobile).
- Day-30 axes list stays single-column.

## 4. States required

| State | Behaviour |
|---|---|
| **Loading** | Page shell renders; `LM.api('/api/lookmax/reveal/preview')` in flight. |
| **Locked (count <4)** | Existing locked view. |
| **Unlocked, no photos** | Should not happen; if it does, render locked view as fallback. |
| **Unlocked, photos** | Stage + trajectory card + Consultant beat + share controls + stub note. |
| **Share API success (navigator.share)** | System share sheet; no toast needed. |
| **Share fallback (no navigator.share)** | Generic `Share` button copies link to clipboard with toast `Link copied. Share where it counts. ◆` `[COPY DRAFT NEEDED]`. |
| **Day-30 mode, baseline photo missing (R2 not provisioned, per NOW-2 §6.3)** | Render Day-30 photo only + "Day 1 photo not held" caption `[COPY DRAFT NEEDED]`; trajectory + axes still render (numbers survive). |
| **Day-30 mode, baseline numbers missing (durable snapshot failed)** | Show single line `The first reading was not held. The second reading stands on its own.` `[COPY DRAFT NEEDED]`. NO degradation that pretends a delta exists. |
| **Day-30 down-delta** | Per NOW-2 §3 step 4b: never a red minus, axes that fell render in `--ink` not `--bad`, trajectory line in muted gold, Consultant copy frames as calibration. |

## 5. Motion

- Photo crossfade in weekly preview: existing 1.2s interval. Slow to 1.6s — currently too rushed to absorb each photo. Keep cross-fade duration at 0.4s.
- Trajectory line: in the separate card, draw progressively over 0.8s using `setLineDash` (matches the mirror trend treatment).
- Day-30 mode: stage in two beats — beat 1 photos fade in (or single-photo render); beat 2 axes + trajectory + consultant fade in 0.4s.
- Reduced motion: photo crossfade becomes a static single photo (the most recent); trajectory draws static; beats become instant.

## 6. Touch targets

- Share primary CTA: full-width 13+13 padding ≈ 40px → bump to `min-height: 44px`.
- Platform mini-links: text-only — give each `padding: 12px 14px; min-height: 44px; display: inline-block;`.
- Stage is NOT tappable (no interaction); preview only.

## 7. Mid-range Android perf note

- Photo crossfade: each photo is `position: absolute; inset: 0; object-fit: cover` with opacity transition — cheap.
- Trajectory canvas: ~20 lines of canvas2d, drawn once. Cheap.
- Day-30 mode: two photos at most + one canvas. Cheap.
- DO NOT add video element. DO NOT add WebGL. DO NOT add Lottie.
- Image preloading: when stage opens, preload all `preview.photoUrls` so the crossfade does not flash blank — `new Image(); img.src = url;` for each.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load | `reveal_viewed` | Carries `mode="weekly|day30"`, `unlocked`, `count`. |
| Locked view rendered | `reveal_locked_shown` | |
| Weekly preview rendered | `reveal_weekly_shown` | Carries `weekNumber`. |
| Day-30 mode rendered | `reveal_day30_shown` | Carries `overallDelta`, `deltaSign` (per NOW-2 §4). |
| Share primary CTA click | `reveal_share_attempted` | `data-method="native|copy"`. |
| Platform mini-link click | `reveal_share_attempted` | `data-method="instagram|tiktok|whatsapp"`. |
| Share success (navigator.share resolved) | `reveal_share_completed` | |
| Day-30 mode, scroll past close line | `reveal_day30_consumed` | Counter-metric companion (full read). |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `◆ Weekly Reveal` topbar | Locked. |
| `Your reveal is forming.` h1 | Locked. |
| `Take more mirrors this week. Your reveal unlocks at 4 of 7.` | Locked. |
| `It airs Friday at 8pm. Here is the preview.` | Locked. |
| `Week N. The mirror has been honest. ◆ MainCharacter` caption | Locked. |
| `The reveal is a preview…` stub note | Locked. |
| Per-week Consultant beat under trajectory | `[COPY DRAFT NEEDED]` — server-supplied; copy-consultant drafts the template variants (up/flat/down). |
| Share-frame line | `[COPY DRAFT NEEDED]`. |
| Share clipboard toast | `[COPY DRAFT NEEDED]`. |
| Day-30 mode topbar `◆ The Second Reading` | `[COPY DRAFT NEEDED]`. |
| Day-30 mode h1 `Thirty days, beside Day 1.` | `[COPY DRAFT NEEDED]`. |
| Day-30 mode photo captions `Day 1 — DD MMM` / `Day 30 — today` | `[COPY DRAFT NEEDED]`. |
| Day-30 mode Consultant up/flat/down lines | `[COPY DRAFT NEEDED]` — NOW-2 §3 step 4 has drafts. |
| Day-30 mode close line `You entered as Raw. ...` | `[COPY DRAFT NEEDED]` — NOW-2 §3 step 5 has draft. |
| Day-30 mode baseline-missing fallbacks | `[COPY DRAFT NEEDED]`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Per-week Consultant beat template variants (up/flat/down) for weekly preview.
2. Share-frame line + clipboard toast.
3. Day-30 mode: topbar, h1, photo captions, three Consultant variants (up/flat/down per NOW-2 §3.4), close line per NOW-2 §3.5, baseline-missing fallbacks.

## 11. Frontend-implementation notes

- **Edit `public/lookmax/reveal.html`.**
- Separate the trajectory: remove the `<canvas id="traj">` from inside `.stage` (currently `position: absolute; bottom; left; right`). Move to a new `<div class="card">` below the stage with `<canvas id="traj" height="80"></canvas>`. CSS: card padding 18px; canvas full-width.
- Per-week Consultant beat: server `preview.consultantLine` (new field) — render in a `.consultant`-styled block between trajectory card and share controls. Until backend ships the field, gate render on its presence.
- Share row restructure: change `.shares { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }` to two separate elements — primary `.btn.btn--solid` full-width Share button + a `<div class="reveal-platforms">` containing three `<a class="link">` items separated by a `·` glyph.
- Share clipboard fallback: when `!navigator.share`, the Share button copies the audit URL with toast (same toast pattern as audit funnel §5).
- Day-30 mode: read `URLSearchParams(location.search).get('mode')`. If `mode === 'day30'`, branch to a new `showDay30()` renderer instead of `showReveal()`. New endpoint `LM.api('/api/lookmax/reaudit/result')` returns `{ baselinePhotoUrl, day30PhotoUrl, baselineScores, day30Scores, axisDeltas, overallDelta, deltaSign, leverageAxis, mirrorLevel, consultantLine, closeLine }`. Render per layout above. Gate the photo half on `baselinePhotoUrl` presence (R2 dependency per NOW-2 §6.3).
- Down-delta rendering: axes that fell get class `.axis--neutral` (NOT `.axis--down`) with `color: var(--ink); .delta { color: var(--ink-dim); }` — never `--bad`. Trajectory line uses `--gold-deep` (muted) when overall delta is negative, else `--gold`.
- Photo preload: at `showReveal` start, run `urls.forEach(u => { const i = new Image(); i.src = u; })`.
- Crossfade interval: change `setInterval(..., 1200)` to `1600`.
- All `data-event` attributes per §8.

End of spec.
