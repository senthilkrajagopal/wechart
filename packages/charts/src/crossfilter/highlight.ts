import { memberOn, seriesOf, type RenderSpec } from '@wechart/core';

import type { EChartsOption } from '../theme';

/**
 * Drawing a cross-filter highlight over a chart (AC-117).
 *
 * Applied to the finished option rather than inside each series builder, for
 * the same reason the legend is decided once: a highlight is a rule about
 * charts, and a type that quietly forgot it would be a tile that looked
 * unaffected while its pair said otherwise.
 *
 * Which of the two drawings applies is decided before this, by what the tile
 * can honestly say (`dashboard/crossfilter/apply.ts`); here each is drawn.
 */

/**
 * What "faded" is, shared by both drawings and with markings
 * (`marking/render.ts`, direction.md §5: unmarked fade 0.28). One number, so
 * a faded bar and a faded slice on the same dashboard agree.
 */
export const FADED_OPACITY = 0.28;

type Series = Record<string, unknown> & { readonly data?: unknown[]; readonly name?: string };

const withStyle = (item: unknown, style: Record<string, unknown>) => {
  // A heatmap's cell is a `[column, row, value]` triple, and an array spread
  // into an object loses the value ECharts reads; it becomes the item's own
  // `value` instead (T123's review).
  const object =
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : { value: item };
  return {
    ...object,
    itemStyle: {
      ...((object['itemStyle'] as Record<string, unknown> | undefined) ?? {}),
      ...style,
    },
  };
};

/**
 * Which category an item is drawn for. A named item (a slice, a treemap leaf)
 * says so; a heatmap cell names its column by index; anything else is in the
 * category order `seriesOf` drew.
 */
function categoryOf(item: unknown, index: number, categories: readonly string[]) {
  if (Array.isArray(item)) return categories[Number(item[0])];
  // A pie's slice by the value it carries apart from its written name (AC-221).
  const { name, category } = (item ?? {}) as { name?: string; category?: string };
  return category ?? name ?? categories[index];
}

/** A pie's slice's split value, which it carries apart from its written name (AC-221). */
function splitOf(item: unknown): string | undefined {
  return Array.isArray(item) ? undefined : ((item ?? {}) as { split?: string }).split;
}

/**
 * The fade (option H1): what is the selection keeps its strength, everything
 * else goes back. Where the selection is the series, whole series fade; where
 * it is the category, the items that are not it fade.
 *
 * A chart that does not show the selected member at all fades nothing: no
 * item on it is the selection, and fading all of them would say the tile was
 * excluded, which is what Filter means, not Highlight.
 */
function faded(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const { member, value } = spec.highlight ?? { member: '', value: '' };
  const series = (option['series'] as Series[] | undefined) ?? [];
  const isSeries = memberOn(spec.encoding, 'color') === member;
  const isCategory =
    memberOn(spec.encoding, 'x') === member || memberOn(spec.encoding, 'facet') === member;

  // A split pie has one series; its slices say which value of the split each is.
  const splitItems = series.some((one) =>
    (one.data ?? []).some((item) => splitOf(item) !== undefined),
  );
  if (isSeries && splitItems) {
    return {
      ...option,
      series: series.map((one) => ({
        ...one,
        data: (one.data ?? []).map((item) =>
          splitOf(item) === value ? item : withStyle(item, { opacity: FADED_OPACITY }),
        ),
      })),
    };
  }

  if (isSeries) {
    return {
      ...option,
      series: series.map((one) =>
        one.name === value
          ? one
          : {
              ...one,
              itemStyle: {
                ...((one['itemStyle'] as object | undefined) ?? {}),
                opacity: FADED_OPACITY,
              },
              lineStyle: {
                ...((one['lineStyle'] as object | undefined) ?? {}),
                opacity: FADED_OPACITY,
              },
            },
      ),
    };
  }

  if (!isCategory) return option;

  // By the item's own name where it has one (a slice, a treemap leaf), else
  // by its place on the category axis, which is the order `seriesOf` drew.
  const { categories } = seriesOf(spec);
  return {
    ...option,
    series: series.map((one) => ({
      ...one,
      data: (one.data ?? []).map((item, index) =>
        categoryOf(item, index, categories) === value
          ? item
          : withStyle(item, { opacity: FADED_OPACITY }),
      ),
    })),
  };
}

/**
 * The share (option H2): the tile's own values fade, and the selection's own
 * values are drawn over them from the baseline — Power BI's cross-highlight.
 *
 * The overlay is a second series in the same slot (`barGap: '-100%'`), not a
 * stacked segment: the selection's value can exceed the total, or fall on the
 * other side of zero, whenever the measure is not additive, and a stack would
 * draw that as a negative remainder rather than as what it is.
 */
function share(option: EChartsOption, spec: RenderSpec): EChartsOption {
  const rows = spec.highlight?.rows;
  if (rows === undefined) return option;

  const series = (option['series'] as Series[] | undefined) ?? [];
  const first = series[0];
  if (first === undefined) return option;

  // The selection's answer, drawn on the same categories: `seriesOf` of the
  // same spec with those rows keeps the category order the tile is drawn in.
  const { categories } = seriesOf(spec);
  const selected = seriesOf({ chartType: spec.chartType, encoding: spec.encoding, rows });
  const values = categories.map((category) => {
    const at = selected.categories.indexOf(category);
    return at === -1 ? null : (selected.series[0]?.values[at] ?? null);
  });

  return {
    ...option,
    series: [
      ...series.map((one) => ({
        ...one,
        data: (one.data ?? []).map((item) => withStyle(item, { opacity: FADED_OPACITY })),
      })),
      {
        ...first,
        name: spec.highlight?.value ?? first.name,
        // Over the faded total, both from the baseline. ECharts takes the gap
        // from the last series in the grid, which this is.
        barGap: '-100%',
        data: values.map((value, index) => {
          const total = (first.data ?? [])[index];
          const style = (total as { itemStyle?: object } | undefined)?.itemStyle ?? {};
          // The total's own shape: same corners, same gap, so the two read as
          // one bar with a full-strength part rather than two bars.
          return { value, itemStyle: { ...style } };
        }),
      },
    ],
  };
}

export function withHighlight(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (spec.highlight === undefined) return option;
  return spec.highlight.kind === 'share' ? share(option, spec) : faded(option, spec);
}
