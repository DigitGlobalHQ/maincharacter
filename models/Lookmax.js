/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAX MODEL — Lookmaxxing records with Postgres adapter (0005)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Data shape (JSON file — used as fallback when DATABASE_URL is unset):
 *   {
 *     users: {
 *       [userId]: {
 *         mirrors:   [ { id, date, photoPath, axes, overallScore, mirrorLevel, createdAt } ],
 *         protocols: { [date]: { date, items:[{itemId,checked}], doNots:[ids], isLocked, generatedFrom, createdAt } },
 *         hair:      [ { id, date, frontPath, crownPath, norwood, hairlineScore, recessionMm, confidence, createdAt } ],
 *         nightLogs: [ { date, sleepHours, waterGlasses, saltAlcoholFlag, notes, createdAt } ],
 *       }
 *     },
 *     otps: { [phone]: { otp, expiresAt } }
 *   }
 *
 * Postgres adapter (activated when DATABASE_URL is set):
 *   • mirrors / hair / nightLogs → lookmax_records (kind discriminator, JSONB payload)
 *   • protocols                  → lookmax_protocols (user_id + date PK, upserted by date)
 *   • OTPs remain JSON-only (short-lived login codes; loss on redeploy is benign —
 *     user simply requests a fresh OTP).  See DECISIONS.md 2026-06-16.
 *
 * Every exported function's return shape is identical whether the JSON or pg
 * path executes — routes in routes/lookmax.js need no changes.
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE =
  process.env.LOOKMAX_FILE_PATH || path.join(__dirname, '..', 'data', 'lookmax', 'lookmax.json');

function ensureFile() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ users: {}, otps: {} }, null, 2));
}
ensureFile();

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    data.users = data.users || {};
    data.otps = data.otps || {};
    return data;
  } catch {
    return { users: {}, otps: {} };
  }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function bucket(data, userId) {
  if (!data.users[userId]) data.users[userId] = { mirrors: [], protocols: {}, hair: [], nightLogs: [] };
  const b = data.users[userId];
  if (!b.nightLogs) b.nightLogs = []; // back-fill for buckets created before night logs
  return b;
}

