import { ChartDocumentError } from '@wechart/core';
import { describe, expect, it, vi } from 'vitest';

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
  modelDir: '',
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
    sql: { value: run },
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

  /**
   * T172 / AC-166: WHEN the user edits a security context and previews a
   * dashboard, THE SYSTEM SHALL run that dashboard's queries with the edited
   * context.
   *
   * The preview is signed as itself, in place of the configured context —
   * whose other claims would otherwise apply unnamed (T172's review) — with
   * wechart's own claims (the model Cube compiles) and the token's times kept
   * wechart's.
   */
  it('signs a load as a preview context, keeping only wechart’s own claims (T172)', async () => {
    const payloads: Record<string, unknown>[] = [];
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: { tenant: 'acme', wechartModel: 'dev' },
      fetchImpl: (async (_url: string, init: RequestInit) => {
        const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '') ?? '';
        payloads.push(
          JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<
            string,
            unknown
          >,
        );
        return new Response('{"data":[]}');
      }) as typeof fetch,
    });
    const app = buildServer({ config, cube });
    const load = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/load', payload });

    const before = Math.floor(Date.now() / 1000);
    await load({
      query: { measures: ['secured_orders.count'] },
      context: {
        groups: ['sales'],
        is_employee: true,
        sub: 'rep-7',
        wechartModel: 'elsewhere',
        wechartRevision: 9,
        exp: 1,
        nbf: 9_999_999_999,
        iss: 'someone',
      },
    });
    await load({ query: { measures: ['secured_orders.count'] } });
    const refused = await Promise.all(
      [['not', 'an', 'object'], null, 'sales'].map((context) =>
        load({ query: { measures: ['x.y'] }, context }),
      ),
    );

    // The preview as itself: none of the configured context's claims (no
    // `tenant`), wechart's own model, and the token's times wechart's.
    const { iat, exp, ...claims } = payloads[0] ?? {};
    expect(claims).toEqual({
      groups: ['sales'],
      is_employee: true,
      sub: 'rep-7',
      wechartModel: 'dev',
    });
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(exp).toBeGreaterThan(before);
    // Without a preview, wechart's own context and nothing more.
    expect(payloads[1]).toMatchObject({ tenant: 'acme', wechartModel: 'dev' });
    expect(payloads[1]?.['groups']).toBeUndefined();
    expect(refused.map((response) => response.statusCode)).toEqual([400, 400, 400]);
    expect(payloads).toHaveLength(2);
    await app.close();
  });

  it('asks Cube past its cache when told to, and only in Cube’s own terms (T154, AC-148)', async () => {
    const bodies: unknown[] = [];
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: config.securityContext,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response('{"data":[]}');
      }) as typeof fetch,
    });
    const app = buildServer({ config, cube });
    const load = (payload: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/load', payload });

    await load({ query: { measures: ['Orders.count'] }, cache: 'no-cache' });
    await load({ query: { measures: ['Orders.count'] } });
    const refused = await load({ query: { measures: ['Orders.count'] }, cache: 'whenever' });

    // research/cube/refresh-jobs-caching.md: `cache` on /v1/load, and its four values.
    expect(bodies).toEqual([
      { query: { measures: ['Orders.count'] }, cache: 'no-cache' },
      { query: { measures: ['Orders.count'] } },
    ]);
    expect(refused.statusCode).toBe(400);
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

  /**
   * T174 / AC-168: THE SYSTEM SHALL show the generated SQL and the effective
   * filters for a chart under the previewed context.
   *
   * Cube's `/v1/sql`, asked as the context, answers `sql.sql` as `[text,
   * params]`, generated after its policies apply (research/cube/
   * access-control.md, "Observed locally").
   */
  it('answers a query’s SQL as Cube generates it for a previewed context (T174)', async () => {
    const asked: { url: string; claims: Record<string, unknown> }[] = [];
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: { tenant: 'acme', wechartModel: 'dev' },
      fetchImpl: (async (url: string, init: RequestInit) => {
        const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '') ?? '';
        asked.push({
          url,
          claims: JSON.parse(
            Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
          ) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            sql: { sql: ['SELECT 1 WHERE status = $1', ['shipped']], preAggregations: [] },
          }),
        );
      }) as typeof fetch,
    });
    const app = buildServer({ config, cube });
    const query = { measures: ['secured_orders.count'] };

    const answered = await app.inject({
      method: 'POST',
      url: '/api/sql',
      payload: { query, context: { groups: ['sales'], wechartModel: 'elsewhere' } },
    });
    const noQuery = await app.inject({ method: 'POST', url: '/api/sql', payload: {} });
    const badContext = await app.inject({
      method: 'POST',
      url: '/api/sql',
      payload: { query, context: 'sales' },
    });

    expect(answered.statusCode).toBe(200);
    expect(answered.json()).toEqual({
      queries: [{ sql: 'SELECT 1 WHERE status = $1', params: ['shipped'] }],
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url).toBe(
      `${config.cubeApiUrl}/v1/sql?query=${encodeURIComponent(JSON.stringify(query))}`,
    );
    // As the preview, in place of the configured context (T172).
    const { iat, exp, ...claims } = asked[0]?.claims ?? {};
    expect(claims).toEqual({ groups: ['sales'], wechartModel: 'dev' });
    expect([typeof iat, typeof exp]).toEqual(['number', 'number']);
    expect([noQuery.statusCode, badContext.statusCode]).toEqual([400, 400]);
    await app.close();
  });

  it('answers every statement of a query Cube runs as several, and refuses one without SQL (T174)', async () => {
    let answer: unknown = [
      { sql: { sql: ['SELECT a WHERE x = $1', ['1']] } },
      { sql: { sql: ['SELECT b', []] } },
    ];
    const app = buildServer({ config, cube: stubCube(() => answer) });
    const ask = () =>
      app.inject({
        method: 'POST',
        url: '/api/sql',
        payload: { query: { measures: ['a.count'] }, context: {} },
      });

    const several = await ask();
    answer = { sql: { preAggregations: [] } };
    const without = await ask();

    expect(several.json()).toEqual({
      queries: [
        { sql: 'SELECT a WHERE x = $1', params: ['1'] },
        { sql: 'SELECT b', params: [] },
      ],
    });
    expect(without.statusCode).toBe(502);
    expect(without.json()).toEqual({ error: 'Cube answered without the SQL it would run.' });
    await app.close();
  });

  it('passes on Cube’s refusal of a previewed context’s SQL, in Cube’s words (T174)', async () => {
    const app = buildServer({
      config,
      cube: stubCube(() => {
        throw new CubeError("Error: You requested hidden member: 'secured_orders.count'.", 500);
      }),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/sql',
      payload: { query: { measures: ['secured_orders.count'] }, context: {} },
    });
    expect(response.json()).toMatchObject({
      error: "Error: You requested hidden member: 'secured_orders.count'.",
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });
});

