/**
 * ═══════════════════════════════════════════════════════════════════
 * SCHEDULER — node-cron daily message trigger
 * ═══════════════════════════════════════════════════════════════════
 *
 * Runs every minute. Checks for users who need their morning or
 * evening message at the current time (IST).
 */

const cron = require('node-cron');
const User = require('../models/User');
const Lookmax = require('../models/Lookmax');
const whatsapp = require('./whatsapp');
const { DAYS, buildMorningMessage, buildEveningMessage, buildEvolutionReport } = require('../data/orator-content');
const gemini = require('./gemini');

const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

let _log;
function log(tag, msg) {
  if (!_log) _log = require('../lib/log').createLogger('SCHED');
  if (/error|fail/i.test(tag)) return _log.error(tag, msg);
  if (/warn/i.test(tag)) return _log.warn(tag, msg);
  return _log.info(tag, msg);
}

/**
 * Get current time in IST as "HH:MM".
 */
function getCurrentIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const h = String(ist.getUTCHours()).padStart(2, '0');
  const m = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Send morning messages to all users whose preferredTime matches now.
 */
async function sendMorningMessages() {
  const currentTime = getCurrentIST();
  const users = await User.getUsersForTime(currentTime);

  if (users.length === 0) return;

  log('MORNING', `Found ${users.length} users for time ${currentTime}`);

  for (const user of users) {
    try {
      const nextDay = user.day + 1;
      
      // Check if we already sent today's message
      if (user.lastMorningSent) {
        const lastSent = new Date(user.lastMorningSent);
        const now = new Date();
        if (lastSent.toDateString() === now.toDateString()) {
          log('SKIP', `Already sent Day ${nextDay} to ${user.phone} today`);
          continue;
        }
      }

      const message = buildMorningMessage(nextDay, user.name);
      if (!message) {
        log('SKIP', `No content for Day ${nextDay}`);
        continue;
      }

      // Add all words for this day
      if (DAYS[nextDay]) {
        await User.addWordsLearned(user.phone, DAYS[nextDay].words, nextDay);
      }

      await whatsapp.sendMessageSafe(user.phone, message);

      await User.updateUser(user.phone, {
        day: nextDay,
        awaitingResponse: true,
        lastMorningSent: new Date().toISOString(),
        streak: user.streak + 1,
      });

      log('SENT', `Day ${nextDay} morning → ${user.phone} (${user.name})`);
    } catch (err) {
      log('ERROR', `Failed morning message for ${user.phone}: ${err.message}`);
    }
  }
}

/**
 * Lookmaxxing mirror nudge (P4.4). Every minute, message active Lookmaxxing
 * users whose mirrorReminderTime (default 06:30 IST) is now AND who have not
 * submitted today's mirror. Respects WHATSAPP_SEND_MODE via sendMessageSafe, so
 * under `allowlist` only admin phones receive it (and DRY-RUN logs otherwise).
 */
async function sendMirrorNudges() {
  const currentTime = getCurrentIST();
  const users = Object.values(await User.getAllUsers()).filter(
    (u) => u.lookmaxxingActive && (u.mirrorReminderTime || '06:30') === currentTime
  );
  if (users.length === 0) return;

  for (const user of users) {
    try {
      if (await Lookmax.mirrorForToday(user.token)) continue; // already done today
      await whatsapp.sendMessageSafe(user.phone, `◆ The mirror is open. ◆\n\n${BASE_URL}/lookmax/mirror`);
      log('MIRROR-NUDGE', `→ ${user.phone} (${user.name})`);
    } catch (err) {
      log('ERROR', `mirror nudge for ${user.phone}: ${err.message}`);
    }
  }
}

/**
 * Sunday 00:05 IST: regenerate each active Lookmaxxing user's protocol from the
 * past week's mirror trends (P5.2). Cheap no-op the rest of the week.
 */
async function maybeRegenerateWeeklyProtocols() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (ist.getUTCDay() === 0 && getCurrentIST() === '00:05') {
    await require('./protocol').regenerateWeekly();
  }
}

/**
 * Check for missed messages on server restart.
 * If a user should have received their message today but hasn't, send it now.
 */
async function checkMissedMessages() {
  const allUsers = await User.getAllUsers();
  const today = new Date().toDateString();

  for (const [phone, user] of Object.entries(allUsers)) {
    if (user.status !== 'active' || user.day >= 7 || user.awaitingResponse) continue;

    // Check if today's message was already sent
    if (user.lastMorningSent && new Date(user.lastMorningSent).toDateString() === today) continue;

    // Check if we're past the user's preferred time today
    const currentTime = getCurrentIST();
    const [currentH, currentM] = currentTime.split(':').map(Number);
    const [prefH, prefM] = (user.preferredTime || '08:00').split(':').map(Number);

    if (currentH > prefH || (currentH === prefH && currentM >= prefM)) {
      log('MISSED', `Sending missed Day ${user.day + 1} to ${user.phone}`);
      const nextDay = user.day + 1;
      const message = buildMorningMessage(nextDay, user.name);
      
      if (message) {
        if (DAYS[nextDay]) {
          await User.addWordsLearned(user.phone, DAYS[nextDay].words, nextDay);
        }
        
        await whatsapp.sendMessageSafe(user.phone, message);
        await User.updateUser(user.phone, {
          day: nextDay,
          awaitingResponse: true,
          lastMorningSent: new Date().toISOString(),
        });
      }
    }
  }
}

