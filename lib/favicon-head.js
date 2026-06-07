/**
 * lib/favicon-head.js
 * Site-wide favicon, injected into every page's <head> (see server.js servePage).
 *
 * The icons are the MainCharacter M-mark (public/maincharacter-mark.png) composited
 * onto the obsidian brand background, so the tab icon reads on both light and dark
 * browser chrome. Regenerate with the sharp script in the favicon commit if the mark
 * ever changes. /favicon.ico is handled by a redirect route in server.js.
 */

const FAVICON = [
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">',
  '<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
].join('');

/**
 * @returns {string} the favicon <link> tags for the page <head>.
 */
function faviconHead() {
  return FAVICON;
}

module.exports = { faviconHead };
