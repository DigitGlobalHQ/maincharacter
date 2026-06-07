# Reading Page — Design Spec (premium re-skin, token-safe)

**Surface:** `public/lookmaxing/audit.html` — the free reading shown after the funnel (quiz → photo → analyze).
**Author:** Design (brand / luxury direction)
**Date:** 2026-06-07
**Status:** Spec only. No page edits in this pass. Hand to frontend-agent for vanilla HTML/CSS implementation.

> **Mandate from founder:** the page "looks plain." Make it feel like a premium dossier — an expensive consultant's instrument — without breaking a single token, font, or copy line.

---

## 0. Hard constraints (read before touching anything)

These are locked by CLAUDE.md §2 and `tokens.css`. Nothing in this spec overrides them. If an instruction below seems to, the token wins.

- **Palette:** obsidian field (`--mc-near-black #0a0a0a` / `--mc-black #000000`), brushed-silver structure (`--mc-silver-*`), and ONE white light-point accent (`--mc-light-point #ffffff` + its glow tokens). NO gold, NO warm tones, NO new colour. `--mc-gold` already aliases to silver — do not reintroduce a literal gold hex.
- **Aubergine is atmosphere ONLY** (`--mc-aubergine-glow`, opacity ≤ 0.16). Never a fill, text, or border. It already lives in the page-background radial. Do not add aubergine to any new element except, optionally, ONE ambient radial behind the hero (see §1.4) at the existing glow opacity.
- **Type:** Cormorant Garamond (serif, italic for emotional weight) for display; Sora for body; JetBrains Mono for data/eyebrows/labels. No new typefaces.
- **No emoji** except the diamond `◆`. **No exclamation marks.** No bright status colours (error red is the only functional exception).
- **Copy is locked.** You may **reposition / regroup** the existing strings. You may NOT rewrite them. Any genuinely new label gets a `<!-- TODO copy review -->` placeholder, not improvised Consultant voice.
- **The light-point is used at most once per screen as the hero accent** (the CTA already carries the breathing glow). Do not scatter glowing dots. The Aura ring's dot and the CTA glow are the two sanctioned uses; keep it to those.
- **Mobile-first.** Design at 360px. The product runs on mid-range Android in India. No heavy assets — CSS/SVG only, the MediaPipe mesh is already lazy and best-effort.

---

## 1. ONE hero score — the Aura Score as the centerpiece

### 1.1 Kill the competing "72"
The face section currently renders a SECOND giant number — `m.attractiveness.score` as `.mcfe__num` (clamp 56–84px serif italic) plus the label "Attractiveness Score · out of 100" and a sub-paragraph. This is in **`face-embed.js` → `buildSection()`**. Two large numerals on one page destroys the hero and reads as a spec sheet, not a dossier.

**Action for frontend-agent:** in `face-embed.js`, **remove the entire `.mcfe__hero` block** from `buildSection()` (the `<div class="mcfe__hero">…</div>` — the `__num`, `__label`, and `__sub`). The attractiveness score does NOT disappear — it survives as one KPI card in the grid (the existing `card('Attractiveness', m.attractiveness.score + ' / 100', …)`), which is exactly the right altitude for it: a measured data point, not a rival hero. Delete the now-unused `.mcfe__num`, `.mcfe__label`, `.mcfe__sub` rules from the injected CSS string.

Result: **the Aura Score arc is the only large number above the fold.** Everything else is supporting data.

### 1.2 Make the Aura ring feel like the instrument

The `mc-aura-obj` ring is well-built; the problem is it floats with no framing. Give it a **stage**.

Wrap the existing `#score-obj-container` in a centered hero zone with these treatments (all token-safe):

