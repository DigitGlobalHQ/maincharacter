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
const EarlyAccess = require('./models/EarlyAccess');
const adminLib = require('./lib/admin');
const db = require('./lib/db');
const migrate = require('./lib/migrate');
const geminiHealth = require('./lib/gemini-health');

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

// Best-effort build identifier surfaced on /health (Render sets RENDER_GIT_COMMIT).
const GIT_SHA = (() => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 7);
  try {
    return require('child_process').execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

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
// Login Gate (P0-1): tightLimiter (10/min) on the entire auth namespace,
// replacing the previous absence of an auth-scoped limiter (security audit MEDIUM).
// Covers admin-login + request-link + consume-link + exchange-first-login + method.
app.use('/api/lookmax/auth', tightLimiter);
app.use('/api', globalLimiter);

// Direct .html requests (/audit.html, /lookmaxing/tools/x.html, …) → serve through
// servePage so the light-mode + analytics <head> is injected. Must precede static.
// Clean-URL routes call servePage directly; non-.html assets fall through.
app.get(/\.html$/i, (req, res, next) => {
  const root = path.join(__dirname, 'public') + path.sep;
  const abs = path.join(__dirname, 'public', req.path);
  if (!abs.startsWith(root) || !fs.existsSync(abs)) return next();
  return servePage(res, abs);
});

// Static files — /public directory
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ═══════════════════════════════════════════════════════════════════
// PAGE ROUTES
// ═══════════════════════════════════════════════════════════════════

// Analytics (GA4) + Search Console verification are injected into the <head> of
// public HTML pages from env (lib/analytics-head). No-op until configured. Pages
// are read once and cached per-process (env is fixed at boot).
const { analyticsHead } = require('./lib/analytics-head');
const { themeHead } = require('./lib/theme-head');
const _ANALYTICS_HEAD = analyticsHead();
const _THEME_HEAD = themeHead();
const _pageCache = new Map();
function servePage(res, absPath) {
  let html = _pageCache.get(absPath);
  if (html === undefined) {
    try {
      html = fs.readFileSync(absPath, 'utf8');
    } catch {
      res.sendStatus(404);
      return;
    }
    if (html.includes('</head>')) {
      html = html.replace('</head>', _ANALYTICS_HEAD + _THEME_HEAD + '</head>');
    }
    _pageCache.set(absPath, html);
  }
  res.type('html').send(html);
}

// Homepage
app.get('/', (req, res) => {
  servePage(res, path.join(__dirname, 'landing.html'));
});

// Free Trial Enrollment — cordoned off (stage-1-audit-spec.md §1, Wave 2C)
// Orator is "Coming Soon" pending Meta WhatsApp Cloud API setup.
// public/start.html is preserved on disk so Orator can be relaunched later.
// Redirect to the new primary entry point: /lookmaxing (Lookmaxxing pillar).
app.get('/start', (req, res) => {
  res.redirect(302, '/lookmaxing');
});

// Post-Enrollment Welcome
app.get('/welcome', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'welcome.html'));
});

// Audit Funnel (existing)
app.get('/audit', (req, res) => {
  // Night-2 (P3.4): serve the new Aesthetic Audit funnel. Legacy prototype
  // remains at index.html (served at /audit-legacy) for reference/rollback.
  servePage(res, path.join(__dirname, 'public', 'audit.html'));
});

app.get('/audit-legacy', (req, res) => {
  servePage(res, path.join(__dirname, 'index.html'));
});

// User Dashboard
app.get('/dashboard/:token', async (req, res) => {
  const user = await User.getUserByToken(req.params.token);
  if (!user) return res.status(404).send('Dashboard not found.');
  servePage(res, path.join(__dirname, 'public', 'dashboard.html'));
});

// Paywall (P5) — 3-card subscribe page (Orator / Lookmaxxing / Aura++).
// Night-4 safety gate (P0.3): Razorpay is LIVE, so the full paywall is only
// served when PAYWALL_PUBLIC === 'true'. Otherwise we serve a waitlist page so
// no live charge can fire during the founder's dogfood window (DECISIONS #1).
app.get('/paywall', (req, res) => {
  if (process.env.PAYWALL_PUBLIC === 'true') {
    return servePage(res, path.join(__dirname, 'public', 'paywall.html'));
  }
  servePage(res, path.join(__dirname, 'public', 'paywall-waitlist.html'));
});

// Post-payment confirmation (P6) — Razorpay callback lands here.
app.get('/payment-confirmed', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'payment-confirmed.html'));
});

