/**
 * lib/theme-head.js
 * Theme head fragment, injected into every page's <head> (see server.js servePage).
 *
 * The site ships a SINGLE theme: the dark Silver/Platinum-on-obsidian identity,
 * defined by each page's bare :root tokens. The previously opt-in LIGHT theme and
 * its floating ◐/◑ toggle were removed (founder, 2026-06-16) — dark is the only
 * theme. Dark token values were never defined here, so dark rendering is unchanged.
 *
 * This fragment now only pins data-theme="dark" before first paint, so:
 *   - any CSS/JS that keys off the attribute always sees dark, and
 *   - a stale localStorage('mc-theme'='light') left over from the old toggle is
 *     ignored (no light palette exists to apply, and nothing reads it anymore).
 */

// Pin dark before first paint. No light palette, no toggle, no localStorage read.
const BOOT = `<script>document.documentElement.setAttribute('data-theme','dark');</script>`;

/**
 * The full head fragment — dark-pin only.
 * @returns {string}
 */
function themeHead() {
  return BOOT;
}

module.exports = { themeHead };
