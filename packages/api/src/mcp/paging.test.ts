import { randomUUID } from 'node:crypto';

import type { Client } from '@modelcontextprotocol/client';
import { fromJsonSchema } from '@modelcontextprotocol/server';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { documents } from '../repos/documents';
import { folderAccessStore, ROOT_ACCESS_ID } from '../repos/folder-access';
import { mcpPageStore } from '../repos/mcp-pages';
import { signInStore } from '../repos/sign-ins';
import { buildServer } from '../server';
import { mcpClient } from './client.fixture';
import { forgetTestCounts, testCounter } from './counter.fixture';
import {
  CUT_NOTICE,
  LAST_PAGE_NOTICE,
  MAX_CHARS,
  MAX_ROWS,
  NEXT_PAGE,
  pageResult,
  piecesOf,
} from './paging';
import { dataResult, USER_DATA, USER_DATA_NOTICE } from './result';
import type { McpTool } from './server';
import { mcpTools } from './tools';
import { mintToken } from './tokenText';

/**
 * T784 (AC-475): a tool's result past 1,000 rows or 50,000 characters comes
 * back as a page of at most 1,000 rows and fewer than 50,000 characters,
 * saying it was cut and how much is left out, with a cursor that
 * `next_page` takes for the next page; following the cursors gives every
 * row once. Tools of the test's own give the rows, through the same
 * registration as wechart's; a folder listing is wechart's own tool.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `t784p${randomUUID().slice(0, 8)}`;

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

const COUNT = fromJsonSchema<{ count: number; width?: number }>({
  type: 'object',
  properties: { count: { type: 'integer', minimum: 0 }, width: { type: 'integer', minimum: 0 } },
  required: ['count'],
  additionalProperties: false,
});

/** Row `n` of a test result: its number, and text of `width` characters, some needing escapes. */
const rowOf = (n: number, width: number) => ({
  n,
  text: `${n}:${'é"\\\n'.repeat(Math.ceil(width / 4)).slice(0, width)}`,
});

const TEST_TOOLS: McpTool[] = [
  {
    name: 'test_rows',
    description: 'Gives rows, for the test.',
    scope: 'read',
    inputSchema: COUNT,
    rows: 'rows',
    async run(args) {
      const { count, width = 8 } = args as { count: number; width?: number };
      return dataResult({
        heading: `${MARK} heading`,
        rows: Array.from({ length: count }, (_, n) => rowOf(n, width)),
      });
    },
  },
  {
    name: 'test_item',
    description: 'Gives one large item, for the test.',
    scope: 'read',
    inputSchema: COUNT,
    async run(args) {
      const { count } = args as { count: number };
      return dataResult({ item: { text: 'x"'.repeat(count) } });
    },
  },
  {
    name: 'test_odd_rows',
    description: 'Gives rows of text Postgres’s jsonb can’t hold, for the test.',
    scope: 'read',
    inputSchema: COUNT,
    rows: 'rows',
    async run(args) {
      const { count } = args as { count: number };
      return dataResult({ rows: Array.from({ length: count }, (_, n) => oddRowOf(n)) });
    },
  },
  NEXT_PAGE,
];

/** Row `n` of odd text: a NUL, a lone surrogate, and a character outside the BMP (T784's review). */
const oddRowOf = (n: number) => ({ n, text: `${n}\u0000\ud800😀` });

let app: FastifyInstance;
let token = '';
let otherToken = '';
const tokenIds: string[] = [];
const made: string[] = [];
let folder = '';
let rootBefore: Awaited<ReturnType<ReturnType<typeof documents>['get']>> = null;

async function tokenOf(owner: string): Promise<string> {
  const { text, digest } = mintToken();
  tokenIds.push(
    (
      await accessTokenStore(getDb()).create({
        owner: { key: owner, name: 'Wren Writer' },
        name: `${MARK} token ${tokenIds.length}`,
        scopes: ['read'],
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        digest,
      })
    ).id,
  );
  return text;
}

