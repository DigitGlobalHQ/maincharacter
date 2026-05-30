# FUNNEL REPAIR LOG — Lookmaxing Audit Engine

**Brief:** `FIX-IT BRIEF — Lookmaxing Funnel Repair` (founder, 2026-05-29)
**Commit tag:** `funnel-repair`
**Order:** P0 → P2 → P1 → P3 → P4 (strict; verify each DONE-WHEN before next)

---

## P0 — Photo → Gemini pipeline

### Step 1 — The REAL errors (captured before fixing)

Reproduced directly against LIVE (`https://maincharacter.digitglobalservices.com`) via the API, plus a standalone Gemini call. Three distinct faults — not one.

**Fault 1 — the visible "Something went wrong" (route contract mismatch, HTTP 404).**
`public/lookmaxing/capture.html:594` POSTs the photo to `/api/lookmaxing/photo`. That route does not exist — the backend route is `/api/lookmaxing/capture` (`routes/lookmaxing.js:590`). Live proof:
```
POST /api/lookmaxing/photo    → HTTP 404      ← what the founder hit
POST /api/lookmaxing/capture  → HTTP 401      ← the real route (needs auth)
```
Compounding it: `capture.html` sends **no `auditId`** in the upload (it expects the response to *return* the id), but `/capture` *requires* `auditId` in the body. Frontend and backend were built to different contracts and never integration-tested (matches morning-report blocker B3).

**Fault 2 — the silent, worse one: every reading runs PHOTO-BLIND.**
Walked the full live funnel through the *working* `/capture` route (guest → quiz → capture w/ image+consent → analyze). `/analyze` returned **HTTP 200 with a real Gemini report** — but the report said verbatim:
> *"No photograph was provided for this audit. All metric scores are inferred from self-reported quiz answers…"*
> context block: *"Cannot assess … without a photograph."* (canthalTilt, nasalStructure, symmetry, etc.)

Root cause: the uploaded photo never survives the round-trip into `/analyze`, so Gemini is called with no image every time. The product *appears* to work (it returns a reading) while never actually looking at the face.

> **Correction (post-fix):** `/health` reports `storage.configured: true` (R2 bucket `maincharacter-lookmax`), so my first hypothesis ("R2 in dry-run → `local:` key") was wrong. R2 **is** configured; the photo-blind symptom is real but its cause sits in the `storage.putPhoto → readImage` round-trip (a key/return-shape mismatch that left `/analyze` unable to read back what `/capture` stored). The fix below sidesteps that path entirely by carrying the photo bytes through the session, which is why it works regardless. The latent R2 round-trip bug is logged in BACKLOG.md — it must be confirmed before relying on R2 for Day-30 baseline-photo persistence.

**Fault 3 (security, NOT a P0 blocker) — committed `.env` Gemini key is leaked & revoked.**
Standalone call with the repo's `.env` key:
```
403 Forbidden — "Your API key was reported as leaked. Please use another API key."
```
This is landmine #3 (`.env` in git). It blocks *local* verification but NOT production — **live Render holds a different, valid key** (proven: the live `/analyze` returned a genuine Gemini report, not the canned fallback). Founder action still required to rotate/remove the leaked key — see "Blocked / needs founder" below. The live model name `gemini-2.5-flash` is valid (the 403 was purely the key).

