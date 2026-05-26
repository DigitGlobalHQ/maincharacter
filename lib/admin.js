/**
 * ═══════════════════════════════════════════════════════════════════
 * ADMIN ALLOWLIST — multi-admin phone/email helper (Night-4, P1.1)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Replaces scattered reads of the singular ADMIN_PHONE / ADMIN_EMAIL.
 * ADMIN_PHONES / ADMIN_EMAILS (comma-separated) are preferred; the singular
 * vars are kept as a fallback so nothing breaks before they are set
 * (DECISIONS.md Night-4 #4).
 *
 * Imports normalizePhone from messaging-mode (one direction). messaging-mode
 * lazily requires THIS module inside its functions to avoid a load-time cycle.
 */

const { normalizePhone } = require('./messaging-mode');

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All admin phones (normalised, de-duplicated). ADMIN_PHONES ∪ ADMIN_PHONE. */
function getAdminPhones() {
  const plural = splitCsv(process.env.ADMIN_PHONES).map(normalizePhone);
  const single = process.env.ADMIN_PHONE ? [normalizePhone(process.env.ADMIN_PHONE)] : [];
  return [...new Set([...plural, ...single])];
}

/** All admin emails (lower-cased, de-duplicated). ADMIN_EMAILS ∪ ADMIN_EMAIL. */
function getAdminEmails() {
  const plural = splitCsv(process.env.ADMIN_EMAILS).map((e) => e.toLowerCase());
  const single = process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL.toLowerCase()] : [];
  return [...new Set([...plural, ...single])];
}

/** The first admin phone — used as the target for admin notifications. */
function primaryAdminPhone() {
  return getAdminPhones()[0] || '';
}

/** Whether a phone belongs to an admin (normalised comparison). */
function isAdminPhone(phone) {
  return getAdminPhones().includes(normalizePhone(phone));
}

/** Whether an email belongs to an admin (case-insensitive). */
function isAdminEmail(email) {
  return getAdminEmails().includes(String(email || '').toLowerCase());
}

module.exports = {
  getAdminPhones,
  getAdminEmails,
  primaryAdminPhone,
  isAdminPhone,
  isAdminEmail,
};