// Legal — Terms & Privacy (clean URLs; linked from the sign-in consent line).
app.get('/terms', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'terms.html'));
});
app.get('/privacy', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'privacy.html'));
});

// Audit result magic-link target (audit-confirmation email). Serves the audit
// SPA; deep result rehydration from the link is a V4 item (BACKLOG).
app.get('/audit/result/:token', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'audit.html'));
});

// ─── Lookmaxing (Stage-1 Audit Engine, Wave 2A) ───
// Static assets + pretty-URL routes for the 8-surface audit funnel.
// Wave 2B (frontend-agent) ships the HTML; these routes serve whatever is present.
// Cited: briefs/stage-1-audit-spec.md §3.
app.use('/lookmaxing', express.static(path.join(__dirname, 'public', 'lookmaxing'), { index: false }));

const lookmaxingPage = (file) => (req, res) => {
  const p = path.join(__dirname, 'public', 'lookmaxing', file);
  if (fs.existsSync(p)) return servePage(res, p);
  // Fallback to index.html for SPA routing.
  return servePage(res, path.join(__dirname, 'public', 'lookmaxing', 'index.html'));
};
app.get('/lookmaxing',               lookmaxingPage('index.html'));
app.get('/lookmaxing/start',         lookmaxingPage('start.html'));
app.get('/lookmaxing/quiz',          lookmaxingPage('quiz.html'));
app.get('/lookmaxing/capture',       lookmaxingPage('capture.html'));
app.get('/lookmaxing/audit/:id',     lookmaxingPage('audit.html'));
app.get('/lookmaxing/audit/:id/full',lookmaxingPage('audit-full.html'));
// Free browser-based facial-analysis tools (MediaPipe 478-landmark; runs entirely
// client-side — no upload). Hub + flagship + per-tool SEO pages + AI studio.
const _toolsDir = path.join(__dirname, 'public', 'lookmaxing', 'tools');
app.get('/lookmaxing/tools',  (req, res) => servePage(res, path.join(_toolsDir, 'index.html'))); // hub
app.get('/lookmaxing/tools/', (req, res) => servePage(res, path.join(_toolsDir, 'index.html')));
app.get('/face',              (req, res) => servePage(res, path.join(_toolsDir, 'all.html')));    // flagship combined analyzer
app.get('/studio',            (req, res) => servePage(res, path.join(_toolsDir, 'studio.html')));  // paid AI image studio
// Clean per-tool URLs (/lookmaxing/tools/jawline-score → jawline-score.html). Static
// already serves *.html + JS/CSS; this only catches the extensionless slug.
app.get('/lookmaxing/tools/:slug', (req, res) => {
  if (!/^[a-z0-9-]{2,40}$/.test(req.params.slug)) return res.redirect('/lookmaxing/tools');
  const f = path.join(_toolsDir, req.params.slug + '.html');
  if (!fs.existsSync(f)) return res.redirect('/lookmaxing/tools');
  return servePage(res, f);
});
// Fork page injects the trial-live flag. The Daily Mirror is live, so the
// "Start your free 7-day trial" CTA is enabled unless LOOKMAX_TRIAL_LIVE=false.
// Without this the button was permanently disabled (dead stage-10 CTA). funnel-repair.
app.get('/lookmaxing/fork', (req, res) => {
  const p = path.join(__dirname, 'public', 'lookmaxing', 'fork.html');
  let html;
  try {
    html = fs.readFileSync(p, 'utf8');
  } catch {
    return servePage(res, path.join(__dirname, 'public', 'lookmaxing', 'index.html'));
  }
  const trialLive = process.env.LOOKMAX_TRIAL_LIVE !== 'false';
  html = html.replace('</head>', `<script>window.LOOKMAX_TRIAL_LIVE=${trialLive};</script>` + _ANALYTICS_HEAD + _THEME_HEAD + '</head>');
  res.type('html').send(html);
});

// ─── Lookmaxxing PWA (Night-4, P2.6) ───
// Static assets (manifest, sw.js, app.css/js, icons, *.html) + pretty-URL routes
// so the PWA can use clean paths without the .html suffix. Static is mounted
// first; requests for pretty URLs fall through to the explicit handlers below.
app.use('/lookmax', express.static(path.join(__dirname, 'public', 'lookmax'), { index: false }));
const lookmaxPage = (file) => (req, res) =>
  servePage(res, path.join(__dirname, 'public', 'lookmax', file));
