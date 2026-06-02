# Lookmaxing — 8-Surface Design Spec

> Source spec: `briefs/stage-1-audit-spec.md` (authoritative; not re-litigated here)
> Token stylesheet: `product/design-lookmaxing-tokens.css`
> Visual identity: BLACK & SILVER, light-point motif from the M-monogram logo (`public/maincharacter-logo.jpeg`)
> Scope: every surface lives under `<body class="lookmaxing">` so existing `/lookmax/*` gold pages are untouched.

---

## Global rules applied to every surface

- **One primary CTA per screen.** No competing buttons.
- **One light-point per screen, max.** Either as the glow on the primary CTA, or as a single status dot on a key control — never both.
- **Mobile-first.** Designed at 360×640 first; the hero + primary CTA always fit above the fold on landing.
- **Typography rhythm:** Cormorant Garamond italic for emotional weight headlines; Sora 300 for body; JetBrains Mono for scores, ticks, metric labels; wide-tracked uppercase Sora for eyebrows.
- **Restraint test:** every element justified by clarity OR feeling. If it's neither, cut.
- **Iconography:** SVG inlined only where a button needs an affordance arrow or a check; no icon libraries.
- **Spacing:** generous vertical rhythm at `--mc-sp-7` between sections on desktop, `--mc-sp-6` on mobile.
- **Accessibility:** silver-on-black contrast tested — primary text uses `--mc-silver-bright` (#e8e8e8 on #000 ≈ 14.5:1, AAA); secondary uses `--mc-silver-mid` (#c0c0c0 on #000 ≈ 11.3:1, AAA); never drop below `--mc-silver-dim` (#8a8a8a ≈ 5.9:1, AA) for any user-readable text. Focus rings are `--mc-light-point` (#ffffff) at 2px offset 3px — never silver-on-silver.
- **Reduced motion:** all transitions collapse to 0.001ms; the breathing light-point glow disables.
- **Tap targets:** all interactive elements ≥ 44×44px (camera button 56×56 per spec §10).
- **KPI hooks:** every interactive element carries a `data-event` attribute matching spec §8.

---

## Surface 1 — `/lookmaxing` — Landing

### Goal
Cold visitor → "Get Your Aura Reading" primary CTA tap, ≤ 3 seconds to comprehend the promise.

### Reference study
**Apple AirPods Pro page** — the centred hero with a single luminous product against pure black, with one large headline and one CTA. Borrowing: the *centred composition discipline* and the *one-thing-on-the-fold* rule. Not copying any specific element.

### Desktop (≥1024) layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER                                  ──── lookmax│  ← nav, 72px tall, hairline bottom
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│              [eyebrow]  LOOKMAXING · STAGE 01                  │
│                                                                │
│         The face is the first thing read.                      │  ← Cormorant italic, 3.5rem, silver-bright
│         The first thing scored.                                │  ← Cormorant italic, 3.5rem
│                                                                │
│         [COPY: subhead, two lines, Sora 300, silver-mid]       │
│                                                                │
│              ┌──────────────────────────────┐                  │
│              │  GET YOUR AURA READING  →    │                  │  ← mc-btn-primary + mc-light-point-glow
│              └──────────────────────────────┘                  │
│                                                                │
│              [eyebrow]  3-MINUTE READ · FREE                   │
│                                                                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│       ┌──────────────────────────────────────────┐             │
│       │                                          │             │
│       │   <!-- REPLACE WITH YOUTUBE EMBED        │             │
│       │        autoplay-muted, loop, minimal -->│             │
│       │                                          │             │
│       │      Empty state: "Video loading…"       │             │
│       │      JetBrains Mono small-caps, silver   │             │
│       │                                          │             │
│       └──────────────────────────────────────────┘             │  ← 16:9, silver hairline, near-black inside
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              [eyebrow]  HOW IT WORKS                           │
│                                                                │
│   01 / Calibrate     02 / Capture       03 / Reveal            │
│   ─────────          ─────────          ─────────              │
│   [COPY: 1 line]     [COPY: 1 line]     [COPY: 1 line]         │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              [eyebrow]  THE PILLARS                            │
│                                                                │
│   ┌──────────────────────┐    ┌──────────────────────┐         │
│   │  LOOKMAXING          │    │  THE ORATOR          │         │
│   │  Available now       │    │  Coming soon         │         │
│   │  ─────               │    │  ─────               │         │
│   │  [COPY]              │    │  The way you sound   │         │
│   │                      │    │  when it matters.    │         │
│   │  [Read the audit →]  │    │  [Join the waitlist] │         │
│   └──────────────────────┘    └──────────────────────┘         │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  ◇ MAINCHARACTER       The Sage — in development                │  ← footer, silver-faint
│                        © 2026 · Privacy · Terms                 │
└────────────────────────────────────────────────────────────────┘
```

### Mobile (360) layout

```
┌──────────────────────────────┐
│ ◇ MAINCHARACTER              │  ← 56px nav
├──────────────────────────────┤
│                              │
│  [eyebrow] STAGE 01          │
│                              │
│  The face is the             │  ← 2.25rem Cormorant italic
│  first thing read.           │
│                              │
│  [COPY: subhead, 1-2 lines]  │
│                              │
│  ┌────────────────────────┐  │
│  │ GET YOUR AURA READING →│  │  ← full-width btn, light-point glow
│  └────────────────────────┘  │
│                              │
│  [eyebrow] 3-MIN · FREE      │
│                              │
│  ─── (above-fold ends ~624) ──
│                              │
│  [video container, 16:9]     │
│  [How it works — stacked]    │
│  [Pillars — stacked]         │
│  [footer]                    │
└──────────────────────────────┘
```

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Top nav | `.mc-eyebrow`, `--mc-line` bottom | default only |
| Hero headline | `.mc-serif.mc-serif--italic`, `--mc-fs-display` (desktop) / `--mc-fs-h1` (mobile) | default |
| Hero CTA | `.mc-btn-primary` + `.mc-light-point-glow` | default · hover (border brightens, glow intensifies) · focus-visible (white outline ring) · active (1px down translate) · disabled (45% opacity, no glow) |
| Video container | `border: 1px solid var(--mc-line)`, `background: var(--mc-near-black)`, `aspect-ratio: 16/9`, `border-radius: var(--mc-r-3)` | empty (centred mono "Video loading…" in `--mc-silver-dim`) · loaded (YouTube iframe) · error (mono "Video unavailable") |
| How-it-works step | `.mc-eyebrow` numeral + `--mc-fs-h3` Sora label + `--mc-fs-small` body, separated by `.mc-hairline` (vertical on desktop, horizontal on mobile) | default only |
| Pillar card | `.mc-card`, internal eyebrow + headline + body + ghost CTA | available (full opacity) · coming-soon (body at `--mc-silver-dim`, CTA `.mc-btn-ghost` opens waitlist modal) |
| Waitlist modal | `.mc-card` centred, max-width 420px, `--mc-shadow-elevated`, single email input with `.mc-btn-primary` | closed · open · submitting (CTA `aria-busy="true"`) · submitted (input replaced with one Cormorant line: `[COPY: confirmation]`) · error (`--mc-error` text, input unchanged) |

### Motion
- Hero text fades in on load: `opacity 0 → 1`, `translateY(8px) → 0`, `--mc-dur-slow` `--mc-ease-out`, staggered 80ms between eyebrow → headline → subhead → CTA.
- CTA glow breathes via `.mc-light-point-glow` (3.2s loop) — disabled under `prefers-reduced-motion`.
- Video container fades from empty placeholder to embed over `--mc-dur-base`.
- Pillar cards lift 4px on hover (`--mc-dur-base`), border colour to `--mc-line-strong`.

### The light-point on this surface
**Primary CTA glow only.** The breathing `.mc-light-point-glow` is the single light moment on the page. It mirrors the logo's apex dot.

### KPI hooks
- Hero CTA → `data-event="lookmaxing_cta_clicked"` `data-event-meta='{"position":"hero"}'`
- Page mount → `lookmaxing_landing_viewed` (trackOnce, fired by frontend on `DOMContentLoaded`)
- Video play / 50% / 90% → `lookmaxing_video_played`, `lookmaxing_video_watched_50`, `lookmaxing_video_watched_90` (YouTube IFrame API listener)
- Pillar Lookmaxing CTA → `data-event="lookmaxing_cta_clicked"` `data-event-meta='{"position":"pillar"}'`
- Pillar Orator CTA → `data-event="orator_waitlist_joined"` `data-event-meta='{"step":"modal_open"}'`
- Waitlist submit → `data-event="orator_waitlist_joined"` `data-event-meta='{"step":"submit"}'`

### Mobile-specific
- Nav collapses to monogram only (right side cleared).
- Hero CTA is full-width with `padding-inline: var(--mc-sp-4)`.
- "How it works" stacks vertically; horizontal hairline between steps.
- Pillars stack vertically with `--mc-sp-5` gap.
- Footer text wraps to 3 lines; copyright bottom-aligned.

### Frontend-implementation notes
- Reuse the grain overlay from `landing.html` only at 2% opacity (vs 3.5% on landing) — the black field is more sensitive to noise. If frontend-agent finds the grain interferes with the video container, drop it entirely on this surface.
- The waitlist modal pattern can be copied structurally from existing modal patterns in `public/lookmax/login.html`; restyle to lookmaxing tokens.
- Video YouTube embed: keep the `<!-- REPLACE WITH YOUTUBE EMBED — autoplay-muted, loop, minimal controls -->` marker exactly as spec'd.

---

## Surface 2 — `/lookmaxing/start` — Fork

### Goal
Give the visitor a frictionless guest path, but make sign-in visible enough that committed users self-select.

### Reference study
**Linear's auth screen** — restrained two-option fork, equal weight, with a quiet line of reassurance below. Borrowing: the *equal-weight option pair on a generous vertical centre*. Not copying Linear's chrome.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│              [eyebrow] BEFORE YOU BEGIN                        │
│                                                                │
│         How would you like to start?                           │  ← Cormorant italic, 2.25rem
│                                                                │
│         [COPY: 1-line sub explaining equal weight]             │
│                                                                │
│                                                                │
│   ┌──────────────────────────┐    ┌──────────────────────────┐ │
│   │                          │    │                          │ │
│   │  CONTINUE AS GUEST       │    │  SIGN IN                 │ │
│   │  ───                     │    │  ───                     │ │
│   │  [COPY: 1-line context]  │    │  [COPY: 1-line context]  │ │
│   │                          │    │                          │ │
│   │  [Begin →]               │    │  [Google] [Email]        │ │
│   │                          │    │                          │ │
│   └──────────────────────────┘    └──────────────────────────┘ │
│                                                                │
│       [eyebrow] YOUR PROGRESS SAVES EITHER WAY                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

```
┌──────────────────────────────┐
│ ◇ MAINCHARACTER              │
├──────────────────────────────┤
│                              │
│  [eyebrow] BEFORE YOU BEGIN  │
│                              │
│  How would you like          │
│  to start?                   │
│                              │
│  [COPY: 1-line sub]          │
│                              │
│  ┌────────────────────────┐  │
│  │ CONTINUE AS GUEST      │  │  ← .mc-card with internal .mc-btn-primary
│  │ [COPY context]         │  │
│  │ [Begin →]              │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ SIGN IN                │  │
│  │ [COPY context]         │  │
│  │ [Google]               │  │  ← .mc-btn-ghost (full-width)
│  │ [Email]                │  │  ← .mc-btn-ghost
│  └────────────────────────┘  │
│                              │
│  [eyebrow] PROGRESS SAVES    │
│                              │
└──────────────────────────────┘
```

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Fork card | `.mc-card`, equal width on desktop (1fr 1fr grid, gap `--mc-sp-5`) | default · hover (border to `--mc-line-strong`) |
| Begin (guest) | `.mc-btn-primary` | default · hover · loading (`aria-busy`, CTA text replaced with three dots) · disabled |
| Google sign-in | `.mc-btn-ghost` with inline silver SVG Google glyph (NOT brand-coloured — silver-traced) | default · google-redirecting (full-button spinner: 3 silver dots cycling) |
| Email sign-in | `.mc-btn-ghost`; opens an inline email input on click | default · open (input slides down) · submitting · magic-link-sent (button replaced with one Cormorant line `[COPY: check your inbox]`) · error |

### Motion
- Cards fade in `opacity 0 → 1` on load, `--mc-dur-base`.
- Email sign-in expand: `max-height 0 → 80px`, `--mc-dur-base` `--mc-ease`.
- Google-redirecting: silver dot cycle, 3 dots, each fades 0.3 → 1 over 800ms staggered.

### The light-point on this surface
**None.** Both fork paths are equal-weight per spec; lighting one would tilt the balance. The visual lift comes from typography alone.

### KPI hooks
- Guest "Begin →" → `data-event="lookmaxing_fork_guest"`
- Google → `data-event="lookmaxing_fork_signin"` `data-event-meta='{"method":"google"}'`
- Email submit → `data-event="lookmaxing_fork_signin"` `data-event-meta='{"method":"email"}'`

### Mobile-specific
Cards stack vertically. Sign-in options become full-width ghost buttons.

### Frontend-implementation notes
- Google glyph: inline SVG, single-colour silver — do NOT use the official multi-colour Google G (it breaks the palette).
- Magic-link backend already exists per `briefs/backend-login-gate.md` patterns; reuse the same POST endpoint.

---

## Surface 3 — `/lookmaxing/quiz` — 5-question calibration

### Goal
Get all 5 answers with zero hesitation; one question at a time, instant tap-to-advance feel.

### Reference study
**Typeform's one-question-per-screen rhythm** + **Aesop's product detail pages** for the typography hierarchy. Borrowing: the *single-focus-per-screen rule* with a top progress sliver, and *generous line-height around a single Cormorant question*. Not copying Typeform's accent or motion.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER                          QUESTION 2 / 5       │  ← .mc-mono, right-aligned
│ ════════════════════════════════════════════════════           │  ← .mc-progress, 40% fill
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│         [eyebrow] CALIBRATION                                  │
│                                                                │
│         [COPY: question 2 text, Cormorant 2.25rem]             │
│                                                                │
│                                                                │
│         ┌──────────────────────────────────────────┐           │
│         │  A · [COPY: option a]              [ ◯ ] │           │  ← option row, hairline bottom
│         ├──────────────────────────────────────────┤           │
│         │  B · [COPY: option b]              [ ◯ ] │           │
│         ├──────────────────────────────────────────┤           │
│         │  C · [COPY: option c]              [ ● ] │           │  ← selected, .mc-light-point on dot
│         ├──────────────────────────────────────────┤           │
│         │  D · [COPY: option d]              [ ◯ ] │           │
│         └──────────────────────────────────────────┘           │
│                                                                │
│                                          [ Next  → ]           │  ← .mc-btn-primary, disabled until selection
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

```
┌──────────────────────────────┐
│ ◇    Q2 / 5                  │
│ ════════════════             │  ← progress bar
├──────────────────────────────┤
│                              │
│ [eyebrow] CALIBRATION        │
│                              │
│ [COPY: question 2 text]      │  ← Cormorant 1.625rem
│                              │
│ ┌──────────────────────────┐ │
│ │ A · [COPY option a]    ◯ │ │
│ ├──────────────────────────┤ │
│ │ B · [COPY option b]    ● │ │  ← selected (light-point)
│ ├──────────────────────────┤ │
│ │ C · [COPY option c]    ◯ │ │
│ ├──────────────────────────┤ │
│ │ D · [COPY option d]    ◯ │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │       NEXT  →            │ │  ← full-width, disabled until selected
│ └──────────────────────────┘ │
│                              │
└──────────────────────────────┘
```

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Progress bar | `.mc-progress` + `.mc-progress__fill` (width: `${(currentQ/5)*100}%`) | animates fill on question advance |
| Counter | `.mc-mono`, e.g. `Q2 / 5` | default |
| Question text | `.mc-serif`, `--mc-fs-h1` desktop / `--mc-fs-h2` mobile | default |
| Option row | 60px min height, label `--mc-fs-body`, letter prefix `.mc-mono`; right side hosts a 16×16 ring (1px silver border, transparent fill) | default · hover (background `rgba(255,255,255,0.03)`) · selected (ring becomes `.mc-light-point`, row left-border 1px silver-bright) · focus-visible (white outline ring on row) · disabled (during submit, 45% opacity) |
| Next CTA | `.mc-btn-primary` | disabled (no selection) · default (selection made) · submitting (`aria-busy`, three silver dots in place of label) · error (border to `--mc-error`, tiny `--mc-error` line below: `[COPY: try again]`) |

### Motion
- Question transitions: outgoing question `translateX(0) → -16px` + fade `1 → 0`, `--mc-dur-fast`; incoming `translateX(16px) → 0` + fade `0 → 1`, `--mc-dur-base` `--mc-ease-out`. Direction reverses for back navigation.
- Selected dot scales `0.6 → 1` with light-point glow appearing on transition, `--mc-dur-fast`.
- Progress fill animates over `--mc-dur-slow`.
- `prefers-reduced-motion`: transitions become a simple opacity swap, progress bar snaps.

### The light-point on this surface
**The selected option's dot.** Only one option is selected at a time — therefore exactly one light-point on screen. The Next CTA does NOT get a glow on this surface (the selected dot is the moment).

### KPI hooks
- Quiz mount → `data-event="lookmaxing_quiz_started"` (fired on Q1 first render)
- Each "Next" → `data-event="lookmaxing_quiz_q{N}_answered"` `data-event-meta='{"choice":"A|B|C|D"}'`
- Q5 "Next" → ALSO fires `lookmaxing_quiz_completed`

### Mobile-specific
- Counter sits left of progress bar in nav.
- Next CTA is full-width, sticky-bottom with `--mc-sp-4` padding-bottom for thumb reach.

### Frontend-implementation notes
- Keep 4 options visible above the fold at 360×640 (per spec §10). Calculation: 56px nav + 24px progress + 16px eyebrow + 80px question (2 lines) + 4×60px options + 56px CTA + padding = 596px. Fits.
- Use `<fieldset>` + `<input type="radio">` visually-hidden under each row for keyboard nav (arrow keys move between options, space to select).

---

## Surface 4 — `/lookmaxing/capture` — Photo capture

### Goal
Get one good front-facing photo in one tap, with enough guidance that quality is consistent across users.

### Reference study
**Apple's iPhone camera UI** — minimal chrome, frame guides as the entire interface, one large shutter target. Borrowing: the *guidance-as-overlay* pattern and the *single large action button*. Not copying their gestures.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER                          STEP 3 / 4           │
│ ════════════════════════════════════════════════════════════   │  ← progress 75%
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   [eyebrow] CAPTURE                                            │
│                                                                │
│   One front-facing photo. Neutral light. No filter.            │  ← Cormorant italic, 1.625rem
│                                                                │
│   ┌──────────────────────────────────────────┐                 │
│   │  ╭──────────────────╮                     │                 │
│   │  │                  │                     │                 │  ← live camera preview
│   │  │   [face guide:   │                     │     [tips]      │
│   │  │    silver oval]  │                     │     ──────       │
│   │  │                  │                     │     · neutral    │
│   │  │                  │                     │       expression │
│   │  ╰──────────────────╯                     │     · indoor     │
│   │                                          │       light      │
│   │             ●●●●● [shutter, 56×56]       │     · no glasses │
│   │                                          │     · no hat     │
│   └──────────────────────────────────────────┘                 │
│                                                                │
│   [ ] I'm 18+ and accept the privacy policy                    │  ← interim consent checkbox
│                                                                │
│                          [ Upload photo instead → ]            │  ← .mc-btn-ghost fallback
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

```
┌──────────────────────────────┐
│ ◇    STEP 3 / 4              │
│ ════════════════════════     │
├──────────────────────────────┤
│ [eyebrow] CAPTURE            │
│                              │
│ One front-facing photo.      │
│ Neutral light. No filter.    │
│                              │
│ ┌──────────────────────────┐ │
│ │                          │ │  ← camera preview, fills width
│ │   ╭──────────────────╮   │ │     aspect-ratio 3/4
│ │   │  [silver oval    │   │ │
│ │   │   face guide]    │   │ │
│ │   ╰──────────────────╯   │ │
│ │                          │ │
│ │    · neutral expression  │ │  ← tips overlay, bottom-left
│ │    · indoor light        │ │
│ │                          │ │
│ │           ● 56×56        │ │  ← shutter, bottom-centre
│ └──────────────────────────┘ │
│                              │
│ [ ] I'm 18+ and accept       │
│     the privacy policy       │
│                              │
│ [ Upload photo instead → ]   │
└──────────────────────────────┘
```

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Camera frame | `aspect-ratio: 3/4`, 1px `--mc-line-strong` border, `border-radius: var(--mc-r-3)`, inside black with live `<video>` element | camera-permission-pending (centred mono "Awaiting camera…" + ghost button "Grant access") · capture-live (preview running, shutter enabled) · denied (mono `[COPY]` + "Upload photo instead" elevated to primary) |
| Face guide overlay | Inline SVG oval, 1px silver stroke, opacity 0.4; centred inside the frame | static |
| Shutter button | 56×56 circle, 2px silver-mid border, `--mc-light-point` 12×12 inner dot, transparent fill, `.mc-light-point-glow` applied to inner dot | default · hover (outer ring brightens) · pressed (inner dot scales to 18×18 for 120ms) · disabled (40% opacity) |
| Tips list | `.mc-mono` bullets, `--mc-silver-mid` | static; on mobile, lives inside the camera frame bottom-left with `rgba(0,0,0,0.6)` backdrop chip |
| Consent checkbox | 18×18 square, 1px silver border, when checked: filled `--mc-silver-bright` with black ✓ SVG inside | unchecked · checked · error (border `--mc-error`, helper text below in `--mc-error`) |
| Upload fallback | `.mc-btn-ghost` triggering hidden `<input type="file" accept="image/*" capture="user">` | default |
| Review state | Replaces the live preview with the captured still + two CTAs below: `.mc-btn-ghost` "Retake" + `.mc-btn-primary` "Continue →" | reviewing · quality-warning (silver `--mc-line-strong` banner above the still: `[COPY: low light detected]` with `.mc-btn-ghost` "Retake anyway") · uploading (`.mc-btn-primary` `aria-busy`, dots cycling) · uploaded (auto-redirect to surface 5; brief mono "Capture saved" caption) |

### Motion
- Shutter press: inner dot scales `1 → 1.4 → 1` over 240ms with light-point glow flash, then preview freezes for 120ms before transitioning to review state.
- Review state: captured still fades in `opacity 0 → 1`, `--mc-dur-base`.
- Quality-warning banner slides down `translateY(-8px) → 0` + fade, `--mc-dur-fast`.
- `prefers-reduced-motion`: shutter shows a static flash overlay instead of a scale animation.

### The light-point on this surface
**The shutter inner dot.** It glows continuously (breathing) once camera permission is granted — signalling "ready". On capture, it pulses brighter. Only light-point on the screen.

### KPI hooks
- Shutter / upload success → `data-event="lookmaxing_photo_uploaded"` `data-event-meta='{"source":"camera|upload"}'`
- Consent check → fired silently into the existing consent audit log (no KPI event)

### Mobile-specific
- Camera frame fills viewport width minus `--mc-sp-4` gutters; aspect-ratio 3:4 keeps face naturally framed.
- Tips list collapses into a bottom-left chip inside the frame with semi-transparent black backdrop.
- Shutter sits inside the frame bottom-centre, 24px from the bottom edge of the preview.
- Consent checkbox + upload fallback stack below the frame.

### Frontend-implementation notes
- Use `navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}})`. Fall back to `<input type="file" capture="user">` on denial.
- Reuse `services/storage.putPhoto` from existing capture flows per spec §8.
- Add `playsinline` attribute on the `<video>` element so iOS Safari doesn't fullscreen.
- The face guide oval is a 200×260px SVG at viewBox `0 0 200 260` with an `<ellipse cx="100" cy="130" rx="76" ry="110">`.

---

## Surface 5 — `/lookmaxing/audit/:auditId` — Free-resolution report

### Goal
Show the four free blocks at full resolution; show the four premium blocks as visibly structured but blurred — so the user *feels the substance* and self-selects into the ₹99 unlock.

### Reference study
**Patek Philippe's product detail pages** — large numeric centrepiece (caliber number, reference) with quiet metric labels around it. Borrowing: the *single hero numeral with breathing room* and the *typographic separation of headline metric vs supporting metrics*. Not copying their imagery.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER              AUDIT · A7K9-3M2P                │  ← .mc-mono id
├────────────────────────────────────────────────────────────────┤
│                                                                │
│       [eyebrow] YOUR AURA READING                              │
│                                                                │
│                                                                │
│                       ┌─────────────┐                          │
│                       │             │                          │
│                       │     72      │                          │  ← .mc-silver-text, 8rem Cormorant
│                       │             │                          │
│                       └─────────────┘                          │
│                                                                │
│                         ASCENDANT                              │  ← rank, .mc-mono, --mc-ls-xwide
│                                                                │
│              ─── First-impression read ───                     │  ← .mc-hairline with eyebrow chip
│                                                                │
│         [COPY: one Cormorant italic line, 1.5rem]              │  ← centred, italic, silver-bright
│                                                                │
│              ──────── Free signals ────────                    │
│                                                                │
│      [oval pill]   ·   Tired   Hydrated   Loose   Bright       │  ← face-shape pill left,
│                                                                │     4 signals in JetBrains Mono right
│                                                                │
│              ──────── The full audit ────────                  │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  [blurred 30-metric decomposition table — visible    │    │
│   │   row structure, illegible values]                   │    │  ← mc-blur-wrap > .mc-blur-gate
│   │                                                      │    │
│   │           ╭──────────────────────╮                   │    │
│   │           │  ◇  UNLOCK FOR ₹99  →│                   │    │  ← .mc-btn-primary--filled (centred over blur)
│   │           ╰──────────────────────╯                   │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  YOUR BIGGEST LEVER                                  │    │
│   │  [blurred line + partial metric name preview]        │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  YOUR QUESTS                                         │    │
│   │  · [blurred bullet]                                  │    │
│   │  · [blurred bullet]                                  │    │
│   │  · [blurred bullet]                                  │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  STYLE & COLOUR                                      │    │
│   │  [blurred 2-paragraph block]                         │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  7-DAY STARTER PLAN                                  │    │
│   │  [blurred 7-row table]                               │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

Same composition, single column. The Aura Score numeral renders at `--mc-fs-display` (3.5rem) on mobile and `8rem` on desktop. Blurred blocks stack with `--mc-sp-5` gap. The single primary unlock CTA appears once, centred over the first blurred block (decomposition); secondary blurred blocks rely on the click-anywhere-to-unlock behaviour of `.mc-blur-wrap`.

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Score numeral | `.mc-serif`, `.mc-silver-text`, font-size `8rem` desktop / `--mc-fs-display` mobile | loading (skeleton: silver shimmer rectangle 200×160px with `.mc-silver-gradient-h` cycling left→right) · ready · error (replaced with single Cormorant italic `[COPY: could not generate]` + `.mc-btn-primary` "Retry") |
| Rank label | `.mc-mono`, uppercase, letter-spacing `--mc-ls-xwide`, `--mc-silver-mid` | loading (placeholder mono dashes) · ready |
| First-impression line | `.mc-serif.mc-serif--italic`, `--mc-fs-h3`, max-width `--mc-reading-max`, centred | loading (3 hairline placeholder lines) · ready |
| Face-shape pill | `.mc-pill` | loading (empty silhouette) · ready |
| Signal labels | `.mc-mono`, separated by `·` glyphs in `--mc-silver-faint` | loading · ready |
| Blurred block wrapper | `.mc-blur-wrap` (contains the rendered premium content inside `.mc-blur-gate`) | default (blurred + silver overlay) · hover (border to `--mc-line-bright`) · focus-visible (white outline ring) · click anywhere → opens `?pay=true` modal |
| Primary unlock CTA | `.mc-btn-primary--filled` (white fill, black text — this is the ONE filled button in the whole product) with `.mc-light-point` dot left of label | default · hover (no glow change — the filled white is already the brightest element) · loading (`aria-busy`, three black dots cycling on white fill) |

### Motion
- Loading skeleton: silver gradient shimmer cycles 1.2s ease-in-out infinite (disabled under reduced-motion).
- Ready state: score numeral counts up from 0 to final value over 1.4s using `requestAnimationFrame` ease-out; rank label fades in at final tick.
- Blurred blocks fade in `opacity 0 → 1` staggered 80ms each, after free blocks settle.
- Hover on blur wrapper: border transitions over `--mc-dur-base`.

### The light-point on this surface
**The dot to the left of "UNLOCK FOR ₹99" on the primary CTA.** Only one. The score numeral itself uses silver gradient (no glow); blurred blocks rely on contrast and movement of borders, not glow.

### Premium-blur rendering (spec §5)
The four premium blocks render their *real* generated content (table rows, bullets, paragraphs, plan rows) — but wrapped in `.mc-blur-gate` (which applies `filter: blur(6px) saturate(0.8)`) inside a `.mc-blur-wrap` parent. The wrapper's `::before` paints a faint silver overlay gradient (`linear-gradient(180deg, rgba(232,232,232,0.04), rgba(232,232,232,0.10) 50%, rgba(232,232,232,0.04))`) and `::after` paints a radial-ellipse vignette to darken the edges so the eye lands centre. Result: the user sees the *shape and density* of the content (row count, bullet count, paragraph length) but cannot read a single word. The whole wrapper is clickable; tap anywhere fires `lookmaxing_paywall_blurred_metric_tapped` and opens `?pay=true`.

Each blurred block's header (e.g. `YOUR BIGGEST LEVER`) sits OUTSIDE `.mc-blur-gate` so it stays sharp — the user knows what's behind the blur.

### KPI hooks
- Page mount → `data-event="lookmaxing_audit_viewed"` `data-event-meta='{"resolution":"free"}'`
- First successful render → `lookmaxing_audit_generated` (fired by backend on Gemini success; frontend just observes)
- Unlock CTA click → `data-event="lookmaxing_paywall_viewed"` then `lookmaxing_pay_initiated` on Razorpay modal open
- Any blur wrapper click → `data-event="lookmaxing_paywall_blurred_metric_tapped"` `data-event-meta='{"block":"decomposition|biggestLever|quests|styleColour|starterPlan"}'`

### Mobile-specific
- Score numeral 3.5rem (still dominant on 360px).
- Free signals stack as 2×2 grid below the face-shape pill.
- Unlock CTA becomes full-width, sticky to the first blurred block's centre. A second sticky-bottom unlock CTA appears once the user has scrolled past the second blurred block (replaces, doesn't duplicate — the original CTA fades when the sticky variant appears). This is the only structural mobile addition.

### Frontend-implementation notes
- Use the existing `services/gemini.js` response shape per spec §6 — render `decomposition`, `biggestLever`, `quests`, `styleAndColour`, `starterPlan` even when paid=false (just inside the blur wrappers).
- Score count-up: respect `prefers-reduced-motion` (render final value immediately).
- The sticky mobile unlock CTA: use `position: sticky; bottom: var(--mc-sp-4)` with `backdrop-filter: blur(12px)` and a `rgba(0,0,0,0.7)` background chip — silver border `--mc-line-strong`.

---

## Surface 6 — `/lookmaxing/audit/:auditId?pay=true` — ₹99 unlock paywall

### Goal
Take ₹99 in one tap via UPI, no friction beyond the Razorpay modal.

### Reference study
**Bottega Veneta's checkout** — minimal price summary, single button, zero clutter. Borrowing: the *single-price-line + single-button* discipline. Not copying their colour or type.

### Layout (modal over surface 5 dim backdrop)

```
                  ┌──────────────────────────────────────┐
                  │   [eyebrow] UNLOCK YOUR FULL AUDIT   │
                  │                                      │
                  │   ──────────────                     │
                  │                                      │
                  │   [COPY: 2-line value summary]       │  ← Cormorant italic, 1.25rem
                  │                                      │
                  │   ──── what unlocks ────             │
                  │   · Full 30+ metric decomposition    │  ← .mc-mono bullets
                  │   · Your biggest lever               │
                  │   · Your quests                      │
                  │   · Style & colour notes             │
                  │   · 7-day starter plan               │
                  │   · PDF download                     │
                  │                                      │
                  │   ──────────────                     │
                  │                                      │
                  │       ₹99                            │  ← .mc-silver-text, 2.25rem
                  │       one-time · counts toward       │  ← .mc-mono
                  │       month one                      │
                  │                                      │
                  │   ┌────────────────────────────┐     │
                  │   │ ◇ UNLOCK · UPI / CARDS  →  │     │  ← .mc-btn-primary--filled
                  │   └────────────────────────────┘     │
                  │                                      │
                  │       [ Maybe later ]                │  ← .mc-btn-ghost
                  └──────────────────────────────────────┘
