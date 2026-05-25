# CLAUDE.md — MainCharacter project context

> This file is auto-read by Claude Code on every session. It is the source of truth for **what this product is, what voice it speaks in, and what you (the AI engineer) are allowed to change.** Read it once at the start of every session.

---

## 1. WHAT WE ARE BUILDING

**MainCharacter** is a WhatsApp-first personal-growth platform. Users enrol once and receive a daily protocol over WhatsApp from a persona called **"The Consultant."** They reply (text or voice note). Gemini scores the reply across five dimensions. On Day 7 they get a personalised **Evolution Report** and are offered a paid subscription.

**Two product pillars** (launch scope; Sage deferred):

- **The Orator** (LIVE) — speech, voice, communication. WhatsApp-delivered. 7-day trial protocol end-to-end.
- **Lookmaxxing** (formerly "Aesthetic") — physical presence. **Web-only PWA**, NOT WhatsApp-delivered. Daily morning mirror selfie + personalised protocol checklist + weekly reveal video + Day-30 re-audit. Audit-funnel reference prototype: `/maincomponent-claude/maincharacter/aesthetic-audit-prototype.html`.
- **The Sage** — DEFERRED. Mention in landing footer only.

**Aura++** is the **bundle status** when a user holds BOTH paid subscriptions. NOT a separate product or SKU. Implemented as a computed flag (`oratorActive && lookmaxxingActive`). Bundle pricing ₹1,999/mo automatically applies at checkout when both are selected; saves ₹299 vs separate.

**Ranks** the user progresses through: Unawakened → Seeker → Ascendant → Luminary → Sovereign (Orator). Mirror Levels for Lookmaxxing: Raw → Polished → Magnetic → Radiant → Sovereign.

**Pricing:**
- Orator ₹799/mo (Seeker plan)
- Lookmaxxing ₹1,499/mo
- Aura++ bundle ₹1,999/mo (auto-applied when both selected)
- All Razorpay Subscriptions (recurring), NOT one-shot links.

**Domain:** `https://maincharacter.digitglobalservices.com` (Render.com).

**Business goal:** scale to ₹1Cr MRR. At ₹799 ARPU that is ~12,500 active paid subscribers.

---

## 2. THE CONSULTANT — BRAND VOICE (DO NOT VIOLATE)

Every line of copy that ships to a user — WhatsApp messages, pages, errors, emails — must obey these rules. **If you touch user-facing copy, re-read this section first.**

- Tone: dignified, restrained, mentor-grade. Never hyped. Never chirpy. Never an "app voice."
- **Never** use: "Great job!", "Amazing!", "You're doing great!", emojis (except the diamond `◆`), exclamation marks, "Awesome", "Let's gooo", "🎉".
- Always specific. Reference something the user actually said or did.
- Warm AND honest. Like a mentor who believes in them enough to be direct.
- End with quiet confidence, not hype.
- Signature mark: `◆ MainCharacter` at the close of major messages.
- Sentence cadence: short. Then longer. Then short.
- Capitalised single words used as emphasis: `THE SEEKER`, `THE PAUSE`. Used sparingly.

Visual brand:
- Background `--obsidian #070708`, gold `--gold #e8b84b`, ink `#f4f1ea`.
- Fonts: **Cormorant Garamond** (serif italic for headlines), **Sora** (sans for body).
- Pillar colours: orator `#f0a500`, aesthetic `#b06fd8`, sage `#3dbfa0`.
- Subtle grain overlay, gold radial glows, generous negative space.

**Untouchable assets** (do not restyle without explicit approval):
- The 7-day content in `data/orator-content.js` — words, prompts, Consultant intros/outros are FINAL. You may refactor structure, never the copy.
- The landing page hero copy, pillar card copy, rank ladder copy. You may move them; you may not rewrite them.
- The design tokens (colours, fonts, radii) in any HTML `<style>` block.

---

## 3. CURRENT ARCHITECTURE (READ BEFORE EDITING)

