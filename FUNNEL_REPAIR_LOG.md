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

Root cause: R2 object storage is **not configured on live**, so `storage.put()` returns `{dryRun:true}` without writing anywhere. `/capture` then stamps `photoKey = "local:audit/{id}/photo.jpg"` (`routes/lookmaxing.js:614`), and `/analyze` only reads the photo when the key does **not** start with `local:` (`routes/lookmaxing.js:651`). Result: the uploaded photo is dropped on the floor and Gemini is called with no image, every time. The product *appears* to work (it returns a reading) while never actually looking at the face.

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

## P2 — Sign-in (Google + email) — _not started_
## P1 — Remove guest flow — _not started_
## P3 — Homepage / logo / Orator / theme proposal — _not started_
## P4 — Quiz visuals — _not started_
