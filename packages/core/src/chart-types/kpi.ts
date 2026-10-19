import { GRANULARITY_NAMES, type TimeGranularity } from '../format';
import type { ChartTypeModule } from './index';

/**
 * The KPI's own settings (T936, AC-564; design 23 sheet 1): Compare to,
 * Target, Time, Tile by and Direction, each optional. Kept sparse in a
 * chart's options under `kpi`, so a KPI with none of them set — one saved
 * before R81 included — saves and draws exactly as before.
 */
export type KpiCompareTo =
  | { readonly kind: 'previousPeriod' }
  | { readonly kind: 'samePeriodLastYear' }
  | { readonly kind: 'measure'; readonly member: string }
  | { readonly kind: 'value'; readonly value: number };

export type KpiTarget =
  | { readonly kind: 'measure'; readonly member: string }
  | { readonly kind: 'value'; readonly value: number };

/** The trend's time dimension and its grain, which also give the period (AC-564). */
export interface KpiTime {
  readonly member: string;
  readonly granularity: TimeGranularity;
}

/** Higher is better by default (the coordinator's call, R81). */
export type KpiDirection = 'higher' | 'lower' | 'neutral';

/**
 * How a tiled KPI's tiles are ordered (T940, AC-567): by value, highest
 * first, unless the author chooses otherwise in Customize.
 */
export type KpiTileOrder = 'value' | 'valueAscending' | 'name';

export const KPI_TILE_ORDERS: readonly { readonly value: KpiTileOrder; readonly label: string }[] =
  [
    { value: 'value', label: 'By value, highest first' },
    { value: 'valueAscending', label: 'By value, lowest first' },
    { value: 'name', label: 'By name' },
  ];

export interface KpiOptions {
  readonly compareTo?: KpiCompareTo;
  readonly target?: KpiTarget;
  readonly time?: KpiTime;
  readonly tileBy?: string;
  readonly tileOrder?: KpiTileOrder;
  readonly direction: KpiDirection;
}

/** Compare to's choices, in design 23's order; None leaves it unset. */
export const KPI_COMPARE_TO: readonly {
  readonly kind: KpiCompareTo['kind'] | 'none';
  readonly label: string;
}[] = [
  { kind: 'none', label: 'None' },
  { kind: 'previousPeriod', label: 'Previous period' },
  { kind: 'samePeriodLastYear', label: 'Same period last year' },
  { kind: 'measure', label: 'Another measure' },
  { kind: 'value', label: 'A value' },
];

export const KPI_DIRECTIONS: readonly { readonly value: KpiDirection; readonly label: string }[] = [
  { value: 'higher', label: 'Higher is better' },
  { value: 'lower', label: 'Lower is better' },
  { value: 'neutral', label: 'Neutral' },
];

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** A measure or a value, as Compare to and Target both take them. */
function measureOrValue(
  raw: Readonly<Record<string, unknown>>,
): { kind: 'measure'; member: string } | { kind: 'value'; value: number } | undefined {
  if (raw['kind'] === 'measure') {
    const member = text(raw['member']);
    return member === undefined ? undefined : { kind: 'measure', member };
  }
  if (raw['kind'] === 'value') {
    const value = finite(raw['value']);
    return value === undefined ? undefined : { kind: 'value', value };
  }
  return undefined;
}

function compareToOf(value: unknown): KpiCompareTo | undefined {
  const raw = record(value);
  if (raw === undefined) return undefined;
  if (raw['kind'] === 'previousPeriod' || raw['kind'] === 'samePeriodLastYear') {
    return { kind: raw['kind'] };
  }
  return measureOrValue(raw);
}

function timeOf(value: unknown): KpiTime | undefined {
  const raw = record(value);
  const member = text(raw?.['member']);
  const granularity = text(raw?.['granularity']);
  if (member === undefined || granularity === undefined) return undefined;
  if (!GRANULARITY_NAMES.includes(granularity)) return undefined;
  return { member, granularity: granularity as TimeGranularity };
}

function directionOf(value: unknown): KpiDirection {
  return value === 'lower' || value === 'neutral' ? value : 'higher';
}

/**
 * A KPI's settings as stored. What it can't read is left out rather than
 * read as something else: a KPI then draws as one without that setting.
 */
function parse(stored: unknown): KpiOptions {
  const raw = record(stored) ?? {};
  const compareTo = compareToOf(raw['compareTo']);
  const targetRaw = record(raw['target']);
  const target = targetRaw === undefined ? undefined : measureOrValue(targetRaw);
  const time = timeOf(raw['time']);
  const tileBy = text(raw['tileBy']);
  const tileOrder = KPI_TILE_ORDERS.find((one) => one.value === raw['tileOrder'])?.value;
  return {
    ...(compareTo === undefined ? {} : { compareTo }),
    ...(target === undefined ? {} : { target }),
    ...(time === undefined ? {} : { time }),
    ...(tileBy === undefined ? {} : { tileBy }),
    ...(tileOrder === undefined ? {} : { tileOrder }),
    direction: directionOf(raw['direction']),
  };
}

