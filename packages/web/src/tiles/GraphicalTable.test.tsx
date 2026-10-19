import { withColumns, type GraphicalTableColumn, type RenderSpec } from '@wechart/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GraphicalTableView, type LoadedTrend } from './GraphicalTable';
import { GT_CSS } from './graphicalTableStyles';

/**
 * T944 / AC-571: THE SYSTEM SHALL draw a graphical table as a real `<table>`
 * with column headers and a caption counting its rows and its icon states
 * ("Categories at a glance: 6 rows; 2 on track, 2 at risk, 2 off track."), in
 * 24 px rows under a 28 px header: Value cells in the member's format; Change
 * cells R80's Change; Sparkline cells R80's sparkline at 64 × 16, each scaled
 * to its own row; Bullet cells R80's bullet graph at 96 × 16 with the value
 * beside it, read as "‹value› of ‹target›, in the ‹band› band"; and Icon
 * cells the status icon and its word, "No rule matched" when none applies;
 * each micro-chart an `img` with its own text alternative, and a row with no
 * data for a sparkline showing "—" with "No data for these filters".
 * `Fails when: the table isn't a <table>, or the caption lacks the row or
 * state counts; a cell's size or form differs; an icon shows without its
 * word; a micro-chart lacks its text alternative; or a row with no trend data
 * draws an empty line.`
 *
 * And AC-570's sections and empty state: Group rows by draws a section headed
 * by each member; with no column the tile says "Add a column: Value, Change,
 * Sparkline, Bullet or Icon." with + Column.
 */
const CATEGORY = 'products.category';
const REGION = 'customers.region';
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
      ranges: [0.2, 0.25, 0.3],
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

/** Six categories: revenue, margin; margin target 25 % each. */
const CATEGORIES: readonly (readonly [string, number, number])[] = [
  ['Beverages', 1_210_000, 0.231],
  ['Seafood', 840_000, 0.264],
  ['Dairy', 720_000, 0.198],
  ['Produce', 550_000, 0.242],
  ['Confections', 490_000, 0.21],
  ['Grains', 330_000, 0.256],
];

const spec = (more: Partial<RenderSpec> = {}, columns = COLUMNS): RenderSpec =>
  ({
    chartType: 'graphicalTable',
    encoding: { x: [CATEGORY], y: [REVENUE] },
    rows: CATEGORIES.map(([category, revenue, margin]) => ({
      [CATEGORY]: category,
      [REVENUE]: String(revenue),
      [MARGIN]: String(margin),
      [TARGET]: '0.25',
    })),
    formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [TARGET]: 'percent' },
    titles: {
      [CATEGORY]: 'Category',
      [REVENUE]: 'Revenue',
      [MARGIN]: 'Margin',
      [REGION]: 'Region',
    },
    options: withColumns({}, columns),
    ...more,
  }) as unknown as RenderSpec;

const now = new Date('2026-10-18T09:00:00Z');
/** Revenue by month for every category but Grains, which has no trend. */
const months: LoadedTrend = {
  time: { member: AT, granularity: 'month' },
  periods: 12,
  rows: CATEGORIES.slice(0, 5).flatMap(([category], at) =>
    ['2026-08-01', '2026-09-01', '2026-10-01'].map((month, step) => ({
      [CATEGORY]: category,
      [`${AT}.month`]: `${month}T00:00:00.000`,
      [REVENUE]: String((at + 1) * 1000 * (step + 1)),
    })),
  ),
};
const quarters: LoadedTrend = {
  time: { member: AT, granularity: 'quarter' },
  periods: 12,
  rows: [
    { [CATEGORY]: 'Beverages', [`${AT}.quarter`]: '2026-07-01T00:00:00.000', [REVENUE]: '1000' },
    { [CATEGORY]: 'Beverages', [`${AT}.quarter`]: '2026-10-01T00:00:00.000', [REVENUE]: '1053' },
  ],
};

