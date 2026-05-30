/**
 * Trigger engine (Phase 3.3) — low-signal axis → safe task → streak target →
 * report-back. Every task must be validator-safe by construction, and progress
 * evaluation must "answer" a trigger only when the axis genuinely improves.
 */
import { describe, it, expect } from 'vitest';
const TE = require('../services/trigger-engine');
const V = require('../lib/safety-validator');

describe('trigger-engine: safety by construction', () => {
  it('every trigger task + report-back is validator-safe', () => {
    for (const [axis, tr] of Object.entries(TE.TRIGGERS)) {
      const text = `${tr.task.title}\n${tr.task.instruction}\n${tr.reportBack}`;
      expect(V.isSafe(text), `${axis} tripped: ${V.findViolations(text)}`).toBe(true);
    }
  });
});

describe('trigger-engine: selection', () => {
  it('returns triggers for the weakest changeable axes, capped at max', () => {
    const weak = ['eyeArea', 'skinClarity', 'posture'];
    const got = TE.triggersForWeakAxes(weak, 2);
    expect(got.length).toBe(2);
    expect(got[0].axis).toBe('eyeArea');
    expect(got[1].axis).toBe('skinClarity');
  });

  it('skips context-only axes (no trigger for facial harmony)', () => {
    const got = TE.triggersForWeakAxes(['facialHarmony', 'hairDensity', 'posture'], 2);
    // facialHarmony + native hairDensity have no trigger → only posture qualifies
    expect(got.map((g) => g.axis)).toEqual(['posture']);
  });
});

describe('trigger-engine: progress evaluation', () => {
  const eye = TE.TRIGGERS.eyeArea; // streakTargetDays 5
  const mk = (vals) => vals.map((v, i) => ({ date: `2026-05-${10 + i}`, axes: { eyeArea: v } }));

  it('counts a non-decreasing recent streak', () => {
    const p = TE.evaluateProgress(eye, mk([40, 42, 42, 45, 47]));
    expect(p.streak).toBe(4); // each step ≥ previous
    expect(p.target).toBe(5);
  });

  it('breaks the streak on a drop', () => {
    const p = TE.evaluateProgress(eye, mk([40, 45, 43, 44, 46]));
    expect(p.streak).toBe(2); // 46≥44, 44≥43, then 43<45 breaks
  });

  it('marks answered when the axis improves over the window', () => {
    const p = TE.evaluateProgress(eye, mk([40, 41, 43, 45, 47, 50]));
    expect(p.delta).toBeGreaterThanOrEqual(TE.ANSWERED_DELTA);
    expect(p.answered).toBe(true);
    expect(p.reportBack).toBe(eye.reportBack);
  });

  it('not answered when flat or declining; no report-back', () => {
    const p = TE.evaluateProgress(eye, mk([50, 50, 49, 50, 50]));
    expect(p.answered).toBe(false);
    expect(p.reportBack).toBeNull();
  });

  it('handles empty / single-point history without throwing', () => {
    expect(TE.evaluateProgress(eye, []).streak).toBe(0);
    expect(TE.evaluateProgress(eye, mk([55])).delta).toBeNull();
  });
});

describe('trigger-engine: triggersWithProgress shape', () => {
  it('returns id/axis/signal/task/target/progress per trigger', () => {
    const mirrors = [
      { date: '2026-05-20', axes: { skinClarity: 40 } },
      { date: '2026-05-21', axes: { skinClarity: 44 } },
    ];
    const out = TE.triggersWithProgress(['skinClarity'], mirrors, 2);
    expect(out.length).toBe(1);
    expect(out[0]).toHaveProperty('signal');
    expect(out[0].task).toHaveProperty('title');
    expect(out[0].progress).toHaveProperty('streak');
  });
});
