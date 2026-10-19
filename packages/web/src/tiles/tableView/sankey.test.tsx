import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../DataTable';
import { sankeyFlows } from './sankey';

/**
 * T989 / AC-613: … and a table view of each flow as "‹source› → ‹target›"
 * with its value and its share of its source.
 * `Fails when: … a flow is missing from the table, or its share differs.`
 *
 * Design 23 sheet 10: "Web → EMEA · $210,000 · 32.3%".
 */
const CHANNEL = 'orders.channel';
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';

const FLOWS: readonly (readonly [string, string, number])[] = [
  ['Web', 'North America', 237000],
  ['Web', 'EMEA', 210000],
  ['Web', 'APAC', 120000],
  ['Web', 'LATAM', 84000],
  ['Partner', 'EMEA', 112000],
];

const spec = (rows = FLOWS): RenderSpec =>
  ({
    chartType: 'sankey',
    encoding: { x: [CHANNEL, REGION], y: [REVENUE] },
    measures: [REVENUE],
    rows: rows.map(([channel, region, revenue]) => ({
      [CHANNEL]: channel,
      [REGION]: region,
      [REVENUE]: String(revenue),
    })),
    titles: { [CHANNEL]: 'Channel', [REGION]: 'Region', [REVENUE]: 'Revenue' },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
  }) as unknown as RenderSpec;

describe('a Sankey’s table of flows (AC-613)', () => {
  it('lists each flow, its value and its share of its source', () => {
    expect(sankeyFlows(spec())).toEqual({
      columns: ['Flow', 'Revenue', 'Share of source'],
      rows: [
        ['Web → North America', '$237,000', '36.4%'],
        ['Web → EMEA', '$210,000', '32.3%'],
        ['Web → APAC', '$120,000', '18.4%'],
        ['Web → LATAM', '$84,000', '12.9%'],
        ['Partner → EMEA', '$112,000', '100.0%'],
      ],
    });
  });

  it('lists every flow, past the 50 the chart draws', () => {
    const many = Array.from(
      { length: 60 },
      (_, at) => [`C${String(at)}`, 'EMEA', 100 + at] as const,
    );
    expect(sankeyFlows(spec(many)).rows).toHaveLength(60);
  });

  it('is the tile’s table view', () => {
    render(<DataTable spec={spec()} />);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Flow',
      'Revenue',
      'Share of source',
    ]);
    const second = screen.getAllByTestId('table-row')[1]!;
    expect(
      within(second)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['Web → EMEA', '$210,000', '32.3%']);
  });
});
