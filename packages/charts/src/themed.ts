import { CATEGORICAL, COLORS } from '@wechart/ui';

import { DEFAULT_SURFACE, SEQUENTIAL, type EChartsOption } from './theme';

/**
 * A chart's option in the theme it is drawn in (AC-211, direction.md rules 2
 * and 24): the dark theme's own palette and text, not the light one's on a
 * dark tile.
 *
 * Applied last, over whatever the series modules built, so no renderer has to
 * know the theme and none can forget it. Two jobs:
 *
 * - **Palette, slot for slot.** A series colour that is a light categorical
 *   slot becomes the dark slot at the same index. The dashboard assigns a
 *   member its slot so it keeps one colour across tiles (AC-039); the theme
 *   changes only the shade, never which slot, so a member is still the same
 *   member when the theme switches. The light surface colour (the gaps
 *   between marks, the legend swatch's ring) becomes the dark surface.
 * - **Text and lines from the tokens.** Axis labels and the legend in
 *   `text-secondary`, panel titles in `text-primary`, gridlines in
 *   `border-subtle` and axis lines in `border-strong`. The light theme takes
 *   the same roles from its own tokens, rather than ECharts' defaults, so both
 *   themes are drawn from direction.md §5 and audited against it.
 */
export type ChartTheme = 'light' | 'dark';

/** The prototype's chart face (charts.js:107), the UI's own Inter first. */
export const CHART_FONT = 'Inter, system-ui, sans-serif';

/**
 * direction.md §5's neutral for "Other" and null (`colorAssignment.ts`'s
 * OTHER_COLOUR), and its dark value.
 */
const OTHER = { light: '#b3b1ab', dark: '#5c5b57' } as const;

/** Every light colour this recolours, lower-cased, and what it becomes. */
function swapsFor(theme: ChartTheme): ReadonlyMap<string, string> {
  if (theme === 'light') return new Map();
  const swaps = new Map<string, string>();
  CATEGORICAL.light.forEach((colour, slot) => {
    const dark = CATEGORICAL.dark[slot];
    if (dark !== undefined) swaps.set(colour.toLowerCase(), dark);
  });
  swaps.set(DEFAULT_SURFACE.toLowerCase(), COLORS.dark['bg-surface']);
  swaps.set('#fff', COLORS.dark['bg-surface']);
  swaps.set(OTHER.light, OTHER.dark);
  // Chart furniture a renderer drew in the light tokens: gridlines are set in
  // `border-subtle` when the user turns them on (axis.ts).
  swaps.set(COLORS.light['border-subtle'].toLowerCase(), COLORS.dark['border-subtle']);
  swaps.set(COLORS.light['border-strong'].toLowerCase(), COLORS.dark['border-strong']);
  // The ring on the item the keyboard is on (T306), in the theme's accent.
  swaps.set(COLORS.light.accent.toLowerCase(), COLORS.dark.accent);
  // A drawn word, as a map legend's "No data" is (T398): in the dark
  // theme's secondary text. `OTHER`'s dark value is this very colour, which
  // swaps are read against the light ones only, never twice.
  swaps.set(COLORS.light['text-secondary'].toLowerCase(), COLORS.dark['text-secondary']);
  // A bullet chart's lowest band and its value bar and target (T954): R80's
  // lightest grey and the primary ink, as its other bands are borders.
  swaps.set(COLORS.light['bg-subtle'].toLowerCase(), COLORS.dark['bg-subtle']);
  swaps.set(COLORS.light['text-primary'].toLowerCase(), COLORS.dark['text-primary']);
  return swaps;
}

/**
 * A key whose value is a colour, or a list of them: `color`, `borderColor`,
 * … and a drawn element's `fill` and `stroke` (T398: a map legend's swatch).
 */
const isColourKey = (key: string) =>
  key === 'color' || key === 'fill' || key === 'stroke' || /Color$/.test(key);

/**
 * The option with its colours swapped — only its colours.
 *
 * Only the values under colour keys are touched. The first version swapped
 * every string that equalled a palette hex, which would rename a *data* value
 * that happened to be one — a product's colour column holding "#2a78d6" — on
 * the axis, in the legend, and in the name a click sends to be marked
 * (T210's review).
 */
function recolour(value: unknown, swaps: ReadonlyMap<string, string>, colour = false): unknown {
  if (swaps.size === 0) return value;
  /**
   * The sequential ramp, reversed rather than recoloured. direction.md §5
   * publishes one ramp, running light to dark; its rule is that magnitude
   * reads as contrast against the surface. On a dark tile the same two
   * published ends, the other way round, keep that rule — low values near the
   * surface, high values standing out — where drawn as-is the largest cells
   * sank into the tile at about 1.4:1 (T210's review). No new colour needed.
   */
  if (
    colour &&
    Array.isArray(value) &&
    value.length === SEQUENTIAL.length &&
    value.every((each, at) => typeof each === 'string' && each.toLowerCase() === SEQUENTIAL[at])
  )
    return [...value].reverse();
  if (typeof value === 'string') return colour ? (swaps.get(value.toLowerCase()) ?? value) : value;
  if (Array.isArray(value)) return value.map((each) => recolour(each, swaps, colour));
  if (value !== null && typeof value === 'object') {
    // A function (a formatter) is left alone: it is not a plain object.
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, each]) => [key, recolour(each, swaps, isColourKey(key))]),
    );
  }
  return value;
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : {};

