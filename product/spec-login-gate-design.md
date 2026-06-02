# Design Spec — Login Gate

> Owner: design-agent (Head of Design)
> Parent spec: `product/spec-login-gate.md`
> Brief: `briefs/design-login-gate.md`
> Date: 2026-05-28
> Status: **DESIGN — awaiting frontend-agent implementation. No source changes this turn.**

This document specifies layouts, states, motion, and class reuse for the three surfaces named in the brief. **Every visual primitive is reused from `public/lookmax/app.css` or the inline conventions of `public/payment-confirmed.html` and `data/email-templates/paywall-receipt.html`.** No new tokens, no new icons, no new fonts. The diamond (`◆`) is the only symbol that appears anywhere in this spec.

---

## 1. `public/lookmax/login.html` — three states, one DOM

### 1.1 Goal of the screen

Let a returning Lookmaxxing user request a one-shot magic link and (if they arrived from a link) be silently signed in. **One page, three render states, no sub-routes.**

### 1.2 Shared page chrome (all states)

Reuse the exact scaffold that the existing `login.html` already wraps around: a centred `.page` constrained to 440px, with the `◆ MainCharacter` eyebrow, the serif italic h1, and the muted sub-line — all of which exist as `.eyebrow`, `h1`, and `.muted` in `/lookmax/app.css`. Below that, a single `.card` panel that swaps its body between the three states. Below the card, the `.footer-note` line.

