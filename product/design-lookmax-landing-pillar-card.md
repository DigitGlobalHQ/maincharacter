# Design — Lookmaxxing Pillar Card on `/` (landing)

> Surface: `landing.html` § `#pillars` → second `.pcard.pcard--aesthetic` card only.
> Locked tokens only. No new colours, fonts, icons. Brand voice locked.
> Founder owns all copy edits flagged `[COPY DRAFT NEEDED]`.

---

## 1. Status of current execution

Functional and on-brand. The card sits in a 3-col grid (collapses to 1-col under 860px) using the shared `.pcard` pattern: violet 3px top bar, animated stat-fill on scroll-in, italic hook, sans promise, gold CTA chevron. The whole card is `onclick`-routed to `/audit`. Two real frictions: (a) the card visually equates Orator (1-col left) with Lookmaxxing (1-col middle/right) but they are fundamentally different products — WhatsApp vs PWA, 7-day vs 30-day, voice vs face — and the card surfaces none of that; (b) the `pcard__stat-fill` is a decorative 72% bar with no semantic meaning, which on a *measurement-over-time* product reads as fake-measurement-decoration. (c) The CTA text reads "Get Your Aura Reading →" which is correct, but the entire card body never names the daily ritual (mirror selfie) that the user is being signed up for.

## 2. The change

- Replace the meaningless 72% decorative `pcard__stat-fill` with a single line of **format metadata** that distinguishes Lookmaxxing from Orator: medium (Web PWA), cadence (Daily mirror), payoff window (Day 30). Three pill-style chips on one row, gold-bordered, no fill, sit where the fake bar was. This is honest measurement language without faking a score.
- Keep the violet pillar bar, glow, name, hook, and promise verbatim — they are locked.
- Audit-funnel entry point becomes a **two-tier CTA**: primary "Get Your Aura Reading →" (unchanged), secondary muted line "Five minutes. No account needed." pulled from the existing audit Scene 1 lede ("Five minutes. One reading. Yours.") so the card sets the same expectation as the page it lands on. The secondary line lives below the CTA in `--ink-faint` at 0.7rem.
- Mid-grid 1024px+ insert a single quiet row UNDER both cards: "Two paths. Pick the work you can least afford to keep ignoring." in `--ink-dim` italic Cormorant, 0.95rem. This re-frames the choice without changing card copy. `[COPY DRAFT NEEDED]` — see §10.
- Preserve the existing `onclick='/audit'` whole-card affordance, but add an explicit focusable `<a>` wrapping the CTA region so keyboard nav lands on a real link with a real label, not a JS-only click.

## 3. Layout specification

### Mobile (360–767px) — single column, full-width

```
┌─────────────────────────────────┐
│  ▌ (3px violet bar)             │  pcard__bar height 3px, --aesthetic
├─────────────────────────────────┤
│                                 │  pcard__body padding 2rem 1.8rem 1.6rem
│  II                             │  pcard__number, --aesthetic, 0.95rem serif
│                                 │
│  Lookmaxxing                    │  pcard__name 1.65rem serif italic
│  PHYSICAL PRESENCE              │  pcard__tag 0.6rem sans .25em --ink-dim
│                                 │
│  ┌──────┐ ┌──────┐ ┌──────┐    │  NEW: 3 chips replacing fake stat-bar
│  │ PWA  │ │DAILY │ │DAY 30│    │  border: 1px solid rgba(232,184,75,0.25)
│  └──────┘ └──────┘ └──────┘    │  padding 4px 10px; 0.58rem .14em uppercase
│                                 │  color --gold; radius 100px; gap 6px
│  "The room reads you before     │  pcard__hook 1.1rem serif italic
│   you speak."                   │
│                                 │
│  By Day 30 you will see the     │  pcard__promise 0.8rem sans --ink-dim
│  version of you the camera has  │
│  been waiting to capture.       │
│                                 │
│  ─────────────────────────────  │  border-top 1px --line
│  Get Your Aura Reading →        │  pcard__cta 0.72rem --aesthetic
│  Five minutes. No account.      │  NEW secondary 0.7rem --ink-faint
└─────────────────────────────────┘
```

### Tablet (768–1023px) — same as mobile, max-width 480px centred (existing `.pillars__grid` rule at 860px stacks; honour it).

### Desktop (≥1024px) — 2-card row, deltas vs mobile

- Card max-width 320px; gap 22px between Orator/Lookmaxxing cards.
- Chip row sits on a single line (always; no wrap on desktop).
- The "Two paths" frame line sits 32px below the grid, container-narrow centred, italic, 0.95rem.

## 4. States required

| State | Behaviour |
|---|---|
| **Default** | As above. Stat chips render immediately (no scroll-in animation). |
| **Hover (desktop only)** | Existing: `pcard__glow` opacity 0.5 → 1, card `translateY(-4px)`, border `rgba(176,111,216,0.3)`, box-shadow `0 12px 50px --aesthetic-glow`. CTA gap grows from 6px to 12px. Chips do not change. |
| **Active / pressed (mobile tap)** | Add `transform: scale(0.99)` for 120ms via `:active`. No colour change. |
| **Focus-visible (keyboard)** | Card wrapper `<a>` gets the inherited `outline: 2px solid var(--gold); outline-offset: 3px`. CTA text becomes `--gold-bright`. |
| **Loading** | N/A — static card. (Audit page handles its own loading.) |
| **Error** | N/A — card is a link, not a form. |
| **Empty** | N/A. |
| **Reduced motion** | `pcard__glow` opacity stays at default 0.5 on hover; no transform; CTA gap does not animate. Honour existing `@media (prefers-reduced-motion: reduce)` if added. |

