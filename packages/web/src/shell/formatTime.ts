/**
 * One way of writing a date and a time (T477, AC-187; UX-110; the
 * coordinator's calls Q6–Q10 under R37), as the later approved designs write
 * them (2026-09-27 03–08, 2026-10-01 15 and 16):
 *
 * - a day first, its month short: "27 Sep", never "Sep 27", and never the
 *   "27 Sept" that en-GB's short month gives in this runtime;
 * - the year only when it isn't this one's: "31 Dec 2025";
 * - one 24-hour clock: "03:27", or "15:02:11" where a surface draws seconds;
 * - a moment as "Today 14:05", "Yesterday 16:40", else "24 Sep 09:40", with
 *   no comma;
 * - for a tooltip, the exact local time with UTC beside it.
 *
 * In the viewer's own zone, from a Date's local parts; written out by hand,
 * so no locale's month names or clock reach it.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** "27 Sep", or "31 Dec 2025" in another year than `now`'s. */
export function dayOf(at: Date, now: Date = new Date()): string {
  const day = `${String(at.getDate())} ${MONTHS[at.getMonth()] ?? ''}`;
  return at.getFullYear() === now.getFullYear() ? day : `${day} ${String(at.getFullYear())}`;
}

/** "14:05", or "14:05:12" with seconds, on one 24-hour clock. */
export function clockOf(at: Date, { seconds = false }: { seconds?: boolean } = {}): string {
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return seconds ? `${clock}:${pad(at.getSeconds())}` : clock;
}

/** Calendar days from `at`'s day to `now`'s: 0 today, 1 yesterday. */
function daysBefore(at: Date, now: Date): number {
  const start = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((start(now) - start(at)) / 86_400_000);
}

/** "Today 14:05", "Yesterday 16:40", else "24 Sep 09:40". */
export function whenOf(
  at: Date,
  now: Date = new Date(),
  options: { seconds?: boolean } = {},
): string {
  const days = daysBefore(at, now);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : dayOf(at, now);
  return `${day} ${clockOf(at, options)}`;
}

/**
 * Where a design draws a bare clock ("last run 14:39"): the clock alone for
 * today, and the moment with its day otherwise, so an earlier day's time is
 * never read as today's.
 */
export function clockOrWhenOf(
  at: Date,
  now: Date = new Date(),
  options: { seconds?: boolean } = {},
): string {
  return daysBefore(at, now) === 0 ? clockOf(at, options) : whenOf(at, now, options);
}

/**
 * The exact time, for a tooltip: "27 Sep 2026 14:05:12 (12:05:12 UTC)", the
 * UTC day named too where it differs from the local one.
 */
export function exactOf(at: Date): string {
  const local = `${String(at.getDate())} ${MONTHS[at.getMonth()] ?? ''} ${String(at.getFullYear())} ${clockOf(at, { seconds: true })}`;
  return `${local} (${utcOf(at)})`;
}

/**
 * The UTC time beside a local one: "09:48:03 UTC", with its day where it
 * differs from the local day, "26 Sep 23:05:12 UTC" (the audit trail's
 * inspector, design 08 pin 4).
 */
export function utcOf(at: Date): string {
  const clock = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
  if (at.getUTCDate() === at.getDate()) return `${clock} UTC`;
  // Its year too where that differs, on New Year's Eve or Day.
  const year = at.getUTCFullYear() === at.getFullYear() ? '' : ` ${String(at.getUTCFullYear())}`;
  return `${String(at.getUTCDate())} ${MONTHS[at.getUTCMonth()] ?? ''}${year} ${clock} UTC`;
}
