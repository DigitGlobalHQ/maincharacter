/**
 * tests/lookmaxing-audit-prompts.test.js
 * Contract tests for the Bespoke Aesthetic Blueprint Gemini prompt module.
 * Cited spec: product/bespoke-aesthetic-blueprint-spec.md.
 * No I/O, no API calls — pure module-level assertions.
 */

import { describe, it, expect } from 'vitest';

const {
  AUDIT_SYSTEM_PROMPT,
  AUDIT_JSON_SCHEMA,
  AUDIT_VECTOR_TAXONOMY,
  AUDIT_METRIC_CLASSES,
  AUDIT_TOTAL_METRICS,
  AUDIT_QUEST_ELIGIBLE_METRICS,
  AUDIT_CONTEXT_ONLY_METRICS,
  AUDIT_SAFE_TASK_LIBRARY,
  AUDIT_HARD_PROHIBITIONS,
  AUDIT_RANK_THRESHOLDS,
  buildAuditPrompt,
} = require('../data/lookmaxing-audit-prompts');

// ---------------------------------------------------------------------------
// buildAuditPrompt — builder helper
// ---------------------------------------------------------------------------
describe('buildAuditPrompt', () => {
  const mockAnswers = [
    { questionId: 'q1', choice: 'A', label: 'Powerful and intense' },
    { questionId: 'q2', choice: 'C', label: 'Oily skin — shiny, breakouts' },
    { questionId: 'q3', choice: 'B', label: 'Thinning or receding' },
    { questionId: 'q4', choice: 'A', label: 'Not enough — always tired' },
    { questionId: 'q5', choice: 'B', label: 'Basic routine, want more' },
  ];

  it('returns a non-empty string', () => {
    const prompt = buildAuditPrompt(mockAnswers, true);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('contains each quiz answer label verbatim', () => {
    const prompt = buildAuditPrompt(mockAnswers, true);
    for (const answer of mockAnswers) {
      expect(prompt).toContain(answer.label);
    }
  });

  it('contains each questionId verbatim', () => {
    const prompt = buildAuditPrompt(mockAnswers, true);
    for (const answer of mockAnswers) {
      expect(prompt).toContain(answer.questionId);
    }
  });

  it('wraps quiz answers in USER_INPUT delimiters (prompt-injection guard)', () => {
    const prompt = buildAuditPrompt(mockAnswers, true);
    expect(prompt).toContain('<<<USER_INPUT_START>>>');
    expect(prompt).toContain('<<<USER_INPUT_END>>>');
  });

  it('photoBytesAvailable=false emits a photo-quality fallback instruction', () => {
    const prompt = buildAuditPrompt(mockAnswers, false);
    expect(prompt.toLowerCase()).toMatch(/photo|image/);
  });

  it('produces a different prompt when photoBytesAvailable changes', () => {
    const withPhoto = buildAuditPrompt(mockAnswers, true);
    const withoutPhoto = buildAuditPrompt(mockAnswers, false);
    expect(withPhoto).not.toBe(withoutPhoto);
  });

  it('asks for all 24 metrics across 5 vectors', () => {
    const prompt = buildAuditPrompt(mockAnswers, true);
    expect(prompt).toContain('24');
    expect(prompt.toLowerCase()).toContain('5 vectors');
  });
});

// ---------------------------------------------------------------------------
// AUDIT_VECTOR_TAXONOMY — exactly 5 vectors, 24 metrics, valid classes
// ---------------------------------------------------------------------------
describe('AUDIT_VECTOR_TAXONOMY', () => {
  it('has exactly 5 vectors', () => {
    expect(Array.isArray(AUDIT_VECTOR_TAXONOMY)).toBe(true);
    expect(AUDIT_VECTOR_TAXONOMY).toHaveLength(5);
  });

  it('has the 5 spec vector ids in order', () => {
    expect(AUDIT_VECTOR_TAXONOMY.map((v) => v.id)).toEqual([
      'lowerFaceJaw', 'periorbitalEyes', 'dermalSkin', 'haloHair', 'postureCarriage',
    ]);
  });

  it('totals exactly 24 metrics (6/5/5/5/3)', () => {
    expect(AUDIT_VECTOR_TAXONOMY.map((v) => v.metrics.length)).toEqual([6, 5, 5, 5, 3]);
    expect(AUDIT_TOTAL_METRICS).toBe(24);
  });

  it('every metric has a name, subtitle, a valid class, and a boolean visualIndicator', () => {
    for (const v of AUDIT_VECTOR_TAXONOMY) {
      for (const m of v.metrics) {
        expect(typeof m.metric).toBe('string');
        expect(m.metric.length).toBeGreaterThan(0);
        expect(typeof m.subtitle).toBe('string');
        expect(AUDIT_METRIC_CLASSES).toContain(m.class);
        expect(typeof m.visualIndicator).toBe('boolean');
      }
    }
  });

  it('classes are exactly actionable / leverage / fixed', () => {
    expect([...AUDIT_METRIC_CLASSES].sort()).toEqual(['actionable', 'fixed', 'leverage']);
  });

  it('every actionable / leverage metric is quest-eligible; every fixed metric is context-only', () => {
    const quest = new Set(AUDIT_QUEST_ELIGIBLE_METRICS);
    const context = new Set(AUDIT_CONTEXT_ONLY_METRICS);
    for (const v of AUDIT_VECTOR_TAXONOMY) {
      for (const m of v.metrics) {
        if (m.class === 'fixed') {
          expect(context.has(m.metric), `${m.metric} should be context-only`).toBe(true);
        } else {
          expect(quest.has(m.metric), `${m.metric} should be quest-eligible`).toBe(true);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_SAFE_TASK_LIBRARY — bounded category structure
// ---------------------------------------------------------------------------
describe('AUDIT_SAFE_TASK_LIBRARY', () => {
  const EXPECTED_CATEGORIES = [
    'skincareBasics',
    'puffinessUnderEye',
    'hydrationSleep',
    'groomingShape',
    'posturePresence',
    'wardrobeColour',
    'structureMechanical',
  ];

  it('contains every expected category key', () => {
    for (const cat of EXPECTED_CATEGORIES) {
      expect(AUDIT_SAFE_TASK_LIBRARY).toHaveProperty(cat);
    }
  });

  it('each category is a non-empty array of task strings', () => {
    for (const cat of EXPECTED_CATEGORIES) {
      const tasks = AUDIT_SAFE_TASK_LIBRARY[cat];
      expect(Array.isArray(tasks)).toBe(true);
      expect(tasks.length).toBeGreaterThan(0);
      for (const t of tasks) {
        expect(typeof t).toBe('string');
        expect(t.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_QUEST_ELIGIBLE_METRICS and AUDIT_CONTEXT_ONLY_METRICS — disjoint
// ---------------------------------------------------------------------------
describe('AUDIT_QUEST_ELIGIBLE_METRICS and AUDIT_CONTEXT_ONLY_METRICS are disjoint', () => {
  it('both lists are non-empty arrays', () => {
    expect(Array.isArray(AUDIT_QUEST_ELIGIBLE_METRICS)).toBe(true);
    expect(AUDIT_QUEST_ELIGIBLE_METRICS.length).toBeGreaterThan(0);
    expect(Array.isArray(AUDIT_CONTEXT_ONLY_METRICS)).toBe(true);
    expect(AUDIT_CONTEXT_ONLY_METRICS.length).toBeGreaterThan(0);
  });

  it('no metric appears in both lists', () => {
    const questSet = new Set(AUDIT_QUEST_ELIGIBLE_METRICS);
    for (const metric of AUDIT_CONTEXT_ONLY_METRICS) {
      expect(questSet.has(metric)).toBe(false);
    }
  });

  it('context-only list contains the fixed osseous / density entries', () => {
    for (const m of ['Gonial Angle', 'Canthal Tilt', 'Hair Density / Crown', 'boneStructure']) {
      expect(AUDIT_CONTEXT_ONLY_METRICS).toContain(m);
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_HARD_PROHIBITIONS — expected dangerous keywords
// ---------------------------------------------------------------------------
describe('AUDIT_HARD_PROHIBITIONS', () => {
  const REQUIRED_PROHIBITION_KEYWORDS = [
    'medication',
    'retinoid',
    'caloric restriction',
    'procedure',
    'fasting',
    'lighten',
  ];

  it('is a non-empty array of strings', () => {
    expect(Array.isArray(AUDIT_HARD_PROHIBITIONS)).toBe(true);
    expect(AUDIT_HARD_PROHIBITIONS.length).toBeGreaterThan(0);
    for (const item of AUDIT_HARD_PROHIBITIONS) expect(typeof item).toBe('string');
  });

  it('contains every required prohibition keyword', () => {
    const combined = AUDIT_HARD_PROHIBITIONS.join(' ').toLowerCase();
    for (const keyword of REQUIRED_PROHIBITION_KEYWORDS) {
      expect(combined).toContain(keyword);
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_RANK_THRESHOLDS — covers 0-100 contiguously (compat with auraScore)
// ---------------------------------------------------------------------------
describe('AUDIT_RANK_THRESHOLDS', () => {
  it('is an array of {min,max,rank} objects', () => {
    expect(Array.isArray(AUDIT_RANK_THRESHOLDS)).toBe(true);
    for (const tier of AUDIT_RANK_THRESHOLDS) {
      expect(typeof tier.min).toBe('number');
      expect(typeof tier.max).toBe('number');
      expect(typeof tier.rank).toBe('string');
    }
  });

  it('covers 0 to 100 with no gap (contiguous)', () => {
    const sorted = [...AUDIT_RANK_THRESHOLDS].sort((a, b) => a.min - b.min);
    expect(sorted[0].min).toBe(0);
    expect(sorted[sorted.length - 1].max).toBe(100);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].min).toBe(sorted[i - 1].max + 1);
    }
  });

  it('contains all 5 rank labels', () => {
    const ranks = AUDIT_RANK_THRESHOLDS.map((t) => t.rank);
    for (const r of ['unawakened', 'seeker', 'ascendant', 'luminary', 'sovereign']) {
      expect(ranks).toContain(r);
    }
  });

  const cases = [
    [0, 'unawakened'], [29, 'unawakened'], [30, 'seeker'], [50, 'ascendant'],
    [70, 'luminary'], [85, 'sovereign'], [100, 'sovereign'],
  ];
  for (const [score, rank] of cases) {
    it(`score=${score} maps to ${rank}`, () => {
      const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= score && t.max >= score);
      expect(tier.rank).toBe(rank);
    });
  }
});

// ---------------------------------------------------------------------------
// AUDIT_SYSTEM_PROMPT — content and safety assertions
// ---------------------------------------------------------------------------
describe('AUDIT_SYSTEM_PROMPT', () => {
  it('is a substantial string', () => {
    expect(typeof AUDIT_SYSTEM_PROMPT).toBe('string');
    expect(AUDIT_SYSTEM_PROMPT.length).toBeGreaterThan(1000);
  });

  it('contains the canonical hard-prohibition fallback phrase', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('This is one for a qualified professional.');
  });

  it('contains the ◆ MainCharacter signature instruction', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('◆ MainCharacter');
  });

  it('contains no exclamation marks (Consultant voice)', () => {
    expect(AUDIT_SYSTEM_PROMPT).not.toContain('!');
  });

  it('contains the context-vs-quest rule', () => {
    expect(AUDIT_SYSTEM_PROMPT.toUpperCase()).toContain('CONTEXT-VS-QUEST');
  });

  it('names the 24-metric taxonomy and all five vectors', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('24-METRIC TAXONOMY');
    for (const name of ['Lower Face & Jaw', 'Periorbital & Eyes', 'Dermal Surface', 'The Halo', 'Posture & Carriage']) {
      expect(AUDIT_SYSTEM_PROMPT).toContain(name);
    }
  });

  it('encodes the rx (prescription-grade) safety framing', () => {
    expect(AUDIT_SYSTEM_PROMPT.toUpperCase()).toContain('PRESCRIPTION-GRADE');
    const lower = AUDIT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('dermatologist');
    expect(lower).toMatch(/over-the-counter|otc/);
  });

  it('contains the USER_INPUT prompt-injection guard delimiters', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('<<<USER_INPUT_START>>>');
    expect(AUDIT_SYSTEM_PROMPT).toContain('<<<USER_INPUT_END>>>');
  });

  it('mentions the global aura score and the 0-100 compat mirror', () => {
    const lower = AUDIT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('globalscore10');
    expect(lower).toContain('aurascore');
  });
});

// ---------------------------------------------------------------------------
// AUDIT_JSON_SCHEMA — structural assertions for the new blueprint contract
// ---------------------------------------------------------------------------
describe('AUDIT_JSON_SCHEMA', () => {
  it('has type: object at root with additionalProperties false', () => {
    expect(AUDIT_JSON_SCHEMA.type).toBe('object');
    expect(AUDIT_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it('required array contains the full blueprint contract', () => {
    expect(AUDIT_JSON_SCHEMA.required).toEqual([
      'auraScore', 'globalScore10', 'percentile', 'rank', 'archetype', 'faceShape',
      'firstImpression', 'statusAlert', 'metricsScored', 'freeSignals', 'vectors',
      'chromatic', 'intervention', 'projection', 'methodology',
    ]);
  });

  it('auraScore is an integer 0-100 (compat mirror)', () => {
    const p = AUDIT_JSON_SCHEMA.properties.auraScore;
    expect(p.type).toBe('integer');
    expect(p.minimum).toBe(0);
    expect(p.maximum).toBe(100);
  });

  it('globalScore10 is a number 0-10', () => {
    const p = AUDIT_JSON_SCHEMA.properties.globalScore10;
    expect(p.type).toBe('number');
    expect(p.minimum).toBe(0);
    expect(p.maximum).toBe(10);
  });

  it('rank has the 5 rank enum', () => {
    const p = AUDIT_JSON_SCHEMA.properties.rank;
    expect(p.enum).toEqual(
      expect.arrayContaining(['unawakened', 'seeker', 'ascendant', 'luminary', 'sovereign'])
    );
    expect(p.enum).toHaveLength(5);
  });

  it('metricsScored is constrained to 24', () => {
    expect(AUDIT_JSON_SCHEMA.properties.metricsScored.const).toBe(24);
  });

  it('freeSignals is exactly 4 with label/axis', () => {
    const p = AUDIT_JSON_SCHEMA.properties.freeSignals;
    expect(p.minItems).toBe(4);
    expect(p.maxItems).toBe(4);
    expect(p.items.required).toEqual(['label', 'axis']);
  });

  it('vectors is exactly 5 and each metric carries the 6 required fields', () => {
    const p = AUDIT_JSON_SCHEMA.properties.vectors;
    expect(p.minItems).toBe(5);
    expect(p.maxItems).toBe(5);
    const metricReq = p.items.properties.metrics.items.required;
    expect(metricReq).toEqual(['metric', 'subtitle', 'rootCause', 'score10', 'class', 'visualIndicator']);
    const classEnum = p.items.properties.metrics.items.properties.class.enum;
    expect(classEnum).toEqual(['actionable', 'leverage', 'fixed']);
  });

  it('chromatic requires the substrate, palettes, metals and styling fields', () => {
    const req = AUDIT_JSON_SCHEMA.properties.chromatic.required;
    for (const f of ['undertone', 'contrast', 'profile', 'powerPalette', 'antiPalette', 'metals', 'stylingCorrections']) {
      expect(req).toContain(f);
    }
  });

  it('intervention requires morning/night/mechanical, each step carrying rx', () => {
    const intervention = AUDIT_JSON_SCHEMA.properties.intervention;
    expect(intervention.required).toEqual(['morning', 'night', 'mechanical']);
    const stepReq = intervention.properties.morning.items.required;
    expect(stepReq).toEqual(['step', 'agent', 'spec', 'rationale', 'rx']);
    expect(intervention.properties.morning.items.properties.rx.type).toBe('boolean');
  });

  it('projection requires rows/global day0/day90/narrative', () => {
    const p = AUDIT_JSON_SCHEMA.properties.projection;
    expect(p.required).toEqual(['rows', 'globalDay0', 'globalDay90', 'narrative']);
    expect(p.properties.rows.items.required).toEqual(['vector', 'day0', 'day90', 'delta']);
  });

  it('methodology is a string', () => {
    expect(AUDIT_JSON_SCHEMA.properties.methodology.type).toBe('string');
  });
});
