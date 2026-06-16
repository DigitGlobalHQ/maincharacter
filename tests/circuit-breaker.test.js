/**
 * Tests for lib/circuit-breaker.js — breaker(key, fn, opts)
 *
 * Uses a fast cooldownMs (10ms) so half-open tests don't wait long.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { breaker, CircuitOpenError, _resetAll } = require('../lib/circuit-breaker');

// Reset all circuit state between tests
beforeEach(() => {
  _resetAll();
});

const FAST = { failureThreshold: 3, cooldownMs: 20 };

describe('breaker — closed state (normal operation)', () => {
  it('passes through a successful call', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await breaker('test-key', fn, FAST);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes through even after some failures below threshold', async () => {
    const err = new Error('transient');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValue('ok'); // 3rd call succeeds — still below threshold of 3

    // 2 failures then success — should stay closed
    await expect(breaker('kb', fn, FAST)).rejects.toThrow('transient');
    await expect(breaker('kb', fn, FAST)).rejects.toThrow('transient');
    const result = await breaker('kb', fn, FAST);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('breaker — opens after threshold consecutive failures', () => {
  it('opens after N consecutive failures', async () => {
    const err = new Error('Service down');
    const fn = vi.fn().mockRejectedValue(err);

    // 3 consecutive failures should trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker('trip-key', fn, FAST)).rejects.toThrow('Service down');
    }

    // 4th call: breaker should be OPEN → throws CircuitOpenError (fn NOT called)
    const callsBefore = fn.mock.calls.length;
    await expect(breaker('trip-key', fn, FAST)).rejects.toThrow(CircuitOpenError);
    expect(fn).toHaveBeenCalledTimes(callsBefore); // fn was NOT called again
  });
});

describe('breaker — short-circuits while open', () => {
  it('throws CircuitOpenError immediately without calling fn', async () => {
    const err = new Error('down');
    const fn = vi.fn().mockRejectedValue(err);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker('open-key', fn, FAST)).rejects.toThrow('down');
    }

    const callCount = fn.mock.calls.length;

    // Next N calls all short-circuit
    for (let i = 0; i < 5; i++) {
      const thrown = await breaker('open-key', fn, FAST).catch(e => e);
      expect(thrown).toBeInstanceOf(CircuitOpenError);
    }
    expect(fn).toHaveBeenCalledTimes(callCount); // no additional calls
  });
});

describe('breaker — half-opens after cooldown', () => {
  it('allows one trial call after cooldown expires', async () => {
    const err = new Error('down');
    const fn = vi.fn().mockRejectedValue(err);

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker('cooldown-key', fn, FAST)).rejects.toThrow('down');
    }

    // Breaker is OPEN — wait for cooldown
    await new Promise(r => setTimeout(r, 30)); // 30ms > 20ms cooldown

    // First call after cooldown is the trial (half-open) — fn IS called
    const callsBefore = fn.mock.calls.length;
    await expect(breaker('cooldown-key', fn, FAST)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(callsBefore + 1); // trial was attempted

    // Trial failed → back to OPEN — next call short-circuits again
    await expect(breaker('cooldown-key', fn, FAST)).rejects.toThrow(CircuitOpenError);
  });
});

describe('breaker — closes on a successful trial', () => {
  it('closes the circuit when the trial call succeeds', async () => {
    const err = new Error('down');
    const fn = vi.fn()
      .mockRejectedValue(err); // will be overridden

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      await expect(breaker('close-key', fn, FAST)).rejects.toThrow('down');
    }

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 30));

    // Trial call succeeds — circuit closes
    fn.mockResolvedValueOnce('recovered');
    const result = await breaker('close-key', fn, FAST);
    expect(result).toBe('recovered');

    // Now circuit is CLOSED again — next call goes through normally
    fn.mockResolvedValueOnce('normal');
    const result2 = await breaker('close-key', fn, FAST);
    expect(result2).toBe('normal');
  });
});

describe('breaker — success resets failure count', () => {
  it('resets consecutive failure count after a success', async () => {
    const err = new Error('transient');
    // Pattern: fail, fail (threshold-1), then succeed, then fail again
    // The failure count should reset after the success so we need another full
    // threshold run of failures before the breaker opens again.
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('success') // reset
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err);     // 3 new failures → should trip

    // 2 failures — below threshold
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow('transient');
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow('transient');
    // success — resets count
    await breaker('reset-key', fn, FAST);
    // 3 more failures — should trip (count started fresh from 0)
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow('transient');
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow('transient');
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow('transient');
    // Now open
    await expect(breaker('reset-key', fn, FAST)).rejects.toThrow(CircuitOpenError);
  });
});

describe('breaker — separate keys are independent', () => {
  it('a tripped breaker on one key does not affect another key', async () => {
    const err = new Error('down');
    const fn = vi.fn().mockRejectedValue(err);
    const fnGood = vi.fn().mockResolvedValue('good');

    // Trip key-A
    for (let i = 0; i < 3; i++) {
      await expect(breaker('key-A', fn, FAST)).rejects.toThrow('down');
    }
    // key-A is open
    await expect(breaker('key-A', fn, FAST)).rejects.toThrow(CircuitOpenError);

    // key-B is unaffected
    const result = await breaker('key-B', fnGood, FAST);
    expect(result).toBe('good');
  });
});

describe('breaker — custom isFailure', () => {
  it('does not count a non-failure error as a circuit failure', async () => {
    const rateLimitErr = Object.assign(new Error('rate limited'), { status: 429 });
    const serviceErr = Object.assign(new Error('down'), { status: 503 });

    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitErr)  // 429 — not a circuit failure by custom rule
      .mockRejectedValueOnce(serviceErr)    // 503 — circuit failure
      .mockRejectedValueOnce(serviceErr)
      .mockRejectedValueOnce(serviceErr);   // 3 circuit failures → trip

    // isFailure: only count 503s, not 429s
    const opts = {
      ...FAST,
      isFailure: (e) => e.status === 503,
    };

    await expect(breaker('custom-fail', fn, opts)).rejects.toThrow('rate limited');  // not counted
    await expect(breaker('custom-fail', fn, opts)).rejects.toThrow('down');           // count=1
    await expect(breaker('custom-fail', fn, opts)).rejects.toThrow('down');           // count=2
    await expect(breaker('custom-fail', fn, opts)).rejects.toThrow('down');           // count=3 → OPEN

    await expect(breaker('custom-fail', fn, opts)).rejects.toThrow(CircuitOpenError);
  });
});
