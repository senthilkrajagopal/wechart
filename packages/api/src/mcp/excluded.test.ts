import { randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { dataSourceStore } from '../repos/data-sources';
import { documents, type DocumentKind } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { mcpPageStore } from '../repos/mcp-pages';
import { modelFileStore } from '../repos/model-files';
import { proposalStore } from '../repos/proposals';
import { signInStore } from '../repos/sign-ins';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { mcpClient } from './client.fixture';
import { forgetTestCounts, testCounter } from './counter.fixture';
import { mintToken } from './tokenText';

/**
 * T789 (AC-440, AC-441): what MCP never does. For a Super-Admin's token with
 * every scope, `tools/list` holds no tool that approves or rejects a
 * proposal (AC-440); that creates, changes, tests, deletes or copies a data
 * source; makes a subfolder, sets a permission, or renames, moves or deletes
 * a shared item; switches or runs the SQL runner (Cube Store and the "Cube"
 * group included); reads the audit trail; or makes, lists or revokes tokens
 * (AC-441). A `tools/call` naming such a tool is refused; and the tools
 * there are, asked to do any of it for the Super-Admin, who could in the web
 * app, are refused too. No proposal's state, data source, folder, SQL runner
 * switch or token changes.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `ex${randomUUID().replaceAll('-', '').slice(0, 8)}`;

const docs = () => documents(getDb());
const made: { kind: DocumentKind; id: string }[] = [];
const ids = { shared: '', board: '', proposal: '', superFolder: '' };
let app: FastifyInstance;
let superKey = '';
let token = '';
let tokenId = '';
let superCookie = '';

/**
 * Every tool `tools/list` gives, and that each stays out of what AC-440 and
 * AC-441 name: a tool added to MCP must be added here, and to the checks
 * below if it could reach any of it.
 */
const SERVED = [
  'list_folders',
  'list_folder_items',
  'read_dashboard',
  'read_chart',
  'read_cube',
  'read_view',
  'read_data_source',
  'query',
  'next_page',
  'edit_in_my_workspace',
  'create_item',
  'change_item',
  'delete_item',
  'save_model_file',
  'delete_model_file',
  'propose',
  'withdraw_proposal',
  'list_my_proposals',
  'list_jobs',
  'list_schedules',
  'run_schedule_now',
  'cancel_build',
];

/** What no tool's name may say it does (AC-440, AC-441). */
const NEVER: readonly [string, RegExp][] = [
  ['approves or rejects', /approve|reject|decide/i],
  [
    'changes a data source',
    /(create|make|add|change|update|edit|test|delete|remove|copy|save).*source/i,
  ],
  ['makes a folder', /(create|make|add|new).*folder/i],
  ['sets a permission', /permission|access|grant|share/i],
  ['renames or moves', /rename|move/i],
  ['the SQL runner', /sql|cube_?store|runner/i],
  ['the audit trail', /audit|trail/i],
  ['tokens', /token/i],
];

/** Tools a client might name, none of which is served. */
const UNSERVED = [
  'approve_proposal',
  'reject_proposal',
  'decide_proposal',
  'create_data_source',
  'change_data_source',
  'test_data_source',
  'delete_data_source',
  'copy_data_source',
  'create_folder',
  'set_permissions',
  'set_folder_access',
  'rename_item',
  'move_item',
  'run_sql',
  'run_cube_store_sql',
  'switch_sql_runner',
  'read_audit_trail',
  'list_tokens',
  'create_token',
  'revoke_token',
];

/** A fingerprint of each table AC-440 and AC-441 keep MCP out of. */
async function state(): Promise<Record<string, string>> {
  const db = getDb();
  const of = async (query: ReturnType<typeof sql<{ hash: string | null }>>) =>
    (await query.execute(db)).rows[0]?.hash ?? '';
  return {
    proposals: await of(sql`
      SELECT md5(coalesce(string_agg(id::text || status || coalesce(decided_at::text, ''), ',' ORDER BY id), '')) AS hash
      FROM proposals`),
    dataSources: await of(
      sql`SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')) AS hash FROM data_sources t`,
    ),
    folders: await of(sql`
      SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')) AS hash
      FROM documents t WHERE kind = 'folder'`),
    shared: await of(sql`
      SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), '')) AS hash
      FROM documents t WHERE folder_id = ${ids.shared}`),
    switches: await of(sql`
      SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t::text), '')) AS hash
      FROM sql_runner_switches t`),
    sqlRuns: await of(sql`SELECT count(*)::text AS hash FROM sql_runs`),
    // A token's last use moves with every call: its name, scopes and revocation don't.
    tokens: await of(sql`
      SELECT md5(coalesce(string_agg(id::text || name || scopes::text || coalesce(revoked_at::text, ''), ',' ORDER BY id), '')) AS hash
      FROM personal_access_tokens`),
  };
}

beforeAll(async () => {
  ids.shared = randomUUID();
  made.push({ kind: 'folder', id: ids.shared });
  await docs().create({
    kind: 'folder',
    id: ids.shared,
    body: {
      owner: 'admin',
      title: `Shared ${MARK}`,
      folderId: 'root',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  ids.board = randomUUID();
  made.push({ kind: 'dashboard', id: ids.board });
  await docs().create({
    kind: 'dashboard',
    id: ids.board,
    body: { owner: 'admin', title: `Board ${MARK}`, folderId: ids.shared },
  });
  ids.proposal = (
    await proposalStore(getDb()).create({
      author: { key: `${MARK}-author`, name: 'Someone Else' },
      targetFolderId: ids.shared,
      description: null,
      items: [
        {
          kind: 'dashboard',
          id: randomUUID(),
          title: `Proposed ${MARK}`,
          version: 1,
          snapshot: { title: `Proposed ${MARK}` },
          landsIn: ids.shared,
          replaces: null,
        },
      ],
    })
  ).id;

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
      mcpHost: HOST,
    },
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    modelFiles: modelFileStore(getDb()),
    dataSources: dataSourceStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
    audit: auditStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
  });
  superCookie = await signIn(app, USERS['super']!);
  superKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['wechart-super-admins']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  const folder = await app.inject({
    method: 'POST',
    url: '/api/documents',
    headers: { cookie: superCookie },
    payload: { kind: 'folder', title: `Work ${MARK}`, folderId: 'mine' },
  });
  expect(folder.statusCode, folder.body).toBe(201);
  ids.superFolder = folder.json<{ id: string }>().id;
  made.push({ kind: 'folder', id: ids.superFolder });
  const { text, digest } = mintToken();
  tokenId = (
    await accessTokenStore(getDb()).create({
      owner: { key: superKey, name: 'Sam Super' },
      name: `${MARK} every scope`,
      scopes: ['read', 'workspace-edit', 'proposals-and-jobs'],
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      digest,
    })
  ).id;
  token = text;
}, 60_000);

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  if (tokenId !== '') {
    await db
      .deleteFrom('audit_records')
      .where(sql<boolean>`details::text like ${`%${tokenId}%`}`)
      .execute();
    await db.deleteFrom('personal_access_tokens').where('id', '=', tokenId).execute();
  }
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.shared).execute();
  await db
    .deleteFrom('audit_records')
    .where('folder_id', 'in', [ids.shared, ids.superFolder])
    .execute();
  await db
    .deleteFrom('documents')
    .where('kind', 'in', ['dashboard', 'chart'])
    .where('folder_id', '=', ids.superFolder)
    .execute();
  for (const { kind, id } of made.reverse()) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  await forgetTestCounts();
  await closeDb();
});

