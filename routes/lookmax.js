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

    const saved = await photos.saveUserPhoto({ userId: user.token, buffer: req.file.buffer, kind: 'mirror', mimeType: req.file.mimetype });

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

    Lookmax.addMirror(user.token, { photoPath: saved.path, axes, overallScore: overall, mirrorLevel: level });
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

module.exports = router;
module.exports.mirrorLevelFor = mirrorLevelFor;
module.exports.overallOf = overallOf;
module.exports.nextStreak = nextStreak;
