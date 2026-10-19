import type { EChartsOption } from '../theme';

/**
 * A scrolling chart's window, kept across a redraw (T954, AC-581): a bullet
 * chart past its tile's height scrolls its members (`dataZoom`), and the tile
 * is drawn afresh whenever its dashboard renders. Drawn with its first
 * window again, it would jump back to the top under the reader; so while its
 * members are the same, each of its windows keeps where it was scrolled
 * (`current`, ECharts' own `start` and `end`, in percent). Any other chart,
 * or other members, as it is.
 */
export function withScrollKept(
  previous: EChartsOption | null,
  next: EChartsOption,
  current: readonly { readonly start?: unknown; readonly end?: unknown }[],
): EChartsOption {
  const zooms = next['dataZoom'];
  if (previous === null || !Array.isArray(zooms) || !Array.isArray(previous['dataZoom']))
    return next;
  const membersOf = (option: EChartsOption) =>
    JSON.stringify(
      (Array.isArray(option['yAxis']) ? option['yAxis'] : [option['yAxis']]).map(
        (axis) => (axis as { data?: unknown } | undefined)?.data,
      ),
    );
  if (membersOf(previous) !== membersOf(next)) return next;
  return {
    ...next,
    dataZoom: zooms.map((zoom, at) => {
      const now = current[at];
      if (typeof now?.start !== 'number' || typeof now.end !== 'number') return zoom;
      const rest = { ...(zoom as Record<string, unknown>) };
      delete rest['startValue'];
      delete rest['endValue'];
      return { ...rest, start: now.start, end: now.end };
    }),
  };
}
