import { randomUUID } from 'node:crypto';

import { CHART_DOCUMENT_VERSION, type SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { routesOf } from '../auth/guard';
import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { CubeClient } from '../cube/client';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { bookmarkStore } from '../repos/bookmarks';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind, type StoredDocument } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { folderXcubeIds } from '../repos/folder-xcube-ids';
import { imageStore } from '../repos/images';
import { modelFileStore } from '../repos/model-files';
import { proposalStore } from '../repos/proposals';
import { queryLog } from '../repos/query-log';
import { CUBE_STORE_TARGET, sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { sqlRuns } from '../repos/sql-runs';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { connectionNameOf } from '../xcube/connections';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import { itemsOf } from '../xcube/items';
import { xcubeSqlRunner } from '../xcube/sql-runner';

/**
 * T408 (AC-268, AC-255, AC-261): every route the server registers, asked as
 * users in and out of each group, gets nothing outside their folders.
 *
 * AC-268: THE SYSTEM SHALL enforce folder access on every API route, not only
 * in the UI. An automated suite SHALL ask every route as users in and out of
 * each group, and nothing outside their permitted folders SHALL come back.
 * `Fails when: any route returns, lists, counts or finds by search an item
 * the asking user may not see, or accepts a change they may not make.`
 *
 * AC-255: a user in 20 AD groups is granted access through every one of them
 * (`many`, whose last group, `g20`, alone reaches /A/B/C).
 * AC-261: a group's access reaches every descendant, whatever groups the
 * descendant sets (`reader`, granted on /A, in /A/B/C, which /A/B sets for
 * `sales-rw`).
 *
 * The world: /A (read-only `sales-ro`), /A/B (read-write `sales-rw`), /A/B/C
 * (read-only `g20`) and /C (read-write `managers`), beside the shared root,
 * which no group is granted. Each place holds a dashboard with a chart of
 * its own and an image, a library chart, a model file and a data source;
 * `writer` and `manager` each have a workspace, a bookmark, a query in the
 * log and a proposal. Every one of them is a secret with the users who may
 * see it. Every answer to every request is searched for every secret its
 * user may not see: ids, titles, and marks written into each.
 *
 * The routes come from the server itself (`routesOf`), and the test fails
 * for a route it has no case for.
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
  // The install Job's seeding route is registered with its token (T443).
  seedToken: 'a-seed-token-for-the-route-matrix',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const WHO = ['super', 'writer', 'reader', 'many', 'manager', 'nobody'] as const;
type Who = (typeof WHO)[number];
const PLACES = ['root', 'A', 'AB', 'ABC', 'C'] as const;
type Place = (typeof PLACES)[number];
type Right = 'write' | 'all' | 'dashboards';

/**
 * What each user may do in each place, as AC-261, AC-262, AC-263, AC-255
 * and AC-265 say: a grant reaches down whole, and up view-only (every kind
 * from read-write, dashboards alone from read-only); a Super-Admin writes
 * everywhere. Missing: not theirs to see at all.
 */
const RIGHTS: Record<Who, Partial<Record<Place, Right>>> = {
  super: { root: 'write', A: 'write', AB: 'write', ABC: 'write', C: 'write' },
  // Read-write on /A/B, so in /A/B/C (AC-261); every kind above it (AC-262).
  writer: { root: 'all', A: 'all', AB: 'write', ABC: 'write' },
  // Read-only on /A, so in /A/B and /A/B/C whatever they set (AC-261); dashboards above (AC-263).
  reader: { root: 'dashboards', A: 'dashboards', AB: 'dashboards', ABC: 'dashboards' },
  // `g20`, the last of 20 groups, alone reaches /A/B/C (AC-255).
  many: { root: 'dashboards', A: 'dashboards', AB: 'dashboards', ABC: 'dashboards' },
  manager: { root: 'all', C: 'write' },
  nobody: {},
};
const opens = (who: Who, place: Place) => RIGHTS[who][place] !== undefined;
const seesAll = (who: Who, place: Place) =>
  RIGHTS[who][place] === 'write' || RIGHTS[who][place] === 'all';
const writes = (who: Who, place: Place) => RIGHTS[who][place] === 'write';
/** With no right to write anywhere, a user has no workspace (AC-277). */
const hasWorkspace = (who: Who) => Object.values(RIGHTS[who]).includes('write');

const MARK = `matrix${randomUUID().slice(0, 8)}`;
/** A name Cube and xcube take: lower case, letters, digits and `_`. */
const mark = MARK.toLowerCase();
const cubeOf = (place: Place) => `${mark}_${place.toLowerCase()}`;
/**
 * A place's rollup, and a build's token of it: each ends in a letter no
 * other's does, so /A's is never found inside /A/B's.
 */
const rollupOf = (place: Place) => `${mark}_rollup_${place.toLowerCase()}_r`;
const tokenOf = (place: Place) => `${MARK}-token-${place}-t`;
/** A group set on each folder beside the real one: none of the users is in it. */
const groupOf = (place: Place) => `${MARK}-group-${place}`;

interface Secret {
  readonly what: string;
  readonly markers: readonly string[];
  readonly seenBy: (who: Who) => boolean;
}
const SECRETS: Secret[] = [];
const secret = (what: string, seenBy: (who: Who) => boolean, ...markers: string[]) => {
  SECRETS.push({ what, seenBy, markers: markers.filter((marker) => marker !== '') });
};

const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
let app: FastifyInstance;
const cookies = {} as Record<Who, string>;
let rootBefore: StoredDocument | null = null;
/** The Cube requests the stub answered: path and the groups its token carried. */
const cubeAsked: { path: string; groups: readonly string[] | undefined }[] = [];

const folderIds: Record<Place, string> = { root: 'root', A: '', AB: '', ABC: '', C: '' };
let xcubeIds = new Map<string, string>();
/** A place's cube as xcube serves it: prefixed by its folder outside the root (T452). */
const fullName = (place: Place) =>
  place === 'root' ? cubeOf(place) : `${xcubeIds.get(folderIds[place])!}__${cubeOf(place)}`;

/** What was made in each place. */
interface Held {
  folder: string;
  dashboard: string;
  localChart: string;
  libraryChart: string;
  model: string;
  source: string;
  sourceName: string;
  image: string;
}
const at = {} as Record<Place, Held>;
/** Each owner's workspace and what it holds. */
interface Workspace {
  key: string;
  root: string;
  dashboard: string;
  chart: string;
  proposed: string;
  proposal: string;
  bookmark: string;
  /** Shared with everyone who may open its dashboard (T367). */
  sharedBookmark: string;
  requestId: string;
}
const ws = {} as Record<'writer' | 'manager', Workspace>;
const OWNERS = [
  ['writer', 'AB'],
  ['manager', 'C'],
] as const;
const models: string[] = [];
const extraSources: string[] = [];
/** A bookmark's state: a page tab, filter values and marks (T127). */
const BOOKMARKED = { filters: {}, marks: {} };
const images: string[] = [];

/** Sized as xcube takes an envelope: a 32-byte `enc`, one 256-byte bucket and its tag. */
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const postgres = (folderId: string, name: string) => ({
  folderId,
  name,
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
  sealed: { password: sealed(name) },
});

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({
    kind,
    id,
    body: {
      owner: 'admin',
      ...(kind === 'chart' ? { schemaVersion: CHART_DOCUMENT_VERSION } : {}),
      ...body,
    },
  });
  return id;
}
const chartOn = (cube: string) => ({
  source: { cube },
  wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
});
const modelOf = (place: Place) =>
  [
    `# ${MARK} model in ${place}`,
    'cubes:',
    `  - name: ${cubeOf(place)}`,
    `    sql_table: public.orders`,
    '    measures:',
    '      - name: count',
    '        type: count',
    '    pre_aggregations:',
    `      - name: ${rollupOf(place)}`,
    '        measures: [count]',
    '',
  ].join('\n');
/**
 * A library chart in the shared root, shown on /A/B's dashboard and /C's: so
 * whoever may open either may open it (AC-263), and what uses it is listed
 * to each as far as they may see.
 */
let sharedChart = '';
const SHOWN_ON: readonly Place[] = ['AB', 'C'];
/**
 * An image /A's dashboard shows, added to a workspace copy since discarded,
 * as one an approval lands is (T352): its own dashboard is gone.
 */
const landedImage = randomUUID();
/** Shown by a kept version of /A/B's dashboard alone, added to a copy since gone (T354). */
const versionImage = randomUUID();
/** Added by writer to the dashboard they propose, and on it (set as it is uploaded). */
let proposalImage = '';
/** A data source in writer's workspace (AC-276). */
const workspaceSource = { id: '', name: '' };
/** A PNG's first bytes, as an upload is judged by (`imageProblem`), then a mark. */
const png = (mark: string) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(mark)]);
/** An export file of one dashboard whose tiles show these images (F38). */
const exportOf = (title: string, imageIds: readonly string[]) => ({
  format: 'wechart-export',
  version: 1,
  exportedAt: new Date().toISOString(),
  items: [
    {
      kind: 'dashboard',
      id: randomUUID(),
      title,
      body: {
        schemaVersion: 1,
        title,
        pages: [
          {
            id: 'page-1',
            title: 'Page',
            items: imageIds.map((imageId, at) => ({
              id: `tile-${String(at)}`,
              kind: 'image',
              w: 6,
              h: 20,
              imageId,
              alt: 'An image',
            })),
          },
        ],
        settings: { width: 'fixed' },
      },
    },
  ],
});
const dashboardBody = (place: Place, chartId: string, imageId: string) => ({
  schemaVersion: 1,
  title: `${MARK} dashboard in ${place}`,
  folderId: folderIds[place],
  owner: 'admin',
  ...(SHOWN_ON.includes(place) ? { charts: [sharedChart] } : {}),
  pages: [
    {
      id: 'page-1',
      title: 'Page',
      items: [
        { id: 'tile-chart', kind: 'chart', w: 6, h: 20, chartId },
        { id: 'tile-image', kind: 'image', w: 6, h: 20, imageId, alt: 'An image' },
        ...(place === 'A'
          ? [{ id: 'tile-landed', kind: 'image', w: 6, h: 20, imageId: landedImage, alt: 'Landed' }]
          : []),
      ],
    },
  ],
  settings: { width: 'fixed' },
});

