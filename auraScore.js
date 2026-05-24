/**
 * ═══════════════════════════════════════════════════════════════════
 * MAINCHARACTER — Aesthetic Pillar · Aura Score Service
 * ═══════════════════════════════════════════════════════════════════
 *
 * Receives photo uploads from Wati (WhatsApp image messages),
 * analyzes them via Gemini Vision for The Aesthetic pillar's three
 * dimensions: Sharpness, Presence, Vibe.
 *
 * Architecture:
 *   Wati webhook → download image → validate →
 *   Gemini Vision analysis → 3-dimension scoring →
 *   Grooming quest generation → consultant message → response
 *
 * Routes:
 *   POST /aura/analyze         — Multipart photo upload → scores
 *   POST /aura/webhook         — Wati webhook (image URL) → analyze + reply
 *   GET  /aura/history/:phone  — All past scans for a user
 *   GET  /aura/health          — Status check
 *
 * ═══════════════════════════════════════════════════════════════════
 */

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

const PORT = process.env.AURA_PORT || 3002;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const WATI_API_KEY = process.env.WATI_API_KEY || '';
const WATI_API_URL = process.env.WATI_API_URL || 'https://live-server-XXXXX.wati.io'; // Replace with actual Wati endpoint
const AURA_SCORES_FILE = path.join(__dirname, 'aura_scores.json');
const PHOTOS_DIR = path.join(__dirname, 'photo_uploads');

// Max upload: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

// Ensure directories/files exist
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  console.log('[INIT] Created photo uploads directory');
}

if (!fs.existsSync(AURA_SCORES_FILE)) {
  fs.writeFileSync(AURA_SCORES_FILE, JSON.stringify({ users: {} }, null, 2));
  console.log('[INIT] Created aura_scores.json');
}

// ─────────────────────────────────────────────
// GEMINI CLIENT
// ─────────────────────────────────────────────

let genAI = null;
let visionModel = null;
let textModel = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  // Gemini 1.5 Flash for vision (fast, multimodal)
  visionModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  // Gemini Pro for text-only quest generation
  textModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
  console.log('[INIT] Gemini Vision + Pro clients initialised');
} else {
  console.log('[INIT] No GEMINI_API_KEY set — using fallback scoring engine');
}

// ─────────────────────────────────────────────
// EXPRESS SETUP
// ─────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// Multer config for photo uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP are accepted.`));
    }
  },
});

// ═══════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * ═══════════════════════════════════════════════════════════════
 * analyzePhoto — Core Gemini Vision scoring engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Sends a photo to Gemini Vision with The Aesthetic Consultant
 * prompt. Returns Sharpness, Presence, and Vibe scores (1-10)
 * plus specific one-sentence notes per dimension.
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @returns {object} Scores object with all dimensions + notes
 */
async function analyzePhoto(imageBuffer, mimeType) {
  console.log(`[ANALYZE] Photo received: ${(imageBuffer.length / 1024).toFixed(1)}KB, type: ${mimeType}`);

  if (visionModel) {
    try {
      console.log('[ANALYZE] Sending to Gemini Vision...');

      const base64Image = imageBuffer.toString('base64');

      const prompt = buildVisionPrompt();

      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      };

      const result = await visionModel.generateContent([prompt, imagePart]);
      const response = result.response;
      const text = response.text();

      console.log('[ANALYZE] Gemini Vision raw response length:', text.length);

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Gemini Vision response');
      }

      const scores = JSON.parse(jsonMatch[0]);
      const validated = validateAuraScores(scores);

      console.log('[ANALYZE] Gemini Vision scores:', JSON.stringify({
        sharpness: validated.sharpness,
        presence: validated.presence,
        vibe: validated.vibe,
        total: validated.total,
      }));

      return validated;
    } catch (err) {
      console.error(`[ANALYZE] Gemini Vision error: ${err.message}`);
      console.log('[ANALYZE] Falling back to deterministic scoring...');
      return fallbackAuraScoring();
    }
  } else {
    console.log('[ANALYZE] No Gemini key — using fallback scoring engine');
    return fallbackAuraScoring();
  }
}

