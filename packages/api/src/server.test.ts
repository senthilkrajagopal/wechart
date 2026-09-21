import { ChartDocumentError } from '@wechart/core';
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

  it('reads back a saved dashboard, body and all (AC-018)', async () => {
    const saved = {
      title: 'Revenue',
      pages: [{ id: 'p1', title: 'Overview', items: [{ id: 't1', kind: 'chart', w: 6, h: 40 }] }],
      settings: { width: 'full' },
    };
    const documents = {
      ...recordingDocuments(),
      get: async () => ({ id: 'd1', body: saved }),
    };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'GET', url: '/api/documents/dashboard/d1' });

    expect(response.statusCode).toBe(200);
    // The pages and the settings have to survive the round trip, because the
    // criterion fails when "a saved tile or setting is missing".
    expect(response.json().body).toEqual(saved);
    await app.close();
  });

  it('says a chart is from a newer format, rather than failing as an internal error', async () => {
    /**
     * AC-181: "SHALL refuse to open one whose format is newer than it
     * understands, **saying so**". The repo upgrades a chart on read and
     * throws `ChartDocumentError` for a version it does not know — and until
     * this test that error fell through to the generic handler as a 500
     * "Internal error". The message saying *why* was produced and then thrown
     * away on the server, so no browser surface could ever show it; the
     * criterion's tick rested on a test that called the core function
     * directly. A chart that exists would have been reported as broken.
     *
     * The fake throws exactly what `toDocument` throws, so this pins the
     * server's half: what that error becomes on the wire.
     */
    const newer =
      'The stored chart is version 9, but this wechart understands only up to 1. It was saved by a newer version.';
    const documents = {
      ...recordingDocuments(),
      get: async () => {
        throw new ChartDocumentError(newer);
      },
    };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'GET', url: '/api/documents/chart/c1' });

    // 422, not 500: the request was fine and nothing broke — the stored
    // content is one this version cannot read, which is a known condition
    // with a reason, not a fault.
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: newer });
    await app.close();
  });

  it('never answers a save with a refusal once the write has happened', async () => {
    /**
     * The repo upgrades a chart as it reads it back, and it reads a saved
     * document back *after* writing it (`update`, `relocate`). So for a stored
     * chart in a format this build cannot read, the write commits and only
     * then does the upgrade throw. A 4xx there would tell the browser nothing
     * was written, when it was — and Explore would show "Could not save" over
     * a rename that had gone through.
     *
     * The mapping to 422 therefore belongs to the read route alone. What a
     * write should answer instead is a separate, older problem (recorded on
     * T187); this pins only that it must not be a refusal.
     */
    const documents = {
      ...recordingDocuments(),
      update: async () => {
        throw new ChartDocumentError(
          'The stored chart is version 9, but this wechart understands only up to 1.',
        );
      },
    };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/chart/c1',
      payload: { body: { title: 'Renamed' }, version: 1 },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(500);
    await app.close();
  });

  it('says not found rather than returning an empty dashboard', async () => {
    const documents = { ...recordingDocuments(), get: async () => null };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'GET', url: '/api/documents/dashboard/missing' });

    // A 200 with nothing in it would render as an empty dashboard, which looks
    // like a dashboard whose tiles were all deleted.
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('refuses a kind it does not know', async () => {
    const documents = { ...recordingDocuments(), get: async () => null };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'GET', url: '/api/documents/secret/d1' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('saves the whole body as given, keeping parts it knows nothing about (AC-065)', async () => {
    const saved: Record<string, unknown>[] = [];
    const documents = {
      ...recordingDocuments(),
      update: async (input: { body: Record<string, unknown> }) => {
        saved.push(input.body);
        return { id: 'd1', body: input.body, version: 2 };
      },
    };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    /**
     * `markings` is the case this is really about: AC-065 says a save
     * persists marking definitions, and markings arrive at F9 — long after
     * this route. Saving field by field would mean the server had to know
     * every document's shape, and anything the browser learned to store
     * before the server did would vanish on the next save.
     */
    const body = {
      title: 'Revenue',
      pages: [{ id: 'p1', title: 'Overview', items: [{ id: 't1', kind: 'chart', w: 6, h: 40 }] }],
      settings: { width: 'full' },
      markings: [{ id: 'm1', name: 'Selection', colour: '#2a78d6' }],
      somethingNotInventedYet: { deep: ['value'] },
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/dashboard/d1',
      payload: { body, version: 1 },
    });

    expect(response.statusCode).toBe(200);
    expect(saved[0]).toEqual(body);
    await app.close();
  });

  it('refuses a save whose version has moved, rather than overwriting', async () => {
    const stale = Object.assign(new Error('Document has moved on'), {
      name: 'StaleDocumentError',
    });
    const documents = {
      ...recordingDocuments(),
      update: async () => {
        throw stale;
      },
    };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/dashboard/d1',
      payload: { body: { title: 'Mine' }, version: 1 },
    });

    // 409, not 500: the browser has to reload and decide what to do, and it
    // cannot tell a lost race from a broken server if both are 500.
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('insists on a version, so a save cannot silently clobber', async () => {
    const documents = { ...recordingDocuments(), update: async () => ({}) };
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/documents/dashboard/d1',
      payload: { body: { title: 'Mine' } },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
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

  it('gives a new dashboard its interaction mode and default marking (AC-072)', async () => {
    /**
     * T078 / AC-072. Creation is the only place this can be asserted: the
     * browser defaults a dashboard that has no interactions when it reads one,
     * so opening a dashboard and finding Markings proves nothing about what
     * was stored. What is checked here is the stored body.
     *
     * A chart created the same way gets none of it — the default belongs to
     * dashboards, and writing marking definitions onto a chart would be a
     * quiet lie about what a chart is.
     */
    const documents = recordingDocuments();
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: 'Fresh' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'chart', title: 'Not a dashboard' },
    });

    const dashboard = documents.created[0]?.body as {
      settings?: { interactions?: { mode?: string } };
      markings?: { name: string; isDefault: boolean }[];
    };
    expect(dashboard.settings?.interactions?.mode).toBe('markings');
    expect(dashboard.markings).toHaveLength(1);
    expect(dashboard.markings?.[0]?.name).toBe('Marking');
    expect(dashboard.markings?.[0]?.isDefault).toBe(true);

    expect(documents.created[1]?.body).not.toHaveProperty('markings');
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

describe('deleting a library chart (AC-023)', () => {
  /**
   * AC-023: WHEN the user deletes a library chart that dashboards use, THE
   * SYSTEM SHALL name those dashboards and require confirmation before
   * deleting.
   * Fails when: the chart is deleted without naming the dashboards that use it.
   */
  function fixture(dashboards: { id: string; title: string }[]) {
    const removed: string[] = [];
    return {
      removed,
      documents: {
        create: async (input: { id: string }) => ({ id: input.id }),
        remove: async (_kind: string, id: string) => {
          removed.push(id);
          return true;
        },
      },
      catalog: {
        folders: async () => [],
        contents: async () => [],
        search: async () => [],
        dashboardsUsing: async () => dashboards,
      },
    };
  }

  it('refuses an unconfirmed delete and names the dashboards', async () => {
    const f = fixture([
      { id: 'd1', title: 'Weekly revenue' },
      { id: 'd2', title: 'Board pack' },
    ]);
    const app = buildServer({ config, ...f, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'DELETE', url: '/api/documents/chart/c1' });

    expect(response.statusCode).toBe(409);
    expect(response.json().dashboards.map((d: { title: string }) => d.title)).toEqual([
      'Weekly revenue',
      'Board pack',
    ]);
    // Nothing was deleted.
    expect(f.removed).toEqual([]);
    await app.close();
  });

  it('deletes once confirmed', async () => {
    const f = fixture([{ id: 'd1', title: 'Weekly revenue' }]);
    const app = buildServer({ config, ...f, cube: stubCube(() => ({})) });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/documents/chart/c1?confirm=true',
    });

    expect(response.statusCode).toBe(204);
    expect(f.removed).toEqual(['c1']);
    await app.close();
  });

  it('deletes an unused chart without demanding confirmation', async () => {
    const f = fixture([]);
    const app = buildServer({ config, ...f, cube: stubCube(() => ({})) });

    const response = await app.inject({ method: 'DELETE', url: '/api/documents/chart/c1' });

    expect(response.statusCode).toBe(204);
    expect(f.removed).toEqual(['c1']);
    await app.close();
  });

  it('enforces the check on the server, not only in the dialog', async () => {
    // The same unconfirmed request a script would send.
    const f = fixture([{ id: 'd1', title: 'Weekly revenue' }]);
    const app = buildServer({ config, ...f, cube: stubCube(() => ({})) });

    await app.inject({ method: 'DELETE', url: '/api/documents/chart/c1' });

    expect(f.removed).toEqual([]);
    await app.close();
  });

  it('reports 404 for a chart that is not there', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => ({})),
      documents: {
        create: async (input: { id: string }) => ({ id: input.id }),
        remove: async () => false,
      },
    });

    const response = await app.inject({ method: 'DELETE', url: '/api/documents/chart/gone' });

    expect(response.statusCode).toBe(404);
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
