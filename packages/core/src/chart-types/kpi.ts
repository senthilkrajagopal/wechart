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

export interface KpiOptions {
  readonly compareTo?: KpiCompareTo;
  readonly target?: KpiTarget;
  readonly time?: KpiTime;
  readonly tileBy?: string;
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
  return {
    ...(compareTo === undefined ? {} : { compareTo }),
    ...(target === undefined ? {} : { target }),
    ...(time === undefined ? {} : { time }),
    ...(tileBy === undefined ? {} : { tileBy }),
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
    ...(options.direction === 'higher' ? {} : { direction: options.direction }),
  };
}

export const kpiModule: ChartTypeModule<KpiOptions> = { type: 'kpi', parse, save };

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