## 5. Motion

- **In-view reveal** (existing): card fades in + translates 28px up at 0.7s `--ease`, staggered with Orator card. Keep.
- **Hover lift**: 0.5s `--ease`, `translateY(-4px)`. Keep, mid-range Android-safe.
- **CTA chevron gap**: 0.4s `--ease`. Keep.
- **No new motion.** Chip row is static.

## 6. Touch targets

- Whole card is the tap target (≥320×360px on mobile — well over 44×44).
- The CTA region inside the card has its own focus ring for keyboard users.
- Chips are decorative-only, not tappable (no individual hit targets).

## 7. Mid-range Android perf note

- Existing `box-shadow: 0 12px 50px --aesthetic-glow` on hover is fine on desktop, never fires on mobile tap. Do NOT promote it to `:active` on mobile — it triggers paint storms on Android 9 + WebView.
- Do NOT add `backdrop-filter` to chips (cheap-to-render solid borders only).
- Two existing Google Font preconnects in landing — do not add a third.
- Chip text uses existing `--font-sans` family; no extra font weight beyond 500 already loaded.

## 8. KPI event hooks

Frontend-agent attaches to:

- Card wrapper `<a>`: `data-event="pillar_card_clicked"` `data-pillar="lookmaxxing"`
- CTA region: `data-event="pillar_cta_clicked"` `data-pillar="lookmaxxing"` `data-cta-text="get-your-aura-reading"`
- Card in-view (IntersectionObserver `is-visible` add): `data-event="pillar_card_viewed"` `data-pillar="lookmaxxing"` — fire once per session.

These hook the existing NOW-0 event sink (`audit_started` upstream) so the seam from "card viewed → audit started" is finally readable; today it is not.

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| Number `II` | Locked (`landing.html:1156`) |
| Name `Lookmaxxing` | Locked (`landing.html:1158`) |
| Tag `Physical Presence` | Locked (`landing.html:1159`) |
| Hook `"The room reads you before you speak."` | Locked (`landing.html:1161`) |
| Promise `By Day 30 you will see the version of you the camera has been waiting to capture.` | Locked (`landing.html:1162`) |
| CTA `Get Your Aura Reading →` | Locked (`landing.html:1163`) |
| Chip 1 `PWA` | `[COPY DRAFT NEEDED]` — see §10 |
| Chip 2 `DAILY` | `[COPY DRAFT NEEDED]` — see §10 |
| Chip 3 `DAY 30` | `[COPY DRAFT NEEDED]` — see §10 |
| Secondary CTA line `Five minutes. No account needed.` | Adapted from audit Scene 1 lede `Five minutes. One reading. Yours.` — `[COPY DRAFT NEEDED]` |
| Between-cards frame line | `[COPY DRAFT NEEDED]` |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Three chip strings for format metadata (currently `PWA / DAILY / DAY 30` as placeholders) — should they be `WEB` or `MIRROR` for chip 1? Should chip 3 be `30 DAYS` or `DAY 30`? The Consultant prefers nouns.
2. Secondary CTA microcopy under the chevron — using audit Scene 1 lede is the safe choice but founder may want a Lookmaxxing-specific variant.
3. Between-cards frame line on desktop — placeholder is "Two paths. Pick the work you can least afford to keep ignoring." which has Consultant cadence (short. then longer. then short — close.) but the founder must own it.

## 11. Frontend-implementation notes

- **Edit `landing.html` only.** Do not introduce new CSS files.
- The `.pcard__stat-bar` and `.pcard__stat-fill` rules at `landing.html:521-540` can stay (still used by Orator card with the same useless decoration — but that is outside scope, do not remove from Orator unless founder approves) — for the Lookmaxxing card, replace the `<div class="pcard__stat-bar">` markup inside the violet card body with a `<div class="pcard__chips">` containing three `<span class="pcard__chip">` elements.
- Add CSS rules for `.pcard__chips` (`display:flex; gap:6px; margin-bottom:1.6rem`) and `.pcard__chip` (`border:1px solid rgba(232,184,75,0.25); border-radius:100px; padding:4px 10px; font-family:var(--font-sans); font-weight:500; font-size:0.58rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--gold);`).
- Wrap the card body in `<a href="/audit" class="pcard__link">` (display block; color inherit; text-decoration none); remove the inline `onclick` and `style="cursor:pointer;"` — keep them in Orator card unless founder approves the matching change.
- Add the `data-event` attributes from §8 to the `<a>` and the CTA region.
- Frame line below the grid: only render at ≥1024px via existing breakpoint logic. Insert after `.pillars__grid` closing `</div>`, before the Sage footer note.

End of spec.
