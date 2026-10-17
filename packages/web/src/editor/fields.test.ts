import { describe, expect, it } from 'vitest';

import {
  cubesFrom,
  fieldMetaOf,
  groupByCube,
  groupMembers,
  matchesSearch,
  measureTypesOf,
  membersOf,
  titlesOf,
} from './fields';

/**
 * AC-025: WHEN the user opens the chart editor, THE SYSTEM SHALL list the cubes
 * and views available from `/v1/meta` and, once one is chosen, its measures,
 * dimensions, segments and time dimensions grouped by type.
 * Fails when: a member present in the metadata is missing from the field list,
 * or a hidden member is shown.
 *
 * The fixture is the shape real Cube 1.7.42 returns, checked against the
 * running container rather than written from memory.
 */
const meta = {
  cubes: [
    {
      name: 'orders',
      type: 'cube',
      title: 'Orders',
      isVisible: true,
      public: true,
      description: 'One row per order line.',
      measures: [
        {
          name: 'orders.count',
          title: 'Orders Count',
          shortTitle: 'Count',
          type: 'number',
          isVisible: true,
          public: true,
        },
        {
          name: 'orders.hidden_total',
          title: 'Hidden',
          shortTitle: 'Hidden',
          type: 'number',
          isVisible: false,
          public: false,
        },
      ],
      dimensions: [
        {
          name: 'orders.status',
          title: 'Orders Status',
          shortTitle: 'Status',
          type: 'string',
          isVisible: true,
          public: true,
        },
        {
          name: 'orders.ordered_at',
          title: 'Orders Ordered at',
          shortTitle: 'Ordered at',
          type: 'time',
          isVisible: true,
          public: true,
        },
      ],
      segments: [
        {
          name: 'orders.completed',
          title: 'Completed',
          shortTitle: 'Completed',
          type: 'string',
          isVisible: true,
          public: true,
        },
      ],
    },
    {
      name: 'revenue_view',
      type: 'view',
      title: 'Revenue',
      isVisible: true,
      public: true,
      measures: [],
      dimensions: [],
      segments: [],
    },
    {
      name: 'internal',
      type: 'cube',
      title: 'Internal',
      isVisible: false,
      public: false,
      measures: [],
      dimensions: [],
      segments: [],
    },
  ],
};

describe('cubes and views (AC-025)', () => {
  it('lists both cubes and views', () => {
    expect(cubesFrom(meta).map((cube) => cube.name)).toEqual(['orders', 'revenue_view']);
  });

  it('marks which entries are views, since they are built differently', () => {
    expect(cubesFrom(meta).find((cube) => cube.name === 'revenue_view')?.isView).toBe(true);
    expect(cubesFrom(meta).find((cube) => cube.name === 'orders')?.isView).toBe(false);
  });

  it('omits a cube the model hides', () => {
    expect(cubesFrom(meta).map((cube) => cube.name)).not.toContain('internal');
  });

  it('survives metadata with no cubes', () => {
    expect(cubesFrom({ cubes: [] })).toEqual([]);
    expect(cubesFrom(null)).toEqual([]);
  });
});

describe('members of a cube (AC-025)', () => {
  it('lists every visible member', () => {
    expect(membersOf(meta, 'orders').map((member) => member.name)).toEqual([
      'orders.count',
      'orders.status',
      'orders.ordered_at',
      'orders.completed',
    ]);
  });

  it('omits a hidden member', () => {
    expect(membersOf(meta, 'orders').map((member) => member.name)).not.toContain(
      'orders.hidden_total',
    );
  });

  it('separates time dimensions from the other dimensions', () => {
    const members = membersOf(meta, 'orders');

    expect(members.find((member) => member.name === 'orders.ordered_at')?.kind).toBe(
      'timeDimension',
    );
    expect(members.find((member) => member.name === 'orders.status')?.kind).toBe('dimension');
  });

  it('returns nothing for a cube that is not in the metadata', () => {
    expect(membersOf(meta, 'nope')).toEqual([]);
  });
});

describe('grouping (AC-025)', () => {
  it('groups by type in a stable order', () => {
    const groups = groupMembers(membersOf(meta, 'orders'));

    expect(groups.map(([kind]) => kind)).toEqual([
      'measure',
      'dimension',
      'timeDimension',
      'segment',
    ]);
  });

  it('omits a group with no members rather than showing an empty heading', () => {
    const groups = groupMembers(membersOf(meta, 'revenue_view'));
    expect(groups).toEqual([]);
  });
});

/**
 * T229 / AC-215: THE SYSTEM SHALL group the chart editor's fields by the cube
 * they belong to, with a search box, and show on each field its role, its
 * aggregation, type or number of distinct values, and whether the chart uses
 * it … `Fails when: … the search does not narrow the list.`
 */
