import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { queryLog } from '../repos/query-log';
import { buildServer } from '../server';

/**
 * T371 (AC-297; R40, the user: "Build T371 properly next"): Jobs and
 * Schedules for Super-Admins and each folder's read-write members, over their
 * own folders. A read-write member of /A sees and builds only the
 * pre-aggregations of cubes published in /A, and sees only /A's schedules.
 * Another folder's build answers 403. A reader has no Jobs or Schedules, and
 * a dashboard's Data as of reads the schedules of the folders they may see.
 * Until each query names its item (T340), query records are Super-Admins'.
 *
 * A pre-aggregation's folder is its cube's `meta.xcube.folderId`, xcube's id
 * for the folder (`[X3A]`); it shows by its short name, with its folder.
 *
 * `writer` (`sales-rw`) writes /A and reads nothing else; `many` (`g01`)
 * writes /C; `reader` (`sales-ro`) reads /A.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
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
};

const MARK = `scope${randomUUID().slice(0, 8)}`;
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const cookies: Record<string, string> = {};
const ids = { a: '', c: '' };
const xcubeIds = { a: '', c: '' };
const built: string[] = [];
/** Folders published beyond /A and /C, and their cubes, added by a test. */
const published = new Map<string, string>();
const extra: Record<string, unknown>[] = [];
let app: FastifyInstance;

const rollup = (name: string) => ({
  name,
  type: 'rollup',
  refreshKey: { every: '1 hour' },
});
/** A cube as xcube publishes it: a folder's under `<xcubeId>__<shortName>`. */
const cube = (name: string, folder: string, shortName: string) => ({
  name,
  meta: { xcube: { folderId: folder, shortName } },
  preAggregations: [rollup('main')],
});

async function folder(title: string, access: { readOnly: string[]; readWrite: string[] }) {
  const id = randomUUID();
  made.push({ kind: 'folder', id });
  await docs().create({
    kind: 'folder',
    id,
    body: { owner: 'admin', title, folderId: 'root', access },
  });
  return id;
}

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

beforeAll(async () => {
  ids.a = await folder(`A ${MARK}`, { readOnly: ['sales-ro'], readWrite: ['sales-rw'] });
  ids.c = await folder(`C ${MARK}`, { readOnly: [], readWrite: ['g01'] });
  xcubeIds.a = `f${ids.a.replaceAll('-', '')}`;
  xcubeIds.c = `f${ids.c.replaceAll('-', '')}`;
  const meta = () => ({
    cubes: [
      cube('orders', 'froot', 'orders'),
      cube(`${xcubeIds.a}__sales`, xcubeIds.a, 'sales'),
      cube(`${xcubeIds.c}__sales`, xcubeIds.c, 'sales'),
      ...extra,
    ],
  });
  const client = new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/v1/meta')) return new Response(JSON.stringify(meta()));
      if (path.endsWith('/v1/pre-aggregations/jobs')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          action?: string;
          tokens?: string[];
          selector?: { preAggregations?: string[] };
        };
        // Each token's state, with the selector Cube keeps for it.
        if (body.action === 'get')
          return new Response(
            JSON.stringify(
              (body.tokens ?? []).map((token) => ({
                token,
                status: 'done',
                selector: {
                  preAggregations: [
                    token === 'token-mine'
                      ? `${xcubeIds.a}__sales.main`
                      : `${xcubeIds.c}__sales.main`,
                  ],
                },
              })),
            ),
          );
        built.push(...(body.selector?.preAggregations ?? []));
        return new Response(JSON.stringify(['token-1']));
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch,
  });
  app = buildServer({
    config: secured,
    cube: client,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    queryLog: queryLog(getDb()),
    folders: async () => ({
      ids: new Map([['root', 'froot'], [ids.a, xcubeIds.a], [ids.c, xcubeIds.c], ...published]),
      parents: new Map([
        ['root', null],
        [ids.a, 'root'],
        [ids.c, 'root'],
      ]),
    }),
  });
  for (const who of ['writer', 'many', 'reader', 'super'])
    cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const { kind, id } of made.reverse()) await docs().remove(kind, id);
  await closeDb();
});

