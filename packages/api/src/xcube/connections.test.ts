import { describe, expect, it } from 'vitest';

import { ROOT_FOLDER_ID } from '../repos/catalog';
import { DataSourceRefused, type DataSource } from '../repos/data-sources';
import { XcubeError } from './client';
import {
  ConnectionRefused,
  connectionNameOf,
  connectionSync,
  xcubeConnections,
  type HeldConnection,
} from './connections';
import type { PublishedFolders } from './folders';

/**
 * T442 (AC-327, AC-330, AC-161): each folder's data source lands in xcube as
 * a connection, from wechart's server alone — its driver, fields and the
 * envelopes the browser sealed, never a secret in plain text (research
 * `xcube-slice-6.md`, "`PUT …/connections/{name}`").
 */
const BASE = 'http://cube.invalid/cubejs-api/v1/semantic/models/dev';
const ENVELOPE = { v: 1 as const, kid: 'kid-1', enc: 'e'.repeat(43), ct: 'c'.repeat(363) };

type Sent = { method: string; url: string; body: unknown; authorization: string | null };
/** A stub xcube: each call recorded, answered by `answer`. */
function stub(answer: (sent: Sent) => { status: number; body?: unknown }) {
  const sent: Sent[] = [];
  const connections = xcubeConnections({
    cubeApiUrl: 'http://cube.invalid/cubejs-api/',
    model: 'dev',
    token: async () => 'service-token',
    fetch: async (url, init) => {
      const call = {
        method: init?.method ?? 'GET',
        url: String(url),
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        authorization: new Headers(init?.headers).get('authorization'),
      };
      sent.push(call);
      const { status, body } = answer(call);
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    },
  });
  return { sent, connections };
}

describe('a connection’s name in xcube', () => {
  it('is the short name in the root, and <folderId>__<name> in any other folder', () => {
    expect(connectionNameOf('froot', 'warehouse')).toBe('warehouse');
    expect(connectionNameOf('fa1b2', 'warehouse')).toBe('fa1b2__warehouse');
  });
});

describe('xcube’s connection routes, called from wechart’s server (AC-327)', () => {
  const body = {
    folderId: 'fa1b2',
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, ssl: false },
    sealed: { password: ENVELOPE },
    revisions: { password: 'r1' },
  };

  it('puts one whole, with the service credential', async () => {
    const { sent, connections } = stub(() => ({ status: 200, body: { name: 'fa1b2__warehouse' } }));

    await connections.put('fa1b2__warehouse', body);

    expect(sent).toEqual([
      {
        method: 'PUT',
        url: `${BASE}/connections/fa1b2__warehouse`,
        body,
        authorization: 'Bearer service-token',
      },
    ]);
  });

  it('reads a refusal as one, with xcube’s problems, and anything else as a failure', async () => {
    for (const [status, code, problems] of [
      [400, 'invalid_connection', ['port must be 1–65535']],
      [409, 'driver_change', ['The driver never changes.']],
      [422, 'invalid_secret', undefined],
    ] as const) {
      const { connections } = stub(() => ({
        status,
        body: { code, error: `refused: ${code}`, ...(problems ? { problems } : {}) },
      }));
      const refused = await connections.put('fa1b2__warehouse', body).catch((e: unknown) => e);
      expect(refused, code).toBeInstanceOf(ConnectionRefused);
      expect(refused, code).toMatchObject({
        status,
        code,
        message: `refused: ${code}`,
        problems: problems ?? [`refused: ${code}`],
      });
    }
    const { connections } = stub(() => ({ status: 503, body: { error: 'starting' } }));
    const failed = await connections.put('fa1b2__warehouse', body).catch((e: unknown) => e);
    expect(failed).toBeInstanceOf(XcubeError);
    expect(failed).not.toBeInstanceOf(ConnectionRefused);
  });

  it('removes one, refusing while published cubes use it, naming them', async () => {
    const removed = stub(() => ({ status: 204 }));
    await removed.connections.remove('warehouse');
    expect(removed.sent.map(({ method, url }) => [method, url])).toEqual([
      ['DELETE', `${BASE}/connections/warehouse`],
    ]);

    const used = stub(() => ({
      status: 409,
      body: { code: 'in_use', error: 'In use', problems: ['froot/orders uses it'] },
    }));
    await expect(used.connections.remove('warehouse')).rejects.toMatchObject({
      status: 409,
      code: 'in_use',
      problems: ['froot/orders uses it'],
    });
  });

  it('asks xcube to test one, reading its checks (T361, AC-159)', async () => {
    const checks = [
      { id: 'secrets', status: 'passed', durationMs: 3 },
      { id: 'config', status: 'passed', durationMs: 1 },
      { id: 'connect', status: 'failed', durationMs: 40, error: 'password authentication failed' },
      { id: 'schemas', status: 'skipped', durationMs: 0 },
    ];
    const { sent, connections } = stub(() => ({ status: 200, body: { ok: false, checks } }));
    const tested = {
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db' },
      sealed: { password: ENVELOPE },
    };

    expect(await connections.test(tested)).toEqual({ ok: false, checks });
    expect(sent).toEqual([
      {
        method: 'POST',
        url: `${BASE}/connections/test`,
        body: tested,
        authorization: 'Bearer service-token',
      },
    ]);
  });

  it('takes an answer without checks as no test at all (T361’s review)', async () => {
    const { connections } = stub(() => ({ status: 200, body: { ok: true } }));
    await expect(
      connections.test({ driver: 'postgres', authMethod: 'password', fields: {}, sealed: {} }),
    ).rejects.toThrow('xcube answered a test with no checks');
  });

  it('reads each instance’s report of one, and says when xcube holds none of that name (T365)', async () => {
    const report = {
      model: 'dev',
      name: 'fa__warehouse',
      version: 7,
      revisions: { password: 'r2' },
      instances: [
        {
          instance: 'cube-1/1/abc123',
          version: 7,
          state: 'live',
          error: null,
          reportedAt: '2026-09-26T10:00:00.000Z',
          current: true,
        },
      ],
    };
    const { sent, connections } = stub(() => ({ status: 200, body: report }));
    expect(await connections.health('fa__warehouse')).toEqual({
      version: 7,
      instances: report.instances,
    });
    expect(sent[0]?.url).toBe(`${BASE}/connections/fa__warehouse/health`);

    const unknown = stub(() => ({
      status: 404,
      body: { code: 'unknown_connection', error: 'No such connection' },
    }));
    expect(await unknown.connections.health('fa__gone')).toBeUndefined();
  });

  it('lists the ones it holds', async () => {
    const held: HeldConnection = {
      name: 'warehouse',
      folderId: 'froot',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db' },
      secrets: ['password'],
      revisions: { password: 'r1' },
    };
    const { sent, connections } = stub(() => ({
      status: 200,
      body: { model: 'dev', connections: [{ ...held, version: 7, updatedAt: 'now' }] },
    }));
    expect(await connections.list()).toEqual([held]);
    expect(sent[0]?.url).toBe(`${BASE}/connections`);
  });
});

