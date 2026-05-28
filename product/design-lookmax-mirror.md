# Design — Daily Mirror (`/lookmax/mirror`)

> Surface: `public/lookmax/mirror.html`. The single daily ritual. Capture → analyse → reveal → trend.
> Brief: elevate the moment of capture without making it precious. This is the page the user opens every morning.

---

## 1. Status of current execution

Functional and most of the way there. Live `<video>` preview, file-input fallback, client-side crop to 1024px square, 5s minimum dwell on analysis, score animation 0→target over 2s, 8 axis bars with delta vs yesterday colour-coded, a 14-day trend chart via Chart.js. Frictions: (a) the **capture moment is mechanical** — a square preview with two pill buttons under it; no eyebrow, no posture cue, no breath; the user is meant to stand in light and centre themselves and the page does not set that tone; (b) the **score reveal animates from 0 to N in 2s** which is fine, but **the level + axis bars + Consultant line + trend all appear simultaneously** — there is no rhythm to the reading; (c) the **fire-emoji streak counter** appears here too at `:143` (`r.streak || 0 + ' 🔥'`) — same violation as dashboard; (d) **Chart.js is loaded from cdn.jsdelivr.net via `<script>` tag** which is a third-party request, a render-blocker, and ~80KB on mid-range Android — for a 14-line trend this is overkill.

## 2. The change

Five interventions:

1. **Capture view — set the tone.** Add an italic Cormorant eyebrow above the h1: `Today.` Add a quiet 1-line ritual cue below the `Natural light…` paragraph: `Stand still for a moment. The camera is waiting.` `[COPY DRAFT NEEDED]`. Round the preview corners more visibly (already 14px, push to 18px) and add a 1px inset `--gold-deep` glow when the camera stream is live to signal "active". The two buttons stay as-is.
2. **Analysis view — pace the dwell.** Today the rotating line cycles every 1.6s through 6 lines = ~9.6s before repeating, against a 5s minimum dwell. Keep the rotation but **slow it to 2.2s per line** and **show only as many lines as actual API latency allows**, so the user sees ~3 axis names before the reveal — that feels like work, not a fake-loading parade. Add a single static line above the ticker: `The reading takes a minute. Hold.` `[COPY DRAFT NEEDED]`. The big ◆ glyph at the top of `#analysisView` stays.
3. **Reveal view — stage in three beats.** Currently everything appears at once. Stage it: (beat 1, t=0) score animates 0→N over 2s; (beat 2, t=2s) Mirror Level line + Consultant line fade in over 0.4s; (beat 3, t=2.6s) axis bars fade in stagger 80ms each, then the trend card fades in last. This is the ONLY surface in the product that earns a staged reveal — it is the daily payoff moment.
4. **Replace Chart.js with a hand-rolled `<canvas>` 14-line drawing.** ~30 lines of code; the trend is a polyline + dots. Saves an 80KB CDN dep, a network request, and a render block. Reuse the `drawTrajectory` pattern from `reveal.html:83-95` exactly — it's already in the codebase, vanilla canvas, on-brand.
5. **Remove the fire emoji** at `:143` — same as dashboard. Use `${r.streak || 0}-day streak` or final copy.

## 3. Layout specification

### Mobile (360–767px)

**Capture view (camera live):**

```
┌─────────────────────────────┐
│ ◆ Daily Mirror               │  topbar
│              [12-day][Polished]│ badges
│                              │
│ Today.                       │  NEW eyebrow Cormorant italic
│                              │  0.85rem .12em --gold
│                              │
│ Take today's mirror.         │  h1 (locked, serif italic)
│                              │
│ Natural light. Camera at     │  --muted 14px
│ eye level. The honest angle. │
│ Stand still for a moment.    │  NEW ritual cue --ink-dim 14px
│ The camera is waiting.       │  serif italic
│                              │
│ ┌───────────────────────────┐│
│ │                           ││  <video> preview
│ │       LIVE FEED           ││  aspect 1:1, radius 18px
│ │      (squared 1:1)        ││  inset 1px --gold-deep glow
│ │                           ││  when stream is active
│ │                           ││
│ └───────────────────────────┘│
│                              │
│ [ CAPTURE ] [ USE A PHOTO ]  │  cap-row 10px gap
│                              │
│ (err)                        │
└─────────────────────────────┘
```

**Analysis view:**

