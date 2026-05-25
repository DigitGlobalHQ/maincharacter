/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/log.js — tiny leveled logger
 * ═══════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   const { createLogger } = require('../lib/log');
 *   const log = createLogger('WATI');
 *   log.info('SENT', '→ 91xxxx (42 chars)');
 *   log.error('FAIL', 'both attempts failed', { phone });
 *
 * - Human-readable lines in development, single-line JSON in production
 *   (NODE_ENV=production) so logs are parseable by Render/Axiom/etc.
 * - LOG_LEVEL env (debug|info|warn|error) sets the floor. Default: info.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold() {
  const lvl = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[lvl] || LEVELS.info;
}

function isProd() {
  return process.env.NODE_ENV === 'production';
}

function emit(level, namespace, tag, msg, meta) {
  if (LEVELS[level] < threshold()) return;

  const ts = new Date().toISOString();
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (isProd()) {
    const record = { ts, level, ns: namespace, tag, msg };
    if (meta && typeof meta === 'object') Object.assign(record, meta);
    stream.write(JSON.stringify(record) + '\n');
  } else {
    const tagPart = tag ? `${namespace}:${tag}` : namespace;
    const metaPart = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    stream.write(`[${ts}] [${tagPart}] ${msg}${metaPart}\n`);
  }
}

/**
 * Create a logger bound to a namespace (e.g. 'WATI', 'SCHED', 'API').
 * @param {string} namespace
 * @returns {{debug:Function, info:Function, warn:Function, error:Function}}
 */
function createLogger(namespace) {
  return {
    debug: (tag, msg, meta) => emit('debug', namespace, tag, msg, meta),
    info: (tag, msg, meta) => emit('info', namespace, tag, msg, meta),
    warn: (tag, msg, meta) => emit('warn', namespace, tag, msg, meta),
    error: (tag, msg, meta) => emit('error', namespace, tag, msg, meta),
  };
}

module.exports = { createLogger, LEVELS };
