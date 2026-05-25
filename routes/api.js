/**
 * ═══════════════════════════════════════════════════════════════════
 * API ROUTES — Enrollment, Webhook, Waitlist
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const wati = require('../services/wati');
const gemini = require('../services/gemini');
const razorpay = require('../services/razorpay');
const { DAYS, buildMorningMessage, buildEveningMessage, buildEvolutionReport } = require('../data/orator-content');

const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';
const WHATSAPP_NUMBER = '919958533994'; // Wati Business number

let _log;
function log(tag, msg) {
  if (!_log) _log = require('../lib/log').createLogger('API');
  if (/error|fail/i.test(tag)) return _log.error(tag, msg);
  if (/warn/i.test(tag)) return _log.warn(tag, msg);
  return _log.info(tag, msg);
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/enroll — New user enrollment
// ═══════════════════════════════════════════════════════════════════

const enrollValidators = [
  body('name').isString().trim().isLength({ min: 1, max: 100 }),
  body('phone')
    .customSanitizer((p) => String(p || '').replace(/\D/g, ''))
    .matches(/^\d{10,13}$/),
  body('preferredTime').optional({ values: 'falsy' }).matches(/^\d{2}:\d{2}$/),
  body('pillar').optional({ values: 'falsy' }).isIn(['orator', 'aesthetic', 'sage']),
];

router.post('/enroll', enrollValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }
    const { name, phone, preferredTime, pillar } = req.body;

    // ── Idempotency (P1.6): if this phone already enrolled, return success
    // WITHOUT re-sending the welcome message (prevents duplicate WhatsApps). ──
    const existing = User.getUserByPhone(phone.trim());
    if (existing) {
      log('ENROLL', `Idempotent: ${existing.phone} already enrolled (no re-send)`);
      return res.json({
        success: true,
        userId: existing.token,
        alreadyEnrolled: true,
        redirectTo: `/welcome?name=${encodeURIComponent(existing.name)}&phone=${encodeURIComponent(existing.phone)}&time=${encodeURIComponent(existing.preferredTime)}`,
      });
    }

    // Create user
    const user = User.createUser({
      name: name.trim(),
      phone: phone.trim(),
      pillar: pillar || 'orator',
      preferredTime: preferredTime || '08:00',
    });

    log('ENROLL', `${user.name} (${user.phone}) enrolled in ${user.pillar}`);

    // Send welcome WhatsApp message
    const welcomeMsg = `◆ MainCharacter\n\nWelcome, ${user.name}.\n\nI'm The Consultant.\n\nYour Orator Protocol is confirmed.\n\nReply *START NOW* to begin your Day 1 immediately.\nOr sit with this: think about the last time you spoke in a room that mattered. What happened?\n\nWhen you're ready — reply START NOW.`;

    wati.sendMessageSafe(user.phone, welcomeMsg).catch(err => {
      log('ENROLL-WATI', `Failed to send welcome: ${err.message}`);
    });

    // Notify admin
    if (ADMIN_PHONE) {
      wati.sendMessageSafe(ADMIN_PHONE, `◆ NEW ENROLLMENT\n\nName: ${user.name}\nPhone: ${user.phone}\nPillar: ${user.pillar}\nPreferred Time: ${user.preferredTime}\nToken: ${user.token}`).catch(() => {});
    }

    res.json({ success: true, userId: user.token, redirectTo: `/welcome?name=${encodeURIComponent(user.name)}&phone=${encodeURIComponent(user.phone)}&time=${encodeURIComponent(user.preferredTime)}` });
  } catch (err) {
    log('ERROR', `Enrollment failed: ${err.message}`);
    res.status(500).json({ error: 'Enrollment failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/webhook/wati — Incoming WhatsApp messages
// ═══════════════════════════════════════════════════════════════════

router.post('/webhook/wati', (req, res) => {
  res.json({ status: 'received' }); // Respond to Wati immediately
  processWatiWebhook(req.body).catch((err) =>
    log('ERROR', `Webhook handler error: ${err.message}`)
  );
});

/**
 * Process an incoming Wati webhook payload. Called directly (in-process) by
 * both /api/webhook/wati and the legacy /webhook shim — no localhost re-POST.
 * Never throws; logs and returns.
 * @param {object} body raw Wati webhook body
 */
