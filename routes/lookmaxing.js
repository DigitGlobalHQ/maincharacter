/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXING ROUTES — Stage-1 Audit Engine (Wave 2A)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Mounted at /api/lookmaxing/* in server.js.
 * Cited spec: briefs/stage-1-audit-spec.md §8 (backend contracts).
 *
 * Auth model:
 *   - guest_id cookie (mc_lookmaxing_guest): HttpOnly, SameSite=Lax, 24h,
 *     Path=/api/lookmaxing. Minted by POST /guest.
 *   - user JWT (Authorization: Bearer): Lookmaxxing-scoped, from lookmax-auth.
 *   Routes that mutate sessions check ownership: guest_id OR user_id match.
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

const log = createLogger('LOOKMAXING');

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

const PREMIUM_FIELDS = ['decomposition', 'biggestLever', 'quests', 'styleAndColour', 'starterPlan'];

// ─── Compatibility score bridge ───────────────────────────────────────────────
// The existing re-audit engine (routes/reaudit.js) and Daily Mirror (services/vision.js)
// read users.lookmaxBaseline.scores as an 8-key object (the old aesthetic audit shape).
// The new Gemini audit report uses a different shape. This function maps between them
// so both engines can read a merged baseline without code changes in reaudit.js.
// Decision documented in DECISIONS.md (stage-1-audit merge, 2026-05-28).

const COMPAT_AXES = {
  skinClarity:    (r) => _scoreFromDecomp(r, 'skin',         'skinClarity'),
  jawDefinition:  (r) => _scoreFromDecomp(r, 'jawAndFace',   'jawlinePuffiness'),
  eyeArea:        (r) => _scoreFromDecomp(r, 'jawAndFace',   'underEyePuffiness'),
  hairDensity:    (r) => _scoreFromDecomp(r, 'hair',         'haircutFaceShapeMatch'),
  posture:        (r) => _scoreFromDecomp(r, 'bodyAndPosture','postureCarriage'),
  facialHarmony:  (r) => (r.auraScore || 55),
  expression:     (r) => _scoreFromDecomp(r, 'jawAndFace',   'expressionTension'),
  bodyComposition:(r) => _scoreFromDecomp(r, 'bodyAndPosture','shoulderAlignment'),
};

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

// ─── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'mc_lookmaxing_guest';
const COOKIE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

function mintGuestCookie(res, guestId) {
  res.cookie(COOKIE_NAME, guestId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/lookmaxing',
    maxAge: COOKIE_TTL_MS,
  });
}

function clearGuestCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/api/lookmaxing' });
}

function getGuestId(req) {
  return (req.cookies && req.cookies[COOKIE_NAME]) || null;
}

// ─── Auth helper — guest OR user ────────────────────────────────────────────

/**
 * Resolve the acting identity from cookie or JWT.
 * Returns { guestId, userId } — at most one is set.
 * Returns null if neither is present.
 */
function resolveActor(req) {
  const guestId = getGuestId(req);
  if (guestId) return { guestId, userId: null };

  const header = req.headers['authorization'] || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (bearer) {
    const decoded = verifyLookmaxToken(bearer);
    if (decoded) return { guestId: null, userId: decoded.userId };
  }
  return null;
}

/**
 * Check ownership of an audit session.
 * Returns true if the actor (guest or user) matches the session owner.
 */
