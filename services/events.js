/**
 * ═══════════════════════════════════════════════════════════════════
 * services/events.js — KPI event sink (B5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Public API:
 *   events.track(name, props, userToken)         // identified user
 *   events.trackAnonymous(name, props, anonId)   // pre-account / anonymous
 *   events.query({ name?, since?, until? })       // admin tiles + tests
 *   events.flush()                                // test-only; drains write queue
 *
 * All callers MUST NOT await track() / trackAnonymous() in route handlers.
 * Fire-and-forget pattern: call.catch(() => {}).
 *
 * Backend selection (DECISIONS.md B5):
 *   EVENTS_BACKEND=postgres  → Postgres (post-B0)
 *   EVENTS_BACKEND=file      → JSONL (forced, e.g. in tests)
 *   unset + DATABASE_URL set → Postgres
 *   unset + no DATABASE_URL  → JSONL
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');

const log = createLogger('EVENTS');

// ──────────────────────────────────────────────────────────────────────────────
// 1. Event allowlist — matches §1 of the spec exactly.
//    Any name not in this set is silently dropped.
// ──────────────────────────────────────────────────────────────────────────────

const ALLOWED_EVENTS = new Set([
  // Acquisition
  'landing_viewed',
  'audit_started',
  'audit_quiz_completed',
  'audit_photos_submitted',
  'audit_analysis_completed',
  'audit_result_viewed',
  'paywall_viewed',
  'paywall_cta_clicked',
  'recover_link_copied',
  'recover_link_shared',
  // Activation
  'enroll_submitted',
  'early_access_submitted',
  'payment_initiated',
  'payment_succeeded',
  'payment_failed',
  'lookmax_first_login',
  'lookmax_first_mirror_taken',
  // Habit
  'mirror_taken',
  'mirror_score_returned',
  'protocol_task_completed',
  'protocol_day_completed',
  'hair_tracked',
  'daily_streak_extended',
  'daily_streak_broken',
  // Retention
  'dashboard_loaded',
  'reveal_watched',
  // NOW-2 / B2 — Day-30 re-audit KPI events (4 events per NOW-2 spec)
  'reaudit_card_shown',
  'reaudit_started',
  'reaudit_completed',
  'reaudit_reveal_viewed',
  // Conversion
  'bundle_attached',
  'cross_sell_orator_shown',
  'cross_sell_orator_clicked',
  // Loss
  'payment_cancelled',
  'cross_sell_orator_reshow',
  'recovery_message_sent',
  // Referral
  'share_card_generated',
  // Stage-1 Audit Engine — Lookmaxing funnel (stage-1-audit-spec.md §8)
  'lookmaxing_landing_viewed',
  'lookmaxing_video_played',
  'lookmaxing_video_watched_50',
  'lookmaxing_video_watched_90',
  'lookmaxing_cta_clicked',
  'lookmaxing_fork_guest',
  'lookmaxing_fork_signin',
  'lookmaxing_quiz_started',
  'lookmaxing_quiz_q1_answered',
  'lookmaxing_quiz_q2_answered',
  'lookmaxing_quiz_q3_answered',
  'lookmaxing_quiz_q4_answered',
  'lookmaxing_quiz_q5_answered',
  'lookmaxing_quiz_completed',
  'lookmaxing_photo_uploaded',
  'lookmaxing_audit_generated',
  'lookmaxing_audit_viewed',
  'lookmaxing_paywall_viewed',
  'lookmaxing_paywall_blurred_metric_tapped',
  'lookmaxing_pay_initiated',
  'lookmaxing_pay_succeeded',
  'lookmaxing_pay_failed',
  'lookmaxing_merge_completed',
  'lookmaxing_pdf_downloaded',
  'lookmaxing_fork_trial',
  'lookmaxing_fork_premium',
  'orator_waitlist_joined',
]);

// ──────────────────────────────────────────────────────────────────────────────
// 2. PII guard — strip any prop key matching sensitive patterns
// ──────────────────────────────────────────────────────────────────────────────

const PII_KEY_RE = /phone|email|password|^name$/i;

function sanitizeProps(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (PII_KEY_RE.test(k)) continue;
    // Only accept primitive values (no nested objects, no object arrays)
    if (v !== null && typeof v === 'object') continue;
    if (Array.isArray(v)) continue;
    out[k] = v;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. ID generator — ULID-like monotonic id without external dependency
// ──────────────────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. File backend — JSONL append-only
// ──────────────────────────────────────────────────────────────────────────────

function jsonlPath() {
  return (
    process.env.EVENTS_JSONL_PATH ||
    path.join(__dirname, '..', 'data', 'events.jsonl')
  );
}

// Write queue: pending lines waiting to be flushed to disk.
// This keeps the write truly async and allows flush() to drain it in tests.
let _pendingLines = [];
let _flushScheduled = false;

function scheduleFlush() {
  if (_flushScheduled) return;
  _flushScheduled = true;
  // setImmediate so we batch writes in the same tick but don't block the caller
  setImmediate(drainQueue);
}

function drainQueue() {
  _flushScheduled = false;
  if (_pendingLines.length === 0) return;
  const batch = _pendingLines.join('\n') + '\n';
  _pendingLines = [];
  const filePath = jsonlPath();
  // Ensure the directory exists
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  } catch { /* ignore */ }
  fs.appendFile(filePath, batch, (err) => {
    if (err) {
      log.error('EVENTS-WRITE-FAIL', `appendFile failed: ${err.message}`, { filePath });
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Postgres backend (post-B0) — gated behind DATABASE_URL + pg availability
// ──────────────────────────────────────────────────────────────────────────────

let _pgPool = null;
let _pgAttempted = false;

function getPgPool() {
  if (_pgAttempted) return _pgPool;
  _pgAttempted = true;
  if (!process.env.DATABASE_URL) return null;
  try {
    // pg may not be installed yet — graceful skip
    const { Pool } = require('pg'); // eslint-disable-line global-require
    _pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Neon requires SSL
      max: 5,
    });
    _pgPool.on('error', (err) => {
      log.error('EVENTS-PG', `Pool error: ${err.message}`);
    });
    log.info('EVENTS-PG', 'Postgres pool initialised for events sink');
  } catch (err) {
    log.warn('EVENTS-PG', `pg not available — falling back to JSONL: ${err.message}`);
    _pgPool = null;
  }
  return _pgPool;
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. Backend selection
// ──────────────────────────────────────────────────────────────────────────────

function usePostgres() {
  const eb = process.env.EVENTS_BACKEND;
  if (eb === 'postgres' || eb === 'pg') return true;
  if (eb === 'file' || eb === 'jsonl') return false;
  // Auto-flip: unset + DATABASE_URL → Postgres
  return !!process.env.DATABASE_URL;
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. Core write — called from both track() and trackAnonymous()
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} name
 * @param {object} rawProps
 * @param {string|null} userToken
 * @param {string|null} anonId
 * @returns {Promise<void>}
 */
async function _write(name, rawProps, userToken, anonId) {
  if (!ALLOWED_EVENTS.has(name)) return;

  const props = sanitizeProps(rawProps || {});

  // Props size guard (2 KB)
  const propsJson = JSON.stringify(props);
  if (propsJson.length > 2048) {
    log.warn('EVENTS-OVERSIZED', `Event ${name} props exceed 2KB (${propsJson.length} bytes) — dropped`);
    return;
  }

  const row = {
    id: generateId(),
    ts: new Date().toISOString(),
    name,
    userToken: userToken || null,
    anonId: anonId || null,
    props,
  };

  if (usePostgres()) {
    const pool = getPgPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO events (id, ts, name, user_id, anon_id, props)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.id, row.ts, row.name, row.userToken, row.anonId, JSON.stringify(row.props)]
        );
      } catch (err) {
        log.error('EVENTS-PG-WRITE', `Insert failed: ${err.message}`);
        // Fall through to JSONL as last-resort backup
        _pendingLines.push(JSON.stringify(row));
        scheduleFlush();
      }
      return;
    }
    // pool unavailable → fall through to JSONL
  }

  // JSONL path
  _pendingLines.push(JSON.stringify(row));
  scheduleFlush();
}

