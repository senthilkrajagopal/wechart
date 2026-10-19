import { CHART_TYPE_NAMES, withComboSeries, type ChartType, type Undrawn } from '@wechart/core';

import type { WellsProps } from '../Wells';

/**
 * The Metrics well's undrawn line as the chart editor wires it (T510, R67;
 * AC-506): the metrics the drawn form leaves out, the form's name, and the
 * offers. In a combo, a metric on another scale is offered the right axis,
 * which puts it there through `withComboSeries`, as Customize › Series and
 * the pill do. None where every metric is drawn.
 *
 * Its own module so the wells' tests exercise the editor's real wiring
 * (checkpoint 1's review).
 */
export function undrawnWell({
  undrawn,
  shownType,
  options,
  onOptions,
  onSmallMultiples,
  onTable,
}: {
  readonly undrawn: readonly Undrawn[];
  readonly shownType: ChartType | null;
  readonly options: Readonly<Record<string, unknown>>;
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  readonly onSmallMultiples: (() => void) | undefined;
  readonly onTable: () => void;
}): WellsProps['undrawn'] {
  if (undrawn.length === 0 || shownType === null) return undefined;
  return {
    metrics: undrawn,
    drawnAs: CHART_TYPE_NAMES[shownType],
    onSmallMultiples,
    onTable,
    onRightAxis:
      shownType === 'combo'
        ? (member: string) =>
            onOptions({ series: withComboSeries(options, member, { axis: 'right' })['series'] })
        : undefined,
  };
}
