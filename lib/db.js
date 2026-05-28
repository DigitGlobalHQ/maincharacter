/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/db.js — Postgres singleton pool (B0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Exposes:
 *   db.query(sql, params)   — one-shot parameterised query
 *   db.tx(fn)               — serialisable transaction helper
 *   db.isAvailable()        — synchronous readiness check (after init)
 *   db.init()               — call once on boot; resolves when pool is healthy
 *
 * Reads DATABASE_URL from env.  SSL=require for Neon (Postgres on TLS).
 * Auto-skips when DATABASE_URL is unset so local dev and the JSON-backend
 * CI path continue to work without any database.
 *
 * Hard rules:
 *   - One Pool per process (singleton _pool).
 *   - Never log the DATABASE_URL string — it contains credentials.
 *   - Pool errors are logged but never crash the process.
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const { createLogger } = require('./log');
const log = createLogger('DB');

let _pool = null;         // pg.Pool singleton
let _healthy = false;     // true once SELECT 1 completes
let _healthTs = 0;        // epoch ms of last health check
const HEALTH_TTL = 10000; // cache SELECT 1 result for 10 s

/**
 * Initialise the pool and run a quick SELECT 1.
 * Idempotent — safe to call multiple times; resolves immediately on repeat.
 * @returns {Promise<boolean>} true when Postgres is reachable
 */
async function init() {
  if (_pool) return _healthy;

  const url = process.env.DATABASE_URL;
  if (!url) {
    log.info('SKIP', 'DATABASE_URL not set — Postgres backend inactive');
    return false;
  }

  let Pool;
  try {
    ({ Pool } = require('pg')); // eslint-disable-line global-require
  } catch (err) {
    log.warn('PG-MISSING', `pg package not available: ${err.message}`);
    return false;
  }

  _pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Neon requires SSL; cert chain varies per region
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  _pool.on('error', (err) => {
    log.error('POOL-ERR', `idle client error: ${err.message}`);
    _healthy = false;
  });

  try {
    await _pool.query('SELECT 1');
    _healthy = true;
    _healthTs = Date.now();
    log.info('READY', 'Postgres connection established');
  } catch (err) {
    log.error('CONNECT-FAIL', `initial ping failed: ${err.message}`);
    _healthy = false;
  }

  return _healthy;
}

/**
 * Run a parameterised query.
 * @param {string} sql
 * @param {Array} [params=[]]
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(sql, params = []) {
  if (!_pool) throw new Error('DB pool not initialised — call db.init() on boot');
  return _pool.query(sql, params);
}

/**
 * Run a function inside a serialisable transaction.
 * The callback receives a client already in BEGIN; throw to rollback.
 * @param {function(client: import('pg').PoolClient): Promise<T>} fn
 * @returns {Promise<T>}
 */
async function tx(fn) {
  if (!_pool) throw new Error('DB pool not initialised — call db.init() on boot');
  const client = await _pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lightweight health check: re-pings Postgres if the cached result is stale.
 * Safe to call on every /health request.
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  if (!_pool) return false;
  const now = Date.now();
  if (now - _healthTs < HEALTH_TTL) return _healthy;
  try {
    await _pool.query('SELECT 1');
    _healthy = true;
    _healthTs = now;
  } catch (err) {
    log.warn('HEALTH-FAIL', `ping failed: ${err.message}`);
    _healthy = false;
    _healthTs = now;
  }
  return _healthy;
}

/** Synchronous snapshot of the last health-check result. */
function isAvailable() {
  return _healthy;
}

/** Expose the raw pool (used by migrate.js). */
function getPool() {
  return _pool;
}

module.exports = { init, query, tx, healthCheck, isAvailable, getPool };