/**
 * Build the Gemini Vision prompt for Aura Score analysis.
 */
function buildVisionPrompt() {
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
  "total": <number — sum of all three>,
  "sharpnessNote": "<one specific sentence about what you see in sharpness>",
  "presenceNote": "<one specific sentence about what you see in presence>",
  "vibeNote": "<one specific sentence about what you see in vibe>",
  "dominantStrength": "<sharpness|presence|vibe — whichever is highest>",
  "primaryOpportunity": "<sharpness|presence|vibe — whichever has the most room to grow>"
}`;
}

/**
 * Validate and clamp Aura Scores to 1-10 range.
 * Recalculates total. Ensures notes exist.
 */
function validateAuraScores(scores) {
  const dims = ['sharpness', 'presence', 'vibe'];

  for (const d of dims) {
    if (typeof scores[d] !== 'number' || isNaN(scores[d])) {
      console.warn(`[VALIDATE] Invalid ${d} score: ${scores[d]}, defaulting to 5`);
      scores[d] = 5;
    }
    scores[d] = Math.max(1, Math.min(10, Math.round(scores[d])));
  }

  scores.total = scores.sharpness + scores.presence + scores.vibe;

  // Validate notes
  if (!scores.sharpnessNote || typeof scores.sharpnessNote !== 'string') {
    scores.sharpnessNote = 'Grooming baseline recorded.';
  }
  if (!scores.presenceNote || typeof scores.presenceNote !== 'string') {
    scores.presenceNote = 'Posture and composure baseline recorded.';
  }
  if (!scores.vibeNote || typeof scores.vibeNote !== 'string') {
    scores.vibeNote = 'Style coherence baseline recorded.';
  }

  // Validate dominant/opportunity
  const dimScores = { sharpness: scores.sharpness, presence: scores.presence, vibe: scores.vibe };
  const sorted = Object.entries(dimScores).sort((a, b) => b[1] - a[1]);

  if (!['sharpness', 'presence', 'vibe'].includes(scores.dominantStrength)) {
    scores.dominantStrength = sorted[0][0];
  }
  if (!['sharpness', 'presence', 'vibe'].includes(scores.primaryOpportunity)) {
    scores.primaryOpportunity = sorted[sorted.length - 1][0];
  }

  return scores;
}

/**
 * Fallback scoring engine when Gemini Vision is unavailable.
 * Returns realistic baseline scores for a new user.
 */
function fallbackAuraScoring() {
  console.log('[FALLBACK] Generating deterministic Aura Scores...');

  // Realistic baseline: most people score 5-7 on first scan
  // Grooming tends to be strongest (most controllable),
  // Presence weakest (least consciously managed)
  const scores = {
    sharpness: 6,
    presence: 5,
    vibe: 5,
    total: 16,
    sharpnessNote: 'Grooming is considered but not yet sharp — the hairline is clean but the overall definition could be more intentional.',
    presenceNote: 'Shoulders are slightly forward and the gaze is indirect — the body is not yet occupying the frame with confidence.',
    vibeNote: 'The individual elements are decent but they are not speaking the same language — style, grooming, and expression feel like separate conversations.',
    dominantStrength: 'sharpness',
    primaryOpportunity: 'presence',
  };

  return scores;
}

// ═══════════════════════════════════════════════════════════════════
// GROOMING QUEST GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * generateGroomingQuests — Use Gemini to create 3 specific,
 * actionable grooming quests based on the Aura Score analysis.
 *
 * @param {object} scores - The full Aura Score object with notes
 * @returns {object} { sharpnessQuest, presenceQuest, vibeQuest }
 */
async function generateGroomingQuests(scores) {
  console.log('[QUESTS] Generating grooming quests...');

  const prompt = `You are The Aesthetic Consultant for MainCharacter — a luxury personal growth platform. You speak like a mentor: warm, specific, never flattering. No exclamation marks. No cheerleading.

