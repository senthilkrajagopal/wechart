import { elapsedOf } from './loadTile';

/**
 * What Cube says about an answer besides its rows, as a tile shows it: when
 * its data is from — `lastRefreshTime` (T154, AC-148) — and the
 * pre-aggregations that served it — `usedPreAggregations`, absent when the
 * database did (T014, AC-013; research/cube/pre-aggregations.md §4).
 *
 * Carried with a chart's answer wherever the answer goes — loaded, filtered,
 * refreshed — so the two can't disagree about which answer they describe.
 */
export interface AnswerMeta {
  readonly lastRefreshTime?: string;
  readonly usedPreAggregations?: Readonly<Record<string, unknown>>;
  /**
   * How many rows the query has, as if it had no limit — `total`, where the
   * query asked for it, as a box plot's does (T401, AC-315).
   */
  readonly total?: number;
  /** How long the answer took, in ms, where wechart asked for it (T681; `loadTile`). */
  readonly elapsedMs?: number;
}

export function answerMetaOf(result: unknown): AnswerMeta {
  if (typeof result !== 'object' || result === null) return {};
  const { lastRefreshTime, usedPreAggregations, total } = result as {
    lastRefreshTime?: unknown;
    usedPreAggregations?: unknown;
    total?: unknown;
  };
  const elapsedMs = elapsedOf(result);
  return {
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
    ...(typeof total === 'number' && Number.isFinite(total) ? { total } : {}),
    ...(typeof lastRefreshTime === 'string' ? { lastRefreshTime } : {}),
    ...(typeof usedPreAggregations === 'object' && usedPreAggregations !== null
      ? { usedPreAggregations: usedPreAggregations as Record<string, unknown> }
      : {}),
  };
}
