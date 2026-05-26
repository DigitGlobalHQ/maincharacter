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

module.exports = { add, getAll, count };
