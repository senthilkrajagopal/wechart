import type { DashboardDocument } from '../dashboard/model/document';
import { valueKeyOf, type DashboardFilter, type FilterValue, type FilterValues } from './model';
import { coverageOf } from './coverage';

/**
 * What a filter's value does to the tiles (AC-078): which charts it reaches,
 * and what it adds to their Cube queries. Operators and their value shapes
 * are Cube's (`docs/research/cube/data-apis.md`, filter operators).
 */

/** A filter on a field, holding a value that filters something. */
export interface ActiveFilter {
  readonly filter: DashboardFilter;
  readonly value: FilterValue;
}

export type CubeQuery = Readonly<Record<string, unknown>>;

/** Whether a value filters anything: two dates still to be chosen do not. */
function filters(value: FilterValue): boolean {
  switch (value.kind) {
    case 'preset':
      return true;
    case 'dates':
      return value.from !== '' || value.to !== '';
    case 'values':
      return value.values.length > 0;
    case 'range':
      return value.min !== undefined || value.max !== undefined;
  }
}

/**
 * The filters in effect: on a field, holding a value that filters. A value is
 * looked up by filter *and* field (`valueKeyOf`), so one held for the field a
 * filter was on before is not in effect on the field it is on now.
 */
export function activeFilters(
  dashboardFilters: readonly DashboardFilter[],
  values: FilterValues,
): ActiveFilter[] {
  return dashboardFilters.flatMap((filter) => {
    const value = values[valueKeyOf(filter)];
    return filter.member !== undefined && value !== undefined && filters(value)
      ? [{ filter, value }]
      : [];
  });
}

interface TimeDimension {
  readonly dimension: string;
  readonly granularity?: string;
  readonly dateRange?: unknown;
  readonly compareDateRange?: unknown;
}

/**
 * A query with these filters added to it, ANDed with the chart's own (Cube
 * ANDs every entry of `filters`, and a `dateRange` is "always emitted as a
 * global AND"). The same query back when there are none, so a tile no filter
 * reaches is asked nothing new.
 *
 * A date range goes in `timeDimensions[].dateRange` where it can — where
 * Cube's pre-aggregation matching applies, which an `inDateRange` filter
 * skips (research, recommendation 12). A relative preset is sent as its words,
 * so it stays relative (AC-083). Where the chart already limits that time
 * dimension — its own `dateRange`, or a `compareDateRange`, which excludes one
 * — the filter goes in `filters` as `inDateRange`, so both hold.
 */
export function withFilters(query: CubeQuery, applied: readonly ActiveFilter[]): CubeQuery {
  if (applied.length === 0) return query;

  const added: Record<string, unknown>[] = [];
  let timeDimensions = (query['timeDimensions'] as readonly TimeDimension[] | undefined) ?? [];
  let timeChanged = false;

  for (const { filter, value } of applied) {
    const member = filter.member ?? '';
    switch (value.kind) {
      case 'values':
        added.push({ member, operator: 'equals', values: [...value.values] });
        break;
      case 'range':
        if (value.min !== undefined)
          added.push({ member, operator: 'gte', values: [String(value.min)] });
        if (value.max !== undefined)
          added.push({ member, operator: 'lte', values: [String(value.max)] });
        break;
      case 'preset':
      case 'dates': {
        if (value.kind === 'dates' && (value.from === '' || value.to === '')) {
          // One end only: on or after, or on or before.
          if (value.from !== '')
            added.push({ member, operator: 'afterOrOnDate', values: [value.from] });
          if (value.to !== '')
            added.push({ member, operator: 'beforeOrOnDate', values: [value.to] });
          break;
        }
        const range = value.kind === 'preset' ? value.preset : [value.from, value.to];
        const index = timeDimensions.findIndex((each) => each.dimension === member);
        const existing = timeDimensions[index];
        if (existing === undefined) {
          timeDimensions = [...timeDimensions, { dimension: member, dateRange: range }];
          timeChanged = true;
        } else if (existing.dateRange === undefined && existing.compareDateRange === undefined) {
          timeDimensions = timeDimensions.map((each, at) =>
            at === index ? { ...each, dateRange: range } : each,
          );
          timeChanged = true;
        } else {
          added.push({
            member,
            operator: 'inDateRange',
            values: typeof range === 'string' ? [range] : range,
          });
        }
        break;
      }
    }
  }

  const existingFilters = (query['filters'] as readonly unknown[] | undefined) ?? [];
  return {
    ...query,
    ...(added.length === 0 ? {} : { filters: [...existingFilters, ...added] }),
    ...(timeChanged ? { timeDimensions } : {}),
  };
}

/**
 * Each chart a filter in effect reaches, with every filter that reaches it,
 * in the filter bar's order. A chart no filter reaches is not listed: it is
 * left as it is, and asked nothing (AC-078).
 *
 * By chart, as the dashboard's charts are drawn. A chart shown by two tiles
 * with different scopes takes the first tile's; duplicating a tile gives the
 * copy a chart of its own (AC-062), so only a hand-built dashboard has one.
 *
 * Every chart counted as able to take every field; `coverageOf` is the same
 * with the model asked which can (AC-079).
 */
export function filteredCharts(
  document: DashboardDocument,
  active: readonly ActiveFilter[],
): Record<string, ActiveFilter[]> {
  return coverageOf(document, active, (member) => member).reached;
}