function canAccess(session, actor) {
  if (!session || !actor) return false;
  if (actor.guestId && session.guestId === actor.guestId) return true;
  if (actor.userId && session.userId === actor.userId) return true;
  return false;
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

const { GoogleGenerativeAI } = require('@google/generative-ai');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

let _geminiModel = null;
if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    _geminiModel = genAI.getGenerativeModel({ model: GEMINI_MODEL });
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
 * Call Gemini Vision with the audit photo + quiz answers.
 * Falls back to _fallbackReport on any error.
 */
async function _callGemini(quizAnswers, photoBuffer) {
  const prompts = getAuditPrompts();
  if (!prompts) return _fallbackReport(quizAnswers);
  if (!_geminiModel) return _fallbackReport(quizAnswers);
  if (!_canCall()) {
    log.warn('GEMINI-RPM', 'rate limit reached — using fallback');
    return _fallbackReport(quizAnswers);
  }

  try {
    _rpm.push(Date.now());
    const promptText = prompts.buildAuditPrompt(quizAnswers, !!photoBuffer);
    const parts = [{ text: promptText }];
    if (photoBuffer) {
      parts.push({ inlineData: { data: photoBuffer.toString('base64'), mimeType: 'image/jpeg' } });
    }
    const result = await _geminiModel.generateContent(parts);
    const text = result.response.text();
    // Extract JSON from potential markdown code fence
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const parsed = JSON.parse(jsonMatch[1].trim());

    // Basic schema validation — must have auraScore and freeSignals.
    if (typeof parsed.auraScore !== 'number' || !Array.isArray(parsed.freeSignals)) {
      log.warn('GEMINI-PARSE', 'Response missing required fields — using fallback');
      return _fallbackReport(quizAnswers);
    }
    return parsed;
  } catch (err) {
    log.warn('GEMINI-CALL', `Gemini failed: ${err.message} — using fallback`);
    return _fallbackReport(quizAnswers);
  }
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

      const W = doc.page.width - 120; // content width

      // ── Header ──────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#888888')
         .text('THE AURA READING', { align: 'center', characterSpacing: 2 });
      doc.font('Times-Roman').fontSize(22).fillColor('#111111')
         .text('Your Reading, Resolved.', { align: 'center' });
      doc.font('Helvetica').fontSize(8).fillColor('#999999')
         .text(`MainCharacter  ◆  Audit ${auditId.slice(0, 8)}`, { align: 'center' });
      doc.moveDown(1);

      // ── Block 1 — Aura Score ─────────────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#999999').text('AURA SCORE', { characterSpacing: 2 });
      doc.font('Courier-Bold').fontSize(56).fillColor('#111111').text(String(report.auraScore), { align: 'left' });
      doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`out of 100  ·  ${String(report.rank).toUpperCase()}  ·  ${report.faceShape || ''}`, { align: 'left' });
      doc.moveDown(0.5);

      // ── Block 2 — First Impression ───────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#999999').text('FIRST IMPRESSION', { characterSpacing: 2 });
      doc.font('Times-Roman').fontSize(13).fillColor('#111111')
         .text(report.firstImpression || '', { width: W, lineGap: 4 });
      doc.moveDown(0.5);

      // ── Block 3 — Free Signals ───────────────────────────────────
      doc.font('Helvetica').fontSize(8).fillColor('#999999').text('THE FOUR SIGNALS', { characterSpacing: 2 });
      const signals = (report.freeSignals || []).map((s) => s.label).join('  ·  ');
      doc.font('Courier').fontSize(11).fillColor('#333333').text(signals, { width: W });
      doc.moveDown(0.5);

      // ── Block 4 — Full Decomposition ─────────────────────────────
      if (report.decomposition) {
        doc.font('Helvetica').fontSize(8).fillColor('#999999').text('FULL DECOMPOSITION', { characterSpacing: 2 });
        doc.moveDown(0.2);
        const regions = ['skin', 'hair', 'jawAndFace', 'bodyAndPosture', 'lifestyleSignals'];
        for (const region of regions) {
          const items = report.decomposition[region] || [];
          if (!items.length) continue;
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#555555').text(region.toUpperCase(), { characterSpacing: 1 });
          for (const item of items) {
            doc.font('Courier').fontSize(9).fillColor('#111111')
               .text(`${item.metric}  ${item.score}/100`, { continued: false });
            doc.font('Helvetica').fontSize(8).fillColor('#666666')
               .text(`  ${item.cause}  →  ${item.fix}`, { width: W, indent: 10 });
          }
          doc.moveDown(0.3);
        }
      }

      // ── Block 5 — Biggest Lever ──────────────────────────────────
      if (report.biggestLever) {
        doc.font('Helvetica').fontSize(8).fillColor('#999999').text('YOUR BIGGEST LEVER', { characterSpacing: 2 });
        doc.font('Courier-Bold').fontSize(11).fillColor('#111111')
           .text(`${report.biggestLever.metric}  ${report.biggestLever.score}/100`);
        doc.font('Helvetica').fontSize(9).fillColor('#444444')
           .text(report.biggestLever.rationale || '', { width: W });
        doc.moveDown(0.5);
      }

      // ── Block 6 — Quests ─────────────────────────────────────────
      if (report.quests && report.quests.length) {
        doc.font('Helvetica').fontSize(8).fillColor('#999999').text('THE QUESTS', { characterSpacing: 2 });
        doc.moveDown(0.2);
        for (const q of report.quests) {
          doc.font('Courier').fontSize(9).fillColor('#111111').text(`◆  ${q.metric}`, { continued: false });
          doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`   ${q.task}`, { width: W, indent: 10 });
        }
        doc.moveDown(0.5);
      }

      // ── Block 7 — Style & Colour ──────────────────────────────────
      if (report.styleAndColour) {
        const sc = report.styleAndColour;
        doc.font('Helvetica').fontSize(8).fillColor('#999999').text('STYLE & COLOUR', { characterSpacing: 2 });
        if (sc.haircut) doc.font('Helvetica').fontSize(9).fillColor('#333333').text(sc.haircut, { width: W });
        if (sc.palette && sc.palette.length) {
          doc.font('Courier').fontSize(9).fillColor('#111111')
             .text('Palette: ' + sc.palette.join('  ·  '), { width: W });
        }
        if (sc.avoid && sc.avoid.length) {
          doc.font('Helvetica').fontSize(8).fillColor('#888888')
             .text('Avoid: ' + sc.avoid.join(', '), { width: W });
        }
        doc.moveDown(0.5);
      }

      // ── Block 8 — 7-Day Starter Plan ─────────────────────────────
      if (report.starterPlan && report.starterPlan.length) {
        doc.font('Helvetica').fontSize(8).fillColor('#999999').text('THE 7-DAY STARTER PLAN', { characterSpacing: 2 });
        doc.moveDown(0.2);
        for (const day of report.starterPlan) {
          doc.font('Courier-Bold').fontSize(9).fillColor('#111111').text(`Day ${day.day}`, { continued: false });
          doc.font('Helvetica').fontSize(8).fillColor('#555555')
             .text(`  Morning: ${day.morning}`, { width: W, indent: 10 });
          doc.font('Helvetica').fontSize(8).fillColor('#555555')
             .text(`  Evening: ${day.evening}`, { width: W, indent: 10 });
          doc.moveDown(0.2);
        }
      }

      // ── Footer ────────────────────────────────────────────────────
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).fillColor('#cccccc')
         .text('◆ MainCharacter  ·  The reading is yours.', { align: 'center' });

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

