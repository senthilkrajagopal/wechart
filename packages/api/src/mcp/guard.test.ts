import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import Fastify from 'fastify';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { closeDb } from '../db/client';
import { buildServer } from '../server';
import { forgetTestCounts, testCounter } from './counter.fixture';
import { registerMcp } from './plugin';

/**
 * T775 (AC-436): a request to `/mcp` naming a `Host` other than the MCP
 * host, or carrying an `Origin` the deployment doesn't allow, is answered
 * 403 before its token is read: the token check is never called, so no
 * tool can run. With no `Origin` (a CLI client sends none), or the MCP
 * host's own, the request goes on to the token check.
 */
const HOST = 'mcp.wechart.example.com';

/** `/mcp` alone on a bare app, its token check a spy that turns everyone away. */
async function mcpApp() {
  const verifyToken = vi.fn(async (_authorization: string | undefined): Promise<never> => {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'no token is taken here');
  });
  const app = Fastify();
  // Its requests counted (T779, T780): with no count kept, it takes none.
  registerMcp(app, { host: HOST, verifyToken, rateLimits: testCounter() });
  await app.ready();
  return { app, verifyToken };
}

const tools = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

describe('the Host and Origin guard on /mcp (T775, AC-436)', () => {
  it('answers a foreign Host with 403, never reading the token', async () => {
    const { app, verifyToken } = await mcpApp();
    try {
      for (const host of ['evil.example', 'localhost', `${HOST}.evil.example`, '127.0.0.1']) {
        const answer = await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { host, authorization: 'Bearer wct_anything' },
          payload: tools,
        });
        expect(answer.statusCode, host).toBe(403);
      }
      expect(verifyToken).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('answers an Origin the deployment doesn’t allow with 403, never reading the token', async () => {
    const { app, verifyToken } = await mcpApp();
    try {
      for (const origin of ['https://evil.example', 'null', 'https://wechart.example.com']) {
        const answer = await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { host: HOST, origin, authorization: 'Bearer wct_anything' },
          payload: tools,
        });
        expect(answer.statusCode, origin).toBe(403);
      }
      expect(verifyToken).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('refuses a foreign Host on GET and DELETE too, before their 405', async () => {
    const { app } = await mcpApp();
    try {
      for (const method of ['GET', 'DELETE'] as const) {
        const foreign = await app.inject({ method, url: '/mcp', headers: { host: 'evil.example' } });
        expect(foreign.statusCode, method).toBe(403);
        const own = await app.inject({ method, url: '/mcp', headers: { host: HOST } });
        expect(own.statusCode, method).toBe(405);
      }
    } finally {
      await app.close();
    }
  });

  it('passes the MCP host, with no Origin or its own, on to the token check', async () => {
    const { app, verifyToken } = await mcpApp();
    try {
      const cases = [
        { host: HOST },
        { host: `${HOST}:443` },
        { host: HOST, origin: `https://${HOST}` },
      ];
      for (const headers of cases) {
        const answer = await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { ...headers, authorization: 'Bearer wct_anything' },
          payload: tools,
        });
        expect(answer.statusCode, JSON.stringify(headers)).toBe(401);
        expect(answer.headers['www-authenticate']).toBe(
          'Bearer error="invalid_token", error_description="no token is taken here"',
        );
      }
      expect(verifyToken).toHaveBeenCalledTimes(cases.length);
      expect(verifyToken).toHaveBeenLastCalledWith('Bearer wct_anything');
    } finally {
      await app.close();
    }
  });
});

describe('the guard in the wechart API (T775, AC-436, AC-479)', () => {
  afterAll(async () => {
    await forgetTestCounts();
    await closeDb();
  });

  it('answers a foreign Host or Origin on /mcp with 403, with sign-in off', async () => {
    const app = buildServer({
      config: {
        cubeApiUrl: 'http://cube.invalid/cubejs-api',
        cubeApiSecret: 'secret',
        securityContext: {},
        port: 0,
        modelDir: '',
        security: 'off',
        mcpHost: HOST,
      },
      mcpRateLimits: testCounter(),
    });
    try {
      const foreignHost = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: 'localhost:4100' },
        payload: tools,
      });
      expect(foreignHost.statusCode).toBe(403);
      const foreignOrigin = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: HOST, origin: 'http://localhost:5273' },
        payload: tools,
      });
      expect(foreignOrigin.statusCode).toBe(403);
      const own = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { host: HOST },
        payload: tools,
      });
      expect(own.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
