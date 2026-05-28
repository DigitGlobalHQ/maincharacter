/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/migrate.js — thin, ordered migration runner (B0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Reads every *.sql file from /migrations/ in ascending numeric order,
 * checks the schema_migrations table, and applies only the ones that
 * haven't run yet.  Idempotent — safe to call on every boot.
 *
 * Called by server.js when DATABASE_URL is set:
 *   const migrate = require('./lib/migrate');
 *   await migrate.run();
 *
 * The schema_migrations table itself is created by 0001_init.sql, which
 * is always the first migration.  The runner bootstraps it via a raw
 * CREATE TABLE IF NOT EXISTS guard before applying any files.
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('./db');
const { createLogger } = require('./log');

const log = createLogger('MIGRATE');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/** Parse the version number from a filename like "0001_init.sql". */
function parseVersion(filename) {
  const m = filename.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Apply all pending SQL migrations in order.
 * @returns {Promise<number>} count of migrations applied this run
 */
async function run() {
  if (!db.isAvailable() && !(await db.init())) {
    log.info('SKIP', 'No database — migration runner inactive');
    return 0;
  }

  // Bootstrap the tracking table before we read from it.
  // 0001_init.sql also creates it, but if the file hasn't run yet we
  // need the table to exist so we can record the version.
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Which versions are already applied?
  const { rows } = await db.query('SELECT version FROM schema_migrations ORDER BY version');
  const applied = new Set(rows.map((r) => r.version));

  // Collect migration files, sorted ascending by version number.
  let files;
  try {
    files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    log.warn('NO-DIR', `migrations directory not found at ${MIGRATIONS_DIR}`);
    return 0;
  }

  let count = 0;
  for (const file of files) {
    const version = parseVersion(file);
    if (version === null) continue;
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    log.info('APPLY', `v${version} — ${file}`);
    try {
      // Run the full SQL file in one shot (DDL is auto-committed in Postgres).
      await db.query(sql);
      // If the file itself inserts into schema_migrations (which 0001 does),
      // the ON CONFLICT guard handles a double-insert gracefully.
      await db.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [version]
      );
      applied.add(version);
      count += 1;
      log.info('DONE', `v${version} applied`);
    } catch (err) {
      log.error('FAIL', `v${version} failed: ${err.message}`);
      throw err; // halt — partial migrations are worse than none
    }
  }

  if (count === 0) {
    log.info('UP-TO-DATE', `All ${files.length} migration(s) already applied`);
  } else {
    log.info('COMPLETE', `${count} migration(s) applied`);
  }

  return count;
}

module.exports = { run, parseVersion };
