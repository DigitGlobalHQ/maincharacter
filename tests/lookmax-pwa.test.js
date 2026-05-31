import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.join(__dirname, '..', 'public', 'lookmax');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

describe('PWA manifest', () => {
  const manifest = JSON.parse(read('manifest.json'));
  it('parses and declares standalone display + start_url', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/lookmax/');
    expect(manifest.background_color).toBe('#070708');
  });
  it('references three icons including a maskable one', () => {
    expect(manifest.icons.length).toBe(3);
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.map((i) => i.sizes)).toContain('512x512');
  });
});

describe('service worker', () => {
  const sw = read('sw.js');
  it('is syntactically valid JS', () => {
    // Compile without executing (top-level uses `self`, undefined in node).
    expect(() => new Function(sw)).not.toThrow();
  });
  it('declares a bumpable cache version and caches the shell', () => {
    expect(sw).toMatch(/CACHE_VERSION\s*=\s*'lookmax-v\d+'/);
    expect(sw).toContain('/lookmax/mirror.html');
    expect(sw).toContain('/api/lookmax/'); // network-first branch
  });
  it('serves HTML navigations network-first so the auth shell never staleboxes', () => {
    // Regression: a cache-first shell trapped the requireSession login redirect,
    // leaving returning users on a blank dashboard. Navigations must hit network.
    expect(sw).toMatch(/request\.mode === 'navigate'/);
    expect(sw).toContain("includes('text/html')");
    expect(sw).toMatch(/isNavigation/);
  });
});

describe('PWA icons', () => {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  for (const f of ['icon-192.png', 'icon-512.png', 'maskable.png']) {
    it(`${f} exists and is a valid PNG`, () => {
      const buf = fs.readFileSync(path.join(dir, 'icons', f));
      expect(buf.length).toBeGreaterThan(100);
      expect(buf.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    });
  }
});

describe('shared client (app.js) install prompt', () => {
  const app = read('app.js');
  it('suppresses the install ribbon for 7 days after dismissal', () => {
    expect(app).toContain('lookmax.installPromptDismissedAt');
    expect(app).toContain('SEVEN_DAYS');
    expect(app).toContain('beforeinstallprompt');
    expect(app).toContain("matchMedia('(display-mode: standalone)')");
  });
  it('stores the JWT under lookmax.token and registers the SW', () => {
    expect(app).toContain("'lookmax.token'");
    expect(app).toContain("navigator.serviceWorker.register('/lookmax/sw.js')");
  });
});

describe('PWA pages exist and link the shared shell', () => {
  for (const f of ['index.html', 'login.html', 'admin-login.html', 'mirror.html', 'protocol.html', 'hair.html', 'reveal.html']) {
    it(`${f} links app.css + app.js and the manifest`, () => {
      const html = read(f);
      expect(html).toContain('/lookmax/app.css');
      expect(html).toContain('/lookmax/app.js');
      expect(html).toContain('/lookmax/manifest.json');
    });
  }
});