- **Vertical breathing room.** The hero block gets `padding-top: var(--mc-sp-7)` (48px) and `padding-bottom: var(--mc-sp-7)`. The score must own the top of the viewport with air around it — luxury is negative space.
- **Ring scale up a notch on the reading page.** Current: 160px mobile / 200px ≥768px. Keep mobile at 160px (360px screens are tight) but bump the desktop breakpoint ring to **220px** via a page-local override on `.mc-aura-obj__ring-wrap` inside the hero only. Numeral already steps to 7rem at ≥768px — keep.
- **A faint orbital halo behind the ring** — one radial, drawn with the *existing* light-point glow token, to make the score feel lit from within:
  ```
  .lm-score-block::before {
    content: '';
    position: absolute;
    width: 280px; height: 280px;
    left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, var(--mc-light-point-glow-soft) 0%, transparent 62%);
    pointer-events: none; z-index: 0;
  }
  ```
  `.lm-score-block` needs `position: relative; isolation: isolate;` and the ring/numeral sit at `z-index: 1` (the numeral already has `z-index:1`). This is the single sanctioned ambient glow — do not also add it elsewhere.
- **Eyebrow above the ring stays**, restyled as the dossier's masthead (see §2.2). The current `YOUR READING` eyebrow becomes the top line of a 3-part masthead.

### 1.3 The score's "frame" — masthead + verdict line

Premium readings (think a Patek service report or an Aesop ingredient card) frame a single hero figure with quiet metadata, not decoration. Build a **three-line masthead** above the ring and a **one-line verdict** below it, using only existing copy:

```
            ◆  AURA READING                ← eyebrow (mono, --mc-silver-dim), the ◆ is the only mark
        ┌──────────────────┐
        │      (ring)      │               ← mc-aura-obj, unchanged geometry
        │       60         │               ← numeral, silver-gradient
        └──────────────────┘
              / 100                          ← denom (mono)
            ASCENDANT                        ← rank (mono, --mc-silver-mid, xwide tracking)
```

- The masthead eyebrow uses the existing `.mc-eyebrow` token (already `--mc-silver-dim`, `--mc-ls-xwide`). Prefix it with a small static `◆` (NOT the light-point — a typographic diamond in `--mc-silver-faint`) for the signature.
- Below the rank, add a thin **full-width hairline** (`.mc-hairline`, the existing `--mc-line` 1px rule) with `margin: var(--mc-sp-6) 0` to close the hero zone and open the dossier body. This single rule is what turns "a number floating on black" into "the cover of a document."

No new copy. `AURA READING` / `AURA SCORE` / `YOUR READING` strings already exist in the file — reuse the approved one (currently `YOUR READING` at `#score-block-label`); keep that exact string, just restyle it.

### 1.4 Type scale for the hero (exact values)

| Element | Token | Value |
|---|---|---|
| Masthead eyebrow | `--mc-fs-eyebrow` / `--mc-ls-xwide` | 11px, 0.28em, `--mc-silver-dim` |
| Score numeral (mobile) | `--mc-fs-display` | 56px (3.5rem), silver-gradient |
| Score numeral (≥768px) | (page-local) | 7rem (already set on `.mc-aura-obj__numeral`) |
| `/ 100` denom | `--mc-fs-mono` | 13px, `--mc-silver-faint` |
| Rank | `--mc-fs-mono` / `--mc-ls-xwide` | 13px, 0.28em, `--mc-silver-mid` |

**Do NOT change** the ring SVG geometry, the arc animation, the count-up, or the light-point dot logic in `audit.html` — they are correct and on-brand. This is the one piece of true motion on the page; protect it.

---

## 2. Visual hierarchy + rhythm — read as a dossier, not a stack

The current page is a flat vertical list with identical spacing between everything. A dossier has **chapters**: a numbered spine, consistent section heads, and a deliberate spacing rhythm that tells the eye where it is.

### 2.1 A numbered spine (the single biggest "premium" lever)

The premium blocks already carry numbers in their headers (`02 · BIOMETRIC GAP ANALYSIS`, `03 · …`, etc.). **Extend that numbering up to the free sections** so the whole page reads as one indexed document:

| # | Section (existing) | Section label string (keep verbatim) |
|---|---|---|
| 00 | Aura Score hero | `YOUR READING` |
| 01 | First impression | `FIRST IMPRESSION` |
| — | The four signals | `THE FOUR SIGNALS` |
| — | Your face, measured | `YOUR FACE, MEASURED` |
| 02 | Biometric gap (blurred) | `02 · BIOMETRIC GAP ANALYSIS · 24 METRICS` |
| 03 | Chromatic arsenal (blurred) | `03 · THE CHROMATIC & GROOMING ARSENAL` |
| 04 | 90-day intervention (blurred) | `04 · THE 90-DAY INTERVENTION` |
| 05 | Projected evolution (blurred) | `05 · PROJECTED EVOLUTION` |
| — | Methodology (blurred) | `METHODOLOGY & SAFETY` |