describe('who is signed in (AC-190)', () => {
  it('names phase 1’s single user, the owner every new document is given', async () => {
    // One user, no login (requirements §4) — the avatar reads the name here
    // rather than repeating it, so the two cannot disagree.
    const app = buildServer({ config, cube: stubCube(() => ({})) });
    const response = await app.inject({ method: 'GET', url: '/api/me' });
    expect(response.statusCode).toBe(200);
    // Phase 2 adds whether they are a Super-Admin and the security mode
    // (AC-252, AC-254); with security off it is still phase 1's one user.
    expect(response.json()).toEqual({
      name: 'admin',
      groups: [],
      superAdmin: true,
      security: 'off',
    });
  });
});

describe('searching the catalog (AC-019)', () => {
  /**
   * The Explore search box lists *every* match, so it asks for more than the
   * palette's 50; a limit is still a bound, because a search is a query.
   */
  const searchWith = () => {
    const asked: (number | undefined)[] = [];
    const catalog = {
      folders: async () => [],
      contents: async () => [],
      search: async (_text: string, limit?: number) => {
        asked.push(limit);
        return [];
      },
    };
    const app = buildServer({ config, catalog, cube: stubCube(() => ({})) });
    return { app, asked };
  };

  it('passes a requested limit through', async () => {
    const { app, asked } = searchWith();
    await app.inject({ method: 'GET', url: '/api/search?q=a&limit=1001' });
    expect(asked).toEqual([1001]);
  });

  it('keeps the catalog default when none is asked', async () => {
    const { app, asked } = searchWith();
    await app.inject({ method: 'GET', url: '/api/search?q=a' });
    expect(asked).toEqual([undefined]);
  });

  it('refuses a limit that is not a whole number from 1 to 5,000', async () => {
    const { app, asked } = searchWith();
    for (const limit of ['0', '5001', 'abc', '2.5']) {
      const response = await app.inject({ method: 'GET', url: `/api/search?q=a&limit=${limit}` });
      expect(response.statusCode).toBe(400);
    }
    expect(asked).toHaveLength(0);
  });

  // T241's review: the security preview's list is of dashboards alone.
  it('narrows to one kind when asked, and refuses any other', async () => {
    const kinds: (string | undefined)[] = [];
    const catalog = {
      folders: async () => [],
      contents: async () => [],
      search: async (_text: string, _limit?: number, only?: string) => {
        kinds.push(only);
        return [];
      },
    };
    const app = buildServer({ config, catalog, cube: stubCube(() => ({})) });
    await app.inject({ method: 'GET', url: '/api/search?q=a&kind=dashboard&limit=9' });
    await app.inject({ method: 'GET', url: '/api/search?q=a' });
    expect(kinds).toEqual(['dashboard', undefined]);
    const refused = await app.inject({ method: 'GET', url: '/api/search?q=a&kind=folder' });
    expect(refused.statusCode).toBe(400);
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

  /**
   * T449, AC-333: "It SHALL push its folder tree … after every folder
   * change". A folder made through the API puts the tree; a dashboard made,
   * or a refused request, doesn't.
   */
  it('puts the folder tree to xcube after a folder is made, and after nothing else', async () => {
    const documents = recordingDocuments();
    const afterFolderChange = vi.fn(async () => undefined);
    const app = buildServer({
      config,
      documents,
      cube: stubCube(() => ({})),
      afterFolderChange,
    });

    await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'dashboard', title: 'Not a folder' },
    });
    await app.inject({ method: 'POST', url: '/api/documents', payload: { kind: 'folder' } });
    expect(afterFolderChange).not.toHaveBeenCalled();

    const made = await app.inject({
      method: 'POST',
      url: '/api/documents',
      payload: { kind: 'folder', title: 'Sales' },
    });
    expect(made.statusCode).toBe(201);
    await vi.waitFor(() => {
      expect(afterFolderChange).toHaveBeenCalledTimes(1);
    });
    // Settled (T449's review): the dashboard and the refused request never called it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(afterFolderChange).toHaveBeenCalledTimes(1);
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

  // T449's review, AC-333: a folder removed through its :kind route puts the tree too.
  it('puts the folder tree after a folder is removed, and not after a chart is', async () => {
    const f = fixture([]);
    const afterFolderChange = vi.fn(async () => undefined);
    const app = buildServer({ config, ...f, cube: stubCube(() => ({})), afterFolderChange });

    const chart = await app.inject({ method: 'DELETE', url: '/api/documents/chart/c9' });
    expect(chart.statusCode).toBeLessThan(300);
    const folder = await app.inject({ method: 'DELETE', url: '/api/documents/folder/f9' });
    expect(folder.statusCode).toBeLessThan(300);

    await vi.waitFor(() => {
      expect(afterFolderChange).toHaveBeenCalledTimes(1);
    });
    // Settled: the chart's delete never called it.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(afterFolderChange).toHaveBeenCalledTimes(1);
    await app.close();
  });

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

  /**
   * T240 (AC-230): a page of the log, narrowed and sorted by the database over
   * all of it, rather than the page filtering the latest hundred.
   */
  it('reads a page of the log as asked, and refuses what it cannot ask', async () => {
    const asked: unknown[] = [];
    const queryLog = {
      ...recordingLog(),
      page: async (ask: unknown) => {
        asked.push(ask);
        return { records: [{ id: 1 }], total: 60 };
      },
    };
    const app = buildServer({ config, queryLog, cube: stubCube(() => ({ data: [] })) });
    const read = (query: string) =>
      app.inject({ method: 'GET', url: `/api/jobs/queries/page${query}` });

    const answer = await read(
      '?outcome=failed&source=accelerated&within=day&sort=duration&order=asc&offset=25&limit=25',
    );
    const plain = await read('');
    const refused = await Promise.all(
      ['?outcome=maybe', '?within=year', '?sort=size', '?offset=-1', '?limit=0', '?limit=101'].map(
        read,
      ),
    );

    expect(answer.json()).toEqual({ records: [{ id: 1 }], total: 60 });
    expect(asked).toEqual([
      {
        outcome: 'failed',
        source: 'accelerated',
        withinSeconds: 86_400,
        sort: 'duration',
        descending: false,
        offset: 25,
        limit: 25,
      },
      { sort: 'when', descending: true, offset: 0, limit: 25 },
    ]);
    expect(plain.statusCode).toBe(200);
    expect(refused.map((response) => response.statusCode)).toEqual([400, 400, 400, 400, 400, 400]);
    await app.close();
  });

  /** T180 (AC-174): a page's own queries, by the request ids it sent. */
  it('finds the records of given request ids, and refuses anything else', async () => {
    const asked: (readonly string[])[] = [];
    const queryLog = {
      ...recordingLog(),
      byRequestIds: async (ids: readonly string[]) => {
        asked.push(ids);
        return ids.map((requestId) => ({ requestId, durationMs: 5 }));
      },
    };
    const app = buildServer({ config, queryLog, cube: stubCube(() => ({ data: [] })) });
    const find = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/jobs/queries/find',
        payload: payload as Record<string, unknown>,
      });

    const found = await find({ requestIds: ['a', 'b'] });
    const refused = await Promise.all([find({}), find({ requestIds: ['a', 1] })]);

    expect(found.json()).toEqual([
      { requestId: 'a', durationMs: 5 },
      { requestId: 'b', durationMs: 5 },
    ]);
    expect(refused.map((response) => response.statusCode)).toEqual([400, 400]);
    expect(asked).toEqual([['a', 'b']]);
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

/**
 * T192 / AC-183: WHEN a chart edited from a dashboard tile is applied, THE
 * SYSTEM SHALL hold the edit in the dashboard's edit session and write the
 * chart document only when the dashboard is saved.
 *
 * The dashboard and its edited charts arrive in one request and go to the
 * repo's `updateTogether`, one transaction, all or nothing — which the repo's
 * own tests prove against the real database. These pin what the route adds.
 */
describe('saving a dashboard with the charts edited from its tiles (AC-183)', () => {
  const chart = (dashboardId?: string) => ({
    schemaVersion: 1,
    title: 'Orders',
    ...(dashboardId === undefined ? { folderId: 'f1' } : { localToDashboardId: dashboardId }),
    chart: {
      source: { cube: 'orders' },
      wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    },
  });

  /**
   * A store that holds the given charts, each at version 5 unless `versions`
   * says otherwise, and records what `updateTogether` was asked to write.
   */
  function store(
    stored: Record<string, Record<string, unknown>>,
    versions: Record<string, number> = {},
  ) {
    const written: unknown[] = [];
    return {
      written,
      documents: {
        create: async (input: { id: string }) => ({ id: input.id }),
        get: async (kind: string, id: string) =>
          kind === 'chart' && id in stored
            ? { id, body: stored[id] as Record<string, unknown>, version: versions[id] ?? 5 }
            : null,
        updateTogether: async (writes: readonly { id: string; expectedVersion: number }[]) => {
          written.push(...writes);
          return writes.map((write) => ({ id: write.id, version: write.expectedVersion + 1 }));
        },
      },
    };
  }

  const save = (app: ReturnType<typeof buildServer>, payload: unknown) =>
    app.inject({
      method: 'PUT',
      url: '/api/dashboards/d1',
      payload: payload as Record<string, unknown>,
    });

  it('writes the dashboard and its edited charts together, in one call', async () => {
    const { documents, written } = store({ c1: chart('d1') });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(200);
    expect(written).toEqual([
      { kind: 'chart', id: 'c1', body: chart('d1'), expectedVersion: 5 },
      { kind: 'dashboard', id: 'd1', body: { title: 'Revenue' }, expectedVersion: 3 },
    ]);
    expect(response.json()).toEqual({ version: 4, charts: { c1: 6 } });
    await app.close();
  });

  /**
   * T132 (AC-126): a chart made on the dashboard is written with it, at
   * version 0 — not yet stored — and only as this dashboard's local chart.
   */
  it('creates a chart made on the dashboard with it, local to it, in the same call', async () => {
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c-new', body: chart('d1'), version: 0 }],
    });

    expect(response.statusCode).toBe(200);
    expect(written).toEqual([
      { kind: 'chart', id: 'c-new', body: chart('d1'), expectedVersion: 0 },
      { kind: 'dashboard', id: 'd1', body: { title: 'Revenue' }, expectedVersion: 3 },
    ]);
    expect(response.json()).toEqual({ version: 4, charts: { 'c-new': 1 } });
    await app.close();
  });

  it('creates only charts: a dashboard at version 0 is refused, not made (T132’s review)', async () => {
    // A dashboard is created by POST /api/documents, which mints its id and
    // its defaults (AC-072) — never by a save naming an id of its own.
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 0 },
      charts: [],
    });

    expect(response.statusCode).toBe(400);
    expect(written).toEqual([]);
    await app.close();
  });

  it('refuses a new chart local to another dashboard, and writes nothing', async () => {
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const elsewhere = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c-new', body: chart('d2'), version: 0 }],
    });

    expect(elsewhere.statusCode).toBe(400);
    expect(written).toEqual([]);
    await app.close();
  });

  /**
   * T133 / AC-127: WHEN the user saves a local chart to a folder, THE SYSTEM
   * SHALL make it a library chart reusable by other dashboards, and say where
   * it was saved — with the dashboard's Save, at the user's decision
   * (2026-09-22): the chart leaves the dashboard and joins the folder.
   */
  it('saves a chart local to this dashboard into a folder, as a library chart (T133)', async () => {
    const { documents, written } = store({ c1: chart('d1') });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart(), version: 5 }],
    });

    expect(response.statusCode).toBe(200);
    expect(written).toEqual([
      { kind: 'chart', id: 'c1', body: chart(), expectedVersion: 5 },
      { kind: 'dashboard', id: 'd1', body: { title: 'Revenue' }, expectedVersion: 3 },
    ]);
    await app.close();
  });

  it('refuses a chart made a library chart with no folder to be in (T133’s review)', async () => {
    const { documents, written } = store({ c1: chart('d1') });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });
    // A library chart's body, local to no dashboard and in no folder.
    const inNoFolder = { schemaVersion: 1, title: 'Orders', chart: chart().chart };

    const published = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: inNoFolder, version: 5 }],
    });
    const created = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c-new', body: inNoFolder, version: 0 }],
    });

    expect([published.statusCode, created.statusCode]).toEqual([400, 400]);
    expect(written).toEqual([]);
    await app.close();
  });

  it('creates a new chart saved to a folder before its first save straight into it (T133)', async () => {
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c-new', body: chart(), version: 0 }],
    });

    expect(response.statusCode).toBe(200);
    expect(written).toContainEqual({
      kind: 'chart',
      id: 'c-new',
      body: chart(),
      expectedVersion: 0,
    });
    await app.close();
  });

  it('writes a library chart edited from a tile, for every dashboard that uses it (T134)', async () => {
    /**
     * A library chart can be on other dashboards. The editor says so, with
     * the count, and offers a local copy first (AC-128); kept, the edit is
     * saved everywhere — the user's decision (2026-09-22) — at the version it
     * was read at, as any chart's.
     */
    const { documents, written } = store({ c1: chart() });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart(), version: 5 }],
    });

    expect(response.statusCode).toBe(200);
    expect(written).toEqual([
      { kind: 'chart', id: 'c1', body: chart(), expectedVersion: 5 },
      { kind: 'dashboard', id: 'd1', body: { title: 'Revenue' }, expectedVersion: 3 },
    ]);
    await app.close();
  });

  it('refuses to make a library chart this dashboard’s own: a local copy is a new chart (T134)', async () => {
    const { documents, written } = store({ c1: chart() });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/local copy/);
    expect(written).toEqual([]);
    await app.close();
  });

  it('refuses a chart local to another dashboard, and writes nothing', async () => {
    // That dashboard's to save, not this one's.
    const { documents, written } = store({ c1: chart('d2') });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d2'), version: 5 }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/another dashboard/);
    expect(written).toEqual([]);
    await app.close();
  });

  it('refuses a chart changed since it was read, before trusting where it says it belongs', async () => {
    /**
     * Where a chart belongs is read before the transaction. That is sound
     * only for the version the client read: at any other version the stored
     * chart may have been made a library chart since, and a client sending a
     * later version than it read would have its write judged by a locality
     * nobody checked. So a version mismatch is the conflict it is, at once.
     */
    const { documents, written } = store({ c1: chart('d1') }, { c1: 7 });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().document).toEqual({ kind: 'chart', id: 'c1' });
    expect(written).toEqual([]);
    await app.close();
  });

  it('says a stored chart it cannot read is unreadable, not a server fault', async () => {
    // As the document GET does (422): a known condition with a reason.
    const { documents, written } = store({});
    const app = buildServer({
      config,
      documents: {
        ...documents,
        get: async () => {
          throw new ChartDocumentError(
            'The stored chart is version 9, but this wechart understands only up to 1.',
          );
        },
      },
      cube: stubCube(() => ({})),
    });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatch(/version 9/);
    expect(written).toEqual([]);
    await app.close();
  });

  it('refuses a body that would move a chart off this dashboard', async () => {
    // The stored chart is local here, but the body sent would make it another
    // dashboard's — a dashboard save does not re-home charts.
    const { documents, written } = store({ c1: chart('d1') });
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('elsewhere'), version: 5 }],
    });

    expect(response.statusCode).toBe(400);
    expect(written).toEqual([]);
    await app.close();
  });

  it('says a chart is missing rather than writing around it', async () => {
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'gone', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(404);
    expect(written).toEqual([]);
    await app.close();
  });

  it('answers a stale document with 409, naming which', async () => {
    const { documents } = store({ c1: chart('d1') });
    const app = buildServer({
      config,
      documents: {
        ...documents,
        updateTogether: async () => {
          const stale = new Error('This chart changed since you opened it.');
          stale.name = 'StaleDocumentError';
          Object.assign(stale, { kind: 'chart', id: 'c1' });
          throw stale;
        },
      },
      cube: stubCube(() => ({})),
    });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().document).toEqual({ kind: 'chart', id: 'c1' });
    await app.close();
  });

  it('answers a deadlock as the same conflict', async () => {
    /**
     * Two overlapping saves can deadlock; Postgres aborts one with 40P01
     * (docs/research/db-access.md). Retrying could only end stale — the
     * survivor has moved the versions on — so it is answered as the conflict
     * it is, rather than as a server fault.
     */
    const { documents } = store({ c1: chart('d1') });
    const app = buildServer({
      config,
      documents: {
        ...documents,
        updateTogether: async () => {
          throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
        },
      },
      cube: stubCube(() => ({})),
    });

    const response = await save(app, {
      dashboard: { body: { title: 'Revenue' }, version: 3 },
      charts: [{ id: 'c1', body: chart('d1'), version: 5 }],
    });

    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it('refuses a request it cannot read', async () => {
    const { documents, written } = store({});
    const app = buildServer({ config, documents, cube: stubCube(() => ({})) });

    const response = await save(app, { dashboard: { body: { title: 'Revenue' } }, charts: [] });

    expect(response.statusCode).toBe(400);
    expect(written).toEqual([]);
    await app.close();
  });
});

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * The match is Cube's own word (`/v1/sql`); the reason, read from its dry run
 * against the rollups it compiled (`preaggMatch.ts`). Cube's answers here are
 * the shapes the local Cube gave (research/cube/pre-aggregations.md).
 */