beforeAll(async () => {
  const docs = documents(getDb());
  rootBefore = await docs.get('setting', ROOT_ACCESS_ID);
  if (rootBefore !== null) await docs.remove('setting', ROOT_ACCESS_ID);
  folder = randomUUID();
  made.push(folder);
  await docs.create({
    kind: 'folder',
    id: folder,
    body: {
      title: `${MARK} folder`,
      folderId: 'root',
      owner: 'admin',
      access: { readOnly: null, readWrite: ['sales-rw'] },
    },
  });
  // 1,001 dashboards in it, in one statement.
  const ids = Array.from({ length: MAX_ROWS + 1 }, () => randomUUID());
  made.push(...ids);
  await sql`
    INSERT INTO documents (kind, id, body)
    SELECT 'dashboard', id, jsonb_build_object('title', ${`${MARK} dashboard`}::text, 'folderId', ${folder}::text, 'owner', 'admin')
    FROM unnest(${ids}::text[]) AS id
  `.execute(getDb());

  app = buildServer({
    config,
    sessions: pgSessionStore(getDb()),
    documents: docs,
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    signIns: signInStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpPages: mcpPageStore(getDb()),
    mcpTools: [...mcpTools('UTC'),...TEST_TOOLS.filter((tool) => tool !== NEXT_PAGE)],
  });
  await signIn(app, USERS['writer']!);
  const writerKey = (
    await getDb()
      .selectFrom('latest_sign_ins')
      .select('user_key')
      .where(sql<boolean>`groups = array['sales-rw']::text[]`)
      .orderBy('signed_in_at', 'desc')
      .executeTakeFirstOrThrow()
  ).user_key;
  token = await tokenOf(writerKey);
  otherToken = await tokenOf(writerKey);
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
  if (made.length > 0) await sql`DELETE FROM documents WHERE id = ANY(${made}::text[])`.execute(db);
  if (rootBefore !== null)
    await documents(db).create({ kind: 'setting', id: ROOT_ACCESS_ID, body: rootBefore.body });
  await forgetTestCounts();
  await closeDb();
});

async function withClient<T>(work: (client: Client) => Promise<T>, as = token): Promise<T> {
  const client = await mcpClient(app, HOST, as);
  try {
    return await work(client);
  } finally {
    await client.close();
  }
}

interface Page {
  readonly notice: string;
  readonly page?: {
    readonly says: string;
    readonly number: number;
    readonly of: number;
    readonly leftOut: { readonly rows: number; readonly parts: number };
    readonly cursor: string | null;
  };
  readonly [USER_DATA]: Record<string, unknown>;
}

/** A page's answer, checked within the caps: its structured content, as its text says it. */
function pageOf(result: Awaited<ReturnType<Client['callTool']>>): Page {
  expect(result.isError ?? false).toBe(false);
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  expect(text.length).toBeLessThan(MAX_CHARS);
  expect(JSON.parse(text)).toEqual(result.structuredContent);
  const page = result.structuredContent as unknown as Page;
  expect(page.notice).toBe(USER_DATA_NOTICE);
  // Whatever its rows are called (T784's review).
  for (const value of Object.values(page[USER_DATA]))
    if (Array.isArray(value)) expect(value.length).toBeLessThanOrEqual(MAX_ROWS);
  return page;
}

/** Every page of a call's answer, following its cursors. */
async function allPages(client: Client, name: string, args: Record<string, unknown>) {
  const pages = [pageOf(await client.callTool({ name, arguments: args }))];
  for (let cursor = pages[0]!.page?.cursor; typeof cursor === 'string';) {
    const next = pageOf(await client.callTool({ name: 'next_page', arguments: { cursor } }));
    pages.push(next);
    cursor = next.page?.cursor;
    expect(pages.length).toBeLessThan(100);
  }
  return pages;
}

