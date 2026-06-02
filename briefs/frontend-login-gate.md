# Brief — frontend-agent — Login Gate

> Parent spec: `product/spec-login-gate.md` (read §3 full flow + §11 acceptance criteria before writing)
> CLAUDE.md §6 rules apply: vanilla HTML/CSS/JS only, no frameworks, no new build step, no new dependencies.

## What you own

Wire the UI state for two existing pages + one design-agent layout. All behaviour goes live only when `LOOKMAX_EMAIL_LOGIN=true` (server-controlled — your code reads the discovery endpoint, doesn't read the env var).

## Files you will touch

- `public/lookmax/login.html` — substantial rewrite of the existing inline `<script>` block + body (keep the `<head>`, manifest, fonts, app.css link, app.js link). The three states from the design brief render in the same DOM with `display:none` toggling.
- `public/payment-confirmed.html` — add the auto-poll loop in `load()` (spec §3 F1), wire the new step button (spec §4 surface 2), wire the fallback "send email link" button.
- `public/paywall.html` — make the email field `required` whenever `pillars.includes('lookmaxxing')`. Single conditional in `begin()` and an `aria-required` toggle on the input when a Lookmaxxing card is selected. **Do not rewrite the locked card copy.**

## What you do NOT touch

- `public/lookmax/app.js` — the shared client. Reuse `LM.setToken`, `LM.api`, `LM.requireSession`. Do not modify the file.
- `public/lookmax/app.css` — reuse existing classes (`.page`, `.card`, `.field`, `.btn`, `.btn--solid`, `.hint`, `.err`, `.footer-note`). Flag any missing utility to design-agent — do not invent.
- The `/lookmax/admin-login` page.
- Any locked copy in landing.html / paywall.html cards / payment-confirmed.html step copy beyond the slots called out below.

## Behaviour spec — `public/lookmax/login.html`

### On load
1. If `URLSearchParams` has `token`:
   - POST `/api/lookmax/auth/consume-link` with `{token}`.
   - On success: `LM.setToken(data.token)` → `location.href='/lookmax/'`.
   - On failure: render **consume-error state** (re-shows email input below the error line).
2. Else:
   - GET `/api/lookmax/auth/method`.
   - If `method` includes `'email'`: render **request state** (email form).
   - If only `'admin'` is returned (flag off): render today's "OTP unavailable — use Admin login →" fallback. This preserves rollback.

### Request state behaviour
- Submit → POST `/api/lookmax/auth/request-link` with `{email}`.
- On 200 `{status:'sent'}`: render **check-inbox state**, mask the email client-side as `firstChar + '••••' + '@' + domain`.
- On 429 or 5xx: render `login.error.network` inline, re-enable button.
- Disable submit on click; re-enable after response.

### Check-inbox state behaviour
- Show masked email + `login.checkInbox.headline` copy.
- 60s timer → fade in `login.checkInbox.resend` link. Click → return to request state, pre-filled email, send again.

### Consume-error state behaviour
- Show `login.error.expired` line.
- Show the email input + button immediately below (lets user re-request without nav).
- Submit behaviour identical to request state.

### Empty / loading
- A brief `[copy-consultant TBD] login.loading` line covers the consume-link round-trip (typically <500ms). Do NOT show a spinner — the page is already minimal.

## Behaviour spec — `public/payment-confirmed.html`

### Modify `load()` (existing function, line 110-137)
- On the existing first fetch:
  - If `res.ok && d.found` → proceed to render (existing).
  - Else: enter **auto-poll loop** — refetch every 3s for up to 30s. On first successful response, exit loop and render.
  - After 30s with no success: show the existing `#error` block PLUS the new fallback "Send me an email link instead" button (`confirmed.fallbackEmailLink` slot) linking to `/lookmax/login`.
- During the poll window: `#loading` shows the `confirmed.pollingState` copy. No alarming red, no spinner — quiet text only (design-agent owns the visual).

### NEW behaviour — silent first login (the happy path)
- After the existing `renderSteps(d)` call, if `d.firstLoginToken`:
  - POST `/api/lookmax/auth/exchange-first-login` with `{firstLoginToken: d.firstLoginToken}`.
  - On success: `LM.setToken(data.token)` (LM is already exposed by app.js — but app.js is **not** loaded on payment-confirmed.html today; the simplest path is to set `localStorage.setItem('lookmax.token', data.token)` directly with a one-line inline helper).
  - The existing step "Open the mirror at /lookmax/" becomes a `<button>` (design-agent provides markup) that does `location.href='/lookmax/'`. With the token already in localStorage, the destination loads logged-in.
  - On failure of the exchange: render the step as today's plain text. The user can still navigate; they'll be bounced to `/lookmax/login` and use the magic link from their receipt email (F2).

### Quiet log
- Console errors are forbidden (CLAUDE.md §6 rule 7). If the exchange fails, fail silently UI-wise; the step text just degrades to today's behaviour. No alerts.

## Behaviour spec — `public/paywall.html`

### Modify `begin()` (line 218)
- Compute `requireEmail = pillars.includes('lookmaxxing')` at the top.
- If `requireEmail` AND `!email`: `err.textContent = '[copy-consultant TBD] paywall.email.required'; return;`
- Otherwise (Orator-only): existing email-optional behaviour preserved.

### Visual cue
- Add `data-required="lookmax"` to the email input (no class rename; design-agent decides if a `*` glyph is added on selection — for v1 the requirement is enforced at submit time only).
- Do NOT touch the email label `<label for="email">Email <span style="opacity:.6">(optional — for receipts)</span></label>` until copy-consultant provides a conditional version. The error message on submit is the v1 enforcement; the label evolves in a follow-up copy pass.

## Slots you will leave as `[copy-consultant TBD]`

All of them, per spec §5. Do NOT improvise Consultant voice.

You will however render them — use `data-copy="login.headline"` style attributes so a future find/replace can swap them out without re-walking the JS. Example:

```html
<h1 data-copy="login.headline">[copy-consultant TBD] login.headline</h1>
```

## Test plan

There is no frontend unit-test framework wired in this repo today (verified). Coverage is via:
- **Smoke** — extend `npm run smoke` to GET `/lookmax/login` and assert the page returns 200 with the email input present.
- **Manual happy-path** documented in the PR description per CLAUDE.md §7 (the section explicitly requires it for user-facing PRs).
- **QA pass against spec §11 acceptance criteria** before merge.

## What you escalate

- Any need to add a frontend dependency, build step, or framework: stop, escalate.
- Any need to touch app.js or app.css: stop, escalate to design-agent.
- Any locked-copy slot that does not have a `[copy-consultant TBD]` placeholder ready when you need to render it: stop, ask copy-consultant.
- If `LM.setToken` is not callable on payment-confirmed.html because app.js isn't loaded there: use the one-line `localStorage.setItem('lookmax.token', token)` fallback (the key string is the same — verified in `app.js:7`). Do NOT load app.js on payment-confirmed.html (would pull in the nav, install-prompt, SW registration on a page that does not want any of them).
