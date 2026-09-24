import { CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import { useId, type Ref } from 'react';

import { StatusIcon } from '../shell/StatusIcon';

/**
 * The chart's type, by its name (AC-217), as the prototype's type card shows
 * it: "Auto · Bar" while the recommender picks, or the type's name and
 * "Chosen manually" once the user has — with Change, which opens the gallery,
 * and "Back to recommended" only while the choice is the user's. A manual
 * choice the fields strain — a combo's two axes, more slices or colours than
 * can be told apart — says why, with its icon, and offers the recommended
 * type instead (AC-218).
 */
export interface ChartTypeCardProps {
  /** The type drawn, or null while there is nothing to draw. */
  readonly shown: ChartType | null;
  readonly manual: boolean;
  readonly recommended: ChartType | null;
  /** Why the manual choice strains these fields, each in a sentence. */
  readonly warnings: readonly string[];
  readonly onChange: () => void;
  readonly onBack: () => void;
  /** Change, for the gallery to give focus back to. */
  readonly changeRef?: Ref<HTMLButtonElement>;
}

export function ChartTypeCard({
  shown,
  manual,
  recommended,
  warnings,
  onChange,
  onBack,
  changeRef,
}: ChartTypeCardProps) {
  const ids = { label: useId(), name: useId(), why: useId() };
  const name = shown === null ? undefined : CHART_TYPE_NAMES[shown];
  const said = manual ? (name ?? '') : `Auto · ${name ?? 'waiting for fields'}`;

  return (
    <div className="type-card-field">
      <span id={ids.label} className="type-card-field__label">
        Chart type
      </span>
      <button
        ref={changeRef}
        type="button"
        className="type-card-field__change"
        data-testid="chart-type-change"
        aria-haspopup="dialog"
        aria-labelledby={`${ids.label} ${ids.name}`}
        aria-describedby={ids.why}
        onClick={onChange}
      >
        <span
          id={ids.name}
          className="type-card-field__name"
          data-testid="chart-type"
          data-chart-type={shown ?? undefined}
        >
          {said}
        </span>
        <span id={ids.why} className="type-card-field__why">
          {manual ? 'Chosen manually' : 'Picked by the recommender; changes as you add fields'} ·
          Change…
        </span>
      </button>
      {manual ? (
        <button type="button" className="btn-sm" data-testid="back-to-recommended" onClick={onBack}>
          Back to recommended
        </button>
      ) : null}
      {manual && warnings.length > 0 ? (
        <div className="type-card-field__warning state-line" data-testid="type-warning">
          <StatusIcon kind="warn" />
          <span>{warnings.join(' ')}</span>
          {recommended === null || recommended === shown ? null : (
            <button type="button" className="btn-sm" onClick={onBack}>
              Use {CHART_TYPE_NAMES[recommended]}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