async function processWatiWebhook(body) {
  try {
    body = body || {};

    // ── GATE 1: Ignore bot's own outgoing messages ──
    if (body.owner === true || body.owner === 'true') {
      return;
    }

    // ── GATE 2: Ignore delivery/read/sent status events ──
    const eventType = (body.eventType || '').toLowerCase();
    if (eventType.includes('delivered') || eventType.includes('read') ||
        eventType.includes('sent') || eventType.includes('replied') ||
        eventType.includes('failed') || eventType.includes('payment') ||
        eventType.includes('clicked') || eventType.includes('status')) {
      return;
    }

    // ── GATE 3: Ignore status string updates ──
    const status = (body.statusString || '').toUpperCase();
    if (status === 'SENT' || status === 'DELIVERED' || status === 'READ' || status === 'REPLIED') {
      return;
    }

    // ── Extract fields ──
    const phone = (body.waId || body.from || body.senderPhoneNumber || '').replace(/[+\s\-]/g, '');
    const text = (body.text || body.message || body.messageText || '').trim();
    const senderName = body.senderName || body.pushName || body.contactName || '';

    // ── GATE 4: Must have phone AND non-empty text ──
    if (!phone || !text) {
      return;
    }

    log('WEBHOOK', `← ${phone} (${senderName}): "${text.substring(0, 100)}"`);

    const user = User.getUserByPhone(phone);

    // Unknown user — notify admin only
    if (!user) {
      log('WEBHOOK', `Unknown user: ${phone}`);
      if (ADMIN_PHONE) {
        wati.sendMessageSafe(ADMIN_PHONE, `◆ UNKNOWN USER\n\nPhone: ${phone}\nName: ${senderName}\nMessage: ${text.substring(0, 200)}`).catch(() => {});
      }
      return;
    }

    // Route the message
    const msg = text.toLowerCase().trim();

    if (msg === 'start now' || msg === 'start' || msg === 'begin') return await handleStartNow(user);
    if (msg === 'continue') return await handleContinue(user);
    if (msg === 'stop') return await handleStop(user);
    if (msg === 'return') return await handleReturn(user);
    if (msg === 'pay' || msg === 'subscribe') return await handlePayment(user);

    // Day-based routing
    if (user.awaitingResponse && user.day >= 1 && user.day <= 7) {
      return await handleDailyResponse(user, text, 'text');
    }

    // Default response
    log('WEBHOOK', `Unhandled message from ${user.name}: "${msg}"`);

    if (ADMIN_PHONE && phone !== ADMIN_PHONE) {
      wati.sendMessageSafe(ADMIN_PHONE, `◆ USER MESSAGE\n\nFrom: ${user.name} (${user.phone})\nDay: ${user.day}\nMessage: ${text.substring(0, 300)}`).catch(() => {});
    }

    // If user hasn't started yet, prompt them
    if (user.day === 0) {
      await wati.sendMessageSafe(user.phone, `Reply *START NOW* to begin your Day 1 protocol. ◆`);
    } else {
      const defaultReply = `The Consultant is preparing your next message. It arrives at ${user.preferredTime}. ◆`;
      await wati.sendMessageSafe(user.phone, defaultReply);
    }

  } catch (err) {
    log('ERROR', `Webhook handler error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Handle START NOW command — immediately begin Day 1.
 */
async function handleStartNow(user) {
  log('CMD', `START NOW from ${user.name} (current day: ${user.day})`);

  // If user already started, don't restart
  if (user.day >= 1) {
    const msg = user.awaitingResponse
      ? `You're on Day ${user.day}, ${user.name}. Reply with your response to the current challenge. ◆`
      : `Your Day ${user.day + 1 <= 7 ? user.day + 1 : 7} protocol arrives at ${user.preferredTime}. ◆`;
    return await wati.sendMessageSafe(user.phone, msg);
  }

  // Advance to Day 1
  User.updateUser(user.phone, {
    day: 1,
    awaitingResponse: true,
    status: 'active',
  });

  // Send Day 1 morning message
  const morningMsg = buildMorningMessage(1, user.name);
  await wati.sendMessageSafe(user.phone, morningMsg);

  log('CMD', `${user.name} started Day 1 immediately`);
}

/**
 * Handle daily protocol response (user replied to morning message).
 */
async function handleDailyResponse(user, text, msgType) {
  const day = user.day;
  log('DAILY', `Processing Day ${day} response from ${user.name}`);

  // Get day content
  const dayContent = DAYS[day];
  if (!dayContent) return;

  // Score with Gemini
  const previousScores = user.scores.find(s => s.day === 1) || null;
  const result = await gemini.scoreUserResponse(
    user.name,
    day,
    dayContent.words,
    text,
    previousScores
  );

  // Save score
  User.addScore(user.phone, {
    day,
    fluency: result.scores.fluency,
    confidenceTone: result.scores.confidenceTone,
    fillerFrequency: result.scores.fillerFrequency,
    vocabularyRange: result.scores.vocabularyRange,
    structure: result.scores.structure,
  });

  // Save chronicle
  User.addChronicle(user.phone, {
    day,
    prompt: dayContent.prompt,
    userResponse: text,
    consultantResponse: result.consultantMessage,
  });

  // Mark words used
  if (result.wordsUsed && result.wordsUsed.length > 0) {
    result.wordsUsed.forEach(word => {
      User.masterWord(user.phone, word);
    });
  }

  // Update user state
  User.updateUser(user.phone, {
    awaitingResponse: false,
  });

  // Build and send evening message
  const updatedUser = User.getUserByPhone(user.phone);
  const eveningMsg = buildEveningMessage(day, user.name, result.scores, result.consultantMessage, previousScores);
  await wati.sendMessageSafe(user.phone, eveningMsg);

  // Day 7 — send Evolution Report
  if (day === 7) {
    setTimeout(async () => {
      try {
        const finalUser = User.getUserByPhone(user.phone);
        const assessment = await gemini.generateEvolutionAssessment(finalUser);
        const report = buildEvolutionReport(finalUser, assessment);
        await wati.sendMessageSafe(user.phone, report);

        User.updateUser(user.phone, {
          trialComplete: true,
          status: 'completed',
          rank: 'seeker',
        });

        log('REPORT', `Evolution Report sent to ${user.name}`);
      } catch (err) {
        log('ERROR', `Evolution Report failed: ${err.message}`);
      }
    }, 3000); // 3 second delay for dramatic effect
  }

  log('DAILY', `Day ${day} scored and responded for ${user.name}`);
}

/**
 * Handle CONTINUE command — send payment link.
 */
async function handleContinue(user) {
  log('CMD', `CONTINUE from ${user.name}`);

  try {
    const paymentUrl = await razorpay.createPaymentLink('seeker', user.phone, user.name);
    
    const msg = `◆ The Chamber Remains Open.\n\nYour subscription begins now.\n\n${paymentUrl}\n\nAfter payment, your Day 8 protocol arrives automatically.\nNothing changes except the depth.\n\n◆ MainCharacter`;
    
    await wati.sendMessageSafe(user.phone, msg);
  } catch (err) {
    log('ERROR', `CONTINUE failed for ${user.name}: ${err.message}`);
    await wati.sendMessageSafe(user.phone, `◆ Something went wrong. Please visit:\n${BASE_URL}/upgrade\n\n◆ MainCharacter`);
  }
}

/**
 * Handle STOP command — graceful exit.
 */
async function handleStop(user) {
  log('CMD', `STOP from ${user.name}`);

  User.updateUser(user.phone, { status: 'paused' });

  const msg = `◆ Noted, ${user.name}.\n\nThe Seeker returns when the Seeker is ready.\nYour dashboard stays live. Your lexicon stays yours.\nYour rank holds.\n\nWhen you're ready — reply RETURN and the protocol resumes.\n\n◆ MainCharacter`;
  
  await wati.sendMessageSafe(user.phone, msg);
}

/**
 * Handle RETURN command — resume protocol.
 */
async function handleReturn(user) {
  log('CMD', `RETURN from ${user.name}`);

  User.updateUser(user.phone, { status: 'active' });

  const msg = `◆ Welcome back, ${user.name}.\n\nYour protocol resumes. The Consultant remembers where you left off.\n\nYour next message arrives tomorrow at ${user.preferredTime}.\n\n◆ MainCharacter`;
  
  await wati.sendMessageSafe(user.phone, msg);
}

/**
 * Handle PAY command.
 */
async function handlePayment(user) {
  return handleContinue(user);
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/waitlist — Coming Soon waitlist
// ═══════════════════════════════════════════════════════════════════

router.post('/waitlist', (req, res) => {
  const { phone, pillar } = req.body;
  if (!phone || !pillar) {
    return res.status(400).json({ error: 'Phone and pillar are required.' });
  }

  const added = User.addToWaitlist(phone, pillar);
  log('WAITLIST', `${phone} joined ${pillar} waitlist (new: ${added})`);

  res.json({ success: true, added });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/user/:token — User data for dashboard
// ═══════════════════════════════════════════════════════════════════

router.get('/user/:token', (req, res) => {
  const user = User.getUserByToken(req.params.token);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Strip sensitive data
  const { phone, razorpayCustomerId, ...safe } = user;
  res.json(safe);
});

// ═══════════════════════════════════════════════════════════════════
// PAYMENT ROUTES
// ═══════════════════════════════════════════════════════════════════

router.post('/payment/create-order', async (req, res) => {
  try {
    const { plan, phone, name } = req.body;
    const order = await razorpay.createOrder(plan || 'seeker', phone, name);
    res.json({ success: true, order, keyId: razorpay.razorpayKeyId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment/verify', (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  const valid = razorpay.verifyPayment(orderId, paymentId, signature);
  
  if (valid) {
    // Update user status if phone is in notes
    log('PAYMENT', `Verified payment ${paymentId}`);
    res.json({ success: true, verified: true });
  } else {
    res.status(400).json({ success: false, error: 'Invalid signature' });
  }
});

router.get('/payment/plans', (req, res) => {
  res.json(razorpay.PLANS);
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/payment/webhook — Razorpay → user upgrade (P1.2 / P2.2)
// ═══════════════════════════════════════════════════════════════════

const PAID_EVENTS = [
  'payment_link.paid',
  'payment.captured',
  'subscription.activated',
  'subscription.charged',
];
const CANCEL_EVENTS = ['subscription.cancelled', 'subscription.halted'];

/** Pull the notes ({phone,name,plan}) off whichever entity the event carries. */
function extractNotes(event) {
  const p = (event && event.payload) || {};
  const entity =
    (p.payment_link && p.payment_link.entity) ||
    (p.payment && p.payment.entity) ||
    (p.subscription && p.subscription.entity) ||
    {};
  return entity.notes || {};
}

/**
 * Apply a verified Razorpay event to the user record. Exported for tests.
 * @param {object} event parsed Razorpay webhook body
 */
async function processPaymentEvent(event) {
  const evt = event && event.event;
  const notes = extractNotes(event);
  const phone = notes.phone;
  if (!phone) {
    log('PAYMENT', `No phone in notes for event ${evt}`);
    return { handled: false };
  }
  const user = User.getUserByPhone(phone);
  if (!user) {
    log('PAYMENT', `Unknown user ${phone} for event ${evt}`);
    return { handled: false };
  }

  if (PAID_EVENTS.includes(evt)) {
    const updates = { subscriptionStatus: 'active' };
    if (!user.subscribedAt) updates.subscribedAt = new Date().toISOString();
    if (user.rank === 'unawakened') updates.rank = 'seeker';
    User.updateUser(phone, updates);
    log('PAYMENT', `${user.name} (${phone}) → active via ${evt}`);
    // Copy supplied by founder in the autopilot brief (not invented).
    await wati.sendMessageSafe(
      phone,
      `◆ The Chamber is open, ${user.name}.\n\nDay 8 arrives tomorrow at your preferred time.\n\n◆ MainCharacter`
    );
    return { handled: true, status: 'active' };
  }

  if (CANCEL_EVENTS.includes(evt)) {
    User.updateUser(phone, { subscriptionStatus: 'cancelled' });
    log('PAYMENT', `${user.name} (${phone}) → cancelled via ${evt}`);
    await wati.sendMessageSafe(
      phone,
      `◆ Your protocol pauses, ${user.name}.\n\nYour lexicon and rank remain yours. Reply RETURN when ready.\n\n◆ MainCharacter`
    );
    return { handled: true, status: 'cancelled' };
  }

  log('PAYMENT', `Ignored event ${evt}`);
  return { handled: false };
}

router.post('/payment/webhook', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (!razorpay.verifyWebhookSignature(raw, signature)) {
    log('PAYMENT', 'Webhook rejected — invalid signature or RAZORPAY_WEBHOOK_SECRET unset');
    return res.status(400).json({ error: 'invalid signature' });
  }
  res.json({ status: 'ok' });
  processPaymentEvent(req.body).catch((err) => log('ERROR', `Payment webhook: ${err.message}`));
});

module.exports = router;
module.exports.processWatiWebhook = processWatiWebhook;
module.exports.processPaymentEvent = processPaymentEvent;