// Cookie parsing middleware (express 4/5 does not include cookieParser by default).
// We parse only the single cookie we own to avoid pulling in a full cookie-parser dep.
router.use((req, res, next) => {
  req.cookies = req.cookies || {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k && v.length) req.cookies[k.trim()] = v.join('=').trim();
  }
  next();
});

// ─── POST /guest ──────────────────────────────────────────────────────────────

router.post('/guest', (req, res) => {
  const guestId = crypto.randomUUID();
  const now     = new Date().toISOString();
  const expires = new Date(Date.now() + COOKIE_TTL_MS).toISOString();

  // Create an empty session row owned by this guest.
  _putSession({
    id:          guestId, // use guestId as session "marker" ID temporarily
    guestId,
    userId:      null,
    quizAnswers: null,
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
    expiresAt:   expires,
  });

  mintGuestCookie(res, guestId);
  events.trackAnonymous('lookmaxing_fork_guest', {}, guestId).catch(() => {});
  return res.json({ guestId });
});

// ─── POST /quiz ───────────────────────────────────────────────────────────────

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

  // Locate or create the session for this actor.
  let auditId;
  if (actor.guestId) {
    // Guest-owned session already created by POST /guest.
    // The session ID is the guestId (one session per guest at a time).
    auditId = actor.guestId;
    const session = _getSession(auditId);
    if (!session) return res.status(404).json({ error: 'session not found — call POST /guest first' });
    _updateSession(auditId, { quizAnswers: safe });
  } else {
    // User-owned session: create a new session UUID separate from the userId.
    auditId = crypto.randomUUID();
    const now = new Date().toISOString();
    _putSession({
      id:          auditId,
      guestId:     null,
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
  }

  events.trackAnonymous('lookmaxing_quiz_completed', { auditId }, actor.guestId || actor.userId).catch(() => {});
  return res.json({ auditId, answersStored: safe.length });
});

// ─── POST /capture ────────────────────────────────────────────────────────────

