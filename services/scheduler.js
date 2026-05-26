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
  const users = User.getUsersForTime(currentTime);

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
        User.addWordsLearned(user.phone, DAYS[nextDay].words, nextDay);
      }

      await whatsapp.sendMessageSafe(user.phone, message);

      User.updateUser(user.phone, {
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
  const users = Object.values(User.getAllUsers()).filter(
    (u) => u.lookmaxxingActive && (u.mirrorReminderTime || '06:30') === currentTime
  );
  if (users.length === 0) return;

  for (const user of users) {
    try {
      if (Lookmax.mirrorForToday(user.token)) continue; // already done today
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
function maybeRegenerateWeeklyProtocols() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  if (ist.getUTCDay() === 0 && getCurrentIST() === '00:05') {
    require('./protocol').regenerateWeekly();
  }
}

/**
 * Check for missed messages on server restart.
 * If a user should have received their message today but hasn't, send it now.
 */
async function checkMissedMessages() {
  const allUsers = User.getAllUsers();
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
          User.addWordsLearned(user.phone, DAYS[nextDay].words, nextDay);
        }
        
        await whatsapp.sendMessageSafe(user.phone, message);
        User.updateUser(user.phone, {
          day: nextDay,
          awaitingResponse: true,
          lastMorningSent: new Date().toISOString(),
        });
      }
    }
  }
}

/**
 * Start the scheduler.
 */
function start() {
  log('INIT', 'Starting scheduler (every minute check)');

  // Check every minute
  cron.schedule('* * * * *', async () => {
    try {
      await sendMorningMessages();
      await sendMirrorNudges();
      maybeRegenerateWeeklyProtocols();
    } catch (err) {
      log('ERROR', `Scheduler error: ${err.message}`);
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

module.exports = { start, sendMorningMessages, sendMirrorNudges, checkMissedMessages };
