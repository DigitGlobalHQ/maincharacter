/**
 * ═══════════════════════════════════════════════════════════════════
 * lib/activity-feed.js — Threaded Slack user-activity feed
 * ═══════════════════════════════════════════════════════════════════
 *
 * Posts to a SEPARATE Slack channel (SLACK_ACTIVITY_CHANNEL) — not
 * to the ops-alerting channel (SLACK_WEBHOOK_URL / lib/alerts.js).
 * Do NOT modify lib/alerts.js.
 *
 * Modes (priority order):
 *  1. THREADED — SLACK_BOT_TOKEN + SLACK_ACTIVITY_CHANNEL present.
 *     Uses chat.postMessage (Web API) so threads work.
 *     The parent `ts` is persisted on the user as `activityThreadTs`.
 *  2. FLAT FALLBACK — only SLACK_ACTIVITY_WEBHOOK_URL present.
 *     Posts each event as a top-level message, prefixed with user identity.
 *  3. DRY-RUN — neither configured. Logs intent and no-ops. Never throws.
 *
 * FAIL-SAFE GUARANTEE: A feed error can NEVER block a login, a request, or
 * crash the app. Every public function is fire-and-forget safe.
 *
 * Internal ops messages. Plain text. No Consultant voice. No decorative emoji.
 *
 * Env vars (all optional — document in render.yaml):
 *   SLACK_BOT_TOKEN          xoxb-… ; enables threaded mode
 *   SLACK_ACTIVITY_CHANNEL   channel ID (C0XXXX); required with bot token
 *   SLACK_ACTIVITY_WEBHOOK_URL  optional flat fallback webhook
 */

'use strict';

const axios = require('axios');
const { createLogger } = require('./log');

const log = createLogger('ACTIVITY-FEED');

const POST_TIMEOUT_MS = 4000;
const CHAT_POST_URL = 'https://slack.com/api/chat.postMessage';

// ─── Curated milestone event map ─────────────────────────────────────────────
// MILESTONES ONLY. Noisy micro-events (quiz steps, video plays, protocol_task_completed,
// landing_viewed, dashboard_loaded, lookmax_first_login) are intentionally excluded.

const ACTIVITY_EVENTS = {
  audit_started:                  'Started the audit',
  audit_analysis_completed:       'Audit complete',
  lookmaxing_audit_generated:     'Audit complete',
  lookmaxing_paywall_viewed:      'Reached the paywall',
  paywall_viewed:                 'Reached the paywall',
  payment_succeeded:              'PAID — subscription active',
  lookmaxing_pay_succeeded:       'PAID — Lookmaxxing',
  bundle_attached:                'Added the Aura++ bundle',
  lookmax_first_mirror_taken:     'Took first mirror',
  mirror_taken:                   'Daily mirror',
  reveal_watched:                 'Watched the weekly reveal',
  reaudit_completed:              'Completed the Day-30 re-audit',
};

// Payment events that deserve the green attachment treatment.
const PAYMENT_EVENTS = new Set([
  'payment_succeeded',
  'lookmaxing_pay_succeeded',
  'bundle_attached',
]);

// ─── Mode helpers ────────────────────────────────────────────────────────────

function _isBotMode() {
  return !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_ACTIVITY_CHANNEL);
}

function _isWebhookMode() {
  return !!process.env.SLACK_ACTIVITY_WEBHOOK_URL;
}

/**
 * Returns true if bot-token mode OR webhook fallback is configured.
 * Surfaced on /health.
 */
function isConfigured() {
  return _isBotMode() || _isWebhookMode();
}

// ─── Slack POST helpers ───────────────────────────────────────────────────────

/**
 * POST to Slack chat.postMessage (threaded mode).
 * Returns the response `ts` on ok:true, null otherwise.
 * @param {{ text?: string, thread_ts?: string, attachments?: Array }} payload
 * @returns {Promise<string|null>}
 */
