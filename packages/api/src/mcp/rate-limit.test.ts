import { type AddressInfo, connect, createServer, type Server, type Socket } from 'node:net';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { closeDb, databaseUrl, getDb } from '../db/client';
import type { Database } from '../db/schema';
import { accessTokenStore } from '../repos/access-tokens';
import { buildServer } from '../server';
import { rateLimitCounter } from './rateLimitStore';
import { mintToken } from './tokenText';

/**
 * T779 (AC-472, AC-473): each token's requests to `/mcp` are counted in the
 * metadata database, so every API replica counts against one number: 60 a
 * minute where the deployment sets none. Past it, a request is answered 429
 * with `Retry-After` and runs nothing, whatever its method. While the count
 * can't be read or written, every request is answered 503 and runs nothing
 * ("fail closed"), and requests are served again once it can.
 */
const HOST = 'mcp.wechart.example.com';
const NAME = 't779 rate limit';
const ACCEPT = { accept: 'application/json, text/event-stream' };

const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
  modelDir: '',
  security: 'off' as const,
  mcpHost: HOST,
};

const initialize = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'wechart-tests', version: '1.0.0' },
  },
});
const toolsList = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/list' });
const toolsCall = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'no_such_tool', arguments: {} },
});

async function newToken(): Promise<string> {
  const { text, digest } = mintToken();
  await accessTokenStore(getDb()).create({
    owner: { key: 'admin', name: 'admin' },
    name: NAME,
    scopes: ['read'],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    digest,
  });
  return text;
}

function wechart(db: Kysely<Database> = getDb(), config: { mcpRateLimit?: number } = {}) {
  return buildServer({
    config: { ...base, ...config },
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: rateLimitCounter(db),
  });
}

type App = ReturnType<typeof wechart>;

const post = (app: App, token: string, payload: object) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { host: HOST, ...ACCEPT, authorization: `Bearer ${token}` },
    payload,
  });

afterAll(async () => {
  await getDb().deleteFrom('personal_access_tokens').where('name', '=', NAME).execute();
  await closeDb();
});

describe('each token’s requests to /mcp, limited across replicas (T779, AC-472)', () => {
  let token = '';
  beforeAll(async () => {
    token = await newToken();
  });

  it('answers the 61st request in a minute, across two replicas, with 429 and Retry-After, running nothing', async () => {
    const replicas = [wechart(), wechart()] as const;
    try {
      const kinds = [initialize, toolsList, toolsCall];
      for (let n = 1; n <= 60; n += 1) {
        const kind = kinds[n % kinds.length]!;
        const answer = await post(replicas[n % 2]!, token, kind(n));
        expect(answer.statusCode, `request ${n}`).not.toBe(429);
        expect(answer.statusCode, `request ${n}`).not.toBe(503);
        if (kind === initialize) expect(answer.statusCode, `request ${n}`).toBe(200);
      }
      // An initialize would be answered 200 with the server's result: over the limit, it isn't run.
      for (const replica of replicas) {
        const over = await post(replica, token, initialize(61));
        expect(over.statusCode).toBe(429);
        const retryAfter = Number(over.headers['retry-after']);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(60);
        expect(over.body).not.toContain('"result"');
        expect(over.json<{ error: string }>().error).toMatch(/too many requests/i);
      }
    } finally {
      await Promise.all(replicas.map((replica) => replica.close()));
    }
  }, 60_000);

  it('counts each token on its own', async () => {
    const app = wechart(getDb(), { mcpRateLimit: 2 });
    const [one, two] = [await newToken(), await newToken()];
    try {
      expect((await post(app, one, initialize(1))).statusCode).toBe(200);
      expect((await post(app, one, toolsList(2))).statusCode).not.toBe(429);
      expect((await post(app, one, initialize(3))).statusCode).toBe(429);
      expect((await post(app, two, initialize(1))).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('WECHART_MCP_RATE_LIMIT (T779, AC-472)', () => {
  it('is 60 a minute unset, a whole number from 1 when set, and refused otherwise', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).mcpRateLimit).toBe(60);
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_RATE_LIMIT: '' }).mcpRateLimit).toBe(60);
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_RATE_LIMIT: '120' }).mcpRateLimit).toBe(
      120,
    );
    for (const bad of ['0', '-1', '1.5', 'many'])
      expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_RATE_LIMIT: bad }), bad).toThrow(
        /WECHART_MCP_RATE_LIMIT/,
      );
  });
});

/**
 * A TCP relay in front of the metadata database, which the test stops and
 * starts again: the counter's own connection then can't reach its table,
 * while the token is still found through the test's ordinary one.
 */
function relayTo(target: URL) {
  const sockets = new Set<Socket>();
  let server: Server | undefined;
  let port = 0;
  const start = () =>
    new Promise<void>((resolve, reject) => {
      const relay = createServer((client) => {
        const upstream = connect(Number(target.port), target.hostname);
        for (const socket of [client, upstream]) {
          sockets.add(socket);
          socket.on('close', () => sockets.delete(socket));
          socket.on('error', () => {
            client.destroy();
            upstream.destroy();
          });
        }
        client.pipe(upstream).pipe(client);
      });
      relay.once('error', reject);
      relay.listen(port, '127.0.0.1', () => {
        port = (relay.address() as AddressInfo).port;
        server = relay;
        resolve();
      });
    });
  const stop = () =>
    new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      if (server === undefined) resolve();
      else server.close(() => resolve());
      server = undefined;
    });
  const url = () => {
    const relayed = new URL(target);
    relayed.hostname = '127.0.0.1';
    relayed.port = String(port);
    return relayed.toString();
  };
  return { start, stop, url };
}

describe('the limit’s store unavailable (T779, AC-473)', () => {
  it('answers 503, running nothing, where the server is given no store', async () => {
    const token = await newToken();
    const app = buildServer({ config: base, accessTokens: accessTokenStore(getDb()) });
    try {
      const refused = await post(app, token, initialize(1));
      expect(refused.statusCode).toBe(503);
      expect(refused.body).not.toContain('"result"');
    } finally {
      await app.close();
    }
  });

  it('answers 503, running nothing, until the store can be read and written again', async () => {
    const token = await newToken();
    const relay = relayTo(new URL(databaseUrl()));
    await relay.start();
    const pool = new pg.Pool({
      connectionString: relay.url(),
      max: 2,
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', () => undefined);
    const relayed = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    const app = wechart(relayed);
    try {
      expect((await post(app, token, initialize(1))).statusCode).toBe(200);

      await relay.stop();
      for (const payload of [initialize(2), toolsList(3), toolsCall(4)]) {
        const refused = await post(app, token, payload);
        expect(refused.statusCode, payload.method).toBe(503);
        expect(refused.body, payload.method).not.toContain('"result"');
        expect(refused.json<{ error: string }>().error).toMatch(/can’t count/i);
      }

      await relay.start();
      expect((await post(app, token, initialize(5))).statusCode).toBe(200);
    } finally {
      await app.close();
      await relayed.destroy();
      await relay.stop();
    }
  }, 30_000);
});
