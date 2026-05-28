# Design — Payment Confirmed (`/payment-confirmed`)

> Surface: `public/payment-confirmed.html`. Post-Razorpay handoff. Carries the silent first-login JWT exchange.
> Locked tokens. Polling logic and exchange flow are already correct — this spec is only about the felt moment.

---

## 1. Status of current execution

Functionally correct and visually restrained. The page polls `/api/payment/status` every 3s for up to 30s, exchanges a `firstLoginToken` silently for a JWT once the webhook confirms the subscription, then renders a 3-row receipt + an `Open the mirror` CTA + a PWA install affordance. The dot-ellipsis on `Confirming with the bank` is the right kind of restraint. Three frictions: (a) the **`Confirming with the bank` state has no visual moment** — it is a single grey line on an obsidian page, which on a 3G connection waiting 12+ seconds feels broken not patient; (b) the **headline `The Chamber is open, ${name}.` arrives all at once with no ceremony** — the user just paid ₹1,499–₹1,999, and the page treats the transition as if they refreshed an inbox; (c) the **`Open the mirror` button is a small gold-bordered pill inside a step row**, visually identical to the `Install the app` chip below it, when it is in fact the primary "you have arrived" action for Lookmaxxing buyers.

The 30s timeout fallback `Send me an entry link instead` is excellent — keep verbatim.

## 2. The change

Three small interventions, no new copy beyond what's already approved in the login-gate spec set:

1. **Waiting state — add a single gold ◆ centred above the `Confirming with the bank` line**, sized at 2.5rem `--gold` with a slow 4s breath (opacity 0.6→1→0.6). This is the only motion on the page during waiting. It tells the user "we are here, this is being witnessed."
2. **Confirmed state — re-hierarchy the steps card so the Mirror CTA is THE moment, not a step row.** Lift the Mirror CTA out of the `.steps` container into its own block directly under the headline + lede, before the receipt. The receipt drops down to second-class real estate (`--ink-faint` labels, narrower). The "Install the app" affordance becomes a thin link below the receipt, not a button-pill. Only the Mirror CTA looks like a primary action.
3. **Receipt — collapse to a single line on mobile** to keep the moment from looking like a checkout confirmation. Plan name + amount + next billing date on one row, dot-separated, in `--ink-dim` 0.82rem. The 3-row stacked treatment was the right call when receipt was the headline; it isn't here.

The polling logic, the silent exchange, the 30s timeout, and the F2 fallback link all stay untouched.

## 3. Layout specification

### Mobile (360–767px)

**State: Polling (`#loading` visible)**

```
┌─────────────────────────────┐
│                              │
│            ◆                 │  NEW: 2.5rem --gold, slow breath
│                              │  4s ease, opacity 0.6→1→0.6
│  Confirming with the bank    │  --muted 14px Sora 300
│              ...             │  existing dot ellipsis
│                              │
└─────────────────────────────┘
```

(centre-aligned in viewport via existing flex-centre body)

**State: Confirmed (`#confirmed` visible)**

```
┌─────────────────────────────┐
│  ◆ MainCharacter             │  eyebrow
│                              │
│  The Chamber is open,        │  h1 italic serif clamp(32px,6vw,50px)
│  Arjun. ◆                    │  --ink
│                              │
│  Your place is held. Here    │  .lede --muted 16px
│  is what happens next.       │
│                              │
│  ╭───────────────────────╮   │  NEW: Mirror CTA as standalone moment
│  │                       │   │
│  │  The mirror is ready  │   │  serif italic 17px --ink centred
│  │  when you are.        │   │
│  │                       │   │
│  │  ┌─────────────────┐  │   │  primary CTA: solid gold bg, obsidian
│  │  │ OPEN THE MIRROR │  │   │  text, 16px Sora 600, padding 14px 32px
│  │  └─────────────────┘  │   │  radius 9px, full-width minus 24px
│  │                       │   │
│  ╰───────────────────────╯   │  no border; the space frames it
│                              │
│  Day-1 protocol arrives      │  (Orator-only or hybrid users — existing
│  tomorrow morning at your    │   logic, single step row, --muted 13px)
│  preferred time.             │
│                              │
│  ─────────────────────────   │  divider 1px --line
│                              │
│  Aura++ · ₹1,999/mo ·        │  NEW: single-line receipt
│  next billing 27 Jun         │  --ink-dim 0.82rem, dot-separated
│                              │
│  ─────────────────────────   │
│                              │
│  Install the app             │  --gold underlined link, 0.78rem
│                              │
│  ◆ MainCharacter             │  footer
└─────────────────────────────┘
```

