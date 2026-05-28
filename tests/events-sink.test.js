/**
 * tests/events-sink.test.js
 * B5 — KPI event sink unit tests
 *
 * Tests: allowlist enforcement, JSONL write correctness,
 * anon vs userToken distinction, props size cap, malformed input rejection.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';

// Isolate to a tmp dir so tests don't touch data/events.jsonl
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-events-sink-'));
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
// Force file backend even if DATABASE_URL happens to be set in test env
process.env.EVENTS_BACKEND = 'file';

let events;
beforeAll(() => {
  events = require('../services/events');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: read all JSONL lines from the events file as parsed objects
async function readEvents() {
  const filePath = process.env.EVENTS_JSONL_PATH;
  if (!fs.existsSync(filePath)) return [];
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed) {
        try { lines.push(JSON.parse(trimmed)); } catch { /* skip malformed */ }
      }
    });
    rl.on('close', () => resolve(lines));
  });
}

// ──────────────────────────────────────────────────────────────────────────────
describe('ALLOWED_EVENTS export', () => {
  it('exports a non-empty Set', () => {
    expect(events.ALLOWED_EVENTS).toBeInstanceOf(Set);
    expect(events.ALLOWED_EVENTS.size).toBeGreaterThan(0);
  });

  it('contains canonical events from the spec', () => {
    const required = [
      'landing_viewed', 'audit_started', 'audit_quiz_completed',
      'audit_photos_submitted', 'audit_analysis_completed', 'audit_result_viewed',
      'paywall_viewed', 'paywall_cta_clicked', 'recover_link_copied', 'recover_link_shared',
      'payment_succeeded', 'payment_initiated', 'payment_failed', 'payment_cancelled',
      'lookmax_first_login', 'lookmax_first_mirror_taken',
      'mirror_taken', 'mirror_score_returned',
      'protocol_task_completed', 'protocol_day_completed',
      'hair_tracked', 'daily_streak_extended', 'daily_streak_broken',
      'dashboard_loaded', 'reveal_watched',
      'reaudit_card_shown', 'reaudit_started', 'reaudit_completed',
      'bundle_attached', 'cross_sell_orator_shown', 'cross_sell_orator_clicked',
      'cross_sell_orator_reshow', 'recovery_message_sent',
      'early_access_submitted', 'enroll_submitted',
      'share_card_generated',
    ];
    for (const name of required) {
      expect(events.ALLOWED_EVENTS.has(name), `missing: ${name}`).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('events.track (identified)', () => {
  it('returns a Promise', () => {
    const p = events.track('mirror_taken', { dayOfProgram: 1, streakAfter: 1, takenAtIstHour: 7 }, 'user-token-abc');
    expect(p).toBeInstanceOf(Promise);
  });

  it('writes one JSONL line with correct shape', async () => {
    await events.flush();
    // Clear file
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.track('mirror_taken', { dayOfProgram: 2 }, 'user-tok-xyz');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.name).toBe('mirror_taken');
    expect(row.userToken).toBe('user-tok-xyz');
    expect(row.anonId).toBeNull();
    expect(row.props.dayOfProgram).toBe(2);
    expect(typeof row.ts).toBe('string');
    expect(row.id).toBeTruthy();
  });

  it('rejects unknown event names (returns without writing)', async () => {
    await events.flush();
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.track('paywall_decimated', {}, 'tok');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(0);
  });

  it('writes multiple events sequentially', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.track('audit_started', { reAudit: false }, 'tok-a');
    await events.track('audit_quiz_completed', { durationSec: 120 }, 'tok-a');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('audit_started');
    expect(rows[1].name).toBe('audit_quiz_completed');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('events.trackAnonymous', () => {
  it('writes with anonId set and userToken null', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.trackAnonymous('landing_viewed', { utm_source: 'ig' }, 'anon-abc123');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0].anonId).toBe('anon-abc123');
    expect(rows[0].userToken).toBeNull();
    expect(rows[0].props.utm_source).toBe('ig');
  });

  it('rejects unknown event names', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.trackAnonymous('hacker_event', {}, 'anon-bad');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('props validation', () => {
  it('accepts flat primitive props', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.track('paywall_viewed', { mode: 'waitlist', auditEchoShown: true }, 'tok');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0].props.mode).toBe('waitlist');
  });

  it('strips PII-keyed fields (phone, email, password, name keys)', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    await events.track('landing_viewed', { phone: '9999', email: 'x@y.com', name: 'Alice', plan: 'orator' }, 'tok');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(1);
    const p = rows[0].props;
    expect(p.phone).toBeUndefined();
    expect(p.email).toBeUndefined();
    expect(p.name).toBeUndefined();
    expect(p.plan).toBe('orator'); // non-PII key preserved
  });

  it('does not write when props exceed 2KB', async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

    const bigProps = { data: 'x'.repeat(3000) };
    await events.track('landing_viewed', bigProps, 'tok');
    await events.flush();

    const rows = await readEvents();
    expect(rows).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('events.query', () => {
  beforeEach(async () => {
    fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');
    await events.track('mirror_taken', { dayOfProgram: 1 }, 'user-q-1');
    await events.track('mirror_score_returned', { overallScore: 70 }, 'user-q-1');
    await events.track('landing_viewed', {}, null);
    await events.flush();
  });

  it('returns all events with no filter', async () => {
    const rows = await events.query({});
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it('filters by name', async () => {
    const rows = await events.query({ name: 'mirror_taken' });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) expect(row.name).toBe('mirror_taken');
  });

  it('filters by since (ISO timestamp)', async () => {
    const future = new Date(Date.now() + 60000).toISOString();
    const rows = await events.query({ since: future });
    expect(rows).toHaveLength(0);
  });

  it('counts events for a given name', async () => {
    await events.track('mirror_taken', { dayOfProgram: 5 }, 'user-q-2');
    await events.flush();
    const rows = await events.query({ name: 'mirror_taken' });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('events.flush', () => {
  it('is exported and returns a Promise', () => {
    const p = events.flush();
    expect(p).toBeInstanceOf(Promise);
  });

  it('resolves without error even when file is missing', async () => {
    const missingPath = path.join(tmpDir, 'nonexistent.jsonl');
    const origPath = process.env.EVENTS_JSONL_PATH;
    process.env.EVENTS_JSONL_PATH = missingPath;
    // Flush with a clean write queue — should not throw
    await expect(events.flush()).resolves.not.toThrow();
    process.env.EVENTS_JSONL_PATH = origPath;
  });
});
