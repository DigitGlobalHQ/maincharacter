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
