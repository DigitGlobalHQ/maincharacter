/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING FEATURE ROUTES (Night-4) — mounted at /api/lookmax
 * ═══════════════════════════════════════════════════════════════════
 *
 * Every route here is gated by requireLookmaxAuth (req.lookmaxUser is the live
 * user). Populated across P4 (mirror), P5 (protocol), P6 (hair), P7 (dashboard),
 * P8 (reveal). Auth + /me live in routes/lookmax-auth.js.
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const User = require('../models/User');
const Lookmax = require('../models/Lookmax');
const photos = require('../services/photos');
const storage = require('../services/storage');
const vision = require('../services/vision');
// protocol + hair services are lazy-required inside their handlers (P5/P6).
const { AESTHETIC_AXES } = require('../data/lookmax-prompts');
const { requireLookmaxAuth } = require('../lib/lookmax-auth');
const { createLogger } = require('../lib/log');

const log = createLogger('LOOKMAX');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
});

// All feature routes require a Lookmaxxing session.
router.use(requireLookmaxAuth);

/** Mirror Level from an average 0-100 score (CLAUDE.md ladder). */
function mirrorLevelFor(score) {
  if (score >= 90) return 'sovereign';
  if (score >= 75) return 'radiant';
  if (score >= 60) return 'magnetic';
  if (score >= 40) return 'polished';
  return 'raw';
}

