import { randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../../auth/sign-in.fixture';
import { closeDb, getDb } from '../../db/client';
import { accessTokenStore, type TokenScope } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { catalog, workspaceIdOf } from '../../repos/catalog';
import { type DocumentKind, documents } from '../../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../../repos/folder-access';
import { mcpPageStore } from '../../repos/mcp-pages';
import { signInStore } from '../../repos/sign-ins';
import { buildServer } from '../../server';
import { challengesFor, mcpClient, mcpClientSeeing } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { USER_DATA, USER_DATA_NOTICE } from '../result';
import { mintToken } from '../tokenText';
import { MCP_TOOLS } from '.';

/**
 * T785 (AC-438, AC-433, AC-469, AC-432): "Edit in my workspace" through
 * MCP. A shared dashboard is copied, with a project folder of its own, into
 * the token owner's My workspace, by the web app's own route, and the
 * shared one is left as it was; asked again, their copy opens. One in a
 * folder they may only read is refused and nothing is made. A token without
 * the workspace-edit scope is answered 403 with `insufficient_scope`, and
 * nothing is made.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `t785${randomUUID().slice(0, 8)}`;

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
let rootBefore: Awaited<ReturnType<ReturnType<typeof docs>['get']>> = null;
let app: FastifyInstance;
let writerKey = '';
const tokenIds: string[] = [];
const tokens: Partial<Record<'edit' | 'readOnly' | 'noRead' | 'noEdit', string>> = {};
const at = { writable: '', readable: '' };

async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

/** A dashboard in a folder writer's group may write, or only read. */
async function dashboardIn(access: 'readWrite' | 'readOnly'): Promise<string> {
  const folder = await make('folder', {
    title: `${MARK} folder ${access}`,
    folderId: 'root',
    access:
      access === 'readWrite'
        ? { readOnly: null, readWrite: ['sales-rw'] }
        : { readOnly: ['sales-rw'], readWrite: [`${MARK.toLowerCase()}-nobody`] },
  });
  return make('dashboard', { title: `${MARK} dashboard ${access}`, folderId: folder });
}

async function tokenFor(scopes: readonly TokenScope[]): Promise<string> {
  const { text, digest } = mintToken();
  tokenIds.push(
    (
      await accessTokenStore(getDb()).create({
        owner: { key: writerKey, name: 'Wren Writer' },
        name: `${MARK} token ${scopes.join('+')}`,
        scopes: [...scopes],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        digest,
      })
    ).id,
  );
  return text;
}

/** Every document in writer's workspace, by kind and id. */
async function inWorkspace(): Promise<string[]> {
  const { rows } = await sql<{ kind: string; id: string }>`
    WITH RECURSIVE beneath(id) AS (
      SELECT ${workspaceIdOf(writerKey)}::text
      UNION SELECT d.id FROM documents d JOIN beneath b ON d.folder_id = b.id WHERE d.kind = 'folder'
    )
    SELECT d.kind, d.id FROM documents d JOIN beneath b ON d.folder_id = b.id ORDER BY d.kind, d.id
  `.execute(getDb());
  return rows.map((row) => `${row.kind}:${row.id}`);
}

beforeAll(async () => {
  rootBefore = await docs().get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs().remove('setting', ROOT_ACCESS_ID);
  at.writable = await dashboardIn('readWrite');
  at.readable = await dashboardIn('readOnly');
  app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
  });
  await signIn(app, USERS['writer']!);
  writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  tokens.edit = await tokenFor(['read', 'workspace-edit']);
  tokens.readOnly = await tokenFor(['read']);
  tokens.noRead = await tokenFor(['workspace-edit']);
  tokens.noEdit = await tokenFor(['read']);
}, 60_000);

