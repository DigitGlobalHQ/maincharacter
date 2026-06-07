# Aura Scoring Audit — is it Gemini, or a fallback?

**Date:** 2026-06-07
**Trigger:** Founder observed two different people getting near-identical Aura Scores.
**Verdict:** The symptom is real and explainable. The engine **is architected** to produce
fully personalised, face-based readings from Gemini Vision — but a **quiz-only fallback**
is being returned, and that fallback gives nearly the same score to everyone. **You are
seeing the fallback, not real Gemini readings.**

---

## 1. How a reading is *supposed* to work (and does, when Gemini runs)

```
/lookmaxing/quiz   → stores the quiz answers on the audit session
/lookmaxing/capture→ stores the photo (base64 + R2 key) on the session
/lookmaxing/analyze→ _callGemini(answers, photoBuffer):
                       buildAuditPrompt(answers, hasPhoto)  +  the photo as inlineData
                       → Gemini 2.5 Flash Vision → JSON: auraScore, freeSignals,
                         vectors (24 metrics), decomposition, quests, style/colour,
                         90-day plan, projection…  → sanitised → stored → shown
```

The photo **is** sent to Gemini (`routes/lookmaxing.js:401-403`, `inlineData` base64). The prompt
**is** built from the quiz answers (`buildAuditPrompt`). So when Gemini actually runs, every
number — the free pre-₹99 signals/KPIs **and** the full ₹99 Blueprint — is generated from
*that person's face + that person's answers*. That part is correct.

## 2. Why two people get the same score — the fallback

`_callGemini` returns `_fallbackReport(quizAnswers)` instead of calling Gemini in four cases
(`routes/lookmaxing.js`):

| # | Condition | Meaning |
|---|---|---|
| 1 | prompts module missing | infra issue (rare) |
| 2 | **`!_geminiModel`** | **`GEMINI_API_KEY` unset / invalid / failed to init** |
| 3 | rate-limited (>10 calls/min) | transient |
| 4 | **both Gemini attempts fail** | configured key, but call/parse failed (truncation, safety-block, outage) |

**The fallback ignores the face entirely.** It is `buildFallbackReport(answers)` in
`data/lookmaxing-audit-prompts.js`. Almost every one of its 24 metric scores is a **hardcoded
constant** (5.5, 5.8, 6.5, 7.0, 6.8 …). Only **three** values shift, and only off quiz booleans:

```
skinFloor = oily ? 5.4 : (dry ? 5.6 : 6.0)
eyeFloor  = lowSleep ? 4.8 : 6.0
postFloor = posture ? 4.8 : 5.8
```

The global score is the **average of those mostly-constant metrics**, so the Aura Score lands in
a narrow ~55-62 band for *everybody*, moving only if a person ticks "oily skin", "poor sleep", or
"bad posture". Two different faces → essentially the same number. **This is exactly your symptom.**

## 3. The bug that hides it

