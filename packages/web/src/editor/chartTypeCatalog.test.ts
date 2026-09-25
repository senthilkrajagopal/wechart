import { CHART_TYPES } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { needsText, TYPE_DESCRIPTIONS, TYPE_PURPOSES, typesMatching } from './chartTypeCatalog';

/**
 * T230 / AC-217: … a Change action opening a gallery of every type that can
 * be searched, groups types by purpose, states what each needs and greys
 * those the chart's fields cannot draw …
 * `Fails when: … a type the fields cannot draw is not greyed with its
 * requirement …`
 */
describe('the chart type gallery’s catalog (AC-217)', () => {
  it('puts every type in a purpose, and describes each', () => {
    const grouped = new Set(TYPE_PURPOSES.flatMap((purpose) => purpose.types));
    for (const type of CHART_TYPES) {
      expect(grouped.has(type)).toBe(true);
      expect(TYPE_DESCRIPTIONS[type].length).toBeGreaterThan(0);
    }
  });

  it('says what each type needs, in the field list’s words', () => {
    expect(needsText('line')).toBe('Needs a measure and a time dimension');
    expect(needsText('stackedArea')).toBe('Needs a measure, a time dimension and a dimension');
    // A time dimension counts as one of a pivot's groupings, as `compile`
    // draws it (T305's review), and no sentence ends on a comma.
    expect(needsText('pivot')).toBe('Needs 2 dimensions, or a time dimension and a dimension');
    expect(needsText('trellis')).toBe(
      'Needs a measure and 2 dimensions, or a time dimension and a dimension',
    );
    expect(needsText('table')).toBe('Draws any fields');
  });

  it('finds types by name or description, ignoring case', () => {
    expect(typesMatching('TREND')).toContain('line');
    expect(typesMatching('grouped')).toEqual(['groupedBar']);
    expect(typesMatching('  ')).toEqual(CHART_TYPES);
    expect(typesMatching('no type is called this')).toEqual([]);
  });
});
