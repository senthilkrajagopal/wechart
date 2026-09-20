import { describe, expect, it } from 'vitest';

import { CubeClient, CubeError } from './cube/client';
import { ConfigError, loadConfig } from './config';
import { buildServer } from './server';

/**
 * AC-007: WHEN the browser needs data or metadata, THE SYSTEM SHALL obtain it
 * through the wechart API, and the browser SHALL make no request to the Cube
 * API host. This file covers the service half — that the API answers for
 * metadata and queries, and that no reply it produces carries the Cube secret.
 * The browser half is demonstrated at T024.
 */
const SECRET = 'cube-secret-must-not-leak';

const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: SECRET,
  securityContext: { tenant: 'acme' },
  port: 4100,
};

/** A CubeClient whose outbound call is replaced, so no network is touched. */
function stubCube(handler: () => unknown): CubeClient {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: SECRET,
    securityContext: config.securityContext,
  });
  const run = async () => handler();
  return Object.create(client, {
    meta: { value: run },
    load: { value: run },
  }) as CubeClient;
}

describe('the API answers for Cube (AC-007)', () => {
  it('serves metadata', async () => {
    const app = buildServer({ config, cube: stubCube(() => ({ cubes: [{ name: 'Orders' }] })) });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ cubes: [{ name: 'Orders' }] });
    await app.close();
  });

  it('serves a query result', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => ({ data: [{ 'Orders.count': '4' }] })),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/load',
      payload: { query: { measures: ['Orders.count'] } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ 'Orders.count': '4' }] });
    await app.close();
  });

  it('refuses a load with no query rather than passing it to Cube', async () => {
    let reached = false;
    const app = buildServer({
      config,
      cube: stubCube(() => {
        reached = true;
        return {};
      }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/load', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(reached).toBe(false);
    await app.close();
  });
});

describe('creating catalog objects (AC-020)', () => {
  function recordingDocuments() {
    const created: { kind: string; id: string; body: Record<string, unknown> }[] = [];
    return {
      created,
      create: async (input: (typeof created)[number]) => {
        created.push(input);
        return { id: input.id };
      },
    };
  }

  it('creates each kind in the folder it was asked for', async () => {
    for (const kind of ['folder', 'dashboard', 'chart'] as const) {
      const documents = recordingDocuments();
      const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

      const response = await app.inject({
        method: 'POST',
        url: '/api/documents',
        payload: { kind, title: `New ${kind}`, folderId: 'finance' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ kind, folderId: 'finance', title: `New ${kind}` });
      expect(documents.created[0]?.body).toMatchObject({ folderId: 'finance' });
      await app.close();
    }
  });

  it('mints the id itself, so a client cannot claim an existing one', async () => {
    const documents = recordingDocuments();
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: 'Mine', id: 'seed-root-dashboard-1' },
    });

    expect(response.json().id).not.toBe('seed-root-dashboard-1');
    expect(documents.created[0]?.id).not.toBe('seed-root-dashboard-1');
    await app.close();
  });

  it('defaults to the root folder when none is given', async () => {
    const documents = recordingDocuments();
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: 'Top level' },
    });

    expect(documents.created[0]?.body).toMatchObject({ folderId: 'root' });
    await app.close();
  });

  it('refuses a kind that is not a catalog object', async () => {
    const documents = recordingDocuments();
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'setting', title: 'Nope' },
    });

    expect(response.statusCode).toBe(400);
    expect(documents.created).toHaveLength(0);
    await app.close();
  });

  it('refuses a blank title rather than creating an untitled object', async () => {
    const documents = recordingDocuments();
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(documents.created).toHaveLength(0);
    await app.close();
  });
});

