# CLAUDE.md — MainCharacter project context

> This file is auto-read by Claude Code on every session. It is the source of truth for **what this product is, what voice it speaks in, and what you (the AI engineer) are allowed to change.** Read it once at the start of every session.

> **➡️ START HERE:** before doing anything, also read **`CLAUDE_CODE_HANDOFF.md`** (dated current-state snapshot + open work) and **`AUDIT_FUNNEL_FIXES.md`**. Deploy model: merging to `main` auto-deploys to production via Render — it is live immediately, so review every diff before merging.

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
- **ONE theme, site-wide: Silver / Platinum on obsidian.** Background `--obsidian #070708`, accent silver `--silver-mid #c0c0c0` (exposed everywhere as `--gold`, kept for variable-name compatibility — the value is silver, NOT gold), ink `#f4f1ea`.
- Silver scale: `--silver-bright #e8e8e8` · `--silver-mid #c0c0c0` · `--silver-dim #8a8a8a` · `--silver-faint #5a5a5a` · `--silver-ghost #2a2a2a`. Glows are white: `rgba(255,255,255,.18/.32/.55)`.
- Fonts: **Cormorant Garamond** (serif italic for headlines), **Sora** (sans for body).
- **No pillar accent colours.** Orator/aesthetic/sage all resolve to silver `#c0c0c0` — do NOT reintroduce gold `#e8b84b`, orange `#f0a500`, purple `#b06fd8`, or green `#3dbfa0`.
- Functional status colours are the ONLY exception (keep them): error red (`#d9…`/`#ef4444`) and admin chart/status indicators are semantic, not theme.
- Subtle grain overlay, white radial glows, generous negative space.

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
│   ├── api.js               ← /api/enroll, /api/webhook/whatsapp, /api/waitlist, /api/user/:token, /api/payment/*
│   └── admin.js             ← /api/admin/* (password-header auth)
│
├── services/
│   ├── whatsapp.js          ← Meta Cloud API: sendMessage, sendMessageSafe (1 retry), sendTemplateMessage, verifyWebhookSignature/Challenge (DRY-RUN until creds set)
│   ├── sms.js               ← MSG91: sendOtp, sendSms, generateOtp (DRY-RUN until MSG91_AUTH_KEY)
│   ├── email.js             ← Resend: sendEmail, sendPaywallReceipt, sendAuditConfirmation, sendDay7EvolutionReport (DRY-RUN until RESEND_API_KEY)
│   ├── gemini.js            ← scoreUserResponse, generateEvolutionAssessment, fallback scoring
│   ├── scheduler.js         ← node-cron every 60s + checkMissedMessages on boot
│   └── razorpay.js          ← createOrder, createSubscription, verifyPayment, verifySubscriptionPayment, verifyWebhookSignature
│   (lib/messaging-mode.js   ← shared all/allowlist/off kill-switch for WhatsApp+SMS+email)
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
`User submits form → POST /api/enroll → User.createUser → whatsapp.sendMessage(welcome) → User replies "START NOW" → /api/webhook/whatsapp → handleStartNow → whatsapp sends Day 1 morning → user replies → handleDailyResponse → gemini.scoreUserResponse → User.addScore + addChronicle → whatsapp sends evening feedback → cron sends Day N+1 next day → repeat → Day 7 → buildEvolutionReport → whatsapp + email.sendDay7EvolutionReport → razorpay subscribe → user pays → /api/payment/webhook flips oratorActive + email.sendPaywallReceipt → /payment-confirmed`

**Revenue loop closed (Night 3):** audit/paywall → `/api/payment/subscribe` → Razorpay checkout → `/payment-confirmed` (reads `/api/payment/status`); the `subscription.activated` webhook flips `oratorActive`/`lookmaxxingActive`, primes Day-1 scheduling, and fires the receipt email.

**Channels (Night 3 — Wati removed):** WhatsApp = Meta Cloud API (`services/whatsapp.js`, DORMANT/DRY-RUN until Meta creds set). SMS/OTP = MSG91 (`services/sms.js`). Email = Resend (`services/email.js`). All share `WHATSAPP_SEND_MODE` (`all`/`allowlist`/`off`, default `allowlist`). See `WHATSAPP_CLOUD_API_SETUP.md`.

---

## 4. KNOWN LANDMINES (DO NOT REINTRODUCE)

1. **`data/users.json` is wiped on every Render redeploy.** Render free-tier disk is ephemeral. Migration to Postgres is mandatory before any real user signs up.
2. **Render free tier sleeps after 15 min of no traffic.** `node-cron` dies with it. Morning messages will not fire. Either move scheduler off the web dyno, or upgrade to a paid tier with always-on instance, or use an external pinger (cron-job.org → /health every 5 min) as a stopgap.
3. **`.env` is committed to the repo.** Rotate every key (Gemini, Razorpay; Wati JWT is now dead) and add `.env` to `.gitignore` if not already.
4. **Admin password defaults to `maincharacter2026` in plaintext** and is sent via custom header. Replace with proper auth.
5. **WhatsApp number 9958533994 is in transition (Wati → Meta).** Until the founder finishes Meta Business Manager setup and pastes the `WHATSAPP_*` env vars, ALL outbound WhatsApp falls through to DRY-RUN (logged, no send) — this is expected and safe, not a bug. The incoming webhook (`/api/webhook/whatsapp`) verifies Meta's `x-hub-signature-256` once `WHATSAPP_APP_SECRET` is set (accepts unsigned + warns until then). Razorpay's webhook signature verifier IS wired (`/api/payment/webhook`).
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
| `WHATSAPP_ACCESS_TOKEN` | Meta system-user token (Cloud API send) | yes (DRY-RUN until set) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID | yes (DRY-RUN until set) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Meta WABA ID | yes |
| `WHATSAPP_APP_SECRET` | Meta app secret — verifies `x-hub-signature-256` | add (open+warn until set) |
| `WHATSAPP_VERIFY_TOKEN` | echoed in Meta's webhook GET handshake | add |
| `MSG91_AUTH_KEY` | MSG91 auth key (SMS/OTP) | add (DRY-RUN until set) |
| `MSG91_TEMPLATE_ID_OTP` | DLT-approved OTP template id | add |
| `MSG91_SENDER_ID` | 6-letter sender id (e.g. `MAINCH`) | add |
| `RESEND_API_KEY` | Resend transactional email | add (DRY-RUN until set) |
| `RESEND_FROM_EMAIL` | e.g. `consultant@maincharacter.digitglobalservices.com` | add |
| `ADMIN_PHONE` | founder's WhatsApp for alerts (with country code, no `+`) | yes |
| `ADMIN_EMAIL` | founder's email for alerts + email allowlist owner | add |
| `ADMIN_PASSWORD` | admin login | yes (rotate) |
| `RAZORPAY_KEY_ID` | live key after KYC | yes |
| `RAZORPAY_KEY_SECRET` | live secret | yes |
| `RAZORPAY_WEBHOOK_SECRET` | for webhook signature verify | yes (was empty — set it) |
| `UPGRADE_BASE_URL` | `https://maincharacter.digitglobalservices.com` | yes |
| `DATABASE_URL` | new — Postgres connection string | add |
| `REDIS_URL` | new — Upstash Redis for queue/cache | add |
| `SENTRY_DSN` | new — error monitoring | add |
| `WHATSAPP_SEND_MODE` | `all` / `allowlist` / `off` — global send guard for WhatsApp+SMS+email (defaults to `allowlist`; legacy `WATI_SEND_MODE` still read for 30 days) | yes |
| `CRON_SECRET` | shared secret for `/api/cron/tick` (external pinger). Open+warn until set — set it in prod | add |
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
| WhatsApp deliverability | Meta Cloud API `delivered` / `sent` | 95% | 98% |

Surface these on `/admin` — the founder should see them on the dashboard, not in console logs.

---

## 9. MULTI-AGENT TEAM — ORCHESTRATOR INSTRUCTIONS

When invoked as the orchestrator (main Claude session in this repo), you coordinate 17 specialized sub-agents in `.claude/agents/`. Use them to ship Lookmaxxing publicly, drive toward ₹1Cr MRR, and protect what's already built. Sub-agents inherit the rules above (sections 1-8) — brand voice, locked copy, no-rewrites, test-first, security baseline — without exception.

### The team

**Strategy & Research:**
- `growth-research-agent` — market, competitors, India aesthetic trends
- `product-audit-agent` — friction findings on existing surfaces (no rewrites)

**Build:**
- `feature-product-agent` — specs new features within existing architecture
- `design-agent` — designs within locked tokens (obsidian + gold ◆ + Cormorant + Sora)
- `backend-agent` — extends Express/Node, writes Vitest tests first
- `frontend-agent` — vanilla HTML/CSS/JS only, no frameworks
- `qa-agent` — Vitest + smoke + brand voice audit
- `copy-consultant-agent` — drafts The Consultant voice copy (founder approves all)

**Growth & Ops:**
- `growth-experiments-agent` — weekly paid + viral experiments
- `conversion-optimizer-agent` — audit→paywall→trial→paid funnel
- `retention-agent` — Day-7/30/90 cohort survival, win-back
- `community-agent` — Telegram/Discord cohorts (dormant until 200+ paid subs)

**Infrastructure:**
- `infra-cost-agent` — hosting/storage/API cost at 1K/10K/50K users (INR)
- `scale-readiness-agent` — sequences migrations by revenue threshold
- `security-compliance-agent` — DPDPA/GDPR/Razorpay/secrets/photo data

**Go-to-Market:**
- `marketing-agent` — brand-safe campaigns, PR, influencer outreach
- `international-expansion-agent` — US/UK/UAE/SEA (dormant until India MRR ≥₹15L)
- `legal-finance-agent` — GST, ToS, Privacy, unit economics drafts

### Workflow patterns

**Pattern A — "Make Lookmaxxing publicly launchable":**
product-audit → growth-research + security-compliance (parallel) → **[founder approval]** → feature-product + copy-consultant + design → **[founder approval]** → backend + frontend → qa + security-compliance → conversion-optimizer (analytics setup) → marketing + growth-experiments (prep, no spend)

**Pattern B — "Plan path to ₹1Cr MRR":**
growth-research → conversion-optimizer + retention (parallel) → infra-cost + scale-readiness (parallel) → legal-finance → synthesize to `PATH_TO_1CR.md`

**Pattern C — "Weekly growth experiment":**
growth-experiments proposes 3 ranked options → **[founder picks one]** → feature-product + design + backend ship behind feature flag → conversion-optimizer measures → win/lose/inconclusive call

### Mandatory founder-approval checkpoints

Pause and wait for the founder before:
1. Building anything (after product-audit findings are shared)
2. Writing code (after feature spec is written)
3. Flipping `PAYWALL_PUBLIC=true`
4. Flipping `WHATSAPP_SEND_MODE=all`
5. Swapping `rzp_test_*` to `rzp_live_*`
6. Any spend over ₹5,000 (ads, infra, API)
7. Publishing any user-facing copy (founder owns The Consultant voice)

### Orchestration discipline

- Don't fire all 17 agents at once. Sequential or tight parallel pairs only. Max plan usage burns fast.
- Every analysis → markdown file in the right folder (`growth/`, `infra/`, `product/`, `security/`, `retention/`, `marketing/`, etc.)
- Every code change → conventional commit, push to main, tests passing per section 6 rules
- Every non-obvious decision → `DECISIONS.md`
- Weekly digest → `WEEKLY_DIGEST_YYYY-MM-DD.md`

### Sub-agent hard rule

Every sub-agent reads CLAUDE.md (this file) first. Brand voice (section 2), landmines (section 4), and rules of engagement (section 6) override any sub-agent's own instructions. If a sub-agent's behavior contradicts sections 1-8, sections 1-8 win.

---

End of CLAUDE.md. Keep this file under 600 lines (raised from 400 to accommodate orchestrator section). Update it when architecture changes.