async function withClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await mcpClient(app, HOST, token);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

/** A call refused: an error result, or the SDK's own refusal of a tool it doesn't serve. */
async function refusedCall(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }).catch((error: unknown) => error);
  if (result instanceof Error) return result.message;
  expect((result as { isError?: boolean }).isError, `${name}: ${JSON.stringify(result)}`).toBe(
    true,
  );
  return JSON.stringify((result as { content: unknown }).content);
}

describe('what MCP never offers (T789, AC-440, AC-441)', () => {
  it('lists, for a Super-Admin’s token with every scope, no tool that approves, rejects, touches a data source, a shared folder directly, the SQL runner, the audit trail or tokens', async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      // Exactly what is served: a new tool must be looked at here first.
      expect(names).toEqual(SERVED);
      for (const [what, pattern] of NEVER) {
        // Reading a data source's definition is a read, which AC-437 offers.
        const saying = names.filter((name) => pattern.test(name) && name !== 'read_data_source');
        expect(saying, what).toEqual([]);
      }
    });
  });

  it('refuses a call naming any such tool, and nothing changes', async () => {
    const before = await state();
    await withClient(async (client) => {
      for (const name of UNSERVED) {
        const said = await refusedCall(client, name, {
          proposalId: ids.proposal,
          folderId: ids.shared,
          id: ids.board,
        });
        expect(said, name).toMatch(/not found/i);
      }
    });
    expect(await state()).toEqual(before);
    expect((await proposalStore(getDb()).get(ids.proposal))?.status).toBe('open');
  });

  it('refuses the Super-Admin, through the tools there are, what they could do in the web app: decide a proposal, change a shared folder or a data source', async () => {
    // In the web app, the Super-Admin may reject it and delete the shared dashboard.
    const before = await state();
    const board = await docs().get('dashboard', ids.board);
    await withClient(async (client) => {
      // Not theirs to withdraw: no rejection through MCP (AC-440).
      expect(
        await refusedCall(client, 'withdraw_proposal', { proposalId: ids.proposal }),
      ).toContain('Only your own open proposal is withdrawn');
      // A shared folder's item, changed or deleted, or one made there (AC-441):
      // each refused by MCP's own check, which the routes alone wouldn't make
      // for a Super-Admin (T789's review: by its words, not only as an error).
      const outside = 'only what is in your My workspace is made, changed or deleted';
      expect(
        await refusedCall(client, 'delete_item', { kind: 'dashboard', id: ids.board }),
      ).toContain(outside);
      expect(
        await refusedCall(client, 'change_item', {
          kind: 'dashboard',
          id: ids.board,
          body: { ...board!.body, title: `Renamed ${MARK}`, folderId: ids.shared },
          version: board!.version,
        }),
      ).toContain(outside);
      expect(
        await refusedCall(client, 'create_item', {
          kind: 'dashboard',
          title: `Made ${MARK}`,
          folderId: ids.shared,
          targetFolderId: ids.shared,
        }),
      ).toContain(outside);
      // Their own dashboard moved into the shared folder: a move, refused.
      const own = await client.callTool({
        name: 'create_item',
        arguments: {
          kind: 'dashboard',
          title: `Own ${MARK}`,
          folderId: ids.superFolder,
          targetFolderId: ids.shared,
        },
      });
      expect(own.isError ?? false, JSON.stringify(own.content)).toBe(false);
      const made_ = own.structuredContent as { userData: { item: { id: string } } };
      const ownId = made_.userData.item.id;
      const stored = await docs().get('dashboard', ownId);
      expect(
        await refusedCall(client, 'change_item', {
          kind: 'dashboard',
          id: ownId,
          body: { ...stored!.body, folderId: ids.shared },
          version: stored!.version,
        }),
      ).toContain(outside);
      expect((await docs().get('dashboard', ownId))?.body['folderId']).toBe(ids.superFolder);
      // A shared folder's model file, saved or deleted there: refused before its route is asked.
      expect(
        await refusedCall(client, 'save_model_file', {
          folderId: ids.shared,
          path: `cubes/${MARK}.yml`,
          content: `cubes:\n  - name: ${MARK}\n    sql_table: public.${MARK}\n`,
        }),
      ).toContain(outside);
      expect(
        await refusedCall(client, 'delete_model_file', {
          folderId: ids.shared,
          path: `cubes/${MARK}.yml`,
        }),
      ).toContain(outside);
      // A data source proposed, to land once approved: not a kind the tool takes.
      expect(
        await refusedCall(client, 'propose', { kind: 'data-source', id: randomUUID() }),
      ).toContain('The arguments don’t fit propose');
    });
    expect(await state()).toEqual(before);
    expect(await docs().get('dashboard', ids.board)).toEqual(board);
    const proposal = await proposalStore(getDb()).get(ids.proposal);
    expect([proposal?.status, proposal?.decision]).toEqual(['open', null]);
  });
});
