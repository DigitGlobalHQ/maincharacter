/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/circuit-breaker.js — conservative per-key circuit breaker
 * ═══════════════════════════════════════════════════════════════════
 *
 * Designed ONLY for best-effort NOTIFICATION channels (email, SMS, WhatsApp).
 * These are fire-and-forget — an open circuit is treated like a swallowed
 * send failure.  Do NOT apply to payment paths or any user-blocking call.
 *
 * States: CLOSED → (N consecutive failures) → OPEN (for cooldownMs) →
 *         HALF-OPEN (one trial) → CLOSED on success / OPEN on failure.
 *
 * breaker(key, fn, opts) → Promise<any>
 *
 * opts:
 *   failureThreshold  number   consecutive failures before opening (default 5)
 *   cooldownMs        number   ms to wait in OPEN before half-open (default 30 000)
 *   isFailure         fn(err)  → bool  whether an error counts as a circuit failure
 *                                      (default: all errors count)
 *
 * When the circuit is OPEN throws CircuitOpenError.
 * The CALLER is responsible for swallowing CircuitOpenError on notification paths.
 */

'use strict';

const { createLogger } = require('./log');
const log = createLogger('CIRCUIT');

const STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

/**
 * Error thrown when the circuit is open and calls are short-circuited.
 * Callers on notification paths must catch and swallow this.
 */
class CircuitOpenError extends Error {
  constructor(key) {
    super(`Circuit open for key: ${key}`);
    this.name = 'CircuitOpenError';
    this.key = key;
  }
}

// Per-key circuit state registry.
// Maps key → { state, failures, openedAt }
const _registry = new Map();

/** Reset all circuit states — used by tests only. */
function _resetAll() {
  _registry.clear();
}

/**
 * Get or initialise the circuit state for `key`.
 * @param {string} key
 * @returns {{ state: string, failures: number, openedAt: number|null }}
 */
function _getState(key) {
  if (!_registry.has(key)) {
    _registry.set(key, { state: STATE.CLOSED, failures: 0, openedAt: null });
  }
  return _registry.get(key);
}

/**
 * Execute `fn` through the circuit breaker keyed by `key`.
 *
 * @param {string}   key    per-channel key (e.g. 'email', 'sms', 'whatsapp')
 * @param {Function} fn     async () => any — the actual send call
 * @param {object}   [opts]
 * @param {number}   [opts.failureThreshold=5]
 * @param {number}   [opts.cooldownMs=30000]
 * @param {Function} [opts.isFailure]   (err) => boolean  default: () => true
 * @returns {Promise<any>}
 * @throws {CircuitOpenError} when the circuit is open
 */
async function breaker(key, fn, opts = {}) {
  const {
    failureThreshold = 5,
    cooldownMs = 30000,
    isFailure = () => true,
  } = opts;

  const circuit = _getState(key);

  // ── OPEN state ────────────────────────────────────────────────────────────
  if (circuit.state === STATE.OPEN) {
    const elapsed = Date.now() - (circuit.openedAt || 0);
    if (elapsed < cooldownMs) {
      // Still cooling down — short-circuit
      log.warn('OPEN', `[${key}] circuit open — short-circuiting (${Math.round((cooldownMs - elapsed) / 1000)}s remaining)`);
      throw new CircuitOpenError(key);
    }
    // Cooldown elapsed — transition to HALF-OPEN for one trial
    circuit.state = STATE.HALF_OPEN;
    log.info('HALF-OPEN', `[${key}] cooldown elapsed — attempting trial call`);
  }

  // ── CLOSED or HALF-OPEN: attempt the call ────────────────────────────────
  try {
    const result = await fn();

    // Success: reset failures and close the circuit
    if (circuit.state === STATE.HALF_OPEN) {
      log.info('CLOSE', `[${key}] trial succeeded — circuit closed`);
    }
    circuit.state = STATE.CLOSED;
    circuit.failures = 0;
    circuit.openedAt = null;
    return result;
  } catch (err) {
    // Check whether this error counts as a circuit failure
    const counts = isFailure(err);

    if (counts) {
      circuit.failures++;

      if (circuit.state === STATE.HALF_OPEN) {
        // Trial failed — reopen immediately
        circuit.state = STATE.OPEN;
        circuit.openedAt = Date.now();
        log.warn('RE-OPEN', `[${key}] trial failed — circuit reopened`);
      } else if (circuit.failures >= failureThreshold) {
        // Threshold reached — open the circuit
        circuit.state = STATE.OPEN;
        circuit.openedAt = Date.now();
        log.warn(
          'OPEN',
          `[${key}] ${circuit.failures} consecutive failures — circuit opened for ${cooldownMs}ms`
        );
      }
    }

    throw err;
  }
}

module.exports = { breaker, CircuitOpenError, _resetAll, STATE };
