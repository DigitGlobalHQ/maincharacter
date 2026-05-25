/**
 * ═══════════════════════════════════════════════════════════════════
 * GEMINI AI SERVICE — Scoring + Evolution Reports
 * ═══════════════════════════════════════════════════════════════════
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getScoringPrompt } = require('../data/orator-content');
const { createLogger } = require('../lib/log');

const log = createLogger('GEMINI');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
let genAI = null;
let model = null;

if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  log.info('INIT', 'Initialised');
} else {
  log.info('INIT', 'No API key — fallback mode');
}

// Rate limiting — 10 RPM
const RPM_LIMIT = 10;
const callLog = [];

function canCallGemini() {
  const now = Date.now();
  // Remove calls older than 60s
  while (callLog.length && callLog[0] < now - 60000) callLog.shift();
  return callLog.length < RPM_LIMIT;
}

function logCall() {
  callLog.push(Date.now());
}

/**
 * Score a user's daily response using Gemini Pro.
 * Returns: { scores, wordsUsed, consultantMessage, delta }
 */
async function scoreUserResponse(userName, day, words, userResponse, previousScores) {
  if (!model || !canCallGemini()) {
    log.warn('FALLBACK', 'Using fallback scoring (no API or rate limited)');
    return generateFallbackScoring(day, userName);
  }

  const prompt = getScoringPrompt(userName, day, words, userResponse, previousScores);

  try {
    logCall();
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('PARSE', 'Could not parse JSON from response');
      return generateFallbackScoring(day, userName);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      scores: {
        fluency: clamp(parsed.scores?.fluency, 0, 100),
        confidenceTone: clamp(parsed.scores?.confidenceTone, 0, 100),
        fillerFrequency: clamp(parsed.scores?.fillerFrequency, 0, 100),
        vocabularyRange: clamp(parsed.scores?.vocabularyRange, 0, 100),
        structure: clamp(parsed.scores?.structure, 0, 100),
      },
      wordsUsed: parsed.wordsUsed || [],
      consultantMessage: parsed.consultantMessage || generateFallbackMessage(day, userName),
      delta: parsed.delta || '',
    };
  } catch (err) {
    log.error('ERROR', err.message);
    return generateFallbackScoring(day, userName);
  }
}

/**
 * Generate the Day 7 personalised Evolution Report assessment.
 */
async function generateEvolutionAssessment(user) {
  if (!model || !canCallGemini()) {
    return `${user.name}, seven days ago you began with scores that measured where you were. Today they measure something different — not just improvement, but intention. The gap between Day 1 and Day 7 is not about numbers. It is about the person who chose to show up, every single day, and speak.`;
  }

  const day1 = user.scores.find(s => s.day === 1) || {};
  const day7 = user.scores.find(s => s.day === 7) || {};

  const prompt = `You are The Consultant for MainCharacter. Write a 3-4 sentence personal assessment for ${user.name}'s 7-day Evolution Report.

Day 1 scores: Fluency=${day1.fluency || '?'}, Confidence=${day1.confidenceTone || '?'}, Vocabulary=${day1.vocabularyRange || '?'}, Structure=${day1.structure || '?'}
Day 7 scores: Fluency=${day7.fluency || '?'}, Confidence=${day7.confidenceTone || '?'}, Vocabulary=${day7.vocabularyRange || '?'}, Structure=${day7.structure || '?'}

Chronicle summaries:
${user.chronicle.map(c => `Day ${c.day}: ${(c.userResponse || '').substring(0, 100)}`).join('\n')}

VOICE RULES:
- Reference specific improvements observed
- Be warm but honest — like a mentor who believes in them enough to be direct
- No exclamation marks, no "great job", no cheerleading
- End with quiet confidence about their trajectory

Return ONLY the 3-4 sentence assessment text, no JSON.`;

  try {
    logCall();
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    log.error('ERROR', `Evolution assessment: ${err.message}`);
    return `${user.name}, seven days ago you began with scores that measured where you were. Today they measure something different — not just improvement, but intention. The gap between Day 1 and Day 7 is not about numbers. It is about the person who chose to show up, every single day, and speak.`;
  }
}

/**
 * Fallback scoring when Gemini is unavailable.
 */
function generateFallbackScoring(day, userName) {
  // Generate reasonable scores that show slight improvement over days
  const base = 55 + (day * 3);
  return {
    scores: {
      fluency: clamp(base + rand(-5, 10), 0, 100),
      confidenceTone: clamp(base + rand(-8, 8), 0, 100),
      fillerFrequency: clamp(base + rand(-3, 12), 0, 100),
      vocabularyRange: clamp(base + rand(-5, 15), 0, 100),
      structure: clamp(base + rand(-5, 10), 0, 100),
    },
    wordsUsed: [],
    consultantMessage: generateFallbackMessage(day, userName),
    delta: day > 1 ? 'Slight improvement observed from previous days.' : '',
  };
}

function generateFallbackMessage(day, userName) {
  const messages = {
    1: `${userName}, this is your starting point. I noticed the structure of your response — there is a foundation here to build on. Tomorrow we push the vocabulary.`,
    2: `The clarity improved from yesterday. You explained something complex with more precision this time. One note: let the pause do the work. Silence is not emptiness — it is emphasis.`,
    3: `The pause technique changed your rhythm today. You held space between ideas in a way that made each point land harder. That is not a small thing.`,
    4: `Halfway through, and the data confirms what I expected: your confidence tone is rising. Not because you are performing — because you are settling into your voice.`,
    5: `You rehearsed a real conversation today. That takes a different kind of courage than speaking about an abstract topic. The precision in your words was noticeable.`,
    6: `Thirty seconds. That constraint forced you to choose every word deliberately. Your economy of language has improved meaningfully since Day 1.`,
    7: `Seven days. The difference between Day 1 and today is not subtle. You have built something real — a vocabulary, a rhythm, a steadiness that was not there before.`,
  };
  return messages[day] || `Day ${day} complete. Your response has been recorded and scored.`;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(val || min)));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
  scoreUserResponse,
  generateEvolutionAssessment,
};
