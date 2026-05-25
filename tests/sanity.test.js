import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });

  it('can require a CommonJS module', () => {
    const log = require('../lib/log');
    expect(typeof log.createLogger).toBe('function');
  });
});
