import type { ChartDocument } from '@wechart/core';
import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';

import { tileChartOf, type TileChart } from '../dashboard/chartSpec';
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
 */
export interface FilteredResult {
  readonly chart: TileChart | undefined;
  readonly asking: boolean;
  readonly uncovered: readonly string[];
  readonly unfiltered: boolean;
}

export type FilteredResults = Readonly<Record<string, FilteredResult>>;

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
    Object.entries(results).map(([chartId, result]) => [
      chartId,
      {
        ...result,
        chart: result.unfiltered ? undefined : (result.chart ?? before[chartId]?.chart),
      },
    ]),
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
 * One chart, filtered: asked with every filter reaching it. A filter the model
 * could not rule out may still name a cube Cube cannot join to the chart's —
 * then Cube refuses the whole query. Each filter on a refused cube is left
 * off and reported, and the rest are asked again; so one such filter neither
 * breaks the tile nor takes the others with it.
 */
async function filteredChart(
  document: ChartDocument,
  applied: readonly ActiveFilter[],
  signal: AbortSignal,
): Promise<{ chart: TileChart | undefined; uncovered: string[] }> {
  const source = document.chart.source.cube;
  let asked = [...applied];
  const uncovered: string[] = [];
  while (asked.length > 0) {
    const current = asked;
    const chart = await tileChartOf(document, async (query) => {
      const result = (await loadTile({ query: withFilters(query, current), signal })) as {
        data?: Record<string, unknown>[];
      };
      return result.data ?? [];
    });
    const refused = 'error' in chart ? refusedJoin(chart.error) : undefined;
    if (refused === undefined) return { chart, uncovered };
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
      queryFn: ({ signal }: { signal: AbortSignal }) => filteredChart(document, applied, signal),
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
    };
  });
  // Compared by content: `useQueries` hands back new objects every render.
  const reported = JSON.stringify(
    Object.entries(results).map(([chartId, { chart, asking, uncovered, unfiltered }]) => [
      chartId,
      asking,
      uncovered,
      unfiltered,
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