**State: Error (30s timeout, `#error` visible)** — unchanged from current.

### Desktop (≥768px)

- Card max-width 600px centred (existing).
- Mirror CTA block: same vertical layout, button caps at 280px wide centred.
- Receipt: still single-line on desktop (no need for 3-row stack).
- Footer sits 40px below the install link.

## 4. States required

| State | Behaviour |
|---|---|
| **Initial / polling** | `◆` + breath animation + `Confirming with the bank...` line. No other content. |
| **Polling, slow connection (>10s)** | Same visual state — no progress bar, no countdown. The breath is enough. |
| **Confirmed (Lookmax only)** | Mirror CTA block first; single step row "Install the app" (now a link). No Orator step. |
| **Confirmed (Orator only)** | No Mirror CTA block; single step row "Day-1 protocol arrives tomorrow…" rendered as the primary moment (use the same CTA-block treatment but with `BEGIN DAY 1` button greyed out / disabled with caption "Tomorrow at your preferred time"). `[COPY DRAFT NEEDED]` for the disabled-button label and caption. |
| **Confirmed (Aura++ / both pillars)** | Mirror CTA block first (Lookmax is web-immediate). Orator note as a secondary single line below. |
| **Confirmed, JWT exchange failed silently** | Mirror CTA still renders; on tap, user is bounced to `/lookmax/login` (existing F2 degradation in `payment-confirmed.html:131`). |
| **Confirmed, no `firstLoginToken` in response** | Mirror CTA still renders; on tap → `/lookmax/` will redirect to login if no token. Same as F2 path. |
| **Error (30s timeout)** | Existing `#error` block with the support email + `Send me an entry link instead` link. No change. |
| **Error (no `subscriptionId` in URL)** | Existing `showError()` path. No change. |

## 5. Motion

- **`◆` breath:** `@keyframes mc-breath { 0%,100%{ opacity: 0.6; } 50%{ opacity: 1; } }` over 4s ease-in-out. Pure opacity, no transform. Cheap on Android.
- **Dot ellipsis:** existing CSS animation in `payment-confirmed.html:46-62`. Keep.
- **Confirmed transition:** existing `display: none → block` swap. Add a 0.4s fade-in on `#confirmed` using opacity-only — no translateY (the user has already waited; the content should not slide).
- **Reduced motion:** `◆` breath becomes static at opacity 1; dot ellipsis falls back to static `...` (already handled in existing CSS at `:60-62`); confirmed swap becomes instant.

## 6. Touch targets

- Mirror CTA button: 14px padding + 16px font ≈ 44px. Bump to `padding: 15px 32px` to land at 47px comfortable.
- Install link: 0.78rem text — must have `padding: 12px 16px; min-height: 44px; display: inline-block;` even though it looks like a link.
- Support email link in error state: same treatment.
- F2 `Send me an entry link instead` link: same treatment.

## 7. Mid-range Android perf note

- No backdrop-filter.
- Body has one radial-gradient (`paywall.html` pattern). Don't add a second.
- The breath animation is opacity-only on a single small element — safe.
- Polling fetches at 3s intervals — keep; do not shorten.

## 8. KPI event hooks

