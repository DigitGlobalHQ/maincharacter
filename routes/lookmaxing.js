/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXING ROUTES — Stage-1 Audit Engine (Wave 2A)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mounted at /api/lookmaxing/* in server.js.
 * Cited spec: briefs/stage-1-audit-spec.md §8 (backend contracts).
 *
 * Auth model (funnel-repair P1 — guest flow removed):
 *   - user JWT (Authorization: Bearer, or ?token=): Lookmaxxing-scoped, from
 *     lookmax-auth. Sign-in (Google / email) is required before the audit, so
 *     every session is owned by a real user_id. Ownership = user_id match.
 *   - The old guest_id cookie + POST /guest + POST /merge were removed; the
 *     baseline carry-over now happens directly at payment (see /pay/webhook).
 *
 * Resolution gate (spec §5):
 *   free (paid=false)  → strips decomposition, biggestLever, quests,
 *                         styleAndColour, starterPlan from the report.
 *   paid (paid=true)   → full report returned.
 *
 * Persistence:
 *   JSON-file store (AUDIT_V2_STORE_PATH env) — same atomic write pattern as
 *   models/User.js. Falls back to data/audit-sessions-v2.json.
 *   When DATABASE_URL is present the runner picks up 0002_audit_engine.sql
 *   on boot — JSON store is always the in-process fallback.
 *
 * Gemini / Wave 1C:
 *   data/lookmaxing-audit-prompts.js (already shipped). If missing, /analyze
 *   503s with { error: 'audit_engine_warming_up' }. Tests stub this module.
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

const storage  = require('../services/storage');
const razorpay = require('../services/razorpay');
const events   = require('../services/events');
const User     = require('../models/User');
const { verifyLookmaxToken } = require('../lib/lookmax-auth');
const { createLogger }       = require('../lib/log');
const { validateProse, QUALIFIED_PROFESSIONAL } = require('../lib/safety-validator');

const log = createLogger('LOOKMAXING');

/**
 * Safety backstop (Phase 1): deep-walk an audit report and replace ANY string
 * field that trips the safety validator (drug names, dosages, RCT framing,
 * prescriptive diet, procedures) with the canonical "qualified professional"
 * fallback. The audit prompt already forbids this content at generation time;
 * this guarantees nothing forbidden survives to a user even on a prompt
 * regression or a partial model failure. Mutates and returns the report.
 * @param {object} report
 * @param {string} auditId for logging
 */
function _sanitizeReport(report, auditId = '') {
  let replaced = 0;
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        if (typeof node[i] === 'string') {
          if (!validateProse(node[i]).safe) { node[i] = QUALIFIED_PROFESSIONAL; replaced += 1; }
        } else walk(node[i]);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === 'string') {
          if (!validateProse(v).safe) { node[k] = QUALIFIED_PROFESSIONAL; replaced += 1; }
        } else walk(v);
      }
    }
  };
  try { walk(report); } catch (err) { log.error('SAFETY', `sanitize walk failed: ${err.message}`); }
  if (replaced) log.error('SAFETY', `audit ${String(auditId).slice(0, 8)}: replaced ${replaced} unsafe field(s) with safe fallback`);
  return report;
}

// ─── De-AI punctuation ────────────────────────────────────────────────────────
// The founder's rule: NO em dashes / "--" anywhere in user-facing prose — it reads
// as AI-generated. Gemini leans on the em dash heavily, so we strip it at the
// render boundary (covers both the reading page and the PDF, for cached + new
// reports). Em/en dashes used as clause separators become a comma; ranges and
// hyphenated words (single hyphen) are untouched.
function _deAiText(s) {
  if (typeof s !== 'string' || !s) return s;
  return s
    .replace(/\s*[—―]\s*/g, ', ')        // em dash / horizontal bar → comma
    .replace(/\s+–\s+/g, ', ')            // spaced en dash → comma
    .replace(/\s+--+\s+/g, ', ')          // spaced double(+) hyphen → comma
    .replace(/\s*,\s*,\s*/g, ', ')        // collapse double commas
    .replace(/,(\s*[.;:!?])/g, '$1')      // drop a comma left dangling before other punctuation
    .replace(/\s+([,.;:!?])/g, '$1')      // no space before punctuation
    .replace(/([,;])(?=[A-Za-z])/g, '$1 ') // ensure a single space after , and ;
    .replace(/[ \t]{2,}/g, ' ')           // collapse runs of spaces
    .trim();
}

/**
 * Deep-clone a report and de-AI every string field. Applied at every render
 * boundary (resolution gate + PDF) so no em dash ever reaches a user.
 */
function _deAiProse(report) {
  if (!report || typeof report !== 'object') return report;
  let clone;
  try { clone = JSON.parse(JSON.stringify(report)); } catch { return report; }
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        if (typeof node[i] === 'string') node[i] = _deAiText(node[i]); else walk(node[i]);
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (typeof node[k] === 'string') node[k] = _deAiText(node[k]); else walk(node[k]);
      }
    }
  };
  try { walk(clone); } catch { return report; }
  return clone;
}

const router = express.Router();

// ─── Multer — memory storage; storage.putPhoto handles the disk/R2 layer ────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Audit-session JSON store ────────────────────────────────────────────────

const STORE_PATH =
  process.env.AUDIT_V2_STORE_PATH ||
  path.join(__dirname, '..', 'data', 'audit-sessions-v2.json');

function _ensureStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '{}');
}
_ensureStore();

function _load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

/** Atomic write — mirrors models/User.js pattern. */
function _save(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function _getSession(id) {
  return _load()[id] || null;
}

function _putSession(session) {
  const data = _load();
  data[session.id] = session;
  _save(data);
  return session;
}

function _updateSession(id, updates) {
  const data = _load();
  if (!data[id]) return null;
  Object.assign(data[id], updates, { updatedAt: new Date().toISOString() });
  _save(data);
  return data[id];
}

// ─── PREMIUM blocks (spec §5) ─────────────────────────────────────────────────

// Premium (paid-only) fields stripped from the free reading. Covers the new
// Bespoke Blueprint schema + the legacy fields (older cached sessions).
const PREMIUM_FIELDS = [
  'vectors', 'chromatic', 'intervention', 'projection',           // Blueprint
  'decomposition', 'biggestLever', 'quests', 'styleAndColour', 'starterPlan', // legacy
];

// ─── Compatibility score bridge ───────────────────────────────────────────────
// The existing re-audit engine (routes/reaudit.js) and Daily Mirror (services/vision.js)
// read users.lookmaxBaseline.scores as an 8-key object (the old aesthetic audit shape).
// The new Gemini audit report uses a different shape. This function maps between them
// so both engines can read a merged baseline without code changes in reaudit.js.
// Decision documented in DECISIONS.md (stage-1-audit merge, 2026-05-28).

// Blueprint schema (Bespoke Aesthetic Blueprint): the 8-axis baseline the reaudit
// engine + Daily Mirror read is derived from the 5 vectors' averages (scores are
// /10 → mapped to 0-100). Falls back to the legacy decomposition shape, then to
// auraScore, so it stays resilient across the schema transition.
const COMPAT_AXES = {
  skinClarity:     (r) => _vectorAvg(r, 'dermalSkin',      'skin'),
  jawDefinition:   (r) => _vectorAvg(r, 'lowerFaceJaw',    'jawAndFace'),
  eyeArea:         (r) => _vectorAvg(r, 'periorbitalEyes', 'jawAndFace'),
  hairDensity:     (r) => _vectorAvg(r, 'haloHair',        'hair'),
  posture:         (r) => _vectorAvg(r, 'postureCarriage', 'bodyAndPosture'),
  facialHarmony:   (r) => (r.auraScore || 55),
  expression:      (r) => _vectorAvg(r, 'periorbitalEyes', 'jawAndFace'),
  bodyComposition: (r) => _vectorAvg(r, 'postureCarriage', 'bodyAndPosture'),
};

// Average a vector's metric scores on the 0-100 scale (metric scores are /10).
function _vectorAvg(report, vectorId, legacyRegion) {
  const v = (report.vectors || []).find((x) => x && x.id === vectorId);
  if (v && Array.isArray(v.metrics) && v.metrics.length) {
    const nums = v.metrics.map((m) => Number(m.score10)).filter((n) => Number.isFinite(n));
    if (nums.length) return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 10);
  }
  // Legacy decomposition fallback (old schema): average that region's scores (0-100).
  const d = report.decomposition;
  if (legacyRegion && d && Array.isArray(d[legacyRegion]) && d[legacyRegion].length) {
    const nums = d[legacyRegion].map((m) => Number(m.score)).filter((n) => Number.isFinite(n));
    if (nums.length) return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
  }
  return report.auraScore || 55;
}

function _scoreFromDecomp(report, region, metric) {
  const d = report.decomposition;
  if (!d || !d[region]) return report.auraScore || 55;
  const item = d[region].find((i) => i.metric === metric);
  return item ? (item.score || report.auraScore || 55) : (report.auraScore || 55);
}

function _buildCompatScores(report) {
  const out = {};
  for (const [axis, fn] of Object.entries(COMPAT_AXES)) {
    out[axis] = fn(report);
  }
  return out;
}

function applyResolutionGate(report, paid) {
  if (!report) return null;
  const clean = _deAiProse(report); // strip em dashes / AI-tell punctuation on every read
  if (paid) return clean;
  const stripped = { ...clean };
  for (const f of PREMIUM_FIELDS) delete stripped[f];
  return stripped;
}

// ─── Auth helper — signed-in user only (funnel-repair P1) ────────────────────
// The guest flow was removed: sign-in (Google / email magic-link) is required
// before the audit, so every session is owned by a real user. Identity comes
// from the Lookmaxing JWT (Bearer header, or ?token= for link-style fetches).

/**
 * Resolve the acting user from the Lookmaxing JWT.
 * Returns { userId } or null when no valid token is present.
 */
function resolveActor(req) {
  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || (req.query && req.query.token) || null;
  const decoded = token ? verifyLookmaxToken(token) : null;
  if (decoded && decoded.userId) return { userId: decoded.userId };
  return null;
}

/** Check ownership of an audit session — the actor's userId must match. */
function canAccess(session, actor) {
  if (!session || !actor) return false;
  return !!(actor.userId && session.userId === actor.userId);
}

// ─── Gemini audit-prompts module (Wave 1C) ────────────────────────────────────

let _auditPrompts = null;
let _promptsLoadAttempted = false;

function getAuditPrompts() {
  if (_promptsLoadAttempted) return _auditPrompts;
  _promptsLoadAttempted = true;
  try {
    _auditPrompts = require('../data/lookmaxing-audit-prompts'); // eslint-disable-line global-require
  } catch {
    log.warn('PROMPTS', 'lookmaxing-audit-prompts module not found — analyze will 503');
    _auditPrompts = null;
  }
  return _auditPrompts;
}

// Pre-load on require (not lazy) since Wave 1C already shipped it.
getAuditPrompts();

// ─── Gemini vision call ───────────────────────────────────────────────────────

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _geminiModel = null;
if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    _geminiModel = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      // JSON mode → clean parseable output (no markdown fences / prose preamble).
      // A generous output budget prevents the large 8-block report from being
      // truncated mid-JSON (2.5-flash spends part of its budget on hidden
      // reasoning) — truncation was the cause of intermittent analyze failures.
      // 2026-06-01: budget raised 16384->32768 and temperature lowered 0.7->0.3
      // after live testing showed ~2 of 3 /analyze calls returning 502
      // (truncated JSON -> parse failure). Lower temperature yields more compact,
      // deterministic structured output; the extra budget absorbs reasoning tokens.
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 65536,
        temperature: 0.3,
        // 2.5-flash spends part of maxOutputTokens on hidden "thinking". The
        // Bespoke Blueprint JSON is large (24 metrics + chromatic + 90-day +
        // projection), so thinking was eating the budget and truncating the JSON
        // mid-object → parse failure → 502. Disable thinking to hand the entire
        // budget to the structured output (2026-06-06). The prompt is detailed
        // enough that reasoning tokens aren't needed for a clean extraction.
        thinkingConfig: { thinkingBudget: 0 },
      },
      // Aesthetic face analysis legitimately trips the default MEDIUM thresholds.
      // Relax to BLOCK_ONLY_HIGH so genuine readings are not silently blocked
      // (which surfaced as empty responses → parse failure). Prompt-level safety
      // (safe-task library, context-vs-quest rule) is unchanged and authoritative.
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
    });
    log.info('GEMINI', `Audit model initialised: ${GEMINI_MODEL}`);
  } catch (err) {
    log.warn('GEMINI', `Failed to init audit model: ${err.message}`);
  }
}

