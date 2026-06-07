#!/usr/bin/env node
/* One-time: unify the whole site onto the single Silver/Platinum theme.
 * Colours only — never touches layout/markup. Keeps the --gold variable NAME
 * (295 refs) but maps every warm/pillar value onto the canonical silver scale:
 *   --silver-bright #e8e8e8 · --silver-mid #c0c0c0 · --silver-dim #8a8a8a · --silver-faint #5a5a5a
 */
const fs = require('fs');
const path = require('path');

// Hex map (case-insensitive). Gold family + pillar accents → silver scale.
const HEX = {
  e8b84b: 'c0c0c0', c9a84c: 'c0c0c0', caa84b: 'c0c0c0', // gold primary
  f5d07a: 'e8e8e8', e0c068: 'e8e8e8', f3d27a: 'e8e8e8', f5d488: 'e8e8e8', // gold bright
  '8a6f31': '5a5a5a', // gold deep
  f0a500: 'c0c0c0', // orator orange
  b06fd8: 'c0c0c0', // aesthetic purple
  '3dbfa0': 'c0c0c0', // sage green
};
// rgb triplets (gold/pillar) → white, alpha preserved.
const RGB = ['232,184,75', '201,168,76', '240,165,0', '176,111,216', '61,191,160', '138,111,49'];

function convert(src) {
  let out = src;
  for (const [from, to] of Object.entries(HEX)) {
    out = out.replace(new RegExp('#' + from, 'gi'), '#' + to);
  }
  for (const trip of RGB) {
    const [r, g, b] = trip.split(',');
    // match rgb(a) with optional spaces around each component; rewrite r,g,b → 255,255,255, keep the rest
    const re = new RegExp('(rgba?\\(\\s*)' + r + '(\\s*,\\s*)' + g + '(\\s*,\\s*)' + b + '(\\s*[,)])', 'gi');
    out = out.replace(re, '$1255$2255$3255$4');
  }
  return out;
}

const targets = process.argv.slice(2);
let total = 0;
for (const f of targets) {
  const before = fs.readFileSync(f, 'utf8');
  const after = convert(before);
  if (before !== after) {
    fs.writeFileSync(f, after);
    // crude change count
    const n = before.split('').filter((c, i) => c !== after[i]).length;
    console.log(`  ✓ ${f}`);
    total++;
  }
}
console.log(`\n${total} files re-themed to silver.`);
