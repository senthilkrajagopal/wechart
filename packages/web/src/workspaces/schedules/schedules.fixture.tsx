import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { SchedulesPage } from './SchedulesPage';
import type { CronPreview, WechartSchedule } from './wechart';

/**
 * Schedules against a stub API (T552): its refresh-key rows, wechart's own
 * schedules, the pre-aggregations of the user's folders Jobs lists, and the
 * scheduler's reading of each cron, as `GET /api/wechart-schedules/preview`
 * gives it. Every request the page sends is kept.
 */

/** A refresh key Cube's refresh worker runs, and one it never does. */
export const KEY_ROWS = [
  {
    id: 'fsales__orders.mornings',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    cube: 'fsales__orders',
    name: 'mornings',
    type: 'rollup',
    fileName: 'cubes/orders.yml',
    fileFolderId: 'sales',
    owner: 'cube',
    kind: 'key',
    scheduled: true,
    when: 'Daily at 08:00, Los Angeles',
    written: 'every: "0 8 * * *" · timezone: America/Los_Angeles',
    runs: { every: '0 8 * * *', timezone: 'America/Los_Angeles' },
    lagSeconds: 330,
    lastBuiltAt: '2026-10-02T09:01:00.000Z',
  },
  {
    id: 'fsales__orders.on_demand',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    cube: 'fsales__orders',
    name: 'on_demand',
    type: 'rollup',
    owner: 'cube',
    kind: 'not-scheduled',
    scheduled: false,
    when: 'Not scheduled',
    written: 'scheduled_refresh: false',
    lastBuiltAt: null,
  },
];

/** What Jobs lists in the user's folders: a lambda among them, which isn't built itself. */
export const PRE_AGGREGATIONS = [
  {
    id: 'fsales__orders.mornings',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    type: 'rollup',
    trigger: 'Daily at 08:00, Los Angeles',
  },
  {
    id: 'fsales__orders.on_demand',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    type: 'rollup',
    trigger: 'Not scheduled',
  },
  {
    id: 'fsales__orders.combined',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    type: 'rollupLambda',
    trigger: 'Not scheduled',
    buildable: false,
  },
];

const BERLIN_FIVE = [
  '2027-01-01T03:00:00.000Z',
  '2027-04-01T02:00:00.000Z',
  '2027-07-01T02:00:00.000Z',
  '2027-10-01T02:00:00.000Z',
  '2028-01-01T03:00:00.000Z',
];

/** The zones the tests type that the scheduler knows. */
const KNOWN_ZONES = ['Europe/Berlin', 'Europe/London', 'UTC'];

/** The scheduler's reading of each cron and zone the tests type. */
export function previewOf(cron: string, timezone: string): CronPreview {
  const read = cronOf(cron, timezone);
  // The cron read, the zone one it doesn't know (a part typed, say): the words kept.
  if (read.ok && timezone !== '' && !KNOWN_ZONES.includes(timezone))
    return {
      ok: false,
      field: 'timezone',
      problem: `“${timezone}” isn’t a time zone wechart knows.`,
      words: read.words,
    };
  return read;
}

function cronOf(cron: string, timezone: string): CronPreview {
  const zone = timezone === '' ? {} : { timezone };
  switch (cron) {
    case '0 4 1 1,4,7,10 *':
      return {
        ok: true,
        words: 'At 04:00 on day 1 of January, April, July and October.',
        refreshKeyCould: false,
        ...zone,
        runs: timezone === '' ? [] : BERLIN_FIVE,
      };
    case '0 7 * 10,11 1':
      return {
        ok: true,
        words: 'At 07:00 every Monday in October and November.',
        refreshKeyCould: false,
        ...zone,
        runs:
          timezone === ''
            ? []
            : [
                '2026-10-05T05:00:00.000Z',
                '2026-10-12T05:00:00.000Z',
                '2026-10-19T05:00:00.000Z',
                '2026-10-26T06:00:00.000Z',
                '2026-11-02T06:00:00.000Z',
              ],
        ...(timezone === ''
          ? {}
          : { change: { at: '2026-10-25T01:00:00.000Z', back: true, before: 3 } }),
      };
    case '0 6 * * *':
      return {
        ok: true,
        words: 'At 06:00 every day.',
        refreshKeyCould: true,
        ...zone,
        runs:
          timezone === ''
            ? []
            : [
                '2026-10-03T04:00:00.000Z',
                '2026-10-04T04:00:00.000Z',
                '2026-10-05T04:00:00.000Z',
                '2026-10-06T04:00:00.000Z',
                '2026-10-07T04:00:00.000Z',
              ],
      };
    case '55 7 * * 1-5':
      return {
        ok: true,
        words: 'At 07:55, Monday to Friday.',
        refreshKeyCould: false,
        ...zone,
        runs: timezone === '' ? [] : (schedule().runs ?? []),
      };
    case '0 25 * * 1-5':
      return { ok: false, field: 'cron', problem: 'The hour is 25; it must be 0 to 23.' };
    case '0 0 7 * * 1':
      return {
        ok: false,
        field: 'cron',
        problem:
          'That’s six fields. wechart’s schedules take five: minute, hour, day of month, month, day of week.',
      };
    default:
      return { ok: false, field: 'cron', problem: 'That’s not five fields yet.' };
  }
}

