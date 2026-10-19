import type { RenderSpec } from '@wechart/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import { boxplotPointRows, boxplotStatistics } from './boxplot';

/**
 * T993 / AC-593: … its table view keeping today's statistics with "View
 * points" listing the entities drawn and their values.
 * `Fails when: … the text alternative or "View points" is missing.`
 *
 * Design 23 sheet 11's table view: "Region n Q1 Median Q3 · EMEA 1,240 $95
 * $140 $210"; ""View points" lists the orders drawn, with their values."
 * The statistics are the tooltip's (rule 88): n, the whiskers' ends, the
 * quartiles and the median (decision T993-2).
 */
const REGION = 'orders.region';
const ORDER = 'orders.id';
const AMOUNT = 'orders.amount';

const ROWS = [
  ...[100, 110, 115, 118, 120, 120, 122, 125, 130, 160].map((amount, at) => ({
    [REGION]: 'EMEA',
    [ORDER]: `E-${String(at)}`,
    [AMOUNT]: String(amount),
  })),
  ...[50, 90, 130].map((amount, at) => ({
    [REGION]: 'APAC',
    [ORDER]: `A-${String(at)}`,
    [AMOUNT]: String(amount),
  })),
];

const spec = (distribution?: Record<string, unknown>, eachPointIs: string | null = ORDER) =>
  ({
    chartType: 'boxplot',
    encoding: { x: [REGION], y: [AMOUNT] },
    measures: [AMOUNT],
    rows: ROWS,
    ...(eachPointIs === null ? {} : { eachPointIs }),
    ...(distribution === undefined ? {} : { options: { distribution } }),
    titles: { [REGION]: 'Region', [ORDER]: 'Order', [AMOUNT]: 'Amount' },
    formats: { [AMOUNT]: 'currency' },
  }) as unknown as RenderSpec;

const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('a box plot’s table view (AC-593)', () => {
  it('lists each box’s n and statistics', () => {
    expect(boxplotStatistics(spec())).toEqual({
      columns: ['Region', 'n', 'Low', 'Q1', 'Median', 'Q3', 'High'],
      rows: [
        ['EMEA', '10', '$110', '$115.75', '$120', '$124.25', '$130'],
        ['APAC', '3', '$50', '$70', '$90', '$110', '$130'],
      ],
    });
  });

  it('lists the points drawn, each its entity and value', () => {
    expect(boxplotPointRows(spec({ points: 'beeswarm' }))).toHaveLength(13);
    // Outliers: the two beyond EMEA's whiskers, each its row.
    expect(boxplotPointRows(spec())).toEqual([
      { [REGION]: 'EMEA', [ORDER]: 'E-0', [AMOUNT]: 100 },
      { [REGION]: 'EMEA', [ORDER]: 'E-9', [AMOUNT]: 160 },
    ]);
    expect(boxplotPointRows(spec({ points: 'none' }))).toEqual([]);
    // Without Each point is, no point is an entity.
    expect(boxplotPointRows(spec({}, null))).toBeUndefined();
  });

  it('shows the statistics in the tile’s table, and "View points" the orders and their values', () => {
    render(<DataTable spec={spec({ points: 'beeswarm' })} />);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Region',
      'n',
      'Low',
      'Q1',
      'Median',
      'Q3',
      'High',
    ]);
    expect(cellsOf(screen.getAllByTestId('table-row')[0]!)).toEqual([
      'EMEA',
      '10',
      '$110',
      '$115.75',
      '$120',
      '$124.25',
      '$130',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'View points' }));
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Region',
      'Order',
      'Amount',
    ]);
    expect(cellsOf(screen.getAllByTestId('table-row')[0]!)).toEqual(['EMEA', 'E-0', '$100']);

    fireEvent.click(screen.getByRole('button', { name: 'View statistics' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('offers no "View points" where no point is an entity', () => {
    render(<DataTable spec={spec({}, null)} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: 'View points' })).toBeNull();
  });
});
