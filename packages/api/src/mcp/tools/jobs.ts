import { type CallToolResult, fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult, refusal } from '../result';
import type { McpCall, McpTool, WebAnswer } from '../server';
import { ID, READ_ONLY, refusedBy } from './read';

/**
 * Jobs through MCP (T788, AC-477, AC-469): the jobs, builds and schedules
 * the token's owner may see, as Jobs and Schedules list them to them
 * (AC-297), and Run now and Cancel where their web app offers each, each by
 * the web app's own route as the owner. No tool makes, changes, pauses,
 * resumes or deletes a schedule. Every tool needs the proposals-and-jobs
 * scope; without it, the call is answered 403 `insufficient_scope` before
 * it runs (AC-433).
 */

/** Jobs' tabs, each by the route its tab reads. */
const TABS = {
  'pre-aggregations': '/api/preaggregations',
  queue: '/api/jobs/queue',
  builds: '/api/jobs/builds',
  queries: '/api/jobs/queries/page',
} as const;
type Tab = keyof typeof TABS;

/** Query records on a page: the route's most. */
const QUERY_PAGE = 100;

interface ListArgs {
  readonly tab: Tab;
  readonly before?: string;
  readonly offset?: number;
}

/** A tab's answer as rows, under `rows`, and the rest beside them (T784-2: paged by its rows). */
function rowsOf(tab: Tab, body: unknown): Record<string, unknown> {
  if (tab === 'pre-aggregations') return { rows: Array.isArray(body) ? body : [] };
  const { entries, records, ...rest } = (body ?? {}) as Record<string, unknown>;
  // Run history's Folder filter's choices and starters are the web page's; the rows are what's asked.
  const { folders: _folders, starters: _starters, ...kept } = rest;
  void [_folders, _starters];
  const rows = tab === 'queue' ? entries : records;
  return { rows: Array.isArray(rows) ? rows : [], ...kept };
}

const LIST_JOBS: McpTool = {
  name: 'list_jobs',
  description:
    'Lists one of the Jobs workspace’s tabs as it shows them to you: "pre-aggregations" (the rollups of the folders you may write), "queue" (builds waiting or building, each saying whether you may cancel or stop it), "builds" (Run history, newest first; "before" for older ones) or "queries" (your own query records, newest first, 100 at a time from "offset").',
  scope: 'proposals-and-jobs',
  inputSchema: fromJsonSchema<ListArgs>({
    type: 'object',
    properties: {
      tab: {
        type: 'string',
        enum: Object.keys(TABS),
        description: 'Which tab: pre-aggregations, queue, builds or queries.',
      },
      before: {
        type: 'string',
        minLength: 1,
        description: 'For builds: the "older" a page gave, for the builds before it.',
      },
      offset: {
        type: 'integer',
        minimum: 0,
        description: 'For queries: how many of the newest to pass over.',
      },
    },
    required: ['tab'],
    additionalProperties: false,
  }),
  annotations: READ_ONLY,
  rows: 'rows',
  async run(args, call) {
    const { tab, before, offset } = args as ListArgs;
    const query = new URLSearchParams();
    if (tab === 'builds' && before !== undefined) query.set('before', before);
    if (tab === 'queries') {
      query.set('limit', String(QUERY_PAGE));
      if (offset !== undefined) query.set('offset', String(offset));
    }
    const asked = query.size === 0 ? TABS[tab] : `${TABS[tab]}?${query.toString()}`;
    const answer = await call.ask(asked);
    if (answer.status !== 200) return refusedBy(answer);
    return dataResult(rowsOf(tab, answer.body));
  },
};

const LIST_SCHEDULES: McpTool = {
  name: 'list_schedules',
  description:
    'Lists the schedules the Schedules workspace shows you: wechart’s own (owner "wechart"), with their times, last run and who made them, and the refresh keys of the models (owner "cube"), for the folders you may write. Read only: schedules aren’t changed through MCP.',
  scope: 'proposals-and-jobs',
  annotations: READ_ONLY,
  rows: 'schedules',
  async run(_args, call) {
    const wechart = await call.ask('/api/wechart-schedules');
    if (wechart.status !== 200) return refusedBy(wechart);
    const cube = await call.ask('/api/schedules');
    const owned = (owner: string, answer: WebAnswer) =>
      Array.isArray(answer.body)
        ? (answer.body as Record<string, unknown>[]).map((row) => ({ owner, ...row }))
        : [];
    return dataResult(
      {
        schedules: [
          ...owned('wechart', wechart),
          ...(cube.status === 200 ? owned('cube', cube) : []),
        ],
      },
      // Cube can't be reached: wechart's are listed alone, and it says so.
      { cubeSchedulesListed: cube.status === 200 },
    );
  },
};

