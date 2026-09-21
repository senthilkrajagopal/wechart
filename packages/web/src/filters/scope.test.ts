import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../dashboard/model/document';
import type { DashboardFilter } from './model';
import { chartTilesOf, inScope, scopeLabel, scopeOf } from './scope';

/**
 * T083 / AC-077: WHEN a filter is added, THE SYSTEM SHALL scope it to the
 * dashboard, a page tab or named tiles, and show its scope on the widget
 * (direction.md rule 14).
 * Fails when: the widget does not show its scope, or a tab-scoped filter
 * changes a tile on another tab.
 *
 * What is in a filter's scope. Which tiles a value then re-queries is AC-078's.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      items: [
        { id: 't-revenue', kind: 'chart', chartId: 'c-revenue', w: 6 },
        { id: 't-note', kind: 'markdown', text: 'Hi', w: 6 },
        {
          id: 's1',
          kind: 'section',
          title: 'More',
          items: [
            {
              id: 'g1',
              kind: 'tabs',
              w: 12,
              tabs: [
                {
                  id: 'a',
                  title: 'A',
                  items: [{ id: 't-a', kind: 'chart', chartId: 'c-a', w: 6 }],
                },
                {
                  id: 'b',
                  title: 'B',
                  items: [{ id: 't-b', kind: 'chart', chartId: 'c-b', w: 6 }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'ops',
      title: 'Operations',
      items: [{ id: 't-orders', kind: 'chart', chartId: 'c-orders', w: 12 }],
    },
  ],
};

const filter = (scope?: DashboardFilter['scope']): DashboardFilter => ({
  id: 'f1',
  widget: 'list',
  member: 'orders.status',
  ...(scope === undefined ? {} : { scope }),
});

describe('a filter’s scope', () => {
  it('is the whole dashboard until it is given another', () => {
    expect(scopeOf(filter())).toEqual({ kind: 'dashboard' });
  });

  it('lists every chart tile, on every page and in every tab of a tab group', () => {
    expect(chartTilesOf(DOC).map((tile) => [tile.tileId, tile.pageId])).toEqual([
      ['t-revenue', 'overview'],
      ['t-a', 'overview'],
      ['t-b', 'overview'],
      ['t-orders', 'ops'],
    ]);
  });

  it('on the dashboard, reaches every chart tile', () => {
    expect(chartTilesOf(DOC).filter((tile) => inScope(filter(), tile))).toHaveLength(4);
  });

  it('on a tab, reaches that tab’s tiles and none on another tab', () => {
    const onOverview = filter({ kind: 'page', pageId: 'overview' });
    expect(
      chartTilesOf(DOC)
        .filter((tile) => inScope(onOverview, tile))
        .map((tile) => tile.tileId),
    ).toEqual(['t-revenue', 't-a', 't-b']);
  });

  it('on named tiles, reaches those tiles only', () => {
    const named = filter({ kind: 'tiles', tileIds: ['t-b', 't-orders'] });
    expect(
      chartTilesOf(DOC)
        .filter((tile) => inScope(named, tile))
        .map((tile) => tile.tileId),
    ).toEqual(['t-b', 't-orders']);
  });
});

describe('what the widget says its scope is', () => {
  const titles: Record<string, string> = {
    'c-revenue': 'Revenue by month',
    'c-orders': 'Orders by status',
    'c-a': 'Top products',
  };
  const label = (scope?: DashboardFilter['scope']) =>
    scopeLabel(filter(scope), DOC, (chartId) => titles[chartId]);

  it('names the dashboard, the tab, or the tiles', () => {
    expect(label()).toBe('Dashboard');
    expect(label({ kind: 'page', pageId: 'ops' })).toBe('Tab: Operations');
    expect(label({ kind: 'tiles', tileIds: ['t-orders'] })).toBe('Tile: Orders by status');
    expect(label({ kind: 'tiles', tileIds: ['t-revenue', 't-orders'] })).toBe(
      'Tiles: Revenue by month, Orders by status',
    );
  });

  it('says so when what it names is gone, or when it names nothing', () => {
    expect(label({ kind: 'page', pageId: 'deleted' })).toBe('Tab: no longer on the dashboard');
    expect(label({ kind: 'tiles', tileIds: [] })).toBe('No tiles chosen');
    // A tile deleted since is left out, not named.
    expect(label({ kind: 'tiles', tileIds: ['t-gone', 't-orders'] })).toBe(
      'Tile: Orders by status',
    );
  });

  it('names a chart with no title as untitled', () => {
    expect(label({ kind: 'tiles', tileIds: ['t-b'] })).toBe('Tile: Untitled chart');
  });
});
