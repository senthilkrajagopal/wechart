import {
  countMeasureOf,
  mapPointsQuery,
  mapSettingsOf,
  mapUnlocatedQuery,
  type RenderSpec,
} from '@wechart/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { useQueryItem } from '../query/item';
import { metaQueryOf, useWorkspaceItem } from '../query/meta';
import { loadTile } from '../query/loadTile';
import { SecurityPreview } from '../query/securityPreview';

type Answer = { data?: readonly Record<string, unknown>[]; total?: unknown } | undefined;

/**
 * A Map's Points and Density layers, each asked of Cube apart from the
 * tile's own query (T976, AC-625; T977, AC-626), as a graphical table's
 * trends are: its filters and date ranges kept, its dashboard and previewed
 * context. The spec comes back with each answer in `mapPoints` and
 * `mapDensity` once it is in, and as it was before, or for any other chart.
 */
export function useMapPoints(
  spec: RenderSpec,
  query: Readonly<Record<string, unknown>> | undefined,
): RenderSpec {
  const item = useQueryItem();
  const context = useContext(SecurityPreview);
  const settings = spec.chartType === 'map' ? mapSettingsOf(spec.options) : undefined;
  const meta = useQuery({ ...metaQueryOf(useWorkspaceItem()), enabled: settings?.points !== undefined });
  const count =
    settings?.points === undefined ? undefined : countMeasureOf(meta.data, settings.points.location);
  const ask = (location: string | undefined, size?: string, colour?: string) =>
    location === undefined || query === undefined
      ? undefined
      : mapPointsQuery(query, {
          location,
          ...(size === undefined ? {} : { size }),
          ...(colour === undefined ? {} : { colour }),
        });
  const asked = [
    ask(settings?.points?.location, settings?.points?.size, settings?.points?.colour),
    ask(settings?.density?.location),
    // The Points layer's rows with no location, counted apart: grouped by
    // place they are one row (checkpoint 4's review, AC-625).
    // By the location's cube's count measure; without one, as they come.
    settings?.points === undefined || query === undefined || count === undefined
      ? undefined
      : mapUnlocatedQuery(query, settings.points, count),
  ];
  const answers = useQueries({
    queries: asked.map((one) => ({
      queryKey: ['map-points', one ?? null, context ?? null, item ?? null],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        loadTile({
          query: one!,
          signal,
          ...(context === undefined ? {} : { context }),
          item,
        }),
      enabled: one !== undefined,
      retry: false,
    })),
  });
  const answerOf = (at: number) => {
    const body = answers[at]?.data as Answer;
    if (asked[at] === undefined || body?.data === undefined) return undefined;
    return { rows: body.data, ...(typeof body.total === 'number' ? { total: body.total } : {}) };
  };
  const counted = (answers[2]?.data as Answer)?.data?.[0]?.[count ?? ''];
  const unlocated =
    asked[2] === undefined || counted === undefined ? undefined : Number(counted ?? 0);
  const pointsAnswer = answerOf(0);
  const points =
    pointsAnswer === undefined || unlocated === undefined || !Number.isFinite(unlocated)
      ? pointsAnswer
      : { ...pointsAnswer, unlocated };
  const density = answerOf(1);
  return points === undefined && density === undefined
    ? spec
    : {
        ...spec,
        ...(points === undefined ? {} : { mapPoints: points }),
        ...(density === undefined ? {} : { mapDensity: density }),
      };
}
