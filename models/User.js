/**
 * ═══════════════════════════════════════════════════════════════════
 * USER MODEL — JSON-file-backed database
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths can be overridden via env (used by tests to avoid touching real data).
const USERS_FILE = process.env.USERS_FILE_PATH || path.join(__dirname, '..', 'data', 'users.json');
const WAITLIST_FILE =
  process.env.WAITLIST_FILE_PATH || path.join(__dirname, '..', 'data', 'waitlist.json');

// Ensure data directory and files exist
function ensureFiles() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
  if (!fs.existsSync(WAITLIST_FILE)) fs.writeFileSync(WAITLIST_FILE, '[]');
}

ensureFiles();

// ═══════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/**
 * Create a new user. Returns the created user object.
 */
function createUser({ name, phone, pillar = 'orator', preferredTime = '08:00' }) {
  const users = loadUsers();
  
  // Normalise phone: strip +, spaces, ensure 91 prefix
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;

  // Check if user already exists
  if (users[phone]) {
    return users[phone];
  }

  const token = crypto.randomUUID();

  const user = {
    token,
    name,
    phone,
    pillar,
    preferredTime,
    enrolledAt: new Date().toISOString(),
    day: 0,                    // 0 = enrolled, not started
    status: 'active',          // active | paused | completed | subscribed
    trialComplete: false,
    awaitingResponse: false,   // true when morning msg sent, waiting for reply
    lastMorningSent: null,     // ISO date string of last morning message
    lastEveningSent: null,     // ISO date string of last evening message
    scores: [],                // [{day, fluency, confidenceTone, fillerFrequency, vocabularyRange, structure, timestamp}]
    wordsLearned: [],          // [{word, definition, day, status:'forged'|'mastered'}]
    chronicle: [],             // [{day, prompt, userResponse, consultantResponse, timestamp}]
    rank: 'unawakened',        // unawakened | seeker | ascendant | luminary | sovereign
    streak: 0,
    lastActive: new Date().toISOString(),
    subscriptionStatus: 'trial', // trial | active | cancelled
    razorpayCustomerId: null,
    notes: '',

    // ── Night-2: Lookmaxxing + Aura++ (P0.5) ──
    email: null,                 // optional secondary identifier (receipts/digests)
    oratorActive: false,         // paid Orator subscription live
    lookmaxxingActive: false,    // paid Lookmaxxing subscription live
    // auraPlusPlus is computed, never stored — see computeAuraStatus().
    mirrorLevel: 'raw',          // raw | polished | magnetic | radiant | sovereign
    auditSessionId: null,        // links to the AuditSession that converted them
    lookmaxxingStartedAt: null,  // ISO date Lookmaxxing protocol began (Day-30 trigger)
    pushSubscription: null,      // web-push PushSubscription JSON (PWA notifications)

    // ── Login Gate (P0-1) — email magic-link auth fields ──
    // All nullable; written lazily by auth routes / webhook. Never stored in
    // plaintext logs (lib/log-mask.js). See spec-login-gate.md §6.
    magicLinkToken: null,        // 32-byte hex, single-use, TTL via magicLinkExpiresAt
    magicLinkExpiresAt: null,    // ms epoch; null = not set
    magicLinkConsumedAt: null,   // ISO date when consumed; null = not yet used
    firstLoginToken: null,       // 32-byte hex minted at subscription.activated webhook
    firstLoginExpiresAt: null,   // ms epoch; 15 min TTL from webhook mint
    firstLoginConsumedAt: null,  // ISO date when exchanged; null = not yet used

    // ── NOW-2 / B2 — Day-30 re-audit engine ──
    // lookmaxBaseline is set at subscription.activated (see routes/api.js).
    // reAuditResult and reAuditCompletedThisCycle are set by routes/reaudit.js.
    // DPDPA: lookmaxBaseline.photoStorageKeys contains R2 keys — never returned
    // to any client-facing endpoint (must be stripped in routes/reaudit.js).
    lookmaxBaseline: null,          // { scores, leverageAxis, overall, capturedAt, photoStorageKeys }
    reAuditCompletedThisCycle: false, // true after the first Day-30 re-audit completes
    reAuditResult: null,            // { scores, deltas, overallDelta, mirrorLevel, completedAt }
  };

  users[phone] = user;
  saveUsers(users);
  return user;
}

