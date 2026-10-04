import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { calcRequestStore } from '../repos/calc-requests';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { modelFileStore } from '../repos/model-files';
import { proposalStore } from '../repos/proposals';
import { buildServer } from '../server';

/**
 * T383 / AC-050: WHEN the user requests a calculation the menu cannot
 * express, THE SYSTEM SHALL record a request carrying the chart, the fields
 * in use and the user's description, and show it to the read-write members
 * of the folder whose model defines the chart's cube.
 * Fails when: the request is stored without the chart reference, or is not
 * shown to that folder's read-write members.
 *
 * /Sales (read-write `sales-rw`, read-only `sales-ro`) has a model defining
 * the cube; /Sales/West is `managers`' to write. `manager` builds a chart in
 * their workspace, going to /Sales/West, on /Sales' cube, which is on its
 * path, and asks for a calculation. `writer` and `super` write /Sales, and
 * see it; `reader`, `nobody` and `manager` himself don't.
 */
const MARK = `cr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const CUBE = `${MARK}_orders`;
const FULL = `fsales__${CUBE}`;
const PATH = `cubes/${CUBE}.yml`;
const MODEL_YAML = `cubes:\n  - name: ${CUBE}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`;

let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', west: '', east: '', mgr: '', chart: '', shared: '' };

beforeAll(async () => {
  for (const [key, parent, access] of [
    ['sales', 'root', { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
    ['west', 'sales', { readOnly: null, readWrite: ['managers'] }],
    ['east', 'root', { readOnly: null, readWrite: ['sales-rw'] }],
    ['mgr', 'root', { readOnly: null, readWrite: ['managers'] }],
  ] as const) {
    const id = randomUUID();
    made.push({ kind: 'folder', id });
    await docs().create({
      kind: 'folder',
      id,
      body: {
        owner: 'admin',
        title: `${key} ${MARK}`,
        folderId: parent === 'root' ? 'root' : ids[parent],
        access,
      },
    });
    ids[key] = id;
  }
  await modelFileStore(getDb()).write([
    { folderId: ids.sales, path: PATH, content: MODEL_YAML },
    {
      folderId: ids.east,
      path: `cubes/${MARK}_stock.yml`,
      content: MODEL_YAML.replace(CUBE, `${MARK}_stock`),
    },
  ]);
  app = buildServer({
    config: {
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
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
    calcRequests: calcRequestStore(getDb()),
    // The Reviews count (R60).
    proposals: proposalStore(getDb()),
    folders: async () => ({
      ids: new Map([
        ['root', 'froot'],
        [ids.sales, 'fsales'],
        [ids.west, 'fwest'],
        [ids.east, 'feast'],
        [ids.mgr, 'fmgr'],
      ]),
      parents: new Map<string, string | null>([
        ['root', null],
        [ids.sales, 'root'],
        [ids.west, ids.sales],
        [ids.east, 'root'],
        [ids.mgr, 'root'],
      ]),
    }),
  });
  for (const who of ['super', 'writer', 'reader', 'manager', 'nobody'])
    cookies[who] = await signIn(app, USERS[who]!);

  // The manager's chart, in their workspace, going to /Sales/West.
  const created = await as('manager', {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'chart',
      title: `Margins ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.west,
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  ids.chart = created.json<{ id: string }>().id;
  // A chart in /Sales, which its read-write members open.
  ids.shared = randomUUID();
  await docs().create({
    kind: 'chart',
    id: ids.shared,
    body: { owner: 'admin', title: `Shared ${MARK}`, folderId: ids.sales },
  });
  expect((await docs().get('chart', ids.shared))?.body['folderId']).toBe(ids.sales);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const folders = [ids.sales, ids.west, ids.east, ids.mgr];
  await getDb().deleteFrom('calc_requests').where('folder_id', 'in', folders).execute();
  await getDb().deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await getDb()
    .deleteFrom('documents')
    .where(({ eb, ref }) => eb(ref('body', '->>').key('title'), 'like', `%${MARK}%`))
    .where('kind', '!=', 'folder')
    .execute();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

const FIELDS = {
  measures: [`${FULL}.count`],
  dimensions: [`${FULL}.status`],
  timeDimensions: [`${FULL}.ordered_at`],
  filters: [`${FULL}.status`],
};
const DESCRIPTION = `Margin per order: amount less cost (${MARK})`;

const ask = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'POST', url: '/api/calc-requests', payload });

interface Listed {
  id: string;
  chart: { id: string; title: string } | null;
  cube: string;
  folderId: string;
  folderPath: string[];
  modelPath: string;
  fields: typeof FIELDS;
  description: string;
  requestedBy: string;
  status: string;
}
const listOf = async (who: string): Promise<Listed[]> => {
  const answer = await as(who, { method: 'GET', url: '/api/calc-requests' });
  expect(answer.statusCode, `${who}: ${answer.body}`).toBe(200);
  return answer.json<{ requests: Listed[] }>().requests.filter((each) => each.cube === FULL);
};

