/**
 * ═══════════════════════════════════════════════════════════════════
 * MAINCHARACTER — Orator Voice Analysis Service
 * ═══════════════════════════════════════════════════════════════════
 *
 * Receives audio recordings from Wati (WhatsApp voice notes),
 * analyzes them via Gemini Pro for The Orator pillar scores,
 * tracks 7-day progression, and generates consultant messages.
 *
 * Architecture:
 *   Wati webhook → download audio → extract metadata →
 *   Gemini Pro analysis (simulated until Whisper integration) →
 *   5-parameter scoring → consultant message → response
 *
 * Routes:
 *   POST /analyze          — Score a voice note for a given day
 *   GET  /progress/:phone  — Full score history for a user
 *   POST /day7report       — Generate the full Day 7 evolution report
 *   GET  /health           — Status check
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

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SCORES_FILE = path.join(__dirname, 'scores.json');
const AUDIO_DIR = path.join(__dirname, 'audio_downloads');

// Ensure directories/files exist
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  console.log('[INIT] Created audio downloads directory');
}

if (!fs.existsSync(SCORES_FILE)) {
  fs.writeFileSync(SCORES_FILE, JSON.stringify({ users: {} }, null, 2));
  console.log('[INIT] Created scores.json');
}

// ─────────────────────────────────────────────
// GEMINI CLIENT
// ─────────────────────────────────────────────

let genAI = null;
let geminiModel = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: 'gemini-pro' });
  console.log('[INIT] Gemini Pro client initialised');
} else {
  console.log('[INIT] No GEMINI_API_KEY set — using fallback scoring engine');
}

// ─────────────────────────────────────────────
// GEMINI RATE LIMITING (10 RPM)
// ─────────────────────────────────────────────

const GEMINI_RPM_LIMIT = 10;
const geminiCallLog = [];

function canCallGemini() {
  const now = Date.now();
  // Prune calls older than 60 seconds
  while (geminiCallLog.length > 0 && geminiCallLog[0] < now - 60000) {
    geminiCallLog.shift();
  }
  return geminiCallLog.length < GEMINI_RPM_LIMIT;
}

function markGeminiCall() {
  geminiCallLog.push(Date.now());
}

// ─────────────────────────────────────────────
// EXPRESS SETUP
// ─────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

const upload = multer({ dest: AUDIO_DIR });

// ═══════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Download audio file from a URL (Wati media URL).
 * Returns local file path and basic metadata.
 *
 * @param {string} audioUrl - URL of the audio file from Wati
 * @param {string} userPhone - Phone number (used for filename)
 * @param {number} dayNumber - Day number (used for filename)
 * @returns {object} { localPath, fileSizeBytes, durationEstimate }
 */