async function _botPost(payload) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_ACTIVITY_CHANNEL;
  const body = { channel, ...payload };
  const resp = await axios.post(CHAT_POST_URL, body, {
    timeout: POST_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (resp.data && resp.data.ok) {
    return resp.data.ts || null;
  }
  log.warn('ACTIVITY-FEED', `chat.postMessage ok:false — ${resp.data && resp.data.error}`);
  return null;
}

/**
 * POST to the flat incoming webhook (fallback mode).
 * @param {object} body  Slack message body (text or attachments)
 */
async function _webhookPost(body) {
  const url = process.env.SLACK_ACTIVITY_WEBHOOK_URL;
  await axios.post(url, body, { timeout: POST_TIMEOUT_MS });
}

// ─── Parent message builder ───────────────────────────────────────────────────

function _parentText(user) {
  const parts = [`New signup — ${user.name || 'unknown'}`];
  if (user.email) parts.push(`<${user.email}>`);
  if (user.authProvider) parts.push(`via ${user.authProvider}`);
  parts.push(`· ${new Date().toISOString()}`);
  return parts.join(' ');
}

// ─── Thread reply builder ─────────────────────────────────────────────────────

function _replyPayload(user, { event, props = {} } = {}) {
  const label = ACTIVITY_EVENTS[event] || event;
  let text = label;

  // Append contextual detail from props
  if (event === 'payment_succeeded' && props.amount) {
    text += ` — ₹${(props.amount / 100).toFixed(0)}`;
  }
  if (event === 'mirror_taken' && props.streak) {
    text += ` (streak: ${props.streak})`;
  }

  if (PAYMENT_EVENTS.has(event)) {
    return {
      text,
      attachments: [{ color: 'good', text }],
    };
  }

  return { text };
}

// ─── Flat fallback message builder ───────────────────────────────────────────

function _flatText(user, { event, props = {} } = {}) {
  const label = ACTIVITY_EVENTS[event] || event;
  const identity = user.name || user.email || user.phone || 'unknown';
  let text = `[${identity}] ${label}`;
  if (event === 'payment_succeeded' && props.amount) {
    text += ` — ₹${(props.amount / 100).toFixed(0)}`;
  }
  if (event === 'mirror_taken' && props.streak) {
    text += ` (streak: ${props.streak})`;
  }
  return text;
}

// ─── Lazy User model require (avoids circular deps) ──────────────────────────

function _User() {
  return require('../models/User'); // eslint-disable-line global-require
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Post the PARENT message for a new signup.
 *
 * In threaded mode: captures the returned `ts` and persists it on the user
 * as `activityThreadTs` so subsequent userActivity calls thread under it.
 *
 * Idempotent: if `user.activityThreadTs` is already set (threaded mode),
 * does NOT post a second parent.
 *
 * Skips comp users entirely (dogfood/founder accounts).
 *
 * @param {object} user  user record from User.js
 * @returns {Promise<void>}  always resolves; never rejects
 */
async function userSignedUp(user) {
  try {
    if (!user) return;
    if (user.comp) return; // comp/dogfood accounts excluded

    // ── DRY-RUN ──
    if (!isConfigured()) {
      log.info('ACTIVITY-FEED', `DRY-RUN userSignedUp: ${user.name || user.phone}`);
      return;
    }

    // ── Bot / threaded mode ──
    if (_isBotMode()) {
      // Idempotent: do not post if the thread already exists
      if (user.activityThreadTs) return;

      const text = _parentText(user);
      const ts = await _botPost({ text });
      if (ts && user.phone) {
        try {
          await _User().updateUser(user.phone, { activityThreadTs: ts });
        } catch (err) {
          log.warn('ACTIVITY-FEED', `Could not persist activityThreadTs: ${err.message}`);
        }
      }
      return;
    }

    // ── Flat webhook fallback ──
    if (_isWebhookMode()) {
      await _webhookPost({ text: _parentText(user) });
    }
  } catch (err) {
    // Feed failures MUST NOT propagate.
    log.error('ACTIVITY-FEED', `userSignedUp error (swallowed): ${err.message}`);
  }
}

/**
 * Post a journey update as a threaded reply under the user's parent message.
 *
 * If the user has no thread yet (no activityThreadTs), lazily creates the parent
 * first (reusing userSignedUp logic) then replies.
 *
 * Skips comp users and non-curated events entirely.
 *
 * @param {object} user              live user record
 * @param {{ event: string, props?: object }} opts
 * @returns {Promise<void>}  always resolves; never rejects
 */
async function userActivity(user, { event, props = {} } = {}) {
  try {
    if (!user) return;
    if (user.comp) return;

    // Only forward milestone events in the curated map
    if (!ACTIVITY_EVENTS[event]) return;

    // ── DRY-RUN ──
    if (!isConfigured()) {
      log.info('ACTIVITY-FEED', `DRY-RUN userActivity [${event}]: ${user.name || user.phone}`);
      return;
    }

    // ── Bot / threaded mode ──
    if (_isBotMode()) {
      let threadTs = user.activityThreadTs;

      // Lazy parent creation: create a parent if none exists
      if (!threadTs) {
        log.info('ACTIVITY-FEED', `No thread for user ${user.phone || 'unknown'} — creating parent`);
        // Post the parent
        const parentText = _parentText(user);
        const ts = await _botPost({ text: parentText });
        if (ts && user.phone) {
          try {
            await _User().updateUser(user.phone, { activityThreadTs: ts });
          } catch (err) {
            log.warn('ACTIVITY-FEED', `Could not persist activityThreadTs: ${err.message}`);
          }
        }
        threadTs = ts;
      }

      if (!threadTs) {
        // Parent creation failed (Slack error); still attempt to post top-level
        log.warn('ACTIVITY-FEED', `No thread_ts available — posting top-level reply for ${event}`);
      }

      const replyPayload = _replyPayload(user, { event, props });
      const payload = threadTs ? { thread_ts: threadTs, ...replyPayload } : replyPayload;
      await _botPost(payload);
      return;
    }

    // ── Flat webhook fallback ──
    if (_isWebhookMode()) {
      const text = _flatText(user, { event, props });
      await _webhookPost({ text });
    }
  } catch (err) {
    log.error('ACTIVITY-FEED', `userActivity error (swallowed): ${err.message}`);
  }
}

module.exports = {
  isConfigured,
  userSignedUp,
  userActivity,
  ACTIVITY_EVENTS, // exported for tests
};