const RUN_SCHEDULE_NOW: McpTool = {
  name: 'run_schedule_now',
  description:
    'Starts a wechart schedule’s build now, as Schedules’ Run now does, for a schedule of a folder you may write. Its times are left as they are.',
  scope: 'proposals-and-jobs',
  inputSchema: fromJsonSchema<{ scheduleId: string }>({
    type: 'object',
    properties: {
      scheduleId: {
        type: 'string',
        pattern: ID,
        description: 'The schedule’s id, as list_schedules gives it.',
      },
    },
    required: ['scheduleId'],
    additionalProperties: false,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  async run(args, call) {
    const { scheduleId } = args as { scheduleId: string };
    const answer = await call.ask(`/api/wechart-schedules/${encodeURIComponent(scheduleId)}/run`, {
      method: 'POST',
    });
    if (answer.status !== 200) return refusedBy(answer);
    return dataResult({ run: answer.body });
  },
};

/** What a cancel the web app doesn't offer is told: fixed text. */
export const NOT_OFFERED =
  'Jobs offers you no Cancel or Stop on this build, so it isn’t cancelled through MCP: only a build wechart started, in a folder you may write, while it waits (Cancel) or builds (Stop).';
/** What a cancel of an entry not in the owner's queue is told: fixed text. */
export const NOT_IN_QUEUE =
  'There’s no such build waiting or building in the folders you may write. It may have finished.';

/**
 * The owner's queue entry by its key, as Jobs lists it to them, with
 * whether it offers Cancel or Stop; none where it isn't listed.
 */
async function queuedFor(
  call: McpCall,
  key: string,
): Promise<{ readonly refused: WebAnswer } | { readonly row: QueueOffer } | null> {
  const answer = await call.ask(TABS.queue);
  if (answer.status !== 200) return { refused: answer };
  const entries = (answer.body as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return null;
  const row = (entries as QueueOffer[]).find((entry) => entry.key === key);
  return row === undefined ? null : { row };
}

/** What Jobs' queue row offers on an entry. */
interface QueueOffer {
  readonly key?: unknown;
  readonly cancellable?: unknown;
  readonly stoppable?: unknown;
  readonly state?: unknown;
}

const CANCEL_BUILD: McpTool = {
  name: 'cancel_build',
  description:
    'Cancels a build waiting in the queue, or stops one building, exactly where Jobs offers you Cancel or Stop: a build wechart started, in a folder you may write. Its key is the queue entry’s, as list_jobs gives it.',
  scope: 'proposals-and-jobs',
  inputSchema: fromJsonSchema<{ key: string }>({
    type: 'object',
    properties: {
      key: { type: 'string', minLength: 1, description: 'The queue entry’s key.' },
    },
    required: ['key'],
    additionalProperties: false,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(args, call): Promise<CallToolResult> {
    const { key } = args as { key: string };
    const found = await queuedFor(call, key);
    if (found === null) return refusal(NOT_IN_QUEUE);
    if ('refused' in found) return refusedBy(found.refused);
    // As Jobs' queue offers it (`BuildQueue.tsx`): Cancel while it waits,
    // Stop while it builds, and neither on a stalled one, whose flags the
    // route can still set (T788's review).
    const { cancellable, stoppable, state } = found.row;
    const cancel = cancellable === true && state === 'queued';
    const stop = stoppable === true && state === 'building';
    if (!cancel && !stop) return refusal(NOT_OFFERED);
    const answer = await call.ask('/api/jobs/queue/cancel', {
      method: 'POST',
      body: stop ? { key, stop: true } : { key },
    });
    if (answer.status !== 200) return refusedBy(answer);
    return dataResult({ cancel: answer.body });
  },
};

/** The jobs tools, in the order `tools/list` gives them. */
export const JOBS_TOOLS: readonly McpTool[] = [
  LIST_JOBS,
  LIST_SCHEDULES,
  RUN_SCHEDULE_NOW,
  CANCEL_BUILD,
];
