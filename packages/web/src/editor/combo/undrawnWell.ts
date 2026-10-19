import {
  CHART_TYPE_NAMES,
  COMBO_SERIES_LIMIT,
  withComboSeries,
  type ChartType,
  type Undrawn,
} from '@wechart/core';

import type { WellsProps } from '../Wells';
import { nounFor } from './SplitCount';

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
  limit,
}: {
  readonly undrawn: readonly Undrawn[];
  readonly shownType: ChartType | null;
  readonly options: Readonly<Record<string, unknown>>;
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  readonly onSmallMultiples: (() => void) | undefined;
  readonly onTable: () => void;
  /**
   * A combo held to 8 series (T860, AC-505): the measures drawn, and while
   * split its members and dimension, which say why the rest aren't drawn.
   */
  readonly limit?:
    | { readonly drawn: number; readonly members?: number; readonly dimension?: string }
    | undefined;
}): WellsProps['undrawn'] {
  if (undrawn.length === 0 || shownType === null) return undefined;
  const split = limit?.dimension;
  return {
    metrics: undrawn,
    drawnAs: CHART_TYPE_NAMES[shownType],
    onSmallMultiples,
    onTable,
    ...(limit === undefined
      ? {}
      : {
          overLimit:
            // All chosen, and one measure alone past 8 (AC-505, decision T853-1).
            limit.drawn === 0 && limit.members !== undefined && split !== undefined
              ? `${String(limit.members)} ${nounFor(split, limit.members)} make ${String(limit.members)} series for each measure, past the ${String(COMBO_SERIES_LIMIT)} a combo draws.`
              : `${
                  limit.members === undefined || split === undefined
                    ? `${String(limit.drawn)} ${limit.drawn === 1 ? 'measure' : 'measures'}`
                    : `${String(limit.drawn)} ${limit.drawn === 1 ? 'measure' : 'measures'} × ${String(limit.members)} ${nounFor(split, limit.members)}`
                } already make ${
                  limit.drawn * (limit.members ?? 1) === COMBO_SERIES_LIMIT
                    ? `${String(COMBO_SERIES_LIMIT)} series, the most a combo draws.`
                    : `${String(limit.drawn * (limit.members ?? 1))} series, and another measure's ${String(limit.members ?? 1)} would pass the ${String(COMBO_SERIES_LIMIT)} a combo draws.`
                }`,
          ...(split === undefined ? {} : { smallMultiplesBy: split }),
        }),
    onRightAxis:
      shownType === 'combo'
        ? (member: string) =>
            onOptions({ series: withComboSeries(options, member, { axis: 'right' })['series'] })
        : undefined,
  };
}