/**
 * The places each group's folder check admits (AC-320, xcube's gate): a
 * folder's allowed groups are those granted on it, on an ancestor or on a
 * descendant, and the Super-Admin group. The stub Cube answers as the gate
 * does, so a route that asked Cube as anyone but its user would bring back
 * what that user may not see.
 */
const ALLOWED: Record<Place, readonly string[]> = {
  root: ['sales-ro', 'sales-rw', 'g20', 'managers'],
  A: ['sales-ro', 'sales-rw', 'g20'],
  AB: ['sales-ro', 'sales-rw', 'g20'],
  ABC: ['sales-ro', 'sales-rw', 'g20'],
  C: ['managers'],
};
/** A token with no groups is wechart's own, which the gate doesn't stop (the service credential). */
const admits = (groups: readonly string[] | undefined, place: Place) =>
  groups === undefined ||
  groups.includes(secured.superAdminGroup) ||
  groups.some((group) => ALLOWED[place].includes(group));
const groupsOfToken = (authorization: string | null): readonly string[] | undefined => {
  const payload = authorization?.replace(/^Bearer /, '').split('.')[1];
  if (payload === undefined) return undefined;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { groups?: unknown };
  return Array.isArray(claims.groups) ? (claims.groups as string[]) : undefined;
};
/** A cube's place, by its full name. */
const placeOfCube = (name: string): Place | undefined =>
  PLACES.find((place) => name === fullName(place));

/** A data source Cube lists that is no wechart data source's connection, nor `default`. */
const UNKNOWN_SOURCE = `${mark}_unknown_connection`;
/** A data source's name in Cube: its connection's (T442). */
const connectionOf = (place: Place) =>
  connectionNameOf(
    place === 'root' ? 'froot' : xcubeIds.get(folderIds[place])!,
    at[place].sourceName,
  );

function cube(): CubeClient {
  return new CubeClient({
    apiUrl: secured.cubeApiUrl,
    apiSecret: secured.cubeApiSecret,
    securityContext: {},
    fetchImpl: (async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname.replace('/cubejs-api', '');
      const groups = groupsOfToken(new Headers(init?.headers).get('authorization'));
      cubeAsked.push({ path, groups });
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/v1/meta') {
        // Extended, each cube's rollups and where xcube publishes it (T371's placements).
        const extended = new URL(String(url)).searchParams.has('extended');
        return json({
          cubes: PLACES.filter((place) => admits(groups, place)).map((place) => ({
            name: fullName(place),
            title: `${MARK} cube in ${place}`,
            measures: [{ name: `${fullName(place)}.count`, title: 'Count', type: 'number' }],
            dimensions: [],
            segments: [],
            ...(extended
              ? {
                  preAggregations: [{ name: rollupOf(place), type: 'rollup' }],
                  meta: {
                    xcube: {
                      folderId: place === 'root' ? 'froot' : xcubeIds.get(folderIds[place]),
                      shortName: cubeOf(place),
                    },
                  },
                }
              : {}),
          })),
        });
      }
      if (path === '/v1/load' || path === '/v1/sql' || path === '/v1/dry-run') {
        const sent = new URL(String(url)).searchParams.get('query');
        const body = (
          sent === null ? JSON.parse(String(init?.body ?? '{}')) : { query: JSON.parse(sent) }
        ) as { query?: { measures?: string[] } };
        const places = (body.query?.measures ?? [])
          .map((member) => placeOfCube(member.split('.')[0]!))
          .filter((place): place is Place => place !== undefined);
        if (places.some((place) => !admits(groups, place)))
          return json({ error: 'None of these groups reaches that folder.' }, 403);
        if (path === '/v1/sql')
          return json({ sql: { sql: ['select 1', []], preAggregations: [] } });
        if (path === '/v1/dry-run') return json({ transformedQueries: [{}], pivotQuery: {} });
        return json({
          query: body.query,
          data: places.map((place) => ({
            [`${fullName(place)}.count`]: `${MARK} rows of ${place}`,
          })),
          annotation: { measures: {}, dimensions: {}, segments: {}, timeDimensions: {} },
        });
      }
      if (path.startsWith('/v1/introspection/data-sources')) {
        if (path === '/v1/introspection/data-sources')
          return json({
            dataSources: [
              ...PLACES.map((place) => connectionOf(place)),
              // Cube's own, from its settings: the shared root's.
              'default',
              // One wechart doesn't know: no one's but a Super-Admin's.
              UNKNOWN_SOURCE,
            ].map((dataSource) => ({ dataSource, dbType: 'postgres' })),
          });
        const named = decodeURIComponent(path.split('/')[4] ?? '');
        const mark_ =
          named === 'default'
            ? `${MARK}-default-catalog`
            : named === UNKNOWN_SOURCE
              ? `${MARK}-unknown-catalog`
              : '';
        return json({ schemas: [{ name: mark_ }], tables: [], columns: [], files: [] });
      }
      // A build's state (T371): each token's, naming the rollup it builds.
      if (path === '/v1/pre-aggregations/jobs') {
        const { tokens } = JSON.parse(String(init?.body ?? '{}')) as { tokens?: string[] };
        return json(
          PLACES.filter((place) => tokens?.includes(tokenOf(place))).map((place) => ({
            token: tokenOf(place),
            status: 'done',
            table: 't',
            selector: { preAggregations: [`${fullName(place)}.${rollupOf(place)}`] },
          })),
        );
      }
      return json({});
    }) as typeof fetch,
  });
}