describe('the pages of an answer (T784, AC-475)', () => {
  it('gives a row too large for a page alone in parts between the rows around it, every page within the caps', () => {
    const big = { n: 1, text: '"'.repeat(70_000) };
    // Row 0's JSON is about 35,000 characters: alone on a page, but not beside the heading.
    const data = { heading: 'h'.repeat(30_000), rows: [rowOf(0, 20_000), big, rowOf(2, 8)] };
    const pieces = piecesOf(data, 'rows');
    const id = randomUUID();
    pieces.forEach((piece, at) => {
      const result = pageResult(piece, at, pieces.length, id);
      const text = (result.content as { text: string }[])[0]!.text;
      expect(text.length, `page ${at}`).toBeLessThan(MAX_CHARS);
    });
    // What isn't a row first, alone; then row 0; then row 1 in parts; then row 2.
    expect(pieces[0]!.userData).toEqual({ heading: data.heading, rows: [] });
    expect(pieces[1]!.userData).toEqual({ rows: [data.rows[0]] });
    const parts = pieces.filter((piece) => 'part' in piece.userData);
    expect(parts.length).toBeGreaterThan(1);
    expect(JSON.parse(parts.map((piece) => piece.userData['part'] as string).join(''))).toEqual(
      big,
    );
    expect(parts.map((piece) => piece.leftOut)).toEqual(
      parts.map((_, at) => ({ rows: 1, parts: parts.length - at - 1 })),
    );
    expect(pieces.at(-1)!.userData).toEqual({ rows: [data.rows[2]] });
    expect(pieces.at(-1)!.leftOut).toEqual({ rows: 0, parts: 0 });
  });
});

describe('the parts of an answer too large for a page (T784’s review)', () => {
  it('never splits a character outside the BMP between parts', () => {
    const data = { text: '😀"'.repeat(40_000) };
    const pieces = piecesOf(data, undefined);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      const part = piece.userData['part'] as string;
      // A lone surrogate, half a split character, can't be URI-encoded.
      expect(() => encodeURIComponent(part)).not.toThrow();
    }
    expect(JSON.parse(pieces.map((piece) => piece.userData['part'] as string).join(''))).toEqual(
      data,
    );
  });
});

