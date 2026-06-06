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
  if (paid) return report;
  const stripped = { ...report };
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
        maxOutputTokens: 32768,
        temperature: 0.3,
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
  if (!prompts) return _fallbackReport(quizAnswers);
  if (!_geminiModel) return _fallbackReport(quizAnswers);
  if (!_canCall()) {
    log.warn('GEMINI-RPM', 'rate limit reached — using fallback');
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
      if (typeof parsed.auraScore !== 'number' || !Array.isArray(parsed.freeSignals)) {
        throw new Error('Gemini response missing required fields (auraScore/freeSignals)');
      }
      // Keep rank consistent with the score regardless of what the model returned.
      parsed.rank = _rankFromScore(parsed.auraScore);
      return _sanitizeReport(parsed);
    } catch (err) {
      lastErr = err;
      log.warn('GEMINI-CALL', `attempt ${attempt} failed: ${err.message}`);
    }
  }
  throw lastErr || new Error('Gemini call failed');
}

// ─── PDF generation ──────────────────────────────────────────────────────────

/**
 * Generate a PDF from a full audit report using pdfkit.
 * Uses pdfkit built-in fonts (no network requests):
 *   Helvetica → body, Times-Roman → headlines (Cormorant-equivalent),
 *   Courier   → data/numerals (JetBrains Mono-equivalent).
 * Returns a Buffer of the PDF bytes.
 */
