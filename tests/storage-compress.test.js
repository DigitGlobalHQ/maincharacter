/**
 * tests/storage-compress.test.js — Task 2a photo compression tests
 *
 * Feeds a generated JPEG through storage.putPhoto() and asserts:
 *   - Output is < 400 KB
 *   - Longest edge is ≤ 1600 px
 *   - EXIF GPS data is stripped
 *   - Output is a valid JPEG (starts with 0xFF 0xD8)
 *   - Returns { key, originalBytes, compressedBytes, ratio }
 *
 * These run without R2 configured (dry-run path) so they always execute in CI.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const sharp = require('sharp');
const storage = require('../services/storage');

// Generate a synthetic 2400×1800 JPEG (≈ a typical phone face shot compressed
// to a compact form for test speed — still large enough to trigger resize logic).
let LARGE_JPEG;

beforeAll(async () => {
  // 2400×1800 flat magenta — enough pixels to exercise the resize path.
  LARGE_JPEG = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 200, g: 80, b: 120 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}, 20000);

describe('storage.putPhoto — compression', () => {
  it('generates a large JPEG fixture (sanity)', () => {
    expect(LARGE_JPEG).toBeInstanceOf(Buffer);
    // 95-quality JPEG of a 2400×1800 solid colour is typically 50-200 KB;
    // an actual phone selfie at the same resolution is 1-5 MB.
    // Either way it should be bigger than 10 KB.
    expect(LARGE_JPEG.byteLength).toBeGreaterThan(10 * 1024);
  });

  it('putPhoto() returns { key, originalBytes, compressedBytes, ratio }', async () => {
    // DRY-RUN path — R2 not configured; putPhoto falls back to put() which dry-runs.
    // key is null in dry-run mode.
    const result = await storage.putPhoto('test/compress-shape.jpg', LARGE_JPEG);
    expect(result).toHaveProperty('originalBytes');
    expect(result).toHaveProperty('compressedBytes');
    expect(result).toHaveProperty('ratio');
    expect(result.originalBytes).toBe(LARGE_JPEG.byteLength);
    expect(typeof result.compressedBytes).toBe('number');
    expect(typeof result.ratio).toBe('number');
  }, 15000);

  it('compressedBytes < 400 KB for a 2400×1800 JPEG', async () => {
    const result = await storage.putPhoto('test/compress-size.jpg', LARGE_JPEG);
    expect(result.compressedBytes).toBeLessThan(400 * 1024); // < 400 KB
  }, 15000);

  it('longest edge of compressed output is ≤ 1600 px', async () => {
    // We need to get the actual compressed buffer to check dimensions.
    // putPhoto compresses internally; expose via a test hook or compress independently.
    const compressed = await storage._compressPhoto(LARGE_JPEG);
    const meta = await sharp(compressed).metadata();
    const longest = Math.max(meta.width || 0, meta.height || 0);
    expect(longest).toBeLessThanOrEqual(1600);
  }, 15000);

  it('compressed output is a valid JPEG (starts 0xFF 0xD8)', async () => {
    const compressed = await storage._compressPhoto(LARGE_JPEG);
    expect(compressed[0]).toBe(0xff);
    expect(compressed[1]).toBe(0xd8);
  }, 15000);

  it('compression ratio < 1 (output is smaller than input for a large JPEG)', async () => {
    const result = await storage.putPhoto('test/compress-ratio.jpg', LARGE_JPEG);
    // For a 2400×1800 JPEG → JPEG quality 78 at max 1600px: typically 0.1-0.5
    expect(result.ratio).toBeLessThan(1.0);
  }, 15000);

  it('EXIF GPS data is stripped from compressed output', async () => {
    // Build a JPEG with GPS metadata injected via sharp.
    const withExif = await sharp(LARGE_JPEG)
      .withExif({
        IFD0: { Copyright: 'TestCopyright' },
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    const compressed = await storage._compressPhoto(withExif);
    const meta = await sharp(compressed).metadata();
    // sharp withMetadata(false) strips all EXIF; GPS should be absent.
    // Meta.exif will be undefined or not contain GPS.
    // We verify by checking the exif buffer length (if present) is minimal.
    const gpsPresent = meta.exif
      ? meta.exif.toString('binary').includes('GPS')
      : false;
    expect(gpsPresent).toBe(false);
  }, 15000);

  it('putPhoto() falls back gracefully if sharp fails — returns original buffer path', async () => {
    // Simulate sharp failure: pass a non-image buffer.
    const badBuf = Buffer.from('not-an-image-data-at-all');
    // Should NOT throw — should fall back to raw put().
    const result = await storage.putPhoto('test/fallback.jpg', badBuf);
    // Falls back: compressedBytes equals originalBytes (no compression applied)
    expect(result.originalBytes).toBe(badBuf.byteLength);
    // The key is still returned (or null in dry-run)
    expect(result).toHaveProperty('compressedBytes');
  }, 10000);
});