describe('fields by cube, searched, with what each is (AC-215)', () => {
  // A view's members, each with the cube member it stands for, as Cube 1.7.42
  // reports it (`aliasMember`, research/cube/data-modeling.md).
  const view = {
    cubes: [
      {
        name: 'order_summary',
        type: 'view',
        title: 'Order summary',
        measures: [
          {
            name: 'order_summary.count',
            title: 'Order summary Count',
            shortTitle: 'Count',
            type: 'number',
            aggType: 'count',
            aliasMember: 'orders.count',
          },
        ],
        dimensions: [
          {
            name: 'order_summary.category',
            title: 'Order summary Category',
            shortTitle: 'Category',
            type: 'string',
            aliasMember: 'products.category',
          },
          {
            name: 'order_summary.ordered_at',
            title: 'Order summary Ordered at',
            shortTitle: 'Ordered at',
            type: 'time',
            aliasMember: 'orders.ordered_at',
          },
        ],
      },
    ],
  };

  it('groups a view’s fields by the cube each comes from, then by type', () => {
    const grouped = groupByCube(membersOf(view, 'order_summary'));
    expect(
      grouped.map(([cube, kinds]) => [
        cube,
        kinds.map(([kind, members]) => [kind, members.map((member) => member.shortTitle)]),
      ]),
    ).toEqual([
      [
        'orders',
        [
          ['measure', ['Count']],
          ['timeDimension', ['Ordered at']],
        ],
      ],
      ['products', [['dimension', ['Category']]]],
    ]);
  });

  it('narrows by any part of a field’s titles or name, ignoring case', () => {
    const members = membersOf(view, 'order_summary');
    expect(members.filter((member) => matchesSearch(member, 'categ')).map((m) => m.name)).toEqual([
      'order_summary.category',
    ]);
    expect(members.filter((member) => matchesSearch(member, '  '))).toHaveLength(3);
  });

  it('says a measure’s aggregation, a time field’s “time”, a dimension’s type', () => {
    const [count, category, orderedAt] = membersOf(view, 'order_summary');
    expect([count, category, orderedAt].map((member) => member && fieldMetaOf(member))).toEqual([
      'count',
      'string',
      'time',
    ]);
  });
});

/**
 * T232 / AC-220: THE SYSTEM SHALL name every member by its title from the
 * model wherever a person reads it … and never by its internal name.
 * `Fails when: a legend, table header, pill, chip or trace shows a name such
 * as "orders.count".`
 *
 * The titles the editor's preview, results and trace are written with, from
 * every cube and view — a chart may name members of more than one.
 */
describe('every member’s title (AC-220)', () => {
  it('gives each shown member of every cube and view its title', () => {
    const summary = {
      name: 'order_summary',
      type: 'view',
      title: 'Order summary',
      measures: [{ name: 'order_summary.count', title: 'Order summary Count', type: 'number' }],
      dimensions: [
        { name: 'order_summary.category', title: 'Order summary Category', type: 'string' },
      ],
    };
    expect(titlesOf({ cubes: [...meta.cubes, summary] })).toEqual({
      'orders.count': 'Orders Count',
      'orders.status': 'Orders Status',
      'orders.ordered_at': 'Orders Ordered at',
      'orders.completed': 'Completed',
      'order_summary.count': 'Order summary Count',
      'order_summary.category': 'Order summary Category',
    });
  });
});

/**
 * T683 (DSH-02): an axis whose every measure is a count is ticked in whole
 * numbers, so the app hands the renderer each measure's aggregation, from
 * every cube and view. A measure whose aggregation the model doesn't say is
 * left out, and a dimension never appears.
 */
describe('every measure’s aggregation (T683, DSH-02)', () => {
  it('gives each shown measure of every cube and view its aggType, and nothing else', () => {
    const counted = {
      name: 'orders',
      type: 'cube',
      title: 'Orders',
      measures: [
        { name: 'orders.count', title: 'Orders Count', type: 'number', aggType: 'count' },
        { name: 'orders.total', title: 'Orders Total', type: 'number', aggType: 'sum' },
        { name: 'orders.ratio', title: 'Orders Ratio', type: 'number' },
      ],
      dimensions: [
        { name: 'orders.status', title: 'Orders Status', type: 'string', aggType: 'count' },
      ],
    };
    const summary = {
      name: 'order_summary',
      type: 'view',
      title: 'Order summary',
      measures: [
        {
          name: 'order_summary.customers',
          title: 'Order summary Customers',
          type: 'number',
          aggType: 'countDistinct',
        },
      ],
      dimensions: [],
    };
    expect(measureTypesOf({ cubes: [counted, summary] })).toEqual({
      'orders.count': 'count',
      'orders.total': 'sum',
      'order_summary.customers': 'countDistinct',
    });
  });

  it('is empty before the model has answered', () => {
    expect(measureTypesOf(undefined)).toEqual({});
  });
});
