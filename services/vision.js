/**
 * ═══════════════════════════════════════════════════════════════════
 * VISION SERVICE — Gemini multimodal aesthetic scoring (Night-2, P3.3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mirrors services/gemini.js: lazy model init, RPM guard, JSON-extraction with
 * a deterministic fallback when no API key is set or a call fails. Brand-voice
 * rules and the prompt-injection guard live in data/lookmax-prompts.js.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const { createLogger } = require('../lib/log');
const {
  AESTHETIC_AXES,
  buildAestheticPrompt,
} = require('../data/lookmax-prompts');

const log = createLogger('VISION');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

let model = null;
if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  log.info('INIT', 'Initialised');
} else {
  log.info('INIT', 'No API key — fallback mode');
}

// Test hook: inject a fake model to exercise the parse path without a real key.
function _setModel(m) {
  model = m;
}

// Rate limit — 10 RPM, shared shape with gemini.js.
const RPM_LIMIT = 10;
const callLog = [];
function canCall() {
  const now = Date.now();
  while (callLog.length && callLog[0] < now - 60000) callLog.shift();
  return callLog.length < RPM_LIMIT;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(val) || min)));
}

/** Build Gemini image parts from [{ mimeType, data(base64) }]. */
function toImageParts(photos = []) {
  return photos
    .filter((p) => p && p.data)
    .map((p) => ({ inlineData: { data: p.data, mimeType: p.mimeType || 'image/jpeg' } }));
}

/** Normalise + clamp a raw scores object to the eight axes. */
function normaliseScores(raw = {}) {
  const scores = {};
  for (const axis of AESTHETIC_AXES) scores[axis] = clamp(raw[axis], 0, 100);
  return scores;
}

/** Lowest-scoring axis. */
function weakestOf(scores) {
  return AESTHETIC_AXES.reduce((lo, a) => (scores[a] < scores[lo] ? a : lo), AESTHETIC_AXES[0]);
}

/**
 * Score an aesthetic audit from photos + quiz answers.
 * @param {{ photos?: Array, quizAnswers?: object, hairFocus?: boolean }} input
 * @returns {Promise<{scores:object, weakestAxis:string, diagnosis:string, hairReceding:object, source:'gemini'|'fallback'}>}
 */
async function scoreAesthetic({ photos = [], quizAnswers = {}, hairFocus = false } = {}) {
  if (!model || !canCall()) {
    log.warn('FALLBACK', 'aesthetic scoring (no API or rate limited)');
    return fallbackAesthetic(quizAnswers);
  }

  const prompt = buildAestheticPrompt({ quizAnswers, hairFocus });
  const parts = [{ text: prompt }, ...toImageParts(photos)];

  try {
    callLog.push(Date.now());
    const result = await model.generateContent(parts);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('PARSE', 'no JSON in response — falling back');
      return fallbackAesthetic(quizAnswers);
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const scores = normaliseScores(parsed.scores || {});
    const hr = parsed.hairReceding || {};
    return {
      scores,
      weakestAxis: AESTHETIC_AXES.includes(parsed.weakestAxis)
        ? parsed.weakestAxis
        : weakestOf(scores),
      diagnosis: String(parsed.diagnosis || '').trim() || fallbackDiagnosis(weakestOf(scores)),
      hairReceding: {
        detected: !!hr.detected,
        norwoodEstimate: clamp(hr.norwoodEstimate, 1, 7),
        hairlineScore: clamp(hr.hairlineScore, 0, 100),
      },
      source: 'gemini',
    };
  } catch (err) {
    log.error('ERROR', `aesthetic scoring: ${err.message}`);
    return fallbackAesthetic(quizAnswers);
  }
}

/**
 * Deterministic fallback when Gemini is unavailable. Stable per quiz input so a
 * retry returns the same reading rather than flickering.
 */
function fallbackAesthetic(quizAnswers = {}) {
  const seed = crypto
    .createHash('sha256')
    .update(JSON.stringify(quizAnswers || {}))
    .digest();
  const scores = {};
  AESTHETIC_AXES.forEach((axis, i) => {
    scores[axis] = 48 + (seed[i % seed.length] % 30); // 48-77, stable
  });
  const weakestAxis = weakestOf(scores);
  return {
    scores,
    weakestAxis,
    diagnosis: fallbackDiagnosis(weakestAxis),
    hairReceding: { detected: false, norwoodEstimate: 1, hairlineScore: scores.hairDensity },
    source: 'fallback',
  };
}

/** Minimal brand-safe fallback diagnosis. Pending founder copy review. */
function fallbackDiagnosis(weakestAxis) {
  // TODO copy review — placeholder, not final Consultant copy.
  const label = weakestAxis.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return (
    `Your reading is recorded. The structure is here to build on. ` +
    `Your clearest leverage point right now is ${label} — that is where the next gains live. ` +
    `Begin there. The mirror will show the rest. ◆ MainCharacter`
  );
}

module.exports = {
  scoreAesthetic,
  AESTHETIC_AXES,
  _setModel,
  // exposed for reuse/testing
  normaliseScores,
  weakestOf,
};
