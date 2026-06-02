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

/** Orator rank ladder from a 0-100 score (mirrors _rankFromScore in lookmaxing.js). */
function rankFromScore(score) {
  const s = Number(score) || 0;
  if (s >= 85) return 'sovereign';
  if (s >= 70) return 'luminary';
  if (s >= 50) return 'ascendant';
  if (s >= 30) return 'seeker';
  return 'unawakened';
}

/** Pick exactly the 8 aesthetic axes from a scores object (drops extras). */
function pickAxes(scores) {
  const out = {};
  for (const a of AESTHETIC_AXES) out[a] = Number(scores[a]) || 0;
  return out;
}

/** ISO YYYY-MM-DD from a Date/ISO string; null-safe. */
function isoDay(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

/** Longest run of consecutive calendar days in a set of ISO YYYY-MM-DD strings. */
function longestStreakOf(isoDates) {
  const days = [...new Set(isoDates.filter(Boolean))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    if (prev && (Date.parse(d) - Date.parse(prev)) === 86400000) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
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

    // Task 2a: compress before upload (putPhoto vs put).
    // Task 2b: retention pruner — run BEFORE adding the new mirror so we have
    //   the existing keys; then after addMirror, pass all keys (including new)
    //   to pruneMirrors.
    // DPDPA: the r2Key is stored server-side on the Lookmax record only — never
    // returned to the client in this response or any API endpoint.
    const mirrorDate = storage.istDate();
    const r2Key = storage.mirrorKey(user.token, mirrorDate);
    const putResult = await storage.putPhoto(r2Key, req.file.buffer, req.file.mimetype || 'image/jpeg');
    log.info('MIRROR-COMPRESS', `${user.token}: ${putResult.originalBytes}B → ${putResult.compressedBytes}B (ratio=${putResult.ratio.toFixed(2)})`);
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
    await User.updateUser(user.phone, { mirrorLevel: level, lastMirrorAt: new Date().toISOString(), lookmaxStreak: streak });

    // Task 2b — retention pruner: enforce last-7-mirror window.
    // Collect all r2: mirror keys for this user (including the one just added)
    // and prune oldest so only 7 survive.  Fire-and-forget — never block response.
    Promise.resolve().then(async () => {
      const allMirrors = Lookmax.getMirrors(user.token);
      const mirrorR2Keys = allMirrors
        .filter((m) => m.photoPath && m.photoPath.startsWith('r2:'))
        .map((m) => m.photoPath.slice('r2:'.length));
      if (mirrorR2Keys.length > 7) {
        await storage.pruneMirrors(user.token, mirrorR2Keys).catch((e) => {
          log.warn('PRUNE-MIRROR', `pruner error: ${e.message}`);
        });
      }
    }).catch(() => {});

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
      nightContext: nightContextLine(user.token),
    });
  } catch (err) {
    log.error('MIRROR', err.message);
    res.status(500).json({ error: 'mirror scoring failed' });
  }
});

