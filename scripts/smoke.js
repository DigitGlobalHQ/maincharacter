/**
 * Smoke test — boots the real server on a random port with the scheduler
 * OFF and messaging in dry-run (WHATSAPP_SEND_MODE=off), hits the key routes,
 * asserts status + shape, then kills the server. Never sends a real message.
 *
 * Run: npm run smoke   (exit 0 = pass, 1 = fail)
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 4000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(300);
  }
  throw new Error('server did not become healthy in time');
}

const checks = [];
function check(name, condition) {
  checks.push({ name, ok: !!condition });
  console.log(`${condition ? '✓' : '✗'} ${name}`);
}

async function run() {
  const server = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      RUN_SCHEDULER: 'false',
      WHATSAPP_SEND_MODE: 'off',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  let exited = false;
  server.on('exit', () => {
    exited = true;
  });

  try {
    await waitForHealth();
    if (exited) throw new Error('server exited during boot');

    // /health
    const health = await fetch(`${BASE}/health`);
    const healthJson = await health.json();
    check('GET /health → 200', health.status === 200);
    check('/health status healthy', healthJson.status === 'healthy');
    check('/health exposes config', healthJson.config && typeof healthJson.config === 'object');
    check(
      '/health reports messaging provider',
      healthJson.messaging && healthJson.messaging.provider === 'whatsapp-cloudapi'
    );
    check('/health reports messaging send mode', healthJson.messaging && healthJson.messaging.mode === 'off');
    check('/health reports messaging DRY-RUN (no creds)', healthJson.messaging && healthJson.messaging.configured === false);

    // landing
    const home = await fetch(`${BASE}/`);
    const homeBody = await home.text();
    check('GET / → 200', home.status === 200);
    check('/ returns HTML', /<html|<!doctype/i.test(homeBody));

    // enrollment page — stage-1-audit-spec.md §1 Wave 2C: /start now 302s to /lookmaxing
    const start = await fetch(`${BASE}/start`, { redirect: 'manual' });
    check('GET /start → 302 /lookmaxing', start.status === 302 && start.headers.get('location') === '/lookmaxing');

    // payment plans
    const plans = await fetch(`${BASE}/api/payment/plans`);
    const plansJson = await plans.json();
    check('GET /api/payment/plans → 200', plans.status === 200);
    check('/api/payment/plans has seeker plan', plansJson.seeker && plansJson.seeker.amount === 79900);

    // audit funnel (Night-2 P3)
    const audit = await fetch(`${BASE}/audit`);
    const auditBody = await audit.text();
    check('GET /audit → 200', audit.status === 200);
    check('/audit serves the Aesthetic Audit funnel', /The Aesthetic Audit/.test(auditBody));

    // paywall safety gate (Night-4 P0.3): PAYWALL_PUBLIC unset → waitlist page.
    check('/health paywall gate is off by default', healthJson.paywall && healthJson.paywall.public === false);
    check('/health reports lookmaxxing configured', healthJson.lookmaxxing && healthJson.lookmaxxing.configured === true);
    const paywall = await fetch(`${BASE}/paywall`);
    const paywallBody = await paywall.text();
    check('GET /paywall → 200', paywall.status === 200);
    check('/paywall serves the waitlist page (gate off)', /The Chamber opens this weekend/.test(paywallBody));
    check('/paywall does NOT expose the live payment cards (gate off)', !/Choose the work/.test(paywallBody));

    // payment-confirmed page (Night-3 P6)
    const confirmed = await fetch(`${BASE}/payment-confirmed`);
    check('GET /payment-confirmed → 200', confirmed.status === 200);
    const statusMissing = await fetch(`${BASE}/api/payment/status`);
    check('GET /api/payment/status without id → 400', statusMissing.status === 400);

    // legacy Wati webhook retired → 308 redirect
    const watiRedirect = await fetch(`${BASE}/api/webhook/wati`, { method: 'POST', redirect: 'manual' });
    check('POST /api/webhook/wati → 308 redirect', watiRedirect.status === 308);
    const session = await fetch(`${BASE}/api/audit/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const sessionJson = await session.json();
    check('POST /api/audit/session → 200 with token', session.status === 200 && !!sessionJson.sessionToken);

    // Lookmaxxing PWA shell (Night-4 P2)
    const lmLogin = await fetch(`${BASE}/lookmax/login`);
    check('GET /lookmax/login → 200', lmLogin.status === 200);
    const lmAdmin = await fetch(`${BASE}/lookmax/admin-login`);
    check('GET /lookmax/admin-login → 200', lmAdmin.status === 200);
    const lmManifest = await fetch(`${BASE}/lookmax/manifest.json`);
    const lmManifestJson = await lmManifest.json();
    check('GET /lookmax/manifest.json → valid JSON', lmManifest.status === 200 && lmManifestJson.display === 'standalone');
    const lmSw = await fetch(`${BASE}/lookmax/sw.js`);
    check('GET /lookmax/sw.js → 200', lmSw.status === 200);
    const lmIcon = await fetch(`${BASE}/lookmax/icons/icon-512.png`);
    check('GET /lookmax/icons/icon-512.png → 200', lmIcon.status === 200);
    const lmMirror = await fetch(`${BASE}/lookmax/mirror`);
    check('GET /lookmax/mirror (pretty URL) → 200', lmMirror.status === 200);
    const lmMe = await fetch(`${BASE}/api/lookmax/me`);
    check('GET /api/lookmax/me without token → 401', lmMe.status === 401);
    const lmOtp = await fetch(`${BASE}/api/lookmax/auth/request-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '919876543210' }),
    });
    const lmOtpJson = await lmOtp.json();
    check('POST /api/lookmax/auth/request-otp → unavailable (OTP dormant)', lmOtpJson.status === 'unavailable');

    // Lookmaxing Stage-1 Audit Engine surfaces (Wave 2B, stage-1-audit-spec.md §3)
    const lmxLanding = await fetch(`${BASE}/lookmaxing`);
    const lmxLandingBody = await lmxLanding.text();
    check('GET /lookmaxing → 200', lmxLanding.status === 200);
    check('/lookmaxing serves lookmaxing landing', /lookmaxing/i.test(lmxLandingBody));
    const lmxStart = await fetch(`${BASE}/lookmaxing/start`);
    check('GET /lookmaxing/start → 200', lmxStart.status === 200);
    const lmxQuiz = await fetch(`${BASE}/lookmaxing/quiz`);
    check('GET /lookmaxing/quiz → 200', lmxQuiz.status === 200);
    const lmxCapture = await fetch(`${BASE}/lookmaxing/capture`);
    check('GET /lookmaxing/capture → 200', lmxCapture.status === 200);
    const lmxFork = await fetch(`${BASE}/lookmaxing/fork`);
    check('GET /lookmaxing/fork → 200', lmxFork.status === 200);
    // Guest API
    const lmxGuest = await fetch(`${BASE}/api/lookmaxing/guest`, { method: 'POST' });
    const lmxGuestJson = await lmxGuest.json();
    check('POST /api/lookmaxing/guest → 200 with guestId', lmxGuest.status === 200 && !!lmxGuestJson.guestId);

    // early-access waitlist capture (Night-4 P0.3)
    const early = await fetch(`${BASE}/api/waitlist/early-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Smoke', phone: '9000099000' }),
    });
    const earlyJson = await early.json();
    check('POST /api/waitlist/early-access → 200 success', early.status === 200 && earlyJson.success === true);
  } finally {
    server.kill('SIGTERM');
    await wait(200);
    if (!exited) server.kill('SIGKILL');
  }

  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`\nSMOKE FAILED: ${failed.length}/${checks.length} checks failed`);
    process.exit(1);
  }
  console.log(`\nSMOKE PASSED: ${checks.length}/${checks.length} checks`);
  process.exit(0);
}

run().catch((err) => {
  console.error('SMOKE ERROR:', err.message);
  process.exit(1);
});
