import type { BoundedRange } from './predicate';

/**
 * Time buckets as spans (AC-107, AC-093): where a bucket of a granularity
 * ends. Shared by the Cube filter a marking becomes (`query.ts`) and by the
 * rows a range marks (`predicate.ts`) and the stripe it draws, so the three
 * agree on how far a range reaches (T386's review).
 */

/** The end of the bucket a granularity's start instant opens. */
export const GRAIN_END: Readonly<Record<string, (start: Date) => Date>> = {
  second: (at) => new Date(at.getTime() + 999),
  minute: (at) => new Date(at.getTime() + 59_999),
  hour: (at) => new Date(at.getTime() + 3_599_999),
  day: (at) => new Date(at.getTime() + 86_399_999),
  week: (at) => new Date(at.getTime() + 7 * 86_400_000 - 1),
  month: (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1) - 1),
  quarter: (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 3, 1) - 1),
  year: (at) => new Date(Date.UTC(at.getUTCFullYear() + 1, 0, 1) - 1),
};

/**
 * A time Cube wrote, read as UTC. Cube writes a bucket's value wall-clock in
 * the query's time zone with no zone of its own ("2026-03-01T00:00:00.000"),
 * and wechart asks in UTC; `new Date` would read that as the browser's local
 * time and slide the span by the machine's offset. A value that names its
 * zone, and a bare date (which JavaScript already reads as UTC), are left.
 */
export const asUtc = (text: string): string =>
  text.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? `${text}Z` : text;

/** `YYYY-MM-DDTHH:mm:ss.SSS`, the form Cube's own `drillDown` emits. */
export const stamp = (at: Date): string => at.toISOString().replace('Z', '');

/**
 * Where a range reaches: the end of its last bucket at the grain it was
 * marked at, written as Cube writes a time; its `to` as it is where it has no
 * grain, or one whose span can't be derived.
 */
export function rangeEndOf(range: BoundedRange): string | number {
  const end = range.granularity === undefined ? undefined : GRAIN_END[range.granularity];
  if (end === undefined || typeof range.to !== 'string') return range.to;
  const start = new Date(asUtc(range.to));
  return Number.isNaN(start.getTime()) ? range.to : stamp(end(start));
}
