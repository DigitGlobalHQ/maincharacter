/**
 * tests/storage-r2.test.js — R2 storage interface tests (B0)
 *
 * Skipped when R2 env vars are absent (local dev / CI without R2).
 * When R2 is configured: exercises put/getSignedUrl/delete on a test/ key prefix
 * to avoid polluting production data.
 *
 * Fallback interface (saveImage) is also exercised for the dry-run path.
 */

import { describe, it, expect, afterAll } from 'vitest';

const HAS_R2 = !!(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET
);

const storage = require('../services/storage');

// ── Always-run: dry-run / key-helper tests ──────────────────────────────────

describe('storage — key helpers (B0)', () => {
  it('auditBaselineKey produces the canonical path', () => {
    expect(storage.auditBaselineKey('tok123', 'front')).toBe('audit/tok123/baseline-front.jpg');
    expect(storage.auditBaselineKey('tok123', 'side')).toBe('audit/tok123/baseline-side.jpg');
    expect(storage.auditBaselineKey('tok123', 'body')).toBe('audit/tok123/baseline-body.jpg');
  });

  it('mirrorKey produces the canonical path', () => {
    expect(storage.mirrorKey('tokABC', '2026-05-28')).toBe('mirror/tokABC/2026-05-28.jpg');
  });

  it('hairKey produces the canonical path', () => {
    expect(storage.hairKey('tokXYZ', '2026-06-01')).toBe('hair/tokXYZ/2026-06-01.jpg');
  });
});

describe('storage — dry-run when R2 env absent', () => {
  const origAccountId = process.env.R2_ACCOUNT_ID;

  it('put() returns { key: null, dryRun: true } when R2 not configured', async () => {
    // Temporarily clear config to force dry-run
    delete process.env.R2_ACCOUNT_ID;
    // Reset internal S3 client cache
    const buf = Buffer.from('test');
    const result = await storage.put('test/probe.jpg', buf);
    expect(result.key).toBeNull();
    expect(result.dryRun).toBe(true);
    // Restore
    if (origAccountId) process.env.R2_ACCOUNT_ID = origAccountId;
  });

  it('getSignedUrl() returns null when R2 not configured', async () => {
    delete process.env.R2_ACCOUNT_ID;
    const url = await storage.getSignedUrl('test/probe.jpg');
    expect(url).toBeNull();
    if (origAccountId) process.env.R2_ACCOUNT_ID = origAccountId;
  });

  it('delete() returns false when R2 not configured', async () => {
    delete process.env.R2_ACCOUNT_ID;
    const ok = await storage.delete('test/probe.jpg');
    expect(ok).toBe(false);
    if (origAccountId) process.env.R2_ACCOUNT_ID = origAccountId;
  });

  it('saveImage() falls back to local when R2 not configured', async () => {
    delete process.env.R2_ACCOUNT_ID;
    const result = await storage.saveImage({ buffer: Buffer.from('fake'), mimeType: 'image/jpeg', prefix: 'test' });
    expect(result.backend).toBe('local');
    expect(result.storageKey).toMatch(/^local:/);
    if (origAccountId) process.env.R2_ACCOUNT_ID = origAccountId;
  });
});

// ── R2 live tests — only when credentials present ─────────────────────────────

const testKey = `test/vitest-probe-${Date.now()}.jpg`;
const testBuffer = Buffer.from('vitest-r2-probe-data');

describe.skipIf(!HAS_R2)('storage — R2 live (B0)', () => {
  it('put() stores an object and returns a non-null key', async () => {
    const result = await storage.put(testKey, testBuffer, 'image/jpeg');
    expect(result.key).toBe(testKey);
    expect(result.dryRun).toBeFalsy();
  }, 15000);

  it('getSignedUrl() returns a presigned URL string', async () => {
    const url = await storage.getSignedUrl(testKey, 60);
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https?:\/\//);
  }, 15000);

  it('isR2Configured() returns true', () => {
    expect(storage.isR2Configured()).toBe(true);
  });

  afterAll(async () => {
    // Clean up the test object
    await storage.delete(testKey);
  }, 15000);
});
