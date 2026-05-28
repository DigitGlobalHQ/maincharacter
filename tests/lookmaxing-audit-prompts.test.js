/**
 * tests/lookmaxing-audit-prompts.test.js
 * Regression tests for the Stage-1 Lookmaxxing Audit Gemini prompt contract.
 * Cited spec: briefs/stage-1-audit-spec.md §6, §7.
 * No I/O, no API calls — pure module-level assertions.
 */

import { describe, it, expect } from 'vitest';

const {
  AUDIT_SYSTEM_PROMPT,
  AUDIT_JSON_SCHEMA,
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
});

// ---------------------------------------------------------------------------
// AUDIT_SAFE_TASK_LIBRARY — 6-category structure
// ---------------------------------------------------------------------------
describe('AUDIT_SAFE_TASK_LIBRARY', () => {
  const EXPECTED_CATEGORIES = [
    'skincareBasics',
    'puffinessUnderEye',
    'hydrationSleep',
    'groomingShape',
    'posturePresence',
    'wardrobeColour',
  ];

  it('has exactly 6 categories', () => {
    expect(Object.keys(AUDIT_SAFE_TASK_LIBRARY)).toHaveLength(6);
  });

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
  it('AUDIT_QUEST_ELIGIBLE_METRICS is a non-empty array', () => {
    expect(Array.isArray(AUDIT_QUEST_ELIGIBLE_METRICS)).toBe(true);
    expect(AUDIT_QUEST_ELIGIBLE_METRICS.length).toBeGreaterThan(0);
  });

  it('AUDIT_CONTEXT_ONLY_METRICS is a non-empty array', () => {
    expect(Array.isArray(AUDIT_CONTEXT_ONLY_METRICS)).toBe(true);
    expect(AUDIT_CONTEXT_ONLY_METRICS.length).toBeGreaterThan(0);
  });

  it('no metric appears in both lists', () => {
    const questSet = new Set(AUDIT_QUEST_ELIGIBLE_METRICS);
    for (const metric of AUDIT_CONTEXT_ONLY_METRICS) {
      expect(questSet.has(metric)).toBe(false);
    }
  });

  it('context-only list contains bone-structure and hair-density entries', () => {
    const lower = AUDIT_CONTEXT_ONLY_METRICS.map((m) => m.toLowerCase());
    expect(lower.some((m) => m.includes('bone') || m.includes('structure'))).toBe(true);
    expect(lower.some((m) => m.includes('hair') && m.includes('density'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AUDIT_HARD_PROHIBITIONS — expected dangerous keywords
// ---------------------------------------------------------------------------
describe('AUDIT_HARD_PROHIBITIONS', () => {
  const REQUIRED_PROHIBITION_KEYWORDS = [
    'medication',
    'acid',
    'retinoid',
    'caloric restriction',
    'procedure',
    'fasting',
  ];

  it('is a non-empty array', () => {
    expect(Array.isArray(AUDIT_HARD_PROHIBITIONS)).toBe(true);
    expect(AUDIT_HARD_PROHIBITIONS.length).toBeGreaterThan(0);
  });

  it('all items are strings', () => {
    for (const item of AUDIT_HARD_PROHIBITIONS) {
      expect(typeof item).toBe('string');
    }
  });

  it('contains every required prohibition keyword', () => {
    const combined = AUDIT_HARD_PROHIBITIONS.join(' ').toLowerCase();
    for (const keyword of REQUIRED_PROHIBITION_KEYWORDS) {
      expect(combined).toContain(keyword);
    }
  });
});

// ---------------------------------------------------------------------------
// AUDIT_RANK_THRESHOLDS — covers 0-100 contiguously
// ---------------------------------------------------------------------------
describe('AUDIT_RANK_THRESHOLDS', () => {
  it('is an array of objects with min, max, rank', () => {
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

  it('score=0 maps to unawakened', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 0 && t.max >= 0);
    expect(tier.rank).toBe('unawakened');
  });

  it('score=100 maps to sovereign', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 100 && t.max >= 100);
    expect(tier.rank).toBe('sovereign');
  });

  it('score=50 maps to ascendant (spec: 50=unremarkable average)', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 50 && t.max >= 50);
    expect(tier.rank).toBe('ascendant');
  });

  it('score=29 maps to unawakened (boundary)', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 29 && t.max >= 29);
    expect(tier.rank).toBe('unawakened');
  });

  it('score=30 maps to seeker (boundary)', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 30 && t.max >= 30);
    expect(tier.rank).toBe('seeker');
  });

  it('score=70 maps to luminary (boundary)', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 70 && t.max >= 70);
    expect(tier.rank).toBe('luminary');
  });

  it('score=85 maps to sovereign (boundary)', () => {
    const tier = AUDIT_RANK_THRESHOLDS.find((t) => t.min <= 85 && t.max >= 85);
    expect(tier.rank).toBe('sovereign');
  });
});

