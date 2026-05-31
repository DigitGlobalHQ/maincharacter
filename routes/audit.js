/**
 * ═══════════════════════════════════════════════════════════════════
 * AUDIT ROUTES — the free Aesthetic Audit funnel (Night-2, P3.2)
 * ═══════════════════════════════════════════════════════════════════
 * Mounted at /api/audit. The audit is fully free with no gate to view the
 * result (DECISIONS.md Night-2 #1); the paywall comes after the diagnosis.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const AuditSession = require('../models/AuditSession');
const vision = require('../services/vision');
const storage = require('../services/storage');
const { createLogger } = require('../lib/log');

const log = createLogger('AUDIT');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 3 }, // 8MB each, 3 photos
});

// POST /api/audit/session — start a session
// NOTE: AuditSession.* is backend-adapted (async under Postgres). Every call
// MUST be awaited, or `session` is a Promise and `{sessionToken}` serialises
// to `{}` on live — which dead-ended the whole legacy funnel. funnel-repair.
router.post('/session', async (req, res) => {
  const { intent, reAudit, userToken } = req.body || {};
  const session = await AuditSession.createSession({ intent, reAudit: !!reAudit, userToken });
  log.info('SESSION', `created ${session.sessionToken}${intent ? ` (intent=${intent})` : ''}`);
  res.json({ sessionToken: session.sessionToken });
});

// POST /api/audit/quiz — save quiz answers
router.post('/quiz', async (req, res) => {
  const { sessionToken, answers } = req.body || {};
  if (!sessionToken || typeof answers !== 'object' || answers === null) {
    return res.status(400).json({ error: 'sessionToken and answers required' });
  }
  const updated = await AuditSession.updateSession(sessionToken, { quizAnswers: answers });
  if (!updated) return res.status(404).json({ error: 'session not found or expired' });
  res.json({ ok: true });
});

// POST /api/audit/photos — multipart upload (front, side, body)
router.post(
  '/photos',
  upload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'side', maxCount: 1 },
    { name: 'body', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const sessionToken = req.body.sessionToken;
      if (!sessionToken) return res.status(400).json({ error: 'sessionToken required' });
      const session = await AuditSession.getSession(sessionToken);
      if (!session) return res.status(404).json({ error: 'session not found or expired' });

      const files = req.files || {};
      const kinds = ['front', 'side', 'body'].filter((k) => files[k] && files[k][0]);
      if (kinds.length === 0) {
        return res.status(400).json({ error: 'at least one photo required' });
      }

      const photos = [];
      for (const kind of kinds) {
        const f = files[kind][0];
        // Task 2a: compress before upload via putPhoto (same quality for baseline + daily).
        // B0: use canonical baseline key convention for R2 persistence.
        // If R2 is configured, putPhoto() stores at audit/{sessionToken}/baseline-{slot}.jpg.
        // If not, fall back to local storage via saveImage().
        const canonicalKey = storage.auditBaselineKey(sessionToken, kind);
        const putResult = await storage.putPhoto(canonicalKey, f.buffer, f.mimetype);
        let storageKey, url, backend;
        if (putResult.key) {
          // R2 success — build the r2: prefix for readImage compatibility
          storageKey = `r2:${putResult.key}`;
          url = `r2://${process.env.R2_BUCKET}/${putResult.key}`;
          backend = 'r2';
        } else {
          // DRY-RUN or R2 failure — local fallback
          const saved = await storage.saveImage({
            buffer: f.buffer,
            mimeType: f.mimetype,
            prefix: `audit/${sessionToken}`,
          });
          storageKey = saved.storageKey;
          url = saved.url;
          backend = saved.backend;
        }
        // DPDPA guard: r2Key stored server-side only; never included in API responses.
        photos.push({ kind, storageKey, mimeType: f.mimetype, backend });
      }

      await AuditSession.updateSession(sessionToken, { photos });
      log.info('PHOTOS', `${photos.length} stored for ${sessionToken} (backend=${photos[0]?.backend || 'unknown'})`);
      res.json({ ok: true, count: photos.length, kinds });
    } catch (err) {
      log.error('ERROR', `photos: ${err.message}`);
      res.status(500).json({ error: 'photo upload failed' });
    }
  }
);

// POST /api/audit/analyze — run vision scoring (idempotent-ish: re-runs allowed)
router.post('/analyze', async (req, res) => {
  try {
    const { sessionToken } = req.body || {};
    const session = await AuditSession.getSession(sessionToken);
    if (!session) return res.status(404).json({ error: 'session not found or expired' });

    // P3.5a — cannot analyse without photos.
    if (!session.photos || session.photos.length === 0) {
      return res.status(400).json({ error: 'photos required before analysis' });
    }

    // Read photos back from storage as base64 for the multimodal call.
    const photos = [];
    for (const p of session.photos) {
      try {
        photos.push({ data: await storage.readImageBase64(p.storageKey), mimeType: p.mimeType });
      } catch (err) {
        log.warn('READ', `could not read ${p.storageKey}: ${err.message}`);
      }
    }

    const hairFocus = !!(session.quizAnswers && /hair/i.test(JSON.stringify(session.quizAnswers)));
    const result = await vision.scoreAesthetic({
      photos,
      quizAnswers: session.quizAnswers || {},
      hairFocus,
    });

    await AuditSession.updateSession(sessionToken, {
      aestheticScores: result.scores,
      weakestAxis: result.weakestAxis,
      hairReceding: result.hairReceding,
      diagnosis: result.diagnosis,
      completedAt: new Date().toISOString(),
    });

    log.info('ANALYZE', `${sessionToken} scored (source=${result.source}, weakest=${result.weakestAxis})`);
    res.json({
      scores: result.scores,
      weakestAxis: result.weakestAxis,
      hairReceding: result.hairReceding,
      diagnosis: result.diagnosis,
    });
  } catch (err) {
    log.error('ERROR', `analyze: ${err.message}`);
    res.status(500).json({ error: 'analysis failed' });
  }
});

// GET /api/audit/result/:sessionToken — idempotent read for the paywall page
router.get('/result/:sessionToken', async (req, res) => {
  const session = await AuditSession.getSession(req.params.sessionToken);
  if (!session) return res.status(404).json({ error: 'session not found or expired' });
  if (!session.completedAt) return res.status(409).json({ error: 'analysis not complete' });
  res.json({
    scores: session.aestheticScores,
    weakestAxis: session.weakestAxis,
    hairReceding: session.hairReceding,
    diagnosis: session.diagnosis,
    intent: session.intent,
    completedAt: session.completedAt,
  });
});

module.exports = router;