// RPM guard (shared with services/vision.js)
const _rpm = [];
function _canCall() {
  const now = Date.now();
  while (_rpm.length && _rpm[0] < now - 60000) _rpm.shift();
  return _rpm.length < 10;
}

// ── Aura-engine observability ────────────────────────────────────────────────
// Every reading is either a genuine Gemini Vision analysis (face-personalised) or
// the quiz-only fallback (NOT face-personalised — near-constant score for everyone,
// the cause of "two people get the same score"). These counters make the split
// visible on /health so the founder can tell, at a glance, whether real readings
// are being generated. lastFallbackReason names WHY the most recent fallback fired.
const _analyzeStats = { gemini: 0, fallback: 0, lastFallbackReason: null, lastFallbackAt: null };
function getAnalyzeStats() { return Object.assign({}, _analyzeStats); }
function _recordFallback(reason) {
  _analyzeStats.fallback += 1;
  _analyzeStats.lastFallbackReason = reason;
  _analyzeStats.lastFallbackAt = new Date().toISOString();
}
// STRICT mode (opt-in): once a valid GEMINI_API_KEY is confirmed, set
// AUDIT_STRICT_GEMINI=true so a configured-key call failure surfaces an honest
// 502 (retry) instead of silently fabricating a quiz-only reading. Off by default
// so a key outage degrades rather than dead-ends the funnel.
const STRICT_GEMINI = process.env.AUDIT_STRICT_GEMINI === 'true';


/**
 * Synthetic fallback report when Gemini is unavailable.
 * Returns a structurally valid report with placeholder values.
 */
function _fallbackReport(quizAnswers) {
  // Prefer the quiz-aware fallback from the prompts module — it reads the answers
  // and steers the reading (oily/dry skin, low sleep, posture, thinning) so even
  // the no-Gemini path feels calibrated. Falls back to the static report below if
  // the prompts module isn't loaded. (Both are schema-valid and safe by design.)
  const prompts = getAuditPrompts();
  if (prompts && typeof prompts.buildFallbackReport === 'function') {
    try { return prompts.buildFallbackReport(quizAnswers); } catch { /* static below */ }
  }
  return {
    auraScore: 55,
    rank: 'ascendant',
    firstImpression: 'The reading is based on your quiz answers. A photograph would sharpen every metric significantly.',
    faceShape: 'oval',
    freeSignals: [
      { label: 'Potential', axis: 'skinHydration' },
      { label: 'Present',   axis: 'jawDefinition' },
      { label: 'Aware',     axis: 'underEye' },
      { label: 'Engaged',   axis: 'sclera' },
    ],
    decomposition: {
      skin:             [{ metric: 'skinClarity',          score: 55, cause: 'Calibration pending photo.',      fix: 'Gentle cleanse, SPF.' }],
      hair:             [{ metric: 'haircutFaceShapeMatch', score: 55, cause: 'Calibration pending photo.',      fix: 'Book a shaped cut.' }],
      jawAndFace:       [{ metric: 'jawlinePuffiness',      score: 55, cause: 'Calibration pending photo.',      fix: 'Reduce late sodium.' }],
      bodyAndPosture:   [{ metric: 'postureCarriage',       score: 55, cause: 'Calibration pending photo.',      fix: 'Chin-tuck cue daily.' }],
      lifestyleSignals: [{ metric: 'sclera',                score: 55, cause: 'Calibration pending photo.',      fix: 'Consistent sleep.' }],
    },
    biggestLever: { metric: 'postureCarriage', score: 55, rationale: 'Posture affects every read. It is the lever that moves others.' },
    quests: [
      { metric: 'postureCarriage', task: 'Chin-tuck cue: draw chin straight back, not down — 10 seconds, 5 times daily.', library: 'posturePresence' },
      { metric: 'skinClarity',     task: 'Gentle cleanse morning and night — non-stripping formula only.',                 library: 'skincareBasics' },
    ],
    styleAndColour: {
      haircut: 'A shaped cut matched to your face structure would carry the rest of the protocol. The quiz gives a partial read — the photo gives the full one.',
      palette: ['navy', 'slate', 'charcoal', 'white'],
      avoid:   ['neon tones close to the face'],
    },
    starterPlan: Array.from({ length: 7 }, (_, i) => ({
      day:     i + 1,
      morning: 'SPF and a 60-second gentle cleanse.',
      evening: 'Cold water on the eye area. Screens off 45 minutes before bed.',
    })),
    context: {
      boneStructure: 'Presented for context — not scored.',
      hairDensity:   'Presented for context — not scored.',
      colouring:     'Presented for context — not scored.',
    },
    warnings: [
      'No photograph provided. All scores are quiz-calibrated estimates. A photograph would sharpen every metric significantly.',
    ],
  };
}

/**
 * Derive rank from auraScore using the documented thresholds (spec §6):
 * 0-29 unawakened, 30-49 seeker, 50-69 ascendant, 70-84 luminary, 85-100 sovereign.
 * Gemini occasionally returns a rank inconsistent with the score (e.g. 'seeker'
 * for 58); deriving it server-side keeps the badge and the number aligned.
 */
function _rankFromScore(score) {
  const s = Number(score) || 0;
  if (s >= 85) return 'sovereign';
  if (s >= 70) return 'luminary';
  if (s >= 50) return 'ascendant';
  if (s >= 30) return 'seeker';
  return 'unawakened';
}

/**
 * Call Gemini Vision with the audit photo + quiz answers.
 * Returns _fallbackReport ONLY when the engine is not configured (no prompts
 * module, no API key, or rate-limited). When the model IS configured, a genuine
 * call/parse failure throws — the caller surfaces it as an honest 502.
 */
