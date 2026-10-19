import type { LegendGlyphBox } from '@wechart/charts';

import { PillMarkMenu, type ComboPillProps } from './PillMarkMenu';

/**
 * A combo's legend glyphs as buttons, in the chart editor only (T857;
 * AC-497; design 20 screen 1 pin 11): a 20 px button centred on each
 * measure's glyph where the chart drew it (`legendGlyphBoxes`), named as the
 * Metrics pill's is ("Revenue target: line, left axis. Change mark or axis")
 * and opening the same menu (`PillMarkMenu`), so the three places to set a
 * mark or an axis can't disagree. A dashboard tile, in view or edit mode, is
 * never given these: only the editor's preview passes them.
 *
 * A pointer over a glyph, or focus on it, emphasises its series' axis as a
 * pointer over the series does (AC-500, decision T848-2): the legend itself
 * is silent to the pointer, so this is the entry the pointer reaches.
 *
 * An entry that isn't a measure, a split's member, gets no button: the
 * split legend's measures part isn't drawn yet (decision T857-1).
 */
export interface LegendGlyphButtonsProps extends ComboPillProps {
  readonly glyphs: readonly LegendGlyphBox[];
  /** Emphasise this series' axis, or none. */
  readonly emphasise: (name: string | undefined) => void;
  readonly onFormat: (measure: string) => void;
  readonly onRemove: (measure: string) => void;
}

/** The button's side, centred on the glyph (design 20 pin 11). */
const SIDE = 20;

export function LegendGlyphButtons({
  glyphs,
  emphasise,
  onFormat,
  onRemove,
  ...pill
}: LegendGlyphButtonsProps) {
  const measures = new Set(pill.measures.map((one) => one.measure));
  return (
    <>
      {glyphs
        .filter((glyph) => measures.has(glyph.name))
        .map((glyph) => (
          <span
            key={glyph.name}
            className="legend-glyph"
            data-testid="legend-glyph"
            style={{
              left: `${String(glyph.x - SIDE / 2)}px`,
              top: `${String(glyph.y - SIDE / 2)}px`,
              width: `${String(SIDE)}px`,
              height: `${String(SIDE)}px`,
            }}
            onMouseEnter={() => emphasise(glyph.name)}
            onMouseLeave={() => emphasise(undefined)}
            onFocus={() => emphasise(glyph.name)}
            onBlur={() => emphasise(undefined)}
          >
            <PillMarkMenu
              {...pill}
              on="legend"
              measure={glyph.name}
              onFormat={() => onFormat(glyph.name)}
              onRemove={() => onRemove(glyph.name)}
            />
          </span>
        ))}
    </>
  );
}