```
MainComponent/
├── server.js                ← Express entry point, page routes, /webhook compat shim, /health
├── render.yaml              ← Render blueprint
├── package.json             ← Deps: express, axios, dotenv, multer, node-cron, razorpay, @google/generative-ai
│
├── routes/
│   ├── api.js               ← /api/enroll, /api/webhook/wati, /api/waitlist, /api/user/:token, /api/payment/*
│   └── admin.js             ← /api/admin/* (password-header auth)
│
├── services/
│   ├── wati.js              ← sendMessage, sendMessageSafe (1 retry), sendTemplateMessage
│   ├── gemini.js            ← scoreUserResponse, generateEvolutionAssessment, fallback scoring
│   ├── scheduler.js         ← node-cron every 60s + checkMissedMessages on boot
│   └── razorpay.js          ← createOrder, createPaymentLink, verifyPayment, verifyWebhookSignature
│
├── models/
│   └── User.js              ← JSON-file CRUD (data/users.json, data/waitlist.json)
│
├── data/
│   ├── orator-content.js    ← 7-day prompts, words, message builders, scoring prompt
│   ├── users.json           ← USER DB (ephemeral on Render free tier!)
│   └── waitlist.json
│
├── public/
│   ├── start.html           ← enrollment form
│   ├── welcome.html         ← post-signup
│   ├── dashboard.html       ← user progress (fetches /api/user/:token)
│   ├── admin.html           ← admin (login → /api/admin/stats with x-admin-password)
│   ├── upgrade.html         ← pricing
│   └── ascension-confirmed.html
│
├── landing.html             ← homepage (served at /)
├── index.html               ← legacy audit funnel (served at /audit)
├── voiceAnalysis.js         ← STUB — not wired up yet
└── auraScore.js             ← LEGACY — orphan, ignore
```

**Data flow (Orator):**
`User submits form → POST /api/enroll → User.createUser → wati.sendMessage(welcome) → User replies "START NOW" → /api/webhook/wati → handleStartNow → wati sends Day 1 morning → user replies → handleDailyResponse → gemini.scoreUserResponse → User.addScore + addChronicle → wati sends evening feedback → cron sends Day N+1 next day → repeat → Day 7 → buildEvolutionReport → wati → "Reply CONTINUE to subscribe" → razorpay.createPaymentLink → user pays → ???`

**The chain breaks at `???`.** There is no Razorpay → DB → user-upgrade webhook. Fix this.

---

## 4. KNOWN LANDMINES (DO NOT REINTRODUCE)

1. **`data/users.json` is wiped on every Render redeploy.** Render free-tier disk is ephemeral. Migration to Postgres is mandatory before any real user signs up.
2. **Render free tier sleeps after 15 min of no traffic.** `node-cron` dies with it. Morning messages will not fire. Either move scheduler off the web dyno, or upgrade to a paid tier with always-on instance, or use an external pinger (cron-job.org → /health every 5 min) as a stopgap.
3. **`.env` is committed to the repo.** Rotate every key (Gemini, Wati JWT, Razorpay) and add `.env` to `.gitignore` if not already.
4. **Admin password defaults to `maincharacter2026` in plaintext** and is sent via custom header. Replace with proper auth.
5. **Webhook is open to the internet.** Wati requests are not signature-verified. Razorpay's webhook signature verifier exists but is not wired to any route.
6. **Webhook self-forwarding via `http.request('localhost')`** in `server.js` is fragile. Remove and call the handler directly.
7. **Phone is the only user identifier.** Lose the phone, lose the account. Add email as secondary identifier.
8. **Free-text user replies are concatenated into Gemini prompts** with no sanitisation → prompt-injection vector. Wrap user input in delimiters and explicit instruction guards.
9. **Voice notes are not handled** despite copy promising "voice or text both work."
10. **`/api/user/:token` returns user data with zero auth.** Token is a UUID — fine, but never rotated and never expires. Acceptable for v1, but log access.

---

## 5. ENVIRONMENT VARIABLES (LIVE LIST)

Set in Render dashboard (NOT in committed `.env`):

