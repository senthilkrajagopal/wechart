import { randomInt, randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { catalog, MY_WORKSPACE_ID } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { buildServer } from '../server';
import { mcpClient } from './client.fixture';
import { forgetTestCounts, testCounter } from './counter.fixture';
import { USER_DATA } from './result';
import { mintToken } from './tokenText';

/**
 * T791 (AC-479): with sign-in off, the single user makes a personal access
 * token on the web app's own route, with no sign-in, and `/mcp` serves it as
 * that user: it lists and reads what the single user sees in the web app,
 * and the trail says the single user did. Every other F41 check applies as
 * with sign-in on: no token, a bad one, a foreign `Host` or `Origin`, and
 * past the token's or the address's limit are refused (401, 403, 429).
 *
 * The server is wired as `main.ts` wires it, sign-in off.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `t791-${randomUUID().slice(0, 8)}`;
const ACCEPT = { accept: 'application/json, text/event-stream' };

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
  modelDir: '',
  security: 'off' as const,
  mcpHost: HOST,
};

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'wechart-tests', version: '1.0.0' },
  },
};

function wechart(limits: { mcpRateLimit?: number; mcpBadTokenLimit?: number } = {}) {
  return buildServer({
    config: { ...config, ...limits },
    documents: documents(getDb()),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    // Its own counts, so these requests from one address share no count with other files (T780).
    mcpRateLimits: testCounter(),
  });
}
type App = ReturnType<typeof wechart>;

/** A token made as the single user does, on the Access tokens page's own route: no sign-in. */
async function madeOnTheWeb(app: App, name: string) {
  const answer = await app.inject({
    method: 'POST',
    url: '/api/account/tokens',
    payload: { name, scopes: ['read'], days: 7 },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ token: { id: string }; text: string }>();
}

const post = (app: App, headers: Record<string, string>, remoteAddress = '127.0.0.1') =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    remoteAddress,
    headers: { host: HOST, ...ACCEPT, ...headers },
    payload: initialize,
  });

/** An IPv4 address no other test sends from. */
const ipv4 = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

let app: App;
let dashboard = '';
beforeAll(async () => {
  app = wechart();
  // The single user's own dashboard, in My workspace.
  dashboard = randomUUID();
  await documents(getDb()).create({
    kind: 'dashboard',
    id: dashboard,
    body: { owner: 'admin', title: `${MARK} dashboard`, folderId: MY_WORKSPACE_ID },
  });
});

