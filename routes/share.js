/**
 * ═══════════════════════════════════════════════════════════════════
 * SHARE — viral Aura Score cards (top-of-funnel growth engine)
 * ═══════════════════════════════════════════════════════════════════
 * Every reading produces a shareable, personalised card. When posted to
 * WhatsApp / Instagram / X, the link preview shows the score image + a CTA
 * back into the funnel — so each reading recruits new free visitors.
 *
 * PRIVACY: these endpoints are intentionally public (the point is sharing) but
 * expose ONLY the Aura Score (a number) + rank (a word). NEVER the photo, the
 * full report, the email, or any PII. The auditId is an unguessable UUID, and
 * per-user pages are noindex so we don't spawn thin SEO pages.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { createLogger } = require('../lib/log');

const log = createLogger('SHARE');
const router = express.Router();

const STORE_PATH =
  process.env.AUDIT_V2_STORE_PATH ||
  path.join(__dirname, '..', 'data', 'audit-sessions-v2.json');

const BASE_URL =
  process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';

/** Read-only peek at a session's report. Returns null on any failure (no throw). */
function _getReport(id) {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    const s = data[id];
    return s && s.geminiReport ? s.geminiReport : null;
  } catch {
    return null;
  }
}

function _clampScore(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** Sanitise rank to letters/spaces only — defeats SVG/HTML injection. */
function _safeRank(r) {
  if (!r || typeof r !== 'string') return '';
  const clean = r.replace(/[^A-Za-z ]/g, '').trim().slice(0, 24);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
}

function _escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Build the 1200×630 share card SVG (OG dimensions). Obsidian + gold, big serif
 * score numeral, a score arc, rank, and the brand mark. Score is int-clamped and
 * rank is letters-only, so all interpolation here is injection-safe.
 */
function buildShareSvg({ score, rank }) {
  const s = _clampScore(score);
  const r = _safeRank(rank);
  // Score arc: 270° sweep, fraction filled by score.
  const cx = 600, cy = 300, rad = 168;
  const startAngle = 135, sweep = 270;
  const frac = s / 100;
  const polar = (deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  const [bx, by] = polar(startAngle);
  const [ex, ey] = polar(startAngle + sweep);
  const [fx, fy] = polar(startAngle + sweep * frac);
  const largeTrack = sweep > 180 ? 1 : 0;
  const largeFill = sweep * frac > 180 ? 1 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="#1a1407"/>
      <stop offset="55%" stop-color="#0b0a08"/>
      <stop offset="100%" stop-color="#070708"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3d27a"/>
      <stop offset="100%" stop-color="#e8b84b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="600" y="92" text-anchor="middle" fill="#9a8f73" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="8">AURA  READING</text>
  <path d="M ${bx.toFixed(1)} ${by.toFixed(1)} A ${rad} ${rad} 0 ${largeTrack} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="#2a2620" stroke-width="10" stroke-linecap="round"/>
  <path d="M ${bx.toFixed(1)} ${by.toFixed(1)} A ${rad} ${rad} 0 ${largeFill} 1 ${fx.toFixed(1)} ${fy.toFixed(1)}" fill="none" stroke="url(#gold)" stroke-width="10" stroke-linecap="round"/>
  <text x="600" y="332" text-anchor="middle" fill="#f4f1ea" font-family="Georgia, 'Times New Roman', serif" font-size="184" font-style="italic">${s}</text>
  <text x="600" y="392" text-anchor="middle" fill="#9a8f73" font-family="Georgia, serif" font-size="24" letter-spacing="6">OUT OF 100</text>
  ${r ? `<text x="600" y="470" text-anchor="middle" fill="url(#gold)" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-style="italic">${r}</text>` : ''}
  <text x="600" y="566" text-anchor="middle" fill="#e8b84b" font-family="Georgia, serif" font-size="26" letter-spacing="3">&#9670; MAINCHARACTER</text>
  <text x="600" y="600" text-anchor="middle" fill="#6b6660" font-family="Georgia, serif" font-size="18" letter-spacing="2">maincharacter.digitglobalservices.com</text>
</svg>`;
}

// ─── GET /s/:id/card.png — the personalised share image ────────────────────────
router.get('/s/:id/card.png', async (req, res) => {
  const report = _getReport(req.params.id);
  const svg = buildShareSvg({
    score: report ? report.auraScore : 0,
    rank: report ? report.rank : '',
  });
  try {
    const sharp = require('sharp'); // eslint-disable-line global-require
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(png);
  } catch (err) {
    // sharp unavailable (some test/dev envs) → serve the SVG directly.
    log.warn('CARD', `png render failed, serving svg: ${err.message}`);
    res.set('Content-Type', 'image/svg+xml');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  }
});

// ─── GET /s/:id — the public share landing page (OG preview + CTA) ──────────────
router.get('/s/:id', (req, res) => {
  const id = req.params.id;
  const report = _getReport(id);
  const score = report ? _clampScore(report.auraScore) : null;
  const rank = report ? _safeRank(report.rank) : '';
  const cardUrl = `${BASE_URL}/s/${encodeURIComponent(id)}/card.png`;
  const title = score != null
    ? `Aura Score ${score}${rank ? ' — ' + rank : ''} · MainCharacter`
    : 'The Aura Reading · MainCharacter';
  const desc = 'One photo. Your presence, scored across the dimensions a room reads before you speak. See yours, free.';

  res.set('Content-Type', 'text/html; charset=utf-8');
  return res.send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${_escapeHtml(title)}</title>
<meta property="og:type" content="website">
<meta property="og:title" content="${_escapeHtml(title)}">
<meta property="og:description" content="${_escapeHtml(desc)}">
<meta property="og:image" content="${_escapeHtml(cardUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${_escapeHtml(BASE_URL + '/s/' + id)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${_escapeHtml(title)}">
<meta name="twitter:description" content="${_escapeHtml(desc)}">
<meta name="twitter:image" content="${_escapeHtml(cardUrl)}">
<style>
  :root{--obsidian:#070708;--gold:#e8b84b;--ink:#f4f1ea;--ink-dim:#9a8f73}
  *{box-sizing:border-box}
  body{margin:0;background:var(--obsidian);color:var(--ink);font-family:'Sora',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px}
  .card{max-width:520px;width:100%}
  .card img{width:100%;border-radius:14px;border:1px solid rgba(232,184,75,0.18);box-shadow:0 30px 90px rgba(0,0,0,0.6)}
  h1{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;font-size:1.5rem;color:var(--ink);margin:28px 0 6px}
  p{color:var(--ink-dim);font-size:0.98rem;line-height:1.6;margin:0 0 26px}
  a.cta{display:inline-block;background:linear-gradient(135deg,#f3d27a,#e8b84b);color:#070708;text-decoration:none;
    font-weight:600;padding:15px 30px;border-radius:999px;font-size:1rem;letter-spacing:0.01em}
  .mark{margin-top:34px;color:var(--gold);letter-spacing:0.18em;font-size:0.72rem}
</style>
</head><body>
  <div class="card">
    <img src="${_escapeHtml(cardUrl)}" alt="Aura Reading score card" width="1200" height="630">
    <h1>${score != null ? 'This is what the room sees.' : 'The room reads you before you speak.'}</h1>
    <p>${score != null ? 'One photo and five questions read your presence across the dimensions that decide how you land. The reading is free.' : _escapeHtml(desc)}</p>
    <a class="cta" href="/lookmaxing">Get your Aura Reading →</a>
    <div class="mark">&#9670; MAINCHARACTER</div>
  </div>
</body></html>`);
});

module.exports = router;
module.exports.buildShareSvg = buildShareSvg;
module.exports._safeRank = _safeRank;
module.exports._clampScore = _clampScore;
