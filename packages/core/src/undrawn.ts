/**
 * Never a metric drawn invisibly (T510, AC-036; UX-057, design 01-5; R67,
 * the user).
 *
 * A chart's metrics are all queried, and all in its results and its table,
 * but a form draws only some of them: a pie one, a scatter two, a bar split
 * by colour its first once per member. And an unsplit bar, line or area
 * draws its metrics on one value axis, which can't honour two scales: a
 * count beside revenue was drawn about 0 px tall on a 0–250,000 axis. Such
 * a chart draws the metrics on its first metric's scale alone, the axis in
 * the first's format ("Draw the first only", R67).
 *
 * What is undrawn, and why, is said here once, for the renderer, the
 * editor's pills and the recommender alike.
 */
import type { MemberFormat, MemberFormats } from './format';
import { comboSeriesOf } from './combo';
import {
  membersOn,
  memberOn,
  type ChartType,
  type ComboAxis,
  type RenderSpec,
} from './render-spec';

/**
 * The scale a format puts a value on: money in its currency, a share, or a
 * plain number (the user's option A: a format differing from the first's,
 * with no magnitude threshold). Read from the d3 specifier Cube reports: a
 * `$` is money, in the currency it names (USD where none), and a `%` a share
 * (research/cube/data-modeling.md, "What `/v1/meta` reports for each
 * format"). A format given by name is read by its name.
 */
export function scaleOf(format: string | MemberFormat | undefined): string {
  if (format === undefined) return 'number';
  const name = typeof format === 'string' ? format : (format.name ?? '');
  const specifier = typeof format === 'string' ? format : (format.specifier ?? '');
  const currency = typeof format === 'string' ? undefined : format.currency;
  if (/^currency(?:_\d+)?$/.test(name) || specifier.includes('$'))
    return `currency ${currency ?? 'USD'}`;
  if (/^percent(?:_\d+)?$/.test(name) || specifier.includes('%')) return 'percent';
  return 'number';
}

/** Why a metric isn't drawn: on another scale than the first, or past what the form draws. */
export type UndrawnReason = 'scale' | 'form';

export interface Undrawn {
  readonly member: string;
  readonly reason: UndrawnReason;
}

/**
 * The forms that draw their metrics as series on one value axis, unsplit
 * (`seriesOf`): one series per metric, or split by colour one per member of
 * the first metric. A combo is one too: its first as bars, the rest as
 * lines, on one shared axis (`series/combo.ts`; T510's review).
 */
const ONE_AXIS: ReadonlySet<ChartType> = new Set<ChartType>([
  'bar',
  'hbar',
  'groupedBar',
  'stackedBar',
  'line',
  'multiLine',
  'area',
  'stackedArea',
  'combo',
]);

/** What a form is drawing, as far as its metrics go. */
export interface FormShape {
  readonly chartType: ChartType;
  /** The chart's metrics, in the Metrics well's order. */
  readonly measures: readonly string[];
  /** Split by a member: a one-axis form's colour, or small multiples' panels. */
  readonly split: boolean;
  /** Each metric's scale (`scaleOf`). */
  readonly scaleOf: (member: string) => string;
  /**
   * A combo's value axis for each metric (`comboSeriesOf`, T846): each axis
   * has a scale of its own. Absent, every metric shares one axis.
   */
  readonly axisOf?: (member: string) => ComboAxis;
}

/** The metrics a form doesn't draw, each with why, in the wells' order. */
export function undrawnOf({
  chartType,
  measures,
  split,
  scaleOf: scale,
  axisOf = () => 'left',
}: FormShape): Undrawn[] {
  const past = (drawn: number): Undrawn[] =>
    measures.slice(drawn).map((member) => ({ member, reason: 'form' as const }));
  const [first] = measures;
  if (first === undefined) return [];
  // Every metric, as numbers: in its rows and columns.
  if (chartType === 'table' || chartType === 'pivot') return [];
  // Every metric, each on an axis of its own and its own scale (AC-597).
  if (chartType === 'parallel') return [];
  // A panel per metric, each on its own scale; panelled by a member, the first in each.
  if (chartType === 'trellis') return split ? past(1) : [];
  // Two, one on each axis.
  if (chartType === 'scatter') return past(2);
  if (ONE_AXIS.has(chartType)) {
    // Split, the first metric per member; a combo draws every metric per
    // member (T852, AC-504), each against its axis's first as unsplit.
    if (split && chartType !== 'combo') return past(1);
    // Each metric against the first on its own axis: there is one axis
    // except in a combo the author gave a second (T846).
    const firstOn = (axis: ComboAxis) => measures.find((member) => axisOf(member) === axis);
    return measures
      .filter((member) => {
        const own = firstOn(axisOf(member));
        return member !== own && scale(member) !== scale(own ?? first);
      })
      .map((member) => ({ member, reason: 'scale' as const }));
  }
  // A KPI, a pie or donut, a treemap, a heatmap, a box plot, a map: one.
  return past(1);
}

/** A spec's form, from what it draws. */
function shapeOf(spec: RenderSpec, formats: MemberFormats = spec.formats ?? {}): FormShape {
  const split = memberOn(spec.encoding, spec.chartType === 'trellis' ? 'facet' : 'color');
  const measures = spec.measures ?? membersOn(spec.encoding, 'y');
  const axes =
    spec.chartType === 'combo'
      ? new Map(comboSeriesOf(measures, spec.options).map((one) => [one.measure, one.axis]))
      : undefined;
  return {
    chartType: spec.chartType,
    measures,
    split:
      ONE_AXIS.has(spec.chartType) || spec.chartType === 'trellis' ? split !== undefined : false,
    scaleOf: (member) => scaleOf(formats[member]),
    ...(axes === undefined ? {} : { axisOf: (member: string) => axes.get(member) ?? 'left' }),
  };
}

/** The metrics this chart's form leaves undrawn (T510): what the editor's pills say. */
export function undrawnMeasures(spec: RenderSpec): Undrawn[] {
  return undrawnOf(shapeOf(spec));
}

/**
 * An unsplit bar, line or area with its value axis held to the first
 * metric's scale (R67, "Draw the first only"): the metrics on another taken
 * off it, so its axis wears the first's format. Any other spec as it is.
 */
export function onOneScale(spec: RenderSpec): RenderSpec {
  const off = new Set(
    undrawnMeasures(spec)
      .filter((each) => each.reason === 'scale')
      .map((each) => each.member),
  );
  if (off.size === 0) return spec;
  return {
    ...spec,
    encoding: {
      ...spec.encoding,
      y: membersOn(spec.encoding, 'y').filter((member) => !off.has(member)),
    },
  };
}
