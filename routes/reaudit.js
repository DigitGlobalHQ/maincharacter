/**
 * ═══════════════════════════════════════════════════════════════════
 * REAUDIT ROUTES — Day-30 Re-Audit renewal engine (NOW-2 / B2)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mounted at /api/lookmax (same prefix as routes/lookmax.js).
 * All routes gated by requireLookmaxAuth — req.lookmaxUser is the live user.
 *
 * Pull-based — NO scheduler. The client hits /status to learn eligibility;
 * eligibility is computed fresh on every request.
 *
 * DPDPA guard: R2 photo storage keys (r2:...) MUST NEVER appear in any
 * client-facing response. Use getSignedUrl() only; strip storageKey from output.
 *
 * Approved copy (founder sign-off):
 *   - FLAT variant:  "The reading sits at Day 1. ..."
 *   - DOWN variant:  "Day 30 reads below Day 1. ..."
 *                    Held-count branching per NOW-2 §3.4b clause 4.
 *   - UP variant:    deferred — TODO copy review
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const express = require('express');
const router = express.Router();

const User    = require('../models/User');
const storage = require('../services/storage');
const events  = require('../services/events');
const { requireLookmaxAuth } = require('../lib/lookmax-auth');
const { createLogger } = require('../lib/log');

const log = createLogger('REAUDIT');

// The 8 aesthetic axes scored by Gemini Vision.
const AESTHETIC_AXES = [
  'skinClarity', 'jawDefinition', 'eyeArea', 'hairDensity',
  'posture', 'facialHarmony', 'expression', 'bodyComposition',
];

// Day-30 eligibility threshold (inclusive).
const ELIGIBLE_DAYS = 30;

// Noise tolerance for "held or rose" — axes with delta30 > -2 count as held.
const HELD_NOISE_TOLERANCE = -2;

// Delta thresholds for sign classification.
const FLAT_LOWER = -3; // inclusive
const FLAT_UPPER =  3; // exclusive — so [−3, +3) is flat

// All routes require Lookmaxxing auth.
router.use(requireLookmaxAuth);

// ══════════════════════════════════════════════════════════════════
// PURE HELPERS — exported for unit tests
// ══════════════════════════════════════════════════════════════════

/**
 * Compute per-axis deltas: day30Scores[axis] - baselineScores[axis].
 * Returns an object keyed by each of the 8 AESTHETIC_AXES.
 * @param {object} baselineScores
 * @param {object} day30Scores
 * @returns {object}
 */
function computeDeltas(baselineScores, day30Scores) {
  const out = {};
  for (const axis of AESTHETIC_AXES) {
    out[axis] = (Number(day30Scores[axis]) || 0) - (Number(baselineScores[axis]) || 0);
  }
  return out;
}

/**
 * Compute the overall score: mean of the 8 axes, rounded to integer.
 * @param {object} scores
 * @returns {number}
 */
