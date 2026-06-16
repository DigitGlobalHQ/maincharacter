/**
 * ═══════════════════════════════════════════════════════════════════
 * RAZORPAY SERVICE — Payment handling
 * ═══════════════════════════════════════════════════════════════════
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');
const { withRetry } = require('../lib/retry');

const log = createLogger('RAZORPAY');

// Retry opts for Razorpay CREATE calls (orders, plans, subscriptions, links).
// Conservative: 2 retries, small backoff. These calls are idempotent in the
// sense that a duplicate order/link simply goes unused — no money moves until
// the customer authorises in checkout.  NEVER retry verify/webhook functions
// (local crypto, no network) or capture/charge calls.
const RAZORPAY_RETRY_OPTS = {
  retries: 2,
  baseMs: 300,
  maxMs: 3000,
  factor: 2,
  jitter: true,
  label: 'razorpay-create',
};

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  log.info('INIT', 'Initialised');
}

// Test seam — allows tests to inject a mock Razorpay instance without modifying
// env vars. `undefined` means "use the module-level razorpay variable".
// Set to `null` to simulate no-keys (mock) mode, or an object to mock the SDK.
let _razorpayOverride; // intentionally undefined by default

// P4.2 launch-time guard: subscriptions are on by default this run, but warn
// loudly if the live keys aren't set (or look like test keys) so charges aren't
// silently mock/test-mode in production.
if (process.env.RAZORPAY_SUBSCRIPTIONS_ENABLED !== 'false') {
  if (!razorpay) {
    log.warn('SUBS', 'RAZORPAY_SUBSCRIPTIONS_ENABLED but no keys — subscriptions run in MOCK mode');
  } else if (RAZORPAY_KEY_ID.startsWith('rzp_test')) {
    log.warn('SUBS', 'subscriptions enabled with TEST keys — no real charges will occur');
  }
}

// New pricing. `pillars` drives which subscription flags a plan activates
// (Aura++ is a computed status — DECISIONS.md Night-2 #3).
const PLANS = {
  seeker: {
    amount: 79900,     // ₹799 in paise
    label: 'The Seeker Plan',
    period: 'monthly',
    display: '₹799/month',
    description: 'Daily Orator Protocol + Weekly Evolution Reports + Unlimited Consultant',
    pillars: ['orator'],
  },
  lookmaxxing: {
    amount: 149900,    // ₹1,499 in paise
    label: 'Lookmaxxing',
    period: 'monthly',
    display: '₹1,499/month',
    description: 'Daily mirror + personalised protocol + hair tracker + weekly reveal',
    pillars: ['lookmaxxing'],
  },
  auraplus: {
    amount: 199900,    // ₹1,999 in paise — bundle, saves ₹299 vs separate
    label: 'Aura++',
    period: 'monthly',
    display: '₹1,999/month',
    description: 'Both pillars — The Orator Protocol and Lookmaxxing. The combined self.',
    pillars: ['orator', 'lookmaxxing'],
  },
  // Legacy key retained for backward compatibility with older links.
  sovereign: {
    amount: 149900,
    label: 'The Sovereign Plan',
    period: 'monthly',
    display: '₹1,499/month',
    description: 'All three pillars + Personal Consultant session + Sovereign rank fast-track',
    pillars: ['orator'],
  },
  // ── Lookmaxing Aura Reading funnel — ₹99/month recurring ──────────────────
  // Separate from the ₹1,499 lookmaxxing plan (PWA daily mirror + reveal).
  // This plan is the audit-funnel entry: free reading → ₹99/month unlock.
  // The ₹1,499 plan is preserved unchanged for backward compat + existing tests.
  // LEGACY: retained for existing subscribers. No new surfaces offer this plan.
  lookmax99: {
    amount: 9900,       // ₹99 in paise
    label: 'Lookmaxxing',
    period: 'monthly',
    display: '₹99/month',
    description: 'Full Aura Reading + daily Mirror protocol + monthly re-audit',
    pillars: ['lookmaxxing'],
  },
  // ── Lookmaxing Aura Reading funnel — ₹499/month recurring (founder, 2026-06-15) ─
  // New plan replacing lookmax99 at the ₹499 price point. lookmax99 retained for
  // existing subscribers (Razorpay plans are immutable). All new checkouts use this.
  lookmax499: {
    amount: 49900,      // ₹499 in paise
    label: 'Lookmaxxing',
    period: 'monthly',
    display: '₹499/month',
    description: 'Full Aura Reading + daily Mirror protocol + monthly re-audit',
    pillars: ['lookmaxxing'],
  },
};

/** Pillars a plan activates. Unknown plans → []. */
function pillarsForPlan(planKey) {
  return (PLANS[planKey] && PLANS[planKey].pillars) || [];
}

