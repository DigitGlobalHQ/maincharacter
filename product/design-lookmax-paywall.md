# Design — Lookmaxxing Paywall (`/paywall` + `/paywall-waitlist`)

> Surfaces: `public/paywall.html` (public mode), `public/paywall-waitlist.html` (pre-flip).
> Folds in F1+F2 from `product/brief-NOW-1.md` (audit echo above the form on both pages), NOW-3 from `product/brief-NOW-3.md` (Aura++ card cleanup + tag A/B variants), and the Aura++ right-edge clipping bug at 1440px (`BACKLOG.md`).
> Locked tokens. Card-bullet copy is locked per CLAUDE.md §2 — except the `Founder access to The Consultant chat` line which is flagged TODO copy review and is being removed per NOW-3 §2.0.

---

## 1. Status of current execution

The public paywall (`public/paywall.html`) is the strongest single surface in the product: three cards (Orator / Lookmaxxing / Aura++), gold-bordered Aura++ raised by `box-shadow`, real Razorpay handoff, audit-echo already wired at `:189-210` for users carrying a session token. Voice is restrained, no exclamation marks, ◆ bullets. Three real problems: (a) the Aura++ card at 1440px+ has a `tag` pill positioned `top:-12px;left:50%;transform:translateX(-50%)` and a `box-shadow: 0 20px 60px rgba(0,0,0,0.5)` that combined with the 1px gold border + 1px outer box-shadow ring **clips visibly on the right edge in Chrome on certain DPRs** when the grid columns end exactly at the body's safe area (logged in BACKLOG); (b) the **audit echo renders as a generic bordered box** that does not visually carry the score forward as an earned outcome — it reads like a banner ad above the form; (c) the **`Founder access to The Consultant chat` bullet at `:151` is an unapproved promise for an unbuilt feature**, which makes any A/B test on this card invalid until removed (NOW-3 §2.0).

The waitlist paywall (`public/paywall-waitlist.html`) is the lesser surface — a single centred form with a lede. It does NOT currently echo the audit score, which is F1's job.

## 2. The change

**Public paywall (`paywall.html`):**