| Element | Event | Notes |
|---|---|---|
| Page load | `payment_confirmed_loaded` | Carries `data-subscription-id`. |
| First successful `/api/payment/status` response with `found:true` | `payment_confirmed` | Carries plan + `data-source="webhook"`. |
| 30s timeout reached | `payment_confirm_timeout` | Catches webhook lag — counter-metric for ops. |
| `Open the mirror` button click | `first_mirror_click` | The proof-of-handoff event for Lookmax. |
| `Send me an entry link instead` link click (F2 fallback) | `first_login_fallback_clicked` | |
| `Install the app` link click | `pwa_install_prompted` | Fires `deferredPrompt.prompt()`. |
| PWA `appinstalled` event | `pwa_installed` | Lagging metric. |

## 9. Copy lock vs draft

| Slot | Source / status |
|---|---|
| `Confirming with the bank` | Locked (`payment-confirmed.html:70`). |
| `The Chamber is open, ${name}. ◆` | Locked (`:217`). |
| `Your place is held. Here is what happens next.` | Locked (`:74`). |
| `The mirror is ready when you are.` | Approved per `FOUNDER COPY` flag at `:173` — current placeholder. Founder may swap. |
| `Open the mirror` button label | Approved placeholder per `:177-178`. Founder may swap. |
| Day-1 step text (`Your first message arrives tomorrow morning at your preferred time.`) | Approved (`:153`). |
| Install the app | Approved (`:192`). |
| `Send me an entry link instead` | Approved (`:97`). |
| 30s error body | Approved (`:88-90`). |
| Orator-only disabled CTA label / caption | `[COPY DRAFT NEEDED]` — see §10. |

## 10. Copy decisions to escalate to copy-consultant-agent

1. Orator-only confirmed state — should the "Day-1 protocol arrives tomorrow" line be its own Mirror-CTA-style block, and if so what is the disabled-button label and caption? (Today the line just appears as one of N step rows.) Founder owns whether this even needs a designed primary moment given Orator delivers via WhatsApp.

## 11. Frontend-implementation notes

- **Edit `public/payment-confirmed.html` only.** Single-file.
- Add a `<div class="pc-breath">◆</div>` inside `#loading`, before the existing `Confirming with the bank` text. CSS: `font-family: var(--font-serif, 'Cormorant Garamond', serif); font-size: 2.5rem; color: var(--gold); text-align: center; margin-bottom: 18px; animation: mc-breath 4s ease-in-out infinite;`. Add the `@keyframes mc-breath` rule and the `@media (prefers-reduced-motion: reduce)` override that sets `animation: none; opacity: 1`.
- Restructure `renderSteps(d)` at `:150-211`:
  - If `d.lookmaxxingActive`: render a new `.pc-mirror-cta` block *outside* the `.steps` container — a div with the supporting line + the `Open the mirror` button styled as a primary solid-gold CTA (re-use the existing `.install` rule but with `background: var(--gold); color: var(--obsidian); padding: 15px 32px; font-size: 16px; min-width: 220px;`).
  - The remaining `.steps` container becomes a single small note row for Orator-side info (if any) — keep `.step` styling unchanged, just lose the visual weight.
  - The PWA install affordance moves to a separate `<div class="pc-install">` below the receipt, styled as a link (`color: var(--gold); text-decoration: underline; font-size: 0.78rem; padding: 12px 16px; display: inline-block;`).
- Collapse the receipt to a single line: change the `.receipt` markup from three `.row` divs to one `<div class="pc-receipt-line">${planLabel} · ${amount}/mo · next billing ${date}</div>`. CSS: `color: var(--muted); font-size: 0.82rem; text-align: center; letter-spacing: 0.04em;`. Keep the `fmtINR` and `fmtDate` helpers.
- Add 0.4s opacity fade to `#confirmed` reveal: when `renderConfirmed` is called, before setting `display: block`, set `opacity: 0`; after one rAF, set `transition: opacity 0.4s ease; opacity: 1;`.
- All `data-event` attributes per §8 — same pattern.
- Do NOT touch the polling logic (`load`, `attempt`, `POLL_INTERVAL`, `POLL_TIMEOUT`), the `exchangeFirstLogin` flow, or the `setLMToken` helper. Those are correct.

End of spec.