function computeOverall(scores) {
  const vals = AESTHETIC_AXES.map((a) => Number(scores[a]) || 0);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/**
 * Mirror Level from an average 0-100 score (CLAUDE.md Mirror Levels ladder).
 * @param {number} score
 * @returns {'raw'|'polished'|'magnetic'|'radiant'|'sovereign'}
 */
function mirrorLevelFor(score) {
  if (score >= 90) return 'sovereign';
  if (score >= 75) return 'radiant';
  if (score >= 60) return 'magnetic';
  if (score >= 40) return 'polished';
  return 'raw';
}

/**
 * Count axes that "held or rose" — delta > HELD_NOISE_TOLERANCE (-2).
 * Used for DOWN-variant held-count branching per NOW-2 §3.4b clause 4.
 * @param {object} deltas
 * @returns {number}
 */
function computeHeldCount(deltas) {
  return AESTHETIC_AXES.filter((a) => (deltas[a] ?? 0) > HELD_NOISE_TOLERANCE).length;
}

/**
 * Classify the overall delta as 'up', 'flat', or 'down'.
 * flat = overallDelta in [FLAT_LOWER, FLAT_UPPER) i.e. −3 to +3 exclusive.
 * @param {number} overallDelta
 * @returns {'up'|'flat'|'down'}
 */
function classifyDelta(overallDelta) {
  if (overallDelta >= FLAT_UPPER) return 'up';
  if (overallDelta >= FLAT_LOWER) return 'flat';
  return 'down';
}

/**
 * Server-side template selector for the Day-30 Consultant variant.
 * Returns { variant: 'up'|'flat'|'down', text: string }.
 *
 * Approved copy (founder sign-off 2026-05-28, NOW-2 brief §Founder-approved copy):
 *   FLAT: "The reading sits at Day 1. ..."
 *   DOWN: "Day 30 reads below Day 1. ..." with held-count branching
 *   UP:   deferred — TODO copy review
 *
 * DOWN held-count branching (NOW-2 §3.4b clause 4):
 *   Axes with delta30 > -2 count as "held or rose".
 *   heldCount >= 1 → include "The axes that held tell us the protocol held."
 *   heldCount === 0 → drop that sentence
 *
 * @param {number} overallDelta
 * @param {object} axisDeltas  { [axis]: number }
 * @returns {{ variant: string, text: string }}
 */
function selectConsultantVariant(overallDelta, axisDeltas) {
  const sign = classifyDelta(overallDelta);

  if (sign === 'up') {
    // TODO copy review — UP variant not yet approved by founder
    return {
      variant: 'up',
      text: '◆ MainCharacter', // placeholder — will be replaced by copy-consultant
    };
  }

  if (sign === 'flat') {
    // Founder-approved FLAT copy (NOW-2 brief table)
    return {
      variant: 'flat',
      text:
        'The reading sits at Day 1. Thirty days is a short measurement window for what we are measuring — the most honest read of a flat month is that the protocol held the ground while the slower axes catch up. The work continues. ◆ MainCharacter',
    };
  }

  // DOWN — held-count branching
  const heldCount = computeHeldCount(axisDeltas);

  // Founder-approved DOWN copy (NOW-2 brief table).
  // Sentence 3 ("The axes that held...") is present iff heldCount >= 1.
  const opener =
    'Day 30 reads below Day 1. Read that carefully — a single photograph carries the lighting, the morning, and the angle as much as it carries the work, and thirty days against a small unknown of those conditions can read as motion that is not there. ';

  const heldSentence =
    heldCount >= 1
      ? 'The axes that held tell us the protocol held. The axes that fell tell us the lever for the next thirty. We aim there. ◆ MainCharacter'
      : 'The axes that fell tell us the lever for the next thirty. We aim there. ◆ MainCharacter';

  return {
    variant: 'down',
    text: opener + heldSentence,
  };
}

// ══════════════════════════════════════════════════════════════════
// ELIGIBILITY HELPER
// ══════════════════════════════════════════════════════════════════

/**
 * Compute eligibility state for a user.
 * @param {object} user — the live user record from req.lookmaxUser
 * @returns {{ eligible: boolean, daysSincePayment: number, completed: boolean, baselineAvailable: boolean }}
 */
function computeEligibility(user) {
  const baselineAvailable = !!(user.lookmaxBaseline && user.lookmaxBaseline.scores);
  const completed = !!(user.reAuditCompletedThisCycle);

  let daysSincePayment = 0;
  if (user.lookmaxxingStartedAt) {
    daysSincePayment = Math.floor(
      (Date.now() - new Date(user.lookmaxxingStartedAt).getTime()) / 86400000
    );
  }

  const eligible =
    !!(user.lookmaxxingActive) &&
    daysSincePayment >= ELIGIBLE_DAYS &&
    baselineAvailable;
  // Note: completed is separate — a completed user remains eligible (they can view the result).

  return { eligible, daysSincePayment, completed, baselineAvailable };
}

// ══════════════════════════════════════════════════════════════════
// GET /api/lookmax/reaudit/status
// ══════════════════════════════════════════════════════════════════

/**
 * Pull-based eligibility check. No scheduler.
 *
 * Response: {
 *   eligible: boolean,
 *   daysSincePayment: number,
 *   completed: boolean,
 *   baselineAvailable: boolean,
 *   reAuditResult: object|null,   // present when completed
 * }
 */
router.get('/reaudit/status', (req, res) => {
  const user = req.lookmaxUser;
  const { eligible, daysSincePayment, completed, baselineAvailable } = computeEligibility(user);

  // KPI: fire reaudit_card_shown when eligible (dashboard shows the card).
  // Fire-and-forget per DECISIONS: never await in route handlers.
  if (eligible) {
    events.track('reaudit_card_shown', {}, user.token).catch(() => {});
  }

  res.json({
    eligible,
    daysSincePayment,
    completed,
    baselineAvailable,
    reAuditResult: user.reAuditResult || null,
  });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/lookmax/reaudit/submit
// ══════════════════════════════════════════════════════════════════

/**
 * Accept re-audit scores (8-axis object from the audit funnel's /analyze
 * response, relayed here after the user completes the re-audit flow).
 *
 * Idempotent: re-runs overwrite the previous reAuditResult.
 *
 * Body: { scores: { skinClarity, jawDefinition, ...(8 axes) } }
 *
 * Response: {
 *   deltas: { [axis]: number },
 *   overallDelta: number,
 *   mirrorLevel: string,
 *   deltaSign: 'up'|'flat'|'down',
 *   heldCount: number,
 *   completedAt: string,
 * }
 */
router.post('/reaudit/submit', async (req, res) => {
  const user = req.lookmaxUser;
  const { scores } = req.body || {};

  if (!scores || typeof scores !== 'object') {
    return res.status(400).json({ error: 'scores object required' });
  }

  const baseline = user.lookmaxBaseline;
  if (!baseline || !baseline.scores) {
    return res.status(409).json({ error: 'baseline not available — cannot compute re-audit deltas' });
  }

  const { eligible } = computeEligibility(user);
  if (!eligible && !user.reAuditCompletedThisCycle) {
    // Allow re-submission if already completed (idempotent overwrite).
    return res.status(409).json({ error: 'not eligible for Day-30 re-audit yet' });
  }

  // Compute
  const deltas       = computeDeltas(baseline.scores, scores);
  const overall      = computeOverall(scores);
  const overallDelta = overall - computeOverall(baseline.scores);
  const deltaSign    = classifyDelta(overallDelta);
  const heldCount    = computeHeldCount(deltas);
  const level        = mirrorLevelFor(overall);
  const completedAt  = new Date().toISOString();

  // Persist (idempotent — re-runs overwrite)
  const result = { scores, deltas, overallDelta, mirrorLevel: level, completedAt };
  await User.updateUser(user.phone, {
    reAuditResult: result,
    reAuditCompletedThisCycle: true,
    mirrorLevel: level,
  });

  // KPI: fire re_audit_started (when they submit, they've started)
  events.track('reaudit_started', { daysSincePayment: Math.floor(
    user.lookmaxxingStartedAt
      ? (Date.now() - new Date(user.lookmaxxingStartedAt).getTime()) / 86400000
      : 0
  ) }, user.token).catch(() => {});

  // KPI: fire reaudit_completed
  events.track('reaudit_completed', {
    deltaSign,
    overallDelta,
    heldCount,
  }, user.token).catch(() => {});

  log.info('SUBMIT', `re-audit complete for ${user.token}: delta=${overallDelta}, sign=${deltaSign}, heldCount=${heldCount}`);

  res.json({ deltas, overallDelta, mirrorLevel: level, deltaSign, heldCount, completedAt });
});

// ══════════════════════════════════════════════════════════════════
// GET /api/lookmax/reaudit/result
// ══════════════════════════════════════════════════════════════════

/**
 * Returns baseline + Day-30 scores with per-axis deltas + Mirror Level +
 * the selected Consultant variant string.
 * Photos returned as signed R2 URLs (TTL 900s); null when R2 not configured.
 * DPDPA: raw R2 storage keys are stripped from all output.
 *
 * Response shape: {
 *   baselineOverall: number,
 *   day30Overall: number,
 *   overallDelta: number,
 *   deltaSign: 'up'|'flat'|'down',
 *   axisDeltas: { [axis]: number },
 *   baselineAxisScores: { [axis]: number },
 *   day30AxisScores: { [axis]: number },
 *   mirrorLevel: string,
 *   heldCount: number,
 *   consultantLine: string,
 *   variant: 'up'|'flat'|'down',
 *   baselinePhotoUrl: string|null,   // signed R2 URL, null if not configured
 *   day30PhotoUrl: string|null,      // signed R2 URL, null if not configured
 *   baselineScores: number,          // alias for baselineOverall (client compatibility)
 *   day30Scores: number,             // alias for day30Overall
 * }
 */
router.get('/reaudit/result', async (req, res) => {
  const user = req.lookmaxUser;

  if (!user.reAuditResult) {
    return res.status(404).json({ error: 're-audit not yet completed' });
  }

  const baseline = user.lookmaxBaseline;
  if (!baseline || !baseline.scores) {
    return res.status(409).json({ error: 'baseline data unavailable' });
  }

  const result       = user.reAuditResult;
  const deltas       = result.deltas || computeDeltas(baseline.scores, result.scores);
  const baselineOverall = computeOverall(baseline.scores);
  const day30Overall    = computeOverall(result.scores);
  const overallDelta    = result.overallDelta ?? (day30Overall - baselineOverall);
  const deltaSign       = classifyDelta(overallDelta);
  const heldCount       = computeHeldCount(deltas);
  const { variant, text: consultantLine } = selectConsultantVariant(overallDelta, deltas);

  // Signed R2 URLs for photos — null when R2 is not configured.
  // DPDPA: the raw storageKey is never exposed in the response.
  let baselinePhotoUrl = null;
  let day30PhotoUrl    = null;

  try {
    if (baseline.photoStorageKeys && baseline.photoStorageKeys.front) {
      const rawKey = baseline.photoStorageKeys.front;
      // Strip the 'r2:' prefix to get the bare R2 key for getSignedUrl.
      const r2Key = rawKey.startsWith('r2:') ? rawKey.slice('r2:'.length) : rawKey;
      baselinePhotoUrl = await storage.getSignedUrl(r2Key, 900);
    }
  } catch (err) {
    log.warn('SIGNED-URL', `baseline photo URL failed: ${err.message}`);
  }

  // Day-30 photo: stored in the user's daily mirror for their re-audit date.
  // For v1, day30PhotoUrl is null — the re-audit funnel does not yet store a
  // distinct Day-30 photo path separate from daily mirrors.
  // TODO: wire Day-30 photo storage key when the re-audit funnel captures it.
  day30PhotoUrl = null;

  // KPI: fire reaudit_reveal_viewed
  events.track('reaudit_reveal_viewed', {}, user.token).catch(() => {});

  // Strip all internal keys (storageKey, photoStorageKeys) from output.
  res.json({
    baselineOverall,
    day30Overall,
    overallDelta,
    deltaSign,
    axisDeltas: deltas,
    baselineAxisScores: baseline.scores,
    day30AxisScores: result.scores,
    mirrorLevel: result.mirrorLevel || mirrorLevelFor(day30Overall),
    heldCount,
    consultantLine,
    variant,
    baselinePhotoUrl,
    day30PhotoUrl,
    // Aliases for client compatibility with the reveal.html data contract
    baselineScores: baselineOverall,
    day30Scores:    day30Overall,
  });
});

// ══════════════════════════════════════════════════════════════════
// Exports — pure functions exported for tests
// ══════════════════════════════════════════════════════════════════

module.exports = router;
module.exports.computeDeltas          = computeDeltas;
module.exports.computeOverall         = computeOverall;
module.exports.mirrorLevelFor         = mirrorLevelFor;
module.exports.computeHeldCount       = computeHeldCount;
module.exports.classifyDelta          = classifyDelta;
module.exports.selectConsultantVariant = selectConsultantVariant;
