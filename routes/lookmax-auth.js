/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING AUTH ROUTES (Night-4, P3.1) — mounted at /api/lookmax
 * ═══════════════════════════════════════════════════════════════════
 *
 * - POST /auth/admin-login   admin bypass (phone in allowlist + bcrypt password)
 * - POST /auth/request-otp   dormant until WhatsApp Cloud API is live + enabled
 * - POST /auth/verify-otp    consume an OTP, issue a token
 * - GET  /me                 current user (requireLookmaxAuth)
 * - POST /auth/logout        no-op (JWT is stateless; client clears storage)
 */

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Lookmax = require('../models/Lookmax');
const auth = require('../lib/auth');
const adminLib = require('../lib/admin');
const { signLookmaxToken, requireLookmaxAuth } = require('../lib/lookmax-auth');
const { normalizePhone } = require('../lib/messaging-mode');
const whatsapp = require('../services/whatsapp');
const sms = require('../services/sms');
const { createLogger } = require('../lib/log');

const log = createLogger('LOOKMAX-AUTH');

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
  // Dormant until Meta credentials exist AND the founder explicitly enables it
  // (display-name approval can't be auto-detected). DECISIONS.md Night-4 #3.
  return whatsapp.isConfigured() && process.env.WHATSAPP_OTP_ENABLED === 'true';
}

// ─── Admin bypass login ───
router.post('/auth/admin-login', (req, res) => {
  const { phone, password } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!adminLib.isAdminPhone(normalised) || !auth.checkPassword(password)) {
    log.warn('ADMIN-LOGIN', `failed admin login for ${normalised || 'unknown'}`);
    return res.status(401).json({ error: 'phone or password incorrect' });
  }
  // Ensure an activated user exists for this admin phone (founder may log in
  // before seeding); seed-test-user is still the richer path.
  let user = User.getUserByPhone(normalised);
  if (!user) {
    user = User.createUser({ name: 'Founder', phone: normalised, pillar: 'aesthetic' });
    user = User.updateUser(normalised, { lookmaxxingActive: true, lookmaxxingStartedAt: new Date().toISOString() });
  }
  log.info('ADMIN-LOGIN', `admin authenticated: ${normalised}`);
  res.json({ token: signLookmaxToken(user), user: publicUser(user) });
});

// ─── Request OTP (dormant until enabled) ───
router.post('/auth/request-otp', async (req, res) => {
  const { phone } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!/^\d{10,13}$/.test(normalised)) return res.status(400).json({ error: 'valid phone required' });

  if (!otpAvailable()) {
    return res.json({ status: 'unavailable', message: 'OTP is currently unavailable. Admin login is required.' });
  }

  const otp = sms.generateOtp();
  Lookmax.setOtp(normalised, otp);
  try {
    await whatsapp.sendOtp(normalised, otp);
  } catch (err) {
    log.error('OTP', `send failed for ${normalised}: ${err.message}`);
    return res.status(502).json({ status: 'error', message: 'Could not send the code. Try admin login.' });
  }
  log.info('OTP', `code issued to ${normalised}`);
  res.json({ status: 'sent' });
});

// ─── Verify OTP ───
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