```

Backdrop: `rgba(0, 0, 0, 0.75)` with `backdrop-filter: blur(8px)` over surface 5.

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Modal shell | `.mc-card` + `--mc-shadow-elevated`, max-width 480px desktop / 92vw mobile, centred | closed · open (fade + scale `0.96 → 1`, `--mc-dur-base`) · razorpay-modal-open (own card dims to opacity 0.6, no interaction) · processing (own card stays at 0.6, CTA `aria-busy`) · success-redirect (own card fades to 0, replaced by 1-line Cormorant `[COPY: unlocked]` then auto-navigate to surface 7) |
| Price | `.mc-silver-text`, `.mc-serif`, 2.25rem | static |
| Unlock CTA | `.mc-btn-primary--filled` with `.mc-light-point` dot prefix | default · hover · processing (`aria-busy`, three black dots) · failed (border `--mc-error`, helper text below: `[COPY: payment failed, try again]`, ghost CTA below: `Try a different method`) |
| Maybe later | `.mc-btn-ghost` | default; click closes modal and returns to surface 5 |

### Motion
- Modal entry: backdrop fade `--mc-dur-base`; card scale `0.96 → 1` + fade, `--mc-dur-base` `--mc-ease-out`.
- Modal exit: reverse, `--mc-dur-fast`.
- `prefers-reduced-motion`: no scale, just opacity.

### The light-point on this surface
**The dot prefix on the unlock CTA.** The modal itself is the light moment in the experience; the dot reinforces it. No glow on the modal border (would feel too app-y).

### KPI hooks
- Modal open → `data-event="lookmaxing_paywall_viewed"` (if not already fired)
- Unlock click → `data-event="lookmaxing_pay_initiated"`
- Razorpay success → `lookmaxing_pay_succeeded` (fired by webhook + client receipt)
- Razorpay failure / dismiss → `lookmaxing_pay_failed` `data-event-meta='{"reason":"dismissed|failed"}'`

### Mobile-specific
Modal is full-width with `--mc-sp-4` horizontal gutters; vertical-centred. Maybe-later button has 56px tap target.

### Frontend-implementation notes
- Reuse the Razorpay checkout init pattern from existing `public/upgrade.html`.
- The "counts toward month one" line is a copy hook the user has earned through paying — copy-consultant-agent owns the exact words.
- Backdrop click also closes the modal (calls `lookmaxing_pay_failed` with `reason: dismissed`).

---

## Surface 7 — `/lookmaxing/audit/:auditId/full` — Full report

### Goal
Deliver the full audit at the same visual quality as the free view — no celebration noise, just the substance now resolved.

### Reference study
**Aesop's product detail pages** — long-form vertical reading with strict section hierarchy, generous line-height, and ONE quiet action button at the foot. Borrowing: the *typographic hierarchy as the entire navigation system* and the *single end-of-page action*. Not copying their typeface choice.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER              AUDIT · A7K9-3M2P · FULL         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   [eyebrow] YOUR AURA READING                                  │
│                                                                │
│                  72  · ASCENDANT                                │  ← compressed header (score smaller now)
│                                                                │
│                  ─── First impression ───                       │
│                                                                │
│             [COPY: one Cormorant italic line]                  │
│                                                                │
│                  ─── Decomposition ───                          │
│                                                                │
│   SKIN                                                          │  ← .mc-mono uppercase header
│   ───                                                           │  ← hairline
│   Clarity              ████████░░  82                           │  ← metric label · tick bar · score
│   Hydration            ██████░░░░  64                           │
│   Pore size            █████░░░░░  54                           │
│   ...                                                           │
│   ─ Why this matters: [COPY: cause]                             │  ← Cormorant italic, small
│   ─ What to do:       [COPY: fix]                               │
│                                                                │
│   HAIR                                                          │
│   ...                                                           │
│   JAW & FACE                                                    │
│   ...                                                           │
│   BODY & POSTURE                                                │
│   ...                                                           │
│   LIFESTYLE SIGNALS                                             │
│   ...                                                           │
│                                                                │
│                  ─── Your biggest lever ───                     │
│   [COPY: 2-line Cormorant italic]                              │
│                                                                │
│                  ─── Your quests ───                            │
│   · [task line]                                                 │
│   · [task line]                                                 │
│                                                                │
│                  ─── Style & colour ───                         │
│   Haircut       [COPY]                                          │
│   Palette       ▣ ▣ ▣ ▣ ▣      (5 silver tone swatches)         │
│   Avoid         [COPY]                                          │
│                                                                │
│                  ─── 7-day starter plan ───                     │
│   Day 1 · Morning [COPY]   · Evening [COPY]                     │
│   Day 2 ...                                                     │
│   ...                                                           │
│                                                                │
│   ───                                                           │
│                                                                │
│       ┌──────────────────────────┐                              │
│       │  ◇ DOWNLOAD PDF       →  │                              │  ← .mc-btn-primary + light-point-glow
│       └──────────────────────────┘                              │
│                                                                │
│              [eyebrow] WHAT'S NEXT                              │
│              [Continue to fork →]  (.mc-btn-ghost)              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

Same composition single-column. Metric tick bars become full-width and wrap below the label rather than to the right. Day rows in the starter plan stack morning/evening vertically.

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Compressed score header | `.mc-mono` for "72 · ASCENDANT", `--mc-fs-h2` | static |
| Section header | `.mc-mono` uppercase, `--mc-ls-xwide`, followed by `.mc-hairline--bright` | static |
| Metric row | Label (`--mc-silver-bright`, Sora 400) · tick bar (10 segments, 1px gap, segments filled with `--mc-silver-bright` up to score/10, unfilled `--mc-silver-ghost`) · score (`.mc-mono`, `--mc-silver-bright`) | static |
| Cause / fix lines | Cormorant italic, `--mc-fs-small`, `--mc-silver-mid`, prefixed with `─` em-dash | static |
| Palette swatch | 24×24 square, 1px `--mc-line-strong` border, filled with the actual recommended tone (greyscale only — model is constrained to silver/black/white palette spec) | static |
| PDF download | `.mc-btn-primary` + `.mc-light-point-glow` (the one light moment on this surface) | default · pdf-generating (`aria-busy`, three silver dots, label changes to `[COPY: preparing]`) · pdf-ready (label changes to `[COPY: download ready]` with a small ↓ arrow appended; click delivers signed R2 URL) · error |
| Continue ghost CTA | `.mc-btn-ghost` | default |

### Motion
- Section reveal on scroll: each section header fades + `translateY(8px) → 0` as it enters viewport, `--mc-dur-base`. Uses `IntersectionObserver` once per section.
- Tick bars fill left-to-right on first reveal of each metric block, `--mc-dur-slow` `--mc-ease-out`, staggered 40ms per row.
- PDF download glow breathes (this surface inherits the light-point from the report's headline action).
- `prefers-reduced-motion`: bars snap to filled state; sections appear instantly.

### The light-point on this surface
**The PDF download CTA glow.** Single light moment, anchored to the closing action.

### KPI hooks
- Page mount → `data-event="lookmaxing_audit_viewed"` `data-event-meta='{"resolution":"full"}'`
- PDF click → `data-event="lookmaxing_pdf_downloaded"`
- Continue ghost CTA → navigates to surface 8 (no separate event; surface 8 fires its own)

### Mobile-specific
- Metric rows: label on top line, tick bar full-width on second line, score right-aligned at end of label line.
- Section headers gain `--mc-sp-6` top margin for thumb-scroll cadence.

### Frontend-implementation notes
- Tick bars: pure CSS using `grid-template-columns: repeat(10, 1fr)` with each child filled or ghost based on score.
- PDF generation reuses the existing pdfkit pipeline per spec §8.
- Palette swatches: greyscale only — backend must constrain Gemini's output to a silver/black/white palette per spec brand rules. If Gemini ever returns a chromatic colour, frontend silently clamps to nearest grey value.

---

## Surface 8 — `/lookmaxing/fork` — Trial vs Premium

### Goal
Present the two next steps with equal dignity; "Coming soon" placeholders stay honest, not apologetic.

### Reference study
**Patek Philippe's collection landing pages** — two equal-weight composition panels with a single quiet line of context under each, no badges, no urgency. Borrowing: the *equal-weight typographic panel pairing* and the *coming-soon-as-positive-framing*. Not copying their photography.

### Desktop layout

```
┌────────────────────────────────────────────────────────────────┐
│  ◇ MAINCHARACTER                                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│              [eyebrow] WHAT'S NEXT                              │
│                                                                │
│         You have the read. The work begins now.                │  ← Cormorant italic, 2.25rem
│                                                                │
│                                                                │
│   ┌──────────────────────────┐    ┌──────────────────────────┐ │
│   │  THE 7-DAY TRIAL          │    │  GO PREMIUM              │ │  ← .mc-mono headers
│   │  ──────                   │    │  ──────                  │ │
│   │  [COPY: 2-line context]   │    │  [COPY: 2-line context]  │ │
│   │                          │    │                          │ │
│   │  ─── what you get ───    │    │  ─── what you get ───    │ │
│   │  · Daily mirror prompt   │    │  · 90-day rebuild        │ │
│   │  · Sharpness score       │    │  · Weekly reveal video   │ │
│   │  · 7-day reveal video    │    │  · Day-30 re-audit       │ │
│   │                          │    │  · PDF library access    │ │
│   │                          │    │                          │ │
│   │  [eyebrow] FREE          │    │  [eyebrow] ₹1,499 / MONTH│ │
│   │                          │    │                          │ │
│   │  ╭──────────────────╮    │    │  ╭──────────────────╮    │ │
│   │  │ START TRIAL  →   │    │    │  │ COMING SOON      │    │ │
│   │  ╰──────────────────╯    │    │  ╰──────────────────╯    │ │
│   │                          │    │  [Join the waitlist]     │ │
│   └──────────────────────────┘    └──────────────────────────┘ │
│                                                                │
│              [eyebrow] AT YOUR OWN PACE                         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Mobile layout

