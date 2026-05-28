/**
 * ═══════════════════════════════════════════════════════════════════
 * WEB PUSH SERVICE — VAPID push notifications (B4)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Wraps the `web-push` npm package. Reads VAPID credentials lazily
 * from env so tests can flip env vars per-case.
 *
 * DORMANT until WEB_PUSH_VAPID_PUBLIC + WEB_PUSH_VAPID_PRIVATE are set.
 * When unset, every send returns { result: 'dry-run' } — no network call.
 * Same pattern as services/whatsapp.js.
 *
 * STORAGE: push subscriptions live on the User record under the
 * `push_subscriptions` field (array of PushSubscriptionRecord).
 * Idempotent on endpoint — duplicate endpoints are not double-stored.
 *
 * DPDPA: push subscriptions are PII-adjacent. They are stored only
 * behind the user's authenticated session token and are never returned
 * in any client-facing API response (enforced by /api/lookmax/me).
 */

const { createLogger } = require('../lib/log');

const log = createLogger('PUSH');

/** Read VAPID creds lazily. */
function creds() {
  return {
    publicKey: process.env.WEB_PUSH_VAPID_PUBLIC || '',
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE || '',
    contact: process.env.WEB_PUSH_CONTACT || `mailto:${process.env.ADMIN_EMAIL || 'admin@maincharacter.digitglobalservices.com'}`,
  };
}

/** Whether VAPID credentials are configured. */
function isConfigured() {
  const c = creds();
  return !!(c.publicKey && c.privateKey);
}

/**
 * Return a DRY-RUN stub without throwing.
 * @param {object} payload
 * @returns {{ result: 'dry-run' }}
 */
function silent(_payload) {
  return { result: 'dry-run' };
}

/**
 * Send a push notification to all subscriptions for a given userToken.
 *
 * @param {string} userToken  the user's dashboard token
 * @param {{ title: string, body: string, url?: string }} payload
 * @returns {Promise<{ result: string, sent: number, failed: number }>}
 */
async function sendToUser(userToken, payload) {
  if (!isConfigured()) {
    log.info('DRY-RUN', `VAPID not configured — skipping push to user ${userToken}`);
    return { result: 'dry-run', sent: 0, failed: 0 };
  }

  const User = require('../models/User');
  const user = User.getUserByToken(userToken);
  if (!user) {
    log.warn('PUSH', `user not found for token ${userToken}`);
    return { result: 'not-found', sent: 0, failed: 0 };
  }

  const subs = user.push_subscriptions || [];
  if (subs.length === 0) {
    log.info('PUSH', `no subscriptions for user ${userToken}`);
    return { result: 'no-subscriptions', sent: 0, failed: 0 };
  }

  // Initialise web-push with VAPID details
  let webPush;
  try {
    webPush = require('web-push');
    const c = creds();
    webPush.setVapidDetails(c.contact, c.publicKey, c.privateKey);
  } catch (err) {
    log.error('PUSH', `web-push init failed: ${err.message}`);
    return { result: 'init-error', sent: 0, failed: 0 };
  }

  const notificationPayload = JSON.stringify({
    title: payload.title || '◆ MainCharacter',
    body: payload.body || '<!-- TODO copy -->',
    url: payload.url || '/lookmax/mirror',
    icon: '/lookmax/icons/icon-192.png',
    badge: '/lookmax/icons/icon-192.png',
  });

  let sent = 0;
  let failed = 0;
  const staleSubs = [];

  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        notificationPayload
      );
      sent++;
      log.info('PUSH', `sent to endpoint …${sub.endpoint.slice(-20)} for user ${userToken}`);
    } catch (err) {
      // 410 Gone or 404 means the subscription is expired — mark for removal
      if (err.statusCode === 410 || err.statusCode === 404) {
        staleSubs.push(sub.endpoint);
        log.info('PUSH', `stale subscription removed for user ${userToken}`);
      } else {
        failed++;
        log.warn('PUSH', `send failed for user ${userToken}: ${err.message}`);
      }
    }
  }

  // Prune stale subscriptions atomically
  if (staleSubs.length > 0) {
    const fresh = subs.filter((s) => !staleSubs.includes(s.endpoint));
    User.updateUser(user.phone, { push_subscriptions: fresh });
  }

  return { result: 'ok', sent, failed };
}

module.exports = {
  isConfigured,
  sendToUser,
  silent,
};
