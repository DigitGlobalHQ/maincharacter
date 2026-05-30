/**
 * WHOLE-LIBRARY SAFETY INVARIANT (Phase 1 hardening).
 *
 * A permanent net: every piece of content the product can surface to a user —
 * the static protocol library, the hair guidance for every reading, the daily
 * protocol output, the trigger tasks, and the safe-task library itself — must
 * pass the safety validator. If a future edit reintroduces a drug name, dosage,
 * RCT tag, or prescriptive diet anywhere in these sources, THIS TEST FAILS
 * before it can ship. It is intentionally exhaustive.
 */
import { describe, it, expect } from 'vitest';
const V = require('../lib/safety-validator');

const textOf = (o) => Object.values(o || {}).filter((v) => typeof v === 'string').join('\n');

describe('content-safety invariant: PROTOCOL_LIBRARY', () => {
  const { PROTOCOL_LIBRARY, PROFESSIONAL_REFERRAL_NOTE } = require('../data/lookmax-content');
  it('every protocol item (do + do-not) is validator-safe', () => {
    for (const [bucket, items] of Object.entries(PROTOCOL_LIBRARY)) {
      for (const it of items) {
        const t = `${it.title}\n${it.instruction}`;
        expect(V.isSafe(t), `${bucket}:${it.id} → ${V.findViolations(t)}`).toBe(true);
      }
    }
  });
  it('the professional-referral note is safe', () => {
    expect(V.isSafe(PROFESSIONAL_REFERRAL_NOTE)).toBe(true);
  });
});

describe('content-safety invariant: hair guidance (all readings)', () => {
  const hair = require('../services/hair');
  it('every Norwood-stage recommendation set is validator-safe', () => {
    for (let n = 1; n <= 7; n += 1) {
      const r = hair.recommendationsForNorwood(n);
      const t = [...r.do, ...r.doNot].map((d) => `${d.title}\n${d.instruction || ''}`).join('\n');
      expect(V.isSafe(t), `Norwood ${n} → ${V.findViolations(t)}`).toBe(true);
    }
  });
});

describe('content-safety invariant: SAFE_TASK_LIBRARY + trigger tasks', () => {
  it('every safe-library task is self-safe', () => {
    for (const [bucket, pool] of Object.entries(V.SAFE_TASK_LIBRARY)) {
      for (const task of pool) {
        expect(V.isSafe(`${task.title}\n${task.instruction}`), `${bucket}:${task.title}`).toBe(true);
      }
    }
  });
  it('every trigger task + report-back is safe', () => {
    const TE = require('../services/trigger-engine');
    for (const [axis, tr] of Object.entries(TE.TRIGGERS)) {
      expect(V.isSafe(`${tr.task.title}\n${tr.task.instruction}\n${tr.reportBack}`), axis).toBe(true);
    }
  });
});

describe('content-safety invariant: generated daily protocol', () => {
  const protocol = require('../services/protocol');
  const { AESTHETIC_AXES } = require('../data/lookmax-prompts');
  it('protocol generated for each weakest axis is fully safe', () => {
    for (const weak of AESTHETIC_AXES) {
      const scores = {};
      AESTHETIC_AXES.forEach((a) => (scores[a] = 55));
      scores[weak] = 30;
      const day = protocol.generateProtocol({ token: 'inv' }, { scores, weakestAxis: weak });
      const t = [...day.items, ...day.doNots].map((i) => `${i.title}\n${i.instruction}`).join('\n');
      expect(V.isSafe(t), `weak=${weak} → ${V.findViolations(t)}`).toBe(true);
    }
  });
});
