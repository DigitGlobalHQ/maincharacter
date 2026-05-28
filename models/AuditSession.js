/**
 * ═══════════════════════════════════════════════════════════════════
 * AUDIT SESSION MODEL — JSON-file-backed store (Night-2, P0.5/P3.2)
 * ═══════════════════════════════════════════════════════════════════
 *
 * The Aesthetic Audit runs BEFORE a user has an account (audit is fully free,
 * no gate — DECISIONS.md Night-2 #1), so sessions live in their own store keyed
 * by an opaque sessionToken. Sessions expire after 24h. Mirrors the JSON-store
 * pattern in models/User.js; swaps to Postgres later when DATABASE_URL is set.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSIONS_FILE =
  process.env.AUDIT_SESSIONS_FILE_PATH ||
  path.join(__dirname, '..', 'data', 'audit-sessions.json');

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ensureFile() {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, '{}');
}
ensureFile();

function load() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

/** True when a session is older than the TTL. */
function isExpired(session) {
  if (!session || !session.createdAt) return true;
  return Date.now() - new Date(session.createdAt).getTime() > TTL_MS;
}

/**
 * Create a fresh audit session.
 * @param {{ intent?: string, reAudit?: boolean, userToken?: string|null }} [opts]
 * @returns {object} the created session (includes sessionToken)
 */
function createSession(opts = {}) {
  const sessions = load();
  const sessionToken = crypto.randomUUID();
  const session = {
    sessionToken,
    intent: opts.intent || null,        // e.g. 'bundle' from /audit?intent=bundle
    reAudit: !!opts.reAudit,            // Day-30 re-audit (P10)
    userToken: opts.userToken || null,  // set on a re-audit of an existing user
    quizAnswers: null,                  // { questionId: answer }
    photos: [],                         // [{ kind:'front'|'side'|'body', url }]
    aestheticScores: null,              // 8-axis scores from vision.scoreAesthetic
    weakestAxis: null,
    hairReceding: null,                 // { detected, norwoodEstimate, hairlineScore }
    diagnosis: null,                    // Consultant-voice text
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  sessions[sessionToken] = session;
  save(sessions);
  return session;
}

/** Get a session by token. Returns null if missing or expired. */
function getSession(sessionToken) {
  if (!sessionToken) return null;
  const sessions = load();
  const s = sessions[sessionToken];
  if (!s) return null;
  if (isExpired(s)) return null;
  return s;
}

/**
 * Partial-update a session. Returns the updated session, or null if missing/expired.
 * @param {string} sessionToken
 * @param {object} updates
 */
function updateSession(sessionToken, updates) {
  const sessions = load();
  const s = sessions[sessionToken];
  if (!s || isExpired(s)) return null;
  Object.assign(s, updates);
  save(sessions);
  return s;
}

/** Remove expired sessions; returns the number purged. Safe to call on a cron. */
function purgeExpired() {
  const sessions = load();
  let purged = 0;
  for (const [token, s] of Object.entries(sessions)) {
    if (isExpired(s)) {
      delete sessions[token];
      purged += 1;
    }
  }
  if (purged) save(sessions);
  return purged;
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

function _rowToSession(row) {
  if (!row) return null;
  return {
    sessionToken:    row.session_token,
    intent:          row.intent || null,
    reAudit:         row.re_audit,
    userToken:       row.user_token || null,
    quizAnswers:     row.quiz_answers || null,
    photos:          row.photos || [],
    aestheticScores: row.aesthetic_scores || null,
    weakestAxis:     row.weakest_axis || null,
    hairReceding:    row.hair_receding || null,
    diagnosis:       row.diagnosis || null,
    createdAt:       row.created_at,
    completedAt:     row.completed_at || null,
  };
}

async function _pg_createSession(opts = {}) {
  const sessionToken = crypto.randomUUID();
  const { rows } = await _db().query(
    `INSERT INTO audit_sessions
       (session_token, intent, re_audit, user_token, photos,
        expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '24 hours')
     RETURNING *`,
    [sessionToken, opts.intent || null, !!opts.reAudit, opts.userToken || null, '[]']
  );
  return _rowToSession(rows[0]);
}

async function _pg_getSession(sessionToken) {
  if (!sessionToken) return null;
  const { rows } = await _db().query(
    `SELECT * FROM audit_sessions WHERE session_token = $1 AND expires_at > NOW()`,
    [sessionToken]
  );
  const s = rows[0] ? _rowToSession(rows[0]) : null;
  return s;
}

async function _pg_updateSession(sessionToken, updates) {
  const colMap = {
    quizAnswers: 'quiz_answers', photos: 'photos',
    aestheticScores: 'aesthetic_scores', weakestAxis: 'weakest_axis',
    hairReceding: 'hair_receding', diagnosis: 'diagnosis',
    completedAt: 'completed_at', createdAt: 'created_at', userToken: 'user_token',
  };
  const jsonbCols = new Set(['quizAnswers', 'photos', 'aestheticScores', 'hairReceding']);

  const setClauses = [];
  const params = [];
  for (const [key, val] of Object.entries(updates)) {
    const col = colMap[key];
    if (!col) continue;
    if (jsonbCols.has(key)) {
      setClauses.push(`${col} = $${params.push(JSON.stringify(val))}`);
    } else {
      setClauses.push(`${col} = $${params.push(val)}`);
    }
  }
  if (!setClauses.length) return _pg_getSession(sessionToken);

  params.push(sessionToken);
  const { rows } = await _db().query(
    `UPDATE audit_sessions SET ${setClauses.join(', ')}
     WHERE session_token = $${params.length} AND expires_at > NOW()
     RETURNING *`,
    params
  );
  return _rowToSession(rows[0] || null);
}

async function _pg_purgeExpired() {
  const { rowCount } = await _db().query(
    `DELETE FROM audit_sessions WHERE expires_at <= NOW()`
  );
  return rowCount || 0;
}

function _adapt(jsonFn, pgFn) {
  return function (...args) {
    if (!_usesPg()) return jsonFn(...args);
    const dbLib = _db();
    if (!dbLib.isAvailable()) return jsonFn(...args);
    return Promise.resolve(pgFn(...args)).catch((err) => {
      const { createLogger } = require('../lib/log'); // eslint-disable-line global-require
      createLogger('AUDIT-SESSION').error('PG-FALLBACK', `${pgFn.name}: ${err.message}`);
      return jsonFn(...args);
    });
  };
}

module.exports = {
  createSession: _adapt(createSession, _pg_createSession),
  getSession:    _adapt(getSession,    _pg_getSession),
  updateSession: _adapt(updateSession, _pg_updateSession),
  purgeExpired:  _adapt(purgeExpired,  _pg_purgeExpired),
  isExpired,
  TTL_MS,
};
