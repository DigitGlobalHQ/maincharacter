/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING AUTH — scoped JWT + middleware (Night-4, P3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Issues a Lookmaxxing-scoped JWT (24h) for the PWA. Distinct from the admin
 * JWT (lib/auth.js): these tokens carry `scope: 'lookmax'` and a userId/phone so
 * a leaked PWA token can never act as an admin. Signed with JWT_SECRET (falls
 * back to ADMIN_JWT_SECRET, then a dev secret).
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 45-day session so a returning user stays signed in across browser restarts
// (the token is persisted in localStorage, which survives close/reopen).
// funnel-repair Item 2(a).
const TOKEN_TTL = '45d';

// Login Gate (P0-1): startup-time guard — when the email magic-link flow is
// explicitly enabled (LOOKMAX_EMAIL_LOGIN=true), JWT_SECRET MUST be set.
// The fallback chain below is fine during development / flag-off, but issuing
// real user JWTs against a dev string or a bcrypt hash in production is a
// security violation. Throw early so the problem is visible at boot, not mid-
// request. (CLAUDE.md §6 — never weaken security.)
if (process.env.LOOKMAX_EMAIL_LOGIN === 'true' && !process.env.JWT_SECRET) {
  throw new Error(
    '[lookmax-auth] LOOKMAX_EMAIL_LOGIN=true requires JWT_SECRET to be set. ' +
    'Add JWT_SECRET to your Render environment variables (see FOUNDER_ACTIONS_THIS_WEEK.md item #5).'
  );
}

function jwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_PASSWORD_HASH ||
    'maincharacter-lookmax-dev'
  );
}

/**
 * Record a successful sign-in on the user record. Central so EVERY session-issue
 * path (email OTP, Google, magic-link, admin) tracks the same fields, surfaced in
 * /admin ("who has signed in and when"). Best-effort — never blocks issuing the
 * session, never throws.
 *
 * Sets:
 *   lastLoginAt   ISO of this sign-in (always advanced)
 *   firstLoginAt  ISO of the first-ever sign-in (written once; distinct from the
 *                 unrelated one-shot `firstLoginToken` post-payment bridge)
 *   loginCount    total successful sign-ins
 *   authProvider  google | email | admin | phone-otp | comp | ...
 *
 * @param {object} user      live user record (must have .phone)
 * @param {string} [provider] override; falls back to user.authProvider
 * @returns {Promise<object>} the updated user, or the input on failure
 */
async function recordLogin(user, provider) {
  if (!user || !user.phone) return user;
  const isFirstLogin = !user.firstLoginAt;
  const resolvedProvider = provider || user.authProvider || 'unknown';
  const nowIso = new Date().toISOString();
  const patch = {
    lastLoginAt: nowIso,
    loginCount: (user.loginCount || 0) + 1,
    authProvider: resolvedProvider,
  };
  if (isFirstLogin) patch.firstLoginAt = nowIso;

  let updated;
  try {
    updated = (await User.updateUser(user.phone, patch)) || user;
  } catch {
    return user;
  }

  // PR C — fire the welcome email ONCE, on a real user's first-ever sign-in.
  // Only for self-serve providers (google/email) with an email on file; admin /
  // comp / phone-otp accounts are excluded. Fire-and-forget — never blocks login.
  if (isFirstLogin && updated && updated.email && (resolvedProvider === 'google' || resolvedProvider === 'email')) {
    try {
      require('../services/email') // eslint-disable-line global-require
        .sendWelcome({ user: updated })
        .catch(() => {});
    } catch { /* email module unavailable — non-fatal */ }
  }

  return updated;
}

/** Sign a Lookmaxxing-scoped token for a user. */
function signLookmaxToken(user) {
  return jwt.sign(
    { userId: user.token, phone: user.phone, scope: 'lookmax' },
    jwtSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

/** Verify + decode a Lookmaxxing token. Returns the payload or null. */
function verifyLookmaxToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret());
    return decoded && decoded.scope === 'lookmax' ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Express middleware: require a valid Lookmaxxing token and attach the live
 * user record as req.lookmaxUser. 401 when missing/invalid; 404 when the user
 * no longer exists (e.g. store wiped on a Render redeploy).
 */
async function requireLookmaxAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token;
  const decoded = verifyLookmaxToken(token);
  if (!decoded) return res.status(401).json({ error: 'unauthorized' });

  // User.* is backend-adapted (async under Postgres) — must await, or req.lookmaxUser
  // becomes a Promise and every downstream handler breaks on live. (funnel-repair)
  try {
    const user = (await User.getUserByToken(decoded.userId)) || (await User.getUserByPhone(decoded.phone));
    if (!user) return res.status(404).json({ error: 'user not found' });
    req.lookmaxUser = user;
    req.lookmaxToken = token; // embedded into token-gated photo URLs (reveal)
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { signLookmaxToken, verifyLookmaxToken, requireLookmaxAuth, recordLogin };
