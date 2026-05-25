/**
 * Smoke test — boots the real server on a random port with the scheduler
 * OFF and Wati in dry-run (WATI_SEND_MODE=off), hits the key routes, asserts
 * status + shape, then kills the server. Never sends a real message.
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
      WATI_SEND_MODE: 'off',
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
    check('/health reports wati send mode', healthJson.wati && healthJson.wati.sendMode === 'off');

    // landing
    const home = await fetch(`${BASE}/`);
    const homeBody = await home.text();
    check('GET / → 200', home.status === 200);
    check('/ returns HTML', /<html|<!doctype/i.test(homeBody));

    // enrollment page
    const start = await fetch(`${BASE}/start`);
    check('GET /start → 200', start.status === 200);

    // payment plans
    const plans = await fetch(`${BASE}/api/payment/plans`);
    const plansJson = await plans.json();
    check('GET /api/payment/plans → 200', plans.status === 200);
    check('/api/payment/plans has seeker plan', plansJson.seeker && plansJson.seeker.amount === 79900);
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
