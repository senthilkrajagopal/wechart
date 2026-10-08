import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';

/**
 * T527 (AC-371, AC-263; the user's answer on AC-263, "Copy on use"): with
 * sign-in on, a dashboard shows only library charts kept on the path of the
 * folder it lands in, that folder or one above it, where every reader of it
 * may open them. A library chart from anywhere else, put on it, becomes a
 * chart of its own: a copy, in no folder, which it shows instead. One on the
 * path stays shared. A workspace's dashboard, and a workspace's chart, are
 * judged by their target folders, where their proposals land them. With
 * sign-in off, nothing is copied.
 *
 * T537 (AC-371, amended 2026-10-01: "Copy on move + approval"): the same
 * holds when an approval lands a dashboard, and when moving a library chart,
 * a dashboard or a folder would leave a shared dashboard showing a chart off
 * its path. Each such dashboard gets its own copy, and the move's answer
 * names it, or counts it where its folder is one the mover can't see.
 *
 *   /Sales <run>          writer read-write
 *   /Sales <run>/EMEA     (inherited)
 *   /Sales <run>/X        (inherited)
 *   /Sales <run>/X/Y      (inherited)
 *   /Also <run>           writer read-write, beside /Sales
 *   /Hidden <run>         managers read-write: none of the writer's
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
};
const secured = {
  ...base,
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

const MARK = `cou${randomUUID().slice(0, 8)}`;
const DEFINITION = { source: { cube: 'orders' }, wells: { measures: ['orders.count'] } };
const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let cookie = '';
const ids = {
  sales: '',
  emea: '',
  also: '',
  inSales: '',
  inEmea: '',
  inAlso: '',
  toSales: '',
  toEmea: '',
  // T537's.
  x: '',
  y: '',
  hidden: '',
};
let app: FastifyInstance;
let open: FastifyInstance;

async function doc(kind: DocumentKind, body: Record<string, unknown>, id: string = randomUUID()) {
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}
const chartIn = (title: string, folderId: string) =>
  doc('chart', { schemaVersion: 1, title: `${title} ${MARK}`, folderId, chart: DEFINITION });

const as = (options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie } });
const stored = async (kind: DocumentKind, id: string) => (await docs().get(kind, id))!;

/** The writer's own, in their workspace, made as the app makes one: with its target. */
async function mine(kind: 'dashboard' | 'chart', title: string, targetFolderId: string) {
  const answer = await as({
    method: 'POST',
    url: '/api/documents',
    payload: { kind, title: `${title} ${MARK}`, folderId: 'mine', targetFolderId },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind, id });
  return id;
}

/** A dashboard's tiles, each showing a chart. */
const showing = (...chartIds: string[]) => [
  {
    id: 'p1',
    title: 'Page 1',
    items: chartIds.map((chartId, index) => ({
      id: `t${String(index + 1)}`,
      kind: 'chart',
      chartId,
    })),
  },
];
const tilesOf = (body: Record<string, unknown>) =>
  (body['pages'] as { items: { chartId?: string }[] }[])[0]!.items.map((tile) => tile.chartId);

