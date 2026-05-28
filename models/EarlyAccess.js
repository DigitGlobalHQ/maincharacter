/**
 * ═══════════════════════════════════════════════════════════════════
 * EARLY ACCESS MODEL — JSON-file-backed waitlist (Night-4, P0.3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Captures name + phone from the waitlist page that `/paywall` serves while
 * `PAYWALL_PUBLIC` is false (DECISIONS.md Night-4 #1). Mirrors the JSON-store
 * pattern in models/User.js; swaps to Postgres later when DATABASE_URL is set.
 * Deduplicated by normalised phone — a repeat submit is a graceful no-op.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizePhone } = require('../lib/messaging-mode');

const FILE =
  process.env.EARLY_ACCESS_FILE_PATH ||
  path.join(__dirname, '..', 'data', 'early-access.json');

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
}
ensureFile();

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

/**
 * Add an early-access entry. Deduplicated by normalised phone.
 * @param {{ phone: string, name?: string, sourceAuditSessionToken?: string }} opts
 * @returns {{ added: boolean, entry: object }}
 */
function add({ phone, name = '', sourceAuditSessionToken = null } = {}) {
  const normalised = normalizePhone(phone);
  const list = load();
  const existing = list.find((e) => e.phone === normalised);
  if (existing) return { added: false, entry: existing };

  const entry = {
    id: crypto.randomUUID(),
    phone: normalised,
    name: String(name || '').trim(),
    sourceAuditSessionToken: sourceAuditSessionToken || null,
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  save(list);
  return { added: true, entry };
}

/** All early-access entries. */
function getAll() {
  return load();
}

/** Number of entries. */
function count() {
  return load().length;
}

// ═══════════════════════════════════════════════════════════════════
// POSTGRES ADAPTER (B0)
// ═══════════════════════════════════════════════════════════════════

function _usesPg() {
  const be = process.env.MC_DB_BACKEND;
  if (be === 'pg' || be === 'postgres') return true;
  if (be === 'jsonl' || be === 'json') return false;
  return !!process.env.DATABASE_URL;
}

function _db() {
  return require('../lib/db'); // eslint-disable-line global-require
}

function _rowToEntry(row) {
  if (!row) return null;
  return {
    id:                       row.id,
    phone:                    row.phone,
    name:                     row.name || '',
    sourceAuditSessionToken:  row.source_audit_session_token || null,
    createdAt:                row.created_at,
  };
}

async function _pg_add({ phone, name = '', sourceAuditSessionToken = null } = {}) {
  const normalised = normalizePhone(phone);
  // Try to insert; ON CONFLICT means it was already there
  const { rows } = await _db().query(
    `INSERT INTO early_access (phone, name, source_audit_session_token)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO NOTHING
     RETURNING *`,
    [normalised, String(name || '').trim(), sourceAuditSessionToken || null]
  );
  if (rows.length) return { added: true, entry: _rowToEntry(rows[0]) };
  // Conflict: fetch existing
  const { rows: existing } = await _db().query(
    'SELECT * FROM early_access WHERE phone = $1', [normalised]
  );
  return { added: false, entry: _rowToEntry(existing[0]) };
}

async function _pg_getAll() {
  const { rows } = await _db().query('SELECT * FROM early_access ORDER BY created_at');
  return rows.map(_rowToEntry);
}

async function _pg_count() {
  const { rows } = await _db().query('SELECT COUNT(*)::int AS n FROM early_access');
  return rows[0].n;
}

function _adapt(jsonFn, pgFn) {
  return function (...args) {
    if (!_usesPg()) return jsonFn(...args);
    const dbLib = _db();
    if (!dbLib.isAvailable()) return jsonFn(...args);
    return Promise.resolve(pgFn(...args)).catch((err) => {
      const { createLogger } = require('../lib/log'); // eslint-disable-line global-require
      createLogger('EARLY-ACCESS').error('PG-FALLBACK', `${pgFn.name}: ${err.message}`);
      return jsonFn(...args);
    });
  };
}

module.exports = {
  add:    _adapt(add,    _pg_add),
  getAll: _adapt(getAll, _pg_getAll),
  count:  _adapt(count,  _pg_count),
};
