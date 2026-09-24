import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../dashboard/model/document';
import type { ActiveFilter } from './apply';
import { coverageOf, reachFrom } from './coverage';

/**
 * T085 / AC-079: WHEN a filter's member is not reachable from a tile's cube or
 * view, THE SYSTEM SHALL leave that tile unfiltered and mark it as not covered
 * by the filter.
 * Fails when: the tile shows a query error, or is silently left unfiltered
 * with no indication.
 *
 * Reachable, from Cube's `/v1/meta` (docs/research/cube/data-apis.md): a
 * member of the tile's own cube or view; between two cubes, one with the same
 * `connectedComponent` — "at least one join path between them"; and a view
 * through its own name for a cube member, its member whose `aliasMember` is
 * that member (observed against Cube v1.7.42). The answer is the member to
 * filter the tile's query by.
 */
const member = (name: string, aliasMember?: string) => ({
  name,
  title: name,
  shortTitle: name,
  type: 'string',
  ...(aliasMember === undefined ? {} : { aliasMember }),
});
const META = {
  cubes: [
    {
      name: 'orders',
      type: 'cube',
      connectedComponent: 1,
      measures: [member('orders.count')],
      dimensions: [member('orders.status')],
      segments: [],
    },
    {
      name: 'products',
      type: 'cube',
      connectedComponent: 1,
      measures: [],
      dimensions: [member('products.category')],
      segments: [],
    },
    {
      name: 'weather',
      type: 'cube',
      connectedComponent: 2,
      measures: [member('weather.count')],
      dimensions: [member('weather.city')],
      segments: [],
    },
    {
      name: 'order_summary',
      type: 'view',
      measures: [member('order_summary.count', 'orders.count')],
      dimensions: [member('order_summary.status', 'orders.status')],
      segments: [],
    },
  ],
};

describe('whether a filter’s field reaches a tile’s cube or view', () => {
  const reaches = reachFrom(META);

  it('its own cube, by the field itself', () => {
    expect(reaches('orders.status', 'orders')).toBe('orders.status');
  });

  /**
   * Found by T085's review: the same `connectedComponent` is necessary, not
   * sufficient — the component ignores direction, Cube's joins do not, and
   * the seed's customers and products share one yet cannot be joined
   * (docs/research/cube/markings-query-support.md, Q4). So between two cubes
   * the model can only rule out; Cube answers the rest.
   */
  it('cannot say between two cubes in one join component — Cube answers that', () => {
    expect(reaches('orders.status', 'products')).toBeUndefined();
    expect(reaches('products.category', 'orders')).toBeUndefined();
  });

  it('not a cube in another join component', () => {
    expect(reaches('orders.status', 'weather')).toBe(false);
    expect(reaches('weather.city', 'orders')).toBe(false);
  });

  it('a view by its own members, and by its own name for a cube’s member', () => {
    expect(reaches('order_summary.status', 'order_summary')).toBe('order_summary.status');
    expect(reaches('orders.status', 'order_summary')).toBe('order_summary.status');
  });

  it('not a view that does not offer the field, nor a cube from a view’s member', () => {
    expect(reaches('products.category', 'order_summary')).toBe(false);
    expect(reaches('order_summary.status', 'orders')).toBe(false);
  });

  it('not from a field the model no longer has', () => {
    expect(reaches('orders.gone', 'orders')).toBe(false);
  });

  it('cannot say for a cube or view the model does not have, or before the model arrives', () => {
    expect(reaches('orders.status', 'nowhere')).toBeUndefined();
    expect(reachFrom(undefined)('orders.status', 'orders')).toBeUndefined();
  });

  it('cannot say when the model reports no join components at all', () => {
    /**
     * A model that says nothing about components — a different Cube version,
     * or one read before the joins were compiled — is telling us nothing.
     * Reading that as "every cube is isolated" would stop every filter
     * reaching every tile, which is the worse mistake of the two.
     */
    const unknown = reachFrom({
      cubes: META.cubes.map((cube) => ({ ...cube, connectedComponent: undefined })),
    });
    expect(unknown('orders.status', 'orders')).toBe('orders.status');
    expect(unknown('orders.status', 'products')).toBeUndefined();
  });

  it('rules out a cube that is in no join graph, where others are', () => {
    /**
     * Cube omits `connectedComponent` for a cube with no joins — verified
     * against v1.7.42 (`research/cube/markings-query-support.md` §4.5) — so
     * where other cubes report one, its absence says this cube reaches
     * nothing but its own members (AC-079, AC-103).
     */
    const alone = reachFrom({
      cubes: [
        ...META.cubes,
        {
          name: 'monthly',
          type: 'cube',
          measures: [member('monthly.count')],
          dimensions: [member('monthly.status')],
          segments: [],
        },
      ],
    });

    expect(alone('orders.status', 'monthly')).toBe(false);
    // Its own member is still its own.
    expect(alone('monthly.status', 'monthly')).toBe('monthly.status');
    // And a joined pair is unaffected: same component, so Cube decides.
    expect(alone('orders.status', 'products')).toBeUndefined();
  });
});

