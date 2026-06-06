/**
 * tests/free-tools-pages.test.js — structural checks for the free-tool pages.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'public', 'lookmaxing', 'tools');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const TOOLS = [
  ['all.html', 'all'],
  ['face-shape.html', 'faceShape'],
  ['jawline-score.html', 'jawline'],
  ['canthal-tilt.html', 'canthalTilt'],
  ['eye-shape.html', 'eyeShape'],
  ['face-symmetry.html', 'symmetry'],
  ['attractiveness-score.html', 'attractiveness'],
  ['golden-ratio.html', 'goldenRatio'],
  ['facial-ratios.html', 'facialRatios'],
];

describe('free tool pages', () => {
  it.each(TOOLS)('%s loads the engine + renderer and sets focus %s', (file, focus) => {
    const h = read(file);
    expect(h).toContain('/lookmaxing/tools/face-metrics.js');
    expect(h).toContain('/lookmaxing/tools/analyzer.js');
    expect(h).toContain('/lookmaxing/tools/tools.css');
    expect(h).toContain('<main id="app">');
    expect(h).toContain('"focus":"' + focus + '"');
    expect(h).toMatch(/<title>[^<]+MainCharacter<\/title>/);
    expect(h).toContain('rel="canonical"');
  });

  it('the privacy promise lives in the shared renderer', () => {
    expect(read('analyzer.js')).toContain('never leaves your device');
  });

  it('hub lists every per-tool page + studio', () => {
    const h = read('index.html');
    ['attractiveness-score', 'face-shape', 'jawline-score', 'canthal-tilt', 'eye-shape', 'face-symmetry', 'golden-ratio', 'facial-ratios']
      .forEach((slug) => expect(h).toContain('/lookmaxing/tools/' + slug));
    expect(h).toContain('/face');
    expect(h).toContain('/studio');
    expect(h).toContain('/lookmaxing');
  });

  it('studio page calls the AI generate endpoint + tokens', () => {
    const h = read('studio.html');
    expect(h).toContain('/api/lookmax/ai/generate');
    expect(h).toContain('/api/lookmax/tokens');
  });

  it('engine + renderer + css assets exist', () => {
    ['analyzer.js', 'face-metrics.js', 'tools.css'].forEach((f) => expect(fs.existsSync(path.join(dir, f))).toBe(true));
  });
});
