/**
 * ═══════════════════════════════════════════════════════════════════
 * PROTOCOL SERVICE — personalised daily checklist (Night-4, P5.2)
 * ═══════════════════════════════════════════════════════════════════
 *
 * generateProtocol(user, audit) → a ProtocolDay: 5-7 actionable "do" items
 * weighted toward the user's two weakest axes, plus 1-3 "do-not" reminders for
 * those affected axes. Re-evaluated weekly from mirror trends (regenerateWeekly).
 */

const { PROTOCOL_LIBRARY, AXIS_TO_BUCKET } = require('../data/lookmax-content');
const { AESTHETIC_AXES } = require('../data/lookmax-prompts');
const { createLogger } = require('../lib/log');
const { sanitizeProtocolDay } = require('../lib/safety-validator');

const log = createLogger('PROTOCOL');

function bucketFor(axis) {
  return AXIS_TO_BUCKET[axis] || 'lifestyle';
}
function dosOf(bucket) {
  return (PROTOCOL_LIBRARY[bucket] || []).filter((i) => i.category === 'do');
}
function dontsOf(bucket) {
  return (PROTOCOL_LIBRARY[bucket] || []).filter((i) => i.category === 'do-not');
}

/**
 * Resolve the audit-like scores for a user (converting AuditSession, else a
 * neutral default). Returns { scores, weakestAxis }.
 */
function auditForUser(user) {
  if (user && user.auditSessionId) {
    try {
      const AuditSession = require('../models/AuditSession');
      const s = AuditSession.getSession(user.auditSessionId);
      if (s && s.aestheticScores) return { scores: s.aestheticScores, weakestAxis: s.weakestAxis };
    } catch {
      /* fall through to default */
    }
  }
  const scores = {};
  AESTHETIC_AXES.forEach((a) => (scores[a] = 55));
  return { scores, weakestAxis: 'hairDensity' };
}

/**
 * Build today's protocol from an audit ({ scores, weakestAxis }).
 * @returns {{ items:Array, doNots:Array, generatedFrom:string }}
 */
function generateProtocol(user, audit) {
  const scores = (audit && audit.scores) || {};
  const ranked = AESTHETIC_AXES.slice().sort((a, b) => (scores[a] ?? 50) - (scores[b] ?? 50));
  const weakAxis =
    audit && AESTHETIC_AXES.includes(audit.weakestAxis) ? audit.weakestAxis : ranked[0];
  const b1 = bucketFor(weakAxis);
  // Second bucket: the next-weakest axis that maps to a *different* bucket.
  const secondAxis = ranked.find((a) => bucketFor(a) !== b1) || ranked[1] || ranked[0];
  const b2 = bucketFor(secondAxis);

  const items = [];
  const seen = new Set();
  const add = (arr, n) => {
    for (const it of arr.slice(0, n)) {
      if (!seen.has(it.id)) { seen.add(it.id); items.push(it); }
    }
  };
  add(dosOf(b1), 2); // 2 from the weakest bucket
  add(dosOf(b2), 2); // 2 from the second-weakest bucket
  add(dosOf('lifestyle'), 2); // 1-2 lifestyle staples

  // Guarantee at least 5 by topping up from every other bucket.
  if (items.length < 5) {
    for (const bucket of Object.keys(PROTOCOL_LIBRARY)) {
      add(dosOf(bucket), dosOf(bucket).length);
      if (items.length >= 5) break;
    }
  }
  const finalItems = items.slice(0, 7);

  // Always include the do-nots for the affected buckets (1-3).
  const doNots = [];
  const seenDn = new Set();
  [b1, b2].forEach((b) =>
    dontsOf(b).forEach((d) => { if (!seenDn.has(d.id)) { seenDn.add(d.id); doNots.push(d); } })
  );

  // Server-side safety backstop: every item passes the validator before it is
  // surfaced. The static library is already safe-only, but this guarantees that
  // nothing forbidden (drug names, dosages, RCT framing, prescriptive diet)
  // can ever reach a user even if a row regresses (Phase 1, 2026-05-30).
  const rawItems = finalItems.map((i) => ({
    itemId: i.id,
    id: i.id,
    axis: i.axis,
    title: i.title,
    instruction: i.instruction,
    checked: false,
  }));
  const rawDoNots = doNots
    .slice(0, 3)
    .map((d) => ({ itemId: d.id, id: d.id, axis: d.axis, title: d.title, instruction: d.instruction }));

  const { day: clean, report } = sanitizeProtocolDay({ items: rawItems, doNot: rawDoNots });
  if (report.length) {
    log.error('SAFETY', `replaced ${report.length} unsafe protocol item(s): ${report.map((r) => r.violations.join('/')).join(', ')}`);
  }

  return {
    generatedFrom: weakAxis,
    items: clean.items.map(({ id, ...rest }) => rest),
    doNots: clean.doNot.map((d) => ({ itemId: d.itemId, title: d.title, instruction: d.instruction })),
  };
}

/**
 * Weekly audit derived from the last 7 mirror readings (P5.2). Falls back to the
 * converting audit when there isn't enough mirror history.
 * Async because Lookmax.getMirrors is _adapt-wrapped (PG path returns a Promise).
 */
async function weeklyAuditFromMirrors(user) {
  let mirrors = [];
  try {
    const Lookmax = require('../models/Lookmax');
    mirrors = (await Lookmax.getMirrors(user.token)).slice(-7);
  } catch {
    /* ignore */
  }
  if (!mirrors.length) return auditForUser(user);
  const scores = {};
  for (const axis of AESTHETIC_AXES) {
    const vals = mirrors.map((m) => (m.axes && m.axes[axis]) || 0).filter((v) => v > 0);
    scores[axis] = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 55;
  }
  const weakestAxis = AESTHETIC_AXES.reduce((lo, a) => (scores[a] < scores[lo] ? a : lo), AESTHETIC_AXES[0]);
  return { scores, weakestAxis };
}

/**
 * Sunday regeneration (P5.2): rebuild today's ProtocolDay for every active
 * Lookmaxxing user from their past-week mirror trends. Returns the count.
 */
async function regenerateWeekly() {
  let count = 0;
  try {
    const User = require('../models/User');
    const Lookmax = require('../models/Lookmax');
    const users = Object.values(await User.getAllUsers()).filter((u) => u.lookmaxxingActive);
    for (const u of users) {
      const audit = await weeklyAuditFromMirrors(u);
      await Lookmax.setProtocolDay(u.token, generateProtocol(u, audit));
      count += 1;
    }
    log.info('WEEKLY', `regenerated ${count} protocol(s) from mirror trends`);
  } catch (err) {
    log.error('WEEKLY', err.message);
  }
  return count;
}

module.exports = { generateProtocol, auditForUser, weeklyAuditFromMirrors, regenerateWeekly, bucketFor };
