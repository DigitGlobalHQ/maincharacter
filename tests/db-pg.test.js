/**
 * tests/db-pg.test.js — Postgres client + migration runner tests
 *
 * Only runs when DATABASE_URL is set in the environment.
 * Skipped entirely in CI without a database (JSON-backend path).
 *
 * Coverage: init(), query(), tx(), healthCheck(), migrate.run() idempotency,
 * basic CRUD round-trip on the users + events tables.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('Postgres client + migration runner (B0)', () => {
  let db, migrate;

  beforeAll(async () => {
    db      = require('../lib/db');
    migrate = require('../lib/migrate');
    const ready = await db.init();
    expect(ready).toBe(true);
    await migrate.run();
  }, 30000);

  // ── db.init / healthCheck ────────────────────────────────────────

  it('db.isAvailable() returns true after init', () => {
    expect(db.isAvailable()).toBe(true);
  });

  it('db.healthCheck() returns true', async () => {
    const ok = await db.healthCheck();
    expect(ok).toBe(true);
  });

  // ── migrate idempotency ──────────────────────────────────────────

  it('running migrations again applies 0 new files', async () => {
    const count = await migrate.run();
    expect(count).toBe(0);
  });

  it('schema_migrations table has at least version 1', async () => {
    const { rows } = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    expect(rows.map((r) => r.version)).toContain(1);
  });

  // ── users CRUD round-trip ────────────────────────────────────────

  const testPhone = `99${Date.now()}`;
  const testToken = crypto.randomUUID();

  it('inserts a user row', async () => {
    await db.query(
      `INSERT INTO users (token, name, phone, pillar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone) DO NOTHING`,
      [testToken, 'DB Test User', testPhone, 'orator']
    );
    const { rows } = await db.query('SELECT name, token FROM users WHERE phone = $1', [testPhone]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('DB Test User');
  });

  it('updates a user row', async () => {
    await db.query(
      'UPDATE users SET orator_active = TRUE WHERE phone = $1',
      [testPhone]
    );
    const { rows } = await db.query('SELECT orator_active FROM users WHERE phone = $1', [testPhone]);
    expect(rows[0].orator_active).toBe(true);
  });

  it('reads back the inserted user by token', async () => {
    const { rows } = await db.query('SELECT phone FROM users WHERE token = $1', [testToken]);
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toBe(testPhone);
  });

  // ── events table ─────────────────────────────────────────────────

  it('inserts an event row', async () => {
    const evId = `test-${Date.now()}`;
    await db.query(
      `INSERT INTO events (id, name, props) VALUES ($1, $2, $3)`,
      [evId, 'mirror_taken', JSON.stringify({ score: 72 })]
    );
    const { rows } = await db.query('SELECT name, props FROM events WHERE id = $1', [evId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('mirror_taken');
  });

  // ── tx() rollback on error ───────────────────────────────────────

  it('tx() rolls back on thrown error', async () => {
    const uniquePhone = `fail${Date.now()}`;
    await expect(
      db.tx(async (client) => {
        await client.query(
          `INSERT INTO users (token, name, phone) VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), 'Rollback Test', uniquePhone]
        );
        throw new Error('deliberate rollback');
      })
    ).rejects.toThrow('deliberate rollback');

    const { rows } = await db.query('SELECT 1 FROM users WHERE phone = $1', [uniquePhone]);
    expect(rows).toHaveLength(0);
  });

  // ── cleanup ───────────────────────────────────────────────────────

  afterAll(async () => {
    if (db.isAvailable()) {
      // Clean up test rows
      await db.query('DELETE FROM users WHERE phone = $1', [testPhone]);
      await db.query("DELETE FROM events WHERE name = 'mirror_taken' AND id LIKE 'test-%'");
    }
  });
});