/**
 * Resolve the cheapest correct plan for a set of pillars. Choosing both pillars
 * at checkout yields the Aura++ bundle (₹1,999) rather than the sum (₹2,298).
 * @param {string[]} pillars
 * @returns {string|null} plan key
 */
function resolvePlanForPillars(pillars = []) {
  const set = new Set(pillars);
  if (set.has('orator') && set.has('lookmaxxing')) return 'auraplus';
  // Lookmaxxing alone is ₹99/mo — the only Lookmaxxing price (founder, 2026-06-07).
  // Resolve to the lookmax99 plan; the legacy ₹1,499 `lookmaxxing` plan is retained
  // only for backward-compat + tests and is no longer offered on any surface.
  if (set.has('lookmaxxing')) return 'lookmax99';
  if (set.has('orator')) return 'seeker';
  return null;
}

/**
 * Create a Razorpay order.
 * Retries on transient/5xx/429 only.  A duplicate order is harmless — it goes
 * unused if the customer never opens it.  4xx errors (bad request / auth /
 * validation) fail fast with no retry.
 */
async function createOrder(planKey, phone, name) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  // Use the injected test instance if set, otherwise the module-level one.
  const rp = _razorpayOverride !== undefined ? _razorpayOverride : razorpay;

  if (!rp) {
    // Mock mode
    return {
      id: `order_mock_${Date.now()}`,
      amount: plan.amount,
      currency: 'INR',
      receipt: `mc_${planKey}_${Date.now()}`,
      notes: { phone, name, plan: planKey },
      mock: true,
    };
  }

  return withRetry(
    () => rp.orders.create({
      amount: plan.amount,
      currency: 'INR',
      receipt: `mc_${planKey}_${Date.now()}`,
      notes: { phone, name, plan: planKey },
    }),
    RAZORPAY_RETRY_OPTS
  );
}

/**
 * Verify a Razorpay payment signature.
 */
function verifyPayment(orderId, paymentId, signature) {
  if (!RAZORPAY_KEY_SECRET) return false;

  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
}

/**
 * Verify a Razorpay subscription checkout callback signature.
 * Razorpay signs HMAC-SHA256(`${paymentId}|${subscriptionId}`, KEY_SECRET).
 * Returns false when the secret/params are missing — never trust unverified.
 * @param {string} paymentId razorpay_payment_id
 * @param {string} subscriptionId razorpay_subscription_id
 * @param {string} signature razorpay_signature
 * @returns {boolean}
 */