/** A wechart schedule as the API lists it. */
export const schedule = (over: Partial<WechartSchedule> = {}): WechartSchedule => ({
  id: 'sched-1',
  name: 'Weekday mornings',
  preAggregation: 'fsales__orders.mornings',
  folderId: 'sales',
  cron: '55 7 * * 1-5',
  timezone: 'Europe/Berlin',
  missed: 'once',
  createdBy: { key: 'wren', name: 'Wren Writer' },
  createdAt: '2026-09-02T09:00:00.000Z',
  updatedBy: { key: 'wren', name: 'Wren Writer' },
  // A day before the tests' noon UTC: yesterday in every zone.
  updatedAt: '2026-10-01T12:00:00.000Z',
  shortName: 'orders',
  folderPath: ['Shared', 'Sales'],
  when: 'At 07:55, Monday to Friday.',
  runs: [
    '2026-10-05T05:55:00.000Z',
    '2026-10-06T05:55:00.000Z',
    '2026-10-07T05:55:00.000Z',
    '2026-10-08T05:55:00.000Z',
    '2026-10-09T05:55:00.000Z',
  ],
  // At the tests' own now: today in every zone.
  lastRun: {
    id: 'run-1',
    outcome: 'done',
    startedAt: '2026-10-02T12:00:00.000Z',
    endedAt: '2026-10-02T12:00:41.000Z',
    error: null,
  },
  suspendAfter: 3,
  failuresInARow: 0,
  suspendedAt: null,
  suspendedError: null,
  pausedAt: null,
  pausedBy: null,
  ...over,
});

/** Paused by hand by Ada Admin (T556). */
export const paused = (over: Partial<WechartSchedule> = {}): WechartSchedule =>
  schedule({
    pausedAt: '2026-10-02T11:00:00.000Z',
    pausedBy: { key: 'ada', name: 'Ada Admin' },
    ...over,
  });

/** "Trading hours", suspended after 3 failed runs in a row (design 16, E1). */
export const suspended = (over: Partial<WechartSchedule> = {}): WechartSchedule =>
  schedule({
    failuresInARow: 3,
    // At the tests' own now: today in every zone.
    suspendedAt: '2026-10-02T12:00:00.000Z',
    suspendedError: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
    lastRun: {
      id: 'run-4',
      outcome: 'failed',
      startedAt: '2026-10-02T12:00:00.000Z',
      endedAt: '2026-10-02T12:00:00.000Z',
      error: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
    },
    ...over,
  });

/** Its runs, newest first, as Run history lists them: three failed, after one done. */
export const SUSPENDED_RUNS = [
  {
    id: 'run-4',
    startedAt: '2026-10-02T12:00:00.000Z',
    outcome: 'failed',
    error: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
  },
  {
    id: 'run-3',
    startedAt: '2026-10-02T11:00:00.000Z',
    outcome: 'failed',
    error: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
  },
  {
    id: 'run-2',
    startedAt: '2026-10-02T10:00:00.000Z',
    outcome: 'failed',
    error: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
  },
  { id: 'run-1', startedAt: '2026-10-02T09:00:00.000Z', outcome: 'done', error: null },
];

export interface Sent {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
}

