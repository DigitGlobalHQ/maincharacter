/**
 * ═══════════════════════════════════════════════════════════════════
 * WATI API SERVICE — WhatsApp messaging via Wati
 * ═══════════════════════════════════════════════════════════════════
 *
 * SEND GUARD (WATI_SEND_MODE):
 *   all       — send to everyone (normal production)
 *   allowlist — send only to ADMIN_PHONE + WATI_ALLOWLIST (DEFAULT, safe)
 *   off       — dry-run, never call the Wati API
 *
 * The default is `allowlist` on purpose: a redeploy reboots the scheduler,
 * which sends on boot. Defaulting to admin-only means an accidental loop
 * cannot blast real users. Flip WATI_SEND_MODE=all to go live.
 */

const axios = require('axios');
const { createLogger } = require('../lib/log');

const log = createLogger('WATI');

const WATI_API_KEY = process.env.WATI_API_KEY || '';
const WATI_BASE_URL = (process.env.WATI_BASE_URL || '').replace(/\/$/, '');

/**
 * Normalise a phone number: strip +, spaces, dashes; add 91 prefix if 10 digits.
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  let p = String(phone || '').replace(/[\s+\-]/g, '');
  if (p.length === 10) p = '91' + p;
  return p;
}

/** Current send mode, normalised. Defaults to 'allowlist'. */
function getSendMode() {
  const mode = (process.env.WATI_SEND_MODE || 'allowlist').toLowerCase();
  return ['all', 'allowlist', 'off'].includes(mode) ? mode : 'allowlist';
}

/** Build the set of allowed numbers (ADMIN_PHONE + WATI_ALLOWLIST). */
function allowedNumbers() {
  const list = [];
  if (process.env.ADMIN_PHONE) list.push(process.env.ADMIN_PHONE);
  if (process.env.WATI_ALLOWLIST) {
    process.env.WATI_ALLOWLIST.split(',').forEach((n) => {
      if (n.trim()) list.push(n.trim());
    });
  }
  return new Set(list.map(normalizePhone));
}

/**
 * Decide whether a send to `phone` is permitted under the current mode.
 * @param {string} phone
 * @returns {boolean}
 */
function isAllowed(phone) {
  const mode = getSendMode();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return allowedNumbers().has(normalizePhone(phone));
}

/**
 * Send a session message to a phone number.
 * Respects WATI_SEND_MODE; returns a sentinel object instead of throwing
 * when a send is suppressed.
 * @param {string} phone
 * @param {string} text
 */
async function sendMessage(phone, text) {
  const normalized = normalizePhone(phone);
  const mode = getSendMode();

  if (mode === 'off') {
    log.info('DRY-RUN', `[mode=off] suppressed send to ${normalized}`, { chars: text.length });
    return { result: 'suppressed', mode };
  }

  if (mode === 'allowlist' && !isAllowed(normalized)) {
    log.warn('BLOCKED', `[mode=allowlist] ${normalized} not on allowlist — not sent`);
    return { result: 'blocked', mode };
  }

  if (!WATI_API_KEY || !WATI_BASE_URL) {
    log.info('DRY-RUN', `no creds — would send to ${normalized}: ${text.substring(0, 80)}`);
    return { result: 'dry-run' };
  }

  const url = `${WATI_BASE_URL}/api/v1/sendSessionMessage/${normalized}?messageText=${encodeURIComponent(text)}`;
  const response = await axios.post(
    url,
    {},
    {
      headers: { Authorization: `Bearer ${WATI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  log.info('SENT', `→ ${normalized} (${text.length} chars) status=${response.status}`);
  return response.data;
}

/**
 * Send a template message (for users without an active session).
 * @param {string} phone
 * @param {string} templateName
 * @param {Array<{name:string,value:string}>} parameters
 */
async function sendTemplateMessage(phone, templateName, parameters = []) {
  const normalized = normalizePhone(phone);
  const mode = getSendMode();

  if (mode === 'off') {
    log.info('DRY-RUN', `[mode=off] suppressed template ${templateName} to ${normalized}`);
    return { result: 'suppressed', mode };
  }

  if (mode === 'allowlist' && !isAllowed(normalized)) {
    log.warn('BLOCKED', `[mode=allowlist] template ${templateName} to ${normalized} — not sent`);
    return { result: 'blocked', mode };
  }

  if (!WATI_API_KEY || !WATI_BASE_URL) {
    log.info('DRY-RUN', `no creds — would send template ${templateName} to ${normalized}`);
    return { result: 'dry-run' };
  }

  const url = `${WATI_BASE_URL}/api/v1/sendTemplateMessage/${normalized}`;
  const response = await axios.post(
    url,
    {
      template_name: templateName,
      broadcast_name: 'maincharacter_' + Date.now(),
      parameters: parameters.map((p) => ({ name: p.name, value: p.value })),
    },
    {
      headers: { Authorization: `Bearer ${WATI_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  log.info('TEMPLATE', `→ ${normalized} template=${templateName} status=${response.status}`);
  return response.data;
}

/**
 * Send message with one retry. Never throws — returns null on total failure.
 * @param {string} phone
 * @param {string} text
 */
async function sendMessageSafe(phone, text) {
  try {
    return await sendMessage(phone, text);
  } catch (err) {
    log.warn('RETRY', `retrying once for ${normalizePhone(phone)}: ${err.message}`);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      return await sendMessage(phone, text);
    } catch (retryErr) {
      log.error('FAIL', `both attempts failed for ${normalizePhone(phone)}`, {
        error: retryErr.message,
      });
      return null;
    }
  }
}

module.exports = {
  sendMessage,
  sendMessageSafe,
  sendTemplateMessage,
  normalizePhone,
  getSendMode,
  isAllowed,
  allowedNumbers,
};
