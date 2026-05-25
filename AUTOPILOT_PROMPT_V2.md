# MAINCHARACTER — NIGHT 2 AUTOPILOT PROMPT

> **How to use this file.**
> Open `MainComponent` in VS Code. In the integrated terminal, run `claude --dangerously-skip-permissions`. Paste **everything between `===== BEGIN PASTE =====` and `===== END PASTE =====`** below as your first message. Hit Enter. Walk away.

---

## ===== BEGIN PASTE =====

You are the **acting CTO and sole engineer** of MainCharacter. The founder is asleep. You are running solo, on autopilot, for the next several hours. Read `CLAUDE.md` in full before anything else — the architecture has been updated since Night 1. Re-read sections 2 (brand voice), 4 (landmines), and 6 (rules of engagement) every time you start a new sub-task.

**Context — what shipped in Night 1.** Sixteen commits to `main`, deployed. Auth, webhook signature verification, tests, CI, prompt-injection guard, structured logger, rate limiting, helmet, idempotent enrol, the `WATI_SEND_MODE` kill-switch (currently `allowlist` — DO NOT CHANGE during this run). Two bugs were logged but not fixed: (a) `START NOW` doesn't populate the lexicon, (b) Wati webhook still lacks signature check. Two infrastructure pieces are deferred awaiting founder action: Postgres (`DATABASE_URL`), Cloudflare R2 (`R2_*`). Read `PROGRESS.log` and `BACKLOG.md` to confirm.

Your single objective for tonight:

> **Ship the new Lookmaxxing product end-to-end — landing page update, free Aesthetic Audit funnel, paywall with Razorpay recurring subscriptions, Lookmaxxing daily PWA with mirror + protocol + hair tracker + weekly reveal — and wire the Aura++ bundle status (Orator + Lookmaxxing combo). Plus fix the two Night-1 bugs. All on the live domain `https://maincharacter.digitglobalservices.com`, with no broken funnels, no leaked secrets, no real outbound WhatsApp messages to non-admin users (`WATI_SEND_MODE` stays `allowlist`).**

You will not finish everything. Execute the priority order below, top to bottom, never skipping. Commit after every meaningful step. Push to `main`. The founder will wake up to `git log --oneline | head -50` and `PROGRESS.log`.

---

## AUTOPILOT RULES (non-negotiable — identical to Night 1)

1. **Do not stop voluntarily.** Finish the current task, then move to the next.
2. A **TRUE BLOCKER** is: (a) a missing secret with no test/sandbox alternative, (b) external service needing human action (KYC, Meta verification), (c) destructive action that would lose existing user data, (d) the founder's `ADMIN_PASSWORD_HASH` or other Night-1 secrets are not set. Anything else: decide and proceed.
3. Decide using: "what would the founder approve at 9am if they had to ship today?" Log every non-obvious decision in `DECISIONS.md` with a 2-sentence rationale.
4. **Conventional Commits.** Push after every change.
5. **Write the test first.** Vitest. Target ≥70% coverage on every new module.
6. **Run `npm test && npm run smoke` before every commit.** If they fail, fix before committing.
7. **Never break a working feature.** Gate new features behind `process.env.FEATURE_X === 'true'` if risk is non-trivial. Default OFF if breaking, ON if additive.
8. **Never invent user-facing copy in The Consultant's voice.** Use `// TODO copy review` placeholders. Surface them in `BACKLOG.md → COPY REVIEW QUEUE`.
9. **Never weaken security.** Fix the test.
10. **WATI_SEND_MODE stays `allowlist`.** All new outbound user comms must respect this. Only `ADMIN_PHONE` receives real messages during P-final verification.
11. **Status updates.** Append one line per priority block to `PROGRESS.log` with ISO timestamp + commit subject.
12. **Token budget.** Read in slices. Prefer `Grep`/`Glob` over open-ended exploration. Reuse existing services (`User`, `wati`, `gemini`, `razorpay`, `lib/log`, `lib/auth`).

---

## PRODUCT DECISIONS ALREADY MADE (encode into DECISIONS.md on first run)

These were decided by the founder + CTO before this run. Implement them as stated:

1. **Audit gating: fully free.** The user sees their complete Aura Score and full Consultant diagnosis after the audit, with NO email/phone gate to view the result. The paywall appears AFTER the diagnosis, offering the daily protocol + ongoing membership. This maximises top-of-funnel signal at the cost of some lead capture; we accept that trade.
2. **Identity: phone required, email optional.** Phone is the primary identifier (consistent with Orator). Email is requested at the paywall step for receipts + weekly digests, but a user can complete checkout with phone alone. Lookmaxxing-only users still get phone for WhatsApp morning-mirror nudges.
3. **Aura++ is a status, not a SKU.** Two database flags: `oratorActive`, `lookmaxxingActive`. When both are true, `auraPlusPlus = true` (computed). Bundle pricing (₹1,999/mo) applies automatically when both are selected at checkout simultaneously. Cross-sells from inside either product use the same bundle math.
4. **Channels:** Orator runs on WhatsApp. Lookmaxxing runs on the PWA (web only). WhatsApp may still send Lookmaxxing nudges (mirror reminder, weekly reveal ready) to users who consent — but no Lookmaxxing protocol content flows through WhatsApp.
5. **Storage:** Use Postgres via Prisma if `DATABASE_URL` is set, else fall back to JSON files with a startup warning. Photos and videos go to Cloudflare R2 if `R2_*` env vars are set, else local `/tmp/maincharacter-uploads` with a clear `BACKLOG.md` warning that this is volatile on Render redeploys.
6. **Build order:** P1 (Night-1 bug fixes) → P2 (landing) → P3 (audit funnel) → P4 (paywall + subscriptions) → P5 (PWA shell) → P6 (daily mirror) → P7 (daily protocol) → P8 (hair tracker) → P9 (weekly reveal) → P10 (Day-30 re-audit) → P11 (cross-sell) → P12 (deploy + verify).

---

## PRIORITY ORDER (execute top-to-bottom)

### P0 — Pre-flight & continuity (~20 min)

P0.1 — Read `CLAUDE.md`, `BACKLOG.md`, `DECISIONS.md`, `PROGRESS.log` in full. Run `git log --oneline | head -30` to confirm Night-1 commits are intact. Run `npm test && npm run smoke`. Both must pass before proceeding — if either fails, fix it as P0.1.5 and document.

P0.2 — Append the 6 decisions above to `DECISIONS.md` under a new section `## Night 2 product decisions`.

P0.3 — Install new dependencies: `prisma @prisma/client web-push @aws-sdk/client-s3 fluent-ffmpeg multer sharp` (multer if not already; sharp for image resizing). Verify ffmpeg binary is available in container with `which ffmpeg`; if not, mark `BACKLOG.md` item: "Render container needs ffmpeg — use `apt-get install -y ffmpeg` in build command or switch to docker image with ffmpeg preinstalled."

P0.4 — Update `BACKLOG.md → FOUNDER ACTIONS REQUIRED` with new env vars: `WEB_PUSH_VAPID_PUBLIC`, `WEB_PUSH_VAPID_PRIVATE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Generate VAPID keys with `npx web-push generate-vapid-keys`, print to console once, instruct founder to paste into Render env. Until set, push notifications no-op gracefully.

P0.5 — Add data models (Prisma if `DATABASE_URL` set, else extend JSON schema in `models/`):
- `AuditSession` (id, sessionToken, quizAnswers JSON, photos JSON[], aestheticScores JSON, diagnosis TEXT, createdAt, completedAt)
- `MirrorScore` (id, userId FK, photoUrl, scores JSON (8 axes), createdAt)
- `ProtocolDay` (id, userId FK, date, items JSON[], completedCount, totalCount)
- `WeeklyReveal` (id, userId FK, weekNumber, videoUrl, scoreDelta JSON, createdAt)
- `HairTracking` (id, userId FK, photoUrl, norwoodEstimate, hairlineScore, createdAt)
- Extend `User`: `oratorActive bool`, `lookmaxxingActive bool`, `email string?`, `mirrorLevel string` (raw/polished/magnetic/radiant/sovereign), `auditSessionId string?` (links to original audit), `lookmaxxingStartedAt datetime?`, `pushSubscription JSON?`

Commit each P0 item. Push.

---

### P1 — Fix Night-1 bugs (~20 min)

P1.1 — **`START NOW` populates lexicon.** In `routes/api.js → handleStartNow()`, after advancing to Day 1, call `User.addWordsLearned(user.phone, DAYS[1].words, 1)`. Add a test in `tests/start-now.test.js` that asserts a fresh user who replies `START NOW` has 5 words in `wordsLearned` with `status: 'forged'`.

P1.2 — **Wati webhook signature check.** Add `WATI_WEBHOOK_SECRET` env var. In `routes/api.js → POST /api/webhook/wati`, verify the `x-wati-signature` header (HMAC-SHA256 of body using the secret). If Wati does not provide signature headers on the current plan, implement IP allowlist instead: check `req.ip` against `WATI_WEBHOOK_ALLOWED_IPS` env var (comma-separated). Document the choice in `DECISIONS.md`. Test both code paths. Until `WATI_WEBHOOK_SECRET` is set, log a warning at boot and accept unsigned requests (otherwise webhooks break in production).

Commit each. Push.

---

### P2 — Landing page update (~45 min)

P2.1 — **Two pillars, not three.** In `landing.html`:
- In `#pillar-cards`: keep Orator card unchanged.
- Replace the Aesthetic card content: title becomes `Lookmaxxing` (keep `pcard--aesthetic` class for the violet colour), tag `Physical Presence`, hook `"The room reads you before you speak."`, promise `"By Day 30 you will see the version of you the camera has been waiting to capture."`, CTA `Get Your Aura Reading →`, link to `/audit`. Update the `onclick` from `openComingSoon('aesthetic')` to `window.location.href='/audit'`.
- Remove the Sage card entirely from `#pillar-cards`. Move it to a small footer strip at the bottom of the section: `◆ The Sage · Wisdom & Mindset · Coming after Aura++ launch`.
- Update `.pillars__header h2`: keep `"You may only choose one this week."` unless the founder has revised it; leave a `// TODO copy review` note if changed.