/** Today's date as YYYY-MM-DD in IST (the protocol/mirror day boundary). */
function istDate(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
// JSON-backed implementations (original, kept as fallback)
// ═══════════════════════════════════════════════════════════════════

// ─── MIRROR SCORES ───────────────────────────────────────────────

/**
 * Append a mirror score. Returns the saved record.
 * @param {string} userId
 * @param {{ photoPath?:string, axes:object, overallScore:number, mirrorLevel:string }} entry
 */
function addMirror(userId, entry) {
  const data = load();
  const b = bucket(data, userId);
  const rec = {
    id: crypto.randomUUID(),
    date: istDate(),
    photoPath: entry.photoPath || null,
    axes: entry.axes || {},
    overallScore: entry.overallScore,
    mirrorLevel: entry.mirrorLevel,
    createdAt: new Date().toISOString(),
  };
  b.mirrors.push(rec);
  save(data);
  return rec;
}

/** All mirror scores for a user, oldest first. */
function getMirrors(userId) {
  return bucket(load(), userId).mirrors;
}

/** Most-recent mirror score, or null. */
function latestMirror(userId) {
  const m = getMirrors(userId);
  return m.length ? m[m.length - 1] : null;
}

/** The mirror taken today (IST), or null. */
function mirrorForToday(userId) {
  const today = istDate();
  return getMirrors(userId).find((m) => m.date === today) || null;
}

// ─── PROTOCOL DAYS ───────────────────────────────────────────────

/**
 * Upsert today's protocol day. If one exists for the date it is replaced.
 * @param {string} userId
 * @param {{ items:Array, doNots:Array, generatedFrom?:string, date?:string }} day
 */
function setProtocolDay(userId, day) {
  const data = load();
  const b = bucket(data, userId);
  const date = day.date || istDate();
  b.protocols[date] = {
    date,
    items: (day.items || []).map((it) => ({ ...it, checked: !!it.checked })),
    doNots: day.doNots || [],
    isLocked: false,
    generatedFrom: day.generatedFrom || null,
    createdAt: new Date().toISOString(),
  };
  save(data);
  return b.protocols[date];
}

/** Today's protocol day, or null. */
function getProtocolToday(userId) {
  return bucket(load(), userId).protocols[istDate()] || null;
}

/**
 * Toggle a protocol item's checked state (only when not locked).
 * @returns the updated protocol day, or null if missing/locked.
 */
function checkProtocolItem(userId, itemId, checked) {
  const data = load();
  const b = bucket(data, userId);
  const day = b.protocols[istDate()];
  if (!day || day.isLocked) return null;
  const item = day.items.find((i) => i.itemId === itemId);
  if (!item) return null;
  item.checked = !!checked;
  save(data);
  return day;
}

/** Lock today's protocol day (no more toggles). Returns the locked day or null. */
function lockProtocolToday(userId) {
  const data = load();
  const b = bucket(data, userId);
  const day = b.protocols[istDate()];
  if (!day) return null;
  day.isLocked = true;
  save(data);
  return day;
}

// ─── NIGHT LOG ───────────────────────────────────────────────────
// Last night's sleep / water / salt-alcohol. Powers tomorrow's mirror delta
// context. State-and-habit only — no medical content (passes safety validator).

/** Clamp a number into [lo, hi], returning `def` for non-finite input. */
function clampNum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Upsert tonight's night log (one per IST date — re-logging replaces).
 * @param {string} userId
 * @param {{ sleepHours?:number, waterGlasses?:number, saltAlcoholFlag?:boolean, notes?:string }} entry
 * @returns the saved record
 */
function addNightLog(userId, entry = {}) {
  const data = load();
  const b = bucket(data, userId);
  const date = istDate();
  const rec = {
    date,
    sleepHours: clampNum(entry.sleepHours, 0, 14, null),
    waterGlasses: clampNum(entry.waterGlasses, 0, 15, null),
    saltAlcoholFlag: !!entry.saltAlcoholFlag,
    notes: String(entry.notes || '').slice(0, 280),
    createdAt: new Date().toISOString(),
  };
  const idx = b.nightLogs.findIndex((n) => n.date === date);
  if (idx >= 0) b.nightLogs[idx] = rec;
  else b.nightLogs.push(rec);
  save(data);
  return rec;
}

/** All night logs for a user, oldest first. */
function getNightLogs(userId) {
  return bucket(load(), userId).nightLogs;
}

/** The night log for a specific IST date (YYYY-MM-DD), or null. */
function nightLogForDate(userId, date) {
  return getNightLogs(userId).find((n) => n.date === date) || null;
}

/** Tonight's (today IST) night log, or null. */
function nightLogForToday(userId) {
  return nightLogForDate(userId, istDate());
}

// ─── HAIR TRACKING ───────────────────────────────────────────────

/** Append a hair-tracking record. Returns the saved record. */
function addHair(userId, entry) {
  const data = load();
  const b = bucket(data, userId);
  const rec = {
    id: crypto.randomUUID(),
    date: istDate(),
    frontPath: entry.frontPath || null,
    crownPath: entry.crownPath || null,
    norwood: entry.norwood,
    hairlineScore: entry.hairlineScore,
    recessionMm: entry.recessionMm,
    confidence: entry.confidence || 'low',
    createdAt: new Date().toISOString(),
  };
  b.hair.push(rec);
  save(data);
  return rec;
}

/** All hair records for a user, oldest first. */
function getHair(userId) {
  return bucket(load(), userId).hair;
}

/** Most-recent hair record, or null. */
function latestHair(userId) {
  const h = getHair(userId);
  return h.length ? h[h.length - 1] : null;
}

// ─── OTPs (Lookmaxxing PWA login) ────────────────────────────────
// OTPs remain JSON-only. They are 10-minute login codes whose loss on
// redeploy is inconsequential — the user simply requests a new OTP.
// Moving them to Postgres would add two DB round-trips per login check
// with negligible durability gain. See DECISIONS.md 2026-06-16.

/** Store an OTP for a phone with a TTL (default 10 min). */
function setOtp(phone, otp, ttlMs = 10 * 60 * 1000) {
  const data = load();
  data.otps[phone] = { otp, expiresAt: Date.now() + ttlMs };
  save(data);
}

/** Verify + consume an OTP. Returns true on a valid, unexpired match. */
function verifyOtp(phone, otp) {
  const data = load();
  const rec = data.otps[phone];
  if (!rec) return false;
  const ok = rec.otp === String(otp) && Date.now() < rec.expiresAt;
  if (ok) {
    delete data.otps[phone];
    save(data);
  }
  return ok;
}

// ═══════════════════════════════════════════════════════════════════
// POSTGRES ADAPTER — activated when DATABASE_URL is set.
// Each _pg_* function below mirrors the JSON API exactly.
// ═══════════════════════════════════════════════════════════════════

/** True when the Postgres backend should be used. Mirrors User.js pattern. */
function _usesPg() {
  const be = process.env.MC_DB_BACKEND;
  if (be === 'pg' || be === 'postgres') return true;
  if (be === 'jsonl' || be === 'json') return false;
  return !!process.env.DATABASE_URL;
}

/** Lazy-require db so tests that don't set DATABASE_URL never touch pg. */
function _db() {
  return require('../lib/db'); // eslint-disable-line global-require
}

/**
 * Wrap a JSON-backed function with a pg-backed async alternative.
 * Mirrors _adapt() in models/User.js exactly.
 */
function _adapt(jsonFn, pgFn) {
  return function (...args) {
    if (!_usesPg()) return jsonFn(...args);
    const dbLib = _db();
    if (!dbLib.isAvailable()) return jsonFn(...args);
    return Promise.resolve(pgFn(...args)).catch((err) => {
      const { createLogger } = require('../lib/log'); // eslint-disable-line global-require
      createLogger('LOOKMAX-MODEL').error(
        'PG-FALLBACK',
        `${pgFn.name}: ${err.message} — falling back to JSON`
      );
      return jsonFn(...args);
    });
  };
}

// ── Postgres: mirror ─────────────────────────────────────────────

async function _pg_addMirror(userId, entry) {
  const rec = {
    id: crypto.randomUUID(),
    date: istDate(),
    photoPath: entry.photoPath || null,
    axes: entry.axes || {},
    overallScore: entry.overallScore,
    mirrorLevel: entry.mirrorLevel,
    createdAt: new Date().toISOString(),
  };
  await _db().query(
    `INSERT INTO lookmax_records (id, user_id, kind, date, payload, created_at)
     VALUES ($1, $2, 'mirror', $3, $4, $5)`,
    [rec.id, userId, rec.date, JSON.stringify(rec), rec.createdAt]
  );
  return rec;
}

async function _pg_getMirrors(userId) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'mirror'
     ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map((r) => r.payload);
}

