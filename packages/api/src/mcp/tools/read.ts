import {
  type CallToolResult,
  fromJsonSchema,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';

import { dataResult, refusal, routeRefusal } from '../result';
import type { McpCall, McpTool, WebAnswer } from '../server';

/**
 * Reading and exploring through MCP (T782, AC-437, AC-432, AC-469): each
 * tool asks the web app's own route as the token's owner, so it lists and
 * reads exactly what that route gives them, behind its permission checks.
 * A folder or item they can't reach reads as not found, as the route says.
 * A data source's definition is the route's, which holds no secret: each
 * stored one is only `{ stored: true }` (AC-298). Every tool needs the read
 * scope. Names and descriptions are fixed text, and every answer is under
 * the result's marked field (AC-443, `result.ts`).
 */

const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * An id, one path segment that can't be `.` or `..` (T782's review): it
 * begins with a letter or digit and holds no `/`, so no id lands on another
 * route by dot segments. Every wechart id fits: uuids, "root", "mine",
 * `ws:‹key›`.
 */
const ID = '^[A-Za-z0-9][A-Za-z0-9_.:@~+=-]*$';

const BY_ID = fromJsonSchema<{ id: string }>({
  type: 'object',
  properties: { id: { type: 'string', pattern: ID, description: 'The item’s id.' } },
  required: ['id'],
  additionalProperties: false,
});

const IN_FOLDER = fromJsonSchema<{ folderId: string }>({
  type: 'object',
  properties: {
    folderId: {
      type: 'string',
      pattern: ID,
      description:
        'The folder’s id, as list_folders gives it; "root" for the shared root, "mine" for My workspace.',
    },
  },
  required: ['folderId'],
  additionalProperties: false,
});

const BY_NAME = fromJsonSchema<{ name: string; folderId?: string }>({
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, description: 'Its name in the model.' },
    folderId: {
      type: 'string',
      pattern: ID,
      description: 'Only the folder whose model defines it; every folder you may see otherwise.',
    },
  },
  required: ['name'],
  additionalProperties: false,
});

const NOT_THERE = 'There’s no such item, or it isn’t yours to see.';

/**
 * The route's refusal, in its own words, under the marked field (T783-2),
 * or wechart's fixed "no such item"; a fault of its own throws.
 */
function refusedBy(answer: WebAnswer): CallToolResult {
  if (answer.status >= 500) throw new Error(`The web route answered ${answer.status}.`);
  const said = (answer.body as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? routeRefusal(said) : refusal(NOT_THERE);
}

/**
 * Asks `url`, answering with its body under `key`, in the marked field
 * (AC-443), or its refusal. Where the item is named by `id`, an answer
 * about another one, such as a static route's beside it
 * (`/api/data-sources/sealing-key`), is none (T782's review).
 */
async function read(call: McpCall, url: string, key: string, id?: string): Promise<CallToolResult> {
  const answer = await call.ask(url);
  if (answer.status !== 200) return refusedBy(answer);
  if (id !== undefined && (answer.body as { id?: unknown } | null)?.id !== id)
    return refusal(NOT_THERE);
  return dataResult({ [key]: answer.body });
}

const idOf = (args: unknown) => (args as { id: string }).id;

/** The model files that define a cube or view of this name, in the folders the caller sees. */
async function definitions(
  call: McpCall,
  kind: 'cube' | 'view',
  args: unknown,
): Promise<CallToolResult> {
  const { name, folderId } = args as { name: string; folderId?: string };
  const answer = await call.ask(
    folderId === undefined
      ? '/api/model/files?all=true'
      : `/api/model/files?folder=${encodeURIComponent(folderId)}`,
  );
  if (answer.status !== 200) return refusedBy(answer);
  const files = (answer.body as { files: { objects?: { kind: string; name: string }[] }[] }).files;
  const defining = files.filter((file) =>
    (file.objects ?? []).some((object) => object.kind === kind && object.name === name),
  );
  if (defining.length === 0) return refusal(`There’s no such ${kind}, or it isn’t yours to see.`);
  return dataResult({ definitions: defining });
}

export const READ_TOOLS: readonly McpTool[] = [
  {
    name: 'list_folders',
    description:
      'Lists the folders you may see, with how many items each holds, and your roots: the shared root and My workspace.',
    scope: 'read',
    annotations: READ_ONLY,
    async run(_args, call) {
      const roots = await call.ask('/api/folder-roots');
      if (roots.status !== 200) return refusedBy(roots);
      const folders = await call.ask('/api/folders');
      if (folders.status !== 200) return refusedBy(folders);
      return dataResult({ roots: roots.body, folders: folders.body });
    },
  },
  {
    name: 'list_folder_items',
    description:
      'Lists what a folder holds that you may see: its folders, dashboards, charts and other items.',
    scope: 'read',
    inputSchema: IN_FOLDER,
    annotations: READ_ONLY,
    run: (args, call) =>
      read(
        call,
        `/api/folders/${encodeURIComponent((args as { folderId: string }).folderId)}/contents`,
        'items',
      ),
  },
  {
    name: 'read_dashboard',
    description: 'Reads a dashboard’s definition: its pages, tiles, filters and settings.',
    scope: 'read',
    inputSchema: BY_ID,
    annotations: READ_ONLY,
    run: (args, call) =>
      read(
        call,
        `/api/documents/dashboard/${encodeURIComponent(idOf(args))}`,
        'dashboard',
        idOf(args),
      ),
  },
  {
    name: 'read_chart',
    description: 'Reads a chart’s definition: what it queries and how it is drawn.',
    scope: 'read',
    inputSchema: BY_ID,
    annotations: READ_ONLY,
    run: (args, call) =>
      read(call, `/api/documents/chart/${encodeURIComponent(idOf(args))}`, 'chart', idOf(args)),
  },
  {
    name: 'read_cube',
    description:
      'Reads a cube’s definition: each model file that defines a cube of this name, with its text and members.',
    scope: 'read',
    inputSchema: BY_NAME,
    annotations: READ_ONLY,
    run: (args, call) => definitions(call, 'cube', args),
  },
  {
    name: 'read_view',
    description:
      'Reads a view’s definition: each model file that defines a view of this name, with its text and members.',
    scope: 'read',
    inputSchema: BY_NAME,
    annotations: READ_ONLY,
    run: (args, call) => definitions(call, 'view', args),
  },
  {
    name: 'read_data_source',
    description:
      'Reads a data source’s definition: its driver and connection settings. Its secrets are never given, only that each is stored.',
    scope: 'read',
    inputSchema: BY_ID,
    annotations: READ_ONLY,
    run: (args, call) =>
      read(call, `/api/data-sources/${encodeURIComponent(idOf(args))}`, 'dataSource', idOf(args)),
  },
];
