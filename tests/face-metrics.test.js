/**
 * tests/face-metrics.test.js — pure facial-geometry engine.
 * Builds synthetic landmark sets (pixel coords) with known geometry and asserts
 * the metrics behave correctly. No MediaPipe / DOM involved.
 */
import { describe, it, expect } from 'vitest';
const FM = require('../public/lookmaxing/tools/face-metrics.js');
const I = FM.INDICES;

/** Build a 478-point landmark array, then place named indices. */
function face(overrides) {
  const lm = Array.from({ length: 478 }, () => ({ x: 200, y: 200 }));
  const base = {
    [I.foreheadTop]: { x: 200, y: 50 }, [I.chin]: { x: 200, y: 350 },
    [I.glabella]: { x: 200, y: 120 }, [I.noseTip]: { x: 200, y: 200 }, [I.subnasale]: { x: 200, y: 235 },
    [I.cheekR]: { x: 110, y: 200 }, [I.cheekL]: { x: 290, y: 200 },
    [I.jawR]: { x: 130, y: 300 }, [I.jawL]: { x: 270, y: 300 },
    [I.foreheadR]: { x: 130, y: 90 }, [I.foreheadL]: { x: 270, y: 90 },
    [I.mouthL]: { x: 170, y: 270 }, [I.mouthR]: { x: 230, y: 270 },
    [I.noseR]: { x: 185, y: 205 }, [I.noseL]: { x: 215, y: 205 },
    [I.rEyeOuter]: { x: 140, y: 150 }, [I.rEyeInner]: { x: 180, y: 150 },
    [I.lEyeInner]: { x: 220, y: 150 }, [I.lEyeOuter]: { x: 260, y: 150 },
    [I.rEyeTop]: { x: 160, y: 143 }, [I.rEyeBottom]: { x: 160, y: 157 },
    [I.lEyeTop]: { x: 240, y: 143 }, [I.lEyeBottom]: { x: 240, y: 157 },
    [I.browR]: { x: 160, y: 120 }, [I.browL]: { x: 240, y: 120 },
    [I.lipTop]: { x: 200, y: 260 }, [I.lipBottom]: { x: 200, y: 285 },
  };
  Object.assign(base, overrides || {});
  Object.keys(base).forEach((k) => { lm[k] = base[k]; });
  return lm;
}

describe('computeAllMetrics', () => {
  it('returns null for an invalid landmark set', () => {
    expect(FM.computeAllMetrics([])).toBeNull();
    expect(FM.computeAllMetrics(null)).toBeNull();
  });

  it('produces the full metric set with sane ranges for a symmetric face', () => {
    const m = FM.computeAllMetrics(face());
    expect(m).toBeTruthy();
    expect(m.attractiveness.score).toBeGreaterThanOrEqual(1);
    expect(m.attractiveness.score).toBeLessThanOrEqual(99);
    expect(m.goldenRatio.score).toBeGreaterThanOrEqual(0);
    expect(m.goldenRatio.score).toBeLessThanOrEqual(100);
    expect(typeof m.faceShape.shape).toBe('string');
    expect(m.faceShape.confidence).toBeGreaterThan(0);
    expect(Array.isArray(m.facialRatios)).toBe(true);
    expect(m.facialRatios.find((r) => /FWHR/.test(r.name))).toBeTruthy();
    expect(['Almond', 'Long / Almond', 'Round', 'Upturned', 'Downturned']).toContain(m.eyeShape.shape);
  });

  it('scores a perfectly symmetric face very high on symmetry', () => {
    const m = FM.computeAllMetrics(face());
    expect(m.symmetry.overall).toBeGreaterThan(90);
  });

  it('drops the symmetry score when one side is shifted', () => {
    const sym = FM.symmetry(face()).overall;
    const asym = FM.symmetry(face({ [I.lEyeOuter]: { x: 300, y: 168 } })).overall;
    expect(asym).toBeLessThan(sym);
  });

  it('reads horizontal eyes as neutral canthal tilt', () => {
    expect(FM.canthalTilt(face()).label).toBe('Neutral');
  });

  it('reads raised outer corners as positive (upturned) tilt', () => {
    // Move both outer canthi UP (smaller y) → positive tilt.
    const tilted = face({
      [I.rEyeOuter]: { x: 140, y: 135 },
      [I.lEyeOuter]: { x: 260, y: 135 },
    });
    const ct = FM.canthalTilt(tilted);
    expect(ct.degrees).toBeGreaterThan(3);
    expect(ct.label).toMatch(/Positive/);
  });

  it('computes a gonial angle and jawline score in range', () => {
    const j = FM.jawline(face());
    expect(j.gonialAngle).toBeGreaterThan(60);
    expect(j.gonialAngle).toBeLessThan(180);
    expect(j.score).toBeGreaterThanOrEqual(0);
    expect(j.score).toBeLessThanOrEqual(100);
  });

  it('classifies an elongated face as Oblong', () => {
    // Stretch length far beyond width.
    const long = face({ [I.chin]: { x: 200, y: 520 } });
    expect(FM.faceShape(long).shape).toBe('Oblong');
  });
});
