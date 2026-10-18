import { fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult } from '../result';
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
    const answer = await call.ask('/api/load', {
      method: 'POST',
      body: item === undefined ? { query } : { query, for: item },
    });
    if (answer.status !== 200) return refusedBy(answer);
    const { data, annotation } = (answer.body ?? {}) as { data?: unknown; annotation?: unknown };
    // A query Cube answers otherwise than with one set of rows (several
    // queries at once): its whole answer, in parts if it must be.
    if (!Array.isArray(data)) return dataResult({ answer: answer.body });
    return dataResult({ rows: data, ...(annotation === undefined ? {} : { annotation }) });
  },
};
