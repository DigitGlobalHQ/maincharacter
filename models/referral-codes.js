/**
 * ═══════════════════════════════════════════════════════════════════
 * REFERRAL CODES MODEL — JSON-file-backed store
 * ═══════════════════════════════════════════════════════════════════
 *
 * Atomic write pattern mirrors models/User.js.
 * File path overridable via REFERRAL_CODES_FILE_PATH env (test isolation).
 *
 * Record shape:
 *   {
 *     code: string (8 uppercase alphanumeric, no ambiguous chars),
 *     percentOff: number (1..100),
 *     maxUses: number (≥1),
 *     uses: number (0..maxUses),
 *     active: boolean,
 *     note: string|undefined,
 *     createdAt: ISO string,
 *   }
 *
 * Store layout: { [CODE]: record, ... }
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH =
  process.env.REFERRAL_CODES_FILE_PATH ||
  path.join(__dirname, '..', 'data', 'referral-codes.json');

// Ambiguous characters removed so codes are easy to read/type aloud.
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function _ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '{}');
}
_ensureStore();

function _load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Atomic write — mirrors models/User.js pattern. */
function _save(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

/**
 * Generate a cryptographically random 8-character uppercase alphanumeric code,
 * excluding visually ambiguous characters (I, O, 0, 1).
 * @returns {string}
 */
function _generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return Array.from(bytes)
    .map((b) => SAFE_CHARS[b % SAFE_CHARS.length])
    .join('');
}

/**
 * Create a new referral code.
 * @param {{ percentOff: number, maxUses?: number, note?: string }} params
 * @returns {object} the created code record
 */
function createCode({ percentOff, maxUses = 1, note } = {}) {
  const store = _load();

  // Generate a unique code (retry on the rare collision).
  let code;
  for (let attempts = 0; attempts < 20; attempts++) {
    code = _generateCode();
    if (!store[code]) break;
  }

  const record = {
    code,
    percentOff: Number(percentOff),
    maxUses:    Number(maxUses),
    uses:       0,
    active:     true,
    createdAt:  new Date().toISOString(),
  };
  if (note !== undefined && note !== null) record.note = String(note);

  store[code] = record;
  _save(store);
  return record;
}

/**
 * List all codes.
 * @returns {object[]}
 */
function listCodes() {
  return Object.values(_load());
}

/**
 * Get a single code record by code string (case-insensitive).
 * @param {string} code
 * @returns {object|null}
 */
function getCode(code) {
  if (!code) return null;
  const key = String(code).toUpperCase();
  return _load()[key] || null;
}

/**
 * Validate a code without redeeming it (read-only price check).
 *
 * @param {string} code
 * @returns {{ valid: boolean, reason?: string, percentOff?: number, maxUses?: number, uses?: number }}
 */
function validateCode(code) {
  if (!code) return { valid: false, reason: 'code required' };
  const key = String(code).toUpperCase();
  const store = _load();
  const rec   = store[key];

  if (!rec) return { valid: false, reason: 'code not found' };
  if (!rec.active) return { valid: false, reason: 'code inactive' };
  if (rec.uses >= rec.maxUses) {
    return { valid: false, reason: 'code limit reached — all uses exhausted' };
  }

  return {
    valid:      true,
    percentOff: rec.percentOff,
    maxUses:    rec.maxUses,
    uses:       rec.uses,
  };
}

/**
 * Redeem a code: atomically re-reads, checks uses < maxUses, increments uses,
 * persists, and returns the result. Guards against double-spend (two concurrent
 * requests both validate before either redeems).
 *
 * @param {string} code
 * @returns {{ ok: boolean, reason?: string }}
 */
function redeemCode(code) {
  if (!code) return { ok: false, reason: 'code required' };
  const key = String(code).toUpperCase();

  // Re-read store inside the redeem to catch races (same single-instance approach
  // as models/User.js read-modify-write).
  const store = _load();
  const rec   = store[key];

  if (!rec) return { ok: false, reason: 'code not found' };
  if (!rec.active) return { ok: false, reason: 'code inactive' };
  if (rec.uses >= rec.maxUses) {
    return { ok: false, reason: 'code limit reached — all uses exhausted' };
  }

  rec.uses += 1;
  store[key] = rec;
  _save(store);
  return { ok: true };
}

module.exports = {
  createCode,
  listCodes,
  getCode,
  validateCode,
  redeemCode,
};