async function _pg_latestMirror(userId) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'mirror'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows.length ? rows[0].payload : null;
}

async function _pg_mirrorForToday(userId) {
  const today = istDate();
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'mirror' AND date = $2
     ORDER BY created_at ASC LIMIT 1`,
    [userId, today]
  );
  return rows.length ? rows[0].payload : null;
}

// ── Postgres: protocol ───────────────────────────────────────────

async function _pg_setProtocolDay(userId, day) {
  const date = day.date || istDate();
  const rec = {
    date,
    items: (day.items || []).map((it) => ({ ...it, checked: !!it.checked })),
    doNots: day.doNots || [],
    isLocked: false,
    generatedFrom: day.generatedFrom || null,
    createdAt: new Date().toISOString(),
  };
  await _db().query(
    `INSERT INTO lookmax_protocols (user_id, date, payload, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id, date) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [userId, date, JSON.stringify(rec)]
  );
  return rec;
}

async function _pg_getProtocolToday(userId) {
  const today = istDate();
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_protocols WHERE user_id = $1 AND date = $2`,
    [userId, today]
  );
  return rows.length ? rows[0].payload : null;
}

async function _pg_checkProtocolItem(userId, itemId, checked) {
  const today = istDate();
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_protocols WHERE user_id = $1 AND date = $2`,
    [userId, today]
  );
  if (!rows.length) return null;
  const day = rows[0].payload;
  if (day.isLocked) return null;
  const item = day.items.find((i) => i.itemId === itemId);
  if (!item) return null;
  item.checked = !!checked;
  await _db().query(
    `UPDATE lookmax_protocols SET payload = $1, updated_at = NOW()
     WHERE user_id = $2 AND date = $3`,
    [JSON.stringify(day), userId, today]
  );
  return day;
}

async function _pg_lockProtocolToday(userId) {
  const today = istDate();
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_protocols WHERE user_id = $1 AND date = $2`,
    [userId, today]
  );
  if (!rows.length) return null;
  const day = rows[0].payload;
  day.isLocked = true;
  await _db().query(
    `UPDATE lookmax_protocols SET payload = $1, updated_at = NOW()
     WHERE user_id = $2 AND date = $3`,
    [JSON.stringify(day), userId, today]
  );
  return day;
}

// ── Postgres: hair ───────────────────────────────────────────────

async function _pg_addHair(userId, entry) {
  const rec = {
    id: crypto.randomUUID(),
    date: istDate(),
    frontPath: entry.frontPath || null,
    crownPath: entry.crownPath || null,
    norwood: entry.norwood,
    hairlineScore: entry.hairlineScore,
    recessionMm: entry.recessionMm,
    confidence: entry.confidence || 'low',
    createdAt: new Date().toISOString(),
  };
  await _db().query(
    `INSERT INTO lookmax_records (id, user_id, kind, date, payload, created_at)
     VALUES ($1, $2, 'hair', $3, $4, $5)`,
    [rec.id, userId, rec.date, JSON.stringify(rec), rec.createdAt]
  );
  return rec;
}

async function _pg_getHair(userId) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'hair'
     ORDER BY created_at ASC`,
    [userId]
  );
  return rows.map((r) => r.payload);
}

