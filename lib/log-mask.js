/**
 * ═══════════════════════════════════════════════════════════════════
 * PII MASKING HELPERS — lib/log-mask.js
 * ═══════════════════════════════════════════════════════════════════
 *
 * Pure functions for masking PII before logging. Used by auth routes
 * so phone numbers, emails, and tokens never appear in plaintext logs.
 *
 * Security audit HIGH finding addressed: PII in logs unmasked.
 * Reusable for the broader §0-B5 PII-masking work.
 */

'use strict';

/**
 * Mask an email address: keeps the first character + domain.
 * john@gmail.com → j***@gmail.com
 * Returns '[no-email]' for null/undefined.
 * @param {string|null|undefined} email
 * @returns {string}
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '[no-email]';
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '[invalid-email]';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at); // includes @
  const first = local.charAt(0);
  return `${first}***${domain}`;
}

/**
 * Mask a phone number: shows only the last 4 digits.
 * 919876543210 → ******3210
 * Returns '[no-phone]' for null/undefined.
 * @param {string|null|undefined} phone
 * @returns {string}
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '[no-phone]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Mask a token (magic-link token, firstLoginToken, etc.).
 * Tokens must never appear in logs — always redacted entirely.
 * @returns {string}
 */
function maskToken() {
  return '[redacted]';
}

module.exports = { maskEmail, maskPhone, maskToken };
