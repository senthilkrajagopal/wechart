import { describe, expect, it } from 'vitest';

import { answerRebound, memberBack, rebindsOf, reboundQuery } from './rebind';

/**
 * T542 (AC-281; the user's answer "Rebind in the workspace", R53): in a
 * workspace's previews, a name an item already holds, bound to a path's
 * cube, is resolved again by its short name through the overlay, so the
 * workspace's own cube of that name answers. The answer comes back under the
 * names the item holds, so its tiles read it as they always did.
 */
/**
 * A rename map, as the mechanics below take one: each stored name to the
 * overlay's own. Under one name per item (T709) `rebindsOf` maps each name
 * to itself (below), so these names are the mechanics' alone; T716 retires
 * the module.
 */
const OWN: ReadonlyMap<string, string> = new Map([
  ['fsales__orders', 'fops__orders'],
  ['fsales__regions', 'regions'],
  ['orders', 'fops__orders'],
]);

describe('rebinding a query through an overlay (T542, AC-281)', () => {
  // T709, AC-328: an overlay's item is served under its own name wherever it
  // places it, standing in for the published item of that name.
  it('maps each of its own cubes to its own name, wherever it places it', () => {
    expect([
      ...rebindsOf([
        { folderId: 'fops', name: 'orders' },
        { folderId: 'froot', name: 'regions' },
      ]),
    ]).toEqual([
      ['orders', 'orders'],
      ['regions', 'regions'],
    ]);
  });

  it('names the overlay’s own cube in place of a path’s of its name, wherever the query names it', () => {
    const { query, back } = reboundQuery(
      {
        measures: ['fsales__orders.count'],
        dimensions: ['fsales__regions.name', 'customers.city'],
        segments: ['fsales__orders.big'],
        timeDimensions: [{ dimension: 'fsales__orders.ordered_at', granularity: 'month' }],
        filters: [
          { member: 'fsales__orders.status', operator: 'equals', values: ['fsales__orders.x'] },
          { or: [{ member: 'fsales__regions.name', operator: 'set' }] },
        ],
        order: [['fsales__orders.count', 'desc']],
        joinHints: [['fsales__orders', 'fsales__regions']],
        limit: 10,
      },
      OWN,
    );
    expect(query).toEqual({
      measures: ['fops__orders.count'],
      dimensions: ['regions.name', 'customers.city'],
      segments: ['fops__orders.big'],
      timeDimensions: [{ dimension: 'fops__orders.ordered_at', granularity: 'month' }],
      filters: [
        // A filter's values are data, never names.
        { member: 'fops__orders.status', operator: 'equals', values: ['fsales__orders.x'] },
        { or: [{ member: 'regions.name', operator: 'set' }] },
      ],
      order: [['fops__orders.count', 'desc']],
      joinHints: [['fops__orders', 'regions']],
      limit: 10,
    });
    // Each member asked as, under the names the item asked it by (T542's review).
    expect([...back]).toEqual([
      ['fops__orders.count', ['fsales__orders.count']],
      ['regions.name', ['fsales__regions.name']],
      ['customers.city', ['customers.city']],
      ['fops__orders.big', ['fsales__orders.big']],
      ['fops__orders.ordered_at', ['fsales__orders.ordered_at']],
      ['fops__orders.status', ['fsales__orders.status']],
      ['fops__orders', ['fsales__orders']],
      ['regions', ['fsales__regions']],
    ]);
  });

  it('leaves a query naming none of the overlay’s names, or its own already, as it is', () => {
    const query = {
      measures: ['fops__orders.count', 'customers.count'],
      order: { 'customers.count': 'asc' },
    };
    expect(reboundQuery(query, OWN)).toEqual({ query, back: new Map() });
    expect(reboundQuery(query, new Map())).toEqual({ query, back: new Map() });
  });

  // T542's review: a chart drawn before the workspace's cube, given a member after.
  it('answers each member under every name asked, where a query names both a stored name and the overlay’s own', () => {
    const { query, back } = reboundQuery(
      {
        measures: ['fsales__orders.count', 'fops__orders.total', 'fops__orders.count'],
        timeDimensions: [{ dimension: 'fsales__orders.ordered_at', granularity: 'month' }],
      },
      OWN,
    );
    // Asked once each.
    expect(query).toEqual({
      measures: ['fops__orders.count', 'fops__orders.total'],
      timeDimensions: [{ dimension: 'fops__orders.ordered_at', granularity: 'month' }],
    });
    expect(
      answerRebound(
        {
          data: [
            {
              'fops__orders.count': '3',
              'fops__orders.total': '9',
              'fops__orders.ordered_at.month': '2026-01-01',
              'fops__orders.ordered_at': '2026-01-01',
            },
          ],
          annotation: { measures: { 'fops__orders.total': { title: 'Total' } } },
        },
        back,
      ),
    ).toEqual({
      data: [
        {
          'fsales__orders.count': '3',
          'fops__orders.count': '3',
          'fops__orders.total': '9',
          'fsales__orders.ordered_at.month': '2026-01-01',
          'fsales__orders.ordered_at': '2026-01-01',
        },
      ],
      // The item's own name for the member it asked as the overlay's.
      annotation: { measures: { 'fops__orders.total': { title: 'Total' } } },
    });
  });

  it('renames an order given as an object', () => {
    expect(
      reboundQuery({ measures: ['orders.count'], order: { 'orders.count': 'desc' } }, OWN).query,
    ).toEqual({ measures: ['fops__orders.count'], order: { 'fops__orders.count': 'desc' } });
  });

  it('answers under the names the item holds: its rows, annotation and query', () => {
    const back = new Map([
      ['fops__orders.count', ['fsales__orders.count']],
      ['fops__orders.ordered_at', ['fsales__orders.ordered_at']],
    ]);
    expect(
      answerRebound(
        {
          query: { measures: ['fops__orders.count'] },
          data: [{ 'fops__orders.count': '3', 'fops__orders.ordered_at.month': '2026-01-01' }],
          annotation: {
            measures: { 'fops__orders.count': { title: 'Orders Count' } },
            dimensions: {},
            segments: {},
            timeDimensions: { 'fops__orders.ordered_at.month': { title: 'Ordered at' } },
          },
          lastRefreshTime: '2026-10-01T00:00:00.000Z',
        },
        back,
      ),
    ).toEqual({
      query: { measures: ['fsales__orders.count'] },
      data: [{ 'fsales__orders.count': '3', 'fsales__orders.ordered_at.month': '2026-01-01' }],
      annotation: {
        measures: { 'fsales__orders.count': { title: 'Orders Count' } },
        dimensions: {},
        segments: {},
        timeDimensions: { 'fsales__orders.ordered_at.month': { title: 'Ordered at' } },
      },
      lastRefreshTime: '2026-10-01T00:00:00.000Z',
    });
    // Each of a query Cube runs as several.
    expect(answerRebound({ results: [{ data: [{ 'fops__orders.count': '1' }] }] }, back)).toEqual({
      results: [{ data: [{ 'fsales__orders.count': '1' }] }],
    });
    // Nothing to rename: the answer itself.
    const answer = { data: [{ 'a.b': 1 }] };
    expect(answerRebound(answer, new Map())).toBe(answer);
    // One member, as the acceleration panel names the one that stops a rollup.
    expect(memberBack('fops__orders.count', back)).toBe('fsales__orders.count');
    expect(memberBack('customers.count', back)).toBe('customers.count');
  });

  /**
   * AC-048: a quick calculation names its measure in the query's
   * `calculations` block, and xcube answers it under its companion's column,
   * `<measure>__xc_<calculation>` (research `xcube-quick-calcs.md`). Rebound,
   * the block names the overlay's own measure, and the column comes back
   * under the item's name for it, so the chart reads it as the measure.
   */
  it('rebinds a quick calculation’s measure, and answers its column under the item’s name', () => {
    const { query, back } = reboundQuery(
      {
        measures: ['fsales__orders.count', 'customers.count'],
        calculations: [
          { measure: 'fsales__orders.count', kind: 'running_total' },
          { measure: 'customers.count', kind: 'rank' },
        ],
      },
      OWN,
    );
    expect(query['calculations']).toEqual([
      { measure: 'fops__orders.count', kind: 'running_total' },
      { measure: 'customers.count', kind: 'rank' },
    ]);
    expect(
      answerRebound(
        {
          data: [{ 'fops__orders.count__xc_running_total': '30', 'customers.count__xc_rank': '1' }],
          annotation: {
            measures: {
              'fops__orders.count__xc_running_total': { title: 'Count (running total)' },
            },
          },
        },
        back,
      ),
    ).toEqual({
      data: [{ 'fsales__orders.count__xc_running_total': '30', 'customers.count__xc_rank': '1' }],
      annotation: {
        measures: { 'fsales__orders.count__xc_running_total': { title: 'Count (running total)' } },
      },
    });
  });
});