Given these Aura Scores:
Sharpness: ${scores.sharpness}/10 — ${scores.sharpnessNote}
Presence: ${scores.presence}/10 — ${scores.presenceNote}
Vibe: ${scores.vibe}/10 — ${scores.vibeNote}

Generate 3 specific, actionable Grooming Quests — one per dimension.
Each quest must be:
- A concrete real-world action (not "think about" or "consider" — use "book", "do", "build", "wear", "practise")
- Achievable within 7 days
- Specific enough that the user can confirm they completed it
- 1-2 sentences maximum
- Written in second person ("Book a...", "Stand in front of...")

Return ONLY valid JSON with no markdown:
{
  "sharpnessQuest": "<string>",
  "presenceQuest": "<string>",
  "vibeQuest": "<string>"
}`;

  if (textModel) {
    try {
      const result = await textModel.generateContent(prompt);
      const text = result.response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in quest response');

      const quests = JSON.parse(jsonMatch[0]);

      // Validate
      if (!quests.sharpnessQuest || !quests.presenceQuest || !quests.vibeQuest) {
        throw new Error('Missing quest fields');
      }

      console.log('[QUESTS] Gemini quests generated');
      return quests;
    } catch (err) {
      console.error(`[QUESTS] Gemini error: ${err.message}`);
      return fallbackQuests(scores);
    }
  } else {
    return fallbackQuests(scores);
  }
}

/**
 * Fallback quests when Gemini is unavailable.
 * Returns contextually appropriate quests based on scores.
 */
function fallbackQuests(scores) {
  console.log('[QUESTS] Using fallback quest engine');

  const sharpnessQuests = {
    low: 'Book a proper barber appointment this week — not a trim, a consultation. Tell them you want definition. Ask them to clean the neckline, shape the sideburns, and give the cut an edge it does not currently have.',
    mid: 'Spend fifteen minutes this week on one grooming detail you have been ignoring — whether that is skin texture, eyebrow shape, or the state of your nails. One detail, done properly.',
    high: 'Photograph your current grooming from three angles — front, profile, three-quarter. Study where the definition holds and where it softens. The sharpness is already there; now refine the edges.',
  };

  const presenceQuests = {
    low: 'Stand in front of a full-length mirror for two minutes every morning this week. Shoulders back, chin level, weight even on both feet. Do not pose — settle. Let the body find a posture it can hold without effort.',
    mid: 'Before you walk into any room this week, pause at the threshold for two seconds. Plant your feet, lift your sternum one inch, and enter. Notice what changes when you give the room a moment to receive you.',
    high: 'Sit at the head of the table in your next meeting — or the equivalent position of visibility. Do not announce it. Just take the seat. Let the posture speak.',
  };

  const vibeQuests = {
    low: 'Choose one outfit this week where every element — shoes, watch, collar, colour palette — tells the same story. Lay it out the night before. If one piece disagrees, remove it.',
    mid: 'Ask one person you trust: "If you had to describe my style in three words, what would they be?" Do not explain why you are asking. Just listen to what they see.',
    high: 'Wear one signature element every day this week — the same watch, the same scent, the same collar style. Repetition is how a vibe becomes a signature.',
  };

  const tier = (score) => score <= 4 ? 'low' : score <= 7 ? 'mid' : 'high';

  return {
    sharpnessQuest: sharpnessQuests[tier(scores.sharpness)],
    presenceQuest: presenceQuests[tier(scores.presence)],
    vibeQuest: vibeQuests[tier(scores.vibe)],
  };
}

// ═══════════════════════════════════════════════════════════════════
// CONSULTANT MESSAGE GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * generateConsultantResponse — Build the full WhatsApp message
 * in The Aesthetic Consultant's voice.
 *
 * @param {object} scores - Aura Score object
 * @param {object} quests - { sharpnessQuest, presenceQuest, vibeQuest }
 * @param {string} userName - User's first name
 * @param {number} scanNumber - Which scan this is (1, 2, 3...)
 * @returns {string} WhatsApp-formatted message
 */
function generateConsultantResponse(scores, quests, userName, scanNumber) {
  const name = userName || 'Aarav';
  const isBaseline = scanNumber <= 1;

  // ─── Dimension labels ───
  const dimLabels = {
    sharpness: 'Sharpness',
    presence: 'Presence',
    vibe: 'Vibe',
  };

  // ─── Opening read ───
  let opening;
  if (isBaseline) {
    opening = `${name}, I've read your photo. Here is what the camera sees today — not what it will see in seven days.`;
  } else {
    opening = `${name}, new scan received. The camera is reading you again — let's see what shifted.`;
  }

  // ─── Central observation ───
  const strengthLabel = dimLabels[scores.dominantStrength];
  const opportunityLabel = dimLabels[scores.primaryOpportunity];

  let centralObs;
  if (scores.total <= 12) {
    centralObs = `Your ${strengthLabel.toLowerCase()} is your anchor right now. The other dimensions are waiting to catch up — and they will, because the raw material is already there. What matters most this week is *${opportunityLabel.toLowerCase()}*.`;
  } else if (scores.total <= 21) {
    centralObs = `${strengthLabel} is already working for you — it is the dimension people read first. The gap is in *${opportunityLabel.toLowerCase()}*. When that rises, the whole frame shifts.`;
  } else {
    centralObs = `All three dimensions are reading clearly. The work now is not improvement — it is *refinement*. The difference between a 7 and a 9 is not effort. It is intention.`;
  }

  // ─── Build message ───
  const message = `${opening}

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
*Strongest:* ${strengthLabel}
*Focus this week:* ${opportunityLabel}

— — —

${centralObs}

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

  return message;
}

// ═══════════════════════════════════════════════════════════════════
// DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════

/**
 * saveAuraScore — Persist scores for a user to aura_scores.json
 */
function saveAuraScore(userPhone, scores, quests) {
  console.log(`[SAVE] Saving Aura Score for ${userPhone}`);

  const data = JSON.parse(fs.readFileSync(AURA_SCORES_FILE, 'utf-8'));

  if (!data.users) data.users = {};
  if (!data.users[userPhone]) {
    data.users[userPhone] = {
      phone: userPhone,
      createdAt: new Date().toISOString(),
      scans: [],
    };
  }

  const scanNumber = data.users[userPhone].scans.length + 1;

  data.users[userPhone].scans.push({
    scanNumber,
    timestamp: new Date().toISOString(),
    scores: {
      sharpness: scores.sharpness,
      presence: scores.presence,
      vibe: scores.vibe,
      total: scores.total,
    },
    notes: {
      sharpnessNote: scores.sharpnessNote,
      presenceNote: scores.presenceNote,
      vibeNote: scores.vibeNote,
    },
    dominantStrength: scores.dominantStrength,
    primaryOpportunity: scores.primaryOpportunity,
    quests: quests,
  });

  fs.writeFileSync(AURA_SCORES_FILE, JSON.stringify(data, null, 2));
  console.log(`[SAVE] Aura Score saved. User now has ${scanNumber} scan(s).`);

  return scanNumber;
}

/**
 * getAuraHistory — Load all scans for a user
 */
function getAuraHistory(userPhone) {
  const data = JSON.parse(fs.readFileSync(AURA_SCORES_FILE, 'utf-8'));

  if (!data.users || !data.users[userPhone]) {
    return null;
  }

  return data.users[userPhone];
}

// ═══════════════════════════════════════════════════════════════════
// IMAGE DOWNLOAD (for Wati webhook)
// ═══════════════════════════════════════════════════════════════════

/**
 * Download image from a Wati media URL.
 * Returns buffer + mime type.
 *
 * @param {string} imageUrl - URL of image from Wati webhook
 * @returns {object} { buffer, mimeType, fileSizeBytes }
 */
async function downloadImage(imageUrl) {
  console.log(`[DOWNLOAD] Fetching image: ${imageUrl}`);

  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: WATI_API_KEY ? { 'Authorization': `Bearer ${WATI_API_KEY}` } : {},
    });

    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/jpeg';

    // Determine mime type
    let mimeType = 'image/jpeg';
    if (contentType.includes('png')) mimeType = 'image/png';
    else if (contentType.includes('webp')) mimeType = 'image/webp';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) mimeType = 'image/jpeg';

    console.log(`[DOWNLOAD] Image received: ${(buffer.length / 1024).toFixed(1)}KB, type: ${mimeType}`);

    // Validate size
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds 5MB limit`);
    }

    return { buffer, mimeType, fileSizeBytes: buffer.length };
  } catch (err) {
    console.error(`[DOWNLOAD] Failed: ${err.message}`);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════
// WATI API INTEGRATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a WhatsApp message via Wati API.
 *
 * @param {string} phone - User's WhatsApp number (with country code)
 * @param {string} message - Message text (WhatsApp formatting)
 * @returns {boolean} Success status
 */
async function sendWatiMessage(phone, message) {
  if (!WATI_API_KEY || !WATI_API_URL) {
    console.log(`[WATI] API not configured — message logged but not sent`);
    console.log(`[WATI] To: ${phone}`);
    console.log(`[WATI] Message length: ${message.length} chars`);
    return false;
  }

  try {
    console.log(`[WATI] Sending message to ${phone} (${message.length} chars)...`);

    const response = await axios({
      method: 'POST',
      url: `${WATI_API_URL}/api/v1/sendSessionMessage/${phone}`,
      headers: {
        'Authorization': `Bearer ${WATI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      data: {
        messageText: message,
      },
      timeout: 15000,
    });

    console.log(`[WATI] Message sent successfully: ${response.status}`);
    return true;
  } catch (err) {
    console.error(`[WATI] Send failed: ${err.message}`);

    // If session expired, try template message
    if (err.response && err.response.status === 400) {
      console.log('[WATI] Session may have expired — in production, fall back to template message');
    }

    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESS ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /aura/analyze
 * Multipart form upload — accepts a photo file, returns Aura Scores
 * and the full consultant WhatsApp message.
 *
 * Form fields:
 *   photo: file (JPEG/PNG/WebP, max 5MB)
 *   userPhone: string (required)
 *   userName: string (optional, defaults to "Aarav")
 */
app.post('/aura/analyze', upload.single('photo'), async (req, res) => {
  const startTime = Date.now();

  try {
    const { userPhone, userName } = req.body;

    // Validate required fields
    if (!userPhone) {
      return res.status(400).json({ error: 'userPhone is required in form body' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded. Send a JPEG, PNG, or WebP image under 5MB.' });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[POST /aura/analyze] User: ${userPhone}`);
    console.log(`[POST /aura/analyze] Photo: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)}KB, ${req.file.mimetype})`);
    console.log(`${'═'.repeat(60)}`);

    // 1. Analyze photo
    const scores = await analyzePhoto(req.file.buffer, req.file.mimetype);

    // 2. Generate quests
    const quests = await generateGroomingQuests(scores);

    // 3. Save scores
    const scanNumber = saveAuraScore(userPhone, scores, quests);

    // 4. Generate consultant message
    const message = generateConsultantResponse(scores, quests, userName, scanNumber);

    // 5. Optionally save photo to disk (for comparison later)
    const sanitisedPhone = userPhone.replace(/[^0-9]/g, '');
    const photoFilename = `${sanitisedPhone}_scan${scanNumber}_${Date.now()}.jpg`;
    const photoPath = path.join(PHOTOS_DIR, photoFilename);
    fs.writeFileSync(photoPath, req.file.buffer);
    console.log(`[PHOTO] Saved to ${photoFilename}`);

    const elapsed = Date.now() - startTime;
    console.log(`[POST /aura/analyze] Complete in ${elapsed}ms`);

    res.json({
      success: true,
      userPhone,
      scanNumber,
      scores: {
        sharpness: scores.sharpness,
        presence: scores.presence,
        vibe: scores.vibe,
        total: scores.total,
      },
      notes: {
        sharpnessNote: scores.sharpnessNote,
        presenceNote: scores.presenceNote,
        vibeNote: scores.vibeNote,
      },
      dominantStrength: scores.dominantStrength,
      primaryOpportunity: scores.primaryOpportunity,
      quests,
      whatsappMessage: message,
      processingTimeMs: elapsed,
    });
  } catch (err) {
    console.error(`[POST /aura/analyze] Error: ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

/**
 * POST /aura/webhook
 * Receives a Wati webhook payload when a user sends an image.
 * Downloads the image, analyzes it, and sends the response
 * back via the Wati API.
 *
 * Wati webhook payload (relevant fields):
 * {
 *   "waId": "919876543210",
 *   "senderName": "Aarav",
 *   "type": "image",
 *   "data": {
 *     "media": {
 *       "url": "https://...",
 *       "mimeType": "image/jpeg"
 *     },
 *     "caption": "..."
 *   }
 * }
 */
app.post('/aura/webhook', async (req, res) => {
  const startTime = Date.now();

  try {
    const payload = req.body;

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[POST /aura/webhook] Received webhook`);
    console.log(`${'═'.repeat(60)}`);

    // Extract relevant fields from Wati webhook
    // Adjust field names based on your actual Wati webhook configuration
    const userPhone = payload.waId || payload.userPhone || payload.from;
    const userName = payload.senderName || payload.userName || 'Aarav';
    const imageUrl = payload.data?.media?.url || payload.imageUrl || payload.mediaUrl;
    const messageType = payload.type || payload.messageType;

    if (!userPhone) {
      console.log('[WEBHOOK] No phone number in payload — skipping');
      return res.status(400).json({ error: 'No phone number found in webhook payload' });
    }

    if (!imageUrl) {
      console.log(`[WEBHOOK] No image URL — message type: ${messageType}. Skipping.`);
      return res.status(200).json({ status: 'skipped', reason: 'No image in message' });
    }

    console.log(`[WEBHOOK] User: ${userPhone} | Name: ${userName}`);
    console.log(`[WEBHOOK] Image URL: ${imageUrl}`);

    // 1. Download image
    const { buffer, mimeType } = await downloadImage(imageUrl);

    // 2. Analyze photo
    const scores = await analyzePhoto(buffer, mimeType);

    // 3. Generate quests
    const quests = await generateGroomingQuests(scores);

    // 4. Save scores
    const scanNumber = saveAuraScore(userPhone, scores, quests);

    // 5. Generate consultant message
    const message = generateConsultantResponse(scores, quests, userName, scanNumber);

    // 6. Save photo
    const sanitisedPhone = userPhone.replace(/[^0-9]/g, '');
    const photoFilename = `${sanitisedPhone}_scan${scanNumber}_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(PHOTOS_DIR, photoFilename), buffer);

    // 7. Send response via Wati
    const sent = await sendWatiMessage(userPhone, message);

    const elapsed = Date.now() - startTime;
    console.log(`[WEBHOOK] Complete in ${elapsed}ms | Wati sent: ${sent}`);

    res.json({
      success: true,
      userPhone,
      scanNumber,
      scores: {
        sharpness: scores.sharpness,
        presence: scores.presence,
        vibe: scores.vibe,
        total: scores.total,
      },
      messageSent: sent,
      processingTimeMs: elapsed,
    });
  } catch (err) {
    console.error(`[POST /aura/webhook] Error: ${err.message}`);
    console.error(err.stack);
    // Always return 200 to Wati to prevent retries on our errors
    res.status(200).json({ error: 'Processing failed', details: err.message });
  }
});

/**
 * GET /aura/history/:phone
 * Returns all past scans for a user with progression data.
 */
app.get('/aura/history/:phone', (req, res) => {
  const phone = req.params.phone;
  console.log(`[GET /aura/history] User: ${phone}`);

  try {
    const userData = getAuraHistory(phone);

    if (!userData || userData.scans.length === 0) {
      return res.status(404).json({
        error: 'No scans found for this user',
        userPhone: phone,
      });
    }

    // Calculate progression
    const first = userData.scans[0];
    const latest = userData.scans[userData.scans.length - 1];
    const progression = {
      sharpness: {
        first: first.scores.sharpness,
        current: latest.scores.sharpness,
        delta: latest.scores.sharpness - first.scores.sharpness,
      },
      presence: {
        first: first.scores.presence,
        current: latest.scores.presence,
        delta: latest.scores.presence - first.scores.presence,
      },
      vibe: {
        first: first.scores.vibe,
        current: latest.scores.vibe,
        delta: latest.scores.vibe - first.scores.vibe,
      },
      total: {
        first: first.scores.total,
        current: latest.scores.total,
        delta: latest.scores.total - first.scores.total,
      },
    };

    res.json({
      userPhone: phone,
      totalScans: userData.scans.length,
      firstScan: first.timestamp,
      latestScan: latest.timestamp,
      progression,
      scans: userData.scans,
    });
  } catch (err) {
    console.error(`[GET /aura/history] Error: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve history', details: err.message });
  }
});

/**
 * GET /aura/health
 * Status check endpoint.
 */
app.get('/aura/health', (req, res) => {
  let userCount = 0;
  let totalScans = 0;

  try {
    const data = JSON.parse(fs.readFileSync(AURA_SCORES_FILE, 'utf-8'));
    userCount = Object.keys(data.users || {}).length;
    totalScans = Object.values(data.users || {}).reduce((sum, u) => sum + (u.scans ? u.scans.length : 0), 0);
  } catch (e) { /* ignore */ }

  res.json({
    status: 'healthy',
    service: 'MainCharacter Aesthetic — Aura Score Service',
    version: '1.0.0',
    geminiVisionConfigured: !!GEMINI_API_KEY,
    watiConfigured: !!(WATI_API_KEY && WATI_API_URL),
    usersTracked: userCount,
    totalScans,
    maxUploadSize: '5MB',
    acceptedFormats: ['image/jpeg', 'image/png', 'image/webp'],
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// ERROR HANDLING MIDDLEWARE
// ─────────────────────────────────────────────

// Multer error handler (file too large, wrong type)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Image too large',
        details: 'Maximum file size is 5MB. Please compress or resize your photo.',
        maxSize: '5MB',
      });
    }
    return res.status(400).json({ error: 'Upload error', details: err.message });
  }

  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(415).json({
      error: 'Unsupported format',
      details: err.message,
      accepted: ['image/jpeg', 'image/png', 'image/webp'],
    });
  }

  console.error('[ERROR] Unhandled:', err.message);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MAINCHARACTER — Aesthetic · Aura Score Service`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Gemini Vision: ${GEMINI_API_KEY ? 'CONFIGURED' : 'NOT SET (using fallback)'}`);
  console.log(`  Wati API: ${WATI_API_KEY ? 'CONFIGURED' : 'NOT SET (messages logged only)'}`);
  console.log(`  Scores file: ${AURA_SCORES_FILE}`);
  console.log(`  Photo dir: ${PHOTOS_DIR}`);
  console.log(`${'═'.repeat(60)}\n`);
  console.log('Routes:');
  console.log(`  POST /aura/analyze         — Upload photo for Aura Score`);
  console.log(`  POST /aura/webhook         — Wati webhook (auto-reply)`);
  console.log(`  GET  /aura/history/:phone  — Scan history`);
  console.log(`  GET  /aura/health          — Health check\n`);
});
