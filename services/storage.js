/**
 * ═══════════════════════════════════════════════════════════════════
 * STORAGE SERVICE — photo/video persistence (Night-2 → B0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * B0 adds the canonical put/getSignedUrl/delete interface for R2 (spec §Half-2).
 * The existing saveImage/readImage/readImageBase64 API is preserved for callers
 * written in Night-2/4.
 *
 * Key conventions (B0):
 *   audit/{userToken}/baseline-{slot}.jpg    — front | side | body
 *   mirror/{userToken}/{yyyy-mm-dd}.jpg      — daily mirror
 *   hair/{userToken}/{yyyy-mm-dd}.jpg        — hair tracker
 *
 * Auto-DRY-RUN: when R2 env vars are absent, put() returns { key: null, dryRun: true }
 * and logs the intent without throwing. Local dev works without R2 credentials.
 *
 * DPDPA guard: photo R2 keys MUST NOT be returned in any client-facing API
 * response. Keys are stored server-side only (audit session, user record).
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');

const log = createLogger('STORAGE');

const LOCAL_DIR =
  process.env.UPLOAD_DIR || path.join(require('os').tmpdir(), 'maincharacter-uploads');

// ── R2 config (read at first use so tests can override env before requiring) ──

function r2Config() {
  return {
    accountId:       process.env.R2_ACCOUNT_ID || '',
    accessKeyId:     process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket:          process.env.R2_BUCKET || '',
  };
}

/**
 * True when all four R2 env vars are present.
 * Used by /health and to gate real S3 calls.
 */
function isR2Configured() {
  const c = r2Config();
  return !!(c.accountId && c.accessKeyId && c.secretAccessKey && c.bucket);
}

// ── Optional native deps (lazy, cached per-process) ──────────────────────────

let _sharp;
function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = require('sharp'); // eslint-disable-line global-require
  } catch {
    _sharp = null;
    log.warn('SHARP', 'sharp not installed — images stored without resize');
  }
  return _sharp;
}

let _s3Client = null;
function getS3() {
  // Always rebuild if not yet built (first call) or if R2 is newly configured.
  if (_s3Client) return _s3Client;
  if (!isR2Configured()) return null;
  try {
    const { S3Client } = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
    const c = r2Config();
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  } catch (err) {
    _s3Client = null;
    log.warn('R2', `@aws-sdk/client-s3 not available — using local storage: ${err.message}`);
  }
  return _s3Client;
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW B0 INTERFACE — put / getSignedUrl / delete
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Store a buffer under `key` in R2.
 *
 * When R2 is not configured, returns { key: null, dryRun: true } and logs the
 * intent at DEBUG level.  Never throws — callers should treat dryRun=true as
 * a no-op.
 *
 * @param {string} key         e.g. "audit/{token}/baseline-front.jpg"
 * @param {Buffer} buffer
 * @param {string} [contentType='image/jpeg']
 * @returns {Promise<{ key: string|null, etag: string|null, dryRun?: boolean }>}
 */
async function put(key, buffer, contentType = 'image/jpeg') {
  const s3 = getS3();
  if (!s3 || !isR2Configured()) {
    log.info('DRY-RUN', `storage.put dry-run: ${key} (${buffer.byteLength} bytes)`);
    return { key: null, etag: null, dryRun: true };
  }
  const c = r2Config();
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
    const resp = await s3.send(
      new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: buffer, ContentType: contentType })
    );
    const etag = resp.ETag || null;
    log.info('PUT', `${key} → R2 (${buffer.byteLength} bytes)`);
    return { key, etag };
  } catch (err) {
    log.error('PUT-FAIL', `put ${key} failed: ${err.message}`);
    return { key: null, etag: null, dryRun: true };
  }
}

/**
 * Generate a presigned GET URL for `key` (defaults to 15-minute TTL).
 * Returns null when R2 is not configured — the caller should not serve a
 * broken URL.
 *
 * NOTE: For direct browser <img src> embedding no CORS preflight is needed.
 * See DECISIONS.md — CORS note for R2 bucket.
 *
 * @param {string} key
 * @param {number} [ttlSeconds=900]
 * @returns {Promise<string|null>}
 */
async function getSignedUrl(key, ttlSeconds = 900) {
  const s3 = getS3();
  if (!s3 || !isR2Configured()) return null;
  const c = r2Config();
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
    const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner'); // eslint-disable-line global-require
    const cmd = new GetObjectCommand({ Bucket: c.bucket, Key: key });
    return await awsGetSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
  } catch (err) {
    log.error('SIGN-FAIL', `getSignedUrl ${key} failed: ${err.message}`);
    return null;
  }
}

/**
 * Delete an object from R2.  Silently no-ops when R2 is not configured.
 * @param {string} key
 * @returns {Promise<boolean>} true on success
 */