| Key | Purpose | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Generative AI | yes |
| `WATI_API_KEY` | Wati Bearer JWT | yes |
| `WATI_BASE_URL` | e.g. `https://live-mt-server.wati.io/10165576` | yes |
| `WATI_WEBHOOK_SECRET` | new — for verifying incoming webhooks | add |
| `ADMIN_PHONE` | founder's WhatsApp for alerts (with country code, no `+`) | yes |
| `ADMIN_PASSWORD` | admin login | yes (rotate) |
| `RAZORPAY_KEY_ID` | live key after KYC | yes |
| `RAZORPAY_KEY_SECRET` | live secret | yes |
| `RAZORPAY_WEBHOOK_SECRET` | for webhook signature verify | yes (was empty — set it) |
| `UPGRADE_BASE_URL` | `https://maincharacter.digitglobalservices.com` | yes |
| `DATABASE_URL` | new — Postgres connection string | add |
| `REDIS_URL` | new — Upstash Redis for queue/cache | add |
| `RESEND_API_KEY` | new — transactional email | add |
| `SENTRY_DSN` | new — error monitoring | add |
| `WATI_SEND_MODE` | `all` / `allowlist` / `off` — global send guard (defaults to `allowlist`) | yes |
| `WEB_PUSH_VAPID_PUBLIC` | VAPID public key for PWA push notifications | add |
| `WEB_PUSH_VAPID_PRIVATE` | VAPID private key for PWA push notifications | add |
| `R2_ACCOUNT_ID` | Cloudflare R2 (object storage for daily mirror photos + reveal videos) | add |
| `R2_ACCESS_KEY_ID` | R2 access key | add |
| `R2_SECRET_ACCESS_KEY` | R2 secret | add |
| `R2_BUCKET` | R2 bucket name | add |
| `NODE_ENV` | `production` | yes |
| `PORT` | `3000` | yes |

---

## 6. RULES OF ENGAGEMENT FOR YOU (THE AI ENGINEER)

When working on this codebase you will follow these rules without being reminded.

1. **Read before you write.** Before editing any file, read the whole file. Before editing any function, grep for every caller of it.
2. **Small commits, descriptive messages.** One logical change per commit. Conventional Commits format: `feat(scheduler): move cron to BullMQ worker`. Push to `main` after every commit unless the user said otherwise.
3. **Never delete the Consultant copy.** If you refactor `orator-content.js`, the exact strings must round-trip identically. Add a snapshot test that proves it.
4. **Never weaken security to make tests pass.** If a test relies on admin password being plaintext, fix the test, not the code.
5. **Never invent product copy.** If you need new user-facing copy and don't have an exact spec, write `// TODO copy review` and leave a placeholder — do not improvise in The Consultant's voice. The bar is too high for guessing.
6. **Write the test first.** Vitest is the chosen runner. Every new function ships with a test. Every bug fix ships with a regression test.
7. **No `console.log` for new code.** Use the existing logger pattern, or introduce a tiny `lib/log.js` that wraps console with a level and a tag.
8. **Stay in scope.** If you find a problem outside the current task, add it to `BACKLOG.md` instead of expanding the diff.
9. **Stop and ask only when blocked by a real decision** (e.g. "which DB provider?"). Otherwise: decide, document the decision in `DECISIONS.md`, keep moving.
10. **Run the full smoke test** (`npm run smoke`) before every commit. If it fails, fix it before committing.

---

## 7. DEFINITION OF DONE (PER FEATURE)

A feature is "done" only when ALL of these are true:

- [ ] Code merged to `main`.
- [ ] Unit tests pass (`npm test`).
- [ ] Smoke test passes (`npm run smoke`).
- [ ] Server boots cleanly with the current `.env` (no warnings about missing keys).
- [ ] `/health` returns 200 with the feature listed as `configured: true`.
- [ ] An entry is appended to `DECISIONS.md` explaining what changed and why.
- [ ] `BACKLOG.md` is updated (item moved from "todo" to "done", or removed).
- [ ] If user-facing: a manual happy-path run-through is documented in the PR description.

---

## 8. NORTH-STAR METRICS (REPORT THESE WEEKLY)

| Metric | Definition | Target Week 1 | Target Month 1 |
|---|---|---|---|
| Enrolments | POST /api/enroll success count | 100 | 5,000 |
| D1 Start rate | users who reply START NOW / enrolments | 60% | 70% |
| D7 Completion rate | users who finished Day 7 / D1 starts | 40% | 55% |
| Trial → Paid | CONTINUE conversions / D7 completions | 8% | 15% |
| MRR | active subscriptions × ARPU | ₹6,000 | ₹4,00,000 |
| WhatsApp deliverability | Wati `delivered` / `sent` | 95% | 98% |

Surface these on `/admin` — the founder should see them on the dashboard, not in console logs.

---

End of CLAUDE.md. Keep this file under 400 lines. Update it when architecture changes.