// ──────────────────────────────────────────────────────────────────────────────
// 8. Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Track an event attributed to an identified user.
 * Returns a Promise — callers MUST NOT await this in route handlers.
 * @param {string} name
 * @param {object} [props={}]
 * @param {string|null} [userToken=null]
 * @returns {Promise<void>}
 */
function track(name, props = {}, userToken = null) {
  return _write(name, props, userToken, null);
}

/**
 * Track an anonymous event (pre-account funnel).
 * Returns a Promise — callers MUST NOT await this in route handlers.
 * @param {string} name
 * @param {object} [props={}]
 * @param {string} anonId
 * @returns {Promise<void>}
 */
function trackAnonymous(name, props = {}, anonId) {
  return _write(name, props, null, anonId || 'unknown');
}

/**
 * Flush pending writes to disk. TEST-ONLY — do not call from route handlers.
 * @returns {Promise<void>}
 */
function flush() {
  return new Promise((resolve) => {
    if (_pendingLines.length === 0) {
      resolve();
      return;
    }
    const batch = _pendingLines.join('\n') + '\n';
    _pendingLines = [];
    _flushScheduled = false;
    const filePath = jsonlPath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    } catch { /* ignore */ }
    fs.appendFile(filePath, batch, (err) => {
      if (err) log.error('EVENTS-WRITE-FAIL', `flush appendFile failed: ${err.message}`);
      resolve();
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 9. Query — streams JSONL line-by-line; used by admin funnel tiles
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Query events from the JSONL file (or Postgres when pg backend is active).
 * @param {{ name?: string, since?: string, until?: string }} opts
 * @returns {Promise<Array>}
 */
async function query(opts = {}) {
  // Flush any pending writes before querying so tests see consistent state
  await flush();

  if (usePostgres()) {
    const pool = getPgPool();
    if (pool) return _queryPg(opts, pool);
  }

  return _queryJsonl(opts);
}

async function _queryPg(opts, pool) {
  const conditions = [];
  const params = [];
  if (opts.name) { conditions.push(`name = $${params.push(opts.name)}`); }
  if (opts.since) { conditions.push(`ts >= $${params.push(opts.since)}`); }
  if (opts.until) { conditions.push(`ts <= $${params.push(opts.until)}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM events ${where} ORDER BY ts DESC LIMIT 100000`, params);
  return rows.map(r => ({
    id: r.id,
    ts: r.ts,
    name: r.name,
    userToken: r.user_id,
    anonId: r.anon_id,
    props: typeof r.props === 'string' ? JSON.parse(r.props) : (r.props || {}),
  }));
}

function _queryJsonl(opts) {
  return new Promise((resolve) => {
    const filePath = jsonlPath();
    if (!fs.existsSync(filePath)) return resolve([]);

    const results = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let row;
      try { row = JSON.parse(trimmed); } catch { return; }

      if (opts.name && row.name !== opts.name) return;
      if (opts.since && row.ts < opts.since) return;
      if (opts.until && row.ts > opts.until) return;
      results.push(row);
    });

    rl.on('close', () => resolve(results));
    rl.on('error', (err) => {
      log.error('EVENTS-QUERY', `readline error: ${err.message}`);
      resolve(results);
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────

module.exports = {
  track,
  trackAnonymous,
  flush,
  query,
  ALLOWED_EVENTS,
  sanitizeProps,    // exported for /api/events endpoint
};
