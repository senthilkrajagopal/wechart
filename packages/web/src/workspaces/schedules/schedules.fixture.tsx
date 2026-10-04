import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

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
  ...over,
});

export interface Sent {
  readonly method: string;
  readonly url: string;
  readonly body?: unknown;
}

/**
 * Schedules on the stub API at `at`: `wechart` is what the API lists, and is
 * changed by each save and delete the page sends, as the API would.
 */
export function shownSchedules({
  at = '2026-10-02T12:00:00Z',
  keys = KEY_ROWS,
  wechart = [],
  failing = [],
}: {
  at?: string;
  keys?: unknown[];
  wechart?: WechartSchedule[];
  /** Lists the API fails to read, with its words: the refresh keys', or wechart's. */
  failing?: readonly ('keys' | 'wechart')[];
} = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(at));
  const sent: Sent[] = [];
  let listed = [...wechart];
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
      if (url.pathname === '/api/schedules')
        return failing.includes('keys')
          ? Response.json({ error: 'Cube didn’t answer.' }, { status: 502 })
          : Response.json(keys);
      if (url.pathname === '/api/wechart-schedules' && failing.includes('wechart'))
        return Response.json({ error: 'wechart’s schedules could not be read.' }, { status: 500 });
      if (url.pathname === '/api/preaggregations') return Response.json(PRE_AGGREGATIONS);
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
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SchedulesPage />
    </QueryClientProvider>,
  );
  return { sent };
}

export const text = (element: Element | null | undefined) => element?.textContent ?? '';

/** "2 Sep": the day `iso` falls on in the zone the tests run in, as the pane writes it. */
export function localDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).formatToParts(
    new Date(iso),
  );
  const part = (type: string) => parts.find((each) => each.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}`;
}

export const paneOf = () => screen.getByRole('complementary', { name: 'Schedule details' });

/** The rows of the next runs a list shows, each as its text. */
export const runsIn = (container: HTMLElement) =>
  within(within(container).getByRole('list', { name: 'Next runs' }))
    .getAllByRole('listitem')
    .map((item) => text(item));
