/**
 * ═══════════════════════════════════════════════════════════════════
 * VIDEO SERVICE — Weekly Reveal MP4 composer (B4)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Detects ffmpeg availability once on first call (lazy, not at require-time
 * so tests can stub it). When ffmpeg is absent, all video paths return
 * { available: false, reason: 'ffmpeg_missing' } — no throw.
 *
 * Feature-flagged: REVEAL_MP4_ENABLED (default false). The UI hides the
 * export button when off, and routes return 503 when off.
 *
 * In-memory job queue for v1 (single-instance). Each job record:
 *   { jobId, userToken, weekLabel, status, createdAt, updatedAt, resultUrl?, error? }
 *
 * MP4 composition pipeline (when ffmpeg present + flag on):
 *   1. Fetch last 7 mirror photos from storage (R2 or /tmp)
 *   2. Pre-render each frame as a labelled PNG using node-canvas
 *   3. ffmpeg -framerate 1 -i frame%d.png -c:v libx264 -pix_fmt yuv420p out.mp4
 *   4. Upload result to R2 at reveal/{userToken}/{yyyy-ww}.mp4
 *   5. Return signed URL
 */

const { execSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createLogger } = require('../lib/log');

const log = createLogger('VIDEO');

// ─── ffmpeg detection ──────────────────────────────────────────────────────

let _ffmpegStatus = null; // null = not yet checked

/**
 * Returns the cached ffmpeg availability status.
 * Detection runs on first call (lazy).
 * @returns {{ available: boolean, path?: string, reason?: string }}
 */
function ffmpegStatus() {
  if (_ffmpegStatus !== null) return _ffmpegStatus;

  try {
    const out = execSync('which ffmpeg 2>/dev/null || where ffmpeg 2>NUL', {
      timeout: 3000,
      encoding: 'utf8',
    }).trim();
    if (out) {
      _ffmpegStatus = { available: true, path: out.split('\n')[0].trim() };
      log.info('DETECT', `ffmpeg found at ${_ffmpegStatus.path}`);
    } else {
      _ffmpegStatus = { available: false, reason: 'ffmpeg_missing' };
      log.info('DETECT', 'ffmpeg not found in PATH');
    }
  } catch {
    _ffmpegStatus = { available: false, reason: 'ffmpeg_missing' };
    log.info('DETECT', 'ffmpeg not found in PATH (lookup threw)');
  }

  return _ffmpegStatus;
}

/** Exposed for testing — allows resetting the cached value. */
function _resetDetection() {
  _ffmpegStatus = null;
}

// ─── In-memory job queue ───────────────────────────────────────────────────

// Map<jobId, JobRecord>
const _jobs = new Map();

/**
 * Enqueue a new render job. Returns the job record immediately.
 * The actual render runs asynchronously.
 *
 * @param {{ userToken: string, weekLabel: string }} opts
 * @returns {{ jobId: string, status: 'queued', userToken: string, weekLabel: string, createdAt: string }}
 */
function enqueueRender(opts) {
  const jobId = crypto.randomUUID();
  const job = {
    jobId,
    userToken: opts.userToken,
    weekLabel: opts.weekLabel || '',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultUrl: null,
    error: null,
  };
  _jobs.set(jobId, job);
  log.info('QUEUE', `job ${jobId} queued for user ${opts.userToken}`);

  // Fire async — do not await
  _processJob(jobId).catch((err) => {
    log.error('JOB', `job ${jobId} uncaught error: ${err.message}`);
    _setJobStatus(jobId, 'error', { error: err.message });
  });

  return { jobId, status: 'queued', userToken: opts.userToken, weekLabel: opts.weekLabel };
}

/**
 * Get a job by ID. Returns null if not found.
 * @param {string} jobId
 * @returns {object|null}
 */
function getJob(jobId) {
  return _jobs.get(jobId) || null;
}

/**
 * Return a copy of the entire in-memory queue (for diagnostics).
 * @returns {Array<object>}
 */
function getQueue() {
  return [..._jobs.values()];
}

// ─── Job processing ────────────────────────────────────────────────────────

function _setJobStatus(jobId, status, extra = {}) {
  const job = _jobs.get(jobId);
  if (!job) return;
  Object.assign(job, { status, updatedAt: new Date().toISOString(), ...extra });
}

/**
 * Async render pipeline. Transitions job through processing → done | error.
 * When ffmpeg is absent, immediately marks the job as error with reason.
 */
async function _processJob(jobId) {
  const job = _jobs.get(jobId);
  if (!job) return;

  const ffmpeg = ffmpegStatus();
  if (!ffmpeg.available) {
    _setJobStatus(jobId, 'error', { error: 'ffmpeg_missing' });
    log.warn('JOB', `job ${jobId} cannot run: ffmpeg not available`);
    return;
  }

  _setJobStatus(jobId, 'processing');

  try {
    const tmpJobDir = fs.mkdtempSync(path.join(os.tmpdir(), `mc-reveal-${jobId.slice(0, 8)}-`));

    try {
      // Fetch mirror photos for this user
      const User = require('../models/User');
      const user = User.getUserByToken(job.userToken);
      if (!user) throw new Error('user not found');

      const Lookmax = require('../models/Lookmax');
      const mirrors = Lookmax.getMirrors(job.userToken).slice(-7);

      if (mirrors.length === 0) {
        _setJobStatus(jobId, 'error', { error: 'no_mirror_photos' });
        log.warn('JOB', `job ${jobId}: no mirror photos found`);
        return;
      }

      // Compose frames
      const frameFiles = await _renderFrames(mirrors, tmpJobDir, user);

      // Run ffmpeg
      const outMp4 = path.join(tmpJobDir, 'reveal.mp4');
      await _runFfmpeg(ffmpeg.path, tmpJobDir, frameFiles.length, outMp4);

      // Upload to storage (R2 or /tmp fallback)
      const resultUrl = await _uploadMp4(outMp4, job.userToken, job.weekLabel);

      _setJobStatus(jobId, 'done', { resultUrl });
      log.info('JOB', `job ${jobId} done → ${resultUrl}`);
    } finally {
      // Cleanup temp dir
      try { fs.rmSync(tmpJobDir, { recursive: true, force: true }); } catch {}
    }
  } catch (err) {
    _setJobStatus(jobId, 'error', { error: err.message });
    log.error('JOB', `job ${jobId} failed: ${err.message}`);
  }
}