describe('whether a query is served from a rollup (AC-144)', () => {
  const query = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.id'] };

  function cubeAnswering(used: unknown[]) {
    const asked: string[] = [];
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: config.securityContext,
      fetchImpl: (async (url: string) => {
        const { pathname, searchParams } = new URL(url);
        asked.push(`${pathname}?${[...searchParams.keys()].join('&')}`);
        expect(JSON.parse(searchParams.get('query') ?? 'null')).toEqual(
          pathname.endsWith('/v1/meta') ? null : query,
        );
        if (pathname.endsWith('/v1/sql'))
          return new Response(
            JSON.stringify({ sql: { external: used.length > 0, preAggregations: used } }),
          );
        if (pathname.endsWith('/v1/dry-run'))
          return new Response(
            JSON.stringify({
              transformedQueries: [
                {
                  leafMeasures: ['monthly_orders.count'],
                  measureToLeafMeasures: {
                    'monthly_orders.count': [
                      { measure: 'monthly_orders.count', additive: true, type: 'count' },
                    ],
                  },
                  ownedDimensions: ['monthly_orders.id'],
                  ownedTimeDimensionsWithRollupGranularity: [],
                },
              ],
            }),
          );
        return new Response(
          JSON.stringify({
            cubes: [
              {
                name: 'monthly_orders',
                title: 'Monthly Orders',
                measures: [{ name: 'monthly_orders.count', title: 'Monthly Orders Count' }],
                dimensions: [{ name: 'monthly_orders.id', title: 'Monthly Orders ID' }],
                preAggregations: [
                  {
                    name: 'by_status_month',
                    type: 'rollup',
                    measureReferences: '[count, total_amount]',
                    dimensionReferences: '[status]',
                    timeDimensionReference: 'ordered_at',
                    granularity: 'month',
                  },
                ],
              },
            ],
          }),
        );
      }) as typeof fetch,
    });
    return { cube, asked };
  }

  it('reports the rollup Cube says it will use, and asks nothing more', async () => {
    const { cube, asked } = cubeAnswering([
      { preAggregationId: 'monthly_orders.by_status_month', tableName: 'prod_pre_aggregations.x' },
    ]);
    const app = buildServer({ config, cube });

    const response = await app.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ matched: 'monthly_orders.by_status_month' });
    expect(asked).toEqual(['/cubejs-api/v1/sql?query']);
    await app.close();
  });

  /**
   * T403, AC-220: named by its title, never its internal name — the member
   * and the reason alike, in the compiled model's titles; its name kept
   * beside them for what matches on it.
   */
  it('on a miss, names the member that stops the nearest rollup, by its title', async () => {
    const { cube, asked } = cubeAnswering([]);
    const app = buildServer({ config, cube });

    const response = await app.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });

    expect(response.json()).toEqual({
      matched: null,
      miss: {
        rollup: 'monthly_orders.by_status_month',
        member: 'monthly_orders.id',
        title: 'Monthly Orders ID',
        reason: 'Monthly Orders ID is not one of the rollup’s dimensions.',
      },
    });
    expect(asked.sort()).toEqual([
      '/cubejs-api/v1/dry-run?query',
      '/cubejs-api/v1/meta?extended',
      '/cubejs-api/v1/sql?query',
    ]);
    await app.close();
  });

  it('refuses a request with no query', async () => {
    const { cube, asked } = cubeAnswering([]);
    const app = buildServer({ config, cube });

    const response = await app.inject({ method: 'POST', url: '/api/acceleration', payload: {} });

    expect(response.statusCode).toBe(400);
    expect(asked).toEqual([]);
    await app.close();
  });

  it('passes Cube’s refusal on as Cube’s, rather than calling it a miss (T150’s review)', async () => {
    const cube = new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: config.securityContext,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: "Can't find join path to join 'a', 'b'" }), {
          status: 400,
        })) as unknown as typeof fetch,
    });
    const app = buildServer({ config, cube });

    const response = await app.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Can't find join path to join 'a', 'b'",
      source: 'cube',
    });
    await app.close();
  });

  /**
   * A plan Cube gives as a list, one per query it runs, matches only if every
   * query does: "all-or-nothing" (research/cube/pre-aggregations.md §2,
   * "Multi-fact and multi-stage queries"). T150 first reported the first
   * query's rollup as the match — a test that was wrong (T153's review).
   */
  function planning(plans: unknown, reasons: 'answer' | 'fail' = 'answer') {
    return new CubeClient({
      apiUrl: config.cubeApiUrl,
      apiSecret: SECRET,
      securityContext: config.securityContext,
      fetchImpl: (async (url: string) => {
        const { pathname } = new URL(url);
        if (pathname.endsWith('/v1/sql')) return new Response(JSON.stringify(plans));
        if (reasons === 'fail')
          return new Response(JSON.stringify({ error: 'Continue wait' }), { status: 500 });
        return new Response(
          JSON.stringify(
            pathname.endsWith('/v1/dry-run') ? { transformedQueries: [{}] } : { cubes: [] },
          ),
        );
      }) as unknown as typeof fetch,
    });
  }
  const used = {
    sql: { preAggregations: [{ preAggregationId: 'monthly_orders.by_status_month' }] },
  };

  it('matches a plan of several queries only if a rollup serves every one', async () => {
    const every = buildServer({ config, cube: planning([used, used]) });
    const one = buildServer({ config, cube: planning([{ sql: { preAggregations: [] } }, used]) });

    const all = await every.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });
    const partly = await one.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });

    expect(all.json()).toEqual({ matched: 'monthly_orders.by_status_month' });
    expect((partly.json() as { matched: unknown }).matched).toBeNull();
    await every.close();
    await one.close();
  });

  it('still says a query is not served when working out why fails (T153’s review)', async () => {
    // The miss is Cube's plan; the reason is extra. Without it the chart is
    // still one rollup-only mode would refuse, and must still say so.
    const app = buildServer({ config, cube: planning({ sql: { preAggregations: [] } }, 'fail') });

    const response = await app.inject({
      method: 'POST',
      url: '/api/acceleration',
      payload: { query },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ matched: null });
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

  it('seeds the model from the directory Cube reads, unless told another (T137)', () => {
    expect(loadConfig({ CUBE_API_SECRET: 'x', WECHART_MODEL_DIR: '/srv/model' }).modelDir).toBe(
      '/srv/model',
    );
    // By default the repository's own, which docker-compose mounts into Cube.
    expect(loadConfig({ CUBE_API_SECRET: 'x' }).modelDir).toMatch(/[/\\]infra[/\\]cube[/\\]model$/);
  });

  /**
   * T431, AC-327: Cube reads nothing from wechart (T447), so the model store's
   * key and address are nobody's: set, they are ignored, and refused nothing.
   */
  it('reads no model store settings: nothing reads the store any more', () => {
    const loaded = loadConfig({
      CUBE_API_SECRET: 'x',
      WECHART_MODEL_KEY: 'k',
      WECHART_CUBE_STORE_URL: 'http://host.docker.internal:4100/',
    });

    expect(Object.keys(loaded)).toEqual(Object.keys(loadConfig({ CUBE_API_SECRET: 'x' })));
    expect(JSON.stringify(loaded)).not.toContain('host.docker.internal');
  });
});

describe('the tokens Cube is sent (T431, AC-327)', () => {
  it('name no model store: Cube has none to read from', async () => {
    const payloads: Record<string, unknown>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const token = String((init.headers as Record<string, string>)['authorization']).split(' ')[1];
      payloads.push(JSON.parse(Buffer.from(token?.split('.')[1] ?? '', 'base64url').toString()));
      return new Response('{"cubes":[]}');
    }) as typeof fetch;
    try {
      const app = buildServer({ config });
      await app.inject({ method: 'GET', url: '/api/meta' });
      await app.close();
    } finally {
      globalThis.fetch = original;
    }

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ tenant: 'acme' });
    expect(payloads[0]).not.toHaveProperty('wechartStore');
    expect(payloads[0]).not.toHaveProperty('wechartDraft');
  });
});
