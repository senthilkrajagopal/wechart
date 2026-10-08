import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Config } from '../config';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { modelFileStore } from '../repos/model-files';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';

/**
 * T336 (AC-270, AC-271, AC-249): in one folder, a second cube of a name
 * (across its models), model file, dashboard or data source is refused,
 * naming the one it has; the same names in two folders are fine. A
 * generated cube is refused only where its folder has the name. Drafts in
 * My workspace may share a name (AC-357): they are held to it when proposed.
 *
 * Against the suite's database and the stub xcube, with sign-in off: the
 * rule is the folders', whoever the user is.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const MARK = `nm${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const files = () => modelFileStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const folders = { a: '', b: '', c: '' };
let app: FastifyInstance;

async function folder(title: string) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({ kind: 'folder', id, body: { owner: 'admin', title, folderId: 'root' } });
  return id;
}

beforeAll(async () => {
  folders.a = await folder(`A ${MARK}`);
  folders.b = await folder(`B ${MARK}`);
  folders.c = await folder(`C ${MARK}`);
  const xids = new Map([
    ['root', 'froot'],
    [folders.a, 'fa'],
    [folders.b, 'fb'],
    [folders.c, 'fc'],
  ]);
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: config.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fb', parentId: 'froot' },
    { id: 'fc', parentId: 'froot' },
  ]);
  stub.holdItems('dev', []);
  app = buildServer({
    config,
    documents: docs(),
    catalog: catalog(getDb()),
    modelFiles: files(),
    dataSources: sources(),
    // A data source is made from a passing test of its settings (T363).
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () =>
      ({ ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] }) as never,
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
  });
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const ids = Object.values(folders).filter(Boolean);
  await getDb().deleteFrom('model_files').where('folder_id', 'in', ids).execute();
  await getDb().deleteFrom('data_sources').where('folder_id', 'in', ids).execute();
  const titled = await getDb()
    .selectFrom('documents')
    .select(['kind', 'id'])
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .execute();
  for (const { kind, id } of titled) await docs().remove(kind as DocumentKind, id);
  for (const { kind, id } of made.reverse())
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  await closeDb();
});

const send = (options: InjectOptions) => app.inject(options);
const dashboard = (title: string, folderId: string) =>
  send({ method: 'POST', url: '/api/documents', payload: { kind: 'dashboard', title, folderId } });
const made201 = async (title: string, folderId: string) => {
  const answer = await dashboard(title, folderId);
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ id: string }>().id;
};
const taken = (title: string, id: string) => ({
  error: `This folder already has a dashboard named “${title}”.`,
  existing: { kind: 'dashboard', id, title },
});
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const publish = (folderId: string, path: string, name: string, create = false) =>
  send({
    method: 'POST',
    url: '/api/model/publish',
    payload: {
      folderId,
      files: [{ path, content: cube(name) }],
      ...(create ? { create: [path] } : {}),
    },
  });

describe('dashboards: one of a name in a folder (T336, AC-270, AC-271)', () => {
  it('refuses a second of a name in the folder, naming the one it has, and takes it in another', async () => {
    const title = `Revenue ${MARK}`;
    const first = await made201(title, folders.a);

    const again = await dashboard(title, folders.a);
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json()).toEqual(taken(title, first));

    await made201(title, folders.b);
  });

  it('refuses a rename or a move that would give the folder a second of a name, leaving it as it was', async () => {
    const title = `Pipeline ${MARK}`;
    const there = await made201(title, folders.a);
    const other = await made201(`Other ${MARK}`, folders.a);
    const moving = await made201(title, folders.b);

    const renamed = await send({
      method: 'PATCH',
      url: `/api/documents/dashboard/${other}`,
      payload: { title },
    });
    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json()).toEqual(taken(title, there));
    expect((await docs().get('dashboard', other))!.body['title']).toBe(`Other ${MARK}`);

    const moved = await send({
      method: 'PATCH',
      url: `/api/documents/dashboard/${moving}`,
      payload: { folderId: folders.a },
    });
    expect(moved.statusCode, moved.body).toBe(409);
    expect(moved.json()).toEqual(taken(title, there));
    expect((await docs().get('dashboard', moving))!.body['folderId']).toBe(folders.b);
  });

  it('refuses a save, or a save with its charts, that renames it to a name the folder has', async () => {
    const title = `Margin ${MARK}`;
    const there = await made201(title, folders.a);
    const other = await made201(`Churn ${MARK}`, folders.a);
    const stored = (await docs().get('dashboard', other))!;

    const saved = await send({
      method: 'PUT',
      url: `/api/documents/dashboard/${other}`,
      payload: { body: { ...stored.body, title }, version: stored.version },
    });
    expect(saved.statusCode, saved.body).toBe(409);
    expect(saved.json()).toEqual(taken(title, there));

    const withCharts = await send({
      method: 'PUT',
      url: `/api/dashboards/${other}`,
      payload: {
        dashboard: { body: { ...stored.body, title }, version: stored.version },
        charts: [],
      },
    });
    expect(withCharts.statusCode, withCharts.body).toBe(409);
    expect(withCharts.json()).toEqual(taken(title, there));
    expect((await docs().get('dashboard', other))!.body['title']).toBe(`Churn ${MARK}`);
  });

  it('saves one whose name and folder don’t change, beside another of its name made elsewhere (T336’s review)', async () => {
    const title = `Twin ${MARK}`;
    const first = await made201(title, folders.c);
    // Two of a name, as phase 1 left some, or an approval lands them.
    const second = randomUUID();
    const body = (await docs().get('dashboard', first))!.body;
    await docs().create({ kind: 'dashboard', id: second, body });
    for (const id of [first, second]) {
      const stored = (await docs().get('dashboard', id))!;
      const saved = await send({
        method: 'PUT',
        url: `/api/documents/dashboard/${id}`,
        payload: { body: { ...stored.body, pages: [] }, version: stored.version },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      const withCharts = await send({
        method: 'PUT',
        url: `/api/dashboards/${id}`,
        payload: {
          dashboard: {
            body: (await docs().get('dashboard', id))!.body,
            version: stored.version + 1,
          },
          charts: [],
        },
      });
      expect(withCharts.statusCode, withCharts.body).toBe(200);
    }
  });

  it('lets drafts in My workspace share a name, as brought-in and copied ones do (AC-357)', async () => {
    const title = `Draft ${MARK}`;
    await made201(title, 'mine');
    await made201(title, 'mine');
  });
});

describe('data sources, cubes and model files: one of a name in a folder (T336, AC-270, AC-271, AC-249)', () => {
  const sealed = {
    v: 1 as const,
    kid: 'kid-1',
    enc: Buffer.alloc(32, `enc-${MARK}`).toString('base64url'),
    ct: Buffer.alloc(272, `ct-${MARK}`).toString('base64url'),
  };
  const source = (folderId: string, name: string) => ({
    folderId,
    name,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
    sealed: { password: sealed },
  });

  // A landed data source is renamed to nothing now (T706, AC-423), its
  // folder's names or any other.
  it('refuses renaming a landed data source, to a name its folder has too, and takes that name in another', async () => {
    const name = `warehouse_${MARK}`;
    await sources().create(source(folders.a, name));
    const other = await sources().create(source(folders.a, `ledger_${MARK}`));
    const renamed = await send({
      method: 'PUT',
      url: `/api/data-sources/${other.id}`,
      payload: { name },
    });
    expect(renamed.statusCode, renamed.body).toBe(409);
    expect(renamed.json<{ error: string }>().error).toBe(
      `“ledger_${MARK}” has landed, so its name is fixed. Its description can still change.`,
    );
    expect((await sources().get(other.id))?.name).toBe(`ledger_${MARK}`);
    expect((await sources().create(source(folders.b, name))).folderId).toBe(folders.b);
  });

  it('refuses a second cube of a name across a folder’s files, naming the file that has it, and takes it in another folder', async () => {
    const orders = `orders_${MARK}`;
    const first = await publish(folders.a, 'cubes/orders.yml', orders);
    expect(first.statusCode, first.body).toBe(200);

    const twice = await publish(folders.a, 'cubes/orders_again.yml', orders);
    expect(twice.statusCode, twice.body).toBe(422);
    expect(
      twice.json<{ errors: { message: string }[] }>().errors.map((each) => each.message),
    ).toEqual([`\`${orders}\` is already a cube in cubes/orders.yml.`]);

    const elsewhere = await publish(folders.b, 'cubes/orders.yml', orders);
    expect(elsewhere.statusCode, elsewhere.body).toBe(200);
  });

  it('refuses a new model file at a path its folder has, and takes that path in another folder', async () => {
    const lines = `lines_${MARK}`;
    expect((await publish(folders.a, 'cubes/lines.yml', lines)).statusCode).toBe(200);
    const again = await publish(folders.a, 'cubes/lines.yml', `lines2_${MARK}`, true);
    expect(again.statusCode, again.body).toBe(422);
    expect(
      again.json<{ errors: { message: string }[] }>().errors.map((each) => each.message),
    ).toEqual(['cubes/lines.yml is already in the model store.']);
    const elsewhere = await publish(folders.c, 'cubes/lines.yml', `lines3_${MARK}`, true);
    expect(elsewhere.statusCode, elsewhere.body).toBe(200);
  });

  it('refuses a generated cube only where its folder has the name, saving nothing there and leaving the stored file as it was (AC-249)', async () => {
    const stock = `stock_${MARK}`;
    expect((await publish(folders.b, 'cubes/stock.yml', stock)).statusCode).toBe(200);
    const before = (await files().list(folders.b)).find((file) => file.path === 'cubes/stock.yml');

    const clashing = await publish(folders.b, `cubes/${stock}.yml`, stock, true);
    expect(clashing.statusCode, clashing.body).toBe(422);
    expect(
      clashing.json<{ errors: { message: string }[] }>().errors.map((each) => each.message),
    ).toEqual([`\`${stock}\` is already a cube in cubes/stock.yml.`]);
    const after = await files().list(folders.b);
    expect(after.find((file) => file.path === 'cubes/stock.yml')).toEqual(before);
    expect(after.map((file) => file.path)).not.toContain(`cubes/${stock}.yml`);

    // /C has no such cube, nor that file: generated there, it is taken.
    const fresh = await publish(folders.c, `cubes/${stock}.yml`, stock, true);
    expect(fresh.statusCode, fresh.body).toBe(200);
    const path = await publish(folders.c, 'cubes/stock.yml', `stock_c_${MARK}`, true);
    expect(path.statusCode, path.body).toBe(200);
  });
});

/**
 * T703 (AC-426): a cube's, view's or data source's name only in R72's
 * grammar, as xcube `256d632371` takes it (research `xcube-256d632371.md`,
 * "The grammar"). A model is checked before it is published or saved in My
 * workspace, where the same check runs first; a data source when it is made.
 */
