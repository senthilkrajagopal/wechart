import { mapPointsQuery, mapSettingsOf, type RenderSpec } from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useContext } from 'react';

import { useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { SecurityPreview } from '../query/securityPreview';

/**
 * A Map's Points layer, asked of Cube apart from the tile's own query (T976,
 * AC-625), as a graphical table's trends are: its filters and date ranges
 * kept, its dashboard and previewed context. The spec comes back with its
 * answer in `mapPoints` once it is in, and as it was before, or for any
 * other chart.
 */
export function useMapPoints(
  spec: RenderSpec,
  query: Readonly<Record<string, unknown>> | undefined,
): RenderSpec {
  const item = useQueryItem();
  const context = useContext(SecurityPreview);
  const points = spec.chartType === 'map' ? mapSettingsOf(spec.options).points : undefined;
  const asked = points === undefined || query === undefined ? undefined : mapPointsQuery(query, points);
  const answer = useQuery({
    queryKey: ['map-points', asked ?? null, context ?? null, item ?? null],
    queryFn: ({ signal }) =>
      loadTile({
        query: asked!,
        signal,
        ...(context === undefined ? {} : { context }),
        item,
      }),
    enabled: asked !== undefined,
    retry: false,
  });
  const body = answer.data as { data?: readonly Record<string, unknown>[]; total?: unknown } | undefined;
  if (asked === undefined || body?.data === undefined) return spec;
  return {
    ...spec,
    mapPoints: {
      rows: body.data,
      ...(typeof body.total === 'number' ? { total: body.total } : {}),
    },
  };
}
