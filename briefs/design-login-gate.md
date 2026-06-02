# Brief — design-agent — Login Gate

> Parent spec: `product/spec-login-gate.md`
> Read CLAUDE.md §2 (brand voice) and the spec §3 (full flow) before designing anything.

## What you own

Lay out two surfaces inside the locked design tokens (obsidian `#070708`, gold `#e8b84b`, ink `#f4f1ea`, Cormorant Garamond italic for headlines, Sora for body; ◆ as the only iconography). **Do not invent tokens, do not introduce new colours, do not rewrite the global page chrome.**

### Surface 1 — `public/lookmax/login.html` (full rewrite of body, scaffolding kept)

Three states on the same page (no navigation between sub-pages — state toggled in DOM):

1. **Request state** (default):
   - Eyebrow `◆ MainCharacter`
   - Single h1 (slot `login.headline`)
   - One sub-line (slot `login.sub`)
   - Single email input (label `login.email.label`, placeholder `login.email.placeholder`)
   - Single primary button full-width (slot `login.cta`)
   - Footer note (slot `login.footer`)
   - The `<a href="/lookmax/admin-login">use Admin login →</a>` line is **removed** — admin login is reachable by direct URL only (debugging seam).
2. **Check-inbox state** (after successful request-link):
   - Same eyebrow + h1
   - Replace the sub-line + input + button with: (a) one line confirming the link is on its way to a **masked** email (e.g. `n••••@example.com`), (b) the 15-min TTL stated once, (c) a "Send another →" affordance that fades in after 60s.
3. **Consume-error state** (when `?token=` is present and exchange fails):
   - Same eyebrow + h1
   - One line `login.error.expired` (single message for expired/used/malformed — see spec §9)
   - Re-shows the email input + button so the user can re-request without navigating.

**Visual references that already work and should be inherited:**
- The `.page` / `.card` / `.field` / `.btn--solid` classes in `/lookmax/app.css` (existing — do not duplicate)
- The eyebrow + serif-italic-headline + muted-sub stack at the top of `public/lookmax/index.html` (existing pattern)
- The form field treatment on `public/paywall.html:159-167` (existing pattern)

**Mobile-first** (this is the target user). Single column. Buttons full-width. Email input `type="email" inputmode="email" autocomplete="email"`.

### Surface 2 — `public/payment-confirmed.html` modifications

Two design changes on an otherwise-locked page:

1. **The Lookmaxxing step (line 92)** becomes a button instead of a text line. Visually inherit the existing `.install` button treatment (line 33-35 of payment-confirmed.html). Label per `confirmed.mirrorCta` slot (founder copy). Position: the step row stays where it is; the right side now holds the button.
2. **The "being verified" auto-poll state** (audit P1-H fix): when the page is in the loading/auto-poll window, the existing `#loading` element shows the `confirmed.pollingState` copy with a quiet animated dot ellipsis (CSS only — no JS, no spinner library). The current red-tinted `#error` block only appears after the 30s auto-poll window elapses with no success, and gains a secondary "Send me an email link instead" button (`confirmed.fallbackEmailLink` slot) that links to `/lookmax/login`.

### Surface 3 — `data/email-templates/magic-link.html` (NEW template — visual design)

Mirror the existing `paywall-receipt.html` markup conventions (table-based, inline styles, obsidian + gold). One paragraph + one prominent gold CTA button. Plain-text fallback link below. Subject line per `email.magic.subject` slot. **Do not introduce new visual elements** — the user reads this in 15 client variants; consistency with the existing receipt template matters more than novelty.

## Hand-off deliverables

- A single annotated mockup (text-on-design or layered file is fine — the existing tokens make a click-through prototype unnecessary) covering the three states of login.html, the two modifications on payment-confirmed.html, and the magic-link email layout.
- Specific class names to use (must reuse `/lookmax/app.css` — flag any new utility class needed and justify).
- Confirm: no new colours, no new fonts, no new icons, no animation library, no emoji except `◆`.

## Hard rules (from CLAUDE.md §2)

- ◆ is the only allowed emoji. No 🔥, no checkmarks, no exclamation marks.
- The Consultant voice is dignified, restrained, mentor-grade. Your copy slots are placeholders for copy-consultant — leave them `[copy-consultant TBD]`, do not improvise.
- Generous negative space. Short sentence cadence. Single-axis hierarchy per state.

## Out of scope for you

- Backend route shapes (backend-agent owns).
- Frontend wiring + state management (frontend-agent owns).
- Copy drafting (copy-consultant-agent owns; founder approves).
- The admin-login page styling (unchanged).