/** One axis, with the theme's colours merged under what the renderer set. */
function themedAxis(axis: unknown, theme: ChartTheme): unknown {
  const tokens = COLORS[theme];
  const own = asObject(axis);
  const lineOf = (key: string, colour: string) => {
    const part = asObject(own[key]);
    return { ...part, lineStyle: { color: colour, ...asObject(part['lineStyle']) } };
  };
  return {
    ...own,
    axisLabel: { color: tokens['text-secondary'], ...asObject(own['axisLabel']) },
    nameTextStyle: { color: tokens['text-secondary'], ...asObject(own['nameTextStyle']) },
    axisLine: lineOf('axisLine', tokens['border-strong']),
    axisTick: lineOf('axisTick', tokens['border-strong']),
    splitLine: lineOf('splitLine', tokens['border-subtle']),
  };
}

const eachOf = (value: unknown, apply: (one: unknown) => unknown): unknown =>
  Array.isArray(value) ? value.map(apply) : value === undefined ? undefined : apply(value);

/**
 * A pie's or donut's data labels outside the ring in the theme's secondary
 * text, with no outline (T465, UX-113): left to ECharts they are `#333` with
 * a white outline, which a dark tile shows as outlined white text. A label
 * inside its slice is drawn on the slice's colour, not the tile's, and is
 * left as it is.
 */
function themedPie(series: unknown, theme: ChartTheme): unknown {
  const own = asObject(series);
  if (own['type'] !== 'pie' || own['label'] === undefined) return series;
  const label = asObject(own['label']);
  if (label['position'] === 'inside') return series;
  return {
    ...own,
    label: { color: COLORS[theme]['text-secondary'], textBorderWidth: 0, ...label },
  };
}

export function themed(option: EChartsOption, theme: ChartTheme): EChartsOption {
  const tokens = COLORS[theme];
  const coloured = recolour(option, swapsFor(theme)) as EChartsOption;
  const withText = (part: unknown, colour: string) => {
    const own = asObject(part);
    return { ...own, textStyle: { color: colour, ...asObject(own['textStyle']) } };
  };

  return {
    ...coloured,
    // The prototype's chart text (T254, N7): its root textStyle reaches
    // every text wechart draws (research/echarts-text-and-grid.md, Q1).
    // Unquoted, since server-rendered SVG does not escape a quote in it.
    textStyle: { fontFamily: CHART_FONT, ...asObject(coloured['textStyle']) },
    ...(coloured['xAxis'] === undefined
      ? {}
      : { xAxis: eachOf(coloured['xAxis'], (axis) => themedAxis(axis, theme)) }),
    ...(coloured['yAxis'] === undefined
      ? {}
      : { yAxis: eachOf(coloured['yAxis'], (axis) => themedAxis(axis, theme)) }),
    ...(coloured['series'] === undefined
      ? {}
      : { series: eachOf(coloured['series'], (one) => themedPie(one, theme)) }),
    ...(coloured['legend'] === undefined
      ? {}
      : { legend: eachOf(coloured['legend'], (one) => withText(one, tokens['text-secondary'])) }),
    // A colour legend's words — a map's two ends (T398) — as a legend's are.
    ...(coloured['visualMap'] === undefined
      ? {}
      : {
          visualMap: eachOf(coloured['visualMap'], (one) =>
            withText(one, tokens['text-secondary']),
          ),
        }),
    ...(coloured['title'] === undefined
      ? {}
      : { title: eachOf(coloured['title'], (one) => withText(one, tokens['text-primary'])) }),
    // The tooltip's box and text in the theme's raised surface, rather than
    // ECharts' white box on a dark page (T210's review).
    ...(coloured['tooltip'] === undefined
      ? {}
      : {
          tooltip: {
            backgroundColor: tokens['bg-raised'],
            borderColor: tokens['border-strong'],
            ...asObject(coloured['tooltip']),
            // Its figures tabular like the tile's: its own inline "font"
            // shorthand resets them, and extraCssText is written after it
            // (research/echarts-text-and-grid.md, Q2).
            extraCssText: `${String(asObject(coloured['tooltip'])['extraCssText'] ?? '')};font-variant-numeric: tabular-nums;`,
            textStyle: {
              color: tokens['text-primary'],
              // The prototype's 12 px; ECharts' tooltip default is 14.
              fontSize: 12,
              ...asObject(asObject(coloured['tooltip'])['textStyle']),
            },
          },
        }),
  };
}
