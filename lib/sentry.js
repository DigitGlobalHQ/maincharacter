/**
 * lib/sentry.js — optional error monitoring.
 *
 * No-op unless SENTRY_DSN is set. Lazily requires @sentry/node so a missing
 * package or unset DSN never crashes the app — it just disables monitoring.
 */

const { createLogger } = require('./log');

const log = createLogger('SENTRY');
let Sentry = null;

/** Initialise Sentry if SENTRY_DSN is configured. Safe to call once at boot. */
function init() {
  if (!process.env.SENTRY_DSN) return null;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
    });
    log.info('INIT', 'Sentry initialised');
    return Sentry;
  } catch (err) {
    log.warn('INIT', `Sentry not initialised: ${err.message}`);
    Sentry = null;
    return null;
  }
}

/** Attach Sentry's Express error handler (no-op if Sentry is disabled). */
function setupExpressErrorHandler(app) {
  if (Sentry && typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
  }
}

/** Capture an exception if Sentry is enabled. */
function captureException(err) {
  if (Sentry) Sentry.captureException(err);
}

function isEnabled() {
  return !!Sentry;
}

module.exports = { init, setupExpressErrorHandler, captureException, isEnabled };
