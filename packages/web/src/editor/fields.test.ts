import { describe, expect, it } from 'vitest';

import { cubesFrom, groupMembers, membersOf } from './fields';

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
