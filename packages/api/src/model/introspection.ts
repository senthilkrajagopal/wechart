import type { FastifyInstance, FastifyReply } from 'fastify';

import type { CubeClient } from '../cube/client';
import { checkScaffold, type UnmappedColumn } from './scaffoldCheck';

/**
 * The browser's way to a data source's catalog (T145, AC-139): the five
 * routes of the data-source introspection API in the user's Cube fork
 * (research/cube/introspection-api.md), asked by wechart's API with a token
 * of its own that carries the `introspection` scope and never leaves it
 * (T275, AC-250). The answers are Cube's, less anything of the token's.
 *
 * - `GET  /api/introspection/sources`
 * - `GET  /api/introspection/sources/:source/schemas?search=`
 * - `GET  /api/introspection/sources/:source/tables?schema=…&search=&type=…&limit=&offset=`
 * - `POST /api/introspection/sources/:source/columns` `{ tables }`
 * - `POST /api/introspection/sources/:source/scaffold` `{ tables }`: YAML
 *   always, the model store and its editor being YAML's; each cube read
 *   against its table's columns for what it lost unsaid (`countMeasure`, and
 *   `member_name_taken` among its `unmappedColumns`: scaffoldCheck.ts).
 *
 * Cube reads the catalog through the data source's query queue, and when that
 * outlasts its wait the request is asked again, as a query is. Its docs say
 * `200 {"error":"Continue wait"}`; the fork lets the queue's error escape as
 * `500 {"error":"Error: Continue wait"}` (research, "Errors"). Both are waits.
 */

/** How often a "Continue wait" is asked again before wechart gives up. */
const WAITS = 30;

function isWait(status: number, error: unknown): boolean {
  return (
    (status === 200 && error === 'Continue wait') ||
    (status === 500 && error === 'Error: Continue wait')
  );
}

interface Table {
  readonly schema: string;
  readonly table: string;
}

function tablesOf(body: unknown): Table[] | undefined {
  const tables = (body as { tables?: unknown } | null)?.tables;
  if (!Array.isArray(tables)) return undefined;
  const read = tables.map((each: unknown) => {
    const { schema, table } = (each ?? {}) as { schema?: unknown; table?: unknown };
    return typeof schema === 'string' && typeof table === 'string' ? { schema, table } : undefined;
  });
  return read.every((each) => each !== undefined) ? (read as Table[]) : undefined;
}

/** The query string as asked, its repeated parameters kept (`schema=a&schema=b`). */
function queryOf(url: string): string {
  const at = url.indexOf('?');
  return at < 0 ? '' : url.slice(at);
}

export function registerIntrospection(
  app: FastifyInstance,
  client: CubeClient,
  { retryMs = 1000 }: { retryMs?: number } = {},
): void {
  const base = '/v1/introspection/data-sources';

  /** Cube's answer, asked again while it says to wait; a refusal in the API's words. */
  async function askCube(
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<Answer> {
    for (let wait = 0; ; wait += 1) {
      const { status, body } = await client.introspect(path, init);
      const error = (body as { error?: unknown } | null)?.error;
      if (isWait(status, error) && wait < WAITS) {
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        continue;
      }
      if (status === 403)
        return {
          status: 503,
          body: {
            error:
              'Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).',
          },
        };
      if (isWait(status, error))
        return {
          status: 504,
          body: {
            error: 'Cube is still reading the data source’s catalog. Try again in a moment.',
          },
        };
      if (status >= 400)
        return {
          status,
          body: { error: typeof error === 'string' ? error : `Cube answered ${String(status)}.` },
        };
      return { status: 200, body };
    }
  }

  const send = (reply: FastifyReply, { status, body }: Answer) => reply.status(status).send(body);
  const sourcePath = (source: string) => `${base}/${encodeURIComponent(source)}`;

  app.get('/api/introspection/sources', async (_request, reply) =>
    send(reply, await askCube(base)),
  );

  app.get('/api/introspection/sources/:source/schemas', async (request, reply) => {
    const { source } = request.params as { source: string };
    return send(reply, await askCube(`${sourcePath(source)}/schemas${queryOf(request.url)}`));
  });

  app.get('/api/introspection/sources/:source/tables', async (request, reply) => {
    const { source } = request.params as { source: string };
    return send(reply, await askCube(`${sourcePath(source)}/tables${queryOf(request.url)}`));
  });

  for (const route of ['columns', 'scaffold'] as const)
    app.post(`/api/introspection/sources/:source/${route}`, async (request, reply) => {
      const { source } = request.params as { source: string };
      const tables = tablesOf(request.body);
      if (tables === undefined)
        return reply
          .status(400)
          .send({ error: 'Name the tables as a list, each with its schema and table.' });
      const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });
      const columns = await askCube(`${sourcePath(source)}/columns`, post({ tables }));
      if (route === 'columns' || columns.status !== 200) return send(reply, columns);
      const scaffold = await askCube(
        `${sourcePath(source)}/scaffold`,
        post({ tables, format: 'yaml' }),
      );
      if (scaffold.status !== 200) return send(reply, scaffold);
      return checked(scaffold.body, columns.body);
    });
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

interface ScaffoldedCube {
  readonly content: string;
  readonly table?: Table;
  readonly unmappedColumns: readonly UnmappedColumn[];
}

/** Each scaffolded cube, with what it lost that Cube didn't say (scaffoldCheck.ts). */
function checked(scaffold: unknown, columns: unknown): unknown {
  const tables =
    (columns as { tables?: { schema: string; name: string; columns: Column[] }[] } | null)
      ?.tables ?? [];
  const cubes = (scaffold as { cubes?: ScaffoldedCube[] } | null)?.cubes ?? [];
  return {
    cubes: cubes.map((cube) => {
      const table = tables.find(
        (each) => each.schema === cube.table?.schema && each.name === cube.table.table,
      );
      return { ...cube, ...checkScaffold(table?.columns ?? [], cube) };
    }),
  };
}

interface Column {
  readonly name: string;
  readonly rawType: string;
}