/**
 * Render individual PNG frames for each mirror day using node-canvas if
 * available, or write placeholder PNGs when canvas is absent (graceful degradation).
 * Returns array of absolute file paths.
 */
async function _renderFrames(mirrors, tmpJobDir, user) {
  const filePaths = [];

  for (let i = 0; i < mirrors.length; i++) {
    const mirror = mirrors[i];
    const framePath = path.join(tmpJobDir, `frame${i}.png`);

    // Try node-canvas for a branded frame; fall back to a 1×1 transparent PNG stub
    try {
      const { createCanvas, loadImage } = require('canvas');
      const W = 720;
      const H = 1280;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // Background: obsidian
      ctx.fillStyle = '#070708';
      ctx.fillRect(0, 0, W, H);

      // Load mirror photo if it exists on disk
      if (mirror.photoPath && fs.existsSync(mirror.photoPath)) {
        try {
          const img = await loadImage(mirror.photoPath);
          // Cover-fit the photo: fill top portion
          const photoH = Math.round(H * 0.75);
          ctx.drawImage(img, 0, 0, W, photoH);
        } catch {}
      }

      // Gold overlay strip at bottom
      ctx.fillStyle = 'rgba(7,7,8,0.85)';
      ctx.fillRect(0, H * 0.72, W, H * 0.28);

      // Score text (gold)
      ctx.font = 'bold 96px serif';
      ctx.fillStyle = '#e8b84b';
      ctx.textAlign = 'center';
      ctx.fillText(String(mirror.overallScore || '—'), W / 2, H * 0.82);

      // Day label
      ctx.font = '32px sans-serif';
      ctx.fillStyle = '#9b988f';
      ctx.fillText(`Day ${i + 1}`, W / 2, H * 0.88);

      // Brand mark
      ctx.font = '28px serif';
      ctx.fillStyle = '#e8b84b';
      ctx.fillText('◆ MainCharacter', W / 2, H * 0.94);

      const buf = canvas.toBuffer('image/png');
      fs.writeFileSync(framePath, buf);
    } catch {
      // canvas not installed — write a minimal valid 1×1 PNG stub so ffmpeg
      // still has something to work with
      const MINIMAL_PNG = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
        '2e000000034944415478016360600000000200015221bc330000000049454e44ae426082',
        'hex'
      );
      fs.writeFileSync(framePath, MINIMAL_PNG);
    }

    filePaths.push(framePath);
  }

  return filePaths;
}

/**
 * Run ffmpeg to stitch frames into an MP4. Returns a Promise.
 * @param {string} ffmpegBin path to ffmpeg binary
 * @param {string} tmpDir directory containing frame0.png … frameN.png
 * @param {number} frameCount
 * @param {string} outPath
 */
function _runFfmpeg(ffmpegBin, tmpDir, frameCount, outPath) {
  return new Promise((resolve, reject) => {
    const inputPattern = path.join(tmpDir, 'frame%d.png');
    const args = [
      '-y',
      '-framerate', '1',
      '-i', inputPattern,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2',
      outPath,
    ];

    const proc = spawn(ffmpegBin || 'ffmpeg', args, { stdio: 'pipe' });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('error', (err) => reject(new Error(`ffmpeg spawn error: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * Upload the MP4 to storage. Uses services/storage.js if R2 is configured,
 * otherwise copies to the /tmp upload dir and returns a local path URL.
 */
async function _uploadMp4(localPath, userToken, weekLabel) {
  const key = `reveal/${userToken}/${weekLabel || 'reveal'}.mp4`;

  // Try R2 storage (B0 parallel — do not require storage.js at module top)
  try {
    const storage = require('./storage');
    if (typeof storage.uploadFile === 'function') {
      const buf = fs.readFileSync(localPath);
      const url = await storage.uploadFile({ key, buffer: buf, contentType: 'video/mp4' });
      return url;
    }
  } catch {
    // storage.js absent or R2 unconfigured — fall through to local copy
  }

  // Local fallback: copy into UPLOAD_DIR and return a relative path
  const uploadDir = process.env.UPLOAD_DIR || '/tmp/maincharacter-uploads';
  const revealDir = path.join(uploadDir, userToken);
  fs.mkdirSync(revealDir, { recursive: true });
  const dest = path.join(revealDir, `${weekLabel || 'reveal'}.mp4`);
  fs.copyFileSync(localPath, dest);
  return `/uploads/${userToken}/${weekLabel || 'reveal'}.mp4`;
}

module.exports = {
  ffmpegStatus,
  _resetDetection,
  enqueueRender,
  getJob,
  getQueue,
};