app.get('/lookmax', lookmaxPage('index.html'));
app.get('/lookmax/', lookmaxPage('index.html'));
app.get('/lookmax/settings', lookmaxPage('settings.html'));
app.get('/lookmax/login', lookmaxPage('login.html'));
app.get('/lookmax/oauth-complete', lookmaxPage('oauth-complete.html'));
app.get('/lookmax/admin-login', lookmaxPage('admin-login.html'));
app.get('/lookmax/mirror', lookmaxPage('mirror.html'));
app.get('/lookmax/protocol', lookmaxPage('protocol.html'));
app.get('/lookmax/hair', lookmaxPage('hair.html'));
app.get('/lookmax/reveal', lookmaxPage('reveal.html'));

// Upgrade/Pricing
app.get('/upgrade', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'upgrade.html'));
});

// Paywall (legacy)
app.get('/evolve', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'upgrade.html'));
});

// Admin Panel
app.get('/admin', (req, res) => {
  servePage(res, path.join(__dirname, 'public', 'admin.html'));
});

// ═══════════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════════

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit', auditRoutes);
// Lookmaxxing PWA API (Night-4). Auth routes are public; the feature router
// (mirror/protocol/hair/dashboard/reveal) is gated by requireLookmaxAuth.
// Token/credits + paid AI image tools — specific paths mounted BEFORE the generic
// /api/lookmax routers so they win.
app.use('/api/lookmax/tokens', require('./routes/tokens'));
app.use('/api/lookmax/ai', require('./routes/ai-tools'));
app.use('/api/lookmax', require('./routes/lookmax-auth'));
app.use('/api/lookmax', require('./routes/lookmax'));
// Day-30 re-audit engine (NOW-2 / B2). Gated by requireLookmaxAuth (same as lookmax.js).
app.use('/api/lookmax', require('./routes/reaudit'));
// Stage-1 Audit Engine (Wave 2A). Guest + user sessions, resolution gate,
// Razorpay ₹99 one-time order, PDF generation. Cited: briefs/stage-1-audit-spec.md §8.
app.use('/api/lookmaxing', require('./routes/lookmaxing'));
// Viral share cards — public OG-preview pages + personalised PNG score images,
// mounted at root (/s/:id). Read-only; exposes only score + rank, never PII.
app.use('/', require('./routes/share'));

// Token-gated photo serving (Night-4, P4/P5). A user can only read their own
// files: the JWT's userId must match the {userId} path segment. Photos live in
// /tmp and are volatile (DECISIONS.md Night-4 #5).
const lookmaxAuthLib = require('./lib/lookmax-auth');
const photosSvc = require('./services/photos');
app.get('/uploads/:userId/:filename', (req, res) => {
  const token = (req.headers['authorization'] || '').replace(/^Bearer /, '') || req.query.token;
  const decoded = lookmaxAuthLib.verifyLookmaxToken(token);
  if (!decoded || decoded.userId !== req.params.userId) return res.sendStatus(401);
  const abs = photosSvc.resolve(req.params.userId, req.params.filename);
  if (!abs || !fs.existsSync(abs)) return res.sendStatus(404);
  res.sendFile(abs);
});

// Legacy webhook paths (Wati era) → 308 redirect to the Meta Cloud API endpoint
// for a 30-day deprecation window so any cached config does not 404
// (DECISIONS.md Night-3 #6). 308 preserves method + body.
app.all('/webhook', (req, res) => res.redirect(308, '/api/webhook/whatsapp'));

// ═══════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

