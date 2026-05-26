/* ════════════════════════════════════════════════════════════════
   Lookmaxxing PWA — shared client (Night-4, P2)
   Session/JWT helpers, authed fetch, bottom nav, install prompt, SW reg.
   Exposed on window.LM.
   ════════════════════════════════════════════════════════════════ */
(function () {
  const TOKEN_KEY = 'lookmax.token';
  const INSTALL_KEY = 'lookmax.installPromptDismissedAt';
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  /** Authed fetch against /api/lookmax/*. Returns the parsed JSON (or throws). */
  async function api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401) { clearToken(); location.href = '/lookmax/login'; throw new Error('unauthorized'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'request failed'), { status: res.status, data });
    return data;
  }

  /** Guard a page: redirect to login if there is no session. Returns the user. */
  async function requireSession() {
    if (!getToken()) { location.href = '/lookmax/login'; return null; }
    try {
      const me = await api('/api/lookmax/me');
      return me.user;
    } catch {
      return null;
    }
  }

  function logout() { clearToken(); location.href = '/lookmax/login'; }

  /** Render the sticky bottom nav into <nav class="nav" data-active="mirror">. */
  function renderNav(active) {
    const items = [
      { key: 'mirror', label: 'Mirror', ic: '◈', href: '/lookmax/mirror' },
      { key: 'protocol', label: 'Protocol', ic: '☰', href: '/lookmax/protocol' },
      { key: 'hair', label: 'Hair', ic: '⌃', href: '/lookmax/hair' },
      { key: 'reveal', label: 'Reveal', ic: '▷', href: '/lookmax/reveal' },
      { key: 'profile', label: 'Profile', ic: '◆', href: '/lookmax/' },
    ];
    const nav = document.createElement('nav');
    nav.className = 'nav';
    nav.innerHTML = items
      .map((i) => `<a href="${i.href}" class="${i.key === active ? 'active' : ''}"><span class="ic">${i.ic}</span>${i.label}</a>`)
      .join('');
    document.body.appendChild(nav);
  }

  /** PWA install prompt: gold ribbon, suppressed 7 days after dismiss. */
  let deferredPrompt = null;
  function initInstallPrompt() {
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    const dismissedAt = Number(localStorage.getItem(INSTALL_KEY) || 0);
    if (Date.now() - dismissedAt < SEVEN_DAYS) return;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showRibbon();
    });
  }
  function showRibbon() {
    if (document.querySelector('.install-ribbon')) return;
    const r = document.createElement('div');
    r.className = 'install-ribbon';
    r.innerHTML = 'Add to home screen &nbsp;→&nbsp; ◆ <span class="x">✕</span>';
    r.addEventListener('click', async (ev) => {
      if (ev.target.classList.contains('x')) { dismissRibbon(r); return; }
      if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; r.remove(); }
    });
    document.body.appendChild(r);
  }
  function dismissRibbon(r) { localStorage.setItem(INSTALL_KEY, String(Date.now())); r.remove(); }

  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/lookmax/sw.js').catch(() => {});
    }
  }

  // Auto-init shared chrome on DOM ready (pages opt out of nav via data-no-nav).
  document.addEventListener('DOMContentLoaded', () => {
    registerSW();
    initInstallPrompt();
  });

  window.LM = { api, getToken, setToken, clearToken, requireSession, logout, renderNav, escapeHtml };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
