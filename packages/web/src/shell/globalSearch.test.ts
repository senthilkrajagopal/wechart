import { describe, expect, it } from 'vitest';

import { globalResults } from './globalSearch';

/**
 * T211 / AC-191: WHEN the user types in the search palette, THE SYSTEM SHALL
 * list the matching dashboards, library charts, Cube fields and model files,
 * each with its type (R9: "Dashboards, charts, fields and models").
 * `Fails when: a matching field or model file is missing, a result has no
 * type, …`
 */
const meta = {
  cubes: [
    {
      name: 'orders',
      type: 'cube',
      measures: [{ name: 'orders.count', title: 'Orders Count', shortTitle: 'Count' }],
      dimensions: [
        { name: 'orders.status', title: 'Orders Status', shortTitle: 'Status' },
        { name: 'orders.secret', title: 'Orders Secret', shortTitle: 'Secret', public: false },
      ],
    },
    {
      name: 'sales',
      type: 'view',
      measures: [{ name: 'sales.revenue', title: 'Sales Revenue', shortTitle: 'Revenue' }],
      dimensions: [],
    },
  ],
};
const files = [
  { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n    sql_table: public.orders\n' },
  { path: 'views/sales.yml', content: 'views:\n  - name: sales\n    cubes: []\n' },
];
const catalog = [
  { kind: 'dashboard' as const, id: 'd1', title: 'Order status board' },
  { kind: 'chart' as const, id: 'c1', title: 'Orders by status' },
];

describe('what the palette finds', () => {
  const found = globalResults('status', { catalog, meta, files });

  it('finds dashboards, charts and fields, each with its type', () => {
    expect(found.map((result) => [result.type, result.title])).toEqual([
      ['Dashboard', 'Order status board'],
      ['Chart', 'Orders by status'],
      ['Dimension', 'Orders Status'],
    ]);
  });

  it('opens a dashboard or chart at its page, and a field at the file defining its cube', () => {
    expect(found.map((result) => result.href)).toEqual([
      '/explore/dashboards/d1',
      '/explore/charts/c1',
      '/model/files/cubes%2Forders.yml',
    ]);
  });

  it('finds a model file by its path', () => {
    expect(
      globalResults('views/', { catalog: [], meta, files }).map((result) => [
        result.type,
        result.title,
      ]),
    ).toEqual([['Model file', 'views/sales.yml']]);
  });

  it('finds a field by its name as well as its title, and says where it lives', () => {
    const byName = globalResults('sales.rev', { catalog: [], meta, files });
    expect(byName).toHaveLength(1);
    expect(byName[0]?.type).toBe('Measure');
    expect(byName[0]?.detail).toBe('sales.revenue · view sales');
    expect(byName[0]?.href).toBe('/model/files/views%2Fsales.yml');
  });

  it('leaves out a field the model keeps private', () => {
    expect(globalResults('secret', { catalog: [], meta, files })).toHaveLength(0);
  });

  it('lists every matching field, not the first twenty (T211 review)', () => {
    // AC-191's failing state is "a matching field is missing"; a silent cap
    // at twenty was exactly that for any short search in a real model.
    const wide = {
      cubes: [
        {
          name: 'wide',
          type: 'cube',
          measures: Array.from({ length: 30 }, (_, index) => ({
            name: `wide.metric_${String(index)}`,
            title: `Wide Metric ${String(index)}`,
          })),
          dimensions: [],
        },
      ],
    };
    expect(globalResults('metric', { catalog: [], meta: wide, files: [] })).toHaveLength(30);
  });

  it('leaves out every member of a cube or view the model hides', () => {
    const hidden = {
      cubes: [
        {
          name: 'internal',
          type: 'cube',
          isVisible: false,
          measures: [{ name: 'internal.count', title: 'Internal Count' }],
          dimensions: [],
        },
      ],
    };
    expect(globalResults('count', { catalog: [], meta: hidden, files: [] })).toHaveLength(0);
  });

  it('finds nothing for blank text', () => {
    expect(globalResults('  ', { catalog, meta, files })).toHaveLength(0);
  });
});
