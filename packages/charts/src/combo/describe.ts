/**
 * A combo in words, and its table view's heads (T864; AC-509; design 20
 * state J; direction.md rules 5 and 125).
 *
 * The text alternative names the chart's category and split, then each
 * measure drawn with its mark, its axis and its unit, then how its value
 * axes are drawn, how many series, and each reference line or band drawn:
 * "Combo, by quarter, split by Region. Revenue: bars, left axis, dollars.
 * Margin %: line, right axis, percent. Axes aligned at zero. 8 series.
 * Monthly plan: line at $100K, left axis."
 *
 * The table view heads each measure's column "Revenue · bars, left · $";
 * split, it's laid out by category, each measure's members under it, so it
 * has a second header row of members.
 */
import {
  comboReferencesOf,
  comboSeriesOf,
  isSynchronized,
  memberOn,
  membersOn,
  onOneScale,
  referenceValue,
  scaleOf,
  seriesOf,
  unitOfFormat,
  type ComboMark,
  type ComboReference,
  type RenderSpec,
} from '@wechart/core';

import { labelOf, titleOf } from '../modelWriter';
import { comboReferencesOutside } from '../series/combo';

/** A mark as a sentence names it. */
const MARK_WORDS: Record<ComboMark, string> = {
  bar: 'bars',
  line: 'line',
  area: 'area',
  point: 'points',
};
/** A currency as a sentence names it. */
const CURRENCY_WORDS: Readonly<Record<string, string>> = {
  USD: 'dollars',
  EUR: 'euros',
  GBP: 'pounds',
  JPY: 'yen',
};

/** A measure's unit as a sentence names it: dollars, percent, or numbers. */
function unitWord(spec: RenderSpec, measure: string): string {
  const scale = scaleOf(spec.formats?.[measure]);
  if (scale === 'percent') return 'percent';
  if (scale.startsWith('currency ')) {
    const code = scale.slice('currency '.length);
    return CURRENCY_WORDS[code] ?? code;
  }
  return 'numbers';
}

/** A value short, as a sentence reads it: "$100K", "16.9%", "1.2K". */
function shortValue(spec: RenderSpec, measure: string | undefined, value: number): string {
  const scale = measure === undefined ? 'number' : scaleOf(spec.formats?.[measure]);
  if (scale === 'percent') {
    return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(
      value,
    );
  }
  if (scale.startsWith('currency ')) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: scale.slice('currency '.length),
      notation: 'compact',
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
}

/** The category axis in words: a time member by its grain, any other by its title. */
function categoryWords(spec: RenderSpec, category: string | undefined): string | undefined {
  if (category === undefined) return undefined;
  const grains = spec.granularities ?? {};
  const time = Object.keys(grains).find((member) => category.startsWith(member));
  if (time !== undefined) return grains[time];
  return labelOf(spec, category);
}

/** The measures drawn, each with its mark and axis, as the chart draws them. */
function drawnSeries(spec: RenderSpec) {
  const drawn = onOneScale(spec);
  const split = memberOn(drawn.encoding, 'color') !== undefined;
  return { drawn, series: comboSeriesOf(membersOn(drawn.encoding, 'y'), drawn.options, { split }) };
}

/** A reference in words, as drawn (AC-509): "Monthly plan: line at $100K, left axis". */
function referenceWords(spec: RenderSpec, reference: ComboReference, firstOn: (axis: string) => string | undefined) {
  const axis = reference.axis ?? 'left';
  const measure = reference.series ?? firstOn(axis);
  const at = (value: number | string | undefined) =>
    typeof value === 'number' ? shortValue(spec, measure, value) : String(value ?? '');
  if (reference.direction === 'vertical') {
    return reference.kind === 'band'
      ? `${reference.label}: band from ${at(reference.from)} to ${at(reference.to)}`
      : `${reference.label}: line at ${at(reference.value)}`;
  }
  return reference.kind === 'band'
    ? `${reference.label}: band from ${at(reference.from)} to ${at(reference.to)}, ${axis} axis`
    : `${reference.label}: line at ${at(referenceValue(spec, reference))}, ${axis} axis`;
}

