import { describe, expect, it } from 'vitest';

import { themeCss } from './css';
import { COLORS, TYPE_SCALE } from './tokens';

/**
 * The stylesheet is generated from the tokens, so this asserts it carries every
 * one of them rather than a hand-picked subset. A token added to tokens.ts and
 * forgotten here would otherwise ship unstyled.
 */
describe('theme stylesheet', () => {
  const css = themeCss();

  it('emits every light token under :root', () => {
    const light = css.slice(0, css.indexOf("[data-theme='dark']"));
    for (const [token, value] of Object.entries(COLORS.light)) {
      expect(light).toContain(`--wc-${token}: ${value};`);
    }
  });

  it('emits every dark token under the dark selector', () => {
    const dark = css.slice(css.indexOf("[data-theme='dark']"));
    for (const [token, value] of Object.entries(COLORS.dark)) {
      expect(dark).toContain(`--wc-${token}: ${value};`);
    }
  });

  it('emits size, line height and weight for every type token', () => {
    for (const [token, type] of Object.entries(TYPE_SCALE)) {
      expect(css).toContain(`--wc-${token}-size: ${String(type.fontSizePx)}px;`);
      expect(css).toContain(`--wc-${token}-line: ${String(type.lineHeightPx)}px;`);
      expect(css).toContain(`--wc-${token}-weight: ${String(type.fontWeight)};`);
    }
  });

  it('ships both themes at once, so switching needs no stylesheet reload', () => {
    expect(css).toContain(':root {');
    expect(css).toContain(":root[data-theme='dark'] {");
  });
});
