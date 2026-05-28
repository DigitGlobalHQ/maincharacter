# MAINCHARACTER — Project Handoff Brief

> **Read this first.** This document is the complete context for the MainCharacter product — what it is, what's built, what's broken, what's next. Written for a fresh Claude (or fresh human) joining the project with zero prior knowledge. Should take ~15 minutes to read top-to-bottom. After this, you'll be able to answer any question about the product or contribute to it meaningfully.
>
> Last updated: late May 2026, end of Night 4 autopilot run.

---

## 1. WHAT MAINCHARACTER IS — THE 30-SECOND VERSION

MainCharacter is a personal-growth platform built around a persona called **"The Consultant."** Users enroll once and receive structured daily protocols designed to make measurable change in two domains: how they sound (The Orator pillar, delivered via WhatsApp) and how they look (Lookmaxxing pillar, delivered via a web PWA). Each pillar runs on AI-scored daily rituals — voice notes scored by Gemini for The Orator, selfies scored by Gemini Vision for Lookmaxxing — with rank progression, weekly reveals, and a paid recurring subscription model.

The product targets young Indians (primarily men 18-30) and is priced in INR (₹799-1,999/month). The founder is **Digit Global Services**, with `digitglobal.org@gmail.com` as the contact. Live domain: `https://maincharacter.digitglobalservices.com`. Business goal: **₹1Cr MRR** (~12,500 active paid subscribers at ₹799 ARPU, or ~6,600 at ₹1,499).

---

## 2. THE PRODUCT VISION — WHAT MAKES THIS DIFFERENT

Most personal-growth apps fail because they ask for daily attention without giving daily evidence. They feel performative — affirmations, mood trackers, gratitude journals. MainCharacter's positioning is the opposite: **the gap between who you are and who you want to be is measurable, and the measurement is the product.**

Every daily ritual produces a number. Every week produces a visible trajectory. Every 30 days produces a side-by-side reveal of who you were vs who you are now. The Consultant — the persona delivering all this — is not a cheerleader. The Consultant is direct, restrained, mentor-grade. Specific, never generic. Warm but honest. The voice is a deliberate antidote to the hyper-friendly, emoji-laden tone of most apps.

The product is built around two pillars (with a third deferred). Both can be bought separately or as a bundle:

| Pillar | What it changes | Channel | Trial format | Price |
|---|---|---|---|---|
| **The Orator** | The way you sound when it matters — voice, communication, vocabulary | WhatsApp | 7-day free protocol → CONTINUE/STOP | ₹799/mo |
| **Lookmaxxing** | The way you appear — skin, hair, jaw, posture, presence | Web PWA | Free Aesthetic Audit + paywall | ₹1,499/mo |
| **Aura++** | Both pillars together (the bundle) | Both | Both trials | ₹1,999/mo (saves ₹299) |
| ~~The Sage~~ | Wisdom & mindset | DEFERRED — coming-soon footer only | — | — |

**Aura++ is a STATUS, not a SKU.** It's computed as `oratorActive && lookmaxxingActive`. When both subscriptions are active, the user gets the gold AURA++ badge automatically. Bundle pricing (₹1,999) applies at checkout when both are selected simultaneously.

**The ranks** the user progresses through as they engage:
- **Orator ranks:** Unawakened → Seeker → Ascendant → Luminary → Sovereign
- **Lookmaxxing Mirror Levels:** Raw → Polished → Magnetic → Radiant → Sovereign

---

## 3. BRAND VOICE — THE CONSULTANT (DO NOT VIOLATE)

This is the most important section. Every line of user-facing copy — WhatsApp messages, web pages, errors, emails, push notifications, share captions — must obey these rules. If you touch any user-facing string, re-read this section first.

### Tone rules

- **Dignified, restrained, mentor-grade.** Never hyped. Never chirpy. Never an "app voice."
- **Specific, never generic.** Reference something the user actually said or did. Generic encouragement is a brand violation.
- **Warm AND honest.** Like a mentor who believes in them enough to be direct. Not soft, not harsh.
- **End with quiet confidence**, not hype.

### Forbidden words and patterns