```
┌─────────────────────────────┐
│             ◆                │  large glyph, --muted, 3rem
│                              │  no rotation, just present
│                              │
│ The reading takes a minute.  │  NEW static line, serif italic
│ Hold.                        │  --ink-dim 15px
│                              │
│ Mapping skin signal…         │  rotline, --muted serif italic
│                              │  17px, rotates 2.2s
└─────────────────────────────┘
```

**Reveal view (staged):**

```
┌─────────────────────────────┐
│            73                │  score-big 6rem --gold serif
│ Polished — 73/100            │  levelLine --muted 14px (beat 2)
│                              │
│ ┃ Your jaw definition moved  │  consultant block, --gold left
│ ┃ +3 from yesterday.         │  border, serif italic (beat 2)
│ ┃ The work is showing.       │
│                              │
│ Skin clarity        72  ▲ 1  │  axes — beat 3 stagger
│ ━━━━━━━━━━━━━━━              │
│ Jaw definition      68  ▲ 3  │
│ ━━━━━━━━━━━━━━                │
│ Eye area            65  –    │
│ ━━━━━━━━━━━                  │
│ Hair density        45  ▼ 1  │
│ ━━━━━━                       │
│ ... (8 axes total)           │
│                              │
│ ┌── LAST 14 DAYS ──────────┐ │  trend card (beat 3 final)
│ │  /\        /\            │ │  canvas 320×120
│ │ /  \  /\  /  \___        │ │  --gold polyline + dots
│ │     \/  \/                │ │
│ └──────────────────────────┘ │
│                              │
│ [ OPEN TODAY'S PROTOCOL → ]  │  ghost button
└─────────────────────────────┘
```

### Desktop (≥768px)

- Page max-width 560px (existing). Keep.
- Capture: same vertical stack; preview caps at 560×560.
- Reveal: same vertical stack; trend canvas full-width within 560px.

## 4. States required

