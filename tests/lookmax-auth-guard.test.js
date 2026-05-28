/**
 * Tests for the lib/lookmax-auth.js startup guard (Login Gate P0-1 / spec §9).
 * When LOOKMAX_EMAIL_LOGIN=true, JWT_SECRET must be set or the module throws at
 * load time. This prevents the flag being flipped without the prerequisite secret.
 */
import { describe, it, expect } from 'vitest';

describe('lib/lookmax-auth startup guard', () => {
  it('throws at load time when LOOKMAX_EMAIL_LOGIN=true and JWT_SECRET is missing', () => {
    // Temporarily set the flag + remove the secret.
    const origFlag = process.env.LOOKMAX_EMAIL_LOGIN;
    const origSecret = process.env.JWT_SECRET;
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
    delete process.env.JWT_SECRET;

    // The module is already cached by other test files in this worker. We need
    // to bypass the require cache to force a fresh evaluation.
    const id = require.resolve('../lib/lookmax-auth');
    delete require.cache[id];

    let threw = false;
    try {
      require('../lib/lookmax-auth');
    } catch (e) {
      threw = true;
      expect(e.message).toContain('JWT_SECRET');
      expect(e.message).toContain('LOOKMAX_EMAIL_LOGIN');
    }
    expect(threw).toBe(true);

    // Restore env so subsequent tests in the same worker are not affected.
    if (origFlag !== undefined) process.env.LOOKMAX_EMAIL_LOGIN = origFlag;
    else delete process.env.LOOKMAX_EMAIL_LOGIN;
    if (origSecret !== undefined) process.env.JWT_SECRET = origSecret;

    // Re-cache the original module so other tests that import it still work.
    delete require.cache[id];
    if (origSecret) require('../lib/lookmax-auth');
  });

  it('does NOT throw when LOOKMAX_EMAIL_LOGIN=false even without JWT_SECRET', () => {
    const origFlag = process.env.LOOKMAX_EMAIL_LOGIN;
    const origSecret = process.env.JWT_SECRET;
    process.env.LOOKMAX_EMAIL_LOGIN = 'false';
    delete process.env.JWT_SECRET;

    const id = require.resolve('../lib/lookmax-auth');
    delete require.cache[id];

    expect(() => require('../lib/lookmax-auth')).not.toThrow();

    // Restore
    if (origFlag !== undefined) process.env.LOOKMAX_EMAIL_LOGIN = origFlag;
    else delete process.env.LOOKMAX_EMAIL_LOGIN;
    if (origSecret !== undefined) process.env.JWT_SECRET = origSecret;
    delete require.cache[id];
    if (origSecret) require('../lib/lookmax-auth');
  });

  it('does NOT throw when LOOKMAX_EMAIL_LOGIN is unset even without JWT_SECRET', () => {
    const origFlag = process.env.LOOKMAX_EMAIL_LOGIN;
    const origSecret = process.env.JWT_SECRET;
    delete process.env.LOOKMAX_EMAIL_LOGIN;
    delete process.env.JWT_SECRET;

    const id = require.resolve('../lib/lookmax-auth');
    delete require.cache[id];

    expect(() => require('../lib/lookmax-auth')).not.toThrow();

    // Restore
    if (origFlag !== undefined) process.env.LOOKMAX_EMAIL_LOGIN = origFlag;
    if (origSecret !== undefined) process.env.JWT_SECRET = origSecret;
    delete require.cache[id];
    if (origSecret) require('../lib/lookmax-auth');
  });
});
