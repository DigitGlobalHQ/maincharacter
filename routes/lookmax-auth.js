/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING AUTH ROUTES — mounted at /api/lookmax
 * ═══════════════════════════════════════════════════════════════════
 *
 * Night-4 (P3.1) routes — unchanged:
 *   POST /auth/admin-login    admin bypass (phone in allowlist + bcrypt password)
 *   POST /auth/request-otp   dormant; now returns "use email" message
 *   POST /auth/verify-otp    consume an OTP, issue a token (dormant)
 *   GET  /me                 current user (requireLookmaxAuth)
 *   POST /auth/logout        no-op (JWT is stateless; client clears storage)
 *
 * Login Gate (P0-1) routes — feature-flagged on LOOKMAX_EMAIL_LOGIN=true:
 *   POST /auth/request-link         send a magic-link email (enumeration-safe)
 *   POST /auth/consume-link         exchange a magic-link token for a JWT
 *   POST /auth/exchange-first-login exchange the firstLoginToken (post-payment) for a JWT
 *   GET  /auth/method               discovery endpoint for the frontend
 *
 * All new routes use lib/log-mask.js — no raw PII in any log line.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const User = require('../models/User');
const Lookmax = require('../models/Lookmax');
const auth = require('../lib/auth');
const adminLib = require('../lib/admin');
const { signLookmaxToken, requireLookmaxAuth } = require('../lib/lookmax-auth');
const { normalizePhone } = require('../lib/messaging-mode');
const whatsapp = require('../services/whatsapp');
const sms = require('../services/sms');
const email = require('../services/email');
const { maskEmail, maskPhone, maskToken } = require('../lib/log-mask');
const { createLogger } = require('../lib/log');

const log = createLogger('LOOKMAX-AUTH');

/** Whether the email magic-link login path is enabled. */
function emailLoginEnabled() {
  return process.env.LOOKMAX_EMAIL_LOGIN === 'true';
}

/** Public-safe view of a user for the PWA (no phone-internal fields, no PII leak). */
function publicUser(user) {
  const status = User.computeAuraStatus(user);
  return {
    token: user.token,
    name: user.name,
    phone: user.phone,
    oratorActive: status.oratorActive,
    lookmaxxingActive: status.lookmaxxingActive,
    auraPlusPlus: status.auraPlusPlus,
    mirrorLevel: user.mirrorLevel || 'raw',
  };
}

