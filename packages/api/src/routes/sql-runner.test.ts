import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { workspaceOverlayIdOf } from '../xcube/overlays';
import { xcubeSqlRunner } from '../xcube/sql-runner';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';
import { auditSqlOf } from './sql-runner';
import { copyRepointed } from './sql-runner-switch';

/**
 * T532 (AC-373, AC-375, AC-376, AC-377, AC-378, AC-383; R50, R51): SQL run
 * on a data source through xcube, for those who may, against the stub xcube.
 *
 * - On a shared folder's data source: Super-Admins and the folder's own
 *   read-write members, once a Super-Admin has switched it on; nobody while
 *   it is off; never a member who sees it only as an ancestor's, a
 *   read-only member, or another folder's.
 * - On one in My workspace: its owner, with no switch, and nobody else;
 *   except a copy pointed at another database, user or role than its
 *   original's, which needs the switch (design 15's Q8).
 * - Each run goes with R50's caps: 10,000 rows, 30 seconds, 10 MB.
 *
 * `writer` (`sales-rw`) writes /Sales; `reader` (`sales-ro`) reads it;
 * `manager` writes /Sales/Sub, so sees /Sales's data sources as an
 * ancestor's; `many` (`g20`) writes /Other alone; `super` is a Super-Admin.
 */
