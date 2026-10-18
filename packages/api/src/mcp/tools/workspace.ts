import {
  type CallToolResult,
  fromJsonSchema,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';

import { workspaceIdOf } from '../../repos/catalog';
import { dataResult, refusal } from '../result';
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
  if (answer.status < 200 || answer.status >= 300) return refusedBy(answer);
  return dataResult({ [key]: answer.body });
}

/** What a change aimed outside the owner's workspace is told: fixed text (T786). */
export const NOT_IN_MY_WORKSPACE =
  'Through MCP, only what is in your My workspace is made, changed or deleted, and this isn’t there. Copy a shared item in with edit_in_my_workspace, change it there and propose it.';

/** My workspace's root, as the web app's routes name it to its owner (T782-1). */
const MINE = 'mine';

/**
 * Whether `folderId` is the caller's own My workspace or a folder in it
 * (T786, AC-438): its folders as the web app lists them to the caller, each
 * followed up to its root, where their own workspace is `mine`. Another
 * user's workspace, a shared folder, or one they can't see, isn't.
 */
async function inMyWorkspace(call: McpCall, folderId: unknown): Promise<boolean> {
  if (typeof folderId !== 'string' || folderId === '') return false;
  // `mine` in a call's arguments reaches the tool as their own `ws:‹key›`: the
  // web app's hook names it so in every request's body, `/mcp`'s too (T786's review).
  const own = workspaceIdOf(call.caller.key);
  if (folderId === MINE || folderId === own) return true;
  const answer = await call.ask('/api/folders');
  if (answer.status !== 200 || !Array.isArray(answer.body)) return false;
  const parents = new Map(
    (answer.body as { id: string; parentId?: string | null }[]).map((folder) => [
      folder.id,
      folder.parentId ?? null,
    ]),
  );
  const seen = new Set<string>();
  for (let at: string | null | undefined = folderId; typeof at === 'string'; at = parents.get(at)) {
    if (at === MINE || at === own) return true;
    if (seen.has(at)) return false;
    seen.add(at);
  }
  return false;
}

/**
 * The folder that governs a dashboard or chart, as the web app reads it to
 * the caller: its own, or a dashboard's own chart's dashboard's. Undefined
 * with the route's refusal where they can't read it.
 */
async function governingFolderOf(
  call: McpCall,
  kind: 'dashboard' | 'chart',
  id: string,
): Promise<{ folderId: unknown } | { refused: WebAnswer }> {
  const answer = await call.ask(`/api/documents/${kind}/${encodeURIComponent(id)}`);
  if (answer.status !== 200) return { refused: answer };
  const body = (answer.body as { body?: Record<string, unknown> } | null)?.body ?? {};
  const dashboard = body['localToDashboardId'];
  if (kind === 'chart' && typeof dashboard === 'string')
    return governingFolderOf(call, 'dashboard', dashboard);
  return { folderId: body['folderId'] };
}

const outside = (): CallToolResult => refusal(NOT_IN_MY_WORKSPACE);

const CHANGE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const DESTROY: ToolAnnotations = { ...CHANGE, destructiveHint: true, idempotentHint: true };

const ITEM_KIND = {
  type: 'string',
  enum: ['dashboard', 'chart'],
  description: 'A dashboard or a chart.',
} as const;
const FOLDER_IN_WORKSPACE = {
  type: 'string',
  pattern: ID,
  description: 'A folder of your My workspace, or "mine" for its root.',
} as const;

interface CreateArgs {
  readonly kind: 'dashboard' | 'chart';
  readonly title: string;
  readonly folderId: string;
  readonly targetFolderId: string;
}

interface ChangeArgs {
  readonly kind: 'dashboard' | 'chart';
  readonly id: string;
  readonly body: Record<string, unknown>;
  readonly version: number;
}

interface ModelArgs {
  readonly folderId: string;
  readonly path: string;
  readonly content?: string;
  readonly targetFolderId?: string;
}

