# Design — Lookmaxxing Login (`/lookmax/login`)

> Surface: `public/lookmax/login.html`. Three-state magic-link gate already shipped (request / check-inbox / consume-error) per `product/spec-login-gate-design.md`.
> Brief asked for POLISH DELTAS ONLY — not a rewrite. The page is clean, accessible, and on-brand.

---

## 1. Status of current execution

Excellent. Three states on one DOM, ARIA-correct, masked email reflection (`a••••@gmail.com`), 60s resend countdown, automatic `?token=` consumption on landing, admin-only fallback when the feature flag is off, all five copy slots founder-approved. The visual language matches the rest of the PWA (single card, `--panel` bg, `--line` hairlines, gold primary CTA). No frictions to flag in the current execution — it works, it is dignified, it does what it says.

Three small polish deltas worth shipping:

1. The **eyebrow `◆ MainCharacter` sits above the headline** but does not visually separate from it — adding 6px of breath would make the eyebrow read as a brandmark rather than a stray glyph.
2. The **loading state** (`#stateLoading`) currently has a `<!-- TODO copy review login.loading -->` placeholder that renders empty — the user sees a blank card for up to ~400ms while `/api/lookmax/auth/method` discovers, which feels broken on slow connections.
3. The **consume-error state** (`#stateError`) opens with `This link is no longer valid. Request a new one below.` styled as `.err` (the `--bad` red variable). That is the right semantic, but the red colour on a page that has not yet erred from the user's perspective (they tapped a link, it didn't work — that's a system issue, not a user issue) reads punitive. Soften to `--ink-dim` with a small `◆` mark; keep `role="alert"` for accessibility.

## 2. The change

Three deltas. No new tokens, no new strings (one TODO-copy slot to fill — `[COPY DRAFT NEEDED]`):

1. Add `margin-top: 4px` between the eyebrow and the headline (currently uses `margin: 14px 0 6px` on the h1; reduce the headline top to 10px).
2. Populate `#stateLoading` text content with a single line — `[COPY DRAFT NEEDED]`. Suggested cadence: short serif italic line, `--ink-dim`, no spinner. Today the empty card during method-discovery is the only state that feels broken.
3. Recolour the consume-error message: change `<p class="err">` to `<p class="login-error-note">` with `color: var(--muted); font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; padding: 6px 0 6px 14px; border-left: 2px solid var(--gold);` — same `role="alert"`, same `aria-live="polite"`. The visual now matches the `.consultant` quote rule that already exists in `app.css:84`, which is the right voice for "the system did not let you in; you did nothing wrong."

## 3. Layout specification

Layout is unchanged from current. Only the three deltas above. No mockup redraw needed — see `public/lookmax/login.html:22-107` for current structure.

### State pillar (mobile + desktop identical at this 440px page width)

```
┌─────────────────────────────┐
│  ◆ MainCharacter             │  eyebrow --gold .04em 11px
│       ↑ margin-bottom 6px    │  NEW: add 4px breath here
│  Enter the room.             │  h1 italic serif clamp(26px,6vw,36px)
│                              │
│  Your email below. A         │  .muted 14px Sora 300
│  single-use link arrives     │
│  within a minute, valid      │
│  for fifteen.                │
│                              │
│  ╭──── .card ──────────────╮ │  --panel bg, --line border, radius 16
│  │                         │ │
│  │  [State A / B / C]      │ │  see existing markup
│  │                         │ │
│  ╰─────────────────────────╯ │
│                              │
│  ◆ MainCharacter ·           │  footer-note
│  The Consultant              │
└─────────────────────────────┘
```

## 4. States required

Currently spec'd and shipped — no additions. Polish per state:

| State | Polish change |
|---|---|
| **stateRequest** | None (already clean). |
| **stateInbox** | None. The masked email reflection + 60s countdown is correct. |
| **stateError** | Recolour the message per §2.3 — `.login-error-note` instead of `.err`. Keep the form below unchanged. |
| **stateAdmin** | None. |
| **stateLoading** | Fill the empty placeholder with one Consultant-voice line. `[COPY DRAFT NEEDED]`. |

## 5. Motion

- Existing `fadeIn(el)` helper (0.18s opacity) for state swaps. Keep.
- Resend countdown is text-only — no motion.
- No new motion.
- Reduced motion: existing fade is opacity-only and short, but still respect `prefers-reduced-motion: reduce` by setting `el.style.opacity = '1'` directly when the media query matches. Add a small guard at the top of `fadeIn`.

## 6. Touch targets

All controls already meet 44×44 (verified in spec-login-gate-design.md). No change.

## 7. Mid-range Android perf note

- Page is single card + form. No images, no canvas. Cheapest page in the app. Keep it that way.
- The 60s resend countdown uses `setInterval(tick, 500)` — that is fine; the tick is text-only.
- Do NOT add a logo SVG, do NOT add a hero image, do NOT add a background pattern beyond the existing body gradient.

## 8. KPI event hooks

Login-gate spec set already covers these (`product/spec-login-gate.md`). For completeness:

| Element | Event |
|---|---|
| Page load | `login_page_viewed` |
| `requestForm` submit success | `auth_link_requested` |
| `errorForm` submit success | `auth_link_requested` (with `data-context="retry"`) |
| `resendBtn` click | `auth_link_resent` |
| `consumeToken` success (`/lookmax/` redirect) | `auth_link_consumed` |
| `consumeToken` failure (stateError shown) | `auth_link_expired` |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| All `data-copy="login.*"` slots | Locked per `product/spec-login-gate-copy.md`. |
| `#stateLoading` body line | `[COPY DRAFT NEEDED]` — single Consultant-voice line. |
| Recoloured consume-error message text | Keep verbatim from `data-copy="login.error.expired"`. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. The single line for `#stateLoading` — short, serif italic, `--muted`. Suggested cadence: 3–6 words. Founder owns.

## 11. Frontend-implementation notes

- **Edit `public/lookmax/login.html` and `public/lookmax/app.css` only.**
- §2.1 — adjust inline style at `login.html:26` from `style="margin:14px 0 6px"` to `style="margin:10px 0 6px"`, and add `style="margin-bottom:6px"` to the eyebrow at `:25` (currently has none).
- §2.2 — change `<p class="hint" style="text-align:center;padding:12px 0"><!-- TODO copy review login.loading --></p>` at `:100` to `<p class="login-loading-note" data-copy="login.loading">[COPY: founder approves]</p>`. Add CSS rule `.login-loading-note { text-align: center; padding: 18px 0; color: var(--muted); font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 15px; }`.
- §2.3 — change `<p class="err" id="expiredErr" ...>` to `<p class="login-error-note" id="expiredErr" role="alert" aria-live="polite" data-copy="login.error.expired">`. Add CSS rule in `app.css` (or inline) `.login-error-note { color: var(--muted); font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; padding: 6px 0 6px 14px; border-left: 2px solid var(--gold); }`.
- Add the reduced-motion guard at the top of the `fadeIn` function: `if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.remove('hidden'); el.style.opacity = '1'; return; }`.
- Do NOT touch the API endpoints, the state-switcher logic, the resend countdown, or the consume flow. All correct as shipped.

End of spec.
