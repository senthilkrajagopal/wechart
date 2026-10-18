import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Client } from '@modelcontextprotocol/client';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../../auth/sign-in.fixture';
import { closeDb, getDb } from '../../db/client';
import { accessTokenStore, type TokenScope } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { catalog } from '../../repos/catalog';
import { documents, type DocumentKind } from '../../repos/documents';
import { folderAccessStore } from '../../repos/folder-access';
import { mcpPageStore } from '../../repos/mcp-pages';
import { modelFileStore } from '../../repos/model-files';
import { type Proposal, proposalStore } from '../../repos/proposals';
import { signInStore } from '../../repos/sign-ins';
import { versionStore } from '../../repos/versions';
import { buildServer } from '../../server';
import { xcubeAdmin, type XcubeAdmin } from '../../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../../xcube/fake';
import { itemsOf } from '../../xcube/items';
import { challengesFor, mcpClient, mcpClientSeeing } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { USER_DATA } from '../result';
import { mintToken } from '../tokenText';

/**
 * T787 (AC-439, AC-442, AC-469): proposals through MCP. The token's owner
 * proposes an item of their My workspace into its target folder, by the web
 * app's own route, so it is the proposal the web app makes from that item,
 * checked as it is (a description of at most 1,000 characters, the publish
 * check's dry run of its models); withdraws their own open proposal, and no
 * one else's, even one they could reject in the web app; and lists their
 * own proposals, each with its state and any rejection reason, and no one
 * else's. Each proposal's audit record says it came through MCP and names
 * the token. A token without proposals-and-jobs is answered 403.
 *
 * `writer` (`sales-rw`) proposes into /Sales; `super` proposes there too,
 * and decides. Against the suite's database and the stub xcube, as
 * `workspace-items.test.ts` sets them up.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `pr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const MODEL = `prm-${MARK}`;
const SEED = `${MARK}_seed`;
const DRAFT = `${MARK}_draft`;
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const TOKEN_NAME = `${MARK} Claude Code`;

let cubeServer: Server;
let stub: ReturnType<typeof fakeXcube>;
let admin: XcubeAdmin;
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const docs = () => documents(getDb());
const files = () => modelFileStore(getDb());
const proposals = () => proposalStore(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { sales: '', sharedBoard: '', mineA: '', mineB: '', theirs: '' };
const tokenIds: string[] = [];
const tokens = { full: '', noProposals: '' };
let writerKey = '';

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });

/** A project folder in `who`'s workspace, made in the web app. */
async function project(who: string): Promise<string> {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: {
      kind: 'folder',
      title: `Work ${MARK} ${randomUUID().slice(0, 6)}`,
      folderId: 'mine',
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind: 'folder', id });
  return id;
}