// B0: /health is now async so it can await db.healthCheck() (10s cached).
app.get('/health', async (req, res) => {
  try {
    // Parallel: db ping + user count (both may return Promises in pg mode).
    const [dbHealthy, users, waitlistCount] = await Promise.all([
      db.healthCheck(),
      Promise.resolve(User.getAllUsers()),
      Promise.resolve(EarlyAccess.count()),
    ]);
    const usersMap = typeof users === 'object' && !Array.isArray(users) ? users : {};
    const userCount = Object.keys(usersMap).length;
    const storage = require('./services/storage');

    res.json({
      status: 'healthy',
      service: 'MainCharacter v2.0',
      environment: NODE_ENV,
      uptime: Math.round(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
      config: {
        gemini: !!process.env.GEMINI_API_KEY,
        // funnel-repair: validity, not just presence. A leaked/revoked key (403)
        // surfaces as 'leaked'/'invalid_key' here while `gemini` above stays true.
        geminiKey: geminiHealth.getStatus().status,
        razorpay: !!process.env.RAZORPAY_KEY_ID,
        adminPhone: adminLib.getAdminPhones().length > 0,
        adminCount: adminLib.getAdminPhones().length,
        sentry: !!process.env.SENTRY_DSN,
        // B0: live ping result, not just env-var presence
        database: dbHealthy,
        storage: {
          configured: storage.isR2Configured(),
          bucket: process.env.R2_BUCKET || null,
        },
        sms: { configured: !!process.env.MSG91_AUTH_KEY },
        email: { configured: !!process.env.RESEND_API_KEY },
        analytics: {
          ga: !!process.env.GA_MEASUREMENT_ID,
          searchConsole: !!process.env.GSC_VERIFICATION,
        },
      },
      paywall: {
        public: process.env.PAYWALL_PUBLIC === 'true',
        waitlistCount,
      },
      lookmaxxing: {
        configured: true,
        version: GIT_SHA,
      },
      messaging: {
        provider: 'whatsapp-cloudapi',
        mode: whatsapp.getSendMode(),
        configured: whatsapp.isConfigured(),
        webhookGuard: whatsapp.webhookGuardMode(),
        schedulerEnabled: process.env.RUN_SCHEDULER !== 'false',
      },
      scheduler: scheduler.getHealth(),
      metrics: {
        totalUsers: userCount,
        activeUsers: Object.values(usersMap).filter(u => u.status === 'active').length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    slog.error('HEALTH', `health check error: ${err.message}`);
    res.status(500).json({ status: 'error', error: err.message });
  }
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
  if (res.headersSent) return;
  // Client errors (malformed JSON body → 400, payload too large → 413) come up
  // through body-parser with a 4xx status. Honour them instead of masking as 500,
  // and don't page Sentry for ordinary bad input.
  const status = err.status || err.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const msg = err.type === 'entity.parse.failed' ? 'Malformed request body.'
      : status === 413 ? 'Request too large.'
      : 'Bad request.';
    return res.status(status).json({ error: msg });
  }
  sentry.captureException(err);
  slog.error('UNHANDLED', err.message, { path: req.path, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER + SCHEDULER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, async () => {
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
  console.log(`  Admin phones: ${adminLib.getAdminPhones().join(', ') || 'NOT SET'}`);
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
  console.log('    GET  /api/cron/tick       — External scheduler trigger (pinger)');
  console.log('    GET  /health              — Status check');
  console.log('═'.repeat(62));
  console.log('');

  console.log(`  Messaging mode: ${whatsapp.getSendMode().toUpperCase()} (provider: whatsapp-cloudapi)`);
  const guard = whatsapp.webhookGuardMode();
  console.log(`  Webhook guard:  ${guard.toUpperCase()}${guard === 'open' ? ' — set WHATSAPP_APP_SECRET to verify incoming webhooks' : ''}`);
  console.log('═'.repeat(62));
  console.log('');

  // P0.6 — guard against an accidental real charge: live keys + a public paywall
  // + no historical paying user is almost always a misconfiguration during the
  // dogfood window. Surface it loudly so the founder notices before a user pays.
  const liveKeys = String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_');
  const paywallPublic = process.env.PAYWALL_PUBLIC === 'true';
  const everPaid = Object.values(await User.getAllUsers()).some(
    (u) => u.oratorActive || u.lookmaxxingActive || u.subscriptionStatus === 'active'
  );
  if (liveKeys && paywallPublic && !everPaid) {
    console.log('─'.repeat(62));
    slog.warn(
      'RAZORPAY',
      'LIVE keys + paywall public + zero historical paying users. Verify this is ' +
        'intentional. To gate the paywall, set PAYWALL_PUBLIC=false.'
    );
    console.log('─'.repeat(62));
  }

  // ── Postgres init + migrations (B0) ──────────────────────────────
  // Non-blocking: boot continues even when DATABASE_URL is unset.
  // db.init() is idempotent; migrate.run() is idempotent.
  if (process.env.DATABASE_URL) {
    db.init()
      .then((ready) => {
        if (ready) return migrate.run();
      })
      .then((count) => {
        if (count !== undefined) slog.info('MIGRATE', `${count} migration(s) applied on boot`);
      })
      .catch((err) => {
        slog.error('MIGRATE', `migration failed on boot: ${err.message}`);
      });
  }

  // Start the scheduler (skip when RUN_SCHEDULER=false, e.g. tests / worker split)
  if (process.env.RUN_SCHEDULER !== 'false') {
    scheduler.start();
  } else {
    console.log('[server] RUN_SCHEDULER=false — scheduler not started');
  }

  // Probe Gemini key validity once on boot (non-blocking) so /health.config.geminiKey
  // reflects 'ok'/'leaked'/'invalid_key' rather than mere key presence. funnel-repair.
  geminiHealth.init();
});
