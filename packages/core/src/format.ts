/**
 * Formatting a value the way its member declares (AC-046).
 *
 * "From the Cube model" is the load-bearing phrase in the criterion. A format
 * is not a chart setting picked per tile — it is declared once on the measure
 * and follows it everywhere, so the same number never appears as `1234` on an
 * axis and `$1,234.00` in a table of the same chart.
 *
 * A number is written by the d3-format specifier Cube itself reports for its
 * member — `formatDescription.specifier` in `/v1/meta`, for every named format,
 * custom specifier and the plain default alike (observed:
 * research/cube/data-modeling.md, "What `/v1/meta` reports for each format").
 * The user chose Cube's own formats over wechart's, 2026-09-21 (T201), so a
 * number reads the same here as in anything else that honours the model.
 * `imageUrl` and `link` mean nothing to an axis, and fall back to the plain
 * number, because refusing to draw would be worse than drawing a number.
 */
import { formatLocale } from 'd3-format';
import { timeFormatLocale } from 'd3-time-format';

/**
 * A member's format as `/v1/meta` reports it: the d3 specifier Cube means for
 * a number, the currency code a `$` in it stands for, and a time member's
 * declared strftime pattern.
 */
export interface MemberFormat {
  readonly specifier?: string;
  readonly currency?: string;
  readonly time?: string;
  /** The format's name, as `formatDescription` gives it — `id`, `currency_0`… */
  readonly name?: string;
}

/**
 * Formats that say what a value *is*, not how to write a number: an id is a
 * name, never rounded or grouped, and a link or image address is text. Each is
 * written as it came (T201's review: through `.0f` a 20-digit id lost its last
 * digits, and a `link` reference 12345 read "12,345").
 */
const AS_IT_CAME: ReadonlySet<string> = new Set(['id', 'link', 'imageUrl']);

/** Whether a member's format writes its values differently from how they came. */
export function rewritesValues(format: string | MemberFormat | undefined): boolean {
  if (format === undefined) return false;
  const name = typeof format === 'string' ? format : format.name;
  return name === undefined || !AS_IT_CAME.has(name);
}

/**
 * Member name to its format. A string is a format by name — `currency`,
 * `percent`, `id` — or a d3 specifier, as a spec written by hand gives it.
 */
export type MemberFormats = Readonly<Record<string, string | MemberFormat>>;

/** Cube's predefined time granularities (research/cube/data-apis.md). */
export type TimeGranularity =
  'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/** A time member's granularity in the query its values came from (AC-188). */
export type MemberGranularities = Readonly<Record<string, TimeGranularity>>;