1. **Audit echo is restructured as the earned-result frame, not a banner.** Lift the score `b 67/100` into a serif italic 1.75rem, drop the leverage axis to a 0.85rem secondary line directly under it, and let the whole block sit in `--char` with a 1px `--gold-deep` (not `--line`) hairline on the bottom only — no full border, no rounded box. This makes it read as "your result, carried forward" not "an ad above the form."
2. **Aura++ card cleanup (NOW-3 §2.0):** Remove the `Founder access to The Consultant chat` `<li>` at `:151`. Six bullets becomes five — replace with a founder-approved bullet or leave at five (the card's visual weight does not need the sixth). `[COPY DRAFT NEEDED]`.
3. **Aura++ card right-edge clip fix:** the outer ring `box-shadow: 0 0 0 1px rgba(232,184,75,0.25)` plus the 1px border plus the absolute `tag` overflows when the card sits flush to the grid edge. Fix: change the outer ring shadow from `0 0 0 1px ...` to `0 0 0 1px ... inset` (so it lives inside the border-box and clips nothing), and add `overflow: visible; isolation: isolate` to the card; verify the gold border still reads. Add 4px of `margin-inline` to the `.cards` grid on `min-width: 1280px` to give the cards a breathable safe area. The tag pill stays absolute but gets `max-width: calc(100% - 24px)` so its translateX never overflows.
4. **Aura++ tag A/B hook (NOW-3 §2.1):** the `.tag` slot is a single `<div>` — wire its textContent from a deterministic-bucketed variant chosen on session token (or fallback random id). Three locked variants: `Most chosen` / `Saves ₹299/mo` / `Voice and presence, one arc` `[COPY DRAFT NEEDED for variant C]`. The visual treatment does not change across variants.
5. **Form section — micro-redesign for the multi-pillar selection moment.** Today the form sits below the three cards with a single `selectedNote` line that says "Choose a path above to begin." When the user clicks a card's `Begin →`, that note updates — but the cards do NOT visually indicate selection. Add a `.card.is-selected` class wiring (gold-bright border, no other change) when the user has clicked a card's Begin button so the page makes clear "this card is what I'll be charged for." Bundle pre-select via `?intent=bundle` already works — make sure it visually flags the Aura++ card on load.

**Waitlist paywall (`paywall-waitlist.html`):**

1. **F1 audit echo above the form.** Mirror the public paywall pattern. Insert a `.audit-summary` block between the lede `<p class="lede">` and the `<form>`. Show only on successful `/api/audit/result/:token` fetch; degrade silently. Reuse the AXIS_LABELS dict from public paywall.
2. **No other changes.** The waitlist page is intentionally minimal — single column, single form, ~480px wide. Honour it.

## 3. Layout specification

### Mobile (360–767px) — both pages

**Public paywall (mobile):**

```
┌─────────────────────────────┐
│  ◆ MAINCHARACTER             │  eyebrow
│  Choose the work.            │  h1 italic serif 30px
│  The diagnosis was free.     │  .sub --muted 15px
│  The discipline is the       │
│  offer. Begin where you are  │
│  weakest, or take both.      │
│                              │
│  ╭ Your Aura Score          │  NEW: audit echo restructured
│  │       67 / 100            │  serif italic 1.75rem --gold
│  │  Hair density             │  0.85rem --ink-dim
│  │  is your leverage point.  │  hairline bottom 1px --gold-deep
│  ╰                            │
│                              │
│  ┌─ The Orator ─────────┐    │  cards stack 1-col on mobile
│  │ ₹799 / month         │    │  --orator top bar 3px
│  │ ◆ Daily WhatsApp...  │    │
│  │ [ BEGIN → ]          │    │
│  └──────────────────────┘    │
│  ┌─ Lookmaxxing ────────┐    │  --aesthetic top bar 3px
│  │ ₹1,499 / month       │    │
│  │ ◆ Daily Mirror Score │    │
│  │ [ BEGIN → ]          │    │
│  └──────────────────────┘    │
│  ┌─ Aura++ ─────────────┐    │  --gold border, gold tag
│  │   [Most chosen]      │    │  tag variant from A/B
│  │ ₹1,999 / month       │    │
│  │ Both pillars · Save  │    │
│  │ ₹299/mo              │    │
│  │ ◆ Everything in ...  │    │  5 bullets (chat bullet GONE)
│  │ [ BEGIN → ]          │    │  solid gold button (existing)
│  └──────────────────────┘    │
│                              │
│  ┌── Where The Consultant ─┐ │  form (existing)
│  │   reaches you            │ │
│  │  Name                    │ │
│  │  [____________________]  │ │
│  │  WhatsApp number         │ │
│  │  [____________________]  │ │
│  │  Email                   │ │
│  │  [____________________]  │ │
│  │  err                     │ │
│  │  Aura++ pre-selected.    │ │  selectedNote (existing)
│  └──────────────────────────┘ │
│                              │
│  ◆ MainCharacter · The C.    │  footer
└─────────────────────────────┘
```

**Waitlist paywall (mobile):**

```
┌─────────────────────────────┐
│  ◆ MAINCHARACTER             │
│  The Chamber opens this      │  h1 italic 28px
│  weekend.                    │
│  Add your number — you'll    │  lede --muted 15px
│  be the first walked in. ◆   │
│                              │
│  ╭ Your Aura Score          │  NEW: F1 audit echo
│  │       67 / 100            │  same treatment as public
│  │  Hair density             │
│  │  is your leverage point.  │
│  ╰                            │
│                              │
│  ┌── form ─────────────────┐ │  existing
│  │  Your name               │ │
│  │  WhatsApp number         │ │
│  │  [ HOLD MY PLACE ]       │ │
│  └──────────────────────────┘ │
│                              │
│  The diagnosis is free. ...  │  footer
└─────────────────────────────┘
```

### Desktop (≥1024px) — deltas

- Public paywall: 3-col card grid at ≥860px (existing). At ≥1280px, add 4px outer margin to the grid to fix the Aura++ clip.
- Audit echo block: max-width 600px centred above cards (existing). No change in layout, only restructured visual.
- Waitlist paywall: single column max-width 480px centred (existing). Audit echo block above the form, same 480px width.

## 4. States required (per surface)

### Public paywall

| State | Behaviour |
|---|---|
| Default (no audit token) | Audit echo block hidden. Three cards default. selectedNote = "Choose a path above to begin." |
| Default (audit token, valid) | Echo renders with score + axis. Cards default. |
| Default (audit token, expired/404) | Echo silent (existing guard at `:199`). |
| `?intent=bundle` | Aura++ card gets `.is-selected` class on load. selectedNote = "Aura++ pre-selected — both pillars, saves ₹299/mo." |
| Card clicked (Begin pressed) | Clicked card gains `.is-selected`. selectedNote = "Preparing your subscription…" while POST is in flight. |
| Form invalid (missing name) | `.err` shows "Your name, first." (existing). |
| Form invalid (phone format) | `.err` shows existing message. |
| Form invalid (Lookmax selected, email missing) | `.err` + focus email field (existing). |
| Subscribe API success | `window.location.href = data.url` (Razorpay short_url) (existing). |
| Subscribe API failure | `.err` shows existing message. selectedNote cleared. |
| Loading | Inputs stay enabled (user might fix data). Card buttons stay enabled until response. Only the selectedNote indicates in-flight. |

### Waitlist paywall

| State | Behaviour |
|---|---|
| Default (no token) | Echo hidden. Form ready. |
| Default (token, valid) | Echo renders. |
| Default (token, expired/404) | Echo silent. |
| Submitting | Button "Hold my place" disabled, no spinner (form is fast). |
| Success | Form fades out, `.done` block fades in (existing). |
| Failure | `.err` shows "Something held it back. Try once more." (existing). |

## 5. Motion

- Card hover (desktop): no transform on Aura++ (existing scale(1.02) on `.plan-card.featured` is from the Day-7 paywall, different file). For these cards keep them static — `.btn:hover` background swap only.
- Echo block: appears via `display: block` (no fade) when the fetch resolves — happens before first paint typically. If echo arrives after paint, fade-in 0.18s (gold-bordered surfaces never pop).
- Selected card flag: 0.18s border-color transition.
- Existing form transitions on input focus (border-color → gold) keep at 0.18s.
- **Reduced motion:** all transitions become instant; echo appears without fade.

## 6. Touch targets

- Card Begin buttons: 13px padding + 14px font ≈ 44px. Pass.
- Form inputs: 12px padding + 15px font ≈ 41px — bump padding to `12px 14px` (already) → ensure `min-height: 44px` on inputs.
- Tag pill on Aura++: not tappable, fine.
- F1/F2 echo block: not tappable, fine.

## 7. Mid-range Android perf note

- `.card--aura` `box-shadow: 0 0 0 1px ... , 0 20px 60px ...` — change the inset ring as per §2.3 fix; keep the outer 20px 60px shadow (cheap, one card only).
- DO NOT use `backdrop-filter` on any element.
- Single Google Fonts request (one weight family) at top. Don't add weights.
- Two `background-image: radial-gradient(...)` on body — keep at 0.07/0.05 alpha; do not stack more.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load (public mode) | `paywall_viewed` | Carries `data-variant` (Aura++ tag A/B bucket). |
| Page load (waitlist mode) | `waitlist_paywall_viewed` | |
| Echo block successfully rendered | `audit_echo_shown` | Catches token-expiry regressions. |
| Each card's Begin button | `card_selected` | `data-plan="orator|lookmaxxing|aura"`, `data-variant` for Aura++. |
| Subscribe POST success | `subscribe_clicked` | Carries plan + variant. |
| Waitlist submit success | `waitlist_joined` | |
| `?intent=bundle` arrival | `bundle_intent` | Tracks the audit→bundle handoff (NOW-3 measurement). |

A/B variant bucket persists in `localStorage('mc.paywall.variant')`; first assignment uses session token if present, else cryptographically random.

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `Choose the work.` headline | Locked. |
| Sub `The diagnosis was free. The discipline is the offer.` | Locked. |
| All three card names, prices, bullets (except chat bullet) | Locked. |
| `Where The Consultant reaches you` form heading | Locked. |
| Form labels, hints, error messages | Locked (`paywall.html:88-95, 243-251`). |
| `Most chosen` tag (variant A) | Locked (current). |
| `Saves ₹299/mo` tag (variant B) | Honest, derived from existing `save` line — copy-consultant must confirm exact glyph (`/mo` vs ` / mo`). |
| `Voice and presence, one arc` tag (variant C) | `[COPY DRAFT NEEDED]` — NOW-3 §2.1. |
| Replacement for the removed `Consultant chat` bullet | `[COPY DRAFT NEEDED]` — NOW-3 §2.0. |
| Echo line `Your Aura Score: 67/100. Hair density is your leverage point.` | Existing live copy at `paywall.html:206` — keep verbatim, only the visual treatment changes. |
| Waitlist page `The Chamber opens this weekend.` h1 | Locked (`paywall-waitlist.html:69`). |
| Waitlist page `Hold my place` | Locked. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Replacement (or removal) for the unapproved `Founder access to The Consultant chat` Aura++ bullet — NOW-3 §2.0.
2. Tag variant C exact wording (`Voice and presence, one arc` is draft) — NOW-3 §2.1.
3. Confirm `Saves ₹299/mo` exact glyph spacing.

## 11. Frontend-implementation notes

- **Edit `public/paywall.html` and `public/paywall-waitlist.html` directly.** Single-file convention.
- Audit echo restructure: remove `.audit-summary` rule's `border + border-radius + padding 16px 20px` styling; replace with `padding: 20px 0; border-bottom: 1px solid var(--gold-deep); text-align: center;`. Inner markup becomes two rows: a serif `<div class="audit-echo__score">67<span>/100</span></div>` and a sans `<div class="audit-echo__axis">Hair density is your leverage point.</div>`. Keep the existing `loadAuditSummary` fetch logic; change only what it `innerHTML`s.
- **Lift `loadAuditSummary` + `AXIS_LABELS` into a shared inline pattern** on both pages (NOW-1 F2 requirement). They cannot import from each other — duplicate verbatim and add a comment `// MUST stay in sync with paywall-waitlist.html` (and vice versa). Two pages, identical 20-line block.
- Aura++ tag A/B: at page-init, read or create `localStorage('mc.paywall.variant')`. Use a fixed allowlist `['most_chosen', 'saves_299', 'voice_presence_arc']` and the mapping to strings — frontend-agent must hardcode the allowlist so a runtime change cannot inject scarcity language.
- Aura++ clip fix: change `paywall.html:60` from `box-shadow: 0 0 0 1px rgba(232,184,75,0.25), 0 20px 60px rgba(0,0,0,0.5);` to `box-shadow: inset 0 0 0 1px rgba(232,184,75,0.25), 0 20px 60px rgba(0,0,0,0.5);`. Add at `@media (min-width: 1280px) { .cards { margin: 40px 4px 36px; } }`. Tag pill: add `max-width: calc(100% - 24px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`.
- Card selected state: add `.card.is-selected { border-color: var(--gold-bright) !important; }` CSS, toggle the class on every Begin button click + on `?intent=bundle` page-load. Reset when user clicks a different card.
- All `data-event` attributes per §8 — same pattern as audit funnel (delegated listener pushes to `window.__mc_events`).
- Waitlist page F1 echo: copy the entire `loadAuditSummary` function and `AXIS_LABELS` from public paywall into `paywall-waitlist.html` `<script>` block; insert the `<div class="audit-summary">` block in markup between `.lede` and `.form`; copy the matching CSS rule.

End of spec.
