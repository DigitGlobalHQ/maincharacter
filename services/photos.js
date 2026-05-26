/**
 * ═══════════════════════════════════════════════════════════════════
 * PHOTOS SERVICE — per-user mirror/hair photo storage (Night-4, P4/P5)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Saves to /tmp/maincharacter-uploads/{userId}/{kind}-{ts}.jpg (DECISIONS.md
 * Night-4 #5). VOLATILE on Render — every save logs a warning. R2 migration is
 * a week-2 BACKLOG item. Photos are served token-gated at /uploads/... so a user
 * can only read their own files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLogger } = require('../lib/log');

const log = createLogger('PHOTOS');

const ROOT = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'maincharacter-uploads');

function ensureRoot() {
  if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });
}
ensureRoot();

function userDir(userId) {
  const dir = path.join(ROOT, sanitize(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Strip path separators so a userId/filename can't escape the root. */
function sanitize(seg) {
  return String(seg || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Persist a user's photo to /tmp. Returns { path, filename, userId }.
 * @param {{ userId:string, buffer:Buffer, kind:string, mimeType?:string }} opts
 */
async function saveUserPhoto({ userId, buffer, kind = 'mirror', mimeType = 'image/jpeg' }) {
  const dir = userDir(userId);
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const filename = `${sanitize(kind)}-${Date.now()}.${ext}`;
  const abs = path.join(dir, filename);
  fs.writeFileSync(abs, buffer);
  log.warn(
    'photos',
    `saved to /tmp — volatile, will be lost on next Render redeploy. Add R2 in week 2. (${path.relative(ROOT, abs)})`
  );
  return { path: abs, filename, userId };
}

/**
 * Build a token-gated public URL for a stored photo.
 * @param {string} absPath path returned by saveUserPhoto
 * @param {string} token a Lookmaxxing JWT (embedded so <img> can authenticate)
 */
function publicUrl(absPath, token) {
  if (!absPath) return null;
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/'); // {userId}/{filename}
  return `/uploads/${rel}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/** Resolve a request's {userId}/{filename} to an absolute path inside ROOT. */
function resolve(userId, filename) {
  const abs = path.join(ROOT, sanitize(userId), sanitize(filename));
  // Defence in depth: never serve outside ROOT.
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

module.exports = { ROOT, saveUserPhoto, publicUrl, resolve, userDir };