/** Its settings as stored: only those set, and Direction only when not the default. */
function save(options: KpiOptions): Readonly<Record<string, unknown>> {
  return {
    ...(options.compareTo === undefined ? {} : { compareTo: options.compareTo }),
    ...(options.target === undefined ? {} : { target: options.target }),
    ...(options.time === undefined ? {} : { time: options.time }),
    ...(options.tileBy === undefined ? {} : { tileBy: options.tileBy }),
    ...(options.tileOrder === undefined || options.tileOrder === 'value'
      ? {}
      : { tileOrder: options.tileOrder }),
    ...(options.direction === 'higher' ? {} : { direction: options.direction }),
  };
}

export const kpiModule: ChartTypeModule<KpiOptions> = { type: 'kpi', parse, save };

/** A period as Cube's `dateRange` takes it: its first and last day, inclusive. */
export type KpiRange = readonly [string, string];

/** Time's period that holds now, the one before it, and the same one a year before. */
export interface KpiPeriods {
  readonly current: KpiRange;
  readonly previous: KpiRange;
  readonly lastYear: KpiRange;
}

const DAY_MS = 86_400_000;
const STEP_MS: Partial<Record<TimeGranularity, number>> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: DAY_MS,
  week: 7 * DAY_MS,
};
const MONTHS: Partial<Record<TimeGranularity, number>> = { month: 1, quarter: 3, year: 12 };

/** The start of the period of this grain that holds `at`, in UTC as Cube's default time zone is. */
function startOf(grain: TimeGranularity, at: Date): Date {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth();
  switch (grain) {
    case 'year':
      return new Date(Date.UTC(y, 0, 1));
    case 'quarter':
      return new Date(Date.UTC(y, m - (m % 3), 1));
    case 'month':
      return new Date(Date.UTC(y, m, 1));
    case 'week': {
      // Cube's weeks start on Monday (research/cube/data-apis.md, "Observed").
      const day = Date.UTC(y, m, at.getUTCDate());
      return new Date(day - ((at.getUTCDay() + 6) % 7) * DAY_MS);
    }
    default: {
      const step = STEP_MS[grain] ?? DAY_MS;
      return new Date(Math.floor(at.getTime() / step) * step);
    }
  }
}

/** `start` moved on by `count` periods of this grain (back, for a negative count). */
function shifted(grain: TimeGranularity, start: Date, count: number): Date {
  const months = MONTHS[grain];
  if (months !== undefined)
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months * count, 1));
  return new Date(start.getTime() + (STEP_MS[grain] ?? DAY_MS) * count);
}

/** The period starting at `start`, as days for a day or more, as timestamps below. */
function rangeOf(grain: TimeGranularity, start: Date): KpiRange {
  const last = new Date(shifted(grain, start, 1).getTime() - 1);
  const whole = grain !== 'second' && grain !== 'minute' && grain !== 'hour';
  const write = (at: Date) => at.toISOString().slice(0, whole ? 10 : 23);
  return [write(start), write(last)];
}

/**
 * Time's periods at its grain (T937, AC-565): the one that holds now ("this
 * month", decision T936-1), the one before it, and the one that held the
 * same moment a year before.
 */
export function kpiPeriodOf(grain: TimeGranularity, now: Date): KpiPeriods {
  const current = startOf(grain, now);
  // The same day a year before, or its month's last where it has none: 29
  // February's is the 28th, never 1 March (checkpoint 2's review).
  const year = now.getUTCFullYear() - 1;
  const lastDay = new Date(Date.UTC(year, now.getUTCMonth() + 1, 0)).getUTCDate();
  const yearBefore = new Date(
    Date.UTC(
      year,
      now.getUTCMonth(),
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
    ),
  );
  return {
    current: rangeOf(grain, current),
    previous: rangeOf(grain, shifted(grain, current, -1)),
    lastYear: rangeOf(grain, startOf(grain, yearBefore)),
  };
}

/** What a KPI asks of Cube. */
export interface KpiQueries {
  /** Its value, and what it is compared with. */
  readonly value: Readonly<Record<string, unknown>>;
}

/**
 * A KPI's query with its settings (T937, AC-565): with Time, its value over
 * Time's period; compared with the previous period or the same one last
 * year, both periods at once through Cube's `compareDateRange`, which answers
 * one result per period, in order (research/cube/data-apis.md,
 * "compareDateRange, end to end"); compared with another measure, that
 * measure beside it. Time's dimension takes the place of the same one in the
 * editor's Time well, as `compareDateRange` may sit on one alone. A KPI with
 * none set is asked as before.
 */