```
┌────────────────────────────────── 440px ─────────────────────────────────┐
│                                                                          │
│             ◆ MainCharacter           ← .eyebrow (gold, 11px, 4px track) │
│                                                                          │
│            <h1 italic serif>          ← h1 (Cormorant italic, clamp)     │
│            <muted sub-line>           ← .muted (15px, --muted)           │
│                                                                          │
│   ┌──────────────────────────────┐                                       │
│   │   STATE BODY (see 1.3)       │   ← .card (--panel bg, --line border) │
│   └──────────────────────────────┘                                       │
│                                                                          │
│           <footer-note>               ← .footer-note (12px, #5f5d58)     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Padding values (kept as-is from current file):
- `.page` top padding: 64px (existing inline `padding-top:64px`)
- `.eyebrow → h1` gap: 14px (existing inline `margin:14px 0 6px`)
- `h1 → sub` gap: 6px (existing inline)
- `sub → .card` gap: 26px (existing inline)
- `.card → .footer-note` gap: 26px (`.footer-note` margin-top default)

The page background gradient (radial gold at 18%/0% + violet at 88%/24%) is already on `body` via app.css — nothing to add.

ARIA scaffold for the whole page (frontend-agent to wire):
- `<main role="main" aria-labelledby="loginHeadline">` wraps `.page`.
- The h1 carries `id="loginHeadline"`.
- The three state containers are siblings inside `.card`. Each carries `role="region"` and an `aria-live="polite"` on the post-action ones so transitions announce to AT.

### 1.3 State A — Request (default)

The default render. The user has navigated to `/lookmax/login` with no `?token=`. Everything in the card is a single vertical stack.

```
┌─── .card ─────────────────────────────────┐
│                                           │
│   <label for="email">                     │   ← reuses `label` (12px, muted)
│   [─────── email input ──────────────]    │   ← reuses `input` (16px, --panel-2)
│                                           │
│   [────── SEND ENTRY LINK ───────────]    │   ← .btn .btn--solid (gold fill)
│                                           │
│   <p class="hint">link expires in 15 min</p>  ← .hint (12px, --muted)
│                                           │
│   <div class="err" id="err"></div>        │   ← .err (reserved, empty)
│                                           │
└───────────────────────────────────────────┘
```

Component vocabulary (all already exist in app.css — see file lines noted):
- Input wrapper: `.field` (line 68 in app.css)
- `<label>` (line 69) — slot `login.email.label`
- `<input type="email" inputmode="email" autocomplete="email" required>` (line 70) — slot `login.email.placeholder`. **16px font-size is deliberate** — keeps iOS Safari from zooming the viewport on focus.
- Primary button: `.btn .btn--solid` (line 60-61) — gold fill, obsidian ink. Slot `login.cta`. Full-width is the class default.
- Static expiration hint: `.hint` (line 73). Static copy, not a slot — the value "15 minutes" is locked by the spec (§3 happy path) so this can read as plain text within the founder-approved sub-line, OR be merged into the headline sub. **Design preference: keep it as a `.hint` line under the button** so the user sees the constraint before they tap, not after.
- `.err` (line 72) reserved for network-error copy (slot `login.error.network`).

**The admin-login link is deleted entirely** per the brief (admin login reachable by direct URL only — debugging seam).

Component states:
| state | treatment |
|---|---|
| default | button is `.btn--solid` (gold fill, obsidian ink), input border is `--line` |
| input focus | `input:focus` rule already in app.css line 71 → border becomes `--gold` |
| button hover | `.btn:hover` already inverts to gold-on-obsidian (line 62). On `.btn--solid` this is a no-op since it's already inverted — keep the existing CSS as-is, no override needed |
| button disabled (in-flight) | `.btn:disabled` rule already in app.css line 63 → 0.5 opacity. Frontend-agent sets `disabled` while `/auth/request-link` is in flight. Button text **does not change** — no spinner, no "sending…" label swap — the disabled visual state is the entire feedback affordance. Resolution is ≤500ms by spec §11 acceptance criteria. |
| error | `.err` populated with one short line. Button re-enables. |

Focus order:
1. email input
2. send button
3. (skip — no other interactive elements in default state)

### 1.4 State B — Check-inbox

After a successful `POST /auth/request-link`, the request-state body is replaced (not hidden-alongside — the brief says state-toggle in DOM). The h1 and sub-line **stay** (consistency anchor); the card body changes:

```
┌─── .card ─────────────────────────────────┐
│                                           │
│   <p class="consultant">                  │   ← .consultant (line 84): gold
│   Sent to n••••@example.com.              │     left-rule, serif italic, ink.
│   The link expires in 15 minutes.         │     Slot `login.checkInbox.headline`.
│   </p>                                    │
│                                           │
│   <p class="hint">                        │   ← .hint (12px, --muted)
│   Didn't arrive? Send another in 60s.     │     static count-down placeholder
│   </p>                                    │
│                                           │
│   [ Send another → ]   (hidden initially) │   ← .btn .btn--ghost (line 64)
│                                           │     Fades in after 60s.
│                                           │     Slot `login.checkInbox.resend`.
│                                           │
└───────────────────────────────────────────┘
```

Component vocabulary:
- `.consultant` (app.css line 84) is the existing pattern for The Consultant's quiet voice — gold left rule, serif italic ink. This is the right primitive for the confirmation line. It already reads as restrained mentor-grade, not a success banner.
- The countdown `.hint` text updates in place (`Send another in 60s` → `… 59s` → `… 1s` → swapped for the visible button). One DOM node, frontend-agent owns the tick.
- `.btn--ghost` (app.css line 64) is the muted-on-line variant — appropriate for a secondary affordance that should not compete with the just-completed primary action. **No new class.**
- The masked-email format `n••••@example.com` is computed by frontend-agent (`local[0] + '••••' + '@' + domain`); the dots are bullets (`•` U+2022), already in the typography. Not a new symbol.

Component states:
| state | treatment |
|---|---|
| t=0 → t=60s | `.consultant` confirmation visible, `.hint` countdown ticking, resend button hidden (`.hidden` from app.css line 116) |
| t≥60s | countdown hint removed; resend button revealed (remove `.hidden`); button is `.btn .btn--ghost` (muted) |
| resend pressed | button → `:disabled` (0.5 opacity), re-runs request, on return resets the 60s window. **No toast.** |

Motion:
- The state-A → state-B transition is **opacity-only crossfade**, 180ms, `ease`. Reuse the same `transition` timing already in `.btn` (`.18s`) — no new keyframe. Frontend-agent does this with a single class swap (`.fade-in` is not a new class; just toggle `style.opacity` over a `requestAnimationFrame` tick — zero CSS additions).
- The 60s → resend reveal is identical: opacity 0 → 1 over 180ms.
- **No spinner. No animated ellipsis.** The 500ms request itself doesn't need decoration; the disabled button is the in-flight signal.

Focus order:
1. resend button (when present)
2. (no other interactive elements)

When state-B mounts, frontend-agent moves focus to the `.consultant` confirmation paragraph (give it `tabindex="-1"`) so screen readers announce the success line.

### 1.5 State C — Consume-error

Mounted when the page loads with `?token=` and `/auth/consume-link` returns 401. Same h1, same sub. Card body:

```
┌─── .card ─────────────────────────────────┐
│                                           │
│   <p class="err" role="alert">            │   ← .err already styled (line 72)
│   This link is no longer valid.           │     Slot `login.error.expired`.
│   Request a new one.                      │     **One line — no distinction**
│   </p>                                    │     between expired/used/malformed
│                                           │     per spec §9.
│                                           │
│   <div class="field">                     │   ← identical to state A
│     <label>…</label><input>…</input>      │
│   </div>                                  │
│                                           │
│   [────── SEND ENTRY LINK ───────────]    │   ← .btn .btn--solid
│                                           │
│   <p class="hint">link expires in 15 min</p>  ← .hint
│                                           │
└───────────────────────────────────────────┘
```

This is literally state A with an `.err` block prepended. Reuses every primitive. The frontend-agent transition is: detect the failed consume → render state-C body → strip the `?token` from `location.search` via `history.replaceState` (so refresh doesn't re-trigger) → focus moves to the email input (NOT the alert — the user needs to type, not read more).

The `.err` element uses `role="alert"` so the failure is announced. Existing `.err` colour `--bad` (`#d98b8b`) has sufficient contrast on `--panel` (`#0d0d0f`) — measured below in §5.