function verifySubscriptionPayment(paymentId, subscriptionId, signature) {
  if (!RAZORPAY_KEY_SECRET || !paymentId || !subscriptionId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify a Razorpay webhook signature over the RAW request body.
 * Returns false when the secret is unset or the signature is missing — we
 * never accept an unverified webhook that mutates user/subscription state.
 * @param {Buffer|string} rawBody exact bytes Razorpay signed
 * @param {string} signature value of the x-razorpay-signature header
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!RAZORPAY_WEBHOOK_SECRET || !signature) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Generate a payment link for WhatsApp (Razorpay Payment Link API).
 * Retries on transient/5xx/429.  Falls back to the legacy upgrade URL on any
 * final failure (existing behaviour preserved).
 */
async function createPaymentLink(planKey, phone, name) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const rp = _razorpayOverride !== undefined ? _razorpayOverride : razorpay;

  if (!rp) {
    return `${BASE_URL}/upgrade?plan=${planKey}&phone=${phone}`;
  }

  try {
    const link = await withRetry(
      () => rp.paymentLink.create({
        amount: plan.amount,
        currency: 'INR',
        description: plan.description,
        customer: {
          name: name,
          contact: '+' + phone,
        },
        notify: { sms: true, email: false },
        callback_url: `${BASE_URL}/upgrade?status=success&plan=${planKey}`,
        callback_method: 'get',
        notes: { phone, name, plan: planKey },
      }),
      RAZORPAY_RETRY_OPTS
    );
    return link.short_url;
  } catch (err) {
    log.error('LINK', `Payment link error: ${err.message}`);
    return `${BASE_URL}/upgrade?plan=${planKey}&phone=${phone}`;
  }
}

// ── Subscriptions (P4.2) ──
const fs = require('fs');
const path = require('path');
const PLAN_CACHE_FILE =
  process.env.RAZORPAY_PLANS_FILE_PATH || path.join(__dirname, '..', 'data', 'razorpay-plans.json');

