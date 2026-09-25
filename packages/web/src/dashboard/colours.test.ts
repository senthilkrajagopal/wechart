import type { RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { dashboardColours } from './colours';
import type { DashboardDocument } from './model/document';

/**
 * T023 / AC-039: THE SYSTEM SHALL give a member the same colour in every tile
 * of a dashboard, and keep that colour when filters change the set of visible
 * members (direction.md rule 7).
 *
 * The mechanism was built and tested at T046 (`assignColours`). What is new
 * here is the dashboard: the assignment has to be made once, above the tiles,
 * and the same one handed to all of them. So these tests are about the
 * decision, not the palette — the palette's own properties are @wechart/charts'
 * business.
 *
 * The shape that catches the bug is two tiles listing the same members in a
 * different order. Colour by rank looks perfectly correct in each tile on its
 * own, and is wrong the moment they are side by side.
 */
const REGION = 'orders.region';
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const spec = (rows: readonly Record<string, unknown>[]): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: [REGION], y: [COUNT], color: [STATUS] },
  rows,
});

/** paid, then shipped, then refunded. */
const FIRST = spec([
  { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 3 },
  { [REGION]: 'east', [STATUS]: 'shipped', [COUNT]: 2 },
  { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 1 },
]);

/** shipped, then paid. Different order, and refunded is absent. */
const SECOND = spec([
  { [REGION]: 'west', [STATUS]: 'shipped', [COUNT]: 5 },
  { [REGION]: 'west', [STATUS]: 'paid', [COUNT]: 4 },
]);

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 't1', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        {
          id: 's1',
          kind: 'section',
          title: 'Detail',
          items: [{ id: 't2', kind: 'chart', w: 12, h: 40, chartId: 'c2' }],
        },
      ],
    },
  ],
};

const SPECS = { c1: FIRST, c2: SECOND };

