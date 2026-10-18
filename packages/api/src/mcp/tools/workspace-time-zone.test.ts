import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../../db/client';
import { accessTokenStore } from '../../repos/access-tokens';
import { auditStore } from '../../repos/audit';
import { catalog } from '../../repos/catalog';
import { type DocumentKind, documents } from '../../repos/documents';
import { folderAccessStore } from '../../repos/folder-access';
import { buildServer } from '../../server';
import { mcpClient } from '../client.fixture';
import { forgetTestCounts, testCounter } from '../counter.fixture';
import { USER_DATA } from '../result';

/**
 * T1015 (AC-630, R80-2): `edit_in_my_workspace` names the project folder it
 * makes (`project-YYYY-MM-DD-HHmm`, `[R48-5]`) in the deployment's time zone
 * when the client sends none, and in the client's when it sends one; with
 * no deployment zone set, in UTC. A copy made at 22:30 UTC on 2026-10-18.
 */
const HOST = 'mcp.wechart.example.com';
const MARK = `t1015-${randomUUID().slice(0, 8)}`;
const AT = new Date('2026-10-18T22:30:00Z');

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
  modelDir: '',
  security: 'off' as const,
  mcpHost: HOST,
};

const docs = () => documents(getDb());

function wechart(timeZone?: string) {
  return buildServer({
    config: { ...config, ...(timeZone === undefined ? {} : { timeZone }) },
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    mcpRateLimits: testCounter(),
    now: () => AT,
  });
}
type App = ReturnType<typeof wechart>;

const made: { kind: DocumentKind; id: string }[] = [];
async function make(kind: DocumentKind, body: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  made.push({ kind, id });
  await docs().create({ kind, id, body: { owner: 'admin', ...body } });
  return id;
}

/** A shared dashboard of its own, in a shared folder of its own: each copied once. */
async function sharedDashboard(): Promise<string> {
  const folder = await make('folder', { title: `${MARK} folder`, folderId: 'root' });
  return make('dashboard', { title: `${MARK} dashboard`, folderId: folder });
}

/** A token the single user makes on the Access tokens page's own route, each named apart. */
let tokenCount = 0;
async function tokenOn(app: App): Promise<string> {
  tokenCount += 1;
  const answer = await app.inject({
    method: 'POST',
    url: '/api/account/tokens',
    payload: {
      name: `${MARK} token ${String(tokenCount)}`,
      scopes: ['read', 'workspace-edit'],
      days: 7,
    },
  });
  expect(answer.statusCode, answer.body).toBe(201);
  return answer.json<{ text: string }>().text;
}

const copies: { kind: DocumentKind; id: string }[] = [];

/** The title of the project folder a copy of `id` lands in, through MCP. */
async function projectOfCopy(
  timeZone: string | undefined,
  args: Record<string, unknown>,
): Promise<string> {
  const app = wechart(timeZone);
  try {
    const client = await mcpClient(app, HOST, await tokenOn(app));
    try {
      const result = await client.callTool({ name: 'edit_in_my_workspace', arguments: args });
      expect(result.isError ?? false, JSON.stringify(result.content)).toBe(false);
      const copy = (
        result.structuredContent as {
          [USER_DATA]: { copy: { id: string; folderId: string; created: boolean } };
        }
      )[USER_DATA].copy;
      expect(copy.created).toBe(true);
      copies.push({ kind: 'dashboard', id: copy.id }, { kind: 'folder', id: copy.folderId });
      const project = await docs().get('folder', copy.folderId);
      return project?.body['title'] as string;
    } finally {
      await client.close();
    }
  } finally {
    await app.close();
  }
}

const ids = { berlin: '', sent: '', none: '' };
beforeAll(async () => {
  ids.berlin = await sharedDashboard();
  ids.sent = await sharedDashboard();
  ids.none = await sharedDashboard();
});

afterAll(async () => {
  for (const { kind, id } of [...copies, ...made.reverse()]) {
    const stored = await docs()
      .get(kind, id)
      .catch(() => null);
    if (stored !== null) await docs().remove(kind, id);
  }
  const tokenIds = getDb()
    .selectFrom('personal_access_tokens')
    .select(sql<string>`id::text`.as('id'))
    .where('name', 'like', `${MARK}%`);
  await getDb()
    .deleteFrom('audit_records')
    .where((row) =>
      row.or([
        row('item_id', 'in', tokenIds),
        row(sql<string>`details->'token'->>'id'`, 'in', tokenIds),
      ]),
    )
    .execute();
  await getDb().deleteFrom('personal_access_tokens').where('name', 'like', `${MARK}%`).execute();
  await forgetTestCounts();
  await closeDb();
});

describe('the project folder’s time zone through MCP (T1015, AC-630)', () => {
  it('is the deployment’s when the client sends none', async () => {
    expect(await projectOfCopy('Europe/Berlin', { kind: 'dashboard', id: ids.berlin })).toBe(
      'project-2026-10-19-0030',
    );
  });

  it('is the client’s when it sends one', async () => {
    expect(
      await projectOfCopy('Europe/Berlin', {
        kind: 'dashboard',
        id: ids.sent,
        timeZone: 'America/New_York',
      }),
    ).toBe('project-2026-10-18-1830');
  });

  it('is UTC with no deployment zone set', async () => {
    expect(await projectOfCopy(undefined, { kind: 'dashboard', id: ids.none })).toBe(
      'project-2026-10-18-2230',
    );
  });
});