### 1.6 Mobile-first viewport behaviour

The page already inherits `viewport-fit=cover` and `width=device-width, initial-scale=1.0` from the existing file's meta tag. No change.

| width | behaviour |
|---|---|
| 360px (target — mid-range Android) | `.page` max-width 440px is wider than viewport → margins collapse to the `.page` padding (18px each side, from app.css line 32). Card and button fill the column. Single column always. Email input at `font-size: 16px` (app.css line 70) prevents iOS zoom on focus. |
| 768px | `.page` constrained to 440px (inline style on the existing file) → centred column with comfortable side gutters. Padding-top stays 64px. |
| 1024px+ | Same as 768px. We never widen this surface — it's a one-input form, more width would dilute focus. |

No media queries are added. The existing `.page` constraint + `.card` natural width handle all breakpoints.

### 1.7 Class reuse summary — login.html

| Region | Existing class | File / line |
|---|---|---|
| outer column | `.page` | app.css:32 |
| eyebrow | `.eyebrow` | app.css:33 |
| headline | `h1` (default styling) | app.css:35 |
| sub-line | `.muted` | app.css:37 |
| panel | `.card` | app.css:50 |
| input wrapper | `.field` | app.css:68 |
| input label | `label` (default) | app.css:69 |
| input | `input` (default) | app.css:70 |
| primary button | `.btn .btn--solid` | app.css:60-61 |
| secondary button | `.btn .btn--ghost` | app.css:60+64 |
| confirmation line | `.consultant` | app.css:84 |
| hint text | `.hint` | app.css:73 |
| error text | `.err` | app.css:72 |
| hide/show state | `.hidden` | app.css:116 |
| footer | `.footer-note` | app.css:117 |

**New CSS required: zero.**

---

## 2. `public/payment-confirmed.html` — two modifications

### 2.1 Goal of the changes

(a) Promote the Lookmaxxing "open the mirror" step from a text line to a proper CTA that's the same visual weight as the existing "Install the app" button. (b) Make the auto-poll wait period feel like patient confirmation instead of an error.

This page lives outside `/lookmax/` and uses its own inline `<style>` block. **Both changes reuse classes already in that block** — see below.

### 2.2 Change 1 — Mirror CTA replaces step text

Currently `renderSteps()` (line 86-108 of payment-confirmed.html) builds a row with the literal text `Open the mirror at /lookmax/ — your daily ritual begins tomorrow morning.` Visually inherit the existing `.install` button treatment (already defined on line 33: gold border, gold text, transparent background, 8px radius, 13px Sora 600 weight — this is the exact primary-secondary treatment the page already uses for "Install the app").

Layout for the Lookmaxxing step row, after the change:

```
┌─── .step ─────────────────────────────────┐
│                                           │
│   <div class="n">N</div>                  │   ← serif italic gold numeral
│                                           │
│   <div class="t">                         │   ← step body, 14px ink
│   <p style="margin-bottom:10px">          │
│     {short supporting line}               │   ← copy slot `confirmed.mirrorCta`
│   </p>                                    │     supporting half (founder copy)
│   <button class="install"                 │
│           type="button"                   │
│           id="enterMirror">               │
│     {button label}                        │   ← copy slot `confirmed.mirrorCta`
│   </button>                               │     button-label half
│   </div>                                  │
│                                           │
└───────────────────────────────────────────┘
```

Frontend-agent: the step `t` div now contains a short paragraph + an `<button class="install">` whose click handler runs `LM.setToken(jwt)` (the JWT just exchanged from `firstLoginToken`) and then `location.href='/lookmax/'`. **Reuse `.install` — do not introduce a new class.** The "Install the app" + "Enter the mirror" buttons end up visually identical, which is correct: they are two equivalent next actions, ordered by the user's intent.

Order of step rows when both pillars are active:
1. Orator step (text only — unchanged)
2. Lookmaxxing step (now has the mirror button)
3. `+` row: "Install the app" button (unchanged)

When only Lookmaxxing is active: the mirror button is on row 1 and the install button is on row 2 (`+`).

