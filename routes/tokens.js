/**
 * routes/tokens.js — token/credits for the paid AI image tools.
 * Mounted at /api/lookmax/tokens. Auth via requireLookmaxAuth.
 *
 * Packs are one-time purchases (not the ₹99/mo subscription). In test/bypass mode
 * (no live rzp_live_ keys, or PAYMENT_BYPASS=true) a purchase credits instantly so
 * the studio is usable before go-live; with live keys it returns a Razorpay order
 * and the /api/payment webhook credits on capture. Never bypasses real live keys.
 */
const express = require('express');
const { requireLookmaxAuth } = require('../lib/lookmax-auth');
const User = require('../models/User');
const { createLogger } = require('../lib/log');
const events = require('../services/events');

const log = createLogger('TOKENS');
const router = express.Router();

// Founder-set pricing: ₹499 = 50 tokens (~₹10/token). Ladder of packs.
const PACKS = {
  starter: { tokens: 50,  amount: 49900, label: '50 tokens',  inr: '₹499' },
  mini:    { tokens: 25,  amount: 29900, label: '25 tokens',  inr: '₹299' },
  value:   { tokens: 120, amount: 99900, label: '120 tokens', inr: '₹999' },
};

// Token cost per AI tool (spent when the tool runs).
const TOOL_COSTS = {
  customStudio: 1, procedurePreview: 1, hairstylePack: 2,
  timeMachine: 2, glowUp: 5, fullAnalysis: 8,
};

function paymentBypass() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (keyId.startsWith('rzp_live_')) return false;
  if (process.env.PAYMENT_BYPASS === 'false') return false;
  return true;
}

// ─── GET / — balance + catalogue ───
router.get('/', requireLookmaxAuth, (req, res) => {
  res.json({
    tokens: req.lookmaxUser.tokens || 0,
    packs: PACKS,
    toolCosts: TOOL_COSTS,
  });
});

// ─── POST /buy { pack } ───
router.post('/buy', requireLookmaxAuth, async (req, res) => {
  const packKey = (req.body && req.body.pack) || 'starter';
  const pack = PACKS[packKey];
  if (!pack) return res.status(400).json({ error: 'unknown pack' });
  const user = req.lookmaxUser;

  // Test/bypass: credit immediately so the studio is usable pre-go-live.
  if (paymentBypass()) {
    const updated = await User.addTokens(user.phone, pack.tokens);
    events.trackAnonymous('tokens_purchased', { pack: packKey, tokens: pack.tokens, bypass: true }, user.token).catch(() => {});
    log.info('BUY', `bypass credit ${pack.tokens} tokens → ${user.token.slice(0, 8)}`);
    return res.json({ credited: true, testMode: true, tokens: (updated && updated.tokens) || pack.tokens, added: pack.tokens });
  }

  // Live: create a one-time Razorpay order; the webhook credits on capture.
  try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const Razorpay = require('razorpay'); // eslint-disable-line global-require
    const rz = new Razorpay({ key_id, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const order = await rz.orders.create({
      amount: pack.amount, currency: 'INR',
      receipt: `mc_tok_${packKey}_${Date.now()}`,
      notes: { kind: 'tokens', pack: packKey, tokens: String(pack.tokens), userId: user.token, phone: user.phone },
    });
    events.trackAnonymous('tokens_purchase_initiated', { pack: packKey }, user.token).catch(() => {});
    return res.json({ orderId: order.id, amount: order.amount, currency: 'INR', keyId: key_id, pack: packKey, testMode: false });
  } catch (err) {
    log.error('BUY', `order create failed: ${err.message}`);
    return res.status(500).json({ error: 'Could not start the purchase. Try again in a moment.' });
  }
});

module.exports = router;
module.exports.PACKS = PACKS;
module.exports.TOOL_COSTS = TOOL_COSTS;
