import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartTile } from './ChartTile';

// A drawn chart's canvas watches its own size, which jsdom cannot.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * T401 / AC-315: IF a box plot's data has more rows than Cube returns in one
 * query, THEN THE SYSTEM SHALL draw the boxes from the rows returned and show
 * "computed from _n_ of _N_ rows" on the tile.
 * `Fails when: a box plot drawn from fewer rows than the data holds shows no
 * such warning, or its counts differ from the rows used and the query's total.`
 *
 * Rule 89: "Computed from _n_ of _N_ rows" on the tile, with the warning icon.
 * _n_ is the rows the boxes are drawn from — the spec's — and _N_ Cube's
 * `total` for the query, given the tile apart from what served it: the
 * editor's preview has one and no freshness badge (T401's review).
 */
const rows = (n: number): RenderSpec['rows'] =>
  Array.from({ length: n }, (_, at) => ({
    'orders.status': at % 2 === 0 ? 'shipped' : 'completed',
    'orders.amount': at,
  }));
const spec = (chartType: RenderSpec['chartType'], n: number): RenderSpec => ({
  chartType,
  encoding: { x: ['orders.status'], y: ['orders.amount'] },
  rows: rows(n),
});

describe('a box plot drawn from fewer rows than its data holds', () => {
  it('says how many of how many, with the warning icon', () => {
    render(<ChartTile title="Amounts" spec={spec('boxplot', 3)} rowsTotal={50_100} />);

    const warning = screen.getByTestId('row-limit-warning');
    expect(warning.textContent).toBe('Computed from 3 of 50,100 rows');
    expect(warning.querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
    // Said of the rows alone: what served them is another badge's to say.
    expect(screen.queryAllByTestId('tile-freshness')).toEqual([]);
  });

  it('counts the rows the boxes are drawn from', () => {
    // Two drawn, of three returned — a result limit — and 50,100 in all.
    render(<ChartTile title="Amounts" spec={spec('boxplot', 2)} rowsTotal={50_100} />);

    expect(screen.getByTestId('row-limit-warning').textContent).toBe(
      'Computed from 2 of 50,100 rows',
    );
  });

  it('says nothing when the rows are all there', () => {
    render(<ChartTile title="Amounts" spec={spec('boxplot', 3)} rowsTotal={3} />);

    expect(screen.queryAllByTestId('row-limit-warning')).toEqual([]);
  });

  it('says nothing of another chart type, or with no total', () => {
    render(<ChartTile title="Bars" spec={spec('bar', 3)} rowsTotal={9} />);
    render(<ChartTile title="Amounts" spec={spec('boxplot', 3)} />);

    expect(screen.queryAllByTestId('row-limit-warning')).toEqual([]);
  });
});
