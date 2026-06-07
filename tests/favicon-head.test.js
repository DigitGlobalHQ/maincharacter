/**
 * tests/favicon-head.test.js — site-wide favicon link tags + generated assets exist.
 */
import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const { faviconHead } = require('../lib/favicon-head');

describe('faviconHead()', () => {
  const h = faviconHead();

  it('emits the standard icon + apple-touch link tags', () => {
    expect(h).toContain('rel="icon"');
    expect(h).toContain('/favicon-32.png');
    expect(h).toContain('/favicon-16.png');
    expect(h).toContain('rel="apple-touch-icon"');
    expect(h).toContain('/apple-touch-icon.png');
  });

  it('the referenced icon files were generated', () => {
    for (const f of ['favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png']) {
      const p = path.join(__dirname, '..', 'public', f);
      expect(fs.existsSync(p), `${f} should exist`).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(100);
    }
  });
});