async function deleteObject(key) {
  const s3 = getS3();
  if (!s3 || !isR2Configured()) return false;
  const c = r2Config();
  try {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
    await s3.send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
    log.info('DELETE', key);
    return true;
  } catch (err) {
    log.error('DELETE-FAIL', `delete ${key} failed: ${err.message}`);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// KEY HELPERS (B0)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Canonical R2 key for an audit baseline photo.
 * @param {string} userToken
 * @param {'front'|'side'|'body'} slot
 */
function auditBaselineKey(userToken, slot) {
  return `audit/${userToken}/baseline-${slot}.jpg`;
}

/**
 * Canonical R2 key for a daily mirror photo.
 * @param {string} userToken
 * @param {string} [dateStr]  YYYY-MM-DD in IST; defaults to today
 */
function mirrorKey(userToken, dateStr) {
  const d = dateStr || istDate();
  return `mirror/${userToken}/${d}.jpg`;
}

/**
 * Canonical R2 key for a hair tracker photo.
 * @param {string} userToken
 * @param {string} [dateStr]  YYYY-MM-DD in IST
 */
function hairKey(userToken, dateStr) {
  const d = dateStr || istDate();
  return `hair/${userToken}/${d}.jpg`;
}

/** Today's date in IST (YYYY-MM-DD). */
function istDate(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// LEGACY INTERFACE — saveImage / readImage / readImageBase64
// Kept intact so Night-2/4 callers need no changes.
// ══════════════════════════════════════════════════════════════════════════════

/** Resize an image buffer to max `max`px (if sharp present); else return as-is. */
async function resizeImage(buffer, max = 1024) {
  const sharp = getSharp();
  if (!sharp) return buffer;
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (err) {
    log.warn('RESIZE', `resize failed, storing original: ${err.message}`);
    return buffer;
  }
}

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });
}

/**
 * Persist an image. Resizes, then stores in R2 or locally.
 * @param {{ buffer: Buffer, mimeType?: string, prefix?: string }} opts
 * @returns {Promise<{ storageKey: string, url: string, backend: 'r2'|'local' }>}
 */
