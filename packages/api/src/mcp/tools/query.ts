import { type CallToolResult, fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult, refusal } from '../result';
import type { McpTool } from '../server';
import { ID, READ_ONLY, refusedBy } from './read';

/**
 * Querying cubes and views through MCP (T784, AC-437, AC-432): the web
 * app's own `/api/load`, asked as the token's owner, so a query is checked
 * as theirs is in the web app (T340, AC-268): it names the item it serves,
 * one they may open, and only cubes and views that item uses; a Super-Admin
 * may name none. Cube is asked with their groups, so its access policies
 * apply as they do in the web app (AC-008). Its rows, and the model's titles
 * in its annotation, come under the result's marked field (AC-443), paged
 * past 1,000 rows or 50,000 characters (AC-475).
 */

/**
 * How many times a query is asked while Cube answers "Continue wait": at
 * its default 10 s long poll, about two minutes (T784's review; the lane's
 * call). The web app asks up to 240 times (`loadTile.ts`).
 */
export const MAX_WAITS = 12;
/** What a query still running after them says: fixed text. */
export const QUERY_STILL_RUNNING =
  'Cube is still running this query. Ask the same query again to wait for its rows.';

interface QueryArgs {
  readonly query: Record<string, unknown>;
  readonly for?: { readonly kind: 'dashboard' | 'chart' | 'proposal'; readonly id: string };
}

const QUERY_ARGS = fromJsonSchema<QueryArgs>({
  type: 'object',
  properties: {
    query: {
      type: 'object',
      description:
        'A Cube query, as Cube’s REST API takes it: measures, dimensions, timeDimensions, filters, segments, order, limit and offset, naming members as "cube.member".',
    },
    for: {
      type: 'object',
      description:
        'The dashboard or chart the query serves, as wechart’s web app names it with each query. Its cubes and views are those the query may name. Only a Super-Admin may leave it out.',
      properties: {
        kind: { type: 'string', enum: ['dashboard', 'chart', 'proposal'] },
        id: { type: 'string', pattern: ID },
      },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  required: ['query'],
  additionalProperties: false,
});

/** Cube's answer to a query it is still running (`cube/data-apis.md` §4). */
const CONTINUE_WAIT = 'Continue wait';

interface LoadResult {
  readonly data?: unknown;
  readonly annotation?: unknown;
}

/**
 * Cube's answer as the tool gives it, its rows under `rows`, so they are
 * paged by 1,000 (AC-475). One result: its `data` and `annotation`. Several
 * at once (`queryType: "multi"`, such as a compareDateRange query, whose
 * every row names its range): their rows in order, how many each gave,
 * and each one's annotation (T784's review; `cube/data-apis.md`,
 * "With `queryType=multi`"). Anything else, whole.
 */
function rowsOf(body: unknown): CallToolResult {
  const { data, annotation, results, queryType } = (body ?? {}) as LoadResult & {
    readonly results?: unknown;
    readonly queryType?: unknown;
  };
  if (Array.isArray(data))
    return dataResult({ rows: data, ...(annotation === undefined ? {} : { annotation }) });
  if (Array.isArray(results)) {
    const each = (results as LoadResult[]).map((result) =>
      Array.isArray(result?.data) ? (result.data as unknown[]) : [],
    );
    return dataResult({
      ...(typeof queryType === 'string' ? { queryType } : {}),
      rowsPerResult: each.map((rows) => rows.length),
      annotations: (results as LoadResult[]).map((result) => result?.annotation ?? null),
      rows: each.flat(),
    });
  }
  return dataResult({ answer: body });
}

export const QUERY_TOOL: McpTool = {
  name: 'query',
  description:
    'Runs a query on cubes and views, as wechart’s web app runs it for you, and gives its rows and the members’ titles.',
  scope: 'read',
  inputSchema: QUERY_ARGS,
  // A query reads, but asked again may answer anew.
  annotations: { ...READ_ONLY, idempotentHint: false },
  rows: 'rows',
  async run(args, call) {
    const { query, for: item } = args as QueryArgs;
    const body = item === undefined ? { query } : { query, for: item };
    // Asked again while Cube says "Continue wait", as the web app does
    // (`cube/data-apis.md` §4: clients "should continuously retry the same
    // query"); still running after `MAX_WAITS`, said so (T784's review).
    for (let asked = 0; asked < MAX_WAITS; asked += 1) {
      const answer = await call.ask('/api/load', { method: 'POST', body });
      if (answer.status !== 200) return refusedBy(answer);
      if ((answer.body as { error?: unknown } | null)?.error === CONTINUE_WAIT) continue;
      return rowsOf(answer.body);
    }
    return refusal(QUERY_STILL_RUNNING);
  },
};
