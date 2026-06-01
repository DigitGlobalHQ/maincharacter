# Lookmaxxing Audit Funnel — Fixes & Production-Readiness (2026-06-01)

Findings and fixes from a live end-to-end run of the audit funnel with a real photo
through production Gemini. Read top to bottom; the **You must do** section is the
only part that needs a human.

---

## TL;DR

- The funnel was **dead for every user** at the photo step (JS crash) and the
  reading engine **failed ~2 of 3 times** (Gemini truncation). Both are now **fixed in code**.
- Production Gemini is **live and safe**: it produced a real, face-specific reading,
  dignified and correctly scoped (unchangeable traits kept as context, never scored).
- The **₹99 checkout cannot complete** even in test mode (fails across card / netbanking / UPI).
  This is a **Razorpay dashboard/account** problem, not code — it blocks revenue and the
  premium-safety check.
- Nothing here is deployed yet. **You** push to deploy and fix the Razorpay dashboard.

---

## What changed (code — already written to your files)

### 1. Capture → analyze crash  ·  `public/lookmaxing/capture.html`
**Symptom:** Clicking *Upload and Analyze* did nothing; console threw
`TypeError: Cannot set properties of null` in `showAnalyzing()`. The upload `fetch` never ran.
**Cause:** The inline script grabbed `#analyzing-overlay` / `#analyzing-line` with
`getElementById` at load time, but that markup sits **below** the script, so both were `null`.
**Fix:** Look those elements up lazily inside `showAnalyzing()` and guard for null in
`hideAnalyzing()`. The analyze flow now runs even if the overlay is ever absent.

### 2. `/analyze` flakiness — 502 `analysis_unavailable`  ·  `routes/lookmaxing.js`
**Symptom:** `/analyze` failed ~2 of 3 times; `/photo` (upload) always succeeded.
**Cause:** `gemini-2.5-flash` spends part of its budget on hidden reasoning, so the large
audit JSON intermittently truncated mid-object → `JSON.parse` failed → 502.
**Fix:** `maxOutputTokens` 16384 → **32768** and `temperature` 0.7 → **0.3** (more compact,
deterministic output with headroom for reasoning tokens).
**NOT done (deliberately):** wiring `AUDIT_JSON_SCHEMA` into `responseSchema`. That object
uses `$schema` / `$defs` / `$ref` / `additionalProperties`, which the Gemini API rejects —
passing it as-is would make **every** call 400. See "Recommended follow-up".

### 3. Rank/score mismatch  ·  `routes/lookmaxing.js`
**Symptom:** A score of **58** displayed rank **"seeker"**, but your own thresholds say
50–69 = **"ascendant"**.
**Cause:** Gemini occasionally returns a `rank` inconsistent with `auraScore`.
**Fix:** New `_rankFromScore()` derives rank from the score server-side after parsing, so the
badge always matches the number.

---

## You must do (humans only — I can't do these from here)

### A. Deploy the code fixes
From your Mac (your local repo is at the same commit as production, so this is a clean push):
```
cd ~/Desktop/MainComponent
npm test          # verify nothing broke (per your Definition of Done)
npm run smoke
git add public/lookmaxing/capture.html routes/lookmaxing.js
git commit -m "fix(lookmaxing): unblock capture→analyze; reduce /analyze truncation; derive rank from score"
git push origin main
```
Render auto-deploys on push (~2–3 min + cold start). Confirm at `/health` that
`config.geminiKey` is still `"ok"` and `lookmaxxing.version` shows the new commit.

### B. Fix Razorpay (revenue tripwire is currently broken)
In **test mode**, the ₹99 checkout failed on cards ("International cards are not supported"),
netbanking, and UPI. The order is created correctly (₹99 / INR / `rzp_test_*` key) and the
frontend wiring is correct — so this is **account configuration**:
1. **Razorpay Dashboard → Settings → Payment Methods (Test mode):** enable Cards (incl.
   domestic test cards), Netbanking, and UPI. Use Razorpay's documented test instruments
   (e.g. test UPI `success@razorpay`, the domestic test card from Razorpay's docs — the
   generic `4111…` is treated as international and rejected by a domestic-only account).
2. **Webhook (critical for unlock):** the audit unlocks **only** when Razorpay fires
   `payment.captured` to `POST /api/lookmaxing/pay/webhook`. In **Dashboard → Settings →
   Webhooks**, add that URL, subscribe to `payment.captured`, and set the secret to match
   `RAZORPAY_WEBHOOK_SECRET` in Render. Without this, a successful payment will **not** flip
   the reading to paid.
3. **Before go-live:** complete KYC, switch to `rzp_live_*` keys, and decide whether to
   enable international cards (otherwise non-Indian customers can't pay).

### C. Finish the premium safety check (still open)
The deep surface — **quests, biggest lever, 7-day plan** — is where medical advice leaked
historically. It's gated behind payment, so it stays unaudited until **B** is fixed.
Once a test payment unlocks a reading, re-open it and confirm those blocks contain **no**
medication/supplement/procedure/dosage content and no shaming tone. (The design is sound —
see below — but a live prose sample is the real gate.)

---

## What we verified is GOOD

- **Gemini key:** `/health` → `geminiKey: "ok"` (live, not the leaked/revoked one).
- **Real reading produced** (not the fallback template): score 58, face shape "rectangular",
  a face-specific first impression, real observational context.
- **Free-view safety:** dignified, no shaming, no hype; bone structure / hair density /
  colouring all presented as **context, never scored** (your context-vs-quest rule held).
  Hairline recession was named as a neutral observation, not a medical prompt. Honest
  lighting caveat instead of a fake one.
- **Premium safety design** (static review): the prompt enforces a bounded safe-task
  allow-list and explicitly bans the exact historical leaks — medication names/dosages,
  supplements (biotin/collagen/finasteride), cosmetic procedures, and shaming of unchangeable
  traits — and the server-side validator scrubs the **full** report, replacing violations with
  "This is one for a qualified professional."

---

## Recommended follow-ups (not blocking, do with live testing)

1. **Gemini-compatible `responseSchema`.** Convert `AUDIT_JSON_SCHEMA` to Gemini's dialect
   (drop `$schema`/`$defs`/`$ref`/`additionalProperties`; inline `decompositionItem`; the
   free-form `context` object can't be schema-constrained — relax it). Then pass it as
   `generationConfig.responseSchema`. This makes `/analyze` near-bulletproof. Ship it only
   with a live re-test, since a malformed schema 400s every call.
2. **UPI ID entry** wasn't offered in checkout (QR only) — revisit once methods are enabled.
3. **Confirm the `/analyze` fix worked** by re-running several readings after deploy and
   watching the 502 rate drop (I can drive this once it's live).

## Out of scope here (separate projects — see CLAUDE.md §4)

Postgres durability on Render free tier, scheduler sleep, `.env` key rotation, admin-password
hardening. These are real but unrelated to this funnel fix and need their own work + your sign-off.

---

## Verification runbook (after you deploy + fix Razorpay)

1. `/health` → `geminiKey: "ok"`, new `lookmaxxing.version`.
2. Funnel via the real UI: sign in → quiz → **upload a photo and click Upload and Analyze**
   (should no longer hang) → reading renders.
3. Run `/analyze` a handful of times → 502s should be rare/gone.
4. Pay ₹99 with a Razorpay test instrument → reading unlocks → audit the premium blocks for
   safety + tone.
5. Score badge matches the number (rank derived from score).
