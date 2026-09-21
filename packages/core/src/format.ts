/**
 * Formatting a value the way its member declares (AC-046).
 *
 * "From the Cube model" is the load-bearing phrase in the criterion. A format
 * is not a chart setting picked per tile — it is declared once on the measure
 * and follows it everywhere, so the same number never appears as `1234` on an
 * axis and `$1,234.00` in a table of the same chart.
 *
 * Cube's `format` vocabulary is wider than anything a chart can honour:
 * `imageUrl`, `link`, `id` and d3 specifiers are all legal
 * (`research/cube/data-modeling.md`). The ones with a visual meaning here are
 * currency and percent; the rest fall back to a plain grouped number, because
 * refusing to draw would be worse than drawing a number.
 */

/** Member name to the `format` string `/v1/meta` reports, where there is one. */
export type MemberFormats = Readonly<Record<string, string>>;

/** Cube's predefined time granularities (research/cube/data-apis.md). */
export type TimeGranularity =
  'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/** A time member's granularity in the query its values came from (AC-188). */
export type MemberGranularities = Readonly<Record<string, TimeGranularity>>;

const GRANULARITY_NAMES: readonly string[] = [
  'second',
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] satisfies readonly TimeGranularity[];

/**
 * A column's granularity: its own, or — for the `member.<granularity>` column
 * a grouped result carries beside the member (research/cube/data-apis.md) —
 * the one it names.
 */
export function granularityOf(
  column: string,
  granularities: MemberGranularities,
): TimeGranularity | undefined {
  const own = granularities[column];
  if (own !== undefined) return own;
  const dot = column.lastIndexOf('.');
  const suffix = column.slice(dot + 1);
  return dot > 0 &&
    granularities[column.slice(0, dot)] !== undefined &&
    GRANULARITY_NAMES.includes(suffix)
    ? (suffix as TimeGranularity)
    : undefined;
}

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function forFormat(format: string | undefined): Intl.NumberFormat {
  switch (format) {
    case 'currency':
      return CURRENCY;
    case 'percent':
      return PERCENT;
    default:
      return PLAIN;
  }
}

/**
 * The value as text.
 *
 * A gap is an empty string, not `0` and not `NaN`: nothing was measured, and
 * both alternatives assert something. A value that is not a number at all —
 * a dimension's label — passes through, because formatting text as currency
 * would be worse than leaving it.
 */
export function formatValue(
  value: unknown,
  member: string,
  formats: MemberFormats = {},
  granularities: MemberGranularities = {},
): string {
  return formatterFor(member, formats, granularities)(value);
}

/** The formatter for one member, taken once and reused down a column or an axis. */
export function formatterFor(
  member: string,
  formats: MemberFormats = {},
  granularities: MemberGranularities = {},
): (value: unknown) => string {
  /**
   * A time member is written by the granularity it was asked at (AC-188).
   * The model's own format for a time member is a strftime pattern, which
   * T201 honours; until then the granularity's form stands in for it rather
   * than the raw timestamp AC-188 rules out.
   */
  const granularity = granularityOf(member, granularities);
  if (granularity !== undefined) {
    return (value) =>
      value === null || value === undefined || value === ''
        ? ''
        : formatTime(String(value), granularity);
  }

  const format = forFormat(formats[member]);
  // An id is not a quantity: grouped, order 1234 read "1,234" (T195).
  const isId = formats[member] === 'id';

  return (value) => {
    if (value === null || value === undefined || value === '') return '';
    if (isId) return String(value);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? format.format(numeric) : String(value);
  };
}

/**
 * The start of a bucket as Cube sends it: `YYYY-MM-DDTHH:mm:ss.SSS`, with no
 * offset, already in the query's time zone (research/cube/data-apis.md, "The
 * values that come back"). Read as written and formatted in UTC, so a reader
 * in another zone sees the bucket Cube named, not the day before it.
 */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

const DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const MONTH = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  year: 'numeric',
});

/** A time value as AC-188 writes its granularity; text that is not a time, as it came. */
function formatTime(text: string, granularity: TimeGranularity): string {
  const match = STAMP.exec(text);
  if (match === null) return text;
  const [, year = '', month = '', day = '', hour = '00', minute = '00', second = '00'] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  switch (granularity) {
    case 'year':
      return year;
    case 'quarter':
      return `Q${String(Math.floor((Number(month) - 1) / 3) + 1)} ${year}`;
    case 'month':
      return MONTH.format(date);
    case 'week':
      return `Week of ${DAY.format(date)}`;
    case 'day':
      return DAY.format(date);
    case 'hour':
    case 'minute':
    case 'second': {
      /**
       * The time written out here rather than by Intl, whose en-US time puts
       * a narrow no-break space before "PM" in newer ICU data and a plain one
       * in older — the same value would read differently between browsers.
       */
      const hours = Number(hour);
      const clock = `${String(hours % 12 === 0 ? 12 : hours % 12)}:${minute}${granularity === 'second' ? `:${second}` : ''}`;
      return `${DAY.format(date)}, ${clock} ${hours < 12 ? 'AM' : 'PM'}`;
    }
  }
}