/** A dashboard in `folderId`, to go to /Sales, made in the web app. */
async function board(who: string, folderId: string, title: string): Promise<string> {
  const answer = await as(who, {
    method: 'POST',
    url: '/api/documents',
    payload: { kind: 'dashboard', title, folderId, targetFolderId: ids.sales },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  const id = answer.json<{ id: string }>().id;
  made.push({ kind: 'dashboard', id });
  return id;
}

async function tokenFor(scopes: readonly TokenScope[], name: string): Promise<string> {
  const { text, digest } = mintToken();
  tokenIds.push(
    (
      await accessTokenStore(getDb()).create({
        owner: { key: writerKey, name: 'Wren Writer' },
        name,
        scopes: [...scopes],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        digest,
      })
    ).id,
  );
  return text;
}

beforeAll(async () => {
  cubeServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
  });
  await new Promise<void>((resolve) => cubeServer.listen(0, '127.0.0.1', resolve));
  const cubeApiUrl = `http://127.0.0.1:${String((cubeServer.address() as AddressInfo).port)}/cubejs-api`;

  ids.sales = randomUUID();
  made.push({ kind: 'folder', id: ids.sales });
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      owner: 'admin',
      title: `Sales ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  ids.sharedBoard = randomUUID();
  made.push({ kind: 'dashboard', id: ids.sharedBoard });
  await docs().create({
    kind: 'dashboard',
    id: ids.sharedBoard,
    body: { owner: 'admin', title: `Shared ${MARK}`, folderId: ids.sales },
  });
  await files().write([{ folderId: ids.sales, path: `cubes/${SEED}.yml`, content: cube(SEED) }]);

  const xids = new Map([
    ['root', 'froot'],
    [ids.sales, 'fsales'],
  ]);
  stub = fakeXcube();
  admin = xcubeAdmin({ cubeApiUrl, model: MODEL, token: FAKE_ADMIN_TOKEN, fetch: stub.fetch });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fsales', parentId: 'froot' },
  ]);
  stub.holdItems(MODEL, itemsOf(await files().all(), xids));
  app = buildServer({
    config: {
      cubeApiUrl,
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
      mcpHost: HOST,
    },
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: files(),
    proposals: proposals(),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
    xcube: admin,
    folders: async () => ({
      ids: xids,
      parents: new Map([...xids.keys()].map((id) => [id, id === 'root' ? null : 'root'])),
    }),
    afterPublish: async (changeset) => {
      if (changeset === undefined) return;
      const base = (await admin.revision()).current?.revision ?? null;
      await admin.applyChangeset({
        baseRevision: base,
        upserts: changeset.upserts,
        deletes: changeset.deletes,
      });
    },
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
  writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  tokens.full = await tokenFor(['read', 'workspace-edit', 'proposals-and-jobs'], TOKEN_NAME);
  tokens.noProposals = await tokenFor(['read', 'workspace-edit'], `${MARK} no proposals`);

  ids.mineA = await project('writer');
  ids.mineB = await project('writer');
  ids.theirs = await project('super');
}, 60_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  if (tokenIds.length > 0) {
    await db
      .deleteFrom('audit_records')
      .where(sql<boolean>`details::text similar to ${`%(${tokenIds.join('|')})%`}`)
      .execute();
    await db.deleteFrom('personal_access_tokens').where('id', 'in', tokenIds).execute();
  }
  const folders = [ids.sales, ids.mineA, ids.mineB, ids.theirs].filter((id) => id !== '');
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await db.deleteFrom('audit_records').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('item_versions').where('folder_id', 'in', folders).execute();
  await db.deleteFrom('model_files').where('folder_id', 'in', folders).execute();
  await db
    .deleteFrom('documents')
    .where('kind', 'in', ['dashboard', 'chart'])
    .where('folder_id', 'in', folders)
    .execute();
  for (const { kind, id } of made.reverse()) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  await forgetTestCounts();
  await closeDb();
  await new Promise<void>((resolve) => cubeServer.close(() => resolve()));
});

async function withClient<T>(work: (client: Client) => Promise<T>, token = tokens.full) {
  const client = await mcpClient(app, HOST, token);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

type Answer = Awaited<ReturnType<Client['callTool']>>;
/** What a tool answered, under its marked field; it must have succeeded. */
function answered(result: Answer, what: string): Record<string, unknown> {
  expect(result.isError ?? false, `${what}: ${JSON.stringify(result.content)}`).toBe(false);
  return (result.structuredContent as Record<string, Record<string, unknown>>)[USER_DATA]!;
}
/** A refusal: an error result, holding no data. */
function refused(result: Answer, what: string): string {
  expect(result.isError, `${what}: ${JSON.stringify(result.content)}`).toBe(true);
  expect(result.structuredContent, what).toBeUndefined();
  return JSON.stringify(result.content);
}

const propose = (client: Client, kind: string, id: string, description?: string) =>
  client.callTool({
    name: 'propose',
    arguments: { kind, id, ...(description === undefined ? {} : { description }) },
  });
const withdraw = (client: Client, proposalId: string) =>
  client.callTool({ name: 'withdraw_proposal', arguments: { proposalId } });

/** A proposal as two made from like items should match: no ids, times or folders of their own. */
function shapeOf(proposal: Proposal | null) {
  expect(proposal).not.toBeNull();
  const { id: _id, itemId: _item, proposedAt: _at, items, ...rest } = proposal!;
  void [_id, _item, _at];
  return {
    ...rest,
    items: items.map(({ id: _itemId, snapshot, ...item }) => {
      void _itemId;
      const { folderId: _folder, ...held } = snapshot;
      void _folder;
      return { ...item, snapshot: held };
    }),
  };
}

const auditOf = (proposalId: string, event: string) =>
  getDb()
    .selectFrom('audit_records')
    .selectAll()
    .where('event', '=', event)
    .where(sql<boolean>`details->>'proposalId' = ${proposalId}`)
    .execute();

describe('proposing through MCP (T787, AC-439, AC-442)', () => {
  it('makes the proposal the web app makes from a like item, with its description, marked in the audit trail as through MCP with the token’s name', async () => {
    const title = `Revenue ${MARK}`;
    const viaWeb = await board('writer', ids.mineA, title);
    const viaMcp = await board('writer', ids.mineB, title);
    // 1,000 characters, counted as the web app counts them: by code point.
    const description = `${'🙂'.repeat(10)}${'d'.repeat(990)}`;
    const salesBefore = await docs().get('dashboard', ids.sharedBoard);

    const web = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: viaWeb, description },
    });
    expect(web.statusCode, web.body).toBe(201);
    const webId = web.json<{ id: string }>().id;

    const mcpId = await withClient(async (client) => {
      // One character over is refused, as the web app refuses it, and nothing is proposed.
      const over = refused(
        await propose(client, 'dashboard', viaMcp, `${description}d`),
        'over 1,000',
      );
      expect(over).toContain('A description is at most 1,000 characters: this one has 1,001.');
      expect(await proposals().openFor('dashboard', viaMcp)).toBeNull();

      const made_ = answered(await propose(client, 'dashboard', viaMcp, description), 'propose');
      const proposal = made_['proposal'] as { id: string; status: string; itemId: string };
      expect(proposal).toMatchObject({ status: 'open', itemId: viaMcp });
      return proposal.id;
    });

    // The same proposal the web app made from the like item.
    expect(shapeOf(await proposals().get(mcpId))).toEqual(shapeOf(await proposals().get(webId)));
    // Nothing landed: /Sales as it was, holding no dashboard of that title (an
    // approval would land one there, under an id of its own), the item still in
    // the workspace (T787's review).
    expect(await docs().get('dashboard', ids.sharedBoard)).toEqual(salesBefore);
    const inSales = await getDb()
      .selectFrom('documents')
      .select('id')
      .where('kind', '=', 'dashboard')
      .where('folder_id', '=', ids.sales)
      .execute();
    expect(inSales.map((each) => each.id)).toEqual([ids.sharedBoard]);
    expect((await docs().get('dashboard', viaMcp))?.body['folderId']).toBe(ids.mineB);

    // Its audit record says it came through MCP and names the token; the web one doesn't.
    const [fromWeb] = await auditOf(webId, 'proposal');
    const [fromMcp] = await auditOf(mcpId, 'proposal');
    expect(fromWeb?.details?.['viaMcp']).toBeUndefined();
    expect(fromWeb?.summary).not.toContain('via');
    expect(fromMcp?.details?.['viaMcp']).toEqual({
      token: { id: tokenIds[0], name: TOKEN_NAME },
    });
    expect(fromMcp?.summary).toBe(`${fromWeb!.summary} · via ${TOKEN_NAME}`);
    expect([fromMcp?.actor_key, fromMcp?.actor_name]).toEqual([writerKey, fromWeb?.actor_name]);
    expect(fromWeb?.actor_key).toBe(writerKey);
  });

  it('is checked by the publish check’s dry run of its models, and refused, proposing nothing, where it breaks (AC-321)', async () => {
    const saved = await as('writer', {
      method: 'POST',
      url: '/api/model/publish',
      payload: {
        folderId: ids.mineA,
        files: [{ path: `cubes/${DRAFT}.yml`, content: cube(DRAFT) }],
        targetFolderId: ids.sales,
      },
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const fileId = (await files().inFolders([ids.mineA])).find(
      (file) => file.path === `cubes/${DRAFT}.yml`,
    )!.id;
    const dryRuns = (from: number) =>
      stub.calls
        .slice(from)
        .filter((call) => call.method === 'POST' && call.path.endsWith('/changesets?dryRun=true'));

    await withClient(async (client) => {
      stub.refuse([{ folderId: 'fsales', name: DRAFT, kind: 'compile', message: 'bad measure' }]);
      try {
        const from = stub.calls.length;
        const why = refused(await propose(client, 'model', fileId), 'breaking');
        expect(why).toContain('1 item would break, so it wasn’t proposed.');
        expect(dryRuns(from)).toHaveLength(1);
      } finally {
        stub.refuse(undefined);
      }
      expect(await proposals().openFor('model', fileId)).toBeNull();

      const from = stub.calls.length;
      const proposal = answered(await propose(client, 'model', fileId), 'model')['proposal'] as {
        id: string;
      };
      expect(dryRuns(from)).toHaveLength(1);
      expect((await proposals().get(proposal.id))?.status).toBe('open');
    });
  });

  it('refuses a shared folder’s item and a data source, proposing nothing', async () => {
    await withClient(async (client) => {
      const shared = refused(await propose(client, 'dashboard', ids.sharedBoard), 'shared');
      expect(shared).toContain('It is in a shared folder');
      expect(await proposals().openFor('dashboard', ids.sharedBoard)).toBeNull();
      // Data sources aren't MCP's (AC-441): the tool takes none.
      const source = refused(await propose(client, 'data-source', randomUUID()), 'data source');
      expect(source).toContain('The arguments don’t fit propose');
    });
  });
});

describe('withdrawing through MCP (T787, AC-439, AC-442)', () => {
  it('withdraws the owner’s open proposal, through MCP in the audit trail, and nothing decided or anyone else’s', async () => {
    const mine = await board('writer', ids.mineA, `Withdrawn ${MARK}`);
    const theirBoard = await board('super', ids.theirs, `Theirs ${MARK}`);
    const theirs = await as('super', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: theirBoard },
    });
    expect(theirs.statusCode, theirs.body).toBe(201);
    const theirId = theirs.json<{ id: string }>().id;
    // In the web app, `writer` may reject it, as a member of /Sales (T787's review).
    const seen = (await as('writer', { method: 'GET', url: `/api/proposals/${theirId}` })).json<{
      mayReject: boolean;
      yours: boolean;
    }>();
    expect([seen.mayReject, seen.yours]).toEqual([true, false]);

    await withClient(async (client) => {
      const proposalId = (
        answered(await propose(client, 'dashboard', mine), 'propose')['proposal'] as { id: string }
      ).id;
      const done = answered(await withdraw(client, proposalId), 'withdraw')['proposal'] as {
        status: string;
      };
      expect(done.status).toBe('withdrawn');
      const stored = await proposals().get(proposalId);
      expect(stored?.status).toBe('withdrawn');
      expect(stored?.decision?.by.key).toBe(writerKey);
      const [record] = await auditOf(proposalId, 'rejection');
      expect(record?.summary).toBe(`Withdrew “Withdrawn ${MARK}” · via ${TOKEN_NAME}`);
      expect(record?.details?.['viaMcp']).toEqual({
        token: { id: tokenIds[0], name: TOKEN_NAME },
      });

      // Decided already: refused, and as it was.
      refused(await withdraw(client, proposalId), 'again');
      expect((await proposals().get(proposalId))?.decision).toEqual(stored?.decision);

      // Another's, which `writer` may reject in the web app as a member of
      // /Sales: refused, and still open, undecided (AC-440).
      const other = refused(await withdraw(client, theirId), 'theirs');
      expect(other).toContain('Only your own open proposal is withdrawn');
      const still = await proposals().get(theirId);
      expect(still?.status).toBe('open');
      expect(still?.decision).toBeNull();

      // One that isn't there.
      refused(await withdraw(client, randomUUID()), 'none');
    });
  });
});

describe('listing through MCP (T787, AC-439)', () => {
  it('lists the owner’s proposals, each with its state and any rejection reason, and none of anyone else’s', async () => {
    const rejectedBoard = await board('writer', ids.mineB, `Rejected ${MARK}`);
    const theirBoard = await board('super', ids.theirs, `Theirs listed ${MARK}`);
    const theirs = await as('super', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: theirBoard },
    });
    expect(theirs.statusCode, theirs.body).toBe(201);
    const theirId = theirs.json<{ id: string }>().id;

    await withClient(async (client) => {
      const proposalId = (
        answered(await propose(client, 'dashboard', rejectedBoard), 'propose')['proposal'] as {
          id: string;
        }
      ).id;
      const rejected = await as('super', {
        method: 'POST',
        url: `/api/proposals/${proposalId}/reject`,
        payload: { reason: `Not yet ${MARK}` },
      });
      expect(rejected.statusCode, rejected.body).toBe(200);

      // Every page of it, by its cursors: the suite's database keeps many (AC-475).
      type Row = {
        id: string;
        status: string;
        author: { key: string };
        decision: { reason: string | null } | null;
      };
      const listed: Row[] = [];
      let result = await client.callTool({ name: 'list_my_proposals', arguments: {} });
      for (let pages = 1; ; pages += 1) {
        listed.push(...(answered(result, `list page ${String(pages)}`)['proposals'] as Row[]));
        const cursor = (result.structuredContent as { page?: { cursor: string | null } }).page
          ?.cursor;
        if (typeof cursor !== 'string') break;
        expect(pages).toBeLessThan(200);
        result = await client.callTool({ name: 'next_page', arguments: { cursor } });
      }
      // Every one theirs, and every one of theirs.
      const own = await proposals().byAuthor(writerKey);
      expect(listed.map((each) => each.id).sort()).toEqual(own.map((each) => each.id).sort());
      expect(listed.every((each) => each.author.key === writerKey)).toBe(true);
      expect(listed.map((each) => each.id)).not.toContain(theirId);
      expect(listed.find((each) => each.id === proposalId)).toMatchObject({
        status: 'rejected',
        decision: { reason: `Not yet ${MARK}` },
      });
      // `writer` may decide super's in the web app, but it is no proposal of theirs.
      const reviews = await as('writer', { method: 'GET', url: '/api/reviews' });
      expect(
        reviews.json<{ toReview: { id: string }[] }>().toReview.map((each) => each.id),
      ).toContain(theirId);
    });
  });
});

describe('the proposals-and-jobs scope (T787, AC-469, AC-433)', () => {
  it('answers a token without it 403 insufficient_scope for every proposal tool, proposing and withdrawing nothing', async () => {
    const item = await board('writer', ids.mineA, `Unscoped ${MARK}`);
    const open = await as('writer', {
      method: 'POST',
      url: '/api/proposals',
      payload: { kind: 'dashboard', id: await board('writer', ids.mineB, `Open ${MARK}`) },
    });
    expect(open.statusCode, open.body).toBe(201);
    const openId = open.json<{ id: string }>().id;
    for (const [name, args] of [
      ['propose', { kind: 'dashboard', id: item }],
      ['withdraw_proposal', { proposalId: openId }],
      ['list_my_proposals', {}],
    ] as const) {
      const { client, answers } = await mcpClientSeeing(app, HOST, tokens.noProposals);
      try {
        await expect(client.callTool({ name, arguments: args }), name).rejects.toThrow();
      } finally {
        await client.close();
      }
      expect(challengesFor(answers.at(-1), 'proposals-and-jobs'), name).toBe(true);
    }
    expect(await proposals().openFor('dashboard', item)).toBeNull();
    expect((await proposals().get(openId))?.status).toBe('open');
  });
});
