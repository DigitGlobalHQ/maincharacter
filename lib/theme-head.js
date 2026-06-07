/**
 * lib/theme-head.js
 * Light-mode support, injected into every page's <head> (see server.js servePage).
 *
 * The whole site ships dark by default (the luxury Silver/Platinum-on-obsidian
 * identity). This adds an opt-in LIGHT theme:
 *   - a no-flash boot script sets <html data-theme> before first paint, from
 *     localStorage('mc-theme') or the visitor's prefers-color-scheme;
 *   - a single :root[data-theme="light"] block re-points every COLOUR token
 *     (both the inline-page `--*` set and the shared tokens.css `--mc-*` set) to a
 *     designed light palette — graphite/ink on warm ivory, NOT a naive invert;
 *   - a small fixed toggle (◐/◑) lets users switch; choice persists.
 *
 * Dark values are never redefined here, so dark mode is byte-identical. Spacing /
 * font / radius / duration tokens are untouched — colour only.
 */

// One place to read the palette in tests.
const LIGHT_VARS = [
  // ── surfaces (obsidian → warm ivory paper) ──
  '--obsidian:#f3f1ec', '--bg:#f3f1ec', '--bg-2:#ece9e2',
  '--panel:#ffffff', '--surface:#ffffff', '--surface-2:#f6f4ef', '--surface-3:#efece5',
  '--bg-card:#ffffff', '--bg-card2:#f6f4ef',
  // ── ink (near-white text → near-black ink) ──
  '--ink:#16161a', '--text:#16161a', '--ink-dim:#55534d', '--text-dim:#55534d',
  '--ink-faint:#8a877f', '--text-faint:#8a877f', '--ink-ghost:#bdb9b0', '--muted:#6a6a70',
  // short-name aliases used by tools.css / older surfaces (else dark text + dark cards on ivory)
  '--dim:#55534d', '--faint:#8a877f', '--panel2:#f6f4ef',
  // ── hairlines ──
  '--line:rgba(20,18,16,.12)', '--line-2:rgba(20,18,16,.18)', '--line-3:rgba(20,18,16,.07)',
  '--border:#e4e1d9', '--silver-ghost:#e4e1d9', '--ghost:#e4e1d9',
  // ── silver/accent (luminance inverts: brightest emphasis → darkest) ──
  '--silver-bright:#16161a', '--silver-mid:#3a3a40', '--silver-dim:#6a6a70', '--silver-faint:#9a978f',
  '--gold:#3a3a40', '--gold-bright:#16161a', '--gold-deep:#9a978f',
  '--gold-glow:rgba(20,18,16,.12)', '--gold-dim:rgba(20,18,16,.10)', '--gold-subtle:rgba(20,18,16,.04)',
  '--primary:#16161a', '--char:#3a3a40', '--char-2:#6a6a70',
  '--silver-gradient:linear-gradient(180deg,#16161a 0%,#3a3a40 48%,#6a6a70 100%)',
  // ── glowing light-point → soft dark shadow ──
  '--light-point:#16161a', '--light-point-glow-soft:rgba(20,18,16,.10)',
  '--light-point-glow-mid:rgba(20,18,16,.16)', '--light-point-glow-hot:rgba(20,18,16,.24)',
  '--point:#16161a', '--point-glow:rgba(20,18,16,.24)',
  // ── ambient aubergine/pillar glows → near-off on light ──
  '--aubergine:rgba(150,120,160,.05)', '--aubergine-glow:rgba(150,120,160,.05)',
  '--orator-glow:rgba(20,18,16,.10)', '--aesthetic-glow:rgba(20,18,16,.10)', '--sage-glow:rgba(20,18,16,.10)',
  // ── WhatsApp demo chat → WhatsApp's own light theme ──
  '--wa-bg:#efeae2', '--wa-panel:#f7f5f0', '--wa-bubble-in:#ffffff', '--wa-bubble-out:#d9fdd3',
  '--wa-text:#111b21', '--wa-text-dim:#667781', '--wa-green:#1f8a55',
  // ── shared tokens.css (--mc-*) for the 27 lookmaxing/lookmax pages ──
  '--mc-black:#f3f1ec', '--mc-near-black:#ffffff', '--mc-ink-white:#16161a',
  '--mc-ink-dim:#55534d', '--mc-ink-faint:#8a877f', '--mc-ink-ghost:#bdb9b0',
  '--mc-line:rgba(20,18,16,.12)', '--mc-line-bright:rgba(20,18,16,.20)', '--mc-line-strong:rgba(20,18,16,.30)',
  '--mc-gold:#3a3a40', '--mc-gold-dim:#6a6a70', '--mc-gold-glow:rgba(20,18,16,.12)', '--mc-gold-line:rgba(20,18,16,.18)',
  '--mc-silver-bright:#16161a', '--mc-silver-mid:#3a3a40', '--mc-silver-dim:#6a6a70',
  '--mc-silver-faint:#9a978f', '--mc-silver-ghost:#e4e1d9',
  '--mc-silver-gradient:linear-gradient(180deg,#16161a 0%,#3a3a40 48%,#6a6a70 100%)',
  '--mc-silver-gradient-h:linear-gradient(90deg,#16161a,#3a3a40,#6a6a70)',
  '--mc-light-point:#16161a', '--mc-light-point-glow-soft:rgba(20,18,16,.10)',
  '--mc-light-point-glow-mid:rgba(20,18,16,.16)', '--mc-light-point-glow-hot:rgba(20,18,16,.24)',
  '--mc-shadow-ambient:0 1px 0 rgba(20,18,16,.04)', '--mc-shadow-elevated:0 8px 30px rgba(20,18,16,.10)',
  '--mc-shadow-light-point:0 0 30px rgba(20,18,16,.12)',
  '--mc-elev-1:0 1px 2px rgba(20,18,16,.06)', '--mc-elev-2:0 8px 30px rgba(20,18,16,.10)',
];

