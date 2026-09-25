/**
 * A refresh key's `every`, as Cube's refresh worker reads it (T258, AC-153).
 *
 * Cube takes an interval ("1 hour") or a cron. Its compile check only parses
 * a cron, so one it can't run passes a publish and then fails, when a query or
 * the worker generates the refresh key, with every query the rollup serves
 * (research/cube/refresh-key-schedule.md, "The equal-interval rule"). Cube's
 * run-time rule is a shape: `[s ]m h * * d`, each of those a number or `*`.
 *
 * Cube then repeats the cron at the gap between its first two runs after the
 * epoch, which is what the cron says only when its numbers run on from the
 * finest field: `0 * * * 1` reads "hourly on Mondays" and runs hourly every
 * day. So those are refused too — wechart accepts what Cube runs as written.
 */

/** Cube's interval test, before it tries a cron (research, "Syntax"). */
const INTERVAL = /^(\d+) (second|minute|hour|day|week)s?$/;

/** Each field Cube lets a number stand in, finest first, with its range. */
const FIELDS = [
  { name: 'second', high: 59 },
  { name: 'minute', high: 59 },
  { name: 'hour', high: 23 },
  { name: 'day of the week', high: 7 },
] as const;

const SHAPE =
  'Cube runs only crons of the form "[second] minute hour * * day-of-week", each of those a single number or *, with no ranges, lists, steps, names, day of the month or month';

/** What Cube would run instead, for a shape it accepts and runs otherwise. */
const RUNS_AS: Readonly<Record<string, string>> = {
  second: 'every second',
  minute: 'every minute, all day',
  hour: 'every hour, every day',
};

/**
 * Why Cube's refresh worker can't run `every` as written, or undefined when
 * it can. The sentence is the user's, in the model editor and at publish.
 */
export function refreshEveryRefusal(every: string): string | undefined {
  if (INTERVAL.test(every)) return undefined;
  const fields = every.replace(/ +/g, ' ').trim().split(' ');
  if (fields.length !== 5 && fields.length !== 6)
    return `Cube’s refresh worker can’t run "${every}": it is neither an interval Cube reads (such as "1 hour" or "30 minute") nor a cron. ${SHAPE}.`;
  const [dayOfMonth, month] = fields.slice(-3, -1);
  if (dayOfMonth !== '*' || month !== '*')
    return `Cube’s refresh worker can’t run "${every}": ${SHAPE}.`;
  // Finest first: [second], minute, hour, day of the week.
  const own = [...fields.slice(0, -3), fields[fields.length - 1] ?? ''];
  const named = fields.length === 6 ? FIELDS : FIELDS.slice(1);
  for (const [at, field] of own.entries()) {
    if (field !== '*' && !/^\d+$/.test(field))
      return `Cube’s refresh worker can’t run "${every}": ${SHAPE}.`;
    const bound = named[at];
    if (field !== '*' && bound !== undefined && Number(field) > bound.high)
      return `"${every}" has no ${bound.name} ${field}: it runs from 0 to ${String(bound.high)}.`;
  }
  // Its numbers must run on from the finest field: after a *, only *s.
  const firstStar = own.indexOf('*');
  if (firstStar !== -1 && own.slice(firstStar).some((field) => field !== '*')) {
    const repeats = named[firstStar]?.name ?? 'minute';
    return `Cube would run "${every}" ${RUNS_AS[repeats] ?? 'more often than it says'}, not as it reads: it repeats a cron at the gap between its first two runs. Give the ${repeats} a number too.`;
  }
  return undefined;
}

/** Seconds in each interval unit, and in each cron field's step. */
const UNIT: Readonly<Record<string, number>> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  'day of the week': 86400,
};

/**
 * How often a key Cube can run turns over, and where from (T159, AC-153):
 * the period I and phase D of Cube's `floor((O + t − D) / I)`, in seconds.
 * A cron's are its closed form — I by how far its numbers reach, D the
 * seconds from the epoch, a Thursday, to its first run — which Cube's own
 * tests pin (research/cube/refresh-key-schedule.md, "The equal-interval
 * rule"). An interval's phase is 0: it counts from the epoch.
 */
export function refreshPeriodOf(
  every: string,
): { period: number; phase: number; cron: boolean } | undefined {
  const interval = INTERVAL.exec(every);
  if (interval !== null)
    return { period: Number(interval[1]) * (UNIT[interval[2] ?? ''] ?? 0), phase: 0, cron: false };
  if (refreshEveryRefusal(every) !== undefined) return undefined;
  const fields = every.replace(/ +/g, ' ').trim().split(' ');
  const own = [...fields.slice(0, -3), fields[fields.length - 1] ?? ''];
  const named = fields.length === 6 ? FIELDS : FIELDS.slice(1);
  const firstStar = own.indexOf('*');
  const period = firstStar === -1 ? (UNIT['week'] ?? 0) : (UNIT[named[firstStar]?.name ?? ''] ?? 0);
  const phase = own.reduce((sum, field, at) => {
    if (field === '*') return sum;
    const name = named[at]?.name ?? '';
    // Days from Thursday, the epoch's day; Sunday may be 7.
    const value = name === 'day of the week' ? ((Number(field) % 7) - 4 + 7) % 7 : Number(field);
    return sum + value * (UNIT[name] ?? 0);
  }, 0);
  return { period, phase, cron: true };
}

/** A zone's offset east of UTC at a moment, in seconds; undefined for a zone this runtime lacks. */
function offsetOf(zone: string, at: Date): number | undefined {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(at);
  } catch {
    return undefined;
  }
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value ?? 0);
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return Math.round((wall - at.getTime()) / 60000) * 60;
}

/**
 * The next `count` times Cube's refresh key turns over after `now`: when the
 * refresh worker will see it stale and rebuild (T159, AC-153). A cron runs in
 * its zone, or in UTC with none; an interval counts from the epoch in the
 * zone wechart builds in, UTC (research, "Turn-over formula"). The zone's
 * offset is taken now, as Cube takes it when it generates the key's SQL, so a
 * daylight-saving change between now and a run is not reflected: Cube's own
 * snapshot can outlive one too (research, "Across a DST change").
 */
export function nextRefreshes(
  every: string,
  timezone: string | undefined,
  now: Date,
  count: number,
): Date[] {
  const read = refreshPeriodOf(every);
  if (read === undefined || read.period <= 0) return [];
  const offset = read.cron && timezone !== undefined ? offsetOf(timezone, now) : 0;
  if (offset === undefined) return [];
  const { period, phase } = read;
  const first = Math.floor((offset + now.getTime() / 1000 - phase) / period) + 1;
  return Array.from(
    { length: count },
    (_, at) => new Date((phase - offset + (first + at) * period) * 1000),
  );
}

/**
 * At most how long after a turn-over Cube's refresh worker starts the rebuild,
 * in seconds, before the build itself: how stale Cube lets the cached key get,
 * `min(max(round(I / 10), 1), 300)`, plus the worker's 30 s beat (research,
 * "Refresh worker cadence"). Undefined for what Cube can't run.
 */
export function refreshLagSeconds(every: string): number | undefined {
  const read = refreshPeriodOf(every);
  if (read === undefined) return undefined;
  return Math.min(Math.max(Math.round(read.period / 10), 1), 300) + 30;
}
