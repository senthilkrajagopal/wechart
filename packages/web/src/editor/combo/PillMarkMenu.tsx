import {
  COMBO_AXES,
  COMBO_MARKS,
  comboSeriesOf,
  markTakenBy,
  withComboAuto,
  withComboSeries,
  type ComboAxis,
  type ComboMark,
} from '@wechart/core';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { MarkGlyph } from './SeriesRows';

/**
 * A combo's Metrics pill menu (T856; AC-497; design 20 screen 2 pin 2): the
 * pill starts with its mark's glyph, a button named "‹measure›: ‹mark›,
 * ‹axis› axis. Change mark or axis", opening Draw as (Bar, Line, Area,
 * Point) and Axis (Left, Right) as groups of `menuitemradio`, the current
 * ones checked, then Back to Auto, Format… and Remove. Esc returns focus to
 * the pill's button (`MenuButton`).
 *
 * It writes through `withComboSeries` and `withComboAuto` (`@wechart/core`),
 * as Customize › Series does (`SeriesRows`), so the two can't disagree. A
 * mark another measure draws while split is disabled, saying why (rule 122).
 */
export interface ComboPillProps {
  /** The measures in the Metrics well, in order, each with its title. */
  readonly measures: readonly { readonly measure: string; readonly title: string }[];
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** The dimension the combo is split by, by its title. */
  readonly split?: { readonly dimension: string } | undefined;
}

export interface PillMarkMenuProps extends ComboPillProps {
  readonly measure: string;
  readonly onFormat: () => void;
  readonly onRemove: () => void;
}

const MARK_NAMES: Record<ComboMark, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  point: 'Point',
};
const AXIS_NAMES: Record<ComboAxis, string> = { left: 'Left', right: 'Right' };
/** "bars", "a line", as a reason says what a measure draws. */
const DRAWS: Record<ComboMark, string> = {
  bar: 'bars',
  line: 'a line',
  area: 'an area',
  point: 'points',
};

/** A measure's mark and axis as drawn, and as Auto would draw them. */
function seriesFor({ measures, options, split }: ComboPillProps, measure: string) {
  const names = measures.map((one) => one.measure);
  const splitBy = split !== undefined;
  const now = comboSeriesOf(names, options, { split: splitBy }).find(
    (one) => one.measure === measure,
  );
  const auto = comboSeriesOf(names, withComboAuto(options, measure), { split: splitBy }).find(
    (one) => one.measure === measure,
  );
  return { now, auto };
}

/** The pill's L or R tag, before its × (AC-497). */
export function PillAxisTag(props: ComboPillProps & { readonly measure: string }) {
  const { now } = seriesFor(props, props.measure);
  if (now === undefined) return null;
  return (
    <span
      className="pill__tag pill__axis"
      data-testid="pill-axis"
      title={`${AXIS_NAMES[now.axis]} axis`}
    >
      {now.axis === 'left' ? 'L' : 'R'}
    </span>
  );
}

export function PillMarkMenu(props: PillMarkMenuProps) {
  const { measures, options, onOptions, split, measure, onFormat, onRemove } = props;
  const { now, auto } = seriesFor(props, measure);
  if (now === undefined) return null;
  const names = measures.map((one) => one.measure);
  const titleOf = (name: string) => measures.find((one) => one.measure === name)?.title ?? name;
  const title = titleOf(measure);
  const write = (next: Record<string, unknown>) => onOptions({ series: next['series'] });

  const items: MenuItem[] = [
    ...COMBO_MARKS.map((mark): MenuItem => {
      const takenBy = markTakenBy(names, options, split !== undefined, mark, measure);
      // Never the mark it draws (T855's review).
      const why =
        takenBy === undefined || split === undefined || now.mark === mark
          ? undefined
          : `${titleOf(takenBy)} draws ${DRAWS[mark]}. While the chart is split by ${split.dimension}, each measure needs its own mark.`;
      return {
        key: `mark-${mark}`,
        group: 'Draw as',
        label: (
          <>
            <MarkGlyph mark={mark} />
            {MARK_NAMES[mark]}
          </>
        ),
        checked: now.mark === mark,
        ...(why === undefined ? {} : { disabled: true, title: why }),
        onSelect: () => write(withComboSeries(options, measure, { mark })),
      };
    }),
    ...COMBO_AXES.map((axis, index): MenuItem => ({
      key: `axis-${axis}`,
      group: 'Axis',
      separatorBefore: index === 0,
      label: AXIS_NAMES[axis],
      checked: now.axis === axis,
      onSelect: () => write(withComboSeries(options, measure, { axis })),
    })),
    {
      key: 'auto',
      separatorBefore: true,
      label: auto === undefined ? 'Back to Auto' : `Back to Auto (${auto.mark}, ${auto.axis})`,
      ...(now.auto ? { disabled: true, title: `${title} is on Auto.` } : {}),
      onSelect: () => write(withComboAuto(options, measure)),
    },
    { key: 'format', label: 'Format…', onSelect: onFormat },
    { key: 'remove', label: 'Remove', onSelect: onRemove },
  ];

  return (
    <MenuButton
      label={`${title}: ${now.mark}, ${now.axis} axis. Change mark or axis`}
      items={items}
      className="pill__mark"
      align="start"
      testId={`pill-mark-${measure}`}
    >
      <MarkGlyph mark={now.mark} />
    </MenuButton>
  );
}
