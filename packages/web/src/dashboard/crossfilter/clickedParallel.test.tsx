import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { crossChipWords, sameSelection } from './apply';
import { clickedMarkItem, clickedValue } from './clicked';
import { CrossFilterChips } from './CrossFilterChip';

/**
 * T983 / AC-599: THE SYSTEM SHALL mark a parallel-coordinate line as its
 * member on a click; … and as a cross-filter source filter the others to the
 * brushed members with one chip ("Product: 6 brushed in Margin %").
 * `Fails when: … or the chip reads otherwise.`
 *
 * A line carries its member as its row holds it (`series/parallel.ts`), not
 * as its name is written.
 */
const spec = {
  chartType: 'parallel',
  encoding: { x: ['products.launched'], y: ['a', 'b', 'c'] },
  rows: [{ 'products.launched': 2024, a: 1, b: 2, c: 3 }],
} as unknown as RenderSpec;

describe('a parallel-coordinate line clicked (AC-599)', () => {
  it('marks and filters by its member as its row holds it, not its written name', () => {
    const line = {
      name: '2,024',
      seriesName: 'Launched',
      marks: [{ member: 'products.launched', value: 2024 }],
    };
    expect(clickedMarkItem(spec, line)).toEqual([{ member: 'products.launched', value: 2024 }]);
    expect(clickedValue(spec, line)).toEqual({ member: 'products.launched', value: '2024' });
  });
});

describe('a brush as a cross-filter (AC-599)', () => {
  const brushed = {
    from: 'tile-parallel',
    member: 'products.name',
    value: 'P1',
    values: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
    words: 'Product: 6 brushed in Margin %',
  };

  it('is said in one chip in its own words', () => {
    expect(crossChipWords(brushed)).toBe('Product: 6 brushed in Margin %');
    render(<CrossFilterChips selections={[brushed]} onClear={() => undefined} />);
    expect(screen.getAllByTestId('cross-filter-chip')).toHaveLength(1);
    expect(
      screen.getByTestId('cross-filter-chip').querySelector('.cross-chip__what')?.textContent,
    ).toBe('Product: 6 brushed in Margin %');
  });

  it('is another selection where its members differ', () => {
    expect(sameSelection(brushed, brushed)).toBe(true);
    expect(sameSelection(brushed, { ...brushed, values: ['P1', 'P2'] })).toBe(false);
  });
});