const stub = fakeXcube();

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);

  // The folders, each with its group and one of the test's own that no one is in.
  const tree = [
    ['A', 'root', { readOnly: ['sales-ro', groupOf('A')], readWrite: null }],
    ['AB', 'A', { readOnly: null, readWrite: ['sales-rw', groupOf('AB')] }],
    ['ABC', 'AB', { readOnly: ['g20', groupOf('ABC')], readWrite: null }],
    ['C', 'root', { readOnly: null, readWrite: ['managers', groupOf('C')] }],
  ] as const;
  for (const [place, parent, access] of tree)
    folderIds[place] = await make('folder', {
      title: `${MARK} folder ${place}`,
      folderId: folderIds[parent],
      access,
    });
  xcubeIds = await folderXcubeIds(getDb()).of(
    PLACES.filter((place) => place !== 'root').map((place) => folderIds[place]),
  );
  sharedChart = await make('chart', {
    title: `${MARK} shared chart`,
    folderId: 'root',
    chart: chartOn(fullName('root')),
  });
  for (const [id, mark_] of [
    [landedImage, `${MARK} landed image`],
    [versionImage, `${MARK} version image`],
  ] as const) {
    await imageStore(getDb()).add({
      id,
      dashboardId: randomUUID(),
      contentType: 'image/png',
      bytes: png(mark_),
    });
    images.push(id);
  }

  const files = modelFileStore(getDb());
  for (const place of PLACES) {
    const folderId = folderIds[place];
    const localChart = randomUUID();
    const dashboardId = randomUUID();
    const imageId = randomUUID();
    await imageStore(getDb()).add({
      id: imageId,
      dashboardId,
      contentType: 'image/png',
      bytes: Buffer.from(`\x89PNG\r\n\x1a\n${MARK} image in ${place}`),
    });
    images.push(imageId);
    made.push({ kind: 'dashboard', id: dashboardId });
    await docs().create({
      kind: 'dashboard',
      id: dashboardId,
      body: dashboardBody(place, localChart, imageId),
    });
    made.push({ kind: 'chart', id: localChart });
    await docs().create({
      kind: 'chart',
      id: localChart,
      body: {
        owner: 'admin',
        schemaVersion: CHART_DOCUMENT_VERSION,
        title: `${MARK} chart on the dashboard in ${place}`,
        folderId,
        localToDashboardId: dashboardId,
        chart: chartOn(fullName(place)),
      },
    });
    const libraryChart = await make('chart', {
      title: `${MARK} library chart in ${place}`,
      folderId,
      chart: chartOn(fullName(place)),
    });
    const model = `${MARK}/model_${place.toLowerCase()}.yml`;
    models.push(model);
    await files.seed([
      { ...(place === 'root' ? {} : { folderId }), path: model, content: modelOf(place) },
    ]);
    const sourceName = `${mark}_source_${place.toLowerCase()}`;
    const source = (await sources().create(postgres(folderId, sourceName))).id;
    at[place] = {
      folder: folderId,
      dashboard: dashboardId,
      localChart,
      libraryChart,
      model,
      source,
      sourceName,
      image: imageId,
    };
    // A version of each dashboard, as an approval keeps (T352).
    await versionStore(getDb()).keep({
      kind: 'dashboard',
      itemId: dashboardId,
      version: 1,
      content: { body: dashboardBody(place, localChart, imageId), parts: [] },
      folderId,
      title: `${MARK} dashboard in ${place}`,
      author: null,
      approver: null,
      description: `${MARK} version of ${place}`,
      proposalId: null,
    });
  }
  // /A/B's second kept version, which showed an image its dashboard no longer does.
  const versioned = dashboardBody('AB', at.AB.localChart, at.AB.image);
  await versionStore(getDb()).keep({
    kind: 'dashboard',
    itemId: at.AB.dashboard,
    version: 2,
    content: {
      body: {
        ...versioned,
        pages: [
          {
            id: 'page-1',
            title: 'Page',
            items: [{ id: 'tile-kept', kind: 'image', w: 6, h: 20, imageId: versionImage }],
          },
        ],
      },
      parts: [],
    },
    folderId: at.AB.folder,
    title: `${MARK} dashboard in AB`,
    author: null,
    approver: null,
    description: `${MARK} version of AB`,
    proposalId: null,
  });

  // xcube holds the tree and the model's items, as after a publish.
  const admin = xcubeAdmin({
    cubeApiUrl: secured.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders(await folderXcubeIds(getDb()).tree());
  const published = await folderXcubeIds(getDb()).published();
  stub.holdItems('dev', itemsOf(await files.all(), published.ids));

  app = buildServer({
    config: secured,
    cube: cube(),
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    images: imageStore(getDb()),
    bookmarks: bookmarkStore(getDb()),
    modelFiles: files,
    folders: () => folderXcubeIds(getDb()).published(),
    xcube: admin,
    dataSources: sources(),
    // The SQL runner, its switch, each user's runs and xcube's (T531–T533).
    sqlRunnerSwitches: sqlRunnerSwitches(getDb()),
    sqlRuns: sqlRuns(getDb()),
    sqlRunner: xcubeSqlRunner({
      cubeApiUrl: secured.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    connectionTests: connectionTestStore(getDb()),
    connectionTest: async () =>
      ({ ok: true, checks: [{ id: 'connect', status: 'passed', durationMs: 1 }] }) as never,
    audit: auditStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    queryLog: queryLog(getDb()),
    healthFetch: (async () => new Response('{}', { status: 200 })) as typeof fetch,
    introspectionRetryMs: 1,
  });
  for (const who of WHO) cookies[who] = await signIn(app, USERS[who]!);

  // Each owner's workspace: a dashboard, a library chart and a dashboard proposed.
  for (const [owner, target] of OWNERS) {
    const create = async (kind: 'dashboard' | 'chart', title: string) => {
      const answer = await app.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { cookie: cookies[owner] },
        payload: { kind, title, folderId: 'mine', targetFolderId: at[target].folder },
      });
      expect(answer.statusCode, answer.body).toBe(201);
      const id = answer.json<{ id: string }>().id;
      made.push({ kind, id });
      return id;
    };
    const dashboard = await create('dashboard', `${MARK} ${owner}'s workspace dashboard`);
    const chart = await create('chart', `${MARK} ${owner}'s workspace chart`);
    const proposed = await create('dashboard', `${MARK} ${owner}'s proposed dashboard`);
    const root = String((await docs().get('dashboard', dashboard))?.body['folderId']);
    if (owner === 'writer') {
      // An image added to the dashboard they propose, and shown on it.
      const uploaded = await app.inject({
        method: 'POST',
        url: `/api/dashboards/${proposed}/images`,
        headers: { cookie: cookies[owner] },
        payload: {
          contentType: 'image/png',
          data: png(`${MARK} proposal image`).toString('base64'),
        },
      });
      expect(uploaded.statusCode, uploaded.body).toBe(201);
      proposalImage = uploaded.json<{ id: string }>().id;
      images.push(proposalImage);
      const stored = (await docs().get('dashboard', proposed))!;
      const saved = await app.inject({
        method: 'PUT',
        url: `/api/documents/dashboard/${proposed}`,
        headers: { cookie: cookies[owner] },
        payload: {
          body: {
            ...stored.body,
            pages: [
              {
                id: 'page-1',
                title: 'Page',
                items: [{ id: 'tile-p', kind: 'image', w: 6, h: 20, imageId: proposalImage }],
              },
            ],
          },
          version: stored.version,
        },
      });
      expect(saved.statusCode, saved.body).toBeLessThan(300);
      const source = await sources().create(postgres(root, `${mark}_ws_source`));
      Object.assign(workspaceSource, { id: source.id, name: `${mark}_ws_source` });
    }
    const proposing = await app.inject({
      method: 'POST',
      url: '/api/proposals',
      headers: { cookie: cookies[owner] },
      payload: { kind: 'dashboard', id: proposed, description: `${MARK} ${owner}'s proposal` },
    });
    expect(proposing.statusCode, proposing.body).toBeLessThan(300);
    const bookmarking = await app.inject({
      method: 'POST',
      url: `/api/dashboards/${at[target].dashboard}/bookmarks`,
      headers: { cookie: cookies[owner] },
      payload: { name: `${MARK} ${owner}'s bookmark`, state: BOOKMARKED },
    });
    expect(bookmarking.statusCode, bookmarking.body).toBeLessThan(300);
    // And one shared, with everyone who may open the dashboard (T367, AC-293).
    const sharing = await app.inject({
      method: 'POST',
      url: `/api/dashboards/${at[target].dashboard}/bookmarks`,
      headers: { cookie: cookies[owner] },
      payload: { name: `${MARK} ${owner}'s shared bookmark`, state: BOOKMARKED },
    });
    expect(sharing.statusCode, sharing.body).toBeLessThan(300);
    const sharedBookmark = sharing.json<{ id: string }>().id;
    const shared = await app.inject({
      method: 'PATCH',
      url: `/api/dashboards/${at[target].dashboard}/bookmarks/${sharedBookmark}`,
      headers: { cookie: cookies[owner] },
      payload: { shared: true },
    });
    expect(shared.statusCode, shared.body).toBe(200);
    const key = root.replace(/^ws:/, '');
    const requestId = `${MARK}-request-${owner}`;
    await queryLog(getDb()).record({
      requestId,
      query: { measures: [`${fullName(target)}.count`], segments: [`${MARK} ${owner}'s query`] },
      durationMs: 1,
      accelerated: false,
      userKey: key,
    });
    ws[owner] = {
      key,
      root,
      dashboard,
      chart,
      proposed,
      proposal: proposing.json<{ id: string }>().id,
      bookmark: bookmarking.json<{ id: string }>().id,
      sharedBookmark,
      requestId,
    };
  }

  // Every secret, and who may see it.
  for (const place of PLACES) {
    const held = at[place];
    if (place !== 'root') {
      secret(`folder ${place}`, (who) => opens(who, place), held.folder, `${MARK} folder ${place}`);
      secret(`groups of ${place}`, (who) => opens(who, place), groupOf(place));
    }
    // A dashboard, its own chart and image, and its versions: whoever may open the folder (AC-263).
    secret(
      `dashboard in ${place}`,
      (who) => opens(who, place),
      held.dashboard,
      `${MARK} dashboard in ${place}`,
      held.localChart,
      `${MARK} chart on the dashboard in ${place}`,
      held.image,
      `${MARK} image in ${place}`,
      `${MARK} version of ${place}`,
    );
    // What Cube's gate admits their groups to (AC-320).
    secret(
      `Cube's answers in ${place}`,
      (who) => opens(who, place),
      `${MARK} cube in ${place}`,
      `${MARK} rows of ${place}`,
    );
    // Library charts, models and data sources: where every kind is theirs (AC-262, AC-263).
    secret(
      `library chart in ${place}`,
      (who) => seesAll(who, place),
      held.libraryChart,
      `${MARK} library chart in ${place}`,
    );
    secret(
      `model in ${place}`,
      (who) => seesAll(who, place),
      held.model,
      `${MARK} model in ${place}`,
    );
    // A rollup's name and freshness: to whoever may see its folder, as a
    // dashboard's Data as of shows them (R42.7); its file, key and SQL, the
    // model's, stay the model's.
    secret(`rollup in ${place}`, (who) => opens(who, place), rollupOf(place));
    // A build's token, to those who may build there (T371).
    secret(`build in ${place}`, (who) => writes(who, place), tokenOf(place));
    secret(`data source in ${place}`, (who) => seesAll(who, place), held.source, held.sourceName);
    // A credential reaches no one (AC-164).
    secret(`the credential in ${place}`, () => false, sealed(held.sourceName).ct);
  }
  secret('the landed image', (who) => opens(who, 'A'), `${MARK} landed image`);
  // Shown by a kept version of /A/B's dashboard alone: to its history's readers (T354).
  secret('the version image', (who) => writes(who, 'AB'), `${MARK} version image`);
  // On writer's proposed dashboard: its author, and those who may decide it.
  secret(
    'the proposal image',
    (who) => who === 'writer' || who === 'super' || writes(who, 'AB'),
    `${MARK} proposal image`,
  );
  // A data source in writer's workspace: theirs alone (AC-276).
  secret("writer's workspace data source", (who) => who === 'writer', workspaceSource.name);
  // Cube's own `default`, the shared root's; one wechart doesn't know, a Super-Admin's.
  secret('the default source', (who) => seesAll(who, 'root'), `${MARK}-default-catalog`);
  secret('an unknown source', (who) => who === 'super', UNKNOWN_SOURCE, `${MARK}-unknown-catalog`);
  secret(
    'the shared chart',
    (who) => seesAll(who, 'root') || SHOWN_ON.some((place) => opens(who, place)),
    sharedChart,
    `${MARK} shared chart`,
  );
  for (const [owner, target] of OWNERS) {
    const held = ws[owner];
    // A workspace is its owner's alone, a Super-Admin's included (AC-276):
    // what it holds. (Its id, `ws:<key>`, names its owner, as a proposal's
    // author or an audit record's actor does.)
    secret(
      `${owner}'s workspace`,
      (who) => who === owner,
      held.dashboard,
      `${MARK} ${owner}'s workspace dashboard`,
      held.chart,
      `${MARK} ${owner}'s workspace chart`,
    );
    // A proposal: its author, and those who may decide it (AC-287).
    secret(
      `${owner}'s proposal`,
      (who) => who === owner || who === 'super' || writes(who, target),
      held.proposal,
      held.proposed,
      `${MARK} ${owner}'s proposed dashboard`,
      `${MARK} ${owner}'s proposal`,
    );
    // A bookmark is its owner's (AC-292).
    secret(
      `${owner}'s bookmark`,
      (who) => who === owner,
      held.bookmark,
      `${MARK} ${owner}'s bookmark`,
    );
    // One shared: everyone's who may open its dashboard (AC-293).
    secret(
      `${owner}'s shared bookmark`,
      (who) => opens(who, target),
      held.sharedBookmark,
      `${MARK} ${owner}'s shared bookmark`,
    );
    // A query in the log: its user's, and a Super-Admin's (R42.6, T371).
    secret(
      `${owner}'s query`,
      (who) => who === owner || who === 'super',
      held.requestId,
      `${MARK} ${owner}'s query`,
    );
  }
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  // The SQL runs the matrix made (T533, T534).
  const sourced = PLACES.map((place) => at[place]?.source).filter((id) => id !== undefined);
  if (sourced.length > 0)
    await db.deleteFrom('sql_runs').where('data_source_id', 'in', sourced).execute();
  // And those on Cube Store (T536), which have no data source.
  await db
    .deleteFrom('sql_runs')
    .where('data_source_id', 'is', null)
    .where('sql', 'like', `%${MARK}%`)
    .execute();
  if (models.length > 0) await db.deleteFrom('model_files').where('path', 'in', models).execute();
  await db.deleteFrom('data_sources').where('name', 'like', `${mark}%`).execute();
  for (const id of extraSources) await db.deleteFrom('data_sources').where('id', '=', id).execute();
  if (images.length > 0) await db.deleteFrom('images').where('id', 'in', images).execute();
  await db.deleteFrom('query_log').where('request_id', 'like', `${MARK}%`).execute();
  const ids = made.map((each) => each.id);
  if (ids.length > 0) await db.deleteFrom('item_versions').where('item_id', 'in', ids).execute();
  for (const [owner] of OWNERS)
    if (ws[owner] !== undefined)
      await db.deleteFrom('proposals').where('id', '=', ws[owner].proposal).execute();
  // Bookmarks, and whatever the cases made through the API, by their marks.
  await db
    .deleteFrom('documents')
    .where(sql<boolean>`body::text like ${`%${MARK}%`}`)
    .where('kind', 'in', ['bookmark', 'folder', 'dashboard', 'chart'])
    .execute();
  for (const { kind, id } of made.reverse()) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await closeDb();
});

