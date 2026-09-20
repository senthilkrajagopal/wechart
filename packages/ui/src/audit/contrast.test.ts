import { describe, expect, it } from 'vitest';

import {
  MIN_FONT_SIZE_PX,
  auditContrastPairs,
  auditFontSizes,
  contrastRatio,
  requiredRatio,
} from './contrast';

/**
 * AC-004: THE SYSTEM SHALL render every text node at a computed font size of at
 * least 12 px. AC-005: THE SYSTEM SHALL meet WCAG AA contrast for text in both
 * themes: at least 4.5:1, or 3:1 for text of at least 18.66 px bold or 24 px.
 *
 * This file tests the audit itself — that it can detect a violation. The audit
 * is worthless if it cannot fail, so every case below feeds it something bad
 * and asserts it says so. tokens.test.ts then runs it over the real tokens.
 */
describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#76746f', '#76746f')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#1f6f86', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#1f6f86'),
      10,
    );
  });

  it('accepts three-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 2);
  });

  it('weights the channels, so it is not merely measuring lightness', () => {
    // Every grey-on-grey assertion is invariant to the luminance coefficients,
    // so swapping or equalising them would leave those tests passing. Pure
    // channels against black pin 0.2126 / 0.7152 / 0.0722 individually.
    expect(contrastRatio('#ff0000', '#000000')).toBeCloseTo(5.252, 2);
    expect(contrastRatio('#00ff00', '#000000')).toBeCloseTo(15.304, 2);
    expect(contrastRatio('#0000ff', '#000000')).toBeCloseTo(2.444, 2);
    expect(contrastRatio('#1f6f86', '#ffffff')).toBeCloseTo(5.712, 2);
  });

  it('rejects a value it cannot parse rather than scoring it', () => {
    expect(() => contrastRatio('rgba(255,255,255,.10)', '#ffffff')).toThrow(/parse/i);
  });
});

describe('requiredRatio', () => {
  it('requires 4.5:1 for body text', () => {
    expect(requiredRatio({ fontSizePx: 14, fontWeight: 400 })).toBe(4.5);
    expect(requiredRatio({ fontSizePx: 12, fontWeight: 600 })).toBe(4.5);
  });

  it('allows 3:1 from 24 px at any weight', () => {
    expect(requiredRatio({ fontSizePx: 24, fontWeight: 400 })).toBe(3);
  });

  it('allows 3:1 from 18.66 px only when bold', () => {
    expect(requiredRatio({ fontSizePx: 18.66, fontWeight: 700 })).toBe(3);
    expect(requiredRatio({ fontSizePx: 18.66, fontWeight: 400 })).toBe(4.5);
  });

  it('refuses the bold allowance just below 18.66 px', () => {
    expect(requiredRatio({ fontSizePx: 18.65, fontWeight: 700 })).toBe(4.5);
  });

  it('requires weight 700 for the bold allowance, matching axe-core', () => {
    // Our type scale's heavy weight is 600, but axe-core 4.13.0 uses
    // boldValue: 700 and T008 runs axe against the rendered page. Granting 600
    // the 3:1 allowance here would make the two audits disagree on text-lg
    // (20 px / 600). See docs/research/test-stack.md.
    expect(requiredRatio({ fontSizePx: 20, fontWeight: 600 })).toBe(4.5);
    expect(requiredRatio({ fontSizePx: 20, fontWeight: 700 })).toBe(3);
  });
});

describe('auditFontSizes', () => {
  it('flags a token below the 12 px floor, naming the token and its size', () => {
    const findings = auditFontSizes({ 'text-tiny': { fontSizePx: 11, fontWeight: 400 } });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.token).toBe('text-tiny');
    expect(findings[0]?.message).toMatch(/11/);
    expect(findings[0]?.message).toMatch(new RegExp(String(MIN_FONT_SIZE_PX)));
  });

  it('passes a token exactly at the floor', () => {
    expect(auditFontSizes({ 'text-xs': { fontSizePx: 12, fontWeight: 400 } })).toEqual([]);
  });
});

