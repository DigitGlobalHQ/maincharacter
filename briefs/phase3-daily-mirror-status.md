# Phase 3 — Daily Mirror: status + remaining-build spec (2026-05-30)

## What already exists and is SAFE (verified)

The Daily Mirror loop is built and now runs every surfaced task through the
Phase 1 safety validator. Mapping to the dispatch:

| Dispatch item | Status | Where |
|---|---|---|
| 3.1 Daily scan → score (state) + "why it moved" + ONE safe task | ✅ exists | `routes/lookmax.js POST /mirror` → `vision.scoreAesthetic` (state axes) + `deltaVsYesterday` + `vision.consultantLine`; task from `services/protocol.js` (validator-gated) |
| 3.4 Weekly weigh-in → Trajectory | ✅ exists | `routes/reaudit.js` (re-audit + delta + trajectory), `services/protocol.regenerateWeekly` |
| 3.5 Time-lapse / before-after, streaks | ✅ exists | `services/video.js` + `/reveal/*`; `streak` in the mirror response |
| 3.6 Day-7 trial → paid (TEST mode) | ✅ exists | `/lookmaxing/fork` → Razorpay test subscribe |
| 3.7 Safety: state-only scan, safe tasks, validator | ✅ done (Phase 1) | `lib/safety-validator.js` wired into protocol + mirror paths |

The mirror scan scores **state** axes only and never bone structure (the audit
engine enforces context-vs-quest; the Sharpness/daily read is distinct from the
slow Aura Score per `data/lookmaxing-audit-prompts.js`).

## Genuine gaps (NOT yet built) — ready-to-build spec

### 3.2 Night Log (sleep / water / salt-alcohol) → powers tomorrow's delta
A self-contained vertical slice. No medical content; passes the validator trivially.

- **Model** (`models/Lookmax.js`): init `nightLogs: []` in `bucket()`. Add
  `addNightLog(userId, {sleepHours, waterGlasses, saltAlcoholFlag, notes})`
  (upsert per IST date), `nightLogForDate(userId, date)`, `nightLogForToday`.
  Clamp: sleepHours 0–14, waterGlasses 0–15, saltAlcoholFlag boolean,
  notes ≤ 280 chars.
- **Routes** (`routes/lookmax.js`, auth-guarded): `POST /night-log` (save),
  `GET /night-log/today`. Wire into `POST /mirror`: read YESTERDAY's night log
  and add `nightContext` to the response — a deterministic, Consultant-voice,
  validator-clean line, e.g. *"Last night's salt and drink tend to show as
  morning puffiness. Today's read carries that."* (no health claims).
- **UI** (`public/lookmax/mirror.html`): a small card under the day's read —
  sleep hours (stepper), water (stepper), a single "salt / alcohol last night"
  toggle, Save. On-theme (obsidian + gold). Shows tonight's log if present.
- **Tests** (`tests/lookmax-nightlog.test.js`): upsert idempotency per date,
  clamping, auth 401, and that `nightContext` appears in the next mirror read.

### 3.3 Trigger engine (low-signal → safe-task → report-back, with streak targets)
The doc's explicit eye/under-eye, skin, puffiness/jaw, posture/shoulders
mappings. Today the protocol generator already weights tasks toward the two
weakest axes; the gap is the **explicit per-trigger streak target + report-back
loop**. Build as a `services/trigger-engine.js` table keyed by weak axis →
{ safeTask, streakTargetDays, reportBackPrompt }, all tasks drawn from the
`SAFE_TASK_LIBRARY` so they pass the validator by construction. Surface the
streak target on the protocol card and mark the trigger "answered" when the
mirror delta for that axis turns positive across the target window.

**Why staged, not half-shipped:** both touch model + routes + UI + tests and must
be verified on live. They are specced to drop in cleanly on top of the existing,
now-safe loop without rewrites. The core Daily Mirror is live and safe today.
