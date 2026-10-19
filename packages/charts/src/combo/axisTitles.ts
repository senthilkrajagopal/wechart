/**
 * A combo's mark glyphs (direction.md §7h), and each value axis titled with
 * them (AC-500, rule 119).
 *
 * Each axis is titled horizontally above itself — `nameLocation: 'end'`,
 * `nameRotate: 0` — with its measures, each after its mark's glyph in its
 * series' colour, then the axis's unit. A glyph is a rich-text token with no
 * text, drawn as its box: `width`, `height`, `backgroundColor`,
 * `borderRadius` and a border are rich-text box properties (research/
 * echarts-combo-layers.md, "Axis titles and the legend"). The title's words
 * stay `text-secondary`, as ticks do (rule 2: series-coloured text fails
 * contrast).
 */
import { unitOfFormat, type ComboMark, type RenderSpec } from '@wechart/core';

import { labelOf } from '../modelWriter';
import { DEFAULT_SURFACE } from '../theme';

/** One measure as its axis's title names it. */
export interface TitledMeasure {
  readonly measure: string;
  readonly mark: ComboMark;
  readonly colour: string;
}

/**
 * A mark's glyph as a rich-text box (§7h): bar an 8 × 8 square, radius 2;
 * line a 12 × 2 rule; point an 8 px dot ringed 1 px in the surface; area a
 * 12 × 8 block (a rich box has one border for all its edges, so an area's
 * top edge is its block's own; decision T848-1).
 */
export function glyphStyle(
  mark: ComboMark,
  colour: string,
  surface: string = DEFAULT_SURFACE,
): Record<string, unknown> {
  switch (mark) {
    case 'bar':
      return { width: 8, height: 8, borderRadius: 2, backgroundColor: colour };
    case 'line':
      return { width: 12, height: 2, backgroundColor: colour };
    case 'point':
      return {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colour,
        borderColor: surface,
        borderWidth: 1,
      };
    case 'area':
      return { width: 12, height: 8, backgroundColor: colour };
  }
}

/**
 * A mark's glyph as a legend icon (§7h), a path the legend scales into its
 * 12 × 8 item keeping its proportions (`symbolKeepAspect`, on by default;
 * research/echarts-axis-legend-bars.md §2), so each comes out at its size.
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
 * An axis's title, as ECharts' axis options: its measures after their
 * glyphs, then the unit of the first, whose format the axis is written in;
 * at the axis's top, from its line inwards (`align` left on the left axis,
 * right on the right).
 */
export function axisTitle(
  spec: RenderSpec,
  measures: readonly TitledMeasure[],
  side: 'left' | 'right',
): Record<string, unknown> {
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const rich: Record<string, Record<string, unknown>> = {};
  const named = measures.map((one, at) => {
    const token = `g${String(at)}`;
    rich[token] = glyphStyle(one.mark, one.colour, surface);
    // Braces would open a rich-text token of their own.
    return `{${token}|} ${labelOf(spec, one.measure).replace(/[{}]/g, '')}`;
  });
  const [first] = measures;
  const unit = first === undefined ? '' : unitOf(spec, first.measure);
  return {
    name: `${named.join(' · ')}${unit === '' ? '' : ` (${unit})`}`,
    nameLocation: 'end',
    nameRotate: 0,
    nameGap: 12,
    nameTextStyle: { align: side, rich },
  };
}
