/**
 * ═══════════════════════════════════════════════════════════════════
 * MAINCHARACTER — Server (v2.0)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Slim orchestrator. All logic lives in:
 *   /routes    — API, admin endpoints
 *   /services  — WhatsApp (Meta Cloud API), Gemini, Scheduler, Razorpay
 *   /models    — User data (JSON-backed)
 *   /data      — Protocol content (7-day Orator)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

// Initialise error monitoring before anything else (no-op without SENTRY_DSN).
const sentry = require('./lib/sentry');
sentry.init();

const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createLogger } = require('./lib/log');

const slog = createLogger('SERVER');

// ─── Import routes & services ───
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');
const scheduler = require('./services/scheduler');
const whatsapp = require('./services/whatsapp');
const messagingMode = require('./lib/messaging-mode');
const User = require('./models/User');

// ─── Messaging send-mode compatibility shim (Night-3 rename) ───
// WHATSAPP_SEND_MODE is canonical; mirror the legacy WATI_SEND_MODE into it for a
// 30-day deprecation window, then default to the safe `allowlist`. (DECISIONS #5)
if (!process.env.WHATSAPP_SEND_MODE) {
  process.env.WHATSAPP_SEND_MODE = process.env.WATI_SEND_MODE || 'allowlist';
}
messagingMode.checkDeprecation();

// ─── App setup ───
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Render runs behind a proxy; trust the first hop so rate-limit sees real IPs.
app.set('trust proxy', 1);

// ─── Security headers (P4.5) ───
// CSP disabled for v1: the landing/admin pages use inline styles + CDN scripts
// (Chart.js, Google Fonts). Other helmet protections still apply.
app.use(helmet({ contentSecurityPolicy: false }));

// ─── Middleware ───
// Capture the raw body so webhook signatures (Razorpay) can be verified.
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

// ─── Rate limiting (P4.4) ───
// Webhooks are excluded: all Wati/Razorpay traffic shares a provider IP, so an
// IP limit there would drop legitimate user replies. Enrol/login/waitlist are
// the public abuse targets and get tight limits.
const skipWebhooks = (req) => req.originalUrl.includes('/webhook');
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipWebhooks,
});
const tightLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/enroll', tightLimiter);
app.use('/api/waitlist', tightLimiter);
app.use('/api/admin/login', tightLimiter);
app.use('/api', globalLimiter);

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
  // Night-2 (P3.4): serve the new Aesthetic Audit funnel. Legacy prototype
  // remains at index.html (served at /audit-legacy) for reference/rollback.
  res.sendFile(path.join(__dirname, 'public', 'audit.html'));
});

app.get('/audit-legacy', (req, res) => {
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
app.use('/api/audit', auditRoutes);

// Legacy webhook paths (Wati era) → 308 redirect to the Meta Cloud API endpoint
// for a 30-day deprecation window so any cached config does not 404
// (DECISIONS.md Night-3 #6). 308 preserves method + body.
app.all('/webhook', (req, res) => res.redirect(308, '/api/webhook/whatsapp'));

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
      razorpay: !!process.env.RAZORPAY_KEY_ID,
      adminPhone: !!process.env.ADMIN_PHONE,
      sentry: !!process.env.SENTRY_DSN,
      database: !!process.env.DATABASE_URL,
      sms: { configured: !!process.env.MSG91_AUTH_KEY },
      email: { configured: !!process.env.RESEND_API_KEY },
    },
    messaging: {
      provider: 'whatsapp-cloudapi',
      mode: whatsapp.getSendMode(),
      configured: whatsapp.isConfigured(),
      webhookGuard: whatsapp.webhookGuardMode(),
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
// ERROR HANDLING (must be after all routes)
// ═══════════════════════════════════════════════════════════════════

sentry.setupExpressErrorHandler(app);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  sentry.captureException(err);
  slog.error('UNHANDLED', err.message, { path: req.path, stack: err.stack });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

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
  console.log(`  WhatsApp:     ${whatsapp.isConfigured() ? 'CONFIGURED (Meta Cloud API)' : 'DRY-RUN (no Meta credentials)'}`);
  console.log(`  SMS (MSG91):  ${process.env.MSG91_AUTH_KEY ? 'CONFIGURED' : 'DRY-RUN'}`);
  console.log(`  Email (Resend): ${process.env.RESEND_API_KEY ? 'CONFIGURED' : 'DRY-RUN'}`);
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
  console.log('    GET  /api/webhook/whatsapp — Meta verification handshake');
  console.log('    POST /api/webhook/whatsapp — Incoming WhatsApp messages');
  console.log('    POST /api/waitlist        — Coming Soon waitlist');
  console.log('    GET  /api/user/:token     — User dashboard data');
  console.log('    GET  /health              — Status check');
  console.log('═'.repeat(62));
  console.log('');

  console.log(`  Messaging mode: ${whatsapp.getSendMode().toUpperCase()} (provider: whatsapp-cloudapi)`);
  const guard = whatsapp.webhookGuardMode();
  console.log(`  Webhook guard:  ${guard.toUpperCase()}${guard === 'open' ? ' — set WHATSAPP_APP_SECRET to verify incoming webhooks' : ''}`);
  console.log('═'.repeat(62));
  console.log('');

  // Start the scheduler (skip when RUN_SCHEDULER=false, e.g. tests / worker split)
  if (process.env.RUN_SCHEDULER !== 'false') {
    scheduler.start();
  } else {
    console.log('[server] RUN_SCHEDULER=false — scheduler not started');
  }
});
