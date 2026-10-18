import { randomInt } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { buildServer } from '../server';
import { rateLimitCounter } from './rateLimitStore';
import { mintToken } from './tokenText';

/**
 * T780 (AC-474): requests to `/mcp` bearing a bad or missing token are
 * counted by the address they come from, 20 a minute where the deployment
 * sets none, an IPv6 address by its /64. Past it, that address's further
 * such requests answer 429 with `Retry-After`, where they answered 401. A
 * working token's requests are counted under the token alone (AC-472),
 * never against the address, and aren't refused for it. Behind the proxy
 * `WECHART_TRUST_PROXY` names, the address counted is the one it forwarded
 * (T773).
 *
 * Every test sends from addresses of its own, drawn at random, since the
 * counts are kept in the shared metadata database for a minute.
 */
const HOST = 'mcp.wechart.example.com';
const NAME = 't780 bad tokens';
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

/** An IPv4 address no other test sends from. */
const ipv4 = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
/** An IPv6 /64 no other test sends from, as its first four groups. */
const ipv6Prefix = () =>
  `2001:db8:${randomInt(0x10000).toString(16)}:${randomInt(0x10000).toString(16)}`;

/** None, malformed, unknown: each kind of bad token, in turn. */
const badTokens = [
  {},
  { authorization: 'Bearer wct_not-a-token' },
  { authorization: `Bearer ${mintToken().text}` },
  { authorization: 'Basic d2VjaGFydDp3ZWNoYXJ0' },
];

let token = '';
beforeAll(async () => {
  const { text, digest } = mintToken();
  await accessTokenStore(getDb()).create({
    owner: { key: 'admin', name: 'admin' },
    name: NAME,
    scopes: ['read'],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    digest,
  });
  token = text;
});

afterAll(async () => {
  // The counts of the addresses drawn here, which no one else sends from, and of the token.
  await getDb()
    .deleteFrom('mcp_rate_limit')
    .where((row) =>
      row.or([
        row('key', 'like', 'ip:10.%'),
        row('key', 'like', 'ip:2001:db8:%'),
        row(
          'key',
          'in',
          getDb()
            .selectFrom('personal_access_tokens')
            .select(sql<string>`'tok:' || id`.as('key'))
            .where('name', '=', NAME),
        ),
      ]),
    )
    .execute();
  await getDb().deleteFrom('personal_access_tokens').where('name', '=', NAME).execute();
  await closeDb();
});

function wechart(config: { trustProxy?: readonly string[]; mcpBadTokenLimit?: number } = {}) {
  return buildServer({
    config: { ...base, ...config },
    accessTokens: accessTokenStore(getDb()),
    mcpRateLimits: rateLimitCounter(getDb()),
  });
}
type App = ReturnType<typeof wechart>;

const post = (app: App, remoteAddress: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    remoteAddress,
    headers: { host: HOST, ...ACCEPT, ...headers },
    payload: initialize,
  });

describe('bad and missing tokens on /mcp, limited by address (T780, AC-474)', () => {
  it('answers an address’s 21st bad-token request in a minute with 429 and Retry-After, where the first 20 answered 401', async () => {
    const app = wechart();
    const address = ipv4();
    try {
      for (let n = 0; n < 20; n += 1) {
        const answer = await post(app, address, badTokens[n % badTokens.length]);
        expect(answer.statusCode, `request ${n + 1}`).toBe(401);
      }
      for (const headers of badTokens) {
        const over = await post(app, address, headers);
        expect(over.statusCode).toBe(429);
        expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
        expect(Number(over.headers['retry-after'])).toBeLessThanOrEqual(60);
      }
      // Another address has its own count.
      expect((await post(app, ipv4())).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('counts addresses within one IPv6 /64 together, and another /64 on its own', async () => {
    const app = wechart();
    const prefix = ipv6Prefix();
    try {
      for (let n = 1; n <= 20; n += 1) {
        const answer = await post(app, `${prefix}:${n.toString(16)}::${n.toString(16)}`);
        expect(answer.statusCode, `request ${n}`).toBe(401);
      }
      expect((await post(app, `${prefix}:ffff:ffff:ffff:ffff`)).statusCode).toBe(429);
      expect((await post(app, `${ipv6Prefix()}::1`)).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('neither counts a working token’s requests against its address nor refuses them for it', async () => {
    const app = wechart();
    const address = ipv4();
    const working = { authorization: `Bearer ${token}` };
    try {
      for (let n = 0; n < 5; n += 1)
        expect((await post(app, address, working)).statusCode).toBe(200);
      for (let n = 0; n < 20; n += 1)
        expect((await post(app, address)).statusCode, `bad request ${n + 1}`).toBe(401);
      expect((await post(app, address)).statusCode).toBe(429);
      expect((await post(app, address, working)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('counts the address the trusted proxy forwarded', async () => {
    const proxy = ipv4();
    const app = wechart({ trustProxy: [proxy] });
    const [one, two] = [ipv4(), ipv4()];
    try {
      for (let n = 0; n < 20; n += 1)
        expect((await post(app, proxy, { 'x-forwarded-for': one })).statusCode).toBe(401);
      expect((await post(app, proxy, { 'x-forwarded-for': one })).statusCode).toBe(429);
      // Through the same proxy, another client is counted on its own.
      expect((await post(app, proxy, { 'x-forwarded-for': two })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('believes no X-Forwarded-For from a peer it doesn’t trust: rotating it escapes nothing', async () => {
    const app = wechart();
    const address = ipv4();
    try {
      for (let n = 0; n < 20; n += 1)
        expect((await post(app, address, { 'x-forwarded-for': ipv4() })).statusCode).toBe(401);
      expect((await post(app, address, { 'x-forwarded-for': ipv4() })).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  }, 30_000);

  it('takes the deployment’s limit where it sets one', async () => {
    const app = wechart({ mcpBadTokenLimit: 2 });
    const address = ipv4();
    try {
      expect((await post(app, address)).statusCode).toBe(401);
      expect((await post(app, address)).statusCode).toBe(401);
      expect((await post(app, address)).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe('WECHART_MCP_BAD_TOKEN_LIMIT (T780, AC-474)', () => {
  it('is 20 a minute unset, a whole number from 1 when set, and refused otherwise', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).mcpBadTokenLimit).toBe(20);
    expect(
      loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_BAD_TOKEN_LIMIT: '5' }).mcpBadTokenLimit,
    ).toBe(5);
    for (const bad of ['0', '-3', '2.5', 'few'])
      expect(
        () => loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_BAD_TOKEN_LIMIT: bad }),
        bad,
      ).toThrow(/WECHART_MCP_BAD_TOKEN_LIMIT/);
  });
});