/**
 * Asks as `who`, and fails on any secret in the answer they may not see,
 * whatever its status.
 */
async function ask(who: Who, options: InjectOptions): Promise<LightMyRequestResponse> {
  const response = await app.inject({
    ...options,
    headers: { ...options.headers, cookie: cookies[who] },
  });
  const body = response.body;
  const leaked = SECRETS.filter(
    (each) => !each.seenBy(who) && each.markers.some((marker) => body.includes(marker)),
  ).map((each) => each.what);
  expect(
    leaked,
    `${who}: ${String(options.method)} ${String(options.url)} answered ${String(response.statusCode)} with what they may not see`,
  ).toEqual([]);
  return response;
}
/** Refused, as a thing that isn't there or isn't theirs: never a 2xx. */
const REFUSED = [401, 403, 404];
const refused = (response: LightMyRequestResponse, where: string) =>
  expect(REFUSED, `${where}: ${String(response.statusCode)} ${response.body}`).toContain(
    response.statusCode,
  );
const answered = (response: LightMyRequestResponse, where: string) =>
  expect(response.statusCode, `${where}: ${response.body}`).toBeLessThan(300);

/** Opens `url` as everyone: those it is for get it, with its mark; everyone else a refusal. */
async function openedOnlyBy(
  url: string,
  may: (who: Who) => boolean,
  shows?: string,
  options: Omit<InjectOptions, 'url'> = { method: 'GET' },
) {
  for (const who of WHO) {
    const response = await ask(who, { ...options, url });
    const where = `${who} ${String(options.method)} ${url}`;
    if (may(who)) {
      answered(response, where);
      if (shows !== undefined) expect(response.body, where).toContain(shows);
    } else refused(response, where);
  }
}

type Case = () => Promise<void>;
const everyone =
  (options: InjectOptions): Case =>
  async () => {
    for (const who of WHO) await ask(who, options);
  };
/**
 * Asked of everyone: nothing they may not see, and, so the case isn't
 * empty, what they may, each mark `shows` gives them in the answer.
 */
const listed =
  (options: InjectOptions, shows: (who: Who) => readonly string[]): Case =>
  async () => {
    for (const who of WHO) {
      const response = await ask(who, options);
      for (const marker of shows(who))
        expect(response.body, `${who} ${String(options.url)} shows ${marker}`).toContain(marker);
    }
  };
/** Each place's mark `of` gives, for the places `where` holds for this user. */
const inPlaces = (
  who: Who,
  where: (who: Who, place: Place) => boolean,
  of: (place: Place) => string,
) => PLACES.filter((place) => where(who, place)).map(of);
/** A query for a place's dashboard, naming that dashboard (T340). */
const queryFor = (place: Place) => ({
  query: { measures: [`${fullName(place)}.count`] },
  for: { kind: 'dashboard', id: at[place].dashboard },
});
const IMPORTS = `/api/import`;

/**
 * One case for each route the server registers, by method and pattern: each
 * asks it as every user, of items in every place.
 */