// No-flash boot: must run before first paint, so it is the FIRST thing injected.
const BOOT = `<script>(function(){try{var k='mc-theme',s=localStorage.getItem(k),m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.setAttribute('data-theme',s||(m?'light':'dark'));}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>`;

const STYLE = `<style id="mc-theme">:root[data-theme="light"]{${LIGHT_VARS.join(';')}}
.mc-theme-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font:600 17px/1 system-ui,sans-serif;background:var(--panel,#0d0d0f);color:var(--ink,#f4f1ea);border:1px solid var(--line,#1d1d20);box-shadow:0 2px 14px rgba(0,0,0,.28);transition:transform .15s ease,background .3s ease,color .3s ease,border-color .3s ease}
.mc-theme-toggle:hover{transform:translateY(-1px)}
.mc-theme-toggle:focus-visible{outline:2px solid var(--silver-mid,#c0c0c0);outline-offset:2px}
@media print{.mc-theme-toggle{display:none}}</style>`;

// Toggle control: built after DOMContentLoaded so document.body exists.
const TOGGLE = `<script>document.addEventListener('DOMContentLoaded',function(){try{var k='mc-theme',r=document.documentElement,b=document.createElement('button');b.className='mc-theme-toggle';b.type='button';function cur(){return r.getAttribute('data-theme')==='light'?'light':'dark'}function paint(){var l=cur()==='light';b.textContent=l?'\\u25D1':'\\u25D0';var t=l?'Switch to dark mode':'Switch to light mode';b.setAttribute('aria-label',t);b.title=t}b.addEventListener('click',function(){var n=cur()==='light'?'dark':'light';r.setAttribute('data-theme',n);try{localStorage.setItem(k,n)}catch(e){}paint()});paint();document.body.appendChild(b)}catch(e){}});</script>`;

/**
 * The full head fragment. BOOT first (pre-paint), then STYLE, then TOGGLE.
 * @returns {string}
 */
function themeHead() {
  return BOOT + STYLE + TOGGLE;
}

module.exports = { themeHead, LIGHT_VARS };
