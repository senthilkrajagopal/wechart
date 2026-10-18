import { randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import { CHART_DOCUMENT_VERSION, type SealedV1 } from '@wechart/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../../auth/sign-in.fixture';
import { ACT_AS_HEADER, asUser } from '../../auth/user';
import { closeDb, getDb } from '../../db/client';
import { accessTokenStore, type TokenScope } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { catalog, workspaceIdOf } from '../../repos/catalog';
import { dataSourceStore } from '../../repos/data-sources';
import { type DocumentKind, documents } from '../../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../../repos/folder-access';
import { modelFileStore } from '../../repos/model-files';
import { signInStore } from '../../repos/sign-ins';
import { buildServer } from '../../server';
import { mcpClient } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { mintToken } from '../tokenText';

/**
 * T782 (AC-437, AC-432, AC-469, AC-478): reading and exploring through MCP,
 * as the token's owner. With sign-in on, `writer` (read-write in `sales-rw`)
 * signs in to the web app, and a token of theirs reads through MCP: each
 * tool's answer is the web app's own route's for them. A folder no group of
 * theirs reaches, and another user's workspace, read as not found. A data
 * source's definition holds no part of its secrets. Each read needs the
 * read scope, and each call is in the audit trail.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `t782${randomUUID().slice(0, 8)}`;
const mark = MARK.toLowerCase();
const OTHER = `${mark}-someone-else`;

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
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
  mcpHost: HOST,
};

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const models: string[] = [];
let rootBefore: Awaited<ReturnType<ReturnType<typeof docs>['get']>> = null;

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

/** Sized as xcube takes an envelope, its text marked so a leak of any part shows. */
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}`).toString('base64url'),
});

/** What one place holds: a dashboard, a library chart, a cube and a view, a data source. */
interface Place {
  readonly folder: string;
  readonly dashboard: string;
  readonly chart: string;
  readonly cube: string;
  readonly view: string;
  readonly source: string;
  readonly sealed: SealedV1;
}
const at: Record<'reached' | 'hidden' | 'other', Place> = {} as never;

async function place(name: keyof typeof at, folder: string): Promise<void> {
  const cube = `${mark}_${name}_orders`;
  const view = `${mark}_${name}_view`;
  const dashboard = await make('dashboard', {
    title: `${MARK} dashboard ${name}`,
    folderId: folder,
  });
  const chart = await make('chart', {
    title: `${MARK} chart ${name}`,
    folderId: folder,
    chart: {
      source: { cube },
      wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
    },
  });
  const path = `${MARK}/model_${name}.yml`;
  models.push(path);
  await modelFileStore(getDb()).seed([
    {
      folderId: folder,
      path,
      content: [
        `# ${MARK} model ${name}`,
        'cubes:',
        `  - name: ${cube}`,
        '    sql_table: public.orders',
        '    measures:',
        '      - name: count',
        '        type: count',
        'views:',
        `  - name: ${view}`,
        '    cubes:',
        `      - join_path: ${cube}`,
        '        includes: "*"',
        '',
      ].join('\n'),
    },
  ]);
  const secret = sealed(`${mark}-${name}`);
  const source = (
    await dataSourceStore(getDb()).create({
      folderId: folder,
      name: `${mark}_source_${name}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      sealed: { password: secret },
    })
  ).id;
  at[name] = { folder, dashboard, chart, cube, view, source, sealed: secret };
}

let app: FastifyInstance;
let cookie = '';
let writerKey = '';
const tokens: Partial<Record<'read' | 'unread', string>> = {};
const tokenIds: string[] = [];

async function tokenFor(scopes: readonly TokenScope[]): Promise<string> {
  const { text, digest } = mintToken();
  const made_ = await accessTokenStore(getDb()).create({
    owner: { key: writerKey, name: 'Wren Writer' },
    name: `${MARK} token ${scopes.join('+')}`,
    scopes: [...scopes],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    digest,
  });
  tokenIds.push(made_.id);
  return text;
}

beforeAll(async () => {
  // No grant on the shared root, as the route matrix does: its groups would reach every folder.
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);

  const reached = await make('folder', {
    title: `${MARK} folder writer reaches`,
    folderId: 'root',
    access: { readOnly: null, readWrite: ['sales-rw'] },
  });
  const hidden = await make('folder', {
    title: `${MARK} folder no group of writer's reaches`,
    folderId: 'root',
    access: { readOnly: null, readWrite: [`${mark}-nobody`] },
  });
  await place('reached', reached);
  await place('hidden', hidden);
  await place('other', workspaceIdOf(OTHER));

  app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    mcpRateLimits: testCounter(),
  });
  // Signed in to the web app, so their groups are those of their latest sign-in (T777).
  cookie = await signIn(app, USERS['writer']!);
  // Their key, which the web app never sends: the sign-in just recorded it with their groups.
  writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  tokens.read = await tokenFor(['read']);
  tokens.unread = await tokenFor(['workspace-edit']);
}, 60_000);