const CASES: Record<string, Case> = {
  // Health and signing in: nothing of anyone's.
  'GET /api/health': everyone({ method: 'GET', url: '/api/health' }),
  'GET /api/auth/check': everyone({ method: 'GET', url: '/api/auth/check' }),
  'GET /api/auth/login': everyone({ method: 'GET', url: '/api/auth/login?returnTo=/explore' }),
  'GET /api/auth/callback': everyone({ method: 'GET', url: '/api/auth/callback' }),
  'POST /api/auth/logout': async () => {
    // Each signs out a session of their own, made for this: the others' stay.
    for (const who of WHO) {
      const cookie = await signIn(app, USERS[who]!);
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie },
      });
      expect(response.body).not.toContain(MARK);
    }
  },
  // The install Job's: its token alone, and never a session (T443).
  'POST /api/data-sources/root-default': async () => {
    for (const who of WHO)
      refused(
        await ask(who, { method: 'POST', url: '/api/data-sources/root-default', payload: {} }),
        `${who} seeding`,
      );
  },

  'GET /api/me': everyone({ method: 'GET', url: '/api/me' }),
  'GET /api/cube-health': everyone({ method: 'GET', url: '/api/cube-health' }),
  'GET /api/cube-auth': everyone({ method: 'GET', url: '/api/cube-auth' }),
  // Jobs' own: a read-write member's or a Super-Admin's (T371).
  'GET /api/cube-scopes': () => openedOnlyBy('/api/cube-scopes', hasWorkspace),

  // The field list: Cube's, asked as the user (AC-320); for an item, that item's (T340).
  'GET /api/meta': async () => {
    for (const who of WHO) {
      const whole = await ask(who, { method: 'GET', url: '/api/meta' });
      answered(whole, `${who} meta`);
      for (const place of PLACES)
        if (opens(who, place))
          expect(whole.body, `${who} meta`).toContain(`${MARK} cube in ${place}`);
    }
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/meta?for=dashboard:${at[place].dashboard}`,
        (who) => opens(who, place),
        `${MARK} cube in ${place}`,
      );
  },
  'POST /api/load': () => queries('/api/load'),
  'POST /api/sql': () => queries('/api/sql'),
  'POST /api/acceleration': () => queries('/api/acceleration'),
  /**
   * A cancel always answers 204 (AC-011): the tile that asked is gone. What
   * shows it can stop only what its user may is that Cube is asked it as
   * that user, never as wechart itself.
   */
  'DELETE /api/running-query/:requestId': async () => {
    for (const who of WHO)
      for (const [owner] of OWNERS) {
        const asked = cubeAsked.length;
        await ask(who, { method: 'DELETE', url: `/api/running-query/${ws[owner].requestId}` });
        const cancels = cubeAsked
          .slice(asked)
          .filter((each) => each.path.startsWith('/v1/running-query/'));
        expect(cancels.length, `${who} cancelling`).toBe(1);
        // A user's token: their groups, or those of them some folder names (T437), none other.
        const groups = cancels[0]?.groups;
        expect(Array.isArray(groups), `${who} cancels as themselves`).toBe(true);
        expect(
          groups?.filter((group) => !USERS[who]!.groups.includes(group)),
          `${who} cancels as someone else`,
        ).toEqual([]);
      }
  },

  // The tree, a folder's contents, and search.
  'GET /api/folders': async () => {
    const beneath: Record<Exclude<Place, 'root'>, Place[]> = {
      A: ['A', 'AB', 'ABC'],
      AB: ['AB', 'ABC'],
      ABC: ['ABC'],
      C: ['C'],
    };
    for (const who of WHO) {
      const response = await ask(who, { method: 'GET', url: '/api/folders' });
      answered(response, `${who} folders`);
      const listed = response.json<{ id: string; count?: number }[]>();
      for (const place of ['A', 'AB', 'ABC', 'C'] as const) {
        const folder = listed.find((each) => each.id === at[place].folder);
        expect(folder !== undefined, `${who} lists ${place}`).toBe(opens(who, place));
        // AC-194: counted as they may see it, what is beneath included: a
        // dashboard each, and where every kind is theirs a library chart, a
        // model and a data source too.
        if (folder?.count !== undefined)
          expect(folder.count, `${who}'s count of ${place}`).toBe(
            beneath[place]
              .filter((each) => opens(who, each))
              .reduce((sum, each) => sum + 1 + (seesAll(who, each) ? 3 : 0), 0),
          );
      }
    }
  },
  'GET /api/folders/targets': async () => {
    for (const who of WHO) {
      const response = await ask(who, { method: 'GET', url: '/api/folders/targets' });
      for (const place of ['AB', 'C'] as const)
        if (writes(who, place))
          expect(response.body, `${who}'s targets`).toContain(at[place].folder);
    }
  },
  'GET /api/folder-roots': everyone({ method: 'GET', url: '/api/folder-roots' }),
  'GET /api/folders/:folderId/contents': async () => {
    for (const place of PLACES)
      if (place === 'root')
        for (const who of WHO) await ask(who, { method: 'GET', url: '/api/folders/root/contents' });
      else
        await openedOnlyBy(
          `/api/folders/${at[place].folder}/contents`,
          (who) => opens(who, place),
          at[place].dashboard,
        );
  },
  // Found by search: the dashboards they may open, the library charts where every kind is theirs.
  'GET /api/search': listed(
    { method: 'GET', url: `/api/search?q=${encodeURIComponent(MARK)}&limit=100` },
    (who) => [
      ...inPlaces(who, opens, (place) => at[place].dashboard),
      ...inPlaces(who, seesAll, (place) => at[place].libraryChart),
    ],
  ),

  // Documents: opened, saved, renamed, deleted, made.
  'GET /api/documents/:kind/:id': async () => {
    for (const place of PLACES) {
      const held = at[place];
      if (place !== 'root')
        await openedOnlyBy(`/api/documents/folder/${held.folder}`, (who) => opens(who, place));
      await openedOnlyBy(`/api/documents/dashboard/${held.dashboard}`, (who) => opens(who, place));
      await openedOnlyBy(`/api/documents/chart/${held.localChart}`, (who) => opens(who, place));
      await openedOnlyBy(`/api/documents/chart/${held.libraryChart}`, (who) => seesAll(who, place));
    }
    for (const [owner] of OWNERS) {
      await openedOnlyBy(`/api/documents/dashboard/${ws[owner].dashboard}`, (who) => who === owner);
      await openedOnlyBy(`/api/documents/chart/${ws[owner].chart}`, (who) => who === owner);
    }
    // A library chart shown on a dashboard: to whoever may open that dashboard (AC-263).
    await openedOnlyBy(
      `/api/documents/chart/${sharedChart}`,
      (who) => seesAll(who, 'root') || SHOWN_ON.some((place) => opens(who, place)),
    );
  },
  'PUT /api/documents/:kind/:id': async () => {
    for (const place of PLACES)
      for (const [kind, id] of itemsIn(place))
        await changedOnlyBy(
          kind,
          id,
          (who) => writes(who, place),
          (stored) => ({
            method: 'PUT',
            url: `/api/documents/${kind}/${id}`,
            payload: { body: stored.body, version: stored.version },
          }),
        );
  },
  'PATCH /api/documents/:kind/:id': async () => {
    for (const place of PLACES)
      for (const [kind, id] of itemsIn(place))
        await changedOnlyBy(
          kind,
          id,
          (who) => writes(who, place),
          (stored) => ({
            method: 'PATCH',
            url: `/api/documents/${kind}/${id}`,
            payload: { title: stored.body['title'] },
          }),
        );
  },
  /**
   * What a delete would take or be refused for (T517, T518; AC-362, AC-363),
   * asked before its dialog opens: where they may delete it, the dashboards
   * they may see named and the rest counted, never named.
   */
  'GET /api/documents/:kind/:id/dependents': async () => {
    for (const place of PLACES)
      for (const [kind, id] of [
        ['dashboard', at[place].dashboard],
        ['chart', at[place].libraryChart],
      ] as const)
        await openedOnlyBy(`/api/documents/${kind}/${id}/dependents`, (who) => writes(who, place));
  },
  'DELETE /api/documents/:kind/:id': async () => {
    for (const place of PLACES)
      for (const who of WHO) {
        // A folder of its own, made for this, so a delete takes nothing else.
        const doomed = await make('folder', {
          title: `${MARK} doomed`,
          folderId: at[place].folder,
        });
        const response = await ask(who, {
          method: 'DELETE',
          url: `/api/documents/folder/${doomed}`,
        });
        const there = (await docs().get('folder', doomed)) !== null;
        const where = `${who} deleting in ${place}`;
        if (writes(who, place)) {
          answered(response, where);
          expect(there, where).toBe(false);
        } else {
          refused(response, where);
          expect(there, where).toBe(true);
        }
      }
  },
  'POST /api/documents': async () => {
    for (const place of PLACES)
      for (const who of WHO) {
        const response = await ask(who, {
          method: 'POST',
          url: '/api/documents',
          payload: { kind: 'folder', title: `${MARK} made`, folderId: at[place].folder },
        });
        const where = `${who} making in ${place}`;
        if (writes(who, place)) {
          expect(response.statusCode, where).toBe(201);
          made.push({ kind: 'folder', id: response.json<{ id: string }>().id });
        } else refused(response, where);
      }
  },
  // What uses a chart: the dashboards each may open, and never another's.
  'GET /api/charts/:chartId/dashboards': async () => {
    for (const who of WHO) {
      const response = await ask(who, {
        method: 'GET',
        url: `/api/charts/${sharedChart}/dashboards`,
      });
      for (const place of SHOWN_ON)
        if (opens(who, place))
          expect(response.body, `${who} sees ${place}'s dashboard use it`).toContain(
            at[place].dashboard,
          );
      for (const place of PLACES)
        await ask(who, { method: 'GET', url: `/api/charts/${at[place].libraryChart}/dashboards` });
    }
  },
  'PUT /api/dashboards/:id': async () => {
    const saving = (id: string) => (stored: StoredDocument) => ({
      method: 'PUT' as const,
      url: `/api/dashboards/${id}`,
      payload: { dashboard: { body: stored.body, version: stored.version }, charts: [] },
    });
    // A shared one changes only through a proposal (T502, AC-278), even for
    // those who may change it; to anyone else it is refused as theirs to not.
    for (const place of PLACES)
      await changedOnlyBy(
        'dashboard',
        at[place].dashboard,
        (who) => writes(who, place),
        saving(at[place].dashboard),
        (response, where) => {
          expect(response.statusCode, where).toBe(409);
          expect(response.json<{ code?: string }>().code, where).toBe('shared_in_place');
        },
      );
    for (const [owner] of OWNERS)
      await changedOnlyBy(
        'dashboard',
        ws[owner].dashboard,
        (who) => who === owner,
        saving(ws[owner].dashboard),
      );
  },
  'POST /api/dashboards/:dashboardId/charts': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: `/api/dashboards/${at[place].dashboard}/charts`,
            payload: { chartId: at[place].libraryChart },
          }),
          `${who} adding a chart in ${place}`,
        );
  },
  'POST /api/dashboards/:dashboardId/images': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: `/api/dashboards/${at[place].dashboard}/images`,
            payload: {
              contentType: 'image/png',
              data: Buffer.from('\x89PNG\r\n\x1a\n').toString('base64'),
            },
          }),
          `${who} adding an image in ${place}`,
        );
  },
  /**
   * An image goes to one who may open a dashboard showing it (T327's
   * review): the one it was added to, or any other stored dashboard that
   * shows it, such as one an approval landed it on. Named by the tile asking
   * for it (`for`, as a query names its item), a kept version's image too, to
   * the history's readers, and a proposal's, to those who may open it. A
   * dashboard they may open that doesn't show it gets them nothing.
   */
  'GET /api/images/:id': async () => {
    for (const place of PLACES) {
      const image = `/api/images/${at[place].image}`;
      const shows = `${MARK} image in ${place}`;
      await openedOnlyBy(image, (who) => opens(who, place), shows);
      await openedOnlyBy(
        `${image}?for=dashboard:${at[place].dashboard}`,
        (who) => opens(who, place),
        shows,
      );
      // Named for /A/B's dashboard, which doesn't show it: to its own dashboard's alone.
      if (place !== 'AB')
        await openedOnlyBy(
          `${image}?for=dashboard:${at.AB.dashboard}`,
          (who) => opens(who, place),
          shows,
        );
    }
    // Landed on /A's dashboard from a workspace copy since discarded: to whoever may open /A's.
    for (const asked of [
      '',
      `?for=dashboard:${at.A.dashboard}`,
      `?for=dashboard:${at.C.dashboard}`,
    ])
      await openedOnlyBy(
        `/api/images/${landedImage}${asked}`,
        (who) => opens(who, 'A'),
        `${MARK} landed image`,
      );

    // Shown by a kept version of /A/B's dashboard alone: to those who may read its history (T354).
    await openedOnlyBy(`/api/images/${versionImage}`, () => false);
    await openedOnlyBy(
      `/api/images/${versionImage}?for=dashboard:${at.AB.dashboard}`,
      (who) => writes(who, 'AB'),
      `${MARK} version image`,
    );
    // On writer's proposed dashboard: its author, and in review, those who may decide it.
    await openedOnlyBy(`/api/images/${proposalImage}`, (who) => who === 'writer');
    await openedOnlyBy(
      `/api/images/${proposalImage}?for=proposal:${ws.writer.proposal}`,
      (who) => who === 'writer' || who === 'super' || writes(who, 'AB'),
      `${MARK} proposal image`,
    );

    /**
     * Another folder's image put on a dashboard of one's own: refused, so a
     * dashboard they write never shows what they may not see (T408's
     * review). /C's image, which `writer` may not see, on their workspace
     * dashboard, saved both ways; `manager`, who may, puts it on theirs.
     */
    const showing = (body: Record<string, unknown>, imageId: string) => ({
      ...body,
      pages: [
        {
          id: 'page-s',
          title: 'Shown',
          items: [{ id: 'tile-s', kind: 'image', w: 6, h: 20, imageId }],
        },
      ],
    });
    for (const [owner, may] of [
      ['writer', false],
      ['manager', true],
    ] as const) {
      const id = ws[owner].dashboard;
      for (const save of ['documents', 'dashboards'] as const) {
        const stored = (await docs().get('dashboard', id))!;
        const body = showing(stored.body, at.C.image);
        const response = await ask(
          owner,
          save === 'documents'
            ? {
                method: 'PUT',
                url: `/api/documents/dashboard/${id}`,
                payload: { body, version: stored.version },
              }
            : {
                method: 'PUT',
                url: `/api/dashboards/${id}`,
                payload: { dashboard: { body, version: stored.version }, charts: [] },
              },
        );
        const where = `${owner} putting /C's image on their dashboard (${save})`;
        if (may) answered(response, where);
        else {
          expect(response.statusCode, `${where}: ${response.body}`).toBe(403);
          expect((await docs().get('dashboard', id))?.version, where).toBe(stored.version);
        }
      }
      // So never shown through it to one who may not see /C.
      const through = await ask(owner, {
        method: 'GET',
        url: `/api/images/${at.C.image}?for=dashboard:${id}`,
      });
      if (may) answered(through, `${owner} through their dashboard`);
      else refused(through, `${owner} through their dashboard`);
    }
  },
  'GET /api/dashboards/:dashboardId/bookmarks': async () => {
    for (const place of PLACES)
      await openedOnlyBy(`/api/dashboards/${at[place].dashboard}/bookmarks`, (who) =>
        opens(who, place),
      );
    // A shared one, to everyone who may open its dashboard (T367, AC-293).
    for (const [owner, target] of OWNERS)
      await openedOnlyBy(
        `/api/dashboards/${at[target].dashboard}/bookmarks`,
        (who) => opens(who, target),
        `${MARK} ${owner}'s shared bookmark`,
      );
  },
  /**
   * Changed by its owner alone (T367, AC-293): asked of each owner's own and
   * shared one, by everyone. The owner's change is undone at once, so what
   * every other case sees is as the world says.
   */
  'PATCH /api/dashboards/:dashboardId/bookmarks/:id': async () => {
    for (const [owner, target] of OWNERS)
      for (const [id, shared] of [
        [ws[owner].bookmark, false],
        [ws[owner].sharedBookmark, true],
      ] as const) {
        const url = `/api/dashboards/${at[target].dashboard}/bookmarks/${id}`;
        for (const who of WHO) {
          const response = await ask(who, { method: 'PATCH', url, payload: { shared: !shared } });
          const where = `${who} sharing ${owner}'s ${shared ? 'shared ' : ''}bookmark`;
          if (who !== owner) {
            refused(response, where);
            continue;
          }
          answered(response, where);
          const back = await ask(who, { method: 'PATCH', url, payload: { shared } });
          answered(back, `${where}, back`);
        }
      }
  },
  'DELETE /api/dashboards/:dashboardId/bookmarks/:id': async () => {
    for (const [owner, target] of OWNERS) {
      const bookmarksOf = `/api/dashboards/${at[target].dashboard}/bookmarks`;
      // One of its owner's, made to be deleted.
      const made_ = await ask(owner, {
        method: 'POST',
        url: bookmarksOf,
        payload: { name: `${MARK} ${owner}'s doomed one`, state: BOOKMARKED },
      });
      answered(made_, `${owner} making one to delete`);
      const doomed = made_.json<{ id: string }>().id;
      for (const id of [ws[owner].bookmark, ws[owner].sharedBookmark, doomed])
        for (const who of WHO)
          if (who !== owner)
            refused(
              await ask(who, { method: 'DELETE', url: `${bookmarksOf}/${id}` }),
              `${who} deleting ${owner}'s bookmark`,
            );
      expect(
        (await ask(owner, { method: 'DELETE', url: `${bookmarksOf}/${doomed}` })).statusCode,
      ).toBe(204);
    }
  },
  'POST /api/dashboards/:dashboardId/bookmarks': async () => {
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/dashboards/${at[place].dashboard}/bookmarks`,
        (who) => opens(who, place),
        undefined,
        { method: 'POST', payload: { name: `${MARK} a bookmark`, state: BOOKMARKED } },
      );
  },

  // History: a shared item's versions, to those who may change it (T354, AC-289).
  'GET /api/history/:kind/:id': async () => {
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/history/dashboard/${at[place].dashboard}`,
        (who) => writes(who, place),
        `${MARK} version of ${place}`,
      );
  },
  'GET /api/history/:kind/:id/versions/:version': async () => {
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/history/dashboard/${at[place].dashboard}/versions/1`,
        (who) => writes(who, place),
        at[place].image,
      );
  },
  'POST /api/history/:kind/:id/restore': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place))) {
        const before = await docs().get('dashboard', at[place].dashboard);
        refused(
          await ask(who, {
            method: 'POST',
            url: `/api/history/dashboard/${at[place].dashboard}/restore`,
            payload: { version: 1 },
          }),
          `${who} restoring in ${place}`,
        );
        expect((await docs().get('dashboard', at[place].dashboard))?.version).toBe(before?.version);
      }
  },

  // Export, to those who may open the dashboard; import, into their own workspace.
  'GET /api/export/dashboards/:id': async () => {
    for (const place of PLACES)
      await openedOnlyBy(`/api/export/dashboards/${at[place].dashboard}`, (who) =>
        opens(who, place),
      );
  },
  'POST /api/export/dashboards/:id': async () => {
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/export/dashboards/${at[place].dashboard}`,
        (who) => opens(who, place),
        undefined,
        { method: 'POST', payload: {} },
      );
  },
  // Into their own workspace, for a target they may write (AC-356, AC-277).
  [`POST ${IMPORTS}/review`]: async () => {
    for (const place of PLACES)
      await openedOnlyBy(`${IMPORTS}/review`, (who) => writes(who, place), undefined, {
        method: 'POST',
        payload: {
          file: exportOf(`${MARK} reviewed`, []),
          targetFolderId: at[place].folder,
        },
      });
  },
  [`POST ${IMPORTS}`]: async () => {
    for (const place of PLACES)
      await openedOnlyBy(IMPORTS, (who) => writes(who, place), undefined, {
        method: 'POST',
        payload: {
          file: exportOf(`${MARK} imported`, []),
          targetFolderId: at[place].folder,
          dataSources: [],
        },
      });
    /**
     * An image the importer may not open lands on no tile of theirs: the
     * file names /C's image, which `writer` may not see, beside /A/B's, which
     * they may (T408's review).
     */
    const imported = await ask('writer', {
      method: 'POST',
      url: IMPORTS,
      payload: {
        file: exportOf(`${MARK} imported with images`, [at.C.image, at.AB.image]),
        targetFolderId: at.AB.folder,
        dataSources: [],
      },
    });
    expect(imported.statusCode, imported.body).toBe(201);
    const landedId = imported.json<{ dashboard: { id: string } }>().dashboard.id;
    made.push({ kind: 'dashboard', id: landedId });
    const landed = await docs().get('dashboard', landedId);
    expect(JSON.stringify(landed?.body)).not.toContain(at.C.image);
    expect(JSON.stringify(landed?.body)).toContain(at.AB.image);
    // Nor through it.
    await openedOnlyBy(
      `/api/images/${at.C.image}?for=dashboard:${landed!.id}`,
      (who) => opens(who, 'C'),
      `${MARK} image in C`,
    );
  },

  // Copies into My workspace: of what they may open, by one who has one (AC-277).
  // Each asked as the browser asks it, with its time zone (T523); refused, it makes no folder.
  'POST /api/workspace/copies': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !opens(each, place) || !hasWorkspace(each)))
        refused(
          await ask(who, {
            method: 'POST',
            url: '/api/workspace/copies',
            payload: { kind: 'dashboard', id: at[place].dashboard, timeZone: 'UTC' },
          }),
          `${who} copying from ${place}`,
        );
  },
  // A workspace's dashboards, wherever in it (T523): each user's own alone.
  'GET /api/workspace/dashboards': listed(
    { method: 'GET', url: '/api/workspace/dashboards' },
    (who) => (who === 'writer' || who === 'manager' ? [ws[who].dashboard] : []),
  ),
  /**
   * Clearing My workspace (T522, AC-367): asked first, what a clear would
   * take, theirs alone; refused to one with no workspace. Cleared here only
   * by `super`, whose workspace holds nothing the other cases need: the
   * workspaces of `writer` and `manager` are as they were.
   */
  'GET /api/workspace/clear': async () => {
    for (const who of WHO) {
      const response = await ask(who, { method: 'GET', url: '/api/workspace/clear' });
      const where = `${who} asking what clearing takes`;
      if (!hasWorkspace(who)) refused(response, where);
      else {
        answered(response, where);
        if (who === 'writer' || who === 'manager')
          expect(response.body, where).toContain(ws[who].proposal);
      }
    }
  },
  'POST /api/workspace/clear': async () => {
    for (const who of WHO.filter((each) => !hasWorkspace(each) || each === 'super')) {
      const response = await ask(who, { method: 'POST', url: '/api/workspace/clear' });
      const where = `${who} clearing`;
      if (hasWorkspace(who)) answered(response, where);
      else refused(response, where);
    }
    for (const [owner] of OWNERS)
      expect(await docs().get('dashboard', ws[owner].dashboard), `${owner}'s kept`).not.toBeNull();
  },

  // Proposals and reviews: the author's, and those who may decide them (AC-287).
  // An item's latest proposal, for the band on its author's item (T353): theirs alone.
  'GET /api/proposals': async () => {
    for (const [owner] of OWNERS)
      await openedOnlyBy(
        `/api/proposals?kind=dashboard&itemId=${ws[owner].proposed}`,
        (who) => who === owner,
        ws[owner].proposal,
      );
  },
  // To review: what they may decide (T351).
  'GET /api/reviews': listed({ method: 'GET', url: '/api/reviews' }, (who) =>
    OWNERS.filter(([, target]) => who === 'super' || writes(who, target)).map(
      ([owner]) => ws[owner].proposal,
    ),
  ),
  // The count counts what "To review" lists them, never one they may not decide (AC-268's "counts").
  'GET /api/reviews/count': async () => {
    for (const who of WHO) {
      const counted = await ask(who, { method: 'GET', url: '/api/reviews/count' });
      const listing = await ask(who, { method: 'GET', url: '/api/reviews' });
      answered(counted, `${who} counting reviews`);
      expect(counted.json<{ waiting: number }>().waiting, `${who}'s count`).toBe(
        listing.json<{ toReview: unknown[] }>().toReview.length,
      );
      if (who === 'nobody') expect(counted.json<{ waiting: number }>().waiting).toBe(0);
    }
  },
  'GET /api/proposals/:id': async () => {
    for (const [owner, target] of OWNERS)
      await openedOnlyBy(
        `/api/proposals/${ws[owner].proposal}`,
        (who) => who === owner || who === 'super' || writes(who, target),
      );
  },
  'POST /api/proposals': () => othersProposing('/api/proposals'),
  'POST /api/proposals/check': () => othersProposing('/api/proposals/check'),
  'POST /api/proposals/:id/approve': () => decided('approve'),
  'POST /api/proposals/:id/reject': () => decided('reject'),
  'POST /api/proposals/:id/dismiss': () => decided('dismiss'),

  // Data sources: where every kind is theirs (AC-263), changed where they write.
  'GET /api/data-sources': listed({ method: 'GET', url: '/api/data-sources' }, (who) =>
    inPlaces(who, writes, (place) => at[place].source),
  ),
  'GET /api/data-sources/sealing-key': everyone({
    method: 'GET',
    url: '/api/data-sources/sealing-key',
  }),
  'GET /api/data-sources/:id': async () => {
    for (const place of PLACES)
      await openedOnlyBy(
        `/api/data-sources/${at[place].source}`,
        (who) => seesAll(who, place),
        at[place].sourceName,
      );
  },
  'GET /api/data-sources/:id/cube-state': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !seesAll(each, place)))
        refused(
          await ask(who, {
            method: 'GET',
            url: `/api/data-sources/${at[place].source}/cube-state`,
          }),
          `${who} reading the Cube state of ${place}'s`,
        );
  },
  'GET /api/data-sources/:id/tests': async () => {
    for (const place of PLACES)
      await openedOnlyBy(`/api/data-sources/${at[place].source}/tests`, (who) =>
        seesAll(who, place),
      );
  },
  'POST /api/data-sources/:id/test': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !seesAll(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: `/api/data-sources/${at[place].source}/test`,
            payload: {},
          }),
          `${who} testing ${place}'s`,
        );
  },
  'POST /api/data-sources/test': everyone({
    method: 'POST',
    url: '/api/data-sources/test',
    payload: {
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      sealed: { password: sealed('tested') },
    },
  }),
  'POST /api/data-sources': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: '/api/data-sources',
            payload: { ...postgres(at[place].folder, `${mark}_made`), testId: randomUUID() },
          }),
          `${who} making a data source in ${place}`,
        );
  },
  'PUT /api/data-sources/:id': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'PUT',
            url: `/api/data-sources/${at[place].source}`,
            payload: { description: `${MARK} changed` },
          }),
          `${who} changing ${place}'s data source`,
        );
  },
  'POST /api/data-sources/:id/copy': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !seesAll(each, place) || !hasWorkspace(each)))
        refused(
          await ask(who, {
            method: 'POST',
            url: `/api/data-sources/${at[place].source}/copy`,
            payload: { timeZone: 'UTC' },
          }),
          `${who} copying ${place}'s data source`,
        );
  },
  // What its delete would be refused for (T526, AC-364): asked where they may delete it.
  'GET /api/data-sources/:id/dependents': async () => {
    for (const place of PLACES)
      await openedOnlyBy(`/api/data-sources/${at[place].source}/dependents`, (who) =>
        writes(who, place),
      );
  },
  // The SQL runner's switch: a Super-Admin's alone (T531, AC-374).
  'PUT /api/data-sources/:id/sql-runner': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => each !== 'super'))
        refused(
          await ask(who, {
            method: 'PUT',
            url: `/api/data-sources/${at[place].source}/sql-runner`,
            payload: { on: true, readOnlyConfirmed: true },
          }),
          `${who} switching ${place}'s SQL runner`,
        );
  },
  // SQL run on a data source (T532, AC-373): nobody while its runner is off;
  // once on, Super-Admins and its own folder's read-write members alone.
  'POST /api/data-sources/:id/sql': async () => {
    const switches = sqlRunnerSwitches(getDb());
    const asked = { method: 'POST' as const, payload: { sql: 'SELECT 1' } };
    for (const place of PLACES) {
      const url = `/api/data-sources/${at[place].source}/sql`;
      for (const who of WHO)
        refused(await ask(who, { ...asked, url }), `${who} running SQL on ${place}'s, off`);
      await switches.on(at[place].source, { key: 'super', name: 'Super' });
      try {
        await openedOnlyBy(url, (who) => writes(who, place), undefined, asked);
      } finally {
        await switches.off(at[place].source);
      }
    }
  },
  // A data source's catalog beside the SQL editor (T539, AC-386): as running
  // SQL is, nobody's while off, and then its own folder's writers' alone.
  'GET /api/data-sources/:id/catalog/schemas': () => sqlCatalog('schemas'),
  'GET /api/data-sources/:id/catalog/tables': () => sqlCatalog('tables?schema=public'),
  'POST /api/data-sources/:id/catalog/columns': () => sqlCatalog('columns', 'POST'),
  // Cube Store (T536, AC-384, AC-374; design 15's Q7): while off, only a
  // Super-Admin is told of it and nobody runs SQL on it; once on, Super-Admins
  // and the writers of a folder whose data source is switched on. Its switch
  // is a Super-Admin's.
  'GET /api/cube-store': () => cubeStoreCase({ method: 'GET', url: '/api/cube-store' }, false),
  'POST /api/cube-store/sql': () =>
    cubeStoreCase(
      { method: 'POST', url: '/api/cube-store/sql', payload: { sql: `SELECT '${MARK}'` } },
      true,
    ),
  'PUT /api/cube-store/sql-runner': () =>
    openedOnlyBy('/api/cube-store/sql-runner', (who) => who === 'super', undefined, {
      method: 'PUT',
      payload: { on: false },
    }),
  // A user's own run going, and its cancel (T533, AC-379): anyone's own,
  // never another's. None goes here, so each says so.
  'GET /api/sql-runs/going': async () => {
    for (const who of WHO) {
      const answer = await ask(who, { method: 'GET', url: '/api/sql-runs/going' });
      answered(answer, `${who} asking for their run going`);
      expect(answer.json(), who).toEqual({ going: null });
    }
  },
  // A user's own past runs (T534, AC-381): theirs alone. The runs the case
  // above made are each listed to its own runner, and to nobody else.
  'GET /api/sql-runs': async () => {
    for (const who of WHO) {
      const answer = await ask(who, { method: 'GET', url: '/api/sql-runs' });
      answered(answer, `${who} listing their runs`);
      const runs = answer.json<{ runs: { dataSource: { id: string } | null }[] }>().runs;
      // Of this world's data sources, theirs alone: the places they write,
      // where the run case ran theirs, and not another's. Other suites' runs
      // by the same test users are theirs too.
      for (const place of PLACES)
        expect(
          runs.some((run) => run.dataSource?.id === at[place].source),
          `${who}'s runs on ${place}'s`,
        ).toBe(writes(who, place));
    }
  },
  'POST /api/sql-runs/cancel': async () => {
    for (const who of WHO)
      refused(
        await ask(who, { method: 'POST', url: '/api/sql-runs/cancel' }),
        `${who} cancelling a run they don't have`,
      );
  },
  'DELETE /api/data-sources/:id': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place))) {
        refused(
          await ask(who, { method: 'DELETE', url: `/api/data-sources/${at[place].source}` }),
          `${who} deleting ${place}'s data source`,
        );
        expect(await sources().get(at[place].source)).toBeDefined();
      }
  },

  // A data source's catalog through Cube: only of one they may see (AC-263).
  'GET /api/introspection/sources': async () => {
    for (const who of WHO) {
      const response = await ask(who, { method: 'GET', url: '/api/introspection/sources' });
      const listed_ = (
        response.statusCode === 200
          ? response.json<{ dataSources: { dataSource: string }[] }>().dataSources
          : []
      ).map((each) => each.dataSource);
      for (const place of PLACES)
        expect(listed_.includes(connectionOf(place)), `${who} lists ${place}'s`).toBe(
          seesAll(who, place),
        );
      // Cube's own `default` is the root's; a name wechart doesn't know, a Super-Admin's.
      expect(listed_.includes('default'), `${who} lists default`).toBe(seesAll(who, 'root'));
      expect(listed_.includes(UNKNOWN_SOURCE), `${who} lists the unknown`).toBe(who === 'super');
    }
  },
  'GET /api/introspection/sources/:source/schemas': () =>
    catalogOf((source) => `/api/introspection/sources/${encodeURIComponent(source)}/schemas`),
  'GET /api/introspection/sources/:source/tables': () =>
    catalogOf(
      (source) => `/api/introspection/sources/${encodeURIComponent(source)}/tables?schema=public`,
    ),
  'POST /api/introspection/sources/:source/columns': () =>
    catalogOf(
      (source) => `/api/introspection/sources/${encodeURIComponent(source)}/columns`,
      'POST',
    ),
  'POST /api/introspection/sources/:source/scaffold': () =>
    catalogOf(
      (source) => `/api/introspection/sources/${encodeURIComponent(source)}/scaffold`,
      'POST',
    ),

  // Models: a folder's files where every kind is theirs; published and deleted where they write.
  'GET /api/model/files': async () => {
    for (const place of PLACES)
      for (const who of WHO) {
        const response = await ask(who, {
          method: 'GET',
          url: `/api/model/files?folder=${at[place].folder}`,
        });
        const where = `${who} reading ${place}'s model files`;
        if (seesAll(who, place))
          expect(response.body, where).toContain(`${MARK} model in ${place}`);
        else if (!opens(who, place) && place !== 'root') refused(response, where);
      }
  },
  'POST /api/model/publish': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: '/api/model/publish',
            payload: {
              folderId: at[place].folder,
              files: [{ path: at[place].model, content: modelOf(place) }],
            },
          }),
          `${who} publishing in ${place}`,
        );
  },
  'DELETE /api/model/files': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'DELETE',
            url: `/api/model/files?folder=${at[place].folder}&path=${encodeURIComponent(at[place].model)}`,
          }),
          `${who} deleting ${place}'s model`,
        );
  },
  // What its delete would be refused for (T526, AC-365): asked as its delete is.
  'GET /api/model/files/dependents': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'GET',
            url: `/api/model/files/dependents?folder=${at[place].folder}&path=${encodeURIComponent(at[place].model)}`,
          }),
          `${who} asking what ${place}'s model is used by`,
        );
  },
  /**
   * What uses a member of the root's cube, as the model editor asks before a
   * save (T147): named where they may see it, only counted where not. The
   * shared chart is shown on /A/B's dashboard and /C's.
   */
  'POST /api/model/references': listed(
    {
      method: 'POST',
      url: '/api/model/references',
      payload: { members: [`${fullName('root')}.count`] },
    },
    // Through the shared chart, where they see it as the root's library chart.
    (who) =>
      seesAll(who, 'root')
        ? [
            at.root.libraryChart,
            ...SHOWN_ON.filter((place) => opens(who, place)).map((place) => at[place].dashboard),
          ]
        : [],
  ),

  // Jobs and Schedules: a read-write member's own folders, a Super-Admin's all (T371).
  'GET /api/jobs/queries': listed({ method: 'GET', url: '/api/jobs/queries' }, (who) =>
    OWNERS.filter(([owner]) => owner === who || who === 'super').map(
      ([owner]) => ws[owner].requestId,
    ),
  ),
  'GET /api/jobs/queries/page': listed({ method: 'GET', url: '/api/jobs/queries/page' }, (who) =>
    OWNERS.filter(([owner]) => owner === who || who === 'super').map(
      ([owner]) => ws[owner].requestId,
    ),
  ),
  // A tile's own queries found in the log by their ids (T180): only the asker's own.
  'POST /api/jobs/queries/find': listed(
    {
      method: 'POST',
      url: '/api/jobs/queries/find',
      payload: { requestIds: [`${MARK}-request-writer`, `${MARK}-request-manager`] },
    },
    (who) =>
      OWNERS.filter(([owner]) => owner === who || who === 'super').map(
        ([owner]) => ws[owner].requestId,
      ),
  ),
  'GET /api/preaggregations': listed({ method: 'GET', url: '/api/preaggregations' }, (who) =>
    inPlaces(who, writes, rollupOf),
  ),
  'POST /api/builds': async () => {
    for (const place of PLACES)
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(
          await ask(who, {
            method: 'POST',
            url: '/api/builds',
            payload: { preAggregation: `${fullName(place)}.${rollupOf(place)}` },
          }),
          `${who} building in ${place}`,
        );
  },
  // Every place's build asked after: each state only of a folder they may build in (T371).
  'POST /api/builds/status': listed(
    {
      method: 'POST',
      url: '/api/builds/status',
      payload: { tokens: PLACES.map(tokenOf) },
    },
    (who) => inPlaces(who, writes, tokenOf),
  ),
  // Schedules: a read-write member's own folders' rollups.
  'GET /api/schedules': listed({ method: 'GET', url: '/api/schedules' }, (who) =>
    inPlaces(who, writes, rollupOf),
  ),
  // And a dashboard's Data as of: every folder they may see, freshness alone (R40, R42.7).
  'GET /api/schedules?seen=1': listed({ method: 'GET', url: '/api/schedules?seen=1' }, (who) =>
    inPlaces(who, opens, rollupOf),
  ),

  // Access: a folder's groups to those who may change them; previews and the trail, Super-Admins'.
  'GET /api/folders/:folderId/access': async () => {
    for (const place of PLACES)
      if (place !== 'root')
        await openedOnlyBy(
          `/api/folders/${at[place].folder}/access`,
          (who) => writes(who, place),
          groupOf(place),
        );
  },
  'PUT /api/folders/:folderId/access': async () => {
    for (const place of PLACES)
      if (place !== 'root')
        for (const who of WHO.filter((each) => !writes(each, place)))
          refused(
            await ask(who, {
              method: 'PUT',
              url: `/api/folders/${at[place].folder}/access`,
              payload: { readOnly: ['nobody-at-all'], readWrite: null },
            }),
            `${who} setting ${place}'s groups`,
          );
  },
  // The groups set on folders they may see, for one who may set some (rule 64).
  'GET /api/access/known-groups': listed(
    { method: 'GET', url: '/api/access/known-groups' },
    (who) =>
      hasWorkspace(who)
        ? inPlaces(who, (each, place) => place !== 'root' && opens(each, place), groupOf)
        : [],
  ),
  'GET /api/access/reach': () =>
    openedOnlyBy('/api/access/reach?groups=managers', (who) => who === 'super'),
  'GET /api/audit': () => openedOnlyBy('/api/audit', (who) => who === 'super'),
  'GET /api/audit/people': () => openedOnlyBy('/api/audit/people', (who) => who === 'super'),
};

