import { withColumns, type GraphicalTableColumn, type RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GraphicalTableView, type LoadedTrend } from '../GraphicalTable';
import { graphicalTableTableView } from './graphicalTable';

/**
 * T947 / AC-574: THE SYSTEM SHALL give a graphical table a "View as table"
 * holding the numbers behind every cell: a Sparkline column as its first and
 * last values ("$84K → $112K"), a Bullet column as value and target ("23.1% /
 * 25%"), and an Icon column as its word.
 * `Fails when: a column's numbers are missing, or differ from what its cell
 * draws.`
 */
const CATEGORY = 'products.category';
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin';
const TARGET = 'orders.margin_target';
const AT = 'orders.ordered_at';

const COLUMNS: readonly GraphicalTableColumn[] = [
  { kind: 'value', settings: { measure: REVENUE } },
  { kind: 'sparkline', settings: { measure: REVENUE, time: AT, granularity: 'month', last: 12 } },
  {
    kind: 'bullet',
    settings: {
      measure: MARGIN,
      target: { kind: 'measure', measure: TARGET },
      ranges: [0.2, 0.25],
    },
  },
  {
    kind: 'icon',
    settings: {
      measure: MARGIN,
      of: TARGET,
      rules: [
        { op: '>=', value: 1, state: 'success', label: 'On track' },
        { op: '>=', value: 0.9, state: 'warning', label: 'At risk' },
        { op: 'otherwise', state: 'error', label: 'Off track' },
      ],
    },
  },
  { kind: 'change', settings: { measure: REVENUE, time: AT, period: 'quarter' } },
];

const CATEGORIES: readonly (readonly [string, number, number])[] = [
  ['Beverages', 1_210_000, 0.231],
  ['Seafood', 840_000, 0.264],
  ['Dairy', 720_000, 0.198],
];

const spec = {
  chartType: 'graphicalTable',
  encoding: { x: [CATEGORY], y: [REVENUE] },
  rows: CATEGORIES.map(([category, revenue, margin]) => ({
    [CATEGORY]: category,
    [REVENUE]: String(revenue),
    [MARGIN]: String(margin),
    [TARGET]: '0.25',
  })),
  formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [TARGET]: 'percent' },
  titles: { [CATEGORY]: 'Category', [REVENUE]: 'Revenue', [MARGIN]: 'Margin' },
  options: withColumns({}, COLUMNS),
} as unknown as RenderSpec;

const now = new Date('2026-10-18T09:00:00Z');
const MONTHS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
];
/** Beverages from $84K to $112K over the last 12 months; Dairy none. */
const months: LoadedTrend = {
  time: { member: AT, granularity: 'month' },
  periods: 12,
  rows: [
    ...MONTHS.map((month, at) => ({
      [CATEGORY]: 'Beverages',
      [`${AT}.month`]: `${month}-01T00:00:00.000`,
      [REVENUE]: String(at === 11 ? 112_000 : 84_000 + at * 1000),
    })),
    ...MONTHS.map((month) => ({
      [CATEGORY]: 'Seafood',
      [`${AT}.month`]: `${month}-01T00:00:00.000`,
      [REVENUE]: '70000',
    })),
  ],
};
const quarters: LoadedTrend = {
  time: { member: AT, granularity: 'quarter' },
  periods: 12,
  rows: [
    { [CATEGORY]: 'Beverages', [`${AT}.quarter`]: '2026-07-01T00:00:00.000', [REVENUE]: '320000' },
    { [CATEGORY]: 'Beverages', [`${AT}.quarter`]: '2026-10-01T00:00:00.000', [REVENUE]: '337000' },
  ],
};

describe('a graphical table’s table view (T947, AC-574)', () => {
  const view = graphicalTableTableView(spec, [months, quarters], now);

  it('heads its columns as the table does, Rows first', () => {
    expect(view.columns).toEqual([
      'Category',
      'Revenue',
      'Trend, 12 months',
      'Margin vs target',
      'Margin status',
      'Revenue vs last quarter',
    ]);
  });

  it('reads Beverages as "$1,210,000 · $84K → $112K · 23.1% / 25% · At risk"', () => {
    const beverages = view.rows[0] ?? [];
    expect(beverages[0]).toBe('Beverages');
    expect(beverages[1]).toBe('$1,210,000');
    expect(beverages[2]).toMatch(/^\$84(\.0)?K → \$112(\.0)?K$/);
    expect(beverages[3]).toBe('23.1% / 25%');
    expect(beverages[4]).toBe('At risk');
    // A Change as its two periods and the change its cell draws, signed (AC-520).
    expect(beverages[5]).toMatch(/^\$320(\.0)?K → \$337(\.0)?K · ▲ \+5\.3%$/);
    // A row with no trend: "—", as its cell.
    expect(view.rows[2]?.[2]).toBe('—');
  });

  it('matches every cell the table draws', () => {
    render(<GraphicalTableView spec={spec} trends={[months, quarters]} now={now} />);
    for (const [at, [name]] of CATEGORIES.entries()) {
      const cells = within(screen.getByRole('row', { name: new RegExp(`^${name}`) })).getAllByRole(
        'cell',
      );
      const listed = view.rows[at] ?? [];
      expect(cells[0]?.textContent).toBe(listed[1]);
      // The sparkline's own first and last, as its text alternative says them.
      const spark = cells[1]?.querySelector('svg')?.getAttribute('aria-label');
      const [, first, last] = /: from (\S+) to (\S+),/.exec(spark ?? '') ?? [];
      expect(listed[2]).toBe(spark === undefined ? '—' : `${first ?? ''} → ${last ?? ''}`);
      // The bullet's value beside it, and the target its alternative reads.
      const bullet = cells[2]?.querySelector('svg')?.getAttribute('aria-label') ?? '';
      const [, value, target] = /^(\S+) of (\S+),/.exec(bullet) ?? [];
      expect(listed[3]).toBe(`${value ?? ''} / ${target ?? ''}`);
      expect(cells[3]?.textContent).toBe(listed[4]);
      // A Change's two periods and its change, or what its "—" says is missing.
      const missing = cells[4]?.querySelector('[role="img"]')?.getAttribute('aria-label');
      if (missing === null || missing === undefined)
        expect(listed[5]?.endsWith(` · ${cells[4]?.textContent ?? ''}`)).toBe(true);
      else expect(listed[5]).toBe(missing);
    }
  });

  it('lists every row, past a page of 50', () => {
    const many = {
      ...spec,
      rows: Array.from({ length: 214 }, (_, at) => ({
        [CATEGORY]: `Product ${String(at + 1)}`,
        [REVENUE]: '1',
      })),
    } as RenderSpec;
    expect(graphicalTableTableView(many, [], now).rows).toHaveLength(214);
  });
});
