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
