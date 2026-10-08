import { describe, expect, it } from 'vitest';

import { boundCubesOf, resolutionsOf, withViewCubes } from './calc-resolution';

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
/** On /Sales's `orders`, under its own name, as xcube serves every folder's (T709, AC-328). */
const OPEN = {
  id: 'r1',
  cube: 'orders',
  folderId: 'sales',
  takenBy: ['writer-key'],
};
const LANDED = [{ folderId: 'sales', path: 'cubes/orders.yml', before: BEFORE, after: AFTER }];

describe('the calculation requests an approval resolves (T385, AC-052)', () => {
  it('resolves one taken up by the proposal’s author, naming the measure added to its cube', () => {
    expect(resolutionsOf([OPEN], LANDED, 'writer-key')).toEqual([
      { id: 'r1', members: ['orders.margin'] },
    ]);
  });

  it('names each measure added to its cube', () => {
    const both = `${AFTER}      - name: margin_share
        sql: "{margin} / {count}"
        type: number
`;
    expect(
      resolutionsOf([OPEN], [{ ...LANDED[0]!, after: both }], 'writer-key')[0]?.members,
    ).toEqual(['orders.margin', 'orders.margin_share']);
  });

  // T709, AC-328: by its own name in any folder, the root's as /Sales's.
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
    expect(resolutionsOf([{ ...OPEN, cube: 'stock' }], LANDED, 'writer-key')).toEqual([]);
    expect(resolutionsOf([OPEN], [{ ...LANDED[0]!, after: BEFORE }], 'writer-key')).toEqual([]);
  });
});

/**
 * T590 / AC-052 (amended 2026-10-04, R64): a request on a view is resolved,
 * in the same way, by a measure added to any cube on the view's join paths.
 * The view may sit in a folder beneath its cubes'.
 */
describe('a request on a view, resolved through the cubes on its join paths (T590, AC-052)', () => {
  /** A view in /Sales/East over /Sales' orders and the root's customers. */
  const ON_VIEW = {
    id: 'v1',
    cube: 'summary',
    folderId: 'east',
    takenBy: ['writer-key'],
    on: [
      { folderId: 'sales', name: 'orders', fullName: 'orders' },
      { folderId: 'root', name: 'customers', fullName: 'customers' },
    ],
  };
  const CUSTOMERS = `cubes:
  - name: customers
    sql_table: public.customers
`;

  it('is resolved by a measure added to a cube on its join paths, naming it on that cube', () => {
    expect(resolutionsOf([ON_VIEW], LANDED, 'writer-key')).toEqual([
      { id: 'v1', members: ['orders.margin'] },
    ]);
    expect(
      resolutionsOf(
        [ON_VIEW],
        [
          {
            folderId: 'root',
            path: 'cubes/customers.yml',
            before: CUSTOMERS,
            after: `${CUSTOMERS}    measures:\n      - name: lifetime_value\n        sql: ltv\n        type: sum\n`,
          },
        ],
        'writer-key',
      ),
    ).toEqual([{ id: 'v1', members: ['customers.lifetime_value'] }]);
  });

  it('stays open for a measure on a cube off its join paths, or one no taker proposed', () => {
    expect(resolutionsOf([{ ...ON_VIEW, on: [ON_VIEW.on[1]!] }], LANDED, 'writer-key')).toEqual([]);
    expect(resolutionsOf([ON_VIEW], [{ ...LANDED[0]!, folderId: 'ops' }], 'writer-key')).toEqual(
      [],
    );
    expect(resolutionsOf([ON_VIEW], LANDED, 'someone-else')).toEqual([]);
  });

  it('stays open where none of its join paths’ cubes is known', () => {
    expect(resolutionsOf([{ ...ON_VIEW, on: [] }], LANDED, 'writer-key')).toEqual([]);
  });
});

/**
 * The cubes on a view's join paths, by full name (T590): each segment as the
 * view bound it when it was published, from its held bindings (`GET …/items`;
 * `xcube-meta-revision-and-bindings.md`, "`bindings`").
 */
describe('the cubes a view’s join paths bound (T590, AC-052)', () => {
  it('maps each segment through the view’s bindings', () => {
    expect(
      boundCubesOf('summary', ['orders', 'customers'], {
        orders: 'orders',
        customers: 'customers',
      }),
    ).toEqual(['orders', 'customers']);
  });

  it('leaves out a segment it didn’t bind, or bound to the view itself', () => {
    expect(
      boundCubesOf('orders', ['orders', 'products'], {
        orders: 'orders',
        customers: 'customers',
      }),
    ).toEqual([]);
  });
});

/**
 * Each open request with the cubes a measure resolves it on (T590): a view's,
 * from its file and its held bindings; a cube's left as it is. A lookup that
 * fails leaves that request as it is, never the others (T590's review).
 */
describe('the requests an approval may resolve, with their views’ cubes (T590, AC-052)', () => {
  const ON_CUBE = { id: 'c1', cube: 'orders', folderId: 'sales', takenBy: ['w'] };
  const ON_VIEW = { id: 'v1', cube: 'summary', folderId: 'east', takenBy: ['w'] };
  const SUMMARY = 'views:\n  - name: summary\n    cubes:\n      - join_path: orders\n';
  const lookups = {
    filesIn: (folderId: string) =>
      Promise.resolve(
        folderId === 'east'
          ? [{ content: SUMMARY }]
          : [{ content: 'cubes:\n  - name: orders\n    sql_table: public.orders\n' }],
      ),
    held: () => Promise.resolve([{ fullName: 'summary', bindings: { orders: 'orders' } }]),
    // The folder declaring the name: each name is one item's (T709, R71).
    folderOf: (name: string) => Promise.resolve(name === 'orders' ? 'sales' : undefined),
  };

  it('gives a view’s request the cubes its join paths bound, in their folders, and leaves a cube’s', async () => {
    expect(await withViewCubes([ON_CUBE, ON_VIEW], lookups)).toEqual([
      ON_CUBE,
      { ...ON_VIEW, on: [{ folderId: 'sales', name: 'orders', fullName: 'orders' }] },
    ]);
  });

  it('leaves a request as it is where its lookup fails, and the others unharmed', async () => {
    let asked = 0;
    const failing = {
      ...lookups,
      held: () => {
        asked += 1;
        return Promise.reject(new Error('xcube is down'));
      },
    };
    expect(await withViewCubes([ON_CUBE, ON_VIEW], failing)).toEqual([ON_CUBE, ON_VIEW]);
    expect(asked).toBe(1);
    expect(
      await withViewCubes([ON_CUBE, ON_VIEW], {
        ...lookups,
        filesIn: () => Promise.reject(new Error('the store is down')),
      }),
    ).toEqual([ON_CUBE, ON_VIEW]);
  });
});
