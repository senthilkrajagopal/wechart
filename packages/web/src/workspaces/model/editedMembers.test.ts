import { describe, expect, it } from 'vitest';

import type { FolderNode } from '../explore/FolderTree';
import { editedMembersOf, landedEditsOf, placesOf } from './editedMembers';

/**
 * T147 / AC-141: WHEN the user edits a member that charts use, THE SYSTEM
 * SHALL list the charts and dashboards that reference it before saving.
 * Fails when: a referencing chart is missing from that list.
 *
 * The members a save edits, across the whole model: each one it changes or
 * takes away, by every name charts use for it — the cube's own, a view's
 * that exposes it (by alias, with a prefix, through `"*"`), a cube's that
 * extends it. One only added is used by nothing yet.
 */
const ORDERS = `cubes:
  - name: orders
    measures:
      - name: count
        type: count
      - name: total
        sql: amount
        type: sum
    dimensions:
      - name: status
        sql: status
        type: string
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
`;
const SUMMARY = `views:
  - name: summary
    cubes:
      - join_path: orders
        includes:
          - count
          - name: status
            alias: order_status
`;

const model = (orders: string, ...others: { path: string; content: string }[]) => [
  { path: 'cubes/orders.yml', content: orders },
  ...others,
];

describe('the members a save edits', () => {
  it('are none when nothing changes', () => {
    expect(editedMembersOf(model(ORDERS), model(ORDERS))).toEqual([]);
  });

  it('are those changed and those taken away, not those added', () => {
    const after = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n')
      .replace('      - name: shipped\n        sql: "{CUBE}.status = \'shipped\'"\n', '')
      .replace(
        '    dimensions:\n',
        '    dimensions:\n      - name: region\n        sql: region\n        type: string\n',
      );

    expect(editedMembersOf(model(ORDERS), model(after))).toEqual([
      'orders.total',
      'orders.shipped',
    ]);
  });

  it('are every member of a cube renamed', () => {
    const after = ORDERS.replace('  - name: orders\n', '  - name: sales\n');

    expect(editedMembersOf(model(ORDERS), model(after))).toEqual([
      'orders.count',
      'orders.total',
      'orders.status',
      'orders.shipped',
    ]);
  });

  it('are a view’s too, in another file, where it exposes a member edited', () => {
    const view = { path: 'views/summary.yml', content: SUMMARY };
    const after = ORDERS.replace(
      '      - name: count\n        type: count\n',
      '      - name: count\n        type: count_distinct\n        sql: id\n',
    );

    expect(editedMembersOf(model(ORDERS, view), model(after, view))).toEqual([
      'orders.count',
      'summary.count',
    ]);
  });

  it('are a view’s by the names it gives them: an alias, a prefix, everything through "*"', () => {
    const view = {
      path: 'views/all.yml',
      content: `views:
  - name: everything
    cubes:
      - join_path: orders
        prefix: true
        includes: "*"
        excludes:
          - shipped
`,
    };
    const after = ORDERS.replace('        type: string\n', '        type: number\n');

    expect(editedMembersOf(model(ORDERS, view), model(after, view))).toEqual([
      'orders.status',
      'everything.orders_status',
    ]);
  });

  it('are all a view’s members whose names a change of prefix changes', () => {
    const before = { path: 'views/summary.yml', content: SUMMARY };
    const after = {
      path: 'views/summary.yml',
      content: SUMMARY.replace(
        '      - join_path: orders\n',
        '      - join_path: orders\n        prefix: true\n',
      ),
    };

    expect(editedMembersOf(model(ORDERS, before), model(ORDERS, after))).toEqual(['summary.count']);
  });

  it('are an extending cube’s, where it takes the member edited as it is', () => {
    const child = {
      path: 'cubes/big_orders.yml',
      content:
        'cubes:\n  - name: big_orders\n    extends: orders\n    measures:\n      - name: total\n        sql: amount * 10\n        type: sum\n',
    };
    const after = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n').replace(
      '        type: count\n',
      '        type: count\n        title: Lines\n',
    );

    // big_orders.total is its own, so changing orders.total leaves it be.
    expect(editedMembersOf(model(ORDERS, child), model(after, child))).toEqual([
      'orders.count',
      'orders.total',
      'big_orders.count',
    ]);
  });

  it('are none from a file that doesn’t parse: nothing is saved from it', () => {
    expect(editedMembersOf(model(ORDERS), model('cubes: [\n'))).toEqual([]);
  });
});

