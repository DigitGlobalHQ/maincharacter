/**
 * ═══════════════════════════════════════════════════════════════════
 * WHATSAPP CLOUD API SERVICE — Meta Graph API v18.0
 * ═══════════════════════════════════════════════════════════════════
 *
 * Replaces the removed Wati integration (Night-3 migration, DECISIONS.md).
 * The public interface is backward-compatible with the old Wati service so
 * callers (scheduler, routes, admin) need only swap the require path.
 *
 * DORMANT until credentials are configured. If WHATSAPP_ACCESS_TOKEN or
 * WHATSAPP_PHONE_NUMBER_ID is empty, every send logs a DRY-RUN line and returns
 * a stub `{ result: 'dry-run' }` — no network call. This is the expected state
 * on production until the founder finishes Meta Business Manager setup.
 *
 * SEND GUARD: respects WHATSAPP_SEND_MODE (all | allowlist | off) via
 * lib/messaging-mode. Default `allowlist` → only ADMIN_PHONE receives real sends.
 *
 * WEBHOOK: Meta signs POSTs with `x-hub-signature-256` (HMAC-SHA256 of the raw
 * body using the app secret) and performs a GET verification handshake on attach.
 */

const axios = require('axios');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');
const mode = require('../lib/messaging-mode');
const { withRetry } = require('../lib/retry');
const { breaker, CircuitOpenError } = require('../lib/circuit-breaker');

const log = createLogger('WHATSAPP');

// Retry opts for sendMessageSafe.  Keep existing 1-retry behaviour (retries=1)
// to preserve the original contract — callers depend on at-most-one-retry.
//
// isRetryable: retry on ALL errors (the original implementation retried every
// error with a 2s sleep).  sendMessageSafe never throws and returns null on total
// failure, so broadening the retry set here is safe — the circuit breaker is the
// backstop against persistent failures.
const SAFE_RETRY_OPTS = {
  retries: 1,
  baseMs: 2000,
  maxMs: 4000,
  factor: 2,
  jitter: false,
  label: 'whatsapp-safe',
  isRetryable: () => true,
};

// Circuit-breaker opts for the WhatsApp channel.
const BREAKER_OPTS = {
  failureThreshold: 5,
  cooldownMs: 30000,
};

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v18.0';

/** Read creds lazily so tests can flip env vars per-case. */
function creds() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  };
}

/** Whether the send path has the minimum credentials to call Meta. */
function isConfigured() {
  const c = creds();
  return !!(c.accessToken && c.phoneNumberId);
}

/**
 * Apply the send-mode + credential guards. Returns a stub object to short-circuit
 * the send, or null to proceed with a real API call.
 * @param {string} normalized normalised phone
 * @param {string} label log label for the suppressed line
 * @returns {{result:string, mode?:string}|null}
 */
function guard(normalized, label) {
  const sendMode = mode.getSendMode();

  if (sendMode === 'off') {
    log.info('DRY-RUN', `[mode=off] suppressed ${label} to ${normalized}`);
    return { result: 'suppressed', mode: sendMode };
  }
  if (sendMode === 'allowlist' && !mode.isPhoneAllowed(normalized)) {
    log.warn('BLOCKED', `[mode=allowlist] ${normalized} not on allowlist — ${label} not sent`);
    return { result: 'blocked', mode: sendMode };
  }
  if (!isConfigured()) {
    log.info('DRY-RUN', `credentials not configured. Would have sent ${label} to ${normalized}`);
    return { result: 'dry-run' };
  }
  return null;
}

/**
 * Send a free-form text message (valid within the 24h customer-service window).
 * @param {string} phone
 * @param {string} text
 * @returns {Promise<object>}
 */
