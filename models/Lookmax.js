/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAX MODEL — JSON-file-backed Lookmaxxing records (Night-4)
 * ═══════════════════════════════════════════════════════════════════
 *
 * One store for every Lookmaxxing sub-record so the PWA (mirror, protocol,
 * hair, reveal) and the OTP login share a single persistence seam. Keyed by
 * the User token (userId). Mirrors models/User.js; swaps to Postgres later.
 *
 * Shape:
 *   {
 *     users: {
 *       [userId]: {
 *         mirrors:   [ { id, date, photoPath, axes, overallScore, mirrorLevel, createdAt } ],
 *         protocols: { [date]: { date, items:[{itemId,checked}], doNots:[ids], isLocked, generatedFrom, createdAt } },
 *         hair:      [ { id, date, frontPath, crownPath, norwood, hairlineScore, recessionMm, confidence, createdAt } ],
 *       }
 *     },
 *     otps: { [phone]: { otp, expiresAt } }
 *   }
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

module.exports = {
  istDate,
  addMirror,
  getMirrors,
  latestMirror,
  mirrorForToday,
  setProtocolDay,
  getProtocolToday,
  checkProtocolItem,
  lockProtocolToday,
  addHair,
  getHair,
  latestHair,
  addNightLog,
  getNightLogs,
  nightLogForDate,
  nightLogForToday,
  setOtp,
  verifyOtp,
};