/** A place's dashboard and library chart, and its folder outside the root. */
const itemsIn = (place: Place) =>
  [
    ['dashboard', at[place].dashboard],
    ['chart', at[place].libraryChart],
    ...(place === 'root' ? [] : [['folder', at[place].folder]]),
  ] as ['folder' | 'dashboard' | 'chart', string][];

/**
 * A change asked of each user, one that leaves the item as it was: made by
 * those who may make it, and refused to everyone else, who change nothing.
 */
async function changedOnlyBy(
  kind: 'folder' | 'dashboard' | 'chart',
  id: string,
  may: (who: Who) => boolean,
  request: (stored: StoredDocument) => InjectOptions,
  /** How those who may change it are answered: made, unless a case says otherwise. */
  whenMay: (response: LightMyRequestResponse, where: string) => void = answered,
) {
  for (const who of WHO) {
    const before = (await docs().get(kind, id))!;
    const options = request(before);
    const response = await ask(who, options);
    const where = `${who} ${String(options.method)} ${String(options.url)}`;
    if (may(who)) whenMay(response, where);
    else {
      refused(response, where);
      expect((await docs().get(kind, id))?.version, `${where} changed it`).toBe(before.version);
    }
  }
}

/** A query for each place's dashboard: refused before Cube to those who may not open it (T340). */
async function queries(url: string) {
  for (const place of PLACES)
    for (const who of WHO) {
      const asked = cubeAsked.length;
      const response = await ask(who, { method: 'POST', url, payload: queryFor(place) });
      if (!opens(who, place)) {
        refused(response, `${who} ${url} in ${place}`);
        expect(cubeAsked.length, `${who} ${url} in ${place} reached Cube`).toBe(asked);
      } else answered(response, `${who} ${url} in ${place}`);
    }
}

