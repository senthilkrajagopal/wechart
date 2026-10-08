import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import type { Config } from './config';
import { buildServer, type ModelFile } from './server';
import { xcubeAdmin } from './xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './xcube/fake';
import { itemsOf } from './xcube/items';

/**
 * T428, AC-275, AC-291: a published model item stays as it was published
 * until it is published again, and a delete or rename of a name another
 * published item still references is refused, naming those items. wechart
 * checks its own charts and dashboards before it sends a delete; xcube
 * refuses one another model item is bound to, and a direct delete applies
 * only if xcube's check of it passes.
 *
 * The stub xcube holds the root's `orders` and /Sales's (`fsales`)
 * `sales_orders` and `summary`, each file its own item, each under its own
 * name (T709, R71).
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const cubeFile = (path: string, name: string, folderId?: string): ModelFile => ({
  ...(folderId === undefined ? {} : { folderId }),
  path,
  content: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n    measures:\n      - name: count\n        type: count\n`,
});
const FILES = [
  cubeFile('cubes/orders.yml', 'orders'),
  cubeFile('cubes/sales_orders.yml', 'sales_orders', 'sales'),
  cubeFile('cubes/summary.yml', 'summary', 'sales'),
];
const folders = async () => ({
  ids: new Map([
    ['root', 'froot'],
    ['sales', 'fsales'],
  ]),
  parents: new Map<string, string | null>([
    ['root', null],
    ['sales', 'root'],
  ]),
});

async function serving(
  documents: { kind: string; id: string; title: string; body: unknown }[] = [],
) {
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: config.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
  ]);
  const ids = (await folders()).ids;
  stub.holdItems('dev', itemsOf(FILES, ids));
  const key = (file: ModelFile) => `${file.folderId ?? 'root'}/${file.path}`;
  const store = {
    files: [...FILES],
    list: async (folderId = 'root') =>
      store.files.filter((file) => (file.folderId ?? 'root') === folderId),
    all: async () => store.files,
    seed: async () => undefined,
    write: async (files: readonly ModelFile[]) => {
      for (const file of files)
        store.files = [...store.files.filter((each) => key(each) !== key(file)), file];
    },
    remove: async (folderId: string, path: string) => {
      store.files = store.files.filter((each) => key(each) !== `${folderId}/${path}`);
    },
  };
  const sent: unknown[] = [];
  const catalog = {
    // /Sales at the root, /Sales/Sub beneath it, which holds no model.
    folders: async () => [
      { id: 'sales', title: 'Sales', parentId: 'root' },
      { id: 'sub', title: 'Sub', parentId: 'sales' },
    ],
    contents: async () => [],
    search: async () => [],
    referenceDocuments: async () =>
      documents.map((each) => ({ ...each, localToDashboardId: null })),
  };
  const removed: string[] = [];
  const relocated: unknown[] = [];
  const app = buildServer({
    config,
    modelFiles: store,
    catalog,
    documents: {
      create: async (input: { id: string }) => ({ id: input.id }),
      remove: async (_kind, id) => {
        removed.push(id);
        return true;
      },
      relocate: async (input) => {
        relocated.push(input);
        return input;
      },
    },
    xcube: admin,
    folders,
    afterPublish: async (changeset) => {
      sent.push(changeset);
    },
  });
  return { app, store, stub, sent, removed, relocated };
}

const remove = (app: FastifyInstance, folder: string, path: string) =>
  app.inject({
    method: 'DELETE',
    url: `/api/model/files?folder=${folder}&path=${encodeURIComponent(path)}`,
  });

describe('deleting a model item (T428, AC-275, AC-291)', () => {
  it('deletes one nothing uses: checked by xcube, removed from the store, and sent as its delete', async () => {
    const { app, store, sent } = await serving();

    const response = await remove(app, 'sales', 'cubes/summary.yml');

    expect(response.statusCode, response.body).toBe(200);
    expect(store.files).toEqual([FILES[0], FILES[1]]);
    expect(sent).toEqual([{ upserts: [], deletes: [{ folderId: 'fsales', name: 'summary' }] }]);
    await app.close();
  });

  it('refuses one a chart or dashboard names, naming them, and changes nothing', async () => {
    const { app, store, sent } = await serving([
      {
        kind: 'chart',
        id: 'c1',
        title: 'Sales by month',
        body: { chart: { source: { cube: 'sales_orders' } } },
      },
      // The root's `orders` is another cube: this one uses nothing of /Sales's.
      { kind: 'chart', id: 'c2', title: 'Orders', body: { chart: { source: { cube: 'orders' } } } },
    ]);

    const response = await remove(app, 'sales', 'cubes/sales_orders.yml');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: '“sales_orders” is still used by the chart “Sales by month”.',
      views: [],
      cubes: [],
      charts: [{ id: 'c1', title: 'Sales by month' }],
      dashboards: [],
      hidden: 0,
    });
    expect(store.files).toEqual(FILES);
    expect(sent).toEqual([]);
    await app.close();
  });

  it('refuses one a view uses or another cube joins to, naming them from their bindings, and changes nothing (T520, AC-365)', async () => {
    const { app, store, stub, sent } = await serving([
      {
        kind: 'chart',
        id: 'c1',
        title: 'Sales by month',
        body: { chart: { source: { cube: 'sales_orders' } } },
      },
    ]);
    const ids = (await folders()).ids;
    // /Sales's `summary` joins its `sales_orders`, and its view `sales_view`
    // uses it, as xcube recorded them at their publish.
    stub.holdItems(
      'dev',
      [
        ...itemsOf(FILES, ids),
        {
          folderId: 'fsales',
          name: 'sales_view',
          kind: 'view',
          yaml: 'views:\n  - name: sales_view\n    cubes:\n      - join_path: sales_orders\n',
        },
      ],
      {
        summary: { summary: 'summary', sales_orders: 'sales_orders' },
        sales_view: { sales_view: 'sales_view', sales_orders: 'sales_orders' },
      },
    );

    const response = await remove(app, 'sales', 'cubes/sales_orders.yml');

    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toEqual({
      error:
        '“sales_orders” is still used by the view “sales_view”, the cube “summary” and the chart “Sales by month”.',
      views: [{ name: 'sales_view', folderId: 'sales' }],
      cubes: [{ name: 'summary', folderId: 'sales' }],
      charts: [{ id: 'c1', title: 'Sales by month' }],
      dashboards: [],
      hidden: 0,
    });
    expect(store.files).toEqual(FILES);
    expect(sent).toEqual([]);
    await app.close();
  });

  it('answers what its delete would be refused for, asked before its dialog opens, each with its file or folder (T526; design 14, D2)', async () => {
    const { app, stub } = await serving([
      {
        kind: 'chart',
        id: 'c1',
        title: 'Sales by month',
        body: { folderId: 'sales', chart: { source: { cube: 'sales_orders' } } },
      },
    ]);
    const ids = (await folders()).ids;
    stub.holdItems('dev', itemsOf(FILES, ids), {
      summary: { summary: 'summary', sales_orders: 'sales_orders' },
    });
    const ask = (folder: string, path: string) =>
      app.inject({
        method: 'GET',
        url: `/api/model/files/dependents?folder=${folder}&path=${encodeURIComponent(path)}`,
      });

    const used = await ask('sales', 'cubes/sales_orders.yml');
    expect(used.statusCode, used.body).toBe(200);
    expect(used.json()).toEqual({
      declares: [{ kind: 'cube', name: 'sales_orders' }],
      views: [],
      cubes: [{ name: 'summary', folderId: 'sales', file: 'cubes/summary.yml' }],
      charts: [{ id: 'c1', title: 'Sales by month', folderId: 'sales' }],
      dashboards: [],
      hidden: 0,
    });
    // One nothing uses: nothing to name.
    expect((await ask('sales', 'cubes/summary.yml')).json()).toEqual({
      declares: [{ kind: 'cube', name: 'summary' }],
      views: [],
      cubes: [],
      charts: [],
      dashboards: [],
      hidden: 0,
    });
    // One that isn't there answers as its delete does.
    expect((await ask('sales', 'cubes/nothing.yml')).statusCode).toBe(404);
    await app.close();
  });

  it('answers the ask about a template, and a folder xcube doesn’t serve, as their deletes: refused (T526’s review)', async () => {
    const { app, store } = await serving();
    store.files = [
      ...store.files,
      { path: 'cubes/t.yml', content: 'cubes:\n  - name: t\n    sql: "{{ x }}"\n' },
      { folderId: 'elsewhere', path: 'cubes/e.yml', content: 'cubes:\n  - name: e\n' },
    ];
    for (const [folder, path] of [
      ['root', 'cubes/t.yml'],
      ['elsewhere', 'cubes/e.yml'],
    ] as const) {
      const query = `folder=${folder}&path=${encodeURIComponent(path)}`;
      const asked = await app.inject({
        method: 'GET',
        url: `/api/model/files/dependents?${query}`,
      });
      const deleted = await app.inject({ method: 'DELETE', url: `/api/model/files?${query}` });
      expect([asked.statusCode, deleted.statusCode], path).toEqual([409, 409]);
      expect(asked.json(), path).toEqual(deleted.json());
    }
    await app.close();
  });

  it('refuses one xcube refuses, with xcube’s naming of what is bound to it, and changes nothing', async () => {
    const { app, store, stub, sent } = await serving();
    stub.refuse([
      {
        folderId: 'fsales',
        name: 'sales_orders',
        kind: 'reference',
        // xcube's wording (research `xcube-256d632371.md`, "Refusals").
        message: "sales_orders can't be removed: summary refer to it",
      },
    ]);

    const response = await remove(app, 'sales', 'cubes/sales_orders.yml');

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      errors: [
        {
          path: 'cubes/sales_orders.yml',
          folderId: 'sales',
          message: "sales_orders can't be removed: summary refer to it",
        },
      ],
    });
    expect(store.files).toEqual(FILES);
    expect(sent).toEqual([]);
    await app.close();
  });

  // T428's review: a use is where a chart keeps references, not a title
  // that spells the cube's name.
  it('deletes the root’s cube a chart only spells in its title', async () => {
    const { app, store } = await serving([
      {
        kind: 'chart',
        id: 'c1',
        title: 'orders',
        body: { title: 'orders', chart: { source: { cube: 'customers' } } },
      },
    ]);

    const response = await remove(app, 'root', 'cubes/orders.yml');

    expect(response.statusCode, response.body).toBe(200);
    expect(store.files).toEqual([FILES[1], FILES[2]]);
    await app.close();
  });

  it('refuses to delete a Jinja template, read-only here', async () => {
    const { app, store } = await serving();
    const template = { path: 'cubes/t.yml', content: 'cubes:\n  - name: t\n    sql: "{{ x }}"\n' };
    store.files = [...store.files, template];

    const response = await remove(app, 'root', 'cubes/t.yml');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'cubes/t.yml is a Jinja template, and templates are read-only here.',
    });
    await app.close();
  });

  it('answers a file that isn’t there as not there', async () => {
    const { app } = await serving();

    expect((await remove(app, 'sales', 'cubes/nothing.yml')).statusCode).toBe(404);
    await app.close();
  });
});

/**
 * T428's review, AC-275: a folder's cubes leave xcube when the folder is
 * deleted or moved into My workspace, with nothing checked against what uses
 * them. So neither is done while the folder holds a model, in it or beneath.
 */
