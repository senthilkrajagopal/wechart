import type { ChartDocument } from '@wechart/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useImperativeHandle, type Ref } from 'react';

import { tileChartOf, type TileChart } from '../dashboard/chartSpec';
import { answerMetaOf, type AnswerMeta } from '../query/answerMeta';
import { loadTile } from '../query/loadTile';
import { withFilters, type ActiveFilter } from './apply';

/**
 * A reached chart as filtered.
 *
 * - `chart`: what it draws, filtered; undefined while its first answer is on
 *   its way, or when no filter could be joined to it (`unfiltered`).
 * - `asking`: a newer answer is being asked for.
 * - `uncovered`: the filters Cube could not join to it (AC-079), by id — left
 *   off its query, and to be marked on its tile.
 * - `unfiltered`: every filter reaching it was one of those, so it draws its
 *   own unfiltered chart.
 * - `answered`: what Cube said of the filtered answer — when its data is
 *   from, and whether a pre-aggregation served it (T154, T014).
 */
export interface FilteredResult {
  readonly chart: TileChart | undefined;
  readonly asking: boolean;
  readonly uncovered: readonly string[];
  readonly unfiltered: boolean;
  readonly answered?: AnswerMeta | undefined;
}

export type FilteredResults = Readonly<Record<string, FilteredResult>>;

/** What the dashboard can ask of its filtered charts. */
export interface FilteredChartsHandle {
  /** Whether a filter in effect is asked with this chart. */
  isFiltered(chartId: string): boolean;
  /** Ask its filtered answer again, past Cube's cache (T154, AC-148). */
  refresh(chartId: string): Promise<void>;
}

/**
 * New results over the ones before: a chart still being asked keeps the
 * answer it last had, so its tile goes on showing that — marked busy — rather
 * than its unfiltered chart. Charts no longer reached are dropped, so one
 * reached again starts from its unfiltered chart, which is what it last drew.
 */
export function keepLastAnswers(
  before: FilteredResults,
  results: FilteredResults,
): FilteredResults {
  return Object.fromEntries(
    Object.entries(results).map(([chartId, result]) => {
      if (result.unfiltered) return [chartId, { ...result, chart: undefined, answered: undefined }];
      // The answer kept, and what Cube said of it with it.
      const kept = result.chart === undefined ? before[chartId] : undefined;
      return [
        chartId,
        kept === undefined ? result : { ...result, chart: kept.chart, answered: kept.answered },
      ];
    }),
  );
}

/**
 * Cube's refusal to join a query's cubes, and the cubes it names:
 * `Can't find join path to join 'customers', 'products'` (observed against
 * Cube v1.7.42, HTTP 400; docs/research/cube/markings-query-support.md Q4.4,
 * which advises matching the message).
 */
const REFUSED = "Can't find join path to join";

function refusedJoin(error: unknown): string[] | undefined {
  const message = error instanceof Error ? error.message : undefined;
  const at = message?.indexOf(REFUSED) ?? -1;
  if (message === undefined || at < 0) return undefined;
  // The quoted names after the phrase — not the phrase's own apostrophe.
  return [...message.slice(at + REFUSED.length).matchAll(/'([^']+)'/g)].map(
    (found) => found[1] ?? '',
  );
}

const cubeOf = (member: string | undefined) => (member ?? '').split('.')[0] ?? '';

/**
 * One chart's filtered answer in the query cache. Shared with "Refresh now"
 * (T154), which asks it again under the same key, so the tile — drawing from
 * this entry — shows what the refresh brought back.
 */
export function filteredQueryKey(
  chartId: string,
  document: ChartDocument,
  applied: readonly ActiveFilter[],
  /** The security context asked as, when previewing one (T172). */
  context?: Readonly<Record<string, unknown>>,
): readonly unknown[] {
  return [
    'filtered-chart',
    chartId,
    document,
    applied.map(({ filter, value }) => [filter.member, value]),
    context ?? null,
  ];
}

/**
 * One chart, filtered: asked with every filter reaching it. A filter the model
 * could not rule out may still name a cube Cube cannot join to the chart's —
 * then Cube refuses the whole query. Each filter on a refused cube is left
 * off and reported, and the rest are asked again; so one such filter neither
 * breaks the tile nor takes the others with it.
 */
