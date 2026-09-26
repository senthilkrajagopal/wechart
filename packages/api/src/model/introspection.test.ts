import { describe, expect, it } from 'vitest';

import { CubeClient } from '../cube/client';
import { buildServer } from '../server';

/**
 * T145 / AC-139: the API's proxy to the introspection API in the user's Cube
 * fork (research/cube/introspection-api.md): the browser asks wechart, and
 * wechart asks Cube with a token of its own (T275) — so, for AC-250, no
 * answer the browser gets carries a token.
 */
const config = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  port: 4100,
  modelDir: '',
};

type Answer = (path: string, init: RequestInit) => Response;

function cubeAnswering(answer: Answer) {
  const sent: { path: string; method: string; body: unknown; authorization: string }[] = [];
  const cube = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: config.cubeApiSecret,
    securityContext: config.securityContext,
    fetchImpl: (async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url);
      sent.push({
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method ?? 'GET',
        body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
        authorization: String((init.headers as Record<string, string>)['authorization']),
      });
      return answer(`${parsed.pathname}${parsed.search}`, init);
    }) as typeof fetch,
  });
  return { app: buildServer({ config, cube, introspectionRetryMs: 1 }), sent };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const BASE = '/cubejs-api/v1/introspection/data-sources';

describe('browsing a data source through wechart (AC-139)', () => {
  it('lists the sources, a source’s schemas, and its tables with every parameter passed on', async () => {
    const { app, sent } = cubeAnswering((path) =>
      path.startsWith(`${BASE}/default/tables`)
        ? json({ tables: [{ schema: 'generate', name: 'chrome_stores', type: 'table' }], total: 1 })
        : path.startsWith(`${BASE}/default/schemas`)
          ? json({ schemas: [{ name: 'generate' }, { name: 'public' }] })
          : json({ dataSources: [{ dataSource: 'default', dbType: 'postgres' }] }),
    );

    const sources = await app.inject({ url: '/api/introspection/sources' });
    expect(sources.json()).toEqual({
      dataSources: [{ dataSource: 'default', dbType: 'postgres' }],
    });
    const schemas = await app.inject({
      url: '/api/introspection/sources/default/schemas?search=gen',
    });
    expect(schemas.json()).toEqual({ schemas: [{ name: 'generate' }, { name: 'public' }] });
    const tables = await app.inject({
      url: '/api/introspection/sources/default/tables?schema=generate&schema=public&search=stores&type=table&type=view&limit=50&offset=50',
    });
    expect(tables.json()).toEqual({
      tables: [{ schema: 'generate', name: 'chrome_stores', type: 'table' }],
      total: 1,
    });

    expect(sent.map(({ path, method }) => `${method} ${path}`)).toEqual([
      `GET ${BASE}`,
      `GET ${BASE}/default/schemas?search=gen`,
      `GET ${BASE}/default/tables?schema=generate&schema=public&search=stores&type=table&type=view&limit=50&offset=50`,
    ]);
    await app.close();
  });

  it('reads tables’ columns, and generates their cubes as YAML', async () => {
    const { app, sent } = cubeAnswering((path) =>
      path.endsWith('/columns')
        ? json({ tables: [{ schema: 'generate', name: 'chrome_stores', columns: [] }] })
        : json({
            cubes: [
              {
                cube: 'chrome_stores',
                fileName: 'chrome_stores.yml',
                content: 'cubes: []',
                unmappedColumns: [],
              },
            ],
          }),
    );
    const tables = [{ schema: 'generate', table: 'chrome_stores' }];

    const columns = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/columns',
      payload: { tables },
    });
    expect(columns.statusCode).toBe(200);
    const scaffold = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/scaffold',
      payload: { tables, format: 'js' },
    });
    expect(scaffold.json()).toEqual({
      cubes: [
        {
          cube: 'chrome_stores',
          fileName: 'chrome_stores.yml',
          content: 'cubes: []',
          unmappedColumns: [],
          // No cube in it to check against the table, and said so (T145's review).
          unchecked: true,
        },
      ],
    });
    // Always YAML: the model store and its editor are YAML's (whatever was
    // asked). And the scaffold's tables' columns are read first, to check it by.
    expect(sent.map(({ path, body }) => [path, body])).toEqual([
      [`${BASE}/default/columns`, { tables }],
      [`${BASE}/default/columns`, { tables }],
      [`${BASE}/default/scaffold`, { tables, format: 'yaml' }],
    ]);
    await app.close();
  });

  /** AC-139 `Fails when: … a column is dropped without saying so` (research, "Silent losses"). */
  it('says which columns a generated cube lost that Cube did not say, and whether its count is left', async () => {
    const { app } = cubeAnswering((path) =>
      path.endsWith('/columns')
        ? json({
            tables: [
              {
                schema: 'public',
                name: 'sales',
                columns: [
                  { name: 'id', rawType: 'integer' },
                  { name: 'Amount', rawType: 'numeric' },
                  { name: 'amount', rawType: 'numeric' },
                  { name: 'count', rawType: 'integer' },
                ],
              },
            ],
          })
        : json({
            cubes: [
              {
                cube: 'sales',
                fileName: 'sales.yml',
                table: { schema: 'public', table: 'sales' },
                content: [
                  'cubes:',
                  '  - name: sales',
                  '    dimensions:',
                  '      - {name: id, sql: id, type: number, primary_key: true}',
                  '    measures:',
                  '      - {name: count, sql: count, type: sum}',
                  '      - {name: amount, sql: amount, type: sum}',
                ].join('\n'),
                unmappedColumns: [],
              },
            ],
          }),
    );

    const scaffold = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/scaffold',
      payload: { tables: [{ schema: 'public', table: 'sales' }] },
    });
    const [cube] = (scaffold.json() as { cubes: Record<string, unknown>[] }).cubes;
    expect([cube?.['unmappedColumns'], cube?.['countMeasure']]).toEqual([
      [{ name: 'Amount', rawType: 'numeric', reason: 'member_name_taken' }],
      false,
    ]);
    await app.close();
  });

  it('generates nothing when the tables’ columns cannot be read, saying Cube’s reason', async () => {
    const { app, sent } = cubeAnswering(() =>
      json({ error: "The 'default' data source has no table public.ghost" }, 404),
    );

    const scaffold = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/scaffold',
      payload: { tables: [{ schema: 'public', table: 'ghost' }] },
    });
    expect([scaffold.statusCode, scaffold.json()]).toEqual([
      404,
      { error: "The 'default' data source has no table public.ghost" },
    ]);
    expect(sent.map(({ path }) => path)).toEqual([`${BASE}/default/columns`]);
    await app.close();
  });

  it('asks again while Cube says to wait, as a query is asked again', async () => {
    let asked = 0;
    const { app } = cubeAnswering(() => {
      asked += 1;
      return asked < 3 ? json({ error: 'Continue wait' }) : json({ schemas: [{ name: 'public' }] });
    });

    const response = await app.inject({ url: '/api/introspection/sources/default/schemas' });
    expect(response.json()).toEqual({ schemas: [{ name: 'public' }] });
    expect(asked).toBe(3);
    await app.close();
  });

  /** Research, "Errors": an earlier build of the fork let the queue's wait escape as a 500, not the documented 200. */
  it('asks again when the wait comes back as the 500 an earlier fork build answered it with', async () => {
    let asked = 0;
    const { app } = cubeAnswering(() => {
      asked += 1;
      return asked < 3
        ? json({ error: 'Error: Continue wait' }, 500)
        : json({ tables: [{ schema: 'generate', name: 'chrome_stores', columns: [] }] });
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/columns',
      payload: { tables: [{ schema: 'generate', table: 'chrome_stores' }] },
    });
    expect([response.statusCode, response.json()]).toEqual([
      200,
      { tables: [{ schema: 'generate', name: 'chrome_stores', columns: [] }] },
    ]);
    expect(asked).toBe(3);
    await app.close();
  });

  it('gives up, saying so, when Cube is still waiting after every retry', async () => {
    let asked = 0;
    const { app } = cubeAnswering(() => {
      asked += 1;
      return json({ error: 'Error: Continue wait' }, 500);
    });

    const response = await app.inject({ url: '/api/introspection/sources/default/schemas' });
    expect([response.statusCode, response.json()]).toEqual([
      504,
      { error: 'Cube is still reading the data source’s catalog. Try again in a moment.' },
    ]);
    expect(asked).toBe(31);
    await app.close();
  });

  it('says Cube’s refusals in its own words, with Cube’s reason', async () => {
    const { app } = cubeAnswering((path) =>
      path.includes('/nowhere/')
        ? json({ error: "Unknown data source: 'nowhere'" }, 404)
        : path.endsWith('/columns')
          ? json({ error: "The 'default' data source has no table public.ghost" }, 404)
          : json({ error: 'API scope is missing: introspection' }, 403),
    );

    const unknown = await app.inject({ url: '/api/introspection/sources/nowhere/schemas' });
    expect([unknown.statusCode, unknown.json()]).toEqual([
      404,
      { error: "Unknown data source: 'nowhere'" },
    ]);
    const ghost = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/columns',
      payload: { tables: [{ schema: 'public', table: 'ghost' }] },
    });
    expect([ghost.statusCode, ghost.json()]).toEqual([
      404,
      { error: "The 'default' data source has no table public.ghost" },
    ]);
    const refused = await app.inject({ url: '/api/introspection/sources' });
    expect([refused.statusCode, refused.json()]).toEqual([
      503,
      {
        error:
          'Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).',
      },
    ]);
    await app.close();
  });

  /** T145's review: a 403 is a missing scope only when Cube says so. */
  it('gives Cube’s reason when it refuses wechart’s token for another cause than the scope', async () => {
    const { app } = cubeAnswering(() => json({ error: 'Invalid token' }, 403));

    const refused = await app.inject({ url: '/api/introspection/sources' });
    expect([refused.statusCode, refused.json()]).toEqual([
      502,
      { error: 'Cube refused wechart’s token: Invalid token' },
    ]);
    await app.close();
  });

  /** T145's review: `..` would climb out of the data source's routes once fetch resolves it. */
  it('asks Cube of no data source named . or ..', async () => {
    const { app, sent } = cubeAnswering(() => json({ tables: [], total: 0 }));
    // Over a socket: `inject` resolves dots in the URL itself, as an HTTP server does not.
    const { port } = new URL(await app.listen({ port: 0, host: '127.0.0.1' }));
    const { request } = await import('node:http');
    // A raw path: a URL string would be parsed, and its dots resolved, before sending.
    const statusOf = (path: string) =>
      new Promise<number | undefined>((resolve, reject) => {
        request({ host: '127.0.0.1', port: Number(port), path }, (response) => {
          response.resume();
          resolve(response.statusCode);
        })
          .on('error', reject)
          .end();
      });

    for (const source of ['%2E%2E', '%2e', '.%2E'])
      expect(await statusOf(`/api/introspection/sources/${source}/tables?schema=x`), source).toBe(
        404,
      );
    expect(sent).toEqual([]);
    await app.close();
  });

  /** AC-250: what the browser gets back never holds a token, introspection's or any. */
  it('hands the browser no token, whatever Cube answers', async () => {
    const { app, sent } = cubeAnswering(() => json({ dataSources: [] }));

    const response = await app.inject({ url: '/api/introspection/sources' });

    const token = sent[0]?.authorization.replace(/^Bearer /, '') ?? '';
    expect(token.split('.')).toHaveLength(3);
    expect(response.body).not.toContain(token);
    expect(response.body).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    expect(Object.keys(response.headers).map((name) => name.toLowerCase())).not.toContain(
      'authorization',
    );
    await app.close();
  });

  it('refuses a request whose tables are not a list of schema and table', async () => {
    const { app, sent } = cubeAnswering(() => json({}));

    const response = await app.inject({
      method: 'POST',
      url: '/api/introspection/sources/default/scaffold',
      payload: { tables: 'orders' },
    });
    expect([response.statusCode, response.json()]).toEqual([
      400,
      { error: 'Name the tables as a list, each with its schema and table.' },
    ]);
    expect(sent).toHaveLength(0);
    await app.close();
  });
});