```
┌──────────────────────────────┐
│ ◇ MAINCHARACTER              │
├──────────────────────────────┤
│ [eyebrow] WHAT'S NEXT        │
│                              │
│ You have the read.           │
│ The work begins now.         │
│                              │
│ ┌──────────────────────────┐ │
│ │ THE 7-DAY TRIAL          │ │
│ │ [COPY context]           │ │
│ │ ─── what you get ───     │ │
│ │ · Daily mirror prompt    │ │
│ │ · Sharpness score        │ │
│ │ · 7-day reveal video     │ │
│ │ [eyebrow] FREE           │ │
│ │ [ START TRIAL → ]        │ │  ← full-width primary
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ GO PREMIUM               │ │
│ │ [COPY context]           │ │
│ │ ─── what you get ───     │ │
│ │ · 90-day rebuild         │ │
│ │ · Weekly reveal video    │ │
│ │ · Day-30 re-audit        │ │
│ │ · PDF library access     │ │
│ │ [eyebrow] ₹1,499 / MO    │ │
│ │ [ COMING SOON ]          │ │  ← disabled primary
│ │ [Join the waitlist]      │ │  ← ghost
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### Components & states

| Element | Tokens / class | States |
|---|---|---|
| Card | `.mc-card`, equal width on desktop | default · hover (border to `--mc-line-strong`) |
| Trial CTA | `.mc-btn-primary` + `.mc-light-point-glow` | default · loading (`aria-busy`) · trial-coming-soon placeholder (disabled state with label `[COPY: coming soon]`, no glow) |
| Premium CTA | `.mc-btn-primary` disabled state with label `[COPY: coming soon]`; no glow | premium-coming-soon (default) · ready (once premium launches, label becomes `[COPY: subscribe]`) |
| Waitlist ghost | `.mc-btn-ghost` opens same Orator-style modal as surface 1 (reusable component) | default · submitting · submitted |
| Price line | `.mc-eyebrow` letter-spaced for premium feel | static |

### Motion
- Cards fade in on load, `--mc-dur-base`, staggered 80ms.
- Trial CTA glow breathes (single light-point on this surface).
- `prefers-reduced-motion`: glow off; opacity-only fades.

### The light-point on this surface
**The Trial CTA glow.** The Trial is the active path forward; Premium is dormant. The light points to what's available.

### KPI hooks
- Trial CTA → `data-event="lookmaxing_fork_trial"`
- Premium CTA → `data-event="lookmaxing_fork_premium"` (fires even when disabled — captures intent)
- Waitlist submit → `data-event="lookmaxing_fork_premium"` `data-event-meta='{"step":"waitlist_submit"}'`

### Mobile-specific
Cards stack vertically with `--mc-sp-5` gap. Each CTA becomes full-width.

### Frontend-implementation notes
- The trial flow lives behind a feature flag tonight (per spec §1 — Daily Mirror is built tomorrow). The Trial CTA shows the coming-soon disabled state until the flag flips. **Structural call:** since spec §1 says "design contracts only, no build" for the Daily Mirror, surface 8 ships tonight with BOTH CTAs disabled and BOTH waitlists active. Frontend-agent reads `window.LOOKMAX_TRIAL_LIVE === true` to flip the trial CTA from disabled to active.
- Reuse the waitlist modal component from surface 1.

---

## Cross-surface reference summary

| Pattern borrowed | From | Applied to |
|---|---|---|
| Centred-composition discipline, one-thing-on-the-fold | Apple AirPods Pro page | Surface 1 (Landing) |
| Equal-weight option pair on generous vertical centre | Linear auth | Surface 2 (Fork) |
| Single-focus-per-screen + Cormorant typographic hierarchy | Typeform + Aesop | Surface 3 (Quiz) |
| Guidance-as-overlay + single large action button | Apple iPhone camera UI | Surface 4 (Capture) |
| Single hero numeral + typographic metric hierarchy | Patek Philippe product detail | Surface 5 (Free audit) |
| Single-price-line + single-button discipline | Bottega Veneta checkout | Surface 6 (Paywall) |
| Typographic hierarchy as the entire navigation system | Aesop product detail | Surface 7 (Full audit) |
| Equal-weight typographic panel pairing | Patek Philippe collection landing | Surface 8 (Fork) |

---

## Open structural calls made (where spec wasn't fully prescriptive)

1. **Surface 5 mobile sticky unlock CTA.** Spec §10 requires the Aura Score "renders at full visual weight on 360px" but doesn't address the unlock-CTA reachability on a long scrolling page. I added a single sticky-bottom secondary unlock CTA on mobile that fades in after the first blurred block scrolls off-screen. It does not duplicate the primary CTA; it replaces its visual presence on the screen.

2. **Surface 8 dual-disabled launch state.** Spec §1 says Daily Mirror is built tomorrow night, but spec §3 lists surface 8 as needing "trial-coming-soon placeholder" AND "premium-coming-soon placeholder". I designed both CTAs to ship disabled tonight with their respective waitlist ghosts active, controlled by a `window.LOOKMAX_TRIAL_LIVE` flag for tomorrow's flip. Flagged for founder visibility — if the trial flag flips tomorrow, no design changes needed.

3. **Surface 4 consent checkbox placement.** Spec §14 mentions an interim "I'm 18+" checkbox; I placed it directly below the camera frame so it's seen but doesn't visually compete with the shutter. If lawyer review changes the consent copy or adds a gate flow, the position holds.

4. **Surface 7 palette swatches.** Spec §6's `styleAndColour.palette` field could be chromatic, but spec §2 forbids warm tones and the visual identity is greyscale. I clamped palette swatches to greyscale silver tones, with a frontend-side safety clamp if backend returns colour. Flagged for gemini-prompt-engineer to constrain server-side.

5. **Surface 1 grain overlay.** The landing.html uses 3.5% grain; I dropped to 2% on the lookmaxing landing because the pure black field is more sensitive to noise around the video container. If frontend-agent finds noise interferes anywhere, the recommended fallback is to disable grain entirely on `/lookmaxing/*` — the typographic discipline alone carries the premium feel.
