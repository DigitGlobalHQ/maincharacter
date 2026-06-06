/**
 * ═══════════════════════════════════════════════════════════════════
 * RAZORPAY SERVICE — Payment handling
 * ═══════════════════════════════════════════════════════════════════
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');

const log = createLogger('RAZORPAY');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  log.info('INIT', 'Initialised');
}

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
  lookmax99: {
    amount: 9900,       // ₹99 in paise
    label: 'Lookmaxxing',
    period: 'monthly',
    display: '₹99/month',
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
  if (set.has('lookmaxxing')) return 'lookmaxxing';
  if (set.has('orator')) return 'seeker';
  return null;
}

/**
 * Create a Razorpay order.
 */
async function createOrder(planKey, phone, name) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  if (!razorpay) {
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

  const order = await razorpay.orders.create({
    amount: plan.amount,
    currency: 'INR',
    receipt: `mc_${planKey}_${Date.now()}`,
    notes: { phone, name, plan: planKey },
  });

  return order;
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
 */
async function createPaymentLink(planKey, phone, name) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  if (!razorpay) {
    return `${BASE_URL}/upgrade?plan=${planKey}&phone=${phone}`;
  }

  try {
    const link = await razorpay.paymentLink.create({
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
    });
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
 * @param {string} planKey
 * @returns {Promise<string>} razorpay plan id
 */
async function createOrFetchPlan(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const cache = loadPlanCache();
  if (cache[planKey]) return cache[planKey];

  if (!razorpay) {
    const mockId = `plan_mock_${planKey}`;
    cache[planKey] = mockId;
    savePlanCache(cache);
    return mockId;
  }

  const created = await razorpay.plans.create({
    period: 'monthly',
    interval: 1,
    item: { name: plan.label, amount: plan.amount, currency: 'INR', description: plan.description },
    notes: { planKey },
  });
  cache[planKey] = created.id;
  savePlanCache(cache);
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

  // Optional free-trial: if LOOKMAX_TRIAL_DAYS > 0 and live keys are present,
  // delay the first charge by that many days (card on file, charge later).
  const trialDays = parseInt(process.env.LOOKMAX_TRIAL_DAYS || '0', 10);

  if (!razorpay) {
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

  const sub = await razorpay.subscriptions.create(subParams);
  return { id: sub.id, short_url: sub.short_url };
}

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
  subscriptionsEnabled: process.env.RAZORPAY_SUBSCRIPTIONS_ENABLED !== 'false',
  razorpayKeyId: RAZORPAY_KEY_ID,
};
