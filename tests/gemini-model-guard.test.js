// tests/gemini-model-guard.test.js — guards against regressing to a deprecated Gemini model.
// gemini-2.0-flash shuts down 2026-06-01. Both services/gemini.js and services/vision.js must
// default to a non-deprecated model and read GEMINI_MODEL env override.
//
// Surfaced by scale-readiness-agent on 2026-05-28 (4-day cliff).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

describe('Gemini model guard — no deprecated model defaults', () => {
  const files = [
    'services/gemini.js',
    'services/vision.js',
  ];

  for (const rel of files) {
    it(`${rel} does not default to a deprecated Gemini model`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      // Allow comments to reference 'gemini-2.0-flash' (e.g. our shutdown note).
      // Find non-comment lines that reference it.
      const lines = src.split('\n');
      const offending = lines.filter((l, i) => {
        const trimmed = l.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
        return /['"]gemini-2\.0-flash['"]/.test(l);
      });
      expect(offending, `Found ${offending.length} live ref(s) to deprecated gemini-2.0-flash in ${rel}:\n${offending.join('\n')}`).toEqual([]);
    });

    it(`${rel} reads GEMINI_MODEL env var with a sensible default`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toMatch(/process\.env\.GEMINI_MODEL/);
      expect(src).toMatch(/gemini-2\.5-flash|gemini-1\.5/);
    });
  }
});
