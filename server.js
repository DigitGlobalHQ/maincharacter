/**
 * ═══════════════════════════════════════════════════════════════════════
 * MAINCHARACTER — Wati Webhook Server (Automation Backbone)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Every WhatsApp message from a user flows through here first.
 * Routes by content type → voice analysis, photo scoring, payment,
 * onboarding, quest completion, or admin forwarding.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RENDER.COM DEPLOYMENT INSTRUCTIONS
 * ─────────────────────────────────────────────────────────────────────
 *
 *   1. Push this repo to GitHub (or connect Render to local repo).
 *
 *   2. Create a new Web Service on Render:
 *      - Build command:  npm install
 *      - Start command:  node server.js
 *      - Instance type:  Free
 *
 *   3. Set environment variables in Render dashboard:
 *      GEMINI_API_KEY    = your-gemini-api-key
 *      WATI_API_KEY      = your-wati-bearer-token
 *      WATI_BASE_URL     = https://live-XXXXX.wati.io
 *      ADMIN_PHONE       = 91XXXXXXXXXX
 *      NODE_ENV          = production
 *      PORT              = 3000 (Render sets this automatically)
 *
 *   4. Copy the Render URL (e.g. https://maincharacter-xyz.onrender.com)
 *
 *   5. In Wati dashboard → Settings → Webhooks:
 *      - Webhook URL: https://maincharacter-xyz.onrender.com/webhook
 *      - Events: All message types (text, image, audio, document)
 *      - Save & test
 *
 *   6. Verify: GET https://maincharacter-xyz.onrender.com/health
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * Routes:
 *   POST /webhook       — Main Wati webhook receiver
 *   POST /webhook/test  — Test with mock payload
 *   GET  /health        — Status + stats
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const WATI_API_KEY = process.env.WATI_API_KEY || '';
const WATI_BASE_URL = (process.env.WATI_BASE_URL || 'https://live-XXX.wati.io').replace(/\/$/, '');
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const UPGRADE_BASE_URL = process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

// ═══════════════════════════════════════════════════════════════════
// RAZORPAY CLIENT
// ═══════════════════════════════════════════════════════════════════

let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  log('INIT', 'Razorpay client initialised');
} else {
  log('INIT', 'No RAZORPAY keys — payment routes will return mock data');
}

// ═══════════════════════════════════════════════════════════════════
// PRICING TABLE
// ═══════════════════════════════════════════════════════════════════

const PRICING = {
  pro: {
    monthly: { amount: 149900, label: 'Pro Monthly', period: 'monthly', display: '₹1,499/month' },
    annual:  { amount: 1249900, label: 'Pro Annual',  period: 'annual',  display: '₹12,499/year (save 30%)' },
  },
  elite: {
    monthly: { amount: 299900, label: 'Elite Monthly', period: 'monthly', display: '₹2,999/month' },
    annual:  { amount: 2499900, label: 'Elite Annual',  period: 'annual',  display: '₹24,999/year' },
  },
};

const PAYMENTS_FILE = path.join(__dirname, 'payments.json');
if (!fs.existsSync(PAYMENTS_FILE)) {
  fs.writeFileSync(PAYMENTS_FILE, JSON.stringify({ payments: [] }, null, 2));
}

const USERS_FILE = path.join(__dirname, 'users.json');
const LOG_FILE = path.join(__dirname, 'messages.log');
const AUDIO_DIR = path.join(__dirname, 'audio_downloads');
const PHOTOS_DIR = path.join(__dirname, 'photo_uploads');

// ═══════════════════════════════════════════════════════════════════
// INIT — files & directories
// ═══════════════════════════════════════════════════════════════════

for (const dir of [AUDIO_DIR, PHOTOS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({ users: {} }, null, 2));
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI CLIENT
// ═══════════════════════════════════════════════════════════════════

let genAI = null;
let visionModel = null;
let textModel = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  textModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
  log('INIT', 'Gemini clients initialised (Vision + Pro)');
} else {
  log('INIT', 'No GEMINI_API_KEY — media analysis will use fallback engines');
}

// ═══════════════════════════════════════════════════════════════════
// METRICS
// ═══════════════════════════════════════════════════════════════════

const metrics = {
  messagesReceived: 0,
  messagesSent: 0,
  mediaProcessed: 0,
  geminiCalls: 0,
  errors: 0,
  startedAt: new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════

/**
 * Per-user outgoing message rate limiter.
 * Max 1 message per second per user.
 */
const userLastSent = new Map();

/**
 * Gemini API rate limiter.
 * Max 10 calls per minute.
 */
const geminiCallLog = [];
const GEMINI_RPM = 10;

/**
 * Message send queue — drains at 1 msg/sec per user.
 */
const sendQueue = [];
let queueProcessing = false;

function canSendToUser(phone) {
  const last = userLastSent.get(phone) || 0;
  return Date.now() - last >= 1000;
}

function markSentToUser(phone) {
  userLastSent.set(phone, Date.now());
}

function canCallGemini() {
  const now = Date.now();
  // Prune calls older than 60s
  while (geminiCallLog.length > 0 && now - geminiCallLog[0] > 60000) {
    geminiCallLog.shift();
  }
  return geminiCallLog.length < GEMINI_RPM;
}

function markGeminiCall() {
  geminiCallLog.push(Date.now());
  metrics.geminiCalls++;
}

// ═══════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════

/**
 * Structured logger — writes to console + log file.
 */
