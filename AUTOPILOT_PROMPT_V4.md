# MAINCHARACTER — NIGHT 4 AUTOPILOT PROMPT (Full Lookmaxxing PWA + Founder Dogfood)

> Open `MainComponent` in VS Code. In terminal: `claude --dangerously-skip-permissions`. Paste **everything between `===== BEGIN PASTE =====` and `===== END PASTE =====`** as your first message. Hit Enter. Walk away.

---

## ===== BEGIN PASTE =====

You are the **acting CTO and sole engineer** of MainCharacter. The founder is asleep. You are running solo, on autopilot. Read `CLAUDE.md` in full before anything else. Re-read sections 2 (brand voice), 4 (landmines), and 6 (rules of engagement) for every new sub-task.

**Context — what shipped in Nights 1-3.**
- Night 1 (16 commits): hardening, auth, tests, CI, prompt-injection guard, kill switches.
- Night 2 (8 commits): landing → 2 pillars + Aura++ reveal, free `/audit` funnel with Gemini Vision 8-axis scoring, Razorpay Subscriptions backend.
- Night 3 (9 commits): Wati removed, WhatsApp Cloud API service built (DORMANT until Meta credentials), MSG91 SMS + Resend email built (DORMANT — both kept in code, not used tonight), paywall page, payment-confirmed page, revenue loop closes end-to-end. 211 tests passing, 19/19 smoke checks.

**Two critical state changes since Night 3:**

1. **Razorpay is now LIVE in production.** Real money flows on any `/api/payment/subscribe` call that completes via the new key. Tonight's run MUST add a `PAYWALL_PUBLIC` feature flag that defaults to `false` so accidental real charges cannot happen during the founder's dogfood testing window.
2. **The Orator product is blocked on Meta WhatsApp Cloud API approval** (in flight, 1-3 days out). Tonight's run focuses ENTIRELY on Lookmaxxing — the web-only pillar that doesn't depend on WhatsApp. Orator stays in its current shipped state.

Your single objective for tonight:

> **Ship the complete Lookmaxxing PWA end-to-end so the founder can install it on their phone tomorrow morning and run a full daily ritual (mirror selfie → score → protocol → streak → hair tracker → dashboard) as Customer #1 for 2-3 days. All deployed live, with a paywall safety gate active, with an admin seed route so the founder skips real payment, with multi-admin allowlist support, with photos persisting to `/tmp` (R2 deferred), with weekly reveal stubbed (ffmpeg deferred), and with WhatsApp Cloud API ready to flip live the moment Meta approves.**

You will execute the priority order. Commit after every meaningful step. Push to `main`. The founder wakes up to `git log --oneline | head -50` and `PROGRESS.log` and `FOUNDER_TESTING_GUIDE.md`.

---

## AUTOPILOT RULES (identical to Nights 1-3)

1. Do not stop voluntarily. Finish current task, then next.
2. TRUE BLOCKER = missing secret with no test/sandbox alternative, external service needing human action, destructive action that loses user data. Anything else: decide and proceed.
3. Decisions → `DECISIONS.md` with 2-sentence rationale.
4. Conventional Commits. Push after every change.
5. Write the test first. Vitest. ≥70% coverage on new modules.
6. Run `npm test && npm run smoke` before every commit.
7. Never break a working feature. Risky additions gated behind env-var feature flags, default OFF.
8. No invented user-facing copy. Use `// TODO copy review`. Surface in `BACKLOG.md → COPY REVIEW QUEUE`.
9. Never weaken security.
10. `WHATSAPP_SEND_MODE` stays `allowlist`. All new outbound messaging respects this. New `ADMIN_PHONES` (comma-separated) is the allowlist; legacy `ADMIN_PHONE` (singular) is a fallback.
11. Status updates → `PROGRESS.log` with ISO timestamp + commit subject.
12. Token budget. Read in slices. Reuse existing services.

---

## PRODUCT DECISIONS ALREADY MADE (encode into DECISIONS.md on first run)

