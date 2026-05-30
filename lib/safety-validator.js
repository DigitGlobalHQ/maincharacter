/**
 * ═══════════════════════════════════════════════════════════════════
 * SAFETY VALIDATOR — the safe brain (Phase 1, 2026-05-30)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Server-side guard that runs on EVERY task/instruction surfaced to a user,
 * from BOTH engines (the Aesthetic Audit and the Daily Mirror). MainCharacter
 * is NOT a medical service. We carry no disclaimer and no regulatory cover, so
 * the product must never emit medical, pharmacological, or prescriptive dietary
 * advice — not as a generated AI task, not from a static library, not anywhere.
 *
 * This module is the last line of defence. It is deliberately conservative:
 * when a task trips a forbidden pattern it is REJECTED and REPLACED with a
 * deterministic task from the SAFE_TASK_LIBRARY. Nothing forbidden reaches a
 * user even if a prompt regresses or a legacy library row is missed.
 *
 * Allow-list philosophy (CLAUDE.md §safety, user-metrices context-vs-quest):
 * the only health-positive habits we coach are sleep, hydration, generic sun
 * protection, gentle/generic skincare (cleanse + moisturise, NO actives by name
 * or strength), posture, grooming/beard geometry, haircut & style, and wardrobe
 * colour. Everything else is out of bounds.
 */

// ---------------------------------------------------------------------------
// Forbidden patterns — anything here is a hard reject.
// Each entry: { label, re }. Labels are surfaced in tests + logs (not to users).
// ---------------------------------------------------------------------------
const FORBIDDEN_PATTERNS = [
  // — Topical / prescription / OTC drug names ———————————————————————
  { label: 'drug:minoxidil', re: /\bminoxidil\b/i },
  { label: 'drug:finasteride', re: /\bfinasterides?\b/i },
  { label: 'drug:dutasteride', re: /\bdutasterides?\b/i },
  { label: 'drug:ketoconazole', re: /\bketoconazole\b/i },
  { label: 'drug:spironolactone', re: /\bspironolactone\b/i },
  { label: 'drug:tretinoin', re: /\btretinoin\b/i },
  { label: 'drug:isotretinoin', re: /\b(iso)?tretinoin\b|\baccutane\b/i },
  { label: 'drug:retinoid', re: /\bretinoids?\b|\bretinols?\b|\bretin-?a\b/i },
  { label: 'drug:hydroquinone', re: /\bhydroquinone\b/i },
  { label: 'drug:adapalene', re: /\badapalene\b|\bdifferin\b/i },
  { label: 'drug:azelaic', re: /\bazelaic\b/i },
  { label: 'drug:benzoyl', re: /\bbenzoyl\b/i },
  { label: 'drug:salicylic', re: /\bsalicylic\b/i },
  { label: 'drug:glycolic', re: /\bglycolic\b/i },
  { label: 'drug:niacinamide', re: /\bniacinamide\b/i },
  { label: 'drug:saw-palmetto', re: /\bsaw\s*palmetto\b/i },
  // generic active-ingredient framing
  { label: 'drug:acid-active', re: /\b(aha|bha|pha)\b/i },

  // — Supplements ————————————————————————————————————————————————
  { label: 'supp:biotin', re: /\bbiotin\b/i },
  { label: 'supp:collagen', re: /\bcollagen\b/i },
  { label: 'supp:creatine', re: /\bcreatine\b/i },
  { label: 'supp:ashwagandha', re: /\bashwagandha\b/i },
  { label: 'supp:generic', re: /\bsupplements?\b|\bmultivitamins?\b|\bnootropics?\b/i },

  // — Procedures ————————————————————————————————————————————————
  { label: 'proc:microneedling', re: /\bmicro-?needling\b|\bderma-?roller\b/i },
  { label: 'proc:transplant', re: /\b(hair\s*)?transplant\b|\bfue\b|\bfut\b|\bprp\b|\bmesotherapy\b/i },
  { label: 'proc:injectable', re: /\bbotox\b|\bfillers?\b|\bbotulinum\b/i },
  { label: 'proc:surgery', re: /\bsurger(y|ies)\b|\bsurgical\b|\brhinoplasty\b|\bjaw\s*surgery\b/i },
  { label: 'proc:laser', re: /\blaser\s*(comb|cap|therapy|treatment)\b/i },

  // — Dosage / strength ————————————————————————————————————————
  { label: 'dose:percent', re: /\b\d+(\.\d+)?\s?%/ },
  { label: 'dose:unit', re: /\b\d+(\.\d+)?\s?(mg|ml|mcg|µg|iu|grams?|g)\b/i },
  { label: 'dose:mm-needle', re: /\b\d+(\.\d+)?\s?mm\b/i },

  // — Evidence / clinical framing ————————————————————————————————
  { label: 'evidence:rct', re: /\brct(s)?\b|\brandomi[sz]ed\b/i },
  { label: 'evidence:clinical', re: /\bclinical(ly)?\b|\bclinical trial\b/i },
  { label: 'evidence:study', re: /\bpeer-?reviewed\b|\bplacebo\b|\bdouble-?blind\b/i },
  { label: 'evidence:tier', re: /\bevidence[-\s]?(tier|based|supported)\b|\bmechanism[-\s]?supported\b|\bobservational\b/i },

  // — Prescriptive diet / extreme protocols ————————————————————————
  { label: 'diet:protein-meal', re: /\bprotein at every meal\b/i },
  { label: 'diet:macro', re: /\b\d+\s?g(rams)?\s+(of\s+)?protein\b|\bgrams? of protein\b/i },
  { label: 'diet:deficit', re: /\bcalorie\s*(deficit|restriction)\b|\bcaloric\s*(deficit|restriction)\b/i },
  { label: 'diet:crash', re: /\bcrash\s*diet\b|\bwater\s*weight\b|\bdehydrat/i },
  { label: 'diet:fasting', re: /\bfasting\b|\bketo(genic)?\b|\bintermittent fast/i },

  // — Medical diagnosis / cure language ————————————————————————————
  { label: 'med:cure', re: /\bcures?\b|\btreats?\b(?!\s*yourself)|\bdiagnos(e|is|tic)\b|\bprescription\b|\bprescribe/i },
  { label: 'med:condition', re: /\bandrogenetic\b|\balopecia\b|\bdht\b|\bseborrheic\b/i },
];

