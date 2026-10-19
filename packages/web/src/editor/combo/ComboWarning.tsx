import { labelOf, optionFor } from '@wechart/charts';
import {
  canSynchronize,
  comboSeriesOf,
  isSynchronized,
  memberOn,
  membersOn,
  onOneScale,
  unitOfFormat,
  withOneAxis,
  withSynchronize,
  type ComboAxis,
  type RenderSpec,
} from '@wechart/core';
import {
  comboWarning,
  type ComboWarning as Warning,
  type ComboWarningOffer,
} from '@wechart/recommender';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * A combo's two-scales warning as the chart is drawn (T861; AC-218 as
 * amended by R80; design 20 pin 6, state D): each axis named by its first
 * measure and unit, an axis whose drawn range leaves zero out said so, and
 * none on one axis or two synchronized. Read from the drawn option itself,
 * so "doesn't start at zero" is what the reader sees.
 */
export function comboWarningOf(spec: RenderSpec): Warning | undefined {
  if (spec.chartType !== 'combo') return undefined;
  const drawn = onOneScale(spec);
  const measures = membersOn(drawn.encoding, 'y');
  const split = memberOn(drawn.encoding, 'color') !== undefined;
  const series = comboSeriesOf(measures, drawn.options, { split });
  const firstOn = (axis: ComboAxis) => series.find((one) => one.axis === axis)?.measure;
  const [left, right] = [firstOn('left'), firstOn('right')];
  if (left === undefined || right === undefined) return undefined;
  const formats = drawn.formats ?? {};
  const title = (measure: string) => labelOf(drawn, measure);
  let axes: readonly Record<string, unknown>[] = [];
  try {
    const yAxis = optionFor(spec)['yAxis'];
    axes = Array.isArray(yAxis) ? (yAxis as Record<string, unknown>[]) : [];
  } catch {
    axes = [];
  }
  /** An axis drawn without zero: a log axis, or a range wholly above or below it. */
  const offZero = (index: number) => {
    const axis = axes[index];
    if (axis === undefined) return false;
    const { min, max, type } = axis;
    return type === 'log' || (typeof min === 'number' && min > 0) || (typeof max === 'number' && max < 0);
  };
  return comboWarning({
    left: { measure: title(left), unit: unitOfFormat(formats[left]), offZero: offZero(0) },
    right: { measure: title(right), unit: unitOfFormat(formats[right]), offZero: offZero(1) },
    synchronize: canSynchronize(measures, drawn.options, formats, title),
    synchronized: isSynchronized(measures, drawn.options, formats),
  });
}

export interface ComboWarningProps {
  readonly warning: Warning;
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  readonly onSmallMultiples: () => void;
  readonly onTable: () => void;
}

const OFFER_NAMES: Record<ComboWarningOffer, string> = {
  oneAxis: 'One axis',
  synchronize: 'Synchronize',
  smallMultiples: 'Small multiples',
  table: 'Table',
};

/**
 * The warning's row in Customize › Axes (AC-218): a `status-warning` line
 * with its icon and words, then its offers in the warning's order. One axis
 * forgets every right axis chosen (`withOneAxis`); Synchronize turns it on
 * (`withSynchronize`), or is disabled with why while the formats differ.
 * The author's only: the editor shows it, a viewer never sees the editor.
 */
export function ComboWarning({
  warning,
  options,
  onOptions,
  onSmallMultiples,
  onTable,
}: ComboWarningProps) {
  const act: Record<ComboWarningOffer, () => void> = {
    oneAxis: () => onOptions({ series: withOneAxis(options)['series'] }),
    synchronize: () => {
      const next = withSynchronize(options, true);
      onOptions({ combo: next['combo'], axes: next['axes'] });
    },
    smallMultiples: onSmallMultiples,
    table: onTable,
  };
  const { synchronize } = warning;
  return (
    <div
      className="status-warning combo-warning"
      data-testid="combo-warning"
      id="combo-warning"
      tabIndex={-1}
    >
      <StatusIcon kind="warn" />
      <div>
        <p className="combo-warning__text">{warning.text}</p>
        <div className="combo-warning__offers">
          {warning.offers.map((offer) => {
            const off = offer === 'synchronize' && !synchronize.available;
            return (
              <button
                key={offer}
                type="button"
                className="btn btn-sm"
                disabled={off}
                {...(off && !synchronize.available ? { title: synchronize.reason } : {})}
                onClick={act[offer]}
              >
                {OFFER_NAMES[offer]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