export function kpiQueries(
  query: Readonly<Record<string, unknown>>,
  kpi: KpiOptions,
  now: Date,
): KpiQueries {
  const { compareTo, target, time } = kpi;
  const measures = (query['measures'] as readonly string[] | undefined) ?? [];
  const next: Record<string, unknown> = { ...query };
  // Another measure compared with, and a Target measure (T938), beside the value.
  const beside = [
    ...(compareTo?.kind === 'measure' ? [compareTo.member] : []),
    ...(target?.kind === 'measure' ? [target.member] : []),
  ];
  if (beside.length > 0) next['measures'] = [...new Set([...measures, ...beside])].sort();
  // Tiled, one tile per member of Tile by (T940): asked by it.
  if (kpi.tileBy !== undefined) {
    const dimensions = (query['dimensions'] as readonly string[] | undefined) ?? [];
    next['dimensions'] = [...new Set([...dimensions, kpi.tileBy])].sort();
  }
  if (time !== undefined) {
    const periods = kpiPeriodOf(time.granularity, now);
    const compared =
      compareTo?.kind === 'previousPeriod'
        ? periods.previous
        : compareTo?.kind === 'samePeriodLastYear'
          ? periods.lastYear
          : undefined;
    const others = (
      (query['timeDimensions'] as readonly { readonly dimension?: unknown }[] | undefined) ?? []
    ).filter((entry) => entry.dimension !== time.member);
    next['timeDimensions'] = [
      ...others,
      compared === undefined
        ? { dimension: time.member, dateRange: [...periods.current] }
        : { dimension: time.member, compareDateRange: [[...periods.current], [...compared]] },
    ];
  }
  return { value: next };
}

/** How many of Time's periods a KPI's trend covers, the current one last (design 23 sheet 1). */
export const KPI_TREND_PERIODS = 12;

/**
 * A KPI's trend (T938, AC-565): its value's own query — its filters, the
 * dashboard's and a marking's limit kept — asking its measure alone by
 * Time's grain over the last 12 periods, the current one last, oldest first.
 */
export function kpiTrendQuery(
  query: Readonly<Record<string, unknown>>,
  measure: string,
  time: KpiTime,
  now: Date,
): Record<string, unknown> {
  const current = startOf(time.granularity, now);
  const first = rangeOf(
    time.granularity,
    shifted(time.granularity, current, 1 - KPI_TREND_PERIODS),
  )[0];
  const last = rangeOf(time.granularity, current)[1];
  const others = (
    (query['timeDimensions'] as readonly { readonly dimension?: unknown }[] | undefined) ?? []
  ).filter((entry) => entry.dimension !== time.member);
  return {
    ...query,
    measures: [measure],
    timeDimensions: [
      ...others,
      { dimension: time.member, granularity: time.granularity, dateRange: [first, last] },
    ],
    order: { [time.member]: 'asc' },
  };
}

/** The starts of the trend's 12 periods, oldest first, as its query asks them. */
export function kpiTrendPeriods(time: KpiTime, now: Date): string[] {
  const current = startOf(time.granularity, now);
  return Array.from(
    { length: KPI_TREND_PERIODS },
    (_, at) =>
      rangeOf(time.granularity, shifted(time.granularity, current, at + 1 - KPI_TREND_PERIODS))[0],
  );
}

/**
 * A trend's rows laid on its 12 periods, oldest first (checkpoint 2's
 * review): Cube leaves out a period with no rows, so each period takes the
 * row whose time is its start, and one with none is a gap — no data, never
 * a 0 it didn't measure.
 */
export function kpiTrendValues(
  rows: readonly Readonly<Record<string, unknown>>[],
  measure: string,
  time: KpiTime,
  now: Date,
): (number | null)[] {
  const at = new Map<string, number>();
  for (const row of rows) {
    const when = row[`${time.member}.${time.granularity}`] ?? row[time.member];
    const raw = row[measure];
    const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
    if (typeof when === 'string' && Number.isFinite(value)) at.set(when, value);
  }
  return kpiTrendPeriods(time, now).map((start) => {
    const found = [...at].find(([when]) => when.startsWith(start));
    return found === undefined ? null : found[1];
  });
}

/** A chart's KPI settings, from its options. */
export function kpiOptionsOf(options: Readonly<Record<string, unknown>> | undefined): KpiOptions {
  return parse(options?.['kpi']);
}

/** A chart's options with these KPI settings, and no `kpi` key when none is set. */
export function withKpiOptions(
  options: Readonly<Record<string, unknown>>,
  kpi: KpiOptions,
): Record<string, unknown> {
  const saved = save(kpi);
  const next: Record<string, unknown> = { ...options };
  if (Object.keys(saved).length === 0) delete next['kpi'];
  else next['kpi'] = saved;
  return next;
}