describe('a calculation request (T383, AC-050)', () => {
  it('is recorded with the chart, the fields in use and the description, asked of the folder whose model defines the cube', async () => {
    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: FULL,
      fields: FIELDS,
      description: DESCRIPTION,
    });
    expect(asked.statusCode, asked.body).toBe(201);
    const { id } = asked.json<{ id: string }>();

    const stored = await calcRequestStore(getDb()).get(id);
    expect(stored).toEqual(
      expect.objectContaining({
        chartId: ids.chart,
        cube: FULL,
        folderId: ids.sales,
        modelPath: PATH,
        fields: FIELDS,
        description: DESCRIPTION,
        status: 'open',
      }),
    );
    expect(stored?.requestedBy.name).not.toBe('');
  });

  it('is shown to the read-write members of that folder, and to no one else', async () => {
    for (const who of ['writer', 'super']) {
      const [shown] = await listOf(who);
      expect(shown, who).toEqual(
        expect.objectContaining({
          cube: FULL,
          folderId: ids.sales,
          folderPath: [`sales ${MARK}`],
          modelPath: PATH,
          fields: FIELDS,
          description: DESCRIPTION,
          status: 'open',
        }),
      );
      // A chart in a workspace is its owner's: named to no one else (AC-276).
      expect(shown?.chart, who).toBeNull();
    }
    for (const who of ['reader', 'manager', 'nobody'])
      expect(await listOf(who), who).toHaveLength(0);
  });

  /**
   * R60 (amending AC-287 and rule 76): the top bar's Reviews count includes
   * the open calculation requests listed to the user.
   */
  it('is counted in the Reviews count of that folder’s read-write members, and no one else’s', async () => {
    const counted = async (who: string) => {
      const answer = await as(who, { method: 'GET', url: '/api/reviews/count' });
      expect(answer.statusCode, `${who}: ${answer.body}`).toBe(200);
      return answer.json<{ waiting: number }>().waiting;
    };
    const who = ['writer', 'super', 'reader', 'manager'] as const;
    const before: Record<string, number> = {};
    for (const each of who) before[each] = await counted(each);

    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: FULL,
      fields: FIELDS,
      description: `Counted (${MARK})`,
    });
    expect(asked.statusCode, asked.body).toBe(201);

    for (const each of who)
      expect(await counted(each), each).toBe(
        (before[each] ?? 0) + (each === 'writer' || each === 'super' ? 1 : 0),
      );
  });

  it('names the chart to those who may open it', async () => {
    const asked = await ask('writer', {
      chartId: ids.shared,
      cube: FULL,
      fields: FIELDS,
      description: `From a shared chart (${MARK})`,
    });
    expect(asked.statusCode, asked.body).toBe(201);

    const shown = (await listOf('writer')).find((each) => each.chart !== null);
    expect(shown?.chart).toEqual({ id: ids.shared, title: `Shared ${MARK}` });
  });

  it('is refused without a chart the user may open, a cube a shared folder’s model defines, or a description', async () => {
    const valid = { chartId: ids.chart, cube: FULL, fields: FIELDS, description: DESCRIPTION };
    // Another's workspace chart is one that isn't there.
    expect((await ask('writer', valid)).statusCode).toBe(404);
    expect((await ask('manager', { ...valid, chartId: randomUUID() })).statusCode).toBe(404);
    const unknown = await ask('manager', { ...valid, cube: `fsales__${MARK}_nothing` });
    expect(unknown.statusCode, unknown.body).toBe(409);
    expect(unknown.json<{ error: string }>().error).toBe(
      `No shared folder’s model defines fsales__${MARK}_nothing, so there is no one to ask. A cube of your own workspace is yours to change.`,
    );
    expect((await ask('manager', { ...valid, description: '  ' })).statusCode).toBe(400);
    // The Propose dialog's limit (references.md): nothing silently cut.
    expect((await ask('manager', { ...valid, description: 'x'.repeat(1001) })).statusCode).toBe(
      400,
    );
    expect((await ask('manager', { ...valid, fields: { measures: 'x' } })).statusCode).toBe(400);
  });

  it('counts, never names, a field of a cube in a folder the viewer can’t see', async () => {
    // T383's review: /Mgr is `managers'` alone; its cube is joined into the chart.
    const targets = `fmgr__${MARK}_targets.count`;
    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: FULL,
      fields: { ...FIELDS, measures: [`${FULL}.count`, targets] },
      description: `With targets (${MARK})`,
    });
    expect(asked.statusCode, asked.body).toBe(201);
    const { id } = asked.json<{ id: string }>();

    const answer = await as('writer', { method: 'GET', url: '/api/calc-requests' });
    expect(answer.body).not.toContain('fmgr__');
    const shown = answer
      .json<{ requests: (Listed & { unseenFields: number })[] }>()
      .requests.find((each) => each.id === id);
    expect(shown?.fields.measures).toEqual([`${FULL}.count`]);
    expect(shown?.unseenFields).toBe(1);
  });

  it('is refused on a cube in a folder the user may not see, as one no model defines', async () => {
    // /East is `sales-rw`'s alone: nothing of it is the manager's to see.
    const stock = `feast__${MARK}_stock`;
    const answer = await ask('manager', {
      chartId: ids.chart,
      cube: stock,
      fields: FIELDS,
      description: DESCRIPTION,
    });
    expect(answer.statusCode, answer.body).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe(
      `No shared folder’s model defines ${stock}, so there is no one to ask. A cube of your own workspace is yours to change.`,
    );
  });
});

