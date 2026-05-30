/**
 * Safety validator — the safe brain. These tests are the contract: forbidden
 * medical/pharmacological/prescriptive output must be REJECTED, safe habit
 * tasks must be ACCEPTED. They gate every later phase that builds on the
 * validator (Phase 1, 2026-05-30).
 */
import { describe, it, expect } from 'vitest';
const V = require('../lib/safety-validator');

describe('safety-validator: REJECTS forbidden output', () => {
  const forbidden = [
    ['minoxidil', 'Minoxidil 5%, once daily'],
    ['finasteride', 'Discuss finasteride with a dermatologist'],
    ['ketoconazole', 'Ketoconazole 2% shampoo, 2-3x/week'],
    ['tretinoin/retinoid', 'Start a low-strength retinoid at night'],
    ['biotin', 'DO NOT take biotin without a deficiency'],
    ['percent strength', 'Apply the 5% solution to the scalp'],
    ['mg dosage', 'Take 2.5 mg each morning'],
    ['RCT-supported', 'RCT-supported for density and regrowth'],
    ['protein at every meal', 'Protein at every meal supports lean mass'],
    ['microneedling mm', 'Microneedling 0.5-1mm weekly'],
    ['crash diet / water weight', 'Drop water weight before the shoot'],
    ['supplement', 'Add a collagen supplement daily'],
  ];

  for (const [name, text] of forbidden) {
    it(`flags: ${name}`, () => {
      expect(V.isSafe(text)).toBe(false);
      expect(V.findViolations(text).length).toBeGreaterThan(0);
    });
  }

  it('replaces an unsafe task with a safe-library task', () => {
    const { safe, task, violations } = V.validateTask(
      { id: 'hair-1', axis: 'hairDensity', title: 'Minoxidil 5%, once daily', instruction: '1ml topical. RCT-supported.' },
      { bucket: 'hair' }
    );
    expect(safe).toBe(false);
    expect(violations.length).toBeGreaterThan(0);
    expect(task.replacedForSafety).toBe(true);
    expect(V.isSafe(`${task.title}\n${task.instruction}`)).toBe(true);
  });
});

describe('safety-validator: ACCEPTS safe habit tasks', () => {
  const safe = [
    'Sleep 7-8 hours',
    'Hydrate through the day',
    'A broad-spectrum facial sunscreen each morning',
    'Stand tall, chin lightly tucked',
    'Gentle cleanse, twice daily',
    'Reduce evening salt and alcohol',
    'A cut that works with your hairline',
  ];
  for (const text of safe) {
    it(`accepts: ${text}`, () => {
      expect(V.isSafe(text)).toBe(true);
      expect(V.findViolations(text)).toEqual([]);
    });
  }

  it('leaves a safe task unchanged', () => {
    const input = { title: 'Sleep 7-8 hours', instruction: 'Guard the window.' };
    const { safe, task } = V.validateTask(input, { bucket: 'lifestyle' });
    expect(safe).toBe(true);
    expect(task).toEqual(input);
  });
});

describe('safety-validator: every SAFE_TASK_LIBRARY entry is self-safe', () => {
  it('no replacement task trips the validator (no infinite-unsafe loop)', () => {
    for (const [bucket, pool] of Object.entries(V.SAFE_TASK_LIBRARY)) {
      for (const t of pool) {
        const text = `${t.title}\n${t.instruction}`;
        expect(V.findViolations(text), `${bucket}:${t.title}`).toEqual([]);
      }
    }
  });
});

describe('safety-validator: context-vs-quest', () => {
  it('marks unchangeable traits as context-only (never scored/tasked)', () => {
    for (const trait of ['boneStructure', 'canthalTilt', 'facialHarmony', 'noseShape', 'undertone', 'symmetry', 'hairDensity']) {
      expect(V.isContextOnly(trait)).toBe(true);
    }
  });
  it('allows changeable metrics to be scored/tasked', () => {
    for (const metric of ['skinClarity', 'posture', 'underEye', 'wardrobeColour', 'sharpness']) {
      expect(V.isContextOnly(metric)).toBe(false);
    }
  });
});

describe('safety-validator: sanitizeProtocolDay', () => {
  it('sanitises every do/doNot item and reports replacements', () => {
    const day = {
      do: [
        { id: 'hair-1', axis: 'hairDensity', title: 'Minoxidil 5%, once daily', instruction: 'RCT-supported.' },
        { id: 'life-1', axis: 'expression', title: 'Sleep 7-8 hours', instruction: 'Guard the window.' },
      ],
      doNot: [{ id: 'hair-dn-2', axis: 'hairDensity', title: 'DO NOT take biotin without a deficiency', instruction: '' }],
    };
    const { day: clean, report } = V.sanitizeProtocolDay(day);
    const all = [...clean.do, ...clean.doNot].map((t) => `${t.title}\n${t.instruction}`).join('\n');
    expect(V.isSafe(all)).toBe(true);
    expect(report.length).toBe(2); // minoxidil + biotin replaced, sleep kept
  });
});

describe('safety-validator: validateProse tripwire', () => {
  it('flags medical prose and offers the canonical fallback', () => {
    const r = V.validateProse('You should start minoxidil and a 5% solution tonight.');
    expect(r.safe).toBe(false);
    expect(r.fallback).toBe('This is one for a qualified professional.');
  });
  it('passes clean Consultant prose', () => {
    expect(V.validateProse('The hairline held. Holding is its own kind of progress here. ◆').safe).toBe(true);
  });
});
