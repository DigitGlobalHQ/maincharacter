/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/alerts.js — Slack incoming-webhook alerting
 * ═══════════════════════════════════════════════════════════════════
 *
 * DRY-RUN when SLACK_WEBHOOK_URL is not set: logs intent, never throws.
 * An alert failure can never crash a request or take down the app.
 *
 * Throttle/dedup: in-memory Map keyed by `key`. Cooldowns:
 *   critical: ALERT_COOLDOWN_CRITICAL_MS (default 5 min)
 *   warning:  ALERT_COOLDOWN_WARNING_MS  (default 15 min)
 *
 * Suppressed duplicates accumulate a count. On the next send after the
 * cooldown, the count is included as "(N more suppressed)" in the payload.
 *
 * These are internal ops messages. Plain text, no emoji, no Consultant voice.
 */

'use strict';

const axios = require('axios');
const { createLogger } = require('./log');

const log = createLogger('ALERTS');

const POST_TIMEOUT_MS = 4000;

// ─── Throttle state (in-memory; single instance is fine on Render) ──────────

const _throttle = new Map();
// { lastSentAt: number, suppressed: number }

function _resetThrottle() {
  _throttle.clear();
}

function _suppressForKey(key) {
  const entry = _throttle.get(key);
  if (entry) {
    entry.suppressed = (entry.suppressed || 0) + 1;
  }
}

// ─── Cooldown helpers ────────────────────────────────────────────────────────

function _cooldowns() {
  const critical = Number(process.env.ALERT_COOLDOWN_CRITICAL_MS) || 5 * 60 * 1000;
  const warning = Number(process.env.ALERT_COOLDOWN_WARNING_MS) || 15 * 60 * 1000;
  return { critical, warning };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true when SLACK_WEBHOOK_URL is set (the module is configured).
 */
function isConfigured() {
  return Boolean(process.env.SLACK_WEBHOOK_URL);
}

/**
 * Send an alert to Slack (or log a dry-run when not configured).
 *
 * @param {object} opts
 * @param {'critical'|'warning'} opts.severity
 * @param {string} opts.title   short human label
 * @param {string} opts.detail  error message or description
 * @param {string} opts.key     stable dedup signature (e.g. 'gemini-key-down')
 * @param {object} [opts.meta]  optional extra key/value fields
 * @returns {Promise<void>}     never rejects — all errors are swallowed
 */
async function notify({ severity = 'critical', title, detail, key, meta } = {}) {
  try {
    const url = process.env.SLACK_WEBHOOK_URL;

    // ── DRY-RUN ──────────────────────────────────────────────────────
    if (!url) {
      const level = severity === 'critical' ? 'warn' : 'info';
      log[level](
        'DRY-RUN',
        `[${severity.toUpperCase()}] ${title} — ${detail} (key=${key})`,
        meta || undefined
      );
      return;
    }

    // ── Throttle check ───────────────────────────────────────────────
    const { critical: critMs, warning: warnMs } = _cooldowns();
    const cooldownMs = severity === 'critical' ? critMs : warnMs;
    const now = Date.now();
    const existing = _throttle.get(key);

    if (existing && now - existing.lastSentAt < cooldownMs) {
      existing.suppressed = (existing.suppressed || 0) + 1;
      log.info('THROTTLE', `Suppressed ${key} (${existing.suppressed} total suppressed, cooldown ${cooldownMs}ms)`);
      return;
    }

    // ── Build payload ────────────────────────────────────────────────
    const suppressed = existing ? (existing.suppressed || 0) : 0;
    const label = severity === 'critical' ? '[CRITICAL]' : '[WARNING]';
    const color = severity === 'critical' ? 'danger' : 'warning';

    const titleText = suppressed > 0
      ? `${label} ${title} (${suppressed} more suppressed)`
      : `${label} ${title}`;

    const fields = [
      { title: 'environment', value: process.env.NODE_ENV || 'unknown', short: true },
      { title: 'timestamp', value: new Date().toISOString(), short: true },
    ];

    if (meta && typeof meta === 'object') {
      for (const [k, v] of Object.entries(meta)) {
        fields.push({ title: k, value: String(v), short: true });
      }
    }

    const payload = {
      attachments: [
        {
          color,
          title: titleText,
          text: detail || '',
          fields,
          footer: `MainCharacter | key: ${key}`,
        },
      ],
    };

    // ── Reset / record throttle state BEFORE the POST (so a slow Slack
    //    doesn't let a flood through while the request is in-flight) ──
    _throttle.set(key, { lastSentAt: now, suppressed: 0 });

    // ── POST to Slack ────────────────────────────────────────────────
    await axios.post(url, payload, { timeout: POST_TIMEOUT_MS });
    log.info('SENT', `${severity} alert: ${key}`);
  } catch (err) {
    // Alerting failures must NEVER propagate — log and swallow.
    log.error('SEND-FAIL', `Alert delivery failed (key=${key}): ${err.message}`);
  }
}

module.exports = {
  notify,
  isConfigured,
  // Test helpers — underscore-prefixed so callers know they're internal.
  _resetThrottle,
  _suppressForKey,
  _cooldowns,
};