const MARK = `sqlr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `sqlr-${MARK}`;
const SOURCE = `warehouse_${MARK}`;
const CAPS = { maxRows: 10_000, timeoutMs: 30_000, maxBytes: 10 * 1024 * 1024 };
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const FIELDS = { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false };

const folders = { sales: '', sub: '', other: '' };
const xids = new Map<string, string>([['root', 'froot']]);
let source = '';
let app: FastifyInstance;
let stub: ReturnType<typeof fakeXcube>;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());
const made: string[] = [];

beforeAll(async () => {
  for (const [key, parent, access] of [
    ['sales', 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['sub', 'sales', { readOnly: null, readWrite: ['managers'] }],
    ['other', 'root', { readOnly: null, readWrite: ['g20'] }],
  ] as const) {
    const id = randomUUID();
    made.push(id);
    folders[key] = id;
    xids.set(id, `f${key}`);
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: parent === 'root' ? 'root' : folders[parent],
        access,
      },
    });
  }
  source = (
    await sources().create({
      folderId: folders.sales,
      name: SOURCE,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('sales') },
    })
  ).id;

  stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: 'http://xcube.test/cubejs-api',
    model: MODEL,
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
    { id: 'fsub', parentId: 'fsales' },
    { id: 'fother', parentId: 'froot' },
  ]);
  // A head, which an overlay is pushed over (T347).
  stub.holdItems(MODEL, []);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
      security: 'oidc',
      publicUrl: PUBLIC_URL,
      sessionSecret: 'a-test-session-secret-at-least-32-characters',
      superAdminGroup: 'wechart-super-admins',
      oidc: {
        issuer: 'http://localhost:5556/dex',
        clientId: 'wechart',
        clientSecret: 'dev-oidc-secret',
        groupsClaim: 'groups',
        scopes: 'openid profile email groups',
        allowHttp: true,
      },
    },
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: sources(),
    sqlRunnerSwitches: switches(),
    xcube: admin,
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: 'http://xcube.test/cubejs-api',
      model: MODEL,
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    folders: async () => ({
      ids: xids,
      parents: new Map([
        ['root', null],
        [folders.sales, 'root'],
        [folders.sub, folders.sales],
        [folders.other, 'root'],
      ]),
    }),
  });
  for (const who of ['super', 'writer', 'reader', 'manager', 'many'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await removeProjectFolders();
  const copies = await db
    .selectFrom('data_sources')
    .select('id')
    .where('name', 'like', `%${MARK}%`)
    .execute();
  for (const { id } of copies) {
    await switches().off(id);
    await sources().remove(id);
  }
  for (const id of made.reverse()) await docs().remove('folder', id);
  await closeDb();
});

beforeEach(() => {
  stub.answerSql(undefined);
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const run = (who: string, id: string, sql = 'SELECT 1') =>
  as(who, { method: 'POST', url: `/api/data-sources/${id}/sql`, payload: { sql } });
const turnOn = (id: string) =>
  as('super', {
    method: 'PUT',
    url: `/api/data-sources/${id}/sql-runner`,
    payload: { on: true, readOnlyConfirmed: true },
  });
/** The runs xcube was asked for since `from`. */
const askedSince = (from: number) => stub.sqlAsked().slice(from);

describe('SQL on a shared folder’s data source (T532, AC-373)', () => {
  it('runs for nobody while its runner is off, and nothing reaches xcube', async () => {
    const before = stub.sqlAsked().length;
    for (const who of ['super', 'writer']) {
      const answer = await run(who, source);
      expect(answer.statusCode, `${who}: ${answer.body}`).toBe(403);
      expect(answer.json<{ error: string }>().error).toBe(
        'The SQL runner is off for this data source: a Super-Admin turns it on.',
      );
    }
    expect(askedSince(before)).toEqual([]);
  });

  it('runs for Super-Admins and its own folder’s read-write members once on, with R50’s caps, and for nobody else', async () => {
    expect((await turnOn(source)).statusCode).toBe(200);
    const before = stub.sqlAsked().length;
    try {
      for (const who of ['super', 'writer']) {
        const answer = await run(who, source);
        expect(answer.statusCode, `${who}: ${answer.body}`).toBe(200);
        expect(answer.json()).toEqual({
          outcome: 'finished',
          columns: [{ name: 'one', type: 'int4' }],
          rows: [[1]],
          rowCount: 1,
          truncated: null,
          durationMs: 1,
          statement: 'select',
        });
      }
      // A member who sees it only from a folder below its own (R50-1).
      const below = await run('manager', source);
      expect(below.statusCode, below.body).toBe(403);
      expect(below.json<{ error: string }>().error).toBe(
        'Only Super-Admins and read-write members of its own folder run SQL on it.',
      );
      // A read-only member sees no data source; another folder's member not this one.
      for (const who of ['reader', 'many'])
        expect((await run(who, source)).statusCode, who).toBe(404);

      const asked = askedSince(before);
      expect(asked).toHaveLength(2);
      for (const ask of asked) {
        // By its own name in any folder (T701).
        expect(ask.target).toEqual({ connection: SOURCE, overlay: null });
        expect(ask).toMatchObject({ sql: 'SELECT 1', ...CAPS });
        expect(ask.runId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      }
      expect(asked[0]!.runId).not.toBe(asked[1]!.runId);
    } finally {
      await switches().off(source);
    }
  });

  it('takes SQL as text, at most 100,000 characters, before anything reaches xcube', async () => {
    await turnOn(source);
    const before = stub.sqlAsked().length;
    try {
      for (const sql of ['', '   ', 'x'.repeat(100_001)]) {
        const answer = await run('writer', source, sql);
        expect(answer.statusCode, answer.body).toBe(400);
      }
      const none = await as('writer', {
        method: 'POST',
        url: `/api/data-sources/${source}/sql`,
        payload: {},
      });
      expect(none.statusCode).toBe(400);
      expect(askedSince(before)).toEqual([]);
    } finally {
      await switches().off(source);
    }
  });
});

/**
 * T810 (AC-482): on Dremio, which binds no parameter values
 * (research/sql-parameter-binding.md §1), a run whose SQL holds a
 * `{{ name }}` outside strings and comments is refused before xcube is
 * called, saying why; no value is ever written into its SQL.
 * Fails when: a run with a `{{ name }}` on Dremio reaches the database.
 */
describe('parameters on Dremio (T810, AC-482)', () => {
  it('refuses a run holding a {{ name }} before xcube is asked, saying parameters aren’t available there', async () => {
    const dremio = (
      await sources().create({
        folderId: folders.sales,
        name: `dremio_${MARK}`,
        driver: 'dremio',
        authMethod: 'token',
        fields: { host: 'dremio', port: 9047, ssl: false },
        sealed: { token: sealed('dremio') },
      })
    ).id;
    await turnOn(dremio);
    const before = stub.sqlAsked().length;
    try {
      for (const sql of ['SELECT * FROM t WHERE region = {{region}}', 'SELECT {{ x }}']) {
        const answer = await run('writer', dremio, sql);
        expect(answer.statusCode, answer.body).toBe(400);
        expect(answer.json()).toEqual({
          outcome: 'refused',
          error:
            'Parameters aren’t available on Dremio. Write the value into the SQL to run it here.',
        });
      }
      expect(askedSince(before)).toEqual([]);

      // One in a string or a comment isn't a parameter: that SQL runs, as written.
      const plain = "SELECT '{{not_one}}' -- {{nor_this}}";
      expect((await run('writer', dremio, plain)).statusCode).toBe(200);
      expect(askedSince(before).map((ask) => ask.sql)).toEqual([plain]);
    } finally {
      await switches().off(dremio);
      await sources().remove(dremio);
    }
  });

  it('runs a {{ name }} on other drivers as sent, its value never written in (bound by T811, sql-runner-history.test.ts)', async () => {
    await turnOn(source);
    const before = stub.sqlAsked().length;
    try {
      const sql = 'SELECT * FROM t WHERE region = {{region}}';
      expect((await run('writer', source, sql)).statusCode).toBe(200);
      expect(askedSince(before).map((ask) => ask.sql)).toEqual([sql]);
    } finally {
      await switches().off(source);
    }
  });
});

describe('what a run answers (T532, AC-375, AC-377, AC-378)', () => {
  beforeAll(async () => {
    await turnOn(source);
  });
  afterAll(async () => {
    await switches().off(source);
  });

  it('says a result cut at 10,000 rows or 10 MB was cut, and at which (AC-377)', async () => {
    for (const truncated of ['rows', 'bytes'] as const) {
      stub.answerSql(() => ({
        status: 200,
        body: {
          columns: [{ name: 'g', type: 'int4' }],
          rows: [[1], [2]],
          rowCount: 2,
          truncated,
          durationMs: 4,
          statement: 'select',
          redactedSql: 'SELECT g FROM generate_series(?, ?) g',
        },
      }));
      const answer = await run('writer', source);
      expect(answer.statusCode, answer.body).toBe(200);
      expect(answer.json()).toMatchObject({ outcome: 'finished', rowCount: 2, truncated });
    }
  });

  it('refuses anything but one SELECT or EXPLAIN, saying so and naming what it found (AC-375)', async () => {
    stub.answerSql((ask) =>
      ask.sql.startsWith('DELETE')
        ? {
            status: 400,
            body: {
              error: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
              code: 'not_read_only',
              statement: 'delete',
              redactedSql: 'DELETE FROM t WHERE a = ?',
            },
          }
        : {
            status: 400,
            body: {
              error: 'Only one statement runs at a time',
              code: 'several_statements',
              statement: null,
              redactedSql: 'SELECT ?; SELECT ?',
            },
          },
    );
    const deleted = await run('writer', source, "DELETE FROM t WHERE a = 'x'");
    expect(deleted.statusCode, deleted.body).toBe(400);
    expect(deleted.json()).toEqual({
      outcome: 'refused',
      error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
      reason: 'Only a SELECT or an EXPLAIN runs here: this is a DELETE statement',
      statement: 'delete',
    });
    const two = await run('writer', source, 'SELECT 1; SELECT 2');
    expect(two.statusCode, two.body).toBe(400);
    expect(two.json()).toMatchObject({
      outcome: 'refused',
      error: 'Only SELECT and EXPLAIN run here, one statement at a time.',
      reason: 'Only one statement runs at a time',
    });
  });

  it('says a run stopped at 30 seconds was stopped there, with the rows that came back before (AC-378; T545)', async () => {
    // As xcube 6d9673ccda answers it (research xcube-6d9673ccda.md).
    stub.answerSql(() => ({
      status: 422,
      body: {
        error: 'The statement ran past 30 s and was stopped',
        code: 'timeout',
        statement: 'select',
        redactedSql: 'SELECT g, pg_sleep(?) FROM generate_series(?, ?) g',
        durationMs: 30_002,
        columns: [
          { name: 'g', type: 'int4' },
          { name: 'slept', type: 'text' },
        ],
        rows: [
          [1, null],
          [2, null],
          [3, null],
        ],
        rowCount: 3,
        truncated: 'stopped',
      },
    }));
    const answer = await run(
      'writer',
      source,
      'SELECT g, pg_sleep(31) FROM generate_series(1, 9) g',
    );
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      outcome: 'timeout',
      error: 'Stopped at 30 seconds: the run hadn’t finished, so it was stopped on the database.',
      durationMs: 30_002,
      columns: [
        { name: 'g', type: 'int4' },
        { name: 'slept', type: 'text' },
      ],
      rows: [
        [1, null],
        [2, null],
        [3, null],
      ],
      rowCount: 3,
      truncated: 'stopped',
      statement: 'select',
    });
  });

  it('gives the database’s own error, and says when xcube is busy or can’t connect', async () => {
    stub.answerSql((ask) =>
      ask.sql === 'busy'
        ? { status: 503, body: { error: 'Busy', code: 'busy', statement: null, redactedSql: null } }
        : ask.sql === 'unconnected'
          ? {
              status: 502,
              body: {
                error: 'password authentication failed for user "cube"',
                code: 'connect_failed',
                statement: 'select',
                redactedSql: 'SELECT ?',
              },
            }
          : {
              status: 422,
              body: {
                error: 'cannot execute nextval() in a read-only transaction',
                code: 'query_failed',
                statement: 'select',
                redactedSql: 'SELECT nextval(?)',
                durationMs: 0,
              },
            },
    );
    const failed = await run('writer', source, "SELECT nextval('s')");
    expect(failed.statusCode, failed.body).toBe(422);
    expect(failed.json()).toEqual({
      outcome: 'failed',
      error: 'cannot execute nextval() in a read-only transaction',
      durationMs: 0,
    });
    const unconnected = await run('writer', source, 'unconnected');
    expect(unconnected.statusCode, unconnected.body).toBe(502);
    expect(unconnected.json()).toEqual({
      outcome: 'failed',
      error: 'Couldn’t connect to the database: password authentication failed for user "cube"',
      durationMs: null,
    });
    const busy = await run('writer', source, 'busy');
    expect(busy.statusCode, busy.body).toBe(503);
    expect(busy.json()).toEqual({
      outcome: 'busy',
      error: 'xcube is running as many SQL runs as it takes at once. Try again in a moment.',
    });
  });
});

/**
 * A shared data source of /Sales of a test's own, its runner off as each
 * starts: one user's copy of it is theirs alone, so no test shares one
 * (T532's review).
 */
const originalFor = async (tag: string) =>
  (
    await sources().create({
      folderId: folders.sales,
      name: `${tag}_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed(tag) },
    })
  ).id;