/**
 * T384 / AC-051: WHEN a read-write member of that folder opens a calculation
 * request, THE SYSTEM SHALL open the target cube's model in the model editor,
 * in their workspace, with the request visible beside it.
 *
 * Opening one takes it up (`POST /api/calc-requests/:id/take`): the member
 * is recorded with it, so that approving their proposal of the measure
 * resolves it (T385). It answers where the cube's model is, to copy it.
 */
describe('a calculation request taken up (T384, AC-051)', () => {
  const take = (who: string, id: string) =>
    as(who, { method: 'POST', url: `/api/calc-requests/${id}/take` });

  it('is taken up by a read-write member of its folder, and answers where its model is', async () => {
    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: FULL,
      fields: FIELDS,
      description: `Taken (${MARK})`,
    });
    const { id } = asked.json<{ id: string }>();

    const taken = await take('writer', id);
    expect(taken.statusCode, taken.body).toBe(200);
    expect(taken.json()).toEqual({ folderId: ids.sales, modelPath: PATH, cube: FULL });
    // Twice is once.
    expect((await take('writer', id)).statusCode).toBe(200);
    expect((await take('super', id)).statusCode).toBe(200);
    const nameOf = async (who: string) =>
      (await as(who, { method: 'GET', url: '/api/me' })).json<{ name: string }>().name;
    expect((await calcRequestStore(getDb()).takersOf(id)).map((taker) => taker.name)).toEqual([
      await nameOf('writer'),
      await nameOf('super'),
    ]);
  });

  it('is refused to anyone else, as a request that isn’t there', async () => {
    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: FULL,
      fields: FIELDS,
      description: `Not taken (${MARK})`,
    });
    const { id } = asked.json<{ id: string }>();

    for (const who of ['reader', 'manager', 'nobody'])
      expect((await take(who, id)).statusCode, who).toBe(404);
    expect((await take('writer', randomUUID())).statusCode).toBe(404);
    expect(await calcRequestStore(getDb()).takersOf(id)).toEqual([]);
  });

  /** A cube of its own, asked of /Sales from the file it was in then. */
  const askedOn = async (name: string) => {
    const cube = `${MARK}_${name}`;
    await modelFileStore(getDb()).write([
      {
        folderId: ids.sales,
        path: `cubes/${cube}.yml`,
        content: MODEL_YAML.replaceAll(CUBE, cube),
      },
    ]);
    const asked = await ask('manager', {
      chartId: ids.chart,
      cube: `fsales__${cube}`,
      fields: FIELDS,
      description: `On ${name} (${MARK})`,
    });
    expect(asked.statusCode, asked.body).toBe(201);
    return { cube, id: asked.json<{ id: string }>().id };
  };

  it('answers the file that defines its cube now, where that file has moved since it was asked', async () => {
    const { cube, id } = await askedOn('moved');
    await modelFileStore(getDb()).remove(ids.sales, `cubes/${cube}.yml`);
    await modelFileStore(getDb()).write([
      {
        folderId: ids.sales,
        path: `models/${cube}.yml`,
        content: MODEL_YAML.replaceAll(CUBE, cube),
      },
    ]);

    const taken = await take('writer', id);
    expect(taken.statusCode, taken.body).toBe(200);
    expect(taken.json()).toEqual({
      folderId: ids.sales,
      modelPath: `models/${cube}.yml`,
      cube: `fsales__${cube}`,
    });
  });

  it('is refused, and no one recorded, once no model defines its cube', async () => {
    const { cube, id } = await askedOn('gone');
    await modelFileStore(getDb()).remove(ids.sales, `cubes/${cube}.yml`);

    const taken = await take('writer', id);
    expect(taken.statusCode, taken.body).toBe(409);
    expect(taken.json<{ error: string }>().error).toBe(
      `No model in its folder defines ${cube} now, so there is nothing to open.`,
    );
    expect(await calcRequestStore(getDb()).takersOf(id)).toEqual([]);
  });

  it('is refused, and no one recorded, once it is resolved', async () => {
    const { id } = await askedOn('resolved');
    await getDb()
      .updateTable('calc_requests')
      .set({ status: 'resolved' })
      .where('id', '=', id)
      .execute();

    const taken = await take('writer', id);
    expect(taken.statusCode, taken.body).toBe(409);
    expect(taken.json<{ error: string }>().error).toBe('It is resolved already.');
    expect(await calcRequestStore(getDb()).takersOf(id)).toEqual([]);
  });
});