describe('a graphical table drawn (T944, AC-571)', () => {
  it('is a real table, its caption counting its rows and its icon states', () => {
    render(<GraphicalTableView spec={spec()} trends={[months, quarters]} now={now} />);
    const table = screen.getByRole('table');
    expect(table.tagName).toBe('TABLE');
    expect(table.querySelector('caption')?.textContent).toBe(
      'Categories at a glance: 6 rows; 2 on track, 2 at risk, 2 off track.',
    );
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Category',
      'Revenue',
      'Trend, 12 months',
      'Margin vs target',
      'Margin status',
      'Revenue vs last quarter',
    ]);
    // 24 px rows under a 28 px header (§4).
    expect(GT_CSS).toMatch(/\.gt thead th \{[^}]*height: 28px;[^}]*\}/);
    expect(GT_CSS).toMatch(/\.gt tbody tr \{[^}]*height: 24px;[^}]*\}/);
  });

  it('draws each kind of cell as R80’s element of that kind', () => {
    render(<GraphicalTableView spec={spec()} trends={[months, quarters]} now={now} />);
    const beverages = screen.getByRole('row', { name: /^Beverages/ });
    const cells = within(beverages).getAllByRole('cell');
    // Value, in the member's format.
    expect(cells[0]?.textContent).toBe('$1,210,000');
    // Sparkline: an image 64 × 16, scaled to its own row.
    const spark = cells[1]?.querySelector('svg');
    expect(spark?.getAttribute('role')).toBe('img');
    expect([spark?.getAttribute('width'), spark?.getAttribute('height')]).toEqual(['64', '16']);
    expect(spark?.getAttribute('aria-label')).toMatch(/^Revenue by month, last 12 months: from /);
    // Bullet: an image 96 × 16, the value beside it, read with its band.
    const bullet = cells[2]?.querySelector('svg');
    expect([bullet?.getAttribute('width'), bullet?.getAttribute('height')]).toEqual(['96', '16']);
    expect(bullet?.getAttribute('aria-label')).toBe('23.1% of 25%, in the 80–100 % band');
    expect(cells[2]?.textContent).toBe('23.1%');
    // Icon: its status icon and word.
    expect(cells[3]?.textContent).toBe('At risk');
    expect(cells[3]?.querySelector('[data-tone="warning"]')).not.toBeNull();
    // Change: R80's Change, the latest quarter against the one before.
    expect(cells[4]?.textContent).toBe('▲ 5.3%');
  });

  it('says a row with no trend data "—", "No data for these filters", never an empty line', () => {
    render(<GraphicalTableView spec={spec()} trends={[months, quarters]} now={now} />);
    const grains = screen.getByRole('row', { name: /^Grains/ });
    const spark = within(grains).getAllByRole('cell')[1];
    expect(spark?.querySelector('svg')).toBeNull();
    expect(spark?.textContent).toBe('—');
    const said = within(spark as HTMLElement).getByRole('img');
    expect(said.getAttribute('aria-label')).toBe('No data for these filters');
  });

  it('says "No rule matched" for an icon no rule applies to', () => {
    const noRule = COLUMNS.map((column) =>
      column.kind === 'icon'
        ? {
            ...column,
            settings: { ...column.settings, rules: [column.settings['rules']].flat().slice(0, 1) },
          }
        : column,
    ) as GraphicalTableColumn[];
    render(<GraphicalTableView spec={spec({}, noRule)} trends={[]} now={now} />);
    const dairy = screen.getByRole('row', { name: /^Dairy/ });
    expect(within(dairy).getAllByRole('cell')[3]?.textContent).toBe('No rule matched');
  });
});

describe('a graphical table’s sections and empty state (T944, AC-570)', () => {
  it('puts each region’s rows under a heading row when grouped by Region', () => {
    const grouped = spec({
      encoding: { x: [CATEGORY], facet: [REGION], y: [REVENUE] },
      rows: [
        { [REGION]: 'EMEA', [CATEGORY]: 'Beverages', [REVENUE]: '700000' },
        { [REGION]: 'APAC', [CATEGORY]: 'Beverages', [REVENUE]: '510000' },
        { [REGION]: 'EMEA', [CATEGORY]: 'Seafood', [REVENUE]: '500000' },
      ],
    } as Partial<RenderSpec>);
    render(<GraphicalTableView spec={grouped} trends={[]} now={now} />);
    const sections = screen.getAllByRole('rowgroup').slice(1);
    expect(sections.map((one) => within(one).getAllByRole('rowheader')[0]?.textContent)).toEqual([
      'EMEA',
      'APAC',
    ]);
    expect(within(sections[0] as HTMLElement).getAllByRole('row')).toHaveLength(3);
    expect(within(sections[1] as HTMLElement).getAllByRole('row')).toHaveLength(2);
  });

  it('says what to add, with + Column, while it has no column', () => {
    const onAddColumn = vi.fn();
    render(
      <GraphicalTableView spec={spec({}, [])} trends={[]} now={now} onAddColumn={onAddColumn} />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByTestId('gt-no-columns').textContent).toContain(
      'Add a column: Value, Change, Sparkline, Bullet or Icon.',
    );
    fireEvent.click(screen.getByRole('button', { name: '+ Column' }));
    expect(onAddColumn).toHaveBeenCalledOnce();
  });
});