1. **PAYWALL_PUBLIC defaults to false.** While false, `/paywall` returns a "Launching this weekend — join the waitlist" page that captures phone + name to a `EarlyAccess` table, no payment flow exposed. When true, the existing paywall logic runs. Default false until founder personally flips it after dogfood validation.
2. **Founder seed route** — `POST /api/admin/seed-test-user` (admin-auth-gated) body `{ phone, name }`. Creates a User with: `oratorActive: true`, `lookmaxxingActive: true` (so `auraPlusPlus` computes true), a pre-completed `AuditSession` with synthetic 8-axis scores (mid-range, with one clearly-weakest axis to drive protocol selection), and a personalised protocol. Returns `{ user, loginUrl: /lookmax/admin-login }`. Skips Razorpay entirely.
3. **Admin bypass login.** New route `POST /api/lookmax/auth/admin-login` body `{ phone, password }`. Validates: phone is in `ADMIN_PHONES`, password matches `ADMIN_PASSWORD_HASH` (bcrypt). Returns Lookmaxxing-scoped JWT (24h expiry). Same login page UI on `/lookmax/login` shows the OTP path by default and an "Admin login" link in the corner that swaps to the admin form. When `WHATSAPP_PROVIDER` is "cloudapi" AND credentials are configured AND Meta display name is approved, the OTP form is the default. Until then, the OTP form shows "OTP currently unavailable — admin login only" message.
4. **Multi-admin allowlist.** New env var `ADMIN_PHONES` — comma-separated list of normalised phones (e.g., `918595833852,919876543210`). Replace every read of singular `ADMIN_PHONE` with a `isAdmin(phone)` helper in `lib/admin.js` that checks against `ADMIN_PHONES` (preferred) OR falls back to `ADMIN_PHONE`. Same applies to `ADMIN_EMAILS` (plural) — also add support, comma-separated, fall back to singular `ADMIN_EMAIL`.
5. **Photo storage.** Save uploaded mirror + hair photos to `/tmp/maincharacter-uploads/{userId}/{date}.jpg` (created at boot if missing). Expose via Express static at `/uploads/...` for the user's own access only (token-gated). On every photo save, log a warning: `[photos] saved to /tmp — volatile, will be lost on next Render redeploy. Add R2 in week 2.` BACKLOG item tracks the R2 migration.
6. **Weekly reveal stub.** Build the `public/lookmax/reveal.html` page UX completely — the share buttons, the "Friday at 8pm" timing copy, the "your week N" framing — but the actual video generation is a placeholder image (a vertical 720x1280 canvas-generated PNG with the latest mirror score + week number + ◆ MainCharacter watermark). When ffmpeg lands in the Render container (BACKLOG action), the placeholder swaps for a real MP4. The page UX is identical either way.
7. **Founder receives every protocol item.** No filtering by demographics or current state. The founder sees minoxidil items, ketoconazole items, retinoid items, the explicit "DO NOT use jaw exercisers" copy — everything. Decision #4 from the human in the loop.
8. **No payment flow in founder dogfood.** Founder uses the seed route. The audit funnel + paywall page can still be visited (paywall returns waitlist page until PAYWALL_PUBLIC=true), but the founder doesn't go through Razorpay.

---

## PRIORITY ORDER (execute top-to-bottom)

### P0 — Pre-flight + paywall safety gate (~30 min)

P0.1 — Read `CLAUDE.md`, `BACKLOG.md`, `DECISIONS.md`, `PROGRESS.log`. Confirm Nights 1-3 commits intact via `git log --oneline | head -40`. Run `npm test && npm run smoke`. Both must pass.

P0.2 — Append the 8 decisions above to `DECISIONS.md` under new section `## Night 4 Lookmaxxing PWA decisions`.

P0.3 — **Paywall safety gate.** Add env var `PAYWALL_PUBLIC` default `false`. In the route that serves `/paywall`:
- If `PAYWALL_PUBLIC === 'true'` → serve `public/paywall.html` as before (Night-3 behaviour).
- Else → serve a new `public/paywall-waitlist.html`. Copy in Consultant voice (mark `// TODO copy review`): `"The Chamber opens this weekend. Add your number — you'll be the first walked in. ◆ MainCharacter"`. Single form: name + phone. POSTs to `POST /api/waitlist/early-access` which saves to new `EarlyAccess` Prisma/JSON model (`id, phone, name, sourceAuditSessionToken?, createdAt`). Returns a Consultant-voice confirmation.
- The audit funnel still ends at `/paywall` — the gating happens inside the route.

P0.4 — Update `/health` to include `paywall: { public: <bool>, waitlistCount: <n> }`.

P0.5 — Tests: paywall returns waitlist page when flag off; returns full paywall when flag on; waitlist POST adds to DB; duplicate phone gracefully no-ops.

