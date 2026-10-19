/**
 * A combo's reference lines and bands as drawn (T863; AC-508; design 20
 * pins 15 and 16, state F3; direction.md §7h). Each is a mark on a carrier
 * series of its own, on the axis it reads: a `markLine` or a `markArea`
 * (research/rich-tiles-and-combo-tech.md, "Reference lines and areas": a
 * marker belongs to its series and uses that series' axis). The carrier has
 * no data, is silent and out of the tooltip, and is named by the reference,
 * which the legend's listed entries never name.
 *
 * - A fixed line: 1.5 px, dashed 5 4, `text-secondary`. A computed one:
 *   dashed in its series' colour.
 * - A band: filled `bg-subtle`, no edge, below every series.
 * - Back to front: bands, areas, bars, lines, points, reference lines, and
 *   their labels on them.
 * - Each labelled where it's drawn, in `text-xs` `text-primary` on a 3 px
 *   surface halo, at its line's end or start, its value after it while Show
 *   value is on. A label that would meet one already placed moves to its
 *   line's other end, and if that's taken too, 16 px inward.
 * - One outside its axis's range, at or below zero on a log axis, or at a
 *   category the axis hasn't got, isn't drawn, and is named in `outside`.
 */
import {
  comboReferencesOf,
  referenceValue,
  type ComboAxis,
  type ComboReference,
  type RenderSpec,
} from '@wechart/core';
import { COLORS, TYPE_SCALE } from '@wechart/ui';

import { comboReferencesOutside } from '../series/combo';
import { COMBO_Z } from '../theme';

/** What drawing a combo's references reads of the chart around them. */
export interface ReferenceContext {
  /** The category axis's values, as the chart draws them. */
  readonly categories: readonly string[];
  /** Each value axis's extent where it's fixed; absent, its range isn't known. */
  readonly extents: Partial<Record<ComboAxis, { readonly min: number; readonly max: number }>>;
  readonly log: Readonly<Record<ComboAxis, boolean>>;
  /** The plot's height, for whether two labels meet. */
  readonly plotHeight: number;
  /** A computed line's colour, its series'; none where it has no one colour. */
  readonly colourOf: (measure: string) => string | undefined;
  readonly surface: string;
  /** A value written as its axis writes it. */
  readonly write: (reference: ComboReference, value: number | string) => string;
  /**
   * Below 1,024 px (T866, AC-511): each labelled by its label alone, its
   * value in a tooltip of its own.
   */
  readonly narrow?: boolean;
}

const AXIS_INDEX: Record<ComboAxis, number> = { left: 0, right: 1 };
const DASH = [5, 4];
const LINE_PX = 1.5;
const HALO_PX = 3;
const INWARD_PX = 16;
const LABEL = TYPE_SCALE['text-xs'];
/** Above the points (`COMBO_Z.point`), and bands below the areas. */
const Z = { band: 0, line: COMBO_Z.point + 1 } as const;

/** The category a vertical reference names: itself, or a date's bucket that starts with it. */
function categoryOf(categories: readonly string[], value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const wanted = String(value);
  return categories.find((one) => one === wanted) ?? categories.find((one) => one.startsWith(wanted));
}

/** A drawn label's place: its end, and how far it's moved inward. */
interface Placed {
  readonly at: 'start' | 'end';
  readonly y: number;
}