/** `who`'s copy of a shared data source, in their workspace (T346). */
async function copyOf(who: string, original: string) {
  const copied = await as(who, {
    method: 'POST',
    url: `/api/data-sources/${original}/copy`,
    payload: { timeZone: TEST_TIME_ZONE },
  });
  expect(copied.statusCode, copied.body).toBe(201);
  return copied.json<{ id: string; folderId: string }>();
}
const workspaceOf = async (folderId: string): Promise<string> => {
  let at = folderId;
  for (let hops = 0; hops < 10; hops += 1) {
    const folder = await docs().get('folder', at);
    const parent = folder?.body['folderId'];
    if (typeof parent !== 'string' || parent === 'root' || parent === '') return at;
    at = parent;
  }
  return at;
};

describe('SQL on a data source in My workspace (T532, AC-383)', () => {
  it('runs for its owner on an unchanged copy with no switch, on its workspace’s overlay, and for nobody else', async () => {
    const original = await originalFor('unchanged');
    expect(await switches().of(original)).toBeUndefined();
    const copy = await copyOf('writer', original);
    expect(await switches().of(copy.id)).toBeUndefined();
    const workspace = await workspaceOf(copy.folderId);
    const before = stub.sqlAsked().length;
    const answer = await run('writer', copy.id);
    expect(answer.statusCode, answer.body).toBe(200);
    // Under its original's name, as its overlay brings it (T347, T701).
    expect(askedSince(before).map((ask) => ask.target)).toEqual([
      { connection: `unchanged_${MARK}`, overlay: workspaceOverlayIdOf(workspace) },
    ]);
    // Nobody else sees it: a Super-Admin neither (AC-276).
    expect((await run('super', copy.id)).statusCode).toBe(404);
    expect((await run('manager', copy.id)).statusCode).toBe(404);
  });

  it('runs for its owner on one made new there, under its target', async () => {
    // Made beside a copy, in a project folder of the writer's workspace.
    const copy = await copyOf('writer', await originalFor('beside'));
    const fresh = await sources().create({
      folderId: copy.folderId,
      name: `fresh_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: sealed('fresh') },
      targetFolderId: folders.sales,
    });
    const before = stub.sqlAsked().length;
    const answer = await run('writer', fresh.id);
    expect(answer.statusCode, answer.body).toBe(200);
    expect(askedSince(before).map((ask) => ask.target)).toEqual([
      {
        connection: `fresh_${MARK}`,
        overlay: workspaceOverlayIdOf(await workspaceOf(copy.folderId)),
      },
    ]);
  });

  it('needs a Super-Admin’s switch on a copy pointed at another database, which no Super-Admin sees in another’s workspace (Q8)', async () => {
    const copy = await copyOf('writer', await originalFor('repointed'));
    await sources().update(copy.id, { fields: { ...FIELDS, database: 'payroll' } });
    const before = stub.sqlAsked().length;
    const answer = await run('writer', copy.id);
    expect(answer.statusCode, answer.body).toBe(403);
    expect(answer.json<{ error: string }>().error).toBe(
      'This copy signs in to another database, or as another user or role, than its original, so it needs a Super-Admin to turn the SQL runner on, as a shared data source does. No Super-Admin can see your workspace, so propose it: once it’s approved and landed, a Super-Admin can turn it on there.',
    );
    expect(askedSince(before)).toEqual([]);
  });

  it('needs the switch on a copy whose original is gone, which can’t be compared with it', async () => {
    const original = await originalFor('gone');
    const copy = await copyOf('writer', original);
    await sources().remove(original);
    const before = stub.sqlAsked().length;
    const answer = await run('writer', copy.id);
    expect(answer.statusCode, answer.body).toBe(403);
    expect(answer.json<{ error: string }>().error).toBe(
      'This copy’s original is gone, so whether it signs in as its original did can’t be told: it needs a Super-Admin to turn the SQL runner on, as a shared data source does. No Super-Admin can see your workspace, so propose it: once it’s approved and landed, a Super-Admin can turn it on there.',
    );
    expect(askedSince(before)).toEqual([]);
  });

  it('runs on a Super-Admin’s own repointed copy once they switch it on, and no switch is offered for an unchanged one', async () => {
    const copy = await copyOf('super', await originalFor('supers'));
    const unchanged = await as('super', {
      method: 'PUT',
      url: `/api/data-sources/${copy.id}/sql-runner`,
      payload: { on: true, readOnlyConfirmed: true },
    });
    expect(unchanged.statusCode, unchanged.body).toBe(400);

    await sources().update(copy.id, { fields: { ...FIELDS, user: 'payroll_admin' } });
    expect((await run('super', copy.id)).statusCode).toBe(403);
    expect((await turnOn(copy.id)).statusCode).toBe(200);
    const answer = await run('super', copy.id);
    expect(answer.statusCode, answer.body).toBe(200);
  });
});

/** What a data source's page says of its SQL tab to `who` (T535). */
const accessOf = async (who: string, id: string) => {
  const answer = await as(who, { method: 'GET', url: `/api/data-sources/${id}` });
  expect(answer.statusCode, answer.body).toBe(200);
  return answer.json<{ sqlAccess?: unknown }>().sqlAccess;
};

describe('what a data source’s page says of its SQL tab (T535, AC-373, AC-383; design 15’s P1)', () => {
  it('gives the tab to Super-Admins and the folder’s own read-write members, saying while off that it is off, and to nobody else', async () => {
    const original = await originalFor('tabbed');
    const off = {
      tab: true,
      runs: false,
      why: 'The SQL runner is off for this data source: a Super-Admin turns it on.',
    };
    expect(await accessOf('super', original)).toEqual(off);
    expect(await accessOf('writer', original)).toEqual(off);
    // A member who sees it from a folder below gets no tab.
    expect(await accessOf('manager', original)).toEqual({
      tab: false,
      runs: false,
      why: 'Only Super-Admins and read-write members of its own folder run SQL on it.',
    });
    await turnOn(original);
    expect(await accessOf('writer', original)).toEqual({ tab: true, runs: true });
  });

  it('gives a workspace data source’s owner the tab with no switch, and says why a repointed copy needs one', async () => {
    const copy = await copyOf('writer', await originalFor('tabbed_copy'));
    expect(await accessOf('writer', copy.id)).toEqual({
      tab: true,
      runs: true,
      needsSwitch: false,
    });
    await sources().update(copy.id, { fields: { ...FIELDS, database: 'payroll' } });
    expect(await accessOf('writer', copy.id)).toEqual({
      tab: true,
      runs: false,
      needsSwitch: true,
      why: expect.stringMatching(/^This copy signs in to another database/),
    });
  });
});

describe('a copy pointed elsewhere than its original (T532, design 15’s Q8)', () => {
  const original = { authMethod: 'password', fields: FIELDS };

  it('is one with another database, user or role, or another way of signing in', () => {
    for (const fields of [
      { ...FIELDS, database: 'payroll' },
      { ...FIELDS, user: 'admin' },
      { ...FIELDS, role: 'admin' },
    ])
      expect(
        copyRepointed('postgres', original, { ...original, fields }),
        JSON.stringify(fields),
      ).toBe(true);
    expect(
      copyRepointed(
        'snowflake',
        { authMethod: 'key-pair', fields: { username: 'a', role: 'r' } },
        {
          authMethod: 'key-pair',
          fields: { username: 'a', role: 'admin' },
        },
      ),
    ).toBe(true);
    expect(
      copyRepointed('postgres', original, { authMethod: 'client-certificate', fields: FIELDS }),
    ).toBe(true);
  });

  it('isn’t one changed only where its secret is bound, or not at all', () => {
    // A new host or port needs its secret entered again (AC-312): no stored one reaches further.
    expect(
      copyRepointed('postgres', original, { ...original, fields: { ...FIELDS, host: 'b' } }),
    ).toBe(false);
    expect(copyRepointed('postgres', original, { ...original, fields: { ...FIELDS } })).toBe(false);
  });
});

/**
 * T811, AC-454: a bound run's SQL in the audit trail, xcube's placeholders
 * named again, as xcube writes them per driver (research
 * xcube-bb188d8ada.md, "The checks", 4).
 */
describe('a bound run’s SQL as the audit keeps it (T811, AC-454)', () => {
  it('names PostgreSQL’s and Redshift’s placeholders again, casts and the spaces xcube wrote gone', () => {
    for (const driver of ['postgres', 'redshift'])
      expect(
        auditSqlOf(
          'SELECT  $1::text  AS a,  $2::numeric\nFROM t WHERE d >  $3::date  AND  $1::text  <> ?',
          driver,
          ['c', 'n', 'd'],
        ),
        driver,
      ).toBe('SELECT {{c}} AS a, {{n}}\nFROM t WHERE d > {{d}} AND {{c}} <> ?');
  });

  it('names SQL Server’s and BigQuery’s @p1 and Oracle’s :p1, inside xcube’s casts', () => {
    expect(auditSqlOf('SELECT  CAST(@p1 AS DECIMAL(?, ?))  , @@VERSION', 'mssql', ['n'])).toBe(
      'SELECT  CAST({{n}} AS DECIMAL(?, ?))  , @@VERSION',
    );
    expect(auditSqlOf('SELECT  @p1  ,  @p2', 'bigquery', ['a', 'b'])).toBe('SELECT  {{a}}  ,  {{b}}');
    expect(auditSqlOf("SELECT  TO_DATE(:p1, ?)  FROM dual", 'oracle', ['d'])).toBe(
      'SELECT  TO_DATE({{d}}, ?)  FROM dual',
    );
  });

  it('leaves MySQL’s and Snowflake’s ?, which a redacted literal can’t be told from', () => {
    for (const driver of ['mysql', 'snowflake'])
      expect(auditSqlOf('SELECT  ?  , ?', driver, ['a'])).toBe('SELECT  ?  , ?');
  });
});
