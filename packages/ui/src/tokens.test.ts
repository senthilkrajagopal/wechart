import { describe, expect, it } from 'vitest';

import { auditContrastPairs, auditFontSizes } from './audit/contrast';
import {
  COLORS,
  EXPECTED_PAIR_COUNT,
  TEXT_COLOR_TOKENS,
  TYPE_SCALE,
  contrastPairs,
} from './tokens';

/**
 * AC-004 and AC-005 over the real token set. The audit itself is tested in
 * ./audit/contrast.test.ts; this asserts the tokens we ship pass it.
 */
describe('type scale (AC-004)', () => {
  it('has no token below the 12 px floor', () => {
    expect(auditFontSizes(TYPE_SCALE)).toEqual([]);
  });

  it('uses only weights 400 and 600, as direction.md §3 states', () => {
    const weights = [...new Set(Object.values(TYPE_SCALE).map((t) => t.fontWeight))].sort();
    expect(weights).toEqual([400, 600]);
  });
});

describe('colour tokens (AC-005)', () => {
  it('meets WCAG AA for every text colour on every surface, in both themes', () => {
    expect(auditContrastPairs(contrastPairs(), COLORS, TYPE_SCALE).map((f) => f.message)).toEqual(
      [],
    );
  });

  it('audits the full pair list, so removing a token cannot make the suite green', () => {
    // Without this, deleting a failing colour from TEXT_COLOR_TOKENS would pass
    // the test above by auditing less.
    expect(contrastPairs()).toHaveLength(EXPECTED_PAIR_COUNT);
    expect(new Set(contrastPairs().map((p) => p.theme))).toEqual(new Set(['light', 'dark']));
  });

  it('audits every colour token that carries text', () => {
    // Anything in the palette that is not a surface, a border or an icon is a
    // text colour and must be audited. A new token is caught here rather than
    // shipping unaudited.
    const nonText = /^(bg-|border-)|-icon$|^mk\d$|^text-on-/;
    const shouldBeAudited = Object.keys(COLORS.light).filter((name) => !nonText.test(name));
    expect([...shouldBeAudited].sort()).toEqual([...TEXT_COLOR_TOKENS].sort());
  });

  it('defines every colour token in both themes', () => {
    expect(Object.keys(COLORS.dark).sort()).toEqual(Object.keys(COLORS.light).sort());
  });
});
