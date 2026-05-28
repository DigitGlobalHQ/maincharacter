/**
 * track.js — MainCharacter KPI client (B5)
 *
 * Exposes window.mc.track and window.mc.trackOnce.
 * No dependencies. Never throws. ≤80 LOC.
 * Loaded via <script src="/track.js" defer> in every instrumented page.
 */
(function () {
  'use strict';

  var DEBUG = (location.search || '').indexOf('mcdebug=1') !== -1;

  // ── Anonymous ID — persisted in localStorage, 32-byte hex, no PII ──
  function getAnonId() {
    try {
      var key = 'mc_anon_id';
      var id = localStorage.getItem(key);
      if (!id) {
        var buf = new Uint8Array(16);
        crypto.getRandomValues(buf);
        id = Array.from(buf).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
        localStorage.setItem(key, id);
      }
      return id;
    } catch (_) { return 'unknown'; }
  }

  // ── Core send ──
  function send(name, props) {
    try {
      var payload = JSON.stringify({ name: name, props: props || {}, anonId: getAnonId() });
      // sendBeacon is preferred: survives page unload (e.g. paywall_cta_clicked → redirect)
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/events', blob);
      } else {
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(function () {});
      }
      if (DEBUG) { console.log('[mc]', name, props); }
    } catch (_) { /* swallow — tracking must never break the page */ }
  }

  // ── track(name, props) — standard emit ──
  function track(name, props) {
    send(name, props);
  }

  // ── trackOnce(name, props, key) — dedupe within the tab via sessionStorage ──
  // Use for events like paywall_viewed that should fire once per tab, not on scroll.
  function trackOnce(name, props, key) {
    try {
      var storageKey = 'mc_once_' + (key || name);
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
      send(name, props);
    } catch (_) { send(name, props); /* fallback: always send if sessionStorage fails */ }
  }

  // ── data-event delegation ──
  // Any element with data-event="event_name" fires on click.
  // Optional data-event-props='{"key":"value"}' for properties.
  document.addEventListener('click', function (e) {
    var el = e.target;
    // Walk up to 3 ancestors to find a data-event attribute
    for (var i = 0; i < 3 && el; i++) {
      var evtName = el.getAttribute && el.getAttribute('data-event');
      if (evtName) {
        var rawProps = el.getAttribute('data-event-props');
        var props = {};
        if (rawProps) {
          try { props = JSON.parse(rawProps); } catch (_) {}
        }
        track(evtName, props);
        break;
      }
      el = el.parentElement;
    }
  }, true);

  // ── Expose global ──
  window.mc = window.mc || {};
  window.mc.track = track;
  window.mc.trackOnce = trackOnce;
}());