interface Row {
  id: string;
  folderId: string;
  folderPath: string[];
  shortName: string;
}
const rowsOf = async (who: string, url: string) => {
  const answer = await as(who, { method: 'GET', url });
  return { status: answer.statusCode, rows: answer.statusCode === 200 ? answer.json<Row[]>() : [] };
};

describe('Jobs and Schedules, scoped to the user’s read-write folders (T371, AC-297)', () => {
  it('lists for a read-write member only their folders’ pre-aggregations, by short name and folder', async () => {
    const { status, rows } = await rowsOf('writer', '/api/preaggregations');
    expect(status).toBe(200);
    expect(rows.map((row) => [row.id, row.folderId, row.shortName, row.folderPath])).toEqual([
      [`${xcubeIds.a}__sales.main`, ids.a, 'sales', ['Shared', `A ${MARK}`]],
    ]);
    const other = await rowsOf('many', '/api/preaggregations');
    expect(other.rows.map((row) => row.folderId)).toEqual([ids.c]);
  });

  it('builds only their folders’, and refuses another folder’s with 403', async () => {
    const refused = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: `${xcubeIds.c}__sales.main` },
    });
    expect(refused.statusCode).toBe(403);
    expect(built).toEqual([]);
    const allowed = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: `${xcubeIds.a}__sales.main` },
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(built).toEqual([`${xcubeIds.a}__sales.main`]);
    // One the model doesn't have is none of theirs either.
    const unknown = await as('writer', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: 'nothing.here' },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('shows a read-write member only their folders’ schedules', async () => {
    const { status, rows } = await rowsOf('writer', '/api/schedules');
    expect(status).toBe(200);
    expect(rows.map((row) => [row.id, row.folderId, row.shortName])).toEqual([
      [`${xcubeIds.a}__sales.main`, ids.a, 'sales'],
    ]);
  });

  it('gives a Super-Admin every folder’s', async () => {
    const jobs = await rowsOf('super', '/api/preaggregations');
    expect(jobs.rows.map((row) => row.folderId)).toEqual(['root', ids.a, ids.c]);
    const schedules = await rowsOf('super', '/api/schedules');
    expect(schedules.rows.map((row) => row.folderId)).toEqual(['root', ids.a, ids.c]);
    expect((await as('super', { method: 'GET', url: '/api/jobs/queries/page' })).statusCode).toBe(
      200,
    );
  });

  it('gives a reader no Jobs or Schedules, and Data as of the schedules of what they may see', async () => {
    for (const url of ['/api/preaggregations', '/api/schedules', '/api/jobs/queries/page'])
      expect((await as('reader', { method: 'GET', url })).statusCode, url).toBe(403);
    const building = await as('reader', {
      method: 'POST',
      url: '/api/builds',
      payload: { preAggregation: `${xcubeIds.a}__sales.main` },
    });
    expect(building.statusCode).toBe(403);
    const status = await as('reader', {
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: ['token-1'] },
    });
    expect(status.statusCode).toBe(403);
    // Data as of: the schedules of the folders they may see, never /C's,
    // and of those only their freshness: the schedule in words, no model
    // file, key or SQL, and no way into Jobs (R42.7; T371's review).
    const seen = await as('reader', { method: 'GET', url: '/api/schedules?seen=1' });
    expect(seen.statusCode).toBe(200);
    const rows = seen.json<Record<string, unknown>[]>();
    expect(rows.map((row) => row['folderId'])).toContain(ids.a);
    expect(rows.map((row) => row['folderId'])).not.toContain(ids.c);
    const mine = rows.find((row) => row['folderId'] === ids.a)!;
    // In Schedules' words (T551).
    expect([mine['when'], mine['mayOpen']]).toEqual(['Every hour', false]);
    for (const key of ['fileName', 'sql', 'every', 'timezone'])
      expect(Object.keys(mine), key).not.toContain(key);
    // A member of /A may open its own in Jobs.
    const writer = await as('writer', { method: 'GET', url: '/api/schedules?seen=1' });
    const own = writer.json<Record<string, unknown>[]>().find((row) => row['folderId'] === ids.a)!;
    expect([own['mayOpen'], own['every']]).toEqual([true, '1 hour']);
  });

  it('reaches a folder below one the member writes, and never one wechart no longer knows', async () => {
    const below = await as('super', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'folder', title: `A1 ${MARK}`, folderId: ids.a },
    });
    const a1 = below.json<{ id: string }>().id;
    made.push({ kind: 'folder', id: a1 });
    published.set(a1, `f${a1.replaceAll('-', '')}`);
    extra.push(
      cube(`${published.get(a1)!}__sales`, published.get(a1)!, 'sales'),
      cube('fgone__old', 'fgone', 'old'),
    );
    const { rows } = await rowsOf('writer', '/api/preaggregations');
    expect(rows.map((row) => [row.folderId, row.folderPath])).toEqual([
      [ids.a, ['Shared', `A ${MARK}`]],
      [a1, ['Shared', `A ${MARK}`, `A1 ${MARK}`]],
    ]);
    const everything = await rowsOf('super', '/api/preaggregations');
    const gone = everything.rows.find((row) => row.id === 'fgone__old.main')!;
    expect([gone.folderId, gone.folderPath]).toEqual([
      null,
      ['Shared', 'A folder no longer there'],
    ]);
  });

  it('answers a member the state of only their folders’ builds', async () => {
    const answer = await as('writer', {
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: ['token-mine', 'token-theirs'] },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json<{ token: string }[]>().map((each) => each.token)).toEqual(['token-mine']);
  });

  it('keeps Cube’s scopes to those who have Jobs', async () => {
    expect((await as('reader', { method: 'GET', url: '/api/cube-scopes' })).statusCode).toBe(403);
  });

  it('shows a read-write member only their own query records, and a Super-Admin everyone’s (R42.6)', async () => {
    // The writer's key, as their workspace names it.
    const drafted = await as('writer', {
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'chart', title: `Mine ${MARK}`, folderId: 'mine', targetFolderId: ids.a },
    });
    const stored = (await docs().get('chart', drafted.json<{ id: string }>().id))!;
    const writerKey = (stored.body['folderId'] as string).slice('ws:'.length);
    made.push({ kind: 'chart', id: stored.id });
    const log = queryLog(getDb());
    const entry = (requestId: string, userKey: string) => ({
      requestId,
      query: { measures: ['orders.count'] },
      durationMs: 5,
      accelerated: false,
      userKey,
    });
    await log.record(entry(`${MARK}-mine`, writerKey));
    await log.record(entry(`${MARK}-theirs`, 'someone-else'));
    const ours = (records: { requestId: string }[]) =>
      records.map((each) => each.requestId).filter((id) => id.startsWith(MARK));

    const page = await as('writer', { method: 'GET', url: '/api/jobs/queries/page?limit=100' });
    expect(page.statusCode).toBe(200);
    expect(ours(page.json<{ records: { requestId: string }[] }>().records)).toEqual([
      `${MARK}-mine`,
    ]);
    const recent = await as('writer', { method: 'GET', url: '/api/jobs/queries' });
    expect(ours(recent.json<{ requestId: string }[]>())).toEqual([`${MARK}-mine`]);
    const all = await as('super', { method: 'GET', url: '/api/jobs/queries/page?limit=100' });
    expect(ours(all.json<{ records: { requestId: string }[] }>().records).toSorted()).toEqual(
      [`${MARK}-mine`, `${MARK}-theirs`].toSorted(),
    );
  });
});
