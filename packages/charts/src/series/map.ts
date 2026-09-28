/**
 * Country map (T398, AC-305; direction.md rules 86–87; research/country-map.md).
 *
 * A measure by ISO-3 country code, each country shaded on §5's sequential
 * ramp, on Natural Earth's 1:50m boundaries in the Equal Earth projection —
 * equal-area, as a choropleth needs, through d3-geo. A country with no value
 * takes the null neutral; the legend is a continuous bar with its two ends in
 * the measure's format, and a "No data" swatch beside it.
 *
 * A code the boundaries can't place is left out of the series — ECharts
 * would keep it silently, drawing nothing — and named by the tile, in its
 * own DOM (`unplacedCodes`).
 *
 * Only placed codes are passed, one per row: ECharts sums the values of a
 * name it sees twice, which is wrong for any measure that isn't a sum.
 */
import { formatterFor, memberOn, type RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { geoEqualEarth } from 'd3-geo';

import { OTHER_COLOUR } from '../colorAssignment';
import { COUNTRY_KEY, COUNTRY_MAP, countryMap, type CountryMap } from '../geo/countryMap';
import { DEFAULT_SURFACE, SEQUENTIAL, type EChartsOption } from '../theme';

export function isMapType(chartType: string): boolean {
  return chartType === 'map';
}

/** Room under the map for its legend. */
const LEGEND_PX = 36;
/** A value no row gave, and a code no row names, in words. */
const EMPTY_CODE = '(empty)';
/** Equal Earth, equal-area as a choropleth needs (rule 86): one for every map, as it holds no state of theirs. */
const projection = geoEqualEarth();

/** Escaped, because ECharts' tooltip formatter returns raw HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The rows' codes and values, each code once, its first row's value. */
function codesOf(spec: RenderSpec): { code: string; raw: unknown }[] {
  const dimension = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (dimension === undefined || measure === undefined) return [];
  const seen = new Set<string>();
  return spec.rows.flatMap((row) => {
    const value = row[dimension];
    const code = value === null || value === undefined || value === '' ? EMPTY_CODE : String(value);
    if (seen.has(code)) return [];
    seen.add(code);
    return [{ code, raw: row[measure] }];
  });
}

/**
 * The codes in the data that the map can't place, in the rows' order: not a
 * code of the boundaries (Kosovo's `XKX`, a territory drawn within its
 * sovereign), or no code at all (rule 87).
 */
export function unplacedCodes(
  spec: RenderSpec,
  map: CountryMap | undefined = countryMap(),
): string[] {
  // Before the boundaries are in, no code is known to be off them.
  if (map === undefined) return [];
  return codesOf(spec)
    .map(({ code }) => code)
    .filter((code) => !map.keys.has(code));
}

export function mapOption(spec: RenderSpec, map: CountryMap): EChartsOption {
  if (!isMapType(spec.chartType)) throw new Error(`${spec.chartType} is not a map`);
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const format = formatterFor(measure, spec.formats ?? {});

  const placed = codesOf(spec)
    .filter(({ code }) => map.keys.has(code))
    .map(({ code, raw }) => {
      const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
      return { name: code, value: Number.isFinite(value) ? value : Number.NaN };
    });
  const values = placed.map((each) => each.value).filter((value) => Number.isFinite(value));
  const [min, max] = values.length === 0 ? [0, 1] : [Math.min(...values), Math.max(...values)];

  return {
    animation: false,
    series: [
      {
        type: 'map' as const,
        map: COUNTRY_MAP,
        nameProperty: COUNTRY_KEY,
        data: placed,
        projection: {
          project: (point: [number, number]) => projection(point),
          unproject: (point: [number, number]) => projection.invert?.(point),
          stream: projection.stream,
        },
        left: 8,
        right: 8,
        top: 8,
        bottom: LEGEND_PX,
        // wechart's own marking and hover, not ECharts' select-on-click,
        // hover recolouring, hover labels or legend dots (research, Gotchas).
        selectedMode: false,
        showLegendSymbol: false,
        emphasis: { disabled: true },
        select: { disabled: true },
        label: { show: false },
        itemStyle: { areaColor: OTHER_COLOUR, borderColor: DEFAULT_SURFACE, borderWidth: 0.5 },
      },
    ],
    visualMap: {
      type: 'continuous',
      seriesIndex: 0,
      // From the data: ECharts' own are 0 and 200 (research, visualMap).
      min,
      max: max === min ? min + 1 : max,
      calculable: false,
      inRange: { color: [...SEQUENTIAL] },
      // Its two ends in the measure's format; the high end is the first.
      text: [format(max), format(min)],
      formatter: (value: number) => format(value),
      orient: 'horizontal',
      left: 8,
      bottom: 4,
      itemHeight: 120,
      itemWidth: 10,
    },
    // "No data" beside the bar, in the null neutral (rule 86).
    graphic: [
      {
        type: 'group',
        right: 8,
        bottom: 6,
        children: [
          {
            type: 'rect',
            shape: { x: 0, y: 0, width: 12, height: 12, r: 2 },
            style: { fill: OTHER_COLOUR, stroke: COLORS.light['border-strong'] },
          },
          {
            type: 'text',
            x: 18,
            y: 0,
            style: { text: 'No data', fill: COLORS.light['text-secondary'], fontSize: 12 },
          },
        ],
      },
    ],
    // The country by its name, then the measure, or "No data" (direction.md);
    // a partly marked one's marked value beside it (T453).
    tooltip: {
      trigger: 'item',
      formatter: (params: { name?: string; value?: unknown; data?: unknown }) => {
        const code = params.name ?? '';
        const value = typeof params.value === 'number' ? params.value : Number.NaN;
        const marked = (params.data as { share?: { marked?: number } } | null | undefined)?.share
          ?.marked;
        return `${escapeHtml(map.names.get(code) ?? code)}<br/>${
          Number.isFinite(value)
            ? escapeHtml(
                format(value) + (marked === undefined ? '' : ` · Marked: ${format(marked)}`),
              )
            : 'No data'
        }`;
      },
    },
  };
}
