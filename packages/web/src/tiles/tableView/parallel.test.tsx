import type { MarkingPredicate, RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import { tableViewOf } from './index';

/**
 * T985 / AC-601: … and a table view of member and measures with marked rows
 * bold and a left rule.
 * `Fails when: … or the table lacks a measure or doesn't show marked rows.`
 *
 * A parallel-coordinates tile's rows are its members and their measures, so
 * its table view is its rows as queried (decision T985-2), marked rows drawn
 * as any table's are (AC-096: `data-marked`, bold with a left rule) — every
 * member, past the 1,000 lines drawn.
 */
const PRODUCT = 'products.name';
const MEASURES = [
  'products.revenue',
  'products.margin',
  'products.units',
  'products.cost',
  'products.returns',
];

const spec = (): RenderSpec =>
  ({
    chartType: 'parallel',
    encoding: { x: [PRODUCT], y: MEASURES },
    measures: MEASURES,
    fields: [PRODUCT, ...MEASURES],
    rows: Array.from({ length: 14 }, (_, at) => ({
      [PRODUCT]: `P${String(at + 1)}`,
      'products.revenue': String(1000 + at),
      'products.margin': String(0.2 + at / 100),
      'products.units': String(10 + at),
      'products.cost': String(500 + at),
      'products.returns': String(at % 3),
    })),
    titles: {
      [PRODUCT]: 'Product',
      'products.revenue': 'Revenue',
      'products.margin': 'Margin %',
      'products.units': 'Units',
      'products.cost': 'Cost',
      'products.returns': 'Returns',
    },
    marking: {
      colour: '#d9480f',
      predicate: {
        items: ['P1', 'P2'].map((value) => [{ member: PRODUCT, value }]),
        ranges: [],
      } as unknown as MarkingPredicate,
    },
  }) as unknown as RenderSpec;

describe('parallel coordinates’ table view (AC-601)', () => {
  it('lists each member and its measures, marked rows marked', () => {
    expect(tableViewOf(spec())).toBeUndefined();
    render(<DataTable spec={spec()} />);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Product',
      'Revenue',
      'Margin %',
      'Units',
      'Cost',
      'Returns',
    ]);
    const rows = screen.getAllByTestId('table-row');
    expect(rows.map((row) => row.getAttribute('data-marked')).slice(0, 3)).toEqual([
      'whole',
      'whole',
      'none',
    ]);
  });
});
