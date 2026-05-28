# Design — Lookmaxxing Dashboard (`/lookmax/`)

> Surface: `public/lookmax/index.html`. Daily home for paid subscribers.
> Folds in NOW-2 Day-30 Re-Audit pull-card (eligibility-gated) and NOW-3 §2.2 earned-moment Aura++ cross-sell (one-shot, never the always-on banner).
> Locked tokens. Brand voice locked.

---

## 1. Status of current execution

Functional but flat. Topbar (name + streak + Mirror Level badge), three tiles in a vertical stack (Mirror / Protocol / Hair), a "This week" 7-dot strip card, and an **always-on cross-sell banner** when the user is not Orator-paid. Three frictions: (a) the **streak badge is `0 🔥` in literal markup** at `index.html:50` — the fire emoji is the only non-◆ emoji in the entire codebase and a CLAUDE.md §2 violation that has shipped; (b) the **dashboard surfaces no identity** — the user paid for "Become the Main Character," they crossed a Mirror Level, and the page shows their level as a small grey pill in the corner; (c) the **always-on Aura++ cross-sell at `:76-82` is the wallpaper banner that NOW-3 §2.2 explicitly deletes** in favour of an earned-moment trigger — keeping it as-is until then would also violate the new spec.

A fourth subtle one: the three tiles all carry identical visual weight, which fails to teach the user that **the Mirror is the daily ritual** and the others are secondary. The Mirror tile should read as the primary action.

## 2. The change

Five interventions:

1. **Remove the fire emoji.** Replace `${d.streak || 0} 🔥` with `${d.streak || 0}-day streak` (or whatever copy-consultant approves — `[COPY DRAFT NEEDED]`). The badge background stays gold-bordered.
2. **Promote the Mirror Level from corner pill to identity statement.** Add a single italic Cormorant line below the topbar, above the tiles: `Polished — 12 days held.` (or equivalent, `[COPY DRAFT NEEDED]`) — the Mirror Level reached + the day count of the streak. The corner pill goes away; the gold streak number stays.
3. **Re-hierarchy the three tiles.** Mirror tile becomes a **large primary card** (full-width, 140px tall, gold-glow on `is-today-empty`); Protocol + Hair become a 2-col grid below it on mobile/desktop. The Mirror is the daily ritual; the layout must say so.
4. **Day-30 Re-Audit card (NOW-2):** When `GET /api/lookmax/reaudit/status` returns `eligible: true`, render a single calm card **above** the Mirror tile. Same `.card--gold` styling already in `app.css:51` — gold top border, italic serif headline, Sora body, single gold-bordered CTA. When `completed: true`, the card shifts to a thin "View your second reading" entry that lives **below** the week-strip card (it is no longer the action; it is the artefact).
5. **Earned-moment Aura++ cross-sell (NOW-3 §2.2):** Delete the unconditional banner at `:76-82`. Re-introduce only when the dashboard load detects an eligible trigger (Mirror Level rise or positive Day-30 re-audit) AND `auraCrossSellShownAt` is unset on the User record. When shown, it renders as a single dignified `.card--gold` between the week-strip and the footer-note. Once shown, the User record is stamped and the card never appears again — even on dismiss.

## 3. Layout specification

### Mobile (360–767px)

**Default (Day 1–29, eligible: false, no cross-sell trigger):**

```
┌─────────────────────────────┐
│ ◆ MainCharacter · Lookmaxxing│  topbar.who 13px
│ Arjun                        │  topbar.who b --ink
│                  [12-day]   │  badge--streak --gold border
│                              │
│ Polished — 12 days held.     │  NEW identity line, serif italic
│                              │  17px --ink-dim
│                              │
│ ┌──────── MIRROR ──────────┐ │  PROMOTED — primary card
│ │                          │ │  border-top 3px --gold
│ │ Today's mirror.          │ │  card--pulse if !takenToday
│ │ Take it →                │ │  serif italic 22px --ink
│ │                          │ │  full-width, 140px min-height
│ └──────────────────────────┘ │
│                              │
│ ┌─ PROTOCOL ──┐ ┌─ HAIR ───┐ │  secondary tiles, 2-col grid
│ │ 0 of 6      │ │ Next in  │ │  gap 12px
│ │ ░░░░░░░░░   │ │ 5 days   │ │
│ └─────────────┘ └──────────┘ │
│                              │
│ ┌── THIS WEEK ─────────────┐ │  existing weekstrip card
│ │ ● ● ● ○ ○ ○ ○           │ │  7 dots, on = gold
│ └──────────────────────────┘ │
│                              │
│ The mirror has been honest.  │  footer-note
│ ◆ MainCharacter              │
└─────────────────────────────┘
```

**Day-30 eligible (NOW-2 card above Mirror):**

