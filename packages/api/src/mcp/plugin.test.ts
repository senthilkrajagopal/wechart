import { afterAll, describe, expect, it } from 'vitest';

import { routesOf } from '../auth/guard';
import { pgSessionStore } from '../auth/session-store';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { buildServer } from '../server';

/**
 * T774 (AC-476, as amended 2026-10-17; design 18's Q6, "MCP off"): `/mcp`
 * is served only where the deployment names a host for MCP. With none, no
 * MCP route exists, so a request there is the plain 404 of any unknown path
 * and no MCP code runs; the token pages are told there's no server URL.
 */
const base = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 0,
  modelDir: '',
  security: 'off' as const,
};

afterAll(async () => {
  await closeDb();
});

/** The MCP routes, a HEAD left out as the route matrix does: it answers as its GET. */
const mcpRoutes = (app: ReturnType<typeof buildServer>) =>
  routesOf(app).filter(
    (route) => route.method !== 'HEAD' && (route.url === '/mcp' || route.url.startsWith('/mcp/')),
  );

describe('/mcp with no MCP host (T774, AC-476)', () => {
  it('has no route: POST /mcp is the 404 of an unknown path', async () => {
    const app = buildServer({ config: base });
    try {
      await app.ready();
      expect(mcpRoutes(app)).toEqual([]);
      for (const method of ['POST', 'GET', 'DELETE'] as const) {
        const answer = await app.inject({ method, url: '/mcp' });
        expect(answer.statusCode).toBe(404);
        expect(answer.json<{ message: string }>().message).toBe(`Route ${method}:/mcp not found`);
      }
    } finally {
      await app.close();
    }
  });

  it('with sign-in on, answers /mcp as any unknown path, reaching no MCP code', async () => {
    const app = buildServer({
      config: {
        ...base,
        security: 'oidc',
        publicUrl: 'http://localhost:5373',
        sessionSecret: 'a-test-session-secret-at-least-32-characters',
        superAdminGroup: 'wechart-super-admins',
        oidc: {
          issuer: 'http://localhost:5556/dex',
          clientId: 'wechart',
          clientSecret: 'secret',
          groupsClaim: 'groups',
          scopes: 'openid profile email groups',
          allowHttp: true,
        },
      },
      sessions: pgSessionStore(getDb()),
    });
    try {
      await app.ready();
      expect(mcpRoutes(app)).toEqual([]);
      const unknown = await app.inject({ method: 'POST', url: '/no-such-path', payload: {} });
      const mcp = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
      expect({ status: mcp.statusCode, body: mcp.json<unknown>() }).toEqual({
        status: unknown.statusCode,
        body: unknown.json<unknown>(),
      });
      // No 401 of MCP's own: no WWW-Authenticate: Bearer.
      expect(mcp.headers['www-authenticate']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('tells the token pages there is no server URL', async () => {
    const app = buildServer({ config: base, accessTokens: accessTokenStore(getDb()) });
    try {
      const answer = await app.inject({ method: 'GET', url: '/api/account/tokens' });
      expect(answer.statusCode).toBe(200);
      expect(answer.json<{ mcpUrl: unknown }>().mcpUrl).toBe(null);
    } finally {
      await app.close();
    }
  });
});

describe('/mcp with an MCP host (T774, AC-476)', () => {
  const config = { ...base, mcpHost: 'mcp.wechart.example.com' };

  it('routes /mcp, refusing what it can’t yet check with 401 and running nothing', async () => {
    const app = buildServer({ config });
    try {
      await app.ready();
      expect(
        mcpRoutes(app)
          .map((route) => route.method)
          .sort(),
      ).toEqual(['DELETE', 'GET', 'POST']);
      const answer = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: 'mcp.wechart.example.com', 'content-type': 'application/json' },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      });
      expect(answer.statusCode).toBe(401);
      expect(answer.headers['www-authenticate']).toBe('Bearer');
      // GET and DELETE: 405, as the Streamable HTTP transport asks.
      for (const method of ['GET', 'DELETE'] as const) {
        const other = await app.inject({
          method,
          url: '/mcp',
          headers: { host: 'mcp.wechart.example.com' },
        });
        expect(other.statusCode).toBe(405);
        expect(other.headers['allow']).toBe('POST');
      }
    } finally {
      await app.close();
    }
  });

  it('gives the token pages its https address', async () => {
    const app = buildServer({ config, accessTokens: accessTokenStore(getDb()) });
    try {
      const answer = await app.inject({ method: 'GET', url: '/api/account/tokens' });
      expect(answer.json<{ mcpUrl: unknown }>().mcpUrl).toBe('https://mcp.wechart.example.com/mcp');
    } finally {
      await app.close();
    }
  });
});