/**
 * Get user by phone number.
 */
function getUserByPhone(phone) {
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const users = loadUsers();
  return users[phone] || null;
}

/**
 * Get user by dashboard token.
 */
function getUserByToken(token) {
  const users = loadUsers();
  return Object.values(users).find(u => u.token === token) || null;
}

/**
 * Get user by email address (case-insensitive, trimmed). Used by the
 * email magic-link login path (Login Gate P0-1). Tolerates legacy records
 * that have no email field.
 * @param {string|null|undefined} email
 * @returns {object|null}
 */
function getUserByEmail(email) {
  if (!email) return null;
  const target = String(email).trim().toLowerCase();
  if (!target) return null;
  const users = loadUsers();
  return Object.values(users).find(
    (u) => u.email && String(u.email).trim().toLowerCase() === target
  ) || null;
}

/**
 * Get user by their Razorpay subscription id (set at checkout). Used by the
 * post-payment confirmation page (P6).
 * @param {string} subscriptionId
 */
function getUserBySubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;
  const users = loadUsers();
  return Object.values(users).find(u => u.razorpaySubscriptionId === subscriptionId) || null;
}

/**
 * Update user fields (partial update).
 */
function updateUser(phone, updates) {
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const users = loadUsers();
  if (!users[phone]) return null;

  Object.assign(users[phone], updates, { lastActive: new Date().toISOString() });
  saveUsers(users);
  return users[phone];
}

/**
 * Permanently delete a user by phone (or synthetic email-id). This frees the
 * email so the person must sign up again from scratch; their stateless JWT also
 * stops resolving (getUserByToken → null), so any open session is invalidated.
 * Returns true if a record was removed, false if no such user.
 */
function deleteUser(phone) {
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const users = loadUsers();
  if (!users[phone]) return false;
  delete users[phone];
  saveUsers(users);
  return true;
}

/**
 * Add a score entry for a specific day.
 */