describe('a folder holding models (T428)', () => {
  it('isn’t deleted, nor moved into My workspace; one holding none is', async () => {
    const { app, removed, relocated } = await serving();

    const deleted = await app.inject({ method: 'DELETE', url: '/api/documents/folder/sales' });
    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/documents/folder/sales',
      payload: { folderId: 'mine' },
    });

    // Only an empty folder is deleted, saying what it holds (T521, AC-366).
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({
      error: 'This folder holds 1 subfolder and 2 models: only an empty folder can be deleted.',
      holds: { subfolders: 1, dashboards: 0, charts: 0, models: 2, dataSources: 0 },
    });
    expect(moved.statusCode).toBe(409);
    expect(moved.json()).toEqual({
      error:
        'This folder holds 2 models, in it or beneath it, and My workspace can’t hold models yet.',
    });
    expect(removed).toEqual([]);
    expect(relocated).toEqual([]);

    // /Sales/Sub holds none of them.
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/api/documents/folder/sub',
          payload: { folderId: 'mine' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', url: '/api/documents/folder/sub' })).statusCode,
    ).toBe(204);
    expect(removed).toEqual(['sub']);
    await app.close();
  });
});

/**
 * A landed name is fixed (T706, AC-423; `[R71]` 3): T428's refusal of a
 * rename while something still names it gives way to a refusal of any rename.
 */