async function saveImage({ buffer, mimeType = 'image/jpeg', prefix = 'audit' }) {
  const resized = await resizeImage(buffer);
  const id = crypto.randomBytes(8).toString('hex');
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const key = `${prefix}/${Date.now()}-${id}.${ext}`;

  if (isR2Configured()) {
    const result = await put(key, resized, mimeType);
    if (result.key) {
      return { storageKey: `r2:${key}`, url: `r2://${r2Config().bucket}/${key}`, backend: 'r2' };
    }
    // put() failed (logged internally); fall through to local
  }

  ensureLocalDir();
  const localPath = path.join(LOCAL_DIR, key.replace(/\//g, '__'));
  fs.writeFileSync(localPath, resized);
  return { storageKey: `local:${localPath}`, url: `file://${localPath}`, backend: 'local' };
}

/**
 * Read a stored image back as a Buffer (for re-sending to Gemini).
 * @param {string} storageKey value returned by saveImage
 * @returns {Promise<Buffer>}
 */
async function readImage(storageKey) {
  if (!storageKey) throw new Error('storageKey required');
  if (storageKey.startsWith('local:')) {
    return fs.readFileSync(storageKey.slice('local:'.length));
  }
  if (storageKey.startsWith('r2:')) {
    const key = storageKey.slice('r2:'.length);
    const s3 = getS3();
    if (!s3) throw new Error('R2 not configured');
    const { GetObjectCommand } = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
    const res = await s3.send(new GetObjectCommand({ Bucket: r2Config().bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  throw new Error(`unknown storageKey scheme: ${storageKey}`);
}

/** Read an image as base64 (the shape vision.scoreAesthetic wants). */
async function readImageBase64(storageKey) {
  return (await readImage(storageKey)).toString('base64');
}

// ══════════════════════════════════════════════════════════════════════════════
// TASK 2a — putPhoto: compress → EXIF-strip → put to R2
// ══════════════════════════════════════════════════════════════════════════════

const COMPRESS_MAX_EDGE = 1600;  // px — longest edge ceiling
const COMPRESS_QUALITY  = 78;    // JPEG quality (mobile-friendly, ~200-300 KB face shots)

/**
 * Compress a photo buffer:
 *   - auto-rotate (EXIF orientation, so iOS portraits don't render sideways)
 *   - resize longest edge to ≤ COMPRESS_MAX_EDGE px (preserve aspect ratio)
 *   - re-encode as JPEG quality COMPRESS_QUALITY
 *   - strip all EXIF except orientation (privacy — removes GPS, camera serial)
 *
 * Falls back to returning the original buffer on any sharp failure — never
 * blocks the user flow on compression error.
 *
 * @param {Buffer} buffer   Raw upload buffer (JPEG / PNG / WebP)
 * @returns {Promise<Buffer>} Compressed JPEG buffer (or original on error)
 */
async function _compressPhoto(buffer) {
  const sharp = getSharp();
  if (!sharp) return buffer;
  try {
    return await sharp(buffer)
      .rotate()                                              // EXIF auto-orient
      .resize({ width: COMPRESS_MAX_EDGE, height: COMPRESS_MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .withMetadata({ orientation: undefined })              // strip all EXIF; re-apply only orientation
      .jpeg({ quality: COMPRESS_QUALITY, mozjpeg: false })
      .toBuffer();
  } catch (err) {
    log.warn('COMPRESS-FALLBACK', `sharp compress failed, storing original: ${err.message}`);
    return buffer;  // safe fallback — never block the upload
  }
}

/**
 * Compress a photo then store it via put().  Drop-in replacement for put()
 * on any photo handler.  Returns extended metadata so callers can log ratios.
 *
 * @param {string} key
 * @param {Buffer} sourceBuffer
 * @param {string} [contentType='image/jpeg']
 * @returns {Promise<{ key: string|null, etag: string|null, dryRun?: boolean,
 *                     originalBytes: number, compressedBytes: number, ratio: number }>}
 */
async function putPhoto(key, sourceBuffer, contentType = 'image/jpeg') {
  const originalBytes = sourceBuffer.byteLength;
  const compressed = await _compressPhoto(sourceBuffer);
  const compressedBytes = compressed.byteLength;
  const ratio = originalBytes > 0 ? compressedBytes / originalBytes : 1;

  log.info('COMPRESS', `${key}: ${originalBytes}B → ${compressedBytes}B (ratio=${ratio.toFixed(2)})`);

  const result = await put(key, compressed, 'image/jpeg');
  return { ...result, originalBytes, compressedBytes, ratio };
}

// ══════════════════════════════════════════════════════════════════════════════
// TASK 2b — Retention pruners: pruneMirrors / pruneHair
//
// Key-prefix conventions (mirrors storage naming in B0):
//   mirror/{userToken}/{YYYY-MM-DD}.jpg   — daily mirror
//   hair/{userToken}/{YYYY-MM-DD}.jpg     — hair tracker
//   audit/{userToken}/baseline-*.jpg      — baseline (NEVER pruned)
//   audit/{userToken}/day30-*.jpg         — Day-30 (NEVER pruned)
//
// Pruners receive the EXISTING keys (already uploaded) BEFORE the new upload.
// They delete any excess over the window limit (7 for mirror, 4 for hair).
// Idempotent — calling twice in a row is safe.
// ══════════════════════════════════════════════════════════════════════════════

const MIRROR_KEEP = 7;
const HAIR_KEEP   = 4;

/**
 * Enforce the last-7-mirror retention window.
 *
 * @param {string}   userId   (informational — for logging)
 * @param {string[]} keys     All current mirror keys for this user, oldest-first.
 *                            Caller must NOT include baseline or Day-30 keys here.
 * @returns {Promise<string[]>} Keys that were deleted.
 */
async function pruneMirrors(userId, keys) {
  return _prune(userId, keys, MIRROR_KEEP, 'PRUNE-MIRROR');
}

/**
 * Enforce the last-4-hair retention window.
 *
 * @param {string}   userId
 * @param {string[]} keys     All current hair keys for this user, oldest-first.
 * @returns {Promise<string[]>} Keys that were deleted.
 */
async function pruneHair(userId, keys) {
  return _prune(userId, keys, HAIR_KEEP, 'PRUNE-HAIR');
}

/**
 * Internal pruner.  Called AFTER the new upload with ALL current keys
 * (oldest-first), including the one just uploaded.
 * Deletes (keys.length - keep) oldest keys so exactly `keep` remain.
 * Idempotent — safe to call twice with the same key set.
 */
async function _prune(userId, keys, keep, tag) {
  const excess = keys.length - keep;
  if (excess <= 0) return [];
  const toDelete = keys.slice(0, excess);
  log.info(tag, `${userId}: deleting ${toDelete.length} oldest (keeping ${keep})`);
  const deleted = [];
  for (const key of toDelete) {
    // Use module.exports.delete so vi.spyOn can intercept in tests.
    const ok = await module.exports.delete(key);
    if (ok) deleted.push(key);
  }
  return deleted;
}

module.exports = {
  // B0 interface
  put,
  getSignedUrl,
  delete: deleteObject,   // 'delete' is a reserved word; alias for callers
  auditBaselineKey,
  mirrorKey,
  hairKey,
  istDate,
  isR2Configured,
  // Task 2a — photo compression
  putPhoto,
  _compressPhoto,          // exported for tests only
  // Task 2b — retention pruners
  pruneMirrors,
  pruneHair,
  // Legacy interface (Night-2/4)
  resizeImage,
  saveImage,
  readImage,
  readImageBase64,
  LOCAL_DIR,
};
