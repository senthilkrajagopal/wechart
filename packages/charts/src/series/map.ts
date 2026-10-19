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
import {
  formatterFor,
  mapSettingsOf,
  memberOn,
  placeValues,
  unplacedSentence,
  type RenderSpec,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { geoEqualEarth } from 'd3-geo';

import { OTHER_COLOUR } from '../colorAssignment';
import { COUNTRY_KEY, COUNTRY_MAP, countryMap, type CountryMap } from '../geo/countryMap';
import { admin1CountryOf, admin1Index, admin1SetId } from '../geo/admin1';
import { regionSetOf } from '../geo/regionSets';
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
  // Before the boundaries are in, no code is known to be off them; nor are
  // they the boundaries of a Map on another set, not drawn yet (T973).
  if (map === undefined || mapSettingsOf(spec.options).boundarySet !== 'countries') return [];
  return codesOf(spec)
    .map(({ code }) => code)
    .filter((code) => !map.keys.has(code));
}

/**
 * The id a Map's regions are registered under (`geo/regionSets.ts`), on a
 * set other than Countries: a custom set's own id; Admin-1's comes with its
 * boundaries (T975).
 */
export function regionSetIdOf(spec: RenderSpec): string | undefined {
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet.startsWith('custom:')) return boundarySet;
  if (boundarySet !== 'admin1') return undefined;
  // Admin-1, by the country its values name most (T975).
  const dimension = memberOn(spec.encoding, 'x');
  const country =
    dimension === undefined
      ? undefined
      : admin1CountryOf(spec.rows.map((row) => row[dimension]));
  return country === undefined ? undefined : admin1SetId(country);
}

/**
 * The note under a map naming what it can't place (rule 87; T974, AC-623):
 * on Countries, the codes, as the country map always said them (AC-305); on
 * any other set, each value quoted with why, in the set's own noun. None
 * when everything is placed, or before the boundaries are in.
 */
export function unplacedNote(
  spec: RenderSpec,
  map: CountryMap | undefined = countryMap(),
): string | undefined {
  if (mapSettingsOf(spec.options).boundarySet === 'countries') {
    const codes = unplacedCodes(spec, map);
    return codes.length === 0 ? undefined : `Not on the map: ${codes.join(', ')}`;
  }
  const id = regionSetIdOf(spec);
  const set = id === undefined ? undefined : regionSetOf(id);
  const dimension = memberOn(spec.encoding, 'x');
  if (set === undefined || dimension === undefined) return undefined;
  const { unplaced } = placeValues(
    spec.rows.map((row) => row[dimension]),
    set.index,
  );
  return unplacedSentence(unplaced, set.noun);
}

/**
 * What a Map says in place of any region: a custom set not drawn yet (T979),
 * or values that name no region of the set (design 23 sheet 6's empty state).
 */
function sayInstead(text: string): EChartsOption {
  return {
    animation: false,
    series: [],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text, fill: COLORS.light['text-secondary'], fontSize: 12 },
      },
    ],
  };
}

const valueOf = (raw: unknown) => {
  const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
};

/**
 * The regions a map draws, on its boundary set: on Countries, each placed
 * code (T398); on any other set, each value its regions are named by, on its
 * region's key, the first row a region's values name being its value (T975).
 * None where the set's boundaries aren't in, or no country is named.
 */
function regionsOf(
  spec: RenderSpec,
  map: CountryMap | undefined,
):
  | {
      readonly mapName: string;
      readonly nameProperty: string;
      readonly placed: { name: string; value: number; member: unknown }[];
      readonly names: ReadonlyMap<string, string>;
    }
  | { readonly instead: string }
  | undefined {
  const { boundarySet } = mapSettingsOf(spec.options);
  if (boundarySet === 'countries') {
    if (map === undefined) return undefined;
    return {
      mapName: COUNTRY_MAP,
      nameProperty: COUNTRY_KEY,
      placed: codesOf(spec)
        .filter(({ code }) => map.keys.has(code))
        .map(({ code, raw }) => ({ name: code, value: valueOf(raw), member: code })),
      names: map.names,
    };
  }
  if (boundarySet.startsWith('custom:') && regionSetOf(boundarySet) === undefined)
    return { instead: 'Custom boundary sets are not drawn yet.' };
  const id = regionSetIdOf(spec);
  const dimension = memberOn(spec.encoding, 'x');
  if (id === undefined) {
    if (admin1Index() === undefined || dimension === undefined) return undefined;
    return {
      instead: `None of ${spec.titles?.[dimension] ?? dimension}’s values match Admin-1.`,
    };
  }
  const set = regionSetOf(id);
  const measure = memberOn(spec.encoding, 'y');
  if (set === undefined || dimension === undefined || measure === undefined) return undefined;
  const seen = new Set<string>();
  const placed = spec.rows.flatMap((row) => {
    const raw = row[dimension];
    if (raw === null || raw === undefined || raw === '') return [];
    const keys = set.index.regionsOf(String(raw));
    const key = keys.length === 1 ? keys[0]! : undefined;
    if (key === undefined || seen.has(key)) return [];
    seen.add(key);
    return [{ name: key, value: valueOf(row[measure]), member: raw }];
  });
  return { mapName: set.map, nameProperty: set.nameProperty, placed, names: set.names };
}

export function mapOption(spec: RenderSpec, map: CountryMap | undefined): EChartsOption {
  if (!isMapType(spec.chartType)) throw new Error(`${spec.chartType} is not a map`);
  // The Map's Regions on its boundary set (T973, AC-622): Countries draws as
  // the country map did; a country map saved before R81 has no settings and
  // reads as Countries. Every set draws as Countries does (T975, AC-624).
  const regions = regionsOf(spec, map);
  if (regions === undefined) throw new Error('The map’s boundaries are not loaded yet.');
  if ('instead' in regions) return sayInstead(regions.instead);
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const format = formatterFor(measure, spec.formats ?? {});

  const { placed } = regions;
  const values = placed.map((each) => each.value).filter((value) => Number.isFinite(value));
  const [min, max] = values.length === 0 ? [0, 1] : [Math.min(...values), Math.max(...values)];

  return {
    animation: false,
    series: [
      {
        type: 'map' as const,
        map: regions.mapName,
        nameProperty: regions.nameProperty,
        data: placed.map(({ name, value }) => ({ name, value })),
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
        return `${escapeHtml(regions.names.get(code) ?? code)}<br/>${
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
