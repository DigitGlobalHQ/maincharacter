/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/retry.js — generic exponential-backoff retry helper
 * ═══════════════════════════════════════════════════════════════════
 *
 * withRetry(fn, opts) → Promise
 *
 * Retries `fn` on transient errors with exponential back-off + optional jitter.
 * Never retries 4xx errors (except 429) — they will not succeed on retry.
 * Never throws synchronously.
 *
 * opts:
 *   retries      number  max retry attempts after the first attempt (default 2)
 *   baseMs       number  base delay in ms (default 300)
 *   maxMs        number  cap on delay in ms (default 4000)
 *   factor       number  multiplier per retry (default 2)
 *   jitter       boolean add ±25% random jitter to delay (default true)
 *   isRetryable  fn(err) → bool  override default retryability check
 *   onRetry      fn(err, attempt)  called before each retry (for logging)
 *   label        string  tag for log lines (optional)
 */

'use strict';

const { createLogger } = require('./log');
const log = createLogger('RETRY');

/**
 * Extract HTTP status from an error object.
 * Checks err.status, err.statusCode, err.response?.status, and
 * err.$metadata?.httpStatusCode (AWS SDK v3 / Cloudflare R2) in that order.
 * @param {Error} err
 * @returns {number|null}
 */
function httpStatus(err) {
  if (err == null) return null;
  const s =
    err.status ||
    err.statusCode ||
    (err.response && err.response.status) ||
    (err.$metadata && err.$metadata.httpStatusCode);
  return typeof s === 'number' ? s : null;
}

/**
 * Default isRetryable predicate.
 *
 * Retryable:
 *   - Network/transport errors: ECONNRESET, ETIMEDOUT, ENOTFOUND, EAI_AGAIN
 *   - "socket hang up"
 *   - HTTP 5xx (500-599)
 *   - HTTP 429 (rate limit — retry after back-off)
 *
 * NOT retryable (fail fast):
 *   - HTTP 4xx other than 429 (bad request, auth, not found, conflict, etc.)
 *
 * @param {Error} err
 * @returns {boolean}
 */
function defaultIsRetryable(err) {
  // Network-layer errors (no HTTP status)
  const code = err && err.code;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED'
  ) {
    return true;
  }

  // "socket hang up" — common Node.js message for aborted connections
  if (err && err.message && err.message.includes('socket hang up')) {
    return true;
  }

  const status = httpStatus(err);

  // No status code detected — treat as transient network error
  if (status == null) {
    // But only if there's no indication it's a permanent logic error
    // (e.g. a plain Error thrown by bad arguments).  We're conservative:
    // if there is a code we already caught it above; anything else with no
    // status is assumed transient.
    return false;
  }

  // 429 — rate limited; back off and retry
  if (status === 429) return true;

  // 5xx — server-side transient
  if (status >= 500 && status <= 599) return true;

  // 4xx (except 429 above) — permanent client-side error, no point retrying
  return false;
}

/**
 * Compute the delay for attempt N (0-indexed retry number).
 * delay = min(baseMs * factor^attempt, maxMs)
 * Optionally applies ±25% jitter.
 *
 * @param {number} attempt  0-indexed retry number
 * @param {object} opts
 * @returns {number} delay in ms
 */
function computeDelay(attempt, { baseMs, maxMs, factor, jitter }) {
  const raw = Math.min(baseMs * Math.pow(factor, attempt), maxMs);
  if (!jitter) return Math.round(raw);
  // ±25% uniform jitter
  const range = raw * 0.25;
  return Math.round(raw - range + Math.random() * 2 * range);
}

/**
 * Execute `fn` with automatic exponential-backoff retries on transient errors.
 *
 * @param {Function} fn  async () => any
 * @param {object} [opts]
 * @param {number}   [opts.retries=2]
 * @param {number}   [opts.baseMs=300]
 * @param {number}   [opts.maxMs=4000]
 * @param {number}   [opts.factor=2]
 * @param {boolean}  [opts.jitter=true]
 * @param {Function} [opts.isRetryable]  (err) => boolean
 * @param {Function} [opts.onRetry]      (err, attempt) => void
 * @param {string}   [opts.label]        tag for log lines
 * @returns {Promise<any>}
 */
async function withRetry(fn, opts = {}) {
  const {
    retries = 2,
    baseMs = 300,
    maxMs = 4000,
    factor = 2,
    jitter = true,
    isRetryable = defaultIsRetryable,
    onRetry,
    label = '',
  } = opts;

  const delayOpts = { baseMs, maxMs, factor, jitter };
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err)) {
        // Permanent error — propagate immediately, no retry
        throw err;
      }

      if (attempt >= retries) {
        // Exhausted all retries — propagate last error
        break;
      }

      const delay = computeDelay(attempt, delayOpts);
      const tag = label ? `[${label}]` : '';
      log.warn(
        'RETRY',
        `${tag} transient error on attempt ${attempt + 1}/${retries + 1} — retrying in ${delay}ms: ${err && err.message}`
      );

      if (onRetry) {
        try { onRetry(err, attempt + 1); } catch { /* never let onRetry break the loop */ }
      }

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

module.exports = { withRetry, defaultIsRetryable, httpStatus };
