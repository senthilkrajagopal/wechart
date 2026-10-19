import {
  comboStackingOf,
  comboStackingRows,
  withComboStacking,
  type AreaStacking,
  type BarStacking,
  type ComboSeries,
  type ComboStackingRow,
} from '@wechart/core';
import { useId } from 'react';

/**
 * A combo's stacking (T859; AC-503; design 20 screen 1 pin 4, Q11 (a)): set
 * once for the whole chart, under Customize › Series. "Bars: Side by side |
 * Stacked" always, and "Areas: Overlap | Stacked" only while a series is an
 * area (`comboStackingRows`). Each is a radio group named by its row,
 * segmented as the series rows' Axis is (native radios; R75 adds no key).
 * A stack never crosses axes: the drawing keys each per axis (T851).
 */
export interface StackingRowsProps {
  /** The combo's series as drawn, for the marks they use. */
  readonly series: readonly Pick<ComboSeries, 'mark'>[];
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
}

const ROWS: Readonly<
  Record<
    ComboStackingRow,
    { readonly label: string; readonly choices: readonly (readonly [string, string])[] }
  >
> = {
  bars: {
    label: 'Bars',
    choices: [
      ['side-by-side', 'Side by side'],
      ['stacked', 'Stacked'],
    ],
  },
  areas: {
    label: 'Areas',
    choices: [
      ['overlap', 'Overlap'],
      ['stacked', 'Stacked'],
    ],
  },
};

export function StackingRows({ series, options, onOptions }: StackingRowsProps) {
  const ids = useId();
  const stacking = comboStackingOf(options);
  /** The options' `combo` after a change, as a patch: absent once empty. */
  const write = (next: Record<string, unknown>) => onOptions({ combo: next['combo'] });

  return (
    <div className="combo-stacking">
      {comboStackingRows(series).map((row) => {
        const { label, choices } = ROWS[row];
        return (
          <div key={row} className="combo-series__row">
            <span className="combo-series__name" id={`${ids}-${row}`}>
              {label}
            </span>
            <div role="radiogroup" aria-labelledby={`${ids}-${row}`} className="combo-series__seg">
              {choices.map(([value, name]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`${ids}-${row}`}
                    aria-label={name}
                    checked={stacking[row] === value}
                    onChange={() =>
                      write(
                        row === 'bars'
                          ? withComboStacking(options, 'bars', value as BarStacking)
                          : withComboStacking(options, 'areas', value as AreaStacking),
                      )
                    }
                  />
                  <span aria-hidden="true">{name}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
