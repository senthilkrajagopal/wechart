import { fromJsonSchema } from '@modelcontextprotocol/server';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { actorOf, recordIn } from '../audit/record';
import { Forbidden } from '../auth/user';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { auditStore } from '../repos/audit';
import { buildServer } from '../server';
import { mcpClient } from './client.fixture';
import { forgetTestCounts, testCounter } from './counter.fixture';
import { USER_DATA, USER_DATA_NOTICE } from './result';
import type { McpTool } from './server';
import { mintToken } from './tokenText';

/**
 * T781 (AC-478, AC-442): every MCP tool call, a read included, leaves one
 * "MCP call" event in the audit trail, with who, the token's name, the tool,
 * the outcome and when, holding none of the call's argument values; and an
 * event of an AC-294 kind recorded while an MCP request is served says it
 * came through MCP and names the token.
 *
 * No tool is served until T782, so the server is given tools of the test's
 * own, registered as every tool is.
 */
const HOST = 'mcp.wechart.example.com';
const NAME = `t781 Claude Code · desktop ${Date.now()}`;
const FILTER = `t781-filter-value-${Date.now()}`;
const TITLE = `t781 a name the caller typed ${Date.now()}`;

const ARGS = fromJsonSchema<{ filter?: string; name?: string }>({
  type: 'object',
  properties: { filter: { type: 'string' }, name: { type: 'string' } },
});

const tools: McpTool[] = [
  {
    name: 'test_read',
    description: 'Reads, for the test.',
    scope: 'read',
    inputSchema: ARGS,
    async run() {
      return { content: [{ type: 'text', text: 'read' }] };
    },
  },
  {
    name: 'test_refused',
    description: 'Refuses, for the test.',
    scope: 'read',
    inputSchema: ARGS,
    async run() {
      throw new Forbidden('You may not do that.');
    },
  },
  {
    name: 'test_fails',
    description: 'Fails, for the test.',
    scope: 'read',
    inputSchema: ARGS,
    async run() {
      throw new Error('a fault of the server’s own');
    },
  },
  {
    name: 'test_propose',
    description: 'Records a proposal, for the test.',
    scope: 'proposals-and-jobs',
    inputSchema: ARGS,
    async run(_args, call) {
      await recordIn(
        auditStore(getDb()),
        {
          actor: actorOf(call.caller),
          event: 'proposal',
          folderId: null,
          item: { kind: 'dashboard', id: `t781-${Date.now()}`, title: 'EMEA top accounts' },
          summary: 'EMEA top accounts → Sales / EMEA',
          details: { marker: NAME },
        },
        { warn: () => undefined } as never,
      );
      return { content: [{ type: 'text', text: 'proposed' }] };
    },
  },
];

let token = { id: '', text: '' };
beforeAll(async () => {
  const { text, digest } = mintToken();
  const made = await accessTokenStore(getDb()).create({
    owner: { key: 'admin', name: 'admin' },
    name: NAME,
    scopes: ['read', 'workspace-edit', 'proposals-and-jobs'],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    digest,
  });
  token = { id: made.id, text };
});

afterAll(async () => {
  await getDb()
    .deleteFrom('audit_records')
    .where(sql<boolean>`details::text like ${`%${token.id}%`}`)
    .execute();
  await getDb().deleteFrom('personal_access_tokens').where('name', '=', NAME).execute();
  await forgetTestCounts();
  await closeDb();
});

function wechart() {
  return buildServer({
    config: {
      cubeApiUrl: 'http://cube.invalid/cubejs-api',
      cubeApiSecret: 'secret',
      securityContext: {},
      port: 0,
      modelDir: '',
      security: 'off',
      mcpHost: HOST,
    },
    accessTokens: accessTokenStore(getDb()),
    audit: auditStore(getDb()),
    mcpRateLimits: testCounter(),
    mcpTools: tools,
  });
}

/** The trail's records the token caused, oldest first. */
const recordsOf = (tokenId: string) =>
  getDb()
    .selectFrom('audit_records')
    .selectAll()
    .where(sql<boolean>`details::text like ${`%${tokenId}%`}`)
    .orderBy('at', 'asc')
    .execute();

