/**
 * lib/favicon-head.js
 * Site-wide favicon, injected into every page's <head> (see server.js servePage).
 *
 * The icons are the MainCharacter M-mark (public/maincharacter-mark.png) on a
 * TRANSPARENT background — the bare mark, no box — so the tab icon blends with the
 * browser chrome. Regenerate with the sharp script in the favicon commit if the mark
 * changes.
 *
 * IMPORTANT — cache-busting: browsers cache favicons by URL very aggressively. When
 * the icon *contents* change, BUMP `VERSION` so the href changes and the browser is
 * forced to re-fetch (otherwise it keeps serving the stale cached icon). /favicon.ico
 * is a 302 (not 301 — 301 is cached permanently) to the versioned PNG in server.js.
 */

const VERSION = '3'; // bump whenever the favicon image changes

const FAVICON = [
  `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=${VERSION}">`,
  `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png?v=${VERSION}">`,
  `<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png?v=${VERSION}">`,
  `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${VERSION}">`,
].join('');

/**
 * @returns {string} the favicon <link> tags for the page <head>.
 */
function faviconHead() {
  return FAVICON;
}

module.exports = { faviconHead, VERSION };
