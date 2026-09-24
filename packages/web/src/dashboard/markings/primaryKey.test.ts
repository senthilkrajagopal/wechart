import { describe, expect, it } from 'vitest';

import { primaryKeyOf } from './primaryKey';

/**
 * T190 / AC-092, its second half: "rows SHALL be markable only when the
 * cube's primary key is available (direction.md rule 10 of §7a)".
 * `Fails when: Shift-click marks a single row, or rows are markable without a
 * primary key.`
 *
 * A marked row is stored as that row's identity, so without a key there is
 * nothing to store: `references-markings.md` quotes Spotfire on the same
 * rule. Cube says which dimension it is — `primaryKey: true` in `/v1/meta`
 * (`docs/research/cube/data-apis.md`).
 */
const meta = {
  cubes: [
    {
      name: 'orders',
      dimensions: [
        { name: 'orders.id', type: 'string', primaryKey: true },
        { name: 'orders.status', type: 'string' },
      ],
    },
    {
      name: 'summary',
      dimensions: [{ name: 'summary.status', type: 'string' }],
    },
    {
      name: 'hidden',
      dimensions: [{ name: 'hidden.id', type: 'string', primaryKey: true, public: false }],
    },
  ],
};

describe('the primary key of a cube', () => {
  it('is the dimension Cube marks as one', () => {
    expect(primaryKeyOf(meta, 'orders')).toBe('orders.id');
  });

  it('is nothing for a cube that declares none', () => {
    // A view, typically: its rows are aggregates and have no identity.
    expect(primaryKeyOf(meta, 'summary')).toBeUndefined();
  });

  it('is nothing for a key the model does not expose', () => {
    // A member Cube hides cannot be queried, so it cannot identify a row
    // either (`docs/research/cube/data-modeling.md`).
    expect(primaryKeyOf(meta, 'hidden')).toBeUndefined();
  });

  it('is nothing when the meta has not arrived, or the cube is unknown', () => {
    expect(primaryKeyOf(undefined, 'orders')).toBeUndefined();
    expect(primaryKeyOf(meta, 'nowhere')).toBeUndefined();
  });
});
