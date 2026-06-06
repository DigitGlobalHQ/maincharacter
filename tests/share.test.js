/**
 * tests/share.test.js
 * Viral share cards: OG preview page + personalised PNG, read-only, no PII leak.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-share-'));
const storePath = path.join(tmpDir, 'audit-sessions-v2.json');
process.env.AUDIT_V2_STORE_PATH = storePath;
process.env.UPGRADE_BASE_URL = 'https://example.test';

// Seed one session with a report, and one with sensitive fields that must NOT leak.
fs.writeFileSync(storePath, JSON.stringify({
  'aud-1': {
    id: 'aud-1',
    userId: 'tok-secret',
    photoB64: 'SENSITIVE_PHOTO_DATA',
    geminiReport: { auraScore: 72, rank: 'Magnetic', faceShape: 'oval', firstImpression: 'SECRET_IMPRESSION' },
  },
}));

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const shareRouter = (await import('../routes/share.js')).default;
const { buildShareSvg, _safeRank, _clampScore } = await import('../routes/share.js');

const app = express();
app.use('/', shareRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('share helpers', () => {
  it('clamps score to 0..100', () => {
    expect(_clampScore(150)).toBe(100);
    expect(_clampScore(-5)).toBe(0);
    expect(_clampScore('72')).toBe(72);
    expect(_clampScore('abc')).toBe(0);
  });
  it('sanitises rank against injection', () => {
    expect(_safeRank('Magnetic')).toBe('Magnetic');
    expect(_safeRank('<script>x</script>')).toBe('Scriptxscript');
    expect(_safeRank('"/><svg onload=1>')).toBe('Svg onload');
  });
  it('builds an svg containing the score', () => {
    const svg = buildShareSvg({ score: 72, rank: 'Magnetic' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('>72<');
    expect(svg).toContain('Magnetic');
  });
});

describe('GET /s/:id', () => {
  it('renders OG meta + the card image url for a known reading', async () => {
    const res = await request(app).get('/s/aud-1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('og:image');
    expect(res.text).toContain('https://example.test/s/aud-1/card.png');
    expect(res.text).toContain('Aura Score 72');
    expect(res.text).toContain('noindex');
  });
  it('NEVER leaks PII (photo, impression, userId)', async () => {
    const res = await request(app).get('/s/aud-1');
    expect(res.text).not.toContain('SENSITIVE_PHOTO_DATA');
    expect(res.text).not.toContain('SECRET_IMPRESSION');
    expect(res.text).not.toContain('tok-secret');
  });
  it('handles unknown ids gracefully (no 500, generic copy)', async () => {
    const res = await request(app).get('/s/does-not-exist');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The room reads you before you speak');
  });
});

describe('GET /s/:id/card.png', () => {
  it('returns an image for a known reading', async () => {
    const res = await request(app).get('/s/aud-1/card.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/(png|svg)/);
  });
  it('returns an image even for unknown ids', async () => {
    const res = await request(app).get('/s/nope/card.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/(png|svg)/);
  });
});
