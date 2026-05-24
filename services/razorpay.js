/**
 * ═══════════════════════════════════════════════════════════════════
 * RAZORPAY SERVICE — Payment handling
 * ═══════════════════════════════════════════════════════════════════
 */

const Razorpay = require('razorpay');
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  console.log(`[${new Date().toISOString()}] [RAZORPAY] Initialised`);
}

// New pricing
const PLANS = {
  seeker: {
    amount: 79900,     // ₹799 in paise
    label: 'The Seeker Plan',
    period: 'monthly',
    display: '₹799/month',
    description: 'Daily Orator Protocol + Weekly Evolution Reports + Unlimited Consultant',
  },
  sovereign: {
    amount: 149900,    // ₹1,499 in paise
    label: 'The Sovereign Plan',
    period: 'monthly',
    display: '₹1,499/month',
    description: 'All three pillars + Personal Consultant session + Sovereign rank fast-track',
  },
};

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
 * Verify Razorpay webhook signature.
 */
function verifyWebhookSignature(body, signature) {
  if (!RAZORPAY_WEBHOOK_SECRET) return true; // Skip if no secret set

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  return expectedSignature === signature;
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
    console.log(`[RAZORPAY] Payment link error: ${err.message}`);
    return `${BASE_URL}/upgrade?plan=${planKey}&phone=${phone}`;
  }
}

module.exports = {
  PLANS,
  createOrder,
  verifyPayment,
  verifyWebhookSignature,
  createPaymentLink,
  razorpayKeyId: RAZORPAY_KEY_ID,
};