/** Whether the OTP login path can deliver yet. */
function otpAvailable() {
  // Dormant until Meta credentials exist AND the founder explicitly enables it.
  // DECISIONS.md Night-4 #3.
  return whatsapp.isConfigured() && process.env.WHATSAPP_OTP_ENABLED === 'true';
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-email throttle: 3 requests / 15 min per lowercased email.
// Map<email, number[]> — timestamps of recent requests.
// In-memory; resets on redeploy (accepted for v1). Pruned to cap size at 10k.
// ─────────────────────────────────────────────────────────────────────────────
const emailThrottle = new Map(); // email → [timestamp, ...]
const EMAIL_THROTTLE_MAX = 3;
const EMAIL_THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_THROTTLE_MAP_CAP = 10_000;

function emailThrottleAllow(normalised) {
  const now = Date.now();
  const window = now - EMAIL_THROTTLE_WINDOW_MS;
  const ts = (emailThrottle.get(normalised) || []).filter((t) => t > window);
  if (ts.length >= EMAIL_THROTTLE_MAX) {
    // Silently absorb — do not advance the window (drop the request but keep timestamps)
    return false;
  }
  ts.push(now);
  // Prune the map when it gets large (keep newest entries by clearing oldest key)
  if (emailThrottle.size >= EMAIL_THROTTLE_MAP_CAP) {
    const firstKey = emailThrottle.keys().next().value;
    emailThrottle.delete(firstKey);
  }
  emailThrottle.set(normalised, ts);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-IP cooldown on consume-link / exchange-first-login:
// 3 consecutive failures from one IP → 5-min cooldown.
// Map<ip, {fails:number, cooldownUntil:number}>
// ─────────────────────────────────────────────────────────────────────────────
const ipCooldown = new Map(); // ip → {fails, cooldownUntil}
const COOLDOWN_FAIL_MAX = 3;
const COOLDOWN_DURATION_MS = 5 * 60 * 1000;
const IP_COOLDOWN_MAP_CAP = 10_000;

function ipCooled(ip) {
  const s = ipCooldown.get(ip);
  if (!s) return false;
  if (s.cooldownUntil && Date.now() < s.cooldownUntil) return true;
  return false;
}

function ipRecordFailure(ip) {
  const s = ipCooldown.get(ip) || { fails: 0, cooldownUntil: 0 };
  s.fails += 1;
  if (s.fails >= COOLDOWN_FAIL_MAX) {
    s.cooldownUntil = Date.now() + COOLDOWN_DURATION_MS;
  }
  // Prune the map when it gets large (keep newest entries by evicting oldest key)
  if (ipCooldown.size >= IP_COOLDOWN_MAP_CAP) {
    const firstKey = ipCooldown.keys().next().value;
    ipCooldown.delete(firstKey);
  }
  ipCooldown.set(ip, s);
}

function ipRecordSuccess(ip) {
  ipCooldown.delete(ip);
}

/** Generic 401 used for ALL failure modes — no enumeration. */
function tokenExpiredOrUsed(res) {
  return res.status(401).json({ error: 'link expired or already used' });
}

/** Find a user by their magicLinkToken (linear scan — acceptable at JSON-store scale). */
function getUserByMagicLinkToken(token) {
  const users = User.getAllUsers();
  return Object.values(users).find((u) => u.magicLinkToken === token) || null;
}

/** Find a user by their firstLoginToken (linear scan). */
function getUserByFirstLoginToken(token) {
  const users = User.getAllUsers();
  return Object.values(users).find((u) => u.firstLoginToken === token) || null;
}

// ─── GET /auth/method — discovery endpoint for the frontend ───

router.get('/auth/method', (req, res) => {
  if (emailLoginEnabled()) return res.json({ method: 'email' });
  if (otpAvailable()) return res.json({ method: 'otp' });
  return res.json({ method: 'admin-only' });
});

// ─── POST /auth/request-link — send a magic-link email ───

router.post('/auth/request-link', async (req, res) => {
  // Always return {status:'sent'} regardless of whether the email maps to a user
  // — enumeration-safe (spec §9).
  const rawEmail = (req.body && req.body.email) || null;
  const normalised = rawEmail ? String(rawEmail).trim().toLowerCase() : '';

  // Feature flag off: no-op send (no email delivered).
  if (!emailLoginEnabled()) {
    log.info('REQUEST-LINK', 'flag off — no-op');
    return res.json({ status: 'sent' });
  }

  if (!normalised) {
    log.info('REQUEST-LINK', 'no email supplied — no-op');
    return res.json({ status: 'sent' });
  }

  // Per-email throttle check (max 3 / 15 min per email).
  const allowed = emailThrottleAllow(normalised);

  if (!allowed) {
    // Silently absorb — still returns {status:'sent'}, no enumeration.
    log.info('REQUEST-LINK', `throttled ${maskEmail(normalised)}`);
    return res.json({ status: 'sent' });
  }

  const user = User.getUserByEmail(normalised);
  if (!user) {
    log.info('REQUEST-LINK', `no-match for ${maskEmail(normalised)}`);
    return res.json({ status: 'sent' });
  }

  // Mint a magic link token (32-byte random hex, 15-min TTL, single-use).
  const magicLinkToken = crypto.randomBytes(32).toString('hex');
  User.updateUser(user.phone, {
    magicLinkToken,
    magicLinkExpiresAt: Date.now() + 15 * 60 * 1000,
    magicLinkConsumedAt: null,
  });

  // Send the email — DRY-RUN-safe when RESEND_API_KEY unset.
  email.sendMagicLink({ user, token: magicLinkToken }).catch((err) => {
    log.error('REQUEST-LINK', `sendMagicLink failed for ${maskEmail(normalised)}: ${err.message}`);
  });

  log.info('REQUEST-LINK', `link issued for ${maskEmail(normalised)}`);
  return res.json({ status: 'sent' });
});

// ─── POST /auth/consume-link — exchange a magic-link token for a JWT ───

router.post('/auth/consume-link', async (req, res) => {
  if (!emailLoginEnabled()) return tokenExpiredOrUsed(res);

  const ip = req.ip || 'unknown';

  // Per-IP cooldown guard.
  if (ipCooled(ip)) {
    log.warn('CONSUME-LINK', `IP ${ip} is cooled — rejected`);
    return tokenExpiredOrUsed(res);
  }

  const token = (req.body && req.body.token) ? String(req.body.token) : null;
  if (!token) {
    ipRecordFailure(ip);
    return tokenExpiredOrUsed(res);
  }

  const user = getUserByMagicLinkToken(token);

  if (!user) {
    ipRecordFailure(ip);
    log.warn('CONSUME-LINK', `token ${maskToken(token)} not found`);
    return tokenExpiredOrUsed(res);
  }

  if (user.magicLinkConsumedAt) {
    ipRecordFailure(ip);
    log.warn('CONSUME-LINK', `already consumed for ${maskPhone(user.phone)}`);
    return tokenExpiredOrUsed(res);
  }

  if (!user.magicLinkExpiresAt || Date.now() > user.magicLinkExpiresAt) {
    ipRecordFailure(ip);
    log.warn('CONSUME-LINK', `expired token for ${maskPhone(user.phone)}`);
    return tokenExpiredOrUsed(res);
  }

  // Valid — clear the token fields and issue a JWT.
  User.updateUser(user.phone, {
    magicLinkToken: null,
    magicLinkExpiresAt: null,
    magicLinkConsumedAt: new Date().toISOString(),
  });
  ipRecordSuccess(ip);
  log.info('CONSUME-LINK', `JWT issued for ${maskPhone(user.phone)}`);

  const updatedUser = User.getUserByPhone(user.phone);
  return res.json({ token: signLookmaxToken(updatedUser), user: publicUser(updatedUser) });
});

// ─── POST /auth/exchange-first-login — exchange the one-shot firstLoginToken ───

router.post('/auth/exchange-first-login', async (req, res) => {
  if (!emailLoginEnabled()) return tokenExpiredOrUsed(res);

  const ip = req.ip || 'unknown';

  // Per-IP cooldown guard (shared with consume-link).
  if (ipCooled(ip)) {
    log.warn('EXCHANGE-FIRST-LOGIN', `IP ${ip} is cooled — rejected`);
    return tokenExpiredOrUsed(res);
  }

  const token = (req.body && req.body.firstLoginToken) ? String(req.body.firstLoginToken) : null;
  if (!token) {
    ipRecordFailure(ip);
    return tokenExpiredOrUsed(res);
  }

  const user = getUserByFirstLoginToken(token);

  if (!user) {
    ipRecordFailure(ip);
    log.warn('EXCHANGE-FIRST-LOGIN', `token ${maskToken(token)} not found`);
    return tokenExpiredOrUsed(res);
  }

  if (user.firstLoginConsumedAt) {
    ipRecordFailure(ip);
    log.warn('EXCHANGE-FIRST-LOGIN', `already consumed for ${maskPhone(user.phone)}`);
    return tokenExpiredOrUsed(res);
  }

  if (!user.firstLoginExpiresAt || Date.now() > user.firstLoginExpiresAt) {
    ipRecordFailure(ip);
    log.warn('EXCHANGE-FIRST-LOGIN', `expired firstLoginToken for ${maskPhone(user.phone)}`);
    return tokenExpiredOrUsed(res);
  }

  // Valid — clear the firstLogin fields and issue a JWT.
  User.updateUser(user.phone, {
    firstLoginToken: null,
    firstLoginExpiresAt: null,
    firstLoginConsumedAt: new Date().toISOString(),
  });
  ipRecordSuccess(ip);
  log.info('EXCHANGE-FIRST-LOGIN', `JWT issued for ${maskPhone(user.phone)}`);

  const updatedUser = User.getUserByPhone(user.phone);
  return res.json({ token: signLookmaxToken(updatedUser), user: publicUser(updatedUser) });
});

// ─── Admin bypass login ─── (unchanged from Night-4, log line masked)

router.post('/auth/admin-login', (req, res) => {
  const { phone, password } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!adminLib.isAdminPhone(normalised) || !auth.checkPassword(password)) {
    log.warn('ADMIN-LOGIN', `failed admin login for ${maskPhone(normalised || 'unknown')}`);
    return res.status(401).json({ error: 'phone or password incorrect' });
  }
  // Ensure an activated user exists for this admin phone.
  let user = User.getUserByPhone(normalised);
  if (!user) {
    user = User.createUser({ name: 'Founder', phone: normalised, pillar: 'aesthetic' });
    user = User.updateUser(normalised, { lookmaxxingActive: true, lookmaxxingStartedAt: new Date().toISOString() });
  }
  log.info('ADMIN-LOGIN', `admin authenticated: ${maskPhone(normalised)}`);
  res.json({ token: signLookmaxToken(user), user: publicUser(user) });
});

// ─── Request OTP (dormant — now always returns "use email" message) ───

router.post('/auth/request-otp', async (req, res) => {
  const { phone } = req.body || {};
  const normalised = normalizePhone(phone);

  // When email login is enabled, redirect to email path.
  if (emailLoginEnabled()) {
    return res.json({ status: 'unavailable', message: 'Use the email entry link.' });
  }

  if (!/^\d{10,13}$/.test(normalised)) {
    return res.status(400).json({ error: 'valid phone required' });
  }

  if (!otpAvailable()) {
    return res.json({ status: 'unavailable', message: 'OTP is currently unavailable. Admin login is required.' });
  }

  const otp = sms.generateOtp();
  Lookmax.setOtp(normalised, otp);
  try {
    await whatsapp.sendOtp(normalised, otp);
  } catch (err) {
    log.error('OTP', `send failed for ${maskPhone(normalised)}: ${err.message}`);
    return res.status(502).json({ status: 'error', message: 'Could not send the code. Try admin login.' });
  }
  log.info('OTP', `code issued to ${maskPhone(normalised)}`);
  res.json({ status: 'sent' });
});

// ─── Verify OTP (unchanged — resurfaces with WhatsApp OTP) ───

router.post('/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!Lookmax.verifyOtp(normalised, otp)) {
    return res.status(401).json({ error: 'invalid or expired code' });
  }
  let user = User.getUserByPhone(normalised);
  if (!user) {
    user = User.createUser({ name: 'Seeker', phone: normalised, pillar: 'aesthetic' });
  }
  res.json({ token: signLookmaxToken(user), user: publicUser(user) });
});

// ─── Current user ───

router.get('/me', requireLookmaxAuth, (req, res) => {
  res.json({ user: publicUser(req.lookmaxUser) });
});

// ─── Logout (stateless) ───

router.post('/auth/logout', (req, res) => res.json({ ok: true }));

module.exports = router;
module.exports.publicUser = publicUser;
module.exports.otpAvailable = otpAvailable;
// Export maps for testing (allows in-test inspection / reset)
module.exports._emailThrottle = emailThrottle;
module.exports._ipCooldown = ipCooldown;