describe('one assignment for the whole dashboard', () => {
  it('gives a member the same colour in two tiles that order it differently', () => {
    const { specs: coloured } = dashboardColours(DOC, SPECS);

    expect(coloured['c2']?.colours?.['shipped']).toBe(coloured['c1']?.colours?.['shipped']);
    expect(coloured['c2']?.colours?.['paid']).toBe(coloured['c1']?.colours?.['paid']);
  });

  it('still gives two different members two different colours', () => {
    const { specs: coloured } = dashboardColours(DOC, SPECS);
    const first = coloured['c1']?.colours ?? {};

    // A "shared assignment" that painted everything one colour would pass the
    // test above and be useless.
    expect(new Set(Object.values(first)).size).toBe(3);
  });

  it('reaches a chart nested in a section', () => {
    const { specs: coloured } = dashboardColours(DOC, SPECS);

    expect(Object.keys(coloured).sort()).toEqual(['c1', 'c2']);
  });

  it('reaches a chart in every tab of a tab group, not only the open one', () => {
    const withTabs: DashboardDocument = {
      ...DOC,
      pages: [
        {
          id: 'p1',
          title: 'Overview',
          items: [
            {
              id: 'g1',
              kind: 'section',
              title: 'Grouped',
              items: [
                {
                  id: 'tg1',
                  kind: 'tabs',
                  w: 12,
                  tabs: [
                    {
                      id: 'a',
                      title: 'A',
                      items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: 'c1' }],
                    },
                    {
                      id: 'b',
                      title: 'B',
                      items: [{ id: 't2', kind: 'chart', w: 6, h: 40, chartId: 'c2' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Which tab is open is a view concern. If only the open tab were claimed,
    // a member would change colour because a reader opened the tabs in a
    // different order — the criterion's "keep that colour" in another guise.
    const { specs: coloured } = dashboardColours(withTabs, SPECS);
    expect(coloured['c2']?.colours?.['paid']).toBe(coloured['c1']?.colours?.['paid']);
  });
});

describe('keeping a colour while a filter hides its member (AC-039)', () => {
  const filtered = spec([
    { [REGION]: 'east', [STATUS]: 'shipped', [COUNT]: 2 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 1 },
  ]);

  it('repaints the survivors if the assignment is recomputed from what is visible', () => {
    const before = dashboardColours(DOC, SPECS);
    // Recomputed from scratch, "paid" has gone and "shipped" is now the first
    // member claimed, so it takes the colour "paid" had. This is the bug the
    // criterion exists to forbid, asserted so that the fix below is shown to
    // be doing something.
    const naive = dashboardColours(DOC, { c1: filtered, c2: SECOND });

    expect(naive.specs['c1']?.colours?.['shipped']).not.toBe(
      before.specs['c1']?.colours?.['shipped'],
    );
  });

  it('keeps every survivor on its colour when the assignment is carried forward', () => {
    const before = dashboardColours(DOC, SPECS);
    // What the dashboard actually does: the assignment outlives the filter.
    const after = dashboardColours(DOC, { c1: filtered, c2: SECOND }, before.assigned);

    expect(after.specs['c1']?.colours?.['shipped']).toBe(before.specs['c1']?.colours?.['shipped']);
    expect(after.specs['c1']?.colours?.['refunded']).toBe(
      before.specs['c1']?.colours?.['refunded'],
    );
  });

  it('gives the hidden member its colour back when the filter is lifted', () => {
    const before = dashboardColours(DOC, SPECS);
    const after = dashboardColours(DOC, { c1: filtered, c2: SECOND }, before.assigned);
    const restored = dashboardColours(DOC, SPECS, after.assigned);

    // The reader who learnt that this colour means "paid" is not taught
    // something false by filtering and unfiltering.
    expect(restored.specs['c1']?.colours?.['paid']).toBe(before.specs['c1']?.colours?.['paid']);
  });

  it('hands back every member it has assigned, so the caller can carry it', () => {
    const { assigned } = dashboardColours(DOC, SPECS);

    expect(Object.keys(assigned).sort()).toEqual(['paid', 'refunded', 'shipped']);
  });

  it('honours an assignment the dashboard already saved', () => {
    const saved = { paid: '#123456' };
    const { specs: coloured } = dashboardColours(DOC, SPECS, saved);

    expect(coloured['c1']?.colours?.['paid']).toBe('#123456');
    expect(coloured['c2']?.colours?.['paid']).toBe('#123456');
    // And nothing else is allowed to collide with it.
    expect(coloured['c1']?.colours?.['shipped']).not.toBe('#123456');
  });
});

/**
 * T301: what a tile colours is what it claims (the Superset-parity rebuild's
 * gaps 3 and 5). A pie's and a treemap's colours are their categories, not
 * their one series; a KPI, a table, a pivot, a heatmap's scale and a trellis's
 * one colour are no member's, and a claim for them spent a slot that a later
 * tile's real member then went without, falling to the neutral direction.md
 * §5 keeps for "Other" and null.
 */
describe('what each kind of tile claims (T301)', () => {
  const statuses = [
    { [STATUS]: 'shipped', [COUNT]: 5 },
    { [STATUS]: 'paid', [COUNT]: 4 },
    { [STATUS]: 'refunded', [COUNT]: 1 },
  ];
  const byStatus = (chartType: RenderSpec['chartType']): RenderSpec => ({
    chartType,
    encoding: { x: [STATUS], y: [COUNT] },
    rows: statuses,
  });
  const doc = (charts: readonly string[]): DashboardDocument => ({
    ...DOC,
    pages: [
      {
        id: 'p1',
        title: 'Overview',
        items: charts.map((chartId, index) => ({
          id: `t${String(index)}`,
          kind: 'chart' as const,
          w: 6,
          h: 40,
          chartId,
        })),
      },
    ],
  });

  it.each(['pie', 'donut', 'treemap'] as const)(
    'colours a %s by its categories, as a bar split by them is',
    (chartType) => {
      const { specs: coloured } = dashboardColours(doc(['c1', 'slices']), {
        c1: FIRST,
        slices: byStatus(chartType),
      });

      for (const member of ['paid', 'shipped', 'refunded'])
        expect(coloured['slices']?.colours?.[member]).toBe(coloured['c1']?.colours?.[member]);
    },
  );

  it('gives a pie first on the page each category its own colour', () => {
    const { specs: coloured } = dashboardColours(doc(['slices']), {
      slices: byStatus('donut'),
    });

    expect(new Set(Object.values(coloured['slices']?.colours ?? {})).size).toBe(3);
  });

  it.each([
    ['kpi', { y: [COUNT] }],
    ['table', { x: [REGION], y: [COUNT] }],
    ['pivot', { row: [REGION], column: [STATUS], y: [COUNT] }],
    ['heatmap', { x: [REGION], y: [STATUS], color: [COUNT] }],
    ['trellis', { x: [REGION], y: [COUNT], facet: [STATUS] }],
  ] as const)('lets a %s claim no colour', (chartType, encoding) => {
    const drawsNone: RenderSpec = { chartType, encoding, rows: FIRST.rows };
    const { specs: coloured, assigned } = dashboardColours(doc(['none', 'c1']), {
      none: drawsNone,
      c1: FIRST,
    });

    expect(Object.keys(assigned).sort()).toEqual(['paid', 'refunded', 'shipped']);
    // The bar after it starts at the palette's first slot, as it would alone.
    const alone = dashboardColours(doc(['c1']), { c1: FIRST });
    expect(coloured['c1']?.colours).toEqual(alone.specs['c1']?.colours);
  });
});
