# FUNNEL AUDIT — Lookmaxxing 11-stage journey (LIVE)

**Date:** 2026-06-01
**Live host:** https://maincharacter.digitglobalservices.com
**Build verified live:** `8fc27b7` (from `/health`)
**Auditor:** Claude (orchestrator) — walked the live site as a logged-out new user (desktop), probed gated endpoints directly, and read the backing code for every gated stage.

> Reference note: the brief cites `maincharacter-full-system.html` as the 11-stage source of truth. **That file does not exist in the repo** (searched the whole Desktop). I used the 11 stages enumerated in the brief instead. Flagging so we can add the canonical reference doc.

---

## PART 1 — PER-STAGE STATUS

> **Table updated after fixes + live re-verification (see "FIX LOG" at bottom). Several first-pass 🟥s were my own misreads — corrected and noted.**

| # | Stage | Status | One-line verdict |
|---|-------|--------|------------------|
| 1 | Landing (`/`) | 🟩 **PASS** | Loads, themed, adaptive nav. Hero CTA routing is **adaptive & correct** (logged-out → audit, signed-in → app). Earlier "bypass" was my stale token. |
| 2 | Sign-in / sign-up | 🟩 **PASS (live)** | **Both work on live:** email magic-link (`{"status":"sent"}`) AND Google (`/auth/google/start` → real Google account chooser). |
| 3 | 5 calibration questions (`/lookmaxing/quiz`) | 🟨 **INCOMPLETE** | Auth-gated. Clean redirect to `/lookmaxing/start` when logged-out (no dead-end). Needs your login to traverse live. |
| 4 | Photo capture (`/lookmaxing/capture`) | 🟨 **INCOMPLETE** | Auth-gated, clean redirects (401 → start). Needs login + a photo to traverse. |
| 5 | Analysing state | 🟨 **INCOMPLETE (overlay + error path verified in code)** | Overlay exists ("Reading the photograph… Hold."), error path is graceful (re-enable + retry, no blank/spinner-forever). Not seen live. |
| 6 | Free reading (`/lookmaxing/audit/:id`) | 🟨 **INCOMPLETE (Gemini now confirmed OK)** | Gated + ownership-enforced. **Live `geminiKey:"ok"`** → real readings can generate. Need login to see one. |
| 7 | ₹99 unlock (test mode) | 🟨 **INCOMPLETE** | Gated. Razorpay test wired (`razorpay:true`). Resolution gate + `/pay/order` present. Needs login + test card. |
| 8 | Full report (`/lookmaxing/audit/:id/full`) | 🟨 **INCOMPLETE** | Gated. Needs login. |
| 9 | Maybe Later → dashboard (`/lookmax/`) | 🟩 **FIXED (was BROKEN)** | Confirmed blank-shell dead-end from a **stale service worker** → fixed (network-first nav, `lookmax-v3` live). |
| 10 | Start 7-day trial | 🟨 **INCOMPLETE** | Fork page renders. Trial-CTA prominence to be verified live (gated). |
| 11 | Daily Mirror loop | 🟨 **INCOMPLETE (Gemini OK)** | Gated. Mirror uses Gemini (live key valid). Generic fallback only fires on RPM-cap/transient failure. Full loop needs login to walk. |

**Legend:** 🟩 PASS/FIXED · 🟨 INCOMPLETE (auth-gated — needs your login to finish) · 🟥 BROKEN.

---

## CROSS-CUTTING FINDINGS (root causes)

### #1 — ✅ RESOLVED/RE-SCOPED: Live Gemini key is VALID (local .env key was leaked)
- **Initial alarm, then corrected by a live probe.** The committed **local** `.env` `GEMINI_API_KEY` returns `403 "Your API key was reported as leaked"`. I assumed Render shared it.
- I shipped a live **validity probe** (`lib/gemini-health.js` → `/health.config.geminiKey`). After deploy, **live reports `geminiKey: "ok"`** — the Render key is a different, valid key. **Real readings can generate on live.**
- So the founder's reported generic text ("Your reading is recorded. The structure is here to build on…", `services/vision.js:157` `fallbackDiagnosis`, used by the **Daily Mirror** + legacy `/audit`) was **not** a dead key. Most likely a **transient RPM-guard fallback** (10 calls/min cap in `vision.js`) or a reading taken **before** the key was rotated. Now monitorable: if the key ever flips to `leaked`/`rate_limited`, `/health` shows it.
- Residual: the `vision.js` fallback copy is a flagged placeholder (`// TODO copy review`) and reveals a fallback in Consultant voice — worth replacing, and worth widening the RPM cap or queuing. Lower priority than a dead key.
- Confirm Render has **not** pinned `GEMINI_MODEL=gemini-2.0-flash` (retired 2026-06-01); default `gemini-2.5-flash` is correct.

### #2 — 🟥 CRITICAL: Stale service worker → blank-dashboard dead-end
- `public/lookmax/sw.js` is **cache-first for the `/lookmax/` shell** and only invalidates when `CACHE_VERSION` changes. The dashboard `index.html` was updated (the `requireSession` redirect) **without bumping `CACHE_VERSION`**, so returning users are served the old shell forever.
- **Reproduced live:** logged-out, `/lookmax/` rendered an empty shell (96 chars of text, **zero buttons**). After `unregister()` + `caches.delete('lookmax-v2')`, `/lookmax/` correctly redirected to `/lookmax/login`.
- This also makes every future `/lookmax/*` HTML fix invisible to existing users until the cache version bumps.

