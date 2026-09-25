import { nextRefreshes, refreshLagSeconds } from '@wechart/core';

import type { AnswerMeta } from '../query/answerMeta';
import type { MenuEntry } from '../shell/Menu';

/**
 * The tile menu's Data as of submenu (T273, AC-245; the design review's P6):
 * how fresh the tile's answer is and where that is set, from what Cube said
 * of the answer and what the model says of the pre-aggregation.
 *
 * - For an answer a pre-aggregation served: its name, its last build (Cube's
 *   `lastUpdatedAt`), its refresh schedule in words and as written, and its
 *   next run with how late Cube's refresh worker may start it (`nextRefreshes`
 *   and `refreshLagSeconds`, research/cube/refresh-key-schedule.md), with
 *   Refresh now, Open in Jobs on that pre-aggregation, and Edit schedule in
 *   Model.
 * - For one the database answered: that, with Refresh now and Why not
 *   accelerated.
 *
 * Nothing before there is an answer to date.
 */

/** A pre-aggregation's schedule, as `/api/schedules` gives it (T160). */
export interface ScheduleSaid {
  readonly id: string;
  readonly cube: string;
  readonly fileName?: string;
  readonly when: string;
  readonly every?: string;
  readonly timezone?: string;
}

export function dataAsOf(
  {
    answered,
    schedules,
    onRefresh,
    onWhyNot,
    onOpen,
  }: {
    answered: AnswerMeta | undefined;
    /** Undefined while they cannot be read. */
    schedules: readonly ScheduleSaid[] | undefined;
    onRefresh: (() => void) | undefined;
    onWhyNot: () => void;
    /** Goes to a page of the app, by its address. */
    onOpen: (href: string) => void;
  },
  now: Date,
  timeOf: (date: Date) => string = (date) => date.toLocaleString(),
): { label: string; entries: MenuEntry[] } | undefined {
  if (answered === undefined) return undefined;
  const used = usedOf(answered);
  const lastRefresh =
    answered.lastRefreshTime === undefined ? undefined : new Date(answered.lastRefreshTime);
  const at = lastRefresh ?? used?.builtAt;
  if (at === undefined && used === undefined) return undefined;
  const label = at === undefined ? 'Data as of' : `Data as of ${timeOf(at)}`;
  const refresh: MenuEntry[] =
    onRefresh === undefined
      ? []
      : [{ kind: 'item', key: 'refresh', label: 'Refresh now', onSelect: onRefresh }];

  if (used === undefined)
    return {
      label,
      entries: [
        {
          kind: 'text',
          key: 'database',
          text: 'Answered by the database, not a pre-aggregation',
        },
        { kind: 'separator', key: 'actions' },
        ...refresh,
        { kind: 'item', key: 'why-not', label: 'Why not accelerated?', onSelect: onWhyNot },
      ],
    };

  const schedule = schedules?.find((each) => each.id === used.id);
  const next = schedule?.every === undefined ? undefined : nextRun(schedule, now, timeOf);
  const edit =
    schedule?.fileName === undefined
      ? undefined
      : `/model/files/${encodeURIComponent(schedule.fileName)}?cube=${encodeURIComponent(schedule.cube)}&tab=pre_aggregations`;
  const text = (key: string, words: string): MenuEntry => ({ kind: 'text', key, text: words });
  return {
    label,
    entries: [
      text('name', `Pre-aggregation ${used.id}`),
      ...(used.builtAt === undefined ? [] : [text('built', `Last built ${timeOf(used.builtAt)}`)]),
      ...(schedule === undefined
        ? [text('schedule', 'Its schedule could not be read.')]
        : [
            text('schedule', `Refreshed ${lowerFirst(schedule.when)}`),
            ...(schedule.every === undefined
              ? []
              : [
                  text(
                    'written',
                    `As written: every: "${schedule.every}"${
                      schedule.timezone === undefined ? '' : `, timezone: "${schedule.timezone}"`
                    }`,
                  ),
                ]),
            ...(next === undefined ? [] : [text('next', next)]),
          ]),
      { kind: 'separator', key: 'actions' },
      ...refresh,
      {
        kind: 'item',
        key: 'jobs',
        label: 'Open in Jobs',
        onSelect: () => {
          onOpen(`/jobs?preagg=${encodeURIComponent(used.id)}`);
        },
      },
      ...(edit === undefined
        ? []
        : [
            {
              kind: 'item' as const,
              key: 'model',
              label: 'Edit schedule in Model',
              onSelect: () => {
                onOpen(edit);
              },
            },
          ]),
    ],
  };
}

/** The pre-aggregation that served an answer, as Cube names it, and when it was built. */
function usedOf(answered: AnswerMeta): { id: string; builtAt?: Date } | undefined {
  for (const value of Object.values(answered.usedPreAggregations ?? {})) {
    const { preAggregationId, lastUpdatedAt } = (value ?? {}) as {
      preAggregationId?: unknown;
      lastUpdatedAt?: unknown;
    };
    if (typeof preAggregationId !== 'string') continue;
    return {
      id: preAggregationId,
      ...(typeof lastUpdatedAt === 'number' ? { builtAt: new Date(lastUpdatedAt) } : {}),
    };
  }
  return undefined;
}

/** Its next run and how late it may start, in words; none for what Cube can't run. */
function nextRun(
  schedule: ScheduleSaid,
  now: Date,
  timeOf: (date: Date) => string,
): string | undefined {
  if (schedule.every === undefined) return undefined;
  const [next] = nextRefreshes(schedule.every, schedule.timezone, now, 1);
  const lag = refreshLagSeconds(schedule.every);
  if (next === undefined || lag === undefined) return undefined;
  return `Next run ${timeOf(next)}, may start up to ${lagWords(lag)} late`;
}

/**
 * A time as the menu says it: the clock alone for today, as the mockup's
 * "Data as of 09:15", and the day beside it otherwise.
 */
export function clockTimeOf(date: Date, now: Date = new Date()): string {
  const clock = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === now.toDateString()
    ? clock
    : `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${clock}`;
}

/** Seconds as the menu says them: "40 s", "5 min", "5½ min". */
export function lagWords(seconds: number): string {
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = seconds / 60;
  const whole = Math.floor(minutes);
  return minutes - whole >= 0.5 ? `${String(whole)}½ min` : `${String(whole)} min`;
}

const lowerFirst = (words: string) => `${words.charAt(0).toLowerCase()}${words.slice(1)}`;