afterAll(async () => {
  await app.close();
  await documents(getDb()).remove('dashboard', dashboard);
  const ids = getDb()
    .selectFrom('personal_access_tokens')
    .select(sql<string>`id::text`.as('id'))
    .where('name', 'like', `${MARK}%`);
  await getDb()
    .deleteFrom('audit_records')
    .where((row) =>
      row.or([row('item_id', 'in', ids), row(sql<string>`details->'token'->>'id'`, 'in', ids)]),
    )
    .execute();
  await getDb().deleteFrom('personal_access_tokens').where('name', 'like', `${MARK}%`).execute();
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

const data = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.structuredContent as Record<string, unknown>)[USER_DATA];

const web = async (url: string) => (await app.inject({ method: 'GET', url })).json<unknown>();

describe('personal access tokens and /mcp with sign-in off (T791, AC-479)', () => {
  it('lets the single user make a token, listed as theirs, which /mcp serves as them', async () => {
    const made = await madeOnTheWeb(app, `${MARK} solo`);
    const listed = (await web('/api/account/tokens')) as { tokens: { id: string }[] };
    expect(listed.tokens.map((token) => token.id)).toContain(made.token.id);
    const owner = await getDb()
      .selectFrom('personal_access_tokens')
      .select(['owner_key', 'owner_name'])
      .where('id', '=', made.token.id)
      .executeTakeFirstOrThrow();
    expect(owner).toEqual({ owner_key: 'admin', owner_name: 'admin' });

    await withClient(made.text, async (client) => {
      const tools = (await client.listTools()).tools.map((tool) => tool.name);
      expect(tools).toEqual(expect.arrayContaining(['list_folders', 'read_dashboard']));

      // What the single user sees in the web app, My workspace and their dashboard in it.
      const folders = await client.callTool({ name: 'list_folders', arguments: {} });
      expect(folders.isError ?? false).toBe(false);
      expect(data(folders)).toEqual({
        roots: await web('/api/folder-roots'),
        folders: await web('/api/folders'),
      });
      const items = await client.callTool({
        name: 'list_folder_items',
        arguments: { folderId: MY_WORKSPACE_ID },
      });
      expect(data(items)).toEqual({ items: await web(`/api/folders/${MY_WORKSPACE_ID}/contents`) });
      expect((data(items) as { items: { id: string }[] }).items.map((item) => item.id)).toContain(
        dashboard,
      );
      const read = await client.callTool({ name: 'read_dashboard', arguments: { id: dashboard } });
      expect(data(read)).toEqual({ dashboard: await web(`/api/documents/dashboard/${dashboard}`) });
    });

    // The trail says the single user made the calls, with their token.
    const calls = await getDb()
      .selectFrom('audit_records')
      .select(['actor_key', 'actor_name'])
      .where('event', '=', 'mcp-call')
      .where(sql<string>`details->'token'->>'id'`, '=', made.token.id)
      .execute();
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(new Set(calls.map((call) => `${call.actor_key}/${call.actor_name}`))).toEqual(
      new Set(['admin/admin']),
    );
    // And the token's Last used moved.
    const after = (await web('/api/account/tokens')) as {
      tokens: { id: string; lastUsedAt: string | null }[];
    };
    expect(after.tokens.find((token) => token.id === made.token.id)?.lastUsedAt).not.toBeNull();
  });

  it('refuses no token and a bad one with 401, as with sign-in on, though the web app needs no sign-in', async () => {
    for (const headers of [
      {},
      { authorization: 'Bearer wct_not-a-token' },
      { authorization: `Bearer ${mintToken().text}` },
    ]) {
      const answer = await post(app, headers);
      expect(answer.statusCode, JSON.stringify(headers)).toBe(401);
      expect(answer.headers['www-authenticate'], JSON.stringify(headers)).toMatch(/^Bearer /);
    }
  });

  it('refuses a foreign Host or Origin with 403, even with a working token', async () => {
    const { text } = await madeOnTheWeb(app, `${MARK} hosts`);
    const working = { authorization: `Bearer ${text}` };
    expect((await post(app, working)).statusCode).toBe(200);
    expect((await post(app, { ...working, host: 'wechart.example.com' })).statusCode).toBe(403);
    const foreignOrigin = await post(app, { ...working, origin: 'https://evil.example.com' });
    expect(foreignOrigin.statusCode).toBe(403);
  });

  it('refuses a token past its limit with 429 and Retry-After', async () => {
    const limited = wechart({ mcpRateLimit: 2 });
    try {
      const { text } = await madeOnTheWeb(limited, `${MARK} limited`);
      const working = { authorization: `Bearer ${text}` };
      expect((await post(limited, working)).statusCode).toBe(200);
      expect((await post(limited, working)).statusCode).toBe(200);
      const over = await post(limited, working);
      expect(over.statusCode).toBe(429);
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });

  it('refuses an address past its bad-token limit with 429 and Retry-After', async () => {
    const limited = wechart({ mcpBadTokenLimit: 2 });
    const address = ipv4();
    try {
      expect((await post(limited, {}, address)).statusCode).toBe(401);
      expect((await post(limited, {}, address)).statusCode).toBe(401);
      const over = await post(limited, {}, address);
      expect(over.statusCode).toBe(429);
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await limited.close();
    }
  });
});