afterAll(async () => {
  await app?.close();
  const db = getDb();
  if (tokenIds.length > 0) {
    await db
      .deleteFrom('audit_records')
      .where(sql<boolean>`details::text similar to ${`%(${tokenIds.join('|')})%`}`)
      .execute();
    await db.deleteFrom('personal_access_tokens').where('id', 'in', tokenIds).execute();
  }
  if (models.length > 0) await db.deleteFrom('model_files').where('path', 'in', models).execute();
  await db.deleteFrom('data_sources').where('name', 'like', `${mark}%`).execute();
  for (const { kind, id } of made.reverse()) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  if (rootBefore !== null)
    await docs().create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await forgetTestCounts();
  await closeDb();
});

/** The web app's own answer to `url` for writer, signed in. */
async function web(url: string): Promise<{ status: number; body: unknown }> {
  const answer = await app.inject({ method: 'GET', url, headers: { cookie } });
  return { status: answer.statusCode, body: answer.json<unknown>() };
}

async function withClient<T>(token: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await mcpClient(app, HOST, token);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

const call = (client: Client, name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args });

const READS = [
  ['list_folders', {}],
  ['list_folder_items', { folderId: 'root' }],
  ['read_dashboard', { id: 'x' }],
  ['read_chart', { id: 'x' }],
  ['read_cube', { name: 'x' }],
  ['read_view', { name: 'x' }],
  ['read_data_source', { id: 'x' }],
] as const;

describe('reading and exploring through MCP, as the owner (T782, AC-437, AC-432)', () => {
  it('lists the folders and items writer sees in the web app, and none of a folder or workspace they can’t reach', async () => {
    await withClient(tokens.read!, async (client) => {
      const listed = await call(client, 'list_folders');
      expect(listed.isError ?? false).toBe(false);
      expect(listed.structuredContent).toEqual({
        roots: (await web('/api/folder-roots')).body,
        folders: (await web('/api/folders')).body,
      });
      const folderIds = (listed.structuredContent as { folders: { id: string }[] }).folders.map(
        (folder) => folder.id,
      );
      expect(folderIds).toContain(at.reached.folder);
      expect(folderIds).not.toContain(at.hidden.folder);
      expect(folderIds).not.toContain(workspaceIdOf(OTHER));

      const items = await call(client, 'list_folder_items', { folderId: at.reached.folder });
      expect(items.structuredContent).toEqual({
        items: (await web(`/api/folders/${at.reached.folder}/contents`)).body,
      });
      const ids = (items.structuredContent as { items: { id: string }[] }).items.map(
        (item) => item.id,
      );
      expect(ids).toEqual(expect.arrayContaining([at.reached.dashboard, at.reached.chart]));

      for (const folderId of [at.hidden.folder, workspaceIdOf(OTHER)]) {
        const refused = await call(client, 'list_folder_items', { folderId });
        expect(refused.isError, folderId).toBe(true);
        expect(JSON.stringify(refused.content), folderId).toMatch(/no such folder/i);
        expect(JSON.stringify(refused), folderId).not.toContain(MARK);
      }
    });
  });

  it('reads a dashboard’s, chart’s, cube’s, view’s and data source’s definition as the web app’s routes give them', async () => {
    await withClient(tokens.read!, async (client) => {
      const reached = at.reached;
      expect(
        (await call(client, 'read_dashboard', { id: reached.dashboard })).structuredContent,
      ).toEqual({
        dashboard: (await web(`/api/documents/dashboard/${reached.dashboard}`)).body,
      });
      expect((await call(client, 'read_chart', { id: reached.chart })).structuredContent).toEqual({
        chart: (await web(`/api/documents/chart/${reached.chart}`)).body,
      });
      const files = (
        (await web(`/api/model/files?folder=${reached.folder}`)).body as {
          files: { objects: { kind: string; name: string }[] }[];
        }
      ).files;
      const defining = (kind: string, name: string) =>
        files.filter((file) =>
          file.objects.some((each) => each.kind === kind && each.name === name),
        );
      expect(defining('cube', reached.cube)).toHaveLength(1);
      expect((await call(client, 'read_cube', { name: reached.cube })).structuredContent).toEqual({
        definitions: defining('cube', reached.cube),
      });
      expect((await call(client, 'read_view', { name: reached.view })).structuredContent).toEqual({
        definitions: defining('view', reached.view),
      });
      const source = await call(client, 'read_data_source', { id: reached.source });
      expect(source.structuredContent).toEqual({
        dataSource: (await web(`/api/data-sources/${reached.source}`)).body,
      });
    });
  });

  it('reads nothing of a folder or workspace writer can’t reach: not found', async () => {
    await withClient(tokens.read!, async (client) => {
      for (const where of [at.hidden, at.other]) {
        for (const [tool, args] of [
          ['read_dashboard', { id: where.dashboard }],
          ['read_chart', { id: where.chart }],
          ['read_cube', { name: where.cube }],
          ['read_view', { name: where.view }],
          ['read_data_source', { id: where.source }],
        ] as const) {
          const refused = await call(client, tool, args);
          expect(refused.isError, tool).toBe(true);
          expect(JSON.stringify(refused), tool).not.toContain(MARK);
          expect(JSON.stringify(refused.content), tool).toMatch(/no such|isn’t yours|not found/i);
        }
      }
    });
  });

  it('never returns a data source’s secret, nor any part of one', async () => {
    await withClient(tokens.read!, async (client) => {
      const answer = JSON.stringify(
        await call(client, 'read_data_source', { id: at.reached.source }),
      );
      const { enc, ct } = at.reached.sealed;
      for (const part of [enc, ct, enc.slice(0, 16), ct.slice(0, 16), ct.slice(-16)])
        expect(answer).not.toContain(part);
    });
  });
});