/**
 * Daily 7:30 IST web-push mirror nudge (B4).
 * Iterates active Lookmaxxing users with push subscriptions and sends them a
 * mirror nudge notification. Behind MIRROR_PUSH_ENABLED flag (default false).
 * Founder flips to true once copy is ratified.
 *
 * @returns {Promise<{ sent: number, skipped: boolean }>}
 */
async function sendMirrorPushNudges() {
  // Feature flag guard — default off
  if (process.env.MIRROR_PUSH_ENABLED !== 'true') {
    return { sent: 0, skipped: true };
  }

  const push = require('./push');
  const allUsers = await User.getAllUsers();
  let sent = 0;

  for (const user of Object.values(allUsers)) {
    if (!user.lookmaxxingActive) continue;
    const subs = user.push_subscriptions || [];
    if (subs.length === 0) continue;

    try {
      const result = await push.sendToUser(user.token, {
        title: '◆ MainCharacter',
        // TODO copy review: notification body — deferred pending copy-consultant approval
        body: '<!-- TODO copy -->',
        url: '/lookmax/mirror',
      });
      if (result && result.sent > 0) sent++;
      log('PUSH-NUDGE', `→ ${user.token} result=${result && result.result}`);
    } catch (err) {
      log('ERROR', `push nudge for ${user.token}: ${err.message}`);
    }
  }

  return { sent };
}

// ─── Health (observable on /health, so the per-minute tick can be verified on
// live without Render log access — funnel-repair) ───
const _health = {
  startedAt: null, lastTickAt: null, ticks: 0, lastError: null, lastErrorAt: null,
  lastTickSource: null, lastHttpTickAt: null,
};
function getHealth() { return { ..._health }; }

/**
 * One scheduler pass. The single source of truth for the per-minute work,
 * driven by BOTH node-cron (when the process is alive) AND the external
 * /api/cron/tick endpoint (the Path-A resilience layer: an external pinger
 * keeps a free-tier host awake and drives this on hosts that scale-to-zero).
 *
 * Idempotent — sendMorningMessages/sendMirrorNudges/checkMissedMessages each
 * guard on lastMorningSent/awaitingResponse/mirrorForToday, so calling tick()
 * more often than once a minute (or twice in one minute) never double-sends.
 *
 * @param {{ source?: 'cron'|'http' }} opts
 * @returns {Promise<{ ok: boolean, ticks?: number, source?: string, error?: string }>}
 */
async function tick({ source = 'cron' } = {}) {
  try {
    await sendMorningMessages();
    await sendMirrorNudges();
    await maybeRegenerateWeeklyProtocols();
    if (source === 'http') {
      // External-pinger path: the host may have slept through a user's
      // preferredTime (free-tier scale-to-zero), so run windowed catch-up for
      // any due-but-unsent morning message. No-op when node-cron kept up.
      await checkMissedMessages();
    }
    _health.lastTickAt = new Date().toISOString();
    _health.lastTickSource = source;
    if (source === 'http') _health.lastHttpTickAt = _health.lastTickAt;
    _health.ticks += 1;
    return { ok: true, ticks: _health.ticks, source };
  } catch (err) {
    _health.lastError = err.message;
    _health.lastErrorAt = new Date().toISOString();
    log('ERROR', `Scheduler tick error: ${err.message}`);
    // Fire-and-forget: alert failure must never propagate into the scheduler.
    // BACKLOG: if lastError persists across many consecutive ticks without recovery,
    // consider escalating from warning to critical.
    try {
      require('../lib/alerts').notify({
        severity: 'warning',
        title: 'Scheduler tick error',
        key: 'scheduler-error',
        detail: err.message,
        meta: { source },
      }).catch(() => {});
    } catch (_) { /* alerts not available */ }
    return { ok: false, error: err.message };
  }
}

/**
 * Start the scheduler.
 */
function start() {
  log('INIT', 'Starting scheduler (every minute check)');
  _health.startedAt = new Date().toISOString();

  // Check every minute (in-process; survives only while the dyno is awake —
  // /api/cron/tick is the cross-host fallback).
  cron.schedule('* * * * *', () => tick({ source: 'cron' }));

  // Daily 7:30 IST web-push mirror nudge (B4 — MIRROR_PUSH_ENABLED flag).
  // Cron is UTC; 7:30 IST = 02:00 UTC.
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await sendMirrorPushNudges();
      if (!result.skipped) {
        log('PUSH-NUDGE', `daily mirror push: sent=${result.sent}`);
      }
    } catch (err) {
      log('ERROR', `push nudge cron: ${err.message}`);
    }
  });

  // Check for missed messages on startup (after 5 second delay to let server init)
  setTimeout(() => {
    checkMissedMessages().catch(err => {
      log('ERROR', `Missed message check failed: ${err.message}`);
    });
  }, 5000);

  log('INIT', 'Scheduler started');
}

module.exports = { start, tick, sendMorningMessages, sendMirrorNudges, sendMirrorPushNudges, checkMissedMessages, getHealth };