/** Cube's predefined grains, finest first (research/cube/data-apis.md). */
export const GRANULARITY_NAMES: readonly string[] = [
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

/**
 * The specifiers Cube reports for its base formats, observed, for a format
 * given by name. What `/v1/meta` sends is used as sent; these only read a
 * spec written by hand.
 */
const NAMED: Readonly<Record<string, string>> = {
  number: ',.2~f',
  percent: '.2~%',
  currency: '$,.2~f',
  abbr: '.2~s',
  accounting: '(,.2~f',
  decimal: ',.2~f',
  id: '.0f',
};

/** Cube's plain number: what a member with no format of its own is written as. */
const PLAIN = NAMED['number'] ?? ',.2~f';

/**
 * en-US, as everything else wechart writes, with the hyphen-minus it has
 * always written rather than d3's U+2212, so a negative copies and searches
 * as a number. A currency code swaps in its own symbol, which Intl names.
 */
function localeFor(currency: string | undefined) {
  let symbol = '$';
  if (currency !== undefined && currency !== 'USD') {
    try {
      symbol =
        new Intl.NumberFormat('en-US', { style: 'currency', currency })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value ?? currency;
    } catch {
      symbol = currency;
    }
  }
  return formatLocale({
    decimal: '.',
    thousands: ',',
    grouping: [3],
    currency: [symbol, ''],
    minus: '-',
  });
}

/** Formatters by specifier and currency, made once each. */
const made = new Map<string, (value: number) => string>();

function numberFormatter(format: string | MemberFormat | undefined): (value: number) => string {
  const specifier =
    typeof format === 'string' ? (NAMED[format] ?? format) : (format?.specifier ?? PLAIN);
  const currency = typeof format === 'string' ? undefined : format?.currency;
  const key = `${currency ?? ''} ${specifier}`;
  const known = made.get(key);
  if (known !== undefined) return known;
  const locale = localeFor(currency);
  let write: (value: number) => string;
  try {
    write = locale.format(specifier);
  } catch {
    // Not a specifier d3 can read: Cube's plain number instead, in the same
    // locale, so a negative keeps its plain minus.
    write = locale.format(PLAIN);
  }
  made.set(key, write);
  return write;
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
   * A time member's own format from the model wins (AC-188's "unless the
   * member's model format says otherwise"): a strftime pattern, written by
   * d3-time-format as Cube's own client writes it (T201). Only one with a
   * directive — a time dimension's `format: link` arrives as the pattern
   * "link", which would print that word for every value.
   */
  const own = formats[member] ?? formats[withoutGranularity(member)];
  const pattern = typeof own === 'object' ? own.time : undefined;
  if (pattern !== undefined && /%[^%]/.test(pattern)) {
    const write = timePattern(pattern);
    return (value) => {
      if (value === null || value === undefined || value === '') return '';
      const date = dateOf(String(value));
      return date === undefined ? String(value) : write(date);
    };
  }

  /** Otherwise a time member is written by the granularity it was asked at. */
  const granularity = granularityOf(member, granularities);
  if (granularity !== undefined) {
    return (value) =>
      value === null || value === undefined || value === ''
        ? ''
        : formatTime(String(value), granularity);
  }

  // An id, a link or an image address is written as it came (T195, T201's
  // review); anything without a format of its own is Cube's plain number.
  const declared = formats[member];
  if (declared !== undefined && !rewritesValues(declared))
    return (value) => (value === null || value === undefined ? '' : String(value));
  const write = numberFormatter(declared);

  return (value) => {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? write(numeric) : String(value);
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

/** Cube's timestamp as the instant it names, read in UTC; nothing if it is not one. */
function dateOf(text: string): Date | undefined {
  const match = STAMP.exec(text);
  if (match === null) return undefined;
  const [, year = '', month = '', day = '', hour = '00', minute = '00', second = '00'] = match;
  // Its milliseconds too, so a pattern's `%L` is the value's, not "000".
  const millis = /\.(\d{1,3})/.exec(text.slice(match[0].length))?.[1] ?? '0';
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millis.padEnd(3, '0')),
    ),
  );
}

/** The member a `member.<granularity>` column stands beside, or the column itself. */
function withoutGranularity(column: string): string {
  const dot = column.lastIndexOf('.');
  return dot > 0 && GRANULARITY_NAMES.includes(column.slice(dot + 1))
    ? column.slice(0, dot)
    : column;
}

/**
 * en-US, as everything else wechart writes: a locale of its own rather than
 * d3-time-format's default, which any importer can replace for all
 * (research/d3-time-format.md, gotcha 10).
 */
const TIME = timeFormatLocale({
  dateTime: '%x, %X',
  date: '%-m/%-d/%Y',
  time: '%-I:%M:%S %p',
  periods: ['AM', 'PM'],
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: [
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
  ],
  shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
});

/** Patterns by text, each made once; written in UTC, as the value is read (gotcha 1). */
const patterns = new Map<string, (date: Date) => string>();

function timePattern(pattern: string): (date: Date) => string {
  const known = patterns.get(pattern);
  if (known !== undefined) return known;
  const write = TIME.utcFormat(pattern);
  patterns.set(pattern, write);
  return write;
}

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