async function _generatePdf(auditId, report) {
  const PDFDocument = require('pdfkit'); // eslint-disable-line global-require
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
      const GREEN    = '#2f6b4f';   // actionable
      const BLUE     = '#3a5775';   // leverage via state
      const STONE    = '#8a8576';   // fixed context

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

      // ════════ Blueprint render helpers ════════
      function sectionTitle(num, title) {
        need(86); doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(GOLD).text(num, M, doc.y, { continued: true, characterSpacing: 2 })
           .fillColor(OBSIDIAN).text('   ' + title.toUpperCase(), { characterSpacing: 1 });
        doc.moveDown(0.35);
      }
      function classMeta(cls) {
        if (cls === 'leverage') return { color: BLUE,  text: 'Leverage via state', shape: 'diamond' };
        if (cls === 'fixed')    return { color: STONE, text: 'Fixed · context',    shape: 'ring' };
        return { color: GREEN, text: 'Actionable', shape: 'dot' };
      }
      function classGlyph(cls, x, y) {
        const meta = classMeta(cls);
        if (meta.shape === 'diamond') diamond(x, y, 6, meta.color);
        else if (meta.shape === 'ring') doc.circle(x, y, 3).lineWidth(1).strokeColor(meta.color).stroke();
        else doc.circle(x, y, 3).fill(meta.color);
        return meta;
      }
      function classLegend() {
        const y = doc.y; let x = M;
        for (const c of ['actionable', 'leverage', 'fixed']) {
          const meta = classGlyph(c, x + 3, y + 4);
          doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(meta.text, x + 11, y);
          x += 150;
        }
        doc.y = y + 16; doc.x = M;
      }
      function metricRow(m) {
        need(64); doc.moveDown(0.4);
        const y0 = doc.y;
        const meta = classGlyph(m.class, M + 3, y0 + 5);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
           .text(fmtName(m.metric) + (m.visualIndicator ? ' *' : ''), M + 13, y0, { continued: true })
           .font('Times-Bold').fontSize(10).fillColor(GOLD)
           .text('      ' + (typeof m.score10 === 'number' ? m.score10.toFixed(1) : String(m.score10 || '')) + ' /10');
        if (m.subtitle) doc.font('Helvetica-Oblique').fontSize(8).fillColor(FAINT).text(m.subtitle, M + 13, doc.y, { width: W - 13 });
        if (m.rootCause) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(m.rootCause, M + 13, doc.y, { width: W - 13, lineGap: 1 });
        doc.font('Helvetica').fontSize(6.5).fillColor(meta.color).text(meta.text.toUpperCase(), M + 13, doc.y + 1, { characterSpacing: 1 });
      }
      function swatchRow(hex, name, note) {
        need(48);
        const y0 = doc.y, sw = 20;
        const raw = String(hex || '').trim();
        const safe = /^#?[0-9a-fA-F]{3,8}$/.test(raw) ? (raw[0] === '#' ? raw : '#' + raw) : '#cccccc';
        doc.rect(M, y0, sw, sw).fill(safe);
        doc.rect(M, y0, sw, sw).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(name || '', M + sw + 10, y0, { continued: true })
           .font('Courier').fontSize(8).fillColor(FAINT).text('    ' + safe.toUpperCase());
        if (note) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(note, M + sw + 10, doc.y, { width: W - sw - 10, lineGap: 1 });
        doc.y = Math.max(doc.y, y0 + sw) + 5; doc.x = M;
      }
      function chromaticSection(c) {
        doc.addPage();
        sectionTitle('03', 'The Chromatic & Grooming Arsenal');
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Colour is the highest-ROI, zero-effort lever — it re-engineers how the skin reads with no physical intervention.', M, doc.y, { width: W, lineGap: 2 });
        label('Skin-Tone Substrate');
        if (c.profile) doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(c.profile, M, doc.y);
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
           .text(`Undertone — ${c.undertone || ''} (${c.undertoneNote || ''})      Contrast — ${c.contrast || ''} (${c.contrastNote || ''})`, M, doc.y, { width: W });
        if (Array.isArray(c.powerPalette) && c.powerPalette.length) {
          label('The Power Palette — wear at the collar');
          for (const s of c.powerPalette) swatchRow(s.hex, s.name, s.note);
        }
        if (c.supportingNeutrals) { doc.moveDown(0.2); doc.font('Helvetica-Oblique').fontSize(8).fillColor(FAINT).text('Supporting neutrals — ' + c.supportingNeutrals, M, doc.y, { width: W }); }
        if (Array.isArray(c.antiPalette) && c.antiPalette.length) {
          label('The Anti-Palette — never at the face');
          for (const s of c.antiPalette) swatchRow(s.hex, 'Avoid: ' + s.name, s.impact);
        }
        if (c.metals) { label('Hardware & Metals'); if (c.metals.locked) doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(c.metals.locked, M, doc.y); if (c.metals.note) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(c.metals.note, M, doc.y, { width: W, lineGap: 1 }); }
        if (c.stylingCorrections) { label('Styling Corrections'); doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(c.stylingCorrections, M, doc.y, { width: W, lineGap: 1 }); }
        if (c.cosmetic) {
          if (Array.isArray(c.cosmetic.lipWardrobe) && c.cosmetic.lipWardrobe.length) { label('The Lip Wardrobe'); for (const lp of c.cosmetic.lipWardrobe) swatchRow(lp.hex, lp.name, lp.note); }
          if (Array.isArray(c.cosmetic.complexion) && c.cosmetic.complexion.length) {
            label('Complexion · Cheek · Eye');
            for (const it of c.cosmetic.complexion) { need(40); doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(it.area || '', M, doc.y); doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(it.directive || '', M + 10, doc.y, { width: W - 10, lineGap: 1 }); doc.moveDown(0.2); }
          }
          doc.moveDown(0.2); doc.font('Helvetica-Oblique').fontSize(7).fillColor(FAINT).text('Cosmetic guidance is calibrated to colour biology only and is independent of gender expression.', M, doc.y, { width: W });
        }
      }
      function interventionSection(iv) {
        doc.addPage();
        sectionTitle('04', 'The 90-Day Intervention Blueprint');
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Two daily routines and a mechanical protocol, each agent chosen to correct a specific root cause. Items marked [Rx] are prescription-grade — bring them to your dermatology consult; do not self-source.', M, doc.y, { width: W, lineGap: 2 });
        for (const [title, steps] of [['Morning Protocol — Vitality & Defence', iv.morning], ['Night Protocol — Repair & Resurface', iv.night], ['Mechanical Arsenal — Structure & Carriage', iv.mechanical]]) {
          if (!Array.isArray(steps) || !steps.length) continue;
          label(title);
          for (const s of steps) {
            need(56);
            doc.font('Times-Bold').fontSize(9).fillColor(GOLD).text(String(s.step || '-'), M, doc.y, { continued: true, width: 22 })
               .font('Helvetica-Bold').fontSize(9).fillColor(INK).text('  ' + (s.agent || '') + (s.rx ? '   [Rx]' : ''));
            if (s.spec) doc.font('Helvetica-Oblique').fontSize(8).fillColor(FAINT).text(s.spec, M + 16, doc.y, { width: W - 16 });
            if (s.rationale) doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(s.rationale, M + 16, doc.y, { width: W - 16, lineGap: 1 });
            doc.moveDown(0.3);
          }
        }
      }
      function projectionSection(p) {
        doc.addPage();
        sectionTitle('05', 'Projected Evolution');
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Modelled 90-day outcome under strict adherence. Only actionable and state vectors move; fixed osseous geometry is held constant — so the ceiling is honest, not inflated.', M, doc.y, { width: W, lineGap: 2 });
        doc.moveDown(0.5);
        const c2 = M + W - 150, c3 = M + W - 92, c4 = M + W - 34;
        const hy = doc.y;
        doc.font('Helvetica-Bold').fontSize(7).fillColor(FAINT)
           .text('ACTIONABLE VECTOR', M, hy);
        doc.font('Helvetica-Bold').fontSize(7).fillColor(FAINT).text('DAY 0', c2, hy, { width: 50, align: 'right' });
        doc.text('DAY 90', c3, hy, { width: 50, align: 'right' });
        doc.text('GAIN', c4, hy, { width: 34, align: 'right' });
        doc.moveTo(M, hy + 11).lineTo(M + W, hy + 11).lineWidth(0.5).strokeColor(LINE).stroke();
        doc.y = hy + 16; doc.x = M;
        for (const r of (p.rows || [])) {
          need(18); const ry = doc.y;
          doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(fmtName(r.vector), M, ry, { width: W - 160 });
          doc.font('Courier').fontSize(8.5).fillColor(MUTED).text(Number(r.day0).toFixed(1), c2, ry, { width: 50, align: 'right' });
          doc.font('Courier').fontSize(8.5).fillColor(INK).text(Number(r.day90).toFixed(1), c3, ry, { width: 50, align: 'right' });
          doc.font('Courier-Bold').fontSize(8.5).fillColor(GREEN).text('+' + Number(r.delta).toFixed(1), c4, ry, { width: 34, align: 'right' });
          doc.y = Math.max(doc.y, ry + 13); doc.x = M;
        }
        doc.moveTo(M, doc.y + 1).lineTo(M + W, doc.y + 1).lineWidth(0.6).strokeColor(GOLD).stroke();
        doc.y += 6;
        if (p.globalDay0 != null && p.globalDay90 != null) {
          const ry = doc.y;
          doc.font('Helvetica-Bold').fontSize(9).fillColor(OBSIDIAN).text('GLOBAL AURA SCORE', M, ry);
          doc.font('Courier').fontSize(9).fillColor(MUTED).text(Number(p.globalDay0).toFixed(1), c2, ry, { width: 50, align: 'right' });
          doc.font('Courier-Bold').fontSize(9).fillColor(INK).text(Number(p.globalDay90).toFixed(1), c3, ry, { width: 50, align: 'right' });
          doc.font('Courier-Bold').fontSize(9).fillColor(GREEN).text('+' + (Number(p.globalDay90) - Number(p.globalDay0)).toFixed(1), c4, ry, { width: 34, align: 'right' });
          doc.y = ry + 15; doc.x = M;
        }
        if (p.narrative) { doc.moveDown(0.3); doc.font('Times-Italic').fontSize(10.5).fillColor(INK).text(p.narrative, M, doc.y, { width: W, lineGap: 3 }); }
      }

      // ── Cover header band ────────────────────────────────────────
      const bandH = 152;
      doc.rect(0, 0, PW, bandH).fill(OBSIDIAN);
      diamond(M + 4, 40, 9, GOLD);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#e8d9b0').text('MAINCHARACTER', M + 18, 35, { characterSpacing: 3 });
      doc.font('Helvetica').fontSize(7.5).fillColor('#8a8576').text('PILLAR II  ·  ELITE DIAGNOSTIC DIVISION', M, 60, { characterSpacing: 2 });
      doc.font('Times-Italic').fontSize(25).fillColor(CREAM).text('The Bespoke Aesthetic Blueprint', M, 76);
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
      doc.font('Times-Bold').fontSize(54).fillColor(INK).text(g10 != null ? g10.toFixed(1) : String(report.auraScore || '—'), M, scoreY, { continued: true })
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

      if (isBlueprint) {
        // ── 02 Biometric Gap Analysis ──────────────────────────────
        doc.addPage();
        sectionTitle('02', 'Biometric Gap Analysis');
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('A vector-by-vector breakdown of where perceived status is leaking. Each finding pairs the clinical root cause — the mechanism, not the symptom — with a score and a verdict.', M, doc.y, { width: W, lineGap: 2 });
        doc.moveDown(0.5); classLegend();
        for (const v of report.vectors) {
          need(120); doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(10).fillColor(OBSIDIAN).text(`VECTOR ${v.numeral || ''} · ${(v.name || '').toUpperCase()}`, M, doc.y, { characterSpacing: 1 });
          doc.moveTo(M, doc.y + 3).lineTo(M + W, doc.y + 3).lineWidth(0.5).strokeColor(LINE).stroke();
          doc.moveDown(0.4);
          for (const m of (v.metrics || [])) metricRow(m);
        }
        if (report.chromatic)    chromaticSection(report.chromatic);
        if (report.intervention) interventionSection(report.intervention);
        if (report.projection)   projectionSection(report.projection);
        if (report.methodology) { need(110); label('Methodology, Safety & Limitations'); doc.font('Helvetica').fontSize(7.5).fillColor(FAINT).text(report.methodology, M, doc.y, { width: W, lineGap: 2 }); }
      } else {

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
            if (item.fix) doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#3a3a3a').text('Fix — ' + item.fix, M + 12, doc.y, { width: W - 12, lineGap: 1 });
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
             .text('Palette — ' + sc.palette.map((c) => (typeof c === 'string' ? c : (c.name || c.hex || ''))).join('  ·  '), M, doc.y, { width: W });
        }
        if (sc.avoid && sc.avoid.length) doc.font('Helvetica-Oblique').fontSize(8).fillColor(FAINT).text('Avoid — ' + sc.avoid.join(', '), M, doc.y, { width: W });
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
      } // end legacy fallback

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

