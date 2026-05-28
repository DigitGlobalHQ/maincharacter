# Design — Daily Protocol (`/lookmax/protocol`)

> Surface: `public/lookmax/protocol.html`. Personalised daily checklist + do-nots + evidence tiers.

---

## 1. Status of current execution

Functional, on-brand, and the closest the product comes to a SaaS checklist — which is a risk. It is a list of checkboxes with expandable instructions and an evidence-tier chip per item. Frictions: (a) **fire emoji at `:51`** — same violation as dashboard/mirror; (b) **`Complete the day` is a single solid-gold full-width button** that on tap locks the day and shows a one-line success message — the "day is closed" moment has no weight relative to the daily mirror moment; (c) the **do-nots block sits at the bottom with violet styling** which is fine, but it currently is just listed without context — a single line of frame would teach the user that do-nots are violet because they are leverage axes, not just rules; (d) the **`tier` chip ("RCT-supported / Mechanism-supported / Observational")** is a useful trust signal that gets lost inside the collapsed instruction — the user has to expand to see why an item is on the list, when the tier is the most credibility-loaded element on the page.

## 2. The change

Four interventions:

1. **Lift the evidence tier to the item header row.** Today the tier is inside the collapsed `.instruction` (`:59`). Move it to the right edge of the item title row, always visible, as a small `--ink-faint` 0.65rem chip with a dot prefix. The user scans down the list and immediately sees `RCT · RCT · Mech · Obs · RCT` — proof that the protocol is built on graded evidence, not on vibes.
2. **Re-treat the do-nots block** with a single-line frame above it: `What to avoid — the protocol works around these.` `[COPY DRAFT NEEDED]`. Keep the violet styling.
3. **Promote `Complete the day` from a checklist-end button to a closing moment.** When all items are checked (`completedCount === totalCount`), the button gains a `.btn--solid-gold-glow` ring (matching the existing `.card--pulse` keyframe, applied once not infinite) and the supporting line "Eighty percent or more carries the streak. You are over the line." `[COPY DRAFT NEEDED]` appears above. When not all are checked, the button reads "Complete the day — N more to go" `[COPY DRAFT NEEDED]` and is still enabled (per existing logic — 80% threshold).
4. **Remove the fire emoji** at `:51` — consistent with dashboard + mirror.

## 3. Layout specification

### Mobile (360–767px)

```
┌─────────────────────────────┐
│ ◆ Today's Protocol           │  topbar
│              [12-day]        │  badge--streak
│                              │
│ The work for today.          │  h1 (locked, serif italic)
│ 0 of 6 complete              │  progressLine --muted
│                              │
│ ┌── CHECK ITEM ────────────┐ │  .check default
│ │ ☐  Vitamin D3 + K2       │ │  box 22×22 --gold border
│ │     · RCT-supported      │ │  NEW: tier chip on header row
│ │     ▾ tap to expand      │ │  --ink-faint 0.65rem
│ └──────────────────────────┘ │
│ ┌── CHECK ITEM ────────────┐ │
│ │ ☐  Cold water face rinse │ │
│ │     · Mechanism          │ │
│ └──────────────────────────┘ │
│ ┌── CHECK ITEM checked ────┐ │  .check.checked
│ │ ◆  10 min sun before 9am │ │  filled gold ◆
│ │     · Observational      │ │
│ │     Stand facing east... │ │  expanded instruction
│ └──────────────────────────┘ │
│ ...                          │
│                              │
│ What to avoid — the          │  NEW do-nots frame
│ protocol works around these. │  --muted serif italic 14px
│                              │
│ ┌── ⊘ DO NOT ─────────────┐ │  donot --aesthetic styling
│ │ Touch your face          │ │  (existing, strikethrough)
│ │ Carry oil from hands...  │ │
│ └──────────────────────────┘ │
│                              │
│ Eighty percent or more       │  NEW supporting line, serif italic
│ carries the streak.          │  --ink-dim 15px (shown when ≥80%)
│ You are over the line.       │
│                              │
│ ┌──────────────────────────┐ │  primary CTA, full-width
│ │  COMPLETE THE DAY ◆      │ │  ring glow when ≥80% complete
│ └──────────────────────────┘ │
│                              │
│ (success msg)                │
└─────────────────────────────┘
```

### Desktop (≥768px)

- Page max-width 560px (existing). Keep.
- Same vertical stack.

## 4. States required

| State | Behaviour |
|---|---|
| **Loading** | `LM.api('/api/lookmax/protocol/today')` in flight — page renders shell, items area shows single `<div class="muted center">◆</div>` placeholder. |
| **No protocol generated** | Existing `'No protocol yet. Take a mirror to generate one.'` (`:46`). Render as a single `.consultant`-styled block with a `Take today's mirror →` link to `/lookmax/mirror`. `[COPY DRAFT NEEDED]` for the link label if different from existing. |
| **Default (0 complete)** | List + do-nots + CTA. CTA reads `Complete the day — 6 more to go`. CTA is enabled (per existing logic, day can be closed at any point — the 80% rule is server-side). |
| **Partial (<80%)** | CTA reads `Complete the day — N more to go`. No glow. |
| **At-or-above 80%** | CTA gains glow ring; supporting line appears above. |
| **All checked** | Same as above. |
| **Day locked** | CTA disabled, label `Day complete ◆` (existing). Supporting line: `The day is closed. The streak holds.` (existing copy approved). |
| **Day-close API failure** | Existing `.err` shows `Could not lock the day. Try again.` |
| **Item check API failure** | Currently silent (`:85`). Add inline `.err` row under the item — `Did not save. Try again.` `[COPY DRAFT NEEDED]`. |