describe('names in R72’s grammar (T703, AC-426)', () => {
  const grammar = (name: string) =>
    `“${name}” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.`;

  it('refuses a model declaring a cube outside the grammar, or a reserved word in any case, and takes upper case', async () => {
    for (const [name, error] of [
      ['1orders', grammar('1orders')],
      ['order__items', grammar('order__items')],
      ['orders_', grammar('orders_')],
      ['x'.repeat(41), grammar('x'.repeat(41))],
      ['class', '“class” is a reserved word, so a cube or view can’t take it.'],
      ['Table', '“Table” is a reserved word, so a cube or view can’t take it.'],
    ] as const) {
      const refused = await publish(folders.c, 'cubes/named.yml', name);
      expect(refused.statusCode, name).toBe(422);
      expect(refused.json<{ errors: unknown[] }>().errors, name).toEqual([
        { path: 'cubes/named.yml', message: error },
      ]);
    }
    // A view too, held to the same rule.
    const view = await send({
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: folders.c,
        files: [{ path: 'views/named.yml', content: 'views:\n  - name: None\n    cubes: []\n' }],
      },
    });
    expect(view.statusCode).toBe(422);
    expect(view.json<{ errors: unknown[] }>().errors).toEqual([
      {
        path: 'views/named.yml',
        message: '“None” is a reserved word, so a cube or view can’t take it.',
      },
    ]);
    expect((await files().list(folders.c)).map((file) => file.path)).not.toContain(
      'cubes/named.yml',
    );

    const upper = await publish(folders.c, 'cubes/upper.yml', `Upper_${MARK}`, true);
    expect(upper.statusCode, upper.body).toBe(200);
  });

  it('refuses a data source named outside the grammar, and takes upper case and a reserved word', async () => {
    const settings = {
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: {
        password: {
          v: 1 as const,
          kid: 'kid-1',
          enc: Buffer.alloc(32, `enc-g-${MARK}`).toString('base64url'),
          ct: Buffer.alloc(272, `ct-g-${MARK}`).toString('base64url'),
        },
      },
    };
    const made = async (name: string) => {
      const tested = await send({
        method: 'POST',
        url: '/api/data-sources/test',
        payload: { ...settings, folderId: folders.c },
      });
      expect(tested.statusCode, tested.body).toBe(200);
      return send({
        method: 'POST',
        url: '/api/data-sources',
        payload: {
          ...settings,
          folderId: folders.c,
          name,
          testId: tested.json<{ testId: string }>().testId,
        },
      });
    };

    for (const name of ['order-items', 'order__items', `${'x'.repeat(41)}`]) {
      const refused = await made(name);
      expect(refused.statusCode, name).toBe(400);
      expect(refused.json<{ error: string }>().error, name).toBe(grammar(name));
    }
    for (const name of [`Warehouse_${MARK}`, 'table'])
      expect((await made(name)).statusCode, name).toBe(201);
  });
});