/** Yesterday's IST date (YYYY-MM-DD) relative to today. */
function yesterdayIst() {
  const todayMs = new Date(`${Lookmax.istDate()}T00:00:00.000Z`).getTime();
  return new Date(todayMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Deterministic, validator-clean "why it may have moved" line from LAST night's
 * log. State/habit context only — no health claims. Returns null when no log.
 */
function nightContextLine(userId) {
  const log = Lookmax.nightLogForDate(userId, yesterdayIst());
  if (!log) return null;
  if (log.saltAlcoholFlag) {
    return "Last night's salt and drink tend to show as morning puffiness. Today's read carries that. ◆";
  }
  if (log.sleepHours != null && log.sleepHours < 6) {
    return 'Short sleep last night shows first in the eyes. The read reflects the night, not the trend. ◆';
  }
  if (log.sleepHours != null && log.sleepHours >= 7 && !log.saltAlcoholFlag) {
    return 'A clean night behind this read. When the basics hold, the mirror tends to agree. ◆';
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// Night Log — last night's sleep / water / salt-alcohol (Phase 3.2)
// ═══════════════════════════════════════════════════════════════════

router.post('/night-log', (req, res) => {
  const user = req.lookmaxUser;
  const body = req.body || {};
  const saved = Lookmax.addNightLog(user.token, {
    sleepHours: body.sleepHours,
    waterGlasses: body.waterGlasses,
    saltAlcoholFlag: body.saltAlcoholFlag,
    notes: body.notes,
  });
  res.json({ ok: true, nightLog: saved });
});

router.get('/night-log/today', (req, res) => {
  const user = req.lookmaxUser;
  res.json({ nightLog: Lookmax.nightLogForToday(user.token) });
});

/** Read the user's converting-audit baseline scores, if present. */
async function loadBaseline(user) {
  if (!user.auditSessionId) return null;
  try {
    const AuditSession = require('../models/AuditSession');
    const s = await AuditSession.getSession(user.auditSessionId);
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

// Active triggers + streak progress for the user's weakest changeable axes
// (Phase 3.3). Tasks are validator-safe by construction (services/trigger-engine).
router.get('/protocol/triggers', (req, res) => {
  const user = req.lookmaxUser;
  const triggerEngine = require('../services/trigger-engine');
  const protocolSvc = require('../services/protocol');
  const audit = protocolSvc.weeklyAuditFromMirrors(user);
  const scores = audit.scores || {};
  // Weakest-first ordering across the changeable axes we actually score.
  const weakAxes = AESTHETIC_AXES.slice().sort((a, b) => (scores[a] ?? 50) - (scores[b] ?? 50));
  const mirrors = Lookmax.getMirrors(user.token);
  res.json({ triggers: triggerEngine.triggersWithProgress(weakAxes, mirrors, 2) });
});

router.post('/protocol/complete-day', async (req, res) => {
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
  await User.updateUser(user.phone, { lookmaxProtocolStreak: streak });
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
      const hairDate = storage.istDate();

      // Task 2a: compress before upload via putPhoto.
      const frontKey = storage.hairKey(user.token, `${hairDate}-front`);
      const crownKey = storage.hairKey(user.token, `${hairDate}-crown`);
      const frontPut = await storage.putPhoto(frontKey, frontBuf, f.front[0].mimetype || 'image/jpeg');
      const crownPut = await storage.putPhoto(crownKey, crownBuf, f.crown[0].mimetype || 'image/jpeg');

      let savedFront, savedCrown;
      if (frontPut.key) {
        savedFront = { path: `r2:${frontPut.key}` };
      } else {
        savedFront = await photos.saveUserPhoto({ userId: user.token, buffer: frontBuf, kind: 'hair-front', mimeType: f.front[0].mimetype });
      }
      if (crownPut.key) {
        savedCrown = { path: `r2:${crownPut.key}` };
      } else {
        savedCrown = await photos.saveUserPhoto({ userId: user.token, buffer: crownBuf, kind: 'hair-crown', mimeType: f.crown[0].mimetype });
      }

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

      // Task 2b — retention pruner: enforce last-4 hair window.
      Promise.resolve().then(async () => {
        const allHair = Lookmax.getHair(user.token);
        const hairR2Keys = [];
        for (const h of allHair) {
          if (h.frontPath && h.frontPath.startsWith('r2:')) hairR2Keys.push(h.frontPath.slice('r2:'.length));
          if (h.crownPath && h.crownPath.startsWith('r2:')) hairR2Keys.push(h.crownPath.slice('r2:'.length));
        }
        if (hairR2Keys.length > 4) {
          await storage.pruneHair(user.token, hairR2Keys).catch((e) => {
            log.warn('PRUNE-HAIR', `pruner error: ${e.message}`);
          });
        }
      }).catch(() => {});

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
// PR E — "Your Journey": history + analytics for the dashboard.
// One round-trip feeding the additive Journey section (design/dashboard-journey-spec.md).
// Fails independently of /dashboard — a Journey error never blocks the "today" view.
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/lookmax/me/history
 * Returns the user's readings timeline + the few honest trends that record reveals.
 *
 * Score-scale note (DECISIONS.md PR E): readings carry an `auraScore` 0-100. The
 * BASELINE uses the Gemini audit's auraScore (the number the user actually saw); a
 * RE-AUDIT uses the average of its 8 self-rated axes (overallOf) — both are 0-100
 * "presence composite" numbers. The 8-axis before→after (`axes`) is exact (the
 * re-audit literally computes those deltas). Re-audits do not yet accumulate — the
 * model keeps the latest only — so `readings` is 1-2 entries today; the shape
 * already supports more if re-audit history is later persisted.
 */
router.get('/me/history', async (req, res) => {
  try {
    const user = req.lookmaxUser;
    const AuditSession = require('../models/AuditSession'); // eslint-disable-line global-require

    // ── readings (oldest → newest) ──
    const readings = [];

    // Baseline = the Gemini audit reading (or, if the ephemeral session is gone,
    // the persisted lookmaxBaseline overall).
    let session = null;
    if (user.auditSessionId) {
      try { session = await AuditSession.getSession(user.auditSessionId); } catch { session = null; }
    }
    const report = session && session.geminiReport;
    if (report && typeof report.auraScore === 'number') {
      readings.push({
        id: user.auditSessionId,
        type: 'baseline',
        date: isoDay(session.createdAt) || isoDay(user.lookmaxxingStartedAt) || isoDay(user.enrolledAt),
        auraScore: report.auraScore,
        rank: report.rank || rankFromScore(report.auraScore),
        href: '/lookmaxing/audit/' + encodeURIComponent(user.auditSessionId),
        paid: !!user.lookmaxxingActive,
      });
    } else if (user.lookmaxBaseline && user.lookmaxBaseline.scores) {
      const s = overallOf(user.lookmaxBaseline.scores);
      readings.push({
        id: null,
        type: 'baseline',
        date: isoDay(user.lookmaxBaseline.capturedAt) || isoDay(user.lookmaxxingStartedAt) || isoDay(user.enrolledAt),
        auraScore: s,
        rank: rankFromScore(s),
        href: null,
        paid: !!user.lookmaxxingActive,
      });
    }

    // Latest re-audit (model keeps one).
    if (user.reAuditResult && user.reAuditResult.scores) {
      const ra = user.reAuditResult;
      const s = overallOf(ra.scores);
      readings.push({
        id: ra.completedAt ? 'reaudit-' + ra.completedAt : 'reaudit',
        type: 'reaudit',
        date: isoDay(ra.completedAt),
        auraScore: s,
        rank: rankFromScore(s),
        href: '/lookmax/reveal?mode=day30',
        paid: !!user.lookmaxxingActive,
      });
    }

    // ── axes (before → after) — only when a re-audit exists ──
    let axes = null;
    if (user.lookmaxBaseline && user.lookmaxBaseline.scores && user.reAuditResult && user.reAuditResult.scores) {
      axes = { baseline: pickAxes(user.lookmaxBaseline.scores), latest: pickAxes(user.reAuditResult.scores) };
    }

    // ── mirrors (always present; may be empty) ──
    const mList = Lookmax.getMirrors(user.token) || [];
    const loggedDates = [...new Set(mList.map((m) => m.date).filter(Boolean))].sort();
    const mirrors = {
      totalCount: mList.length,
      longestStreak: longestStreakOf(loggedDates),
      firstDate: loggedDates[0] || null,
      loggedDates,
    };

    // ── hair (only when ≥1 reading) ──
    const hList = Lookmax.getHair(user.token) || [];
    let hair = null;
    if (hList.length) {
      const history = hList.map((h) => ({
        date: isoDay(h.createdAt) || isoDay(h.date),
        hairlineScore: Number(h.hairlineScore) || 0,
        norwoodStage: h.norwood != null ? String(h.norwood) : null,
      }));
      hair = { current: history[history.length - 1], history };
    }

    return res.json({
      user: {
        name: user.name || 'Seeker',
        mirrorLevel: user.mirrorLevel || 'raw',
        joinedAt: isoDay(user.lookmaxxingStartedAt) || isoDay(user.enrolledAt),
      },
      readings,
      axes,
      mirrors,
      hair,
    });
  } catch (err) {
    log.error('HISTORY', `failed: ${err.message}`);
    return res.status(500).json({ error: 'history unavailable' });
  }
});

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
router.post('/push/subscribe', async (req, res) => {
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
    await User.updateUser(user.phone, {
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

// ═══════════════════════════════════════════════════════════════════
// TASK 2c — DPDPA data-rights endpoints
//
// DPDPA-2023 (Digital Personal Data Protection Act):
//   Sec 11: right of access (export)
//   Sec 13: right of erasure (delete)
//
// Both endpoints are behind DPDPA_RIGHTS_ENABLED (default true).
// Invocations logged to data/data-rights.jsonl for audit trail.
// ═══════════════════════════════════════════════════════════════════

const DATA_RIGHTS_LOG =
  process.env.DATA_RIGHTS_LOG_PATH ||
  require('path').join(__dirname, '..', 'data', 'data-rights.jsonl');

/** Append one audit-log line (fire-and-forget, never throws). */
function logDataRight(action, userId, ip) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    userId,
    action,
    ip: ip || 'unknown',
  });
  const fs = require('fs');
  const path = require('path');
  try {
    fs.mkdirSync(path.dirname(DATA_RIGHTS_LOG), { recursive: true });
    fs.appendFileSync(DATA_RIGHTS_LOG, line + '\n');
  } catch { /* non-fatal */ }
}

/** Feature-flag guard — defaults to true (live for compliance posture). */
function dpdpaEnabled() {
  return process.env.DPDPA_RIGHTS_ENABLED !== 'false';
}

/**
 * GET /api/lookmax/me/data/export
 * DPDPA §11 — right of access.
 * Returns a single JSON document with all user data + presigned photo URLs.
 * Auth required. No raw R2 keys in response.
 */
router.get('/me/data/export', async (req, res) => {
  if (!dpdpaEnabled()) return res.status(403).json({ error: 'data rights not enabled' });
  const user = req.lookmaxUser;
  logDataRight('export', user.token, req.ip);

  try {
    // ── Collect all R2 photo keys for this user ────────────────────
    const Lookmax = require('../models/Lookmax');
    const AuditSession = require('../models/AuditSession');

    const mirrors = Lookmax.getMirrors(user.token) || [];
    const hair    = Lookmax.getHair(user.token) || [];

    // Collect r2: prefixed paths and convert to signed URLs
    const allR2Keys = [];
    for (const m of mirrors) {
      if (m.photoPath && m.photoPath.startsWith('r2:')) {
        allR2Keys.push(m.photoPath.slice('r2:'.length));
      }
    }
    for (const h of hair) {
      if (h.frontPath && h.frontPath.startsWith('r2:')) allR2Keys.push(h.frontPath.slice('r2:'.length));
      if (h.crownPath && h.crownPath.startsWith('r2:')) allR2Keys.push(h.crownPath.slice('r2:'.length));
    }
    // Baseline from auditSession
    if (user.auditSessionId) {
      try {
        const session = await AuditSession.getSession(user.auditSessionId);
        if (session && session.photos) {
          for (const p of session.photos) {
            if (p.storageKey && p.storageKey.startsWith('r2:')) {
              allR2Keys.push(p.storageKey.slice('r2:'.length));
            }
          }
        }
      } catch { /* ignore expired sessions */ }
    }
    // lookmaxBaseline.photoStorageKeys
    if (user.lookmaxBaseline && user.lookmaxBaseline.photoStorageKeys) {
      for (const k of Object.values(user.lookmaxBaseline.photoStorageKeys)) {
        const key = k && k.startsWith('r2:') ? k.slice('r2:'.length) : k;
        if (key) allR2Keys.push(key);
      }
    }

    // Generate 24h presigned URLs — DPDPA §11 "right to obtain a copy"
    const TTL_24H = 24 * 60 * 60;
    const photoUrls = [];
    for (const key of allR2Keys) {
      const url = await storage.getSignedUrl(key, TTL_24H);
      if (url) photoUrls.push(url);
    }

    // ── Sanitised user block (no PII leakage beyond what user provided) ──
    const safeUser = {
      name: user.name,
      phone: user.phone,
      email: user.email || null,
      pillar: user.pillar,
      rank: user.rank,
      mirrorLevel: user.mirrorLevel,
      oratorActive: user.oratorActive,
      lookmaxxingActive: user.lookmaxxingActive,
      enrolledAt: user.enrolledAt,
      createdAt: user.enrolledAt || user.createdAt,
      lookmaxStreak: user.lookmaxStreak || 0,
    };

    // ── Events for this user (if Postgres backend active) ─────────────
    let userEvents = [];
    try {
      const events = require('../services/events');
      userEvents = await events.query({ userToken: user.token });
    } catch { /* non-fatal */ }

    // ── AuditSessions for this user ───────────────────────────────────
    let audits = [];
    try {
      // JSON model: scan all sessions for matching userToken
      const AuditSession = require('../models/AuditSession');
      // getAllSessions is not in the public API; load from file directly
      const fs = require('fs');
      const sessionsFile = process.env.AUDIT_SESSIONS_FILE_PATH ||
        require('path').join(__dirname, '..', 'data', 'audit-sessions.json');
      if (fs.existsSync(sessionsFile)) {
        const all = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
        audits = Object.values(all)
          .filter((s) => s.userToken === user.token)
          .map((s) => ({
            sessionToken: s.sessionToken,
            completedAt: s.completedAt,
            aestheticScores: s.aestheticScores,
            weakestAxis: s.weakestAxis,
            diagnosis: s.diagnosis,
            // No photoStorageKeys — they're converted to URLs above
          }));
      }
    } catch { /* non-fatal */ }

    res.json({
      exportedAt: new Date().toISOString(),
      schema: 1,
      user: safeUser,
      audits,
      events: userEvents,
      photoUrls,   // HTTPS signed URLs only — no raw R2 keys
    });
  } catch (err) {
    log.error('DPDPA-EXPORT', err.message);
    res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment, or write to support.' }); // TODO copy review
  }
});

/**
 * DELETE /api/lookmax/me/data
 * DPDPA §13 — right of erasure.
 *
 * ?dry-run=true  — returns { ok: true, deletedAt, dryRun: true } without
 *                  actually deleting anything. Founder can test safely.
 *
 * Without dry-run:
 *   - Deletes all R2 photos for the user
 *   - Sets user.deletedAt (soft-delete)
 *   - Returns { ok: true, deletedAt }
 *
 * Auth required. Logs to data-rights.jsonl.
 */
router.delete('/me/data', async (req, res) => {
  if (!dpdpaEnabled()) return res.status(403).json({ error: 'data rights not enabled' });
  const user = req.lookmaxUser;
  const isDryRun = req.query['dry-run'] === 'true';
  const deletedAt = new Date().toISOString();

  logDataRight(isDryRun ? 'delete-dry-run' : 'delete', user.token, req.ip);

  if (isDryRun) {
    return res.json({ ok: true, dryRun: true, deletedAt });
  }

  try {
    // ── 1. Delete all R2 photos ────────────────────────────────────
    const Lookmax = require('../models/Lookmax');
    const mirrors = Lookmax.getMirrors(user.token) || [];
    const hair    = Lookmax.getHair(user.token) || [];

    const r2Keys = [];
    for (const m of mirrors) {
      if (m.photoPath && m.photoPath.startsWith('r2:')) r2Keys.push(m.photoPath.slice('r2:'.length));
    }
    for (const h of hair) {
      if (h.frontPath && h.frontPath.startsWith('r2:')) r2Keys.push(h.frontPath.slice('r2:'.length));
      if (h.crownPath && h.crownPath.startsWith('r2:')) r2Keys.push(h.crownPath.slice('r2:'.length));
    }
    if (user.lookmaxBaseline && user.lookmaxBaseline.photoStorageKeys) {
      for (const k of Object.values(user.lookmaxBaseline.photoStorageKeys)) {
        const key = k && k.startsWith('r2:') ? k.slice('r2:'.length) : k;
        if (key) r2Keys.push(key);
      }
    }

    for (const key of r2Keys) {
      await storage.delete(key).catch(() => { /* best-effort */ });
    }

    // ── 2. Soft-delete the user (set deletedAt) ───────────────────
    await User.updateUser(user.phone, { deletedAt });

    log.info('DPDPA-DELETE', `user ${user.token} soft-deleted; ${r2Keys.length} R2 objects removed`);
    res.json({ ok: true, deletedAt });
  } catch (err) {
    log.error('DPDPA-DELETE', err.message);
    res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment, or write to support.' }); // TODO copy review
  }
});

module.exports = router;
module.exports.mirrorLevelFor = mirrorLevelFor;
module.exports.overallOf = overallOf;
module.exports.nextStreak = nextStreak;
module.exports.computeCrossSellEligible = computeCrossSellEligible;