async function _callGemini(quizAnswers, photoBuffer) {
  const prompts = getAuditPrompts();
  if (!prompts) { _recordFallback('prompts_module_missing'); return _fallbackReport(quizAnswers); }
  if (!_geminiModel) {
    // No usable model. This is the #1 cause of "everyone gets a similar score":
    // GEMINI_API_KEY is unset or failed to initialise, so NO face analysis happens
    // and the quiz-only fallback (near-constant) is returned. Loud so it is obvious.
    _recordFallback('gemini_not_configured');
    log.error('GEMINI-CALL', 'NO Gemini model (GEMINI_API_KEY unset/invalid) — reading is quiz-only fallback, NOT face-personalised. Check /health.config.geminiKey.');
    return _fallbackReport(quizAnswers);
  }
  if (!_canCall()) {
    _recordFallback('rate_limited');
    log.warn('GEMINI-RPM', 'rate limit reached — using fallback');
    if (STRICT_GEMINI) throw new Error('gemini_rate_limited');
    return _fallbackReport(quizAnswers);
  }

  // The model IS configured here. A failure now is a genuine outage (bad key,
  // network, safety-block, truncated/malformed response). Retry once for
  // transient blips, then throw so the caller surfaces it honestly rather than
  // silently fabricating a reading for a real user.
  const promptText = prompts.buildAuditPrompt(quizAnswers, !!photoBuffer);
  const parts = [{ text: promptText }];
  if (photoBuffer) {
    parts.push({ inlineData: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' } });
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      _rpm.push(Date.now());
      const result = await _geminiModel.generateContent(parts);
      const text = result.response.text(); // throws if the candidate was safety-blocked
      // JSON mode returns clean JSON; tolerate a stray code-fence just in case.
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (typeof parsed.auraScore !== 'number' || !Array.isArray(parsed.freeSignals)
          || !Array.isArray(parsed.vectors) || !parsed.vectors.length) {
        throw new Error('Gemini response missing required Blueprint fields (auraScore/freeSignals/vectors)');
      }
      // Keep rank consistent with the score regardless of what the model returned.
      parsed.rank = _rankFromScore(parsed.auraScore);
      _analyzeStats.gemini += 1;          // genuine, face-personalised reading
      return _sanitizeReport(parsed);
    } catch (err) {
      lastErr = err;
      log.warn('GEMINI-CALL', `attempt ${attempt} failed: ${err.message}`);
    }
  }
  // Both attempts failed with a CONFIGURED key (truncation, safety block, parse
  // error, or outage). This produced a fabricated-looking quiz-only reading for a
  // real user — loud so it is never invisible.
  _recordFallback('gemini_call_failed');
  log.error('GEMINI-CALL', `CONFIGURED key but call failed twice (${lastErr && lastErr.message}). ${STRICT_GEMINI ? 'STRICT: surfacing 502.' : 'Falling back to quiz-only Blueprint (NOT face-personalised).'}`);
  if (STRICT_GEMINI) throw new Error('gemini_call_failed: ' + (lastErr && lastErr.message));
  return _fallbackReport(quizAnswers);
}

// ─── PDF generation ──────────────────────────────────────────────────────────

/**
 * Generate a PDF from a full audit report using pdfkit.
 * Uses pdfkit built-in fonts (no network requests):
 *   Helvetica → body, Times-Roman → headlines (Cormorant-equivalent),
 *   Courier   → data/numerals (JetBrains Mono-equivalent).
 * Returns a Buffer of the PDF bytes.
 */
async function _generatePdf(auditId, report, photoBuffer = null) {
  const PDFDocument = require('pdfkit'); // eslint-disable-line global-require
  report = _deAiProse(report); // no em dashes / AI-tell punctuation in the dossier
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 60, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── MainCharacter brand palette (printable on white) ──
      const OBSIDIAN = '#0b0b0d';
      const GOLD     = '#a9791f';   // deeper than screen gold so it reads on paper
      const CREAM    = '#f4f1ea';
      const INK      = '#161616';
      const MUTED    = '#5b5b5b';
      const FAINT    = '#9a9a9a';
      const LINE     = '#e2ddd2';

      const M  = 60;                           // page margin
      const PW = doc.page.width;
      const PH = doc.page.height;
      const W  = PW - M * 2;                    // content width

      const fmtName = (s) => String(s || '')
        .replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()
        .replace(/^./, (c) => c.toUpperCase());
      const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
      const need = (h) => { if (doc.y > PH - h) doc.addPage(); };

      // Backward-compat: if a legacy (pre-Blueprint) report is passed, render the
      // older sections so cached sessions still produce a PDF.
      const isBlueprint = Array.isArray(report.vectors) && report.vectors.length > 0;

      // Small filled diamond (the ◆ mark, drawn as vector — built-in fonts can't render ◆).
      function diamond(cx, cy, size, color) {
        doc.save().translate(cx, cy).rotate(45).rect(-size / 2, -size / 2, size, size).fill(color).restore();
      }
      // Gold section label, with a page break when near the bottom.
      function label(text) {
        if (doc.y > doc.page.height - 96) doc.addPage();
        doc.moveDown(0.7);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD)
           .text(text.toUpperCase(), M, doc.y, { characterSpacing: 2 });
        doc.moveDown(0.25);
        doc.fillColor(INK);
      }


      // Every live Gemini report is a Blueprint → render the dark "Bespoke
      // Aesthetic Blueprint" dossier (8-section reference design, embedded photo,
      // brand mark). Legacy/cached pre-Blueprint reports fall through to the
      // original white-paper layout below.
      if (isBlueprint) {
        _renderDossier(doc, auditId, report, photoBuffer);
        doc.end();
        return;
      }

      // ════════ LEGACY white-paper render (pre-Blueprint reports + tests) ════════
      // ── Cover header band ────────────────────────────────────────
      const bandH = 152;
      doc.rect(0, 0, PW, bandH).fill(OBSIDIAN);
      diamond(M + 4, 40, 9, GOLD);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#e8d9b0').text('MAINCHARACTER', M + 18, 35, { characterSpacing: 3 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#8a8576').text('PILLAR II  ·  ELITE DIAGNOSTIC DIVISION', M, 60, { characterSpacing: 2 });
      doc.font('Times-Italic').fontSize(25).fillColor(CREAM).text('The Presence Dossier', M, 76);
      const archetype = report.archetype || cap(report.rank || '');
      doc.font('Helvetica').fontSize(7.5).fillColor('#9a9486')
         .text(`SUBJECT ${('A-' + auditId.slice(0, 4)).toUpperCase()}        ARCHETYPE ${archetype.toUpperCase()}        ${report.metricsScored || 24} METRICS        ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' })}`,
               M, 116, { characterSpacing: 1 });
      doc.font('Helvetica').fontSize(6.5).fillColor('#6f6a5d').text('CONFIDENTIAL   ·   BESPOKE · SINGLE SUBJECT   ·   NOT FOR REDISTRIBUTION', M, 134, { characterSpacing: 1 });

      doc.y = bandH + 28; doc.x = M;

      // ── Global Aura Score ────────────────────────────────────────
      const g10 = (typeof report.globalScore10 === 'number')
        ? report.globalScore10
        : (report.auraScore ? +(report.auraScore / 10).toFixed(1) : null);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD).text('GLOBAL AURA SCORE', M, doc.y, { characterSpacing: 2 });
      const scoreY = doc.y + 4;
      doc.font('Times-Bold').fontSize(54).fillColor(INK).text(g10 != null ? g10.toFixed(1) : String(report.auraScore || '-'), M, scoreY, { continued: true })
         .font('Helvetica').fontSize(15).fillColor(MUTED).text(g10 != null ? '  / 10' : '  / 100');
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
         .text(`${report.percentile ? report.percentile + 'th percentile' : ''}${report.faceShape ? '        ' + cap(report.faceShape) : ''}`, M, scoreY + 58, { characterSpacing: 1 });
      doc.moveTo(M, doc.y + 10).lineTo(M + W, doc.y + 10).lineWidth(0.6).strokeColor(GOLD).stroke();
      doc.y += 16;

      // ── First Impression + Status Alert ──────────────────────────
      if (report.firstImpression) {
        doc.moveDown(0.5);
        doc.font('Times-Italic').fontSize(13).fillColor(INK).text(report.firstImpression, M, doc.y, { width: W, lineGap: 4 });
      }
      if (report.statusAlert) {
        label('Status Alert');
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(report.statusAlert, M, doc.y, { width: W, lineGap: 2 });
      }

      // ── Full Decomposition ───────────────────────────────────────
      if (report.decomposition) {
        label('Full Decomposition');
        const REG = { skin: 'Skin', hair: 'Hair', jawAndFace: 'Jaw & Face', bodyAndPosture: 'Body & Posture', lifestyleSignals: 'Lifestyle' };
        for (const region of Object.keys(REG)) {
          const items = report.decomposition[region] || [];
          if (!items.length) continue;
          if (doc.y > doc.page.height - 120) doc.addPage();
          doc.moveDown(0.35);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(OBSIDIAN).text(REG[region].toUpperCase(), M, doc.y, { characterSpacing: 1 });
          doc.moveDown(0.2);
          for (const item of items) {
            if (doc.y > doc.page.height - 96) doc.addPage();
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
               .text(fmtName(item.metric), M, doc.y, { continued: true })
               .font('Courier').fontSize(9).fillColor(GOLD).text(`    ${item.score}/100`);
            if (item.cause) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(item.cause, M + 12, doc.y, { width: W - 12, lineGap: 1 });
            if (item.fix) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#3a3a3a').text('Fix. ' + item.fix, M + 12, doc.y, { width: W - 12, lineGap: 1 });
            doc.moveDown(0.4);
          }
        }
      }

      // ── Biggest Lever ────────────────────────────────────────────
      if (report.biggestLever) {
        label('Your Biggest Lever');
        doc.font('Times-Bold').fontSize(13).fillColor(INK).text(fmtName(report.biggestLever.metric), M, doc.y, { continued: true })
           .font('Courier').fontSize(10).fillColor(GOLD).text(`    ${report.biggestLever.score}/100`);
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(report.biggestLever.rationale || '', M, doc.y, { width: W, lineGap: 2 });
      }

      // ── The Quests ───────────────────────────────────────────────
      if (report.quests && report.quests.length) {
        label('The Quests');
        for (const q of report.quests) {
          if (doc.y > doc.page.height - 90) doc.addPage();
          diamond(M + 3, doc.y + 5, 4, GOLD);
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(fmtName(q.metric), M + 13, doc.y, { width: W - 13 });
          doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(q.task, M + 13, doc.y, { width: W - 13, lineGap: 1 });
          doc.moveDown(0.35);
        }
      }

      // ── Style & Colour ───────────────────────────────────────────
      if (report.styleAndColour) {
        const sc = report.styleAndColour;
        label('Style & Colour');
        if (sc.haircut) doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(sc.haircut, M, doc.y, { width: W, lineGap: 2 });
        if (sc.palette && sc.palette.length) {
          doc.moveDown(0.4);
          const sy = doc.y, sw = 26; let sx = M;
          for (const c of sc.palette.slice(0, 8)) {
            const raw = (typeof c === 'string' ? c : (c.hex || '')).trim();
            const safe = /^#?[0-9a-fA-F]{3,8}$/.test(raw) ? (raw[0] === '#' ? raw : '#' + raw) : '#cccccc';
            doc.rect(sx, sy, sw, sw).fill(safe);
            doc.rect(sx, sy, sw, sw).lineWidth(0.5).strokeColor(LINE).stroke();
            sx += sw + 8;
          }
          doc.y = sy + sw + 6; doc.x = M;
          doc.font('Helvetica').fontSize(8).fillColor(MUTED)
             .text('Palette. ' + sc.palette.map((c) => (typeof c === 'string' ? c : (c.name || c.hex || ''))).join('  ·  '), M, doc.y, { width: W });
        }
        if (sc.avoid && sc.avoid.length) doc.font('Helvetica-Oblique').fontSize(8).fillColor(FAINT).text('Avoid. ' + sc.avoid.join(', '), M, doc.y, { width: W });
      }

      // ── The 7-Day Starter Plan ───────────────────────────────────
      if (report.starterPlan && report.starterPlan.length) {
        label('The 7-Day Starter Plan');
        for (const day of report.starterPlan) {
          if (doc.y > doc.page.height - 90) doc.addPage();
          doc.font('Times-Bold').fontSize(10).fillColor(GOLD).text(`Day ${day.day}`, M, doc.y);
          if (day.morning) doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Morning   ', M + 12, doc.y, { continued: true }).font('Helvetica').fillColor(MUTED).text(day.morning, { width: W - 12 });
          if (day.evening) doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Evening   ', M + 12, doc.y, { continued: true }).font('Helvetica').fillColor(MUTED).text(day.evening, { width: W - 12 });
          doc.moveDown(0.35);
        }
      }

      // ── Footers on every page ────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        const fy = doc.page.height - 42;
        doc.font('Helvetica').fontSize(7.5).fillColor(FAINT)
           .text('MAINCHARACTER   ·   maincharacter.digitglobalservices.com', M, fy, { width: W, align: 'left', lineBreak: false, characterSpacing: 1 });
        doc.font('Helvetica').fontSize(7.5).fillColor(FAINT)
           .text(`${i + 1} / ${range.count}`, M, fy, { width: W, align: 'right', lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Dark "Bespoke Aesthetic Blueprint" dossier ───────────────────────────────
/**
 * Render the full dark dossier onto an open pdfkit document (founder reference
 * design — final99). Obsidian pages, the subject's own capture embedded on the
 * cover, the MainCharacter mark, personalised metadata. Every figure is driven
 * from the Gemini blueprint report; optional sections and the photo degrade
 * gracefully when absent. Does NOT call doc.end() — the caller owns that.
 *
 * @param {object} doc          open PDFDocument (A4, bufferPages:true)
 * @param {string} auditId
 * @param {object} report       Gemini blueprint report (report.vectors present)
 * @param {Buffer|null} photoBuffer  the subject's normalised capture, if recoverable
 */
function _renderDossier(doc, auditId, report, photoBuffer) {
  // ── Palette (dark, print-tuned) ──
  const BG    = '#08080a';  // obsidian page
  const CARD  = '#101013';  // lifted panel
  const HAIR  = '#2a2a31';  // hairline / border
  const FAINTLINE = '#1b1b20';
  const CREAM = '#f4f1ea';  // headline ink
  const SILVER= '#c9c9cf';  // body
  const DIM   = '#9a9aa2';  // descriptions
  const FAINT = '#6f6f78';  // eyebrows / labels
  const GHOST = '#4c4c54';
  const INKON = '#141310';  // text on a filled-cream pill

  // Fonts: pdfkit built-ins approximate the brand faces (Cormorant→Times serif,
  // Sora→Helvetica sans, JetBrains Mono→Courier). See DECISIONS.md for the
  // embed-real-TTF upgrade path.
  const SERIF = 'Times-Roman', SERIF_I = 'Times-Italic', SERIF_B = 'Times-Bold';
  const SANS  = 'Helvetica',   SANS_B  = 'Helvetica-Bold', SANS_I = 'Helvetica-Oblique';
  const MONO  = 'Courier';

  const PW = doc.page.width, PH = doc.page.height;
  const M = 54, W = PW - M * 2;
  const FOOT = 52;                 // reserved footer band height
  const BOTTOM = PH - FOOT;        // content must not cross this

  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const fmt = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
  const safeHex = (h) => { const r = String(h || '').trim(); return /^#?[0-9a-fA-F]{3,8}$/.test(r) ? (r[0] === '#' ? r : '#' + r) : '#888888'; };
  const num1 = (n) => (typeof n === 'number' && isFinite(n)) ? n.toFixed(1) : null;

  function paintBg() { doc.save(); doc.rect(0, 0, PW, PH).fill(BG); doc.restore(); }
  // First page exists already (constructor) — paint it; later pages via listener.
  paintBg();
  doc.on('pageAdded', () => { paintBg(); });
  function need(h) { if (doc.y + h > BOTTOM) { doc.addPage(); doc.x = M; doc.y = M + 6; return true; } return false; }
  // Start a section: break to a fresh page only when it won't fit; otherwise flow
  // on with a measured gap + hairline, so short sections don't leave dead space.
  function startSection(min) {
    if (doc.y + (min || 180) > BOTTOM) { doc.addPage(); doc.x = M; doc.y = M + 6; }
    else { doc.y += 30; doc.moveTo(M, doc.y - 15).lineTo(M + W, doc.y - 15).lineWidth(0.5).strokeColor(FAINTLINE).stroke(); }
  }

  // ── Brand mark (silver 3D M, transparent — reads on dark) ──
  let mark = null;
  try { mark = fs.readFileSync(path.join(__dirname, '..', 'public', 'maincharacter-mark-3d.png')); } catch { mark = null; }

  // ── small components ───────────────────────────────────────────────────────
  function eyebrow(text, x, y, color, size) {
    doc.font(SANS_B).fontSize(size || 8).fillColor(color || FAINT)
       .text(String(text).toUpperCase(), x, y, { characterSpacing: 2.2, lineBreak: false });
  }
  // Right-anchored pill; returns its left x.
  function pillRight(text, xRight, y, filled) {
    const t = String(text).toUpperCase();
    doc.font(SANS_B).fontSize(7);
    const tw = doc.widthOfString(t, { characterSpacing: 1 });
    const padX = 9, h = 16, w = tw + padX * 2, x = xRight - w;
    if (filled) { doc.roundedRect(x, y, w, h, 8).fill(CREAM); doc.fillColor(INKON); }
    else { doc.roundedRect(x, y, w, h, 8).lineWidth(0.8).strokeColor(HAIR).stroke(); doc.fillColor(SILVER); }
    doc.font(SANS_B).fontSize(7).text(t, x + padX, y + 4.5, { characterSpacing: 1, lineBreak: false });
    return x;
  }
  function pillLeft(text, x, y, filled) {
    const t = String(text).toUpperCase();
    doc.font(SANS_B).fontSize(7);
    const tw = doc.widthOfString(t, { characterSpacing: 1 });
    const padX = 9, h = 16, w = tw + padX * 2;
    if (filled) { doc.roundedRect(x, y, w, h, 8).fill(CREAM); doc.fillColor(INKON); }
    else { doc.roundedRect(x, y, w, h, 8).lineWidth(0.8).strokeColor(HAIR).stroke(); doc.fillColor(SILVER); }
    doc.font(SANS_B).fontSize(7).text(t, x + padX, y + 4.5, { characterSpacing: 1, lineBreak: false });
    return x + w;
  }
  function diamond(cx, cy, s, color) { doc.save().translate(cx, cy).rotate(45).rect(-s / 2, -s / 2, s, s).fill(color).restore(); }
  // Vector rightward arrow (the built-in fonts can't encode →).
  function arrow(x, y, len, color) {
    doc.save().lineWidth(1).strokeColor(color);
    doc.moveTo(x, y).lineTo(x + len, y).stroke();
    doc.moveTo(x + len - 3.5, y - 2.6).lineTo(x + len, y).lineTo(x + len - 3.5, y + 2.6).stroke();
    doc.restore();
  }

  // Section header: faint "0N · EYEBROW" index line, big serif title, intro paragraph.
  function sectionHead(index, eyebrowText, title, intro) {
    eyebrow(`${index}  ·  ${eyebrowText}`, M, doc.y, FAINT, 8);
    doc.y += 16;
    doc.font(SERIF).fontSize(27).fillColor(CREAM).text(title, M, doc.y, { width: W });
    doc.y += 6;
    if (intro) { doc.font(SANS).fontSize(9.5).fillColor(DIM).text(intro, M, doc.y, { width: W * 0.92, lineGap: 3 }); doc.y += 8; }
  }

  // Graded metric → focus pill verdict.
  function gradedPill(m) {
    const s = typeof m.score10 === 'number' ? m.score10 : 5;
    if (s >= 7) return { text: 'Natural Asset', filled: false };
    if (m.class === 'leverage' || s < 5) return { text: 'High Focus', filled: true };
    return { text: 'Refine', filled: false };
  }
  function fixedTag(m) {
    const s = typeof m.score10 === 'number' ? m.score10 : 6;
    if (s >= 7.5) return 'Strong'; if (s >= 6.5) return 'Asset';
    if (s >= 5.5) return 'Balanced'; if (s >= 4.5) return 'Even'; return 'Neutral';
  }

  // One analysis row: name + italic descriptor (left), root-cause (mid), score
  // + verdict pill (right). `graded` shows the /10; fixed rows omit it.
  function metricRow(m, graded) {
    const nameW = 124;
    const pillRightX = M + W;
    const scoreRightX = pillRightX - 92;          // score sits left of the pill column
    const descX = M + 142;
    const descW = (graded ? scoreRightX - 56 : pillRightX - 96) - descX;
    const desc = m.rootCause || m.subtitle || '';

    doc.font(SANS).fontSize(8.5);
    const descH = doc.heightOfString(desc, { width: Math.max(60, descW), lineGap: 1.6 });
    doc.font(SERIF).fontSize(11.5);
    let nameH = doc.heightOfString(fmt(m.metric), { width: nameW });
    if (m.subtitle) { doc.font(SERIF_I).fontSize(8.5); nameH += doc.heightOfString(m.subtitle, { width: nameW }) + 2; }
    const rowH = Math.max(descH, nameH, 26);
    need(rowH + 16);

    const y0 = doc.y + 7;
    doc.font(SERIF).fontSize(11.5).fillColor(CREAM).text(fmt(m.metric), M, y0, { width: nameW });
    if (m.subtitle) doc.font(SERIF_I).fontSize(8.5).fillColor(DIM).text(m.subtitle, M, doc.y + 1, { width: nameW });
    doc.font(SANS).fontSize(8.5).fillColor(DIM).text(desc, descX, y0, { width: Math.max(60, descW), lineGap: 1.6 });

    const midY = y0 + rowH / 2 - 9;
    if (graded && typeof m.score10 === 'number') {
      doc.font(SERIF).fontSize(15).fillColor(CREAM)
         .text(m.score10.toFixed(1), scoreRightX - 50, midY, { width: 38, align: 'right', lineBreak: false });
      doc.font(SANS).fontSize(7).fillColor(FAINT).text('/10', scoreRightX - 11, midY + 5, { lineBreak: false });
    }
    const p = graded ? gradedPill(m) : { text: fixedTag(m), filled: false };
    pillRight(p.text, pillRightX, midY, p.filled);

    doc.y = y0 + rowH + 9;
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(FAINTLINE).stroke();
    doc.y += 2;
  }

  // ════════════════════ PAGE 1 · COVER ════════════════════
  let y = M + 4;
  // top brand row
  if (mark) { try { doc.image(mark, M, y - 2, { width: 17 }); } catch { /* ignore */ } }
  doc.font(SANS_B).fontSize(9).fillColor(SILVER).text('MAINCHARACTER', M + 24, y, { characterSpacing: 3, lineBreak: false });
  doc.font(SANS).fontSize(7).fillColor(FAINT).text('BESPOKE IMAGE ATELIER', M + 24, y + 12, { characterSpacing: 2, lineBreak: false });
  doc.font(SANS).fontSize(6.5).fillColor(GHOST)
     .text('CONFIDENTIAL', M, y, { width: W, align: 'right', lineBreak: false })
     .text('BESPOKE · SINGLE SUBJECT', M, y + 9, { width: W, align: 'right', lineBreak: false })
     .text('NOT FOR REDISTRIBUTION', M, y + 18, { width: W, align: 'right', lineBreak: false });

  // photo (top-right, rounded) — sets how far the title block can run
  const photoW = 116, photoH = 142, photoX = M + W - photoW, photoY = y + 44;
  let titleW = W;
  if (photoBuffer) {
    try {
      doc.save();
      doc.roundedRect(photoX, photoY, photoW, photoH, 10).clip();
      doc.image(photoBuffer, photoX, photoY, { cover: [photoW, photoH], align: 'center', valign: 'center' });
      doc.restore();
      doc.roundedRect(photoX, photoY, photoW, photoH, 10).lineWidth(1).strokeColor(HAIR).stroke();
      titleW = W - photoW - 26;
    } catch { titleW = W; }
  }

  y += 52;
  eyebrow('PILLAR II', M, y, FAINT, 8);
  doc.font(SANS_B).fontSize(8);
  const pwii = doc.widthOfString('PILLAR II', { characterSpacing: 2.2 });
  diamond(M + pwii + 16, y + 4, 5, SILVER);
  eyebrow('LOOKMAXXING', M + pwii + 28, y, FAINT, 8);
  y += 20;
  doc.font(SERIF).fontSize(38).fillColor(CREAM).text('The Presence', M, y, { width: titleW });
  doc.font(SERIF).fontSize(38).fillColor(CREAM).text('Dossier', M, doc.y - 2, { width: titleW });
  y = doc.y + 8;
  doc.font(SERIF_I).fontSize(12).fillColor(DIM).text('A ninety-day reading, prepared from your own capture.', M, y, { width: titleW });

  // metadata strip
  y = Math.max(doc.y, photoY + photoH) + 26;
  doc.moveTo(M, y - 12).lineTo(M + W, y - 12).lineWidth(0.5).strokeColor(FAINTLINE).stroke();
  const archetype = report.archetype || cap(report.rank || 'The Seeker');
  const meta = [
    ['PREPARED FOR', 'Client ' + ('A-' + String(auditId).slice(0, 4)).toUpperCase()],
    ['STYLING DIRECTION', archetype],
    ['ASSESSMENT BASIS', photoBuffer ? 'One frontal capture + analysis' : 'Calibration answers'],
    ['DATE OF ISSUE', new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })],
    ['PREPARED BY', 'The Consultant'],
  ];
  const colW = W / meta.length;
  meta.forEach((mrow, i) => {
    const cx = M + colW * i;
    doc.font(SANS_B).fontSize(6).fillColor(FAINT).text(mrow[0], cx, y, { characterSpacing: 1, width: colW - 8, lineBreak: false });
    doc.font(SERIF).fontSize(11).fillColor(CREAM).text(mrow[1], cx, y + 12, { width: colW - 10 });
  });
  y += 50;

  // score card — height grows to fit the narrative so long status text can never overflow
  const pad = 24;
  const g10 = num1(typeof report.globalScore10 === 'number' ? report.globalScore10 : (report.auraScore != null ? report.auraScore / 10 : null));
  const nx = M + W * 0.5, nw = W * 0.5 - pad;       // narrative column (right half)
  const coverNarr = report.statusAlert || report.firstImpression || '';
  doc.font(SANS).fontSize(9);
  const narrH = coverNarr ? doc.heightOfString(coverNarr, { width: nw, lineGap: 2.5 }) : 0;
  const cardH = Math.max(132, narrH + pad * 2);     // left column (score + pill) ≈ 116
  const cardY = y;
  doc.roundedRect(M, cardY, W, cardH, 12).fill(CARD);
  doc.roundedRect(M, cardY, W, cardH, 12).lineWidth(1).strokeColor(HAIR).stroke();
  eyebrow('OVERALL PRESENCE READ', M + pad, cardY + pad, FAINT, 7.5);
  doc.font(SERIF).fontSize(52).fillColor(CREAM).text(g10 != null ? g10 : '-', M + pad, cardY + pad + 12, { continued: true, lineBreak: false })
     .font(SANS).fontSize(13).fillColor(DIM).text(g10 != null ? '  /10' : '', { lineBreak: false });
  const projHi = num1(report.projection && report.projection.globalDay90);
  if (projHi) {
    const py = cardY + cardH - pad - 4;
    pillLeft('Projected ' + projHi + ' with full adherence', M + pad, py, false);
  }
  // narrative on the right half of the card (kept clear of the pill column)
  if (coverNarr) doc.font(SANS).fontSize(9).fillColor(SILVER).text(coverNarr, nx, cardY + pad, { width: nw, lineGap: 2.5 });
  y = cardY + cardH + 22;

  // method note + legend
  doc.font(SANS).fontSize(8).fillColor(FAINT).text(
    'A note on method. This is an image and styling read built from your photograph. A photograph shows how a feature appears, not the biology beneath it, so each score is a considered stylist read for setting priorities, not a clinical measurement.',
    M, y, { width: W, lineGap: 2.5 });
  y = doc.y + 14;
  // Legend, stacked one per line so the descriptions never collide.
  const legend = [['High Focus', 'where attention pays off most'], ['Refine', 'small habits that compound'], ['Natural Asset', 'an existing strength']];
  legend.forEach((lg) => {
    diamond(M + 3, y + 5.5, 6, SILVER);
    doc.font(SANS_B).fontSize(8.5).fillColor(SILVER).text(lg[0], M + 14, y, { continued: true, lineBreak: false })
       .font(SANS).fontSize(8.5).fillColor(FAINT).text('     ' + lg[1], { lineBreak: false });
    y += 16;
  });

  // ════════════════════ PAGES 2–4 · THE ANALYSIS (graded vectors) ════════════════════
  const vectors = Array.isArray(report.vectors) ? report.vectors : [];
  const allMetrics = vectors.flatMap((v) => (v.metrics || []).map((m) => ({ ...m, _vector: v })));
  const graded = vectors.map((v) => ({ ...v, metrics: (v.metrics || []).filter((m) => m.class !== 'fixed') }))
    .filter((v) => v.metrics.length);
  const fixed = allMetrics.filter((m) => m.class === 'fixed');

  startSection(420);
  sectionHead('01', 'THE READING', 'Where Presence Is Leaking',
    'A vector-by-vector read of where perceived status is leaking, and where it is already working for you. Each line pairs the cause with a score and a verdict.');
  doc.y += 4;
  graded.forEach((v) => {
    need(54);
    doc.y += 10;
    eyebrow(`${v.name || 'Vector'}${v.numeral ? '  ·  ' + v.numeral : ''}`, M, doc.y, SILVER, 8.5);
    doc.y += 12;
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(HAIR).stroke();
    doc.y += 2;
    v.metrics.forEach((m) => metricRow(m, true));
  });

  // ════════════════════ FIXED ARCHITECTURE ════════════════════
  if (fixed.length) {
    startSection(220);
    sectionHead('02', 'READ AS CONTEXT, NOT GRADED', 'Your Fixed Architecture',
      'Bone structure does not change without surgery, so it is not graded. Read this as context, then build on it. Most of it is already working for you.');
    doc.y += 6;
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(HAIR).stroke();
    doc.y += 2;
    fixed.forEach((m) => metricRow(m, false));
    need(60); doc.y += 18;
    doc.font(SERIF_I).fontSize(12).fillColor(SILVER).text('Read this page once, then set it aside.', M, doc.y, { width: W, align: 'center' });
    doc.font(SERIF_I).fontSize(12).fillColor(SILVER).text('Your effort belongs in the layers that move.', M, doc.y + 2, { width: W, align: 'center' });
  }

  // ════════════════════ THE CHROMATIC ARSENAL ════════════════════
  const c = report.chromatic;
  if (c) {
    startSection(300);
    sectionHead('03', 'THE LEVER WITH NO EFFORT', 'The Chromatic Arsenal',
      'Colour is the highest-return, lowest-effort lever in the dossier. It changes how your skin reads with no physical intervention. The codes below are calibrated to your colouring.');
    doc.y += 6;
    // three trait cards
    const triple = [
      ['UNDERTONE', c.undertone || '-', c.undertoneNote || ''],
      ['CONTRAST', c.contrast || '-', c.contrastNote || ''],
      ['FAMILY', c.profile || '-', c.profileNote || ''],
    ];
    const gap = 12, tcW = (W - gap * 2) / 3, tcY = doc.y;
    // height = tallest of the three (title can wrap, note sits under it)
    let tcH = 74;
    triple.forEach((t) => {
      doc.font(SERIF).fontSize(15); let h = 26 + doc.heightOfString(t[1], { width: tcW - 28 });
      if (t[2]) { doc.font(SANS).fontSize(7); h += 6 + doc.heightOfString(String(t[2]).toUpperCase(), { width: tcW - 28, characterSpacing: 0.5 }); }
      tcH = Math.max(tcH, h + 16);
    });
    triple.forEach((t, i) => {
      const tx = M + (tcW + gap) * i;
      doc.roundedRect(tx, tcY, tcW, tcH, 10).fill(CARD);
      doc.roundedRect(tx, tcY, tcW, tcH, 10).lineWidth(1).strokeColor(HAIR).stroke();
      eyebrow(t[0], tx + 14, tcY + 14, FAINT, 6.5);
      doc.font(SERIF).fontSize(15).fillColor(CREAM).text(t[1], tx + 14, tcY + 26, { width: tcW - 28 });
      if (t[2]) doc.font(SANS).fontSize(7).fillColor(DIM).text(String(t[2]).toUpperCase(), tx + 14, doc.y + 6, { width: tcW - 28, characterSpacing: 0.5 });
    });
    doc.y = tcY + tcH + 16;

    // power palette — swatch cards (3 per row), each row sized to its tallest note
    if (Array.isArray(c.powerPalette) && c.powerPalette.length) {
      eyebrow('POWER PALETTE  ·  WEAR AT THE COLLAR', M, doc.y, FAINT, 7.5); doc.y += 16;
      const per = 3, pgap = 12, pcW = (W - pgap * (per - 1)) / per;
      const items = c.powerPalette.slice(0, 6);
      let rowTop = doc.y;
      for (let r = 0; r < items.length; r += per) {
        const row = items.slice(r, r + per);
        let noteH = 0;
        row.forEach((s) => { if (s.note) { doc.font(SANS).fontSize(7.5); noteH = Math.max(noteH, doc.heightOfString(s.note, { width: pcW - 24, lineGap: 1.4 })); } });
        const pcH = 78 + noteH;                 // swatch(40) + name line + note + pad
        if (rowTop + pcH > BOTTOM) { doc.addPage(); doc.x = M; doc.y = M + 6; rowTop = doc.y; }
        row.forEach((s, ci) => {
          const sx = M + (pcW + pgap) * ci, sy = rowTop;
          doc.roundedRect(sx, sy, pcW, pcH, 9).fill(CARD);
          doc.roundedRect(sx, sy, pcW, pcH, 9).lineWidth(1).strokeColor(HAIR).stroke();
          doc.save(); doc.roundedRect(sx, sy, pcW, 40, 9).clip(); doc.rect(sx, sy, pcW, 40).fill(safeHex(s.hex)); doc.restore();
          doc.font(SERIF).fontSize(11).fillColor(CREAM).text(s.name || '', sx + 12, sy + 50, { continued: true, lineBreak: false })
             .font(MONO).fontSize(7).fillColor(FAINT).text('   ' + safeHex(s.hex).toUpperCase(), { lineBreak: false });
          if (s.note) doc.font(SANS).fontSize(7.5).fillColor(DIM).text(s.note, sx + 12, sy + 66, { width: pcW - 24, lineGap: 1.4 });
        });
        rowTop += pcH + pgap;
      }
      doc.y = rowTop - pgap + 16;
    }
    if (c.supportingNeutrals) { doc.font(SANS_I).fontSize(8).fillColor(FAINT).text('Supporting neutrals. ' + c.supportingNeutrals, M, doc.y, { width: W }); doc.y += 6; }

    // avoid + metals panels
    doc.y += 8;
    const panW = (W - 16) / 2, tw = panW - 32;
    const anti = (Array.isArray(c.antiPalette) ? c.antiPalette : []).slice(0, 3);
    // measure both columns so the panels are exactly as tall as their content
    let avoidH = 34;
    anti.forEach((a) => {
      doc.font(SANS_B).fontSize(8.5); avoidH += doc.heightOfString((a.name || '') + (a.hex ? '  ' + safeHex(a.hex).toUpperCase() : ''), { width: tw });
      if (a.impact) { doc.font(SANS).fontSize(8); avoidH += doc.heightOfString(a.impact, { width: tw, lineGap: 1.4 }) + 2; }
      avoidH += 8;
    });
    let metalsH = 34;
    if (c.metals && c.metals.note) { doc.font(SANS).fontSize(8); metalsH += doc.heightOfString(c.metals.note, { width: tw, lineGap: 1.5 }) + 6; }
    if (c.stylingCorrections) { metalsH += 13; doc.font(SANS).fontSize(8); metalsH += doc.heightOfString(c.stylingCorrections, { width: tw, lineGap: 1.5 }); }
    const panH = Math.max(avoidH, metalsH, 64) + 16;
    need(panH + 12);
    const panY = doc.y, mX = M + panW + 16;
    // avoid
    doc.roundedRect(M, panY, panW, panH, 10).fill(CARD);
    doc.roundedRect(M, panY, panW, panH, 10).lineWidth(1).strokeColor(HAIR).stroke();
    doc.font(SANS_B).fontSize(9).fillColor('#d98a8a').text('Avoid at the Face', M + 16, panY + 16, { lineBreak: false });
    let ay = panY + 34;
    anti.forEach((a) => {
      doc.font(SANS_B).fontSize(8.5).fillColor(SILVER).text((a.name || '') + (a.hex ? '  ' + safeHex(a.hex).toUpperCase() : ''), M + 16, ay, { width: tw });
      if (a.impact) doc.font(SANS).fontSize(8).fillColor(DIM).text(a.impact, M + 16, doc.y + 2, { width: tw, lineGap: 1.4 });
      ay = doc.y + 8;
    });
    // metals
    doc.roundedRect(mX, panY, panW, panH, 10).fill(CARD);
    doc.roundedRect(mX, panY, panW, panH, 10).lineWidth(1).strokeColor(HAIR).stroke();
    doc.font(SANS_B).fontSize(9).fillColor(SILVER).text('Metals', mX + 16, panY + 16, { lineBreak: false });
    if (c.metals && c.metals.locked) pillLeft(c.metals.locked, mX + 16 + 52, panY + 13, false);
    let my = panY + 34;
    if (c.metals && c.metals.note) { doc.font(SANS).fontSize(8).fillColor(DIM).text(c.metals.note, mX + 16, my, { width: tw, lineGap: 1.5 }); my = doc.y + 6; }
    if (c.stylingCorrections) {
      doc.font(SANS_B).fontSize(8).fillColor(SILVER).text('Styling', mX + 16, my, { width: tw });
      doc.font(SANS).fontSize(8).fillColor(DIM).text(c.stylingCorrections, mX + 16, doc.y + 2, { width: tw, lineGap: 1.5 });
    }
    doc.y = panY + panH + 8;
  }

  // ════════════════════ THE 90-DAY PROTOCOL ════════════════════
  const iv = report.intervention;
  if (iv) {
    startSection(220);
    sectionHead('04', 'THE WORK', 'The 90-Day Protocol',
      'Your quick reference. Two daily routines and a short set of drills, each step chosen to support a focus area above. Every step here is a health-positive habit.');
    doc.y += 6;
    const blocks = [
      ['Morning · Vitality & Defence', 'ANCHOR IT TO BRUSHING YOUR TEETH', iv.morning],
      ['Night · Repair & Resurface', 'CLEAR THE DAY, THEN LET THE SKIN RECOVER', iv.night],
      ['Carriage · Structure & Posture', 'SCATTER THE DRILLS ACROSS THE DAY', iv.mechanical],
    ];
    const AGENT_W = 138, DESC_X = 196, DESC_W = W - DESC_X - 22;
    // per-step height = the taller of the step-name column and the rationale column,
    // measured at the EXACT widths used to draw — so nothing can spill the box.
    const stepH = (s) => {
      doc.font(SERIF).fontSize(10.5);
      const aH = doc.heightOfString((s.agent || s.step || '') + (s.rx ? '  [Rx]' : ''), { width: AGENT_W });
      doc.font(SANS).fontSize(8.5);
      const dH = doc.heightOfString(s.rationale || s.spec || '', { width: DESC_W, lineGap: 1.5 });
      return Math.max(aH, dH, 16) + 13;
    };
    blocks.forEach(([title, sub, steps]) => {
      if (!Array.isArray(steps) || !steps.length) return;
      let body = 0; steps.forEach((s) => { body += stepH(s); });
      const h = 58 + body + 8;
      need(h + 14);
      const by = doc.y, bx = M;
      doc.roundedRect(bx, by, W, h, 12).fill(CARD);
      doc.roundedRect(bx, by, W, h, 12).lineWidth(1).strokeColor(HAIR).stroke();
      doc.font(SERIF).fontSize(14).fillColor(CREAM).text(title, bx + 22, by + 18, { lineBreak: false });
      eyebrow(sub, bx + 22, by + 38, FAINT, 6.5);
      let sy = by + 58;
      steps.forEach((s, i) => {
        const sh = stepH(s);
        doc.font(MONO).fontSize(9).fillColor(GHOST).text(String(i + 1).padStart(2, '0'), bx + 22, sy + 1, { lineBreak: false });
        doc.font(SERIF).fontSize(10.5).fillColor(CREAM).text((s.agent || s.step || '') + (s.rx ? '  [Rx]' : ''), bx + 52, sy, { width: AGENT_W });
        doc.font(SANS).fontSize(8.5).fillColor(DIM).text(s.rationale || s.spec || '', bx + DESC_X, sy, { width: DESC_W, lineGap: 1.5 });
        sy += sh;
      });
      doc.y = by + h + 14;
    });
  }

  // ════════════════════ THE HORIZON ════════════════════
  const proj = report.projection;
  if (proj) {
    startSection(260);
    sectionHead('05', 'THE HORIZON', 'What Ninety Days Produces',
      'Kept consistently, here is an honest picture of what ninety days changes. No percentiles. Just the qualities that shift when these habits compound.');
    doc.y += 8;
    eyebrow('PROJECTED EVOLUTION  ·  MODELLED NINETY-DAY OUTCOME, STRICT ADHERENCE', M, doc.y, FAINT, 7.5);
    doc.y += 18;
    const rows = Array.isArray(proj.rows) ? proj.rows.slice(0, 8) : [];
    const barX = M + 180, barW = W - 180 - 150, barRightLabelX = M + W - 130, gainRightX = M + W;
    rows.forEach((r) => {
      need(30);
      const ry = doc.y;
      doc.font(SERIF).fontSize(11).fillColor(CREAM).text(fmt(r.vector), M, ry + 1, { width: 170 });
      const d0 = Number(r.day0) || 0, d90 = Number(r.day90) || 0;
      // track + fill
      doc.roundedRect(barX, ry + 6, barW, 5, 2.5).fill('#222228');
      const fillW = Math.max(3, Math.min(1, d90 / 10) * barW);
      doc.roundedRect(barX, ry + 6, fillW, 5, 2.5).fill(SILVER);
      doc.font(MONO).fontSize(8.5).fillColor(DIM).text(d0.toFixed(1), barRightLabelX, ry + 1, { width: 24, align: 'right', lineBreak: false });
      arrow(barRightLabelX + 30, ry + 5, 12, FAINT);
      doc.font(MONO).fontSize(9).fillColor(CREAM).text(d90.toFixed(1), barRightLabelX + 50, ry + 1, { width: 28, align: 'left', lineBreak: false });
      pillRight('+' + (Number(r.delta) || (d90 - d0)).toFixed(1), gainRightX, ry - 2, false);
      doc.y = ry + 22;
      doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.5).strokeColor(FAINTLINE).stroke();
      doc.y += 2;
    });
    // global score card
    need(96); doc.y += 14;
    const gY = doc.y, gH = 80;
    doc.roundedRect(M, gY, W, gH, 12).fill(CARD);
    doc.roundedRect(M, gY, W, gH, 12).lineWidth(1).strokeColor(HAIR).stroke();
    eyebrow('OVERALL PRESENCE READ', M + 24, gY + 18, FAINT, 7.5);
    const gd0 = num1(proj.globalDay0), gd90 = num1(proj.globalDay90);
    doc.font(SERIF).fontSize(34).fillColor(CREAM).text(gd0 || '-', M + 24, gY + 30, { lineBreak: false });
    const gw0 = doc.widthOfString(gd0 || '-');
    arrow(M + 24 + gw0 + 16, gY + 48, 22, FAINT);
    doc.font(SERIF).fontSize(34).fillColor(CREAM).text(gd90 || '-', M + 24 + gw0 + 50, gY + 30, { lineBreak: false });
    if (gd0 && gd90) {
      pillLeft('+' + (Number(proj.globalDay90) - Number(proj.globalDay0)).toFixed(1) + ' in 90 days', M + W * 0.46, gY + 24, false);
      doc.font(SANS).fontSize(8.5).fillColor(DIM).text('Fixed structural features are held constant, so the ceiling is realistic, not inflated.', M + W * 0.46, gY + 46, { width: W * 0.54 - 24, lineGap: 1.5 });
    }
    doc.y = gY + gH + 18;
    if (proj.narrative) { need(40); doc.font(SERIF_I).fontSize(12).fillColor(SILVER).text(proj.narrative, M, doc.y, { width: W, align: 'center', lineGap: 3 }); }
  }

  // ════════════════════ THE PROGRAMME ════════════════════
  startSection(260);
  sectionHead('06', 'THE PROGRAMME', 'How This Continues',
    'This blueprint is your baseline, a single photograph in time. The programme keeps reading you, day by day, so the work shows up in numbers you can watch.');
  doc.y += 8;
  // four feature cards (real product features — short factual labels)
  const feats = [
    ['DAILY', 'The Daily Mirror', 'A ten-second morning scan. A fresh Sharpness Score, today against yesterday.'],
    ['DAILY', 'One Action', 'A single task aimed at your weakest signal that day. Never a verdict, always a fix.'],
    ['WEEKLY', 'The Trajectory', 'The slow metrics re-scored each week and projected forward, to a date you can see.'],
    ['DAY 30', 'The Re-Audit', 'A full re-read against this baseline. The measured change, on your own face.'],
  ];
  const fg = 12, fcW = (W - fg * 3) / 4, fcH = 116, fcY = doc.y;
  feats.forEach((f, i) => {
    const fx = M + (fcW + fg) * i;
    doc.roundedRect(fx, fcY, fcW, fcH, 10).fill(CARD);
    doc.roundedRect(fx, fcY, fcW, fcH, 10).lineWidth(1).strokeColor(HAIR).stroke();
    eyebrow(f[0], fx + 13, fcY + 14, FAINT, 6.5);
    doc.font(SERIF).fontSize(12.5).fillColor(CREAM).text(f[1], fx + 13, fcY + 25, { width: fcW - 26 });
    doc.font(SANS).fontSize(8).fillColor(DIM).text(f[2], fx + 13, doc.y + 5, { width: fcW - 26, lineGap: 1.6 });
  });
  doc.y = fcY + fcH + 16;

  // method & honest limitations (from the report's own methodology when present)
  if (report.methodology) {
    need(96);
    const mY = doc.y, mH = Math.min(150, 44 + doc.heightOfString(report.methodology, { width: W - 48, lineGap: 2 }));
    doc.roundedRect(M, mY, W, mH, 10).fill(CARD);
    doc.roundedRect(M, mY, W, mH, 10).lineWidth(1).strokeColor(HAIR).stroke();
    eyebrow('METHOD & HONEST LIMITATIONS', M + 24, mY + 16, FAINT, 7);
    doc.font(SANS).fontSize(8.5).fillColor(DIM).text(report.methodology, M + 24, mY + 32, { width: W - 48, lineGap: 2 });
    doc.y = mY + mH + 10;
  }

  // ════════════════════ FOOTERS (every page) ════════════════════
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Writing into the bottom margin band would otherwise make pdfkit auto-add a
    // blank page per iteration — zero the bottom margin while we draw the footer.
    const bm = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    const fy = PH - 32;
    doc.moveTo(M, fy - 8).lineTo(M + W, fy - 8).lineWidth(0.5).strokeColor(FAINTLINE).stroke();
    doc.font(SANS).fontSize(7).fillColor(FAINT)
       .text('THE PRESENCE DOSSIER', M, fy, { width: W * 0.7, characterSpacing: 1.2, lineBreak: false });
    doc.font(SANS).fontSize(7).fillColor(FAINT)
       .text(`MAINCHARACTER  ·  ${String(i + 1).padStart(2, '0')}`, M, fy, { width: W, align: 'right', characterSpacing: 1.2, lineBreak: false });
    doc.page.margins.bottom = bm;
  }
}

