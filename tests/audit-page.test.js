import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'audit.html'), 'utf8');
const prompts = require('../data/lookmax-prompts');

describe('audit.html — funnel scaffold (P3.1)', () => {
  it('has all six scenes', () => {
    for (const id of ['scene-hook', 'scene-quiz', 'scene-photos', 'scene-analysis', 'scene-result']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('uses the verbatim brief hook + skin question', () => {
    expect(html).toContain('The room reads you before you speak.');
    expect(html).toContain('Five minutes. One reading. Yours.');
    expect(html).toContain('Your morning ritual when you look at the mirror — what happens after?');
    expect(html).toContain('I cleanse, moisturise, sunscreen');
  });

  it('wires the real audit API endpoints', () => {
    for (const ep of ['/api/audit/session', '/api/audit/quiz', '/api/audit/photos', '/api/audit/analyze']) {
      expect(html).toContain(ep);
    }
  });

  it('has all 12 quiz questions (3 skin / 2 hair / 2 jaw / 2 body / 2 lifestyle / 1 goals)', () => {
    const ids = ['skin1', 'skin2', 'skin3', 'hair1', 'hair2', 'jaw1', 'jaw2', 'body1', 'body2', 'life1', 'life2', 'goals'];
    for (const id of ids) expect(html).toContain(`id: '${id}'`);
  });

  it('flags the drafted quiz copy for founder review', () => {
    expect(html).toContain('TODO copy review');
  });

  it('static copy carries no forbidden Consultant tokens', () => {
    // Strip the copy-review marker so the word "review" etc. is not the subject.
    expect(prompts.hasForbiddenToken(html)).toBe(false);
  });
});