describe('paging a tool’s result past 1,000 rows or 50,000 characters (T784, AC-475)', () => {
  it('gives a result within both caps whole, with no page', async () => {
    await withClient(async (client) => {
      const page = pageOf(await client.callTool({ name: 'test_rows', arguments: { count: 3 } }));
      expect(page.page).toBeUndefined();
      expect(page[USER_DATA]['rows']).toHaveLength(3);
    });
  });

  it('cuts 2,500 rows to 1,000, saying so and how many are left out, and gives every row once by its cursors', async () => {
    await withClient(async (client) => {
      const pages = await allPages(client, 'test_rows', { count: 2_500 });
      expect(pages.map((page) => (page[USER_DATA]['rows'] as unknown[]).length)).toEqual([
        1_000, 1_000, 500,
      ]);
      expect(pages.map((page) => page.page?.leftOut.rows)).toEqual([1_500, 500, 0]);
      expect(pages.map((page) => [page.page?.number, page.page?.of])).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
      expect(pages[0]!.page?.says).toBe(CUT_NOTICE);
      expect(pages[2]!.page?.says).toBe(LAST_PAGE_NOTICE);
      expect(pages[2]!.page?.cursor).toBeNull();
      // What isn't a row comes once, on the first page.
      expect(pages.map((page) => page[USER_DATA]['heading'])).toEqual([
        `${MARK} heading`,
        undefined,
        undefined,
      ]);
      const numbers = pages.flatMap((page) =>
        (page[USER_DATA]['rows'] as { n: number }[]).map((row) => row.n),
      );
      expect(numbers).toEqual(Array.from({ length: 2_500 }, (_, n) => n));
    });
  });

  it('cuts rows under 1,000 but over 50,000 characters under 50,000, the same way', async () => {
    await withClient(async (client) => {
      const pages = await allPages(client, 'test_rows', { count: 300, width: 400 });
      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0]!.page?.says).toBe(CUT_NOTICE);
      const rows = pages.flatMap((page) => page[USER_DATA]['rows'] as { n: number }[]);
      expect(rows).toEqual(Array.from({ length: 300 }, (_, n) => rowOf(n, 400)));
      const total = pages.reduce(
        (sum, page) => sum + (page[USER_DATA]['rows'] as unknown[]).length,
        0,
      );
      expect(pages[0]!.page?.leftOut.rows).toBe(
        total - (pages[0]![USER_DATA]['rows'] as unknown[]).length,
      );
    });
  });

  it('gives one item over 50,000 characters in parts, which join to it', async () => {
    await withClient(async (client) => {
      const pages = await allPages(client, 'test_item', { count: 60_000 });
      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0]!.page?.leftOut.parts).toBe(pages.length - 1);
      const joined = pages.map((page) => page[USER_DATA]['part'] as string).join('');
      expect(JSON.parse(joined)).toEqual({ item: { text: 'x"'.repeat(60_000) } });
    });
  });

  it('pages a folder listing longer than 1,000 items', async () => {
    await withClient(async (client) => {
      const pages = await allPages(client, 'list_folder_items', { folderId: folder });
      // Cut by both caps: each item's JSON is long enough that 50,000 characters come first.
      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0]!.page?.leftOut.rows).toBe(
        MAX_ROWS + 1 - (pages[0]![USER_DATA]['items'] as unknown[]).length,
      );
      const items = pages.flatMap((page) => page[USER_DATA]['items'] as { id: string }[]);
      expect(items).toHaveLength(MAX_ROWS + 1);
      expect(new Set(items.map((item) => item.id)).size).toBe(MAX_ROWS + 1);
    });
  });

  it('gives a page to the token whose answer it is alone', async () => {
    const cursor = await withClient(async (client) => {
      const first = pageOf(
        await client.callTool({ name: 'test_rows', arguments: { count: 1_200 } }),
      );
      return first.page!.cursor!;
    });
    await withClient(async (client) => {
      const refused = await client.callTool({ name: 'next_page', arguments: { cursor } });
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toBeUndefined();
    }, otherToken);
  });

  it('gives no page past the last, nor once its hour is over', async () => {
    await withClient(async (client) => {
      const first = pageOf(
        await client.callTool({ name: 'test_rows', arguments: { count: 1_200 } }),
      );
      const cursor = first.page!.cursor!;
      const [id] = cursor.split('.');
      const past = await client.callTool({ name: 'next_page', arguments: { cursor: `${id!}.2` } });
      expect(past.isError).toBe(true);
      expect(past.structuredContent).toBeUndefined();
      pageOf(await client.callTool({ name: 'next_page', arguments: { cursor } }));
      await sql`UPDATE mcp_result_pages SET made_at = now() - interval '61 minutes' WHERE id = ${id!}::uuid`.execute(
        getDb(),
      );
      const expired = await client.callTool({ name: 'next_page', arguments: { cursor } });
      expect(expired.isError).toBe(true);
      expect(expired.structuredContent).toBeUndefined();
    });
  });

  it('keeps and gives pages of text Postgres’s jsonb can’t hold: a NUL, a lone surrogate', async () => {
    await withClient(async (client) => {
      const pages = await allPages(client, 'test_odd_rows', { count: 1_500 });
      expect(pages.length).toBeGreaterThan(1);
      const rows = pages.flatMap((page) => page[USER_DATA]['rows'] as unknown[]);
      expect(rows).toEqual(Array.from({ length: 1_500 }, (_, n) => oddRowOf(n)));
    });
  });
});
