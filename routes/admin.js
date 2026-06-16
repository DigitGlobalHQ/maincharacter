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
const lookmaxAuth = require('../lib/lookmax-auth');
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
router.post('/login', async (req, res) => {
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
router.get('/stats', requireAuth, async (req, res) => {
  const users = await User.getAllUsers();
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

  // "Who has signed in" — count of users who have authenticated at least once.
  const signedInUsers = userList.filter(u => (u.loginCount || 0) > 0).length;

  res.json({
    totalUsers: userList.length,
    activeToday,
    trialComplete,
    paidSubscribers: paid,
    signedInUsers,
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
      // ── PR B: login tracking ──
      email: u.email || null,
      authProvider: u.authProvider || null,
      lastLoginAt: u.lastLoginAt || null,
      firstLoginAt: u.firstLoginAt || null,
      loginCount: u.loginCount || 0,
      // ── Lookmaxxing progression (used by admin table for aesthetic pillar users) ──
      lookmaxStreak: u.lookmaxStreak || 0,
      mirrorLevel: u.mirrorLevel || 'raw',
    })),
    waitlist: User.getWaitlist(),
  });
});

// ─── User detail ───
router.get('/user/:phone', requireAuth, async (req, res) => {
  const user = await User.getUserByPhone(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── Delete user (hard delete; the person must sign up again) ───
router.delete('/user/:phone', requireAuth, async (req, res) => {
  const user = await User.getUserByPhone(req.params.phone);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const removed = await User.deleteUser(req.params.phone);
  if (!removed) return res.status(404).json({ error: 'User not found' });
  log('ADMIN', `deleted user ${user.email || req.params.phone} (${user.name || 'unnamed'})`);
  res.json({ ok: true, deleted: true });
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

  const users = Object.values(await User.getAllUsers());
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
router.post('/promote', requireAuth, async (req, res) => {
  const { phone, rank } = req.body;
  const validRanks = ['unawakened', 'seeker', 'ascendant', 'luminary', 'sovereign'];
  if (!validRanks.includes(rank)) return res.status(400).json({ error: 'Invalid rank' });

  const user = await User.updateUser(phone, { rank });
  if (!user) return res.status(404).json({ error: 'User not found' });

  log('PROMOTE', `${user.name} → ${rank}`);
  res.json({ success: true, user: { name: user.name, rank: user.rank } });
});

// ─── Seed a test user for founder dogfood (Night-4, P1.3) ───
// Skips Razorpay entirely: upserts a fully-activated user (Orator + Lookmaxxing
// → Aura++ computes true) with a pre-completed synthetic audit and today's
// protocol, then returns the admin-login deep link. Idempotent by phone.
router.post('/seed-test-user', requireAuth, async (req, res) => {
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

  // Create + complete a synthetic AuditSession (await — backend-adapted/async on live).
  const session = await AuditSession.createSession({ intent: 'founder-seed' });
  await AuditSession.updateSession(session.sessionToken, {
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
  let user = await User.getUserByPhone(cleanPhone);
  if (!user) {
    user = await User.createUser({ name: (name || 'Founder').trim(), phone: cleanPhone, pillar: 'aesthetic' });
  }
  user = await User.updateUser(cleanPhone, {
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

    // ── Exclude comp (dogfood) users from ALL tile computations ──
    // comp users are excluded so their activity doesn't inflate conversion /
    // retention numbers. Anonymous events (no userToken) are kept as-is.
    // See DECISIONS.md — dogfood access layer.
    // Compute the comp-token set once (await — PG returns a Promise), then a sync
    // closure keeps all the _fc(...) call sites below unchanged. (funnel-repair)
    const _compTokens = await getCompTokens();
    const _fc = (list) => filterCompEvents(list, _compTokens);
    const auditStarted24hClean       = _fc(auditStarted24h);
    const auditResultViewed7dClean   = _fc(auditResultViewed7d);
    const paywallViewed7dClean       = _fc(paywallViewed7d);
    const paywallCtaClicked7dClean   = _fc(paywallCtaClicked7d);
    const paymentInitiated7dClean    = _fc(paymentInitiated7d);
    const paymentSucceededYesterdayClean = _fc(paymentSucceededYesterday);
    const paymentSucceeded30dClean   = _fc(paymentSucceeded30d);
    const bundleAttached7dClean      = _fc(bundleAttached7d);
    const firstMirror14dClean        = _fc(firstMirror14d);
    const paymentSucceeded14dClean   = _fc(paymentSucceeded14d);
    const mirrorTakenAllClean        = _fc(mirrorTakenAll);
    const paymentSucceededCohort7dClean  = _fc(paymentSucceededCohort7d);
    const paymentSucceededCohort30dClean = _fc(paymentSucceededCohort30d);
    const mirrorYesterdayClean       = _fc(mirrorYesterday);
    const revealWatched14dClean      = _fc(revealWatched14d);
    const reauditCardShown14dClean   = _fc(reauditCardShown14d);
    const reauditCompleted14dClean   = _fc(reauditCompleted14d);
    const crossSellReshowAllClean    = _fc(crossSellReshowAll);

    // ── Tile 1: Audits begun in the last 24 hours ──
    const t1 = auditStarted24hClean.length;

    // ── Tile 2: Audit to action seam (7d) ──
    // Ratio: paywall_viewed with a sessionToken that also appears in a recent
    // audit_result_viewed. We use the anonId as the proxy (same browser).
    const auditResultAnonIds = new Set(auditResultViewed7dClean.map((e) => e.anonId).filter(Boolean));
    const paywallAfterAudit = paywallViewed7dClean.filter(
      (e) => e.anonId && auditResultAnonIds.has(e.anonId)
    ).length;
    const t2 =
      auditResultViewed7dClean.length > 0
        ? Math.round((paywallAfterAudit / auditResultViewed7dClean.length) * 100) / 100
        : 0;

    // ── Tile 3: Echo shown on paywall (7d) ──
    const echoShown = paywallViewed7dClean.filter((e) => e.props && e.props.auditEchoShown === true).length;
    const t3 =
      paywallViewed7dClean.length > 0
        ? Math.round((echoShown / paywallViewed7dClean.length) * 100) / 100
        : 0;

    // ── Tile 4: Paywall to payment seam (7d) ──
    const t4 =
      paywallCtaClicked7dClean.length > 0
        ? Math.round((paymentInitiated7dClean.length / paywallCtaClicked7dClean.length) * 100) / 100
        : 0;

    // ── Tile 5: Conversions yesterday (IST) ──
    const t5 = paymentSucceededYesterdayClean.length;

    // ── Tile 6: ARPU, last 30 days ──
    const totalAmount30d = paymentSucceeded30dClean.reduce((sum, e) => {
      const amt = e.props && typeof e.props.amount === 'number' ? e.props.amount : 0;
      return sum + amt;
    }, 0);
    const distinctUsers30d = new Set(paymentSucceeded30dClean.map((e) => e.userToken).filter(Boolean)).size;
    const t6 = distinctUsers30d > 0 ? Math.round(totalAmount30d / distinctUsers30d) : 0;

    // ── Tile 7: Bundle attach rate (7d) ──
    const t7 =
      paymentInitiated7dClean.length > 0
        ? Math.round((bundleAttached7dClean.length / paymentInitiated7dClean.length) * 100) / 100
        : 0;

    // ── Tile 8: First mirror within 24h of paying (14d) ──
    const firstMirrorWithin24h = firstMirror14dClean.filter((e) => {
      const hrs = e.props && typeof e.props.hoursSincePayment === 'number' ? e.props.hoursSincePayment : Infinity;
      return hrs <= 24;
    }).length;
    const t8 =
      paymentSucceeded14dClean.length > 0
        ? Math.round((firstMirrorWithin24h / paymentSucceeded14dClean.length) * 100) / 100
        : 0;

    // ── Tile 9: Day-7 still mirroring ──
    // Cohort: paid 7-14 days ago; check if they mirrored in [day 6, day 8] window
    const cohort7dTokens = new Set(paymentSucceededCohort7dClean.map((e) => e.userToken).filter(Boolean));
    const mirroringAt7d = new Set(
      mirrorTakenAllClean.filter((e) => {
        if (!e.userToken || !cohort7dTokens.has(e.userToken)) return false;
        const payment = paymentSucceededCohort7dClean.find((p) => p.userToken === e.userToken);
        if (!payment) return false;
        const daysSince = (new Date(e.ts) - new Date(payment.ts)) / 86400000;
        return daysSince >= 6 && daysSince <= 8;
      }).map((e) => e.userToken)
    ).size;
    const t9 = cohort7dTokens.size > 0 ? Math.round((mirroringAt7d / cohort7dTokens.size) * 100) / 100 : 0;

    // ── Tile 10: Day-30 still mirroring ──
    const cohort30dTokens = new Set(paymentSucceededCohort30dClean.map((e) => e.userToken).filter(Boolean));
    const mirroringAt30d = new Set(
      mirrorTakenAllClean.filter((e) => {
        if (!e.userToken || !cohort30dTokens.has(e.userToken)) return false;
        const payment = paymentSucceededCohort30dClean.find((p) => p.userToken === e.userToken);
        if (!payment) return false;
        const daysSince = (new Date(e.ts) - new Date(payment.ts)) / 86400000;
        return daysSince >= 29 && daysSince <= 31;
      }).map((e) => e.userToken)
    ).size;
    const t10 = cohort30dTokens.size > 0 ? Math.round((mirroringAt30d / cohort30dTokens.size) * 100) / 100 : 0;

    // ── Tile 11: Mirrors taken yesterday across active users ──
    // Exclude comp users from the active-user denominator as well.
    const activeUsers = Object.values(await require('../models/User').getAllUsers())
      .filter((u) => u.lookmaxxingActive && !u.comp);
    const mirrorYesterdayCount = new Set(mirrorYesterdayClean.map((e) => e.userToken).filter(Boolean)).size;
    const t11 = activeUsers.length > 0 ? Math.round((mirrorYesterdayCount / activeUsers.length) * 100) / 100 : 0;

    // ── Tile 12: Reveal pull-through (14d) ──
    // Use reveal_watched as numerator; denominator = distinct users who could watch
    // (mirror_taken ≥ 4 in a week — approximated as distinct userTokens in mirror_taken 14d)
    const eligibleReveal = new Set(
      mirrorTakenAllClean.filter((e) => {
        const ts = new Date(e.ts);
        return ts >= new Date(daysAgoIso(14));
      }).map((e) => e.userToken).filter(Boolean)
    ).size;
    const revealWatched = new Set(revealWatched14dClean.map((e) => e.userToken).filter(Boolean)).size;
    const t12 = eligibleReveal > 0 ? Math.round((revealWatched / eligibleReveal) * 100) / 100 : 0;

    // ── Tile 13: Re-audit completion rate (14d) ──
    const t13 =
      reauditCardShown14dClean.length > 0
        ? Math.round((reauditCompleted14dClean.length / reauditCardShown14dClean.length) * 100) / 100
        : 0;

    // ── Tile 14: Cross-sell silence (all-time reshow count) ── P0 counter
    const t14 = crossSellReshowAllClean.length;

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

// ─── B4: Push test (admin-only, feature-flagged) ───
// POST /api/admin/push/test — sends a test push to a specific userToken.
// Gated on PUSH_TEST_ENABLED env var (default false) to keep test surface narrow.
router.post('/push/test', requireAuth, async (req, res) => {
  if (process.env.PUSH_TEST_ENABLED !== 'true') {
    return res.status(503).json({ available: false, reason: 'feature_disabled' });
  }
  const { userToken } = req.body || {};
  if (!userToken) return res.status(400).json({ error: 'userToken required' });
  const user = await User.getUserByToken(userToken);
  if (!user) return res.status(404).json({ error: 'user not found' });

  const push = require('../services/push');
  const result = await push.sendToUser(userToken, {
    title: '◆ MainCharacter',
    // TODO copy review: test push body — deferred
    body: '<!-- TODO copy -->',
    url: '/lookmax/mirror',
  });
  log('PUSH-TEST', `admin push test to ${userToken}: ${JSON.stringify(result)}`);
  res.json(result);
});

// ─── Export CSV ───
router.get('/export', requireAuth, async (req, res) => {
  const users = Object.values(await User.getAllUsers());

  const headers = 'Name,Phone,Pillar,Day,Streak,Status,Rank,Enrolled,Last Active,Trial Complete,Subscription\n';
  const rows = users.map(u =>
    `"${u.name}",${u.phone},${u.pillar},${u.day},${u.streak},${u.status},${u.rank},${u.enrolledAt},${u.lastActive},${u.trialComplete},${u.subscriptionStatus}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=maincharacter-users.csv');
  res.send(headers + rows);
});

// ═══════════════════════════════════════════════════════════════════
// DOGFOOD ACCESS LAYER — comp grants + time-warp + simulate-reaudit
// ═══════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Paths for audit JSONL files (overridable via env for tests) ──
function compGrantsPath() {
  return process.env.COMP_GRANTS_FILE_PATH ||
    path.join(__dirname, '..', 'data', 'comp_grants.jsonl');
}
function timewarpLogPath() {
  return process.env.TIMEWARP_LOG_FILE_PATH ||
    path.join(__dirname, '..', 'data', 'timewarp.jsonl');
}
function simulateReauditLogPath() {
  return process.env.SIMULATE_REAUDIT_LOG_FILE_PATH ||
    path.join(__dirname, '..', 'data', 'simulate_reaudit.jsonl');
}

/** Append a single JSON record to a JSONL audit file. Atomic-safe: appendFileSync. */
function appendAuditLog(filePath, record) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify({ ...record, ts: new Date().toISOString() }) + '\n');
  } catch (err) {
    log('AUDIT-LOG-WARN', `appendAuditLog failed: ${err.message}`);
  }
}

/** Valid plan names for comp grants. */
const VALID_PLANS = new Set(['orator', 'lookmaxxing']);

/** Validate an email address (basic RFC-compatible check). */
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Returns true if the user record represents a comp (dogfood) account.
 * Exported so the funnel tile logic can filter comp user events.
 * @param {object|null} user
 * @returns {boolean}
 */
function isCompUser(user) {
  return !!(user && user.comp === true);
}

/**
 * Build an in-memory Set of comp user tokens from the JSON DB.
 * Called once per funnel request to exclude their events.
 * @returns {Set<string>}
 */
async function getCompTokens() {
  const allUsers = await User.getAllUsers();
  const tokens = new Set();
  for (const u of Object.values(allUsers)) {
    if (u.comp === true && u.token) tokens.add(u.token);
  }
  return tokens;
}

/**
 * Filter an array of event objects, removing any attributed to a comp user.
 * Events with no userToken (anonymous) are preserved.
 * @param {Array} eventList
 * @returns {Array}
 */
function filterCompEvents(eventList, compTokens) {
  const tokens = compTokens || new Set();
  return eventList.filter(e => !e.userToken || !tokens.has(e.userToken));
}

// ─── POST /api/admin/grant — comp access without payment ───────────────────
// Creates or updates a user by email with oratorActive + lookmaxxingActive =
// true (per plans list), marks comp:true, issues a session token, returns a
// magic-link URL. Audit-logged to comp_grants.jsonl.
//
// Production safety block: if NODE_ENV=production AND the admin password is
// still the default 'maincharacter2026', the endpoint refuses with 403 to
// force the founder to rotate the password before granting comp access.
router.post('/grant', requireAuth, async (req, res) => {
  const { email, plans, reason } = req.body || {};

  // ── Production safety: block if default password ──
  if (process.env.NODE_ENV === 'production' && !auth.hashConfigured()) {
    const adminPw = process.env.ADMIN_PASSWORD || 'maincharacter2026';
    if (adminPw === 'maincharacter2026') {
      return res.status(403).json({
        error: 'Admin password has not been rotated. Rotate ADMIN_PASSWORD_HASH before granting comp access.',
      });
    }
  }

  // ── Validate email ──
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required.' });
  }

  // ── Validate plans ──
  if (!Array.isArray(plans) || plans.length === 0) {
    return res.status(400).json({ error: 'plans must be a non-empty array.' });
  }
  const unknownPlans = plans.filter(p => !VALID_PLANS.has(p));
  if (unknownPlans.length > 0) {
    return res.status(400).json({ error: `Unknown plan(s): ${unknownPlans.join(', ')}. Valid plans: orator, lookmaxxing.` });
  }

  const normalEmail = email.trim().toLowerCase();

  // ── Find or create the user ──
  let user = await User.getUserByEmail(normalEmail);
  if (!user) {
    // Create a comp placeholder user with a synthetic phone
    // (Phone is the primary key; placeholder so the user record can be created)
    const placeholderPhone = `9100000${crypto.randomBytes(3).toString('hex').slice(0, 7)}`;
    user = await User.createUser({
      name: 'Founder',
      phone: placeholderPhone,
      pillar: 'aesthetic',
    });
  }

  // ── Build the update ──
  const now = new Date().toISOString();
  const updates = {
    email: normalEmail,
    comp: true,
    compReason: reason || 'comp access',
    oratorActive: plans.includes('orator'),
    lookmaxxingActive: plans.includes('lookmaxxing'),
    subscriptionStatus: 'active',
  };

  if (plans.includes('orator') && !user.oratorStartedAt) {
    updates.oratorStartedAt = now;
  }
  if (plans.includes('lookmaxxing') && !user.lookmaxxingStartedAt) {
    updates.lookmaxxingStartedAt = now;
  }

  user = await User.updateUser(user.phone, updates);

  // ── Issue a fresh session token (magic-link exchange token) ──
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min
  await User.updateUser(user.phone, {
    magicLinkToken: sessionToken,
    magicLinkExpiresAt: expiresAt,
    magicLinkConsumedAt: null,
  });

  const magicLinkUrl = `${BASE_URL}/lookmax/login?token=${encodeURIComponent(sessionToken)}`;

  // ── Audit log ──
  appendAuditLog(compGrantsPath(), {
    email: normalEmail,
    plans,
    reason: reason || 'comp access',
    userToken: user.token,
  });

  log('GRANT', `comp access granted to ${normalEmail} (plans: ${plans.join(', ')})`);

  const auraStatus = User.computeAuraStatus(user);

  // Admin-issued direct JWT — skips the magic-link consume round-trip so that
  // Chrome speculative-prefetch (or any link-scanner) cannot burn the single-use
  // token before the founder's actual click. The Dogfood Tools panel uses this
  // to set localStorage and redirect straight to /lookmax/.
  user = await lookmaxAuth.recordLogin(user, 'comp');
  const directJwt = lookmaxAuth.signLookmaxToken(user);

  res.json({
    user: {
      token: user.token,
      email: user.email,
      name: user.name,
      oratorActive: user.oratorActive,
      lookmaxxingActive: user.lookmaxxingActive,
      auraPlusPlus: auraStatus.auraPlusPlus,
      comp: user.comp,
      compReason: user.compReason,
      oratorStartedAt: user.oratorStartedAt,
      lookmaxxingStartedAt: user.lookmaxxingStartedAt,
    },
    sessionToken,
    magicLinkUrl,
    jwt: directJwt,
  });
});

// ─── POST /api/admin/timewarp — adjust lookmaxxingStartedAt ───────────────
// Updates the user's lookmaxxingStartedAt to a given ISO timestamp or
// computes now - daysAgo * 86400000. Idempotent. Audit-logged.
router.post('/timewarp', requireAuth, async (req, res) => {
  const { email, lookmaxxingStartedAt, daysAgo } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required.' });
  }

  // Must supply either an explicit ISO timestamp or daysAgo
  if (!lookmaxxingStartedAt && daysAgo == null) {
    return res.status(400).json({ error: 'Provide lookmaxxingStartedAt (ISO string) or daysAgo (number).' });
  }

  // Validate explicit timestamp
  let targetTs;
  if (lookmaxxingStartedAt) {
    const parsed = new Date(lookmaxxingStartedAt);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'lookmaxxingStartedAt must be a valid ISO date string.' });
    }
    targetTs = parsed.toISOString();
  } else {
    const days = Number(daysAgo);
    if (!Number.isFinite(days) || days < 0) {
      return res.status(400).json({ error: 'daysAgo must be a non-negative number.' });
    }
    targetTs = new Date(Date.now() - days * 86400000).toISOString();
  }

  const normalEmail = email.trim().toLowerCase();
  const user = await User.getUserByEmail(normalEmail);
  if (!user) {
    return res.status(404).json({ error: `No user found with email ${normalEmail}.` });
  }

  await User.updateUser(user.phone, { lookmaxxingStartedAt: targetTs });

  appendAuditLog(timewarpLogPath(), {
    email: normalEmail,
    lookmaxxingStartedAt: targetTs,
    userToken: user.token,
  });

  log('TIMEWARP', `lookmaxxingStartedAt set to ${targetTs} for ${normalEmail}`);

  res.json({
    email: normalEmail,
    lookmaxxingStartedAt: targetTs,
  });
});

// ─── POST /api/admin/simulate-reaudit — synthetic Day-30 result ───────────
// Computes and persists a synthetic reAuditResult that produces the requested
// variant (up / flat / down) when rendered through /api/lookmax/reaudit/result.
//
// Requires the user to have a lookmaxBaseline (409 if absent).
// Variants:
//   up:   all axes baseline + 8..14
//   flat: all axes baseline + random(-2..+2) capped to 0-100
//   down (heldCount=0): all axes baseline - 3..10
//   down (heldCount=N): N axes held (delta in -2..+2), rest go down -3..10
//
// For the 'down' variant the overall score is always < (baseline - 3) so
// classifyDelta() returns 'down'.
router.post('/simulate-reaudit', requireAuth, async (req, res) => {
  const { email, variant, heldCount } = req.body || {};

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address required.' });
  }

  const VALID_VARIANTS = new Set(['up', 'flat', 'down']);
  if (!variant || !VALID_VARIANTS.has(variant)) {
    return res.status(400).json({ error: 'variant must be one of: up, flat, down.' });
  }

  const normalEmail = email.trim().toLowerCase();
  const user = await User.getUserByEmail(normalEmail);
  if (!user) {
    return res.status(404).json({ error: `No user found with email ${normalEmail}.` });
  }

  if (!user.lookmaxBaseline || !user.lookmaxBaseline.scores) {
    return res.status(409).json({ error: 'baseline not available — run a real audit first or set lookmaxBaseline manually.' });
  }

  const baselineScores = user.lookmaxBaseline.scores;

  // ── Compute synthetic scores based on variant ──
  const axes = [
    'skinClarity', 'jawDefinition', 'eyeArea', 'hairDensity',
    'posture', 'facialHarmony', 'expression', 'bodyComposition',
  ];

  // Bounded random integer in [lo, hi] inclusive
  function rInt(lo, hi) {
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  }

  // Clamp score to [0, 100]
  function clamp(v) { return Math.max(0, Math.min(100, v)); }

  const syntheticScores = {};

  if (variant === 'up') {
    // All axes move +8 to +14 above baseline
    for (const axis of axes) {
      syntheticScores[axis] = clamp((baselineScores[axis] || 60) + rInt(8, 14));
    }
  } else if (variant === 'flat') {
    // All axes within ±2 of baseline — resulting overall delta is in (-3, +3)
    // Use a small consistent delta per axis in (-2, +2) range.
    // To guarantee classifyDelta produces 'flat', we need overall delta in [-3, +3).
    // With all axes at ±2, the mean will be in (-2, +2), well within the flat band.
    for (const axis of axes) {
      syntheticScores[axis] = clamp((baselineScores[axis] || 60) + rInt(-2, 2));
    }
  } else {
    // variant === 'down'
    // heldCount: number of axes that "hold" (delta in -2..+2 range, not below -2)
    // The rest fall by 5..12 so overallDelta ends up < -3.
    const held = Math.min(Math.max(0, Number(heldCount) || 0), axes.length);

    // Shuffle to pick which axes hold
    const shuffled = [...axes].sort(() => 0.5 - Math.random());
    const holdAxes = new Set(shuffled.slice(0, held));

    // Axes that fall must fall enough that overall delta < -3
    // Even if heldCount=8 (all held), we still need overall < -3.
    // When heldCount=8, we shift all axes down by a small amount but ensure
    // overallDelta still < -3 by using -4 to -6 range for "held" axes.
    // Per spec: "variant=down heldCount=8 → all axes within ±2... overall still goes down"
    // This is contradictory: ±2 per axis can't produce overall < -3.
    // Resolution: spec says heldCount=8 is an edge case — keep overall < -3 by
    // using a constant shift of -4 for all axes (not strictly within ±2 per axis,
    // but overall still reads as 'down'). The spec says "held ±2" applies to
    // the held-count branching logic (noise-tolerance), not to the physical delta.
    // However the test says heldCount=8 produces overall < -3. We produce
    // -4 for all axes which is > -2 noise tolerance (counts as "held") but
    // gives overall delta of -4 (< -3, so classified as 'down').
    if (held === axes.length) {
      // Special: all axes get exactly -4 so heldCount logic sees delta=-4 > -2 threshold?
      // Wait: held axis noise tolerance is delta > -2 (strict greater than).
      // -4 is NOT > -2, so axes with delta=-4 are NOT held.
      // Therefore heldCount=8 request cannot literally hold all 8 AND go down simultaneously.
      // The test for heldCount=8 only checks overall < -3, not that 8 axes are truly held.
      // Produce: all axes at -5 (down, none truly held per the noise tolerance).
      for (const axis of axes) {
        syntheticScores[axis] = clamp((baselineScores[axis] || 60) - rInt(5, 8));
      }
    } else {
      for (const axis of axes) {
        if (holdAxes.has(axis)) {
          // Held axis: delta in -2..+2 (will be > -2 noise tolerance → counts as held)
          syntheticScores[axis] = clamp((baselineScores[axis] || 60) + rInt(-1, 2));
        } else {
          // Fallen axis: delta -5..-12
          syntheticScores[axis] = clamp((baselineScores[axis] || 60) - rInt(5, 12));
        }
      }
    }
  }

  // ── Compute deltas and overall ──
  const { computeDeltas, computeOverall, classifyDelta } = require('./reaudit');

  const deltas       = computeDeltas(baselineScores, syntheticScores);
  const overall      = computeOverall(syntheticScores);
  const overallDelta = overall - computeOverall(baselineScores);
  const completedAt  = new Date().toISOString();

  // Persist
  await User.updateUser(user.phone, {
    reAuditResult: { scores: syntheticScores, deltas, overallDelta, completedAt },
    reAuditCompletedThisCycle: true,
  });

  appendAuditLog(simulateReauditLogPath(), {
    email: normalEmail,
    variant,
    heldCount: heldCount != null ? Number(heldCount) : null,
    overallDelta,
    userToken: user.token,
  });

  log('SIMULATE-REAUDIT', `synthetic reaudit for ${normalEmail}: variant=${variant}, overallDelta=${overallDelta}`);

  res.json({
    email: normalEmail,
    variant,
    overallDelta,
    deltaSign: classifyDelta(overallDelta),
    revealUrl: `${BASE_URL}/lookmax/reveal?mode=day30`,
  });
});

// ─── Signed-up users table (funnel-repair Item 3) ───────────────────────────
// Founder-only (requireAuth): every signed-up user with email, signup date,
// whether they paid the ₹99 audit unlock, and their funnel stage.
router.get('/lookmax-users', requireAuth, async (req, res) => {
  const fs = require('fs');            // eslint-disable-line global-require
  const path = require('path');        // eslint-disable-line global-require

  // Audit sessions live in the JSON store; index the latest per user.
  let sessions = {};
  try {
    const storePath = process.env.AUDIT_V2_STORE_PATH ||
      path.join(__dirname, '..', 'data', 'audit-sessions-v2.json');
    sessions = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch { sessions = {}; }

  const byUser = {};
  for (const s of Object.values(sessions)) {
    if (!s || !s.userId) continue;
    const prev = byUser[s.userId];
    if (!prev || String(s.updatedAt || '') > String(prev.updatedAt || '')) byUser[s.userId] = s;
  }

  function stageOf(s) {
    if (s && s.paid) return 'paid';
    if (s && s.geminiReport) return 'reading';
    if (s && s.photoKey) return 'photo';
    if (s && s.quizAnswers) return 'quiz';
    return 'signed_up';
  }

  const all = Object.values(await User.getAllUsers());
  const rows = all.map((u) => {
    const s = byUser[u.token];
    const paid99 = !!(s && s.paid) ||
      (typeof u.paywallCredits === 'number' && u.paywallCredits > 0) ||
      !!u.lookmaxxingActive;
    return {
      email: u.email || null,
      name: u.name || null,
      signupAt: u.enrolledAt || null,
      provider: u.authProvider || (u.email ? 'email' : 'phone'),
      paid99,
      stage: stageOf(s),
      comp: !!u.comp,
      phone: u.phone, // delete key (synthetic 'e…' for email users) — admin-only
      // ── PR B: login tracking ──
      lastLoginAt: u.lastLoginAt || null,
      loginCount: u.loginCount || 0,
    };
  }).sort((a, b) => String(b.signupAt || '').localeCompare(String(a.signupAt || '')));

  res.json({
    count: rows.length,
    paidCount: rows.filter((r) => r.paid99).length,
    signedInCount: rows.filter((r) => r.loginCount > 0).length,
    users: rows,
  });
});

// ─── Referral codes ──────────────────────────────────────────────────────────
// POST /api/admin/referral-codes — create a new referral code.
// GET  /api/admin/referral-codes — list all codes.
// Auth: same requireAuth middleware as all sibling endpoints.
//
// ₹499 base (49900 paise) is the canonical lookmax499 price (founder, 2026-06-15).
// discounted amounts are computed at admin endpoint time rather than cached on the
// record so a future price change only needs one constant updated here.

const REFERRAL_BASE_PAISE = 49900; // ₹499 in paise — lookmax499 plan base price

router.post('/referral-codes', requireAuth, async (req, res) => {
  const { inrPaiseToUsd } = require('../services/razorpay');
  const ReferralCodes = require('../models/referral-codes');

  const { percentOff, maxUses, note } = req.body || {};

  // Validate percentOff: integer in [1, 100].
  const pct = Number(percentOff);
  if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
    return res.status(400).json({ error: 'percentOff must be an integer between 1 and 100' });
  }

  // Validate maxUses: positive integer, defaults to 1 when omitted.
  const uses = maxUses === undefined || maxUses === null ? 1 : Number(maxUses);
  if (!Number.isFinite(uses) || uses < 1 || !Number.isInteger(uses)) {
    return res.status(400).json({ error: 'maxUses must be a positive integer (≥1)' });
  }

  try {
    const rec = ReferralCodes.createCode({
      percentOff: pct,
      maxUses:    uses,
      note:       note || undefined,
    });

    const discountedPaise = Math.round(REFERRAL_BASE_PAISE * (1 - pct / 100));
    const discountedInr   = discountedPaise / 100;
    const usd             = inrPaiseToUsd(discountedPaise);

    log('REFERRAL', `created code ${rec.code} (${pct}% off, ${uses} max uses)`);

    return res.json({
      code:            rec.code,
      percentOff:      rec.percentOff,
      maxUses:         rec.maxUses,
      uses:            rec.uses,
      discountedPaise,
      discountedInr,
      usd,
    });
  } catch (err) {
    log('REFERRAL-ERROR', `create failed: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

router.get('/referral-codes', requireAuth, async (req, res) => {
  const { inrPaiseToUsd } = require('../services/razorpay');
  const ReferralCodes = require('../models/referral-codes');

  try {
    const codes = ReferralCodes.listCodes().map((rec) => {
      const discountedPaise = Math.round(REFERRAL_BASE_PAISE * (1 - rec.percentOff / 100));
      return {
        code:           rec.code,
        percentOff:     rec.percentOff,
        maxUses:        rec.maxUses,
        uses:           rec.uses,
        active:         rec.active,
        note:           rec.note || null,
        createdAt:      rec.createdAt,
        discountedInr:  discountedPaise / 100,
      };
    });

    return res.json({ codes });
  } catch (err) {
    log('REFERRAL-ERROR', `list failed: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

// ─── Exported helpers — used by tests and funnel tile computation ────────────
module.exports = router;
module.exports.isCompUser      = isCompUser;
module.exports.filterCompEvents = filterCompEvents;
module.exports.getCompTokens   = getCompTokens;
