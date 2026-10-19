import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import { bulletTableView } from './bullet';
import { tableViewOf } from './index';

/**
 * T956 / AC-583: … and give a table view of member, value, target,
 * percentage of target and band.
 * `Fails when: … the table lacks a column.`
 * Design 23 sheet 8's table view: Region, Revenue, Target, % of target, Band;
 * "EMEA · $412,000 · $450,000 · 92% · 80–100 %".
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';

const spec = {
  chartType: 'bullet',
  encoding: { x: [REGION], y: [REVENUE] },
  measures: [REVENUE],
  rows: [
    { [REGION]: 'EMEA', [REVENUE]: '412000' },
    { [REGION]: 'North America', [REVENUE]: '560000' },
  ],
  options: { bullet: { target: { kind: 'value', value: 450000 } } },
  formats: { [REVENUE]: 'currency' },
  titles: { [REGION]: 'Region', [REVENUE]: 'Revenue' },
} as unknown as RenderSpec;

describe('the bullet chart’s table view (AC-583)', () => {
  it('lists each member’s value, target, share of target and band', () => {
    expect(bulletTableView(spec)).toEqual({
      columns: ['Region', 'Revenue', 'Target', '% of target', 'Band'],
      // Revenue, Target and % of target set right, as figures.
      figures: [1, 2, 3],
      rows: [
        ['EMEA', '$412,000', '$450,000', '92%', '80–100 %'],
        ['North America', '$560,000', '$450,000', '124%', 'above 120 %'],
      ],
    });
    expect(tableViewOf(spec)).toEqual(bulletTableView(spec));
  });

  it('says a member with no target has none', () => {
    const none = { ...spec, options: {} } as unknown as RenderSpec;
    expect(bulletTableView(none).rows[0]).toEqual(['EMEA', '$412,000', '', '', 'No target']);
  });

  it('is the tile’s table view', () => {
    render(<DataTable spec={spec} />);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Region',
      'Revenue',
      'Target',
      '% of target',
      'Band',
    ]);
    const [first] = screen.getAllByTestId('table-row');
    expect(
      within(first as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['EMEA', '$412,000', '$450,000', '92%', '80–100 %']);
  });
});