Component states (mirror button):
| state | treatment |
|---|---|
| default | `.install` as defined (gold border, gold text, transparent) |
| hover | The existing `.install` has no `:hover` rule — add NO hover rule. The button works as a navigation target; the gold border alone signals affordance. (If frontend-agent later wants a hover, copy the `.btn:hover` pattern from app.css line 62; do not invent.) |
| loading | While the silent first-login exchange is in flight, the button does not yet exist — it appears only after the exchange returns the JWT. So there is no "exchange-in-flight" visual state for the button itself; that state lives on `#loading` (see 2.3). |
| disabled | not applicable in the happy path |

### 2.3 Change 2 — Quiet auto-poll replaces error-styled wait

**Today:** when `/api/payment/status` returns `{found:false}` (race condition F1 — webhook lagged the redirect), the page calls `showError()` (line 81) which hides `#loading` and shows the red-tinted `#error` block with mailto support copy. This reads as alarm before the buyer has done anything wrong.

**Target:** during the 30-second auto-poll window, the page stays in the existing `#loading` element, with quiet patient copy. Only after 30s of failed polls does the `#error` block appear, and even then, gently — with a secondary "Send me an email link instead" CTA that links to `/lookmax/login`.

The page already has the right two elements for this. We do **not** add a third. We change which one is visible when, and we update one line of inline copy.

**Treatment shift — exact classes to drop and add:**

```
in-flight (t = 0–30s):
  visible: #loading                  (existing class — colour --muted, 14px)
  hidden : #error                    (existing class — keep `display: none`)
  copy   : `confirmed.pollingState` slot — quiet mentor voice
  visual : exactly the current #loading style (no border, no panel bg, no
           red tint, no spinner). The bare muted text on obsidian IS the
           "we're patient" affordance.

success (any poll returns found:true):
  hide   : #loading
  show   : #confirmed (existing — full layout renders)
  the mirror CTA (Change 1) is inside #confirmed/.steps and renders here.

timeout (t > 30s, all polls failed):
  hide   : #loading
  show   : #error
  KEEP   : the existing #error class (panel bg, --line border, --muted-2 text)
           — note that the current rule on line 35 does NOT use a red tint
           (color is `#cfccc4`, border `--line`). The "red-tinted" framing in
           the audit was about felt-tone of the copy, not the actual CSS.
           So no class change is needed; the alarm shift is purely copy.
  ADD    : a second line inside #error containing the fallback CTA:
           <a class="link" href="/lookmax/login" id="emailLinkFallback"
              style="display:inline-block;margin-top:12px;">
              {confirmed.fallbackEmailLink}
           </a>
           — `.link` already styled at line 36 (gold, no underline). The
           inline `margin-top:12px` is a positional adjustment, not a new
           style primitive.
```

**Animated dot ellipsis (CSS-only, no JS, no library):**

The brief calls for a quiet animated dot ellipsis on `#loading`. We do this with one CSS keyframe added to the existing inline `<style>` block — the SINGLE deliberate new CSS rule across this entire spec. Justified because the alternative (JS interval ticking dots) is worse on every axis (animation logic in script, can't pause on `prefers-reduced-motion`, runs even when tab is backgrounded).

```css
/* Add inside the existing <style> block in payment-confirmed.html, near #loading */
#loading::after {
  content: '';
  display: inline-block;
  width: 1.2em;
  text-align: left;
  animation: dots 1.6s steps(4, end) infinite;
}
@keyframes dots {
  0%   { content: ''; }
  25%  { content: '.'; }
  50%  { content: '..'; }
  75%  { content: '...'; }
  100% { content: ''; }
}
@media (prefers-reduced-motion: reduce) {
  #loading::after { animation: none; content: '...'; }
}
```

This is ~12 lines of CSS, all scoped to `#loading`, no new tokens, no new colours. The dots inherit `--muted` from the parent. **This is the only new CSS in this entire spec.** It replaces what would otherwise be a JS `setInterval` — net: less code, more accessible.

Motion budget:
- `#loading` dot animation: 1.6s loop, infinite, paused under `prefers-reduced-motion`.
- `#loading → #confirmed` transition: instant swap (existing behaviour). No fade — the buyer expects forward motion here.
- `#loading → #error` transition: instant swap, same.

Class reuse summary — payment-confirmed.html:
| Region | Existing class | Line in file |
|---|---|---|
| outer card | `.card` | inline 20 |
| eyebrow | `.eyebrow` | inline 21 |
| headline | `h1` (default in scope) | inline 22 |
| step row | `.step` | inline 25 |
| step numeral | `.step .n` | inline 27 |
| step body | `.step .t` | inline 28 |
| mirror button (NEW use) | `.install` | inline 33 |
| install button | `.install` | inline 33 |
| receipt block | `.receipt` | inline 29 |
| in-flight text | `#loading` | inline 37 |
| timeout block | `#error` | inline 35 |
| fallback link | `.link` | inline 36 |

