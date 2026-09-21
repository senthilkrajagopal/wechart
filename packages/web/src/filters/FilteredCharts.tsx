import type { ChartDocument } from '@wechart/core';
import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';

import { tileChartOf, type TileChart } from '../dashboard/chartSpec';
import { loadTile } from '../query/loadTile';
import { withFilters, type ActiveFilter } from './apply';

/**
 * Each reached chart as filtered — undefined while its first answer is on its
 * way — and whether a newer answer is being asked for.
 */
export type FilteredResults = Readonly<
  Record<string, { readonly chart: TileChart | undefined; readonly asking: boolean }>
>;

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
    Object.entries(results).map(([chartId, { chart, asking }]) => [
      chartId,
      { chart: chart ?? before[chartId]?.chart, asking },
    ]),
  );
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
}: {
  reached: Readonly<Record<string, readonly ActiveFilter[]>>;
  documents: Readonly<Record<string, ChartDocument>> | undefined;
  onResults: (results: FilteredResults) => void;
}) {
  const charts = Object.entries(reached).flatMap(([chartId, applied]) => {
    const document = documents?.[chartId];
    return document === undefined ? [] : [{ chartId, document, applied }];
  });

  const answers = useQueries({
    queries: charts.map(({ chartId, document, applied }) => ({
      queryKey: [
        'filtered-chart',
        chartId,
        document,
        applied.map(({ filter, value }) => [filter.member, value]),
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        tileChartOf(document, async (query) => {
          const result = (await loadTile({ query: withFilters(query, applied), signal })) as {
            data?: Record<string, unknown>[];
          };
          return result.data ?? [];
        }),
    })),
  });

  const results: Record<string, FilteredResults[string]> = {};
  charts.forEach(({ chartId }, index) => {
    const answer = answers[index];
    results[chartId] = { chart: answer?.data, asking: answer?.isFetching ?? true };
  });
  // Compared by content: `useQueries` hands back new objects every render.
  const reported = JSON.stringify(
    Object.entries(results).map(([chartId, { chart, asking }]) => [
      chartId,
      asking,
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
