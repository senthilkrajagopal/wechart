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

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** The right axis's own ends, which turning Synchronize on clears, or none. */
function rightEndsOf(
  options: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  const { min, max } = record(record(options['axes'])['right']);
  if (min === undefined && max === undefined) return undefined;
  return { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
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
  /**
   * The right axis's ends that turning it on cleared, for Undo, which takes
   * back only that and the switch, on the options as they are by then, so
   * an edit made since is kept (checkpoint 2's review).
   */
  const [cleared, setCleared] = useState<Readonly<Record<string, unknown>> | undefined>(
    undefined,
  );

  const toggle = () => {
    const next = withSynchronize(options, !on);
    setCleared(on ? undefined : rightEndsOf(options));
    onOptions({ combo: next['combo'], axes: next['axes'] });
  };
  const undo = (ends: Readonly<Record<string, unknown>>) => {
    const off = withSynchronize(options, false);
    const axes = record(options['axes']);
    onOptions({
      combo: off['combo'],
      axes: { ...axes, right: { ...record(axes['right']), ...ends } },
    });
    setCleared(undefined);
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
      {cleared === undefined || !on ? null : (
        <div role="status" className="combo-toast">
          Right axis now follows the left axis ·{' '}
          <button type="button" className="btn-link" onClick={() => undo(cleared)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
