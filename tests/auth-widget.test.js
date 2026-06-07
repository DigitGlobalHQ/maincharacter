/**
 * tests/auth-widget.test.js
 * Global account control: signed-out (Sign In/Up), signed-in (name → Sign Out),
 * wired to the real session + endpoints, and de-duped against existing nav links.
 */
import { describe, it, expect } from 'vitest';

const { authWidgetHead } = require('../lib/auth-widget');

describe('authWidgetHead()', () => {
  const h = authWidgetHead();

  it('reads the real session token and identity endpoint', () => {
    expect(h).toContain("'lookmax.token'");
    expect(h).toContain('/api/lookmax/me');
    expect(h).toContain('Authorization');
    expect(h).toContain('d.user.name'); // uses the name the /me endpoint returns
  });

  it('signed-out shows Sign In + Sign Up pointing at the real routes', () => {
    expect(h).toContain('Sign In');
    expect(h).toContain('Sign Up');
    expect(h).toContain("'/lookmaxing/start'"); // sign in
    expect(h).toContain("'/lookmaxing'");       // sign up (the reading funnel)
  });

  it('signed-in exposes Sign Out which clears the token + hits logout', () => {
    expect(h).toContain('Sign Out');
    expect(h).toContain('/api/lookmax/auth/logout');
    expect(h).toContain("localStorage.removeItem(K)");
  });

  it('handles an expired token (401/403) by signing out', () => {
    expect(h).toMatch(/401|403/);
  });

  it('de-dupes: hides the existing in-nav auth links', () => {
    expect(h).toContain('#nav-auth-link');
    expect(h).toContain('#lm-nav-auth');
    expect(h).toContain('.nav__auth-link');
  });

  it('escapes the rendered name (no raw injection of user data)', () => {
    expect(h).toContain('function esc(');
    expect(h).toContain('esc(name)');
  });

  it('built on tokens so it flips with light mode, hidden in print', () => {
    expect(h).toContain('var(--ink');
    expect(h).toContain('var(--panel');
    expect(h).toContain('@media print{.mc-auth{display:none}}');
  });
});
