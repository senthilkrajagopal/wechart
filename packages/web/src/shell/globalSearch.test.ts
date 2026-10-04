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

  /**
   * T478 (AC-220; UX-013, UX-102): found by its name as well as its title,
   * but said by titles only: its cube or view by title, never an id.
   */
  it('finds a field by its name as well as its title, and says where it lives by title', () => {
    const byName = globalResults('sales.rev', { catalog: [], meta, files });
    expect(byName).toHaveLength(1);
    expect(byName[0]?.type).toBe('Measure');
    expect(byName[0]?.title).toBe('Sales Revenue');
    expect(byName[0]?.detail).toBe('View Sales');
    expect(byName[0]?.href).toBe('/model/files/views%2Fsales.yml');
  });

  // T478: a cube without a title is said in words, never as its identifier.
  it('says a cube with no title in words, and never shows a member’s or cube’s id', () => {
    const untitled = {
      cubes: [
        {
          name: 'sales_lines',
          type: 'cube',
          measures: [{ name: 'sales_lines.revenue', title: 'Sales lines Revenue' }],
          dimensions: [{ name: 'sales_lines.order_date' }],
        },
      ],
    };
    const found = globalResults('sales', { catalog: [], meta: untitled, files: [] });
    expect(found.map(({ title, detail }) => [title, detail])).toEqual([
      ['Sales lines Revenue', 'Cube Sales lines'],
      ['Sales lines Order date', 'Cube Sales lines'],
    ]);
    for (const result of found) {
      expect(`${result.title} ${result.detail ?? ''}`).not.toMatch(/sales_lines|\w\.\w/);
    }
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

/**
 * T450, AC-329: a folder's cube is `fsales__orders` in Cube's field list and
 * `orders` in its folder. The palette names its fields by their short names
 * and says which folder the cube is in, never showing the prefixed name.
 */
describe('a folder’s fields (T450)', () => {
  const inFolder = {
    cubes: [
      {
        name: 'fsales__orders',
        title: 'Orders',
        type: 'cube',
        meta: { xcube: { folderId: 'fsales', shortName: 'orders' } },
        measures: [{ name: 'fsales__orders.count', title: 'Orders Count', shortTitle: 'Count' }],
        dimensions: [],
      },
    ],
  };
  const folders = [{ id: 's', title: 'Sales', parentId: 'root', xcubeId: 'fsales' }];

  it('names each by its short name and its cube’s folder path, never the prefixed name', () => {
    const found = globalResults('count', { catalog: [], meta: inFolder, files: [], folders });

    expect(found.map(({ type, title, detail }) => ({ type, title, detail }))).toEqual([
      {
        type: 'Measure',
        title: 'Orders Count',
        detail: 'Cube Orders · Shared / Sales',
      },
    ]);
    // Found by its short name too, and by nothing that shows the prefix.
    expect(
      globalResults('orders.count', { catalog: [], meta: inFolder, files: [], folders }),
    ).toHaveLength(1);
    expect(globalResults('fsales', { catalog: [], meta: inFolder, files: [], folders })).toEqual(
      [],
    );
  });

  // T530 (AC-222): opened in its folder's model, never the root's Model workspace.
  it('opens a folder cube’s field in its folder’s model', () => {
    const [found] = globalResults('count', { catalog: [], meta: inFolder, files: [], folders });
    expect(found?.href).toBe('/explore/folders/s/models');
  });

  // Every item xcube serves carries `meta.xcube`; the root's is `froot`,
  // named as it was before folders (T450's review).
  it('names a root item’s fields with no folder path, its cube by title (T478)', () => {
    const atRoot = {
      cubes: [
        {
          name: 'orders',
          title: 'Orders',
          type: 'cube',
          meta: { xcube: { folderId: 'froot', shortName: 'orders' } },
          measures: [{ name: 'orders.count', title: 'Orders Count', shortTitle: 'Count' }],
          dimensions: [],
        },
      ],
    };

    expect(
      globalResults('count', { catalog: [], meta: atRoot, files: [], folders }).map(
        ({ detail }) => detail,
      ),
    ).toEqual(['Cube Orders']);
  });
});
