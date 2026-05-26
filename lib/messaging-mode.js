/**
 * ═══════════════════════════════════════════════════════════════════
 * MESSAGING SEND-MODE GUARD — shared kill-switch for all channels
 * ═══════════════════════════════════════════════════════════════════
 *
 * One global guard governs WhatsApp (Meta Cloud API), SMS (MSG91) and email
 * (Resend) so a single env var can throttle every outbound channel at once.
 *
 * WHATSAPP_SEND_MODE (canonical, Night-3 rename):
 *   all       — send to everyone (normal production)
 *   allowlist — send only to ADMIN_PHONE / ADMIN_EMAIL (+ extras). DEFAULT, safe.
 *   off       — dry-run, never call any provider API
 *
 * The default is `allowlist`: a redeploy reboots the scheduler, which sends on
 * boot. Admin-only-by-default means an accidental loop cannot blast real users.
 * Flip WHATSAPP_SEND_MODE=all to go live.
 *
 * DEPRECATION: the legacy WATI_SEND_MODE is still read as a fallback for a
 * 30-day window (DECISIONS.md Night-3 #5). server.js mirrors it into the new
 * var at boot and logs a deprecation warning.
 */

const { createLogger } = require('./log');

const log = createLogger('MSGMODE');
let _deprecationWarned = false;

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

/**
 * Current send mode, normalised. Reads WHATSAPP_SEND_MODE, falls back to the
 * legacy WATI_SEND_MODE, then defaults to 'allowlist'.
 * @returns {'all'|'allowlist'|'off'}
 */
function getSendMode() {
  const raw = process.env.WHATSAPP_SEND_MODE || process.env.WATI_SEND_MODE || 'allowlist';
  const mode = raw.toLowerCase();
  return ['all', 'allowlist', 'off'].includes(mode) ? mode : 'allowlist';
}

/** Set of phone numbers allowed under `allowlist` (admin phones + extras). */
function allowedNumbers() {
  // Lazy require breaks the admin ↔ messaging-mode load-time cycle (P1.2).
  const admin = require('./admin');
  const list = [...admin.getAdminPhones()]; // already normalised + de-duped
  const extra = process.env.WHATSAPP_ALLOWLIST || process.env.WATI_ALLOWLIST || '';
  extra.split(',').forEach((n) => {
    if (n.trim()) list.push(normalizePhone(n.trim()));
  });
  return new Set(list);
}

/**
 * Whether a send to `phone` is permitted under the current mode.
 * @param {string} phone
 * @returns {boolean}
 */
function isPhoneAllowed(phone) {
  const mode = getSendMode();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return allowedNumbers().has(normalizePhone(phone));
}

/** Set of email addresses allowed under `allowlist` (admin emails + extras). */
function allowedEmails() {
  const admin = require('./admin');
  const list = [...admin.getAdminEmails()]; // already lower-cased + de-duped
  const extra = process.env.EMAIL_ALLOWLIST || '';
  extra.split(',').forEach((e) => {
    if (e.trim()) list.push(e.trim().toLowerCase());
  });
  return new Set(list);
}

/**
 * Whether a send to `email` is permitted under the current mode.
 * @param {string} email
 * @returns {boolean}
 */
function isEmailAllowed(email) {
  const mode = getSendMode();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return allowedEmails().has(String(email || '').toLowerCase());
}

/**
 * Boot-time deprecation notice: legacy var set, canonical var not. Logs once.
 */
function checkDeprecation() {
  if (_deprecationWarned) return;
  if (process.env.WATI_SEND_MODE && !process.env.WHATSAPP_SEND_MODE) {
    log.warn(
      'DEPRECATED',
      'WATI_SEND_MODE is set but WHATSAPP_SEND_MODE is not — using the legacy value. ' +
        'Rename to WHATSAPP_SEND_MODE (DECISIONS.md Night-3 #5).'
    );
  }
  _deprecationWarned = true;
}

module.exports = {
  normalizePhone,
  getSendMode,
  allowedNumbers,
  isPhoneAllowed,
  allowedEmails,
  isEmailAllowed,
  checkDeprecation,
};
