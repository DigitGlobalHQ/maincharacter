# Claude Code (web / phone) — working handoff for MainCharacter

**Last updated: 2026-06-01.** Captured from a live debugging + safety-audit session.

## How to use this file
You are most likely a **Claude Code on the web** session launched from the founder's
phone. **Read `CLAUDE.md` first** — it is the source of truth (product, brand voice,
architecture, rules of engagement). This file is the *current-state snapshot* and the
*specific open work* layered on top of it.

## Product in one line
The LIVE product is the **Lookmaxxing web audit funnel** at
`maincharacter.digitglobalservices.com/lookmaxing`: sign in → 5-question quiz → photo →
free Gemini "reading" → ₹99 unlock → premium reading → 7-day trial. Brand voice
(CLAUDE.md §2) and safety (CLAUDE.md §5) are **non-negotiable**.

## Deploy model — READ THIS
- Render **auto-deploys on push to `main`**. A merged PR is **live in production
  immediately** — there is no staging gate. **Review every diff before merging.**
- The cloud sandbox has **no production secrets** (Gemini / Razorpay keys live in Render's
  env). You can edit and push, but you **cannot fully run the live app or end-to-end test
  a real Gemini reading** from the sandbox. Spot-check on the live site after deploy.
- Phone flow: prompt → Claude edits in a sandbox + opens a **PR** → review on your phone →
  **merge** → Render deploys → live. Keep each PR to one logical change.

## Current state (2026-06-01)

**Verified working live this session:**
- Production Gemini key is healthy (`/health` → `config.geminiKey: "ok"`). It produces a
  **real, face-specific, safe, on-brand** reading. Free-view confirmed: dignified, no
  shaming; bone structure / hair / colouring kept as *context, never scored*.
- The resolution gate works (premium fields correctly stripped from the free view).

**Fixed in code, PENDING DEPLOY** (see `AUDIT_FUNNEL_FIXES.md` for full detail):
1. `public/lookmaxing/capture.html` — capture→analyze crash (`showAnalyzing` null ref). The
   funnel was **dead for every user** at the photo step. Now a lazy, guarded lookup.
2. `routes/lookmaxing.js` — `/analyze` truncation 502s (~2 of 3 calls). Raised
   `maxOutputTokens` 16384→32768, `temperature` 0.7→0.3.
3. `routes/lookmaxing.js` — rank/score mismatch. New `_rankFromScore()` derives rank from
   the score so the badge matches the number.

**Open work, priority order:**
1. **Razorpay (revenue + blocks the premium safety audit).** The ₹99 checkout fails across
   card / netbanking / UPI in test mode. This is **dashboard/account config, not code**:
   enable test payment methods, and configure the webhook (`POST /api/lookmaxing/pay/webhook`
   with a secret matching `RAZORPAY_WEBHOOK_SECRET`) — without it, a paid session never
   flips. For go-live: complete KYC + switch to `rzp_live_*` keys.
2. **Premium safety audit (still open).** The premium blocks — `quests`, `biggestLever`,
   `starterPlan` — are gated behind payment and have **not** been reviewed live. Once
   payment works, unlock a reading and confirm **no** medication/supplement/procedure/dosage
   content and no shaming tone. The design is sound (allow-list + hard bans + server
   validator in `lib/safety-validator.js`), but the live prose is unverified.
3. **`responseSchema` follow-up.** `AUDIT_JSON_SCHEMA` can't be passed to Gemini as-is (it
   uses `$schema`/`$defs`/`$ref`/`additionalProperties`, which Gemini rejects → 400 on every
   call). Convert it to Gemini's schema dialect and **live-test** before shipping.

## Non-negotiables (from CLAUDE.md — never violate)
- **Safety (§5):** only health-positive habit advice (sleep, hydration, generic skincare,
  posture, grooming geometry, haircut, wardrobe colour). **NEVER** medications, supplements,
  dosages, procedures, or prescriptive dieting. Route real distress to a qualified
  professional. Enforced at two layers (Gemini prompt allow-list + `lib/safety-validator.js`).
- **Brand voice (§2):** The Consultant — dignified, restrained, no hype, no emojis except
  `◆`, no exclamation marks, no shaming.
- **Never commit** secrets, real user photos, or PII. `.gitignore` now blocks `IMG_*`,
  `data/*.jsonl`, and `data/audit-sessions-v2.json`.
- **Verify on LIVE, not just tests.** The recurring failure mode here is "tests pass, live
  is broken." Read the Render server logs when diagnosing.

## Key files
`routes/lookmaxing.js` (audit API: quiz/photo/analyze/pay), `public/lookmaxing/*` (funnel UI),
`data/lookmaxing-audit-prompts.js` (prompt + safe-task allow-list + `AUDIT_JSON_SCHEMA`),
`lib/safety-validator.js` (the safety backstop), `/health` (status + `geminiKey`), `/admin`.
