/**
 * reveal-copy-constants.js
 * COPY APPROVED 2026-05-28 — see product/copy-pending-approval-2026-05-28.md
 *
 * Server-side Consultant voice template strings for the weekly reveal and
 * Day-30 re-audit. These are read by routes/lookmax.js (reveal preview endpoint)
 * and the B2 reaudit/result endpoint to supply `consultantLine` and `closeLine`
 * to the frontend. The frontend renders whatever the endpoint returns.
 *
 * Template variables:
 *   {{week}}          — week number (integer)
 *   {{leverage}}      — leverage axis human name (e.g. "Hair density")
 *   {{leverageDelta}} — numeric delta on leverage axis vs Day 1
 *   {{overall1}}      — composite score on Day 1
 *   {{overall30}}     — composite score on Day 30
 *   {{level1}}        — Mirror Level on Day 1 (e.g. "Raw")
 *   {{level30}}       — Mirror Level on Day 30 (e.g. "Polished")
 *
 * B2 coordination:
 *   The reaudit/result endpoint reads REAUDIT_* constants and applies
 *   delta-sign branching server-side. The frontend receives the final
 *   interpolated string — no template logic runs in the browser.
 *
 * Branching rule for #27 (DOWN, heldCount === 0):
 *   If no axis held or rose, drop the sentence
 *   "The axes that held tell us the protocol held."
 *   Use REAUDIT_DOWN_NO_HELD_AXES instead of REAUDIT_DOWN.
 */

'use strict';

// ── Weekly reveal — per-week Consultant beat ───────────────────────────────────

// COPY APPROVED 2026-05-28 (#19): weekly UP variant
const WEEKLY_UP = 'The line is up. Week {{week}} held.';

// COPY APPROVED 2026-05-28 (#20): weekly FLAT variant
const WEEKLY_FLAT = 'The line held flat this week. A held line is the floor we work from.';

// COPY APPROVED 2026-05-28 (#21): weekly DOWN variant
const WEEKLY_DOWN = 'The line moved down. That is data, not verdict. The protocol is the lever, and the lever has not changed. Hold the work into next week.';

// ── Day-30 re-audit Consultant strings ────────────────────────────────────────

// COPY APPROVED 2026-05-28 (#25): Day-30 UP variant
const REAUDIT_UP =
  'Your {{leverage}} was the leverage point on Day 1. It has moved +{{leverageDelta}}. ' +
  'The composite moved from {{overall1}} to {{overall30}}. ' +
  'This is not flattery. It is the measurement. Thirty more days compounds it. ◆ MainCharacter';

// COPY APPROVED 2026-05-28 (#26): Day-30 FLAT variant
const REAUDIT_FLAT =
  'The reading sits at Day 1. Thirty days is a short measurement window for what we are ' +
  'measuring. The most honest read of a flat month is that the protocol held the ground ' +
  'while the slower axes catch up. The work continues. ◆ MainCharacter';

// COPY APPROVED 2026-05-28 (#27): Day-30 DOWN variant (at least one axis held)
// "The axes that held tell us the protocol held." is included when heldCount > 0.
const REAUDIT_DOWN =
  'Day 30 reads below Day 1. Read that carefully. A single photograph carries the ' +
  'lighting, the morning, and the angle as much as it carries the work, and thirty days ' +
  'against a small unknown of those conditions can read as motion that is not there. ' +
  'The axes that held tell us the protocol held. ' +
  'The axes that fell tell us the lever for the next thirty. We aim there. ◆ MainCharacter';

// COPY APPROVED 2026-05-28 (#27 branched): Day-30 DOWN variant when heldCount === 0
// Third sentence ("The axes that held...") is dropped per brief — coordinate with B2.
const REAUDIT_DOWN_NO_HELD_AXES =
  'Day 30 reads below Day 1. Read that carefully. A single photograph carries the ' +
  'lighting, the morning, and the angle as much as it carries the work, and thirty days ' +
  'against a small unknown of those conditions can read as motion that is not there. ' +
  'The axes that fell tell us the lever for the next thirty. We aim there. ◆ MainCharacter';

// COPY APPROVED 2026-05-28 (#28): Day-30 close line (all delta directions)
const REAUDIT_CLOSE =
  'You entered as {{level1}}. You are reading {{level30}}. ' +
  'Month two is where the line gets harder to argue with. ◆ MainCharacter';

// ── Helper — build the weekly consultant line ─────────────────────────────────

/**
 * weeklyConsultantLine(deltaSign, weekNumber)
 * Returns the interpolated string for the weekly reveal's `consultantLine` field.
 *
 * @param {'up'|'flat'|'down'} deltaSign
 * @param {number} weekNumber
 * @returns {string}
 */
function weeklyConsultantLine(deltaSign, weekNumber) {
  const week = String(weekNumber || 1);
  if (deltaSign === 'up')   return WEEKLY_UP.replace('{{week}}', week);
  if (deltaSign === 'down') return WEEKLY_DOWN;
  return WEEKLY_FLAT; // 'flat' or unknown
}

/**
 * reauditConsultantLine(deltaSign, vars)
 * Returns the interpolated Consultant string for the Day-30 re-audit result.
 *
 * @param {'up'|'flat'|'down'} deltaSign
 * @param {{ leverage: string, leverageDelta: number, overall1: number, overall30: number }} vars
 * @param {number} heldCount — number of axes that held or rose (used for #27 branching)
 * @returns {string}
 */
function reauditConsultantLine(deltaSign, vars, heldCount) {
  if (deltaSign === 'up') {
    return REAUDIT_UP
      .replace('{{leverage}}', vars.leverage || 'Hair density')
      .replace('{{leverageDelta}}', String(vars.leverageDelta || 0))
      .replace('{{overall1}}', String(vars.overall1 || 0))
      .replace('{{overall30}}', String(vars.overall30 || 0));
  }
  if (deltaSign === 'down') {
    return (heldCount === 0 ? REAUDIT_DOWN_NO_HELD_AXES : REAUDIT_DOWN);
  }
  return REAUDIT_FLAT;
}

/**
 * reauditCloseLine(level1, level30)
 * Returns the interpolated close line for the Day-30 re-audit result.
 *
 * @param {string} level1  — Mirror Level on Day 1
 * @param {string} level30 — Mirror Level on Day 30
 * @returns {string}
 */
function reauditCloseLine(level1, level30) {
  return REAUDIT_CLOSE
    .replace('{{level1}}', level1 || 'Raw')
    .replace('{{level30}}', level30 || 'Raw');
}

module.exports = {
  WEEKLY_UP,
  WEEKLY_FLAT,
  WEEKLY_DOWN,
  REAUDIT_UP,
  REAUDIT_FLAT,
  REAUDIT_DOWN,
  REAUDIT_DOWN_NO_HELD_AXES,
  REAUDIT_CLOSE,
  weeklyConsultantLine,
  reauditConsultantLine,
  reauditCloseLine,
};