describe('the server’s asks as a caller (T782, AC-432)', () => {
  it('gives a request from outside nothing for a pass it names: no one, or whoever its cookie says', async () => {
    const forged = { [ACT_AS_HEADER]: randomUUID() };
    const nobody = await app.inject({ method: 'GET', url: '/api/folders', headers: forged });
    expect(nobody.statusCode).toBe(401);
    const signedIn = await app.inject({
      method: 'GET',
      url: '/api/folders',
      headers: { ...forged, cookie },
    });
    expect(signedIn.json()).toEqual((await web('/api/folders')).body);
  });

  it('takes a pass once, and never once its ask has ended', async () => {
    const reader = { key: writerKey, name: 'Wren Writer', groups: ['sales-rw'], superAdmin: false };
    const ask = (headers: Record<string, string>) =>
      app.inject({ method: 'GET', url: '/api/folders', headers });
    const kept = await asUser(reader, async (headers) => {
      expect((await ask(headers)).statusCode).toBe(200);
      // Taken by the first request: a second bearing it is no one.
      expect((await ask(headers)).statusCode).toBe(401);
      return headers;
    });
    const unused = await asUser(reader, async (headers) => headers);
    expect((await ask(kept)).statusCode).toBe(401);
    expect((await ask(unused)).statusCode).toBe(401);
  });
});

describe('ids that would name another route (T782’s review)', () => {
  it('refuses an id that isn’t one, and reads no route an id would land on instead', async () => {
    await withClient(tokens.read!, async (client) => {
      for (const [tool, args] of [
        ['read_dashboard', { id: '..' }],
        ['read_data_source', { id: '..' }],
        ['list_folder_items', { folderId: '..' }],
        ['read_chart', { id: 'a/../b' }],
      ] as const) {
        const refused = await call(client, tool, args);
        expect(refused.isError, `${tool} ${JSON.stringify(args)}`).toBe(true);
        expect(JSON.stringify(refused.content)).toContain('don’t fit');
      }
      // A static route beside the data source's: not a data source.
      const sibling = await call(client, 'read_data_source', { id: 'sealing-key' });
      expect(sibling.isError).toBe(true);
      expect(sibling.structuredContent).toBeUndefined();
    });
  });
});

describe('the read scope (T782, AC-469)', () => {
  it('refuses every read tool to a token without the read scope, running nothing', async () => {
    await withClient(tokens.unread!, async (client) => {
      for (const [tool, args] of READS) {
        const refused = await call(client, tool, args);
        expect(refused.isError, tool).toBe(true);
        expect(JSON.stringify(refused.content), tool).toContain('read scope');
        expect(refused.structuredContent, tool).toBeUndefined();
      }
    });
  });
});

describe('each read in the audit trail (T782, AC-478)', () => {
  it('records each read once, with the token’s name and the outcome', async () => {
    const token = await tokenFor(['read']);
    const id = tokenIds.at(-1)!;
    await withClient(token, async (client) => {
      await call(client, 'list_folders');
      await call(client, 'read_dashboard', { id: at.hidden.dashboard });
    });
    const calls = await getDb()
      .selectFrom('audit_records')
      .selectAll()
      .where('event', '=', 'mcp-call')
      .where(sql<boolean>`details->'token'->>'id' = ${id}`)
      .orderBy('at', 'asc')
      .execute();
    expect(calls.map((record) => [record.details?.['tool'], record.details?.['outcome']])).toEqual([
      ['list_folders', 'ok'],
      ['read_dashboard', 'refused'],
    ]);
    expect(calls.map((record) => record.actor_key)).toEqual([writerKey, writerKey]);
    expect(JSON.stringify(calls)).not.toContain(at.hidden.dashboard);
  });
});