// ---------------------------------------------------------------------------
// SAFE_TASK_LIBRARY — allow-list replacements, keyed by bucket. Restrained,
// Consultant-voice, state-and-habit only. Each item is { title, instruction }.
// ---------------------------------------------------------------------------
const SAFE_TASK_LIBRARY = {
  skin: [
    { title: 'Sunscreen, every morning', instruction: 'A broad-spectrum facial sunscreen each morning, rain or shine. Daylight is the largest driver of visible skin ageing.' },
    { title: 'Gentle cleanse, twice daily', instruction: 'A mild, non-stripping cleanser morning and night. Over-washing damages the barrier and shows.' },
    { title: 'Moisturise on damp skin', instruction: 'Apply moisturiser within a minute of cleansing, while the skin is still damp, to hold hydration.' },
    { title: 'Protect sleep for skin repair', instruction: 'Skin recovers during deep sleep. Hold a consistent 7-8 hour window.' },
  ],
  hair: [
    { title: 'Wash on a steady rhythm', instruction: 'Keep the scalp clean on a regular cadence with a gentle shampoo. A calm scalp reads better than any product claim.' },
    { title: 'Sun protection for the scalp', instruction: 'Shade or a cap for the crown in strong midday sun, especially where coverage is thinner.' },
    { title: 'A cut that works with the hairline', instruction: 'Take the photo to a barber and ask for a shape that suits your current hairline, not against it. Geometry beats density.' },
    { title: 'Sleep and stress, held steady', instruction: 'Consistent sleep and lower day-to-day stress show in hair condition over weeks. Protect both.' },
  ],
  jaw: [
    { title: 'Reduce evening salt and alcohol', instruction: 'Both drive overnight facial water retention. Easing them sharpens the morning read of the lower face.' },
    { title: 'Rest the tongue on the palate', instruction: 'Let the tongue rest lightly on the roof of the mouth. Rest it — never strain or push.' },
    { title: 'Hold the head level', instruction: 'A neutral head carriage with a light chin position reads as composure and lengthens the jawline.' },
  ],
  posture: [
    { title: 'Two minutes of thoracic extension', instruction: 'Gently open the upper back over a chair edge for two minutes. It counters the screen hunch.' },
    { title: 'Screens to eye level', instruction: 'Raise the monitor and lift the phone so the neck stays neutral. Tech-neck flattens presence.' },
    { title: 'Stand tall, chin lightly tucked', instruction: 'A neutral spine with a slight chin tuck. Relaxed, not rigid.' },
  ],
  posture_shoulders: [
    { title: 'Set the shoulders back and down', instruction: 'Draw the shoulder blades gently back and down a few times an hour. Carriage is half of presence.' },
  ],
  lifestyle: [
    { title: 'Sleep 7-8 hours', instruction: 'The single highest-leverage habit for skin, eyes and recovery. Guard the window.' },
    { title: 'Hydrate through the day', instruction: 'Steady water through the day shows in skin and the under-eye area within days.' },
    { title: 'Move daily', instruction: 'A daily walk or training session supports posture, composition and presence. Consistency over intensity.' },
  ],
  grooming: [
    { title: 'Define the beard geometry', instruction: 'A clean neckline and cheek line shape the lower face. Keep the edges intentional, not overgrown.' },
    { title: 'Tidy the brows', instruction: 'Light grooming of the brow line opens the eye area. Tidy, never over-shaped.' },
  ],
  wardrobe: [
    { title: 'Wear your palette near the face', instruction: 'Start with one piece in a colour that flatters your contrast. The collar zone does the most work.' },
    { title: 'Fit over label', instruction: 'A plain, well-fitted piece reads higher than a branded ill-fitting one. Get the shoulders right first.' },
  ],
};

