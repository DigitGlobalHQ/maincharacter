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
const { signLookmaxToken, requireLookmaxAuth, recordLogin } = require('../lib/lookmax-auth');
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

// NOTE: User.getAllUsers() is backend-adapted — synchronous under the JSON store
// but a Promise under Postgres. These helpers MUST await it; without the await,
// `Object.values(<Promise>)` is [] on live PG and the token is never found
// (the one-shot bridge then 401s with "token not found"). (funnel-repair)

/** Find a user by their magicLinkToken (linear scan — acceptable at JSON-store scale). */
async function getUserByMagicLinkToken(token) {
  const users = await User.getAllUsers();
  return Object.values(users).find((u) => u.magicLinkToken === token) || null;
}

/** Find a user by their firstLoginToken (linear scan). */
async function getUserByFirstLoginToken(token) {
  const users = await User.getAllUsers();
  return Object.values(users).find((u) => u.firstLoginToken === token) || null;
}

// ─── GET /auth/method — discovery endpoint for the frontend ───

router.get('/auth/method', (req, res) => {
  // `google` lets the frontend hide the Google button when OAuth isn't
  // configured, so clicking it can never silently dead-end. funnel-repair.
  const google = googleConfigured();
  if (emailLoginEnabled()) return res.json({ method: 'email', google });
  if (otpAvailable()) return res.json({ method: 'otp', google });
  return res.json({ method: 'admin-only', google });
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

  // The Lookmaxing funnel is sign-in-first, so a `next` into the funnel marks a
  // NEW sign-up — find-or-create the account (funnel-repair P1). Dashboard login
  // (no funnel `next`) keeps its login-only, no-op-for-unknown behaviour. Either
  // way the response is {sent} — enumeration-safe, no account state leaks.
  const rawNext = (req.body && req.body.next) || null;
  const funnelSignup = typeof rawNext === 'string' && /^\/(lookmaxing|lookmax)(\/|$|\?)/.test(rawNext);

  let user;
  if (funnelSignup) {
    try {
      user = await User.getOrCreateByEmail({ email: normalised, name: 'Seeker' });
    } catch (err) {
      log.info('REQUEST-LINK', `invalid email — no-op: ${err.message}`);
      return res.json({ status: 'sent' });
    }
  } else {
    user = await User.getUserByEmail(normalised);
    if (!user) {
      log.info('REQUEST-LINK', `no-match for ${maskEmail(normalised)}`);
      return res.json({ status: 'sent' });
    }
  }

  // Mint a magic link token (32-byte random hex, 15-min TTL, single-use).
  const magicLinkToken = crypto.randomBytes(32).toString('hex');
  await User.updateUser(user.phone, {
    magicLinkToken,
    magicLinkExpiresAt: Date.now() + 15 * 60 * 1000,
    magicLinkConsumedAt: null,
  });

  // Send the email — DRY-RUN-safe when RESEND_API_KEY unset. `next` routes the
  // user into the funnel after consume (whitelisted in sendMagicLink).
  email.sendMagicLink({ user, token: magicLinkToken, next: rawNext }).catch((err) => {
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

  const user = await getUserByMagicLinkToken(token);

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
  await User.updateUser(user.phone, {
    magicLinkToken: null,
    magicLinkExpiresAt: null,
    magicLinkConsumedAt: new Date().toISOString(),
  });
  ipRecordSuccess(ip);
  log.info('CONSUME-LINK', `JWT issued for ${maskPhone(user.phone)}`);

  let updatedUser = await User.getUserByPhone(user.phone);
  updatedUser = await recordLogin(updatedUser); // provider falls back to stored authProvider (email)
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

  const user = await getUserByFirstLoginToken(token);

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
  await User.updateUser(user.phone, {
    firstLoginToken: null,
    firstLoginExpiresAt: null,
    firstLoginConsumedAt: new Date().toISOString(),
  });
  ipRecordSuccess(ip);
  log.info('EXCHANGE-FIRST-LOGIN', `JWT issued for ${maskPhone(user.phone)}`);

  let updatedUser = await User.getUserByPhone(user.phone);
  updatedUser = await recordLogin(updatedUser); // google / post-payment — provider from stored authProvider
  return res.json({ token: signLookmaxToken(updatedUser), user: publicUser(updatedUser) });
});

// ─── Admin bypass login ─── (unchanged from Night-4, log line masked)

router.post('/auth/admin-login', async (req, res) => {
  const { phone, password } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!adminLib.isAdminPhone(normalised) || !auth.checkPassword(password)) {
    log.warn('ADMIN-LOGIN', `failed admin login for ${maskPhone(normalised || 'unknown')}`);
    return res.status(401).json({ error: 'phone or password incorrect' });
  }
  // Ensure an activated user exists for this admin phone.
  let user = await User.getUserByPhone(normalised);
  if (!user) {
    await User.createUser({ name: 'Founder', phone: normalised, pillar: 'aesthetic' });
    user = await User.updateUser(normalised, { lookmaxxingActive: true, lookmaxxingStartedAt: new Date().toISOString() });
  }
  log.info('ADMIN-LOGIN', `admin authenticated: ${maskPhone(normalised)}`);
  user = await recordLogin(user, 'admin');
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

router.post('/auth/verify-otp', async (req, res) => {
  const { phone, otp } = req.body || {};
  const normalised = normalizePhone(phone);
  if (!Lookmax.verifyOtp(normalised, otp)) {
    return res.status(401).json({ error: 'invalid or expired code' });
  }
  let user = await User.getUserByPhone(normalised);
  if (!user) {
    user = await User.createUser({ name: 'Seeker', phone: normalised, pillar: 'aesthetic' });
  }
  user = await recordLogin(user, 'phone-otp');
  res.json({ token: signLookmaxToken(user), user: publicUser(user) });
});

// ─── Current user ───

router.get('/me', requireLookmaxAuth, (req, res) => {
  res.json({ user: publicUser(req.lookmaxUser) });
});

// ─── Logout (stateless) ───

router.post('/auth/logout', (req, res) => res.json({ ok: true }));

// ═══════════════════════════════════════════════════════════════════
// GOOGLE SIGN-IN — OAuth 2.0 Authorization Code flow (funnel-repair P2)
// ═══════════════════════════════════════════════════════════════════
// No new dependency: the code↔token exchange uses Node's global fetch, and the
// session is delivered via the existing one-shot firstLoginToken + the
// /auth/exchange-first-login route (no JWT ever placed in a URL).
// Enabled only when GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET are set;
// until then /auth/google/start redirects back with ?error=google_unavailable.

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function googleConfigured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}
function googleRedirectUri() {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const base = (process.env.UPGRADE_BASE_URL || '').replace(/\/$/, '');
  return `${base}/api/lookmax/auth/google/callback`;
}
function stateSecret() {
  return process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || 'maincharacter-lookmax-dev';
}
/** Only allow redirects back into our own funnel — never an open redirect. */
function safeNext(next) {
  const n = typeof next === 'string' ? next : '';
  return /^\/(lookmaxing|lookmax)(\/|$|\?)/.test(n) ? n : '/lookmaxing/quiz';
}
function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyState(state) {
  if (!state || !state.includes('.')) return null;
  const [body, sig] = state.split('.');
  const expect = crypto.createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

// GET /auth/google/start — kick off the consent redirect.
router.get('/auth/google/start', (req, res) => {
  if (!googleConfigured()) {
    log.warn('GOOGLE', 'start hit but Google OAuth is not configured');
    return res.redirect('/lookmaxing/start?error=google_unavailable');
  }
  const next = safeNext(req.query.next);
  const nonce = crypto.randomBytes(16).toString('hex');
  res.cookie('g_oauth_nonce', nonce, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/api/lookmax', maxAge: 10 * 60 * 1000,
  });
  const state = signState({ next, nonce, exp: Date.now() + 10 * 60 * 1000 });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', googleRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');
  return res.redirect(url.toString());
});

// GET /auth/google/callback — exchange the code, find/create the user, bridge a session.
router.get('/auth/google/callback', async (req, res) => {
  const fail = (reason) => {
    log.warn('GOOGLE', `callback failed: ${reason}`);
    return res.redirect('/lookmaxing/start?error=google_signin');
  };
  if (!googleConfigured()) return fail('not configured');

  const { code, state } = req.query;
  if (!code || !state) return fail('missing code/state');
  const parsed = verifyState(String(state));
  if (!parsed) return fail('bad/expired state');

  // CSRF: the nonce cookie set at /start must match the one bound into the state.
  const cookieHeader = req.headers.cookie || '';
  const nonceEntry = cookieHeader.split(';').map((s) => s.trim()).find((s) => s.startsWith('g_oauth_nonce='));
  const nonceVal = nonceEntry ? nonceEntry.slice('g_oauth_nonce='.length) : null;
  res.clearCookie('g_oauth_nonce', { path: '/api/lookmax' });
  if (!nonceVal || nonceVal !== parsed.nonce) return fail('nonce mismatch');

  // Exchange the authorization code for tokens (server-to-server, with our secret).
  let tok;
  try {
    const body = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    });
    const r = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) return fail(`token exchange (${tok.error || r.status})`);
  } catch (e) { return fail(`token exchange error: ${e.message}`); }

  // The id_token came directly from Google over TLS in exchange for our client
  // secret — its payload is trusted without re-verifying the signature.
  let claims;
  try { claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString()); }
  catch { return fail('id_token decode'); }
  if (!claims.email || !claims.email_verified) return fail('email not verified');

  let user;
  try { user = await User.getOrCreateByEmail({ email: claims.email, name: claims.name, provider: 'google' }); }
  catch (e) { return fail(`user upsert: ${e.message}`); }

  // Mint a one-shot login token and bridge to the page that stores the session.
  const flt = crypto.randomBytes(32).toString('hex');
  await User.updateUser(user.phone, {
    firstLoginToken: flt, firstLoginExpiresAt: Date.now() + 10 * 60 * 1000, firstLoginConsumedAt: null,
  });
  log.info('GOOGLE', `sign-in for ${maskEmail(claims.email)} → bridge`);
  return res.redirect(`/lookmax/oauth-complete?flt=${flt}&next=${encodeURIComponent(parsed.next)}`);
});

module.exports = router;
module.exports.googleConfigured = googleConfigured;
module.exports._signState = signState;
module.exports._verifyState = verifyState;
module.exports._safeNext = safeNext;
module.exports.publicUser = publicUser;
module.exports.otpAvailable = otpAvailable;
// Export maps for testing (allows in-test inspection / reset)
module.exports._emailThrottle = emailThrottle;
module.exports._ipCooldown = ipCooldown;
