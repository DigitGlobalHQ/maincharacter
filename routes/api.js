/**
 * ═══════════════════════════════════════════════════════════════════
 * API ROUTES — Enrollment, Webhook, Waitlist
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const User = require('../models/User');
const EarlyAccess = require('../models/EarlyAccess');
const whatsapp = require('../services/whatsapp');
const email = require('../services/email');
const gemini = require('../services/gemini');
const razorpay = require('../services/razorpay');
const events = require('../services/events');
const admin = require('../lib/admin');
const { DAYS, buildMorningMessage, buildEveningMessage, buildEvolutionReport } = require('../data/orator-content');

const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';
const WHATSAPP_NUMBER = '919958533994'; // WhatsApp Business number (Meta Cloud API)

let _log;
function log(tag, msg) {
  if (!_log) _log = require('../lib/log').createLogger('API');
  if (/error|fail/i.test(tag)) return _log.error(tag, msg);
  if (/warn/i.test(tag)) return _log.warn(tag, msg);
  return _log.info(tag, msg);
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/events — KPI event sink (B5)
// ═══════════════════════════════════════════════════════════════════
// Dedicated in-memory rate limiter: 60 events / IP / min, sliding window.
// Silent reject (204) above limit — never 429, never disclose throttle state
// to potential scrapers. Capped FIFO at 1000 IPs mirrors the L-2 fix pattern.
const _eventsIpWindow = new Map(); // ip → [timestamps]
const EVENTS_WINDOW_MS = 60 * 1000;
const EVENTS_MAX_PER_WINDOW = 60;
const EVENTS_MAP_CAP = 1000;

function eventsRateLimit(req, res, next) {
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';
  const now = Date.now();
  const cutoff = now - EVENTS_WINDOW_MS;

  let timestamps = _eventsIpWindow.get(ip) || [];
  // Prune old timestamps outside the window
  timestamps = timestamps.filter((t) => t > cutoff);

  if (timestamps.length >= EVENTS_MAX_PER_WINDOW) {
    // Silent drop — return 204 to not disclose throttle state
    return res.sendStatus(204);
  }

  timestamps.push(now);

  // FIFO eviction: if map is at cap, remove the oldest IP entry
  if (!_eventsIpWindow.has(ip) && _eventsIpWindow.size >= EVENTS_MAP_CAP) {
    const oldestKey = _eventsIpWindow.keys().next().value;
    _eventsIpWindow.delete(oldestKey);
  }
  _eventsIpWindow.set(ip, timestamps);
  next();
}

router.post('/events', eventsRateLimit, async (req, res) => {
  const { name, props, anonId } = req.body || {};
  // Unknown event names are silently dropped (204) — never reveal the allowlist
  if (!name || !events.ALLOWED_EVENTS.has(name)) {
    return res.sendStatus(204);
  }
  // Props size guard (2 KB)
  const propsStr = JSON.stringify(props || {});
  if (propsStr.length > 2048) {
    return res.sendStatus(204);
  }
  const cleanProps = events.sanitizeProps(props || {});
  // Write fire-and-forget — never await in route handlers
  events.trackAnonymous(name, cleanProps, anonId || 'unknown')
    .catch(() => {}); // EVENTS-WRITE-FAIL already logged inside the sink
  return res.sendStatus(204);
});

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
    const existing = await User.getUserByPhone(phone.trim());
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
    const user = await User.createUser({
      name: name.trim(),
      phone: phone.trim(),
      pillar: pillar || 'orator',
      preferredTime: preferredTime || '08:00',
    });

    log('ENROLL', `${user.name} (${user.phone}) enrolled in ${user.pillar}`);

    const ADMIN_PHONE = admin.primaryAdminPhone();

    // Send welcome WhatsApp message
    const welcomeMsg = `◆ MainCharacter\n\nWelcome, ${user.name}.\n\nI'm The Consultant.\n\nYour Orator Protocol is confirmed.\n\nReply *START NOW* to begin your Day 1 immediately.\nOr sit with this: think about the last time you spoke in a room that mattered. What happened?\n\nWhen you're ready — reply START NOW.`;

    whatsapp.sendMessageSafe(user.phone, welcomeMsg).catch(err => {
      log('ENROLL-WA', `Failed to send welcome: ${err.message}`);
    });

    // Notify admin
    if (ADMIN_PHONE) {
      whatsapp.sendMessageSafe(ADMIN_PHONE, `◆ NEW ENROLLMENT\n\nName: ${user.name}\nPhone: ${user.phone}\nPillar: ${user.pillar}\nPreferred Time: ${user.preferredTime}\nToken: ${user.token}`).catch(() => {});
    }

    res.json({ success: true, userId: user.token, redirectTo: `/welcome?name=${encodeURIComponent(user.name)}&phone=${encodeURIComponent(user.phone)}&time=${encodeURIComponent(user.preferredTime)}` });
  } catch (err) {
    log('ERROR', `Enrollment failed: ${err.message}`);
    res.status(500).json({ error: 'Enrollment failed. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// WhatsApp Cloud API webhook — Meta Graph (Night-3 migration)
// ═══════════════════════════════════════════════════════════════════

// GET — Meta's verification handshake performed when the webhook is attached.
router.get('/webhook/whatsapp', async (req, res) => {
  const challenge = whatsapp.verifyWebhookChallenge(
    req.query['hub.mode'],
    req.query['hub.verify_token'],
    req.query['hub.challenge']
  );
  if (challenge !== null) {
    log('WEBHOOK', 'Meta verification handshake OK');
    return res.status(200).send(String(challenge));
  }
  log('WEBHOOK', 'Meta verification handshake failed (bad mode/token)');
  return res.sendStatus(403);
});

// POST — incoming user messages. Meta signs the raw body with x-hub-signature-256.
router.post('/webhook/whatsapp', async (req, res) => {
  const v = whatsapp.verifyWebhookSignature(req.rawBody, req.headers['x-hub-signature-256']);
  if (!v.ok) {
    log('WEBHOOK', `Rejected (${v.mode}): ${v.reason}`);
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ status: 'received' }); // Ack Meta immediately (must be <10s)
  processWhatsAppWebhook(req.body).catch((err) =>
    log('ERROR', `Webhook handler error: ${err.message}`)
  );
});

// Legacy Wati endpoint → 308 permanent redirect for 30 days so any cached Wati
// webhook config does not 404 (DECISIONS.md Night-3 #6; deletion tracked in
// BACKLOG). 308 preserves the method + body.
router.all('/webhook/wati', async (req, res) => res.redirect(308, '/api/webhook/whatsapp'));

/**
 * Extract the salient fields from an incoming webhook body. Handles Meta's
 * Cloud API shape (`entry[].changes[].value.{messages,statuses,contacts}`) and
 * falls back to a flat shape (`{ waId|from, text }`) for resilience + tests.
 * @param {object} body raw webhook body
 * @returns {{ statusOnly?: boolean, phone?: string, text?: string, senderName?: string, messageType?: string }}
 */
