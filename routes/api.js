/**
 * ═══════════════════════════════════════════════════════════════════
 * API ROUTES — Enrollment, Webhook, Waitlist
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const wati = require('../services/wati');
const gemini = require('../services/gemini');
const razorpay = require('../services/razorpay');
const { DAYS, buildMorningMessage, buildEveningMessage, buildEvolutionReport } = require('../data/orator-content');

const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';
const WHATSAPP_NUMBER = '919958533994'; // Wati Business number

function log(tag, msg) {
  console.log(`[${new Date().toISOString()}] [API:${tag}] ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════
// POST /api/enroll — New user enrollment
// ═══════════════════════════════════════════════════════════════════

router.post('/enroll', async (req, res) => {
  try {
    const { name, phone, preferredTime, pillar } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required.' });
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
    const welcomeMsg = `◆ MainCharacter\n\nWelcome, ${user.name}.\n\nI'm The Consultant.\n\nYour Orator Protocol is confirmed. Your first message arrives tomorrow at ${user.preferredTime}.\n\nBetween now and then — think about the last time you spoke in a room that mattered. What happened?\n\nTomorrow, we begin measuring.`;

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

router.post('/webhook/wati', async (req, res) => {
  res.json({ status: 'received' }); // Respond immediately

  try {
    const body = req.body;
    
    // DEBUG: Log the FULL raw payload from Wati
    log('RAW-PAYLOAD', JSON.stringify(body).substring(0, 2000));

    // Extract message data — handle ALL known Wati webhook formats
    // Wati v2 nests under different structures depending on event type
    let phone = '';
    let text = '';
    let msgType = 'text';
    let senderName = '';

    // Format 1: Direct top-level fields
    phone = body.waId || body.from || body.senderPhoneNumber || body.whatsappNumber || '';
    text = (body.text || body.message || body.messageText || '').trim();
    msgType = body.type || body.messageType || 'text';
    senderName = body.senderName || body.pushName || body.contactName || '';

    // Format 2: Wati sometimes nests under body.data
    if (!phone && body.data) {
      phone = body.data.waId || body.data.from || body.data.senderPhoneNumber || body.data.whatsappNumber || '';
      text = (body.data.text || body.data.message || body.data.messageText || text).trim();
      msgType = body.data.type || body.data.messageType || msgType;
      senderName = body.data.senderName || body.data.pushName || body.data.contactName || senderName;
    }

    // Format 3: Wati v2 webhook can nest under body.messages[0]
    if (!phone && body.messages && body.messages.length > 0) {
      const m = body.messages[0];
      phone = m.waId || m.from || m.senderPhoneNumber || '';
      text = (m.text || m.message || m.messageText || '').trim();
      msgType = m.type || m.messageType || 'text';
      senderName = m.senderName || m.pushName || '';
    }

    // After extracting fields, ignore non‑message events (e.g., status updates)
    if (msgType && msgType !== 'text' && !text) {
      log('WEBHOOK', `Ignored non‑text event type: ${msgType}`);
      return;
    }
    // Additionally, some Wati payloads include a 'status' field for delivery/read updates
    if (body.status || body.messageStatus) {
      log('WEBHOOK', `Ignored status update event`);
      return;
    }

    // If text is empty after all extraction, skip processing (no actual user message)
    if (!text) {
      log('WEBHOOK', 'Ignored empty text payload');
      return;
    }

    // Format 4: Wati contact-based format
    if (!phone && body.contact) {
      phone = body.contact.waId || body.contact.phone || body.contact.whatsappNumber || '';
      senderName = body.contact.name || body.contact.fullName || senderName;
    }

    // Format 5: Nested text object (Wati sometimes sends text as {body: "..."})
    if (!text && body.text && typeof body.text === 'object') {
      text = (body.text.body || '').trim();
    }

    // Strip + from phone
    phone = phone.replace(/[+\s\-]/g, '');

    if (!phone) {
      log('WEBHOOK', 'No phone number found in any format. Full payload logged above.');
      return;
    }

    log('WEBHOOK', `← ${phone} (${senderName}): "${text.substring(0, 100)}" [${msgType}]`);

    const user = User.getUserByPhone(phone);

    // Unknown user — notify admin
    if (!user) {
      log('WEBHOOK', `Unknown user: ${phone}`);
      if (ADMIN_PHONE) {
        wati.sendMessageSafe(ADMIN_PHONE, `◆ UNKNOWN USER\n\nPhone: ${phone}\nName: ${senderName}\nMessage: ${text.substring(0, 200)}`).catch(() => {});
      }
      return;
    }

    // Route the message
    const msg = text.toLowerCase().trim();

    // ─── Special commands ───
    if (msg === 'continue') {
      return await handleContinue(user);
    }
    if (msg === 'stop') {
      return await handleStop(user);
    }
    if (msg === 'return') {
      return await handleReturn(user);
    }
    if (msg === 'pay' || msg === 'subscribe') {
      return await handlePayment(user);
    }

    // ─── Day-based routing ───
    if (user.awaitingResponse && user.day >= 1 && user.day <= 7) {
      return await handleDailyResponse(user, text, msgType);
    }

    // ─── Default ───
    log('WEBHOOK', `Unhandled message from ${user.name}: "${msg}"`);
    
    // Forward to admin
    if (ADMIN_PHONE && phone !== ADMIN_PHONE) {
      wati.sendMessageSafe(ADMIN_PHONE, `◆ USER MESSAGE\n\nFrom: ${user.name} (${user.phone})\nDay: ${user.day}\nMessage: ${text.substring(0, 300)}`).catch(() => {});
    }

    // Send gentle response
    const defaultReply = user.day === 0
      ? `The Consultant is preparing your Day 1 protocol. It arrives tomorrow at ${user.preferredTime}. ◆`
      : `The Consultant is preparing your next message. It arrives at ${user.preferredTime}. ◆`;
    
    await wati.sendMessageSafe(user.phone, defaultReply);

  } catch (err) {
    log('ERROR', `Webhook handler error: ${err.message}`);
  }
});

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK HANDLERS
// ═══════════════════════════════════════════════════════════════════

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

module.exports = router;