describe('which tiles a filter covers', () => {
  const DOC: DashboardDocument = {
    schemaVersion: 1,
    title: 'Sales',
    settings: { width: 'full' },
    pages: [
      {
        id: 'p1',
        title: 'Overview',
        items: [
          { id: 't-orders', kind: 'chart', chartId: 'c-orders', w: 4 },
          { id: 't-weather', kind: 'chart', chartId: 'c-weather', w: 4 },
          { id: 't-summary', kind: 'chart', chartId: 'c-summary', w: 4 },
        ],
      },
    ],
  };
  const sources: Record<string, string> = {
    'c-orders': 'orders',
    'c-weather': 'weather',
    'c-summary': 'order_summary',
  };
  const status: ActiveFilter = {
    filter: { id: 'f1', widget: 'list', member: 'orders.status' },
    value: { kind: 'values', values: ['completed'] },
  };

  it('filters the charts it may reach — a view by its own name for the field — and marks those it cannot', () => {
    const { reached, notCovered } = coverageOf(DOC, [status], (field, chartId) =>
      reachFrom(META)(field, sources[chartId] ?? ''),
    );
    expect(
      Object.fromEntries(
        Object.entries(reached).map(([chartId, filters]) => [
          chartId,
          filters.map((each) => each.filter.member),
        ]),
      ),
    ).toEqual({ 'c-orders': ['orders.status'], 'c-summary': ['order_summary.status'] });
    expect(
      Object.fromEntries(
        Object.entries(notCovered).map(([chartId, filters]) => [
          chartId,
          filters.map((each) => each.filter.id),
        ]),
      ),
    ).toEqual({ 'c-weather': ['f1'] });
  });

  /**
   * Found by T085's review: held back until the model could say, a filter
   * did nothing at all while the model loaded, or ever if it failed, and a
   * cube the model could not place was left unfiltered with nothing said.
   * Asked instead, Cube's own answer decides: a join it cannot build comes
   * back as such, and the tile is marked then (`FilteredCharts`).
   */
  it('filters a chart it cannot yet say about, as it is, for Cube to answer', () => {
    const { reached, notCovered } = coverageOf(DOC, [status], () => undefined);
    expect(Object.keys(reached)).toEqual(['c-orders', 'c-weather', 'c-summary']);
    expect(reached['c-weather']?.[0]?.filter.member).toBe('orders.status');
    expect(notCovered).toEqual({});
  });

  it('marks nothing out of the filter’s scope', () => {
    const onOrders: ActiveFilter = {
      ...status,
      filter: { ...status.filter, scope: { kind: 'tiles', tileIds: ['t-orders'] } },
    };
    const { notCovered } = coverageOf(DOC, [onOrders], (field, chartId) =>
      reachFrom(META)(field, sources[chartId] ?? ''),
    );
    expect(notCovered).toEqual({});
  });
});