describe('every MCP tool call in the audit trail (T781, AC-478)', () => {
  it('records a read, and a refused call, each once, with who, the token, the tool, the outcome and when, and no argument value', async () => {
    const app = wechart();
    const started = new Date();
    try {
      const client = await mcpClient(app, HOST, token.text);
      try {
        const read = await client.callTool({
          name: 'test_read',
          arguments: { filter: FILTER, name: TITLE },
        });
        expect(read.isError ?? false).toBe(false);
        const refused = await client.callTool({
          name: 'test_refused',
          arguments: { filter: FILTER, name: TITLE },
        });
        expect(refused.isError).toBe(true);
        // A refusal's words, which can name what a user wrote, only under the
        // marked field (T783's review, AC-443).
        const said = JSON.parse((refused.content as { text: string }[])[0]!.text) as Record<
          string,
          unknown
        >;
        expect(said[USER_DATA]).toEqual({ reason: 'You may not do that.' });
        expect(said['notice']).toBe(USER_DATA_NOTICE);
      } finally {
        await client.close();
      }
      const calls = (await recordsOf(token.id)).filter((record) => record.event === 'mcp-call');
      expect(
        calls.map((record) => [record.details?.['tool'], record.details?.['outcome']]),
      ).toEqual([
        ['test_read', 'ok'],
        ['test_refused', 'refused'],
      ]);
      for (const record of calls) {
        // Who: the token's owner, the single user with sign-in off (AC-479).
        expect(record.actor_key).not.toBeNull();
        expect(record.details?.['token']).toEqual({ id: token.id, name: NAME });
        expect(record.at.getTime()).toBeGreaterThanOrEqual(started.getTime() - 1000);
        expect(record.summary).toBe(
          `${String(record.details?.['tool'])} · ${NAME} · ${record.details?.['outcome'] === 'ok' ? 'OK' : 'Refused'}`,
        );
        // None of the call's argument values, anywhere in the record.
        const whole = JSON.stringify(record);
        expect(whole).not.toContain(FILTER);
        expect(whole).not.toContain(TITLE);
      }
    } finally {
      await app.close();
    }
  });
});

describe('calls that never reach the tool, or that fail in it (T781’s review, AC-478)', () => {
  it('records a call whose arguments don’t fit as refused, and a tool’s own failure as failed, with no argument value', async () => {
    const app = wechart();
    try {
      const client = await mcpClient(app, HOST, token.text);
      try {
        // The schema is still listed for the client, though `called` checks it.
        const listed = (await client.listTools()).tools.find((tool) => tool.name === 'test_read');
        expect(listed?.inputSchema.properties).toEqual({
          filter: { type: 'string' },
          name: { type: 'string' },
        });
        // `filter` is a string: a number doesn't fit, and the tool never runs.
        const unfit = await client.callTool({
          name: 'test_read',
          arguments: { filter: 424242, name: TITLE },
        });
        expect(unfit.isError).toBe(true);
        const failed = await client.callTool({ name: 'test_fails', arguments: { name: TITLE } });
        expect(failed.isError).toBe(true);
        expect(JSON.stringify(failed.content)).not.toContain('a fault of the server’s own');
      } finally {
        await client.close();
      }
      const calls = (await recordsOf(token.id)).filter(
        (record) =>
          record.event === 'mcp-call' &&
          (record.details?.['outcome'] === 'failed' ||
            (record.details?.['tool'] === 'test_read' && record.details['outcome'] === 'refused')),
      );
      expect(
        calls.map((record) => [record.details?.['tool'], record.details?.['outcome']]),
      ).toEqual([
        ['test_read', 'refused'],
        ['test_fails', 'failed'],
      ]);
      for (const record of calls) {
        const whole = JSON.stringify(record);
        expect(whole).not.toContain('424242');
        expect(whole).not.toContain(TITLE);
      }
    } finally {
      await app.close();
    }
  });
});

describe('events caused through MCP (T781, AC-442)', () => {
  it('marks a proposal recorded inside an MCP request as through MCP, naming the token', async () => {
    const app = wechart();
    try {
      const client = await mcpClient(app, HOST, token.text);
      try {
        await client.callTool({ name: 'test_propose', arguments: {} });
      } finally {
        await client.close();
      }
      const proposal = (await recordsOf(token.id)).find((record) => record.event === 'proposal');
      expect(proposal?.details).toMatchObject({
        marker: NAME,
        viaMcp: { token: { id: token.id, name: NAME } },
      });
      expect(proposal?.summary).toBe(`EMEA top accounts → Sales / EMEA · via ${NAME}`);
    } finally {
      await app.close();
    }
  });

  it('leaves an event recorded outside MCP unmarked', async () => {
    const marker = `t781-web-${Date.now()}`;
    await recordIn(
      auditStore(getDb()),
      {
        actor: { key: 'admin', name: 'admin' },
        event: 'proposal',
        folderId: null,
        item: null,
        summary: 'From the web app',
        details: { marker },
      },
      { warn: () => undefined } as never,
    );
    const [web] = await getDb()
      .selectFrom('audit_records')
      .selectAll()
      .where(sql<boolean>`details->>'marker' = ${marker}`)
      .execute();
    expect(web?.details).toEqual({ marker });
    expect(web?.summary).toBe('From the web app');
    await getDb().deleteFrom('audit_records').where('id', '=', web!.id).execute();
  });
});
