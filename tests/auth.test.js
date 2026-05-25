import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const auth = require('../lib/auth');

const ORIG = { ...process.env };
beforeEach(() => {
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_JWT_SECRET;
  process.env.ADMIN_PASSWORD = 'secret123';
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('checkPassword', () => {
  it('matches plaintext ADMIN_PASSWORD when no hash is set', () => {
    expect(auth.checkPassword('secret123')).toBe(true);
    expect(auth.checkPassword('wrong')).toBe(false);
  });

  it('uses the bcrypt hash when ADMIN_PASSWORD_HASH is set', () => {
    process.env.ADMIN_PASSWORD_HASH = auth.hashPassword('hunter2');
    expect(auth.hashConfigured()).toBe(true);
    expect(auth.checkPassword('hunter2')).toBe(true);
    expect(auth.checkPassword('secret123')).toBe(false); // plaintext no longer works
  });

  it('rejects empty input', () => {
    expect(auth.checkPassword('')).toBe(false);
    expect(auth.checkPassword(undefined)).toBe(false);
  });
});

describe('admin JWT', () => {
  it('signs and verifies a token', () => {
    const token = auth.signAdminToken();
    const decoded = auth.verifyAdminToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded.role).toBe('admin');
  });

  it('rejects a tampered/garbage token', () => {
    expect(auth.verifyAdminToken('not.a.jwt')).toBeNull();
    expect(auth.verifyAdminToken('')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    process.env.ADMIN_JWT_SECRET = 'secret-A';
    const token = auth.signAdminToken();
    process.env.ADMIN_JWT_SECRET = 'secret-B';
    expect(auth.verifyAdminToken(token)).toBeNull();
  });
});
