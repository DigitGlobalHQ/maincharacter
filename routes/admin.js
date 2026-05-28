/**
 * ═══════════════════════════════════════════════════════════════════
 * ADMIN ROUTES — Dashboard API
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AuditSession = require('../models/AuditSession');
const Lookmax = require('../models/Lookmax');
const whatsapp = require('../services/whatsapp');
const sms = require('../services/sms');
const auth = require('../lib/auth');
const admin = require('../lib/admin');
const { AESTHETIC_AXES } = require('../data/lookmax-prompts');

const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

let _log;
function log(tag, msg) {
  if (!_log) _log = require('../lib/log').createLogger('ADMIN');
  if (/error|fail/i.test(tag)) return _log.error(tag, msg);
  if (/warn/i.test(tag)) return _log.warn(tag, msg);
  return _log.info(tag, msg);
}

// ─── Login → JWT (P1.4) ───
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!auth.checkPassword(password)) {
    log('LOGIN', 'Failed admin login attempt');
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = auth.signAdminToken();
  log('LOGIN', 'Admin authenticated');
  res.json({ token, expiresIn: '12h' });
});

// ─── Auth middleware: Bearer JWT (or ?token=), with legacy header fallback
// that is automatically disabled once ADMIN_PASSWORD_HASH is configured. ───
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token;
  if (auth.verifyAdminToken(token)) return next();

  // Legacy plaintext header — only honoured until a bcrypt hash is set.
  if (!auth.hashConfigured()) {
    const pw = req.headers['x-admin-password'] || req.query.pw;
    if (auth.checkPassword(pw)) return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

// ─── Stats ───
router.get('/stats', requireAuth, (req, res) => {
  const users = User.getAllUsers();
  const userList = Object.values(users);

  const today = new Date().toDateString();
  const activeToday = userList.filter(u => u.lastActive && new Date(u.lastActive).toDateString() === today).length;
  const trialComplete = userList.filter(u => u.trialComplete).length;
  const paid = userList.filter(u => u.subscriptionStatus === 'active').length;

  // Average score improvement (Day 1 → latest)
  let totalImprovement = 0;
  let improvementCount = 0;
  userList.forEach(u => {
    if (u.scores.length >= 2) {
      const first = u.scores[0];
      const last = u.scores[u.scores.length - 1];
      const avgFirst = (first.fluency + first.confidenceTone + first.vocabularyRange + first.structure) / 4;
      const avgLast = (last.fluency + last.confidenceTone + last.vocabularyRange + last.structure) / 4;
      totalImprovement += (avgLast - avgFirst);
      improvementCount++;
    }
  });

  res.json({
    totalUsers: userList.length,
    activeToday,
    trialComplete,
    paidSubscribers: paid,
    avgImprovement: improvementCount > 0 ? Math.round(totalImprovement / improvementCount) : 0,
    users: userList.map(u => ({
      name: u.name,
      phone: u.phone,
      pillar: u.pillar,
      day: u.day,
      streak: u.streak,
      status: u.status,
      rank: u.rank,
      lastActive: u.lastActive,
      enrolledAt: u.enrolledAt,
      trialComplete: u.trialComplete,
      subscriptionStatus: u.subscriptionStatus,
      token: u.token,
      scoresCount: u.scores.length,
    })),
    waitlist: User.getWaitlist(),
  });
});

// ─── User detail ───
router.get('/user/:phone', requireAuth, (req, res) => {
  const user = User.getUserByPhone(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── Send custom message ───
router.post('/send-message', requireAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'Phone and message required' });

  try {
    await whatsapp.sendMessage(phone, message);
    log('SEND', `Custom message to ${phone}: ${message.substring(0, 50)}...`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test SMS / OTP (founder verification — RUNBOOK) ───
// Sends a freshly-generated OTP to the given phone (defaults to ADMIN_PHONE).
// Respects WHATSAPP_SEND_MODE, so under `allowlist` only ADMIN_PHONE delivers,
// and it is a DRY-RUN until MSG91_AUTH_KEY is set. The OTP is not returned in
// production to avoid logging a real code in a response.
router.post('/test-sms', requireAuth, async (req, res) => {
  const phone = (req.body && req.body.phone) || admin.primaryAdminPhone();
  if (!phone) return res.status(400).json({ error: 'No phone and no admin phone set' });
  try {
    const otp = sms.generateOtp();
    const result = await sms.sendOtp(phone, otp);
    log('TEST-SMS', `OTP send to ${phone} → ${result && result.result ? result.result : 'sent'}`);
    res.json({
      success: true,
      result,
      configured: sms.isConfigured(),
      otp: process.env.NODE_ENV === 'production' ? undefined : otp,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Broadcast ───
router.post('/broadcast', requireAuth, async (req, res) => {
  const { message, filter } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const users = Object.values(User.getAllUsers());
  let targets = users;

  // Apply filter
  if (filter === 'active') targets = users.filter(u => u.status === 'active');
  if (filter === 'completed') targets = users.filter(u => u.trialComplete);
  if (filter === 'paid') targets = users.filter(u => u.subscriptionStatus === 'active');

  log('BROADCAST', `Sending to ${targets.length} users (filter: ${filter || 'all'})`);

  let sent = 0;
  let failed = 0;
  for (const user of targets) {
    try {
      await whatsapp.sendMessageSafe(user.phone, message);
      sent++;
      // Rate limit: 1 message per second
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      failed++;
    }
  }

  res.json({ success: true, sent, failed, total: targets.length });
});

// ─── Promote rank ───
router.post('/promote', requireAuth, (req, res) => {
  const { phone, rank } = req.body;
  const validRanks = ['unawakened', 'seeker', 'ascendant', 'luminary', 'sovereign'];
  if (!validRanks.includes(rank)) return res.status(400).json({ error: 'Invalid rank' });

  const user = User.updateUser(phone, { rank });
  if (!user) return res.status(404).json({ error: 'User not found' });

  log('PROMOTE', `${user.name} → ${rank}`);
  res.json({ success: true, user: { name: user.name, rank: user.rank } });
});

// ─── Seed a test user for founder dogfood (Night-4, P1.3) ───
// Skips Razorpay entirely: upserts a fully-activated user (Orator + Lookmaxxing
// → Aura++ computes true) with a pre-completed synthetic audit and today's
// protocol, then returns the admin-login deep link. Idempotent by phone.
router.post('/seed-test-user', requireAuth, (req, res) => {
  const { phone, name, weakestAxis } = req.body || {};
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!/^\d{10,13}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'valid phone required' });
  }
  const weakest = AESTHETIC_AXES.includes(weakestAxis) ? weakestAxis : 'hairDensity';

  // Synthetic 8-axis scores: mid-range everywhere, one clearly-weakest axis to
  // drive protocol selection (DECISIONS.md Night-4 #2).
  const scores = {};
  for (const axis of AESTHETIC_AXES) scores[axis] = axis === weakest ? 35 : 65;

  // Create + complete a synthetic AuditSession.
  const session = AuditSession.createSession({ intent: 'founder-seed' });
  AuditSession.updateSession(session.sessionToken, {
    quizAnswers: { _seed: true, focus: weakest },
    photos: [],
    aestheticScores: scores,
    weakestAxis: weakest,
    hairReceding: { detected: weakest === 'hairDensity', norwoodEstimate: 2, hairlineScore: 35 },
    // TODO copy review — synthetic seed for founder testing. Real audit copy
    // comes through gemini.scoreAesthetic().
    diagnosis:
      '// TODO copy review — synthetic seed for founder testing. Real audit copy comes through gemini.scoreAesthetic().',
    completedAt: new Date().toISOString(),
  });

  // Upsert the user (phone-primary). Existing → update, don't duplicate.
  let user = User.getUserByPhone(cleanPhone);
  if (!user) {
    user = User.createUser({ name: (name || 'Founder').trim(), phone: cleanPhone, pillar: 'aesthetic' });
  }
  user = User.updateUser(cleanPhone, {
    name: (name || user.name || 'Founder').trim(),
    oratorActive: true,
    lookmaxxingActive: true,
    lookmaxxingStartedAt: user.lookmaxxingStartedAt || new Date().toISOString(),
    mirrorLevel: 'raw',
    auditSessionId: session.sessionToken,
    subscriptionStatus: 'active',
    rank: user.rank === 'unawakened' ? 'seeker' : user.rank,
  });

  // Generate today's protocol immediately (best-effort: the protocol service
  // ships in P5; if absent at seed time the dashboard regenerates on first open).
  try {
    const protocol = require('../services/protocol');
    const day = protocol.generateProtocol(user, { scores, weakestAxis: weakest });
    Lookmax.setProtocolDay(user.token, day);
  } catch (err) {
    log('SEED-WARN', `protocol not generated yet: ${err.message}`);
  }

  log('SEED', `seeded ${cleanPhone} (${user.name}) weakest=${weakest} → Aura++`);
  res.json({
    user: {
      token: user.token,
      name: user.name,
      phone: user.phone,
      oratorActive: user.oratorActive,
      lookmaxxingActive: user.lookmaxxingActive,
      auraPlusPlus: User.computeAuraStatus(user).auraPlusPlus,
      mirrorLevel: user.mirrorLevel,
      weakestAxis: weakest,
      auditSessionId: user.auditSessionId,
    },
    loginUrl: `${BASE_URL}/lookmax/admin-login?phone=${encodeURIComponent(cleanPhone)}`,
  });
});

// ─── KPI Funnel Tiles (B5) ───
// GET /api/admin/funnel — returns 14 KPI tiles derived from the event sink.
// Auth: existing requireAuth middleware (Bearer JWT or legacy x-admin-password).
// Performance: reads JSONL line-by-line via events.query; fine for ≤100k events.
// See DECISIONS.md B5 for query-performance caveat.
router.get('/funnel', requireAuth, async (req, res) => {
  try {
    const events = require('../services/events');
    const now = new Date();
    const nowIso = now.toISOString();

    // Helpers
    const daysAgoIso = (n) => new Date(Date.now() - n * 86400000).toISOString();
    const istMidnight = () => {
      // IST = UTC+5:30; derive yesterday's IST midnight as UTC
      const d = new Date();
      d.setUTCHours(d.getUTCHours() - 5);
      d.setUTCMinutes(d.getUTCMinutes() - 30);
      const yest = new Date(d);
      yest.setUTCDate(yest.getUTCDate() - 1);
      yest.setUTCHours(0, 0, 0, 0);
      // Convert back to UTC
      return new Date(yest.getTime() + 5.5 * 60 * 60 * 1000);
    };
    const istYesterdayStart = istMidnight();
    const istYesterdayEnd = new Date(istYesterdayStart.getTime() + 86400000);

    // Fetch all relevant event types in parallel (each is a stream of the JSONL)
    const [
      auditStarted24h,
      auditResultViewed7d,
      paywallViewed7d,
      paywallCtaClicked7d,
      paymentInitiated7d,
      paymentSucceededAll,
      paymentSucceededYesterday,
      paymentSucceeded30d,
      bundleAttached7d,
      firstMirror14d,
      paymentSucceeded14d,
      mirrorTakenAll,
      paymentSucceededCohort7d,
      paymentSucceededCohort30d,
      mirrorYesterday,
      revealWatched14d,
      reauditCardShown14d,
      reauditCompleted14d,
      crossSellReshowAll,
    ] = await Promise.all([
      events.query({ name: 'audit_started', since: daysAgoIso(1) }),
      events.query({ name: 'audit_result_viewed', since: daysAgoIso(7) }),
      events.query({ name: 'paywall_viewed', since: daysAgoIso(7) }),
      events.query({ name: 'paywall_cta_clicked', since: daysAgoIso(7) }),
      events.query({ name: 'payment_initiated', since: daysAgoIso(7) }),
      events.query({ name: 'payment_succeeded' }),
      events.query({ name: 'payment_succeeded', since: istYesterdayStart.toISOString(), until: istYesterdayEnd.toISOString() }),
      events.query({ name: 'payment_succeeded', since: daysAgoIso(30) }),
      events.query({ name: 'bundle_attached', since: daysAgoIso(7) }),
      events.query({ name: 'lookmax_first_mirror_taken', since: daysAgoIso(14) }),
      events.query({ name: 'payment_succeeded', since: daysAgoIso(14) }),
      events.query({ name: 'mirror_taken' }),
      events.query({ name: 'payment_succeeded', since: daysAgoIso(14), until: daysAgoIso(7) }),
      events.query({ name: 'payment_succeeded', since: daysAgoIso(37), until: daysAgoIso(30) }),
      events.query({ name: 'mirror_taken', since: istYesterdayStart.toISOString(), until: istYesterdayEnd.toISOString() }),
      events.query({ name: 'reveal_watched', since: daysAgoIso(14) }),
      events.query({ name: 'reaudit_card_shown', since: daysAgoIso(14) }),
      events.query({ name: 'reaudit_completed', since: daysAgoIso(14) }),
      events.query({ name: 'cross_sell_orator_reshow' }),
    ]);

    // ── Tile 1: Audits begun in the last 24 hours ──
    const t1 = auditStarted24h.length;

    // ── Tile 2: Audit to action seam (7d) ──
    // Ratio: paywall_viewed with a sessionToken that also appears in a recent
    // audit_result_viewed. We use the anonId as the proxy (same browser).
    const auditResultAnonIds = new Set(auditResultViewed7d.map((e) => e.anonId).filter(Boolean));
    const paywallAfterAudit = paywallViewed7d.filter(
      (e) => e.anonId && auditResultAnonIds.has(e.anonId)
    ).length;
    const t2 =
      auditResultViewed7d.length > 0
        ? Math.round((paywallAfterAudit / auditResultViewed7d.length) * 100) / 100
        : 0;

    // ── Tile 3: Echo shown on paywall (7d) ──
    const echoShown = paywallViewed7d.filter((e) => e.props && e.props.auditEchoShown === true).length;
    const t3 =
      paywallViewed7d.length > 0
        ? Math.round((echoShown / paywallViewed7d.length) * 100) / 100
        : 0;

    // ── Tile 4: Paywall to payment seam (7d) ──
    const t4 =
      paywallCtaClicked7d.length > 0
        ? Math.round((paymentInitiated7d.length / paywallCtaClicked7d.length) * 100) / 100
        : 0;

    // ── Tile 5: Conversions yesterday (IST) ──
    const t5 = paymentSucceededYesterday.length;

    // ── Tile 6: ARPU, last 30 days ──
    const totalAmount30d = paymentSucceeded30d.reduce((sum, e) => {
      const amt = e.props && typeof e.props.amount === 'number' ? e.props.amount : 0;
      return sum + amt;
    }, 0);
    const distinctUsers30d = new Set(paymentSucceeded30d.map((e) => e.userToken).filter(Boolean)).size;
    const t6 = distinctUsers30d > 0 ? Math.round(totalAmount30d / distinctUsers30d) : 0;

    // ── Tile 7: Bundle attach rate (7d) ──
    const t7 =
      paymentInitiated7d.length > 0
        ? Math.round((bundleAttached7d.length / paymentInitiated7d.length) * 100) / 100
        : 0;

    // ── Tile 8: First mirror within 24h of paying (14d) ──
    const firstMirrorWithin24h = firstMirror14d.filter((e) => {
      const hrs = e.props && typeof e.props.hoursSincePayment === 'number' ? e.props.hoursSincePayment : Infinity;
      return hrs <= 24;
    }).length;
    const t8 =
      paymentSucceeded14d.length > 0
        ? Math.round((firstMirrorWithin24h / paymentSucceeded14d.length) * 100) / 100
        : 0;

    // ── Tile 9: Day-7 still mirroring ──
    // Cohort: paid 7-14 days ago; check if they mirrored in [day 6, day 8] window
    const cohort7dTokens = new Set(paymentSucceededCohort7d.map((e) => e.userToken).filter(Boolean));
    const mirroringAt7d = new Set(
      mirrorTakenAll.filter((e) => {
        if (!e.userToken || !cohort7dTokens.has(e.userToken)) return false;
        const payment = paymentSucceededCohort7d.find((p) => p.userToken === e.userToken);
        if (!payment) return false;
        const daysSince = (new Date(e.ts) - new Date(payment.ts)) / 86400000;
        return daysSince >= 6 && daysSince <= 8;
      }).map((e) => e.userToken)
    ).size;
    const t9 = cohort7dTokens.size > 0 ? Math.round((mirroringAt7d / cohort7dTokens.size) * 100) / 100 : 0;

    // ── Tile 10: Day-30 still mirroring ──
    const cohort30dTokens = new Set(paymentSucceededCohort30d.map((e) => e.userToken).filter(Boolean));
    const mirroringAt30d = new Set(
      mirrorTakenAll.filter((e) => {
        if (!e.userToken || !cohort30dTokens.has(e.userToken)) return false;
        const payment = paymentSucceededCohort30d.find((p) => p.userToken === e.userToken);
        if (!payment) return false;
        const daysSince = (new Date(e.ts) - new Date(payment.ts)) / 86400000;
        return daysSince >= 29 && daysSince <= 31;
      }).map((e) => e.userToken)
    ).size;
    const t10 = cohort30dTokens.size > 0 ? Math.round((mirroringAt30d / cohort30dTokens.size) * 100) / 100 : 0;

    // ── Tile 11: Mirrors taken yesterday across active users ──
    const activeUsers = Object.values(require('../models/User').getAllUsers()).filter((u) => u.lookmaxxingActive);
    const mirrorYesterdayCount = new Set(mirrorYesterday.map((e) => e.userToken).filter(Boolean)).size;
    const t11 = activeUsers.length > 0 ? Math.round((mirrorYesterdayCount / activeUsers.length) * 100) / 100 : 0;

    // ── Tile 12: Reveal pull-through (14d) ──
    // Use reveal_watched as numerator; denominator = distinct users who could watch
    // (mirror_taken ≥ 4 in a week — approximated as distinct userTokens in mirror_taken 14d)
    const eligibleReveal = new Set(
      mirrorTakenAll.filter((e) => {
        const ts = new Date(e.ts);
        return ts >= new Date(daysAgoIso(14));
      }).map((e) => e.userToken).filter(Boolean)
    ).size;
    const revealWatched = new Set(revealWatched14d.map((e) => e.userToken).filter(Boolean)).size;
    const t12 = eligibleReveal > 0 ? Math.round((revealWatched / eligibleReveal) * 100) / 100 : 0;

    // ── Tile 13: Re-audit completion rate (14d) ──
    const t13 =
      reauditCardShown14d.length > 0
        ? Math.round((reauditCompleted14d.length / reauditCardShown14d.length) * 100) / 100
        : 0;

    // ── Tile 14: Cross-sell silence (all-time reshow count) ── P0 counter
    const t14 = crossSellReshowAll.length;

    // ── State helper: rate 0-1 values as green/amber/red ──
    function rateRatio(v, greenThreshold, amberThreshold) {
      if (v >= greenThreshold) return 'green';
      if (v >= amberThreshold) return 'amber';
      return 'red';
    }
    function rateCount(v, greenMin) {
      if (v >= greenMin) return 'green';
      if (v > 0) return 'amber';
      return 'red';
    }

    const computedAt = nowIso;
    const tile = (value, state) => ({ value, state, computedAt });

    res.json({
      // Tile 1 — Audits begun in the last 24 hours
      auditsBegun24h: tile(t1, rateCount(t1, 1)),
      // Tile 2 — Audit to action seam (Result → Action %)
      auditToAction: tile(t2, rateRatio(t2, 0.1, 0.05)),
      // Tile 3 — Echo shown on paywall %
      echoOnPaywall: tile(t3, rateRatio(t3, 0.7, 0.4)),
      // Tile 4 — Paywall to payment seam %
      paywallToPayment: tile(t4, rateRatio(t4, 0.5, 0.2)),
      // Tile 5 — Conversions yesterday
      conversionsYesterday: tile(t5, rateCount(t5, 1)),
      // Tile 6 — ARPU, last 30 days (₹)
      arpu30d: tile(t6, rateCount(t6, 799)),
      // Tile 7 — Bundle attach rate %
      bundleAttachRate: tile(t7, rateRatio(t7, 0.3, 0.1)),
      // Tile 8 — First mirror within 24h of paying %
      firstMirrorWithin24h: tile(t8, rateRatio(t8, 0.5, 0.25)),
      // Tile 9 — Day-7 still mirroring %
      day7StillMirroring: tile(t9, rateRatio(t9, 0.4, 0.2)),
      // Tile 10 — Day-30 still mirroring %
      day30StillMirroring: tile(t10, rateRatio(t10, 0.3, 0.15)),
      // Tile 11 — Mirrors taken yesterday across active users %
      mirrorsTakenYesterday: tile(t11, rateRatio(t11, 0.6, 0.3)),
      // Tile 12 — Reveal pull-through %
      revealPullThrough: tile(t12, rateRatio(t12, 0.5, 0.2)),
      // Tile 13 — Re-Audit completion rate %
      reauditCompletionRate: tile(t13, rateRatio(t13, 0.4, 0.2)),
      // Tile 14 — Cross-sell silence (P0 counter — must always be 0)
      crossSellSilence: tile(t14, t14 === 0 ? 'green' : 'red'),
    });
  } catch (err) {
    log('ERROR', `funnel failed: ${err.message}`);
    res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

// ─── Export CSV ───
router.get('/export', requireAuth, (req, res) => {
  const users = Object.values(User.getAllUsers());
  
  const headers = 'Name,Phone,Pillar,Day,Streak,Status,Rank,Enrolled,Last Active,Trial Complete,Subscription\n';
  const rows = users.map(u => 
    `"${u.name}",${u.phone},${u.pillar},${u.day},${u.streak},${u.status},${u.rank},${u.enrolledAt},${u.lastActive},${u.trialComplete},${u.subscriptionStatus}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=maincharacter-users.csv');
  res.send(headers + rows);
});

module.exports = router;
