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

module.exports = {
  createSession,
  getSession,
  updateSession,
  purgeExpired,
  isExpired,
  TTL_MS,
};