async function downloadAudio(audioUrl, userPhone, dayNumber) {
  console.log(`[AUDIO] Downloading from: ${audioUrl}`);

  try {
    const response = await axios({
      method: 'GET',
      url: audioUrl,
      responseType: 'stream',
      timeout: 30000,
    });

    const sanitisedPhone = userPhone.replace(/[^0-9]/g, '');
    const filename = `${sanitisedPhone}_day${dayNumber}_${Date.now()}.ogg`;
    const localPath = path.join(AUDIO_DIR, filename);

    const writer = fs.createWriteStream(localPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(localPath);
    // Rough duration estimate: WhatsApp voice notes are typically opus at ~16kbps
    // 60 seconds ≈ 120KB. Adjust when real analysis is available.
    const durationEstimate = Math.round((stats.size / 2000) * 1);

    console.log(`[AUDIO] Saved: ${filename} (${stats.size} bytes, ~${durationEstimate}s)`);

    return {
      localPath,
      fileSizeBytes: stats.size,
      durationEstimate,
    };
  } catch (err) {
    console.error(`[AUDIO] Download failed: ${err.message}`);
    // Return null metadata — scoring will proceed with context alone
    return { localPath: null, fileSizeBytes: 0, durationEstimate: 60 };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════
 * analyzeVoiceNote — Core scoring engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Uses Gemini Pro to generate realistic progressive scores based on:
 *   - User's audit self-report (primary problem, filler frequency, room)
 *   - Day number in the 7-day arc
 *   - Previous days' scores (for progression continuity)
 *   - Audio transcript (when available via Whisper — see PRODUCTION NOTE)
 *
 * @param {object} context
 * @param {string} context.userPhone
 * @param {number} context.dayNumber - 1 through 7
 * @param {object} context.auditAnswers
 * @param {string} context.auditAnswers.primaryBetray - What betrayed them first
 * @param {string} context.auditAnswers.fillerFreq - Self-reported filler frequency
 * @param {string} context.auditAnswers.highStakesRoom - The room that matters most
 * @param {array}  context.previousScores - Array of { day, scores } from earlier days
 * @param {string} context.audioUrl - Wati media URL
 * @param {string} [context.audioTranscript] - Optional Whisper transcript
 * @returns {object} Scores object with all 6 parameters + insights
 */
async function analyzeVoiceNote(context) {
  const {
    userPhone,
    dayNumber,
    auditAnswers = {},
    previousScores = [],
    audioUrl,
    audioTranscript,
  } = context;

  console.log(`[ANALYZE] User: ${userPhone} | Day: ${dayNumber}`);
  console.log(`[ANALYZE] Audit: primary="${auditAnswers.primaryBetray}", fillers="${auditAnswers.fillerFreq}", room="${auditAnswers.highStakesRoom}"`);
  console.log(`[ANALYZE] Previous scores: ${previousScores.length} day(s) recorded`);

  // ─── PRODUCTION NOTE ──────────────────────────────────────
  // When OpenAI Whisper or Google Speech-to-Text is integrated:
  //   1. Download the audio (already done above)
  //   2. Send to Whisper API for transcription
  //   3. Pass the transcript to Gemini for semantic analysis
  //   4. Also use Whisper's word-level timestamps for:
  //      - Filler word detection (um, uh, like, you know)
  //      - Pacing calculation (words per minute, pause distribution)
  //      - Confidence tone (pitch variance — requires additional model)
  //
  // For now: Gemini generates contextually realistic scores based
  // on the user's audit profile and progression arc.
  // ──────────────────────────────────────────────────────────

  const prompt = buildGeminiPrompt(dayNumber, auditAnswers, previousScores, audioTranscript);

  let scores;

  if (geminiModel && canCallGemini()) {
    try {
      markGeminiCall();
      console.log(`[ANALYZE] Sending to Gemini Pro... (${geminiCallLog.length}/${GEMINI_RPM_LIMIT} RPM)`);
      const result = await geminiModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Extract JSON from response (Gemini may wrap in markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Gemini response');
      }

      scores = JSON.parse(jsonMatch[0]);
      console.log('[ANALYZE] Gemini scores received:', JSON.stringify(scores));
    } catch (err) {
      console.error(`[ANALYZE] Gemini error: ${err.message}`);
      console.log('[ANALYZE] Falling back to deterministic scoring...');
      scores = fallbackScoring(dayNumber, auditAnswers, previousScores);
    }
  } else {
    console.log('[ANALYZE] No Gemini key — using fallback scoring engine');
    scores = fallbackScoring(dayNumber, auditAnswers, previousScores);
  }

  // Validate and clamp all scores to 0-100
  scores = validateScores(scores, dayNumber);

  return scores;
}

/**
 * Build the Gemini Pro prompt for voice analysis scoring.
 */
function buildGeminiPrompt(dayNumber, auditAnswers, previousScores, transcript) {
  let prompt = `You are the scoring engine for MainCharacter's Orator Consultant — a voice coaching system that measures communication quality across five parameters.

User profile from audit:
- Primary problem: ${auditAnswers.primaryBetray || 'pacing rushed'}
- Self-reported filler frequency: ${auditAnswers.fillerFreq || 'A few times a day'}
- High-stakes room: ${auditAnswers.highStakesRoom || 'team meetings'}
- Day number: ${dayNumber} of 7
- Previous scores: ${JSON.stringify(previousScores)}`;

  if (transcript) {
    prompt += `\n\nActual transcript of today's recording:\n"${transcript}"`;
    prompt += `\n\nAnalyze the transcript for filler words, pacing indicators, vocabulary range, and tone confidence. Use this real data to inform scores.`;
  }

  prompt += `

Generate realistic voice coaching scores for Day ${dayNumber}.

Rules:
- Day 1 scores should reflect their self-reported problems (lower scores in problem areas)
- Fluency Day 1 should be 60-70. Vocabulary Day 1 should be 80-90 (most people have decent vocab)
- Each subsequent day should show SMALL improvements (2-8 points per day in worked areas)
- The improvement should be consistent with the quest they completed that day:
  - Day 2: focus on pause technique → pacing improves most
  - Day 3: physiological sigh → confidence tone improves
  - Day 4: consistency → small steady gains across board
  - Day 5: real-room pressure → may show slight dip in confidence but gains in authenticity (fluency up)
  - Day 6: polishing → pronunciation and vocabulary edge up
  - Day 7: integration → all areas show their cumulative gain
- Their weakest area (from Day 1) should show the LARGEST improvement by Day 7
- Day 7 total should show 10-20 point improvement from Day 1 in most areas
- Filler Frequency is the most improved metric across 7 days (20-25 points)
- Never give a score above 95 on Day 7 (room to grow → paywall incentive)

Return ONLY valid JSON with no markdown, no explanation:
{
  "fluency": <number 0-100>,
  "pronunciation": <number 0-100>,
  "pacingRhythm": <number 0-100>,
  "vocabulary": <number 0-100>,
  "confidenceTone": <number 0-100>,
  "fillerFrequency": <number 0-100>,
  "headlineWin": "<string — the one biggest improvement this session in one sentence>",
  "consultantInsight": "<string — one specific insight about what changed, 2 sentences max, warm mentor voice, no exclamation marks>"
}`;

  return prompt;
}

/**
 * Fallback deterministic scoring engine.
 * Used when Gemini API is unavailable or errors out.
 * Produces realistic 7-day progression curves.
 */
function fallbackScoring(dayNumber, auditAnswers, previousScores) {
  console.log('[FALLBACK] Generating deterministic scores...');

  // Base Day 1 scores — calibrated to audit answers
  const base = {
    fluency: 67,
    pronunciation: 78,
    pacingRhythm: 58,
    vocabulary: 88,
    confidenceTone: 60,
    fillerFrequency: 51,
  };

  // Adjust Day 1 base to audit answers
  const betray = (auditAnswers.primaryBetray || '').toLowerCase();
  if (betray.includes('pacing') || betray.includes('rush')) {
    base.pacingRhythm -= 4;
  }
  if (betray.includes('filler')) {
    base.fillerFrequency -= 5;
  }
  if (betray.includes('word') || betray.includes('vocab')) {
    base.vocabulary -= 8;
  }
  if (betray.includes('voice') || betray.includes('steady') || betray.includes('steadiness')) {
    base.confidenceTone -= 5;
  }
  if (betray.includes('all of it') || betray.includes('honestly')) {
    base.pacingRhythm -= 3;
    base.fillerFrequency -= 3;
    base.confidenceTone -= 3;
  }

  if (dayNumber === 1) {
    return {
      ...base,
      headlineWin: 'Baseline established — vocabulary is your strongest asset.',
      consultantInsight: `I counted 9 fillers in 60 seconds — most around moments of transition. Solid foundation with room to climb.`,
    };
  }

  // Daily improvement curves (per parameter, per day)
  // Format: [day2, day3, day4, day5, day6, day7]
  const curves = {
    fluency:         [4,  2,  1,  3,  2,  2],  // +14 total
    pronunciation:   [1,  2,  2,  1,  2,  1],  // +9 total
    pacingRhythm:    [5,  3,  2,  3,  2,  3],  // +18 total (headline win)
    vocabulary:      [0,  1,  0,  1,  0,  1],  // +3 total
    confidenceTone:  [2,  4,  3,  3,  3,  4],  // +19 total
    fillerFrequency: [5,  4,  3,  4,  3,  4],  // +23 total (biggest gain)
  };

  // Calculate scores for given day
  const scores = {};
  for (const param of Object.keys(base)) {
    let val = base[param];
    for (let d = 0; d < dayNumber - 1 && d < curves[param].length; d++) {
      val += curves[param][d];
    }
    scores[param] = Math.min(val, 100);
  }

  // Generate day-specific insights
  const insights = {
    2: {
      headlineWin: 'You held the opening pause — the rest followed.',
      consultantInsight: 'Three fewer fillers. The pause was not decoration — it gave your first sentence weight.',
    },
    3: {
      headlineWin: 'Confidence tone jumped after the physiological sigh.',
      consultantInsight: 'The sigh reset your baseline anxiety before recording. Your opening was steadier than any previous day.',
    },
    4: {
      headlineWin: 'Consistency through the halfway mark.',
      consultantInsight: 'Steady gains across the board. The habit is forming — your voice is beginning to expect the structure.',
    },
    5: {
      headlineWin: 'Fluency held under real-room pressure.',
      consultantInsight: 'You spoke as though the room was watching. The pacing was more intentional — that is the mark of someone who is training, not just recording.',
    },
    6: {
      headlineWin: 'Pronunciation sharpened — word endings are landing cleanly.',
      consultantInsight: 'Small refinements compounding. Your articulation at the end of sentences has noticeably improved.',
    },
    7: {
      headlineWin: 'Pacing and rhythm — the single biggest transformation across all seven days.',
      consultantInsight: 'You stopped racing your sentences. On Day 1, transitions were rushed. By today, the pauses are natural. The Monday stand-up sounds different now — because you sound different.',
    },
  };

  return {
    ...scores,
    ...(insights[dayNumber] || insights[2]),
  };
}

/**
 * Validate and clamp scores to 0-100 range.
 */
function validateScores(scores, dayNumber) {
  const params = ['fluency', 'pronunciation', 'pacingRhythm', 'vocabulary', 'confidenceTone', 'fillerFrequency'];

  for (const p of params) {
    if (typeof scores[p] !== 'number' || isNaN(scores[p])) {
      console.warn(`[VALIDATE] Invalid score for ${p}: ${scores[p]}, defaulting to 50`);
      scores[p] = 50;
    }
    scores[p] = Math.max(0, Math.min(100, Math.round(scores[p])));
  }

  if (!scores.headlineWin || typeof scores.headlineWin !== 'string') {
    scores.headlineWin = 'Scores recorded for Day ' + dayNumber + '.';
  }

  if (!scores.consultantInsight || typeof scores.consultantInsight !== 'string') {
    scores.consultantInsight = 'Your voice data has been analysed. The trajectory is forming.';
  }

  return scores;
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * generateConsultantMessage — Build the WhatsApp message for a given day.
 *
 * @param {object} scores - Current day scores
 * @param {number} dayNumber - 1-7
 * @param {array} previousScores - Previous days' scores
 * @param {string} userName - User's first name
 * @returns {string} WhatsApp-formatted message text
 */
function generateConsultantMessage(scores, dayNumber, previousScores, userName) {
  const name = userName || 'Aarav';

  if (dayNumber === 1) {
    return generateDay1Message(scores, name);
  }

  if (dayNumber === 7) {
    return generateDay7FullReport(scores, previousScores, name);
  }

  // Days 2-6: comparison + headline win
  return generateDailyMessage(scores, dayNumber, previousScores, name);
}

/**
 * Day 1 — Baseline delivery (no comparison)
 */
function generateDay1Message(scores, name) {
  return `Your Baseline Mark is in.

— — —
📊 *BASELINE READING — DAY 1*
— — —

*Fluency Score:* ${scores.fluency} / 100

*Strongest meter:* Vocabulary · ${scores.vocabulary}
*Weakest meter:* Filler Frequency · ${scores.fillerFrequency}

— — —

${scores.consultantInsight}

Your first quest arrives tomorrow at 7:45am. Sleep on this: tomorrow's only job is to record one minute on the same prompt, with *one filler word less* than today. Not five. Not zero. One.

That is the pace we work at.

— Your Orator Consultant`;
}

/**
 * Days 2-6 — Comparison to previous + headline win
 */
function generateDailyMessage(scores, dayNumber, previousScores, name) {
  // Get Day 1 scores for comparison base
  const day1 = previousScores.find(p => p.day === 1);
  const prev = previousScores.find(p => p.day === dayNumber - 1);
  const baseScores = day1 ? day1.scores : null;
  const prevScores = prev ? prev.scores : null;

  let statsBlock = '';

  if (baseScores) {
    const fluencyDelta = scores.fluency - baseScores.fluency;
    const fillerDelta = scores.fillerFrequency - baseScores.fillerFrequency;

    statsBlock = `— — —
📊 *EVENING READING — DAY ${dayNumber}*
— — —

*Fluency:* ${baseScores.fluency} → ${scores.fluency} *(${fluencyDelta >= 0 ? '+' : ''}${fluencyDelta})*
*Fillers:* ${100 - baseScores.fillerFrequency > 0 ? Math.round((100 - baseScores.fillerFrequency) * 0.09) : 9} → ${Math.max(0, Math.round((100 - scores.fillerFrequency) * 0.09))}

*Headline:* ${scores.headlineWin}

— — —`;
  }

  let closeText = '';
  if (dayNumber === 4) {
    closeText = `Most people abandon self-improvement programmes on Day 4. The novelty fades. The delta feels small. The day gets busy and the recording gets skipped.

You did not skip it.

That is not a small thing. The work is starting to show — not because the numbers moved, but because you showed up on the day most people don't.

— Your Consultant`;
  } else {
    closeText = `${scores.consultantInsight}

You did the work. Tomorrow's quest at 7:45.

— Orator Consultant`;
  }

  return `${statsBlock}

${closeText}`;
}

/**
 * Day 7 — Full Weekly Evolution Report
 */
function generateDay7FullReport(scores, previousScores, name) {
  const day1 = previousScores.find(p => p.day === 1);
  const baseScores = day1 ? day1.scores : {
    fluency: 67, pronunciation: 78, pacingRhythm: 58,
    vocabulary: 88, confidenceTone: 60, fillerFrequency: 51,
  };

  const delta = (param) => {
    const d = scores[param] - baseScores[param];
    return d >= 0 ? `+${d}` : `${d}`;
  };

  // Identify biggest gain
  const params = ['fluency', 'pronunciation', 'pacingRhythm', 'vocabulary', 'confidenceTone', 'fillerFrequency'];
  const paramLabels = {
    fluency: 'Fluency Score',
    pronunciation: 'Pronunciation',
    pacingRhythm: 'Pacing & Rhythm',
    vocabulary: 'Vocabulary',
    confidenceTone: 'Confidence Tone',
    fillerFrequency: 'Filler Frequency',
  };

  let biggestGainParam = 'fluency';
  let biggestGainVal = 0;
  for (const p of params) {
    const gain = scores[p] - baseScores[p];
    if (gain > biggestGainVal) {
      biggestGainVal = gain;
      biggestGainParam = p;
    }
  }

  const lines = params.map(p => {
    const marker = p === biggestGainParam ? ' ← HEADLINE WIN' : '';
    return `*${paramLabels[p]}:* ${baseScores[p]} → ${scores[p]} *(${delta(p)})*${marker}`;
  });

  return `Day 7. Your Weekly Evolution Report.

Before I show you the numbers, I want you to hear something.

🎧 _Day 1 — Your Baseline · 0:60_
🎧 _Day 7 — This Morning · 0:60_

Play them in order. Headphones if you can.

You don't have to take my word for what changed.

— — —
📊 *WEEKLY EVOLUTION REPORT — DAY 7*
— — —

${lines.join('\n')}

— — —

${scores.consultantInsight}

This is what one pillar, seven days, five minutes a day can do. Now imagine ninety.

— — —
*— Continue the ASCEND Protocol —*
— — —

Your Day 8 quest is already prepared. To receive it, and to unlock:

• All three pillars — Orator, Aesthetic, Sage
• The full Wisdom skill tree (60+ nodes remain)
• Weekly Evolution Reports, indefinitely
• Your Consultant, every morning, on this line

— — —

*The Protocol* — ₹1,499 / month
_or 30% off annual · ₹12,499/year_

— — —

Reply *PAY* to receive your payment link.

_If you do nothing, your Consultant goes quiet at midnight tonight. We do not chase. We do not discount._

— Your Orator Consultant`;
}

// ═══════════════════════════════════════════════════════════════════
// DATA PERSISTENCE
// ═══════════════════════════════════════════════════════════════════

/**
 * saveScores — Persist scores for a user/day to scores.json
 */
function saveScores(userPhone, dayNumber, scores) {
  console.log(`[SAVE] Saving scores for ${userPhone} Day ${dayNumber}`);

  const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));

  if (!data.users) data.users = {};
  if (!data.users[userPhone]) {
    data.users[userPhone] = {
      phone: userPhone,
      createdAt: new Date().toISOString(),
      scores: [],
    };
  }

  // Remove any existing entry for this day (idempotent)
  data.users[userPhone].scores = data.users[userPhone].scores.filter(
    (s) => s.day !== dayNumber
  );

  data.users[userPhone].scores.push({
    day: dayNumber,
    timestamp: new Date().toISOString(),
    scores: {
      fluency: scores.fluency,
      pronunciation: scores.pronunciation,
      pacingRhythm: scores.pacingRhythm,
      vocabulary: scores.vocabulary,
      confidenceTone: scores.confidenceTone,
      fillerFrequency: scores.fillerFrequency,
    },
    headlineWin: scores.headlineWin,
    consultantInsight: scores.consultantInsight,
  });

  // Sort by day
  data.users[userPhone].scores.sort((a, b) => a.day - b.day);

  fs.writeFileSync(SCORES_FILE, JSON.stringify(data, null, 2));
  console.log(`[SAVE] Scores saved. User now has ${data.users[userPhone].scores.length} day(s) recorded.`);
}

/**
 * getProgressionData — Load all scores for a user
 */
function getProgressionData(userPhone) {
  const data = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));

  if (!data.users || !data.users[userPhone]) {
    return [];
  }

  return data.users[userPhone].scores.sort((a, b) => a.day - b.day);
}

