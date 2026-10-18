import { type CallToolResult, fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult } from '../result';
import type { McpCall, McpTool, WebAnswer } from '../server';
import { ID, refusedBy } from './read';

/**
 * Editing in My workspace through MCP (T785 on, AC-438, AC-432): each tool
 * asks the web app's own route as the token's owner, so it changes only what
 * the web app lets them change, and only in their workspace. Every tool here
 * needs the workspace-edit scope (AC-469); without it, the call is answered
 * 403 `insufficient_scope` before it runs (AC-433, `scopes.ts`).
 */

/** What a change answers: what the route said, under the marked field (AC-443). */
function changed(answer: WebAnswer, key: string): CallToolResult {
  if (answer.status !== 200 && answer.status !== 201) return refusedBy(answer);
  return dataResult({ [key]: answer.body });
}

/** The time zone a copy's project folder is named in, unless the client gives one. */
const DEFAULT_TIME_ZONE = 'UTC';

interface CopyArgs {
  readonly kind: 'dashboard' | 'chart' | 'model';
  readonly id?: string;
  readonly folderId?: string;
  readonly path?: string;
  readonly timeZone?: string;
  readonly into?: string;
}

const COPY_ARGS = fromJsonSchema<CopyArgs>({
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['dashboard', 'chart', 'model'],
      description: 'What to copy: a shared dashboard, a library chart, or a model file.',
    },
    id: { type: 'string', pattern: ID, description: 'The dashboard’s or chart’s id.' },
    folderId: {
      type: 'string',
      pattern: ID,
      description: 'For a model file: the shared folder whose model holds it.',
    },
    path: {
      type: 'string',
      minLength: 1,
      description: 'For a model file: its path in that folder’s model.',
    },
    timeZone: {
      type: 'string',
      minLength: 1,
      description:
        'The IANA time zone the copy’s project folder is named in, by the minute it is made; UTC unless given.',
    },
    into: {
      type: 'string',
      pattern: ID,
      description:
        'For a model file: a folder of your workspace to copy it into, such as the project folder a dashboard’s copy was given, as the web app copies a dashboard’s models with it; "mine" for My workspace itself. A project folder of its own unless given.',
    },
  },
  required: ['kind'],
  additionalProperties: false,
});

/** "Edit in my workspace", as the web app's route makes it (`[R48-5]`, AC-278, AC-368). */
async function copyIn(args: unknown, call: McpCall): Promise<CallToolResult> {
  const { kind, id, folderId, path, into, timeZone = DEFAULT_TIME_ZONE } = args as CopyArgs;
  // A model's `into` is the route's to check: a folder of the caller's own workspace (T763).
  const body =
    kind === 'model'
      ? { kind, folderId, path, timeZone, ...(into === undefined ? {} : { into }) }
      : { kind, id, timeZone };
  return changed(await call.ask('/api/workspace/copies', { method: 'POST', body }), 'copy');
}

export const EDIT_IN_MY_WORKSPACE: McpTool = {
  name: 'edit_in_my_workspace',
  description:
    'Copies a shared dashboard, library chart or model file into your My workspace, in a project folder of its own, as wechart’s Edit in my workspace does, so you can change it there and propose it back. Where you have a copy already, it is opened instead. The shared one is never changed.',
  scope: 'workspace-edit',
  inputSchema: COPY_ARGS,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: copyIn,
};

/** The workspace tools, in the order `tools/list` gives them. */
export const WORKSPACE_TOOLS: readonly McpTool[] = [EDIT_IN_MY_WORKSPACE];