router.post('/capture', upload.single('photo'), async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const auditId     = String(req.body.auditId || '').trim();
  const consentRaw  = String(req.body.consent_18plus || '').trim().toLowerCase();
  const consentGiven = consentRaw === 'true' || consentRaw === '1';

  if (!auditId) return res.status(400).json({ error: 'auditId required' });

  const session = _getSession(auditId);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });

  if (!req.file) return res.status(400).json({ error: 'photo file required' });

  // Persist consent flag (even when false — the analyze step gates on this).
  _updateSession(auditId, { consentGiven });

  // Store the photo. Key convention: audit/{auditId}/photo.jpg
  const key = `audit/${auditId}/photo.jpg`;
  let photoKey = null;
  try {
    const result = await storage.putPhoto(key, req.file.buffer, 'image/jpeg');
    photoKey = result.dryRun ? `local:${key}` : result.key;
  } catch (err) {
    log.warn('CAPTURE', `photo store failed for ${auditId}: ${err.message}`);
    photoKey = `local:${key}`;
  }

  _updateSession(auditId, { photoKey });

  events.trackAnonymous('lookmaxing_photo_uploaded', { auditId }, actor.guestId || actor.userId).catch(() => {});
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

  // Call Gemini (or fallback).
  let photoBuffer = null;
  if (session.photoKey && !session.photoKey.startsWith('local:')) {
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
    log.error('ANALYZE', `Gemini call failed: ${err.message}`);
    report = _fallbackReport(session.quizAnswers || []);
  }

  _updateSession(auditId, { geminiReport: report, analyzedAt: new Date().toISOString() });

  events.trackAnonymous('lookmaxing_audit_generated', { auditId }, actor.guestId || actor.userId).catch(() => {});

  // Return free-resolution view (no premium fields).
  return res.json({
    auditId,
    paid: false,
    report: applyResolutionGate(report, false),
  });
});

// ─── GET /audit/:id ───────────────────────────────────────────────────────────

router.get('/audit/:id', (req, res) => {
  const actor = resolveActor(req);
  // Guest may not have a cookie if they're fetching directly — allow no-auth for
  // existing sessions by matching any identity. We still enforce ownership below.
  const id = req.params.id;
  const session = _getSession(id);
  if (!session) return res.status(404).json({ error: 'audit not found' });

  if (!actor || !canAccess(session, actor)) {
    return res.status(403).json({ error: 'forbidden' });
  }

  events.trackAnonymous('lookmaxing_audit_viewed', { auditId: id }, actor.guestId || actor.userId).catch(() => {});

  return res.json({
    auditId: id,
    paid: session.paid,
    analyzedAt: session.analyzedAt || null,
    report: applyResolutionGate(session.geminiReport, session.paid),
    quizAnswers: session.quizAnswers,
    consentGiven: session.consentGiven,
  });
});

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
    // Razorpay order (₹99 = 9900 paise). Mocked when keys are absent.
    const key_id     = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock';
    const key_secret = process.env.RAZORPAY_KEY_SECRET || '';

    let order;
    if (key_id && key_secret && !key_id.includes('mock')) {
      const Razorpay = require('razorpay'); // eslint-disable-line global-require
      const rz = new Razorpay({ key_id, key_secret });
      order = await rz.orders.create({
        amount:   9900,
        currency: 'INR',
        receipt:  `mc_audit_${auditId.slice(0, 8)}_${Date.now()}`,
        notes:    { auditId, source: 'lookmaxing_audit_unlock' },
      });
    } else {
      // Mock order for tests and dev.
      order = {
        id:       `order_mock_${Date.now()}`,
        amount:   9900,
        currency: 'INR',
        receipt:  `mc_audit_${auditId.slice(0, 8)}_${Date.now()}`,
        notes:    { auditId, source: 'lookmaxing_audit_unlock' },
      };
    }

    events.trackAnonymous('lookmaxing_pay_initiated', { auditId }, actor.guestId || actor.userId).catch(() => {});

    return res.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    key_id,
      auditId,
    });
  } catch (err) {
    log.error('PAY-ORDER', `order create failed for ${auditId}: ${err.message}`);
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

  _updateSession(auditId, {
    paid:              true,
    paidAt:            new Date().toISOString(),
    razorpayPaymentId: paymentId,
  });

  // ₹99 credit toward month one — if user-owned, increment paywall_credits.
  if (session.userId) {
    try {
      const user = await User.getUserByToken(session.userId);
      if (user) {
        const current = typeof user.paywallCredits === 'number' ? user.paywallCredits : 0;
        await User.updateUser(user.phone, { paywallCredits: current + 99 });
      }
    } catch (err) {
      log.warn('PAY-WEBHOOK', `paywall_credits update failed: ${err.message}`);
    }
  }

  events.trackAnonymous('lookmaxing_pay_succeeded', { auditId, paymentId }, session.guestId || session.userId).catch(() => {});

  log.info('PAY-WEBHOOK', `payment.captured for audit ${auditId}`);
  return res.json({ ok: true });
});

// ─── POST /merge ──────────────────────────────────────────────────────────────