/**
 * T342 / AC-141, with models in folders: a folder's items are published as
 * `<xcubeId>__<name>` (AC-328), and a folder's names are found along its
 * path, nearest first (AC-272). So the charts bound to a folder's member are
 * bound to its full name, and a root edit reaches a folder's view or
 * extending cube by that folder's name.
 */
describe('the members a save edits, with models in folders (T342)', () => {
  // Shared › Sales › EMEA, and Shared › Stock, the folder ids stored with each.
  const folders: FolderNode[] = [
    { id: 'sales', title: 'Sales', parentId: null, xcubeId: 'fsales' },
    { id: 'emea', title: 'EMEA', parentId: 'sales', xcubeId: 'femea' },
    { id: 'stock', title: 'Stock', parentId: null, xcubeId: null },
  ];
  const places = placesOf(folders);
  const inFolder = (folderId: string, path: string, content: string) => ({
    folderId,
    path,
    content,
  });
  const TOTAL_DOUBLED = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n');

  it('are a folder’s by its full name, and the root’s file of the same path is left be', () => {
    const root = { path: 'cubes/orders.yml', content: ORDERS };
    const before = [root, inFolder('sales', 'cubes/orders.yml', ORDERS)];
    const after = [root, inFolder('sales', 'cubes/orders.yml', TOTAL_DOUBLED)];

    expect(editedMembersOf(before, after, places)).toEqual(['fsales__orders.total']);
  });

  it('are a folder’s view’s, by the folder’s name, where it exposes a root member edited', () => {
    const view = inFolder('sales', 'views/summary.yml', SUMMARY);

    expect(
      editedMembersOf(
        [{ path: 'cubes/orders.yml', content: ORDERS }, view],
        [
          {
            path: 'cubes/orders.yml',
            content: TOTAL_DOUBLED.replace('type: count', 'type: count_distinct\n        sql: id'),
          },
          view,
        ],
        places,
      ),
    ).toEqual(['orders.count', 'orders.total', 'fsales__summary.count']);
  });

  it('are a folder’s extending cube’s, by the folder’s name, where it takes the root member as it is', () => {
    const child = inFolder(
      'emea',
      'cubes/big_orders.yml',
      'cubes:\n  - name: big_orders\n    extends: orders\n',
    );

    expect(
      editedMembersOf(
        [{ path: 'cubes/orders.yml', content: ORDERS }, child],
        [{ path: 'cubes/orders.yml', content: TOTAL_DOUBLED }, child],
        places,
      ),
    ).toEqual(['orders.total', 'femea__big_orders.total']);
  });

  it('are a subfolder’s view’s, where it exposes a member of the folder above', () => {
    const view = inFolder('emea', 'views/summary.yml', SUMMARY);

    expect(
      editedMembersOf(
        [inFolder('sales', 'cubes/orders.yml', ORDERS), view],
        [
          inFolder(
            'sales',
            'cubes/orders.yml',
            ORDERS.replace('type: count', 'type: count_distinct\n        sql: id'),
          ),
          view,
        ],
        places,
      ),
    ).toEqual(['fsales__orders.count', 'femea__summary.count']);
  });

  it('are not a folder’s view’s where a nearer cube of the name hides the edited one', () => {
    const own = inFolder('sales', 'cubes/orders.yml', ORDERS);
    const view = inFolder('sales', 'views/summary.yml', SUMMARY);

    expect(
      editedMembersOf(
        [{ path: 'cubes/orders.yml', content: ORDERS }, own, view],
        [{ path: 'cubes/orders.yml', content: TOTAL_DOUBLED }, own, view],
        places,
      ),
    ).toEqual(['orders.total']);
  });

  it('are none of a folder not yet published to, which no chart can be bound to', () => {
    const view = inFolder('stock', 'views/summary.yml', SUMMARY);

    expect(
      editedMembersOf(
        [{ path: 'cubes/orders.yml', content: ORDERS }, view],
        [{ path: 'cubes/orders.yml', content: TOTAL_DOUBLED }, view],
        places,
      ),
    ).toEqual(['orders.total']);
  });

  it('are still found when another folder holds a file that doesn’t parse, unchanged', () => {
    const broken = inFolder('emea', 'cubes/broken.yml', 'cubes: [\n');

    expect(
      editedMembersOf(
        [{ path: 'cubes/orders.yml', content: ORDERS }, broken],
        [{ path: 'cubes/orders.yml', content: TOTAL_DOUBLED }, broken],
        places,
      ),
    ).toEqual(['orders.total']);
  });
});

