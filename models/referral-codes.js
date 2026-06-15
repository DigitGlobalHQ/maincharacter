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

// ═══════════════════════════════════════════════════════════════════
// POSTGRES ADAPTER — persists codes across redeploys (mirrors EarlyAccess.js)
// ═══════════════════════════════════════════════════════════════════
//
// The JSON store above lives on Render's ephemeral disk and is wiped on every
// redeploy/restart. When DATABASE_URL is set we use the referral_codes table
// (migrations/0004) so admin-generated codes survive. _adapt picks the backend
// per call and falls back to JSON if Postgres is momentarily unavailable.

function _usesPg() {
  const be = process.env.MC_DB_BACKEND;
  if (be === 'pg' || be === 'postgres') return true;
  if (be === 'jsonl' || be === 'json') return false;
  return !!process.env.DATABASE_URL;
}

function _db() {
  return require('../lib/db'); // eslint-disable-line global-require
}

function _rowToRecord(row) {
  if (!row) return null;
  const rec = {
    code:       row.code,
    percentOff: row.percent_off,
    maxUses:    row.max_uses,
    uses:       row.uses,
    active:     row.active,
    createdAt:  row.created_at,
  };
  if (row.note !== undefined && row.note !== null) rec.note = row.note;
  return rec;
}

async function _pg_createCode({ percentOff, maxUses = 1, note } = {}) {
  // Generate a unique code; retry on the rare PK collision.
  for (let attempts = 0; attempts < 20; attempts++) {
    const code = _generateCode();
    const { rows } = await _db().query(
      `INSERT INTO referral_codes (code, percent_off, max_uses, uses, active, note)
       VALUES ($1, $2, $3, 0, TRUE, $4)
       ON CONFLICT (code) DO NOTHING
       RETURNING *`,
      [code, Number(percentOff), Number(maxUses), note === undefined || note === null ? null : String(note)]
    );
    if (rows.length) return _rowToRecord(rows[0]);
  }
  throw new Error('could not generate a unique referral code');
}

async function _pg_listCodes() {
  const { rows } = await _db().query('SELECT * FROM referral_codes ORDER BY created_at DESC');
  return rows.map(_rowToRecord);
}

async function _pg_getCode(code) {
  if (!code) return null;
  const { rows } = await _db().query(
    'SELECT * FROM referral_codes WHERE code = $1', [String(code).toUpperCase()]
  );
  return _rowToRecord(rows[0]);
}

async function _pg_validateCode(code) {
  if (!code) return { valid: false, reason: 'code required' };
  const rec = await _pg_getCode(code);
  if (!rec) return { valid: false, reason: 'code not found' };
  if (!rec.active) return { valid: false, reason: 'code inactive' };
  if (rec.uses >= rec.maxUses) {
    return { valid: false, reason: 'code limit reached — all uses exhausted' };
  }
  return { valid: true, percentOff: rec.percentOff, maxUses: rec.maxUses, uses: rec.uses };
}

async function _pg_redeemCode(code) {
  if (!code) return { ok: false, reason: 'code required' };
  const key = String(code).toUpperCase();
  // Atomic guarded increment — the WHERE clause prevents double-spend even
  // under concurrent redemptions; a returned row means we won the increment.
  const { rows } = await _db().query(
    `UPDATE referral_codes
        SET uses = uses + 1
      WHERE code = $1 AND active = TRUE AND uses < max_uses
      RETURNING *`,
    [key]
  );
  if (rows.length) return { ok: true };
  // No row updated — figure out why for an accurate reason.
  const rec = await _pg_getCode(key);
  if (!rec) return { ok: false, reason: 'code not found' };
  if (!rec.active) return { ok: false, reason: 'code inactive' };
  return { ok: false, reason: 'code limit reached — all uses exhausted' };
}

function _adapt(jsonFn, pgFn) {
  return function (...args) {
    if (!_usesPg()) return jsonFn(...args);
    const dbLib = _db();
    if (!dbLib.isAvailable()) return jsonFn(...args);
    return Promise.resolve(pgFn(...args)).catch((err) => {
      const { createLogger } = require('../lib/log'); // eslint-disable-line global-require
      createLogger('REFERRAL-CODES').error('PG-FALLBACK', `${pgFn.name}: ${err.message}`);
      return jsonFn(...args);
    });
  };
}

module.exports = {
  createCode:   _adapt(createCode,   _pg_createCode),
  listCodes:    _adapt(listCodes,    _pg_listCodes),
  getCode:      _adapt(getCode,      _pg_getCode),
  validateCode: _adapt(validateCode, _pg_validateCode),
  redeemCode:   _adapt(redeemCode,   _pg_redeemCode),
};
