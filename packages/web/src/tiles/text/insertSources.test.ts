import { describe, expect, it } from 'vitest';

import type { DashboardDocument } from '../../dashboard/model/document';
import { insertSourcesOf } from './insertSources';

/**
 * T881 / AC-517: the insert menu adds "the measures of the dashboard's
 * cubes, grouped by cube" — the cubes its charts and Text elements name —
 * and offers its markings and filters as the sources of those kinds
 * (decision T881-1).
 */
const MODEL = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [
        { name: 'orders.revenue', title: 'Orders Revenue', shortTitle: 'Revenue' },
        { name: 'orders.count', title: 'Orders Count', shortTitle: 'Count' },
      ],
      dimensions: [{ name: 'orders.country', title: 'Orders Country', type: 'string' }],
    },
    {
      name: 'products',
      title: 'Products',
      measures: [{ name: 'products.count', title: 'Products Count', shortTitle: 'Count' }],
    },
    { name: 'people', title: 'People', measures: [{ name: 'people.count', shortTitle: 'Count' }] },
  ],
};

const dashboard = (items: DashboardDocument['pages'][number]['items']): DashboardDocument => ({
  schemaVersion: 1,
  title: 'D',
  settings: { width: 'fixed' },
  markings: [{ id: 'm1', name: 'Picks', slot: 'mk1', isDefault: true }],
  filters: [
    { id: 'f1', widget: 'list', member: 'orders.country' },
    { id: 'f2', widget: 'list' },
  ],
  pages: [{ id: 'p', title: 'P', items }],
});

describe('what the insert menu offers (T881, AC-517)', () => {
  it('lists the measures of the cubes the dashboard’s charts and Text elements name, by cube', () => {
    const sources = insertSourcesOf({
      model: MODEL,
      dashboard: dashboard([
        {
          id: 't',
          kind: 'text',
          w: 6,
          h: 6,
          document: {
            version: 1,
            doc: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'value', attrs: { measure: 'products.count' } }],
                },
              ],
            },
          },
        },
      ]),
      documents: { c1: { chart: { metrics: ['orders.revenue'] } } },
      memberTitle: (member) => (member === 'orders.country' ? 'Country' : undefined),
    });
    expect(sources.cubes).toEqual([
      {
        name: 'orders',
        title: 'Orders',
        measures: [
          { name: 'orders.revenue', title: 'Revenue' },
          { name: 'orders.count', title: 'Count' },
        ],
        // Its string fields, which an element's own filter is on (checkpoint 2).
        // (Its short title: this model gives the field none, so its title.)
        dimensions: [{ name: 'orders.country', title: 'Orders Country' }],
      },
      {
        name: 'products',
        title: 'Products',
        measures: [{ name: 'products.count', title: 'Count' }],
        dimensions: [],
      },
    ]);
    expect(sources.markings).toEqual([{ name: 'Picks' }]);
    // A filter with no field yet has nothing to show.
    expect(sources.filters).toEqual([{ id: 'f1', name: 'Country' }]);
  });

  it('lists every cube’s measures while the dashboard names none', () => {
    const sources = insertSourcesOf({ model: MODEL, dashboard: dashboard([]), documents: {} });
    expect(sources.cubes.map((cube) => cube.name)).toEqual(['orders', 'products', 'people']);
  });
});