export function describeCombo(spec: RenderSpec): string | undefined {
  if (spec.chartType !== 'combo') return undefined;
  const { drawn, series } = drawnSeries(spec);
  if (series.length === 0) return undefined;
  const category = categoryWords(drawn, membersOn(drawn.encoding, 'x')[0]);
  const splitBy = memberOn(drawn.encoding, 'color');
  const head = [
    'Combo',
    ...(category === undefined ? [] : [`by ${category}`]),
    ...(splitBy === undefined ? [] : [`split by ${labelOf(drawn, splitBy)}`]),
  ].join(', ');
  const measures = series.map(
    (one) =>
      `${labelOf(drawn, one.measure)}: ${MARK_WORDS[one.mark]}, ${one.axis} axis, ${unitWord(drawn, one.measure)}.`,
  );
  const two = series.some((one) => one.axis === 'right') && series.some((one) => one.axis === 'left');
  const axes = !two
    ? 'One value axis.'
    : isSynchronized(
          series.map((one) => one.measure),
          drawn.options,
          drawn.formats,
        )
      ? 'Axes synchronized.'
      : 'Axes aligned at zero.';
  const count = seriesOf(drawn).series.length;
  const firstOn = (axis: string) => series.find((one) => one.axis === axis)?.measure;
  const outside = new Set(comboReferencesOutside(spec));
  const references = comboReferencesOf(spec.options)
    .filter((one) => !outside.has(one.id))
    .map((one) => `${referenceWords(drawn, one, firstOn)}.`);
  return [`${head}.`, ...measures, axes, `${String(count)} series.`, ...references].join(' ');
}

/**
 * A measure's column head in a combo's table view (AC-509): "Revenue ·
 * bars, left · $", or without its unit where its format has none. None for
 * a column that isn't a measure drawn.
 */
export function comboColumnHead(spec: RenderSpec, column: string): string | undefined {
  if (spec.chartType !== 'combo') return undefined;
  const { drawn, series } = drawnSeries(spec);
  const own = series.find((one) => one.measure === column);
  if (own === undefined) return undefined;
  const unit = unitOfFormat(drawn.formats?.[column]);
  return [
    // By its title, as the table heads its other columns (AC-220).
    titleOf(drawn, column),
    `${MARK_WORDS[own.mark]}, ${own.axis}`,
    ...(unit === '' ? [] : [unit]),
  ].join(' · ');
}

/** A split combo's table view: by category, each measure's members under it (AC-509). */
export interface ComboTable {
  readonly category: string | undefined;
  readonly heads: readonly {
    readonly measure: string;
    readonly title: string;
    readonly members: readonly string[];
  }[];
  readonly rows: readonly {
    readonly category: string;
    /** Each measure's members' values, in the heads' order; a gap is null. */
    readonly values: readonly (number | null)[];
  }[];
}

export function comboTableOf(spec: RenderSpec): ComboTable | undefined {
  if (spec.chartType !== 'combo' || memberOn(spec.encoding, 'color') === undefined) return undefined;
  const { drawn, series } = drawnSeries(spec);
  const { categories, series: lines } = seriesOf(drawn);
  const heads = series.map((one) => ({
    measure: one.measure,
    title: comboColumnHead(spec, one.measure) ?? one.measure,
    members: lines.filter((line) => line.measure === one.measure).map((line) => line.name),
  }));
  return {
    category: membersOn(drawn.encoding, 'x')[0],
    heads,
    rows: categories.map((category, at) => ({
      category,
      values: heads.flatMap((head) =>
        lines
          .filter((line) => line.measure === head.measure)
          .map((line) => line.values[at] ?? null),
      ),
    })),
  };
}