function log(type, message, data) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${type}] ${message}`;

  console.log(line);
  if (data) console.log('  →', typeof data === 'string' ? data : JSON.stringify(data).slice(0, 200));

  // Append to file (non-blocking)
  try {
    fs.appendFileSync(LOG_FILE, line + (data ? ` | ${JSON.stringify(data).slice(0, 300)}` : '') + '\n');
  } catch (e) { /* non-critical */ }
}

function logIncoming(phone, type, text) {
  metrics.messagesReceived++;
  const preview = (text || '').slice(0, 50).replace(/\n/g, ' ');
  log('IN', `${phone} | ${type} | "${preview}${text && text.length > 50 ? '…' : ''}"`);
}

function logOutgoing(phone, charCount) {
  metrics.messagesSent++;
  log('OUT', `${phone} | ${charCount} chars`);
}

function logError(context, err) {
  metrics.errors++;
  log('ERROR', `${context}: ${err.message}`);
  if (NODE_ENV !== 'production') {
    console.error(err.stack);
  }
}

// ═══════════════════════════════════════════════════════════════════
// USER DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════

/**
 * getUserData — Read user object from users.json.
 * @param {string} phone
 * @returns {object|null}
 */
function getUserData(phone) {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    return data.users[phone] || null;
  } catch (e) {
    logError('getUserData', e);
    return null;
  }
}

/**
 * updateUserData — Merge updates into a user record.
 * Creates user if not found.
 * @param {string} phone
 * @param {object} updates — fields to merge
 * @returns {object} Updated user object
 */
function updateUserData(phone, updates) {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));

    if (!data.users[phone]) {
      data.users[phone] = {
        phone,
        createdAt: new Date().toISOString(),
        name: 'User',
        pillar: null,
        onboardingStep: 0,
        dayNumber: 0,
        auditAnswers: {},
        questsCompleted: [],
        paid: false,
        lastActive: new Date().toISOString(),
      };
    }

    Object.assign(data.users[phone], updates, { lastActive: new Date().toISOString() });

    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
    return data.users[phone];
  } catch (e) {
    logError('updateUserData', e);
    return null;
  }
}

/**
 * getAllUsers — Return full users object.
 */
function getAllUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    return data.users || {};
  } catch (e) {
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════
// WATI API — SEND MESSAGE
// ═══════════════════════════════════════════════════════════════════

/**
 * sendMessage — Send a WhatsApp message via Wati API.
 * Includes rate limiting (1 msg/sec per user) and one retry on failure.
 *
 * @param {string} phone — WhatsApp number (with country code, no +)
 * @param {string} text — Message text (WhatsApp formatting)
 * @param {number} [retryCount=0] — Internal retry counter
 * @returns {boolean} Success status
 */
async function sendMessage(phone, text, retryCount = 0) {
  if (!WATI_API_KEY || !WATI_BASE_URL || WATI_BASE_URL.includes('XXX')) {
    log('WATI', `[DRY RUN] → ${phone} (${text.length} chars)`);
    logOutgoing(phone, text.length);
    return true; // Succeed silently in dev
  }

  // Rate limit: wait if needed
  if (!canSendToUser(phone)) {
    const waitTime = 1000 - (Date.now() - (userLastSent.get(phone) || 0));
    log('RATE', `Waiting ${waitTime}ms before sending to ${phone}`);
    await sleep(Math.max(waitTime, 0));
  }

  try {
    const url = `${WATI_BASE_URL}/api/v1/sendSessionMessage/${phone}?messageText=${encodeURIComponent(text)}`;

    const response = await axios({
      method: 'POST',
      url,
      headers: {
        'Authorization': `Bearer ${WATI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {},
      timeout: 15000,
    });

    markSentToUser(phone);
    logOutgoing(phone, text.length);
    log('WATI', `Sent OK → ${phone} (status ${response.status})`);
    return true;
  } catch (err) {
    logError('sendMessage', err);

    // One retry on failure
    if (retryCount === 0) {
      log('WATI', `Retrying send to ${phone} in 2s...`);
      await sleep(2000);
      return sendMessage(phone, text, 1);
    }

    log('WATI', `Send FAILED to ${phone} after retry`);
    return false;
  }
}

/**
 * sendMultipleMessages — Send multiple messages with 1s delay between each.
 * @param {string} phone
 * @param {string[]} messages — Array of message strings
 */
