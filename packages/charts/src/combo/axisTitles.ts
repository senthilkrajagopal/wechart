/**
 * A combo's mark glyphs (direction.md §7h), drawn in its legend, and each
 * value axis titled with its unit (AC-500, rule 119 as amended by R82).
 *
 * Each axis is titled horizontally above itself — `nameLocation: 'end'`,
 * `nameRotate: 0` — with its unit alone, a currency's symbol or "%", or,
 * where its format has no unit, its measures' names ("Orders"). A title
 * carries no glyph: the legend holds them, with "(right)" ("Legend +
 * unit-only axis titles", R82). The title stays `text-secondary`, as ticks
 * do (rule 2: series-coloured text fails contrast).
 */
import { unitOfFormat, type ComboMark, type RenderSpec } from '@wechart/core';

import { labelOf } from '../modelWriter';

/** One measure drawn on an axis. */
export interface TitledMeasure {
  readonly measure: string;
}

/**
 * A mark's glyph as a legend icon (§7h), a path the legend scales into its
 * 12 × 8 item keeping its proportions (`symbolKeepAspect`, on by default;
 * research/echarts-axis-legend-bars.md §2), so each comes out at its size:
 * bar an 8 × 8 square, radius 2; line a 12 × 2 rule; point an 8 px dot;
 * area a 12 × 8 block (decision T848-1).
 */
export const GLYPH_PATHS: Readonly<Record<ComboMark, string>> = {
  bar: 'path://M2,0H6A2,2,0,0,1,8,2V6A2,2,0,0,1,6,8H2A2,2,0,0,1,0,6V2A2,2,0,0,1,2,0Z',
  line: 'path://M0,0H12V2H0Z',
  point: 'path://M4,0A4,4,0,1,1,4,8A4,4,0,1,1,4,0Z',
  area: 'path://M0,0H12V8H0Z',
};

/**
 * The unit a format writes its values in, for an axis title: a currency's
 * symbol, "%" for a share, nothing for a plain number (`scaleOf`).
 */
export function unitOf(spec: RenderSpec, measure: string): string {
  return unitOfFormat(spec.formats?.[measure]);
}

/**
 * An axis's title, as ECharts' axis options: the unit of its first measure,
 * whose format the axis is written in; or, with no unit, its measures'
 * names joined by " · ". At the axis's top, from its line inwards (`align`
 * left on the left axis, right on the right).
 */
export function axisTitle(
  spec: RenderSpec,
  measures: readonly TitledMeasure[],
  side: 'left' | 'right',
): Record<string, unknown> {
  const [first] = measures;
  const unit = first === undefined ? '' : unitOf(spec, first.measure);
  const name =
    unit !== ''
      ? unit
      : measures
          // Braces would open a rich-text token.
          .map((one) => labelOf(spec, one.measure).replace(/[{}]/g, ''))
          .join(' · ');
  return {
    name,
    nameLocation: 'end',
    nameRotate: 0,
    nameGap: 12,
    nameTextStyle: { align: side },
  };
}