router.post('/merge', async (req, res) => {
  // Requires BOTH: guest_id cookie AND user JWT.
  const guestId = getGuestId(req);
  if (!guestId) return res.status(400).json({ error: 'guest cookie required' });

  const header  = req.headers['authorization'] || '';
  const bearer  = header.startsWith('Bearer ') ? header.slice(7) : null;
  const decoded = bearer ? verifyLookmaxToken(bearer) : null;
  if (!decoded || !decoded.userId) return res.status(401).json({ error: 'unauthorized' });

  const userId = decoded.userId; // this is the user.token UUID

  // Find the guest's audit session.
  const guestSession = _getSession(guestId);
  if (!guestSession || guestSession.guestId !== guestId) {
    // No guest session found — still clear the cookie and return gracefully.
    clearGuestCookie(res);
    return res.json({ auditId: null, mergedRows: 0 });
  }

  // Bind session to user.
  _updateSession(guestId, {
    userId,
    guestId:   null,
    expiresAt: null, // user-owned rows never expire
  });

  // Carry the report into users.lookmaxBaseline if unset.
  // The shape stored in lookmaxBaseline must be compatible with the existing
  // reaudit.js computeEligibility() which checks lookmaxBaseline.scores.
  // We wrap the gemini report's auraScore into a compatible scores object so
  // baselineAvailable returns true without modifying reaudit.js (DECISIONS.md).
  let baselineUpdated = false;
  if (guestSession.geminiReport) {
    try {
      const user = await User.getUserByToken(userId);
      if (user && !user.lookmaxBaseline) {
        const report = guestSession.geminiReport;
        // Build a compatibility shim: map decomposition scores to the 8-axis shape
        // that the Daily Mirror and re-audit engines expect (skinClarity, jawDefinition,
        // eyeArea, hairDensity, posture, facialHarmony, expression, bodyComposition).
        const scores = _buildCompatScores(report);
        const baseline = {
          // Full report for Gemini context pass-through
          ...report,
          // Compatibility fields for reaudit.js + vision.js (DECISIONS.md)
          scores,
          leverageAxis: report.biggestLever ? report.biggestLever.metric : null,
          overall:      report.auraScore || 0,
          capturedAt:   new Date().toISOString(),
          photoStorageKeys: guestSession.photoKey ? [guestSession.photoKey] : [],
        };
        await User.updateUser(user.phone, { lookmaxBaseline: baseline });
        baselineUpdated = true;
      }
    } catch (err) {
      log.warn('MERGE', `lookmaxBaseline update failed: ${err.message}`);
    }
  }

  // Audit-log (best-effort, not a hard dependency).
  try {
    const db = require('../lib/db'); // eslint-disable-line global-require
    if (db.isAvailable()) {
      await db.query(
        `INSERT INTO data_rights_log (user_id, action, props) VALUES
         ((SELECT id FROM users WHERE token = $1), 'guest_merge', $2)`,
        [userId, JSON.stringify({ guestId, auditId: guestId, ts: new Date().toISOString() })]
      );
    }
  } catch { /* non-critical */ }

  clearGuestCookie(res);
  events.trackAnonymous('lookmaxing_merge_completed', { auditId: guestId, baselineUpdated }, userId).catch(() => {});

  return res.json({ auditId: guestId, mergedRows: 1, baselineUpdated });
});

// ─── GET /audit/:id/pdf ───────────────────────────────────────────────────────

router.get('/audit/:id/pdf', async (req, res) => {
  const actor = resolveActor(req);
  if (!actor) return res.status(401).json({ error: 'unauthorized' });

  const id      = req.params.id;
  const session = _getSession(id);
  if (!session) return res.status(404).json({ error: 'audit not found' });
  if (!canAccess(session, actor)) return res.status(403).json({ error: 'forbidden' });
  if (!session.paid) return res.status(403).json({ error: 'payment required to download PDF' });
  if (!session.geminiReport) return res.status(409).json({ error: 'audit report not yet generated' });

  // Cache: if PDF already stored, return signed URL or cached bytes.
  if (session.pdfKey || session.pdfBase64) {
    let url = null;
    if (session.pdfKey) {
      url = await storage.getSignedUrl(session.pdfKey, 24 * 60 * 60); // 24 h
    }
    events.trackAnonymous('lookmaxing_pdf_downloaded', { auditId: id, cached: true }, actor.guestId || actor.userId).catch(() => {});
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

  events.trackAnonymous('lookmaxing_pdf_downloaded', { auditId: id }, actor.guestId || actor.userId).catch(() => {});

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