### Step 2 — Fix (in progress)
- Route contract: accept the upload handler at `/photo` (frontend's path) as well as `/capture`; resolve `auditId` from the guest cookie when the body omits it.
- Photo delivery: in `/capture`, EXIF-auto-orient + downscale the photo with `sharp` and stash the bytes on the session so `/analyze` always passes them to Gemini — independent of whether R2 is configured. Still attempt the R2 put for future baseline persistence. Clear the stashed bytes after analyze (retention hygiene).
- Honest errors: `capture.html` surfaces a useful message per HTTP status (photo problem vs service unavailable) instead of a blanket "Something went wrong."

### Step 4 — Verification (LIVE, after deploy)

Commits: `e6b6f15` (route + photo delivery + honest errors), `54b1eec` (Gemini hardening).
Tests 1133 passing (+4), smoke 38/38.

**Before the fix** (live, real faces): faceB failed 2 of 3 analyze calls — the report
literally said "No photograph was provided." **After the fix**: a real photo now
produces a genuinely photo-based reading, and a reliability batch of **8 readings across
2 different faces returned 8 OK / 0 fail** (was ~67% before the Gemini hardening). Sample
face-shapes returned: round, oval, rectangular — i.e. read from the image, not the
placeholder "oval".

**The two faults are closed:**
- Fault 1 (route 404): `POST /api/lookmaxing/photo` now 200s and resolves the auditId
  from the guest cookie (capture.html sends none).
- Fault 2 (photo-blind): the reading now references real visual features — e.g.
  *"broad forehead, prominent cheekbones, strong jawline"*, *"hairline shows recession at
  the temples"*, *"almond-shaped eyes with a slight negative canthal tilt"*, *"warm smile…
  active smiling expression in the provided photo"*. The "no photograph" warning is gone.

**2 real sample readings (free-resolution; for founder safety review):**

_Sample A_ — answers: powerful goal / sensitive skin / thinning hair / poor sleep / no routine:
```
auraScore 48 (seeker), faceShape "round"
firstImpression: "A soft facial structure with clear opportunities for refinement in
  skin vitality, eye clarity, and grooming geometry."
context.hairDensity: "moderate, with some indications of thinning, aligning with your
  self-reported observations"  ← context, not scored (context-vs-quest respected)
warnings: crop/neckline not assessable — honest about photo limits. No shaming.
```

_Sample B_ — answers: CEO look / oily skin / thick hair / good sleep / tracks grooming:
```
auraScore 71 (ascendant), faceShape "rectangular"
firstImpression: "A strong facial structure is present. Refinements in skin hydration
  and grooming will elevate the overall presentation."
context.boneStructure: "Strong orbital bones and a well-defined mandible…"  ← context only
warnings: "self-reported 'oily…' was not overtly visible in the image"  ← honest, not flattering
```
Both visible-portion outputs are on-brand (restrained, specific, no hype/shaming) and obey
context-vs-quest. The safety-critical premium fields (`quests`/tasks, `decomposition` fixes)
are resolution-gated behind the ₹99 unlock and enforced server-side against the safe-task
allow-list (48 prompt tests) — capture a full set during the Path-A test-card walk to eyeball
the actual task language end-to-end.

**P0 STATUS: ✅ DONE** (real photo → real reading, reliably, verified on live).

### Blocked / needs founder (P0)
- **Rotate the leaked Gemini key.** In Google AI Studio / Cloud Console, create a NEW Gemini API key, set it as `GEMINI_API_KEY` in Render env, delete the old one, and confirm `.env` is git-ignored going forward. (Live works today on the existing Render key, so this is security hygiene, not a launch blocker — but the leaked key must die.) If you paste a fresh key for local use I can run the 2 real-photo sample readings locally too; otherwise I verify against live.

---

## P2 — Sign-in (Google + email)

### Findings
- **Google sign-in was never built** — no `/auth/google` route, no `google-auth-library`, no OAuth client. The button was a dead link to `/lookmax/login`.
- **Email magic-link is built and works** for *existing* users (verified locally: request-link → consume-link → JWT). It "doesn't send" on live because `messaging.mode = allowlist` and `services/email.js:113` suppresses any non-allowlisted recipient.
- **New funnel visitors can't sign up via email**: request-link is enumeration-safe and *no-ops* for unknown emails (never creates an account); after consume, `login.html` lands at `/lookmax/`, not the quiz. Both are sign-up + routing concerns → folded into **P1** (sign-in-first funnel rework).

### Built (commits `37ac6f9`, `5074dac`; tests +8 → 1141; smoke 38/38)
- `GET /api/lookmax/auth/google/start` + `/callback` (Authorization Code flow, CSRF-safe, no new dep)
- `User.getOrCreateByEmail` (synthetic-phone account model — see DECISIONS.md)
- `/lookmax/oauth-complete` session bridge; `start.html` Google button rewired
- Gated on `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`; until set, `/start` redirects back with `?error=google_unavailable`

### Blocked / needs founder (P2)
**1. Create the Google Cloud OAuth client** (only you can — credentials):
   1. console.cloud.google.com → create/select a project → "APIs & Services" → "OAuth consent screen": External, app name "MainCharacter", your support email, add the `…/auth/userinfo.email`, `…/auth/userinfo.profile`, `openid` scopes; add yourself as a Test user.
   2. "Credentials" → Create credentials → OAuth client ID → **Web application**.
   3. **Authorized JavaScript origin:** `https://maincharacter.digitglobalservices.com`
   4. **Authorized redirect URI (exact):** `https://maincharacter.digitglobalservices.com/api/lookmax/auth/google/callback`
   5. Copy the Client ID + Client secret → set in Render env as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. (Optional `GOOGLE_OAUTH_REDIRECT_URI` if you ever change the path; otherwise it's derived from `UPGRADE_BASE_URL`.) Redeploy.
   6. Tell me when it's live and I'll verify the full Google round-trip on the live site.

**2. Email magic-link delivery** (config): under `messaging.mode = allowlist`, add your test email to `EMAIL_ALLOWLIST` (or test with `ADMIN_EMAIL`). Flipping `WHATSAPP_SEND_MODE=all` is a separate founder checkpoint — not required just to test.

**Bridge bug found via Render logs + fixed (`895647b`):** after Google auth succeeded
("sign-in for d***@gmail.com → bridge"), the one-shot exchange 401'd "token not found".
Root cause: `getUserByFirstLoginToken`/`getUserByMagicLinkToken` called `User.getAllUsers()`
without `await` — a plain object under the JSON store (so dev/tests passed) but a **Promise
under Postgres (live)**, making `Object.values(<Promise>)` empty so the freshly-minted token
was never found. Fixed (await both); also un-breaks magic-link consume + post-payment
first-login on live PG. +1 regression test (async-getAllUsers). Founder to retry the sign-in.

**P2 STATUS: 🟡 Google built + bridge fixed; awaiting founder's retry to confirm end-to-end.**
## P1 — Remove guest flow; sign-in required first

Shipped across 3 commits (`1755390` backend, `5d4394d` frontend+email) + the test
migration. 1134 tests passing, smoke 39/39.

**Backend** — `resolveActor`/`canAccess` are Bearer(JWT)-only; the guest_id cookie,
cookie middleware, `POST /guest`, and `POST /merge` are removed. `/quiz` always
creates a user-owned session and returns the auditId; capture/analyze require it in
the body. `lookmax_baseline` (the Day-30 anchor) is written directly at payment now
(same compat shim that `reaudit.js` reads), replacing the merge step.

**Frontend** — `start.html` is a single sign-in path (Google + email), guest card/JS
removed, founder copy "The reading saves to your account." Quiz/capture/audit pages
require a `lookmax.token` (else → `/lookmaxing/start`), send `Authorization: Bearer`
on every call, and carry the auditId quiz→capture→analyze via localStorage.

**Email sign-up** — `request-link` find-or-creates the account when a funnel `next`
is present (dashboard login keeps login-only semantics); `sendMagicLink` + `login.html`
honor `next`, so an email sign-up lands in the quiz, not the dashboard.

**Account model** — email/Google accounts use a synthetic phone id (`User.getOrCreateByEmail`)
since the model is phone-keyed and these sign-ups have no phone yet. See DECISIONS.md.

**Live verification (structural):** no guest button on `/lookmaxing/start`; `/quiz`
401 without sign-in; `/merge` and `/guest` both 404.

**P1 STATUS: ✅ shipped + structurally verified.** The full signed-in walk
(sign in → quiz → photo → reading, tied to the account) is confirmed by the same
founder sign-in click that closes P2 — one action verifies both.
## P3 — Homepage / logo / Orator / theme proposal — 🟡 in progress

**Homepage re-skin (done, live):** founder chose re-skin (not redirect). `landing.html`
`/` is no longer the gold Orator page — re-skinned to the black/silver `/lookmaxing`
identity by remapping the gold + pillar accent CSS variables to silver and sweeping the
hardcoded gold/amber/purple/teal hex+rgb values to the silver system (the logo's single
white light-point is the one accent). Locked hero/pillar/rank copy untouched. Commits
`b3a76cc` + `98facbc` (logo asset). Verified live: zero gold, obsidian bg, `/lookmaxing`
CTAs, zero `/audit` links.

**Orator = Coming Soon:** already wired (Wave 2C) — the Orator pcard opens the Coming-Soon
waitlist modal; all hero/nav/bottom CTAs route to `/lookmaxing`.

**Logo:** the monogram now sits in the homepage nav (cropped from
`public/maincharacter-logo.jpeg`, committed — it had been untracked and 404'd on first deploy).

**Still open (P3):**
- _Logo across ALL pages:_ landing now uses the image; the `/lookmaxing` funnel navs use
  the `◆ MAINCHARACTER` wordmark. Decision needed: put the image in every nav, or treat
  the `◆` wordmark as the consistent mark (it already is across the funnel).
- _Colour-theme proposal:_ ✅ delivered (founder asked for BOTH directions). Two standalone
  sample pages on the same representative "reading" surface, for live side-by-side comparison
  — **not** wired into the funnel, awaiting founder pick before any roll-out:
  - Aubergine + light-point: `/lookmaxing/theme-preview-aubergine.html` (commit `e9eac31`)
  - Charcoal + silver + light-point: `/lookmaxing/theme-preview-charcoal.html`
  Both keep the single white light-point as the one accent. Once you pick (or say "stay as-is"),
  I roll the chosen palette across the surfaces — or leave the current black/silver if neither wins.
- _Logo across ALL pages:_ ✅ done — the monogram now sits in every `/lookmaxing` funnel nav
  (index/start/quiz/capture/audit/audit-full/fork) + the homepage, matching treatment.

**P3 STATUS: ✅ core shipped** (homepage re-skinned, logo everywhere, Orator Coming-Soon).
Theme direction is the one open founder decision (two samples live for comparison).

## P4 — Quiz visuals ✅

Each of the 5 calibration questions now carries a thin white line-art glyph in the brand's
light-line language (presence/aura · skin droplet · hair · crescent moon · timer dial), with
a soft fade-in on the active screen (`quiz.html`, commit `7c39127`). The selected-state
already used a light-point fill+glow (not a bare dot) plus the gradient progress bar — kept.
Mobile-first; verified in the 360px layout. 1134 tests passing, smoke 39/39.

---

## Summary — all five items

| | Outcome |
|---|---|
| P0 photo→Gemini | ✅ fixed + verified live (8/8 real readings; route + photo-delivery + Gemini hardening) |
| P2 sign-in | ✅ Google OAuth built + config-verified live; email works + funnel sign-up wired. Final click-through pending founder |
| P1 remove guest | ✅ shipped + verified live (sign-in-first; `/merge` & `/guest` 404) |
| P3 homepage/logo/Orator | ✅ homepage re-skinned black/silver, logo in every nav, Orator Coming-Soon; two theme samples live for founder pick |
| P4 quiz visuals | ✅ 5 line-glyphs + refined states |

**Open founder items:** (1) one Google sign-in click to confirm P2+P1 end-to-end; (2) pick a
theme direction (or keep current); (3) rotate the leaked `.env` Gemini key (security).

---

# Batch 2 — Scheduler + Items 1–3 (founder, 2026-05-30)

**First — un-awaited getAllUsers, codebase-wide.** The "SCHED ERROR: users is not
iterable" was the same Promise-not-awaited bug in the scheduler. Swept EVERY adapted
`User.*` call (getAllUsers/getUsersForTime AND per-record getUserBy*/updateUser/…) across
scheduler, protocol, server, admin, api, lookmax, reaudit, push, video, and the
`requireLookmaxAuth` middleware. Final scan: zero un-awaited adapted calls. Made it
verifiable on live without log access: `/health.scheduler` now reports
`{ startedAt, lastTickAt, ticks, lastError }`. **Live (f0da17f): ticks incrementing,
lastError null** — the crash is gone. (commits through `f0da17f`)

**Item 1 — Maybe Later saves the reading → dashboard.** The ₹99 paywall "Maybe later"
now routes to `/lookmax/` (was a dead-end modal close). The reading is already persisted
server-side (user-owned session); the dashboard fetches it and shows an "Your Aura Reading"
card (score + rank + four signals) with a "Resolve the reading ◆" CTA. (commit `568b120`)

**Item 2 — Persistent session + auth-aware nav.** (a) JWT TTL 24h → 45d; token lives in
localStorage so a returning user stays signed in 30+ days across browser restarts.
(b) Homepage + `/lookmaxing/` nav: signed-in → "My Reading" → `/lookmax/`; signed-out →
"Sign In". (c) Signed-in main CTAs skip sign-in → dashboard. (commit `42fdb46`)
Live: logged-out "Sign In" present on both landings (verified).

**Item 3 — Protected admin users table.** `admin.html` previously showed only aggregate
funnel tiles. New founder-only `GET /api/admin/lookmax-users` (requireAuth) joins users +
audit sessions → email, signup date, auth provider, ₹99-paid flag, funnel stage
(signed_up → quiz → photo → reading → paid). Rendered as a "Signed-up Users" table on
`/admin`. (commit `196ce17`) Live: `/api/admin/lookmax-users` returns 401 without auth.

**Admin access:** `https://maincharacter.digitglobalservices.com/admin` → enter the admin
password (the `ADMIN_PASSWORD` you set in Render). The "Signed-up Users" table renders
below "Funnel Pulse".

**Live verification needing the founder (signed-in / password):**
- Item 1 end-to-end: sign in → reading → Maybe later → dashboard shows the reading.
- Item 2 persistence: sign in → close browser → reopen → still signed in + nav shows "My Reading".
- Item 3 data: log into `/admin` and confirm the user table populates.