/** Another's workspace item, proposed: as one that isn't there. */
async function othersProposing(url: string) {
  for (const [owner] of OWNERS)
    for (const who of WHO.filter((each) => each !== owner))
      refused(
        await ask(who, {
          method: 'POST',
          url,
          payload: { kind: 'dashboard', id: ws[owner].dashboard },
        }),
        `${who} proposing ${owner}'s`,
      );
}

/** A proposal decided by each user who may not decide it: refused, and still open. */
async function decided(how: 'approve' | 'reject' | 'dismiss') {
  for (const [owner, target] of OWNERS)
    for (const who of WHO.filter(
      (each) => each !== owner && each !== 'super' && !writes(each, target),
    )) {
      refused(
        await ask(who, {
          method: 'POST',
          url: `/api/proposals/${ws[owner].proposal}/${how}`,
          payload: { reason: `${MARK} no` },
        }),
        `${who} deciding ${owner}'s proposal (${how})`,
      );
      expect((await proposalStore(getDb()).get(ws[owner].proposal))?.status).toBe('open');
    }
}

/**
 * A data source's catalog by its id, beside the SQL editor (T539): refused to
 * everyone while its runner is off, and on, to all but its folder's writers,
 * none of those refused reaching Cube.
 */
async function sqlCatalog(what: string, method: 'GET' | 'POST' = 'GET') {
  const switches = sqlRunnerSwitches(getDb());
  const asked = {
    method,
    ...(method === 'POST' ? { payload: { tables: [{ schema: 'public', table: 'orders' }] } } : {}),
  };
  for (const place of PLACES) {
    const url = `/api/data-sources/${at[place].source}/catalog/${what}`;
    const before = cubeAsked.length;
    for (const who of WHO)
      refused(await ask(who, { ...asked, url }), `${who} browsing ${place}'s, off`);
    expect(cubeAsked.length, `${place}'s catalog reached Cube while off`).toBe(before);
    await switches.on(at[place].source, { key: 'super', name: 'Super' });
    try {
      const on = cubeAsked.length;
      for (const who of WHO.filter((each) => !writes(each, place)))
        refused(await ask(who, { ...asked, url }), `${who} browsing ${place}'s, on`);
      expect(cubeAsked.length, `${place}'s catalog reached Cube for one refused`).toBe(on);
      await openedOnlyBy(url, (who) => writes(who, place), undefined, asked);
    } finally {
      await switches.off(at[place].source);
    }
  }
}