/** Creating, changing and deleting in My workspace (T786, AC-438). */
export const ITEM_TOOLS: readonly McpTool[] = [
  {
    name: 'create_item',
    description:
      'Creates a dashboard or chart in your My workspace, as the web app’s New does there, naming the shared folder it is to be proposed to.',
    scope: 'workspace-edit',
    inputSchema: fromJsonSchema<CreateArgs>({
      type: 'object',
      properties: {
        kind: ITEM_KIND,
        title: { type: 'string', minLength: 1, description: 'Its title.' },
        folderId: FOLDER_IN_WORKSPACE,
        targetFolderId: {
          type: 'string',
          pattern: ID,
          description: 'The shared folder it is to go to, one where you have read-write access.',
        },
      },
      required: ['kind', 'title', 'folderId', 'targetFolderId'],
      additionalProperties: false,
    }),
    annotations: CHANGE,
    async run(args, call) {
      const { kind, title, folderId, targetFolderId } = args as CreateArgs;
      if (!(await inMyWorkspace(call, folderId))) return outside();
      return changed(
        await call.ask('/api/documents', {
          method: 'POST',
          body: { kind, title, folderId, targetFolderId },
        }),
        'item',
      );
    },
  },
  {
    name: 'change_item',
    description:
      'Saves a dashboard’s or chart’s whole definition, as read_dashboard or read_chart gives its body, at the version read, as the web app saves it. Only one in your My workspace, kept there.',
    scope: 'workspace-edit',
    inputSchema: fromJsonSchema<ChangeArgs>({
      type: 'object',
      properties: {
        kind: ITEM_KIND,
        id: { type: 'string', pattern: ID, description: 'Its id.' },
        body: { type: 'object', description: 'Its whole definition, as read.' },
        version: {
          type: 'integer',
          minimum: 0,
          description: 'The version read; a save over a newer one is refused.',
        },
      },
      required: ['kind', 'id', 'body', 'version'],
      additionalProperties: false,
    }),
    annotations: CHANGE,
    async run(args, call) {
      const { kind, id, body, version } = args as ChangeArgs;
      const now = await governingFolderOf(call, kind, id);
      if ('refused' in now) return refusedBy(now.refused);
      if (!(await inMyWorkspace(call, now.folderId))) return outside();
      // Where it would be once saved: still in their workspace.
      const local = body['localToDashboardId'];
      const then =
        kind === 'chart' && typeof local === 'string'
          ? await governingFolderOf(call, 'dashboard', local)
          : { folderId: body['folderId'] };
      if ('refused' in then) return refusedBy(then.refused);
      if (!(await inMyWorkspace(call, then.folderId))) return outside();
      return changed(
        await call.ask(`/api/documents/${kind}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: { body, version },
        }),
        'item',
      );
    },
  },
  {
    name: 'delete_item',
    description:
      'Deletes a dashboard (with its own charts) or a chart from your My workspace, as the web app deletes it. Only one in your My workspace.',
    scope: 'workspace-edit',
    inputSchema: fromJsonSchema<{ kind: 'dashboard' | 'chart'; id: string }>({
      type: 'object',
      properties: { kind: ITEM_KIND, id: { type: 'string', pattern: ID, description: 'Its id.' } },
      required: ['kind', 'id'],
      additionalProperties: false,
    }),
    annotations: DESTROY,
    async run(args, call) {
      const { kind, id } = args as { kind: 'dashboard' | 'chart'; id: string };
      const now = await governingFolderOf(call, kind, id);
      if ('refused' in now) return refusedBy(now.refused);
      if (!(await inMyWorkspace(call, now.folderId))) return outside();
      const answer = await call.ask(`/api/documents/${kind}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (answer.status < 200 || answer.status >= 300) return refusedBy(answer);
      return dataResult({ deleted: { kind, id } });
    },
  },
  {
    name: 'save_model_file',
    description:
      'Saves a draft cube or view, one YAML model file declaring one, in your My workspace, as the web app saves a draft: checked as it is, its name included. A new file names the shared folder it is to go to.',
    scope: 'workspace-edit',
    inputSchema: fromJsonSchema<ModelArgs>({
      type: 'object',
      properties: {
        folderId: FOLDER_IN_WORKSPACE,
        path: {
          type: 'string',
          minLength: 1,
          description: 'Its path in the folder’s model, such as cubes/orders.yml.',
        },
        content: { type: 'string', minLength: 1, description: 'Its YAML.' },
        targetFolderId: {
          type: 'string',
          pattern: ID,
          description:
            'For a new file: the shared folder it is to go to, one where you have read-write access.',
        },
      },
      required: ['folderId', 'path', 'content'],
      additionalProperties: false,
    }),
    annotations: CHANGE,
    async run(args, call) {
      const { folderId, path, content, targetFolderId } = args as ModelArgs;
      if (!(await inMyWorkspace(call, folderId))) return outside();
      return changed(
        await call.ask('/api/model/publish', {
          method: 'POST',
          body: {
            folderId,
            files: [{ path, content }],
            ...(targetFolderId === undefined ? {} : { targetFolderId }),
          },
        }),
        'saved',
      );
    },
  },
  {
    name: 'delete_model_file',
    description:
      'Deletes a draft cube’s or view’s model file from your My workspace, as the web app deletes it. Only one in your My workspace.',
    scope: 'workspace-edit',
    inputSchema: fromJsonSchema<ModelArgs>({
      type: 'object',
      properties: {
        folderId: FOLDER_IN_WORKSPACE,
        path: { type: 'string', minLength: 1, description: 'Its path in the folder’s model.' },
      },
      required: ['folderId', 'path'],
      additionalProperties: false,
    }),
    annotations: DESTROY,
    async run(args, call) {
      const { folderId, path } = args as ModelArgs;
      if (!(await inMyWorkspace(call, folderId))) return outside();
      const query = new URLSearchParams({ folder: folderId, path });
      return changed(
        await call.ask(`/api/model/files?${query.toString()}`, { method: 'DELETE' }),
        'deleted',
      );
    },
  },
];

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
        'The IANA time zone the copy’s project folder is named in, by the minute it is made; wechart’s own unless given.',
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

/**
 * "Edit in my workspace", as the web app's route makes it (`[R48-5]`,
 * AC-278, AC-368): its project folder named in the client's time zone, or
 * the deployment's, `deploymentZone`, where it sends none (T1015, AC-630).
 */
const copyIn =
  (deploymentZone: string) =>
  async (args: unknown, call: McpCall): Promise<CallToolResult> => {
    const { kind, id, folderId, path, into, timeZone = deploymentZone } = args as CopyArgs;
    // A model's `into` is the route's to check: a folder of the caller's own workspace (T763).
    const body =
      kind === 'model'
        ? { kind, folderId, path, timeZone, ...(into === undefined ? {} : { into }) }
        : { kind, id, timeZone };
    return changed(await call.ask('/api/workspace/copies', { method: 'POST', body }), 'copy');
  };

/** `edit_in_my_workspace`, naming project folders in `deploymentZone` unless the client names one. */
export function editInMyWorkspace(deploymentZone: string): McpTool {
  return {
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
    run: copyIn(deploymentZone),
  };
}

/** The workspace tools, in the order `tools/list` gives them, for a deployment in `timeZone`. */
export function workspaceTools(timeZone: string): readonly McpTool[] {
  return [editInMyWorkspace(timeZone), ...ITEM_TOOLS];
}