export function referenceDrawing(
  spec: Pick<RenderSpec, 'rows' | 'options'>,
  context: ReferenceContext,
): { series: Record<string, unknown>[]; outside: string[] } {
  const outside: string[] = [];
  const placed: Placed[] = [];
  const series: Record<string, unknown>[] = [];

  /** Where a horizontal line's label sits, and its offset, by the labels already placed. */
  const placeLabel = (reference: ComboReference, value: number) => {
    const preferred = reference.labelAt ?? 'end';
    const extent = context.extents[reference.axis ?? 'left'];
    if (extent === undefined || extent.max === extent.min) {
      return { at: preferred, offset: [0, 0] };
    }
    const y = ((value - extent.min) / (extent.max - extent.min)) * context.plotHeight;
    const meets = (at: 'start' | 'end') =>
      placed.some((one) => one.at === at && Math.abs(one.y - y) < LABEL.lineHeightPx);
    const other = preferred === 'end' ? 'start' : 'end';
    const at = !meets(preferred) ? preferred : !meets(other) ? other : preferred;
    const inward = meets(preferred) && meets(other);
    placed.push({ at, y });
    return { at, offset: [inward ? (at === 'end' ? -INWARD_PX : INWARD_PX) : 0, 0] };
  };

  const label = (
    reference: ComboReference,
    value: number | string,
    at: 'start' | 'end',
    offset: number[],
  ) => ({
    show: true,
    // Along a vertical line too, its start being the axis's foot.
    position: at === 'start' ? 'insideStartTop' : 'insideEndTop',
    offset,
    color: COLORS.light['text-primary'],
    fontSize: LABEL.fontSizePx,
    lineHeight: LABEL.lineHeightPx,
    textBorderColor: context.surface,
    textBorderWidth: HALO_PX,
    formatter:
      reference.showValue === true && context.narrow !== true
        ? `${reference.label} · ${context.write(reference, value)}`
        : reference.label,
  });

  /**
   * Below 1,024 px, a mark answering the pointer with its own tooltip,
   * "Monthly plan: $100K" (T866): a marker's tooltip is its own, triggered by
   * the item (research/echarts-narrow-combo.md). Wider, silent, as its
   * carrier is (`MarkLineView.js`: a marker is silent while its series is).
   */
  const answering = (reference: ComboReference, value: string) =>
    context.narrow === true
      ? {
          silent: false,
          tooltip: { show: true, trigger: 'item', formatter: `${reference.label}: ${value}` },
        }
      : { silent: true };

  const carrier = (reference: ComboReference, mark: Record<string, unknown>, band: boolean) => ({
    type: 'line',
    name: `reference:${reference.id}`,
    // Beyond ECharts: which reference it carries.
    reference: reference.id,
    data: [],
    yAxisIndex: AXIS_INDEX[reference.axis ?? 'left'],
    z: band ? Z.band : Z.line,
    silent: context.narrow !== true,
    legendHoverLink: false,
    tooltip: { show: false },
    ...mark,
  });

  for (const reference of comboReferencesOf(spec.options)) {
    const axis = reference.axis ?? 'left';
    const extent = context.extents[axis];
    const vertical = reference.direction === 'vertical';
    /** A value across a value axis that it can show. */
    const onAxis = (value: number) =>
      !(context.log[axis] && value <= 0) &&
      (extent === undefined || (value >= extent.min && value <= extent.max));

    if (reference.kind === 'band') {
      const from = vertical ? categoryOf(context.categories, reference.from) : reference.from;
      const to = vertical ? categoryOf(context.categories, reference.to) : reference.to;
      if (from === undefined || to === undefined) {
        outside.push(reference.id);
        continue;
      }
      if (!vertical) {
        const [low, high] = [Number(from), Number(to)];
        const clear =
          (extent !== undefined && (high < extent.min || low > extent.max)) ||
          (context.log[axis] && high <= 0);
        if (clear) {
          outside.push(reference.id);
          continue;
        }
      }
      const key = vertical ? 'xAxis' : 'yAxis';
      const range = `${context.write(reference, from)}–${context.write(reference, to)}`;
      series.push(
        carrier(
          reference,
          {
            markArea: {
              ...answering(reference, range),
              itemStyle: { color: COLORS.light['bg-subtle'], borderWidth: 0 },
              label: label(reference, range, reference.labelAt ?? 'end', [0, 0]),
              data: [[{ [key]: from }, { [key]: to }]],
            },
          },
          true,
        ),
      );
      continue;
    }

    if (vertical) {
      const at = categoryOf(context.categories, reference.value);
      if (at === undefined) {
        outside.push(reference.id);
        continue;
      }
      series.push(
        carrier(
          reference,
          {
            markLine: {
              ...answering(reference, context.write(reference, at)),
              symbol: ['none', 'none'],
              lineStyle: { width: LINE_PX, type: DASH, color: COLORS.light['text-secondary'] },
              label: label(reference, at, reference.labelAt ?? 'end', [0, 0]),
              data: [{ xAxis: at }],
            },
          },
          false,
        ),
      );
      continue;
    }

    const value = referenceValue(spec, reference);
    if (typeof value !== 'number' || !onAxis(value)) {
      outside.push(reference.id);
      continue;
    }
    const computed = reference.stat !== undefined && reference.series !== undefined;
    const colour =
      (computed && reference.series !== undefined ? context.colourOf(reference.series) : undefined) ??
      COLORS.light['text-secondary'];
    const { at, offset } = placeLabel(reference, value);
    series.push(
      carrier(
        reference,
        {
          markLine: {
            ...answering(reference, context.write(reference, value)),
            symbol: ['none', 'none'],
            lineStyle: { width: LINE_PX, type: DASH, color: colour },
            label: label(reference, value, at, offset),
            data: [{ yAxis: value }],
          },
        },
        false,
      ),
    );
  }
  return { series, outside };
}

/** The references a combo as drawn leaves out, by id: what the editor's rows say of. */
export function referencesOutside(spec: RenderSpec): readonly string[] {
  return comboReferencesOutside(spec);
}