describe('recording every query (AC-016)', () => {
  function recordingLog() {
    const entries: { durationMs: number; accelerated: boolean; error?: string | null }[] = [];
    return {
      entries,
      record: async (entry: (typeof entries)[number]) => void entries.push(entry),
      recent: async () => entries,
    };
  }

  it('records a successful query with its duration and acceleration', async () => {
    const queryLog = recordingLog();
    const app = buildServer({
      config,
      queryLog,
      cube: stubCube(() => ({
        data: [],
        usedPreAggregations: { 'orders.main': {} },
      })),
    });

    await app.inject({
      method: 'POST',
      url: '/api/load',
      headers: { 'x-request-id': 'req-1' },
      payload: { query: { measures: ['Orders.count'] } },
    });

    expect(queryLog.entries).toHaveLength(1);
    expect(queryLog.entries[0]?.accelerated).toBe(true);
    expect(typeof queryLog.entries[0]?.durationMs).toBe('number');
    await app.close();
  });

  it('records a query that failed, so the log is what happened and not what worked', async () => {
    const queryLog = recordingLog();
    const app = buildServer({
      config,
      queryLog,
      cube: stubCube(() => {
        throw new CubeError('Boom', 400);
      }),
    });

    await app.inject({
      method: 'POST',
      url: '/api/load',
      headers: { 'x-request-id': 'req-2' },
      payload: { query: {} },
    });

    expect(queryLog.entries).toHaveLength(1);
    expect(queryLog.entries[0]?.error).toBe('Boom');
    await app.close();
  });

  it('does not fail a chart that loaded because recording failed', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => ({ data: [] })),
      queryLog: {
        record: async () => {
          throw new Error('log is down');
        },
        recent: async () => [],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/load',
      payload: { query: {} },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('exposes the records for the Jobs workspace', async () => {
    const queryLog = recordingLog();
    const app = buildServer({ config, queryLog, cube: stubCube(() => ({ data: [] })) });

    await app.inject({ method: 'POST', url: '/api/load', payload: { query: {} } });
    const response = await app.inject({ method: 'GET', url: '/api/jobs/queries' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });
});

describe('cancelling a running query (AC-011)', () => {
  it('asks Cube to stop the named query', async () => {
    const cancelled: string[] = [];
    const cube = stubCube(() => ({}));
    Object.defineProperty(cube, 'cancel', {
      value: async (requestId: string) => void cancelled.push(requestId),
    });
    const app = buildServer({ config, cube });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/running-query/abc-span-0',
    });

    expect(response.statusCode).toBe(204);
    expect(cancelled).toEqual(['abc-span-0']);
    await app.close();
  });

  it('still answers when Cube cannot cancel, because the tile is already gone', async () => {
    const cube = stubCube(() => ({}));
    Object.defineProperty(cube, 'cancel', {
      value: async () => {
        throw new CubeError('Query not found', 404);
      },
    });
    const app = buildServer({ config, cube });

    const response = await app.inject({ method: 'DELETE', url: '/api/running-query/gone' });

    expect(response.statusCode).toBe(204);
    await app.close();
  });
});

describe('the Cube secret never reaches the browser (AC-007)', () => {
  it('is absent from a successful reply', async () => {
    const app = buildServer({ config, cube: stubCube(() => ({ cubes: [] })) });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.body).not.toContain(SECRET);
    expect(JSON.stringify(response.headers)).not.toContain(SECRET);
    await app.close();
  });

  it('is absent from a reply when Cube fails, while Cube’s message survives', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => {
        throw new CubeError("Can't find join path between Orders and Suppliers", 400);
      }),
    });

    const response = await app.inject({ method: 'POST', url: '/api/load', payload: { query: {} } });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(SECRET);
    // AC-012 depends on this message reaching the tile.
    expect(response.json()).toMatchObject({ error: expect.stringContaining('join path') });
    await app.close();
  });

  it('is absent from a reply when the service itself fails', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => {
        throw new Error(`boom, secret was ${SECRET}`);
      }),
    });

    const response = await app.inject({ method: 'GET', url: '/api/meta' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(SECRET);
    expect(response.json()).toEqual({ error: 'Internal error' });
    await app.close();
  });
});

describe('configuration', () => {
  it('refuses to start without a Cube secret', () => {
    expect(() => loadConfig({ CUBE_API_URL: 'http://cube.invalid' })).toThrow(ConfigError);
  });

  it('reads the security context as JSON', () => {
    const loaded = loadConfig({
      CUBE_API_SECRET: 'x',
      WECHART_SECURITY_CONTEXT: '{"tenant":"acme"}',
    });

    expect(loaded.securityContext).toEqual({ tenant: 'acme' });
  });

  it('refuses a security context that is not a JSON object', () => {
    expect(() => loadConfig({ CUBE_API_SECRET: 'x', WECHART_SECURITY_CONTEXT: '[1,2]' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ CUBE_API_SECRET: 'x', WECHART_SECURITY_CONTEXT: 'nope' })).toThrow(
      ConfigError,
    );
  });

  it('treats an absent security context as no claims, not as an error', () => {
    expect(loadConfig({ CUBE_API_SECRET: 'x' }).securityContext).toEqual({});
  });
});