export async function filteredChart(
  document: ChartDocument,
  applied: readonly ActiveFilter[],
  signal: AbortSignal,
  /** `no-cache` for a tile's "Refresh now" (T154, AC-148). */
  cache?: 'no-cache',
  /** A previewed security context, asked as (T172, AC-166). */
  context?: Readonly<Record<string, unknown>>,
): Promise<{ chart: TileChart | undefined; uncovered: string[]; answered?: AnswerMeta }> {
  const source = document.chart.source.cube;
  let asked = [...applied];
  const uncovered: string[] = [];
  while (asked.length > 0) {
    const current = asked;
    let answered: AnswerMeta | undefined;
    const chart = await tileChartOf(document, async (query) => {
      const result = (await loadTile({
        query: withFilters(query, current),
        signal,
        ...(cache === undefined ? {} : { cache }),
        ...(context === undefined ? {} : { context }),
      })) as { data?: Record<string, unknown>[] };
      answered = answerMetaOf(result);
      return result.data ?? [];
    });
    const refused = 'error' in chart ? refusedJoin(chart.error) : undefined;
    if (refused === undefined)
      return answered === undefined ? { chart, uncovered } : { chart, uncovered, answered };
    // The filters on a cube Cube named, other than the chart's own; if it
    // named none of them, every filter, since one of them has to be the cause.
    const named = current.filter(({ filter }) => {
      const cube = cubeOf(filter.member);
      return cube !== source && refused.includes(cube);
    });
    const dropped = named.length > 0 ? named : current;
    uncovered.push(...dropped.map(({ filter }) => filter.id));
    asked = current.filter((each) => !dropped.includes(each));
  }
  return { chart: undefined, uncovered };
}

/**
 * Re-queries every chart a filter in effect reaches (AC-078), each with the
 * filters that reach it added to its own query, and reports what each draws.
 * A chart no filter reaches is not here, so it is asked nothing.
 *
 * Mounted only while some filter is in effect: a dashboard without one never
 * asks the query client for anything.
 *
 * Keyed by the chart as the tile shows it — a drafted chart as edited — and
 * by what reaches it, so the same filters on the same chart are asked once,
 * and a value changed back is answered from the cache.
 *
 * A changed key is a new query with no answer yet: `useQueries` matches its
 * observers by key, so `placeholderData` never sees the previous answer (T084's
 * review, checked against query-core 5.103.1). Keeping the last answer drawn
 * meanwhile is the dashboard's (`keepLastAnswers`).
 */
export function FilteredCharts({
  reached,
  documents,
  onResults,
  ref,
  context,
}: {
  reached: Readonly<Record<string, readonly ActiveFilter[]>>;
  documents: Readonly<Record<string, ChartDocument>> | undefined;
  onResults: (results: FilteredResults) => void;
  /** For "Refresh now" on a filtered tile (T154). */
  ref?: Ref<FilteredChartsHandle>;
  /** A previewed security context, every filtered chart asked as (T172). */
  context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const charts = Object.entries(reached).flatMap(([chartId, applied]) => {
    const document = documents?.[chartId];
    return document === undefined ? [] : [{ chartId, document, applied }];
  });

  /**
   * A filtered tile draws this chart's filtered answer, so that is what its
   * refresh asks again: past Cube's cache, into the same cache entry, where
   * the tile picks it up. `fetchQuery` with `staleTime: 0` always fetches,
   * and runs the query function it is given for that fetch; the query's own
   * observer puts its options back on its next render
   * (docs/research/data-layer.md, "Asking one query again, differently").
   */
  const queryClient = useQueryClient();
  useImperativeHandle(
    ref,
    () => ({
      isFiltered: (chartId) => charts.some((each) => each.chartId === chartId),
      refresh: async (chartId) => {
        const found = charts.find((each) => each.chartId === chartId);
        if (found === undefined) return;
        const { document, applied } = found;
        await queryClient.fetchQuery({
          queryKey: filteredQueryKey(chartId, document, applied, context),
          queryFn: ({ signal }) => filteredChart(document, applied, signal, 'no-cache', context),
          staleTime: 0,
        });
      },
    }),
    [charts, queryClient, context],
  );

  const answers = useQueries({
    queries: charts.map(({ chartId, document, applied }) => ({
      queryKey: filteredQueryKey(chartId, document, applied, context),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        filteredChart(document, applied, signal, undefined, context),
    })),
  });

  const results: Record<string, FilteredResult> = {};
  charts.forEach(({ chartId }, index) => {
    const answer = answers[index];
    results[chartId] = {
      chart: answer?.data?.chart,
      asking: answer?.isFetching ?? true,
      uncovered: answer?.data?.uncovered ?? [],
      unfiltered: answer?.data !== undefined && answer.data.chart === undefined,
      answered: answer?.data?.answered,
    };
  });
  // Compared by content: `useQueries` hands back new objects every render.
  const reported = JSON.stringify(
    Object.entries(results).map(([chartId, { chart, asking, uncovered, unfiltered, answered }]) => [
      chartId,
      asking,
      uncovered,
      unfiltered,
      answered,
      chart === undefined ? null : 'spec' in chart ? chart.spec : String(chart.error),
    ]),
  );

  useEffect(() => {
    onResults(results);
    // `results` is a new object every render; `reported` is what it says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reported, onResults]);
  // Gone with the last filter in effect: nothing it answered is current.
  useEffect(
    () => () => {
      onResults({});
    },
    [onResults],
  );

  return null;
}