function parseIncomingMessage(body) {
  body = body || {};

  // ── Meta Cloud API format ──
  if (Array.isArray(body.entry)) {
    const value =
      (body.entry[0] &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value) ||
      {};
    // Status updates (sent/delivered/read) carry `statuses`, not `messages`.
    if (!value.messages || !value.messages.length) return { statusOnly: true };

    const msg = value.messages[0];
    const phone = String(msg.from || '').replace(/[+\s\-]/g, '');
    let text = '';
    if (msg.type === 'text') text = (msg.text && msg.text.body) || '';
    else if (msg.type === 'button') text = (msg.button && (msg.button.text || msg.button.payload)) || '';
    else if (msg.type === 'interactive') {
      const i = msg.interactive || {};
      text = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || '';
    }
    const senderName =
      (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || '';
    return { phone, text: String(text).trim(), senderName, messageType: msg.type };
  }

  // ── Flat fallback (legacy / tests) ──
  // Ignore echoes of our own outgoing messages + status-only payloads.
  if (body.owner === true || body.owner === 'true') return { statusOnly: true };
  const eventType = (body.eventType || '').toLowerCase();
  if (['delivered', 'read', 'sent', 'replied', 'failed', 'status'].some((e) => eventType.includes(e))) {
    return { statusOnly: true };
  }
  const phone = String(body.waId || body.from || body.senderPhoneNumber || '').replace(/[+\s\-]/g, '');
  const text = String(body.text || body.message || body.messageText || '').trim();
  const senderName = body.senderName || body.pushName || body.contactName || '';
  return { phone, text, senderName, messageType: 'text' };
}

/**
 * Process an incoming WhatsApp webhook payload. Called directly (in-process) by
 * the route handler. Never throws; logs and returns.
 * @param {object} body raw webhook body (Meta or flat shape)
 */
async function processWhatsAppWebhook(body) {
  try {
    const ADMIN_PHONE = admin.primaryAdminPhone();
    const parsed = parseIncomingMessage(body);
    if (parsed.statusOnly) return;

    const { phone, text, senderName, messageType } = parsed;

    // Must have a phone. Non-text messages (e.g. voice notes) have no text yet —
    // voice transcription is not handled (CLAUDE.md landmine #9, BACKLOG).
    if (!phone) return;
    if (!text) {
      if (messageType && messageType !== 'text') {
        log('WEBHOOK', `← ${phone} sent a ${messageType} message (no text — not yet handled)`);
        if (ADMIN_PHONE) {
          whatsapp
            .sendMessageSafe(ADMIN_PHONE, `◆ NON-TEXT MESSAGE\n\nPhone: ${phone}\nType: ${messageType}`)
            .catch(() => {});
        }
      }
      return;
    }

    log('WEBHOOK', `← ${phone} (${senderName}): "${text.substring(0, 100)}"`);

    const user = await User.getUserByPhone(phone);

    // Unknown user — notify admin only
    if (!user) {
      log('WEBHOOK', `Unknown user: ${phone}`);
      if (ADMIN_PHONE) {
        whatsapp.sendMessageSafe(ADMIN_PHONE, `◆ UNKNOWN USER\n\nPhone: ${phone}\nName: ${senderName}\nMessage: ${text.substring(0, 200)}`).catch(() => {});
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
      whatsapp.sendMessageSafe(ADMIN_PHONE, `◆ USER MESSAGE\n\nFrom: ${user.name} (${user.phone})\nDay: ${user.day}\nMessage: ${text.substring(0, 300)}`).catch(() => {});
    }

    // If user hasn't started yet, prompt them
    if (user.day === 0) {
      await whatsapp.sendMessageSafe(user.phone, `Reply *START NOW* to begin your Day 1 protocol. ◆`);
    } else {
      const defaultReply = `The Consultant is preparing your next message. It arrives at ${user.preferredTime}. ◆`;
      await whatsapp.sendMessageSafe(user.phone, defaultReply);
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
    return await whatsapp.sendMessageSafe(user.phone, msg);
  }

  // Advance to Day 1
  await User.updateUser(user.phone, {
    day: 1,
    awaitingResponse: true,
    status: 'active',
  });

  // Seed the Day-1 lexicon. The scheduler path (sendMorningMessages) does this
  // for Day N+1; START NOW must do the same for Day 1 or the user's lexicon
  // stays empty until Day 2 (Night-1 bug). Source of truth: words are forged
  // when a day's morning message is sent.
  if (DAYS[1]) {
    await User.addWordsLearned(user.phone, DAYS[1].words, 1);
  }

  // Send Day 1 morning message
  const morningMsg = buildMorningMessage(1, user.name);
  await whatsapp.sendMessageSafe(user.phone, morningMsg);

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
  await User.addScore(user.phone, {
    day,
    fluency: result.scores.fluency,
    confidenceTone: result.scores.confidenceTone,
    fillerFrequency: result.scores.fillerFrequency,
    vocabularyRange: result.scores.vocabularyRange,
    structure: result.scores.structure,
  });

  // Save chronicle
  await User.addChronicle(user.phone, {
    day,
    prompt: dayContent.prompt,
    userResponse: text,
    consultantResponse: result.consultantMessage,
  });

  // Mark words used
  if (result.wordsUsed && result.wordsUsed.length > 0) {
    for (const word of result.wordsUsed) {
      await User.masterWord(user.phone, word);
    }
  }

  // Update user state
  await User.updateUser(user.phone, {
    awaitingResponse: false,
  });

  // Build and send evening message
  const updatedUser = await User.getUserByPhone(user.phone);
  const eveningMsg = buildEveningMessage(day, user.name, result.scores, result.consultantMessage, previousScores);
  await whatsapp.sendMessageSafe(user.phone, eveningMsg);

  // Day 7 — send Evolution Report
  if (day === 7) {
    setTimeout(async () => {
      try {
        const finalUser = await User.getUserByPhone(user.phone);
        const assessment = await gemini.generateEvolutionAssessment(finalUser);
        const report = buildEvolutionReport(finalUser, assessment);
        await whatsapp.sendMessageSafe(user.phone, report);

        await User.updateUser(user.phone, {
          trialComplete: true,
          status: 'completed',
          rank: 'seeker',
        });

        // Also deliver the report by email when we have one (DRY-RUN/allowlist
        // gated; no-op without an address). The WhatsApp report remains primary.
        if (finalUser.email) {
          const assessmentText = typeof assessment === 'string' ? assessment : (assessment && assessment.summary) || '';
          email
            .sendDay7EvolutionReport({ user: { ...finalUser, rank: 'seeker' }, assessment: assessmentText })
            .catch((err) => log('ERROR', `Day-7 report email failed: ${err.message}`));
        }

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
    
    await whatsapp.sendMessageSafe(user.phone, msg);
  } catch (err) {
    log('ERROR', `CONTINUE failed for ${user.name}: ${err.message}`);
    await whatsapp.sendMessageSafe(user.phone, `◆ Something went wrong. Please visit:\n${BASE_URL}/upgrade\n\n◆ MainCharacter`);
  }
}

/**
 * Handle STOP command — graceful exit.
 */
async function handleStop(user) {
  log('CMD', `STOP from ${user.name}`);

  await User.updateUser(user.phone, { status: 'paused' });

  const msg = `◆ Noted, ${user.name}.\n\nThe Seeker returns when the Seeker is ready.\nYour dashboard stays live. Your lexicon stays yours.\nYour rank holds.\n\nWhen you're ready — reply RETURN and the protocol resumes.\n\n◆ MainCharacter`;
  
  await whatsapp.sendMessageSafe(user.phone, msg);
}

/**
 * Handle RETURN command — resume protocol.
 */
async function handleReturn(user) {
  log('CMD', `RETURN from ${user.name}`);

  await User.updateUser(user.phone, { status: 'active' });

  const msg = `◆ Welcome back, ${user.name}.\n\nYour protocol resumes. The Consultant remembers where you left off.\n\nYour next message arrives tomorrow at ${user.preferredTime}.\n\n◆ MainCharacter`;
  
  await whatsapp.sendMessageSafe(user.phone, msg);
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

router.post('/waitlist', async (req, res) => {
  const { phone, pillar } = req.body;
  if (!phone || !pillar) {
    return res.status(400).json({ error: 'Phone and pillar are required.' });
  }

  const added = User.addToWaitlist(phone, pillar);
  log('WAITLIST', `${phone} joined ${pillar} waitlist (new: ${added})`);

  res.json({ success: true, added });
});

// ═══════════════════════════════════════════════════════════════════
// POST /api/waitlist/early-access — paywall waitlist (Night-4, P0.3)
// Captures name + phone while PAYWALL_PUBLIC is false so no live Razorpay
// charge can fire during the dogfood window. Deduplicated by phone.
// ═══════════════════════════════════════════════════════════════════

router.post('/waitlist/early-access', async (req, res) => {
  const { phone, name, auditSessionToken } = req.body || {};
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!/^\d{10,13}$/.test(cleanPhone)) {
    return res.status(400).json({ error: 'valid phone required' });
  }
  const { added } = EarlyAccess.add({
    phone: cleanPhone,
    name: name || '',
    sourceAuditSessionToken: auditSessionToken || null,
  });
  log('EARLY-ACCESS', `${cleanPhone} ${added ? 'added to' : 'already on'} early-access list`);
  // Consultant-voice confirmation (copy from the autopilot brief — not invented).
  res.json({
    success: true,
    added,
    message: "You're on the list. When the doors open, yours opens first. ◆ MainCharacter",
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/user/:token — User data for dashboard
// ═══════════════════════════════════════════════════════════════════

router.get('/user/:token', async (req, res) => {
  const user = await User.getUserByToken(req.params.token);
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

router.post('/payment/verify', async (req, res) => {
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

router.get('/payment/plans', async (req, res) => {
  res.json(razorpay.PLANS);
});

// POST /api/payment/subscribe — create a recurring subscription (P4.3).
// Body: { planKey? , pillars?[], phone, name?, email?, auditSessionToken? }.
// Selecting both pillars resolves to the Aura++ bundle automatically.
router.post('/payment/subscribe', async (req, res) => {
  try {
    const { planKey, pillars, phone, name, email, auditSessionToken } = req.body || {};
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!/^\d{10,13}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'valid phone required' });
    }

    // Resolve the plan: explicit planKey wins; else derive from selected pillars.
    const resolvedPlan =
      (planKey && razorpay.PLANS[planKey] && planKey) ||
      razorpay.resolvePlanForPillars(pillars || []);
    if (!resolvedPlan) return res.status(400).json({ error: 'unknown plan / no pillars selected' });

    const planPillars = razorpay.pillarsForPlan(resolvedPlan);

    // Find or create the user (phone-primary, email optional — Night-2 #2).
    let user = await User.getUserByPhone(cleanPhone);
    if (!user) {
      const primaryPillar = planPillars.includes('orator') ? 'orator' : 'aesthetic';
      user = await User.createUser({ name: (name || 'Seeker').trim(), phone: cleanPhone, pillar: primaryPillar });
    }
    // Upsert details (phone-primary). For an existing user, refresh name/email/
    // audit link rather than creating a duplicate (P5.3).
    const updates = { pendingPlan: resolvedPlan, pendingPillars: planPillars };
    if (name && name.trim()) updates.name = name.trim();
    if (email) updates.email = email;
    if (auditSessionToken) updates.auditSessionId = auditSessionToken;
    await User.updateUser(cleanPhone, updates);

    const sub = await razorpay.createSubscription(resolvedPlan, {
      phone: cleanPhone,
      name: user.name,
      email: email || user.email || '',
    });

    // Persist the subscription id so the post-payment page can look the user up.
    if (sub && sub.id) await User.updateUser(cleanPhone, { razorpaySubscriptionId: sub.id });

    log('PAYMENT', `subscribe ${cleanPhone} → ${resolvedPlan} [${planPillars.join(',')}]${sub.mock ? ' (mock)' : ''}`);
    res.json({
      success: true,
      url: sub.short_url,
      subscriptionId: sub.id,
      planKey: resolvedPlan,
      amount: razorpay.PLANS[resolvedPlan].amount,
    });
  } catch (err) {
    log('ERROR', `subscribe failed: ${err.message}`);
    res.status(500).json({ error: 'could not create subscription' });
  }
});

// GET /api/payment/status — backing data for the post-payment page (P6.2).
// Query: subscriptionId (required) [+ paymentId, signature from Razorpay's
// callback for verification]. Looks the user up by subscription id and reports
// their live activation flags. Never leaks phone/PII beyond name.
router.get('/payment/status', async (req, res) => {
  const { subscriptionId, paymentId, signature } = req.query || {};
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId required' });

  const user = await User.getUserBySubscriptionId(String(subscriptionId));
  if (!user) {
    // Webhook may not have landed yet, or unknown id. Page shows a graceful
    // "being verified" message and offers a refresh.
    return res.json({ found: false });
  }

  // Verify the callback signature when the params + secret are present. A bad
  // signature is reported (verified:false) rather than hard-failing, so a user
  // who genuinely paid still sees their status from the webhook-updated record.
  let verified = false;
  if (paymentId && signature) {
    verified = razorpay.verifySubscriptionPayment(String(paymentId), String(subscriptionId), String(signature));
    if (!verified) log('PAYMENT', `status: bad signature for ${subscriptionId}`);
  }

  const status = User.computeAuraStatus(user);
  const planKey = user.pendingPlan || (user.oratorActive && user.lookmaxxingActive ? 'auraplus' : user.lookmaxxingActive ? 'lookmaxxing' : 'seeker');
  const plan = razorpay.PLANS[planKey] || null;
  const nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Login Gate (P0-1): include firstLoginToken only when all four conditions are met.
  // Omitting (undefined) rather than null makes it invisible to the client unless earned.
  const emailLoginEnabled = process.env.LOOKMAX_EMAIL_LOGIN === 'true';
  const firstLoginToken =
    emailLoginEnabled &&
    user.lookmaxxingActive &&
    !user.firstLoginConsumedAt &&
    user.firstLoginExpiresAt &&
    user.firstLoginExpiresAt > Date.now()
      ? user.firstLoginToken
      : undefined;

  res.json({
    found: true,
    verified,
    name: user.name || 'Seeker',
    planKey,
    planLabel: plan ? plan.label : 'Subscription',
    amount: plan ? plan.amount : null,
    oratorActive: !!user.oratorActive,
    lookmaxxingActive: !!user.lookmaxxingActive,
    auraPlusPlus: status.auraPlusPlus,
    subscriptionActive: user.subscriptionStatus === 'active',
    nextBillingDate: nextBilling.toISOString(),
    ...(firstLoginToken !== undefined ? { firstLoginToken } : {}),
  });
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
 *
 * Identity resolution order (supports both Orator phone-primary and Lookmaxing
 * email/token-primary flows from a single shared webhook endpoint):
 *   1. notes.phone  → getUserByPhone  (Orator — existing path, no change)
 *   2. notes.userId → getUserByToken  (Lookmaxing /pay/subscribe new path)
 *   3. notes.email  → getUserByEmail  (Lookmaxing email fallback)
 * All existing Orator behaviour (phone path) is preserved unchanged.
 *
 * @param {object} event parsed Razorpay webhook body
 */
async function processPaymentEvent(event) {
  const evt = event && event.event;
  const notes = extractNotes(event);

  // ── Identity resolution ──────────────────────────────────────────────────
  let user = null;

  // 1. Phone (Orator primary path — unchanged)
  const phone = notes.phone;
  if (phone) {
    user = await User.getUserByPhone(phone);
    if (!user) log('PAYMENT', `Phone ${phone} not found for event ${evt}`);
  }

  // 2. userId / token (Lookmaxing audit funnel primary path)
  if (!user && notes.userId) {
    user = await User.getUserByToken(notes.userId);
    if (!user) log('PAYMENT', `userId ${notes.userId} not found for event ${evt}`);
  }

  // 3. email (Lookmaxing fallback)
  if (!user && notes.email) {
    user = User.getUserByEmail(notes.email);
    if (!user) log('PAYMENT', `email ${notes.email} not found for event ${evt}`);
  }

  if (!user) {
    log('PAYMENT', `No resolvable user in notes for event ${evt}`);
    return { handled: false };
  }

  // Normalise phone to the user's actual phone for downstream updateUser calls
  // (needed because Lookmaxing users have a synthetic phone and notes.phone may
  // be empty — all User.updateUser calls below use user.phone directly).
  const userPhone = user.phone;

  // Which pillars this event touches: notes.pillars (csv) or derive from plan.
  const pillars = notes.pillars
    ? String(notes.pillars).split(',').map((s) => s.trim()).filter(Boolean)
    : razorpay.pillarsForPlan(notes.plan);

  if (PAID_EVENTS.includes(evt)) {
    const updates = { subscriptionStatus: 'active' };
    if (!user.subscribedAt) updates.subscribedAt = new Date().toISOString();
    if (user.rank === 'unawakened') updates.rank = 'seeker';
    if (pillars.includes('orator')) {
      updates.oratorActive = true;
      // P6.4: a paywall-converted Orator who has never received a morning message
      // is primed so the scheduler sends Day 1 at their preferred time tomorrow.
      // (A trial user mid-protocol — day>0 — is left untouched.)
      if (user.day === 0 && !user.lastMorningSent) {
        updates.day = 0;
        updates.awaitingResponse = false;
        updates.status = 'active';
      }
    }
    if (pillars.includes('lookmaxxing')) {
      updates.lookmaxxingActive = true;
      if (!user.lookmaxxingStartedAt) updates.lookmaxxingStartedAt = new Date().toISOString();
      // Login Gate (P0-1): mint a one-shot first-login token so /payment-confirmed
      // can silently sign the buyer in via /api/lookmax/auth/exchange-first-login.
      // 15-min TTL, single-use, 32-byte hex — never logged (lib/log-mask).
      const crypto = require('crypto');
      updates.firstLoginToken = crypto.randomBytes(32).toString('hex');
      updates.firstLoginExpiresAt = Date.now() + 15 * 60 * 1000;
      updates.firstLoginConsumedAt = null;
      // NOW-2: capture full durable lookmaxBaseline at first activation.
      // Stored as { scores, leverageAxis, overall, capturedAt, photoStorageKeys }.
      // The AuditSession TTL is 24h but the baseline must survive indefinitely —
      // copying into the user record here makes it durable regardless of TTL.
      // Guard: only written once (!user.lookmaxBaseline) — never overwritten by
      // subscription.charged or reactivation events.
      if (!user.lookmaxBaseline && user.auditSessionId) {
        try {
          const AuditSession = require('../models/AuditSession');
          // backend-adapted: await, or `auditSession` is a Promise on live and the
          // lookmaxBaseline snapshot silently never happens. funnel-repair.
          const auditSession = await AuditSession.getSession(user.auditSessionId);
          if (auditSession && auditSession.aestheticScores) {
            const scores = auditSession.aestheticScores;
            // Compute average overall (8-axis mean, rounded)
            const axes = Object.values(scores);
            const overall = Math.round(axes.reduce((s, v) => s + v, 0) / axes.length);
            // Build photoStorageKeys map from AuditSession photos (DPDPA: R2 keys
            // live server-side only — never returned to any client endpoint).
            const photoStorageKeys = {};
            if (Array.isArray(auditSession.photos)) {
              for (const p of auditSession.photos) {
                if (p.kind && p.storageKey) photoStorageKeys[p.kind] = p.storageKey;
              }
            }
            updates.lookmaxBaseline = {
              scores,
              leverageAxis: auditSession.weakestAxis || null,
              overall,
              capturedAt: new Date().toISOString(),
              photoStorageKeys,
            };
            log('LOOKMAX', `lookmaxBaseline snapshotted for ${userPhone} from audit ${user.auditSessionId}`);
          }
        } catch (err) {
          log('LOOKMAX', `lookmaxBaseline snapshot failed for ${userPhone}: ${err.message}`);
        }
      }
    }
    // Capture the subscription id from the event if checkout didn't store it
    // (lets the post-payment page find the user by subscription id).
    const evtSubId =
      (event.payload && event.payload.subscription && event.payload.subscription.entity && event.payload.subscription.entity.id) || '';
    if (evtSubId && !user.razorpaySubscriptionId) updates.razorpaySubscriptionId = evtSubId;
    await User.updateUser(userPhone, updates);
    const updatedUser = { ...user, ...updates };
    const status = User.computeAuraStatus(updatedUser);
    log('PAYMENT', `${user.name} (${userPhone}) → active via ${evt} [${pillars.join(',') || 'orator'}]${status.auraPlusPlus ? ' AURA++' : ''}`);
    // Copy supplied by founder in the autopilot brief (not invented).
    // Lookmaxing-only users may have a synthetic phone (no real WhatsApp) — send
    // only when the phone looks like a real number (numeric, 10-13 digits).
    if (/^\d{10,13}$/.test(userPhone)) {
      await whatsapp.sendMessageSafe(
        userPhone,
        `◆ The Chamber is open, ${user.name}.\n\nDay 8 arrives tomorrow at your preferred time.\n\n◆ MainCharacter`
      );
    }
    // P4.5: post-payment receipt email (DRY-RUN/allowlist-gated; no-op if no email).
    // Login Gate (P0-1): thread firstLoginToken into the receipt so the email
    // embeds a magic-link backup URL for the F2 failure mode (tab closed after payment).
    if (updatedUser.email) {
      const subscriptionId =
        (event.payload && event.payload.subscription && event.payload.subscription.entity && event.payload.subscription.entity.id) || '';
      email
        .sendPaywallReceipt({
          user: updatedUser,
          plan: notes.plan,
          subscriptionId,
          firstLoginToken: updatedUser.firstLoginToken || null,
        })
        .catch((err) => log('ERROR', `receipt email failed: ${err.message}`));
    }
    return { handled: true, status: 'active', auraPlusPlus: status.auraPlusPlus, pillars };
  }

  if (CANCEL_EVENTS.includes(evt)) {
    const updates = {};
    if (pillars.includes('orator')) updates.oratorActive = false;
    if (pillars.includes('lookmaxxing')) updates.lookmaxxingActive = false;
    // If we can't tell which pillar, fall back to fully pausing.
    if (pillars.length === 0) updates.subscriptionStatus = 'cancelled';
    const after = { ...user, ...updates };
    if (!after.oratorActive && !after.lookmaxxingActive) updates.subscriptionStatus = 'cancelled';
    await User.updateUser(userPhone, updates);
    log('PAYMENT', `${user.name} (${userPhone}) → cancelled via ${evt} [${pillars.join(',') || 'all'}]`);
    // Only send WhatsApp cancel message for real phone numbers.
    if (/^\d{10,13}$/.test(userPhone)) {
      await whatsapp.sendMessageSafe(
        userPhone,
        `◆ Your protocol pauses, ${user.name}.\n\nYour lexicon and rank remain yours. Reply RETURN when ready.\n\n◆ MainCharacter`
      );
    }
    return { handled: true, status: 'cancelled', pillars };
  }

  log('PAYMENT', `Ignored event ${evt}`);
  return { handled: false };
}

router.post('/payment/webhook', async (req, res) => {
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
module.exports.processWhatsAppWebhook = processWhatsAppWebhook;
module.exports.processPaymentEvent = processPaymentEvent;