```
┌─────────────────────────────┐
│ ◆ MainCharacter · Lookmaxxing│
│ Arjun                        │
│                  [30-day]   │
│                              │
│ Polished — 30 days held.     │
│                              │
│ ╔═══ DAY-30 RE-AUDIT ══════╗ │  NEW: card--gold pull-card
│ ║ Thirty days of the work  ║ │  border-top 3px --gold
│ ║ are complete.             ║ │  serif italic 22px
│ ║                           ║ │
│ ║ The second reading is     ║ │  body Sora 14px --ink-dim
│ ║ ready. Sit for it when    ║ │
│ ║ you have good light and   ║ │
│ ║ a steady minute.          ║ │
│ ║                           ║ │
│ ║ [ BEGIN THE SECOND       ║ │  primary gold CTA, full-width
│ ║   READING ◆ ]             ║ │
│ ╚═══════════════════════════╝ │
│                              │
│ ┌──────── MIRROR ──────────┐ │  still rendered below
│ │ Today's mirror.          │ │  (the daily ritual continues)
│ │ Take it →                │ │
│ └──────────────────────────┘ │
│ ...                          │
└─────────────────────────────┘
```

**Cross-sell trigger fired (NOW-3 §2.2 — one-shot):**

```
┌─────────────────────────────┐
│ ...                          │
│ ┌── THIS WEEK ─────────────┐ │
│ │ ● ● ● ● ● ● ●           │ │
│ └──────────────────────────┘ │
│                              │
│ ╔═══ THE OTHER HALF ═══════╗ │  NEW: earned-moment card
│ ║                           ║ │  card--gold
│ ║ You crossed into Polished.║ │  draft per NOW-3 §3.2.3
│ ║ Presence is moving —      ║ │  [COPY DRAFT NEEDED]
│ ║ measured, not flattered.  ║ │
│ ║                           ║ │
│ ║ How you sound is the      ║ │
│ ║ other half of presence.   ║ │
│ ║ The Orator works the      ║ │
│ ║ voice the way the mirror  ║ │
│ ║ works the face.           ║ │
│ ║                           ║ │
│ ║ ₹1,999/mo — ₹299 less     ║ │
│ ║ than the two apart.       ║ │
│ ║                           ║ │
│ ║ [ ADD THE ORATOR → ]     ║ │  primary gold solid CTA
│ ║   Not now                 ║ │  ghost dismiss link below
│ ╚═══════════════════════════╝ │
│                              │
│ The mirror has been honest.  │
└─────────────────────────────┘
```

### Desktop (≥768px)

- Page max-width 560px (existing). On wider screens the column stays narrow — the dashboard is a focused single-stream view, not a sprawling SaaS console. Keep.
- Tile grid: Protocol + Hair stay 2-col. Mirror stays full-width.

## 4. States required

| State | Behaviour |
|---|---|
| **Default loading** (`requireSession` in flight) | Existing — page stays empty until session resolves. No skeleton needed for sub-300ms loads; if session takes >600ms, render a single `<div class="muted center">◆</div>` placeholder at 2.5rem. |
| **Session failed** | Existing `requireSession` redirects to `/lookmax/login`. |
| **Dashboard data success** | Render per layout above. |
| **Dashboard data failure** | Single line, `--bad` colour, `Something held back today's read. Refresh in a moment.` `[COPY DRAFT NEEDED]`. |
| **Mirror taken today** | Mirror tile loses `card--pulse`, shows `Today's score 73 · Taken at 8:14am ✓` (existing format), gold ✓ tail. |
| **Mirror not taken today** | Mirror tile has `card--pulse` (2.4s subtle gold ring breath, existing). |
| **Protocol 0/N** | "0 of 6 complete" + 0% bar. |
| **Protocol complete (N/N)** | "6 of 6 — day closed ✓" — `[COPY DRAFT NEEDED]`. |
| **Hair locked** | `Next reading in ${days} days`. Existing. |
| **Hair unlocked** | `This week's hair audit →` + pulse. Existing. |
| **NOW-2 eligible** | Day-30 card renders above Mirror. |
| **NOW-2 completed (any time after)** | Day-30 thin entry "View your second reading →" renders below week-strip. |
| **NOW-2 not eligible** | Card absent (no countdown, no teaser per NOW-2 §3 step 1). |
| **Cross-sell trigger fired, not yet shown** | Card renders once, below week-strip; on render fires `cross_sell_shown` and stamps `auraCrossSellShownAt` server-side. |
| **Cross-sell already shown / dismissed / oratorActive** | Card absent. Forever. |

## 5. Motion