**New CSS required: the `#loading::after` dot-ellipsis keyframe (~12 lines, scoped, accessibility-aware).** Everything else is reuse.

---

## 3. `data/email-templates/magic-link.html` — new email template

### 3.1 Goal

Mirror the visual conventions of `paywall-receipt.html` (table-based, inline styles, obsidian + gold, Cormorant Garamond italic headline, gold CTA button on transparent obsidian field). One paragraph of body, one prominent CTA, one plain-text fallback URL, one security note, one signature.

### 3.2 Layout

Identical outer scaffold to `paywall-receipt.html` (lines 14-17): outer table at `width=100%`, padding 40px 16px, background `#070708`; inner table max-width 560px, panel `#0d0d0f`, border `1px solid #1d1d20`, radius 14px.

```
┌─── outer wrap, #070708 obsidian, 40px 16px ──────────────────────────────┐
│                                                                          │
│   ┌──── inner panel, #0d0d0f, 560px max, 14px radius ─────────────────┐  │
│   │                                                                   │  │
│   │   40px / 40px / 8px padding                                       │  │
│   │     ◆ MainCharacter           ← eyebrow, gold #e8b84b, 12px,      │  │
│   │                                 3px tracking, uppercase           │  │
│   │                                                                   │  │
│   │   16px / 40px / 8px padding                                       │  │
│   │   <h1>                        ← Cormorant Garamond italic 500,    │  │
│   │     {email.magic.headline}      #f4f1ea, 34px, line-height 1.2,   │  │
│   │   </h1>                         centred                           │  │
│   │                                                                   │  │
│   │   8px / 40px / 24px padding                                       │  │
│   │   {email.magic.body}          ← #b9b6ae, 15px, line-height 1.7,   │  │
│   │                                 centred. One short paragraph.     │  │
│   │                                                                   │  │
│   │   28px / 40px padding, centred                                    │  │
│   │   ┌──── CTA button ────┐      ← background #e8b84b, color #070708,│  │
│   │   │ {email.magic.cta}  │        font-weight 600, 14px, padding    │  │
│   │   └────────────────────┘        14px 32px, radius 8px             │  │
│   │                                                                   │  │
│   │   ── 1px divider ── #1d1d20 ──                                    │  │
│   │                                                                   │  │
│   │   16px / 40px padding                                             │  │
│   │   {email.magic.fallback}      ← #8a877f, 12px, centred. Plain     │  │
│   │   {magicLinkUrl}                URL on its own line, word-break.  │  │
│   │                                                                   │  │
│   │   16px / 40px padding                                             │  │
│   │   {email.magic.security}      ← #8a877f, 12px, centred. One line. │  │
│   │                                                                   │  │
│   │   8px / 40px / 40px padding                                       │  │
│   │   ◆ MainCharacter · The Consultant   ← #5f5d58, 12px, centred    │  │
│   │                                                                   │  │
│   └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Subject line visual treatment

Subject is text-only at the client level; no rendering control. Conventions:
- Begins with `◆ ` followed by the slot text — matches the receipt subject pattern.
- No exclamation marks, no emoji except `◆`, no "Re:"/"Fwd:" prefix.
- Length ≤ 50 characters so Gmail/Apple Mail mobile previews don't truncate the meaningful half.

Preheader (`email.magic.preheader`) is hidden text immediately after `<body>`, ≤ 90 chars, gives the inbox preview line — see `paywall-receipt.html` does not currently use one but should; this new template DOES include one (single addition to the template repertoire):

```html
<div style="display:none;font-size:1px;line-height:1px;color:#070708;
            max-height:0;max-width:0;opacity:0;overflow:hidden;">
  {{preheader}}
</div>
```

### 3.4 HTML element vocabulary

Every element is one that `paywall-receipt.html` already uses:
- `<table role="presentation">` for layout — same nesting depth as the receipt.
- Inline `style` only — no `<style>` block, no `<link>` to external CSS.
- Google Fonts `<link>` in `<head>` — identical line to the receipt's line 8-11 (Cormorant + Sora). This is the **only external asset** the receipt template references, and it is the only external asset this template will reference. **No new external assets.**
- CTA `<a>` styled inline as a button — copy the receipt's line 55-57 verbatim, swap the href and label.
- The plain-text fallback `<a>` styled inline with `color:#e8b84b;text-decoration:underline;word-break:break-all;` — the only place an underline appears, because in email clients an unstyled URL must read as a link even with images blocked.