// ─── Test helpers (exported for integration tests) ────────────────────────────

/**
 * Inject a Gemini report into a session. TEST ONLY.
 * @param {string} auditId
 * @param {object} report
 * @param {boolean} consent
 */
async function _injectReportForTest(auditId, report, consent = true) {
  _updateSession(auditId, {
    geminiReport: report,
    consentGiven: consent,
    analyzedAt: new Date().toISOString(),
  });
}

/**
 * Flip the paid flag on a session. TEST ONLY.
 * @param {string} auditId
 * @param {boolean} paid
 */
async function _setAuditPaidForTest(auditId, paid) {
  _updateSession(auditId, { paid });
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ─── POST /quiz ───────────────────────────────────────────────────────────────
// Sign-in required (funnel-repair P1): every audit is owned by a signed-in user.
// Returns the new auditId; the frontend carries it through capture → analyze.

router.post('/quiz', (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { answers } = req.body || {};
  if (!Array.isArray(answers) || answers.length !== 5) {
    return res.status(400).json({ error: 'exactly 5 answers required' });
  }

  // Sanitise answers — each answer contributes user-supplied text.
  // Prompt-injection guard: the audit-prompts module wraps these in delimiters.
  const safe = answers.map((a) => ({
    questionId: String(a.questionId || '').slice(0, 20),
    choice:     String(a.choice     || '').slice(0, 5),
    label:      String(a.label      || '').slice(0, 200),
  }));

  // User-owned session: the session id is a fresh UUID, distinct from the userId.
  const auditId = crypto.randomUUID();
  const now = new Date().toISOString();
  _putSession({
    id:          auditId,
    guestId:     null, // column retained for back-compat; always null now
    userId:      actor.userId,
    quizAnswers: safe,
    photoKey:    null,
    geminiReport: null,
    paid:        false,
    paidAt:      null,
    razorpayPaymentId: null,
    consentGiven: false,
    pdfKey:      null,
    pdfBase64:   null,
    createdAt:   now,
    updatedAt:   now,
    expiresAt:   null, // user-owned, lives forever
  });

  events.trackAnonymous('lookmaxing_quiz_completed', { auditId }, actor.userId).catch(() => {});
  return res.json({ auditId, answersStored: safe.length });
});

// ─── POST /capture ────────────────────────────────────────────────────────────

// Mounted at BOTH `/photo` (capture.html) and `/capture` (tests). The signed-in
// frontend carries the auditId returned by /quiz and sends it here.
router.post(['/capture', '/photo'], upload.single('photo'), async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const auditId = String(req.body.auditId || '').trim();
  const consentRaw  = String(req.body.consent_18plus || '').trim().toLowerCase();
  const consentGiven = consentRaw === 'true' || consentRaw === '1';

  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  if (!req.file) return res.status(400).json({ error: 'photo file required' });

  // Persist consent flag (even when false — the analyze step gates on this).
  _updateSession(auditId, { consentGiven });

  // Normalise the photo: EXIF auto-orient (phone selfies arrive rotated) and
  // downscale so the Gemini inline payload + session stash stay bounded.
  // sharp may be unavailable or the buffer may not be a real image (tests use a
  // 4-byte stub) — fall back to the raw bytes rather than failing the upload.
  let photoBuffer = req.file.buffer;
  try {
    const sharp = require('sharp'); // eslint-disable-line global-require
    photoBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch (err) {
    log.warn('CAPTURE', `photo normalise skipped for ${auditId}: ${err.message}`);
  }

  // Attempt durable storage (R2). When R2 is unconfigured this is a no-op dryRun.
  const key = `audit/${auditId}/photo.jpg`;
  let photoKey = null;
  try {
    const result = await storage.putPhoto(key, photoBuffer, 'image/jpeg');
    photoKey = result.dryRun ? `local:${key}` : result.key;
  } catch (err) {
    log.warn('CAPTURE', `photo store failed for ${auditId}: ${err.message}`);
    photoKey = `local:${key}`;
  }

  // Stash the bytes on the session so /analyze can always reach Gemini with the
  // photo, regardless of whether R2 is configured. Cleared after analyze.
  _updateSession(auditId, { photoKey, photoB64: photoBuffer.toString('base64') });

  events.trackAnonymous('lookmaxing_photo_uploaded', { auditId }, actor.userId).catch(() => {});
  return res.json({ ok: true, auditId });
});

// ─── POST /analyze ────────────────────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  // Guard: Wave 1C module must exist.
  if (!getAuditPrompts()) {
    return res.status(503).json({ error: 'audit_engine_warming_up' });
  }

  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { auditId } = req.body || {};
  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  // 18+ consent gate (spec §F).
  if (!session.consentGiven) {
    return res.status(412).json({ error: 'consent_required' });
  }

  // Recover the photo bytes. Prefer the session stash (always present after
  // /capture, independent of R2); fall back to durable storage for non-local keys.
  let photoBuffer = null;
  if (session.photoB64) {
    try { photoBuffer = Buffer.from(session.photoB64, 'base64'); } catch { /* ignore */ }
  }
  if (!photoBuffer && session.photoKey && !session.photoKey.startsWith('local:')) {
    try {
      photoBuffer = await storage.readImage(session.photoKey);
    } catch {
      // No photo readable — proceed without it.
    }
  }

  let report;
  try {
    report = await _callGemini(session.quizAnswers || [], photoBuffer);
  } catch (err) {
    // A genuine Gemini failure (key present but the call/parse failed). Surface it
    // honestly rather than fabricating a reading — the founder reads this signal.
    log.error('ANALYZE', `Gemini unavailable for ${auditId}: ${err.message}`);
    return res.status(502).json({ error: 'analysis_unavailable' });
  }

  // Drop the raw photo bytes from the session now that the reading is generated.
  _updateSession(auditId, { geminiReport: report, analyzedAt: new Date().toISOString(), photoB64: null });

  events.trackAnonymous('lookmaxing_audit_generated', { auditId }, actor.userId).catch(() => {});

  // Return free-resolution view (no premium fields).
  return res.json({
    auditId,
    paid: false,
    report: applyResolutionGate(report, false),
  });
});

