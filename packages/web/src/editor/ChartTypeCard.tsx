import { CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import { useId, type Ref } from 'react';

import { StatusIcon } from '../shell/StatusIcon';
import { ChartTypeIcon } from './ChartTypeIcon';

/**
 * The chart's type, by its name and icon (AC-217), as design 01 pin 4 draws
 * the type card (T689, EDI-06): "Auto · Bar" while the recommender picks, or
 * the type's name and "Chosen manually · Change…" once the user has — Change
 * opening the gallery. Under it the quick picks: Auto, then the recommender's
 * top pick and runners-up as 24 px icon buttons, each with its reason as its
 * tooltip. Auto is pressed while the chart is in Auto, no type chosen by
 * hand; a manual pick presses its own (R76, chart-editor-Q2; clarified
 * 2026-10-17). Choosing Auto returns the chart to the recommendation.
 *
 * While a manual pick differs from the recommendation, a Recommended card
 * (design 01 pin 5, EDI-07) names it, with a reason built from the data and
 * Use (AC-032). A manual choice the fields strain — a combo's two axes, more
 * slices or colours than can be told apart — says why, with its icon, and the
 * card's Use offers the recommended type instead (AC-218).
 */
export interface ChartTypeCardProps {
  /** The type drawn, or null while there is nothing to draw. */
  readonly shown: ChartType | null;
  readonly manual: boolean;
  readonly recommended: ChartType | null;
  /** The recommended pick's reason, built from the data (EDI-07). */
  readonly recommendedReason?: string | undefined;
  /** The recommender's top pick and runners-up, each with its reason (AC-028). */
  readonly picks: readonly { readonly type: ChartType; readonly reason: string }[];
  /** Why the manual choice strains these fields, each in a sentence. */
  readonly warnings: readonly string[];
  readonly onChange: () => void;
  /** Auto, or Use: back to the recommendation (AC-032). */
  readonly onAuto: (from: 'auto' | 'use') => void;
  /** A quick pick: that type, chosen by hand. */
  readonly onPick: (type: ChartType) => void;
  /** Change, for the gallery to give focus back to. */
  readonly changeRef?: Ref<HTMLButtonElement>;
  /**
   * A combo drawing two unsynchronized axes (T861, AC-218; design 20 screen
   * 2 pin 1): the warning's icon and "Two scales, not synchronized · See
   * Axes", which opens Customize at the warning.
   */
  readonly onSeeAxes?: (() => void) | undefined;
}

export function ChartTypeCard({
  shown,
  manual,
  recommended,
  recommendedReason,
  picks,
  warnings,
  onChange,
  onAuto,
  onPick,
  changeRef,
  onSeeAxes,
}: ChartTypeCardProps) {
  const ids = { label: useId(), name: useId(), why: useId() };
  const name = shown === null ? undefined : CHART_TYPE_NAMES[shown];
  const said = manual ? (name ?? '') : `Auto · ${name ?? 'waiting for fields'}`;
  /** The Recommended card, only while a manual pick differs (EDI-07). */
  const differs = manual && recommended !== null && recommended !== shown;

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
        {/* Design 01's .ico: the drawn form's icon on a 28 px tile. */}
        <span className="type-card-field__icon" aria-hidden="true">
          {shown === null ? null : <ChartTypeIcon type={shown} />}
        </span>
        <span className="type-card-field__text">
          <span
            id={ids.name}
            className="type-card-field__name"
            data-testid="chart-type"
            data-chart-type={shown ?? undefined}
          >
            {said}
          </span>
          <span id={ids.why} className="type-card-field__why">
            {manual ? 'Chosen manually' : 'Picked by the recommender; changes as you add fields'} ·{' '}
            <span className="type-card-field__change-word">Change…</span>
          </span>
        </span>
      </button>
      {picks.length === 0 ? null : (
        // Design 01's .quick: Auto, then the picks by icon (pin 4).
        <div className="type-card-field__quick" role="group" aria-label="Quick picks">
          <button
            type="button"
            className="type-card-field__pick"
            aria-pressed={!manual}
            onClick={() => {
              if (manual) onAuto('auto');
            }}
          >
            Auto
          </button>
          {picks.map(({ type, reason }) => (
            <button
              key={type}
              type="button"
              className="type-card-field__pick"
              aria-label={CHART_TYPE_NAMES[type]}
              title={`${CHART_TYPE_NAMES[type]} — ${reason}`}
              aria-pressed={manual && shown === type}
              onClick={() => {
                if (!(manual && shown === type)) onPick(type);
              }}
            >
              <ChartTypeIcon type={type} />
            </button>
          ))}
          <span className="type-card-field__suggested">Suggested for these fields</span>
        </div>
      )}
      {differs ? (
        // Design 01's .pinned: on bg-subtle, its icon, the pick and why, Use.
        <div className="type-card-field__recommended" data-testid="recommended-card">
          <span className="type-card-field__recommended-icon" aria-hidden="true">
            <ChartTypeIcon type={recommended} />
          </span>
          <span>
            <b data-testid="recommended-type" data-chart-type={recommended}>
              Recommended: {CHART_TYPE_NAMES[recommended]}
            </b>
            {recommendedReason === undefined ? null : (
              <>
                <br />
                <span className="type-card-field__recommended-why" data-testid="recommended-reason">
                  {recommendedReason}
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            aria-label={`Use ${CHART_TYPE_NAMES[recommended]}`}
            onClick={() => onAuto('use')}
          >
            Use
          </button>
        </div>
      ) : null}
      {onSeeAxes === undefined ? null : (
        <div className="type-card-field__warning state-line" data-testid="type-two-scales">
          <StatusIcon kind="warn" />
          <span>
            Two scales, not synchronized ·{' '}
            <button type="button" className="btn-link" onClick={onSeeAxes}>
              See Axes
            </button>
          </span>
        </div>
      )}
      {manual && warnings.length > 0 ? (
        <div className="type-card-field__warning state-line" data-testid="type-warning">
          <StatusIcon kind="warn" />
          <span>{warnings.join(' ')}</span>
        </div>
      ) : null}
    </div>
  );
}
