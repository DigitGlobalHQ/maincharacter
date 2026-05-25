/**
 * ═══════════════════════════════════════════════════════════════════
 * ADMIN ROUTES — Dashboard API
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const wati = require('../services/wati');
const auth = require('../lib/auth');

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
    await wati.sendMessage(phone, message);
    log('SEND', `Custom message to ${phone}: ${message.substring(0, 50)}...`);
    res.json({ success: true });
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
      await wati.sendMessageSafe(user.phone, message);
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
