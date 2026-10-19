import type { ChartDocument, CubeFilter } from '@wechart/core';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect, useImperativeHandle, type Ref } from 'react';

import { tileChartOf, type TileChart } from '../dashboard/chartSpec';
import { answerMetaOf, type AnswerMeta } from '../query/answerMeta';
import { useQueryItem, type QueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { withFilters, withLimit, type ActiveFilter } from './apply';

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
 * Every member a filter asks about: its field's, or — for one made from a
 * marking (AC-113) — each its Cube filter names, through `and`s and `or`s,
 * which can be on several cubes.
 */
function membersOf({ filter, value }: ActiveFilter): string[] {
  if (value.kind !== 'cube') return [filter.member ?? ''];
  const found: string[] = [];
  const walk = (part: unknown) => {
    if (typeof part !== 'object' || part === null) return;
    const { member, and, or } = part as { member?: unknown; and?: unknown; or?: unknown };
    if (typeof member === 'string') found.push(member);
    for (const parts of [and, or]) if (Array.isArray(parts)) parts.forEach(walk);
  };
  walk(value.filter);
  return found;
}

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
  /** What the markings limiting this tile add to its query (T113, AC-107). */
  limit?: CubeFilter,
): readonly unknown[] {
  return [
    'filtered-chart',
    chartId,
    document,
    applied.map(({ filter, value }) => [filter.member, value]),
    context ?? null,
    // The limit is in the key because it is in the question. It arrives
    // canonical (`limitFilterFor`), so the same marks marked again are the
    // same key and the answer comes from the cache — AC-105.
    limit ?? null,
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
  /**
   * What the markings limiting this tile add to its query (T113, AC-107) —
   * one filter, already combined as the tile is set.
   *
   * It joins `query.filters`, where Cube ANDs the entries, so a limited tile
   * shows the marked rows *of* what the dashboard, tab and tile filters left:
   * AC-082's "combine … using AND", with no separate mechanism.
   *
   * Unlike a dashboard filter it is never dropped to rescue a query. A filter
   * that cannot be joined is a filter the user did not aim at this tile; a
   * limit they did, and a tile that quietly dropped it would show unmarked
   * rows in a tile whose whole purpose is to show marked ones.
   *
   * **So a limit Cube cannot join leaves the tile showing Cube's error**, and
   * that is deliberate rather than settled elsewhere: AC-103's `notLinked` is
   * computed from the marking a tile *shows*, not from the markings limiting
   * it, so it does not cover this. An error naming an unjoinable cube is a
   * worse message than AC-103's, but it is a true one; showing the tile's
   * unlimited data instead would be a false one.
   */
  limit?: CubeFilter,
  /** The item its queries serve: the dashboard (T340, AC-268). */
  item?: QueryItem,
  /**
   * Asked as it reads even once no filter is left (T898): a chart following
   * a parameter set away from its default, whose own question changed.
   */
  always = false,
): Promise<{ chart: TileChart | undefined; uncovered: string[]; answered?: AnswerMeta }> {
  const source = document.chart.source.cube;
  let asked = [...applied];
  const uncovered: string[] = [];
  // A tile limited by a marking is asked even when no filter reaches it — the
  // limit is the question — and goes on being asked once every filter has
  // been dropped, so the limit is never what gets dropped. So is a chart
  // following a parameter (`always`).
  while (asked.length > 0 || limit !== undefined || always) {
    const current = asked;
    let answered: AnswerMeta | undefined;
    const chart = await tileChartOf(document, async (query) => {
      const result = (await loadTile({
        query: withLimit(withFilters(query, current), limit),
        signal,
        ...(cache === undefined ? {} : { cache }),
        ...(context === undefined ? {} : { context }),
        item,
      })) as { data?: Record<string, unknown>[] };
      answered = answerMetaOf(result);
      return result.data ?? [];
    });
    const refused = 'error' in chart ? refusedJoin(chart.error) : undefined;
    // Nothing left to drop: the cause is the limit or the chart's own query,
    // and neither is ours to remove. The tile shows what Cube said.
    if (refused === undefined || current.length === 0)
      return answered === undefined ? { chart, uncovered } : { chart, uncovered, answered };
    // The filters on a cube Cube named, other than the chart's own; if it
    // named none of them, every filter, since one of them has to be the cause.
    const named = current.filter((each) =>
      membersOf(each).some((member) => {
        const cube = cubeOf(member);
        return cube !== source && refused.includes(cube);
      }),
    );
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
  limits,
  asks,
}: {
  reached: Readonly<Record<string, readonly ActiveFilter[]>>;
  documents: Readonly<Record<string, ChartDocument>> | undefined;
  onResults: (results: FilteredResults) => void;
  /** For "Refresh now" on a filtered tile (T154). */
  ref?: Ref<FilteredChartsHandle>;
  /** A previewed security context, every filtered chart asked as (T172). */
  context?: Readonly<Record<string, unknown>> | undefined;
  /**
   * What the markings limiting each chart's tile add to its query, by chart
   * (T113, AC-107). A chart listed here is asked even when no filter reaches
   * it, so `reached` need not carry an empty entry for it.
   */
  limits?: Readonly<Record<string, CubeFilter>> | undefined;
  /**
   * Charts asked as their documents now read even with no filter or limit:
   * one following a dashboard parameter set away from its default (T898,
   * AC-533), which the page loaded at its default.
   */
  asks?: ReadonlySet<string> | undefined;
}) {
  // The dashboard every filtered chart is asked for (T340, AC-268).
  const item = useQueryItem();
  const ids = [
    ...new Set([...Object.keys(reached), ...Object.keys(limits ?? {}), ...(asks ?? [])]),
  ];
  const charts = ids.flatMap((chartId) => {
    const document = documents?.[chartId];
    return document === undefined
      ? []
      : [
          {
            chartId,
            document,
            applied: reached[chartId] ?? [],
            limit: limits?.[chartId],
            always: asks?.has(chartId) === true,
          },
        ];
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
        const { document, applied, limit, always } = found;
        await queryClient.fetchQuery({
          queryKey: filteredQueryKey(chartId, document, applied, context, limit),
          queryFn: ({ signal }) =>
            filteredChart(document, applied, signal, 'no-cache', context, limit, item, always),
          staleTime: 0,
        });
      },
    }),
    [charts, queryClient, context, item],
  );

  const answers = useQueries({
    queries: charts.map(({ chartId, document, applied, limit, always }) => ({
      queryKey: filteredQueryKey(chartId, document, applied, context, limit),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        filteredChart(document, applied, signal, undefined, context, limit, item, always),
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