/**
 * Entitlement check: the full report is unlocked when EITHER the session has been
 * explicitly paid (one-time legacy/demo path) OR the session's owning user has an
 * active lookmaxxing subscription (user.lookmaxxingActive === true).
 * This is the source of truth used by GET /audit/:id and GET /audit/:id/pdf.
 *
 * @param {object} session — audit session record
 * @returns {Promise<boolean>}
 */
async function _isUnlocked(session) {
  if (!session) return false;
  if (session.paid) return true;
  if (session.userId) {
    try {
      const user = await User.getUserByToken(session.userId);
      if (user && user.lookmaxxingActive === true) return true;
    } catch (err) {
      log.warn('ENTITLEMENT', `user lookup failed: ${err.message}`);
    }
  }
  return false;
}

// ─── GET /audit/:id ───────────────────────────────────────────────────────────

router.get('/audit/:id', async (req, res) => {
  const actor = resolveActor(req);
  // Guest may not have a cookie if they're fetching directly — allow no-auth for
  // existing sessions by matching any identity. We still enforce ownership below.
  const id = req.params.id;
  const session = _getSession(id);
  if (!session) return res.status(404).json({ error: 'audit not found' });

  if (!actor || !canAccess(session, actor)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const unlocked = await _isUnlocked(session);

  events.trackAnonymous('lookmaxing_audit_viewed', { auditId: id }, actor.userId).catch(() => {});

  return res.json({
    auditId: id,
    paid: unlocked,
    analyzedAt: session.analyzedAt || null,
    report: applyResolutionGate(session.geminiReport, unlocked),
    quizAnswers: session.quizAnswers,
    consentGiven: session.consentGiven,
  });
});

// True only when REAL Razorpay keys are configured (test or live). Absent/mock
// keys => demo mode, where the ₹99 unlock can be settled without a live charge.
function _razorpayLive() {
  const key_id     = process.env.RAZORPAY_KEY_ID || '';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || '';
  return !!(key_id && key_secret && !key_id.includes('mock'));
}

// Whether the ₹99 unlock may be settled WITHOUT a real charge (testing/demo).
// HARD RULE: never bypass when real LIVE (rzp_live_) keys are set — that is real
// money, so a captured Razorpay payment is the only path to unlock. In every
// non-live setup the bypass is ON by default (so the report + PDF can be tested
// freely pre-launch); set PAYMENT_BYPASS=false to force the real Razorpay
// (test) checkout instead. Going live = set rzp_live_ keys → bypass auto-off.
function _paymentBypass() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  if (keyId.startsWith('rzp_live_')) return false;
  if (process.env.PAYMENT_BYPASS === 'false') return false;
  return true;
}