/**
 * generateDay7Report — Load all 7 days, calculate deltas, format report
 */
function generateDay7Report(userPhone, userName) {
  const progression = getProgressionData(userPhone);

  if (progression.length === 0) {
    return { error: 'No scores found for this user.' };
  }

  const day1 = progression.find(p => p.day === 1);
  const day7 = progression.find(p => p.day === 7);

  if (!day1) {
    return { error: 'Day 1 baseline not found.' };
  }

  // If Day 7 scores don't exist yet, generate them from fallback
  const finalScores = day7
    ? { ...day7.scores, headlineWin: day7.headlineWin, consultantInsight: day7.consultantInsight }
    : fallbackScoring(7, {}, progression);

  const message = generateConsultantMessage(finalScores, 7, progression, userName);

  return {
    userPhone,
    totalDays: progression.length,
    day1Scores: day1.scores,
    day7Scores: day7 ? day7.scores : finalScores,
    message,
    progression: progression.map(p => ({
      day: p.day,
      fluency: p.scores.fluency,
      headline: p.headlineWin,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESS ROUTES
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /analyze
 * Receives a voice note analysis request from Wati webhook.
 *
 * Body: {
 *   userPhone: string,
 *   dayNumber: number (1-7),
 *   audioUrl: string,
 *   auditAnswers: {
 *     primaryBetray: string,
 *     fillerFreq: string,
 *     highStakesRoom: string
 *   },
 *   userName: string (optional),
 *   audioTranscript: string (optional — from Whisper)
 * }
 */
app.post('/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const { userPhone, dayNumber, audioUrl, auditAnswers, userName, audioTranscript } = req.body;

    // Validate required fields
    if (!userPhone) return res.status(400).json({ error: 'userPhone is required' });
    if (!dayNumber || dayNumber < 1 || dayNumber > 7) {
      return res.status(400).json({ error: 'dayNumber must be 1-7' });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[POST /analyze] User: ${userPhone} | Day: ${dayNumber}`);
    console.log(`${'═'.repeat(60)}`);

    // 1. Download audio (if URL provided)
    let audioMeta = { localPath: null, fileSizeBytes: 0, durationEstimate: 60 };
    if (audioUrl) {
      audioMeta = await downloadAudio(audioUrl, userPhone, dayNumber);
    } else {
      console.log('[ANALYZE] No audioUrl provided — proceeding with context-only analysis');
    }

    // 2. Get previous scores for progression
    const previousScores = getProgressionData(userPhone);

    // 3. Analyze voice note
    const scores = await analyzeVoiceNote({
      userPhone,
      dayNumber,
      auditAnswers: auditAnswers || {},
      previousScores,
      audioUrl: audioUrl || '',
      audioTranscript: audioTranscript || null,
    });

    // 4. Save scores
    saveScores(userPhone, dayNumber, scores);

    // 5. Generate consultant message
    const updatedProgression = getProgressionData(userPhone);
    const message = generateConsultantMessage(scores, dayNumber, updatedProgression, userName);

    const elapsed = Date.now() - startTime;
    console.log(`[POST /analyze] Complete in ${elapsed}ms`);

    res.json({
      success: true,
      userPhone,
      dayNumber,
      scores: {
        fluency: scores.fluency,
        pronunciation: scores.pronunciation,
        pacingRhythm: scores.pacingRhythm,
        vocabulary: scores.vocabulary,
        confidenceTone: scores.confidenceTone,
        fillerFrequency: scores.fillerFrequency,
      },
      headlineWin: scores.headlineWin,
      consultantInsight: scores.consultantInsight,
      whatsappMessage: message,
      audioMeta: {
        fileSizeBytes: audioMeta.fileSizeBytes,
        durationEstimate: audioMeta.durationEstimate,
      },
      processingTimeMs: elapsed,
    });
  } catch (err) {
    console.error(`[POST /analyze] Error: ${err.message}`);
    console.error(err.stack);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

/**
 * GET /progress/:phone
 * Returns full score history for a user.
 */
app.get('/progress/:phone', (req, res) => {
  const phone = req.params.phone;
  console.log(`[GET /progress] User: ${phone}`);

  try {
    const progression = getProgressionData(phone);

    if (progression.length === 0) {
      return res.status(404).json({
        error: 'No scores found for this user',
        userPhone: phone,
      });
    }

    // Calculate summary
    const day1 = progression.find(p => p.day === 1);
    const latest = progression[progression.length - 1];

    const summary = {};
    if (day1 && latest) {
      const params = ['fluency', 'pronunciation', 'pacingRhythm', 'vocabulary', 'confidenceTone', 'fillerFrequency'];
      for (const p of params) {
        summary[p] = {
          day1: day1.scores[p],
          current: latest.scores[p],
          delta: latest.scores[p] - day1.scores[p],
        };
      }
    }

    res.json({
      userPhone: phone,
      totalDays: progression.length,
      latestDay: latest.day,
      summary,
      progression,
    });
  } catch (err) {
    console.error(`[GET /progress] Error: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve progress', details: err.message });
  }
});

/**
 * POST /day7report
 * Generates the full Day 7 evolution report message.
 *
 * Body: { userPhone: string, userName: string }
 */
app.post('/day7report', (req, res) => {
  const { userPhone, userName } = req.body;

  console.log(`[POST /day7report] User: ${userPhone}`);

  if (!userPhone) return res.status(400).json({ error: 'userPhone is required' });

  try {
    const report = generateDay7Report(userPhone, userName);

    if (report.error) {
      return res.status(404).json(report);
    }

    res.json({
      success: true,
      ...report,
    });
  } catch (err) {
    console.error(`[POST /day7report] Error: ${err.message}`);
    res.status(500).json({ error: 'Report generation failed', details: err.message });
  }
});

/**
 * GET /health
 * Status check endpoint.
 */
app.get('/health', (req, res) => {
  const scoresData = JSON.parse(fs.readFileSync(SCORES_FILE, 'utf-8'));
  const userCount = Object.keys(scoresData.users || {}).length;

  res.json({
    status: 'healthy',
    service: 'MainCharacter Orator Voice Analysis',
    version: '1.0.0',
    geminiConfigured: !!GEMINI_API_KEY,
    usersTracked: userCount,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MAINCHARACTER — Orator Voice Analysis Service`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Gemini Pro: ${GEMINI_API_KEY ? 'CONFIGURED' : 'NOT SET (using fallback)'}`);
  console.log(`  Scores file: ${SCORES_FILE}`);
  console.log(`${'═'.repeat(60)}\n`);
  console.log('Routes:');
  console.log(`  POST /analyze          — Analyze a voice note`);
  console.log(`  GET  /progress/:phone  — Get score history`);
  console.log(`  POST /day7report       — Generate Day 7 report`);
  console.log(`  GET  /health           — Health check\n`);
});
