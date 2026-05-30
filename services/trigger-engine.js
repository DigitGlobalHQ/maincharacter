/**
 * ═══════════════════════════════════════════════════════════════════
 * TRIGGER ENGINE — low-signal → safe-task → report-back (Phase 3.3, 2026-05-30)
 * ═══════════════════════════════════════════════════════════════════
 *
 * The doc's retention loop (Pillar2_Daily_Mirror): when a state axis reads low,
 * give the user ONE safe task, a streak target, and a report-back moment. The
 * trigger is "answered" when the mirror delta for that axis turns positive over
 * the target window.
 *
 * SAFETY: every task here is pulled from lib/safety-validator SAFE_TASK_LIBRARY,
 * so triggers pass the validator BY CONSTRUCTION — there is no path to surface a
 * medical/pharmacological task through this engine. A self-test at module load
 * asserts that invariant and throws if a future edit breaks it.
 */

const { SAFE_TASK_LIBRARY, isSafe } = require('../lib/safety-validator');

// Pick a known-safe task by bucket + index (kept explicit for readability).
const t = (bucket, i = 0) => SAFE_TASK_LIBRARY[bucket][i];

/**
 * Trigger table keyed by the changeable axis that reads low. Context-only axes
 * (facialHarmony, native hairDensity, etc.) intentionally have NO trigger — they
 * are never tasked (context-vs-quest, user-metrices.docx).
 * Each: { id, axis, signal, task:{title,instruction}, streakTargetDays, reportBack }.
 */
const TRIGGERS = {
  eyeArea: {
    id: 'eye',
    axis: 'eyeArea',
    signal: 'under-eye / tired eyes',
    task: t('lifestyle', 0), // Sleep 7-8 hours
    streakTargetDays: 5,
    reportBack: 'Five nights of full sleep. The eyes answer first — read it again on day six. ◆',
  },
  skinClarity: {
    id: 'skin',
    axis: 'skinClarity',
    signal: 'skin clarity',
    task: t('skin', 0), // Sunscreen, every morning
    streakTargetDays: 7,
    reportBack: 'A clean week of the basics. Skin is slow — the read will catch up. ◆',
  },
  jawDefinition: {
    id: 'jaw',
    axis: 'jawDefinition',
    signal: 'puffiness / lower face',
    task: t('jaw', 0), // Reduce evening salt and alcohol
    streakTargetDays: 4,
    reportBack: 'Four steady nights off salt and drink. The morning jawline reads sharper for it. ◆',
  },
  posture: {
    id: 'posture',
    axis: 'posture',
    signal: 'carriage / shoulders',
    task: t('posture', 0), // Two minutes of thoracic extension
    streakTargetDays: 6,
    reportBack: 'Six days resetting the carriage. Presence compounds — hold it. ◆',
  },
  bodyComposition: {
    id: 'body',
    axis: 'bodyComposition',
    signal: 'composition / leanness',
    task: t('lifestyle', 2), // Move daily
    streakTargetDays: 7,
    reportBack: 'A week of daily movement. Composition is the slowest read — keep going. ◆',
  },
  expression: {
    id: 'expression',
    axis: 'expression',
    signal: 'held / guarded expression',
    task: t('lifestyle', 0), // Sleep 7-8 hours (rest eases tension)
    streakTargetDays: 5,
    reportBack: 'Rest softens a held face. Five nights, then look again. ◆',
  },
};

// A small positive delta needed for a trigger to count as "answered".
const ANSWERED_DELTA = 2;

/**
 * Active triggers for a user's weakest changeable axes (up to `max`). Axes
 * without a trigger (context-only) are skipped.
 * @param {string[]} weakAxesOrdered weakest-first axis keys
 * @param {number} [max=2]
 * @returns {Array} trigger objects
 */
function triggersForWeakAxes(weakAxesOrdered = [], max = 2) {
  const out = [];
  for (const axis of weakAxesOrdered) {
    if (TRIGGERS[axis] && !out.find((x) => x.id === TRIGGERS[axis].id)) {
      out.push(TRIGGERS[axis]);
      if (out.length >= max) break;
    }
  }
  return out;
}

/**
 * Evaluate a trigger against the user's recent mirror history.
 * @param {object} trigger
 * @param {Array<{date:string, axes:object}>} mirrors oldest-first
 * @returns {{ streak:number, target:number, delta:number|null, answered:boolean, reportBack:string|null }}
 */
function evaluateProgress(trigger, mirrors = []) {
  const axis = trigger.axis;
  const series = mirrors
    .map((m) => (m.axes ? m.axes[axis] : undefined))
    .filter((v) => typeof v === 'number');

  // Streak: consecutive most-recent days the axis did not drop vs the prior day.
  let streak = 0;
  for (let i = series.length - 1; i > 0; i -= 1) {
    if (series[i] >= series[i - 1]) streak += 1;
    else break;
  }
  // Delta across the target window (latest vs `streakTargetDays` ago).
  let delta = null;
  if (series.length >= 2) {
    const back = Math.min(trigger.streakTargetDays, series.length - 1);
    delta = series[series.length - 1] - series[series.length - 1 - back];
  }
  const answered = delta != null && delta >= ANSWERED_DELTA;
  return {
    streak,
    target: trigger.streakTargetDays,
    delta,
    answered,
    reportBack: answered ? trigger.reportBack : null,
  };
}

/**
 * Convenience: active triggers + their progress for a user.
 * @param {string[]} weakAxesOrdered
 * @param {Array} mirrors
 * @param {number} [max=2]
 */
function triggersWithProgress(weakAxesOrdered, mirrors, max = 2) {
  return triggersForWeakAxes(weakAxesOrdered, max).map((tr) => ({
    id: tr.id,
    axis: tr.axis,
    signal: tr.signal,
    task: tr.task,
    streakTargetDays: tr.streakTargetDays,
    progress: evaluateProgress(tr, mirrors),
  }));
}

// ── Load-time safety invariant ──────────────────────────────────────────────
for (const [axis, tr] of Object.entries(TRIGGERS)) {
  const text = `${tr.task.title}\n${tr.task.instruction}\n${tr.reportBack}`;
  if (!isSafe(text)) {
    throw new Error(`trigger-engine: trigger for ${axis} is not validator-safe — refusing to load`);
  }
}

module.exports = {
  TRIGGERS,
  ANSWERED_DELTA,
  triggersForWeakAxes,
  evaluateProgress,
  triggersWithProgress,
};
