/**
 * Generate the Lookmaxxing PWA icons (Night-4, P2.4) with zero dependencies.
 *
 * sharp is a lazy/native dep that may not build on Render, so we hand-roll a
 * tiny PNG encoder (zlib is built in) and rasterise the brand mark directly:
 * obsidian background (#070708), a gold ◆ (#e8b84b), and a gold frame. The
 * maskable variant uses extra safe-area padding so the diamond survives the crop.
 *
 * Run:  node scripts/gen-icons.js   → writes public/lookmax/icons/*.png
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OBSIDIAN = [7, 7, 8];
const GOLD = [232, 184, 75];

// ── minimal PNG encoder (RGBA, 8-bit) ──
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // 10,11,12 = compression, filter, interlace = 0

  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
      raw[o++] = a == null ? 255 : a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size, { diamondFactor, frame }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * diamondFactor;
  const inset = size * 0.08;
  const thick = Math.max(2, size * 0.012);

  return encodePng(size, size, (x, y) => {
    // gold diamond
    if (Math.abs(x - cx) + Math.abs(y - cy) <= r) return GOLD;
    // gold frame (skipped for maskable to keep the safe area clear)
    if (frame) {
      const onV =
        ((x >= inset && x < inset + thick) || (x <= size - inset && x > size - inset - thick)) &&
        y >= inset &&
        y <= size - inset;
      const onH =
        ((y >= inset && y < inset + thick) || (y <= size - inset && y > size - inset - thick)) &&
        x >= inset &&
        x <= size - inset;
      if (onV || onH) return GOLD;
    }
    return OBSIDIAN;
  });
}

const outDir = path.join(__dirname, '..', 'public', 'lookmax', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192, opts: { diamondFactor: 0.34, frame: true } },
  { name: 'icon-512.png', size: 512, opts: { diamondFactor: 0.34, frame: true } },
  { name: 'maskable.png', size: 512, opts: { diamondFactor: 0.26, frame: false } },
];

for (const t of targets) {
  const png = makeIcon(t.size, t.opts);
  fs.writeFileSync(path.join(outDir, t.name), png);
  console.log(`wrote ${t.name} (${t.size}px, ${png.length} bytes)`);
}