async function sendMessage(phone, text) {
  const normalized = mode.normalizePhone(phone);
  const blocked = guard(normalized, `text "${String(text).slice(0, 80)}"`);
  if (blocked) return blocked;

  const c = creds();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${c.phoneNumberId}/messages`;
  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalized,
      type: 'text',
      text: { preview_url: false, body: String(text) },
    },
    {
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  log.info('SENT', `→ ${normalized} (${String(text).length} chars) status=${response.status}`);
  return response.data;
}

/**
 * Send a pre-approved template message (for use outside the 24h window).
 * @param {string} phone
 * @param {string} templateName
 * @param {Array<{type?:string, text?:string}>|Array<string>} params positional body params
 * @param {string} [langCode='en']
 * @returns {Promise<object>}
 */
async function sendTemplateMessage(phone, templateName, params = [], langCode = 'en') {
  const normalized = mode.normalizePhone(phone);
  const blocked = guard(normalized, `template ${templateName}`);
  if (blocked) return blocked;

  const c = creds();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${c.phoneNumberId}/messages`;

  const components = [];
  if (params && params.length) {
    components.push({
      type: 'body',
      parameters: params.map((p) =>
        typeof p === 'string' ? { type: 'text', text: p } : { type: 'text', text: p.text ?? '' }
      ),
    });
  }

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: normalized,
      type: 'template',
      template: {
        name: templateName,
        language: { code: langCode },
        ...(components.length ? { components } : {}),
      },
    },
    {
      headers: { Authorization: `Bearer ${c.accessToken}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  log.info('TEMPLATE', `→ ${normalized} template=${templateName} status=${response.status}`);
  return response.data;
}

/**
 * Send a one-time login code via a Meta "authentication" template (Night-4, P3).
 * The template (default `otp_login`) must be pre-approved with one body
 * parameter — the OTP. DRY-RUN/allowlist-gated like every other send.
 * @param {string} phone
 * @param {string} otp 6-digit code
 * @param {string} [templateName]
 * @returns {Promise<object>}
 */
async function sendOtp(phone, otp, templateName = process.env.WHATSAPP_OTP_TEMPLATE || 'otp_login') {
  return sendTemplateMessage(phone, templateName, [String(otp)]);
}

/**
 * Send a message with one retry (standardised via withRetry).
 * Never throws — returns null on total failure or when circuit is open.
 * Suppressed/blocked/dry-run sends are returned as-is (no retry needed).
 *
 * Contract preserved: at most 1 retry (retries=1), 2 s base delay — identical
 * behaviour to the previous hand-rolled implementation, now using the shared
 * withRetry helper.  The circuit breaker is keyed to 'whatsapp' so persistent
 * failures open the breaker and short-circuit subsequent sends without blocking.
 *
 * @param {string} phone
 * @param {string} text
 * @returns {Promise<object|null>}
 */
async function sendMessageSafe(phone, text) {
  // Guard first — suppressed/blocked/dry-run stubs never need retry or breaker.
  const normalized = mode.normalizePhone(phone);
  const blocked = guard(normalized, `text "${String(text).slice(0, 80)}"`);
  if (blocked) return blocked;

  try {
    return await breaker(
      'whatsapp',
      () => withRetry(() => sendMessage(phone, text), SAFE_RETRY_OPTS),
      BREAKER_OPTS
    );
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      log.warn('CIRCUIT-OPEN', `WhatsApp circuit open — message to ${normalized} suppressed`);
      return null;
    }
    log.error('FAIL', `all attempts failed for ${normalized}`, { error: err.message });
    return null;
  }
}

/**
 * Verify an incoming Meta webhook POST.
 *
 * Meta signs the raw request body with `x-hub-signature-256` =
 * `sha256=` + HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET). Until the app secret is
 * configured we accept unsigned requests and report `open` mode, so real user
 * replies don't 401 in production before setup completes (DECISIONS.md #7).
 *
 * @param {Buffer|string} rawBody exact bytes Meta signed
 * @param {string} signature value of the x-hub-signature-256 header
 * @returns {{ ok: boolean, mode: 'hmac'|'open', reason?: string }}
 */
function verifyWebhookSignature(rawBody, signature) {
  const { appSecret } = creds();
  if (!appSecret) {
    return { ok: true, mode: 'open', reason: 'no WHATSAPP_APP_SECRET — accepting unsigned' };
  }
  if (!signature) return { ok: false, mode: 'hmac', reason: 'missing x-hub-signature-256' };

  const payload = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody != null ? String(rawBody) : '');
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, mode: 'hmac', reason: ok ? undefined : 'signature mismatch' };
}

/**
 * Meta's GET verification handshake performed when a webhook is first attached.
 * Returns the challenge string to echo back when the mode + token match, else null.
 * @param {string} hubMode value of `hub.mode`
 * @param {string} token value of `hub.verify_token`
 * @param {string} challenge value of `hub.challenge`
 * @returns {string|null}
 */
function verifyWebhookChallenge(hubMode, token, challenge) {
  const { verifyToken } = creds();
  if (hubMode === 'subscribe' && verifyToken && token === verifyToken) {
    return challenge;
  }
  return null;
}

/** Human-readable webhook guard mode for the boot banner. */
function webhookGuardMode() {
  return creds().appSecret ? 'hmac' : 'open';
}

module.exports = {
  sendMessage,
  sendMessageSafe,
  sendTemplateMessage,
  sendOtp,
  verifyWebhookSignature,
  verifyWebhookChallenge,
  webhookGuardMode,
  isConfigured,
  // Re-exported from the shared guard for backward compatibility with callers.
  normalizePhone: mode.normalizePhone,
  getSendMode: mode.getSendMode,
  isAllowed: mode.isPhoneAllowed,
  allowedNumbers: mode.allowedNumbers,
};