P0.6 — **Verify Razorpay env.** At server boot, if `RAZORPAY_KEY_ID` starts with `rzp_live_` AND `PAYWALL_PUBLIC` is `true` AND no user has ever paid yet — log a startup banner WARNING: `[razorpay] LIVE keys + paywall public + zero historical paying users. Verify this is intentional. To gate the paywall, set PAYWALL_PUBLIC=false.`

Commit each. Push.

---

### P1 — Multi-admin allowlist + admin seed route (~30 min)

P1.1 — `lib/admin.js`:
```js
function getAdminPhones() {
  const plural = (process.env.ADMIN_PHONES || '').split(',').map(s => s.trim()).filter(Boolean);
  const single = process.env.ADMIN_PHONE ? [process.env.ADMIN_PHONE.trim()] : [];
  return [...new Set([...plural, ...single])];
}
function getAdminEmails() { /* same shape */ }
function isAdminPhone(phone) { return getAdminPhones().includes(normalisePhone(phone)); }
function isAdminEmail(email) { return getAdminEmails().includes(email.toLowerCase()); }
module.exports = { getAdminPhones, getAdminEmails, isAdminPhone, isAdminEmail };
```

P1.2 — Migrate every reader of `process.env.ADMIN_PHONE` to `lib/admin`. Same for `ADMIN_EMAIL`. Update `lib/messaging-mode.js` (from Night 3) so allowlist mode checks against `isAdminPhone()`/`isAdminEmail()`.