const source = (over: Partial<DataSource> = {}): DataSource => ({
  id: 'ds-1',
  folderId: 'folder-a',
  name: 'warehouse',
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db', port: 5432, ssl: false },
  secrets: ['password'],
  settingsPrint: 'print-1',
  targetFolderId: null,
  version: 1,
  updatedAt: new Date(0),
  ...over,
});
const tree = (ids: Record<string, string>): PublishedFolders => ({
  ids: new Map(Object.entries({ [ROOT_FOLDER_ID]: 'froot', ...ids })),
  parents: new Map(),
});

describe('a data source landing in xcube before it is stored (T442)', () => {
  const landed = (sealed = { password: ENVELOPE }) => ({
    sealed,
    revisions: { password: 'r1' },
  });

  it('puts it under its full name, with its folder’s xcube id, and never a secret in plain text', async () => {
    const { sent, connections } = stub(() => ({ status: 200, body: {} }));
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    await (await sync.prepare('folder-a')).land(source(), landed());
    await (
      await sync.prepare(ROOT_FOLDER_ID)
    ).land(source({ folderId: ROOT_FOLDER_ID, name: 'default' }), landed());

    expect(sent.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      {
        method: 'PUT',
        url: `${BASE}/connections/fa__warehouse`,
        body: {
          folderId: 'fa',
          driver: 'postgres',
          authMethod: 'password',
          fields: { host: 'db', port: 5432, ssl: false },
          sealed: { password: ENVELOPE },
          revisions: { password: 'r1' },
        },
      },
      expect.objectContaining({ url: `${BASE}/connections/default` }) as Sent,
    ]);
  });

  it('puts xcube’s tree before the save, reading nothing after, and refuses a folder no tree holds', async () => {
    // A folder made a moment ago: its tree's push may still be on its way
    // (T452). Put first, so the landing inside the save's transaction needs
    // nothing more of the database (T442's review).
    const order: string[] = [];
    const { connections } = stub(() => {
      order.push('PUT');
      return { status: 200, body: {} };
    });
    let asked = 0;
    const sync = connectionSync({
      connections,
      folders: async () => {
        asked += 1;
        return tree({ 'folder-a': 'fa' });
      },
      pushTree: async () => {
        order.push('tree');
      },
    });
    const prepared = await sync.prepare('folder-a');
    const before = asked;
    await prepared.land(source(), landed());
    expect(order).toEqual(['tree', 'PUT']);
    expect(asked).toBe(before);

    // A folder no tree holds (a workspace's, until slice 5's overlays).
    const refused = await sync.prepare('my-workspace-folder').catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(DataSourceRefused);
    expect(refused).toMatchObject({
      status: 409,
      message: 'This folder isn’t published to xcube, so its data sources can’t be used yet.',
    });
  });

  const landedBy = async (answer: { status: number; body?: unknown }) =>
    (
      await connectionSync({
        connections: stub(() => answer).connections,
        folders: async () => tree({ 'folder-a': 'fa' }),
      }).prepare('folder-a')
    ).land(source(), landed());

  it('refuses the save with xcube’s own reason, saying what xcube answered otherwise', async () => {
    await expect(
      landedBy({
        status: 422,
        body: {
          code: 'invalid_secret',
          error: 'password: doesn’t open for this connection target',
        },
      }),
    ).rejects.toMatchObject({
      status: 422,
      message:
        'xcube can’t open a secret: password: doesn’t open for this connection target. Enter it again.',
    });
    await expect(
      landedBy({
        status: 400,
        body: { code: 'invalid_connection', error: 'Invalid', problems: ['port: out of range'] },
      }),
    ).rejects.toMatchObject({ status: 400, problems: ['port: out of range'] });
    // A service key xcube won't take is no outage: said as xcube's answer (T442's review).
    await expect(
      landedBy({ status: 401, body: { error: 'Invalid service token' } }),
    ).rejects.toMatchObject({
      status: 502,
      message: 'xcube refused it: xcube answered 401: Invalid service token',
    });
  });

  it('says xcube can’t be reached only when it can’t be', async () => {
    const away = xcubeConnections({
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      model: 'dev',
      token: 'x',
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const sync = connectionSync({
      connections: away,
      folders: async () => tree({ 'folder-a': 'fa' }),
    });
    await expect((await sync.prepare('folder-a')).land(source(), landed())).rejects.toMatchObject({
      status: 503,
      message: 'xcube can’t be reached, so nothing was saved. Try again once it is back.',
    });
    await expect(sync.unland(source())).rejects.toMatchObject({
      status: 503,
      message: 'xcube can’t be reached, so nothing was removed. Try again once it is back.',
    });
  });

  it('asks xcube for its instances’ reports under its full name (T365)', async () => {
    const { sent, connections } = stub(() => ({
      status: 200,
      body: { version: 3, instances: [] },
    }));
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    expect(await sync.healthOf(source())).toEqual({ version: 3, instances: [] });
    expect(sent.map(({ url }) => url)).toEqual([`${BASE}/connections/fa__warehouse/health`]);
    // In a folder xcube's tree doesn't hold: never landed, so none.
    expect(await sync.healthOf(source({ folderId: 'workspace-folder' }))).toBeUndefined();
  });

  it('removes it from xcube first, refusing while published cubes use it', async () => {
    const used = stub(() => ({
      status: 409,
      body: { code: 'in_use', error: 'In use', problems: ['fa/orders uses it'] },
    }));
    const sync = connectionSync({
      connections: used.connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    });
    await expect(sync.unland(source())).rejects.toMatchObject({
      status: 409,
      message: 'Published cubes use this data source: fa/orders uses it',
    });
    // Renamed: the old name's connection, under the folder prepared.
    await expect((await sync.prepare('folder-a')).unland(source())).rejects.toMatchObject({
      status: 409,
      message: 'Published cubes use this data source: fa/orders uses it',
      problems: ['fa/orders uses it'],
    });
    expect(used.sent.map(({ method, url }) => [method, url])).toEqual([
      ['DELETE', `${BASE}/connections/fa__warehouse`],
      ['DELETE', `${BASE}/connections/fa__warehouse`],
    ]);
  });
});

describe('xcube’s connections brought up to wechart’s at start (AC-330)', () => {
  const stored = (over: Partial<DataSource> = {}) => source(over);
  const heldAs = (over: Partial<HeldConnection> = {}): HeldConnection => ({
    name: 'fa__warehouse',
    folderId: 'fa',
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, ssl: false },
    secrets: ['password'],
    revisions: { password: 'r1' },
    ...over,
  });

  it('puts each one xcube lacks or holds otherwise, removes one wechart has not, and leaves the rest', async () => {
    const held = [
      heldAs(),
      heldAs({ name: 'fa__lake', revisions: { password: 'old' } }),
      heldAs({ name: 'fa__gone' }),
    ];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : method === 'DELETE'
          ? { status: 204 }
          : { status: 200, body: {} },
    );
    const sources = [
      stored(),
      stored({ id: 'ds-2', name: 'lake' }),
      stored({ id: 'ds-3', name: 'new' }),
    ];
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    const report = await sync.reconcile({
      all: async () => sources,
      sealedOf: async () => ({ sealed: { password: ENVELOPE }, revisions: { password: 'r1' } }),
    });

    expect(sent.map(({ method, url }) => `${method} ${url.slice(BASE.length)}`)).toEqual([
      'GET /connections',
      'PUT /connections/fa__lake',
      'PUT /connections/fa__new',
      'DELETE /connections/fa__gone',
    ]);
    expect(report).toEqual({
      put: ['fa__lake', 'fa__new'],
      removed: ['fa__gone'],
      unopened: [],
      failed: [],
    });
  });

  it('puts one whose folder, driver, sign-in or fields xcube holds otherwise', async () => {
    const held = [
      heldAs({ name: 'fa__moved', folderId: 'fb' }),
      heldAs({ name: 'fa__typed', driver: 'redshift' }),
      heldAs({ name: 'fa__signed', authMethod: 'client-certificate' }),
      heldAs({ name: 'fa__fielded', fields: { host: 'db', port: 5433, ssl: false } }),
      heldAs({ name: 'fa__fewer', fields: { host: 'db', port: 5432 } }),
    ];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : { status: 200, body: {} },
    );
    const names = ['moved', 'typed', 'signed', 'fielded', 'fewer'];
    const report = await connectionSync({
      connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    }).reconcile({
      all: async () => names.map((name, at) => stored({ id: `ds-${String(at)}`, name })),
      sealedOf: async () => ({ sealed: { password: ENVELOPE }, revisions: { password: 'r1' } }),
    });

    expect(sent.filter(({ method }) => method === 'PUT').map(({ url }) => url)).toEqual(
      names.map((name) => `${BASE}/connections/fa__${name}`),
    );
    expect(report.put).toEqual(names.map((name) => `fa__${name}`));
  });

  it('keeps a stored secret xcube can’t open, saying so, for a key xcube lacks is no stale secret (T442’s review)', async () => {
    const { connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: [] } }
        : {
            status: 422,
            body: {
              code: 'invalid_secret',
              error: 'password: xcube holds no credential key kid-0',
            },
          },
    );
    const report = await connectionSync({
      connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    }).reconcile({
      all: async () => [stored()],
      sealedOf: async () => ({ sealed: { password: ENVELOPE }, revisions: { password: 'r1' } }),
    });

    expect(report).toEqual({
      put: [],
      removed: [],
      unopened: ['fa__warehouse: password: xcube holds no credential key kid-0'],
      failed: [],
    });
  });

  it('says which it couldn’t put or remove, and goes on with the rest', async () => {
    const held = [heldAs({ name: 'fa__used' })];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : method === 'DELETE'
          ? {
              status: 409,
              body: { code: 'in_use', error: 'In use', problems: ['fa/orders uses it'] },
            }
          : { status: 500, body: { error: 'boom' } },
    );
    const report = await connectionSync({
      connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    }).reconcile({
      all: async () => [stored({ name: 'broken' })],
      sealedOf: async () => ({ sealed: { password: ENVELOPE }, revisions: { password: 'r1' } }),
    });

    expect(sent.map(({ method }) => method)).toEqual(['GET', 'PUT', 'DELETE']);
    expect(report).toEqual({
      put: [],
      removed: [],
      unopened: [],
      failed: ['fa__broken: xcube answered 500: boom', 'fa__used: In use'],
    });
  });

  it('leaves a workspace’s data sources, which xcube’s tree doesn’t hold, to slice 5', async () => {
    const { sent, connections } = stub(() => ({
      status: 200,
      body: { model: 'dev', connections: [] },
    }));
    const report = await connectionSync({ connections, folders: async () => tree({}) }).reconcile({
      all: async () => [stored({ folderId: 'workspace-folder' })],
      sealedOf: async () => ({ sealed: {}, revisions: {} }),
    });
    expect(sent.map(({ method }) => method)).toEqual(['GET']);
    expect(report).toEqual({ put: [], removed: [], unopened: [], failed: [] });
  });
});
