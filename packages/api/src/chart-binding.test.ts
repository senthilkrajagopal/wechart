import { describe, expect, it } from 'vitest';

import type { Config } from './config';
import { buildServer } from './server';
import { xcubeAdmin } from './xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './xcube/fake';
import type { Item } from './xcube/items';

/**
 * T429, AC-272, through the routes that publish a chart or a dashboard: a
 * save into a folder stores each cube it names as bound there, under its own
 * name (T709, R71); one naming a cube no folder on its path holds is
 * refused, naming it, and nothing is written.
 *
 * The stub xcube holds the root's `sales`, /A's (`fa`) `a_sales`, /A/B's
 * (`fab`) `ab_sales`, and `widgets` in /A/D (`fad`), /A/B's sibling.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const item = (folderId: string, name: string): Item => ({
  folderId,
  name,
  kind: 'cube',
  yaml: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`,
});
const folders = async () => ({
  ids: new Map([
    ['root', 'froot'],
    ['a', 'fa'],
    ['b', 'fab'],
    ['d', 'fad'],
  ]),
  parents: new Map<string, string | null>([
    ['root', null],
    ['a', 'root'],
    ['b', 'a'],
    ['d', 'a'],
  ]),
});

/** And /New (`fnew`), made a moment ago: wechart has it, xcube's tree not yet. */
const foldersWithNew = async () => {
  const known = await folders();
  return {
    ids: new Map([...known.ids, ['new', 'fnew']]),
    parents: new Map([...known.parents, ['new', 'root']]),
  };
};
const TREE = [
  { id: 'froot', parentId: null },
  { id: 'fa', parentId: 'froot' },
  { id: 'fab', parentId: 'fa' },
  { id: 'fad', parentId: 'fa' },
];

async function serving({ down = false, withNew = false } = {}) {
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: config.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders(TREE);
  stub.holdItems('dev', [
    item('froot', 'sales'),
    item('fa', 'a_sales'),
    item('fab', 'ab_sales'),
    item('fad', 'widgets'),
  ]);
  stub.down(down);
  const written: { kind: string; id: string; body: Record<string, unknown> }[] = [];
  const relocated: unknown[] = [];
  const stored: Record<string, Record<string, unknown>> = {};
  const documents = {
    create: async (input: { id: string }) => ({ id: input.id }),
    get: async (_kind: string, id: string) =>
      id in stored ? { id, body: stored[id]!, version: 5 } : null,
    update: async (input: { kind: string; id: string; body: Record<string, unknown> }) => {
      written.push(input);
      return { id: input.id, version: 6 };
    },
    updateTogether: async (
      writes: readonly { kind: string; id: string; body: Record<string, unknown> }[],
    ) => {
      written.push(...writes);
      return writes.map((write) => ({ id: write.id, version: 6 }));
    },
    relocate: async (input: unknown) => {
      relocated.push(input);
      return input;
    },
  };
  // What a dashboard's own charts are read from (`referenceDocuments`).
  const catalog = {
    folders: async () => [],
    contents: async () => [],
    search: async () => [],
    referenceDocuments: async () =>
      Object.entries(stored).map(([id, body]) => ({
        kind: 'chart' in body ? 'chart' : 'dashboard',
        id,
        title: null,
        body,
        localToDashboardId:
          typeof body['localToDashboardId'] === 'string' ? body['localToDashboardId'] : null,
      })),
  };
  /** xcube's tree put again, the way the API does before a folder publish. */
  const pushed: number[] = [];
  const app = buildServer({
    config,
    documents,
    catalog,
    xcube: admin,
    folders: withNew ? foldersWithNew : folders,
    beforeFolderPublish: async () => {
      pushed.push(1);
      await admin.folders([...TREE, { id: 'fnew', parentId: 'froot' }]);
    },
  });
  return { app, written, relocated, stored, pushed };
}

const chartBody = (folder: Record<string, string>, cube: string) => ({
  schemaVersion: 1,
  title: 'Sales',
  ...folder,
  chart: {
    source: { cube },
    wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
  },
});

