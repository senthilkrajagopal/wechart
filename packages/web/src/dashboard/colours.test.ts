import { DEFAULT_PALETTE, optionFor, OTHER_COLOUR } from '@wechart/charts';
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

  /**
   * T301's review: a pie's or treemap's folded tail, "Other (n)", is not a
   * member. Claimed, it took a palette slot — and another each time a filter
   * changed its count — where direction.md §5 draws it in the neutral.
   */
  it.each(['donut', 'treemap'] as const)('claims no colour for a %s’s "Other (n)"', (chartType) => {
    const withOther: RenderSpec = {
      ...byStatus(chartType),
      rows: [...statuses, { [STATUS]: 'Other (4)', [COUNT]: 3 }],
    };
    const { specs: coloured, assigned } = dashboardColours(doc(['slices']), {
      slices: withOther,
    });

    expect(Object.keys(assigned).sort()).toEqual(['paid', 'refunded', 'shipped']);
    expect(coloured['slices']?.colours?.['Other (4)']).toBeUndefined();
  });

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

/**
 * T465 (AC-039; UX-103): a single series colours by no member, so it claims
 * no slot and is drawn in the palette's first colour — never the neutral
 * direction.md §5 keeps for "Other" and null, which it fell to once a donut's
 * eight categories had taken every slot. And a colour a tile's Customize tab
 * chose for a member is that member's on every tile: it feeds the dashboard's
 * assignment, so a category is one colour everywhere.
 */