function loadPlanCache() {
  try {
    return JSON.parse(fs.readFileSync(PLAN_CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function savePlanCache(cache) {
  try {
    fs.mkdirSync(path.dirname(PLAN_CACHE_FILE), { recursive: true });
    fs.writeFileSync(PLAN_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    log.warn('PLANCACHE', `could not persist plan cache: ${err.message}`);
  }
}

/**
 * Create (once) or fetch a cached Razorpay Plan id for a plan key. In mock mode
 * (no live keys) returns a deterministic mock id so the flow is testable.
 * Retries on transient/5xx/429 — a duplicate plan.create is harmless because
 * the cache hit on the second call prevents duplicate plans in Razorpay.
 * @param {string} planKey
 * @returns {Promise<string>} razorpay plan id
 */
async function createOrFetchPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  // Use the in-memory plan-cache override when set (tests), else fall through
  // to the filesystem-backed loadPlanCache.
  const useMemCache = _planCacheOverride !== undefined;
  const cache = useMemCache ? { ..._planCacheOverride } : loadPlanCache();
  if (cache[planKey]) return cache[planKey];

  const rp = _razorpayOverride !== undefined ? _razorpayOverride : razorpay;

  if (!rp) {
    const mockId = `plan_mock_${planKey}`;
    cache[planKey] = mockId;
    if (useMemCache) { _planCacheOverride = cache; } else { savePlanCache(cache); }
    return mockId;
  }

  const created = await withRetry(
    () => rp.plans.create({
      period: 'monthly',
      interval: 1,
      item: { name: plan.label, amount: plan.amount, currency: 'INR', description: plan.description },
      notes: { planKey },
    }),
    RAZORPAY_RETRY_OPTS
  );
  cache[planKey] = created.id;
  if (useMemCache) { _planCacheOverride = cache; } else { savePlanCache(cache); }
  log.info('PLAN', `created Razorpay plan ${created.id} for ${planKey}`);
  return created.id;
}

/**
 * Create a recurring subscription for a plan. Returns the checkout short_url.
 *
 * @param {string} planKey
 * @param {{ phone: string, name?: string, email?: string }} customer
 * @param {object} [extraNotes={}] — merged into Razorpay notes (e.g. { userId, auditId, source })
 * @returns {Promise<{ id: string, short_url: string, mock?: boolean }>}
 */
async function createSubscription(planKey, customer = {}, extraNotes = {}) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);
  const planId = await createOrFetchPlan(planKey);

  const notes = {
    phone: customer.phone || '',
    name: customer.name || '',
    email: customer.email || '',
    plan: planKey,
    pillars: pillarsForPlan(planKey).join(','),
    // merge caller-supplied extras last so they can override defaults if needed
    ...extraNotes,
  };

  // Use the injected test instance if set, otherwise the module-level one.
  const rp = _razorpayOverride !== undefined ? _razorpayOverride : razorpay;

  // Optional free-trial: if LOOKMAX_TRIAL_DAYS > 0 and live keys are present,
  // delay the first charge by that many days (card on file, charge later).
  const trialDays = parseInt(process.env.LOOKMAX_TRIAL_DAYS || '0', 10);

  if (!rp) {
    return {
      id: `sub_mock_${planKey}_${Date.now()}`,
      short_url: `${BASE_URL}/upgrade?status=success&plan=${planKey}&phone=${customer.phone || ''}`,
      mock: true,
    };
  }

  const subParams = {
    plan_id: planId,
    total_count: 12, // 12 monthly cycles
    customer_notify: 1,
    notes,
  };

  // Apply start_at delay only when live keys are set (trialDays > 0 in test mode
  // is a no-op to avoid polluting test subscriptions with future timestamps).
  if (trialDays > 0 && RAZORPAY_KEY_ID && !RAZORPAY_KEY_ID.startsWith('rzp_test')) {
    subParams.start_at = Math.floor(Date.now() / 1000) + trialDays * 86400;
    log.info('SUBS', `trial start_at set: ${trialDays}d for plan ${planKey}`);
  }

  const sub = await withRetry(
    () => rp.subscriptions.create(subParams),
    RAZORPAY_RETRY_OPTS
  );
  return { id: sub.id, short_url: sub.short_url };
}

// ── USD display helper ─────────────────────────────────────────────────────────
// Converts INR paise to a USD display string at a FIXED rate.
// The charge stays INR — this is a display-only conversion for international
// visitors. Rate is configurable via USD_PER_INR_RATE env (units: USD per INR,
// e.g. 0.012 means 1 INR = $0.012). Default: 1/83.3 ≈ 0.01200 so that
// 49900 paise → ₹499 → ~$5.99. Minimum display value: $0.99.
function inrPaiseToUsd(paise) {
  const inrPerUsd = parseFloat(process.env.USD_PER_INR_RATE
    ? String(1 / parseFloat(process.env.USD_PER_INR_RATE))
    : '83.3');
  const usd = (paise / 100) / inrPerUsd;
  const rounded = Math.max(0.99, Math.round(usd * 100) / 100);
  return '$' + rounded.toFixed(2);
}

// Test seams — not for production use.
/** Inject a mock Razorpay SDK instance (pass null to simulate no-keys mode). */
function __setRazorpayInstance(instance) {
  _razorpayOverride = instance;
}
/** Clear the in-memory plan cache override so createOrFetchPlan uses an empty map. */
function __clearPlanCache() {
  _planCacheOverride = {};
}

/** Restore the real filesystem plan-cache (call after a test that used __clearPlanCache). */
function __resetPlanCache() {
  _planCacheOverride = undefined;
}

// In-memory plan cache override for tests (avoids touching the filesystem).
// `undefined` = not active (use filesystem). `{}` or populated = use this map.
let _planCacheOverride;

module.exports = {
  PLANS,
  pillarsForPlan,
  resolvePlanForPillars,
  createOrder,
  verifyPayment,
  verifySubscriptionPayment,
  verifyWebhookSignature,
  createPaymentLink,
  createOrFetchPlan,
  createSubscription,
  inrPaiseToUsd,
  subscriptionsEnabled: process.env.RAZORPAY_SUBSCRIPTIONS_ENABLED !== 'false',
  razorpayKeyId: RAZORPAY_KEY_ID,
  // Test seams
  __setRazorpayInstance,
  __clearPlanCache,
  __resetPlanCache,
};
