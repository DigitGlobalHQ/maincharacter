#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * scripts/verify-r2-roundtrip.js — end-to-end R2 health check
 * ═══════════════════════════════════════════════════════════════════
 *
 * FOUNDER ACTION — run after R2 env vars are confirmed set in Render:
 *
 *   node scripts/verify-r2-roundtrip.js
 *
 * (On Render free tier, trigger via the Render Shell tab, or add a
 *  one-off job that runs this script and check the logs.)
 *
 * What it does:
 *   1. Generates a minimal valid 1x1 PNG in memory (no fixture file needed).
 *   2. Calls storage.put('verify/roundtrip-{ts}.png', buffer, 'image/png')
 *   3. Calls storage.getSignedUrl(key, 60) — gets a 60s presigned URL
 *   4. Fetches the presigned URL with the built-in fetch API (Node 18+)
 *      and confirms HTTP 200 + content-length matches the uploaded bytes
 *   5. Calls storage.delete(key) — confirms 204 / true
 *   6. Prints PASS or FAIL with the step that failed.
 *
 * Exit codes:
 *   0 — all steps passed
 *   1 — one or more steps failed (or R2 env vars not set)
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

require('dotenv').config();

// ── 1. Verify R2 env vars are present ───────────────────────────────────────

const REQUIRED_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  console.error('');
  console.error('  ERROR: R2 env vars not set:', missing.join(', '));
  console.error('  Set them in the Render dashboard and redeploy, then run this script again.');
  console.error('');
  process.exit(1);
}

// ── 2. Minimal 1×1 white PNG buffer (spec-correct, no deps) ─────────────────
//
//  PNG structure:
//    8-byte signature
//    IHDR chunk  (image header — 13 bytes of data)
//    IDAT chunk  (compressed image data)
//    IEND chunk  (end marker)
//
//  We construct this manually using Node's zlib for the IDAT deflate.
//  The CRC on each chunk is computed with Node's crypto.createHash('crc32')
//  workaround — crc32 isn't in core, so we use a simple table-based impl.

const zlib = require('zlib');

/** CRC-32 table (IEEE 802.3 polynomial). */
function makeCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf, crc = 0xffffffff) {
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng1x1() {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR: width=1, height=1, bitDepth=8, colorType=2 (RGB), no interlace
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(1, 0);  // width
  ihdr.writeUInt32BE(1, 4);  // height
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter byte 0x00 + 3 bytes RGB (white: 0xff, 0xff, 0xff)
  const rawRow = Buffer.from([0x00, 0xff, 0xff, 0xff]);
  const compressed = zlib.deflateSync(rawRow);

  // IEND: empty
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', iend),
  ]);
}

const PNG_BUFFER = makePng1x1();

// ── 3. Round-trip ────────────────────────────────────────────────────────────

const storage = require('../services/storage');

async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  MainCharacter — R2 round-trip verification');
  console.log('═'.repeat(60));
  console.log(`  Bucket : ${process.env.R2_BUCKET}`);

  const ts = Date.now();
  const key = `verify/roundtrip-${ts}.png`;
  const uploadBytes = PNG_BUFFER.byteLength;

  let passed = 0;
  let failed = 0;
  const fail = (step, detail) => { failed++; console.error(`  ✗ FAIL [${step}] — ${detail}`); };
  const pass = (step, detail) => { passed++; console.log(`  ✓ PASS [${step}] — ${detail}`); };

  // STEP 1 — put()
  console.log('');
  console.log(`  [1/4] PUT  ${key} (${uploadBytes} bytes)`);
  let putResult;
  try {
    putResult = await storage.put(key, PNG_BUFFER, 'image/png');
    if (putResult.key === key) {
      pass('put', `stored at ${key}`);
    } else if (putResult.dryRun) {
      fail('put', 'DRY-RUN returned — R2 env vars not working (check credentials)');
      printSummary(passed, failed);
      process.exit(1);
    } else {
      fail('put', `unexpected result: ${JSON.stringify(putResult)}`);
    }
  } catch (err) {
    fail('put', err.message);
    printSummary(passed, failed);
    process.exit(1);
  }

  // STEP 2 — getSignedUrl()
  console.log(`  [2/4] GET  signed URL (60s TTL)`);
  let signedUrl;
  try {
    signedUrl = await storage.getSignedUrl(key, 60);
    if (signedUrl && signedUrl.startsWith('https://')) {
      pass('getSignedUrl', signedUrl.slice(0, 80) + '...');
    } else {
      fail('getSignedUrl', `did not return a valid HTTPS URL: ${signedUrl}`);
    }
  } catch (err) {
    fail('getSignedUrl', err.message);
  }

  // STEP 3 — fetch() the signed URL
  if (signedUrl) {
    console.log(`  [3/4] FETCH signed URL`);
    try {
      const resp = await fetch(signedUrl);
      if (resp.status === 200) {
        const body = await resp.arrayBuffer();
        const downloadBytes = body.byteLength;
        if (downloadBytes === uploadBytes) {
          pass('fetch', `HTTP 200, ${downloadBytes} bytes (matches upload)`);
        } else {
          fail('fetch', `HTTP 200 but size mismatch — uploaded ${uploadBytes}B, got ${downloadBytes}B`);
        }
      } else {
        fail('fetch', `HTTP ${resp.status} — expected 200`);
      }
    } catch (err) {
      fail('fetch', err.message);
    }
  } else {
    fail('fetch', 'skipped — no signed URL from step 2');
  }

  // STEP 4 — delete()
  console.log(`  [4/4] DELETE ${key}`);
  try {
    const deleted = await storage.delete(key);
    if (deleted) {
      pass('delete', 'object removed');
    } else {
      fail('delete', 'storage.delete() returned false');
    }
  } catch (err) {
    fail('delete', err.message);
  }

  printSummary(passed, failed);
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary(passed, failed) {
  console.log('');
  const total = passed + failed;
  if (failed === 0) {
    console.log(`  ◆ R2 ROUND-TRIP: PASS — ${passed}/${total} steps succeeded`);
  } else {
    console.error(`  ✗ R2 ROUND-TRIP: FAIL — ${failed}/${total} steps failed`);
  }
  console.log('═'.repeat(60));
  console.log('');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
