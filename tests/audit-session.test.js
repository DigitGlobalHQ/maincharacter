import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-audit-'));
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');

const AuditSession = require('../models/AuditSession');
const User = require('../models/User');

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('AuditSession store (P0.5/P3.2)', () => {
  it('creates a session with a token and empty defaults', () => {
    const s = AuditSession.createSession({ intent: 'bundle' });
    expect(s.sessionToken).toBeTruthy();
    expect(s.intent).toBe('bundle');
    expect(s.photos).toEqual([]);
    expect(s.completedAt).toBeNull();
    expect(AuditSession.getSession(s.sessionToken).sessionToken).toBe(s.sessionToken);
  });

  it('partial-updates a session', () => {
    const s = AuditSession.createSession();
    const updated = AuditSession.updateSession(s.sessionToken, {
      quizAnswers: { skin1: 'a' },
    });
    expect(updated.quizAnswers).toEqual({ skin1: 'a' });
    expect(AuditSession.getSession(s.sessionToken).quizAnswers).toEqual({ skin1: 'a' });
  });

  it('returns null for unknown or expired sessions', () => {
    expect(AuditSession.getSession('nope')).toBeNull();
    const s = AuditSession.createSession();
    // Force-expire by rewriting createdAt past the TTL.
    AuditSession.updateSession(s.sessionToken, {
      createdAt: new Date(Date.now() - AuditSession.TTL_MS - 1000).toISOString(),
    });
    expect(AuditSession.getSession(s.sessionToken)).toBeNull();
  });

  it('purgeExpired removes stale sessions only', () => {
    const fresh = AuditSession.createSession();
    const stale = AuditSession.createSession();
    AuditSession.updateSession(stale.sessionToken, {
      createdAt: new Date(Date.now() - AuditSession.TTL_MS - 1000).toISOString(),
    });
    const purged = AuditSession.purgeExpired();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(AuditSession.getSession(fresh.sessionToken)).not.toBeNull();
  });
});

describe('User Lookmaxxing fields + Aura++ status (P0.5)', () => {
  it('new users carry the Lookmaxxing defaults', () => {
    const u = User.createUser({ name: 'Vee', phone: '918000000201' });
    expect(u.oratorActive).toBe(false);
    expect(u.lookmaxxingActive).toBe(false);
    expect(u.mirrorLevel).toBe('raw');
    expect(u.email).toBeNull();
    expect(u.pushSubscription).toBeNull();
  });

  it('computeAuraStatus is true only when both pillars are active', () => {
    expect(User.computeAuraStatus({}).auraPlusPlus).toBe(false);
    expect(User.computeAuraStatus({ oratorActive: true }).auraPlusPlus).toBe(false);
    expect(User.computeAuraStatus({ lookmaxxingActive: true }).auraPlusPlus).toBe(false);
    const both = User.computeAuraStatus({ oratorActive: true, lookmaxxingActive: true });
    expect(both).toEqual({ oratorActive: true, lookmaxxingActive: true, auraPlusPlus: true });
  });
});