P2.2 — **NEW section: Aura++ reveal.** Insert between the "How It Works" section (`#how`) and the existing "Paywall Moment" section. Single wide card, gold border, three columns:
- Column 1: `Your Voice` — sub: `The Orator Protocol` — body: `The way you sound when it matters.`
- Column 2: `Your Presence` — sub: `Lookmaxxing` — body: `The room reads you before you speak.`
- Column 3: `The Combined Self` — sub: `Aura++` — body: `Most who walk both paths see the change in their voice and their face at the same time. The mirror nods. The room turns. This is what the work compounds into.`
- Below the three columns: pricing strip — `Orator ₹799 · Lookmaxxing ₹1,499 · Aura++ ₹1,999/mo (saves ₹299)`.
- CTA: subtle gold underline link `Unlock both →` pointing to `/audit?intent=bundle`.

Use the existing CSS tokens (`--gold`, `--surface`, `--line`, `--font-serif`). Do not introduce new design tokens. Re-run the snapshot test for locked copy (hero, gap, rank ladder, CTA close — these must remain byte-identical).

P2.3 — **Tests:** snapshot test for the new section's structure (existence of `#aura-plus-plus`, three sub-headings, the pricing strip), and the byte-identical guard for the existing locked sections.

Commit. Push.

---

### P3 — The Aesthetic Audit funnel (~2.5 hrs)

P3.1 — **Page: `public/audit.html`.** Single-page scene-by-scene reveal. Reference the visual language of `/Users/chitranshu/Desktop/maincomponent-claude/maincharacter/aesthetic-audit-prototype.html` (dark obsidian, gold, violet accents, clinical Consultant copy). Six scenes:

- **Scene 1 (Hook).** Headline: `"The room reads you before you speak."` Sub: `"Five minutes. One reading. Yours."` CTA: `Begin Audit`.
- **Scene 2 (Quiz, 12 questions).** One question per screen, gold-fill progress bar. Categories: Skin (3), Hair (2), Jaw/Face (2), Body/Posture (2), Lifestyle (2), Goals (1 open-ended). Each question is multiple choice except the last. Written in The Consultant's voice — example for skin: `"Your morning ritual when you look at the mirror — what happens after?"` Options: `I cleanse, moisturise, sunscreen` / `Water and out the door` / `Nothing — that's not my world yet` / `Skip — I have a routine already`. NEVER use generic survey-grade phrasing.
- **Scene 3 (Photo upload).** Instruction copy: `"Stand in natural light. Camera at eye level. Neutral expression. We need the truth, not the angle."` Three required uploads: front face, side profile (jaw), full body (posture). Client-side resize to max 1024px via canvas + sharp on server. POST to `/api/audit/photos` as multipart.
- **Scene 4 (Analysis reveal).** Animated progress bar with rotating Consultant lines: `"Mapping skin signal..."`, `"Analysing facial geometry..."`, `"Assessing hair density..."`, `"Reading posture..."`. Min 8 seconds, max 45 seconds (real Gemini time). Don't fake completion — wait for the real `/api/audit/analyze` response.
- **Scene 5 (Aura Score).** Single number 0-100 in huge gold serif (`Cormorant Garamond`, ~6rem). Below, 8-axis breakdown bars (skin clarity, jaw definition, eye area, hair density, posture, facial harmony, expression, body composition). Weakest axis highlighted in violet.
- **Scene 6 (Diagnosis).** Consultant writes 2-3 paragraphs, specific to this user, quoting their own quiz answers and observed axes. Streamed token-by-token if Gemini supports streaming in current SDK version; else show after spinner.
- **Scene 7 (Paywall transition).** Smooth scroll into the paywall (P4).

P3.2 — **API routes** (`routes/audit.js`, mount at `/api/audit`):
- `POST /api/audit/session` → creates `AuditSession`, returns `{ sessionToken }`.
- `POST /api/audit/quiz` body `{ sessionToken, answers }` → saves answers.
- `POST /api/audit/photos` multipart, 3 files + `sessionToken` → resizes via sharp, uploads to R2 (or `/tmp/maincharacter-uploads/` if R2 not configured), saves URLs to session.
- `POST /api/audit/analyze` body `{ sessionToken }` → calls `services/vision.scoreAesthetic()`, persists scores + diagnosis, returns full result.
- `GET /api/audit/result/:sessionToken` → returns score + diagnosis (idempotent, for the paywall page to read).
- Audit sessions expire after 24h.

P3.3 — **Service: `services/vision.js`.** Uses Gemini 2.0 Flash with multimodal input. Function signature: `scoreAesthetic({ photos, quizAnswers, hairFocus }) → { scores: { skinClarity, jawDefinition, eyeArea, hairDensity, posture, facialHarmony, expression, bodyComposition }, weakestAxis, diagnosis, hairReceding: { detected, norwoodEstimate, hairlineScore } }`. Prompt template lives in `data/lookmax-prompts.js`. Brand voice rules from CLAUDE.md §2 apply to the diagnosis copy. Wrap user quiz answers in `<<<USER_INPUT>>>` delimiters to prevent prompt injection (re-use the guard from Night 1's `getScoringPrompt`).

P3.4 — **Page: `/audit`** route in `server.js` → serves `public/audit.html`.

P3.5 — **Tests.** Full audit flow end-to-end with mocked Gemini Vision responses. Test that: (a) a session with no photos cannot proceed to analyze, (b) the score breakdown is structurally valid, (c) prompt injection inside a quiz answer returns valid JSON, (d) the diagnosis copy never contains forbidden tokens ("great job", "amazing", "🎉").

Commit each. Push.

---

### P4 — Paywall + Razorpay Subscriptions (~1.5 hr)

P4.1 — **Page: `public/paywall.html`.** Three cards side-by-side on desktop, stacked on mobile. Each card: pillar name (serif italic), price (huge), 4-5 inclusion bullets, CTA. Aura++ card has a gold border + "Most chosen" eyebrow tag. Card data driven by `services/razorpay.js → PLANS`.

P4.2 — **Razorpay Subscriptions API** in `services/razorpay.js`:
- Add `createOrFetchPlan(planKey)` — on first call, creates a Razorpay Plan via API; cache plan IDs in `data/razorpay-plans.json` (or DB if Prisma is up).
- Add `createSubscription(planKey, customer)` — uses Razorpay Subscriptions API (`razorpay.subscriptions.create`), returns short_url.
- Set `RAZORPAY_SUBSCRIPTIONS_ENABLED=true` by default for this run (Night 1 left it off). Add a launch-time check: if true but live keys are still test keys, log a clear warning and proceed.

P4.3 — **API:**
- `POST /api/payment/subscribe` body `{ planKey, phone, name, email?, auditSessionToken? }` → creates Razorpay subscription, creates or updates User (with `lookmaxxingActive: pending` and/or `oratorActive: pending`), links the audit session if provided, returns Razorpay subscription URL. For Aura++, set both `pending` flags.
- Existing webhook `POST /api/payment/webhook` (already from Night 1): handle `subscription.activated` → flip the relevant `*Active` flag to true, send confirmation. On `subscription.charged`, log the charge. On `subscription.cancelled` or `subscription.halted`, flip flag to false and send pause message.
- Bundle pricing logic: if both flags go `pending → activated` within 1 hour of each other, ensure the user is billed the bundle rate (₹1,999) not the sum. Implement via a single combined subscription when chosen at checkout (the cleanest path); the messy refund-and-recreate path is deferred to BACKLOG.

P4.4 — **Post-payment flow.** After redirect from Razorpay back to `/upgrade?status=success`, show a confirmation page in Consultant voice: `"The Chamber is open, {name}. Your protocol begins tomorrow morning. The mirror is ready. ◆ MainCharacter"`. If user chose Lookmaxxing or Aura++, include `Install the app →` PWA install prompt (P5 delivers the PWA).

P4.5 — **Tests.** Subscription create flow (mocked Razorpay). Webhook handlers for each event. Bundle math (both flags going active within window → bundle price). Edge case: existing Orator user adds Lookmaxxing → upgrade to Aura++ at bundle price.

Commit each. Push.

---

### P5 — Lookmaxxing PWA shell (~1.5 hr)

P5.1 — **Files:**
- `public/lookmax/index.html` — login + dashboard shell
- `public/lookmax/mirror.html` — daily mirror capture (P6)
- `public/lookmax/protocol.html` — daily checklist (P7)
- `public/lookmax/hair.html` — hair tracker (P8)
- `public/lookmax/reveal.html` — weekly reveal preview (P9)
- `public/lookmax/manifest.json` — PWA manifest
- `public/lookmax/sw.js` — service worker
- `public/lookmax/icons/` — PWA icons (192, 512, maskable; generate placeholder SVG-derived PNGs with the gold ◆ on obsidian)

P5.2 — **Manifest** (`manifest.json`):
```json
{
  "name": "MainCharacter — Lookmaxxing",
  "short_name": "MainCharacter",
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

P5.3 — **Service worker** (`sw.js`): cache-first for `/lookmax/*` static (HTML, CSS, JS, icons); network-first for `/api/lookmax/*`. Cache version bumps on every deploy via a build-time variable. Implement `push` event listener that displays notifications using the payload from the server (title, body, icon, data.url).

P5.4 — **Auth flow** (phone + OTP via Wati):
- `POST /api/lookmax/auth/request-otp` body `{ phone }` → generates 6-digit OTP, saves to `LookmaxOtp` table with 10-min expiry, sends via Wati (respects `WATI_SEND_MODE`).
- `POST /api/lookmax/auth/verify-otp` body `{ phone, otp }` → on match, returns JWT (24h expiry), stored in localStorage on client. Token includes `userId`, `lookmaxxingActive`.
- Middleware `requireLookmaxAuth` on all `/api/lookmax/*` (except auth routes).

P5.5 — **PWA install prompt.** On `/lookmax/` page load, if not running standalone and `beforeinstallprompt` fired, show a small gold ribbon: `Add to home screen → ◆`. On dismiss, store flag in localStorage to suppress for 7 days.

P5.6 — **Push notification subscription.** On first login after auth, request notification permission, subscribe via web-push, POST subscription to `/api/lookmax/push/subscribe` which saves to `User.pushSubscription`. If user denies, set localStorage flag, fall back to WhatsApp nudges only.

P5.7 — **Tests.** Auth flow (request OTP, verify), token middleware, push subscription save.

Commit each. Push.

---

### P6 — Daily Mirror Score (~1.5 hr)

P6.1 — **Page `public/lookmax/mirror.html`.** Camera capture using `getUserMedia({ video: { facingMode: 'user' } })`. Show live video. Capture button takes a still via canvas → blob. Fallback: `<input type="file" accept="image/*" capture="user">` for browsers without `getUserMedia` (older iOS Safari etc).

P6.2 — **API:**
- `POST /api/lookmax/mirror` multipart `{ photo }` → server resizes via sharp (max 1024px), uploads to R2 (or `/tmp` if unconfigured), calls `services/vision.scoreMirror(photoUrl, userAuditBaseline)`, saves `MirrorScore`, returns `{ score: 0-100, axes: {...}, deltaVsBaseline, deltaVsYesterday, streak, trend: [last 14 days] }`.
- `GET /api/lookmax/mirror/history?days=30` → returns array of mirror scores for trend rendering.

P6.3 — **Service:** `services/vision.js → scoreMirror(photoUrl, baseline)` — Gemini Vision call, returns 8 axis scores. Compare to user's audit baseline (`AuditScore`) to compute deltas. If `baseline` is null (user signed up without an audit), use the first mirror as baseline.

P6.4 — **Frontend UX after capture:** show the number animate up to today's score; below it, a 14-day line chart (Chart.js, already a dep); streak counter with gold flame icon; one Consultant line generated from the score-delta: e.g., `"Skin clarity climbed three points. Sunlight before nine is doing its work."` Use `data/lookmax-prompts.js` for the Consultant-voice line generator.

P6.5 — **Push notification cron.** Schedule a daily 6:30am IST job (in the existing scheduler) that sends a mirror reminder to every user with `lookmaxxingActive=true`: web-push if subscribed, else Wati if `WATI_SEND_MODE=all` (currently allowlist — so for now, only ADMIN_PHONE receives the Wati version). Payload: `"The mirror is open. ◆"` with deep link to `/lookmax/mirror`.

P6.6 — **Mirror Level (rank).** Compute on each mirror submission: average score across 8 axes determines level. Raw <40, Polished 40-60, Magnetic 60-75, Radiant 75-90, Sovereign 90+. Save to `User.mirrorLevel`. Surface on the dashboard.

P6.7 — **Tests.** Mock Gemini Vision. Test: streak increments correctly, breaks correctly (1-day gap), level transitions, baseline fallback when no audit.

Commit each. Push.

---

### P7 — Daily Protocol Checklist (~1.5 hr)

P7.1 — **`data/lookmax-content.js`** — `PROTOCOL_LIBRARY` keyed by axis:
- `skin`: cleanser AM (CeraVe Foaming or equivalent), moisturizer AM, sunscreen SPF50, niacinamide 10% PM, retinoid 0.025% 3x/wk PM. Each with `// TODO copy review` consultant micro-instructions.
- `hair`: minoxidil 5% (1ml AM + PM if Norwood 2+), ketoconazole 2% shampoo 2x/wk, microneedling 0.5mm 1x/wk (advanced only), 10 min direct sunlight before 9am, scalp massage 3 min daily.
- `jaw`: mewing tongue-to-roof for 30s × 5 reps through the day, neck flexion exercise. EXPLICIT block: `"DO NOT use jaw exercisers, chew gum aggressively, or 'mew' for hours. These are not protocols. The above are."` (mirrors the prototype copy).
- `posture`: chin tuck (10 reps every 2h), scapular squeeze, screen at eye level, 90-min sit timer.
- `lifestyle`: sleep by 11pm, 3L water by 6pm, 7 min direct sun pre-9am, no screens 30 min before bed.

P7.2 — **Protocol generator** `services/protocol.js → generateProtocol(user, audit)`:
- Takes user's two weakest axes from their latest audit/mirror, plus the lifestyle baseline.
- Returns 5-7 items (2 from weakest axis #1, 2 from #2, 2-3 from lifestyle).
- Each item has `id`, `title`, `instruction`, `axis`, `evidenceTier` (1-3 where 1 is RCT-level).
- Re-evaluated weekly: regenerate every Sunday based on the past week's mirror axis deltas. If hair score is declining, prioritise hair items.

P7.3 — **Page `public/lookmax/protocol.html`.** Today's items as checklist with checkboxes; each item has an info tooltip showing the `instruction` and `evidenceTier`. Streak counter. "Complete day" button locks in completion. If 80% items checked, the streak increments; else it breaks.

P7.4 — **API:**
- `GET /api/lookmax/protocol/today` → today's items + completion state.
- `POST /api/lookmax/protocol/check` body `{ itemId, checked }` → toggles.
- `POST /api/lookmax/protocol/complete-day` → finalises the day, increments streak.

P7.5 — **Tests.** Generator returns 5-7 items, items match user's weakest axes, streak math.

Commit each. Push.

---

### P8 — Hair Receding Tracker (the hero feature) (~1.5 hr)

P8.1 — **Premise.** This is the single highest-converting feature in lookmaxxing apps because it addresses a specific, terrifying, time-bound pain. Build it visibly distinct from the general protocol.

P8.2 — **Page `public/lookmax/hair.html`.** Weekly hairline photo capture (front + crown). Norwood-scale visualisation overlay. Recommendations are EVIDENCE-BASED. Explicit non-recommendations.

P8.3 — **API:**
- `POST /api/lookmax/hair/photo` multipart `{ frontPhoto, crownPhoto }` → Gemini Vision call analyses hairline cone, estimates Norwood (1-7), scores hair density 0-100, returns `{ norwood, hairlineScore, recessionMm, recommendations: [...] }`.
- `GET /api/lookmax/hair/history` → all hair photos over time, with trend chart of hairline score.

P8.4 — **Evidence-based recommendation engine** `services/hair.js`:
- Norwood 1 (no recession): protective + sunscreen + ketoconazole. No minoxidil.
- Norwood 2-3 (early): minoxidil 5% topical (RCT-supported), ketoconazole 2% shampoo (RCT-supported), microneedling 0.5-1mm weekly (RCT-supported), finasteride mentioned with `"Discuss with a dermatologist — prescription only"`.
- Norwood 4+: same as 2-3, plus mention HRT options and transplant consultation as future steps.
- ALWAYS include the "DO NOT" list: laser combs at home (weak evidence), saw palmetto pills (insufficient evidence vs minoxidil), biotin if no deficiency (no evidence), expensive shampoos with unproven actives.
- All recommendations include `evidenceTier` 1-3 and a short rationale (1 sentence each).

P8.5 — **Marketing surface.** This page is its own URL `/lookmax/hair` accessible by direct link — perfect for TikTok/Instagram ads where the hook is `"How AI reads your hairline."` Add OpenGraph image (auto-generated SVG showing the gold MainCharacter mark + "Hair Audit" label).

P8.6 — **Tests.** Norwood routing → correct recommendation set. The "DO NOT" list always appears. Prompt injection in a hair photo metadata field returns valid JSON.

Commit each. Push.

---

### P9 — Weekly Reveal video (~2 hr — this is the viral loop)

P9.1 — **Cron job** in `services/scheduler.js`: every Friday 8pm IST, for each user with ≥4 mirror submissions in the past 7 days, run `services/video.composeWeeklyReveal(userId)`.

P9.2 — **Composer service** `services/video.js → composeWeeklyReveal(userId)`:
- Pull last 7 mirror photos from R2.
- Use `fluent-ffmpeg` to stitch into a 7-second MP4 (1 photo per second, gentle crossfade), 720x1280 (Reels/TikTok format), 30fps.
- Overlay: gold score trajectory line + day labels in `Cormorant Garamond` (via ffmpeg drawtext or a pre-rendered PNG overlay generated by node-canvas).
- Watermark: `◆ MainCharacter · Week N` in bottom-right.
- Upload finished MP4 to R2, save URL to `WeeklyReveal` table.
- If ffmpeg unavailable, fall back to a static SVG/PNG side-by-side image (Day-1 photo + Day-7 photo + delta numbers).

P9.3 — **Page `public/lookmax/reveal.html`.** Shows the user's latest reveal video, full-screen play button, share buttons (Instagram, TikTok, WhatsApp Status — each opens the appropriate share-sheet via `navigator.share()` with the video file). UTM tags on the deep link back: `?utm_source=share&utm_medium=video&utm_campaign=weekly-reveal&utm_content={userId}`.

P9.4 — **Notification on completion.** When the reveal is ready: web-push notification + WhatsApp message (if user has Orator OR `WATI_SEND_MODE=all` and consented). Copy: `"◆ Week {N}. Your reveal is ready. The mirror has been honest. ◆ MainCharacter"`.

P9.5 — **Tests.** Mock ffmpeg with a tiny stub. Assert: video URL saved, notification queued, share URLs include UTM. Edge case: user with only 3 photos this week — no reveal, gentle "next week" message instead.

Commit each. Push.

---

### P10 — Day-30 Re-Audit + cross-sell (~1 hr)

P10.1 — **Trigger.** A daily job (run inside the existing scheduler) finds users where `lookmaxxingStartedAt` is exactly 30 days ago today. Send a WhatsApp + push: `"◆ Day 30. The mirror is ready for the second reading. Tap to begin. ◆ MainCharacter"` deep-linked to `/audit?reAudit=true&userId={token}`.

P10.2 — **Re-audit flow.** Same as P3 audit, but: (a) pre-fill the quiz with the user's original answers (let them edit), (b) require new photos, (c) on completion show a side-by-side reveal (Day 1 axes vs Day 30 axes, each delta in gold or violet), (d) Consultant evolution write-up via Gemini using both audits + their mirror trajectory.

P10.3 — **Upsell.** If user is Lookmaxxing-only (no Orator), append the upsell: `"Your face has shifted. The next leverage point is your voice. The Orator pillar — ₹799/mo, or upgrade to Aura++ for ₹500 more total. Reply UPGRADE or visit /upgrade?to=auraplus."` Mirror this for Orator-only users completing their Day-30 Orator milestone (cross-sell to Lookmaxxing).

P10.4 — **Tests.** Mock dates, run the 30-day cron, assert correct users are notified. Test the side-by-side delta computation.

Commit each. Push.

---

### P11 — Cross-sell automation (~30 min)

P11.1 — **Inside Orator's Day-7 Evolution Report** (`data/orator-content.js → buildEvolutionReport`): append one block (gated by `process.env.CROSS_SELL_ENABLED !== 'false'`) — `"The voice has shifted. The face is next. Unlock Lookmaxxing — ₹1,499/mo. Or upgrade to Aura++ (both pillars) for ₹500 more total: maincharacter.digitglobalservices.com/upgrade?to=auraplus."` Snapshot test must be updated to include this block (it's not "locked existing copy" — it's a new addition).

P11.2 — **Inside Lookmaxxing's first Weekly Reveal:** append `"This is your face evolving. Now consider the voice. The Orator Protocol — ₹799/mo. Or upgrade to Aura++ for ₹500 more total. /upgrade?to=auraplus"`.

P11.3 — **Upgrade page** `/upgrade?to=auraplus` on the existing upgrade page: if `to=auraplus`, pre-select the Aura++ option and pre-fill the user's phone if logged in (via JWT).

P11.4 — **Tests.** Cross-sell appears in reports. Upgrade page parses the `to` param.

Commit each. Push.

---

### P12 — Deploy + Verify Live (~30 min)

P12.1 — `npm test`. All green.
P12.2 — `npm run smoke`. Green.
P12.3 — Push to `main`. Render auto-deploys.
P12.4 — `curl https://maincharacter.digitglobalservices.com/health | jq` — verify status healthy, all new keys reported.
P12.5 — Live audit funnel test with `ADMIN_PHONE`: complete the full audit (use placeholder photos if camera unavailable in container — a stock obsidian-bg image is fine for the smoke). Confirm score + diagnosis returned. Verify a `pending` user record created if you ran through paywall in test mode.
P12.6 — Live Lookmaxxing PWA test: open `/lookmax/` in a desktop browser, request OTP for `ADMIN_PHONE`, confirm the OTP message reaches admin's WhatsApp (this is the only outbound message permitted in `allowlist` mode).
P12.7 — Final commit: `chore: end of night-2 autopilot run — see PROGRESS.log`.
P12.8 — DM the founder a single WhatsApp digest to `ADMIN_PHONE` summarising: P-blocks completed, P-blocks deferred, the founder actions queued in `BACKLOG.md`, the live URLs ready for review (`/`, `/audit`, `/upgrade`, `/lookmax/`).

---

## Backlog seed (append to existing `BACKLOG.md`)

```
## NIGHT 2 — FOUNDER ACTIONS REQUIRED

- [ ] Generate VAPID keys via the printed command, paste WEB_PUSH_VAPID_PUBLIC + WEB_PUSH_VAPID_PRIVATE into Render env
- [ ] Create Cloudflare R2 bucket, paste R2_* env vars into Render
- [ ] Verify Razorpay Plans created via Plans API (or create in Razorpay dashboard) for: orator-monthly-799, lookmaxxing-monthly-1499, aura-plus-monthly-1999
- [ ] After 24h of stable bundle math, flip RAZORPAY_SUBSCRIPTIONS_ENABLED=true in env (defaults to true in this run but verify behaviour)
- [ ] Visit /lookmax/hair on mobile and run one personal hair audit — sanity check the Norwood + recommendations output
- [ ] Run the audit funnel yourself end-to-end on real photos in real lighting — assess the Consultant voice on the diagnosis
- [ ] Once all the above are green, flip WATI_SEND_MODE=all in Render to resume real-user messaging

## COPY REVIEW QUEUE (founder must approve before shipping)
(populate as TODO copy review markers are added in code)
```

---

## OUTPUT FORMAT FOR `PROGRESS.log`

Append one line per priority sub-task:

```
[2026-05-26T22:14:00Z] P0.1 done — Night-1 state verified, all tests passing. Commit: chore(night2): pre-flight checks
[2026-05-26T22:31:00Z] P1.1 done — START NOW now populates lexicon. Commit: fix(orator): START NOW seeds Day-1 lexicon
...
```

---

## IF YOU FINISH WITH TIME LEFT

Do NOT invent new scope. Instead, in priority order:

1. Increase test coverage on the new `routes/audit.js`, `routes/lookmax.js`, `services/vision.js`, `services/protocol.js`, `services/hair.js`, `services/video.js` toward 80%.
2. Write `RUNBOOK_LOOKMAXXING.md` covering: how to manually re-run a user's audit, how to refund a Razorpay subscription, how to backfill mirror photos for a user, how to regenerate a weekly reveal.
3. Add JSDoc to every new exported function.
4. Add a `/admin/lookmax` panel surfacing: daily active mirror submissions, weekly reveal generation success rate, hair-audit funnel conversion, bundle attach rate.

Begin now. Read `CLAUDE.md` first.

## ===== END PASTE =====