beforeAll(async () => {
  ids.sales = await doc('folder', {
    title: `Sales ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.emea = await doc('folder', { title: `EMEA ${MARK}`, folderId: ids.sales });
  ids.also = await doc('folder', {
    title: `Also ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  ids.x = await doc('folder', { title: `X ${MARK}`, folderId: ids.sales });
  ids.y = await doc('folder', { title: `Y ${MARK}`, folderId: ids.x });
  ids.hidden = await doc('folder', {
    title: `Hidden ${MARK}`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['managers'] },
  });
  ids.inSales = await chartIn('In Sales', ids.sales);
  ids.inEmea = await chartIn('In EMEA', ids.emea);
  ids.inAlso = await chartIn('In Also', ids.also);

  const wiring = {
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    // What an approval lands through (T537).
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
  };
  app = buildServer({ config: secured, ...wiring });
  open = buildServer({ config: base, ...wiring });
  cookie = await signIn(app, USERS['writer']!);

  ids.toSales = await mine('dashboard', 'To Sales', ids.sales);
  ids.toEmea = await mine('dashboard', 'To EMEA', ids.emea);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  if (open !== undefined) await open.close();
  const db = getDb();
  const folders = [ids.sales, ids.emea, ids.also, ids.x, ids.y, ids.hidden].filter(
    (id) => id !== '',
  );
  if (folders.length > 0) {
    // What approvals landed (T537), with their own charts, and what they recorded.
    await db.deleteFrom('proposals').where('target_folder_id', 'in', folders).execute();
    await db.deleteFrom('item_versions').where('folder_id', 'in', folders).execute();
    await db.deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
    const landed = await db
      .selectFrom('documents')
      .select(['kind', 'id'])
      .where('kind', 'in', ['dashboard', 'chart'])
      .where('folder_id', 'in', folders)
      .execute();
    for (const { kind, id } of landed)
      if (!made.some((each) => each.id === id)) made.push({ kind: kind as DocumentKind, id });
  }
  for (const { kind, id } of made.reverse()) {
    if (kind === 'dashboard')
      for (const chart of await docs().localTo(id)) await docs().remove('chart', chart.id);
    await docs()
      .remove(kind, id)
      .catch(() => undefined);
  }
  await closeDb();
});

/** The copy a reply names, as stored: the dashboard's own, and a copy of `from`. */
async function copyOf(
  reply: { copied?: { from: string; id: string; title: string }[] },
  from: string,
  dashboardId: string,
) {
  const named = reply.copied?.find((each) => each.from === from);
  expect(named, JSON.stringify(reply.copied)).toBeDefined();
  const source = await stored('chart', from);
  const copy = await stored('chart', named!.id);
  const board = await stored('dashboard', dashboardId);
  expect(named!.title).toBe(source.body['title']);
  // Where it was, and whose, aren't the copy's: it is in no folder, and goes where it is to go.
  const { folderId: _folder, owner: _owner, targetFolderId: _target, ...content } = source.body;
  void [_folder, _owner, _target];
  expect(copy.body).toEqual({
    ...content,
    localToDashboardId: dashboardId,
    owner: board.body['owner'],
  });
  return named!.id;
}

describe('copy on use (T527, AC-371, AC-263)', () => {
  it('adds a chart kept in its folder, or above it, as itself', async () => {
    for (const [dashboardId, chartId] of [
      [ids.toSales, ids.inSales],
      [ids.toEmea, ids.inSales],
    ] as const) {
      const answer = await as({
        method: 'POST',
        url: `/api/dashboards/${dashboardId}/charts`,
        payload: { chartId },
      });
      expect(answer.statusCode, answer.body).toBe(204);
      expect((await stored('dashboard', dashboardId)).body['charts']).toContain(chartId);
    }
  });

  it('adds a chart from beside its folder, or below it, as its own copy', async () => {
    for (const chartId of [ids.inAlso, ids.inEmea]) {
      const before = await stored('chart', chartId);
      const answer = await as({
        method: 'POST',
        url: `/api/dashboards/${ids.toSales}/charts`,
        payload: { chartId },
      });
      expect(answer.statusCode, answer.body).toBe(201);
      const copyId = await copyOf(answer.json(), chartId, ids.toSales);
      const listed = (await stored('dashboard', ids.toSales)).body['charts'] as string[];
      expect(listed).toContain(copyId);
      expect(listed).not.toContain(chartId);
      // The one it came from is as it was.
      expect(await stored('chart', chartId)).toEqual(before);
    }
  });

  it('saves a dashboard showing one with its own copy in its place, and the rest as they are', async () => {
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: {
        body: { ...board.body, pages: showing(ids.inAlso, ids.inSales, ids.inAlso) },
        version: board.version,
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), ids.inAlso, ids.toSales);
    // One copy, for every tile that showed it.
    expect(answer.json<{ copied: unknown[] }>().copied).toHaveLength(1);
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([
      copyId,
      ids.inSales,
      copyId,
    ]);
  });

  it('saves one with its charts the same way, in the same write', async () => {
    const board = await stored('dashboard', ids.toEmea);
    const own = randomUUID();
    const answer = await as({
      method: 'PUT',
      url: `/api/dashboards/${ids.toEmea}`,
      payload: {
        dashboard: {
          body: { ...board.body, pages: showing(own, ids.inAlso, ids.inEmea, ids.inSales) },
          version: board.version,
        },
        charts: [
          {
            id: own,
            body: {
              schemaVersion: 1,
              title: `Own ${MARK}`,
              localToDashboardId: ids.toEmea,
              chart: DEFINITION,
            },
            version: 0,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), ids.inAlso, ids.toEmea);
    expect(answer.json<{ copied: unknown[] }>().copied).toHaveLength(1);
    // Its own chart, and EMEA's and Sales', stay as they were sent.
    expect(tilesOf((await stored('dashboard', ids.toEmea)).body)).toEqual([
      own,
      copyId,
      ids.inEmea,
      ids.inSales,
    ]);
  });

  it('judges a workspace’s chart by the folder it is to land in', async () => {
    const toAlso = await mine('chart', 'Mine to Also', ids.also);
    const toSales = await mine('chart', 'Mine to Sales', ids.sales);
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: { body: { ...board.body, pages: showing(toAlso, toSales) }, version: board.version },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const copyId = await copyOf(answer.json(), toAlso, ids.toSales);
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([copyId, toSales]);
  });

  it('copies a chart saved with it as it is sent, and nothing again on the next save', async () => {
    const toAlso = await mine('chart', 'Sent to Also', ids.also);
    const sent = await stored('chart', toAlso);
    const board = await stored('dashboard', ids.toSales);
    const answer = await as({
      method: 'PUT',
      url: `/api/dashboards/${ids.toSales}`,
      payload: {
        dashboard: { body: { ...board.body, pages: showing(toAlso) }, version: board.version },
        charts: [
          {
            id: toAlso,
            body: { ...sent.body, title: `Edited ${MARK}`, chart: DEFINITION },
            version: sent.version,
          },
        ],
      },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const [copied] = answer.json<{ copied: { from: string; id: string }[] }>().copied;
    expect(copied?.from).toBe(toAlso);
    expect((await stored('chart', copied!.id)).body['title']).toBe(`Edited ${MARK}`);

    // Saved again as it is now stored: it shows its own copy, so none is made.
    const after = await stored('dashboard', ids.toSales);
    const again = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${ids.toSales}`,
      payload: { body: after.body, version: after.version },
    });
    expect(again.statusCode, again.body).toBe(200);
    expect(again.json<{ copied?: unknown }>().copied).toBeUndefined();
    expect(tilesOf((await stored('dashboard', ids.toSales)).body)).toEqual([copied!.id]);
  });

  // The single user's own, in My workspace, to go to /Sales: a shared one
  // isn't saved in place with sign-in off either (T359, AC-254).
  it('with sign-in off, copies nothing', async () => {
    const board = await doc('dashboard', {
      schemaVersion: 1,
      title: `Open ${MARK}`,
      folderId: 'mine',
      targetFolderId: ids.sales,
      pages: [],
    });
    const before = await stored('dashboard', board);
    const answer = await open.inject({
      method: 'PUT',
      url: `/api/documents/dashboard/${board}`,
      payload: { body: { ...before.body, pages: showing(ids.inAlso) }, version: before.version },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<{ copied?: unknown }>().copied).toBeUndefined();
    expect(tilesOf((await stored('dashboard', board)).body)).toEqual([ids.inAlso]);
  });
});

/** A dashboard in a shared folder, showing these charts. */
const sharedBoard = (title: string, folderId: string, ...chartIds: string[]) =>
  doc('dashboard', {
    schemaVersion: 1,
    title: `${title} ${MARK}`,
    folderId,
    pages: showing(...chartIds),
  });

interface MoveAnswer {
  readonly copiedOn?: {
    readonly id: string;
    readonly title: string;
    readonly charts: { readonly from: string; readonly id: string; readonly title: string }[];
  }[];
  readonly copiedHidden?: number;
}

const move = (kind: DocumentKind, id: string, folderId: string) =>
  as({ method: 'PATCH', url: `/api/documents/${kind}/${id}`, payload: { folderId } });

describe('copy on move and at approval (T537, AC-371)', () => {
  it('moving a library chart off a dashboard’s path gives that dashboard its own copy, and names it', async () => {
    const moving = await chartIn('Moving', ids.sales);
    const onSales = await sharedBoard('On Sales', ids.sales, moving, ids.inSales);
    // Where it goes, it is on this one's path.
    const onAlso = await sharedBoard('On Also', ids.also, moving);
    // One the writer can't see: copied too, and only counted.
    const onHidden = await sharedBoard('On Hidden', ids.hidden, moving);
    // A draft in a workspace is left for its next save or its approval.
    const draft = await mine('dashboard', 'Draft', ids.sales);
    const drafted = await stored('dashboard', draft);
    await docs().update({
      kind: 'dashboard',
      id: draft,
      body: { ...drafted.body, pages: showing(moving) },
      expectedVersion: drafted.version,
    });
    const before = await stored('chart', moving);

    const answer = await move('chart', moving, ids.also);
    expect(answer.statusCode, answer.body).toBe(200);
    expect((await stored('chart', moving)).body['folderId']).toBe(ids.also);

    const { copiedOn, copiedHidden } = answer.json<MoveAnswer>();
    expect(copiedOn?.map(({ id, title }) => [id, title])).toEqual([[onSales, `On Sales ${MARK}`]]);
    expect(copiedHidden).toBe(1);
    const copyId = await copyOf({ copied: copiedOn![0]!.charts }, moving, onSales);
    // The copy is of the chart as it was before it moved.
    expect((await stored('chart', copyId)).body['chart']).toEqual(before.body['chart']);
    expect(tilesOf((await stored('dashboard', onSales)).body)).toEqual([copyId, ids.inSales]);
    const hiddenTiles = tilesOf((await stored('dashboard', onHidden)).body);
    expect(hiddenTiles).toHaveLength(1);
    expect(hiddenTiles).not.toContain(moving);
    expect((await stored('chart', hiddenTiles[0]!)).body['localToDashboardId']).toBe(onHidden);

    expect(tilesOf((await stored('dashboard', onAlso)).body)).toEqual([moving]);
    expect(tilesOf((await stored('dashboard', draft)).body)).toEqual([moving]);
  });

  it('moving a dashboard gives it copies of the charts now off its path', async () => {
    const board = await sharedBoard('Moved', ids.emea, ids.inEmea, ids.inSales);

    const answer = await move('dashboard', board, ids.sales);
    expect(answer.statusCode, answer.body).toBe(200);
    const { copiedOn, copiedHidden } = answer.json<MoveAnswer>();
    expect(copiedOn?.map(({ id }) => id)).toEqual([board]);
    expect(copiedHidden ?? 0).toBe(0);
    const copyId = await copyOf({ copied: copiedOn![0]!.charts }, ids.inEmea, board);
    const after = await stored('dashboard', board);
    expect(after.body['folderId']).toBe(ids.sales);
    // /Sales is on its path still; /Sales/EMEA, beneath it, no longer.
    expect(tilesOf(after.body)).toEqual([copyId, ids.inSales]);
  });

  it('moving a folder gives each dashboard in it copies of the charts now off its path', async () => {
    const inX = await chartIn('In X', ids.x);
    const onX = await sharedBoard('On X', ids.x, ids.inSales, inX);
    // Beneath it, two folders down.
    const onY = await sharedBoard('On Y', ids.y, inX, ids.inSales);

    const answer = await move('folder', ids.x, ids.also);
    expect(answer.statusCode, answer.body).toBe(200);
    expect((await stored('folder', ids.x)).body['folderId']).toBe(ids.also);
    const { copiedOn } = answer.json<MoveAnswer>();
    expect(copiedOn?.map(({ id }) => id).sort()).toEqual([onX, onY].sort());
    const charts = (id: string) => copiedOn!.find((each) => each.id === id)!.charts;
    const copyId = await copyOf({ copied: charts(onX) }, ids.inSales, onX);
    expect(tilesOf((await stored('dashboard', onX)).body)).toEqual([copyId, inX]);
    // X moved with Y: X's chart is on Y's path still, /Sales no longer.
    const yCopy = await copyOf({ copied: charts(onY) }, ids.inSales, onY);
    expect(tilesOf((await stored('dashboard', onY)).body)).toEqual([inX, yCopy]);
  });

  it('moving one by saving it in another folder does the same', async () => {
    const board = await sharedBoard('Saved elsewhere', ids.emea, ids.inEmea);
    const before = await stored('dashboard', board);
    const answer = await as({
      method: 'PUT',
      url: `/api/documents/dashboard/${board}`,
      payload: { body: { ...before.body, folderId: ids.sales }, version: before.version },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const { copiedOn } = answer.json<MoveAnswer>();
    expect(copiedOn?.map(({ id }) => id)).toEqual([board]);
    const copyId = await copyOf({ copied: copiedOn![0]!.charts }, ids.inEmea, board);
    const after = await stored('dashboard', board);
    expect(after.body['folderId']).toBe(ids.sales);
    expect(tilesOf(after.body)).toEqual([copyId]);
  });

  it('a move that leaves every dashboard showing charts on its path names none', async () => {
    const staying = await chartIn('Staying', ids.sales);
    const onEmea = await sharedBoard('On EMEA', ids.emea, staying);
    const answer = await move('dashboard', onEmea, ids.sales);
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<MoveAnswer>().copiedOn).toBeUndefined();
    expect(tilesOf((await stored('dashboard', onEmea)).body)).toEqual([staying]);
  });

  it('an approval lands a dashboard showing a library chart off its path with its own copy', async () => {
    const board = await mine('dashboard', 'Approved', ids.sales);
    const toAlso = await mine('chart', 'Goes to Also', ids.also);
    // Saved before copy on use, or showing a chart moved off its path since:
    // it shows Also's chart and its own chart to Also as they are.
    const drafted = await stored('dashboard', board);
    await docs().update({
      kind: 'dashboard',
      id: board,
      body: { ...drafted.body, pages: showing(ids.inAlso, ids.inSales, toAlso) },
      expectedVersion: drafted.version,
    });
    const proposed = await as({
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: board },
    });
    expect(proposed.statusCode, proposed.body).toBe(201);
    const snapshot = (await stored('chart', toAlso)).body;

    const approved = await as({
      method: 'POST',
      url: `/api/proposals/${proposed.json<{ id: string }>().id}/approve`,
      payload: {},
    });
    expect(approved.statusCode, approved.body).toBe(200);
    const landed = approved.json<{ landed: { kind: string; id: string }[] }>().landed;
    const landedBoard = landed.find((each) => each.kind === 'dashboard')!.id;
    const landedChart = landed.find((each) => each.kind === 'chart')!.id;

    const atSales = await stored('dashboard', landedBoard);
    expect(atSales.body['folderId']).toBe(ids.sales);
    const [first, second, third] = tilesOf(atSales.body);
    expect(second).toBe(ids.inSales);
    for (const [tile, from] of [
      [first, await stored('chart', ids.inAlso)],
      [third, { body: snapshot }],
    ] as const) {
      expect(tile).not.toBe(ids.inAlso);
      expect(tile).not.toBe(landedChart);
      const own = await stored('chart', tile!);
      const {
        folderId: _folder,
        targetFolderId: _target,
        origin: _origin,
        owner: _owner,
        ...content
      } = from.body;
      void [_folder, _target, _origin, _owner];
      expect(own.body).toEqual({
        ...content,
        localToDashboardId: landedBoard,
        owner: atSales.body['owner'],
      });
    }
    // Its own chart to Also landed there all the same, as proposed.
    expect((await stored('chart', landedChart)).body['folderId']).toBe(ids.also);
    // And the version kept holds the dashboard with its copies, its own charts.
    const [kept] = await versionStore(getDb()).list('dashboard', landedBoard);
    expect(
      ((kept?.content['parts'] as { id: string }[] | undefined) ?? [])
        .map((part) => part.id)
        .sort(),
    ).toEqual([first, third].sort());
  });

  it('with sign-in off, a move copies nothing', async () => {
    const moving = await chartIn('Open moving', ids.sales);
    const onSales = await sharedBoard('Open on Sales', ids.sales, moving);
    const answer = await open.inject({
      method: 'PATCH',
      url: `/api/documents/chart/${moving}`,
      payload: { folderId: ids.also },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    expect(answer.json<MoveAnswer>().copiedOn).toBeUndefined();
    expect(tilesOf((await stored('dashboard', onSales)).body)).toEqual([moving]);
  });
});

/**
 * T537's review: a copy made on a folder move is bound on the dashboard's
 * path as it will be once the move is pushed to xcube, not as xcube's tree
 * has it before the move. Each name is one item's (T709, R71). Against the
 * stub xcube:
 *
 *   /P <run>      fp: `p_widgets`                       writer read-write
 *   /P/Q, /P/Q2   fq, fq2
 *   /R <run>      fr: `r_orders`                        writer read-write
 *   the root      froot: `orders`
 */
describe('copies bound where a moved folder goes (T537, AC-371, AC-272)', () => {
  const at = { p: '', q: '', q2: '', r: '', orders: '', widgets: '' };
  let bound: FastifyInstance;
  let writer = '';
  const asWriter = (options: InjectOptions) =>
    bound.inject({ ...options, headers: { ...options.headers, cookie: writer } });

  beforeAll(async () => {
    const rw = { readOnly: null, readWrite: ['sales-rw'] };
    at.p = await doc('folder', { title: `P ${MARK}`, folderId: 'root', access: rw });
    at.q = await doc('folder', { title: `Q ${MARK}`, folderId: at.p });
    at.q2 = await doc('folder', { title: `Q2 ${MARK}`, folderId: at.p });
    at.r = await doc('folder', { title: `R ${MARK}`, folderId: 'root', access: rw });
    const chart = (title: string, cube: string) =>
      doc('chart', {
        schemaVersion: 1,
        title: `${title} ${MARK}`,
        folderId: at.p,
        chart: { source: { cube }, wells: { measures: [`${cube}.count`] } },
      });
    at.orders = await chart('P’s orders', 'orders');
    at.widgets = await chart('P’s widgets', 'p_widgets');

    const stub = fakeXcube();
    const admin = xcubeAdmin({
      cubeApiUrl: base.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    });
    await admin.folders([
      { id: 'froot', parentId: null },
      { id: 'fp', parentId: 'froot' },
      { id: 'fq', parentId: 'fp' },
      { id: 'fq2', parentId: 'fp' },
      { id: 'fr', parentId: 'froot' },
    ]);
    const cube = (folderId: string, name: string) => ({
      folderId,
      name,
      kind: 'cube' as const,
      yaml: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`,
    });
    stub.holdItems('dev', [
      cube('froot', 'orders'),
      cube('fp', 'p_widgets'),
      cube('fr', 'r_orders'),
    ]);
    bound = buildServer({
      config: secured,
      sessions: pgSessionStore(getDb()),
      documents: docs(),
      catalog: catalog(getDb()),
      folderAccess: folderAccessStore(getDb()),
      xcube: admin,
      folders: async () => ({
        ids: new Map([
          ['root', 'froot'],
          [at.p, 'fp'],
          [at.q, 'fq'],
          [at.q2, 'fq2'],
          [at.r, 'fr'],
        ]),
        parents: new Map<string, string | null>([
          ['root', null],
          [at.p, 'root'],
          [at.q, at.p],
          [at.q2, at.p],
          [at.r, 'root'],
        ]),
      }),
    });
    writer = await signIn(bound, USERS['writer']!);
  });

  afterAll(async () => {
    if (bound !== undefined) await bound.close();
  });

  const cubeOf = async (chartId: string) =>
    ((await stored('chart', chartId)).body['chart'] as { source: { cube: string } }).source.cube;

  it('binds the copy along the folder’s new path', async () => {
    const onQ = await sharedBoard('On Q', at.q, at.orders);
    const answer = await asWriter({
      method: 'PATCH',
      url: `/api/documents/folder/${at.q}`,
      payload: { folderId: at.r },
    });
    expect(answer.statusCode, answer.body).toBe(200);
    const [shown] = tilesOf((await stored('dashboard', onQ)).body);
    expect(shown).not.toBe(at.orders);
    // Q, then R, then the root: the root's `orders`, under its own name.
    expect(await cubeOf(shown!)).toBe('orders');
  });

  it('refuses a move whose copy its new path can’t bind, and moves nothing', async () => {
    const onQ2 = await sharedBoard('On Q2', at.q2, at.widgets);
    const before = await stored('dashboard', onQ2);
    const answer = await asWriter({
      method: 'PATCH',
      url: `/api/documents/folder/${at.q2}`,
      payload: { folderId: at.r },
    });
    // Said as every break a move makes is said (T714, AC-425): the chart, on
    // the dashboard its copy would be, and the cube.
    expect(answer.statusCode, answer.body).toBe(422);
    expect(answer.json()).toEqual({
      error: `Moved, “P’s widgets ${MARK}” on “On Q2 ${MARK}” would use “p_widgets”, which isn’t in its folder or one above it. Nothing was moved.`,
      stranded: [
        {
          kind: 'chart',
          id: at.widgets,
          title: `P’s widgets ${MARK}`,
          dashboard: `On Q2 ${MARK}`,
          names: ['p_widgets'],
        },
      ],
    });
    expect((await stored('folder', at.q2)).body['folderId']).toBe(at.p);
    expect(await stored('dashboard', onQ2)).toEqual(before);
    expect(await docs().localTo(onQ2)).toEqual([]);
  });
});