// Canonical fallback the audit engine uses for genuinely medical territory.
const QUALIFIED_PROFESSIONAL = 'This is one for a qualified professional.';

// ---------------------------------------------------------------------------
// CONTEXT-VS-QUEST — unchangeable traits are CONTEXT only: never scored, never
// tasked. Only changeable metrics earn a score + safe task.
// (Source: user-metrices.docx context-vs-quest rule.)
// ---------------------------------------------------------------------------
const CONTEXT_ONLY_TRAITS = [
  'boneStructure', 'bone-structure', 'skull', 'cranial',
  'canthalTilt', 'canthal', 'eyeShape',
  'symmetry', 'facialSymmetry', 'facialHarmony', 'harmony',
  'noseShape', 'nose', 'lipShape', 'lips', 'philtrum',
  'foreheadSlope', 'forehead', 'browRidge',
  'undertone', 'contrast', 'colouring', 'colorContrast',
  'archetype', 'height', 'wristSize', 'frame',
  'interocular', 'jawAngleGonial', 'gonialAngle', 'mandible',
  'hairDensity', // native density is genetic context; only condition/style is changeable
];

const CHANGEABLE_METRICS = [
  'skinClarity', 'skinCondition', 'skin',
  'hairCondition', 'hairStyle', 'haircutMatch', 'hairlineGrooming', 'beardGeometry',
  'underEye', 'eyeArea', 'puffiness',
  'posture', 'shoulders',
  'wardrobeCohesion', 'wardrobeColour', 'grooming',
  'bodyComposition', 'leanness',
  'sharpness', // daily state
];

/**
 * Is a metric a CONTEXT-ONLY (unchangeable) trait? Such metrics may be shown
 * as context but must never carry a score or a task.
 * @param {string} metric
 * @returns {boolean}
 */
function isContextOnly(metric) {
  const m = String(metric || '').trim();
  return CONTEXT_ONLY_TRAITS.some((t) => t.toLowerCase() === m.toLowerCase());
}

/**
 * Return all forbidden-pattern labels a string trips. Empty array = clean.
 * @param {string} text
 * @returns {string[]}
 */
function findViolations(text) {
  const s = String(text == null ? '' : text);
  const hits = [];
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    if (re.test(s)) hits.push(label);
  }
  return hits;
}

/**
 * True when a string is free of every forbidden pattern.
 * @param {string} text
 * @returns {boolean}
 */
