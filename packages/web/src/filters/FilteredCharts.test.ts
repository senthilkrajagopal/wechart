import type { ChartDocument } from '@wechart/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { filteredChart } from './FilteredCharts';
import type { ActiveFilter } from './apply';

/**
 * T119's review (AC-113, AC-079): a filter made from a marking can name
 * members of several cubes — a marked bar of status by category is
 * `orders.status` and `products.category` — and Cube refuses the whole query
 * when one of them has no join path to the chart's cube. The filter is then
 * left off that tile and reported, as a dashboard filter is, rather than
 * failing the tile.
 */
describe('a filter made from a marking that Cube cannot join to a tile', () => {
  const customers: ChartDocument = {
    schemaVersion: 1,
    title: 'Customers',
    chart: {
      source: { cube: 'customers' },
      wells: { measures: ['customers.count'], dimensions: [], timeDimensions: [] },
      chartType: 'kpi',
    },
  };
  /** Its first member is on the chart's own cube; its second is not. */
  const marked: ActiveFilter = {
    filter: { id: 'mark:m1', widget: 'checkbox', member: 'customers.country' },
    value: {
      kind: 'cube',
      filter: {
        and: [
          { member: 'customers.country', operator: 'equals', values: ['Norway'] },
          { member: 'products.category', operator: 'equals', values: ['Toys'] },
        ],
      },
      words: 'only Norway, Toys',
    },
  };
  const asked: Record<string, unknown>[] = [];

  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const { query } = JSON.parse(String(init?.body)) as { query: Record<string, unknown> };
        asked.push(query);
        if (JSON.stringify(query['filters'] ?? []).includes('products.category'))
          return new Response(
            JSON.stringify({
              type: 'UserError',
              error: "Can't find join path to join 'customers', 'products'",
            }),
            { status: 400 },
          );
        return new Response(JSON.stringify({ data: [{ 'customers.count': 4 }] }));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is left off the tile and reported, and the tile draws', async () => {
    const answer = await filteredChart(customers, [marked], new AbortController().signal);

    expect(answer.uncovered).toEqual(['mark:m1']);
    expect(answer.chart).toBeUndefined();
    expect(asked).toHaveLength(1);
  });

  it('takes a dashboard filter beside it that Cube can join with it no further', async () => {
    const country: ActiveFilter = {
      filter: { id: 'f-country', widget: 'checkbox', member: 'customers.country' },
      value: { kind: 'values', values: ['Norway'] },
    };
    const answer = await filteredChart(customers, [country, marked], new AbortController().signal);

    expect(answer.uncovered).toEqual(['mark:m1']);
    expect(answer.chart !== undefined && 'spec' in answer.chart).toBe(true);
    expect(asked[1]?.['filters']).toEqual([
      { member: 'customers.country', operator: 'equals', values: ['Norway'] },
    ]);
  });
});