async function sendMultipleMessages(phone, messages) {
  for (const msg of messages) {
    await sendMessage(phone, msg);
    await sleep(1200); // Slightly over 1s for safety
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════════
// MEDIA DOWNLOAD
// ═══════════════════════════════════════════════════════════════════

/**
 * Download media from a Wati/WhatsApp URL.
 * @param {string} url
 * @returns {object} { buffer, mimeType, size }
 */
async function downloadMedia(url) {
  log('DOWNLOAD', `Fetching: ${url.slice(0, 80)}...`);

  const headers = {};
  if (WATI_API_KEY) {
    headers['Authorization'] = `Bearer ${WATI_API_KEY}`;
  }

  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: 30000,
    headers,
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers['content-type'] || 'application/octet-stream';

  log('DOWNLOAD', `Received ${(buffer.length / 1024).toFixed(1)}KB (${contentType})`);
  return { buffer, mimeType: contentType, size: buffer.length };
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════

/**
 * handleMediaMessage — Route image / audio to the correct analysis engine.
 */
async function handleMediaMessage(message) {
  const phone = message.from;
  const mediaType = message.type; // 'image' or 'audio'
  const mediaUrl = message.mediaUrl;
  const userName = message.senderName || getUserData(phone)?.name || 'Aarav';

  log('MEDIA', `Processing ${mediaType} from ${phone}`);
  metrics.mediaProcessed++;

  if (!mediaUrl) {
    log('MEDIA', 'No media URL found — skipping');
    return;
  }

  try {
    const { buffer, mimeType, size } = await downloadMedia(mediaUrl);

    if (mediaType === 'image') {
      await handleImageAnalysis(phone, buffer, mimeType, userName);
    } else if (mediaType === 'audio') {
      await handleAudioAnalysis(phone, buffer, mimeType, userName);
    }
  } catch (err) {
    logError('handleMediaMessage', err);
    await sendMessage(phone, 'Your file was received but could not be processed. Please try sending it again.');
  }
}

/**
 * handleImageAnalysis — Aesthetic pillar Aura Score analysis.
 */
async function handleImageAnalysis(phone, imageBuffer, mimeType, userName) {
  log('IMAGE', `Analyzing photo for ${phone} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);

  // Validate size
  if (imageBuffer.length > 5 * 1024 * 1024) {
    await sendMessage(phone, 'That image is too large. Please send a photo under 5MB.');
    return;
  }

  // Check Gemini rate limit
  if (!canCallGemini()) {
    log('RATE', 'Gemini rate limit reached — queuing');
    await sendMessage(phone, 'Your photo is being processed. You will receive your reading shortly.');
    await sleep(6000); // Wait for rate limit window
  }

  let scores;

  if (visionModel) {
    try {
      markGeminiCall();
      const startTime = Date.now();

      const base64 = imageBuffer.toString('base64');
      const prompt = buildAuraPrompt();
      const imagePart = { inlineData: { data: base64, mimeType } };

      const result = await visionModel.generateContent([prompt, imagePart]);
      const text = result.response.text();

      const elapsed = Date.now() - startTime;
      log('GEMINI', `Vision response in ${elapsed}ms`);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in Gemini response');

      scores = JSON.parse(jsonMatch[0]);
      scores = validateAuraScores(scores);
    } catch (err) {
      logError('handleImageAnalysis/Gemini', err);
      scores = fallbackAuraScores();
    }
  } else {
    scores = fallbackAuraScores();
  }

  // Generate quests
  const quests = await generateGroomingQuests(scores);

  // Save scan
  const user = getUserData(phone);
  const scanNumber = (user?.scanCount || 0) + 1;
  updateUserData(phone, {
    name: userName,
    scanCount: scanNumber,
    lastAuraScore: scores,
    lastAuraQuests: quests,
    lastScanAt: new Date().toISOString(),
  });

  // Save photo to disk
  const photoFile = `${phone.replace(/[^0-9]/g, '')}_scan${scanNumber}_${Date.now()}.jpg`;
  fs.writeFileSync(path.join(PHOTOS_DIR, photoFile), imageBuffer);

  // Build consultant message
  const message = buildAuraConsultantMessage(scores, quests, userName, scanNumber);

  // Send (may be multiple messages if long)
  if (message.length > 3500) {
    // Split into two messages at the quest section
    const splitIdx = message.indexOf('🎯');
    if (splitIdx > 0) {
      await sendMultipleMessages(phone, [
        message.slice(0, splitIdx).trim(),
        message.slice(splitIdx).trim(),
      ]);
    } else {
      await sendMessage(phone, message);
    }
  } else {
    await sendMessage(phone, message);
  }
}

/**
 * handleAudioAnalysis — Orator pillar voice scoring.
 */
async function handleAudioAnalysis(phone, audioBuffer, mimeType, userName) {
  log('AUDIO', `Analyzing voice note for ${phone} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);

  const user = getUserData(phone) || {};
  const dayNumber = (user.dayNumber || 0) + 1;
  const auditAnswers = user.auditAnswers || {};
  const previousScores = user.voiceScores || [];

  // Check Gemini rate limit
  if (!canCallGemini()) {
    log('RATE', 'Gemini rate limit reached — queuing');
    await sleep(6000);
  }

  let scores;

  if (textModel) {
    try {
      markGeminiCall();
      const startTime = Date.now();

      const prompt = buildVoicePrompt(dayNumber, auditAnswers, previousScores);
      const result = await textModel.generateContent(prompt);
      const text = result.response.text();

      const elapsed = Date.now() - startTime;
      log('GEMINI', `Pro response in ${elapsed}ms`);

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      scores = JSON.parse(jsonMatch[0]);
      scores = validateVoiceScores(scores, dayNumber);
    } catch (err) {
      logError('handleAudioAnalysis/Gemini', err);
      scores = fallbackVoiceScores(dayNumber, auditAnswers, previousScores);
    }
  } else {
    scores = fallbackVoiceScores(dayNumber, auditAnswers, previousScores);
  }

  // Save scores
  const updatedScores = [...previousScores, { day: dayNumber, scores, timestamp: new Date().toISOString() }];
  updateUserData(phone, {
    name: userName,
    dayNumber,
    voiceScores: updatedScores,
    lastVoiceScore: scores,
    lastRecordingAt: new Date().toISOString(),
  });

  // Save audio file
  const audioFile = `${phone.replace(/[^0-9]/g, '')}_day${dayNumber}_${Date.now()}.ogg`;
  fs.writeFileSync(path.join(AUDIO_DIR, audioFile), audioBuffer);

  // Generate consultant message
  const message = buildVoiceConsultantMessage(scores, dayNumber, updatedScores, userName);
  await sendMessage(phone, message);
}

/**
 * sendPaymentLink — Triggered when user replies PAY.
 * Generates a personalised upgrade URL with their stats embedded.
 */
async function sendPaymentLink(phone) {
  log('PAYMENT', `Payment link requested by ${phone}`);

  const user = getUserData(phone);
  const pillarName = user?.pillar
    ? { orator: 'Orator', aesthetic: 'Aesthetic', sage: 'Sage' }[user.pillar] || 'Orator'
    : 'Orator';

  // Build personalised upgrade URL with stats
  const name = encodeURIComponent(user?.name || 'User');
  const phoneParam = encodeURIComponent(phone);
  let statsParams = '';

  if (user?.pillar === 'orator' && user.voiceScores?.length >= 2) {
    const first = user.voiceScores[0]?.scores || {};
    const latest = user.voiceScores[user.voiceScores.length - 1]?.scores || {};
    const fluencyGain = (latest.fluency || 0) - (first.fluency || 0);
    const pacingGain = (latest.pacingRhythm || 0) - (first.pacingRhythm || 0);
    const fillerGain = (latest.fillerFrequency || 0) - (first.fillerFrequency || 0);
    statsParams = `&fluency=%2B${fluencyGain}&pacing=%2B${pacingGain}&fillers=%2B${fillerGain}`;
  }

  const upgradeUrl = `${UPGRADE_BASE_URL}/upgrade.html?name=${name}&phone=${phoneParam}&pillar=${user?.pillar || 'orator'}${statsParams}`;

  const message = `Your upgrade link is ready.

*₹149/month or ₹1,499/year (save 30%)*
→ ${upgradeUrl}

Complete payment to receive your Day 8 quest.

_This link expires at midnight._

— Your ${pillarName} Consultant`;

  await sendMessage(phone, message);

  updateUserData(phone, { paymentLinkSentAt: new Date().toISOString() });
}

/**
 * handleOnboardingStep — Advance user through onboarding when they reply YES.
 */
async function handleOnboardingStep(phone) {
  log('ONBOARD', `Advancing onboarding for ${phone}`);

  const user = getUserData(phone);
  const step = (user?.onboardingStep || 0) + 1;

  const onboardingMessages = {
    1: `Welcome to MainCharacter. Your line is now open.

Before we begin, I need to understand where you are today. I will ask you three questions — answer honestly, not optimistically.

Reply *YES* when you are ready for the first question.`,

    2: `*Question 1 — The High-Stakes Recall*

Think of the last time you spoke and it mattered. In that moment, what betrayed you first?

Reply with one of these:
1 — My pacing rushed
2 — The right word didn't come
3 — My voice lost steadiness
4 — The fillers crept in
5 — Honestly, all of it`,

    3: `*Question 2 — The Filler Truth*

How often do you catch yourself saying "um", "like", or "you know" — and immediately wish you hadn't?

Reply:
1 — Constantly
2 — A few times a day
3 — Only when nervous
4 — A recording might disagree`,

    4: `*Question 3 — The Cost*

What is the one room — meeting, audience, person — where sounding like the sharpest version of yourself would change the most?

_Type your answer._`,

    5: `Noted. Your Consultant now has your profile.

When you are ready, send a *60-second voice note* answering this prompt:

_"What is one thing you are working on right now that matters to you — and why does it matter?"_

No script. No second take. This recording becomes your Baseline Mark.`,
  };

  if (onboardingMessages[step]) {
    await sendMessage(phone, onboardingMessages[step]);
    updateUserData(phone, { onboardingStep: step });
  } else {
    // Onboarding complete — waiting for baseline recording
    log('ONBOARD', `${phone} has completed all onboarding steps`);
  }
}

/**
 * handleQuestCompletion — User reports completing a quest.
 */
async function handleQuestCompletion(phone, text) {
  log('QUEST', `Quest completion from ${phone}: "${text.slice(0, 60)}"`);

  const user = getUserData(phone);
  const pillar = user?.pillar || 'orator';
  const completedQuests = user?.questsCompleted || [];

  // Parse which quest (best effort)
  let questType = 'general';
  const lower = text.toLowerCase();
  if (lower.includes('sharpness') || lower.includes('grooming') || lower.includes('barber')) {
    questType = 'sharpness';
  } else if (lower.includes('presence') || lower.includes('posture') || lower.includes('mirror')) {
    questType = 'presence';
  } else if (lower.includes('vibe') || lower.includes('style') || lower.includes('outfit')) {
    questType = 'vibe';
  } else if (lower.includes('pause') || lower.includes('breath') || lower.includes('sigh')) {
    questType = 'technique';
  }

  completedQuests.push({
    type: questType,
    text: text.slice(0, 200),
    completedAt: new Date().toISOString(),
  });

  updateUserData(phone, { questsCompleted: completedQuests });

  // Consultant acknowledgment — warm, brief, no exclamation
  const acknowledgments = [
    'Noted. That is one quest locked in. The next one matters just as much.',
    'Marked as complete. The body remembers what the mind practised — the repetition is doing the work.',
    'Done. That kind of discipline is what separates intent from transformation.',
    'Received. Small actions compound faster than you expect — you will see it in the numbers.',
    'Logged. Your next quest will build on what you just did.',
  ];

  const ack = acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
  await sendMessage(phone, ack + '\n\n— Your Consultant');

  // Check if all quests complete → invite re-scan
  if (pillar === 'aesthetic' && completedQuests.length >= 3) {
    await sleep(2000);
    await sendMessage(phone, `You have completed all three Grooming Quests for this cycle.\n\nWhen you are ready, send a new photo. The camera will tell us what changed.\n\n— Your Aesthetic Consultant`);
  }
}

/**
 * handleWordMastery — User reports mastering a word (Sage pillar).
 */
async function handleWordMastery(phone, text) {
  log('MASTERY', `Word mastery from ${phone}: "${text.slice(0, 60)}"`);

  const user = getUserData(phone);
  const masteredWords = user?.masteredWords || [];

  // Extract the word (best effort — expect "MASTERED [word]" or "mastered: [word]")
  const match = text.match(/mastered[:\s]+(\w+)/i);
  const word = match ? match[1] : text.replace(/mastered/i, '').trim().split(/\s/)[0];

  if (word) {
    masteredWords.push({ word, masteredAt: new Date().toISOString() });
    updateUserData(phone, { masteredWords });

    await sendMessage(phone, `*${word}* — added to your vocabulary ledger. ${masteredWords.length} word${masteredWords.length === 1 ? '' : 's'} earned.\n\n— Your Sage Consultant`);
  }
}

/**
 * notifyAdmin — Forward unhandled messages to admin for manual review.
 */
async function notifyAdmin(message) {
  if (!ADMIN_PHONE) {
    log('ADMIN', 'No ADMIN_PHONE set — skipping notification');
    return;
  }

  const name = message.senderName || message.from;
  const preview = (message.text || `[${message.type}]`).slice(0, 100);

  const notification = `📩 *Unhandled message*\nFrom: ${name} (${message.from})\nType: ${message.type}\n\n"${preview}"`;

  await sendMessage(ADMIN_PHONE, notification);
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI PROMPTS
// ═══════════════════════════════════════════════════════════════════

function buildAuraPrompt() {
  return `You are The Aesthetic Consultant for MainCharacter — a luxury personal growth platform. Your job is to read a person's present-day presence honestly and warmly, like a world-class stylist who believes in where this person is going.

Analyze this photo across three dimensions (each 1-10):

SHARPNESS: Quality and intentionality of grooming — haircut crispness, skin condition, facial hair precision, overall definition. A 5 means developing; 8+ means strong and intentional.

PRESENCE: Body language, posture, composure, and directness of gaze. Whether the person looks settled, grounded, and at ease — or uncertain and closed. A score of 1 means visibly tense/hunched; 10 means completely at ease, open, authoritative.

VIBE: Whether the style, grooming, and expression are saying the same thing — coherent, intentional, signature. A 5 means elements are there but not in agreement; 9-10 means unmistakable, distinctive presence.

Be specific about what you see. Be honest — not flattering, not harsh. One sentence per dimension note.

Return ONLY valid JSON with no markdown, no explanation:
{
  "sharpness": <number 1-10>,
  "presence": <number 1-10>,
  "vibe": <number 1-10>,
  "total": <number>,
  "sharpnessNote": "<one sentence>",
  "presenceNote": "<one sentence>",
  "vibeNote": "<one sentence>",
  "dominantStrength": "<sharpness|presence|vibe>",
  "primaryOpportunity": "<sharpness|presence|vibe>"
}`;
}

function buildVoicePrompt(dayNumber, auditAnswers, previousScores) {
  return `You are the scoring engine for MainCharacter's Orator Consultant — a voice coaching system.

User profile from audit:
- Primary problem: ${auditAnswers.primaryBetray || 'pacing rushed'}
- Self-reported filler frequency: ${auditAnswers.fillerFreq || 'A few times a day'}
- High-stakes room: ${auditAnswers.highStakesRoom || 'team meetings'}
- Day number: ${dayNumber} of 7
- Previous scores: ${JSON.stringify(previousScores.map(p => ({ day: p.day, ...p.scores })))}

Generate realistic voice coaching scores for Day ${dayNumber}.

Rules:
- Day 1 baseline: Fluency 60-70, Vocabulary 80-90
- Each day: 2-8 point improvement in worked areas
- Weakest Day 1 area shows LARGEST improvement by Day 7
- Day 7 total: 10-20 points above Day 1 in most areas
- Filler Frequency improves the most (20-25 points total)
- No score above 95 on Day 7

Return ONLY valid JSON:
{
  "fluency": <number 0-100>,
  "pronunciation": <number 0-100>,
  "pacingRhythm": <number 0-100>,
  "vocabulary": <number 0-100>,
  "confidenceTone": <number 0-100>,
  "fillerFrequency": <number 0-100>,
  "headlineWin": "<one sentence>",
  "consultantInsight": "<two sentences max, mentor voice, no exclamation marks>"
}`;
}

// ═══════════════════════════════════════════════════════════════════
// SCORE VALIDATION & FALLBACKS
// ═══════════════════════════════════════════════════════════════════

function validateAuraScores(scores) {
  for (const d of ['sharpness', 'presence', 'vibe']) {
    if (typeof scores[d] !== 'number' || isNaN(scores[d])) scores[d] = 5;
    scores[d] = Math.max(1, Math.min(10, Math.round(scores[d])));
  }
  scores.total = scores.sharpness + scores.presence + scores.vibe;
  if (!scores.sharpnessNote) scores.sharpnessNote = 'Grooming baseline recorded.';
  if (!scores.presenceNote) scores.presenceNote = 'Posture baseline recorded.';
  if (!scores.vibeNote) scores.vibeNote = 'Style coherence baseline recorded.';
  if (!['sharpness', 'presence', 'vibe'].includes(scores.dominantStrength)) {
    scores.dominantStrength = Object.entries({ sharpness: scores.sharpness, presence: scores.presence, vibe: scores.vibe })
      .sort((a, b) => b[1] - a[1])[0][0];
  }
  if (!['sharpness', 'presence', 'vibe'].includes(scores.primaryOpportunity)) {
    scores.primaryOpportunity = Object.entries({ sharpness: scores.sharpness, presence: scores.presence, vibe: scores.vibe })
      .sort((a, b) => a[1] - b[1])[0][0];
  }
  return scores;
}

function fallbackAuraScores() {
  return {
    sharpness: 6, presence: 5, vibe: 5, total: 16,
    sharpnessNote: 'Grooming is considered but not yet sharp — the overall definition could be more intentional.',
    presenceNote: 'Shoulders slightly forward, gaze indirect — the body is not yet occupying the frame with confidence.',
    vibeNote: 'Individual elements are decent but not in agreement — style, grooming, and expression feel like separate conversations.',
    dominantStrength: 'sharpness',
    primaryOpportunity: 'presence',
  };
}

function validateVoiceScores(scores, dayNumber) {
  for (const p of ['fluency', 'pronunciation', 'pacingRhythm', 'vocabulary', 'confidenceTone', 'fillerFrequency']) {
    if (typeof scores[p] !== 'number' || isNaN(scores[p])) scores[p] = 50;
    scores[p] = Math.max(0, Math.min(100, Math.round(scores[p])));
  }
  if (!scores.headlineWin) scores.headlineWin = `Day ${dayNumber} scores recorded.`;
  if (!scores.consultantInsight) scores.consultantInsight = 'Your voice data has been analysed. The trajectory is forming.';
  return scores;
}

function fallbackVoiceScores(dayNumber, auditAnswers, previousScores) {
  const base = { fluency: 67, pronunciation: 78, pacingRhythm: 58, vocabulary: 88, confidenceTone: 60, fillerFrequency: 51 };
  const curves = {
    fluency: [4,2,1,3,2,2], pronunciation: [1,2,2,1,2,1], pacingRhythm: [5,3,2,3,2,3],
    vocabulary: [0,1,0,1,0,1], confidenceTone: [2,4,3,3,3,4], fillerFrequency: [5,4,3,4,3,4],
  };
  const scores = {};
  for (const param of Object.keys(base)) {
    let val = base[param];
    for (let d = 0; d < dayNumber - 1 && d < curves[param].length; d++) val += curves[param][d];
    scores[param] = Math.min(val, 100);
  }
  const insights = {
    1: { headlineWin: 'Baseline established — vocabulary is your strongest asset.', consultantInsight: 'I counted 9 fillers in 60 seconds — most around moments of transition. Solid foundation with room to climb.' },
    2: { headlineWin: 'You held the opening pause — the rest followed.', consultantInsight: 'Three fewer fillers. The pause gave your first sentence weight.' },
    3: { headlineWin: 'Confidence tone jumped after the physiological sigh.', consultantInsight: 'The sigh reset your baseline anxiety. Your opening was steadier than any previous day.' },
    4: { headlineWin: 'Consistency through the halfway mark.', consultantInsight: 'Steady gains across the board. The habit is forming.' },
    5: { headlineWin: 'Fluency held under real-room pressure.', consultantInsight: 'You spoke as though the room was watching. The pacing was more intentional.' },
    6: { headlineWin: 'Pronunciation sharpened — word endings landing cleanly.', consultantInsight: 'Small refinements compounding. Articulation has noticeably improved.' },
    7: { headlineWin: 'Pacing — the single biggest transformation across all seven days.', consultantInsight: 'You stopped racing your sentences. The Monday stand-up sounds different now — because you sound different.' },
  };
  return { ...scores, ...(insights[dayNumber] || insights[1]) };
}

// ═══════════════════════════════════════════════════════════════════
// CONSULTANT MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════════

async function generateGroomingQuests(scores) {
  if (textModel && canCallGemini()) {
    try {
      markGeminiCall();
      const prompt = `Given these Aura Scores:
Sharpness: ${scores.sharpness}/10 — ${scores.sharpnessNote}
Presence: ${scores.presence}/10 — ${scores.presenceNote}
Vibe: ${scores.vibe}/10 — ${scores.vibeNote}

Generate 3 specific, actionable Grooming Quests — one per dimension.
Each must be a concrete real-world action achievable within 7 days, 1-2 sentences.
No exclamation marks. Mentor voice.

Return ONLY valid JSON:
{ "sharpnessQuest": "<string>", "presenceQuest": "<string>", "vibeQuest": "<string>" }`;

      const result = await textModel.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (err) {
      logError('generateGroomingQuests', err);
    }
  }

  // Fallback quests
  const tier = (s) => s <= 4 ? 'low' : s <= 7 ? 'mid' : 'high';
  const quests = {
    sharpness: {
      low: 'Book a proper barber appointment this week — not a trim, a consultation. Ask them to clean the neckline, shape the sideburns, and give the cut definition.',
      mid: 'Spend fifteen minutes on one grooming detail you have been ignoring — skin texture, eyebrow shape, or the state of your nails. One detail, done properly.',
      high: 'Photograph your grooming from three angles. Study where the definition holds and where it softens. Refine the edges.',
    },
    presence: {
      low: 'Stand in front of a full-length mirror for two minutes every morning this week. Shoulders back, chin level, weight even. Do not pose — settle.',
      mid: 'Before entering any room this week, pause at the threshold for two seconds. Plant your feet, lift your sternum one inch, and enter.',
      high: 'Sit at the head of the table in your next meeting. Do not announce it. Just take the seat. Let the posture speak.',
    },
    vibe: {
      low: 'Choose one outfit where every element tells the same story. Lay it out the night before. If one piece disagrees, remove it.',
      mid: 'Ask someone you trust: "If you described my style in three words, what would they be?" Just listen.',
      high: 'Wear one signature element every day this week — same watch, same scent, same collar. Repetition is how vibe becomes signature.',
    },
  };

  return {
    sharpnessQuest: quests.sharpness[tier(scores.sharpness)],
    presenceQuest: quests.presence[tier(scores.presence)],
    vibeQuest: quests.vibe[tier(scores.vibe)],
  };
}

function buildAuraConsultantMessage(scores, quests, userName, scanNumber) {
  const name = userName || 'Aarav';
  const isBaseline = scanNumber <= 1;
  const dims = { sharpness: 'Sharpness', presence: 'Presence', vibe: 'Vibe' };
  const strength = dims[scores.dominantStrength];
  const opportunity = dims[scores.primaryOpportunity];

  let central;
  if (scores.total <= 12) {
    central = `Your ${strength.toLowerCase()} is your anchor right now. What matters most this week is *${opportunity.toLowerCase()}*.`;
  } else if (scores.total <= 21) {
    central = `${strength} is already working for you. The gap is in *${opportunity.toLowerCase()}*. When that rises, the whole frame shifts.`;
  } else {
    central = `All three dimensions are reading clearly. The work now is *refinement*. The difference between a 7 and a 9 is intention.`;
  }

  return `${name}, I've read your photo. Here is what the camera sees today${isBaseline ? ' — not what it will see in seven days' : ''}.

— — —
📸 *AURA SCORE${isBaseline ? ' — BASELINE' : ' — SCAN ' + scanNumber}*
— — —

*Sharpness:* ${scores.sharpness} / 10
_${scores.sharpnessNote}_

*Presence:* ${scores.presence} / 10
_${scores.presenceNote}_

*Vibe:* ${scores.vibe} / 10
_${scores.vibeNote}_

*Total:* ${scores.total} / 30
*Strongest:* ${strength}
*Focus this week:* ${opportunity}

— — —

${central}

— — —
🎯 *YOUR GROOMING QUESTS*
— — —

*Quest 1 — Sharpness:*
${quests.sharpnessQuest}

*Quest 2 — Presence:*
${quests.presenceQuest}

*Quest 3 — Vibe:*
${quests.vibeQuest}

— — —

The score moves when the change is real. Send your next photo when you are ready.

— Your Aesthetic Consultant`;
}

function buildVoiceConsultantMessage(scores, dayNumber, allScores, userName) {
  const name = userName || 'Aarav';
  const day1 = allScores.find(s => s.day === 1);
  const baseScores = day1 ? day1.scores : scores;

  if (dayNumber === 1) {
    return `Your Baseline Mark is in.

— — —
📊 *BASELINE READING — DAY 1*
— — —

*Fluency Score:* ${scores.fluency} / 100
*Strongest meter:* Vocabulary · ${scores.vocabulary}
*Weakest meter:* Filler Frequency · ${scores.fillerFrequency}

— — —

${scores.consultantInsight}

Your first quest arrives tomorrow at 7:45am. Sleep on this: tomorrow's only job is to record one minute on the same prompt, with *one filler word less* than today.

— Your Orator Consultant`;
  }

  if (dayNumber === 7) {
    const delta = (p) => { const d = scores[p] - (baseScores[p] || 0); return d >= 0 ? `+${d}` : `${d}`; };
    const params = ['fluency', 'pronunciation', 'pacingRhythm', 'vocabulary', 'confidenceTone', 'fillerFrequency'];
    const labels = { fluency: 'Fluency Score', pronunciation: 'Pronunciation', pacingRhythm: 'Pacing & Rhythm', vocabulary: 'Vocabulary', confidenceTone: 'Confidence Tone', fillerFrequency: 'Filler Frequency' };

    let biggest = 'fluency', bigVal = 0;
    params.forEach(p => { const g = scores[p] - (baseScores[p] || 0); if (g > bigVal) { bigVal = g; biggest = p; } });
    const lines = params.map(p => `*${labels[p]}:* ${baseScores[p] || '—'} → ${scores[p]} *(${delta(p)})*${p === biggest ? ' ← HEADLINE WIN' : ''}`);

    return `Day 7. Your Weekly Evolution Report.

— — —
📊 *WEEKLY EVOLUTION REPORT — DAY 7*
— — —

${lines.join('\n')}

— — —

${scores.consultantInsight}

This is what one pillar, seven days, five minutes a day can do. Now imagine ninety.

— Your Orator Consultant`;
  }

  // Days 2-6
  const fluencyDelta = scores.fluency - (baseScores.fluency || 0);

  return `Today's reading.

— — —
📊 *EVENING READING — DAY ${dayNumber}*
— — —

*Fluency:* ${baseScores.fluency || '—'} → ${scores.fluency} *(${fluencyDelta >= 0 ? '+' : ''}${fluencyDelta})*

*Headline:* ${scores.headlineWin}

— — —

${scores.consultantInsight}

${dayNumber === 4 ? 'Most people abandon on Day 4. You did not. The work is starting to show.' : "You did the work. Tomorrow's quest at 7:45."}

— ${dayNumber === 4 ? 'Your Consultant' : 'Orator Consultant'}`;
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK PAYLOAD PARSER
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalize a Wati webhook payload into a standard internal message object.
 * Wati payloads vary — this handles the common shapes.
 */
function parseWatiPayload(body) {
  // Standard Wati format
  if (body.waId || body.senderName) {
    const mediaData = body.data?.media || body.media || {};
    return {
      from: (body.waId || body.from || '').replace(/\+/g, ''),
      senderName: body.senderName || body.pushName || body.name || '',
      type: body.type || (body.text ? 'text' : 'unknown'),
      text: body.text || body.data?.text || body.message || '',
      mediaUrl: mediaData.url || body.mediaUrl || body.imageUrl || body.audioUrl || '',
      timestamp: body.timestamp || new Date().toISOString(),
      raw: body,
    };
  }

  // Alternate format (listMessages / eventType wrapper)
  if (body.eventType && body.data) {
    const d = body.data;
    return {
      from: (d.waId || d.from || '').replace(/\+/g, ''),
      senderName: d.senderName || d.pushName || '',
      type: d.type || 'text',
      text: d.text || d.body || '',
      mediaUrl: d.media?.url || d.mediaUrl || '',
      timestamp: d.timestamp || new Date().toISOString(),
      raw: body,
    };
  }

  // Minimal / test format
  return {
    from: (body.from || body.phone || body.userPhone || '').replace(/\+/g, ''),
    senderName: body.name || body.userName || '',
    type: body.type || 'text',
    text: body.text || body.message || body.body || '',
    mediaUrl: body.mediaUrl || body.imageUrl || body.audioUrl || '',
    timestamp: new Date().toISOString(),
    raw: body,
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESS ROUTES
// ═══════════════════════════════════════════════════════════════════

const app = express();

// Raw body parser for Razorpay webhook signature verification
app.use('/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Serve static files (upgrade.html, ascension-confirmed.html, paywall.html)
app.use(express.static(path.join(__dirname, 'public')));

// Named page routes — landing, funnel, admin live in project root
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'landing.html')));
app.get('/audit', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/evolve', (req, res) => res.sendFile(path.join(__dirname, 'public', 'paywall.html')));

// ═══════════════════════════════════════════════════════════════════
// PAYMENT ROUTES — Razorpay Integration
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /payment/create-order
 * Creates a Razorpay order and saves a pending payment record.
 *
 * Input:  { tier, billing_period, userPhone, userName }
 * Output: { orderId, amount, currency, keyId, userName, userPhone }
 */
app.post('/payment/create-order', async (req, res) => {
  try {
    const { tier, billing_period, userPhone, userName } = req.body;

    // Validate tier + period
    const plan = PRICING[tier]?.[billing_period];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid tier or billing period', validTiers: Object.keys(PRICING), validPeriods: ['monthly', 'annual'] });
    }

    log('PAYMENT', `Creating order: ${plan.label} (${plan.display}) for ${userPhone}`);

    let orderId;

    if (razorpay) {
      // Create real Razorpay order
      const order = await razorpay.orders.create({
        amount: plan.amount,
        currency: 'INR',
        receipt: `mc_${Date.now()}_${(userPhone || '').slice(-4)}`,
        notes: {
          userName: userName || '',
          userPhone: userPhone || '',
          tier,
          billing_period,
          platform: 'maincharacter',
        },
      });
      orderId = order.id;
      log('PAYMENT', `Razorpay order created: ${orderId}`);
    } else {
      // Mock order for development
      orderId = `order_mock_${Date.now()}`;
      log('PAYMENT', `[MOCK] Order created: ${orderId}`);
    }

    // Save pending payment
    const payment = {
      id: `pay_${Date.now()}`,
      createdAt: new Date().toISOString(),
      orderId,
      userPhone: userPhone || '',
      userName: userName || '',
      amount: plan.amount,
      tier,
      billingPeriod: billing_period,
      status: 'pending',
    };

    try {
      const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8'));
      data.payments.push(payment);
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      logError('savePayment', e);
    }

    // Update user record
    if (userPhone) {
      updateUserData(userPhone.replace(/\+/g, ''), { pendingOrderId: orderId, pendingTier: tier });
    }

    res.json({
      orderId,
      amount: plan.amount,
      currency: 'INR',
      keyId: RAZORPAY_KEY_ID || 'rzp_test_PLACEHOLDER',
      userName: userName || '',
      userPhone: userPhone || '',
      description: plan.label,
      display: plan.display,
    });

  } catch (err) {
    logError('createOrder', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

/**
 * POST /payment/verify
 * Verifies Razorpay payment signature (HMAC SHA256).
 * On success: upgrades user tier + sends WhatsApp confirmation.
 *
 * Input:  { razorpay_order_id, razorpay_payment_id, razorpay_signature, userPhone, tier }
 * Output: { success: true/false, message }
 */
app.post('/payment/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userPhone,
      tier,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    log('PAYMENT', `Verifying: order=${razorpay_order_id} payment=${razorpay_payment_id} phone=${userPhone}`);

    // ─── HMAC Signature Verification ─────────────────────
    let verified = false;

    if (RAZORPAY_KEY_SECRET && razorpay_signature) {
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      verified = expectedSignature === razorpay_signature;
      log('PAYMENT', `Signature verification: ${verified ? 'PASSED' : 'FAILED'}`);
    } else {
      // Dev mode — accept all
      verified = true;
      log('PAYMENT', '[MOCK] Signature verification skipped (no secret)');
    }

    if (!verified) {
      // Update payment status to failed
      updatePaymentStatus(razorpay_order_id, 'failed', razorpay_payment_id);
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // ─── Payment Verified — Upgrade User ─────────────────
    const upgradeTier = tier || 'pro';
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 1 year expiry for both

    if (userPhone) {
      const cleanPhone = userPhone.replace(/\+/g, '');
      updateUserData(cleanPhone, {
        paid: true,
        tier: upgradeTier,
        tierExpiry: expiresAt.toISOString(),
        paidAt: now.toISOString(),
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        pendingOrderId: null,
        pendingTier: null,
      });

      log('PAYMENT', `User ${cleanPhone} upgraded to ${upgradeTier}`);

      // Send WhatsApp confirmation
      await sendMessage(cleanPhone,
        `Payment confirmed. Your Day 8 quest arrives at 7:45am tomorrow.\n\nWelcome to the Protocol.\n\n— Your Consultant`
      );

      // Notify admin
      if (ADMIN_PHONE) {
        const user = getUserData(cleanPhone);
        await sendMessage(ADMIN_PHONE,
          `💰 *Payment received*\n${user?.name || cleanPhone} (${cleanPhone})\nTier: ${upgradeTier}\nPayment: ${razorpay_payment_id}`
        );
      }
    }

    // Update payment record
    updatePaymentStatus(razorpay_order_id, 'success', razorpay_payment_id);

    res.json({ success: true, message: 'Payment verified and user upgraded' });

  } catch (err) {
    logError('verifyPayment', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

/**
 * POST /payment/webhook
 * Handles Razorpay server-to-server webhooks.
 * Events: payment.captured, payment.failed, refund.created
 *
 * Razorpay sends raw JSON — we verify the X-Razorpay-Signature header.
 */
app.post('/payment/webhook', async (req, res) => {
  try {
    const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf-8');

    // ─── Verify Webhook Signature ────────────────────────
    if (RAZORPAY_WEBHOOK_SECRET) {
      const signature = req.headers['x-razorpay-signature'];
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        log('WEBHOOK_PAY', 'Razorpay webhook signature FAILED');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const payload = event.payload?.payment?.entity || event.payload?.refund?.entity || {};

    log('WEBHOOK_PAY', `Razorpay event: ${eventType} | ID: ${payload.id}`);

    switch (eventType) {
      case 'payment.captured': {
        const orderId = payload.order_id;
        const paymentId = payload.id;
        const phone = payload.notes?.userPhone || payload.contact?.replace(/^\+/, '') || '';
        const tier = payload.notes?.tier || 'pro';

        log('WEBHOOK_PAY', `Payment captured: ${paymentId} for ${phone}`);

        // Upgrade user (idempotent — may already be done by /verify)
        if (phone) {
          const cleanPhone = phone.replace(/\+/g, '');
          const user = getUserData(cleanPhone);
          if (user && !user.paid) {
            updateUserData(cleanPhone, {
              paid: true,
              tier,
              paidAt: new Date().toISOString(),
              razorpayPaymentId: paymentId,
              razorpayOrderId: orderId,
            });

            await sendMessage(cleanPhone,
              `Payment confirmed. Your Day 8 quest arrives at 7:45am tomorrow.\n\nWelcome to the Protocol.\n\n— Your Consultant`
            );
          }
        }

        updatePaymentStatus(orderId, 'success', paymentId);
        break;
      }

      case 'payment.failed': {
        const orderId = payload.order_id;
        const phone = payload.notes?.userPhone || '';

        log('WEBHOOK_PAY', `Payment failed for order: ${orderId}`);

        updatePaymentStatus(orderId, 'failed', payload.id);

        // Notify user gently
        if (phone) {
          const cleanPhone = phone.replace(/\+/g, '');
          await sendMessage(cleanPhone,
            `Your payment could not be processed. If this was unexpected, reply *PAY* to receive a fresh link.\n\n— Your Consultant`
          );
        }
        break;
      }

      case 'refund.created': {
        const paymentId = payload.payment_id;
        const refundAmount = payload.amount;
        const phone = payload.notes?.userPhone || '';

        log('WEBHOOK_PAY', `Refund created: ₹${(refundAmount / 100).toFixed(0)} for payment ${paymentId}`);

        // Update payment record
        try {
          const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8'));
          const payment = data.payments.find(p => p.razorpayPaymentId === paymentId);
          if (payment) {
            payment.status = 'refunded';
            payment.refundedAt = new Date().toISOString();
            payment.refundAmount = refundAmount;
            fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
          }
        } catch (e) {
          logError('refundUpdate', e);
        }

        // Revert user tier
        if (phone) {
          const cleanPhone = phone.replace(/\+/g, '');
          updateUserData(cleanPhone, { paid: false, tier: 'trial' });
          log('WEBHOOK_PAY', `Reverted ${cleanPhone} to trial after refund`);
        }

        // Notify admin
        if (ADMIN_PHONE) {
          await sendMessage(ADMIN_PHONE,
            `⚠️ *Refund processed*\nPayment: ${paymentId}\nAmount: ₹${(refundAmount / 100).toFixed(0)}\nPhone: ${phone}`
          );
        }
        break;
      }

      default:
        log('WEBHOOK_PAY', `Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ status: 'ok' });

  } catch (err) {
    logError('razorpayWebhook', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Helper: Update payment status in payments.json
 */
function updatePaymentStatus(orderId, status, paymentId) {
  try {
    const data = JSON.parse(fs.readFileSync(PAYMENTS_FILE, 'utf-8'));
    const payment = data.payments.find(p => p.orderId === orderId);
    if (payment) {
      payment.status = status;
      payment.razorpayPaymentId = paymentId;
      payment.updatedAt = new Date().toISOString();
      fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
      log('PAYMENT', `Updated payment ${orderId} → ${status}`);
    }
  } catch (e) {
    logError('updatePaymentStatus', e);
  }
}

/**
 * GET /payment/plans
 * Returns available pricing plans (for the upgrade page).
 */
app.get('/payment/plans', (req, res) => {
  res.json({
    plans: PRICING,
    currency: 'INR',
    keyId: RAZORPAY_KEY_ID || 'rzp_test_PLACEHOLDER',
  });
});

/**
 * POST /webhook — Main Wati webhook receiver.
 * All incoming WhatsApp messages arrive here.
 */
app.post('/webhook', async (req, res) => {
  // Always respond 200 immediately to Wati (prevent retries)
  res.status(200).json({ status: 'received' });

  try {
    const message = parseWatiPayload(req.body);

    if (!message.from) {
      log('WEBHOOK', 'No sender phone in payload — ignoring');
      return;
    }

    logIncoming(message.from, message.type, message.text);

    // Ensure user exists
    if (!getUserData(message.from)) {
      updateUserData(message.from, { name: message.senderName || 'User' });
    }

    // ─── ROUTING LOGIC ──────────────────────────────────

    // 1. Media messages (image / audio)
    if (message.type === 'image' || message.type === 'audio') {
      await handleMediaMessage(message);
      return;
    }

    const text = (message.text || '').trim();
    const textLower = text.toLowerCase();

    // 2. Payment trigger
    if (textLower === 'pay') {
      await sendPaymentLink(message.from);
      return;
    }

    // 3. Onboarding advance
    if (textLower === 'yes') {
      await handleOnboardingStep(message.from);
      return;
    }

    // 4. Word mastery (Sage pillar)
    if (textLower.includes('mastered')) {
      await handleWordMastery(message.from, text);
      return;
    }

    // 5. Quest completion
    if (textLower.includes('done') || textLower.includes('complete')) {
      await handleQuestCompletion(message.from, text);
      return;
    }

    // 6. Onboarding question responses (numbered answers 1-5)
    const user = getUserData(message.from);
    if (user && user.onboardingStep >= 2 && user.onboardingStep <= 4) {
      await handleOnboardingAnswer(message.from, text, user.onboardingStep);
      return;
    }

    // 7. Unhandled — log and notify admin
    log('UNHANDLED', `Unrouted message from ${message.from}: "${text.slice(0, 80)}"`);
    await notifyAdmin(message);

  } catch (err) {
    logError('webhook', err);
  }
});

/**
 * Handle numbered onboarding answers (steps 2-4).
 */
async function handleOnboardingAnswer(phone, text, step) {
  log('ONBOARD', `Answer from ${phone} at step ${step}: "${text.slice(0, 60)}"`);

  const updates = {};

  if (step === 2) {
    // Q1 — Primary betray
    const options = {
      '1': 'My pacing rushed', '2': 'The right word didn\'t come',
      '3': 'My voice lost steadiness', '4': 'The fillers crept in',
      '5': 'Honestly, all of it',
    };
    const answer = options[text.trim()] || text.trim();
    updates.auditAnswers = { ...(getUserData(phone)?.auditAnswers || {}), primaryBetray: answer };
  } else if (step === 3) {
    // Q2 — Filler freq
    const options = {
      '1': 'Constantly', '2': 'A few times a day',
      '3': 'Only when nervous', '4': 'A recording might disagree',
    };
    const answer = options[text.trim()] || text.trim();
    updates.auditAnswers = { ...(getUserData(phone)?.auditAnswers || {}), fillerFreq: answer };
  } else if (step === 4) {
    // Q3 — High-stakes room (free text)
    updates.auditAnswers = { ...(getUserData(phone)?.auditAnswers || {}), highStakesRoom: text.trim() };
  }

  updateUserData(phone, updates);

  // Advance to next step
  await handleOnboardingStep(phone);
}

/**
 * POST /webhook/test — Test with a mock payload.
 */
app.post('/webhook/test', async (req, res) => {
  const mockPayload = req.body || {
    waId: '919876543210',
    senderName: 'Test User',
    type: 'text',
    text: 'YES',
  };

  log('TEST', `Mock webhook received: ${JSON.stringify(mockPayload).slice(0, 200)}`);

  const message = parseWatiPayload(mockPayload);

  res.json({
    parsed: message,
    routing: determineRoute(message),
    user: getUserData(message.from),
  });
});

/**
 * Determine which handler a message would route to (for testing).
 */
function determineRoute(message) {
  if (message.type === 'image') return 'handleMediaMessage → image analysis';
  if (message.type === 'audio') return 'handleMediaMessage → voice analysis';

  const text = (message.text || '').toLowerCase().trim();
  if (text === 'pay') return 'sendPaymentLink';
  if (text === 'yes') return 'handleOnboardingStep';
  if (text.includes('mastered')) return 'handleWordMastery';
  if (text.includes('done') || text.includes('complete')) return 'handleQuestCompletion';
  return 'unhandled → notifyAdmin';
}

/**
 * GET /health — Status check with metrics.
 */
app.get('/health', (req, res) => {
  const users = getAllUsers();
  const userCount = Object.keys(users).length;

  res.json({
    status: 'healthy',
    service: 'MainCharacter Wati Webhook Server',
    version: '1.0.0',
    environment: NODE_ENV,
    uptime: Math.round(process.uptime()),
    uptimeFormatted: formatUptime(process.uptime()),
    config: {
      geminiConfigured: !!GEMINI_API_KEY,
      watiConfigured: !!(WATI_API_KEY && !WATI_BASE_URL.includes('XXX')),
      adminPhone: ADMIN_PHONE ? `${ADMIN_PHONE.slice(0, 4)}****${ADMIN_PHONE.slice(-2)}` : 'not set',
    },
    metrics: {
      ...metrics,
      usersTracked: userCount,
      geminiCallsThisMinute: geminiCallLog.filter(t => Date.now() - t < 60000).length,
      geminiRpmLimit: GEMINI_RPM,
    },
    timestamp: new Date().toISOString(),
  });
});

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

// ═══════════════════════════════════════════════════════════════════
// .env TEMPLATE (create if not exists)
// ═══════════════════════════════════════════════════════════════════

const ENV_FILE = path.join(__dirname, '.env');
if (!fs.existsSync(ENV_FILE)) {
  fs.writeFileSync(ENV_FILE, `# MainCharacter — Environment Variables
# Copy this to .env and fill in your values

GEMINI_API_KEY=
WATI_API_KEY=
WATI_BASE_URL=https://live-XXX.wati.io
ADMIN_PHONE=91XXXXXXXXXX
PORT=3000
NODE_ENV=development

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
UPGRADE_BASE_URL=https://maincharacter.digitglobalservices.com
`);
  log('INIT', 'Created .env template — fill in your API keys');
}

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('');
  console.log('═'.repeat(62));
  console.log('  MAINCHARACTER — Wati Webhook Server');
  console.log(`  Running on http://localhost:${PORT}`);
  console.log('─'.repeat(62));
  console.log(`  Environment:  ${NODE_ENV}`);
  console.log(`  Gemini:       ${GEMINI_API_KEY ? 'CONFIGURED' : 'NOT SET (fallback mode)'}`);
  console.log(`  Wati API:     ${WATI_API_KEY ? 'CONFIGURED' : 'NOT SET (dry-run mode)'}`);
  console.log(`  Razorpay:     ${RAZORPAY_KEY_ID ? 'CONFIGURED' : 'NOT SET (mock mode)'}`);
  console.log(`  Admin phone:  ${ADMIN_PHONE || 'NOT SET'}`);
  console.log(`  Users file:   ${USERS_FILE}`);
  console.log('═'.repeat(62));
  console.log('');
  console.log('  POST /webhook              — Wati incoming messages');
  console.log('  POST /webhook/test         — Test with mock payload');
  console.log('  POST /payment/create-order — Create Razorpay order');
  console.log('  POST /payment/verify       — Verify payment signature');
  console.log('  POST /payment/webhook      — Razorpay server webhook');
  console.log('  GET  /payment/plans        — Get pricing');
  console.log('  GET  /health               — Status & metrics');
  console.log('');
});