/** Average of the eight axes, rounded. */
function overallOf(axes) {
  const vals = AESTHETIC_AXES.map((a) => Number(axes[a]) || 0);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/**
 * Next streak value: +1 when the previous mirror was within 30h (24h + buffer),
 * else reset to 1. No previous mirror → 1. Pure + exported for tests.
 */
function nextStreak(prevMirror, currentStreak) {
  if (!prevMirror) return 1;
  const gapH = (Date.now() - new Date(prevMirror.createdAt).getTime()) / 3600000;
  return gapH <= 30 ? (currentStreak || 0) + 1 : 1;
}

/** "HH:MM" in IST for a timestamp. */
function istTime(iso) {
  const ist = new Date(new Date(iso).getTime() + 5.5 * 60 * 60 * 1000);
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// P4 — Daily Mirror
// ═══════════════════════════════════════════════════════════════════

router.post('/mirror', upload.single('photo'), async (req, res) => {
  try {
    const user = req.lookmaxUser;
    if (!req.file) return res.status(400).json({ error: 'photo required' });

    // B0: persist daily mirror to R2 using the canonical mirrorKey convention.
    // Falls back to the existing local photos service when R2 is not configured.
    // DPDPA: the r2Key is stored server-side on the Lookmax record only — never
    // returned to the client in this response or any API endpoint.
    const mirrorDate = storage.istDate();
    const r2Key = storage.mirrorKey(user.token, mirrorDate);
    const putResult = await storage.put(r2Key, req.file.buffer, req.file.mimetype || 'image/jpeg');
    let photoPath;
    if (putResult.key) {
      photoPath = `r2:${putResult.key}`;
    } else {
      // DRY-RUN or R2 failure — keep existing local-storage fallback
      const saved = await photos.saveUserPhoto({ userId: user.token, buffer: req.file.buffer, kind: 'mirror', mimeType: req.file.mimetype });
      photoPath = saved.path;
    }

    // Baseline = the converting audit's scores, if any.
    const baseline = await loadBaseline(user);
    const scored = await vision.scoreMirror({
      photo: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype || 'image/jpeg' },
      baseline,
    });

    const axes = scored.scores;
    const overall = overallOf(axes);
    const level = mirrorLevelFor(overall);

    // Streak: increment if the previous mirror was within 30h, else reset to 1.
    const prev = Lookmax.latestMirror(user.token);
    const yest = prev || null;
    const streak = nextStreak(prev, user.lookmaxStreak || 0);

    Lookmax.addMirror(user.token, { photoPath, axes, overallScore: overall, mirrorLevel: level });
    User.updateUser(user.phone, { mirrorLevel: level, lastMirrorAt: new Date().toISOString(), lookmaxStreak: streak });

    // Deltas
    const deltaVsYesterday = {};
    const deltaVsBaseline = {};
    for (const a of AESTHETIC_AXES) {
      if (yest && yest.axes && yest.axes[a] != null) deltaVsYesterday[a] = axes[a] - yest.axes[a];
      if (baseline && baseline[a] != null) deltaVsBaseline[a] = axes[a] - baseline[a];
    }

    const trend = Lookmax.getMirrors(user.token).slice(-14).map((m) => ({ date: m.date, score: m.overallScore }));
    const consultantLine = await vision.consultantLine(axes, deltaVsYesterday);

    res.json({
      score: overall,
      axes,
      deltaVsYesterday,
      deltaVsBaseline,
      mirrorLevel: level,
      streak,
      trend,
      consultantLine,
    });
  } catch (err) {
    log.error('MIRROR', err.message);
    res.status(500).json({ error: 'mirror scoring failed' });
  }
});

/** Read the user's converting-audit baseline scores, if present. */
async function loadBaseline(user) {
  if (!user.auditSessionId) return null;
  try {
    const AuditSession = require('../models/AuditSession');
    const s = AuditSession.getSession(user.auditSessionId);
    return s && s.aestheticScores ? s.aestheticScores : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// P5 — Daily Protocol
// ═══════════════════════════════════════════════════════════════════

/** Build today's protocol on demand if one hasn't been generated yet. */
function ensureProtocolToday(user) {
  let day = Lookmax.getProtocolToday(user.token);
  if (day) return day;
  const protocolSvc = require('../services/protocol');
  const audit = protocolSvc.auditForUser(user);
  day = protocolSvc.generateProtocol(user, audit);
  return Lookmax.setProtocolDay(user.token, day);
}

router.get('/protocol/today', (req, res) => {
  const user = req.lookmaxUser;
  const day = ensureProtocolToday(user);
  const completedCount = day.items.filter((i) => i.checked).length;
  res.json({
    items: day.items,
    doNots: day.doNots,
    completedCount,
    totalCount: day.items.length,
    isLocked: day.isLocked,
    streak: user.lookmaxProtocolStreak || 0,
  });
});

router.post('/protocol/check', (req, res) => {
  const { itemId, checked } = req.body || {};
  const day = Lookmax.checkProtocolItem(req.lookmaxUser.token, itemId, checked);
  if (!day) return res.status(409).json({ error: 'locked or item not found' });
  res.json({ ok: true, completedCount: day.items.filter((i) => i.checked).length });
});

router.post('/protocol/complete-day', (req, res) => {
  const user = req.lookmaxUser;
  const day = ensureProtocolToday(user);
  if (day.isLocked) return res.json({ streak: user.lookmaxProtocolStreak || 0, streakIncremented: false });
  Lookmax.lockProtocolToday(user.token);
  const doItems = day.items.length;
  const done = day.items.filter((i) => i.checked).length;
  const ratio = doItems ? done / doItems : 0;
  let streak = user.lookmaxProtocolStreak || 0;
  const incremented = ratio >= 0.8;
  streak = incremented ? streak + 1 : 0;
  User.updateUser(user.phone, { lookmaxProtocolStreak: streak });
  res.json({ streak, streakIncremented: incremented });
});

// ═══════════════════════════════════════════════════════════════════
// P6 — Hair Tracker
// ═══════════════════════════════════════════════════════════════════

const HAIR_COOLDOWN_DAYS = 6;

router.post(
  '/hair/photo',
  upload.fields([{ name: 'front', maxCount: 1 }, { name: 'crown', maxCount: 1 }]),
  async (req, res) => {
    try {
      const user = req.lookmaxUser;
      const f = req.files || {};
      if (!f.front || !f.crown) return res.status(400).json({ error: 'both front and crown photos required' });

      const frontBuf = f.front[0].buffer;
      const crownBuf = f.crown[0].buffer;
      const savedFront = await photos.saveUserPhoto({ userId: user.token, buffer: frontBuf, kind: 'hair-front', mimeType: f.front[0].mimetype });
      const savedCrown = await photos.saveUserPhoto({ userId: user.token, buffer: crownBuf, kind: 'hair-crown', mimeType: f.crown[0].mimetype });

      const result = await vision.scoreHair({
        front: { data: frontBuf.toString('base64'), mimeType: f.front[0].mimetype || 'image/jpeg' },
        crown: { data: crownBuf.toString('base64'), mimeType: f.crown[0].mimetype || 'image/jpeg' },
      });

      const hairSvc = require('../services/hair');
      const first = Lookmax.getHair(user.token)[0] || null;
      const rec = Lookmax.addHair(user.token, {
        frontPath: savedFront.path,
        crownPath: savedCrown.path,
        norwood: result.norwood,
        hairlineScore: result.hairlineScore,
        recessionMm: result.recessionMm,
        confidence: result.confidence,
      });

      const recommendations = hairSvc.recommendationsForNorwood(result.norwood);
      const deltaVsFirst = first ? rec.hairlineScore - first.hairlineScore : null;
      const consultantLine = hairSvc.consultantLine(result, deltaVsFirst);

      res.json({
        norwood: result.norwood,
        hairlineScore: result.hairlineScore,
        recessionMm: result.recessionMm,
        confidence: result.confidence,
        deltaVsFirst,
        recommendations,
        consultantLine,
      });
    } catch (err) {
      log.error('HAIR', err.message);
      res.status(500).json({ error: 'hair analysis failed' });
    }
  }
);

router.get('/hair/history', (req, res) => {
  const user = req.lookmaxUser;
  const hairSvc = require('../services/hair');
  const readings = Lookmax.getHair(user.token);
  const latest = readings.length ? readings[readings.length - 1] : null;
  let unlocked = true;
  let daysUntilNext = 0;
  if (latest) {
    const ageDays = (Date.now() - new Date(latest.createdAt).getTime()) / 86400000;
    unlocked = ageDays >= HAIR_COOLDOWN_DAYS;
    daysUntilNext = Math.max(0, Math.ceil(HAIR_COOLDOWN_DAYS - ageDays));
  }
  const decorate = (r) =>
    r ? { ...r, recommendations: hairSvc.recommendationsForNorwood(r.norwood) } : null;
  res.json({
    unlocked,
    daysUntilNext,
    latest: decorate(latest),
    readings: readings.map((r) => ({ date: r.date, hairlineScore: r.hairlineScore, norwood: r.norwood })),
  });
});

// ═══════════════════════════════════════════════════════════════════
// P7 — Dashboard
// ═══════════════════════════════════════════════════════════════════

/**
 * Cross-sell eligibility for NOW-3 §2.2 earned-moment Aura++ card.
 * Returns true when:
 *   - user holds Lookmaxxing (lookmaxxingActive) but NOT Orator (oratorActive falsy)
 *   - >= 14 days have passed since lookmaxxingStartedAt (time gate)
 * The delta-on-leverage-axis gate (NOW-2 dependency) degrades gracefully to the
 * time-gate alone until NOW-2 ships with a positive mirror-score signal.
 */
function computeCrossSellEligible(user, status) {
  if (!status.lookmaxxingActive) return false;
  if (status.oratorActive) return false;
  if (!user.lookmaxxingStartedAt) return false;
  const msElapsed = Date.now() - new Date(user.lookmaxxingStartedAt).getTime();
  return msElapsed >= 14 * 86400000;
}

router.get('/dashboard', (req, res) => {
  const user = req.lookmaxUser;
  const status = User.computeAuraStatus(user);
  const todayMirror = Lookmax.mirrorForToday(user.token);
  const day = Lookmax.getProtocolToday(user.token);
  const protocol = day
    ? { completedCount: day.items.filter((i) => i.checked).length, totalCount: day.items.length, isLocked: day.isLocked }
    : { completedCount: 0, totalCount: 0, isLocked: false };

  // Hair window
  const hairReadings = Lookmax.getHair(user.token);
  const latestHair = hairReadings.length ? hairReadings[hairReadings.length - 1] : null;
  let hairUnlocked = true;
  let hairDays = 0;
  if (latestHair) {
    const ageDays = (Date.now() - new Date(latestHair.createdAt).getTime()) / 86400000;
    hairUnlocked = ageDays >= HAIR_COOLDOWN_DAYS;
    hairDays = Math.max(0, Math.ceil(HAIR_COOLDOWN_DAYS - ageDays));
  }

  // This week: 7 dots, gold for a day with a completed mirror.
  const mirrorDates = new Set(Lookmax.getMirrors(user.token).map((m) => m.date));
  const thisWeek = lastSevenDates().map((d) => mirrorDates.has(d));

  // NOW-3: cross-sell eligibility
  const crossSellEligible = computeCrossSellEligible(user, status);

  // NOW-2 / B2: Day-30 re-audit eligibility (pull-based; see routes/reaudit.js).
  // Dashboard surfaces the "Sit for the second reading." card when eligible.
  // The full eligibility computation lives in reaudit.js; we inline a lean
  // version here so the dashboard has no hard import on the reaudit route.
  const baselineAvailable = !!(user.lookmaxBaseline && user.lookmaxBaseline.scores);
  const daysSincePayment = user.lookmaxxingStartedAt
    ? Math.floor((Date.now() - new Date(user.lookmaxxingStartedAt).getTime()) / 86400000)
    : 0;
  const reauditEligible = !!(user.lookmaxxingActive) && daysSincePayment >= 30 && baselineAvailable;
  const reauditCompleted = !!(user.reAuditCompletedThisCycle);

  // CTA routing: pre-completion → /audit?reAudit=true; post-completion → reveal.
  const reauditCta = reauditCompleted
    ? `/lookmax/reveal?mode=day30`
    : `/audit?reAudit=true&token=${user.token}`;

  const reauditStatus = {
    eligible: reauditEligible,
    completed: reauditCompleted,
    daysSincePayment,
    baselineAvailable,
    cta: reauditCta,
  };

  res.json({
    user: { name: user.name, oratorActive: status.oratorActive, lookmaxxingActive: status.lookmaxxingActive, auraPlusPlus: status.auraPlusPlus },
    today: {
      mirror: todayMirror ? { takenToday: true, score: todayMirror.overallScore, at: istTime(todayMirror.createdAt) } : { takenToday: false },
      protocol,
      hair: { unlocked: hairUnlocked, daysUntil: hairDays },
    },
    thisWeek,
    streak: user.lookmaxStreak || 0,
    mirrorLevel: user.mirrorLevel || 'raw',
    crossSellEligible,
    reauditStatus,
  });
});

/** The last seven IST dates (oldest → today) as YYYY-MM-DD. */
function lastSevenDates() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(Lookmax.istDate(d));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// B4 — Web Push subscription (VAPID)
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/lookmax/push/vapid-key
 * Returns the VAPID public key for the client to use in pushManager.subscribe.
 * The public key is intentionally public per the VAPID spec (RFC 8292).
 * Returns { publicKey: '' } when VAPID is not configured.
 * Auth required (prevents unauthenticated key probing).
 */
router.get('/push/vapid-key', (req, res) => {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC || '';
  res.json({ publicKey });
});

/**
 * POST /api/lookmax/push/subscribe
 * Stores a PushSubscription JSON for the authenticated user.
 * Idempotent on endpoint — duplicates are silently deduplicated.
 * Requires auth. Never returns push_subscriptions in any response.
 * DPDPA: push subscriptions are PII-adjacent; stored only behind session token.
 */
router.post('/push/subscribe', (req, res) => {
  const user = req.lookmaxUser;
  const { subscription } = req.body || {};

  if (!subscription || typeof subscription !== 'object') {
    return res.status(400).json({ error: 'subscription object required' });
  }
  if (!subscription.endpoint || typeof subscription.endpoint !== 'string') {
    return res.status(400).json({ error: 'subscription.endpoint required' });
  }

  const existing = user.push_subscriptions || [];
  const alreadyStored = existing.some((s) => s.endpoint === subscription.endpoint);

  if (!alreadyStored) {
    const record = {
      endpoint: subscription.endpoint,
      keys: subscription.keys || {},
      ua: req.headers['user-agent'] ? req.headers['user-agent'].slice(0, 120) : '',
      subscribedAt: new Date().toISOString(),
    };
    User.updateUser(user.phone, {
      push_subscriptions: [...existing, record],
    });
    log.info('PUSH-SUB', `new subscription stored for user ${user.token}`);
  } else {
    log.info('PUSH-SUB', `idempotent: endpoint already stored for user ${user.token}`);
  }

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// P8 — Weekly Reveal (stub)
// ═══════════════════════════════════════════════════════════════════

router.get('/reveal/preview', (req, res) => {
  const user = req.lookmaxUser;
  const weekAgo = Date.now() - 7 * 86400000;
  const recent = Lookmax.getMirrors(user.token).filter((m) => new Date(m.createdAt).getTime() >= weekAgo);
  const count = recent.length;
  if (count < 4) {
    return res.json({ unlocked: false, count });
  }
  const lmStartedAt = user.lookmaxxingStartedAt ? new Date(user.lookmaxxingStartedAt).getTime() : Date.now();
  const weekNumber = Math.max(1, Math.ceil((Date.now() - lmStartedAt) / (7 * 86400000)));
  res.json({
    unlocked: true,
    count,
    weekNumber,
    photoUrls: recent.map((m) => photos.publicUrl(m.photoPath, req.lookmaxToken || req.query.token || '')),
    scores: recent.map((m) => m.overallScore),
  });
});

// ═══════════════════════════════════════════════════════════════════
// B4 — Weekly Reveal MP4 export (REVEAL_MP4_ENABLED flag)
// ═══════════════════════════════════════════════════════════════════

/** Whether the MP4 export feature is enabled (default false). */
function revealMp4Enabled() {
  return process.env.REVEAL_MP4_ENABLED === 'true';
}

/**
 * POST /api/lookmax/reveal/render
 * Enqueue an async MP4 render job. Returns { jobId, status: 'queued' }.
 * Returns 503 when feature flag is off or ffmpeg is absent.
 * Auth required.
 */
router.post('/reveal/render', (req, res) => {
  if (!revealMp4Enabled()) {
    return res.status(503).json({
      available: false,
      reason: 'feature_disabled',
      // TODO copy review: user-facing message
      message: 'Something has interrupted the work. This feature is not yet available.',
    });
  }

  const video = require('../services/video');
  const ffmpeg = video.ffmpegStatus();
  if (!ffmpeg.available) {
    return res.status(503).json({
      available: false,
      reason: ffmpeg.reason || 'ffmpeg_missing',
      message: 'Something has interrupted the work. Video rendering is not available on this server.',
    });
  }

  const user = req.lookmaxUser;
  // Derive the week label: ISO week (YYYY-Www)
  const now = new Date();
  const year = now.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = Math.ceil((((now - jan4) / 86400000) + jan4.getUTCDay() + 1) / 7);
  const weekLabel = `${year}-W${String(week).padStart(2, '0')}`;

  const job = video.enqueueRender({ userToken: user.token, weekLabel });
  log.info('REVEAL-RENDER', `job ${job.jobId} queued for user ${user.token} week ${weekLabel}`);

  return res.status(202).json({ jobId: job.jobId, status: job.status, weekLabel });
});

/**
 * GET /api/lookmax/reveal/job/:jobId
 * Poll the status of a render job.
 * Returns 404 for unknown jobs, 401 without auth.
 */
router.get('/reveal/job/:jobId', (req, res) => {
  const video = require('../services/video');
  const job = video.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'job not found' });
  }
  // Only return the fields safe for the client (no internal paths)
  res.json({
    jobId: job.jobId,
    status: job.status,
    weekLabel: job.weekLabel,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    resultUrl: job.resultUrl || null,
    error: job.status === 'error' ? (job.error || 'render_failed') : null,
  });
});

module.exports = router;
module.exports.mirrorLevelFor = mirrorLevelFor;
module.exports.overallOf = overallOf;
module.exports.nextStreak = nextStreak;
module.exports.computeCrossSellEligible = computeCrossSellEligible;
