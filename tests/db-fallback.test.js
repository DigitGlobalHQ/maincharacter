/**
 * tests/db-fallback.test.js — JSON fallback behaviour when DATABASE_URL is absent
 *
 * Runs always (no env guard). Asserts that when DATABASE_URL is not set,
 * User, AuditSession, and EarlyAccess behave identically to their
 * pre-B0 JSON implementations.  These tests protect the existing funnel
 * while Postgres is being introduced.
 *
 * Coverage target: ≥70% of model-facing logic reachable without DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ── Isolate to a throw-away temp dir ───────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-fallback-'));

// Override all data file paths BEFORE requiring the models so the
// test doesn't touch real data files.
process.env.USERS_FILE_PATH          = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH       = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.EARLY_ACCESS_FILE_PATH   = path.join(tmpDir, 'early-access.json');
process.env.LOOKMAX_FILE_PATH        = path.join(tmpDir, 'lookmax.json');

// Ensure no DATABASE_URL is seen so the JSON path is active
const savedDbUrl = process.env.DATABASE_URL;
delete process.env.DATABASE_URL;
delete process.env.MC_DB_BACKEND;

const User        = require('../models/User');
const AuditSession = require('../models/AuditSession');
const EarlyAccess = require('../models/EarlyAccess');

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // restore DATABASE_URL if it was set in the outer env
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
});

// ── User model ─────────────────────────────────────────────────────

describe('User model — JSON fallback (B0)', () => {
  const phone = '919800000001';

  it('createUser returns a user with expected defaults', () => {
    const u = User.createUser({ name: 'Fallback Test', phone, pillar: 'orator' });
    expect(u.phone).toBe(phone);
    expect(u.name).toBe('Fallback Test');
    expect(u.oratorActive).toBe(false);
    expect(u.lookmaxxingActive).toBe(false);
    expect(u.token).toBeTruthy();
    expect(u.scores).toEqual([]);
  });

  it('createUser is idempotent — duplicate phone returns existing', () => {
    const u2 = User.createUser({ name: 'Dup', phone });
    expect(u2.name).toBe('Fallback Test'); // original name preserved
  });

  it('getUserByPhone normalises 10-digit numbers', () => {
    const u = User.getUserByPhone('9800000001'); // no country code
    expect(u).not.toBeNull();
    expect(u.phone).toBe(phone);
  });

  it('getUserByToken returns the user', () => {
    const u = User.getUserByPhone(phone);
    const byToken = User.getUserByToken(u.token);
    expect(byToken).not.toBeNull();
    expect(byToken.phone).toBe(phone);
  });

  it('getUserByEmail is case-insensitive', () => {
    User.updateUser(phone, { email: 'Test@Example.com' });
    const byEmail = User.getUserByEmail('test@example.com');
    expect(byEmail).not.toBeNull();
    expect(byEmail.phone).toBe(phone);
    // Unknown email → null
    expect(User.getUserByEmail('nobody@x.com')).toBeNull();
  });

  it('updateUser persists partial updates', () => {
    const updated = User.updateUser(phone, { oratorActive: true, rank: 'seeker' });
    expect(updated.oratorActive).toBe(true);
    expect(updated.rank).toBe('seeker');
    // Round-trip read
    const fresh = User.getUserByPhone(phone);
    expect(fresh.oratorActive).toBe(true);
  });

  it('addScore appends a score entry', () => {
    const u = User.addScore(phone, { day: 1, fluency: 70, confidenceTone: 65 });
    expect(u.scores).toHaveLength(1);
    expect(u.scores[0].fluency).toBe(70);
    expect(u.scores[0].timestamp).toBeTruthy();
  });

  it('addChronicle appends a chronicle entry', () => {
    const u = User.addChronicle(phone, { day: 1, prompt: 'Say this', userResponse: 'Said it' });
    expect(u.chronicle).toHaveLength(1);
    expect(u.chronicle[0].prompt).toBe('Say this');
  });

  it('addWordsLearned deduplicates by word', () => {
    const words = [{ word: 'LACONIC', definition: 'brief and concise' }];
    User.addWordsLearned(phone, words, 1);
    User.addWordsLearned(phone, words, 1); // second call should not add a dupe
    const u = User.getUserByPhone(phone);
    const laconic = u.wordsLearned.filter((w) => w.word === 'LACONIC');
    expect(laconic).toHaveLength(1);
  });

  it('computeAuraStatus reflects both flags', () => {
    const u = User.getUserByPhone(phone);
    const s = User.computeAuraStatus(u);
    expect(s.oratorActive).toBe(true);
    expect(s.lookmaxxingActive).toBe(false);
    expect(s.auraPlusPlus).toBe(false);
  });

  it('getAllUsers returns a map with the test user', () => {
    const all = User.getAllUsers();
    expect(all[phone]).toBeDefined();
  });

  it('waitlist add/get is deduplicated', () => {
    const added1 = User.addToWaitlist('919000000099', 'orator');
    const added2 = User.addToWaitlist('919000000099', 'orator');
    expect(added1).toBe(true);
    expect(added2).toBe(false);
    const wl = User.getWaitlist();
    expect(wl.filter((e) => e.phone === '919000000099')).toHaveLength(1);
  });
});

// ── AuditSession model ─────────────────────────────────────────────

describe('AuditSession model — JSON fallback (B0)', () => {
  let sessionToken;

  it('createSession returns a session with expected defaults', () => {
    const s = AuditSession.createSession({ intent: 'bundle' });
    sessionToken = s.sessionToken;
    expect(s.sessionToken).toBeTruthy();
    expect(s.intent).toBe('bundle');
    expect(s.photos).toEqual([]);
    expect(s.completedAt).toBeNull();
  });

  it('getSession returns the session within TTL', () => {
    const s = AuditSession.getSession(sessionToken);
    expect(s).not.toBeNull();
    expect(s.sessionToken).toBe(sessionToken);
  });

  it('updateSession partially updates fields', () => {
    const updated = AuditSession.updateSession(sessionToken, { quizAnswers: { q1: 'a' } });
    expect(updated.quizAnswers).toEqual({ q1: 'a' });
    expect(AuditSession.getSession(sessionToken).quizAnswers).toEqual({ q1: 'a' });
  });

  it('getSession returns null for expired session', () => {
    AuditSession.updateSession(sessionToken, {
      createdAt: new Date(Date.now() - AuditSession.TTL_MS - 1000).toISOString(),
    });
    expect(AuditSession.getSession(sessionToken)).toBeNull();
  });

  it('purgeExpired removes stale sessions', () => {
    const fresh = AuditSession.createSession();
    const purged = AuditSession.purgeExpired();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(AuditSession.getSession(fresh.sessionToken)).not.toBeNull();
  });
});

// ── EarlyAccess model ──────────────────────────────────────────────

describe('EarlyAccess model — JSON fallback (B0)', () => {
  it('add() inserts a new entry', () => {
    const result = EarlyAccess.add({ phone: '919700000001', name: 'EA Test' });
    expect(result.added).toBe(true);
    expect(result.entry.phone).toBe('919700000001'); // normalised (already 91-prefixed)
  });

  it('add() is idempotent on duplicate phone', () => {
    const first  = EarlyAccess.add({ phone: '919700000002', name: 'First' });
    const second = EarlyAccess.add({ phone: '919700000002', name: 'Second' });
    expect(first.added).toBe(true);
    expect(second.added).toBe(false);
    expect(second.entry.name).toBe('First'); // original preserved
  });

  it('getAll() returns all entries', () => {
    const all = EarlyAccess.getAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it('count() matches getAll().length', () => {
    expect(EarlyAccess.count()).toBe(EarlyAccess.getAll().length);
  });
});