- `card--pulse`: existing 2.4s gold ring breath. Keep on Mirror when not-taken-today only.
- Day-30 card: fade-in 0.4s on first render (it's a moment); no transform.
- Cross-sell card: same 0.4s fade-in.
- No other motion.
- Reduced motion: disable `card--pulse` (set `animation: none`), disable fade-ins.

## 6. Touch targets

- Mirror tile (primary): full-width, 140px tall. Pass.
- Protocol/Hair tiles: each ~150×120. Pass.
- Day-30 card CTA: full-width, 14px padding. Pass.
- Cross-sell `Add The Orator →`: full-width primary. Pass.
- Cross-sell `Not now` dismiss: must be 44×44 — `padding: 12px 16px; min-height: 44px; display: inline-block;`.
- Bottom nav (existing `LM.renderNav`): each item flex-1, 62px tall. Pass.

## 7. Mid-range Android perf note

- `card--pulse` is a box-shadow animation — cheap, scoped to one card. Do not promote to multiple.
- No backdrop-filter on cards.
- The body has two radial-gradients (`app.css:27-29`). Don't add a third for the Day-30 card.
- Cross-sell card renders at most once per session and at most once per user; not a perf concern.
- Streak counter is plain text; no chart, no canvas.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Dashboard load | `dashboard_viewed` | Carries `mirrorLevel`, `daysSincePayment`, `lookmaxxingActive`. |
| Mirror tile click | `mirror_tile_clicked` | `data-state="taken|empty"`. |
| Protocol tile click | `protocol_tile_clicked` | |
| Hair tile click | `hair_tile_clicked` | `data-state="locked|unlocked"`. |
| Day-30 card render | `re_audit_card_shown` | NOW-2 event. |
| Day-30 card CTA click | `re_audit_started` | NOW-2. |
| Day-30 "View your second reading" link (post-completion) | `re_audit_artifact_viewed` | |
| Cross-sell card render | `cross_sell_shown` | `data-trigger="mirror_level|re_audit"`. |
| Cross-sell `Add The Orator` click | `cross_sell_accepted` | |
| Cross-sell `Not now` click | `cross_sell_dismissed` | |
| Bottom-nav item clicks | `nav_clicked` | `data-target`. |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `◆ MainCharacter · Lookmaxxing` topbar | Locked. |
| User name placeholder | Locked. |
| Mirror Level labels (`Raw / Polished / Magnetic / Radiant / Sovereign`) | Locked (CLAUDE.md §1). |
| `The mirror has been honest. ◆ MainCharacter` footer | Locked. |
| `Take today's mirror →` tile copy | Approved (`index.html:60`). |
| Streak label (`12-day streak` proposed) | `[COPY DRAFT NEEDED]` — replaces `12 🔥`. |
| Identity line under topbar (`Polished — 12 days held.` proposed) | `[COPY DRAFT NEEDED]`. |
| Protocol-complete state line | `[COPY DRAFT NEEDED]`. |
| Dashboard-failure error line | `[COPY DRAFT NEEDED]`. |
| Day-30 card heading + body + CTA | Draft in NOW-2 §3 step 2 — `[COPY DRAFT NEEDED]` (founder owns per checkpoint 7). |
| Cross-sell card body + CTA labels | Draft in NOW-3 §3.2.3 — `[COPY DRAFT NEEDED]`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Streak label replacement for `12 🔥` — proposed `12-day streak`; founder may prefer a non-numeric variant.
2. Identity line under topbar — proposed cadence `<Level> — <N> days held.` but founder owns.
3. Protocol-complete state line.
4. Dashboard data-failure error.
5. Day-30 card (NOW-2 has drafts).
6. Cross-sell card (NOW-3 has drafts).

## 11. Frontend-implementation notes

- **Edit `public/lookmax/index.html` and `public/lookmax/app.css`.**
- Remove `🔥` everywhere in this file: `index.html:50`, `index.html:50` interpolation in JS. Add to a project-wide audit task — this emoji shows up in `mirror.html:143` and `protocol.html:51` too; fix those when touching their specs. (Out of scope for THIS file, but flag.)
- Mirror tile promotion: change the `tile()` helper to accept a `priority` arg; primary tile gets `.card--mirror-primary` class with `border-top: 3px solid var(--gold); min-height: 140px; padding: 28px 22px;`; secondary tiles use the existing `.card--look` rule. Restructure the `tiles` array to render Mirror first as primary, then Protocol+Hair in a separate `<div class="tile-row">` styled `display: grid; grid-template-columns: 1fr 1fr; gap: 12px;`.
- Identity line: insert `<div class="mc-identity-line">${levelLabel(d.mirrorLevel)} — ${d.streak || 0} days held.</div>` between topbar and tiles container. CSS: `font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 17px; color: var(--ink-dim); text-align: center; margin: 8px 0 22px;`.
- Day-30 card: new fetch `LM.api('/api/lookmax/reaudit/status')` in the IIFE; if `data.eligible` render the card above tiles; if `data.completed` render thin entry below week-strip. The endpoint is NOW-2 backend work — do not block this spec on it; render conditional on response shape.
- Cross-sell card: delete the existing `if (!d.user.oratorActive) { ... }` block at `:76-82`. Replace with a check against `d.user.auraCrossSellTrigger` (a server-derived field: `'mirror_level'` or `'re_audit'` when an unshown trigger is pending, else null). When present and `auraCrossSellShownAt` is unset, render the card and POST to a new `/api/lookmax/cross-sell/shown` endpoint to stamp the timestamp. The backend logic is NOW-3 §2.2 work — do not block; render conditional on the field.
- Streak badge: change `index.html:50` `${d.streak || 0} 🔥` to `${d.streak || 0}-day streak` (or final copy when ready).
- All `data-event` attributes per §8.
- The bottom nav (`LM.renderNav('profile')`) — currently unicode glyphs ◆ are fine; if there is any other emoji in `app.js`'s `renderNav`, flag it.

End of spec.
