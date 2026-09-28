import { MOVING_AVERAGE_PERIODS, QUICK_CALCS, quickCalcName, type QuickCalc } from '@wechart/core';

import { MenuButton, type MenuItem } from '../shell/MenuButton';

/**
 * The menu on a measure in the chart editor (AC-047): the six quick
 * calculations, a moving average over each window the menu offers (3, 6 or 12
 * periods, the user's 2026-09-24 answer), and, once one is applied, a way to
 * take it off.
 *
 * It is the measure pill's aggregation tag made a menu, as direction.md §8's
 * WellPill has it ("name, aggregation or granularity menu, sort, and ×"): the
 * tag names the calculation applied, or the aggregation while there is none.
 */
export interface QuickCalcMenuProps {
  /** The measure as its pill names it. */
  readonly title: string;
  /** What the pill says of the measure while no calculation is applied: its aggregation. */
  readonly tag?: string | undefined;
  readonly applied?: QuickCalc | undefined;
  readonly onApply: (calc: QuickCalc | undefined) => void;
  readonly testId?: string;
}

/** Every calculation the menu offers, in the criterion's order, each window of a moving average. */
const OFFERED: readonly QuickCalc[] = QUICK_CALCS.flatMap((kind): QuickCalc[] =>
  kind === 'movingAverage'
    ? MOVING_AVERAGE_PERIODS.map((periods) => ({ kind, periods }))
    : [{ kind }],
);

const keyOf = (calc: QuickCalc) =>
  calc.kind === 'movingAverage' ? `${calc.kind}-${String(calc.periods)}` : calc.kind;

export function QuickCalcMenu({ title, tag, applied, onApply, testId }: QuickCalcMenuProps) {
  const label = `Calculations on ${title}`;
  const current = applied === undefined ? undefined : keyOf(applied);
  const items: MenuItem[] = [
    ...(applied === undefined
      ? []
      : [
          {
            key: 'none',
            testId: 'calc-none',
            label: 'No calculation',
            onSelect: () => onApply(undefined),
          },
        ]),
    ...OFFERED.map((calc, index) => ({
      key: keyOf(calc),
      testId: `calc-${keyOf(calc)}`,
      label: quickCalcName(calc),
      separatorBefore: applied !== undefined && index === 0,
      onSelect: () => {
        // The one already applied, chosen again, is no change (and no undo step).
        if (keyOf(calc) !== current) onApply(calc);
      },
    })),
  ];
  return (
    <MenuButton
      label={label}
      className="pill__calc"
      align="start"
      items={items}
      {...(testId === undefined ? {} : { testId })}
    >
      {applied === undefined ? (tag ?? 'Calculate') : quickCalcName(applied)}
      {/* At the pill's 12 px, the floor for any text (AC-004). */}
      <span aria-hidden="true">▾</span>
    </MenuButton>
  );
}
