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
 * The stub xcube holds the root's `orders` and /Sales's (`fsales`) `orders`
 * and `summary`, each file its own item.
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
  cubeFile('cubes/orders.yml', 'orders', 'sales'),
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
        body: { chart: { source: { cube: 'fsales__orders' } } },
      },
      // The root's `orders` is another cube: this one uses nothing of /Sales's.
      { kind: 'chart', id: 'c2', title: 'Orders', body: { chart: { source: { cube: 'orders' } } } },
    ]);

    const response = await remove(app, 'sales', 'cubes/orders.yml');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: '“orders” is still used by the chart “Sales by month”.',
      charts: [{ id: 'c1', title: 'Sales by month' }],
      dashboards: [],
      hidden: 0,
    });
    expect(store.files).toEqual(FILES);
    expect(sent).toEqual([]);
    await app.close();
  });

  it('refuses one xcube refuses, with xcube’s naming of what is bound to it, and changes nothing', async () => {
    const { app, store, stub, sent } = await serving();
    stub.refuse([
      {
        folderId: 'fsales',
        name: 'orders',
        kind: 'reference',
        // xcube's wording (research 3a, "Removal and renames").
        message: "fsales/orders can't be removed or renamed: fsales/summary refer to it",
      },
    ]);

    const response = await remove(app, 'sales', 'cubes/orders.yml');

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      errors: [
        {
          path: 'cubes/orders.yml',
          folderId: 'sales',
          message: "fsales/orders can't be removed or renamed: fsales/summary refer to it",
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

    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({
      error: 'This folder holds 2 models, in it or beneath it: delete them first.',
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

describe('renaming a model item (T428, AC-275)', () => {
  it('refuses a publish that renames a cube a chart still names, naming the chart', async () => {
    const { app, store } = await serving([
      {
        kind: 'dashboard',
        id: 'd1',
        title: 'Sales',
        body: { filters: [{ member: 'fsales__orders.status' }] },
      },
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { folderId: 'sales', files: [cubeFile('cubes/orders.yml', 'purchases')] },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: '“orders” is still used by the dashboard “Sales”.',
      charts: [],
      dashboards: [{ id: 'd1', title: 'Sales' }],
      hidden: 0,
    });
    expect(store.files).toEqual(FILES);
    await app.close();
  });
});