/**
 * T546 (AC-141 amended, R55): a model saved in My workspace lists the shared
 * charts and dashboards that landing it would change. Its edits are read as
 * it would land in the folder it goes to (T451): over that folder's file of
 * its path, and over the file there declaring its name, against that folder
 * as it is. Its folder in the workspace is published to by nothing, so no
 * chart is bound there.
 */
describe('the members landing a workspace model would edit (T546)', () => {
  const folders: FolderNode[] = [
    { id: 'sales', title: 'Sales', parentId: null, xcubeId: 'fsales' },
    { id: 'emea', title: 'EMEA', parentId: 'sales', xcubeId: 'femea' },
    // A project folder in My workspace: no xcube id, as none is published to.
    { id: 'project', title: 'Project', parentId: 'mine', xcubeId: null },
  ];
  const places = placesOf(folders);
  const inFolder = (folderId: string, path: string, content: string) => ({
    folderId,
    path,
    content,
  });
  const PATH = 'cubes/orders.yml';
  const TOTAL_DOUBLED = ORDERS.replace('        sql: amount\n', '        sql: amount * 2\n');
  // Every folder's files as the API lists them, the copy among them in its project folder.
  const every = [
    { folderId: 'root', path: 'cubes/customers.yml', content: 'cubes:\n  - name: customers\n' },
    inFolder('sales', PATH, ORDERS),
    inFolder('project', PATH, ORDERS),
  ];

  it('are the folder it goes to’s, by their full names there, though it is saved in My workspace', () => {
    expect(
      landedEditsOf(every, { landsIn: 'sales', path: PATH, content: TOTAL_DOUBLED }, places),
    ).toEqual(['fsales__orders.total']);
    // Saved in place, the workspace's own folder's would be none: nothing is bound there.
    expect(
      editedMembersOf(
        every,
        [...every.slice(0, 2), inFolder('project', PATH, TOTAL_DOUBLED)],
        places,
      ),
    ).toEqual([]);
  });

  it('are every member of the cube a rename takes away from that folder', () => {
    const renamed = ORDERS.replace('name: orders', 'name: orders_v2');

    expect(
      landedEditsOf(every, { landsIn: 'sales', path: PATH, content: renamed }, places),
    ).toEqual([
      'fsales__orders.count',
      'fsales__orders.total',
      'fsales__orders.status',
      'fsales__orders.shipped',
    ]);
  });

  it('are a view’s on a path through that folder, by the view’s folder’s name', () => {
    const withView = [...every, inFolder('emea', 'views/summary.yml', SUMMARY)];
    const countDistinct = ORDERS.replace('type: count', 'type: count_distinct\n        sql: id');

    expect(
      landedEditsOf(withView, { landsIn: 'sales', path: PATH, content: countDistinct }, places),
    ).toEqual(['fsales__orders.count', 'femea__summary.count']);
  });

  it('are every member the landing would change, an earlier save’s edits too', () => {
    const both = TOTAL_DOUBLED.replace('type: count', 'type: count_distinct\n        sql: id');
    // The copy as an earlier save left it, `total` changed already: still unlanded.
    const saved = [...every.slice(0, 2), inFolder('project', PATH, TOTAL_DOUBLED)];

    expect(landedEditsOf(saved, { landsIn: 'sales', path: PATH, content: both }, places)).toEqual([
      'fsales__orders.count',
      'fsales__orders.total',
    ]);
  });

  it('are none for a new file of a new name, which nothing uses yet', () => {
    expect(
      landedEditsOf(
        every,
        { landsIn: 'sales', path: 'cubes/returns.yml', content: 'cubes:\n  - name: returns\n' },
        places,
      ),
    ).toEqual([]);
  });

  it('are the folder’s file’s, for a new file at another path declaring a name it has', () => {
    expect(
      landedEditsOf(
        every,
        { landsIn: 'sales', path: 'cubes/orders_again.yml', content: TOTAL_DOUBLED },
        places,
      ),
    ).toEqual(['fsales__orders.total']);
  });

  it('are the root’s by their bare names, for a model going to the shared root', () => {
    const rootOrders = [...every, { folderId: 'root', path: PATH, content: ORDERS }];

    expect(
      landedEditsOf(rootOrders, { landsIn: 'root', path: PATH, content: TOTAL_DOUBLED }, places),
    ).toEqual(['orders.total']);
  });
});
