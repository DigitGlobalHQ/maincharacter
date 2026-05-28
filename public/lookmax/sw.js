/**
 * Lookmaxxing PWA service worker (Night-4, P2.3).
 *
 * Cache-first for the app shell (HTML pages, icons, manifest) so the ritual
 * opens instantly and offline. Network-first with a cache fallback for
 * /api/lookmax/* so data stays fresh but a flaky connection still renders.
 *
 * Bump CACHE_VERSION on any shell change to invalidate old caches.
 */

const CACHE_VERSION = 'lookmax-v1';
const SHELL = [
  '/lookmax/',
  '/lookmax/index.html',
  '/lookmax/login.html',
  '/lookmax/admin-login.html',
  '/lookmax/mirror.html',
  '/lookmax/protocol.html',
  '/lookmax/hair.html',
  '/lookmax/reveal.html',
  '/lookmax/manifest.json',
  '/lookmax/icons/icon-192.png',
  '/lookmax/icons/icon-512.png',
  '/lookmax/icons/maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // B5: /api/events is network-only — never cache telemetry calls.
  if (url.pathname === '/api/events') return;

  // Network-first for the Lookmaxxing API (fresh data, cache as fallback).
  if (url.pathname.startsWith('/api/lookmax/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Cache-first for the shell + icons + manifest.
  if (url.pathname.startsWith('/lookmax/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok && url.pathname.startsWith('/lookmax/')) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return res;
        });
      })
    );
  }
});
