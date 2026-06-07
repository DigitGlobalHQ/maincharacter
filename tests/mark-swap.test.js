/**
 * tests/mark-swap.test.js — global ◆→brand-mark runtime swap.
 */
import { describe, it, expect } from 'vitest';
const { markSwapHead } = require('../lib/mark-swap');

describe('markSwapHead()', () => {
  const h = markSwapHead();

  it('targets the ◆ glyph and swaps in the brand mark PNG', () => {
    expect(h).toContain('\\u25C6');                         // the diamond it replaces
    expect(h).toContain('/maincharacter-mark-3d.png');      // the transparent mark
    expect(h).toContain('img.mc-ico');                      // inline sizing class
  });

  it('never touches script/style/title text (would corrupt JS / CSS)', () => {
    expect(h).toContain("'SCRIPT'");
    expect(h).toContain("'STYLE'");
    expect(h).toContain("'TITLE'");
  });

  it('runs after load and re-runs to catch script-injected diamonds', () => {
    expect(h).toContain('DOMContentLoaded');
    expect(h).toContain('setTimeout(swap');
  });
});
