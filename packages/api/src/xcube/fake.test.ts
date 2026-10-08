import { describe, expect, it } from 'vitest';

import { xcubeAdmin } from './client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './fake';

/**
 * T701 (AC-421, AC-424): the stub xcube holds names one per model, in any
 * case, as the image `256d632371` does (research `xcube-256d632371.md`, "The
 * error kinds", 2.6, 2.7), so the API's tests meet the image's refusals.
 */
function stubbed() {
  const stub = fakeXcube();
  stub.namesOnePerModel(true);
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://cube.invalid/cubejs-api',
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  return { stub, admin };
}

const cube = (folderId: string, name: string) => ({
  folderId,
  name,
  kind: 'cube' as const,
  yaml: `cubes:\n  - name: ${name}\n`,
});
const TREE = [
  { id: 'froot', parentId: null },
  { id: 'fsales', parentId: 'froot' },
  { id: 'fops', parentId: 'froot' },
];

describe('the stub xcube’s names, one per model (T701)', () => {
  it('refuses an upsert of a name a landed item holds, in any case and any folder, on the caller’s item', async () => {
    const { stub, admin } = stubbed();
    stub.holdItems('dev', [cube('froot', 'orders')]);
    await admin.folders(TREE);
    const base = (await admin.revision()).current!.revision;

    expect(
      await admin.applyChangeset({
        baseRevision: base,
        upserts: [cube('fsales', 'Orders')],
        deletes: [],
      }),
    ).toEqual({
      kind: 'refused',
      errors: [
        {
          folderId: 'fsales',
          name: 'Orders',
          kind: 'name_in_use',
          message: 'The name "Orders" is already in use',
        },
      ],
      cubeMessage: null,
    });
    // The landed name in another case, in its own folder: names never change.
    expect(
      await admin.applyChangeset({
        baseRevision: base,
        upserts: [cube('froot', 'Orders')],
        deletes: [],
      }),
    ).toEqual({
      kind: 'refused',
      errors: [
        {
          folderId: 'froot',
          name: 'Orders',
          kind: 'name_in_use',
          message:
            'The name "Orders" is in use as "orders": a landed name can\'t change, not even its case',
        },
      ],
      cubeMessage: null,
    });
  });

  it('refuses two items of one name in a changeset’s dry run, and takes a delete and an upsert of one name as a move', async () => {
    const { stub, admin } = stubbed();
    stub.holdItems('dev', [cube('froot', 'orders')]);
    await admin.folders(TREE);

    const twice = await admin.checkChangeset({
      upserts: [cube('fsales', 'stock'), cube('fops', 'Stock')],
      deletes: [],
      securityContext: {},
      probes: [],
    });
    expect([twice.valid, twice.errors]).toEqual([
      false,
      [
        {
          folderId: 'fops',
          name: 'Stock',
          kind: 'name_in_use',
          message:
            'The changeset holds two items named "Stock" (in fsales and fops); names are one per model',
        },
      ],
    ]);

    const base = (await admin.revision()).current!.revision;
    const moved = await admin.applyChangeset({
      baseRevision: base,
      upserts: [cube('fsales', 'orders')],
      deletes: [{ folderId: 'froot', name: 'orders' }],
    });
    expect(moved.kind).toBe('stored');
    expect(stub.head('dev')?.items).toEqual([cube('fsales', 'orders')]);
  });

  it('refuses an overlay holding two items or two data sources of one name, or `default` outside the root', async () => {
    const { stub, admin } = stubbed();
    stub.holdItems('dev', [cube('froot', 'orders')]);
    const connection = (folderId: string, name: string) => ({
      folderId,
      name,
      driver: 'postgres',
      authMethod: 'password',
      fields: {},
      sealed: {},
    });
    const push = (over: Partial<Parameters<typeof admin.putOverlay>[1]>) =>
      admin.putOverlay('ws-1', {
        upserts: [],
        deletes: [],
        connections: [],
        baseVersion: null,
        ...over,
      });

    expect(await push({ upserts: [cube('fsales', 'stock'), cube('fops', 'STOCK')] })).toEqual({
      kind: 'refused',
      errors: [
        {
          folderId: 'fops',
          name: 'STOCK',
          kind: 'name_in_use',
          message:
            'The overlay holds two items named "STOCK" (in fsales and fops); names are one per model',
        },
      ],
      cubeMessage: null,
    });
    expect(await push({ upserts: [cube('fsales', 'stock'), cube('fsales', 'stock')] })).toEqual({
      kind: 'refused',
      errors: [
        {
          folderId: 'fsales',
          name: 'stock',
          kind: 'item',
          message: 'The item is in the overlay twice',
        },
      ],
      cubeMessage: null,
    });
    expect(
      await push({ connections: [connection('fsales', 'lake'), connection('fops', 'Lake')] }),
    ).toEqual({ kind: 'connection', error: 'The name “Lake” is already in use.' });
    expect(await push({ connections: [connection('fsales', 'default')] })).toEqual({
      kind: 'connection',
      error: 'Only the shared root may have a data source named default.',
    });
    // Its copy of a landed item, in another folder, stands in for it.
    expect((await push({ upserts: [cube('fsales', 'orders')] })).kind).toBe('stored');
  });
});

/**
 * T712 (AC-273): with connections held, a changeset is refused for a cube
 * whose data source, its own or inherited through `extends`, is kept off its
 * folder's path (research `xcube-256d632371.md`, "In `422 invalid_items`",
 * 4.4), on the cube, never naming the data source's folder.
 */