// Settle a paid audit: flip paid, credit ₹499, seed the Day-30 baseline. Shared by
// the Razorpay webhook (real capture) and the demo-mode confirm (no live keys), so
// the unlock is identical either way and never drifts.
// If the session has a pendingReferralCode, it is redeemed exactly once here. A
// redeem that returns ok:false (race condition — code already exhausted) is logged
// but does NOT block the unlock: the payment was already initiated at a valid price.
async function _settlePaidAudit(auditId, { paymentId = null } = {}) {
  const session = _getSession(auditId);
  if (!session) return null;
  if (session.paid) return session;

  // ── Referral code redemption ──────────────────────────────────────────────
  // Atomically redeem the pending code (if any) before flipping paid=true.
  // Guards: code is only redeemed once per audit; redeemCode is itself atomic.
  const pendingCode = session.pendingReferralCode || null;
  if (pendingCode) {
    try {
      const ReferralCodes = require('../models/referral-codes'); // eslint-disable-line global-require
      const redeemResult  = ReferralCodes.redeemCode(pendingCode);
      if (redeemResult.ok) {
        log.info('PAY-SETTLE', `referral code ${pendingCode} redeemed for audit ${auditId}`);
      } else {
        // Code was exhausted in a race — payment already initiated, still unlock.
        log.warn('PAY-SETTLE', `referral code ${pendingCode} redeem failed (race): ${redeemResult.reason} — unlocking anyway`);
      }
    } catch (err) {
      log.warn('PAY-SETTLE', `referral redeem threw: ${err.message}`);
    }
  }

  _updateSession(auditId, {
    paid:              true,
    paidAt:            new Date().toISOString(),
    razorpayPaymentId: paymentId,
    // Record the referral on the settled session; clear the pending field.
    ...(pendingCode ? {
      referralCode:        pendingCode,
      referralPercentOff:  session.referralPercentOff || null,
      pendingReferralCode: null,
    } : {}),
  });

  if (session.userId) {
    try {
      const user = await User.getUserByToken(session.userId);
      if (user) {
        const updates = {};
        const current = typeof user.paywallCredits === 'number' ? user.paywallCredits : 0;
        updates.paywallCredits = current + 99;
        if (!user.lookmaxBaseline && session.geminiReport) {
          const report = session.geminiReport;
          updates.lookmaxBaseline = {
            ...report,
            scores:           _buildCompatScores(report),
            leverageAxis:     report.biggestLever ? report.biggestLever.metric : null,
            overall:          report.auraScore || 0,
            capturedAt:       new Date().toISOString(),
            photoStorageKeys: session.photoKey ? [session.photoKey] : [],
          };
        }
        await User.updateUser(user.phone, updates);
      }
    } catch (err) {
      log.warn('PAY-SETTLE', `post-payment user update failed: ${err.message}`);
    }
  }
  return _getSession(auditId);
}

