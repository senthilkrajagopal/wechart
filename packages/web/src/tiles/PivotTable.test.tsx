import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PivotTable } from './PivotTable';

/**
 * T042 / AC-037: the pivot table.
 *
 * The cross-tab itself is tested on values in `@wechart/core`. What is left
 * here is what only the markup can show: that a nested header spans the
 * columns beneath it rather than repeating, and that the totals land in the
 * right cells.
 */
const REGION = 'orders.region';
const STATUS = 'orders.status';
const QUARTER = 'orders.quarter';
const COUNT = 'orders.count';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'pivot',
  encoding: { row: [REGION], column: [STATUS], y: [COUNT] },
  rows: [
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 2 },
    { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
    { [REGION]: 'west', [STATUS]: 'refunded', [COUNT]: 8 },
  ],
  ...over,
});

describe('the grid', () => {
  it('is a real table with row headers scoped as rows', () => {
    render(<PivotTable spec={spec()} />);

    const rowHeaders = screen.getAllByTestId('pivot-row-header');
    expect(rowHeaders.map((header) => header.textContent)).toEqual(['east', 'west']);
    for (const header of rowHeaders) expect(header.getAttribute('scope')).toBe('row');
  });

  it('puts the column dimension across the top', () => {
    render(<PivotTable spec={spec()} />);

    const headers = screen.getAllByTestId('pivot-column-header');
    expect(headers.map((header) => header.textContent)).toEqual(['paid', 'refunded']);
  });
});

describe('nested column headers', () => {
  const nested = spec({
    encoding: { row: [REGION], column: [QUARTER, STATUS], y: [COUNT] },
    rows: [
      { [REGION]: 'east', [QUARTER]: 'Q1', [STATUS]: 'paid', [COUNT]: 1 },
      { [REGION]: 'east', [QUARTER]: 'Q1', [STATUS]: 'refunded', [COUNT]: 2 },
      { [REGION]: 'east', [QUARTER]: 'Q2', [STATUS]: 'paid', [COUNT]: 4 },
    ],
  });

  it('spans the outer value over the columns beneath it rather than repeating it', () => {
    render(<PivotTable spec={nested} />);

    const headers = screen.getAllByTestId('pivot-column-header');
    const q1 = headers.find((header) => header.textContent === 'Q1');

    // Q1 covers paid and refunded; Q2 covers only paid. Repeating "Q1" over
    // each leaf would read as two unrelated quarters.
    expect(headers.filter((header) => header.textContent === 'Q1')).toHaveLength(1);
    expect(q1?.getAttribute('colspan')).toBe('2');
  });

  it('does not merge equal leaves that sit under different parents', () => {
    // Deliberately *adjacent* equal leaves: Q1/paid then Q2/paid. In the
    // fixture above the two "paid" columns are separated by "refunded", so
    // adjacency alone would keep them apart and the test would pass without
    // the rule it is meant to check.
    render(
      <PivotTable
        spec={spec({
          encoding: { row: [REGION], column: [QUARTER, STATUS], y: [COUNT] },
          rows: [
            { [REGION]: 'east', [QUARTER]: 'Q1', [STATUS]: 'paid', [COUNT]: 1 },
            { [REGION]: 'east', [QUARTER]: 'Q2', [STATUS]: 'paid', [COUNT]: 4 },
          ],
        })}
      />,
    );

    const paid = screen
      .getAllByTestId('pivot-column-header')
      .filter((header) => header.textContent === 'paid');

    // Merging them would put one cell across two quarters and misstate every
    // value beneath it.
    expect(paid).toHaveLength(2);
    for (const cell of paid) expect(cell.getAttribute('colspan')).toBe('1');
  });
});

