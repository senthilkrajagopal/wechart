import { describe, expect, it } from 'vitest';

import { resolutionsOf } from './calc-resolution';

/**
 * T385 / AC-052 (amended 2026-10-04, R63): WHEN a requested measure is added
 * to the model and its proposal is approved into the folder, THE SYSTEM SHALL
 * mark the request as resolved and name the member that resolves it. A
 * requested measure is one that a proposal adds to the request's cube, where
 * the proposal's author is a member who took the request up.
 * Fails when: the request stays open after the approval of a proposal that
 * adds a measure to its cube, from a member who took it up, or names no
 * member.
 *
 * Which open requests an approval resolves: those on a cube of a model file it
 * landed in the request's folder, adding a measure to that cube, proposed by
 * a member who took the request up (opened it into their workspace, T384).
 */
const BEFORE = `cubes:
  - name: orders
    sql_table: public.orders
    measures:
      - name: count
        type: count
`;
const AFTER = `${BEFORE}      - name: margin
        sql: amount - cost
        type: sum
`;
const OPEN = {
  id: 'r1',
  cube: 'fsales__orders',
  folderId: 'sales',
  takenBy: ['writer-key'],
};
const LANDED = [{ folderId: 'sales', path: 'cubes/orders.yml', before: BEFORE, after: AFTER }];

describe('the calculation requests an approval resolves (T385, AC-052)', () => {
  it('resolves one taken up by the proposal’s author, naming the measure added to its cube', () => {
    expect(resolutionsOf([OPEN], LANDED, 'writer-key')).toEqual([
      { id: 'r1', members: ['fsales__orders.margin'] },
    ]);
  });

  it('names each measure added to its cube', () => {
    const both = `${AFTER}      - name: margin_share
        sql: "{margin} / {count}"
        type: number
`;
    expect(
      resolutionsOf([OPEN], [{ ...LANDED[0]!, after: both }], 'writer-key')[0]?.members,
    ).toEqual(['fsales__orders.margin', 'fsales__orders.margin_share']);
  });

  it('resolves a root cube’s by its own name', () => {
    expect(
      resolutionsOf(
        [{ ...OPEN, cube: 'orders', folderId: 'root' }],
        [{ ...LANDED[0]!, folderId: 'root' }],
        'writer-key',
      ),
    ).toEqual([{ id: 'r1', members: ['orders.margin'] }]);
  });

  it('resolves none no taker proposed, in another folder, on another cube, or with nothing added', () => {
    expect(resolutionsOf([OPEN], LANDED, 'someone-else')).toEqual([]);
    expect(resolutionsOf([{ ...OPEN, folderId: 'ops' }], LANDED, 'writer-key')).toEqual([]);
    expect(resolutionsOf([{ ...OPEN, cube: 'fsales__stock' }], LANDED, 'writer-key')).toEqual([]);
    expect(resolutionsOf([OPEN], [{ ...LANDED[0]!, after: BEFORE }], 'writer-key')).toEqual([]);
  });
});
