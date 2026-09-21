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

  it('its own cube, and a cube joined to it, by the field itself', () => {
    expect(reaches('orders.status', 'orders')).toBe('orders.status');
    expect(reaches('orders.status', 'products')).toBe('orders.status');
    expect(reaches('products.category', 'orders')).toBe('products.category');
  });

  it('not a cube with no join path to it', () => {
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

  it('cannot say between two cubes whose join components it does not know', () => {
    const unknown = reachFrom({
      cubes: META.cubes.map((cube) => ({ ...cube, connectedComponent: undefined })),
    });
    expect(unknown('orders.status', 'orders')).toBe('orders.status');
    expect(unknown('orders.status', 'products')).toBeUndefined();
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

  it('filters the charts it reaches — a view by its own name for the field — and marks the rest', () => {
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

  it('neither filters nor marks a chart it cannot yet say about', () => {
    const { reached, notCovered } = coverageOf(DOC, [status], () => undefined);
    expect(reached).toEqual({});
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
