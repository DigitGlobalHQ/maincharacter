/**
 * Phase 1 safety backstop on the live audit engine: a model that emits medical
 * content anywhere in the report must have it scrubbed before it reaches a user.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-audit-safety-'));
process.env.USERS_FILE_PATH = path.join(tmp, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmp, 'waitlist.json');
process.env.ADMIN_PASSWORD = 'x';
process.env.JWT_SECRET = 'audit-safety-secret';

const V = require('../lib/safety-validator');
const lookmaxing = require('../routes/lookmaxing');

describe('audit report safety backstop (_sanitizeReport)', () => {
  it('scrubs medical content from every nested field', () => {
    const dirty = {
      auraScore: 61,
      firstImpression: 'Start minoxidil 5% nightly and take 2.5 mg of the prescription.',
      freeSignals: [{ label: 'Skin', detail: 'Use a retinoid, RCT-supported.' }],
      decomposition: {
        hair: [{ metric: 'haircutFaceShapeMatch', score: 50, cause: 'Recession.', fix: 'Apply ketoconazole 2% shampoo.' }],
      },
      quests: [{ task: 'Microneedling 0.5-1mm weekly.' }, { task: 'Sleep 7-8 hours.' }],
      styleAndColour: { haircut: 'A shaped crop suits your face.' },
      starterPlan: [{ day: 1, task: 'Take a biotin supplement.' }, { day: 2, task: 'Hydrate through the day.' }],
    };
    const clean = lookmaxing._sanitizeReport(dirty, 'test1234');
    const serialized = JSON.stringify(clean);
    expect(V.isSafe(serialized)).toBe(true);
    // safe fields survive untouched
    expect(clean.quests[1].task).toBe('Sleep 7-8 hours.');
    expect(clean.starterPlan[1].task).toBe('Hydrate through the day.');
    expect(clean.styleAndColour.haircut).toBe('A shaped crop suits your face.');
    // unsafe fields replaced with the canonical fallback
    expect(clean.quests[0].task).toBe(V.QUALIFIED_PROFESSIONAL);
    expect(clean.decomposition.hair[0].fix).toBe(V.QUALIFIED_PROFESSIONAL);
    expect(clean.starterPlan[0].task).toBe(V.QUALIFIED_PROFESSIONAL);
  });

  it('leaves a fully-safe report unchanged', () => {
    const safe = {
      auraScore: 70,
      firstImpression: 'The structure is here to build on. Begin with sleep. ◆ MainCharacter',
      freeSignals: [{ label: 'Posture', detail: 'Hold the head level.' }],
      quests: [{ task: 'Stand tall, chin lightly tucked.' }],
    };
    const before = JSON.stringify(safe);
    lookmaxing._sanitizeReport(safe, 'test5678');
    expect(JSON.stringify(safe)).toBe(before);
  });
});