describe('totals', () => {
  it('adds each row across its columns', () => {
    render(<PivotTable spec={spec()} />);

    const totals = screen.getAllByTestId('pivot-row-total');
    expect(totals.map((cell) => cell.textContent)).toEqual(['3', '12']);
  });

  it('adds each column down its rows, in the footer', () => {
    render(<PivotTable spec={spec()} />);

    const footer = screen.getByTestId('pivot-totals');
    const columnTotals = within(footer).getAllByTestId('pivot-column-total');
    expect(columnTotals.map((cell) => cell.textContent)).toEqual(['5', '10']);
  });

  it('shows the grand total', () => {
    render(<PivotTable spec={spec()} />);

    expect(screen.getByTestId('pivot-grand-total').textContent).toBe('15');
  });

  it('leaves a total blank rather than printing zero when nothing was measured', () => {
    render(
      <PivotTable
        spec={spec({
          rows: [
            { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: null },
            { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
          ],
        })}
      />,
    );

    expect(screen.getAllByTestId('pivot-row-total').map((c) => c.textContent)).toEqual(['', '4']);
  });
});

describe('formats from the model (AC-046, T201)', () => {
  it('writes each cell in its measure’s format, and a header in its dimension’s', () => {
    const BAND = 'orders.price_band';
    render(
      <PivotTable
        spec={spec({
          encoding: { row: [BAND], column: [STATUS], y: [COUNT] },
          rows: [
            { [BAND]: 10, [STATUS]: 'paid', [COUNT]: 0.25 },
            { [BAND]: 20, [STATUS]: 'paid', [COUNT]: 0.5 },
          ],
          formats: { [COUNT]: { specifier: '.1~%' }, [BAND]: { specifier: '$,.0f' } },
        })}
      />,
    );

    expect(screen.getAllByTestId('pivot-row-header').map((header) => header.textContent)).toEqual([
      '$10',
      '$20',
    ]);
    expect(screen.getAllByTestId('pivot-row-total').map((cell) => cell.textContent)).toEqual([
      '25%',
      '50%',
    ]);
  });
});

describe('headers of time (AC-188)', () => {
  it('write each time by its granularity, on rows and on columns', () => {
    const AT = 'orders.ordered_at';
    const monthly = [
      { [AT]: '2026-01-01T00:00:00.000', [STATUS]: 'paid', [COUNT]: 1 },
      { [AT]: '2026-02-01T00:00:00.000', [STATUS]: 'paid', [COUNT]: 2 },
    ];
    const { unmount } = render(
      <PivotTable
        spec={spec({
          encoding: { row: [AT], column: [STATUS], y: [COUNT] },
          rows: monthly,
          granularities: { [AT]: 'month' },
        })}
      />,
    );
    expect(screen.getAllByTestId('pivot-row-header').map((header) => header.textContent)).toEqual([
      'Jan 2026',
      'Feb 2026',
    ]);
    unmount();

    render(
      <PivotTable
        spec={spec({
          encoding: { row: [STATUS], column: [AT], y: [COUNT] },
          rows: monthly,
          granularities: { [AT]: 'month' },
        })}
      />,
    );
    expect(
      screen.getAllByTestId('pivot-column-header').map((header) => header.textContent),
    ).toEqual(['Jan 2026', 'Feb 2026']);
  });
});

describe('a spec that cannot be pivoted', () => {
  it('says what is missing rather than drawing an empty grid', () => {
    render(<PivotTable spec={spec({ encoding: { y: [COUNT] } })} />);

    expect(screen.getByTestId('pivot-empty').textContent).toContain('dimension');
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title … table
 * headers … and never by its internal name.
 */
describe('a pivot of two measures (AC-220)', () => {
  it('heads each measure’s column by its title', () => {
    const AMOUNT = 'orders.amount';
    render(
      <PivotTable
        spec={spec({
          encoding: { row: [REGION], column: [STATUS], y: [COUNT, AMOUNT] },
          rows: [
            { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 1, [AMOUNT]: 10 },
            { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 2, [AMOUNT]: 20 },
          ],
          titles: { [COUNT]: 'Orders Count', [AMOUNT]: 'Orders Amount' },
        })}
      />,
    );

    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toContain('Orders Count');
    expect(headers).toContain('Orders Amount');
    expect(headers).not.toContain(COUNT);
  });
});