The code comment at `_callGemini` claims: *"When the model IS configured, a genuine failure
throws — the caller surfaces it as an honest 502."* The code did **not** do that — on a configured
key it **silently returned the fabricated fallback** (so a real user with a working key but a flaky
call still got a fake-looking reading, and you'd never know). Fixed in this change (see §5).

## 4. The one diagnostic that tells you which is happening

Open **`/health`** and read `config`:

- **`geminiKey`** — the live key-validity probe. Expected values and what they mean:
  - `ok` → key works. If you still see identical scores, the calls are *failing after connecting*
    (case 4 — truncation/safety). Check logs for `CONFIGURED key but call failed twice`.
  - `unconfigured` → **`GEMINI_API_KEY` is not set in Render.** Every reading is the fallback. ← most likely.
  - `invalid_key` / `leaked` → key is present but rejected/revoked. Every reading is the fallback. **Rotate it.**
  - `rate_limited` → temporary.
- **`auraEngine`** (added in this change) — `{ gemini, fallback, lastFallbackReason, lastFallbackAt }`.
  Run a couple of real readings, then refresh `/health`. If `gemini` stays `0` and `fallback`
  climbs, **100% of readings are the quiz-only fallback**, and `lastFallbackReason` says why
  (`gemini_not_configured` / `gemini_call_failed` / `rate_limited`).

## 5. What this change does (safe, additive — no behaviour change by default)

- **Visibility:** counts genuine-Gemini vs fallback readings and surfaces them on
  `/health.config.auraEngine`, with the reason for the last fallback.
- **Loud logging:** a configured-key fallback now logs at ERROR (`CONFIGURED key but call failed…`)
  and a missing model logs `NO Gemini model … reading is quiz-only fallback`.
- **Honesty switch (opt-in):** `AUDIT_STRICT_GEMINI=true` makes a configured-key failure return an
  honest **502 (retry)** instead of a fabricated reading — matching your "Gemini-only" intent.
  **Left OFF by default** so that, if the key is the problem, the funnel degrades rather than
  dead-ends before you've fixed the key.

## 6. What you need to do (in order)

1. **Check `/health`** → `config.geminiKey` and `config.auraEngine`.
2. If `unconfigured` / `invalid_key` / `leaked`: **set/rotate a valid `GEMINI_API_KEY`** in Render.
   (Reminder from CLAUDE.md §4: `.env` is committed — rotate the key and keep prod keys only in
   Render env, never in the repo.) This single fix turns on real, face-personalised readings for
   everything — score, free signals/KPIs, and the full ₹99 Blueprint.
3. Once `geminiKey: ok` and `auraEngine.gemini` is climbing on real runs, set
   **`AUDIT_STRICT_GEMINI=true`** so any future failure surfaces honestly instead of silently
   faking a reading.

## 7. Not yet verified (needs your eyes / a live key)

- The *quality/variance* of real Gemini scores across faces (I cannot run a live key here).
  Once `geminiKey: ok`, run 2-3 visibly different faces and confirm the scores and the 24-metric
  breakdowns genuinely differ. If they come back *too* similar even on real Gemini, that's a prompt
  calibration task (owned by the gemini-prompt-engineer) — separate from this fallback issue.

---

# ADDENDUM — every AI surface, not just the ₹99 audit (2026-06-07)

Founder asked: is the **Daily Mirror** and the **suggested to-do tasks** also Gemini? Full map:

| Surface | Engine | Falls back to | Verify on /health |
|---|---|---|---|
| ₹99 Audit: Aura Score, free signals/KPIs, full Blueprint, diagnosis prose | **Gemini Vision** (`routes/lookmaxing.js` `_callGemini`) | near-static quiz-only `buildFallbackReport` | `config.auraEngine` |
| Audit **interventions/quests** (the tasks inside the report) | **Gemini**, but constrained at the prompt to the **safe-task allow-list** (`AUDIT_SAFE_TASK_LIBRARY` — "the ONLY tasks the model may assign") | safe-library tasks | `config.auraEngine` |
| **Daily Mirror score** (PWA selfie) | **Gemini Vision** (`services/vision.js` `scoreMirror`) | deterministic `fallbackMirrorScores` (hugs the baseline → no real movement) | `config.mirrorEngine` |
| PWA baseline / weekly aesthetic score | **Gemini Vision** (`vision.scoreAesthetic`) | deterministic `fallbackAesthetic` | `config.mirrorEngine` |
| Mirror "Consultant line" prose | **Gemini** (`vision.consultantLine`) | deterministic line | — |
| **Daily protocol / to-do tasks (PWA checklist)** | **NOT Gemini.** `services/protocol.js` + `services/trigger-engine.js` pick from a **static curated library** (`PROTOCOL_LIBRARY`, `SAFE_TASK_LIBRARY`) based on the user's Gemini-scored weak axes | n/a (always library) | — |
| Orator reply scoring (pillar "coming soon") | Gemini (`services/gemini.js`) | fallback | — |

## The two things that matter

1. **The SCORES (audit + mirror + weekly) are all Gemini Vision** — and **all** of them fall back to a deterministic non-Gemini score when `GEMINI_API_KEY` is unset/invalid. So the **single root fix is the same**: a valid key turns on real, per-face readings for the audit AND the daily mirror. `config.auraEngine` + `config.mirrorEngine` let you confirm both (gemini climbing, fallback flat).

2. **The daily TO-DO TASKS are deliberately NOT free-generated by Gemini.** They are selected from a **vetted safe-task library** based on what Gemini found weak. This is a **safety guardrail**: an LLM freely writing physical/aesthetic "do this" instructions can produce harmful advice (doses, extreme measures, surgery, unverified agents) — a real liability and app-store-policy risk for a face/body product. So the design is: **Gemini decides WHAT to work on (personalised); the safe library provides the HOW (vetted).** Even Gemini's own quests in the ₹99 report are constrained to this allow-list at the prompt level.

**Decision for the founder:** keep this model (recommended — Gemini-personalised targeting + safe vetted tasks), or have Gemini generate task wording freely (more "Gemini", but removes the safety guardrail). This is a product+liability call, not a bug.