For the free sections (`FIRST IMPRESSION`, `THE FOUR SIGNALS`, `YOUR FACE, MEASURED`), prepend the index number as a **separate mono token** inside the existing `.lm-section-label`, NOT baked into the copy string. The label component becomes:

```
[ 01 ]  FIRST IMPRESSION  ──────────────────────────
  ↑mono   ↑existing string    ↑existing hairline (flex:1)
 --mc-silver-faint
```

Implementation: add a `<span class="lm-section-label__index">01</span>` before `.lm-section-label__text`. Style:
```
.lm-section-label__index {
  font-family: var(--mc-font-mono);
  font-size: var(--mc-fs-eyebrow);       /* 11px */
  letter-spacing: var(--mc-ls-wide);
  color: var(--mc-silver-faint);
}
```
The numbers are NOT copy — they are structural index marks (like figure numbers). They are not in the locked-copy set. If the founder objects, they are trivially removable. (The premium blocks' numbers are already part of their header strings, so leave those alone — just make the free-section indices visually match.)

### 2.2 Section-label restyle (the dossier's chapter heads)

The existing `.lm-section-label` (mono eyebrow + flex hairline) is the right pattern but reads thin. Upgrade WITHIN tokens:

- Keep `display:flex; align-items:center; gap: var(--mc-sp-3)`.
- The hairline (`.lm-section-label__line`) stays `--mc-line` (1px). Good.
- Increase the **top margin** of each label to establish chapter separation: `margin: var(--mc-sp-7) 0 var(--mc-sp-4)` (48px above / 16px below). The asymmetry — large gap before the head, small gap before its content — is what makes the eye group content into chapters. This is the core rhythm change.
- Text stays `--mc-silver-dim`, `--mc-ls-xwide`, uppercase, 11px. Correct.

### 2.3 Spacing rhythm (the explicit scale)

Apply these exact values down the page. The principle: **big gaps between chapters, tight gaps inside them.**

| Boundary | Spacing token | px |
|---|---|---|
| Page top → hero | `--mc-sp-7` | 48 |
| Inside hero (eyebrow→ring→rank) | `--mc-sp-2` to `--mc-sp-4` | 8–16 (unchanged) |
| Hero → closing hairline | `--mc-sp-6` | 32 |
| **Between chapters** (section-label top margin) | `--mc-sp-7` | 48 |
| Section label → its content | `--mc-sp-4` | 16 |
| Within a chapter, item → item | `--mc-sp-3` / `--mc-sp-4` | 12–16 |
| Last chapter → footer | `--mc-sp-8` | 80 |

The `.lm-audit-body` outer padding (`var(--mc-sp-6) var(--mc-sp-4) var(--mc-sp-8)`) is fine — keep.

### 2.4 Body max-width

Keep `.lm-audit-body { max-width: 720px }`. For pure reading lines (first impression), the existing `--mc-reading-max: 64ch` cap stays. Do not widen — the narrow measure is part of the luxury (Aesop, Tom Ford editorial both run narrow).

---

## 3. "YOUR FACE, MEASURED" — elegant photo + mesh + KPI grid

This block (rendered by `face-embed.js`) is the page's proof-of-rigour moment — the part that says "this was actually measured." Right now it's a small photo and a plain 2-col grid that reads as an app settings screen. Re-skin it to a **forensic plate**, token-safe. All edits are in `face-embed.js`'s injected CSS + `buildSection`/`renderCards`/`card`.

### 3.1 The photo + mesh plate

- **Remove** the `.mcfe__hero` (per §1.1). The section now opens directly with the existing `YOUR FACE, MEASURED` chapter label (which lives in `audit.html`, already present) then the photo plate.
- **Frame the photo as a specimen, not a thumbnail:**
  - Bump `.mcfe__canvas` max-width from 300px to **320px** mobile, and allow **up to 360px** at ≥768px. Keep `width:100%; height:auto`.
  - Border: keep `1px solid var(--mc-line)`. Radius: change `--mc-r-3` (8px) is fine — keep 8px (sharp-luxury, not rounded-app).
  - Add a **caption line** under the plate, mono, that names what the viewer is looking at — this is the single detail that turns a selfie into a forensic exhibit:
    ```
    PLATE 01 · 478 LANDMARKS MAPPED
    ```
    Style: `.mcfe__plate-cap { font-family: var(--mc-font-mono); font-size: 10px; letter-spacing: var(--mc-ls-wide); text-transform: uppercase; color: var(--mc-silver-faint); text-align: center; margin-top: var(--mc-sp-3); }`. This is a structural exhibit label (like §2.1 indices), not Consultant copy — but flag it `<!-- TODO copy review: plate caption -->` so the founder can veto.
  - **Mesh overlay stays white** (`rgba(255,255,255,0.55)` dots, `0.85` lines) — that is already the light-point/silver family and reads as precision instrumentation. Do not tint it. Do not thicken it. It is correct.
- **Optional, restraint-tested:** a 1px inner top-highlight on the plate via the existing `--mc-shadow-ambient` (which already carries `0 1px 0 rgba(255,255,255,0.04) inset`). Apply `box-shadow: var(--mc-shadow-ambient)` to `.mcfe__canvas` so the plate sits on the page with depth instead of floating flat. This is the one shadow it should carry.

### 3.2 The KPI card grid

The grid is the dossier's data table. Make each card read like a measured entry on an instrument, not a tile.

- **Grid:** keep `grid-template-columns: 1fr 1fr; gap: var(--mc-sp-3)` (12px), collapsing to 1 column at ≤520px (already there). On a 360px phone, 1fr/1fr at 12px gap is tight but holds for these short values — keep 2-col down to 520px as is. Consider bumping the gap to `var(--mc-sp-4)` (16px) ≥768px for more air; optional.
- **Card surface:** keep `background: var(--mc-near-black)`, `border: 1px solid var(--mc-line)`, radius 8px. Add `padding: var(--mc-sp-4)` (already 18px-ish; standardize to the 16px token). Add the ambient inset shadow `var(--mc-shadow-ambient)` so cards have the same lit depth as the plate — consistency reads as craft.
- **Card hover (desktop / `@media (hover:hover)`):** the cards are currently static. Add a quiet hover that lifts the hairline to `--mc-line-bright` and the key label to `--mc-silver-mid`:
  ```
  @media (hover: hover) {
    .mcfe__card { transition: border-color var(--mc-dur-base) var(--mc-ease); }
    .mcfe__card:hover { border-color: var(--mc-line-strong); }
  }
  ```
  No glow, no lift-transform, no scale — that would betray restraint. Just the hairline brightening, matching `.mc-blur-wrap:hover`. Respect `prefers-reduced-motion` (the tokens.css global already neutralizes transitions).
- **Card internals — fix the hierarchy inside each card.** Current order is key (mono, faint) → value (serif italic) → sub (silver-dim) → bar. Good bones. Tighten:
  - Key label `.mcfe__k`: mono 10px, `--mc-ls-wide` (0.16em), `--mc-silver-faint`, `margin-bottom: var(--mc-sp-2)`. (Currently 0.16em — keep.)
  - Value `.mcfe__v`: serif **italic**, `--mc-fs-h3`-ish (20–24px), `--mc-silver-bright`. The italic serif on a hard mono label is the exact high-contrast pairing the brand wants. Keep italic.
  - Sub `.mcfe__cs`: Sora, 12.5px, `--mc-silver-dim`, `line-height:1.4`. Keep.
- **The progress bars (`.mcfe__bar`) — this is the biggest single upgrade in this block.** A solid silver fill bar looks like a generic app meter. Replace the solid fill with a **brushed-silver gradient** so it reads as a measured gauge:
  ```
  .mcfe__bar   { height: 2px; background: var(--mc-line); border-radius: 2px; overflow: hidden; margin-top: var(--mc-sp-3); }
  .mcfe__bar i { display:block; height:100%; background: var(--mc-silver-gradient-h); }
  ```
  Use `--mc-silver-gradient-h` (the horizontal brushed-metal gradient already in tokens — it's literally built for horizontal bars). Drop the bar height from 3px to **2px** — thinner reads more precise/instrument-like. This matches the `.mc-progress__fill` pattern already used in the quiz.
  - Optional light-point touch (restraint-tested, use only if it doesn't get busy): a 1px white tick at the fill's leading edge via `box-shadow: 1px 0 4px var(--mc-light-point-glow-soft)` on `.mcfe__bar i`. This echoes the logo dot at the "current measurement" point. If it adds noise across 6 bars, cut it — the gradient alone is enough.
- **The "Facial Ratios" rows card (`.mcfe__rows`):** keep the two-column `space-between` (name left, value right) — that's a proper data table row. Tighten: name in `--mc-silver-dim`, value `<b>` in `--mc-silver-bright` (already). Make the `· ideal 1.6` portion `--mc-silver-faint` so the user's actual value reads as the figure and the ideal as a quiet reference. Add a 1px `--mc-line` divider between rows for the ledger feel: `.mcfe__rows div { border-bottom: 1px solid var(--mc-line); }` (remove on `:last-child`).

### 3.3 Token-safety note for face-embed.js

`face-embed.js` injects its own `<style id="mcfe-style">` with **hardcoded fallbacks** (e.g. `var(--mc-silver-bright,#e8e8e8)`). Those fallbacks are correct values and only fire if the token is missing — which it never is on this page (`body.lookmaxing` is set). **Keep the `var(--mc-token, #fallback)` pattern** when editing this file; do not strip the fallbacks and do not hardcode a bare hex. Every colour referenced must be a `--mc-*` token (with optional matching fallback).

---

## 4. Paywall CTA + blurred premium blocks — make the locked depth desirable

The locked sections are the conversion engine. Right now they read as "grey blurred bars," which signals *absence* (something is missing) rather than *depth* (something valuable is withheld). The fix is to make the blur look like a **vault window onto a richer document** — you can see the shape of the value, you just can't read it yet.

### 4.1 The gate CTA (`#gate-teaser`) — the page's one hero CTA

- This is the **single `--filled` light-point CTA** on the page (the sticky mobile CTA reuses it on scroll — that's fine, it's the same action). Keep `mc-btn-primary--filled` with its breathing glow. Do **not** add a second filled/glowing CTA anywhere.
- Frame the CTA in a quiet **gate panel** so it reads as a threshold, not just a button on black:
  - Wrap `#gate-teaser` content in the `.mc-card` surface (`--mc-near-black`, `--mc-line`, radius 8px, `--mc-shadow-ambient`) — OR, more elegant, give it a top + bottom hairline only (open on the sides) so it reads as a "gate" the document passes through. Prefer the **hairline-gate** look: `border-top: 1px solid var(--mc-line-strong); border-bottom: 1px solid var(--mc-line-strong); padding: var(--mc-sp-6) 0;`.
  - Center the existing teaser line (`.lm-gate-teaser__line`) — keep its copy verbatim — in serif? No: keep it as set (small, `--mc-silver-dim`) so the CTA stays the loudest thing. The price sub-line (`.lm-gate-teaser__sub`) stays mono-feel, `--mc-silver-faint`.
- **Spacing:** `--mc-sp-3` between line and button, `--mc-sp-3` between button and sub-line. The CTA `min-height` is 48px (token) — keep; it's a comfortable tap target.

### 4.2 The blurred blocks — depth, not grey bars

Each blurred block (`.lm-blur-block` → `.mc-blur-wrap` → `.mc-blur-gate`) already has good machinery: a real structured teaser skeleton underneath (true labels, masked values, swatches), a silver gradient overlay (`::before`), and a vignette (`::after`). The problem is it reads flat. Upgrades, all token-safe:

1. **Reduce the blur slightly so the *structure* is legible but the *content* isn't.** Current `filter: blur(6px) saturate(0.8)`. Drop to `blur(5px)` — the eye should clearly perceive "there are five vectors here, with scored bars and swatches," which is what creates desire. Too much blur = grey mush = "nothing there." (Do not go below 4px or values become readable, breaking the gate.)
2. **A "LOCKED" affordance on each block** — currently the only unlock cue is the whole-block click. Add a small, quiet lock marker at the top-right of each `.mc-blur-wrap`, using the light-point vocabulary sparingly: a mono micro-label, not an icon font.
   ```
   .lm-lock-tag {
     position: absolute; top: var(--mc-sp-3); right: var(--mc-sp-3); z-index: 3;
     font-family: var(--mc-font-mono); font-size: 10px; letter-spacing: var(--mc-ls-wide);
     text-transform: uppercase; color: var(--mc-silver-dim);
     display: inline-flex; align-items: center; gap: var(--mc-sp-2);
   }
   ```
   Content: a 4px `--mc-silver-faint` dot (NOT the glowing light-point — a static dot) + the word `LOCKED`. `LOCKED` is a UI affordance label, not Consultant copy — but flag `<!-- TODO copy review: lock tag -->`. This sits above the vignette (z-index 3) so it's crisp while the content behind blurs.
3. **Make the vignette pull the eye to the lock/CTA, not just darken.** The existing `::after` radial vignette is good. Strengthen it marginally at the bottom edge so each block visually "fades into the lock" — adjust the radial to bias downward: `radial-gradient(ellipse at 50% 35%, transparent 0%, rgba(0,0,0,0.42) 100%)`. Keeps content shape visible up top, darkens toward where the CTA lives.
4. **Hover/focus on a locked block** should *invite*, within restraint: the existing `:hover` lifts the border to `--mc-line-bright`. Add a faint glow that says "this opens": on `.mc-blur-wrap:hover`, `box-shadow: 0 0 24px var(--mc-light-point-glow-soft)`. This is the ONLY place besides the CTA the glow appears, and only on intent (hover/focus), so it doesn't violate the once-per-screen rule for the *resting* state. On touch devices there's no hover, so the resting lock tag + the sticky CTA carry the affordance.
5. **The teaser skeleton under the blur** (`buildTeaser` output: `.lm-teaser-head`, `.lm-teaser-row`, `.lm-teaser-bar`/`.lm-teaser-tick`, `.lm-teaser-swatches`) is already excellent — it renders *real* structure (vector names, scored tick-bars, colour swatches). **Keep it.** Two refinements:
   - The tick bars (`.lm-teaser-tick.is-on`) currently fill with `--mc-silver-mid` solid. Leave as-is under blur (gradient detail is lost at 5px blur anyway) — no change needed.
   - The colour swatches in the chromatic block are the single most desire-inducing detail (real colour behind the blur). Ensure they render even when masked — they already do. Keep ≥4 swatches visible.

### 4.3 Sequencing the locked blocks (rhythm)

The five locked blocks currently sit at identical spacing. Apply the §2.3 chapter rhythm: `--mc-sp-7` (48px) between each blurred block (they ARE chapters 02–05 + methodology). Each keeps its numbered mono header (`02 · …`). This makes the locked half of the page feel like a thick second volume the user is being invited into — which is the conversion story.

### 4.4 Paywall modal

The modal (`.lm-paywall-modal`) is already on-brand (mc-card, serif italic heading, silver-gradient price, light-point pay button). **Do not redesign it.** One micro-polish only: the price `₹99` (`.lm-paywall__price`) uses `--mc-fs-h1` (36px) silver-gradient — bump to `--mc-fs-display` (56px) so the price is the hero of the modal the way the score is the hero of the page. Everything else in the modal stays exactly as built.

---

## 5. Concrete token reference + what NOT to change

### 5.1 Exact tokens to use (no new values introduced anywhere)

**Colour**
- Field: `--mc-near-black` `#0a0a0a` (page bg, set). Cards/plate: `--mc-near-black`.
- Structure: `--mc-silver-bright` (values), `--mc-silver-mid` (rank, key data), `--mc-silver-dim` (labels, sub-copy), `--mc-silver-faint` (captions, indices, hairline-adjacent), `--mc-silver-ghost` (arc track).
- Hairlines: `--mc-line` (default 1px), `--mc-line-strong` (gate borders, card hover), `--mc-line-bright` (active).
- Silver gradients: `--mc-silver-gradient` (vertical — numerals, price), `--mc-silver-gradient-h` (horizontal — KPI bars).
- Light-point: `--mc-light-point` `#ffffff` (ring dot only), `--mc-light-point-glow-soft/-mid/-hot` (CTA glow, hero halo, hover glow). **One resting glow per screen = the CTA.**
- Atmosphere: `--mc-aubergine-glow` (already in page bg radial — do not add more).

**Type**
- Display/values: `--mc-font-serif` (Cormorant), italic via `.mc-serif--italic` / `font-style:italic`.
- Body: `--mc-font-sans` (Sora), weight 300.
- Data/labels/eyebrows/indices/captions: `--mc-font-mono` (JetBrains Mono).
- Sizes: `--mc-fs-display` 56px (hero numeral, modal price), `--mc-fs-h3` 20px (KPI values, impression line), `--mc-fs-body` 16px, `--mc-fs-small` 14px, `--mc-fs-eyebrow` 11px, `--mc-fs-mono` 13px.
- Tracking: `--mc-ls-xwide` 0.28em (eyebrows, rank), `--mc-ls-wide` 0.16em (mono labels, indices, captions), `--mc-ls-tight` -0.01em (serif headlines).
- Line-height: `--mc-lh-tight` 1.15 (display), `--mc-lh-body` 1.65 (reading).

**Spacing** (4px base): `--mc-sp-2` 8 · `--mc-sp-3` 12 · `--mc-sp-4` 16 · `--mc-sp-5` 24 · `--mc-sp-6` 32 · `--mc-sp-7` 48 · `--mc-sp-8` 80.
Chapter rhythm = `--mc-sp-7` before a section head, `--mc-sp-4` after it.

**Radii**: `--mc-r-2` 4px (buttons, pills), `--mc-r-3` 8px (cards, plate, blur-wrap), `--mc-r-full` (dots). Keep things sharp — no large radii.

**Shadows**: `--mc-shadow-ambient` (cards, plate — the lit-depth inset), `--mc-shadow-elevated` (modal only), `--mc-shadow-light-point` (do not add new — the CTA's glow is set inline in tokens).

**Motion**: `--mc-dur-base` 280ms / `--mc-ease` for hovers; `--mc-dur-slow` 520ms / `--mc-ease-out` for bar/arc reveals. The arc count-up (1400ms, cubic ease-out) is bespoke in JS — leave it.

### 5.2 Mobile-first behavior (360px reference)

- Hero ring 160px, numeral 56px — fits 360px with the §1.2 halo (280px halo is wider than the ring but stays within the 360 − 32 padding ≈ 328px content box; cap the halo at `min(280px, 80vw)`).
- KPI grid: 2-col down to 520px, then 1-col. On 360px the 2-col holds for short values; if any value wraps awkwardly in testing, drop the 2-col breakpoint to ≤600px. Frontend: verify at 360px.
- Photo plate: 320px max, `width:100%` — on 360px it's ~328px, full-bleed within padding. Good.
- Sticky unlock CTA: already fixed-bottom, appears once the first locked block scrolls past. Keep. It is the same action as the gate CTA — not a second hero.
- Tap targets: CTA 48px, ghost/share 44–46px — all meet the 44px minimum. Keep.

### 5.3 Accessibility

- Silver-on-obsidian contrast: `--mc-silver-bright #e8e8e8` on `#0a0a0a` ≈ 16:1 (AAA). `--mc-silver-dim #8a8a8a` on `#0a0a0a` ≈ 5.0:1 — fine for the small-caps labels (≥AA) but **do not** use `--mc-silver-faint #5a5a5a` (≈2.4:1) for anything the user must *read* — it is for captions, indices, hairlines, and decorative marks only, never body copy. The spec above honors this; frontend must too.
- The mesh overlay and KPI bars are decorative-adjacent; the values are also given as text (e.g. `60 / 100`), so colour is never the only channel. Good.
- `prefers-reduced-motion`: the tokens.css global already neutralizes animations/transitions and the arc transition; the CTA breathing glow is disabled. Any NEW transition added (card hover, bar fill, blur-wrap glow) inherits that global override — confirm none use `!important` to escape it.
- Focus states: the global `:focus-visible` (2px `--mc-light-point` outline, 3px offset) covers all new interactive elements. The blur-wraps already have a focus-visible rule. Do not remove.

### 5.4 What must NOT change (protect these)

- **The Aura ring SVG geometry, gradient def, arc animation, count-up, and light-point dot math** in `audit.html` — correct and on-brand. Touch only the surrounding frame, not the object.
- **All locked copy strings** — every user-facing sentence in the gate teaser, paywall bullets, first-impression framing, section-label text, footer. Reposition only.
- **The token file `tokens.css`** — no edits. This page consumes tokens; it does not define them. (If a genuinely missing token were needed, that's a separate change to the source `product/design-lookmaxing-tokens.css` + re-copy — but this spec needs zero new tokens.)
- **The diamond `◆` usage and the "one light-point per screen" discipline** — the CTA glow + the ring dot are the two sanctioned light-points; the hover-glow on blur-wraps fires on intent only. No third resting glow.
- **The blur machinery** (`.mc-blur-gate` filter approach, the teaser skeleton, the click-to-paywall wiring) — refine values (§4.2) but keep the structure; it's the conversion mechanism and it's well-built.
- **No frameworks, no new fonts, no images** — CSS/SVG only, per CLAUDE.md and the frontend-design skill's restraint mandate.

---

## 6. Implementation checklist for frontend-agent (ordered, smallest-diff first)

1. **`face-embed.js`:** delete `.mcfe__hero` from `buildSection()` + its 3 CSS rules (`__num`, `__label`, `__sub`). Kills the competing "72." (§1.1)
2. **`face-embed.js`:** KPI bars → `--mc-silver-gradient-h`, 2px height; cards get `--mc-shadow-ambient` + hover hairline; rows get `--mc-line` dividers; plate to 320/360px + caption line + ambient shadow. (§3)
3. **`audit.html`:** hero zone — `position:relative; isolation:isolate`, top/bottom `--mc-sp-7`, the soft light-point halo `::before` (capped `min(280px,80vw)`), masthead eyebrow with static `◆`, closing `.mc-hairline`. (§1.2–1.4)
4. **`audit.html`:** section-label rhythm — `margin: var(--mc-sp-7) 0 var(--mc-sp-4)`; add `.lm-section-label__index` mono numbers (00/01) to the free sections. (§2)
5. **`audit.html`:** gate CTA → hairline-gate panel (top/bottom `--mc-line-strong`, `--mc-sp-6` padding). Modal price → `--mc-fs-display`. (§4.1, §4.4)
6. **`audit.html`:** blurred blocks — blur 6→5px, `.lm-lock-tag` per block, downward-biased vignette, hover light-point-glow-soft, `--mc-sp-7` between blocks. (§4.2–4.3)
7. Add `<!-- TODO copy review -->` on the three new structural labels (section indices are fine as figure-marks; the plate caption + lock tag get the flag).
8. Verify at **360px**, run through `prefers-reduced-motion`, tab the focus order, and confirm no new `!important`. Hand to quality-judge for visual review against this spec.

---

### Reference patterns applied (extracted, not copied)
- **Patek / watch service report:** numbered spine, a single hero figure framed by quiet metadata, hairline chapter rules → §1.3, §2.1.
- **Aesop / Tom Ford editorial:** narrow measure, generous asymmetric vertical rhythm, mono "ingredient/specimen" captions, restraint over ornament → §2.3, §3.1.
- **Apple AirPods Pro page:** one lit hero object on a dark field with a soft internal glow; everything else is supporting data at lower altitude → §1.2.
- **Linear / Vercel:** hairline-bordered cards on near-black, glow-on-intent (hover) never glow-at-rest, precise thin gauges → §3.2, §4.2.

The test: a stranger lands, sees one luminous score on black framed like the cover of an expensive document, a measured face plate that proves rigour, and a thick locked second volume they can *see the shape of* — and within three seconds feels this is a serious, premium instrument, before reading a word.