/** A read-write member's folders, as Jobs' Folder filter has them (T559). */
export const MEMBER_FOLDERS = {
  everyFolder: false,
  folders: [
    { id: 'sales', path: ['Shared', 'Sales'], parentId: 'root' },
    { id: 'emea', path: ['Shared', 'Sales', 'EMEA'], parentId: 'sales' },
  ],
};

/**
 * Schedules on the stub API at `at`: `wechart` is what the API lists, and is
 * changed by each save and delete the page sends, as the API would.
 */
export function shownSchedules({
  at = '2026-10-02T12:00:00Z',
  keys = KEY_ROWS,
  wechart = [],
  failing = [],
  runs = [],
  runNowRefused,
  runNowNoJob,
  folders = MEMBER_FOLDERS,
  pending = false,
  accessLost = false,
  forbidden = false,
  refused = false,
}: {
  /** One who writes no folder: every list, the folders' too, refused as the API refuses them (T610, G6). */
  refused?: boolean;
  at?: string;
  /** The Folder filter's choices, and whether they are every folder (T559). */
  folders?: unknown;
  /** The refresh keys' list never answers: still being read (T560, G1). */
  pending?: boolean;
  /**
   * The user's access goes while the page is open (T560, G5): an action on
   * a schedule is refused, and the lists read after it lack that schedule —
   * every one of wechart's for `true`, else those named.
   */
  accessLost?: boolean | readonly string[];
  /** Every action refused, its schedule still listed: a refusal that loses nothing (G4). */
  forbidden?: boolean;
  keys?: unknown[];
  wechart?: WechartSchedule[];
  /** Lists the API fails to read, with its words: the refresh keys', or wechart's. */
  failing?: readonly ('keys' | 'wechart')[];
  /** Run history's records of a schedule, newest first. */
  runs?: readonly unknown[];
  /** Cube's words refusing a Run now (T555); none, and it starts. */
  runNowRefused?: string;
  /** A Run now Cube answers with no job: nothing to build (T555's review). */
  runNowNoJob?: boolean;
} = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  const sent: Sent[] = [];
  let listed = [...wechart];
  let noJobs = refused;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://wechart.test');
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      sent.push({
        method,
        url: `${url.pathname}${url.search}`,
        ...(body === undefined ? {} : { body }),
      });
      // No read-write folder: every list refused, in the API's words (T371).
      if (
        noJobs &&
        method === 'GET' &&
        ['/api/schedules', '/api/wechart-schedules', '/api/jobs/folders'].includes(url.pathname)
      )
        return Response.json(
          { error: 'Jobs and Schedules are for Super-Admins and read-write members of a folder.' },
          { status: 403 },
        );
      if (url.pathname === '/api/schedules')
        return pending
          ? new Promise<Response>(() => undefined)
          : failing.includes('keys')
            ? Response.json({ error: 'Cube didn’t answer.' }, { status: 502 })
            : Response.json(keys);
      // Access gone: an action refused, as the API refuses another folder's (T560, G5).
      const acted = /^\/api\/wechart-schedules\/([^/]+)/.exec(url.pathname)?.[1];
      const lost =
        acted !== undefined &&
        (accessLost === true || (Array.isArray(accessLost) && accessLost.includes(acted)));
      if (method !== 'GET' && acted !== undefined && (lost || forbidden)) {
        if (lost) listed = accessLost === true ? [] : listed.filter((each) => each.id !== acted);
        return Response.json(
          { error: 'You may schedule only the pre-aggregations of folders you write.' },
          { status: 403 },
        );
      }
      if (url.pathname === '/api/wechart-schedules' && failing.includes('wechart'))
        return Response.json({ error: 'wechart’s schedules could not be read.' }, { status: 500 });
      if (url.pathname === '/api/preaggregations') return Response.json(PRE_AGGREGATIONS);
      if (url.pathname === '/api/jobs/folders') return Response.json(folders);
      if (url.pathname === '/api/jobs/builds') return Response.json({ records: runs });
      // Run now (T555): started, or Cube's refusal, as the API answers Build's.
      const running = /^\/api\/wechart-schedules\/(.+)\/run$/.exec(url.pathname)?.[1];
      if (running !== undefined && method === 'POST')
        return runNowRefused !== undefined
          ? Response.json({ error: runNowRefused, source: 'cube' }, { status: 400 })
          : runNowNoJob === true
            ? Response.json({ runId: null, tokens: [] })
            : Response.json({ runId: 'run-now-1', tokens: ['t-1'] });
      // Pause and its resume (T556): as the API answers, by Wren Writer.
      const pausing = /^\/api\/wechart-schedules\/(.+)\/(pause|unpause)$/.exec(url.pathname);
      if (pausing !== null && method === 'POST') {
        const [, id, what] = pausing;
        const was = listed.find((each) => each.id === id);
        if (was === undefined)
          return Response.json({ error: 'There is no such schedule.' }, { status: 404 });
        const now = schedule({
          ...was,
          ...(what === 'pause'
            ? { pausedAt: at, pausedBy: { key: 'wren', name: 'Wren Writer' } }
            : { pausedAt: null, pausedBy: null }),
        });
        listed = listed.map((each) => (each.id === id ? now : each));
        return Response.json(now);
      }
      const resuming = /^\/api\/wechart-schedules\/(.+)\/resume$/.exec(url.pathname)?.[1];
      if (resuming !== undefined && method === 'POST') {
        const was = listed.find((each) => each.id === resuming);
        if (was === undefined)
          return Response.json({ error: 'There is no such schedule.' }, { status: 404 });
        const resumed = { ...was, suspendedAt: null, suspendedError: null, failuresInARow: 0 };
        listed = listed.map((each) => (each.id === resuming ? resumed : each));
        return Response.json(resumed);
      }
      if (url.pathname === '/api/wechart-schedules/preview')
        return Response.json(
          previewOf(url.searchParams.get('cron') ?? '', url.searchParams.get('timezone') ?? ''),
        );
      if (url.pathname === '/api/wechart-schedules' && method === 'GET')
        return Response.json(listed);
      if (url.pathname === '/api/wechart-schedules' && method === 'POST') {
        const fields = body as Partial<WechartSchedule>;
        const made = schedule({ ...fields, id: 'sched-new', lastRun: null });
        listed = [...listed, made];
        return Response.json(made, { status: 201 });
      }
      const one = /^\/api\/wechart-schedules\/(.+)$/.exec(url.pathname)?.[1];
      if (one !== undefined && method === 'PUT') {
        const was = listed.find((each) => each.id === one);
        if (was === undefined)
          return Response.json({ error: 'There is no such schedule.' }, { status: 404 });
        const changed = { ...was, ...(body as Partial<WechartSchedule>) };
        listed = listed.map((each) => (each.id === one ? changed : each));
        return Response.json(changed);
      }
      if (one !== undefined && method === 'DELETE') {
        listed = listed.filter((each) => each.id !== one);
        return new Response(null, { status: 204 });
      }
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SchedulesPage />
    </QueryClientProvider>,
  );
  return {
    sent,
    /**
     * wechart's schedules as the API lists them from now on, read again as
     * the page's refresh reads them: a schedule suspended meanwhile, say.
     */
    async listedLater(next: WechartSchedule[]) {
      listed = [...next];
      await client.invalidateQueries({ queryKey: ['wechart-schedules'] });
    },
    /** The user's last read-write folder gone while the page is open: the lists read again (G5b). */
    async refusedLater() {
      noJobs = true;
      await client.invalidateQueries();
    },
  };
}

export const text = (element: Element | null | undefined) => element?.textContent ?? '';

/**
 * The viewer's zone for the tests of the describe it's called in, whatever
 * the machine's: whether a time needs UTC beside it turns on it (T612).
 */
export function viewedFrom(zone: string) {
  const was = process.env['TZ'];
  beforeEach(() => {
    process.env['TZ'] = zone;
  });
  afterEach(() => {
    if (was === undefined) delete process.env['TZ'];
    else process.env['TZ'] = was;
  });
}

/** "2 Sep": the day `iso` falls on in the zone the tests run in, as the pane writes it. */
export function localDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).formatToParts(
    new Date(iso),
  );
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}`;
}

export const paneOf = () => screen.getByRole('complementary', { name: 'Schedule details' });

/** The rows of the next runs a list shows, each as its text: a pane's, or the form's "Next 5 runs, Europe/Berlin" (T612). */
export const NEXT_RUNS = /^Next (\d+ )?runs\b/;
export const runsIn = (container: HTMLElement) =>
  within(within(container).getByRole('list', { name: NEXT_RUNS }))
    .getAllByRole('listitem')
    .map((item) => text(item));