| State | Behaviour |
|---|---|
| **Camera permission prompted** | Browser handles. Preview empty grey until permitted. |
| **Camera permission denied / unavailable** | Existing fallback: hide `<video>`, change button label to `Open camera` which triggers file input (`mirror.html:84-90`). Keep. Add a small `.hint` line above the buttons: `Camera not available — use a photo from your library instead.` `[COPY DRAFT NEEDED]`. |
| **Capture in progress (post-tap)** | Buttons disabled; preview stays; brief 200ms before scene swap. |
| **Analysis in flight** | Analysis view as specced. Minimum 5s dwell (existing). |
| **Analysis success** | Reveal view, staged per §2.3. |
| **Analysis failure** | Existing: back to capture view + `.err` shows server message or `Scoring failed. Try again.` (`:125`). Keep. |
| **Reveal — score 0 or missing** | Server contract should guarantee a score; if missing, show the failure state instead of a hollow reveal. |
| **Reveal — no delta data (first mirror)** | Axis delta column reads `–` for all 8 axes. Consultant line is a "baseline sealed" variant — `[COPY DRAFT NEEDED]`. |
| **Reveal — trend empty (Day 1)** | Trend card shows a single dot at today's score with caption `Your line begins.` `[COPY DRAFT NEEDED]`. |
| **Already mirrored today (route entry)** | If `requireSession` resolves and dashboard shows `takenToday`, the mirror page should skip capture and go straight to today's reveal — for now spec the simpler path: render capture view but show a quiet banner above: `Today's mirror is held. Take another to overwrite.` `[COPY DRAFT NEEDED]`. |

## 5. Motion

- **Capture preview gold glow:** static `box-shadow: inset 0 0 0 1px var(--gold-deep);` when stream active; no animation. The implication of a live camera is the motion.
- **Score count-up:** existing 2s rAF tick. Keep.
- **Beat 2 fade-in:** opacity 0→1 over 0.4s, no transform. CSS class `.reveal-beat-2.show { opacity: 1 }`.
- **Beat 3 axis stagger:** each `.axis` element 80ms apart, 0.3s fade-in.
- **Trend canvas:** draws after beat 3 — line draws progressively over 0.6s using `setLineDash` animation. Cheap to implement; one short anim only.
- **Rotline:** opacity-only swap every 2.2s (was 1.6s).
- **Reduced motion:** disable count-up (show final number immediately); disable all beat staggers (all appear at once); disable trend line draw (line appears static); rotline still rotates (text content only — keep).

## 6. Touch targets

- Capture button: 44+ tall. Pass.
- Use a photo button: same. Pass.
- Open today's protocol →: full-width btn--ghost. Pass.

## 7. Mid-range Android perf note

- **Drop Chart.js.** Replace with vanilla canvas — saves 80KB and one render-block. Use the `drawTrajectory` pattern from `reveal.html:83-95`.
- Live `<video>` is heavy — keep `facingMode: 'user'`, do NOT request `{ ideal: 4096 }` resolutions; the existing 1024 cap is correct.
- The capture canvas drawImage at 1024×1024 + toBlob jpeg quality 0.85 is the right perf trade. Keep.
- Do NOT animate the live preview's border with `box-shadow` keyframes — static inset shadow only.
- Beat staggers use 80ms — small enough that paint coalesces on Android 9 WebView.
- Do NOT add a face-detection overlay.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load | `mirror_viewed` | |
| Camera stream successfully started | `mirror_camera_active` | |
| Camera permission denied / fallback | `mirror_camera_unavailable` | |
| Capture button click | `mirror_capture_tapped` | |
| Use a photo button click | `mirror_file_path_chosen` | |
| Mirror API success | `mirror_scored` | Carries `score`, `mirrorLevel`, `streak`. |
| Mirror API failure | `mirror_scoring_failed` | Carries `error`. |
| Reveal fully rendered (beat 3 complete) | `mirror_reveal_complete` | |
| Open today's protocol button | `protocol_entered_from_mirror` | |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `Take today's mirror.` h1 | Locked. |
| `Natural light. Camera at eye level. The honest angle.` | Locked. |
| `◆ Daily Mirror` topbar | Locked. |
| `Mapping skin signal…` etc rotline pool | Locked (axis names). |
| `Open today's protocol →` button | Locked. |
| New eyebrow `Today.` | `[COPY DRAFT NEEDED]`. |
| New ritual cue `Stand still for a moment. The camera is waiting.` | `[COPY DRAFT NEEDED]`. |
| New analysis static line `The reading takes a minute. Hold.` | `[COPY DRAFT NEEDED]`. |
| Streak label (replacing 🔥) | `[COPY DRAFT NEEDED]`. |
| Camera-unavailable hint | `[COPY DRAFT NEEDED]`. |
| Baseline (first-mirror) Consultant line | `[COPY DRAFT NEEDED]`. |
| Day-1 trend caption `Your line begins.` | `[COPY DRAFT NEEDED]`. |
| Already-mirrored-today banner | `[COPY DRAFT NEEDED]`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Capture eyebrow + ritual cue — two short Consultant-voice lines.
2. Analysis static frame line.
3. Streak label replacement (consistent across mirror + dashboard).
4. Camera-unavailable hint.
5. First-mirror baseline Consultant line.
6. Day-1 trend caption.
7. Already-mirrored-today banner.

## 11. Frontend-implementation notes

- **Edit `public/lookmax/mirror.html` and add a CSS rule or two to `app.css` if needed.**
- Remove the Chart.js `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>` at `:59`. Rewrite `drawTrend(trend)` to use vanilla canvas — copy pattern from `reveal.html:83-95` and extend with: per-point dots (3px filled gold circles), y-axis 0-100 grid (two dashed lines at 50 and 75 in `--line`), x-axis date tick labels (`--muted` 10px Sora). Total ~40 lines.
- Capture preview live-stream indicator: add inline style `style="box-shadow: inset 0 0 0 1px var(--gold-deep);"` when `stream` is non-null; clear it on stream stop.
- Rotline timing: change `setInterval(... , 1600)` at `:135` to `2200`.
- Beat staging: refactor `reveal(r)` to use a sequence of `setTimeout` calls or, preferably, a chained `requestAnimationFrame` with elapsed-time gates. Wrap each beat group in an element with class `reveal-beat-1 / -2 / -3` and toggle a `.show` class to fade-in (opacity 0 → 1 over 0.4s via CSS transition).
- Streak label: change `(r.streak || 0) + ' 🔥'` at `:143` to `(r.streak || 0) + '-day streak'` or final copy.
- All `data-event` attributes per §8.
- Reduced-motion guards in CSS for the new transitions: `@media (prefers-reduced-motion: reduce) { .reveal-beat-1, .reveal-beat-2, .reveal-beat-3 { transition: none; opacity: 1 !important; } }`.

End of spec.