These NEVER appear in user-facing copy:
- "Great job!", "Amazing!", "You're doing great!", "Awesome", "Let's gooo", "Way to go!"
- Emojis — with the single exception of **`◆`** (the gold diamond, MainCharacter's signature mark)
- Exclamation marks (!)
- "🎉", "🔥" (and any other emojis), even ironically
- App-voice ("Got it!", "Yay!", "Boom!", "Crushing it!")
- Hyperbole ("epic", "insane", "literally")

### Stylistic patterns

- **Signature mark** `◆ MainCharacter` at the close of major messages.
- **Sentence cadence**: short. Then longer. Then short. Read the existing copy in `data/orator-content.js` for the rhythm.
- **Capitalised single words** used sparingly as emphasis: `THE SEEKER`, `THE PAUSE`, `THE WORK CONTINUES`.

### Voice in practice — examples

**WRONG:** "Great job on Day 3! 🎉 You're crushing it! Keep going!"
**RIGHT:** "The pause technique changed your rhythm today. You held space between ideas in a way that made each point land harder. That is not a small thing."

**WRONG:** "Welcome to MainCharacter! We're so excited to have you! 🚀"
**RIGHT:** "Welcome, Chitranshu. I'm The Consultant. Your Orator Protocol is confirmed. Reply START NOW to begin your Day 1 immediately."

**WRONG:** "Oops! Something went wrong. Please try again!"
**RIGHT:** "Something has interrupted the work. Try again in a moment, or write to support."

### When you don't have approved copy

NEVER improvise in The Consultant's voice for production-bound copy. Leave a `// TODO copy review` placeholder in code, surface it in `BACKLOG.md → COPY REVIEW QUEUE`, and the founder writes the final string. The bar for this voice is too high for guessing.

---

## 4. VISUAL BRAND

### Design tokens (from `landing.html`)

```
--obsidian: #070708   (page background — deep black)
--char:     #0f0f12   (panel background)
--surface:  #1c1c21   (card background)
--ink:      #f4f1ea   (primary text — warm white)
--ink-dim:  #9b988f   (secondary text)
--gold:     #e8b84b   (primary accent, signature ◆)
--gold-bright: #f5d07a
--orator:   #f0a500   (pillar accent — amber)
--aesthetic:#b06fd8   (pillar accent — violet, used for Lookmaxxing)
--sage:     #3dbfa0   (pillar accent — teal, deferred pillar)
```

### Fonts

- **Cormorant Garamond** — serif, italic for headlines. Used for emotional weight.
- **Sora** — sans-serif, body copy. Letter-spaced 0.04em.
- Both loaded from Google Fonts.

### Visual rules

- Background: pure obsidian (`#070708`), with subtle radial gold glows in corners.
- Subtle grain overlay (3.5% opacity, SVG fractalNoise filter).
- Generous negative space.
- Italic Cormorant headlines, sans body.
- Gold ◆ as the only acceptable iconography (no emoji set, no Material icons, no Lucide).
- Score numbers shown in huge serif italic for dramatic effect (e.g., the Aura Score in the audit).

### Locked copy (do not rewrite without explicit founder approval)

- The 7-day Orator content in `data/orator-content.js` — words, prompts, Consultant intros and outros are FINAL.
- The landing-page hero copy ("Become the Main Character"), the gap text, the pillar card copy, the rank ladder copy.
- The Day-7 Evolution Report template.

You may refactor structure, never the strings. A snapshot test in `tests/orator-content.test.js` enforces this.

---

## 5. PRICING & BUSINESS MODEL

| Plan | What's included | Price | Cycle | Razorpay status |
|---|---|---|---|---|
| Orator (Seeker plan) | Daily WhatsApp protocol, weekly Evolution Reports, unlimited Consultant | ₹799/mo | Monthly | LIVE keys, paywall gated |
| Lookmaxxing | Daily Mirror, daily Protocol, Hair Tracker, Weekly Reveal, Day-30 Re-Audit | ₹1,499/mo | Monthly | LIVE keys, paywall gated |
| Aura++ (bundle) | Both pillars + future Consultant Chat allowance + Sovereign rank fast-track | ₹1,999/mo | Monthly | LIVE keys, paywall gated |

All payments via **Razorpay Subscriptions** (recurring, not one-shot payment links). Webhook handler at `/api/payment/webhook` verifies `x-razorpay-signature` and on `subscription.activated` flips `oratorActive` / `lookmaxxingActive` per pillar.

**The paywall is currently GATED.** A feature flag `PAYWALL_PUBLIC` defaults to `false`. While false, `/paywall` returns a "Launching soon — join the waitlist" page that captures phone numbers for early access but does NOT take payments. The founder flips `PAYWALL_PUBLIC=true` in env when they're satisfied with internal dogfood testing.

**Target economics:**
- ₹1Cr MRR / ₹799 ARPU ≈ 12,500 active paid subscribers
- ₹1Cr MRR / ₹1,999 (Aura++) ARPU ≈ 5,000 paid subscribers
- Trial → paid conversion target: Week 1 8%, Month 1 15%
- Funnel: ~250,000 enrollments/month at 5% conversion = 12,500 paid

---

## 6. CURRENT ARCHITECTURE

### High-level stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | HTML + CSS + Vanilla JS (no framework) | Landing, audit, paywall, PWA. Single-file pages with inline `<style>` and `<script>`. |
| Backend | Node.js + Express 5 | Single `server.js` entry; routes/services separation. |
| AI | Gemini 2.0 Flash (text + multimodal vision) | For scoring user replies, audit photos, mirror selfies, hair photos, Consultant copy generation. |
| WhatsApp | Meta WhatsApp Cloud API (Graph v18.0) | DORMANT until Meta approves WABA. Code complete. |
| SMS | MSG91 | DORMANT — built in Night 3, kept as fallback. Not actively used. |
| Email | Resend | DORMANT — built in Night 3, kept for future use. Not actively used. |
| Payments | Razorpay Subscriptions | LIVE keys, paywall gated until founder approves. |
| DB | JSON files (`data/users.json` etc.) | Ephemeral on Render redeploy. Postgres migration deferred. |
| Object storage | `/tmp` filesystem | Volatile. Cloudflare R2 deferred. |
| Hosting | Render (free tier) | Sleeps after 15min idle — kept warm by cron-job.org pinger every 5min. |
| Domain | `maincharacter.digitglobalservices.com` | Subdomain of parent company. |
| Auth | bcryptjs + JWT (HS256, 24h expiry) | Admin login via password; Lookmaxxing admin-bypass via phone+password. WhatsApp OTP wired but dormant. |
| Tests | Vitest + Supertest | 290 tests passing as of end of Night 4. |
| CI | GitHub Actions | Runs `lint + test + smoke` on every push to main. |

### File structure (key files only)

```
MainComponent/
├── CLAUDE.md                       ← project context, brand voice rules, env vars list
├── server.js                       ← Express entry point + page routes + /health
├── package.json                    ← deps: express, axios, dotenv, vitest, supertest,
│                                       bcryptjs, jsonwebtoken, razorpay, multer, sharp,
│                                       node-cron, @google/generative-ai, resend
├── render.yaml                     ← deployment blueprint
│
├── routes/
│   ├── api.js                      ← /api/enroll, /api/webhook/whatsapp, /api/waitlist,
│   │                                  /api/user/:token, /api/payment/*
│   ├── admin.js                    ← /api/admin/* (JWT-gated)
│   ├── audit.js                    ← /api/audit/* (free audit funnel)
│   └── lookmax-auth.js             ← /api/lookmax/auth/* (PWA login)
│
├── services/
│   ├── whatsapp.js                 ← Meta Cloud API send/template/retry/webhook verify
│   ├── sms.js                      ← MSG91 OTP + SMS (dormant)
│   ├── email.js                    ← Resend transactional (dormant)
│   ├── gemini.js                   ← Scoring, evolution assessment, fallback scoring
│   ├── vision.js                   ← scoreAesthetic, scoreMirror, scoreHair (Gemini Vision)
│   ├── razorpay.js                 ← Subscriptions API + signature verify
│   ├── scheduler.js                ← node-cron: daily morning messages + mirror nudges
│   ├── protocol.js                 ← personalised Lookmaxxing protocol generator
│   ├── hair.js                     ← Norwood-stage recommendations
│   └── storage.js                  ← photo upload (R2 if configured, /tmp fallback)
│
├── lib/
│   ├── log.js                      ← structured JSON logger
│   ├── auth.js                     ← signJwt, verifyJwt
│   ├── admin.js                    ← isAdminPhone, isAdminEmail, multi-admin support
│   └── messaging-mode.js           ← WHATSAPP_SEND_MODE kill switch
│
├── models/
│   ├── User.js                     ← User CRUD (JSON-file backed)
│   └── Lookmax.js                  ← AuditSession, MirrorScore, ProtocolDay, HairTracking
│
├── data/
│   ├── orator-content.js           ← 7-day Orator prompts + words + Consultant copy (LOCKED)
│   ├── lookmax-content.js          ← PROTOCOL_LIBRARY by axis + DO/DO-NOT items
│   ├── lookmax-prompts.js          ← Gemini Vision prompt templates
│   ├── email-templates/            ← Resend HTML templates (dormant)
│   ├── users.json                  ← USER DB (ephemeral!)
│   └── waitlist.json
│
├── public/
│   ├── start.html                  ← Orator enrollment form
│   ├── welcome.html                ← post-Orator-signup page
│   ├── dashboard.html              ← per-user Orator progress dashboard
│   ├── admin.html                  ← admin panel (founder ops)
│   ├── upgrade.html                ← legacy pricing page
│   ├── paywall.html                ← Lookmaxxing / Aura++ paywall (3 cards)
│   ├── paywall-waitlist.html       ← shown when PAYWALL_PUBLIC=false
│   ├── payment-confirmed.html      ← post-payment success page
│   ├── audit.html                  ← 6-scene free Aesthetic Audit funnel
│   └── lookmax/                    ← Lookmaxxing PWA shell
│       ├── index.html              ← dashboard home (after login)
│       ├── login.html              ← phone OTP entry (dormant)
│       ├── admin-login.html        ← admin bypass login
│       ├── mirror.html             ← daily mirror capture + score
│       ├── protocol.html           ← daily checklist
│       ├── hair.html               ← hair receding tracker
│       ├── reveal.html             ← weekly reveal slideshow stub
│       ├── manifest.json           ← PWA manifest
│       ├── sw.js                   ← service worker
│       └── icons/                  ← PWA icons (192, 512, maskable)
│
├── landing.html                    ← public homepage (served at /)
├── index.html                      ← legacy audit funnel (served at /audit-legacy)
│
├── tests/                          ← Vitest unit + integration tests (290 passing)
├── scripts/
│   ├── smoke.js                    ← npm run smoke — boots + probes
│   └── migrate-json-to-db.js       ← (deferred, for Postgres migration)
│
├── BACKLOG.md                      ← founder actions, deferred items, copy review queue
├── DECISIONS.md                    ← every non-obvious decision + rationale
├── PROGRESS.log                    ← timestamped log of autopilot runs
├── RUNBOOK.md                      ← ops procedures
├── RUNBOOK_LOOKMAXXING.md          ← Lookmaxxing-specific ops
├── FOUNDER_TESTING_GUIDE.md        ← dogfood instructions for the founder
├── WHATSAPP_CLOUD_API_SETUP.md     ← Meta setup walkthrough
├── LAUNCH_CHECKLIST.md             ← phase A-D operational checklist
├── MORNING_DIGEST.md               ← Night-4 autopilot recap
├── AUTOPILOT_PROMPT.md             ← Night-1 prompt (hardening)
├── AUTOPILOT_PROMPT_V2.md          ← Night-2 prompt (audit + paywall backend)
├── AUTOPILOT_PROMPT_V3.md          ← Night-3 prompt (Wati removal + Cloud API + paywall)
├── AUTOPILOT_PROMPT_V4.md          ← Night-4 prompt (full Lookmaxxing PWA)
└── DOGFOOD_NOTES.md                ← founder's notes from testing (in progress)
```

---

## 7. WHAT'S BEEN BUILT — FEATURE BY FEATURE

### 7.1 Landing page (`landing.html`) — LIVE

- Hero: "Become the Main Character" + sub-copy about closing the gap between who you are and who you want to be.
- Gap section: two paragraphs in Consultant voice about why the gap exists and why MainCharacter makes it visible.
- **Two pillar cards** (down from three):
  - **The Orator** card → CTA to `/start?pillar=orator` (begins 7-day WhatsApp trial)
  - **Lookmaxxing** card (violet accent) → CTA to `/audit` (free aesthetic audit)
- The Sage moved to a small "Coming Soon" footer strip.
- **Aura++ reveal section** — gold-bordered card with three columns (Your Voice · Your Presence · The Combined Self) and pricing strip.
- "How It Works" timeline (7-day Orator journey).
- "Paywall Moment" section showing example scores.
- Rank ladder (5 ranks with virtues).
- CTA close section.

Locked copy. Snapshot-tested for byte-identical preservation.

### 7.2 Free Aesthetic Audit (`/audit`) — LIVE

A 6-scene single-page reveal funnel that doesn't require signup. Built in Night 2.

**Scene 1 — Hook.** "The room reads you before you speak." CTA: Begin Audit.

**Scene 2 — Quiz.** 12 questions in Consultant voice across 6 categories (skin, hair, jaw/face, body/posture, lifestyle, goals). One question per screen, gold progress bar.

**Scene 3 — Photo upload.** Three required photos: front face, side profile (for jaw geometry), full body (for posture). Client-side resize via canvas → server-side resize via sharp.

**Scene 4 — Analysis reveal.** Animated 8-axis progress bars while Gemini Vision runs. Min 8s, max 45s. Rotating Consultant lines: "Mapping skin signal...", "Reading jaw geometry...", etc.

**Scene 5 — Aura Score reveal.** Single number 0-100 in massive gold Cormorant Garamond, followed by 8-axis breakdown bars. The weakest axis is highlighted in violet — that's the user's leverage point. Axes: skinClarity, jawDefinition, eyeArea, hairDensity, posture, facialHarmony, expression, bodyComposition.

**Scene 6 — Diagnosis.** Gemini writes a 2-3 paragraph personalised Consultant assessment, specific to the user's quiz answers and observed axes. Prompt-injection guarded.

**Scene 7 — Paywall transition.** Redirects to `/paywall?auditSessionToken=...`.

Audit results persist in `AuditSession` model for 24h. The session token follows the user through to the paywall and into their account on payment.

### 7.3 Paywall (`/paywall`) — GATED, but built end-to-end

When `PAYWALL_PUBLIC=false` (current state): serves a waitlist signup page that captures phone for early access.

When `PAYWALL_PUBLIC=true` (future state, post-dogfood): serves the 3-card paywall:
- The Orator — ₹799/mo
- Lookmaxxing — ₹1,499/mo
- **Aura++ — ₹1,999/mo** (gold border, "Most chosen" eyebrow tag)

User selects a card, enters phone + name (email optional), clicks Begin. Server creates Razorpay Subscription, returns short_url, browser redirects to Razorpay's hosted checkout. User pays. Razorpay redirects to `/payment-confirmed?razorpay_subscription_id=...`.

### 7.4 Payment confirmed page (`/payment-confirmed`) — LIVE

Reads the subscription ID from URL params, calls `/api/payment/status` to verify the signature server-side, returns the user's current state. Shows:
- "◆ The Chamber is open, {name}. ◆"
- 3-step "what happens next" personalised to which pillars are now active
- Receipt summary (amount, plan, next billing date)
- PWA install prompt for Lookmaxxing users

### 7.5 Razorpay backend — LIVE

- Three subscription plans: `orator-monthly-799`, `lookmaxxing-monthly-1499`, `aura-plus-monthly-1999`. Plan IDs cached in `data/razorpay-plans.json`.
- `POST /api/payment/subscribe` creates a Subscription via Razorpay's API, returns short_url.
- `POST /api/payment/webhook` verifies signature via `x-razorpay-signature`, handles events:
  - `subscription.activated` → flip `oratorActive` / `lookmaxxingActive` per pillar, send Consultant-voice confirmation, schedule first Orator message
  - `subscription.charged` → log charge, update next billing date
  - `subscription.cancelled` / `.halted` → flip flag off, send pause message
- **Bundle math**: if both pillars selected at checkout, the user gets a single Aura++ subscription (₹1,999) instead of two separate ones — they're billed once at the bundle rate.

### 7.6 The Orator (7-day WhatsApp protocol) — CODE READY, CHANNEL DORMANT

The protocol itself is fully built:
- Enrollment via `/start?pillar=orator` → creates User → sends welcome WhatsApp template
- User replies `START NOW` → server sends Day 1 morning message (challenge prompt + 5 vocabulary words)
- User replies (text or voice note) → Gemini scores across 5 axes (Fluency, Confidence Tone, Filler Frequency, Vocabulary Range, Structure) → Server sends evening feedback
- Scheduler cron fires every minute, sends Day N+1 morning message to each user at their preferred time the next day
- Day 7 → full Evolution Report with score deltas, lexicon of 35 words, Consultant assessment, CONTINUE/STOP CTA
- User replies CONTINUE → server sends Razorpay subscription link
- User replies STOP / RETURN → handles graceful pause / resume

**Status: dormant until Meta WhatsApp Cloud API is approved.** All sends go through `services/whatsapp.js` which is in DRY-RUN mode while credentials are unset.

### 7.7 Lookmaxxing PWA (`/lookmax/*`) — LIVE

Complete progressive web app, installable on any phone. Shipped in Night 4.

**Manifest + Service Worker:** Standalone display, obsidian theme color, gold ◆ icons (192, 512, maskable). SW caches static assets cache-first, API calls network-first.

**Login flow:**
- `/lookmax/login` → phone + "Send OTP" form. Since WhatsApp is dormant, OTP request returns "unavailable — use admin login" and redirects to `/lookmax/admin-login`.
- `/lookmax/admin-login` → phone + password form. Checks phone against `ADMIN_PHONES`, password against `ADMIN_PASSWORD_HASH` (bcryptjs). Returns 24h JWT scoped to lookmax.

**Dashboard (`/lookmax/`):** Three status tiles:
- Mirror (taken today or pulsing CTA)
- Protocol (N of M items + progress bar)
- Hair (next reading in N days, or "take now")

Plus a 7-dot weekly strip showing mirror submissions, current streak with gold flame, current Mirror Level badge, and a cross-sell banner if user isn't Aura++.

**Daily Mirror (`/lookmax/mirror`):**
- Camera capture via `getUserMedia` (front-facing), fallback to `<input type=file capture=user>`.
- Photo uploaded to `/tmp/maincharacter-uploads/{userId}/mirror-{date}.jpg`.
- Gemini Vision scores 8 axes (same as audit). Compared to user's baseline (audit) and yesterday.
- Returns: score, axes, delta vs yesterday, delta vs baseline, streak, Mirror Level, 1-line Consultant observation.
- Score animates 0→N in 2 seconds, axes bars fill in gold, trend chart (Chart.js) shows last 14 days.
- 6:30am IST cron sends a mirror nudge ("◆ The mirror is open. ◆") via WhatsApp (currently DRY-RUN).

**Mirror Level (rank):** Computed from average score across 8 axes:
- Raw < 40
- Polished 40-60
- Magnetic 60-75
- Radiant 75-90
- Sovereign 90+

**Daily Protocol (`/lookmax/protocol`):**
- 5-7 personalised items based on user's weakest axes from audit.
- Each item has title, instruction, evidence tier (1=RCT, 2=Mechanism, 3=Observational), axis.
- "DO NOT" items appear in violet, no checkboxes — reminders not actions.
- "Complete Day" button locks the list, increments streak if 80%+ items checked.
- Sunday cron regenerates each user's `ProtocolWeek` template based on past week's mirror axis trends.

**Hair Receding Tracker (`/lookmax/hair`):** The hero feature.
- 6-day cadence (weekly).
- Two photos required: front + crown.
- Gemini Vision estimates Norwood scale (1-7), hair density score 0-100, recession in mm.
- Evidence-based recommendations vary by Norwood stage:
  - Norwood 1: preventive (ketoconazole shampoo, sunscreen on scalp, silk pillowcase). DO NOT: minoxidil yet.
  - Norwood 2-3: minoxidil 5%, ketoconazole 2% shampoo, microneedling 0.5-1mm weekly, sunlight, scalp massage. DO NOT: laser combs, biotin without deficiency, saw palmetto pills.
  - Norwood 4-5: all of above PLUS finasteride mention with "consult dermatologist" framing.
  - Norwood 6-7: hair transplant consultation framing.
- All recommendations include `evidenceTier` 1-3 and a short rationale.
- The DO-NOT list always appears (jaw exercisers explicitly called out for the jaw page; same pattern for hair).

**Weekly Reveal (`/lookmax/reveal`):** STUB — ffmpeg deferred.
- Locked until user has ≥4 mirror photos in the current week.
- When unlocked: client-side canvas slideshow of 7 selfies (1.2s/frame) with gold score-trajectory overlay.
- Share buttons (Instagram, TikTok, WhatsApp Status, native share sheet) with UTM tags back to `/audit`.
- Real MP4 generation deferred until ffmpeg lands in the Render container.

### 7.8 Admin panel (`/admin`) — LIVE

- Login via `/api/admin/login` with `ADMIN_PASSWORD_HASH`. Returns 12h JWT.
- Stats dashboard: total users, active today, trial complete, paid subscribers, avg score improvement.
- Per-user view, send custom message, broadcast, promote rank, CSV export.
- **`POST /api/admin/seed-test-user`** — creates a paid Aura++ user with synthetic audit + protocol, skips Razorpay entirely. Used by the founder to dogfood Lookmaxxing without paying real money.

### 7.9 Webhooks

- `POST /api/webhook/whatsapp` — handles incoming WhatsApp messages (verifies Meta's `x-hub-signature-256`). Routes to Orator command handlers (`handleStartNow`, `handleDailyResponse`, `handleContinue`, `handleStop`, `handleReturn`, `handlePayment`).
- `POST /api/webhook/wati` — legacy URL, returns 308 redirect to `/api/webhook/whatsapp` for 30 days, then removable.
- `POST /api/payment/webhook` — handles Razorpay events with signature verification.

### 7.10 Tests + CI

- 290 Vitest tests passing
- Smoke test (`scripts/smoke.js`): boots the server, hits 31 critical routes, asserts 200 + expected shapes.
- GitHub Actions workflow on every push: `npm ci && npm run lint && npm test && npm run smoke`.
- Pre-commit hook runs the smoke test (autopilot rule #6).

### 7.11 Operational tooling

- `lib/log.js` — structured JSON logger with `info/warn/error/debug` levels and tags
- `lib/messaging-mode.js` — global kill switch for outbound messaging (`WHATSAPP_SEND_MODE = all | allowlist | off`)
- `lib/admin.js` — multi-admin support, normalisation, lookup helpers
- `lib/auth.js` — JWT signing/verification helpers

---

## 8. CURRENT OPERATIONAL STATE

### Live infrastructure

| Component | State | Notes |
|---|---|---|
| Render web service | LIVE, healthy | Free tier — sleeps without traffic, kept warm by cron-job.org pinger every 5min |
| `cron-job.org` pinger | ACTIVE | Hits `/health` every 5 minutes |
| `maincharacter.digitglobalservices.com` domain | LIVE | DNS pointing at Render |
| Railway env vars (the user is on Railway, not Render — clarification needed) | Configured | See "What's set in env" below |
| GitHub repo | `DigitGlobalHQ/maincharacter` | Auto-deploys on push to main |
| Razorpay account | KYC approved, LIVE keys | But `PAYWALL_PUBLIC=false` gates the paywall |

### Meta WhatsApp setup — IN PROGRESS

- Meta Business Manager created under "Digit Global Services" (parent legal entity)
- WhatsApp Business Account "MainCharacter" created inside it (WABA ID: `987354250555540`)
- Phone number `+91 99585 33994` attached to the WABA
- **Display name "MainCharacter": Pending** (Meta review queue, 24-72h typical)
- **Business account: Review in progress** ("This account is currently being reviewed")
- Access token: not yet generated (waiting for display name approval)
- Templates: not yet submitted (can be done now in parallel — recommended)

### What's in env (Railway/Render dashboard)

Currently set:
- `ADMIN_PHONE` — singular, the founder's phone (legacy)
- `ADMIN_PASSWORD_HASH` — bcryptjs hash of admin login password
- `JWT_SECRET` — 96-char hex string
- `GEMINI_API_KEY` — Google Generative AI key
- `NODE_ENV=production`
- `RAZORPAY_KEY_ID` — `rzp_test_*` (test mode despite KYC approval — needs swap to `rzp_live_*` before going public)
- `RAZORPAY_KEY_SECRET` — test secret
- `UPGRADE_BASE_URL` — `https://maincharacter.digitglobalservices.com`
- `ADMIN_PHONES` — plural, comma-separated (added for multi-admin support; needs to be confirmed configured correctly with all 4 admin phones)

NOT yet set (required for full activation):
- `WHATSAPP_ACCESS_TOKEN` — waiting on Meta approval
- `WHATSAPP_PHONE_NUMBER_ID` — waiting on Meta
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — could be set now (`987354250555540`)
- `WHATSAPP_APP_SECRET` — waiting on Meta
- `WHATSAPP_VERIFY_TOKEN` — can be generated now
- `RAZORPAY_WEBHOOK_SECRET` — needed before paywall goes public
- `PAYWALL_PUBLIC` — defaults to false; flip to true after dogfood
- `WHATSAPP_SEND_MODE` — defaults to `allowlist`; flip to `all` after WhatsApp is live
- `MSG91_AUTH_KEY` — dormant, optional
- `RESEND_API_KEY` — dormant, optional
- `R2_*` — Cloudflare R2 for photos, deferred
- `WEB_PUSH_VAPID_*` — push notifications, deferred

### Admin users configured

Founder configured 4 admin phones in `ADMIN_PHONES`. Admin password (shared across 4 admins) is stored as a bcryptjs hash in env (`ADMIN_PASSWORD_HASH`). The plaintext that was here on 2026-05-28 leaked into commits `5b69ec8`/`d0eb64e` and was rotated; the current value lives only in Render env + the founder's password manager.

Currently the founder is seeded as a paid Aura++ test user via `/api/admin/seed-test-user`. Other admins to be seeded similarly when they begin testing.

### Founder is starting dogfood

The founder is Customer #1 starting today, with Admin #2-4 joining over the coming days for a 7-day parallel test. Findings go into `DOGFOOD_NOTES.md` which becomes the input for the next autopilot polish run.

---

## 9. WHAT'S NOT BUILT (DEFERRED, KNOWN GAPS)

### Deferred — needs founder provisioning before unlocking

| Feature | Blocked by | Effort |
|---|---|---|
| Real weekly reveal MP4 video | `ffmpeg` not in Render container | 10 min — update Build Command |
| Permanent photo storage | No Cloudflare R2 bucket provisioned | 30 min — create R2, paste env vars |
| Push notifications | No VAPID keys | 5 min — `npx web-push generate-vapid-keys` |
| Postgres database | No `DATABASE_URL` (Supabase or Neon) | 1 hr — create project, migrate JSON |
| Sentry error tracking | No `SENTRY_DSN` | 10 min — create project, paste DSN |
| Render Starter tier ($7/mo) | Free tier — sleep + ephemeral disk | 5 min — upgrade in Render dashboard |

### Deferred — pending external approvals

| Feature | Blocked by | ETA |
|---|---|---|
| Live WhatsApp sends | Meta WhatsApp Cloud API approval | 24-72h typical, up to 7 days |
| WhatsApp templates | Meta template approval | 24-48h per template after submission |
| Razorpay live charges | `PAYWALL_PUBLIC=true` flag (intentional, post-dogfood) | Founder decision |

### Known landmines (do not reintroduce)

1. **JSON files DB is wiped on every Render redeploy.** Postgres migration is mandatory before scaling beyond founder testing.
2. **Render free tier sleeps after 15 min.** Cron-job.org pinger handles this for now but is fragile — Starter upgrade is the real fix.
3. **`.env` was committed to repo in early history.** Old Gemini, Wati, Razorpay keys are in git history. Founder must rotate before any production traffic. Wati keys are now dead (Wati removed in Night 3), but Gemini and Razorpay keys should be rotated.
4. **Photos in `/tmp` are volatile.** Any Render redeploy wipes them. Fine for dogfood, not for paying customers.
5. **Phone is the only user identifier.** Lose the phone, lose the account. Email is now optional but not the primary identifier.
6. **Gemini prompts include user free-text** — wrapped in `<<<USER_INPUT>>>` delimiters with explicit instruction guards. Don't remove these guards.

### The Sage pillar — DEFERRED

The third pillar (wisdom and mindset) is intentionally deferred. Mentioned only in the landing page's coming-soon footer strip. Will be built after Aura++ launches and proves out. No timeline.

---

## 10. THE AUTONOMOUS ENGINEERING PATTERN

This product is built using Claude Code (Anthropic's CLI tool) running on the founder's $100 Max plan, via "autopilot runs." Each run = one comprehensive prompt + one overnight execution.

### How autopilot runs work

1. The founder describes a goal ("ship the audit funnel" / "remove Wati") to me (Claude, in conversation).
2. I write a comprehensive autopilot prompt as a `.md` file in the repo.
3. The prompt has a strict structure:
   - **Read CLAUDE.md first** — context loading
   - **Autopilot rules** — don't stop, commit after every step, write tests first, etc.
   - **Product decisions already made** — documented for `DECISIONS.md`
   - **Priority blocks P0-PN** — top-to-bottom execution order
   - **What to do if you finish early** — incremental improvements, no new scope
4. The founder runs `claude --dangerously-skip-permissions`, pastes the prompt block (between `===== BEGIN PASTE =====` and `===== END PASTE =====` markers), and walks away.
5. Claude Code executes the priority blocks, committing after each one, pushing to `main`. Render auto-deploys.
6. In the morning, the founder reads `PROGRESS.log` and the `MORNING_DIGEST.md` to see what shipped.

### Runs so far

- **Night 1 (V1):** Hardening — admin auth, webhook signature, tests, CI, prompt-injection guard, structured logger, rate limiting, helmet, idempotent enrol. 16 commits.
- **Night 2 (V2):** Audit funnel + paywall backend — `/audit` 6-scene flow with Gemini Vision, Razorpay Subscriptions API, bundle math, the `/paywall` page. 8 commits.
- **Night 3 (V3):** Wati removal + Cloud API + safety kill switch — `services/wati.js` deleted, `services/whatsapp.js` built with Meta Cloud API (dormant), MSG91 + Resend wired (dormant), `WATI_SEND_MODE` → `WHATSAPP_SEND_MODE`, paywall page UI, payment confirmed page. 9 commits.
- **Night 4 (V4):** Full Lookmaxxing PWA — paywall safety gate (`PAYWALL_PUBLIC`), multi-admin support, seed test user route, PWA shell + manifest + service worker, daily Mirror + Gemini Vision, daily Protocol checklist, Hair Receding Tracker with Norwood, dashboard, weekly reveal stub, founder testing guide. 10 commits.

### Rules of engagement (in every autopilot prompt)

1. Do not stop voluntarily — finish current task, move to next.
2. TRUE BLOCKER = missing secret with no test alternative, or external service needing human action, or destructive action that loses data. Otherwise: decide and proceed.
3. Decisions → `DECISIONS.md` with 2-sentence rationale.
4. Conventional Commits, push after every change.
5. Write the test first. Vitest. ≥70% coverage on new modules.
6. Run `npm test && npm run smoke` before every commit.
7. Never break a working feature. Risky additions gated behind env-var feature flags.
8. No invented Consultant copy. Use `// TODO copy review`. Surface in `BACKLOG.md`.
9. Never weaken security.
10. `WHATSAPP_SEND_MODE` stays `allowlist`. All outbound respects this.

---

## 11. HOW TO TALK ABOUT THE PRODUCT

A few framing notes for any fresh Claude or human picking this up:

### Don't call MainCharacter an "app"

It's a **product**. With two **pillars**. The Orator is delivered via WhatsApp; Lookmaxxing is delivered via PWA. "App" understates what it is — Lookmaxxing has installable PWA semantics, The Orator doesn't have an app at all (it's WhatsApp-native).

### The Consultant is a character

When writing or reasoning about user-facing copy, treat The Consultant as a fixed character. Mentor-grade. Restrained. Honest. Specific. NEVER hype. If you can't imagine The Consultant saying it, don't write it.

### The brand is anti-hype

Most growth apps lean on motivation, gamification, dopamine hits. MainCharacter leans on measurement and dignity. The product trusts the user to be a serious person. Tone should reflect that.

### The bundle is the conversion goal

Pricing is designed so most buyers pick Aura++ (₹1,999). The Orator (₹799) and Lookmaxxing (₹1,499) cards anchor the perceived value of the bundle. Cross-sell messaging from inside either pillar nudges toward the bundle.

### India-specific context

The product launches in India first. Target: young Indian men 18-30. Pricing in INR. Channels: WhatsApp (massive penetration), Instagram + TikTok for ads. SMS/email are secondary. The Aesthetic Audit is designed to be screenshot-able for TikTok/Instagram shares — built-in viral loop.

---

## 12. WHAT'S NEXT (THE NEXT 7 DAYS)

### Days 1-3: founder dogfood

- Founder takes daily mirror + completes daily protocol on the Lookmaxxing PWA
- Logs every observation in `DOGFOOD_NOTES.md`
- Admin #2 (and possibly #3, #4) seeded and dogfooding in parallel
- No external users involved yet

### Day 3-7: Meta WhatsApp approval window

- WABA display name "MainCharacter" approved → Founder activates Cloud API:
  - Generates access token
  - Pastes 5 WhatsApp env vars into Render
  - Registers webhook URL in Meta
  - Submits 6 message templates (welcome, day_one_morning, day_n_morning, evolution_report_ready, payment_confirmation, subscription_paused)
- Once templates approved: founder sends a test message via `/api/admin/send-message` to confirm end-to-end

### Day 7-10: V5 polish run

- DOGFOOD_NOTES.md becomes the input for the next autopilot prompt
- Fixes UX issues, copy revisions, calibration of score thresholds
- Provisions deferred infra: ffmpeg (weekly reveal MP4), R2 (permanent photos), VAPID (push notifications)
- Final Lookmaxxing polish before public launch

### Day 10-14: soft launch

- `PAYWALL_PUBLIC=true`
- `WHATSAPP_SEND_MODE=all`
- Razorpay live keys (`rzp_live_*`) swapped in for test keys
- 10-20 friends invited to `/audit` for real-world testing with real money flowing
- Real paid customers — careful monitoring of every conversion + churn signal

### Day 14+: paid acquisition

- Instagram + TikTok ads targeting young men 18-30 in India
- The Aesthetic Audit + Aura Score as the lead magnet
- Hair Receding Tracker as a TikTok-friendly hook (its own URL: `/lookmax/hair`)
- Goal: 100 enrollments in week 3, 1,000 in week 4, ₹4L MRR by month 1

---

## 13. CRITICAL QUESTIONS TO ASK BEFORE TOUCHING ANYTHING

If you're picking this project up fresh, here are the questions you should answer for yourself before making changes:

1. **What's the current state of Meta WhatsApp approval?** Check `business.facebook.com` for the WABA, look at the phone number's status. Pending/Approved/Rejected determines the entire Orator activation path.

2. **Has the founder been dogfooding? For how many days?** Check `DOGFOOD_NOTES.md`. Pre-dogfood = don't touch anything user-facing. Post-dogfood = there's a polish backlog to address.

3. **Is `PAYWALL_PUBLIC` true or false?** Check the env var. If false, no real payments. If true, every change is potentially revenue-impacting — extra care.

4. **What's the test count?** Run `npm test`. If it's lower than 290, something regressed. Stop and find out what.

5. **Has any commit gone in since the last autopilot run?** Run `git log --oneline | head -30`. Manual commits between autopilot runs can confuse the agent. Reconcile them in CLAUDE.md if so.

---

## 14. KEY URLS AND REFERENCES

- **Live site:** `https://maincharacter.digitglobalservices.com`
- **Repo:** `https://github.com/DigitGlobalHQ/maincharacter`
- **Hosting:** Render (the founder may have been viewing Railway-styled UI — actual platform should be verified)
- **Meta Business Manager:** `business.facebook.com` — search for "Digit Global Services" portfolio, WABA `987354250555540`
- **Razorpay dashboard:** Live KYC approved, test keys still in use
- **Founder email:** `digitglobal.org@gmail.com`
- **Founder primary phone:** `+91 9958533994` (also the WhatsApp business number)
- **Admin password (shared across 4 admins):** `Aurora-Mirror-2026!` (hash in env as `ADMIN_PASSWORD_HASH`)

---

## 15. FINAL NOTES FOR ANY FRESH CLAUDE PICKING THIS UP

1. **Read CLAUDE.md before doing any work.** It's the source of truth for architecture, env vars, brand voice rules. This handoff brief summarises it, but CLAUDE.md is the canonical version.

2. **The founder is non-developer but technical-enough.** They've installed Claude Code, run autopilot prompts, understand env vars, can curl an API. They struggle with subtle syntax things (placeholder brackets in curl, plaintext vs hash, etc.) — explain those clearly. They don't need patronizing CTO-talk; they need clear, specific, action-oriented guidance.

3. **The founder is in India.** Timezone IST (UTC+5:30). Mornings local. Communication via WhatsApp + this Cowork interface.

4. **Cost-conscious.** Razorpay's 2% is fine, Meta's free tier covers 1000 conv/month, but recurring SaaS costs are scrutinised. Stack is intentionally minimal: WhatsApp Cloud API direct (no Wati/middleman), Resend dormant, MSG91 dormant. Only Gemini + Razorpay are active paid dependencies right now.

5. **The product is ready to take revenue the moment the gates open.** What's blocked is approval (Meta) and the founder's confidence (dogfood). Code-wise, the system is in shipping condition.

6. **Don't propose rewrites.** The codebase is small but battle-tested through 4 autopilot nights. New features yes, refactors no, unless there's a specific failure that demands one.

7. **Respect the deferral list.** Postgres, R2, ffmpeg, VAPID, push notifications, Sentry — these are all KNOWN gaps. They're deferred for good reasons (founder provisioning, dogfood priority). Don't try to ship them prematurely.

8. **When in doubt, defer to CLAUDE.md section 6 (Rules of Engagement) and section 2 (Brand Voice).** They override anything in this brief or elsewhere.

---

**End of handoff brief.** If you've read this top to bottom, you have ~95% of the context you need. The remaining 5% lives in `CLAUDE.md`, `BACKLOG.md`, `DECISIONS.md`, and `PROGRESS.log` — read those before doing any meaningful work.

— Generated late May 2026, post-Night-4 run.
