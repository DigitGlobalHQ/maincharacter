/**
 * ═══════════════════════════════════════════════════════════════════
 * MAINCHARACTER — Server (v2.0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Slim orchestrator. All logic lives in:
 *   /routes    — API, admin endpoints
 *   /services  — Wati, Gemini, Scheduler, Razorpay
 *   /models    — User data (JSON-backed)
 *   /data      — Protocol content (7-day Orator)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

// ─── Import routes & services ───
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const scheduler = require('./services/scheduler');
const wati = require('./services/wati');
const User = require('./models/User');

// ─── App setup ───
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'maincharacter2026';

// ─── Middleware ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files — /public directory
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════════════════════════════

// Homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Free Trial Enrollment
app.get('/start', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'start.html'));
});

// Post-Enrollment Welcome
app.get('/welcome', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'welcome.html'));
});

// Audit Funnel (existing)
app.get('/audit', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// User Dashboard
app.get('/dashboard/:token', (req, res) => {
  const user = User.getUserByToken(req.params.token);
  if (!user) return res.status(404).send('Dashboard not found.');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Upgrade/Pricing
app.get('/upgrade', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upgrade.html'));
});

// Paywall (legacy)
app.get('/evolve', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'upgrade.html'));
});

// Admin Panel
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Backward compatibility — Wati calls /webhook. Call the handler in-process
// (P1.3) instead of re-POSTing to localhost. All spam-gating lives in the
// handler, so there is a single source of truth for filtering.
app.post('/webhook', (req, res) => {
  res.json({ status: 'received' });
  apiRoutes.processWatiWebhook(req.body);
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  const users = User.getAllUsers();
  const userCount = Object.keys(users).length;

  res.json({
    status: 'healthy',
    service: 'MainCharacter v2.0',
    environment: NODE_ENV,
    uptime: Math.round(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    config: {
      gemini: !!process.env.GEMINI_API_KEY,
      wati: !!process.env.WATI_API_KEY,
      razorpay: !!process.env.RAZORPAY_KEY_ID,
      adminPhone: !!process.env.ADMIN_PHONE,
      sentry: !!process.env.SENTRY_DSN,
      database: !!process.env.DATABASE_URL,
    },
    wati: {
      sendMode: wati.getSendMode(),
      schedulerEnabled: process.env.RUN_SCHEDULER !== 'false',
    },
    metrics: {
      totalUsers: userCount,
      activeUsers: Object.values(users).filter(u => u.status === 'active').length,
    },
    timestamp: new Date().toISOString(),
  });
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// ═══════════════════════════════════════════════════════════════════
// START SERVER + SCHEDULER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('');
  console.log('═'.repeat(62));
  console.log('  MAINCHARACTER v2.0 — The Orator Protocol');
  console.log(`  Running on http://localhost:${PORT}`);
  console.log('─'.repeat(62));
  console.log(`  Environment:  ${NODE_ENV}`);
  console.log(`  Gemini:       ${process.env.GEMINI_API_KEY ? 'CONFIGURED' : 'NOT SET'}`);
  console.log(`  Wati API:     ${process.env.WATI_API_KEY ? 'CONFIGURED' : 'NOT SET'}`);
  console.log(`  Razorpay:     ${process.env.RAZORPAY_KEY_ID ? 'CONFIGURED' : 'NOT SET'}`);
  console.log(`  Admin phone:  ${process.env.ADMIN_PHONE || 'NOT SET'}`);
  console.log('─'.repeat(62));
  console.log('  Pages:');
  console.log('    /           — Landing page');
  console.log('    /start      — Free trial enrollment');
  console.log('    /welcome    — Post-signup redirect');
  console.log('    /audit      — Audit funnel');
  console.log('    /dashboard  — User dashboard');
  console.log('    /upgrade    — Pricing');
  console.log('    /admin      — Admin panel');
  console.log('  API:');
  console.log('    POST /api/enroll          — Enroll new user');
  console.log('    POST /api/webhook/wati    — WhatsApp webhook');
  console.log('    POST /api/waitlist        — Coming Soon waitlist');
  console.log('    GET  /api/user/:token     — User dashboard data');
  console.log('    GET  /health              — Status check');
  console.log('═'.repeat(62));
  console.log('');

  console.log(`  Wati send mode: ${wati.getSendMode().toUpperCase()}`);
  console.log('═'.repeat(62));
  console.log('');

  // Start the scheduler (skip when RUN_SCHEDULER=false, e.g. tests / worker split)
  if (process.env.RUN_SCHEDULER !== 'false') {
    scheduler.start();
  } else {
    console.log('[server] RUN_SCHEDULER=false — scheduler not started');
  }
});
