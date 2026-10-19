import {
  canSynchronize,
  isSynchronized,
  withSynchronize,
  type MemberFormats,
} from '@wechart/core';
import { useId, useState } from 'react';

/**
 * Synchronize axes (T858; AC-501; design 20 pin 5, state C): a switch, off
 * by default, enabled only while both value axes share a number format and
 * otherwise disabled with the reason naming both ("Revenue is in $ and
 * Margin % in %"). On, the right axis follows the left: one scale, labelled
 * on both sides. Turning it on clears a fixed minimum or maximum the right
 * axis had (`withSynchronize`), with a toast whose Undo puts the options
 * back as they were.
 *
 * Shown by Customize › Axes only while a series is on the right.
 */
export interface SynchronizeSwitchProps {
  /** The combo's measures drawn, in the well's order. */
  readonly measures: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly formats: MemberFormats;
  readonly label: (measure: string) => string;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
}

/** Whether the right axis has an end of its own, which turning Synchronize on clears. */
function rightHasEnds(options: Readonly<Record<string, unknown>>): boolean {
  const axes = options['axes'];
  if (typeof axes !== 'object' || axes === null) return false;
  const right = (axes as Record<string, unknown>)['right'];
  if (typeof right !== 'object' || right === null) return false;
  const { min, max } = right as Record<string, unknown>;
  return min !== undefined || max !== undefined;
}

export function SynchronizeSwitch({
  measures,
  options,
  formats,
  label,
  onOptions,
}: SynchronizeSwitchProps) {
  const id = useId();
  const state = canSynchronize(measures, options, formats, label);
  const on = isSynchronized(measures, options, formats);
  /** The options' combo and axes as they were before turning it on, for Undo. */
  const [undo, setUndo] = useState<Readonly<Record<string, unknown>> | undefined>(undefined);

  const toggle = () => {
    const next = withSynchronize(options, !on);
    if (!on && rightHasEnds(options)) {
      setUndo({ combo: options['combo'], axes: options['axes'] });
    } else {
      setUndo(undefined);
    }
    onOptions({ combo: next['combo'], axes: next['axes'] });
  };

  return (
    <div className="combo-synchronize">
      <div className="combo-series__row">
        <button
          type="button"
          role="switch"
          className="combo-switch"
          aria-checked={on}
          aria-label="Synchronize axes"
          disabled={!state.available}
          {...(state.available ? {} : { 'aria-describedby': `${id}-why` })}
          onClick={toggle}
        >
          <span className="combo-switch__track" aria-hidden="true" />
        </button>
        <span className="combo-series__name">
          Synchronize axes{on ? ' · one scale, labelled on both sides' : ''}
        </span>
      </div>
      {state.available ? null : (
        <p className="panel-section__note" id={`${id}-why`}>
          {state.reason}
        </p>
      )}
      {undo === undefined ? null : (
        <div role="status" className="combo-toast">
          Right axis now follows the left axis ·{' '}
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              onOptions(undo);
              setUndo(undefined);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