describe('auditContrastPairs', () => {
  const type = { 'text-sm': { fontSizePx: 14, fontWeight: 400 } };

  it('flags a body-text pair below 4.5:1, naming both tokens, the ratio and the threshold', () => {
    // #999999 on #ffffff is 2.85:1 — a plausible-looking grey that fails AA.
    const findings = auditContrastPairs(
      [
        {
          theme: 'light',
          foreground: 'text-muted',
          background: 'bg-surface',
          typeToken: 'text-sm',
        },
      ],
      { light: { 'text-muted': '#999999', 'bg-surface': '#ffffff' } },
      type,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.theme).toBe('light');
    expect(findings[0]?.foreground).toBe('text-muted');
    expect(findings[0]?.background).toBe('bg-surface');
    expect(findings[0]?.ratio).toBeCloseTo(2.85, 1);
    expect(findings[0]?.required).toBe(4.5);
  });

  it('passes a pair that clears its threshold', () => {
    const findings = auditContrastPairs(
      [
        {
          theme: 'light',
          foreground: 'text-primary',
          background: 'bg-surface',
          typeToken: 'text-sm',
        },
      ],
      { light: { 'text-primary': '#1f1f1e', 'bg-surface': '#ffffff' } },
      type,
    );

    expect(findings).toEqual([]);
  });

  it('applies the large-text threshold, so 3.45:1 passes at 24 px and fails at 14 px', () => {
    // #8a8a8a on white is 3.45:1 — above the 3:1 large-text bar, below 4.5:1.
    const palette = { light: { fg: '#8a8a8a', bg: '#ffffff' } };
    const sizes = {
      'text-sm': { fontSizePx: 14, fontWeight: 400 },
      'text-xl': { fontSizePx: 24, fontWeight: 600 },
    };

    expect(
      auditContrastPairs(
        [{ theme: 'light', foreground: 'fg', background: 'bg', typeToken: 'text-xl' }],
        palette,
        sizes,
      ),
    ).toEqual([]);
    expect(
      auditContrastPairs(
        [{ theme: 'light', foreground: 'fg', background: 'bg', typeToken: 'text-sm' }],
        palette,
        sizes,
      ),
    ).toHaveLength(1);
  });

  it('audits both themes and reports the failing one', () => {
    const findings = auditContrastPairs(
      [
        { theme: 'light', foreground: 'fg', background: 'bg', typeToken: 'text-sm' },
        { theme: 'dark', foreground: 'fg', background: 'bg', typeToken: 'text-sm' },
      ],
      {
        light: { fg: '#1f1f1e', bg: '#ffffff' },
        dark: { fg: '#3a3a38', bg: '#1c1c1b' },
      },
      type,
    );

    expect(findings.map((f) => f.theme)).toEqual(['dark']);
  });

  it('refuses a pair naming a type token the scale does not define', () => {
    expect(() =>
      auditContrastPairs(
        [{ theme: 'light', foreground: 'fg', background: 'bg', typeToken: 'text-nope' }],
        { light: { fg: '#1f1f1e', bg: '#ffffff' } },
        type,
      ),
    ).toThrow(/text-nope/);
  });

  it('refuses a pair naming a theme the palette does not carry', () => {
    expect(() =>
      auditContrastPairs(
        [{ theme: 'dark', foreground: 'fg', background: 'bg', typeToken: 'text-sm' }],
        { light: { fg: '#1f1f1e', bg: '#ffffff' } },
        type,
      ),
    ).toThrow(/dark/);
  });

  it('refuses a pair naming a token the palette does not define', () => {
    expect(() =>
      auditContrastPairs(
        [{ theme: 'light', foreground: 'nope', background: 'bg', typeToken: 'text-sm' }],
        { light: { bg: '#ffffff' } },
        type,
      ),
    ).toThrow(/nope/);
  });
});