// ─── POST /pay/validate-code ──────────────────────────────────────────────────
// Read-only price check for a referral code. Does NOT redeem. Returns the
// discounted amounts and display strings so the UI can show the final price
// before the user commits to the order. Requires a valid actor (same pattern
// as other /pay endpoints) but does NOT require an existing audit session.

router.post('/pay/validate-code', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });

  const ReferralCodes = require('../models/referral-codes'); // eslint-disable-line global-require
  const { inrPaiseToUsd } = require('../services/razorpay'); // eslint-disable-line global-require

  const BASE_PAISE = 49900; // ₹499 — lookmax499 plan base price
  const validation  = ReferralCodes.validateCode(code);

  if (!validation.valid) {
    return res.json({
      valid:    false,
      reason:   validation.reason,
      baseInr:  BASE_PAISE / 100,
      baseUsd:  inrPaiseToUsd(BASE_PAISE),
    });
  }

  const discountedPaise = Math.round(BASE_PAISE * (1 - validation.percentOff / 100));
  const discountedInr   = discountedPaise / 100;
  const discountedUsd   = inrPaiseToUsd(discountedPaise);

  return res.json({
    valid:          true,
    percentOff:     validation.percentOff,
    baseInr:        BASE_PAISE / 100,
    baseUsd:        inrPaiseToUsd(BASE_PAISE),
    discountedPaise,
    discountedInr,
    discountedUsd,
  });
});

// ─── POST /pay/order ─────────────────────────────────────────────────────────
// One-time Razorpay order for ₹499 (49900 paise). Optional referral code
// discounts the amount; the code is stored on the session as pendingReferralCode
// and redeemed atomically in _settlePaidAudit.

