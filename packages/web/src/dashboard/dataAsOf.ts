import { nextRefreshes, refreshLagSeconds } from '@wechart/core';

import type { AnswerMeta } from '../query/answerMeta';
import { rollupHref } from '../workspaces/model/inFolder';
import { clockOrWhenOf, whenOf } from '../shell/formatTime';
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
  /** A folder's cube's short name (T371): the rollup is said by it. */
  readonly shortName?: string;
  /** False for one who may not open it in Jobs (T371; R42.7): a reader. */
  readonly mayOpen?: boolean;
  readonly fileName?: string;
  /** That file's folder, where it isn't the root (T530). */
  readonly fileFolderId?: string;
  readonly when: string;
  readonly every?: string;
  readonly timezone?: string;
  /**
   * Its key's SQL, read from the model file (T273's review): such a key is
   * checked on its interval and rebuilds only when the SQL's value changes.
   */
  readonly sql?: string;
}

/** The Data as of footer and its submenu, as the tile menu draws them. */
export interface DataAsOfSaid {
  readonly label: string;
  /** The footer's second line (design 08, pin 10; T681). */
  readonly detail: string;
  readonly served: 'live' | 'pre-aggregation';
  readonly entries: MenuEntry[];
}

export function dataAsOf(
  {
    answered,
    schedules,
    onRefresh,
    refreshBlocked,
    onWhyNot,
    onOpen,
  }: {
    answered: AnswerMeta | undefined;
    /** The model's schedules; `loading` until read, `failed` if they could not be. */
    schedules: readonly ScheduleSaid[] | 'loading' | 'failed' | undefined;
    onRefresh: (() => void) | undefined;
    /**
     * Why Refresh now can't run just now — the tile's own ↻ is off then, and
     * for the same reason (T273's review): an answer landing after it would
     * undo it.
     */
    refreshBlocked?: string | undefined;
    onWhyNot: () => void;
    /** Goes to a page of the app, by its address. */
    onOpen: (href: string) => void;
  },
  now: Date,
  // As every moment is written (T477), never the browser's locale.
  timeOf: (date: Date) => string = (date) => whenOf(date, now),
  /** The moment to the second, as design 08 state D writes it: "Today 09:27:42" (T681). */
  secondsOf: (date: Date) => string = (date) => whenOf(date, now, { seconds: true }),
): DataAsOfSaid | undefined {
  if (answered === undefined) return undefined;
  const used = usedOf(answered);
  // A time that doesn't read as one is no time (T681's review): never "NaN".
  const read =
    answered.lastRefreshTime === undefined ? undefined : new Date(answered.lastRefreshTime);
  const lastRefresh = read === undefined || Number.isNaN(read.getTime()) ? undefined : read;
  const at = lastRefresh ?? used?.builtAt;
  if (at === undefined && used === undefined) return undefined;
  const label = at === undefined ? 'Data as of' : `Data as of ${timeOf(at)}`;
  const refresh: MenuEntry[] =
    onRefresh === undefined
      ? []
      : [
          {
            kind: 'item',
            key: 'refresh',
            label: 'Refresh now',
            onSelect: onRefresh,
            disabled: refreshBlocked,
          },
        ];

  /**
   * Design 08 state D: who answered, then when, to the second — when Cube
   * answered. The line a keyboard reaches with the time a refresh moves on,
   * the badge's tooltip being the pointer's (AC-148 with design 04 note 4;
   * T681).
   */
  if (used === undefined)
    return {
      label,
      detail: 'Live · from the database',
      served: 'live',
      entries: [
        {
          kind: 'text',
          key: 'database',
          text: 'Answered by the database',
          heading: true,
          dot: true,
          sub: 'No pre-aggregation matched this chart’s query.',
        },
        { kind: 'separator', key: 'when' },
        ...(at === undefined
          ? []
          : [
              {
                kind: 'text' as const,
                key: 'as-of',
                term: 'Data as of',
                text: secondsOf(at),
                sub: 'when Cube answered',
                dateTime: at.toISOString(),
              },
            ]),
        { kind: 'separator', key: 'actions' },
        ...refresh,
        { kind: 'item', key: 'why-not', label: 'Why not accelerated?', onSelect: onWhyNot },
      ],
    };

  const schedule = Array.isArray(schedules)
    ? (schedules as readonly ScheduleSaid[]).find((each) => each.id === used.id)
    : undefined;
  // Its file, a folder's in its folder by the name its file declares (T530, AC-222).
  const edit =
    schedule === undefined
      ? undefined
      : rollupHref({
          fileName: schedule.fileName,
          fileFolderId: schedule.fileFolderId,
          cube: schedule.shortName ?? schedule.cube,
        });
  const text = (key: string, words: string): MenuEntry => ({ kind: 'text', key, text: words });
  // A folder's rollup by its short name, never its prefixed one (§P2.6 D).
  const name =
    schedule?.shortName === undefined
      ? used.id
      : `${schedule.shortName}.${used.id.slice(used.id.lastIndexOf('.') + 1)}`;
  return {
    label,
    // "Pre-aggregation · every hour" (design 08, pin 10), in Schedules' words
    // where it runs on a clock (T551); its other states are the submenu's.
    detail:
      schedule !== undefined && /^(Every|Hourly|Daily|At)\b/.test(schedule.when)
        ? `Pre-aggregation · ${lowerFirst(schedule.when)}`
        : 'Pre-aggregation',
    served: 'pre-aggregation',
    entries: [
      text('name', `Pre-aggregation ${name}`),
      ...(used.builtAt === undefined ? [] : [text('built', `Last built ${timeOf(used.builtAt)}`)]),
      ...(schedule === undefined
        ? [
            text(
              'schedule',
              schedules === 'loading' || schedules === undefined
                ? 'Reading its schedule…'
                : 'Its schedule could not be read.',
            ),
          ]
        : scheduleWords(schedule, now, timeOf).map((words, at) =>
            text(`schedule-${String(at)}`, words),
          )),
      { kind: 'separator', key: 'actions' },
      ...refresh,
      // Only for one who may use Jobs: a reader sees freshness alone (R42.7).
      ...(schedule?.mayOpen === false
        ? []
        : [
            {
              kind: 'item' as const,
              key: 'jobs',
              label: 'Open in Jobs',
              onSelect: () => {
                onOpen(`/jobs?preagg=${encodeURIComponent(used.id)}`);
              },
            },
          ]),
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

/**
 * The schedule's lines: in words, as written, and its next run. "Refreshed"
 * leads only a sentence of when it runs — "Not scheduled: …" and "As its
 * cube's refresh key: …" are said as T160 says them (T273's review). A key
 * with SQL rebuilds only when the SQL's value changes, so no run is foretold
 * for it; an interval or a cron has its next turn-over and its lateness.
 */
function scheduleWords(
  schedule: ScheduleSaid,
  now: Date,
  timeOf: (date: Date) => string,
): string[] {
  // Schedules' words (T551): a cron's start "Daily", "Hourly" or "At".
  const when = /^(Every|At|When|Daily|Hourly)\b/.test(schedule.when)
    ? `Refreshed ${lowerFirst(schedule.when)}`
    : schedule.when;
  const written = [
    ...(schedule.sql === undefined ? [] : [`sql: "${clipped(schedule.sql)}"`]),
    ...(schedule.every === undefined ? [] : [`every: "${schedule.every}"`]),
    ...(schedule.timezone === undefined ? [] : [`timezone: "${schedule.timezone}"`]),
  ];
  const next =
    schedule.sql !== undefined
      ? 'Next run: when its SQL returns a new value, so not foretold'
      : nextRun(schedule, now, timeOf);
  return [
    when,
    ...(written.length === 0 ? [] : [`As written: ${written.join(', ')}`]),
    ...(next === undefined ? [] : [next]),
  ];
}

/** A key's SQL, short enough for a line of the menu. */
const clipped = (sql: string) => (sql.length > 60 ? `${sql.slice(0, 59)}…` : sql);

/**
 * The pre-aggregation that served an answer, as Cube names it, and when it was
 * built: `lastUpdatedAt` as a number, or the ISO string the REST reference
 * shows (research/cube/pre-aggregations.md: "Parse both").
 */
function usedOf(answered: AnswerMeta): { id: string; builtAt?: Date } | undefined {
  for (const value of Object.values(answered.usedPreAggregations ?? {})) {
    const { preAggregationId, lastUpdatedAt } = (value ?? {}) as {
      preAggregationId?: unknown;
      lastUpdatedAt?: unknown;
    };
    if (typeof preAggregationId !== 'string') continue;
    const built =
      typeof lastUpdatedAt === 'number' || typeof lastUpdatedAt === 'string'
        ? new Date(lastUpdatedAt)
        : undefined;
    return {
      id: preAggregationId,
      ...(built === undefined || Number.isNaN(built.getTime()) ? {} : { builtAt: built }),
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
  // The day first, "Sep" never "Sept", no comma, and "Yesterday" as the
  // tile's badge says it (T477; Q6, Q8).
  return clockOrWhenOf(date, now);
}

/**
 * Seconds as the menu says them: "40 s", "5 min", "5½ min" — an "up to", so
 * rounded up to the half minute, never down (T273's review).
 */
export function lagWords(seconds: number): string {
  if (seconds < 60) return `${String(seconds)} s`;
  const halves = Math.ceil(seconds / 30);
  const whole = Math.floor(halves / 2);
  return halves % 2 === 1 ? `${String(whole)}½ min` : `${String(whole)} min`;
}

const lowerFirst = (words: string) => `${words.charAt(0).toLowerCase()}${words.slice(1)}`;