describe('a single series, and a colour chosen in one tile (T465)', () => {
  const CATEGORY = 'sales.category';
  const COUNTRY = 'sales.country';
  const REVENUE = 'sales.revenue';
  const categories = [
    'Beverages',
    'Condiments',
    'Confections',
    'Dairy Products',
    'Grains/Cereals',
    'Meat/Poultry',
    'Produce',
    'Seafood',
  ];
  const donut: RenderSpec = {
    chartType: 'donut',
    encoding: { x: [CATEGORY], y: [REVENUE] },
    rows: categories.map((category, index) => ({ [CATEGORY]: category, [REVENUE]: index + 1 })),
  };
  const byCountry: RenderSpec = {
    chartType: 'bar',
    encoding: { x: [COUNTRY], y: [REVENUE] },
    rows: [
      { [COUNTRY]: 'USA', [REVENUE]: 9 },
      { [COUNTRY]: 'Germany', [REVENUE]: 7 },
    ],
  };
  const page = (charts: readonly string[]): DashboardDocument => ({
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
  /** The colour each series of a drawn bar chart is filled with. */
  const barColours = (drawn: RenderSpec | undefined): (string | undefined)[] => {
    if (drawn === undefined) throw new Error('No spec was coloured');
    const series = optionFor(drawn).series as { itemStyle?: { color?: string } }[];
    return series.map((one) => one.itemStyle?.color);
  };

  it('draws a single-series bar in the palette’s first colour after a donut took every slot', () => {
    const { specs: coloured, assigned } = dashboardColours(page(['donut', 'bars']), {
      donut,
      bars: byCountry,
    });

    expect(barColours(coloured['bars'])).toEqual([DEFAULT_PALETTE[0]]);
    expect(barColours(coloured['bars'])).not.toContain(OTHER_COLOUR);
    // It claims nothing: only the donut's categories hold slots.
    expect(Object.keys(assigned).sort()).toEqual([...categories].sort());
  });

  it('draws a single-series bar in the palette’s first colour when it comes first, too', () => {
    const { specs: coloured } = dashboardColours(page(['bars', 'donut']), {
      bars: byCountry,
      donut,
    });

    expect(barColours(coloured['bars'])).toEqual([DEFAULT_PALETTE[0]]);
    // And the donut's first category still has the first slot, as alone.
    const alone = dashboardColours(page(['donut']), { donut });
    expect(coloured['donut']?.colours).toEqual(alone.specs['donut']?.colours);
  });

  it('gives a member the colour one tile chose for it on every other tile', () => {
    const chosen: RenderSpec = {
      chartType: 'area',
      encoding: { x: [COUNTRY], y: [REVENUE], color: [CATEGORY] },
      rows: [
        { [COUNTRY]: 'USA', [CATEGORY]: 'Beverages', [REVENUE]: 3 },
        { [COUNTRY]: 'USA', [CATEGORY]: 'Dairy Products', [REVENUE]: 2 },
      ],
      options: { series: { Beverages: { colour: '#1fa8c9' } } },
    };
    for (const order of [
      ['chosen', 'donut'],
      ['donut', 'chosen'],
    ]) {
      const { specs: coloured } = dashboardColours(page(order), { chosen, donut });

      expect(coloured['donut']?.colours?.['Beverages'], order.join(',')).toBe('#1fa8c9');
      expect(coloured['chosen']?.colours?.['Beverages'], order.join(',')).toBe('#1fa8c9');
      // A member no tile chose a colour for is still one colour everywhere.
      expect(coloured['donut']?.colours?.['Dairy Products'], order.join(',')).toBe(
        coloured['chosen']?.colours?.['Dairy Products'],
      );
    }
  });

  /**
   * T465's review: a chosen colour is the tile's setting, not a claim the
   * dashboard carries. Carried, it outlived its choice — Discard, Undo or
   * Customize's Auto took the setting away and every tile kept the colour.
   */
  const choosing = (colour?: string): RenderSpec => ({
    chartType: 'area',
    encoding: { x: [COUNTRY], y: [REVENUE], color: [CATEGORY] },
    rows: [
      { [COUNTRY]: 'USA', [CATEGORY]: 'Beverages', [REVENUE]: 3 },
      { [COUNTRY]: 'USA', [CATEGORY]: 'Dairy Products', [REVENUE]: 2 },
    ],
    ...(colour === undefined ? {} : { options: { series: { Beverages: { colour } } } }),
  });

  it('gives the member its own colour back once the choice is taken away', () => {
    const before = dashboardColours(page(['chosen', 'donut']), { chosen: choosing(), donut });
    const own = before.specs['donut']?.colours?.['Beverages'];
    expect(own).not.toBe('#1fa8c9');

    const chose = dashboardColours(
      page(['chosen', 'donut']),
      { chosen: choosing('#1fa8c9'), donut },
      before.assigned,
    );
    expect(chose.specs['donut']?.colours?.['Beverages']).toBe('#1fa8c9');
    // The carried assignment holds claims only, never a choice.
    expect(chose.assigned['Beverages']).toBe(own);

    // Discarded: the choice is gone, and so is its colour, on every tile.
    const discarded = dashboardColours(
      page(['chosen', 'donut']),
      { chosen: choosing(), donut },
      chose.assigned,
    );
    expect(discarded.specs['donut']?.colours?.['Beverages']).toBe(own);
    expect(discarded.specs['chosen']?.colours?.['Beverages']).toBe(own);
  });

  it('takes the chosen colour from the tile’s settings, not from what it happens to show', () => {
    // The choosing tile's rows don't hold Beverages yet — a filter hides it,
    // or its answer is still on its way — and the donut is coloured already.
    const hiding: RenderSpec = { ...choosing('#1fa8c9'), rows: [] };
    const first = dashboardColours(page(['chosen', 'donut']), { chosen: hiding, donut });
    expect(first.specs['donut']?.colours?.['Beverages']).toBe('#1fa8c9');

    const shown = dashboardColours(
      page(['chosen', 'donut']),
      { chosen: choosing('#1fa8c9'), donut },
      first.assigned,
    );
    // Nothing on screen changes colour when the member comes into view.
    expect(shown.specs['donut']?.colours).toEqual(first.specs['donut']?.colours);
  });

  it('draws a measure alone in the colour another tile gives it as one of several series', () => {
    const COUNT = 'sales.count';
    const both: RenderSpec = {
      chartType: 'line',
      encoding: { x: [COUNTRY], y: [REVENUE, COUNT] },
      rows: [{ [COUNTRY]: 'USA', [REVENUE]: 9, [COUNT]: 3 }],
    };
    const countAlone: RenderSpec = {
      chartType: 'bar',
      encoding: { x: [COUNTRY], y: [COUNT] },
      rows: [{ [COUNTRY]: 'USA', [COUNT]: 3 }],
    };
    for (const order of [
      ['both', 'alone'],
      ['alone', 'both'],
    ]) {
      const { specs: coloured, assigned } = dashboardColours(page(order), {
        both,
        alone: countAlone,
      });
      expect(barColours(coloured['alone']), order.join(',')).toEqual([assigned[COUNT]]);
      // Still claiming nothing of its own.
      expect(Object.keys(assigned).sort(), order.join(',')).toEqual([COUNT, REVENUE].sort());
    }
  });

  /**
   * T885's fix (AC-521, AC-039): a Text tile's sparkline is drawn in its
   * measure's dashboard colour as the dashboard's own assignment gives it —
   * the colour a tile chose for it, the colour a chart drawing it alone has,
   * else a slot of its own, two measures never sharing one.
   */
  describe('a Text tile’s sparkline (T885’s fix)', () => {
    const MARGIN = 'sales.margin';
    const sparklines = (...measures: string[]) => ({
      id: 'text',
      kind: 'text' as const,
      w: 6,
      h: 12,
      document: {
        version: 1 as const,
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: measures.map((measure) => ({ type: 'sparkline', attrs: { measure } })),
            },
          ],
        },
      },
    });
    const withText = (charts: readonly string[], ...measures: string[]): DashboardDocument => {
      const base = page(charts);
      const first = base.pages[0];
      if (first === undefined) throw new Error('No page');
      return { ...base, pages: [{ ...first, items: [...first.items, sparklines(...measures)] }] };
    };
    const several: RenderSpec = {
      chartType: 'line',
      encoding: { x: [COUNTRY], y: [REVENUE, 'sales.count'] },
      rows: [{ [COUNTRY]: 'USA', [REVENUE]: 9, 'sales.count': 3 }],
    };

    it('takes the colour a tile’s Customize tab chose for its measure', () => {
      const chose: RenderSpec = {
        ...several,
        options: { series: { [REVENUE]: { colour: '#1fa8c9' } } },
      };
      const { members } = dashboardColours(withText(['chose'], REVENUE), { chose });
      expect(members[REVENUE]).toBe('#1fa8c9');
    });

    it('gives two measures no chart colours two different slots', () => {
      const { members } = dashboardColours(withText(['donut'], REVENUE, MARGIN), {
        donut: { ...donut, rows: donut.rows.slice(0, 2) },
      });
      // The two slots after the donut's two categories, in text order.
      expect([members[REVENUE], members[MARGIN]]).toEqual(DEFAULT_PALETTE.slice(2, 4));
      expect(members[REVENUE]).toBe(DEFAULT_PALETTE[2]);
      expect(members[MARGIN]).toBe(DEFAULT_PALETTE[3]);
      expect(Object.keys(members).sort()).toEqual([MARGIN, REVENUE].sort());
    });

    it('keeps its slot from one call to the next, as a chart’s member does', () => {
      const first = dashboardColours(withText([], REVENUE, MARGIN), {});
      const again = dashboardColours(withText([], MARGIN, REVENUE), {}, first.assigned);
      expect(again.members).toEqual(first.members);
    });

    it('is the colour a single-series chart of its measure is drawn in', () => {
      const { specs: coloured, members } = dashboardColours(withText(['donut', 'bars'], REVENUE), {
        donut,
        bars: byCountry,
      });
      expect([members[REVENUE]]).toEqual(barColours(coloured['bars']));
    });

    it('is the colour a chart of several series gives its measure', () => {
      const { specs: coloured, members } = dashboardColours(withText(['several'], REVENUE), {
        several,
      });
      expect(members[REVENUE]).toBe(coloured['several']?.colours?.[REVENUE]);
    });
  });
});
