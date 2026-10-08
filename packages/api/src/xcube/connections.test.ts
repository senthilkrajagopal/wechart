import { describe, expect, it } from 'vitest';

import { ROOT_FOLDER_ID } from '../repos/catalog';
import { DataSourceRefused, type DataSource } from '../repos/data-sources';
import { XcubeError } from './client';
import {
  ConnectionRefused,
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

/**
 * T701 (AC-421): a data source's connection was `<folderId>__<name>` outside
 * the root. From xcube `256d632371` names are one per model, and the image
 * refuses a prefixed one (research `xcube-256d632371.md`, 1.1, 2.2).
 */
describe('a connection’s name in xcube', () => {
  it('is the data source’s own name, in the root and in any other folder', async () => {
    const { sent, connections } = stub(() => ({ status: 200, body: {} }));
    const sync = connectionSync({
      connections,
      folders: async () => tree({ 'folder-a': 'fa1b2' }),
    });
    const sealed = { sealed: { password: ENVELOPE }, revisions: { password: 'r1' } };

    await (
      await sync.prepare(ROOT_FOLDER_ID)
    ).land(source({ folderId: ROOT_FOLDER_ID }), sealed, true);
    await (await sync.prepare('folder-a')).land(source({ name: 'lake' }), sealed, true);

    const puts = sent.filter(({ method }) => method === 'PUT');
    expect(puts.map(({ url }) => url)).toEqual([
      `${BASE}/connections/warehouse`,
      `${BASE}/connections/lake`,
    ]);
    expect(puts.map(({ body }) => (body as { folderId: string }).folderId)).toEqual([
      'froot',
      'fa1b2',
    ]);
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
    baseVersion: null,
  };

  /**
   * T701 (AC-421): from xcube `256d632371` a data source is named once per
   * model, so its connection goes by its own name in any folder, and every
   * PUT says the version it edits, `null` to create one (research
   * `xcube-256d632371.md`, 2.5).
   */
  it('puts one whole, by its own name, with the version it edits and the service credential', async () => {
    const { sent, connections } = stub(() => ({ status: 200, body: { name: 'warehouse' } }));

    await connections.put('warehouse', body);
    await connections.put('warehouse', { ...body, baseVersion: 4 });

    expect(sent).toEqual([
      {
        method: 'PUT',
        url: `${BASE}/connections/warehouse`,
        body,
        authorization: 'Bearer service-token',
      },
      {
        method: 'PUT',
        url: `${BASE}/connections/warehouse`,
        body: { ...body, baseVersion: 4 },
        authorization: 'Bearer service-token',
      },
    ]);
  });

  it('reads a refusal as one, with xcube’s problems, and anything else as a failure', async () => {
    for (const [status, code, problems] of [
      [400, 'invalid_connection', ['port must be 1–65535']],
      [409, 'driver_change', ['The driver never changes.']],
      [422, 'invalid_secret', undefined],
      // T701: the image's own (research `xcube-256d632371.md`, "The error kinds").
      [400, 'default_outside_root', ['name any other data source explicitly']],
      [409, 'name_in_use', undefined],
      [409, 'conflict', ['it changed since: read it again']],
      [409, 'data_source_range', ['a cube may use a data source in its own folder']],
    ] as const) {
      const { connections } = stub(() => ({
        status,
        body: { code, error: `refused: ${code}`, ...(problems ? { problems } : {}) },
      }));
      const refused = await connections.put('warehouse', body).catch((e: unknown) => e);
      expect(refused, code).toBeInstanceOf(ConnectionRefused);
      expect(refused, code).toMatchObject({
        status,
        code,
        message: `refused: ${code}`,
        problems: problems ?? [`refused: ${code}`],
      });
    }
    const { connections } = stub(() => ({ status: 503, body: { error: 'starting' } }));
    const failed = await connections.put('warehouse', body).catch((e: unknown) => e);
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
      // By the cubes' own names, with no folder, from `256d632371`.
      body: { code: 'in_use', error: 'In use', problems: ['orders uses it'] },
    }));
    const refused = (await used.connections
      .remove('warehouse')
      .catch((e: unknown) => e)) as ConnectionRefused;
    expect(refused).toBeInstanceOf(ConnectionRefused);
    expect([refused.status, refused.code, refused.problems]).toEqual([
      409,
      'in_use',
      ['orders uses it'],
    ]);
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
      name: 'warehouse',
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
    expect(await connections.health('warehouse')).toEqual({
      version: 7,
      instances: report.instances,
    });
    expect(sent[0]?.url).toBe(`${BASE}/connections/warehouse/health`);

    const unknown = stub(() => ({
      status: 404,
      body: { code: 'unknown_connection', error: 'No such connection' },
    }));
    expect(await unknown.connections.health('gone')).toBeUndefined();
  });

  it('lists the ones it holds, each with the version an edit of it names (T701)', async () => {
    const held: HeldConnection = {
      name: 'warehouse',
      folderId: 'froot',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db' },
      secrets: ['password'],
      revisions: { password: 'r1' },
      version: 7,
    };
    const { sent, connections } = stub(() => ({
      status: 200,
      body: { model: 'dev', connections: [{ ...held, updatedAt: 'now' }] },
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
  origin: null,
  description: null,
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

  it('puts a new one under its own name, with its folder’s xcube id, to be created, and never a secret in plain text', async () => {
    const { sent, connections } = stub(() => ({ status: 200, body: {} }));
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    await (await sync.prepare('folder-a')).land(source(), landed(), true);
    await (
      await sync.prepare(ROOT_FOLDER_ID)
    ).land(source({ folderId: ROOT_FOLDER_ID, name: 'default' }), landed(), true);

    // A create is `baseVersion: null`, which xcube never lands over another
    // data source of the name, in any case (research `xcube-256d632371.md`, 2.5).
    // Each asks first what xcube holds (T708, below): here, nothing.
    expect(sent.filter(({ method }) => method === 'GET')).toHaveLength(2);
    const puts = sent.filter(({ method }) => method === 'PUT');
    expect(puts.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      {
        method: 'PUT',
        url: `${BASE}/connections/warehouse`,
        body: {
          folderId: 'fa',
          driver: 'postgres',
          authMethod: 'password',
          fields: { host: 'db', port: 5432, ssl: false },
          sealed: { password: ENVELOPE },
          revisions: { password: 'r1' },
          baseVersion: null,
        },
      },
      expect.objectContaining({ url: `${BASE}/connections/default` }) as Sent,
    ]);
  });

  /**
   * T708: a data source wechart makes that xcube still holds, under exactly
   * its name and in its folder, is wechart's own left behind (a data reset
   * empties wechart's store, while xcube keeps the root's `default` its cubes
   * use, and refuses to drop it): landed over it, at the version xcube holds,
   * as the start's reconcile brings xcube's up to wechart's (AC-330; research
   * `xcube-256d632371.md`, 2.5). One of the name in another folder, or
   * another case, is another's: created, which xcube refuses as in use.
   */
  it('makes a new one over what xcube holds of exactly it, in its folder, and never over another’s', async () => {
    const held = [
      { name: 'default', folderId: 'froot', version: 3 },
      { name: 'warehouse', folderId: 'fb', version: 5 },
      { name: 'Lake', folderId: 'fa', version: 7 },
    ];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : { status: 200, body: {} },
    );
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    await (
      await sync.prepare(ROOT_FOLDER_ID)
    ).land(source({ folderId: ROOT_FOLDER_ID, name: 'default' }), landed(), true);
    await (await sync.prepare('folder-a')).land(source(), landed(), true);
    await (await sync.prepare('folder-a')).land(source({ name: 'lake' }), landed(), true);

    expect(
      sent
        .filter(({ method }) => method === 'PUT')
        .map(({ url, body }) => [
          url.slice(BASE.length),
          (body as { baseVersion: unknown }).baseVersion,
        ]),
    ).toEqual([
      ['/connections/default', 3],
      ['/connections/warehouse', null],
      ['/connections/lake', null],
    ]);
  });

  it('edits the version xcube holds under its name, and creates it where xcube holds none (T701)', async () => {
    const held = [
      { name: 'warehouse', folderId: 'fa', version: 4 },
      // Another data source's name in another case: never this one's version.
      { name: 'Lake', folderId: 'froot', version: 9 },
    ];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : { status: 200, body: {} },
    );
    const prepared = await connectionSync({
      connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    }).prepare('folder-a');

    await prepared.land(source(), landed(), false);
    await prepared.land(source({ name: 'lake' }), landed(), false);

    expect(
      sent.map(({ method, url, body }) => [
        method,
        url.slice(BASE.length),
        (body as { baseVersion?: unknown } | undefined)?.baseVersion,
      ]),
    ).toEqual([
      ['GET', '/connections', undefined],
      ['PUT', '/connections/warehouse', 4],
      ['GET', '/connections', undefined],
      ['PUT', '/connections/lake', null],
    ]);
  });

  /**
   * T701 (AC-421, AC-424): xcube refuses a data source's name another holds,
   * in any case, and says where neither (research `xcube-256d632371.md`,
   * "On the connection route"). The save is refused as its own item's: the
   * name is in use, and nothing says which folder, workspace or item holds it.
   */
  it('refuses a name another data source holds, saying only that it is in use', async () => {
    for (const error of [
      'The name "Warehouse" is already in use',
      'The name "Warehouse" is in use as "warehouse": a data source\'s name can\'t change, not even its case',
    ]) {
      const refused = await (
        await connectionSync({
          connections: stub(() => ({
            status: 409,
            body: { code: 'name_in_use', error, problems: [] },
          })).connections,
          folders: async () => tree({ 'folder-a': 'fa' }),
        }).prepare('folder-a')
      )
        .land(source({ name: 'Warehouse' }), landed(), true)
        .catch((e: unknown) => e);
      expect(refused, error).toBeInstanceOf(DataSourceRefused);
      expect(said(refused), error).toEqual({
        status: 409,
        message: 'The name “Warehouse” is already in use.',
        problems: ['The name “Warehouse” is already in use.'],
      });
    }
  });

  it('refuses a save over a version since changed, a move that would strand cubes, and `default` outside the root', async () => {
    const changed =
      'This data source changed in xcube meanwhile, so nothing was saved. Open it again, and save your change on what it is now.';
    expect(
      said(
        await landedBy({
          status: 409,
          body: {
            code: 'conflict',
            error: 'Data source "warehouse" isn\'t at version 4',
            problems: ['it changed since: read it again'],
            currentVersion: 5,
          },
        }).catch((e: unknown) => e),
      ),
    ).toEqual({ status: 409, message: changed, problems: [changed] });
    // The cubes xcube names are in folders the saver may not see: none is
    // said here (T715 names those they may see, AC-425).
    const stranded = await landedBy({
      status: 409,
      body: {
        code: 'data_source_range',
        error:
          'Moving data source "warehouse" would leave cubes using it outside their folder\'s range',
        problems: ['a cube may use a data source in its own folder or an ancestor of it'],
        cubes: ['deep', 'sales'],
      },
    }).catch((e: unknown) => e);
    const range =
      'Cubes using this data source would be left outside its folder and its subfolders, so nothing was saved.';
    expect(said(stranded)).toEqual({ status: 409, message: range, problems: [range] });
    expect(JSON.stringify(said(stranded))).not.toMatch(/deep|sales/);
    const root = 'Only the shared root may have a data source named default.';
    expect(
      said(
        await landedBy({
          status: 400,
          body: {
            code: 'default_outside_root',
            error: 'Only the root folder (froot) holds the data source "default"',
            problems: [
              'a cube that names no data source uses the root\'s "default"; name any other data source explicitly',
            ],
          },
        }).catch((e: unknown) => e),
      ),
    ).toEqual({ status: 400, message: root, problems: [root] });
  });

  it('puts xcube’s tree before the save, reading nothing after, and refuses a folder no tree holds', async () => {
    // A folder made a moment ago: its tree's push may still be on its way
    // (T452). Put first, so the landing inside the save's transaction needs
    // nothing more of the database (T442's review).
    const order: string[] = [];
    const { connections } = stub(({ method }) => {
      // What xcube holds is asked of xcube, not the database (T708).
      order.push(method);
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
    await prepared.land(source(), landed(), true);
    expect(order).toEqual(['tree', 'GET', 'PUT']);
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
    ).land(source(), landed(), true);
  /** A refusal as its saver is told it. */
  const said = (refused: unknown) => {
    const { status, message, problems } = refused as DataSourceRefused;
    return { status, message, problems };
  };

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
    const unsaved = 'xcube can’t be reached, so nothing was saved. Try again once it is back.';
    expect(
      said(
        await (
          await sync.prepare('folder-a')
        )
          .land(source(), landed(), true)
          .catch((e: unknown) => e),
      ),
    ).toEqual({ status: 503, message: unsaved, problems: [unsaved] });
    await expect(sync.unland(source())).rejects.toMatchObject({
      status: 503,
      message: 'xcube can’t be reached, so nothing was removed. Try again once it is back.',
    });
  });

  it('asks xcube for its instances’ reports under its own name (T365)', async () => {
    const { sent, connections } = stub(() => ({
      status: 200,
      body: { version: 3, instances: [] },
    }));
    const sync = connectionSync({ connections, folders: async () => tree({ 'folder-a': 'fa' }) });

    expect(await sync.healthOf(source())).toEqual({ version: 3, instances: [] });
    expect(sent.map(({ url }) => url)).toEqual([`${BASE}/connections/warehouse/health`]);
    // In a folder xcube's tree doesn't hold: never landed, so none.
    expect(await sync.healthOf(source({ folderId: 'workspace-folder' }))).toBeUndefined();
  });

  it('removes it from xcube first, refusing while published cubes use it', async () => {
    const used = stub(() => ({
      status: 409,
      body: { code: 'in_use', error: 'In use', problems: ['orders uses it'] },
    }));
    const sync = connectionSync({
      connections: used.connections,
      folders: async () => tree({ 'folder-a': 'fa' }),
    });
    const inUse = {
      status: 409,
      message: 'Published cubes use this data source: orders uses it',
      problems: ['orders uses it'],
    };
    expect(said(await sync.unland(source()).catch((e: unknown) => e))).toEqual(inUse);
    // Renamed: the old name's connection, under the folder prepared.
    expect(
      said(await (await sync.prepare('folder-a')).unland(source()).catch((e: unknown) => e)),
    ).toEqual(inUse);
    expect(used.sent.map(({ method, url }) => [method, url])).toEqual([
      ['DELETE', `${BASE}/connections/warehouse`],
      ['DELETE', `${BASE}/connections/warehouse`],
    ]);
  });
});

describe('xcube’s connections brought up to wechart’s at start (AC-330)', () => {
  const stored = (over: Partial<DataSource> = {}) => source(over);
  const heldAs = (over: Partial<HeldConnection> = {}): HeldConnection => ({
    name: 'warehouse',
    folderId: 'fa',
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, ssl: false },
    secrets: ['password'],
    revisions: { password: 'r1' },
    version: 1,
    ...over,
  });

  it('puts each one xcube lacks or holds otherwise, removes one wechart has not, and leaves the rest', async () => {
    const held = [
      heldAs(),
      heldAs({ name: 'lake', revisions: { password: 'old' }, version: 6 }),
      heldAs({ name: 'gone' }),
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
      'PUT /connections/lake',
      'PUT /connections/new',
      'DELETE /connections/gone',
    ]);
    // Each over the version xcube holds, or created where it holds none (T701).
    expect(
      sent
        .filter(({ method }) => method === 'PUT')
        .map(({ body }) => (body as { baseVersion: unknown }).baseVersion),
    ).toEqual([6, null]);
    expect(report).toEqual({
      put: ['lake', 'new'],
      removed: ['gone'],
      unopened: [],
      failed: [],
    });
  });

  it('puts one whose folder, driver, sign-in or fields xcube holds otherwise', async () => {
    const held = [
      heldAs({ name: 'moved', folderId: 'fb' }),
      heldAs({ name: 'typed', driver: 'redshift' }),
      heldAs({ name: 'signed', authMethod: 'client-certificate' }),
      heldAs({ name: 'fielded', fields: { host: 'db', port: 5433, ssl: false } }),
      heldAs({ name: 'fewer', fields: { host: 'db', port: 5432 } }),
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
      names.map((name) => `${BASE}/connections/${name}`),
    );
    expect(report.put).toEqual(names);
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
      unopened: ['warehouse: password: xcube holds no credential key kid-0'],
      failed: [],
    });
  });

  it('says which it couldn’t put or remove, and goes on with the rest', async () => {
    const held = [heldAs({ name: 'used' })];
    const { sent, connections } = stub(({ method }) =>
      method === 'GET'
        ? { status: 200, body: { model: 'dev', connections: held } }
        : method === 'DELETE'
          ? {
              status: 409,
              body: { code: 'in_use', error: 'In use', problems: ['orders uses it'] },
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
      failed: ['broken: xcube answered 500: boom', 'used: In use'],
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