function addScore(phone, scoreEntry) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  users[phone].scores.push({
    ...scoreEntry,
    timestamp: new Date().toISOString(),
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Add a chronicle (conversation log) entry.
 */
function addChronicle(phone, entry) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  users[phone].chronicle.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Add words learned for a specific day.
 */
function addWordsLearned(phone, words, day) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  words.forEach(w => {
    // Check if word already exists
    const existing = users[phone].wordsLearned.find(wl => wl.word === w.word);
    if (!existing) {
      users[phone].wordsLearned.push({
        word: w.word,
        definition: w.definition,
        day,
        status: 'forged',
      });
    }
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Mark a word as mastered.
 */
function masterWord(phone, word) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  const w = users[phone].wordsLearned.find(wl => wl.word.toUpperCase() === word.toUpperCase());
  if (w) w.status = 'mastered';
  saveUsers(users);
  return users[phone];
}

/**
 * Get all users.
 */
function getAllUsers() {
  return loadUsers();
}

/**
 * Get active users who need their message at the given time.
 */
function getUsersForTime(timeStr) {
  const users = loadUsers();
  return Object.values(users).filter(u =>
    u.status === 'active' &&
    u.preferredTime === timeStr &&
    !u.awaitingResponse &&
    u.day < 7
  );
}

/**
 * Get users who need their evening score at the given time.
 * Evening = preferredTime + 12 hours.
 */
function getUsersForEveningTime(timeStr) {
  const users = loadUsers();
  return Object.values(users).filter(u => {
    if (u.status !== 'active' || u.day < 1 || u.day > 7) return false;
    // Calculate evening time (preferred + 12h)
    const [h] = u.preferredTime.split(':').map(Number);
    const eveningH = (h + 12) % 24;
    const eveningTime = `${String(eveningH).padStart(2, '0')}:${u.preferredTime.split(':')[1]}`;
    return eveningTime === timeStr;
  });
}

// ═══════════════════════════════════════════════════════════════════
// WAITLIST
// ═══════════════════════════════════════════════════════════════════

function loadWaitlist() {
  try {
    return JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Compute Aura++ status from the two subscription flags. Aura++ is a STATUS,
 * not a SKU (DECISIONS.md, Night-2 #3): a user holds it when both pillars are
 * active. Never stored — always derived so the flags stay the single truth.
 * @param {object} user
 * @returns {{ oratorActive: boolean, lookmaxxingActive: boolean, auraPlusPlus: boolean }}
 */
function computeAuraStatus(user) {
  const oratorActive = !!(user && user.oratorActive);
  const lookmaxxingActive = !!(user && user.lookmaxxingActive);
  return { oratorActive, lookmaxxingActive, auraPlusPlus: oratorActive && lookmaxxingActive };
}

function addToWaitlist(phone, pillar) {
  const list = loadWaitlist();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;

  // Don't duplicate
  if (list.find(e => e.phone === phone && e.pillar === pillar)) return false;

  list.push({ phone, pillar, timestamp: new Date().toISOString() });
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
  return true;
}

function getWaitlist() {
  return loadWaitlist();
}

// ═══════════════════════════════════════════════════════════════════
// POSTGRES ADAPTER (B0) — activated when DATABASE_URL is set.
// Each function below mirrors the JSON API exactly so callers need no changes.
// The JSON path remains the fallback when pg is unavailable.
// ═══════════════════════════════════════════════════════════════════

/** True when the Postgres backend should be used. */
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

/** Convert a Postgres row (snake_case) back to the JSON-model shape. */
function _rowToUser(row) {
  if (!row) return null;
  return {
    token:                   row.token,
    name:                    row.name,
    phone:                   row.phone,
    email:                   row.email || null,
    pillar:                  row.pillar,
    preferredTime:           row.preferred_time,
    enrolledAt:              row.enrolled_at,
    day:                     row.day,
    status:                  row.status,
    trialComplete:           row.trial_complete,
    awaitingResponse:        row.awaiting_response,
    lastMorningSent:         row.last_morning_sent,
    lastEveningSent:         row.last_evening_sent,
    scores:                  row.scores || [],
    wordsLearned:            row.words_learned || [],
    chronicle:               row.chronicle || [],
    rank:                    row.rank,
    streak:                  row.streak,
    lastActive:              row.last_active,
    subscriptionStatus:      row.subscription_status,
    razorpayCustomerId:      row.razorpay_customer_id || null,
    razorpaySubscriptionId:  row.razorpay_subscription_id || null,
    notes:                   row.notes || '',
    oratorActive:            row.orator_active,
    lookmaxxingActive:       row.lookmaxxing_active,
    mirrorLevel:             row.mirror_level,
    auditSessionId:          row.audit_session_id || null,
    lookmaxxingStartedAt:    row.lookmaxxing_started_at || null,
    oratorStartedAt:         row.orator_started_at || null,
    pushSubscription:        row.push_subscription || null,
    lookmaxBaseline:         row.lookmax_baseline || null,
    lookmaxStreak:           row.lookmax_streak || 0,
    lookmaxProtocolStreak:   row.lookmax_protocol_streak || 0,
    lastMirrorAt:            row.last_mirror_at || null,
    magicLinkToken:          row.magic_link_token || null,
    magicLinkExpiresAt:      row.magic_link_expires_at || null,
    magicLinkConsumedAt:     row.magic_link_consumed_at || null,
    firstLoginToken:         row.first_login_token || null,
    firstLoginExpiresAt:     row.first_login_expires_at || null,
    firstLoginConsumedAt:    row.first_login_consumed_at || null,
    // NOW-2 / B2 — Day-30 re-audit fields
    reAuditCompletedThisCycle: row.re_audit_completed_this_cycle || false,
    reAuditResult:           row.re_audit_result || null,
  };
}

/**
 * Normalise a phone the same way the JSON model does (strip +/space, add 91 prefix).
 * Duplicated here to avoid cross-file import (keeps model self-contained).
 */
function _normalizePhone(phone) {
  let p = String(phone).replace(/[\s+\-]/g, '');
  if (p.length === 10) p = '91' + p;
  return p;
}

// ── Postgres implementations ─────────────────────────────────────

async function _pg_createUser({ name, phone, pillar = 'orator', preferredTime = '08:00' }) {
  const normalised = _normalizePhone(phone);
  const db = _db();
  // Check existing
  const { rows: existing } = await db.query('SELECT * FROM users WHERE phone = $1', [normalised]);
  if (existing.length) return _rowToUser(existing[0]);

  const token = crypto.randomUUID();
  const { rows } = await db.query(
    `INSERT INTO users (token, name, phone, pillar, preferred_time)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (phone) DO NOTHING
     RETURNING *`,
    [token, name, normalised, pillar, preferredTime]
  );
  if (rows.length) return _rowToUser(rows[0]);
  // Race: another insert won; fetch the winner
  const { rows: winner } = await db.query('SELECT * FROM users WHERE phone = $1', [normalised]);
  return _rowToUser(winner[0]);
}

async function _pg_getUserByPhone(phone) {
  const normalised = _normalizePhone(phone);
  const { rows } = await _db().query('SELECT * FROM users WHERE phone = $1', [normalised]);
  return _rowToUser(rows[0] || null);
}

async function _pg_getUserByToken(token) {
  const { rows } = await _db().query('SELECT * FROM users WHERE token = $1', [token]);
  return _rowToUser(rows[0] || null);
}

async function _pg_deleteUser(phone) {
  const normalised = _normalizePhone(phone);
  const { rowCount } = await _db().query('DELETE FROM users WHERE phone = $1', [normalised]);
  return rowCount > 0;
}

async function _pg_getUserByEmail(email) {
  if (!email) return null;
  const target = String(email).trim().toLowerCase();
  if (!target) return null;
  const { rows } = await _db().query(
    'SELECT * FROM users WHERE LOWER(email) = $1',
    [target]
  );
  return _rowToUser(rows[0] || null);
}

async function _pg_getUserBySubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;
  const { rows } = await _db().query(
    'SELECT * FROM users WHERE razorpay_subscription_id = $1',
    [subscriptionId]
  );
  return _rowToUser(rows[0] || null);
}

async function _pg_updateUser(phone, updates) {
  const normalised = _normalizePhone(phone);
  // Map JS camelCase keys to SQL snake_case columns
  const colMap = {
    name: 'name', email: 'email', pillar: 'pillar', preferredTime: 'preferred_time',
    day: 'day', status: 'status', trialComplete: 'trial_complete',
    awaitingResponse: 'awaiting_response', lastMorningSent: 'last_morning_sent',
    lastEveningSent: 'last_evening_sent', scores: 'scores', wordsLearned: 'words_learned',
    chronicle: 'chronicle', rank: 'rank', streak: 'streak', subscriptionStatus: 'subscription_status',
    razorpayCustomerId: 'razorpay_customer_id', razorpaySubscriptionId: 'razorpay_subscription_id',
    notes: 'notes', oratorActive: 'orator_active', lookmaxxingActive: 'lookmaxxing_active',
    mirrorLevel: 'mirror_level', auditSessionId: 'audit_session_id',
    lookmaxxingStartedAt: 'lookmaxxing_started_at', oratorStartedAt: 'orator_started_at',
    pushSubscription: 'push_subscription', lookmaxBaseline: 'lookmax_baseline',
    lookmaxStreak: 'lookmax_streak', lookmaxProtocolStreak: 'lookmax_protocol_streak',
    lastMirrorAt: 'last_mirror_at', magicLinkToken: 'magic_link_token',
    magicLinkExpiresAt: 'magic_link_expires_at', magicLinkConsumedAt: 'magic_link_consumed_at',
    firstLoginToken: 'first_login_token', firstLoginExpiresAt: 'first_login_expires_at',
    firstLoginConsumedAt: 'first_login_consumed_at', lastActive: 'last_active',
    // NOW-2 / B2 — Day-30 re-audit
    reAuditCompletedThisCycle: 're_audit_completed_this_cycle',
    reAuditResult: 're_audit_result',
  };

  const setClauses = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    const col = colMap[key];
    if (!col) continue; // skip unknown keys
    // JSONB columns
    if (['scores', 'wordsLearned', 'chronicle', 'pushSubscription', 'lookmaxBaseline', 'reAuditResult'].includes(key)) {
      setClauses.push(`${col} = $${params.push(JSON.stringify(val))}`);
    } else {
      setClauses.push(`${col} = $${params.push(val)}`);
    }
  }
  if (!setClauses.length) return _pg_getUserByPhone(phone);

  // Always bump updated_at + last_active
  setClauses.push(`updated_at = NOW()`);
  setClauses.push(`last_active = NOW()`);

  params.push(normalised);
  const { rows } = await _db().query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE phone = $${params.length} RETURNING *`,
    params
  );
  return _rowToUser(rows[0] || null);
}

async function _pg_addScore(phone, scoreEntry) {
  const normalised = _normalizePhone(phone);
  const db = _db();
  const { rows } = await db.query('SELECT scores FROM users WHERE phone = $1', [normalised]);
  if (!rows.length) return null;
  const scores = rows[0].scores || [];
  scores.push({ ...scoreEntry, timestamp: new Date().toISOString() });
  await db.query('UPDATE users SET scores = $1, updated_at = NOW() WHERE phone = $2', [JSON.stringify(scores), normalised]);
  return _pg_getUserByPhone(phone);
}

async function _pg_addChronicle(phone, entry) {
  const normalised = _normalizePhone(phone);
  const db = _db();
  const { rows } = await db.query('SELECT chronicle FROM users WHERE phone = $1', [normalised]);
  if (!rows.length) return null;
  const chronicle = rows[0].chronicle || [];
  chronicle.push({ ...entry, timestamp: new Date().toISOString() });
  await db.query('UPDATE users SET chronicle = $1, updated_at = NOW() WHERE phone = $2', [JSON.stringify(chronicle), normalised]);
  return _pg_getUserByPhone(phone);
}

async function _pg_addWordsLearned(phone, words, day) {
  const normalised = _normalizePhone(phone);
  const db = _db();
  const { rows } = await db.query('SELECT words_learned FROM users WHERE phone = $1', [normalised]);
  if (!rows.length) return null;
  const existing = rows[0].words_learned || [];
  for (const w of words) {
    if (!existing.find((wl) => wl.word === w.word)) {
      existing.push({ word: w.word, definition: w.definition, day, status: 'forged' });
    }
  }
  await db.query('UPDATE users SET words_learned = $1, updated_at = NOW() WHERE phone = $2', [JSON.stringify(existing), normalised]);
  return _pg_getUserByPhone(phone);
}

async function _pg_masterWord(phone, word) {
  const normalised = _normalizePhone(phone);
  const db = _db();
  const { rows } = await db.query('SELECT words_learned FROM users WHERE phone = $1', [normalised]);
  if (!rows.length) return null;
  const list = rows[0].words_learned || [];
  const w = list.find((wl) => wl.word.toUpperCase() === word.toUpperCase());
  if (w) w.status = 'mastered';
  await db.query('UPDATE users SET words_learned = $1, updated_at = NOW() WHERE phone = $2', [JSON.stringify(list), normalised]);
  return _pg_getUserByPhone(phone);
}

async function _pg_getAllUsers() {
  const { rows } = await _db().query('SELECT * FROM users ORDER BY enrolled_at');
  const map = {};
  for (const row of rows) {
    const u = _rowToUser(row);
    map[u.phone] = u;
  }
  return map;
}

async function _pg_getUsersForTime(timeStr) {
  const { rows } = await _db().query(
    `SELECT * FROM users WHERE status = 'active' AND preferred_time = $1
     AND awaiting_response = FALSE AND day < 7`,
    [timeStr]
  );
  return rows.map(_rowToUser);
}

async function _pg_getUsersForEveningTime(timeStr) {
  const { rows } = await _db().query(
    `SELECT * FROM users WHERE status = 'active' AND day >= 1 AND day <= 7`,
    []
  );
  return rows.map(_rowToUser).filter((u) => {
    const [h] = u.preferredTime.split(':').map(Number);
    const eveningH = (h + 12) % 24;
    const eveningTime = `${String(eveningH).padStart(2, '0')}:${u.preferredTime.split(':')[1]}`;
    return eveningTime === timeStr;
  });
}

/**
 * Wrap a JSON-backed function with a pg-backed async alternative.
 * When pg backend is active: calls pgFn. On error: logs and falls back to jsonFn.
 * When json backend: calls jsonFn directly (sync OK).
 */
function _adapt(jsonFn, pgFn) {
  return function (...args) {
    if (!_usesPg()) return jsonFn(...args);
    const dbLib = _db();
    if (!dbLib.isAvailable()) return jsonFn(...args);
    return Promise.resolve(pgFn(...args)).catch((err) => {
      const { createLogger } = require('../lib/log'); // eslint-disable-line global-require
      createLogger('USER-MODEL').error('PG-FALLBACK', `${pgFn.name}: ${err.message} — falling back to JSON`);
      return jsonFn(...args);
    });
  };
}

module.exports = {
  createUser:              _adapt(createUser,              _pg_createUser),
  getUserByPhone:          _adapt(getUserByPhone,          _pg_getUserByPhone),
  getUserByToken:          _adapt(getUserByToken,          _pg_getUserByToken),
  getUserByEmail:          _adapt(getUserByEmail,          _pg_getUserByEmail),
  getUserBySubscriptionId: _adapt(getUserBySubscriptionId, _pg_getUserBySubscriptionId),
  updateUser:              _adapt(updateUser,              _pg_updateUser),
  deleteUser:              _adapt(deleteUser,              _pg_deleteUser),
  addScore:                _adapt(addScore,                _pg_addScore),
  addChronicle:            _adapt(addChronicle,            _pg_addChronicle),
  addWordsLearned:         _adapt(addWordsLearned,         _pg_addWordsLearned),
  masterWord:              _adapt(masterWord,              _pg_masterWord),
  computeAuraStatus,        // pure function, no storage — same for both
  getAllUsers:              _adapt(getAllUsers,              _pg_getAllUsers),
  getUsersForTime:         _adapt(getUsersForTime,         _pg_getUsersForTime),
  getUsersForEveningTime:  _adapt(getUsersForEveningTime,  _pg_getUsersForEveningTime),
  // Waitlist remains JSON-backed (low volume, not user-critical)
  addToWaitlist,
  getWaitlist,
};

/**
 * Find-or-create a user by email — the entry point for email/Google sign-ups that
 * have no WhatsApp phone yet (the Lookmaxing funnel, where sign-in precedes the audit).
 *
 * The User model is phone-keyed (`phone TEXT NOT NULL UNIQUE`). Email/OAuth accounts
 * are therefore keyed by a SYNTHETIC phone id (`e` + 18 hex chars) — never collides
 * with a real 10/12-digit number and survives phone-normalisation unchanged. The real
 * identity is `email`; a real phone can be attached later if the user takes up Orator.
 * Decision logged in DECISIONS.md (funnel-repair P2).
 *
 * Composes the backend-adapted exports above, so it works under both JSON and Postgres.
 * @param {{email:string, name?:string, provider?:string}} params
 * @returns {Promise<object>} the live user record
 */
async function getOrCreateByEmail({ email, name, provider = 'email' }) {
  const normalised = String(email || '').trim().toLowerCase();
  if (!normalised || !normalised.includes('@')) {
    throw new Error('getOrCreateByEmail requires a valid email');
  }
  const existing = await module.exports.getUserByEmail(normalised);
  if (existing) return existing;

  const synthetic = 'e' + crypto.randomBytes(9).toString('hex'); // 19 chars, non-numeric
  await module.exports.createUser({ name: name || 'Seeker', phone: synthetic, pillar: 'aesthetic' });
  return module.exports.updateUser(synthetic, { email: normalised, authProvider: provider });
}

module.exports.getOrCreateByEmail = getOrCreateByEmail;