router.post('/pay/order', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { auditId, code } = req.body || {};
  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  if (session.paid) {
    return res.json({ alreadyPaid: true, auditId });
  }

  // ── Referral code validation (optional) ──────────────────────────────────
  let orderAmount = 49900; // ₹499 base in paise
  let referralPercentOff = null;
  let referralCodeUsed   = null;

  if (code) {
    const ReferralCodes = require('../models/referral-codes'); // eslint-disable-line global-require
    const validation = ReferralCodes.validateCode(code);
    if (!validation.valid) {
      return res.status(400).json({ error: 'invalid_code', reason: validation.reason });
    }
    orderAmount        = Math.round(49900 * (1 - validation.percentOff / 100));
    referralPercentOff = validation.percentOff;
    referralCodeUsed   = String(code).toUpperCase();

    // Store the pending code on the session so _settlePaidAudit can redeem it.
    _updateSession(auditId, {
      pendingReferralCode:  referralCodeUsed,
      referralPercentOff,
    });
  }

  try {
    // Razorpay order (₹499 base = 49900 paise, discounted when code applied).
    // Mocked when bypassing (testing/demo).
    const { inrPaiseToUsd } = require('../services/razorpay'); // eslint-disable-line global-require
    const key_id  = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock';
    const live    = !_paymentBypass();

    let order;
    if (live) {
      const Razorpay = require('razorpay'); // eslint-disable-line global-require
      const rz = new Razorpay({ key_id, key_secret: process.env.RAZORPAY_KEY_SECRET });
      order = await rz.orders.create({
        amount:   orderAmount,
        currency: 'INR',
        receipt:  `mc_audit_${auditId.slice(0, 8)}_${Date.now()}`,
        notes:    { auditId, source: 'lookmaxing_audit_unlock' },
      });
    } else {
      // Mock order for tests, dev, and the pre-go-live demo window.
      order = {
        id:       `order_mock_${Date.now()}`,
        amount:   orderAmount,
        currency: 'INR',
        receipt:  `mc_audit_${auditId.slice(0, 8)}_${Date.now()}`,
        notes:    { auditId, source: 'lookmaxing_audit_unlock' },
      };
    }

    events.trackAnonymous('lookmaxing_pay_initiated', { auditId }, actor.userId).catch(() => {});

    return res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    key_id,
      usd:      inrPaiseToUsd(order.amount),
      auditId,
      testMode: !live, // client settles via /pay/test-confirm instead of Razorpay
      ...(referralCodeUsed ? { referralApplied: true, percentOff: referralPercentOff } : {}),
    });
  } catch (err) {
    log.error('PAY-ORDER', `order create failed for ${auditId}: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

// ─── POST /pay/subscribe ─────────────────────────────────────────────────────
// Primary unlock path for the ₹499/month recurring subscription. Creates a
// Razorpay subscription (lookmax499 plan) and persists the subscription id.
// The legacy /pay/order + one-time /pay/webhook remain for backward compat.
// Note: referral code discounting is one-time-order only (founder, 2026-06-15);
// the subscription path does not accept or apply referral codes.

router.post('/pay/subscribe', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { auditId } = req.body || {};
  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  // Already unlocked — short-circuit without creating a duplicate subscription.
  const alreadyUnlocked = await _isUnlocked(session);
  if (alreadyUnlocked) {
    return res.json({ alreadyUnlocked: true });
  }

  // Testing/demo bypass: do not touch Razorpay at all — the client settles via
  // /pay/test-confirm and the report unlocks directly. (Never with rzp_live_ keys.)
  // Returns the same shape as the live path so the client + tests are unaffected.
  if (_paymentBypass()) {
    const user = session.userId ? await User.getUserByToken(session.userId) : null;
    const subId = 'sub_bypass_' + Date.now();
    _updateSession(auditId, { razorpaySubscriptionId: subId });
    if (user) {
      await User.updateUser(user.phone, { razorpaySubscriptionId: subId, pendingPlan: 'lookmax499' });
    }
    events.trackAnonymous('lookmaxing_subscribe_initiated', { auditId, bypass: true }, actor.userId).catch(() => {});
    return res.json({
      subscriptionId: subId,
      keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
      testMode: true,
      auditId,
    });
  }

  try {
    // Load owning user for name / email / phone (needed for Razorpay customer).
    const user = session.userId ? await User.getUserByToken(session.userId) : null;

    const sub = await razorpay.createSubscription(
      'lookmax499',
      {
        phone: (user && user.phone) || '',
        name:  (user && user.name)  || '',
        email: (user && user.email) || '',
      },
      {
        userId:  actor.userId,
        auditId,
        source:  'lookmaxing_audit',
      }
    );

    // Persist the subscription id on the session and the user record so the
    // entitlement check can resolve this subscription back to the user on webhook.
    _updateSession(auditId, { razorpaySubscriptionId: sub.id });
    if (user) {
      await User.updateUser(user.phone, {
        razorpaySubscriptionId: sub.id,
        pendingPlan: 'lookmax499',
      });
    }

    const live = _razorpayLive();
    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock';

    events.trackAnonymous('lookmaxing_subscribe_initiated', { auditId, subscriptionId: sub.id }, actor.userId).catch(() => {});

    log.info('PAY-SUB', `subscription created for audit ${auditId}: ${sub.id}${sub.mock ? ' (mock)' : ''}`);

    return res.json({
      subscriptionId: sub.id,
      keyId,
      testMode: !live,
    });
  } catch (err) {
    log.error('PAY-SUB', `subscription create failed for ${auditId}: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

// ─── POST /pay/webhook ────────────────────────────────────────────────────────

router.post('/pay/webhook', async (req, res) => {
  // Verify Razorpay signature over raw body.
  const rawBody  = req.rawBody || JSON.stringify(req.body);
  const sig      = req.headers['x-razorpay-signature'] || '';
  const verified = razorpay.verifyWebhookSignature(rawBody, sig);

  if (!verified) {
    log.warn('PAY-WEBHOOK', 'signature verification failed');
    return res.status(401).json({ error: 'invalid signature' });
  }

  const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const event = body.event;

  if (event !== 'payment.captured') {
    return res.json({ ok: true, ignored: true });
  }

  const paymentEntity = (body.payload && body.payload.payment && body.payload.payment.entity) || {};
  const paymentId     = paymentEntity.id || null;
  const notes         = paymentEntity.notes || {};
  const auditId       = notes.auditId || null;

  if (!auditId) {
    log.warn('PAY-WEBHOOK', 'payment.captured with no auditId in notes');
    return res.json({ ok: true, ignored: true });
  }

  const session = _getSession(auditId);
  if (!session) {
    log.warn('PAY-WEBHOOK', `audit ${auditId} not found`);
    return res.json({ ok: true, ignored: true });
  }

  // ₹99 credit toward month one + the Day-30 baseline (shared settlement helper).
  await _settlePaidAudit(auditId, { paymentId });

  events.trackAnonymous('lookmaxing_pay_succeeded', { auditId, paymentId }, session.userId).catch(() => {});

  log.info('PAY-WEBHOOK', `payment.captured for audit ${auditId}`);
  return res.json({ ok: true });
});

// ─── POST /pay/test-confirm ────────────────────────────────────────────────────
// Demo / dogfood ONLY. Lets the ₹99 → full report + PDF be experienced without a
// real charge. Allowed only when _paymentBypass() is true (PAYMENT_BYPASS=true or
// no real keys). HARD-DISABLED when real rzp_live_ keys are set — then a
// Razorpay-captured payment (via /pay/webhook) is the only path to unlock.
//
// In demo mode this ALSO simulates the recurring subscription activation on the
// owning user (lookmaxxingActive=true, subscriptionStatus='active', etc.) so the
// founder can experience the full recurring-entitlement flow before live keys.
router.post('/pay/test-confirm', async (req, res) => {
  if (!_paymentBypass()) {
    return res.status(403).json({ error: 'live payment required' });
  }
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { auditId } = req.body || {};
  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  const settled = await _settlePaidAudit(auditId, { paymentId: 'test_mode' });

  // Demo-mode subscription activation: set the user's lookmaxxingActive so the
  // subscription entitlement check (_isUnlocked) immediately returns true for all
  // this user's sessions — matching the real webhook path.
  if (session.userId) {
    try {
      const user = await User.getUserByToken(session.userId);
      if (user) {
        const userUpdates = {
          lookmaxxingActive: true,
          subscriptionStatus: 'active',
        };
        if (!user.subscribedAt) userUpdates.subscribedAt = new Date().toISOString();
        if (!user.lookmaxxingStartedAt) userUpdates.lookmaxxingStartedAt = new Date().toISOString();
        await User.updateUser(user.phone, userUpdates);
        log.info('PAY-TEST', `demo subscription activated on user ${actor.userId}`);
      }
    } catch (err) {
      log.warn('PAY-TEST', `demo subscription user update failed: ${err.message}`);
    }
  }

  events.trackAnonymous('lookmaxing_pay_test_confirmed', { auditId }, actor.userId).catch(() => {});
  log.info('PAY-TEST', `demo-mode unlock for audit ${auditId}`);
  return res.json({ ok: true, testMode: true, auditId, paid: !!(settled && settled.paid) });
});

// Activate the lookmaxxing subscription entitlement on the owning user.
async function _activateSubUser(userId) {
  if (!userId) return;
  try {
    const user = await User.getUserByToken(userId);
    if (!user) return;
    const u = { lookmaxxingActive: true, subscriptionStatus: 'active' };
    if (!user.subscribedAt) u.subscribedAt = new Date().toISOString();
    if (!user.lookmaxxingStartedAt) u.lookmaxxingStartedAt = new Date().toISOString();
    await User.updateUser(user.phone, u);
  } catch (err) { log.warn('PAY-VERIFY', `sub user activate failed: ${err.message}`); }
}

// ─── POST /pay/verify — client-return verification (webhook-independent) ────────
// After a real Razorpay subscription checkout succeeds, the client posts the
// payment id + subscription id + signature here. We verify the signature and
// unlock immediately, so the report opens even if the dashboard webhook lags or
// isn't configured. The webhook remains a backstop (both paths are idempotent).
router.post('/pay/verify', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });
  const { auditId, razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body || {};
  if (!auditId || !razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
    return res.status(400).json({ error: 'missing payment fields' });
  }
  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  const ok = razorpay.verifySubscriptionPayment(razorpay_payment_id, razorpay_subscription_id, razorpay_signature);
  if (!ok) return res.status(400).json({ error: 'signature verification failed' });

  const settled = await _settlePaidAudit(auditId, { paymentId: razorpay_payment_id });
  await _activateSubUser(actor.userId);
  events.trackAnonymous('lookmaxing_pay_verified', { auditId }, actor.userId).catch(() => {});
  log.info('PAY-VERIFY', `verified unlock for audit ${auditId}`);
  return res.json({ ok: true, paid: !!(settled && settled.paid) });
});

// ─── GET /audit/:id/pdf ───────────────────────────────────────────────────────

router.get('/audit/:id/pdf', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const id      = req.params.id;
  const session = _getSession(id);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  // Entitlement check: session.paid OR active subscription (lookmaxxingActive)
  const unlocked = await _isUnlocked(session);
  if (!unlocked) return res.status(403).json({ error: 'payment required to download PDF' });
  if (!session.geminiReport) return res.status(409).json({ error: 'audit report not yet generated' });

  // Cache: if PDF already stored, return signed URL or cached bytes.
  if (session.pdfKey || session.pdfBase64) {
    let url = null;
    if (session.pdfKey) {
      url = await storage.getSignedUrl(session.pdfKey, 24 * 60 * 60); // 24 h
    }
    events.trackAnonymous('lookmaxing_pdf_downloaded', { auditId: id, cached: true }, actor.userId).catch(() => {});
    return res.json({
      auditId:   id,
      url,
      pdfBase64: url ? undefined : session.pdfBase64,
      cached:    true,
    });
  }

  // Recover the subject's capture to embed on the dossier cover. The raw bytes
  // are dropped from the session after /analyze, but the durable photoKey
  // persists — read it back from storage when available. Degrades gracefully:
  // the dossier renders without the photo if it can't be recovered (e.g. R2 off).
  let coverPhoto = null;
  if (session.photoKey) {
    // storage.put returns a RAW R2 key (no scheme); readImage wants r2:/local:.
    let key = session.photoKey;
    if (!key.startsWith('local:') && !key.startsWith('r2:')) key = 'r2:' + key;
    try { coverPhoto = await storage.readImage(key); }
    catch (e) { log.warn('PDF', `cover photo recover failed for ${id}: ${e.message}`); coverPhoto = null; }
  }

  // Generate PDF.
  let pdfBuffer;
  try {
    pdfBuffer = await _generatePdf(id, session.geminiReport, coverPhoto);
  } catch (err) {
    log.error('PDF', `generation failed for ${id}: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }

  // Upload to R2.
  const pdfKey = `audit/${id}/report.pdf`;
  const upload = await storage.put(pdfKey, pdfBuffer, 'application/pdf');

  let url  = null;
  let pdfBase64 = null;
  if (!upload.dryRun && upload.key) {
    url = await storage.getSignedUrl(pdfKey, 24 * 60 * 60); // 24 h
    _updateSession(id, { pdfKey });
  } else {
    // R2 not configured — return inline base64 so the client can still download.
    pdfBase64 = pdfBuffer.toString('base64');
    _updateSession(id, { pdfBase64 });
  }

  events.trackAnonymous('lookmaxing_pdf_downloaded', { auditId: id }, actor.userId).catch(() => {});

  return res.json({ auditId: id, url, pdfBase64, cached: false });
});

// ─── POST /waitlist/orator ─────────────────────────────────────────────────────

router.post('/waitlist/orator', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'email required' });
  }
  const normalised = email.trim().toLowerCase().slice(0, 256);
  // Store in existing waitlist (JSON store, keyed by email for Orator pillar).
  // The existing User.addToWaitlist is phone-keyed; we use a simple JSON approach here.
  const waitlistPath = process.env.WAITLIST_FILE_PATH ||
    path.join(__dirname, '..', 'data', 'waitlist.json');
  try {
    let list = [];
    if (fs.existsSync(waitlistPath)) {
      list = JSON.parse(fs.readFileSync(waitlistPath, 'utf8'));
    }
    if (!Array.isArray(list)) list = [];
    const already = list.find((e) => e.email === normalised && e.pillar === 'orator');
    if (!already) {
      list.push({ email: normalised, pillar: 'orator', timestamp: new Date().toISOString() });
      fs.writeFileSync(waitlistPath, JSON.stringify(list, null, 2));
    }
  } catch (err) {
    log.warn('WAITLIST', `waitlist write failed: ${err.message}`);
  }

  events.trackAnonymous('orator_waitlist_joined', {}, normalised).catch(() => {});
  return res.json({ ok: true, status: 'Held. We will write once, when it opens. ◆' });
});

// ══════════════════════════════════════════════════════════════════════════════
// Exports — test helpers are explicitly named so callers can vi.spyOn them.
// ══════════════════════════════════════════════════════════════════════════════

module.exports = router;
module.exports.default = router;
module.exports._injectReportForTest  = _injectReportForTest;
module.exports._setAuditPaidForTest  = _setAuditPaidForTest;
module.exports._getSession           = _getSession;   // for merge test assertions
module.exports._putSession           = _putSession;
module.exports.applyResolutionGate   = applyResolutionGate;
module.exports._sanitizeReport       = _sanitizeReport; // Phase 1 safety backstop
module.exports._isUnlocked           = _isUnlocked;   // entitlement check (tests)
module.exports.getAnalyzeStats       = getAnalyzeStats; // aura-engine gemini/fallback counters
module.exports._generatePdf          = _generatePdf;   // dossier renderer (tests + visual QA)
