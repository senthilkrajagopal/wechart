import type { RenderSpec } from '@wechart/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartTile } from './ChartTile';
import { ParallelNotes, SCALE_WARNING } from './ParallelNotes';

/**
 * T982 / AC-598: … show under the chart, as text, "Each axis runs from its
 * own minimum to its maximum. Don't compare a line's height on one axis with
 * its height on another." while Scale is per axis; and past 1,000 members
 * draw the first 1,000 by the first measure, saying "Showing 1,000 of ‹n›
 * ‹members›, by ‹measure›. Filter, or open the table." with Filter and Table.
 * `Fails when: … the warning is missing or only in an image; … or the cut
 * isn't said.` And AC-597: with fewer than 3 measures the chart says what it
 * needs, drawing no lines.
 */
const AXES = ['products.revenue', 'products.margin', 'products.units'];

const rowsOf = (n: number): RenderSpec['rows'] =>
  Array.from({ length: n }, (_, at) => ({
    'products.name': `Product ${String(at + 1)}`,
    'products.revenue': String(1000 + at),
    'products.margin': '0.2',
    'products.units': String(at),
  }));

const spec = (
  rows: RenderSpec['rows'],
  extra: Partial<RenderSpec> = {},
  axes: readonly string[] = AXES,
): RenderSpec => ({
  chartType: 'parallel',
  encoding: { x: ['products.name'], y: [...axes] },
  rows,
  formats: {},
  titles: { 'products.name': 'Product', 'products.revenue': 'Revenue' },
  ...extra,
});

describe('parallel coordinates’ notes (T982, AC-598)', () => {
  it('says, as text, not to compare heights across axes while each axis has its own scale', () => {
    render(<ParallelNotes spec={spec(rowsOf(14))} />);
    expect(screen.getByTestId('parallel-scale-warning').textContent).toBe(SCALE_WARNING);
    expect(SCALE_WARNING).toBe(
      "Each axis runs from its own minimum to its maximum. Don't compare a line's height on one axis with its height on another.",
    );
  });

  it('says nothing of scale when the axes share one', () => {
    render(
      <ParallelNotes spec={spec(rowsOf(14), { options: { parallel: { scale: 'shared' } } })} />,
    );
    expect(screen.queryByTestId('parallel-scale-warning')).toBeNull();
  });

  it('says how many of how many members are drawn past 1,000, by the first measure, with Filter and Table', () => {
    const onFilter = vi.fn();
    const onTable = vi.fn();
    render(<ParallelNotes spec={spec(rowsOf(4210))} onFilter={onFilter} onTable={onTable} />);
    const cut = screen.getByTestId('parallel-cut');
    expect(cut.querySelector('span')?.textContent).toBe(
      'Showing 1,000 of 4,210 products, by Revenue. Filter, or open the table.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(onFilter).toHaveBeenCalledTimes(1);
    expect(onTable).toHaveBeenCalledTimes(1);
  });

  it('says how many members are drawn where Colour splits them into more lines (T982 review)', () => {
    const rows = rowsOf(600).flatMap((row) => [
      { ...row, 'products.channel': 'Web' },
      { ...row, 'products.channel': 'Retail' },
    ]);
    render(
      <ParallelNotes
        spec={spec(rows, {
          encoding: { x: ['products.name'], y: AXES, color: ['products.channel'] },
        })}
      />,
    );
    expect(screen.getByTestId('parallel-cut').querySelector('span')?.textContent).toBe(
      'Showing 500 of 600 products, by Revenue. Filter, or open the table.',
    );
  });

  it('says nothing of a cut up to 1,000 members', () => {
    render(<ParallelNotes spec={spec(rowsOf(1000))} />);
    expect(screen.queryByTestId('parallel-cut')).toBeNull();
  });

  it('with fewer than 3 measures, says what the chart needs, and nothing of scale', () => {
    render(<ParallelNotes spec={spec(rowsOf(5), {}, AXES.slice(0, 2))} />);
    expect(screen.getByTestId('parallel-tile-too-few').textContent).toBe(
      'Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter.',
    );
    expect(screen.queryByTestId('parallel-scale-warning')).toBeNull();
  });
});

describe('a parallel-coordinates tile (T982, AC-598)', () => {
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

  it('shows the notes under the chart, its Table opening the table view', () => {
    render(<ChartTile title="Products" spec={spec(rowsOf(1001))} />);
    expect(screen.getByTestId('parallel-scale-warning').textContent).toBe(SCALE_WARNING);
    expect(screen.getByTestId('parallel-cut').textContent).toContain('Showing 1,000 of 1,001');
    // No Filter where the tile has nowhere to filter.
    expect(screen.queryByRole('button', { name: 'Filter' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByTestId('toggle-table-view').getAttribute('aria-pressed')).toBe('true');
  });

  it('on a dashboard, with no Table view button in the head, its Table still opens the tile’s table view (T982 review)', () => {
    const onTableViewChange = vi.fn();
    render(
      <ChartTile
        title="Products"
        spec={spec(rowsOf(1001))}
        tableToggle={false}
        tableView={false}
        onTableViewChange={onTableViewChange}
      />,
    );
    expect(screen.queryByTestId('toggle-table-view')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(onTableViewChange).toHaveBeenCalledWith(true);
  });
});
