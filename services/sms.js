/**
 * ═══════════════════════════════════════════════════════════════════
 * SMS SERVICE — MSG91 (v5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Used for Lookmaxxing PWA OTP login and SMS fallback (Night-3 migration).
 *
 * DORMANT until MSG91_AUTH_KEY is set: every send is a logged DRY-RUN and
 * returns a stub `{ result: 'dry-run' }` — no network call.
 *
 * SEND GUARD: shares the messaging kill-switch (lib/messaging-mode). The mode
 * variable WHATSAPP_SEND_MODE governs all channels (it is the generic
 * "messaging mode" now — DECISIONS.md Night-3 #5 / P3.4). Default `allowlist`
 * → only ADMIN_PHONE receives a real SMS.
 *
 * India SMS is DLT-regulated: only the approved template IDs in
 * MSG91_TEMPLATE_ID_OTP (and the flow template for generic SMS) will deliver.
 */

const axios = require('axios');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');
const mode = require('../lib/messaging-mode');
const { withRetry } = require('../lib/retry');
const { breaker, CircuitOpenError } = require('../lib/circuit-breaker');

const log = createLogger('SMS');

// Retry opts for MSG91 axios calls.
const RETRY_OPTS = {
  retries: 2,
  baseMs: 300,
  maxMs: 4000,
  factor: 2,
  jitter: true,
  label: 'sms-transport',
};

// Circuit-breaker opts for the SMS channel.
const BREAKER_OPTS = {
  failureThreshold: 5,
  cooldownMs: 30000,
};

const MSG91_BASE = 'https://control.msg91.com/api/v5';

function creds() {
  return {
    authKey: process.env.MSG91_AUTH_KEY || '',
    otpTemplateId: process.env.MSG91_TEMPLATE_ID_OTP || '',
    senderId: process.env.MSG91_SENDER_ID || 'MAINCH',
  };
}

/** Whether the SMS path has the minimum credentials to call MSG91. */
function isConfigured() {
  return !!creds().authKey;
}

/**
 * Apply the send-mode + credential guards. Returns a stub to short-circuit,
 * or null to proceed with a real API call.
 * @param {string} normalized normalised phone
 * @param {string} label log label
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
 * Generate a cryptographically-random 6-digit OTP string (zero-padded).
 * @returns {string}
 */
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Send a DLT-approved OTP via MSG91. Caller supplies the OTP (use generateOtp()).
 * Retries on transient/5xx/429.  When the SMS circuit breaker is open, returns
 * a `{ result: 'circuit-open' }` stub — caller treats it like a swallowed send.
 * @param {string} phone
 * @param {string} otp 6-digit code
 * @returns {Promise<object>}
 */
async function sendOtp(phone, otp) {
  const normalized = mode.normalizePhone(phone);
  const blocked = guard(normalized, 'OTP');
  if (blocked) return blocked;

  const c = creds();

  try {
    const response = await breaker(
      'sms',
      () => withRetry(
        () => axios.post(
          `${MSG91_BASE}/otp`,
          {},
          {
            params: { template_id: c.otpTemplateId, mobile: normalized, otp, otp_length: 6 },
            headers: { authkey: c.authKey, 'Content-Type': 'application/json' },
            timeout: 15000,
          }
        ),
        RETRY_OPTS
      ),
      BREAKER_OPTS
    );
    log.info('OTP', `→ ${normalized} status=${response.status}`);
    return response.data;
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      log.warn('CIRCUIT-OPEN', `SMS circuit open — OTP to ${normalized} suppressed`);
      return { result: 'circuit-open' };
    }
    throw err;
  }
}

/**
 * Send a generic SMS via an MSG91 flow (DLT-approved template only).
 * Retries on transient/5xx/429.  When the SMS circuit breaker is open, returns
 * a `{ result: 'circuit-open' }` stub — caller treats it like a swallowed send.
 * @param {string} phone
 * @param {string} message message text (must match an approved template)
 * @param {string} [templateId] flow template id; defaults to MSG91_FLOW_TEMPLATE_ID
 * @returns {Promise<object>}
 */
async function sendSms(phone, message, templateId = process.env.MSG91_FLOW_TEMPLATE_ID || '') {
  const normalized = mode.normalizePhone(phone);
  const blocked = guard(normalized, 'SMS');
  if (blocked) return blocked;

  const c = creds();

  try {
    const response = await breaker(
      'sms',
      () => withRetry(
        () => axios.post(
          `${MSG91_BASE}/flow/`,
          {
            template_id: templateId,
            sender: c.senderId,
            recipients: [{ mobiles: normalized, message }],
          },
          {
            headers: { authkey: c.authKey, 'Content-Type': 'application/json' },
            timeout: 15000,
          }
        ),
        RETRY_OPTS
      ),
      BREAKER_OPTS
    );
    log.info('SMS', `→ ${normalized} (${message.length} chars) status=${response.status}`);
    return response.data;
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      log.warn('CIRCUIT-OPEN', `SMS circuit open — message to ${normalized} suppressed`);
      return { result: 'circuit-open' };
    }
    throw err;
  }
}

module.exports = {
  sendOtp,
  sendSms,
  generateOtp,
  isConfigured,
};
