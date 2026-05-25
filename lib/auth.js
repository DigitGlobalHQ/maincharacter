/**
 * lib/auth.js — admin authentication (P1.4).
 *
 * Password check prefers a bcrypt hash (ADMIN_PASSWORD_HASH). Until the
 * founder sets one, it falls back to the plaintext ADMIN_PASSWORD so they are
 * never locked out — but once the hash is set, plaintext stops working and the
 * legacy x-admin-password header is rejected (see routes/admin.js).
 *
 * Generate a hash:  node -e "console.log(require('./lib/auth').hashPassword('your-pw'))"
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '12h';

/** The secret used to sign admin JWTs. Falls back to a derived value. */
function jwtSecret() {
  return (
    process.env.ADMIN_JWT_SECRET ||
    process.env.ADMIN_PASSWORD_HASH ||
    process.env.ADMIN_PASSWORD ||
    'maincharacter-dev-secret'
  );
}

/** True once a bcrypt hash is configured (legacy plaintext then disabled). */
function hashConfigured() {
  return !!process.env.ADMIN_PASSWORD_HASH;
}

/** Generate a bcrypt hash for a plaintext password (CLI helper). */
function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

/**
 * Validate a plaintext password against the configured credential.
 * @param {string} plain
 * @returns {boolean}
 */
function checkPassword(plain) {
  if (!plain) return false;
  if (process.env.ADMIN_PASSWORD_HASH) {
    try {
      return bcrypt.compareSync(plain, process.env.ADMIN_PASSWORD_HASH);
    } catch {
      return false;
    }
  }
  const plaintext = process.env.ADMIN_PASSWORD || 'maincharacter2026';
  return plain === plaintext;
}

/** Sign a short-lived admin JWT. */
function signAdminToken(payload = {}) {
  return jwt.sign({ role: 'admin', ...payload }, jwtSecret(), { expiresIn: TOKEN_TTL });
}

/**
 * Verify an admin JWT. Returns the decoded payload or null.
 * @param {string} token
 */
function verifyAdminToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret());
    return decoded && decoded.role === 'admin' ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = {
  hashPassword,
  checkPassword,
  signAdminToken,
  verifyAdminToken,
  hashConfigured,
};