describe('the stub xcube’s data-source rule (T712)', () => {
  it('refuses a cube on a data source off its path, its own or its parent’s, and takes one on its path', async () => {
    const { stub, admin } = stubbed();
    await admin.folders(TREE);
    stub.holdConnections('dev', [
      { folderId: 'fsales', name: 'warehouse' },
      { folderId: 'fops', name: 'lake' },
    ]);
    // The root's `w`, on /Sales's path, runs on /Ops's `lake` (as held before
    // the rule): a child extending it inherits a data source off its own path.
    stub.holdItems('dev', [
      { ...cube('froot', 'w'), yaml: 'cubes:\n  - name: w\n    data_source: lake\n' },
    ]);
    const check = (upserts: ReturnType<typeof cube>[]) =>
      admin.checkChangeset({ upserts, deletes: [], securityContext: {}, probes: [] });

    expect(
      (
        await check([
          { ...cube('fsales', 'own'), yaml: 'cubes:\n  - name: own\n    data_source: lake\n' },
        ])
      ).errors,
    ).toEqual([
      {
        folderId: 'fsales',
        name: 'own',
        kind: 'data_source_range',
        message: `It uses the data source "lake", which isn't in its folder or one of its ancestors`,
      },
    ]);
    expect(
      (
        await check([
          { ...cube('fsales', 'child'), yaml: 'cubes:\n  - name: child\n    extends: w\n' },
        ])
      ).errors,
    ).toEqual([
      {
        folderId: 'fsales',
        name: 'child',
        kind: 'data_source_range',
        message: `It uses the data source "lake" (through w, which it extends), which isn't in its folder or one of its ancestors`,
      },
    ]);
    const fine = await check([
      { ...cube('fsales', 'mine'), yaml: 'cubes:\n  - name: mine\n    data_source: warehouse\n' },
    ]);
    expect([fine.valid, fine.errors]).toEqual([true, []]);
  });
});

/**
 * T715 (AC-425): `PUT …/folders` is refused, `409`, when the new tree would
 * leave a cube on a data source, or an item referring to a cube, off its
 * folder's path that wasn't before, naming those cubes and items and never a
 * folder; the tree held is left as it was (research `xcube-256d632371.md`,
 * "On `PUT …/folders`").
 */
describe('the stub xcube’s folder push (T715)', () => {
  const DEEP = [
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fab', parentId: 'fa' },
    { id: 'fc', parentId: 'froot' },
  ];
  const moved = DEEP.map((folder) =>
    folder.id === 'fab' ? { ...folder, parentId: 'fc' } : folder,
  );

  it('refuses a tree stranding a cube from its data source, or a join from its cube, and keeps the one held', async () => {
    const { stub, admin } = stubbed();
    const held = await admin.folders(DEEP);
    stub.holdConnections('dev', [{ folderId: 'fa', name: 'warehouse' }]);
    stub.holdItems('dev', [
      cube('fa', 'base'),
      { ...cube('fab', 'on_wh'), yaml: 'cubes:\n  - name: on_wh\n    data_source: warehouse\n' },
      {
        ...cube('fab', 'joiner'),
        yaml: 'cubes:\n  - name: joiner\n    joins:\n      - name: base\n        sql: "1 = 1"\n        relationship: many_to_one\n',
      },
    ]);

    const refused = await admin.folders(moved).catch((error: unknown) => error);

    expect(refused).toMatchObject({
      status: 409,
      code: 'data_source_range',
      details: {
        error:
          "The folder tree would leave items using what isn't in their folder or one of its ancestors",
        cubes: ['on_wh'],
        items: ['joiner'],
      },
    });
    expect(JSON.stringify((refused as { details: unknown }).details)).not.toMatch(/"f(a|ab|c)"/);
    // The tree held is the one before: putting it again gives its hash.
    expect((await admin.folders(DEEP)).hash).toBe(held.hash);
  });

  it('takes a tree that strands nothing, or only what was already off its path', async () => {
    const { stub, admin } = stubbed();
    await admin.folders(DEEP);
    stub.holdConnections('dev', [{ folderId: 'fc', name: 'lake' }]);
    stub.holdItems('dev', [
      cube('fab', 'alone'),
      // Off its path before the move and after it: not this push's to refuse.
      {
        ...cube('fa', 'already'),
        yaml: 'cubes:\n  - name: already\n    data_source: lake\n',
      },
    ]);

    await expect(admin.folders(moved)).resolves.toMatchObject({ hash: expect.any(String) });
  });

  it('names only references, code reference_range, where no cube leaves its data source', async () => {
    const { stub, admin } = stubbed();
    await admin.folders(DEEP);
    stub.holdItems('dev', [
      cube('fa', 'base'),
      {
        ...cube('fab', 'child'),
        yaml: 'cubes:\n  - name: child\n    extends: base\n',
      },
    ]);

    await expect(admin.folders(moved)).rejects.toMatchObject({
      status: 409,
      code: 'reference_range',
      details: { cubes: [], items: ['child'] },
    });
  });
});

/**
 * T711 (AC-272): `POST …/resolve` answers the one item of a name, in any
 * case and in any folder, by its stored name; the folder asked from is only
 * checked to be in the tree (research `xcube-256d632371.md`, 3.3). Whether
 * that item is on a path is wechart's rule.
 */
describe('the stub xcube’s resolve (T711)', () => {
  it('answers the holder of a name wherever it is, off the folder’s path too', async () => {
    const { stub, admin } = stubbed();
    await admin.folders(TREE);
    stub.holdItems('dev', [cube('fops', 'widgets'), cube('froot', 'orders')]);

    expect(await admin.resolve('fsales', ['Widgets', 'orders', 'nothing'])).toEqual(
      new Map([
        ['Widgets', 'widgets'],
        ['orders', 'orders'],
        ['nothing', null],
      ]),
    );
    await expect(admin.resolve('fgone', ['orders'])).rejects.toThrow();
  });
});
