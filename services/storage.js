/**
 * ═══════════════════════════════════════════════════════════════════
 * STORAGE SERVICE — photo/video persistence (Night-2, P3.2/P6/P9)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Uploads go to Cloudflare R2 when R2_* env vars + @aws-sdk/client-s3 are present;
 * otherwise to a local uploads dir (volatile on Render — see BACKLOG). Images are
 * resized to max 1024px with `sharp` when installed; without it, the original
 * bytes are stored. Every heavy/native dep is lazy-required so a missing build
 * never breaks boot or the live deploy (DECISIONS.md P0.3).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');

const log = createLogger('STORAGE');

const LOCAL_DIR =
  process.env.UPLOAD_DIR || path.join(require('os').tmpdir(), 'maincharacter-uploads');

const R2 = {
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
};

function isR2Configured() {
  return !!(R2.accountId && R2.accessKeyId && R2.secretAccessKey && R2.bucket);
}

// ── Optional native deps (lazy, cached) ──
let _sharp;
function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = require('sharp');
  } catch {
    _sharp = null;
    log.warn('SHARP', 'sharp not installed — storing images without resize');
  }
  return _sharp;
}

let _s3;
function getS3() {
  if (_s3 !== undefined) return _s3;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    _s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
    });
  } catch {
    _s3 = null;
    log.warn('R2', '@aws-sdk/client-s3 not installed — using local storage');
  }
  return _s3;
}

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

  if (isR2Configured() && getS3()) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await getS3().send(
        new PutObjectCommand({ Bucket: R2.bucket, Key: key, Body: resized, ContentType: mimeType })
      );
      return { storageKey: `r2:${key}`, url: `r2://${R2.bucket}/${key}`, backend: 'r2' };
    } catch (err) {
      log.error('R2', `put failed, falling back to local: ${err.message}`);
    }
  }

  ensureLocalDir();
  const localPath = path.join(LOCAL_DIR, key.replace(/\//g, '__'));
  fs.writeFileSync(localPath, resized);
  return { storageKey: `local:${localPath}`, url: `file://${localPath}`, backend: 'local' };
}

/**
 * Read a stored image back as a Buffer (for re-sending to Gemini at analyze).
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
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const res = await getS3().send(new GetObjectCommand({ Bucket: R2.bucket, Key: key }));
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

module.exports = {
  isR2Configured,
  resizeImage,
  saveImage,
  readImage,
  readImageBase64,
  LOCAL_DIR,
};