P1.3 — **Admin seed route** `POST /api/admin/seed-test-user` (gated by `requireAdminAuth` middleware — same JWT from Night 1's admin login):
- Body: `{ phone, name, weakestAxis? }`. If `weakestAxis` not provided, default to `hairDensity` (most product-relevant for testing).
- Behaviour: upsert User by phone with `name`, `oratorActive: true`, `lookmaxxingActive: true`, `lookmaxxingStartedAt: now`, `mirrorLevel: 'raw'`, `auditSessionId` linked to a synthetic AuditSession.
- Synthetic AuditSession: quiz answers stubbed (mid-range for all axes except `weakestAxis` which scores 35), photos array empty, scores object with 8 axes (`weakestAxis` axis = 35, others mid-65), diagnosis text = `"// TODO copy review — synthetic seed for founder testing. Real audit copy comes through gemini.scoreAesthetic()."`, completedAt: now.
- Generate the personalised protocol immediately and save to `ProtocolDay` for today.
- Response: `{ user, loginUrl: 'https://maincharacter.digitglobalservices.com/lookmax/admin-login?phone=<phone>' }`.

P1.4 — Tests: seed creates the right user state, idempotent (calling twice updates rather than duplicates), only admin can call (non-admin returns 403).

Commit each. Push.

---

### P2 — Lookmaxxing PWA shell (~1 hr)

P2.1 — File structure:
```
public/lookmax/
  index.html              # dashboard home (after login)
  login.html              # phone OTP login + admin login toggle
  admin-login.html        # admin password form (auto-redirected from login.html "Admin login" link)
  mirror.html             # daily mirror capture + score reveal
  protocol.html           # daily checklist
  hair.html               # hair receding tracker
  reveal.html             # weekly reveal placeholder
  manifest.json
  sw.js                   # service worker
  icons/
    icon-192.png
    icon-512.png
    maskable.png
```

P2.2 — `manifest.json`:
```json
{
  "name": "MainCharacter — Lookmaxxing",
  "short_name": "Lookmaxxing",
  "start_url": "/lookmax/",
  "display": "standalone",
  "background_color": "#070708",
  "theme_color": "#070708",
  "description": "Daily mirror. Daily ritual. Weekly reveal.",
  "icons": [
    { "src": "/lookmax/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/lookmax/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/lookmax/icons/maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

P2.3 — `sw.js`: minimal service worker. Cache-first for `/lookmax/*.html`, `/lookmax/icons/*`, `/lookmax/manifest.json`. Network-first with cache fallback for `/api/lookmax/*`. Cache version bumps via a build-time constant string committed to the file.

P2.4 — Icons: generate three PNGs programmatically (using `sharp` if available, else manually-crafted SVG converted to PNG via a build script). Design: black obsidian background (#070708), gold ◆ mark centered, gold border at safe area. 192px, 512px, and a maskable 512px variant with safe-area padding.

P2.5 — PWA install prompt: on first visit to `/lookmax/`, if `beforeinstallprompt` fired and user is not in standalone mode, show a small gold ribbon at top: `Add to home screen → ◆`. On dismiss, set localStorage `lookmax.installPromptDismissedAt = now`, suppress for 7 days.

P2.6 — Route mount: `app.use('/lookmax', express.static(path.join(__dirname, 'public', 'lookmax')))`. Add explicit routes for `/lookmax/`, `/lookmax/mirror`, `/lookmax/protocol`, `/lookmax/hair`, `/lookmax/reveal` that serve `index.html`/`mirror.html`/etc (since the PWA expects pretty URLs without `.html`). Add a session check JS on every page that calls `GET /api/lookmax/me` — if 401, redirect to `/lookmax/login`.

P2.7 — Tests: manifest parses, service worker validates, icons exist, install prompt logic.

Commit each. Push.

---

### P3 — PWA auth (admin bypass NOW + OTP dormant) (~45 min)

P3.1 — `routes/lookmax-auth.js`:
- `POST /api/lookmax/auth/admin-login` body `{ phone, password }`. Validates `isAdminPhone(phone)` + bcrypt-checks password against `ADMIN_PASSWORD_HASH`. On success: returns `{ token: <jwt>, user: { name, phone, oratorActive, lookmaxxingActive, mirrorLevel } }`. JWT signed with `JWT_SECRET`, 24h expiry, claims `{ userId, phone, scope: 'lookmax' }`.
- `POST /api/lookmax/auth/request-otp` body `{ phone }`. If WhatsApp Cloud API is in DRY-RUN, return `{ status: 'unavailable', message: 'OTP is currently unavailable. Admin login is required.' }`. Else: generate 6-digit OTP, save to `LookmaxOtp` (phone, otp, expiresAt = now + 10min), call `whatsapp.sendOtp(phone, otp)` (the helper from Night 3 — verify it exists; if not, add it now: sends a Meta "authentication" template message with the OTP as a parameter).
- `POST /api/lookmax/auth/verify-otp` body `{ phone, otp }`. Match against `LookmaxOtp` (within expiry). Returns JWT same shape as admin-login.
- `GET /api/lookmax/me` → middleware-gated, returns current user state.
- `POST /api/lookmax/auth/logout` → no-op server-side (JWT is stateless), frontend clears localStorage.

P3.2 — Middleware `requireLookmaxAuth` on all `/api/lookmax/*` except auth + push routes.

P3.3 — Frontend `public/lookmax/login.html`:
- Default view: phone input + "Send OTP" button. Below: small text "OTP unavailable yet — use Admin login →" link to `/lookmax/admin-login`.
- On Send OTP click: POST to `/api/lookmax/auth/request-otp`. If `status: 'unavailable'`, auto-redirect to `/lookmax/admin-login`. If `status: 'sent'`, show OTP input + "Verify" button.
- On Verify: POST, on success store JWT in localStorage as `lookmax.token`, redirect to `/lookmax/`.

P3.4 — Frontend `public/lookmax/admin-login.html`:
- Phone input (pre-fillable via `?phone=` URL param), password input, "Enter" button.
- POST to `/api/lookmax/auth/admin-login`. On success store JWT, redirect to `/lookmax/`.
- On 401: show "Phone or password incorrect" in Consultant voice (no "Whoops!" — keep it dignified).

P3.5 — Tests: admin login flow (valid + invalid + non-admin phone), OTP flow in unavailable state, middleware blocks unauthed requests.

Commit each. Push.

---

### P4 — Daily Mirror (~1.5 hr)

P4.1 — `public/lookmax/mirror.html`:
- "Take today's mirror" CTA at top
- Camera preview using `getUserMedia({ video: { facingMode: 'user' } })`. Fallback to `<input type="file" accept="image/*" capture="user">` if `getUserMedia` unavailable (older iOS Safari).
- Capture button → canvas screenshot at 1024×1024 (or aspect-preserved within 1024 max) → blob → upload.
- During upload + scoring: animated 8-axis progress bars in gold, rotating Consultant lines: `"Mapping skin signal..."`, `"Reading jaw geometry..."`, etc. Min 5s wait, max 45s.
- After scoring: score animates from 0 → final score in 2 seconds (Cormorant Garamond, 6rem). Below: 8-axis bars with deltas vs yesterday + vs baseline. Then a 1-line Consultant observation: `"Skin clarity climbed three points. Sunlight before nine is doing its work."`
- Below the reveal: 14-day trend chart (Chart.js — already a dep), Mirror Level badge (e.g., "Polished — 62/100"), Streak counter with gold flame.
- Sticky bottom nav: Mirror · Protocol · Hair · Reveal · Profile.

P4.2 — Backend `POST /api/lookmax/mirror` (multipart):
- Photo arrives. Save to `/tmp/maincharacter-uploads/{userId}/mirror-{ISO-date}.jpg`.
- Call `services/vision.scoreMirror({ photoPath, userBaseline })` — Gemini Vision multimodal request. Re-use the prompt template from `data/lookmax-prompts.js` (built in V2 P3.3). 8-axis scores returned as JSON.
- Save `MirrorScore` (userId, photoPath, axes JSON, overallScore, mirrorLevel, createdAt).
- Update User: `mirrorLevel` (recomputed from average score: Raw<40, Polished 40-60, Magnetic 60-75, Radiant 75-90, Sovereign 90+), `lastMirrorAt`.
- Update Streak: if user's `lastMirrorAt` was within 30h (24h + buffer), increment streak; else reset to 1.
- Response: `{ score, axes: {...}, deltaVsYesterday, deltaVsBaseline, mirrorLevel, streak, trend: [last 14 days], consultantLine }`.

P4.3 — Service `services/vision.js` (extend existing from V2):
- `scoreMirror({ photoPath, userBaseline })` → re-use 8-axis Gemini Vision call from audit; compare to baseline if available.
- `consultantLine(axes, deltas)` → 1-2 sentence Consultant-voice observation generator. Uses a small prompt to Gemini 2.0 Flash (cheap, fast). Wrap user data in `<<<USER_INPUT>>>` delimiters for injection protection.

P4.4 — Mirror nudge cron in `services/scheduler.js`:
- New job: every minute, check users with `lookmaxxingActive: true` whose `mirrorReminderTime` (default `06:30`) matches IST now AND who haven't submitted a mirror today.
- Send WhatsApp message: `"◆ The mirror is open. ◆"` deep-linked to `https://maincharacter.digitglobalservices.com/lookmax/mirror`. Respects `WHATSAPP_SEND_MODE` → in `allowlist`, only `ADMIN_PHONES` receive. In DRY-RUN, logs only.
- Won't fire for real users until both Meta is live AND mode is `all`. For founder testing, it WILL fire if WhatsApp is in DRY-RUN — the log entry is enough to validate the cron is working.

P4.5 — Tests: mirror upload + scoring round-trip with mocked Gemini, streak math (within 30h vs 31h gap), Mirror Level transitions, vision service prompt-injection guard.

Commit each. Push.

---

### P5 — Daily Protocol Checklist (~1.5 hr)

P5.1 — `data/lookmax-content.js`:
- `PROTOCOL_LIBRARY` keyed by axis. Each item: `{ id, axis, title, instruction, evidenceTier (1-3), category ('do' or 'do-not') }`.
- `skin`: 5 items + 2 explicit do-nots ("DO NOT over-exfoliate", "DO NOT mix retinoid with niacinamide same night").
- `hair`: 5 items + 2 do-nots (laser combs at home, biotin without deficiency).
- `jaw`: 3 items + 2 do-nots ("DO NOT use jaw exercisers", "DO NOT chew gum aggressively").
- `posture`: 4 items + 1 do-not.
- `lifestyle`: 5 items + 1 do-not.
- All copy marked `// TODO copy review` and surfaced in `BACKLOG.md → COPY REVIEW QUEUE` so founder reviews before public launch.

P5.2 — `services/protocol.js`:
- `generateProtocol(user, audit) → ProtocolDay`. Pick 2 items from weakest axis, 2 from second-weakest, 1 from each of 2-3 lifestyle items. Always include any `do-not` items for the user's affected axes. Returns 5-7 actionable items + 1-3 do-nots.
- Re-evaluate weekly — Sunday cron regenerates each active user's `ProtocolWeek` template based on past week's mirror axis trends.

P5.3 — `public/lookmax/protocol.html`:
- Today's items as checklist (gold-bordered cards, checkbox left-aligned). Each card expands on tap to show `instruction` + evidence tier badge ("RCT-supported" / "Mechanism-supported" / "Observational"). Do-nots are shown in violet with a strike-through icon, NOT checkboxes (they're reminders, not actions).
- Streak counter at top (gold flame + number).
- Bottom: "Complete Day" button — locks today's checklist (no more toggles), increments streak if ≥80% of "do" items checked.

P5.4 — API:
- `GET /api/lookmax/protocol/today` → `{ items: [...], doNots: [...], completedCount, totalCount, isLocked, streak }`.
- `POST /api/lookmax/protocol/check` body `{ itemId, checked: bool }` → toggles, only if `!isLocked`.
- `POST /api/lookmax/protocol/complete-day` → locks, evaluates streak.

P5.5 — Tests: generator returns 5-7 items, weakestAxis drives selection, do-nots are always included, streak increments on 80%+ completion, breaks on missed day.

Commit each. Push.

---

### P6 — Hair Receding Tracker (~1.5 hr)

P6.1 — `public/lookmax/hair.html`:
- Weekly cadence — page checks `lastHairPhotoAt`; if <6 days, shows "Next hair audit unlocks in N days" with a preview of last week's analysis. If ≥6 days, shows the capture UI.
- Capture: instructions in Consultant voice — `"Stand in flat overhead light. Camera at the same height as your scalp. Take two photos: one straight-on, one from above (crown). The honest angle, not the angle."`. Two photo slots, both required.
- After upload + analysis (8-12s): reveal the result.
  - Norwood-scale visualisation: a row of 7 stylised hairline silhouettes, the user's estimated stage highlighted in gold.
  - Hair density score (0-100) with delta vs first reading.
  - Recession in mm (auto-detected from the hairline cone analysis, if Gemini Vision returns confident estimates; else marked "insufficient data — try better lighting next week").
  - Recommendations panel — 3-5 evidence-based items (DO list) + 3-5 explicit non-recommendations (DO NOT list). Each with evidence tier badge.
  - 1-2 sentence Consultant observation: `"The temples held this week. Minoxidil adherence is doing its work. Crown density is the next leverage point."` or similar.

P6.2 — Backend `POST /api/lookmax/hair/photo` (multipart, 2 files):
- Save both photos to `/tmp/.../hair-{ISO-date}-front.jpg` and `-crown.jpg`.
- `services/vision.scoreHair({ frontPath, crownPath })` → returns `{ norwood: 1-7, hairlineScore: 0-100, recessionMm, confidence: 'high'|'low' }`. Use Gemini 2.0 Flash multimodal with both photos. Wrap context in `<<<USER_INPUT>>>` delimiters.
- `services/hair.recommendationsForNorwood(norwood)` → returns `{ do: [...], doNot: [...] }`. Static library — see P6.3.
- Save `HairTracking` record. Compare to user's previous record for delta.

P6.3 — `services/hair.js → recommendationsForNorwood(norwood)`:
- **Norwood 1 (no recession):** DO: ketoconazole 2% shampoo 2x/wk (preventive), sunscreen on scalp if balding-prone, sleep on silk pillowcase. DO NOT: rogaine/minoxidil yet, expensive shampoos with unproven actives, daily ACV rinses.
- **Norwood 2-3 (early):** DO: minoxidil 5% topical 1ml AM (RCT-supported), ketoconazole 2% shampoo 2-3x/wk (RCT-supported), microneedling 0.5-1mm weekly (RCT-supported for combo therapy), 10min direct sunlight pre-9am for circulation, scalp massage 3min daily. DO NOT: laser combs at home (weak evidence), biotin pills unless deficient (no evidence), saw palmetto pills (insufficient evidence vs minoxidil), pulling at the hairline.
- **Norwood 4-5 (mid):** all of Norwood 2-3 PLUS finasteride mention with `"Consult your dermatologist — prescription only. Strongly supported by RCTs but has systemic effects."` DO NOT: skip the dermatologist consult, expect minoxidil alone to fully reverse.
- **Norwood 6-7 (advanced):** transplant consultation framing — `"At this stage, hair restoration surgery (FUE) is the highest-leverage intervention. Minoxidil + finasteride to preserve remaining hair. A consult with a board-certified hair surgeon is the move."` DO NOT: continue with topicals alone expecting full restoration.

P6.4 — `GET /api/lookmax/hair/history` → all hair readings + trend chart of hairline score over time.

P6.5 — Tests: Norwood routing → correct recommendation set, DO NOT list always present, prompt injection guard, "insufficient data" fallback when Gemini confidence is low.

Commit each. Push.

---

### P7 — Dashboard home (~30 min)

P7.1 — `public/lookmax/index.html` — the page user sees after login:
- Header: ◆ MainCharacter · Lookmaxxing · `[user.name]` · Streak `N 🔥` · Mirror Level `[badge]`.
- Today's status — three big tiles in gold-bordered cards:
  - **Mirror** — if taken today: shows today's score + "Taken at HH:MM ✓". If not: pulses gently with CTA "Take today's mirror →".
  - **Protocol** — `N of M items complete · [progress bar in gold]`. CTA "Open today's protocol →".
  - **Hair** — if within weekly window: "Next reading in N days". If unlocked: "Take this week's hair audit →".
- Below: a "This Week" mini-strip showing 7 dots (one per day) — filled gold for days with a completed mirror, dim for missed.
- Below that: cross-sell banner if `!user.oratorActive`: `"Add The Orator — ₹799/mo. Or upgrade to Aura++ ₹1,999 (saves ₹299). The voice changes when the room turns. ◆"` Links to `/paywall?upgrade=auraplus&from=lookmax`.
- Footer nav: Mirror · Protocol · Hair · Reveal · Profile.

P7.2 — Backend `GET /api/lookmax/dashboard` → `{ user, today: { mirror, protocol, hair }, thisWeek: [...], streak, mirrorLevel }`.

P7.3 — Tests: dashboard endpoint returns correct shape, status tiles compute correctly across edge cases (no mirror today, all items completed, no audit yet).

Commit each. Push.

---

### P8 — Weekly Reveal stub (~30 min)

P8.1 — `public/lookmax/reveal.html`:
- If user has ≥4 mirror photos in last 7 days: enable preview. Else: show "Take more mirrors this week. Your reveal unlocks at 4 of 7."
- Preview: client-side rendered slideshow of the user's 7 daily selfies, 1.2s per frame, gold score-trajectory overlay rendered via Canvas API. Loops.
- Caption: `"Week N. The mirror has been honest. ◆ MainCharacter"`.
- Share buttons: Instagram (deep link `instagram://library?LocalIdentifier=...` with fallback to web), TikTok (deep link `snssdk1233://...` with fallback), WhatsApp Status (`whatsapp://send?text=...`), Generic Share (`navigator.share()`). All shares carry UTM tags back to `/audit`.
- Below: explicit note in Consultant voice (mark `// TODO copy review`): `"The reveal is a preview. The full video — stitched, scored, with the soundtrack — arrives once the infrastructure lands. Soon. ◆"`.

P8.2 — Backend `GET /api/lookmax/reveal/preview` → returns `{ photoUrls: [...], scores: [...], weekNumber }` for client-side rendering.

P8.3 — BACKLOG.md item: `Wire ffmpeg into Render container; replace canvas-based slideshow with real MP4 generation. See AUTOPILOT_PROMPT_V2.md §P9 for spec.`

P8.4 — Tests: insufficient photos shows the lock screen, sufficient photos returns the preview data, UTM tagging in share URLs.

Commit each. Push.

---

### P9 — Founder testing guide (~20 min)

P9.1 — Create `FOUNDER_TESTING_GUIDE.md` at repo root. Sections:
- **Seed your test account** — single curl command using your admin JWT to call `/api/admin/seed-test-user`. Save the loginUrl returned.
- **Install the PWA on your phone** — open the loginUrl on your phone, log in with admin credentials, open the dashboard, tap browser "Share" → "Add to Home Screen."
- **Day 1: your first mirror** — open Mirror page, take a selfie in natural light, observe score + axes + Consultant line. Note: photos go to `/tmp`, so if a Render redeploy happens in your test window, photos vanish (this is OK, we're testing logic not data permanence).
- **Day 1: review your protocol** — open Protocol, expand each item, mark do-items as you complete them through the day. Complete the day before bed.
- **Day 2-3: repeat the daily ritual** — mirror first thing, protocol throughout the day. Watch your streak grow, watch the score trend chart fill in.
- **End of week: hair audit** — once 6 days have passed (or override via DB if you want to test sooner), take the hair audit.
- **What to look for** — Consultant voice consistency (any "great job!" should be fixed), score calibration (does a 65 feel like a 65?), protocol relevance (does the personalised item set make sense for your actual weakest axes?), UX friction (any step that took > 30 seconds to figure out).
- **How to file bugs** — keep a simple text file `DOGFOOD_NOTES.md` in the repo. Each issue: timestamp, what you did, what you expected, what happened. The next autopilot run reads this file and fixes everything in priority order.

P9.2 — Generate three test scenarios in the guide:
1. "Skin-weakest user" — set weakestAxis=skinClarity, verify protocol has more skin items.
2. "Hair-weakest user" — set weakestAxis=hairDensity, verify hair tracker is prominently linked.
3. "Posture-weakest user" — set weakestAxis=posture, verify protocol has more movement items.

Commit. Push.

---

### P10 — Deploy + verify live (~30 min)

P10.1 — `npm test`. All green (target 280+ tests after this run).
P10.2 — `npm run smoke`. Green.
P10.3 — Push to `main`. Render auto-deploys.
P10.4 — `curl https://maincharacter.digitglobalservices.com/health | jq` — confirm:
- `status: healthy`
- `messaging.provider: "whatsapp-cloudapi"`, `messaging.configured: false` (still — Meta not approved yet)
- `paywall.public: false` (gate active — no accidental real charges)
- `lookmaxxing: { configured: true, version: <commit-sha> }`

P10.5 — Live URL verification:
- `https://maincharacter.digitglobalservices.com/audit` → 200, audit page renders
- `https://maincharacter.digitglobalservices.com/paywall` → 200, but serves the waitlist page (not the payment page)
- `https://maincharacter.digitglobalservices.com/lookmax/` → 200, redirects to `/lookmax/login` (no JWT)
- `https://maincharacter.digitglobalservices.com/lookmax/admin-login` → 200, admin form renders
- `https://maincharacter.digitglobalservices.com/lookmax/manifest.json` → 200, valid JSON
- `https://maincharacter.digitglobalservices.com/lookmax/sw.js` → 200, service worker code

P10.6 — Seed a test user via curl with founder phone + admin JWT (founder must paste their JWT into Render env as `ADMIN_TEST_TOKEN` or simply log in to `/admin` to grab one):
```
curl -X POST https://maincharacter.digitglobalservices.com/api/admin/seed-test-user \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"phone":"918595833852","name":"Chitranshu","weakestAxis":"hairDensity"}'
```
Capture the response in `MORNING_DIGEST.md`.

P10.7 — Final commit + push: `chore: end of night-4 autopilot run — full Lookmaxxing PWA shipped, founder ready to dogfood, see PROGRESS.log + FOUNDER_TESTING_GUIDE.md`.

P10.8 — Write `MORNING_DIGEST.md` summarising: P-blocks shipped, P-blocks deferred (weekly reveal MP4, R2 photos, push notifications), live URLs, the seeded test user response, the 4 things the founder must do tomorrow morning to start dogfooding (visit URL, install PWA, take first mirror, check protocol).

---

## OUTPUT FORMAT FOR `PROGRESS.log`

```
[2026-05-28T22:10:00Z] P0.1 done — Nights 1-3 verified, 211 tests green. Commit: chore(night4): pre-flight checks
[2026-05-28T22:24:00Z] P0.3 done — paywall safety gate behind PAYWALL_PUBLIC=false. Commit: feat(paywall): gate behind PAYWALL_PUBLIC flag
[2026-05-28T22:38:00Z] P1.1 done — multi-admin allowlist via ADMIN_PHONES. Commit: feat(admin): multi-admin allowlist support
...
```

---

## IF YOU FINISH WITH TIME LEFT

Do NOT begin V5 work. Instead:
1. Test coverage push toward 85% on new modules (`services/vision`, `services/protocol`, `services/hair`, `routes/lookmax-auth`).
2. Add JSDoc to every new exported function.
3. Add `/admin/lookmax` panel: surface daily active mirror submissions, mirror level distribution, protocol completion rate, hair audit funnel.
4. Add a "stuck-streak rescue" path — if a user breaks streak for 1 day, send a Consultant-voice WhatsApp (when WA is live): `"One day is not the end of the work. The mirror is still open tomorrow. ◆ MainCharacter"` to encourage return.

Begin now. Read `CLAUDE.md` first.

## ===== END PASTE =====