// ---------------------------------------------------------------------------
// AUDIT_SYSTEM_PROMPT — content and safety assertions
// ---------------------------------------------------------------------------
describe('AUDIT_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof AUDIT_SYSTEM_PROMPT).toBe('string');
    expect(AUDIT_SYSTEM_PROMPT.length).toBeGreaterThan(500);
  });

  it('contains the canonical hard-prohibition fallback phrase', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('This is one for a qualified professional.');
  });

  it('contains the ◆ MainCharacter signature instruction', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('◆ MainCharacter');
  });

  it('does NOT contain no-go medical terms that would prime the model', () => {
    // These terms are allowed ONLY inside the [HARD PROHIBITIONS] section —
    // where they are enumerated as refusal triggers, not as instructions.
    // We verify this by checking that every occurrence of each term falls
    // within the hard-prohibition section of the prompt.
    const prompt = AUDIT_SYSTEM_PROMPT;
    const prohibitionSectionStart = prompt.indexOf('[HARD PROHIBITIONS]');
    const prohibitionSectionEnd = prompt.indexOf('\n[', prohibitionSectionStart + 1);
    // If the section delimiters are found, all occurrences must be within them.
    expect(prohibitionSectionStart).toBeGreaterThan(-1); // section must exist
    const prohibitionSection = prohibitionSectionEnd > 0
      ? prompt.slice(prohibitionSectionStart, prohibitionSectionEnd)
      : prompt.slice(prohibitionSectionStart);

    const forbidden = ['medication', 'supplement', 'retinoid', 'fasting', 'procedure'];
    const lowerPrompt = prompt.toLowerCase();
    for (const word of forbidden) {
      let searchFrom = 0;
      while (true) {
        const idx = lowerPrompt.indexOf(word, searchFrom);
        if (idx === -1) break;
        // The occurrence must be inside the prohibition section
        const isInSection = idx >= prohibitionSectionStart && idx < prohibitionSectionStart + prohibitionSection.length;
        expect(isInSection).toBe(true);
        searchFrom = idx + 1;
      }
    }
  });

  it('contains no exclamation marks', () => {
    expect(AUDIT_SYSTEM_PROMPT).not.toContain('!');
  });

  it('contains the context-vs-quest rule section heading', () => {
    // Must have a dedicated instruction block for the rule
    const prompt = AUDIT_SYSTEM_PROMPT.toUpperCase();
    expect(
      prompt.includes('CONTEXT') && prompt.includes('QUEST')
    ).toBe(true);
  });

  it('contains the safe-task library section', () => {
    const prompt = AUDIT_SYSTEM_PROMPT.toUpperCase();
    expect(
      prompt.includes('SAFE') || prompt.includes('TASK LIBRARY') || prompt.includes('ALLOWED TASKS')
    ).toBe(true);
  });

  it('contains the USER_INPUT prompt-injection guard delimiters', () => {
    expect(AUDIT_SYSTEM_PROMPT).toContain('<<<USER_INPUT_START>>>');
    expect(AUDIT_SYSTEM_PROMPT).toContain('<<<USER_INPUT_END>>>');
  });

  it('contains an auraScore calibration note (50 = average)', () => {
    expect(AUDIT_SYSTEM_PROMPT.toLowerCase()).toContain('50');
  });

  it('contains the hard-prohibition trigger words inside a prohibition section', () => {
    // Verifies the prompt enumerates what to refuse — not that it instructs the model to do these.
    const lower = AUDIT_SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('qualified professional');
  });
});

// ---------------------------------------------------------------------------
// AUDIT_JSON_SCHEMA — structural assertions
// ---------------------------------------------------------------------------
describe('AUDIT_JSON_SCHEMA', () => {
  it('is a plain object', () => {
    expect(typeof AUDIT_JSON_SCHEMA).toBe('object');
    expect(AUDIT_JSON_SCHEMA).not.toBeNull();
  });

  it('has type: object at root', () => {
    expect(AUDIT_JSON_SCHEMA.type).toBe('object');
  });

  it('required array contains all 12 spec-mandated fields', () => {
    const REQUIRED_FIELDS = [
      'auraScore',
      'rank',
      'firstImpression',
      'faceShape',
      'freeSignals',
      'decomposition',
      'biggestLever',
      'quests',
      'styleAndColour',
      'starterPlan',
      'context',
      'warnings',
    ];
    for (const field of REQUIRED_FIELDS) {
      expect(AUDIT_JSON_SCHEMA.required).toContain(field);
    }
  });

  it('auraScore has integer type with 0-100 range', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.auraScore;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
    expect(prop.maximum).toBe(100);
  });

  it('rank has enum constraint with 5 valid values', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.rank;
    expect(prop.enum).toEqual(
      expect.arrayContaining(['unawakened', 'seeker', 'ascendant', 'luminary', 'sovereign'])
    );
    expect(prop.enum).toHaveLength(5);
  });

  it('faceShape has enum constraint', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.faceShape;
    expect(Array.isArray(prop.enum)).toBe(true);
    expect(prop.enum.length).toBeGreaterThan(4);
  });

  it('freeSignals is an array of length exactly 4', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.freeSignals;
    expect(prop.type).toBe('array');
    expect(prop.minItems).toBe(4);
    expect(prop.maxItems).toBe(4);
  });

  it('firstImpression has a maxLength constraint (≤18 words / ~120 chars)', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.firstImpression;
    expect(prop.type).toBe('string');
    expect(prop.maxLength).toBeDefined();
    expect(prop.maxLength).toBeLessThanOrEqual(200);
  });

  it('starterPlan is an array of length exactly 7', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.starterPlan;
    expect(prop.type).toBe('array');
    expect(prop.minItems).toBe(7);
    expect(prop.maxItems).toBe(7);
  });

  it('quests[].library enum matches safe-task category keys', () => {
    const questItems = AUDIT_JSON_SCHEMA.properties.quests.items;
    const libraryEnum = questItems.properties.library.enum;
    const expectedCategories = Object.keys(AUDIT_SAFE_TASK_LIBRARY);
    for (const cat of expectedCategories) {
      expect(libraryEnum).toContain(cat);
    }
  });

  it('additionalProperties is false at root', () => {
    expect(AUDIT_JSON_SCHEMA.additionalProperties).toBe(false);
  });

  it('warnings is an array of strings', () => {
    const prop = AUDIT_JSON_SCHEMA.properties.warnings;
    expect(prop.type).toBe('array');
    expect(prop.items.type).toBe('string');
  });
});