describe('a chart or dashboard published into a folder, bound there (T429, AC-272)', () => {
  it('stores a chart saved into /A/B on /A/B’s, /A’s or the root’s cube under its own name', async () => {
    const { app, written, stored } = await serving();
    for (const cube of ['ab_sales', 'a_sales', 'sales']) {
      stored['c1'] = chartBody({ folderId: 'b' }, cube);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/documents/chart/c1',
        payload: { body: chartBody({ folderId: 'b' }, cube), version: 5 },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(written.at(-1)?.body).toEqual(chartBody({ folderId: 'b' }, cube));
    }
    await app.close();
  });

  it('refuses a chart naming a cube only a sibling folder holds, naming it, and writes nothing', async () => {
    const { app, written, stored } = await serving();
    stored['c1'] = chartBody({ folderId: 'b' }, 'widgets');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: chartBody({ folderId: 'b' }, 'widgets'), version: 5 },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'No folder on this chart’s path holds “widgets”.',
      names: ['widgets'],
    });
    expect(written).toEqual([]);
    await app.close();
  });

  it('binds a dashboard’s local chart and its own filters in the dashboard’s folder', async () => {
    const { app, written, stored } = await serving();
    stored['c1'] = chartBody({ localToDashboardId: 'd1' }, 'a_sales');
    stored['d1'] = { title: 'Revenue', folderId: 'a' };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/d1',
      payload: {
        dashboard: {
          body: {
            title: 'Revenue',
            folderId: 'a',
            filters: [{ id: 'f1', widget: 'list', member: 'a_sales.region' }],
          },
          version: 5,
        },
        charts: [
          { id: 'c1', body: chartBody({ localToDashboardId: 'd1' }, 'a_sales'), version: 5 },
        ],
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(written.map((each) => each.body)).toEqual([
      chartBody({ localToDashboardId: 'd1' }, 'a_sales'),
      {
        title: 'Revenue',
        folderId: 'a',
        filters: [{ id: 'f1', widget: 'list', member: 'a_sales.region' }],
      },
    ]);
    await app.close();
  });

  it('stores a chart with no fields yet as it is: it names no cube', async () => {
    const { app, written, stored } = await serving();
    stored['c1'] = chartBody({ folderId: 'b' }, '');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: chartBody({ folderId: 'b' }, ''), version: 5 },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(written.map((each) => each.body)).toEqual([chartBody({ folderId: 'b' }, '')]);
    await app.close();
  });

  // T429's review: Explore's Move publishes the item into its new folder.
  it('binds a chart moved into /A/B there, and refuses a move to where its cube isn’t', async () => {
    const { app, written, relocated, stored } = await serving();
    stored['c1'] = chartBody({ folderId: 'a' }, 'a_sales');
    stored['c2'] = chartBody({ folderId: 'd' }, 'widgets');

    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/documents/chart/c1',
      payload: { folderId: 'b' },
    });
    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/documents/chart/c2',
      payload: { folderId: 'b' },
    });

    expect(moved.statusCode, moved.body).toBe(200);
    // Its names bound as they were: moved, and nothing of it rewritten (T709).
    expect(written).toEqual([]);
    expect(relocated).toEqual([{ kind: 'chart', id: 'c1', folderId: 'b' }]);
    // Said as a move's refusal says what it strands (T714, AC-425).
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({
      error:
        'Moved, “Sales” would use “widgets”, which isn’t in its folder or one above it. Nothing was moved.',
      stranded: [{ kind: 'chart', id: 'c2', title: 'Sales', names: ['widgets'] }],
    });
    await app.close();
  });

  it('refuses a move, moving nothing, while xcube can’t be asked (T714, AC-272)', async () => {
    const { app, written, relocated, stored } = await serving({ down: true });
    stored['c1'] = chartBody({ folderId: 'a' }, 'a_sales');

    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/documents/chart/c1',
      payload: { folderId: 'b' },
    });

    expect(refused.statusCode).toBe(502);
    expect(refused.json()).toEqual({
      error:
        'xcube could not be asked where the cubes this move carries are, so nothing was moved.',
    });
    expect(written).toEqual([]);
    expect(relocated).toEqual([]);
    await app.close();
  });

  /**
   * A move rebinds nothing (T714, AC-425; R70's rebinding on move
   * superseded): a dashboard whose filters and own charts keep their cubes on
   * its new path is moved, each stored name as it was, though stored in
   * another case than its cube's.
   */
  it('moves a dashboard whose filters and own charts keep their cubes on its new path, rewriting none', async () => {
    const { app, written, relocated, stored } = await serving();
    stored['c1'] = chartBody({ localToDashboardId: 'd1' }, 'Sales');
    stored['d1'] = {
      title: 'Revenue',
      folderId: 'root',
      filters: [{ id: 'f1', widget: 'list', member: 'Sales.region' }],
    };

    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/documents/dashboard/d1',
      payload: { folderId: 'a' },
    });

    expect(moved.statusCode, moved.body).toBe(200);
    // Moved, and nothing of it, or of its own chart, rewritten.
    expect(written).toEqual([]);
    expect(relocated).toEqual([{ kind: 'dashboard', id: 'd1', folderId: 'a' }]);
    await app.close();
  });

  it('refuses moving a dashboard whose own chart would use a cube off its new path, naming both', async () => {
    const { app, written, relocated, stored } = await serving();
    stored['c1'] = chartBody({ localToDashboardId: 'd1' }, 'ab_sales');
    stored['d1'] = { title: 'Revenue', folderId: 'b' };

    const refused = await app.inject({
      method: 'PATCH',
      url: '/api/documents/dashboard/d1',
      payload: { folderId: 'd' },
    });

    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({
      error:
        'Moved, “Sales” on “Revenue” would use “ab_sales”, which isn’t in its folder or one above it. Nothing was moved.',
      stranded: [
        { kind: 'chart', id: 'c1', title: 'Sales', dashboard: 'Revenue', names: ['ab_sales'] },
      ],
    });
    expect(written).toEqual([]);
    expect(relocated).toEqual([]);
    await app.close();
  });

  it('refuses a dashboard whose filter names a cube no folder on its path holds', async () => {
    const { app, written, stored } = await serving();
    stored['d1'] = { title: 'Revenue', folderId: 'b' };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/dashboard/d1',
      payload: {
        body: {
          title: 'Revenue',
          folderId: 'b',
          filters: [{ id: 'f1', widget: 'list', member: 'widgets.color' }],
        },
        version: 5,
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: 'No folder on this dashboard’s path holds “widgets”.',
      names: ['widgets'],
    });
    expect(written).toEqual([]);
    await app.close();
  });

  /**
   * T389's review: a text tile's measure token names a cube as a filter does,
   * so a dashboard with no filters is bound by its tokens, and refused for a
   * name no folder on its path holds.
   */
  it('binds a dashboard’s text tile tokens in its folder, and refuses one naming a cube off its path', async () => {
    const { app, written, stored } = await serving();
    stored['d1'] = { title: 'Revenue', folderId: 'a' };
    const withText = (text: string) => ({
      title: 'Revenue',
      folderId: 'a',
      pages: [{ id: 'p', items: [{ id: 't', kind: 'markdown', text }] }],
    });
    const save = (text: string) =>
      app.inject({
        method: 'PUT',
        url: '/api/documents/dashboard/d1',
        payload: { body: withText(text), version: 5 },
      });

    const refused = await save('{{measure:widgets.count}}');
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({
      error: 'No folder on this dashboard’s path holds “widgets”.',
      names: ['widgets'],
    });
    expect(written).toEqual([]);

    const saved = await save('Sales: {{measure:sales.count | marking:A}}');
    expect(saved.statusCode, saved.body).toBe(200);
    expect(written.map((each) => each.body)).toEqual([
      withText('Sales: {{measure:sales.count | marking:A}}'),
    ]);
    await app.close();
  });

  it('puts the tree to xcube and asks again, for a folder xcube doesn’t hold yet', async () => {
    const { app, written, stored, pushed } = await serving({ withNew: true });
    stored['c1'] = chartBody({ folderId: 'new' }, 'sales');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: chartBody({ folderId: 'new' }, 'sales'), version: 5 },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(pushed).toEqual([1]);
    // /New holds none of its own: the root's `sales`, as stored.
    expect(written.map((each) => each.body)).toEqual([chartBody({ folderId: 'new' }, 'sales')]);
    await app.close();
  });

  it('stores a chart in a folder xcube doesn’t serve (a workspace’s) as it is', async () => {
    const { app, written, stored } = await serving();
    stored['c1'] = chartBody({ folderId: 'mine' }, 'nowhere');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: chartBody({ folderId: 'mine' }, 'nowhere'), version: 5 },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(written.map((each) => each.body)).toEqual([chartBody({ folderId: 'mine' }, 'nowhere')]);
    await app.close();
  });

  it('saves nothing when xcube can’t be asked, and says so', async () => {
    const { app, written, stored } = await serving({ down: true });
    stored['c1'] = chartBody({ folderId: 'b' }, 'sales');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: chartBody({ folderId: 'b' }, 'sales'), version: 5 },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: 'xcube could not be asked where this chart’s cubes are, so it was not saved.',
    });
    expect(written).toEqual([]);
    await app.close();
  });
});