## 5. Motion

- Check toggle: existing instant border-color swap. Keep.
- Expanded instruction: existing `.check.open .instruction { display: block; }` — instant. Consider 0.18s slide-down via `max-height` transition, but that requires fixed heights — keep instant for simplicity.
- CTA glow when ≥80%: single 0.6s opacity 0→1 transition on a pseudo-element ring, then static. NO infinite pulse — this is a one-shot acknowledgement.
- Reduced motion: all transitions instant.

## 6. Touch targets

- `.check .box`: 22×22 visually but the parent `.check` is the full tappable row (the `data-toggle` listener is on `.box`, the `data-expand` on `.body`) — wait, that's split. Frontend-agent should ensure the BOX is its own 44×44 tap target by giving it `padding: 11px` (so 22+22 = 44) — currently `flex: 0 0 22px; height: 22px; margin-top: 2px;`. Enlarge the tappable area without enlarging the visual checkbox: add `position: relative;` and a `::before` pseudo-element with `position: absolute; inset: -11px;` to extend the hit area.
- Item body (expand on tap): 14+14+content ≈ 60px. Pass.
- CTA: full-width, 13px padding + 14px font ≈ 40px — bump to `min-height: 44px`.
- Donot rows: not tappable.

## 7. Mid-range Android perf note

- Render the list with a single `innerHTML` assignment (existing) — fine.
- Do NOT animate `max-height` for the expand (jitter on low-end devices).
- The CTA glow uses `box-shadow` once, not animated — cheap.
- No images. No canvas. Cheapest non-login page.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load | `protocol_viewed` | Carries `totalCount`, `completedCount`, `isLocked`. |
| Check toggle (on) | `protocol_item_checked` | `data-item-id`. |
| Check toggle (off) | `protocol_item_unchecked` | |
| Item expand | `protocol_item_expanded` | |
| Complete the day click | `protocol_day_close_attempted` | |
| Complete the day success | `protocol_day_closed` | Carries `streakIncremented`, `completionPct`. |
| Day-close API failure | `protocol_day_close_failed` | |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `◆ Today's Protocol` topbar | Locked. |
| `The work for today.` h1 | Locked. |
| `N of N complete` progress line | Locked format. |
| `Complete the day` button base label | Locked. |
| `Day complete ◆` locked state | Locked. |
| `The day is closed. The streak holds. ◆` success | Locked. |
| `The day is closed. Eighty percent carries the streak — aim higher tomorrow. ◆` partial | Locked. |
| Evidence tier labels (`RCT-supported / Mechanism-supported / Observational`) | Locked. |
| Item titles, instructions, do-not titles | Server-supplied, owned upstream. |
| Streak label (replacing 🔥) | `[COPY DRAFT NEEDED]`. |
| Do-nots frame line `What to avoid — the protocol works around these.` | `[COPY DRAFT NEEDED]`. |
| ≥80% supporting line `Eighty percent or more carries the streak. You are over the line.` | `[COPY DRAFT NEEDED]`. |
| `Complete the day — N more to go` dynamic label | `[COPY DRAFT NEEDED]`. |
| No-protocol empty state | `[COPY DRAFT NEEDED]`. |
| Item-check API failure inline | `[COPY DRAFT NEEDED]`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Streak label replacement.
2. Do-nots frame line.
3. ≥80% supporting line + dynamic CTA label.
4. No-protocol empty state.
5. Item-check failure inline.

## 11. Frontend-implementation notes

- **Edit `public/lookmax/protocol.html` and tweak `app.css` as needed.**
- Remove `🔥` at `:51` — change to `(state.streak || 0) + '-day streak'` or final copy.
- Move the tier chip from `.instruction` to the header row. Restructure the `.check` markup:
  - Currently: `.check > .box + .body[.title + .instruction[tier-chip]]`
  - New: `.check > .box + .body[.title-row[title + tier-chip] + .instruction-collapsed]`
  - Title-row is `display: flex; justify-content: space-between; align-items: baseline;`.
  - Tier chip CSS: `font-size: 0.65rem; letter-spacing: 0.06em; color: var(--ink-faint); text-transform: uppercase; flex-shrink: 0; margin-left: 12px;` with a `·` prefix character or a tiny ◆ glyph.
- Box hit area: add `position: relative;` to `.check .box` and a `::before { content: ''; position: absolute; inset: -11px; }` for the extended tap target.
- Do-nots frame line: render before `#doNots` only if `state.doNots && state.doNots.length`.
- CTA glow: add a new CSS class `.btn--complete-ready` with `box-shadow: 0 0 0 2px rgba(232,184,75,0.25), 0 0 24px rgba(232,184,75,0.18);`. Apply to `#completeBtn` when `completedCount / totalCount >= 0.8 && !isLocked`. Remove when locked.
- Dynamic CTA label: at render time, compute `const remaining = totalCount - completedCount`; if `isLocked`, `Day complete ◆`; else if `remaining === 0`, `Complete the day ◆`; else `Complete the day — ${remaining} more to go`.
- Supporting line above CTA: render only when `completedCount / totalCount >= 0.8 && !isLocked`.
- Item-check failure: change the silent `catch { return; }` at `:85` to set an inline error on the failing item: `state.items.find(...).error = 'Did not save. Try again.'`; render the error in the item body.
- All `data-event` attributes per §8.

End of spec.
