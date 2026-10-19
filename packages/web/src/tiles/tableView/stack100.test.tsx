import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import { addedColumnsOf } from './index';
import { stack100Columns } from './stack100';

/**
 * T958 / AC-585: … its table view SHALL add a "Share of ‹category›" column.
 * `Fails when: … the text alternative or the share column is missing.`
 * Design 23 sheet 9's table view: Region, Channel, Revenue, Share of Region;
 * "EMEA · Web · $210,100 · 51.0%".
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';

const ROWS = [
  { [REGION]: 'EMEA', [CHANNEL]: 'Web', [REVENUE]: '210100' },
  { [REGION]: 'EMEA', [CHANNEL]: 'Partner', [REVENUE]: '123600' },
  { [REGION]: 'EMEA', [CHANNEL]: 'Retail', [REVENUE]: '78300' },
  { [REGION]: 'APAC', [CHANNEL]: 'Web', [REVENUE]: '300000' },
  { [REGION]: 'APAC', [CHANNEL]: 'Partner', [REVENUE]: null },
];

const spec = (options: Record<string, unknown> = { stack: 'percent' }): RenderSpec =>
  ({
    chartType: 'stackedBar',
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    measures: [REVENUE],
    rows: ROWS,
    options,
    titles: { [REGION]: 'Region', [CHANNEL]: 'Channel', [REVENUE]: 'Revenue' },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
  }) as unknown as RenderSpec;

describe('the table view of a 100 % stack (AC-585)', () => {
  it('gives each row its share of its category, one decimal', () => {
    expect(stack100Columns(spec())).toEqual([
      { title: 'Share of Region', cells: ['51.0%', '30.0%', '19.0%', '100.0%', ''] },
    ]);
  });

  it('adds no column at Sum', () => {
    expect(stack100Columns(spec({}))).toEqual([]);
    expect(addedColumnsOf(spec({}))).toEqual([]);
  });

  it('shows "Share of Region" after the queried columns in the tile’s table', () => {
    render(<DataTable spec={spec()} />);
    const heads = screen.getAllByRole('columnheader').map((head) => head.textContent);
    expect(heads).toEqual(['Region', 'Channel', 'Revenue', 'Share of Region']);
    const [first] = screen.getAllByTestId('table-row');
    expect(
      within(first as HTMLElement)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['EMEA', 'Web', '$210,100', '51.0%']);
  });
});
