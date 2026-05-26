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

const TOKEN_TTL = '24h';

function jwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_PASSWORD_HASH ||
    'maincharacter-lookmax-dev'
  );
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
function requireLookmaxAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token;
  const decoded = verifyLookmaxToken(token);
  if (!decoded) return res.status(401).json({ error: 'unauthorized' });

  const user = User.getUserByToken(decoded.userId) || User.getUserByPhone(decoded.phone);
  if (!user) return res.status(404).json({ error: 'user not found' });
  req.lookmaxUser = user;
  next();
}

module.exports = { signLookmaxToken, verifyLookmaxToken, requireLookmaxAuth };
