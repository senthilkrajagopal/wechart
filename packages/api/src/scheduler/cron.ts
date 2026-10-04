import { clockChangeBetween, refreshEveryRefusal, type ClockChange } from '@wechart/core';
import { PgBoss } from 'pg-boss';

/**
 * A wechart schedule's cron (T378, AC-234; design 16, states D2–D4): five
 * fields and a zone. It is read back in words; one wechart can't read is
 * refused, naming the field (D3); one a refresh key could run is flagged
 * (Q11, D2); and its next runs are pg-boss's own, from `previewSchedule`, so
 * what is shown is what the scheduler runs (research scheduler.md;
 * pg-boss-12.33.2-installed.md).
 */
export type CronReading =
  | { readonly ok: true; readonly words: string; readonly refreshKeyCould: boolean }
  | { readonly ok: false; readonly problem: string };

const FIELDS = [
  { name: 'minute', low: 0, high: 59 },
  { name: 'hour', low: 0, high: 23 },
  { name: 'day of month', low: 1, high: 31 },
  { name: 'month', low: 1, high: 12 },
  { name: 'day of week', low: 0, high: 7 },
] as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COUNTS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** One comma-separated part of a field: a number, a range, either with a step, or `*` with one. */
const PART = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/;

const FIVE = 'wechart’s schedules take five: minute, hour, day of month, month, day of week.';

/** "06:00". */
const clock = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/** "A, B and C". */
const listed = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** Names for a field of numbers: a single one, a list, or a range "A to B"; none with a step. */
function namesOf(field: string, name: (n: number) => string): string | undefined {
  if (field.includes('/')) return undefined;
  const parts = field.split(',');
  if (parts.length === 1 && field.includes('-')) {
    const [from = 0, to = 0] = field.split('-').map(Number);
    return `${name(from)} to ${name(to)}`;
  }
  if (parts.some((part) => part.includes('-'))) return undefined;
  return listed(parts.map((part) => name(Number(part))));
}

/** The day part: "every day", "every Monday in October", "on day 1 of every month". */
function daysInWords(dom: string, month: string, dow: string): string | undefined {
  const months = month === '*' ? undefined : namesOf(month, (n) => MONTHS[n - 1] ?? String(n));
  if (month !== '*' && months === undefined) return undefined;
  const dayName = (n: number) => DAYS[n % 7] ?? String(n);
  if (dom === '*' && dow === '*')
    return months === undefined ? ' every day' : ` every day in ${months}`;
  if (dom === '*') {
    const days = namesOf(dow, dayName);
    if (days === undefined) return undefined;
    const said = dow.includes('-') && !dow.includes(',') ? `, ${days}` : ` every ${days}`;
    return months === undefined ? said : `${said} in ${months}`;
  }
  if (dow === '*') {
    const days = namesOf(dom, String);
    if (days === undefined) return undefined;
    const many = dom.includes(',') || dom.includes('-');
    return ` on ${many ? 'days' : 'day'} ${days} of ${months ?? 'every month'}`;
  }
  return undefined;
}

/** The whole cron in words, or a plain fallback for a shape this doesn't name. */
function wordsOf(cron: string, fields: readonly string[]): string {
  const [minute = '*', hour = '*', dom = '*', month = '*', dow = '*'] = fields;
  const days = daysInWords(dom, month, dow);
  const allDays = dom === '*' && month === '*' && dow === '*';
  const single = (field: string) => /^\d+$/.test(field);
  let time: string | undefined;
  // How often within the day, and whether the day part is needed after it.
  let daily = true;
  if (single(minute) && single(hour)) time = `At ${clock(Number(hour), Number(minute))}`;
  else if (single(minute) && /^\d+(,\d+)+$/.test(hour))
    time = `At ${listed(hour.split(',').map((h) => clock(Number(h), Number(minute))))}`;
  else if (single(minute) && /^\d+-\d+$/.test(hour)) {
    const [from = 0, to = 0] = hour.split('-').map(Number);
    time = `Every hour from ${clock(from, Number(minute))} to ${clock(to, Number(minute))}`;
  } else if (single(minute) && hour === '*') {
    time =
      Number(minute) === 0 ? 'Every hour, on the hour' : `At ${minute} minutes past every hour`;
    daily = false;
  } else if (minute === '*' && hour === '*') {
    time = 'Every minute';
    daily = false;
  } else if (/^\*\/\d+$/.test(minute) && hour === '*') {
    time = `Every ${minute.slice(2)} minutes`;
    daily = false;
  }
  if (time === undefined || days === undefined) return `On “${cron}”, as cron reads it.`;
  if (allDays && !daily) return `${time}.`;
  return `${time}${days}.`;
}

/** Reads a cron as wechart's schedules take it: five fields, each in its range. */
export function readCron(cron: string, preview: Preview = previewOf): CronReading {
  const fields = cron
    .trim()
    .split(/\s+/)
    .filter((field) => field !== '');
  if (fields.length !== 5)
    return {
      ok: false,
      problem: `That’s ${COUNTS[fields.length] ?? String(fields.length)} fields. ${FIVE}`,
    };
  for (const [at, field] of fields.entries()) {
    const { name, low, high } = FIELDS[at]!;
    for (const part of field.split(',')) {
      const read = PART.exec(part);
      if (read === null)
        return {
          ok: false,
          problem: `The ${name} “${field}” isn’t a number, a range, a list or a step.`,
        };
      for (const value of (read[1] ?? '').split('-')) {
        if (value === '*') continue;
        const n = Number(value);
        if (n < low || n > high)
          return {
            ok: false,
            problem: `The ${name} is ${value}; it must be ${String(low)} to ${String(high)}.`,
          };
      }
    }
  }
  // What the scheduler itself runs, the last word (research pg-boss-12.33.2-installed.md).
  try {
    preview(cron, 'UTC', new Date(0), 1);
  } catch (error) {
    return {
      ok: false,
      problem: `wechart’s scheduler can’t run it: ${error instanceof Error ? error.message : String(error)}.`,
    };
  }
  return {
    ok: true,
    words: wordsOf(cron, fields),
    // A refresh key could run it as written (Q11; core's refreshEveryRefusal).
    refreshKeyCould: refreshEveryRefusal(fields.join(' ')) === undefined,
  };
}

/** pg-boss's `previewSchedule`: the scheduler's own next occurrences. */
export type Preview = (cron: string, zone: string, from: Date, count: number) => Date[];

/**
 * A pg-boss instance that never starts, for `previewSchedule` alone: pure
 * cron arithmetic, with no database (research pg-boss-12.33.2-installed.md).
 */
let previewer: PgBoss | undefined;
export const previewOf: Preview = (cron, zone, from, count) => {
  previewer ??= new PgBoss({ connectionString: 'postgres://preview.invalid/preview' });
  return previewer.previewSchedule(cron, { tz: zone, from, count });
};

/**
 * A schedule's next runs in its zone (D4): listed across a daylight-saving
 * change, at the zone's own time, with the change and the first run after it.
 */
export function nextRunsOf(
  cron: string,
  zone: string,
  now: Date,
  count: number,
  preview: Preview = previewOf,
): { runs: Date[]; change?: ClockChange & { readonly before: number } } {
  const runs = preview(cron, zone, now, count);
  let from = now;
  for (const [at, run] of runs.entries()) {
    const change = clockChangeBetween(zone, from, run);
    if (change !== undefined) return { runs, change: { ...change, before: at } };
    from = run;
  }
  return { runs };
}
