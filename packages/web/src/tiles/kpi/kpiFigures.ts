import { labelOf } from '@wechart/charts';
import {
  formatValue,
  kpiPeriodOf,
  type KpiOptions,
  type KpiTime,
  type RenderSpec,
} from '@wechart/core';

import type { KpiCompared } from './KpiChange';

type Row = Readonly<Record<string, unknown>>;

export const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/** The start of the period Cube tagged a compared row with ("2026-09-01T00:00:00.000 - …"). */
export function periodStartOf(row: Row | undefined): string | undefined {
  const tag = row?.['compareDateRange'];
  return typeof tag === 'string' ? tag.split(' - ')[0] : undefined;
}

/** A period by its start, as its grain names it ("Sep 2026"). */
export function periodLabelOf(start: string, time: KpiTime, spec: RenderSpec): string {
  return formatValue(start, time.member, spec.formats ?? {}, {
    [time.member]: time.granularity,
  });
}

/**
 * What a value is compared with (T937, AC-565): for a period, the compared
 * period's row of Cube's `compareDateRange` answer, named by its period;
 * another measure, on the value's own row, by its title; a value, itself.
 * Nothing where there is nothing to compare with. A single KPI's rows are
 * its value's and then its compared period's; a tiled KPI's are a member's
 * (T940).
 */
export function comparedOf(
  spec: RenderSpec,
  kpi: KpiOptions,
  measure: string,
  current: Row | undefined = spec.rows[0],
  row: Row | undefined = spec.rows[1],
): KpiCompared | undefined {
  const { compareTo, time } = kpi;
  if (compareTo === undefined) return undefined;
  if (compareTo.kind === 'value') return { value: compareTo.value };
  if (compareTo.kind === 'measure') {
    const value = numberOf(current?.[compareTo.member]);
    return value === undefined ? undefined : { value, against: labelOf(spec, compareTo.member) };
  }
  if (time === undefined) return undefined;
  // The period compared, as Cube tagged its row, else as the value's period places it.
  const start = periodStartOf(current);
  const periods = kpiPeriodOf(
    time.granularity,
    start === undefined ? new Date() : new Date(`${start}Z`),
  );
  const against = periodLabelOf(
    periodStartOf(row) ??
      (compareTo.kind === 'previousPeriod' ? periods.previous : periods.lastYear)[0],
    time,
    spec,
  );
  // No data then (AC-566): no value, or a count of 0, Cube's count of no rows.
  const value = numberOf(row?.[measure]);
  const noRows = value === 0 && spec.measureTypes?.[measure] === 'count';
  return value === undefined || noRows ? { value: undefined, against } : { value, against };
}

/** Its target's figure: a value, or a Target measure on the value's row (T938). */
export function targetOf(kpi: KpiOptions, row: Row | undefined): number | undefined {
  const { target } = kpi;
  if (target === undefined) return undefined;
  return target.kind === 'value' ? target.value : numberOf(row?.[target.member]);
}