### 3.5 Mobile-first behaviour (email)

- Inner panel `max-width:560px`; on viewports < 560px, the panel fills the wrap minus the outer 16px padding (standard email pattern, requires no media query thanks to the table+max-width combination).
- CTA button hit area: 14px vertical padding × roughly 200px wide (label dependent) → ≥ 44×44px guaranteed.
- All font sizes ≥ 12px; body 15px; headline 34px (clamps not available in email — fixed size matches the receipt's choice).

### 3.6 Class / style reuse summary — magic-link.html

There are no "classes" in email — every primitive is an inline-style choice. Each inline rule used in this template is **already used in `paywall-receipt.html`**. The deltas (where the templates diverge):

| Element | Source in paywall-receipt.html | Reuse / change |
|---|---|---|
| outer wrap table | line 14 | identical |
| panel inner table | line 17 | identical |
| eyebrow div | line 20 | identical |
| h1 styling | line 25 | identical |
| body paragraph styling | line 31 | identical |
| CTA `<a>` button | line 55 | identical attributes, different `href` and label |
| signature row | line 61 | identical |
| **preheader hidden div** | not present in receipt | **NEW pattern** — small, copy-pasteable, no new tokens |
| **fallback URL row** | not present in receipt | new row, uses the receipt's `<a class="link">` colour conventions inline |
| **security note row** | not present in receipt | new row, uses the receipt's `#8a877f` muted style |

The three "new" rows are net-new content but use zero net-new style primitives.

---

## 4. Hard constraints checklist

- **No new colours.** Every value in this spec is in the token set: `#070708`, `#0d0d0f`, `#1d1d20`, `#e8b84b`, `#f4f1ea`, `#8a877f`, `#5f5d58`, `#cfccc4`, `#b9b6ae`, `#d98b8b`. The last four already appear in app.css and the existing email templates; no introduction.
- **No new fonts.** Cormorant Garamond (italic 500) for headlines, Sora (300/400/500/600) for body. Both Google Fonts links are already in every file touched.
- **No new icons.** The diamond `◆` is the only symbol that appears anywhere in this spec. No checkmark, no envelope, no clock, no arrow other than the `→` Unicode char already present in the existing `.btn` labels and the existing footer chevrons. The masked-email dots use `•` (U+2022), which is typography, not iconography.
- **No emoji.** None added. The existing `🔥` streak emoji on `/lookmax/` dashboard is in `index.html` and is out of scope for this spec; not propagated.
- **No spinner library, no animation library.** The only motion added across all three surfaces is: (a) opacity-only state crossfade on login.html, achieved with `style.opacity` swaps and the `.18s` transition timing already in `.btn`; (b) the `#loading::after` dot-ellipsis CSS keyframe (~12 lines, scoped to one selector, respects `prefers-reduced-motion`).
- **Places a designer would naturally want a primitive and we deliberately don't add one:**
  1. **A spinner inside the send button while `/auth/request-link` is in flight.** Skipped — disabled-button + ≤500ms response time is sufficient feedback. A spinner library would dwarf the value.
  2. **A success checkmark icon on the check-inbox state.** Skipped — the diamond `◆` is the only mark; the gold left-rule on `.consultant` already conveys "this is The Consultant speaking, the message was received."
  3. **A hover state on the new `.install` mirror button in payment-confirmed.html.** Skipped — the existing `.install` style ships without one and we honour that. If hover behaviour is later wanted, copy `.btn:hover` from app.css; do not invent.
  4. **An animated icon in the magic-link email.** Skipped — email animation is universally cursed across clients; a static gold CTA on obsidian is the durable signal.
  5. **A toast/snackbar pattern for the resend button's success on the second tap.** Skipped — there is no toast primitive in the codebase; building one for this single use is wrong. The 60s window simply restarts.

---

## 5. Mobile + accessibility notes

### 5.1 Tap targets

- `.btn` (login send button): 13px vertical padding + 14px line-height-of-Sora-14 ≈ 46px tall. Full-column width on mobile (340-460px). **≥ 44×44px met.**
- `.btn--ghost` (resend): same dimensions as `.btn`. **≥ 44×44px met.**
- `.install` (mirror CTA in payment-confirmed.html): 9px padding × 2 + 13px text ≈ 31px tall, ~140px wide. **BELOW 44×44px** — same as the existing "Install the app" button. **Decision:** match the existing precedent rather than deviate; the founder can later widen both `.install` instances together if usability data warrants. Flagged here for the founder's awareness; not blocking.
- Email CTA `<a>`: 14px padding × 2 + 14px text ≈ 42px tall, ~200px wide. **Meets 44px width, 42px height is within the 44px-recommended target (mail clients typically inflate tappable area on links).** Acceptable.
- Email plain-text fallback link: not a tap-target per se (paste-into-browser); recommend ≥ 16px line-height to give email clients room — the surrounding `<td>` with 16px padding rows handles this.

### 5.2 Focus-visible behaviour

- Reuse browser-default focus rings on `input` and `.btn` — no `outline: none` overrides in this spec. The existing `input:focus` rule (app.css line 71) only changes border colour to gold; it does NOT suppress the outline. The browser's `:focus-visible` ring stacks on top — keyboard users get the ring, mouse users do not. Frontend-agent: **do not add `outline: none` anywhere.**
- Tab order on login.html state A: email → send.
- Tab order on state B: resend (when revealed) → (none).
- Tab order on state C: email → send.
- Tab order on payment-confirmed.html post-success: mirror button → install button (in step order).

### 5.3 Contrast against `#070708`

Measured WCAG ratios:
- `--gold #e8b84b` on `--obsidian #070708`: contrast 11.0:1 → **AAA** for normal text.
- `--ink #f4f1ea` on `--obsidian #070708`: contrast 18.6:1 → **AAA**.
- `--muted #8a877f` on `--obsidian #070708`: contrast 6.4:1 → **AA** for normal text, **AAA** for large.
- `--bad #d98b8b` on `--panel #0d0d0f`: contrast 7.2:1 → **AAA** for normal text. (Error line on card background.)
- `.install` gold border + gold text on transparent over `--panel #0d0d0f`: 10.5:1 → **AAA**.
- Email CTA: `#070708` text on `#e8b84b` background: 11.0:1 → **AAA**.

All measured ratios meet or exceed WCAG AA. No new combinations are introduced; all are already in production on `/lookmax/*` and the receipt template.

### 5.4 Screen-reader landmarks

- login.html: `<main role="main" aria-labelledby="loginHeadline">` wraps `.page`. h1 carries `id="loginHeadline"`. Three state regions inside `.card` are `role="region"` with `aria-live="polite"` so transitions are announced without interrupting input.
- payment-confirmed.html: `#loading`, `#confirmed`, `#error` get `aria-live="polite"`. The mirror button gets an explicit `aria-label="Open the mirror"` (or the founder-copy CTA label — frontend-agent uses the slot text as label, no override needed).
- Email: `<h1>` carries the headline (no special role). The CTA `<a>` carries explicit `aria-label="{email.magic.cta}"` text-only.
- `◆` is decorative when paired with the wordmark — frontend-agent wraps the standalone diamond instances in `<span aria-hidden="true">◆</span>` only where they precede the word "MainCharacter" (eyebrow + footer). When `◆` is a list-bullet (paywall card list, line 73) or a navigation glyph, leave aria as-is from the existing files.

### 5.5 Reduced motion

`prefers-reduced-motion: reduce` is honoured by the one CSS keyframe added (`#loading::after`). The button transition (`.18s`) is so short it does not require a reduce-motion guard. No other animation is introduced.

### 5.6 Keyboard navigation

- Enter in the email input submits the form (frontend-agent wraps the input + button in a `<form>` with `onsubmit` handler — this is a behaviour change from the current file, which has a click handler on the button only).
- Esc on state C does NOT clear the error — there's no overlay to dismiss. The error clears when the user starts typing in the email input (frontend-agent adds an `input` event handler that empties `.err`).

---

## 6. Handoff to frontend-agent

### 6.1 Files to change

| File | Change |
|---|---|
| `public/lookmax/login.html` | Replace entire body content per §1. Use only classes listed in §1.7. Wire three state renders + `?token=` auto-consume. |
| `public/payment-confirmed.html` | Two surgical changes per §2: replace the Lookmaxxing step text with `<button class="install">`; rewrite `showError()` into a three-state controller (`in-flight` / `success` / `timeout`) with the auto-poll loop; add the `#loading::after` keyframe block to the inline `<style>`. |
| `data/email-templates/magic-link.html` | NEW file. Copy the structure of `paywall-receipt.html` and apply the §3 layout. Three Mustache-style slots inside the body table: `{{headline}}`, `{{body}}`, `{{cta}}`, plus `{{magicLinkUrl}}`, `{{preheader}}`, `{{fallback}}`, `{{security}}`, `{{name}}`. |
| `public/paywall.html` | Per parent spec §4 (out of design scope but listed for frontend-agent's planning): `email` field becomes `required` when `pillars.includes('lookmaxxing')`. Label text change is `[copy-consultant TBD]`; design-wise just toggle `required` + remove the "(optional — for receipts)" span when lookmaxxing is in the selection. No new classes. |

### 6.2 Patterns to copy

| Pattern needed | Copy from |
|---|---|
| eyebrow + h1 + sub-line stack | `public/lookmax/login.html` lines 18-22 (kept as-is) |
| form field + label + input | `public/paywall.html` lines 168-171 |
| solid gold CTA | `public/lookmax/app.css` `.btn.btn--solid` (line 60-61) |
| ghost CTA | `public/lookmax/app.css` `.btn.btn--ghost` (line 60+64) |
| state-toggle in DOM (hide via `.hidden`) | `public/lookmax/login.html` lines 25, 34 (existing `#otpStep` / `#verifyStep` pattern) |
| inline `.install` button | `public/payment-confirmed.html` line 33 + line 105 |
| `.consultant` voice block | `public/lookmax/app.css` line 84 (already used on `/lookmax/score.html`) |
| auto-poll loop | new code — no precedent in repo. Use `setTimeout` chain with a 3s interval, max 10 iterations (30s total), stop on first `{found: true}`. **No `setInterval`** (drift + cancellation pain). |
| email template structure | `data/email-templates/paywall-receipt.html` end-to-end |
| `getUserByEmail` masking helper for the masked email shown on state B | new util — frontend-agent owns. ≤ 5 lines: `function maskEmail(e){ const [l,d]=e.split('@'); return l[0]+'••••@'+d; }` |

### 6.3 Assets needed

**None.** No new SVGs, no new fonts to host, no new image files. The Google Fonts links are already in every target file.

### 6.4 Minimal new CSS rules (the spec's full count)

1. `#loading::after` + `@keyframes dots` + `@media (prefers-reduced-motion: reduce)` block in the inline `<style>` of `payment-confirmed.html`. ~12 lines. Justified in §2.3.

**That's it.** Every other change is structural / behavioural / copy.

### 6.5 Slots to leave as placeholders

All copy slots in parent spec §5 ship into the build as `[copy-consultant TBD]` literal text. Frontend-agent does NOT improvise Consultant voice (CLAUDE.md §6 rule 5). Founder approves all slots before the PR merges.

### 6.6 Test seams frontend-agent should leave

- The 60s resend timer in login state B should be configurable via a global (e.g., `window.__LM_RESEND_DELAY_MS = 60000`) so a Vitest jsdom test can fast-forward without waiting a real minute.
- The 30s auto-poll window on payment-confirmed.html should similarly accept `window.__PC_POLL_TIMEOUT_MS` and `window.__PC_POLL_INTERVAL_MS` overrides.
- The masked-email helper is exported on `window.LM` (or a tiny `window.__authUI`) so unit tests can assert masking behaviour without DOM gymnastics.

---

## 7. What I did NOT design

- The admin-login page (unchanged per the brief).
- The `/lookmax/admin-login` redirect target (debugging seam; out of scope).
- Any change to the `.eyebrow`, `h1`, `.muted`, `.consultant`, `.btn`, `.btn--solid`, `.btn--ghost`, `.install`, `.field`, `label`, `input`, `.hint`, `.err`, `.hidden`, `.footer-note`, or `.card` selectors. Those are locked tokens of the design system.
- The Lookmaxxing dashboard, score page, or any other `/lookmax/*` route.
- The paywall card copy or selection logic.
- The receipt email template structure (only spec'd a sibling new template).

---

## 8. Confirmations (for the orchestrator)

1. **No new tokens.** Every colour, font weight, font family, radius, padding rhythm, and animation timing in this spec is already in production in `public/lookmax/app.css`, `public/payment-confirmed.html`, or `data/email-templates/paywall-receipt.html`.
2. **No new icons.** The diamond `◆` is the only symbol used. The bullet `•` in the masked email is typography, not iconography. No checkmarks, envelopes, clocks, spinners, or arrows beyond the `→` already present in existing button labels.
3. **No animation library.** The only motion added is one CSS `@keyframes dots` block (~12 lines, scoped to `#loading::after`, guarded by `prefers-reduced-motion`) and opacity-only state crossfades that piggyback on the existing `.18s` button transition timing.

**The one place I almost broke a constraint and chose not to:** the check-inbox state on login.html was the obvious spot to introduce a small success affordance — a centred check icon, or a subtle pulse on the headline, or an animated "envelope-in-flight" graphic. Any of those would have made the moment feel more "complete" to a designer's eye. I deliberately did not add any of them. The `.consultant` left-rule + serif italic is the codebase's existing primitive for "this is the mentor speaking," and it is the right answer here — calmer than a success state, more dignified than a banner, and it costs zero new CSS. The temptation was to invent a new visual language for "you've done something correct"; the discipline was to use the language that already exists for "the Consultant is responding."