describe('renaming a model item (T428, AC-275; T706, AC-423)', () => {
  it('refuses a publish that renames a cube a chart still names, and one nothing names', async () => {
    const { app, store } = await serving([
      {
        kind: 'dashboard',
        id: 'd1',
        title: 'Sales',
        body: { filters: [{ member: 'sales_orders.status' }] },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { folderId: 'sales', files: [cubeFile('cubes/sales_orders.yml', 'purchases')] },
    });
    const unused = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { folderId: 'sales', files: [cubeFile('cubes/summary.yml', 'overview')] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: '“sales_orders” has landed, so its name is fixed. Its title can still change.',
    });
    expect(unused.statusCode).toBe(409);
    expect(unused.json()).toEqual({
      error: '“summary” has landed, so its name is fixed. Its title can still change.',
    });
    expect(store.files).toEqual(FILES);
    await app.close();
  });

  it('refuses it even when the publish sends the cube that joins to it again (T520’s review)', async () => {
    const { app, stub } = await serving();
    const ids = (await folders()).ids;
    // /Sales's `summary` joins its `sales_orders`, as xcube recorded at its publish.
    stub.holdItems('dev', itemsOf(FILES, ids), {
      summary: { summary: 'summary', sales_orders: 'sales_orders' },
    });
    const renamed = cubeFile('cubes/sales_orders.yml', 'purchases');

    const alone = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { folderId: 'sales', files: [renamed] },
    });
    expect(alone.statusCode).toBe(409);
    expect(alone.json<{ error: string }>().error).toBe(
      '“sales_orders” has landed, so its name is fixed. Its title can still change.',
    );

    // With `summary` sent again, joined to the new name: still a rename of a
    // landed name, so refused too.
    const together = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: 'sales',
        files: [
          renamed,
          {
            path: 'cubes/summary.yml',
            content:
              'cubes:\n  - name: summary\n    sql_table: public.summary\n    joins:\n      - name: purchases\n        relationship: many_to_one\n        sql: "{CUBE}.id = {purchases.id}"\n',
          },
        ],
      },
    });
    expect(together.statusCode, together.body).toBe(409);
    expect(together.json<{ error: string }>().error).toBe(
      '“sales_orders” has landed, so its name is fixed. Its title can still change.',
    );
    await app.close();
  });
});