function isSafe(text) {
  return findViolations(text).length === 0;
}

// Stable, dependency-free hash so replacement choice is deterministic (no
// Math.random — keeps tests + resume reproducible).
function hashString(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h >>> 0);
}

/**
 * Pick a deterministic safe replacement task from a bucket.
 * @param {string} bucket
 * @param {string} seed used to vary which item is chosen, stably
 * @returns {{title:string, instruction:string}}
 */
function safeReplacement(bucket, seed = '') {
  const pool = SAFE_TASK_LIBRARY[bucket] || SAFE_TASK_LIBRARY.lifestyle;
  return pool[hashString(`${bucket}:${seed}`) % pool.length];
}

/**
 * Validate a single task. If its title or instruction trips any forbidden
 * pattern, REPLACE it wholesale with a safe-library task for the bucket.
 *
 * @param {{title?:string, instruction?:string, id?:string, axis?:string}} task
 * @param {{bucket?:string}} [opts]
 * @returns {{ safe:boolean, violations:string[], task:object }}
 *   safe=true  → task returned unchanged.
 *   safe=false → task replaced; original violations reported.
 */
function validateTask(task, { bucket } = {}) {
  const t = task || {};
  const text = `${t.title || ''}\n${t.instruction || ''}`;
  const violations = findViolations(text);
  if (violations.length === 0) {
    return { safe: true, violations: [], task: t };
  }
  const b = bucket || t.bucket || mapAxisToBucket(t.axis) || 'lifestyle';
  const repl = safeReplacement(b, t.id || t.title || text);
  return {
    safe: false,
    violations,
    task: {
      ...t,
      title: repl.title,
      instruction: repl.instruction,
      replacedForSafety: true,
    },
  };
}

// Minimal axis→bucket map mirroring data/lookmax-content.js so the validator
// can pick a sensible replacement bucket without importing the content file.
function mapAxisToBucket(axis) {
  const map = {
    skinClarity: 'skin', hairDensity: 'hair', hairCondition: 'hair',
    jawDefinition: 'jaw', posture: 'posture', shoulders: 'posture_shoulders',
    eyeArea: 'lifestyle', facialHarmony: 'jaw', expression: 'lifestyle',
    bodyComposition: 'lifestyle', wardrobeColour: 'wardrobe', grooming: 'grooming',
    beardGeometry: 'grooming',
  };
  return map[axis] || null;
}

/**
 * Sanitise a whole protocol day in place-safe fashion. Every "do" and "do-not"
 * item is validated; unsafe items are replaced. Returns a new object plus a
 * report of what was replaced (for SAFETY_REVIEW + logging).
 *
 * @param {{do?:object[], doNot?:object[], dos?:object[], donts?:object[]}} day
 * @param {{bucket?:string}} [opts]
 */
function sanitizeProtocolDay(day, opts = {}) {
  const report = [];
  const run = (items) =>
    (items || []).map((item) => {
      const { safe, violations, task } = validateTask(item, opts);
      if (!safe) report.push({ original: item.title, violations });
      return task;
    });
  const out = { ...day };
  if (day.do) out.do = run(day.do);
  if (day.doNot) out.doNot = run(day.doNot);
  if (day.dos) out.dos = run(day.dos);
  if (day.donts) out.donts = run(day.donts);
  if (Array.isArray(day.items)) out.items = run(day.items);
  return { day: out, report };
}

/**
 * Validate a free-text block (e.g. a generated diagnosis or daily read). Does
 * NOT replace — returns whether it is safe and what it tripped, so callers can
 * decide to regenerate or fall back. Used as a tripwire on AI prose output.
 * @param {string} text
 */
function validateProse(text) {
  const violations = findViolations(text);
  return { safe: violations.length === 0, violations, fallback: QUALIFIED_PROFESSIONAL };
}

module.exports = {
  FORBIDDEN_PATTERNS,
  SAFE_TASK_LIBRARY,
  CONTEXT_ONLY_TRAITS,
  CHANGEABLE_METRICS,
  QUALIFIED_PROFESSIONAL,
  findViolations,
  isSafe,
  isContextOnly,
  validateTask,
  sanitizeProtocolDay,
  validateProse,
  safeReplacement,
};