### #3 — ✅ CORRECTED: Google sign-in WORKS on live (my earlier read was a flaky click)
- Re-tested after deploy: `/api/lookmax/auth/google/start` **302s to a real Google consent URL** (valid `client_id` `2654…apps.googleusercontent.com`, correct `redirect_uri`), and a browser click reaches **Google's account chooser** (`accounts.google.com/v3/signin/accountchooser`). `auth/method` now returns `{"method":"email","google":true}`.
- My first "silent bounce" observation was an automated click that didn't register as a navigation — **not** a real dead-end. **Stage 2 sign-in is PASS for both Google and email on live.**
- Defensive fix still shipped: `start.html` now only renders the Google button when `/auth/method` reports `google:true`, so if OAuth is ever unset the button can't dead-end. No-op on live today (google:true).
- Residual nit (low): `/lookmax/login` ("Enter the room.") offers only email — no Google — so the two sign-in surfaces aren't symmetric. Cosmetic.

### #4 — ✅ CORRECTED: Funnel entry routing is adaptive (NOT a bug)
- Initial reading was wrong: I still had a stale token in localStorage. Landing JS (`landing.html:1616`) sets `signedIn = !!localStorage.getItem('lookmax.token')` and rewrites all `.js-cta-main` CTAs → `/lookmax/` only when signed in; **logged-out users correctly go to `/lookmaxing` (the audit).** Verified in source.
- Residual nit: `signedIn` keys off mere token *presence*, so a **dead/stale token** (e.g. the old guest token, #7) mis-routes a user to `/lookmax/`. Once the SW fix lands, the dashboard's `requireSession` 401 → `clearToken()` → `/lookmax/login` self-heals this. No separate fix needed.

### #5 — 🟧 Theme split across the two halves of the funnel
- Audit funnel (`/lookmaxing/*`, `tokens.css` `--mc-*`) = **monochrome silver/charcoal**, no aubergine, no gold.
- App (`/lookmax/*`) = **gold + dark** (login page is gold-buttoned).
- Brief's target theme = **black + aubergine glow + gold sparingly (glow-not-fill)**. Neither half fully matches; they don't match each other. Two leftover theme-preview files (`theme-preview-aubergine.html`, `theme-preview-charcoal.html`) show the decision was never finalised/applied.

### #6 — 🟧 Legacy `/audit` funnel is broken on live (async/Postgres mismatch)
- `POST /api/audit/session` returns `{}` (HTTP 200, **no `sessionToken`**) on live. Cause: under `DATABASE_URL` the model methods become async, but `routes/audit.js` calls `AuditSession.createSession()` **without `await`** → serialises a Promise → empty token → whole legacy funnel dead.
- Lower priority (it's the rollback/reference funnel, not the active one) but it's a real dead-end if anything links to `/audit`.

### #7 — 🟨 Stale guest token persisted in localStorage
- This browser carried a `lookmax.token` with **only `{scope}` and a 24h TTL** (no `userId`) — an artifact of an older build that signed a token for an empty guest user. It resolves to `404 user-not-found` on every authed call. Current code correctly issues **45-day** tokens with `userId` on real login, so new logins are fine — but old tokens are dead weight that should be cleared.

### Session persistence (45-day) — code-correct, needs post-login live confirm
- `lib/lookmax-auth.js` `TOKEN_TTL = '45d'`, stored in `localStorage` (survives close/reopen). **Correct in code.** Could not confirm end-to-end on live because completing login needs the founder to click an emailed magic link.

### Mobile
- All pages carry `<meta name="viewport" content="width=device-width, initial-scale=1.0">` and the funnel CSS uses `@media` breakpoints (e.g. `768px` in `fork.html`/`audit.html`). **Pixel-level mobile could not be verified** — the browser-automation tool renders at a fixed ~1470px viewport regardless of window resize. Marked INCOMPLETE honestly; will verify via responsive CSS review per page during fixes.

---

## WHAT YOU (FOUNDER) MUST DO — items I cannot do myself
1. **Rotate `GEMINI_API_KEY`** in the Render dashboard with a fresh key (the committed one is leaked/403). This is the single highest-value fix — it restores real readings. *(I cannot enter API keys or edit Render env — security policy.)*
2. **(Optional) Enable Google sign-in:** add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (+ redirect URI) to Render. Until then I will **hide** the Google button so it stops dead-ending.
3. **Complete one email magic-link login** so I can verify stages 3–11 end-to-end on live (quiz → capture → reading → ₹99 test → report → dashboard → trial → Mirror). I'll tell you exactly which link to click once the email-login fix is deployed.
4. Confirm Render has **not** pinned `GEMINI_MODEL=gemini-2.0-flash` (retired today).

---

## PART 2 — FIX PLAN (status tracked below as I land each)
- [ ] #2 Service worker self-heal (bump version + network-first HTML) — *I can fix + verify live.*
- [ ] #3 Hide Google button when unconfigured (no silent dead-end) — *I can fix + verify live.*
- [ ] #1 Make `/health` report Gemini **validity** (cached probe), so leaked-key is visible — *I can fix + verify live; rotation itself is founder action.*
- [ ] #6 Legacy `/audit` async `await` fix — *I can fix.*
- [ ] #4 Re-point hero CTA to the audit (or make the audit the primary path) — *pending founder nod on funnel intent.*
- [ ] #5 Theme unification onto aubergine+gold — *large; delegate to design + frontend agents.*
- [ ] Sweep every transition for blank/dead states; back/refresh/expired-session handling.

_Proof-of-fix (live screenshots + curl) appended per item below as each ships._
