/**
 * Tests for lib/retry.js — withRetry
 *
 * Uses tiny baseMs values instead of fake timers so tests stay fast without
 * needing vi.useFakeTimers() complexity.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { withRetry } = require('../lib/retry');

// Very fast opts for all tests to avoid real multi-second delays
const FAST = { baseMs: 1, maxMs: 10, factor: 2, jitter: false };

describe('withRetry — succeeds first try', () => {
  it('returns the resolved value immediately', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — retries a transient error then succeeds', () => {
  it('retries a 503 once and returns success', async () => {
    const err503 = Object.assign(new Error('Service Unavailable'), { status: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err503)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 and returns success', async () => {
    const err429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err429)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries ECONNRESET (network error) and recovers', async () => {
    const netErr = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const fn = vi.fn()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries ETIMEDOUT (network error) and recovers', async () => {
    const netErr = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const fn = vi.fn()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries "socket hang up" and recovers', async () => {
    const netErr = new Error('socket hang up');
    const fn = vi.fn()
      .mockRejectedValueOnce(netErr)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('detects 5xx via err.response.status', async () => {
    const err = Object.assign(new Error('Internal Server Error'), {
      response: { status: 500 },
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { ...FAST, retries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetry — does NOT retry 4xx errors', () => {
  it('throws immediately on 400 (single attempt)', async () => {
    const err400 = Object.assign(new Error('Bad Request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err400);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 401', async () => {
    const err401 = Object.assign(new Error('Unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValue(err401);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 403', async () => {
    const err403 = Object.assign(new Error('Forbidden'), { status: 403 });
    const fn = vi.fn().mockRejectedValue(err403);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 404', async () => {
    const err404 = Object.assign(new Error('Not Found'), { status: 404 });
    const fn = vi.fn().mockRejectedValue(err404);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Not Found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 409 (conflict)', async () => {
    const err409 = Object.assign(new Error('Conflict'), { status: 409 });
    const fn = vi.fn().mockRejectedValue(err409);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Conflict');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 422 (unprocessable)', async () => {
    const err422 = Object.assign(new Error('Unprocessable'), { status: 422 });
    const fn = vi.fn().mockRejectedValue(err422);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Unprocessable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — exhausts retries and rethrows last error', () => {
  it('rethrows the last error after exhausting retries', async () => {
    const err = Object.assign(new Error('Bad Gateway'), { status: 502 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { ...FAST, retries: 2 })).rejects.toThrow('Bad Gateway');
    // 1 initial attempt + 2 retries = 3 total
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('rethrows last error — not the first error — on successive different errors', async () => {
    const err1 = Object.assign(new Error('Gateway Timeout first'), { status: 504 });
    const err2 = Object.assign(new Error('Gateway Timeout last'), { status: 504 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err1)
      .mockRejectedValueOnce(err2);

    const thrown = await withRetry(fn, { ...FAST, retries: 1 }).catch(e => e);
    expect(thrown.message).toBe('Gateway Timeout last');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetry — custom isRetryable', () => {
  it('uses custom isRetryable to decide whether to retry', async () => {
    const customErr = new Error('custom-transient');
    const fn = vi.fn()
      .mockRejectedValueOnce(customErr)
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      ...FAST,
      retries: 2,
      isRetryable: (e) => e.message === 'custom-transient',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when custom isRetryable returns false', async () => {
    const customErr = new Error('custom-permanent');
    const fn = vi.fn().mockRejectedValue(customErr);

    await expect(withRetry(fn, {
      ...FAST,
      retries: 2,
      isRetryable: () => false,
    })).rejects.toThrow('custom-permanent');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withRetry — onRetry callback', () => {
  it('calls onRetry with (error, attempt) on each retry', async () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');

    const onRetry = vi.fn();
    await withRetry(fn, { ...FAST, retries: 3, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, err, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, err, 2);
  });
});

describe('withRetry — jitter', () => {
  it('jitter=true does not break the operation', async () => {
    const err = Object.assign(new Error('Service Unavailable'), { status: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('jittered');

    const result = await withRetry(fn, { retries: 2, baseMs: 1, maxMs: 5, factor: 2, jitter: true });
    expect(result).toBe('jittered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('withRetry — detects status via statusCode property', () => {
  it('retries when err.statusCode is 503', async () => {
    const err = Object.assign(new Error('Unavailable'), { statusCode: 503 });
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok');

    await withRetry(fn, { ...FAST, retries: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when err.statusCode is 400', async () => {
    const err = Object.assign(new Error('Bad'), { statusCode: 400 });
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withRetry(fn, { ...FAST, retries: 3 })).rejects.toThrow('Bad');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