/** The copies made here, and their project folders, removed after. */
const copies: { kind: DocumentKind; id: string }[] = [];

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
  for (const { kind, id } of [...copies, ...made.reverse()]) {
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

async function withClient<T>(token: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await mcpClient(app, HOST, token);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

const copy = (client: Client, id: string) =>
  client.callTool({
    name: 'edit_in_my_workspace',
    arguments: { kind: 'dashboard', id, timeZone: 'Europe/London' },
  });

describe('Edit in my workspace through MCP (T785, AC-438, AC-432)', () => {
  it('copies a shared dashboard, with its project folder, into the owner’s workspace, leaving the shared one as it was', async () => {
    const shared = await docs().get('dashboard', at.writable);
    const before = await inWorkspace();
    await withClient(tokens.edit!, async (client) => {
      const result = await copy(client, at.writable);
      expect(result.isError ?? false).toBe(false);
      const answer = result.structuredContent as Record<string, unknown>;
      expect(answer['notice']).toBe(USER_DATA_NOTICE);
      const made_ = (answer[USER_DATA] as { copy: Record<string, unknown> }).copy;
      expect(made_).toMatchObject({ kind: 'dashboard', created: true });
      const id = made_['id'] as string;
      const folderId = made_['folderId'] as string;
      copies.push({ kind: 'dashboard', id }, { kind: 'folder', id: folderId });

      // The copy, in a project folder made with it, in writer's own workspace.
      const project = await docs().get('folder', folderId);
      expect(project?.body['folderId']).toBe(workspaceIdOf(writerKey));
      const theirs = await docs().get('dashboard', id);
      expect(theirs?.body['folderId']).toBe(folderId);
      expect(theirs?.body['title']).toBe(shared?.body['title']);
      expect(await inWorkspace()).toEqual(
        [...before, `dashboard:${id}`, `folder:${folderId}`].sort(),
      );
      // Its only copy anywhere: none put outside their workspace (T785's review).
      expect((await docs().withOrigin('dashboard', at.writable)).map((each) => each.id)).toEqual([
        id,
      ]);

      // The shared one as it was.
      expect(await docs().get('dashboard', at.writable)).toEqual(shared);

      // Asked again, their copy opens: no second one.
      const again = await copy(client, at.writable);
      expect((again.structuredContent as { userData: { copy: unknown } }).userData.copy).toEqual({
        kind: 'dashboard',
        id,
        created: false,
        folderId,
      });
    });
  });

  it('refuses a dashboard in a folder the owner may only read, making nothing', async () => {
    const before = await inWorkspace();
    await withClient(tokens.edit!, async (client) => {
      const refused = await copy(client, at.readable);
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toBeUndefined();
    });
    expect(await inWorkspace()).toEqual(before);
    // Nor anywhere else (T785's review).
    expect(await docs().withOrigin('dashboard', at.readable)).toEqual([]);
  });

  it('copies a model file into a folder of the owner’s workspace it names, as the web app’s dialog does', async () => {
    // Without xcube the route copies no model; the tool sends what the dialog
    // sends, `into` included, and gives the route's refusal (T785's review).
    await withClient(tokens.edit!, async (client) => {
      const refused = await client.callTool({
        name: 'edit_in_my_workspace',
        arguments: { kind: 'model', folderId: 'root', path: `${MARK}/model.yml`, into: 'mine' },
      });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused.content)).toContain('xcube isn’t configured');
    });
  });
});

describe('every tool’s scope, in both eras (T785’s review, AC-433)', () => {
  it('answers a call by a token without its tool’s scope 403 insufficient_scope, for every tool, 2026-07-28 and 2025 alike', async () => {
    // `noEdit` holds read alone, so it lacks proposals-and-jobs too (T787).
    const without = {
      read: tokens.noRead!,
      'workspace-edit': tokens.noEdit!,
      'proposals-and-jobs': tokens.noEdit!,
    } as const;
    for (const era of ['modern', '2025'] as const) {
      for (const tool of MCP_TOOLS) {
        const scope = tool.scope as keyof typeof without;
        const { client, answers } = await mcpClientSeeing(app, HOST, without[scope], era);
        try {
          await expect(
            client.callTool({ name: tool.name, arguments: {} }),
            `${era} ${tool.name}`,
          ).rejects.toThrow();
        } finally {
          await client.close();
        }
        expect(challengesFor(answers.at(-1), tool.scope), `${era} ${tool.name}`).toBe(true);
      }
    }
  });
});

describe('the workspace-edit scope (T785, AC-433, AC-469)', () => {
  it('answers a token without it 403 with insufficient_scope, making nothing, and records the call as refused', async () => {
    const before = await inWorkspace();
    const { client, answers } = await mcpClientSeeing(app, HOST, tokens.readOnly!);
    try {
      await expect(copy(client, at.writable)).rejects.toThrow();
    } finally {
      await client.close();
    }
    const last = answers.at(-1)!;
    expect(last.status).toBe(403);
    const challenge = last.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('scope="workspace-edit"');
    expect(challengesFor(last, 'workspace-edit')).toBe(true);
    expect(await inWorkspace()).toEqual(before);

    const calls = await getDb()
      .selectFrom('audit_records')
      .selectAll()
      .where('event', '=', 'mcp-call')
      .where(sql<boolean>`details->'token'->>'id' = ${tokenIds[1]!}`)
      .execute();
    expect(calls.map((record) => [record.details?.['tool'], record.details?.['outcome']])).toEqual([
      ['edit_in_my_workspace', 'refused'],
    ]);
  });
});