async function _pg_latestHair(userId) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'hair'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return rows.length ? rows[0].payload : null;
}

// ── Postgres: night logs ─────────────────────────────────────────

async function _pg_addNightLog(userId, entry = {}) {
  const date = istDate();
  const rec = {
    date,
    sleepHours: clampNum(entry.sleepHours, 0, 14, null),
    waterGlasses: clampNum(entry.waterGlasses, 0, 15, null),
    saltAlcoholFlag: !!entry.saltAlcoholFlag,
    notes: String(entry.notes || '').slice(0, 280),
    createdAt: new Date().toISOString(),
  };
  // Upsert: one nightlog per IST date per user — re-logging replaces.
  await _db().query(
    `INSERT INTO lookmax_records (id, user_id, kind, date, payload, created_at)
     VALUES ($1, $2, 'nightlog', $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [crypto.randomUUID(), userId, date, JSON.stringify(rec), rec.createdAt]
  );
  // The ON CONFLICT DO NOTHING + DELETE+re-insert pattern gives true upsert.
  // Simpler: delete the existing nightlog for today then insert fresh.
  // We use DELETE + INSERT (two queries) rather than ON CONFLICT on a non-PK
  // because lookmax_records PK is (id UUID) — there's no (user_id, kind, date) PK.
  await _db().query(
    `DELETE FROM lookmax_records WHERE user_id = $1 AND kind = 'nightlog' AND date = $2`,
    [userId, date]
  );
  await _db().query(
    `INSERT INTO lookmax_records (id, user_id, kind, date, payload, created_at)
     VALUES ($1, $2, 'nightlog', $3, $4, $5)`,
    [crypto.randomUUID(), userId, date, JSON.stringify(rec), rec.createdAt]
  );
  return rec;
}

async function _pg_getNightLogs(userId) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'nightlog'
     ORDER BY date ASC`,
    [userId]
  );
  return rows.map((r) => r.payload);
}

async function _pg_nightLogForDate(userId, date) {
  const { rows } = await _db().query(
    `SELECT payload FROM lookmax_records
     WHERE user_id = $1 AND kind = 'nightlog' AND date = $2`,
    [userId, date]
  );
  return rows.length ? rows[0].payload : null;
}

async function _pg_nightLogForToday(userId) {
  return _pg_nightLogForDate(userId, istDate());
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS — each daily-journey function wrapped with _adapt().
// OTPs are JSON-only (no _adapt wrapper needed).
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  istDate,

  // Mirror scores
  addMirror:      _adapt(addMirror,      _pg_addMirror),
  getMirrors:     _adapt(getMirrors,     _pg_getMirrors),
  latestMirror:   _adapt(latestMirror,   _pg_latestMirror),
  mirrorForToday: _adapt(mirrorForToday, _pg_mirrorForToday),

  // Protocol days
  setProtocolDay:    _adapt(setProtocolDay,    _pg_setProtocolDay),
  getProtocolToday:  _adapt(getProtocolToday,  _pg_getProtocolToday),
  checkProtocolItem: _adapt(checkProtocolItem, _pg_checkProtocolItem),
  lockProtocolToday: _adapt(lockProtocolToday, _pg_lockProtocolToday),

  // Hair tracking
  addHair:     _adapt(addHair,     _pg_addHair),
  getHair:     _adapt(getHair,     _pg_getHair),
  latestHair:  _adapt(latestHair,  _pg_latestHair),

  // Night logs
  addNightLog:     _adapt(addNightLog,     _pg_addNightLog),
  getNightLogs:    _adapt(getNightLogs,    _pg_getNightLogs),
  nightLogForDate: _adapt(nightLogForDate, _pg_nightLogForDate),
  nightLogForToday: _adapt(nightLogForToday, _pg_nightLogForToday),

  // OTPs — JSON-only (ephemeral login codes; loss on redeploy is benign).
  setOtp,
  verifyOtp,
};
