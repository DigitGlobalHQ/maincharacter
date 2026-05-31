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

## PART 2 — FIX LOG (all shipped to `main` → Render → verified LIVE)

| Fix | Commit | Live proof |
|-----|--------|-----------|
| **Service worker self-heal** — navigations network-first, `lookmax-v2`→`v3`. Kills the blank-dashboard dead-end (#2) permanently. | `f09063d` | `GET /lookmax/sw.js` → `CACHE_VERSION='lookmax-v3'` + `isNavigation` network-first branch. Logged-out `/lookmax/` now redirects to `/lookmax/login`. |
| **Gemini key validity probe** — `/health.config.geminiKey` = `ok\|leaked\|invalid_key\|rate_limited`. | `0f25f5c` | Live `/health` → `geminiKey:"ok"` → **live key is valid; real readings generate.** |
| **Google sign-in: hide when unconfigured** — `/auth/method` now returns `{google}`; `start.html` shows the button only when true (defensive; live `google:true`). | `0e2cdca` | `auth/method` → `{"method":"email","google":true}`; clicking Google reaches Google's account chooser. |
| **AuditSession `await` (Postgres adapter)** — legacy `/audit` + lookmaxBaseline snapshot on payment/export were silently no-op'ing. | `0c5be2f` | `POST /api/audit/session` → returns a real `sessionToken` (was `{}`). |
| **Theme unification** — black + aubergine radial glow (background-only) + gold-outline/glow CTAs (glow-not-fill), gold sparingly. Applied to funnel (`tokens.css`), app (`app.css`), landing. | `6044f62` | Live screenshots: `/lookmaxing` + `/lookmax/login` both show aubergine glow + gold-glow CTAs. |
| **Intro-video empty box** — hidden until `INTRO_VIDEO_ID` is set (no perpetual "Video loading"). | `60d07ca` | Live `/lookmaxing` → `id="intro-video-section" … hidden`. |
| **7-day trial CTA enabled** — `window.LOOKMAX_TRIAL_LIVE` was never set → button permanently disabled (dead stage-10). Now injected server-side (default on, `LOOKMAX_TRIAL_LIVE=false` to disable). | `54425d1` | Live `/lookmaxing/fork` → `window.LOOKMAX_TRIAL_LIVE=true`. |

**Tests:** 1214 passing / 20 skipped. **Smoke:** 44/44. All conventional commits, pushed to `main`.

### Corrected findings (my first-pass errors, now fixed/verified)
- Live Gemini is **OK** (not leaked — that was only the local `.env` key). #1.
- Google sign-in **works** on live (reaches Google). #3.
- Hero CTA routing is **adaptive & correct**. #4.

### Transition / back-button / expired-session sweep
- Deep-link to a gated page with no session → clean redirect to sign-in. **Verified live:** `/lookmaxing/quiz` (no token) → `/lookmaxing/start` (no blank/crash).
- Analyse failure path (`capture.html`) → overlay hides, button re-enables, error shown, retry available. No infinite spinner. (code-verified)
- Dead/expired token → dashboard `requireSession` 401 → `clearToken()` → `/lookmax/login`. (code-verified; the SW fix makes this reachable again.)

---

## DAILY MIRROR LOOP — implementation status (stage 11)
All endpoints exist in `routes/lookmax.js` and are unit-tested (all `tests/lookmax-*.test.js` green):
- **Daily scan** `POST /mirror` → 8-axis Sharpness score (count-up + 14-day trend canvas in `mirror.html`), `deltaVsYesterday`, `deltaVsBaseline`, `streak++`, `consultantLine` ("why it moved"). ✅ built
- **Night log** `POST /night-log` + `GET /night-log/today` → saved; the next-day "why it may have moved" line reads **last night's** log → feeds tomorrow's delta narrative. ✅ built
- **Weekly weigh-in / Trajectory** → `reveal.html` Trajectory canvas (`#traj`, `#day30Traj`), `weeklyAuditFromMirrors`. ✅ built
- **Streaks** `complete-day` increments `lookmaxProtocolStreak`; mirror streak via `nextStreak`. ✅ built
- **Time-lapse** → `reveal.html` photo stage. ✅ built
- **Day-7 conversion** → cross-sell + upgrade CTAs; Razorpay in **test** mode (`razorpay:true`, public paywall untouched). ✅ built
> Could not walk this loop end-to-end on live (auth-gated + needs daily photos). Per your choice, verified by code + tests; see checklist below to self-verify.

---

## ✅ YOUR CLICK-BY-CLICK CHECKLIST (to verify gated stages 3–11 on live)
Do this once on your phone (most users are mobile). Each step lists what "correct" looks like.

1. Open **maincharacter.digitglobalservices.com** → tap **Begin Your Arc** → you land on `/lookmaxing` (the audit). *(If you're already signed in it goes to `/lookmax/` — sign out first to test the new-user path.)*
2. Tap **Get Your Aura Reading** → `/lookmaxing/start`. Tap **Sign in with email** → enter your email → **Send the link**. ✓ "Check your inbox."
3. Open the email, tap the link → you should land on **`/lookmaxing/quiz`** already signed in (no second login). ✓ session persists.
4. **Quiz:** answer the **5 questions** → each advances; the last → `/lookmaxing/capture`. ✓ no blank between questions.
5. **Capture:** tick the 18+ consent, take/upload a **front photo** → **Upload and analyze**. ✓ the **analysing overlay** ("Reading the photograph. Hold.") shows — no blank screen.
6. **Reading:** you land on `/lookmaxing/audit/<id>` with a **real, specific reading** (headline + single-word signals + blurred premium metrics). ✓ It must NOT say the generic "Your reading is recorded. The structure is here to build on" — if it does, tell me (Gemini RPM/transient) — live key is `ok`, so it should be specific.
7. **₹99 unlock (TEST):** tap unlock → Razorpay **test** checkout → pay with test card `4111 1111 1111 1111`, any future expiry/CVV. ✓ returns to the **full report** unblurred.
8. **Full report** `/lookmaxing/audit/<id>/full` → all 8 blocks visible. ✓
9. **Maybe Later:** from the reading, tap **Maybe later** → you land on the **dashboard** `/lookmax/` (NOT a blank page, NOT bounced to sign-in). ✓ *(this was the stale-SW dead-end — now fixed.)*
10. **Fork / Trial:** at `/lookmaxing/fork`, **"Start your free 7-day trial →"** must be **tappable** (not greyed "seat held"). Tap it → `/lookmax/mirror`. ✓
11. **Daily Mirror loop:** take a mirror selfie → **Sharpness Score** + "why it moved" + a safe task. Add a **night log**; next day's delta should reflect it. After ~7 entries, the **Day-7 / reveal** + conversion CTA appears.

**If anything blanks, spins forever, or dead-ends at any step, screenshot the URL + tell me** — I'll fix it the same way.

### Still on your plate (env — I can't set these)
- *(Optional)* Replace the intro video: set `INTRO_VIDEO_ID` in `public/lookmaxing/index.html` to a YouTube id to show the film.
- *(Optional)* `/lookmax/login` ("Enter the room") only offers email — add a Google button there for symmetry if you want.
- Internal **admin** dashboard (`admin.html`) is not on the aubergine theme yet (internal-only, deprioritised) — say the word and I'll theme it.