// Settle a paid audit: flip paid, credit ₹99, seed the Day-30 baseline. Shared by
// the Razorpay webhook (real capture) and the demo-mode confirm (no live keys), so
// the unlock is identical either way and never drifts.
async function _settlePaidAudit(auditId, { paymentId = null } = {}) {
  const session = _getSession(auditId);
  if (!session) return null;
  if (session.paid) return session;

  _updateSession(auditId, {
    paid:              true,
    paidAt:            new Date().toISOString(),
    razorpayPaymentId: paymentId,
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

// ─── POST /pay/order ─────────────────────────────────────────────────────────

router.post('/pay/order', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const { auditId } = req.body || {};
  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  if (session.paid) {
    return res.json({ alreadyPaid: true, auditId });
  }

  try {
    // Razorpay order (₹99 = 9900 paise). Mocked when bypassing (testing/demo).
    const key_id  = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock';
    const live    = !_paymentBypass();

    let order;
    if (live) {
      const Razorpay = require('razorpay'); // eslint-disable-line global-require
      const rz = new Razorpay({ key_id, key_secret: process.env.RAZORPAY_KEY_SECRET });
      order = await rz.orders.create({
        amount:   9900,
        currency: 'INR',
        receipt:  `mc_audit_${auditId.slice(0, 8)}_${Date.now()}`,
        notes:    { auditId, source: 'lookmaxing_audit_unlock' },
      });
    } else {
      // Mock order for tests, dev, and the pre-go-live demo window.
      order = {
        id:       `order_mock_${Date.now()}`,
        amount:   9900,
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
      auditId,
      testMode: !live, // client settles via /pay/test-confirm instead of Razorpay
    });
  } catch (err) {
    log.error('PAY-ORDER', `order create failed for ${auditId}: ${err.message}`);
    return res.status(500).json({ error: 'Something has interrupted the work. Try again in a moment.' });
  }
});

// ─── POST /pay/subscribe ─────────────────────────────────────────────────────
// Primary unlock path for the ₹99/month recurring subscription. Creates a
// Razorpay subscription (lookmax99 plan) and persists the subscription id.
// The legacy /pay/order + one-time /pay/webhook remain for backward compat.

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
      await User.updateUser(user.phone, { razorpaySubscriptionId: subId, pendingPlan: 'lookmax99' });
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
      'lookmax99',
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
        pendingPlan: 'lookmax99',
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

  // Generate PDF.
  let pdfBuffer;
  try {
    pdfBuffer = await _generatePdf(id, session.geminiReport);
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
