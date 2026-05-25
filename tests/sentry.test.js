import { describe, it, expect } from 'vitest';

const sentry = require('../lib/sentry');

describe('lib/sentry (no DSN)', () => {
  it('init returns null and stays disabled without SENTRY_DSN', () => {
    delete process.env.SENTRY_DSN;
    expect(sentry.init()).toBeNull();
    expect(sentry.isEnabled()).toBe(false);
  });

  it('captureException is a safe no-op when disabled', () => {
    expect(() => sentry.captureException(new Error('boom'))).not.toThrow();
  });

  it('setupExpressErrorHandler is a safe no-op when disabled', () => {
    expect(() => sentry.setupExpressErrorHandler({})).not.toThrow();
  });
});