/**
 * Cube Store's state or a run on it (T536), as everyone asks it: off, then
 * on with no folder's data source switched on, then with each place's.
 */
async function cubeStoreCase(options: InjectOptions & { url: string }, running: boolean) {
  const switches = sqlRunnerSwitches(getDb());
  await switches.off(CUBE_STORE_TARGET);
  try {
    // Off: a Super-Admin is told so, to find Turn on…; nobody runs SQL on it.
    await openedOnlyBy(options.url, (who) => !running && who === 'super', undefined, options);
    await switches.on(CUBE_STORE_TARGET, { key: 'super', name: 'Super' });
    await openedOnlyBy(options.url, (who) => who === 'super', undefined, options);
    for (const place of PLACES) {
      await switches.on(at[place].source, { key: 'super', name: 'Super' });
      try {
        await openedOnlyBy(
          options.url,
          (who) => who === 'super' || writes(who, place),
          undefined,
          options,
        );
      } finally {
        await switches.off(at[place].source);
      }
    }
  } finally {
    await switches.off(CUBE_STORE_TARGET);
  }
}

/** A data source's catalog through Cube: only of one they may see. */
async function catalogOf(url: (source: string) => string, method: 'GET' | 'POST' = 'GET') {
  const sources_: [string, string, (who: Who) => boolean][] = [
    ...PLACES.map((place): [string, string, (who: Who) => boolean] => [
      place,
      connectionOf(place),
      (who) => seesAll(who, place),
    ]),
    ['default', 'default', (who) => seesAll(who, 'root')],
    ['the unknown', UNKNOWN_SOURCE, (who) => who === 'super'],
  ];
  for (const [name, source, may] of sources_)
    for (const who of WHO) {
      const asked = cubeAsked.length;
      const response = await ask(who, {
        method,
        url: url(source),
        ...(method === 'POST'
          ? { payload: { tables: [{ schema: 'public', table: 'orders' }] } }
          : {}),
      });
      const where = `${who} reading ${name}'s catalog`;
      if (!may(who)) {
        refused(response, where);
        // Refused before the service credential asks Cube anything.
        expect(cubeAsked.length, `${where} reached Cube`).toBe(asked);
      } else answered(response, where);
    }
}

describe('every route, asked as users in and out of each group (T408, AC-268, AC-255, AC-261)', () => {
  it('has a case for every route the server registers, and none for a route it doesn’t', () => {
    const registered = [
      ...new Set(
        routesOf(app)
          // A HEAD answers as its GET, whose case asks it.
          .filter((route) => route.method !== 'HEAD')
          .map((route) => `${route.method} ${route.url}`),
      ),
    ].sort();
    expect(registered.length).toBeGreaterThan(60);
    // A case may ask one of a route's queries on its own (`?seen=1`): it is that route's too.
    const routeOf = (key: string) => key.replace(/\?.*$/, '');
    const covered = new Set(Object.keys(CASES).map(routeOf));
    expect(
      registered.filter((route) => !covered.has(route)),
      'routes with no case',
    ).toEqual([]);
    expect(
      Object.keys(CASES).filter((route) => !registered.includes(routeOf(route))),
      'cases for no route',
    ).toEqual([]);
  });

  it.each(Object.keys(CASES))('%s', async (route) => {
    await CASES[route]!();
  });
});
