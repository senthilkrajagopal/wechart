import {
  BOXPLOT_POINTS,
  distributionPatch,
  drawnDistribution,
  needsEachPointIs,
  POINTS_NEED_EACH_POINT_IS,
  type BoxplotPoints,
} from '@wechart/core';
import { useId } from 'react';

/**
 * A box plot's Customize › Distribution (T990, AC-591; design 23 sheet 11;
 * direction.md rule 157): Points — None, Outliers (the default, today's
 * drawing), All or Beeswarm — and Violin, on or off. All, Beeswarm and Violin
 * draw one mark per point, so while Each point is is empty they're disabled,
 * each described by why, the reason said once below them. The controls show
 * what is drawn: a saved Beeswarm reads as Outliers until Each point is is set
 * again, when it returns.
 */
export interface BoxplotDistributionProps {
  /** The chart's options, as the editor holds them. */
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to them: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** Whether Each point is says what one point is. */
  readonly eachPointIs: boolean;
}

const LABELS: Readonly<Record<BoxplotPoints, string>> = {
  none: 'None',
  outliers: 'Outliers',
  all: 'All',
  beeswarm: 'Beeswarm',
};

export function BoxplotDistribution({ options, onOptions, eachPointIs }: BoxplotDistributionProps) {
  const ids = useId();
  const reasonId = `${ids}-reason`;
  const shown = drawnDistribution(options, eachPointIs);
  const unavailable = (choice: BoxplotPoints | 'violin') =>
    !eachPointIs && needsEachPointIs(choice);
  const why = (choice: BoxplotPoints | 'violin') =>
    unavailable(choice) ? { 'aria-describedby': reasonId } : {};

  return (
    <section className="customize-tab__section" aria-labelledby={`${ids}-heading`}>
      <h3 id={`${ids}-heading`}>Distribution</h3>
      <span id={`${ids}-points`} className="customize-tab__check">
        Points
      </span>
      <div role="radiogroup" aria-labelledby={`${ids}-points`}>
        {BOXPLOT_POINTS.map((points) => (
          <label key={points} className="customize-tab__check">
            <input
              type="radio"
              name={`${ids}-points`}
              checked={shown.points === points}
              disabled={unavailable(points)}
              {...why(points)}
              onChange={() => onOptions(distributionPatch({ ...shown, points }))}
            />
            {LABELS[points]}
          </label>
        ))}
      </div>
      <label className="customize-tab__check">
        <input
          type="checkbox"
          checked={shown.violin}
          disabled={unavailable('violin')}
          {...why('violin')}
          onChange={(event) =>
            onOptions(distributionPatch({ ...shown, violin: event.target.checked }))
          }
        />
        Violin <span className="panel-section__note">where values gather</span>
      </label>
      {eachPointIs ? null : (
        <p id={reasonId} className="panel-section__note">
          {POINTS_NEED_EACH_POINT_IS}
        </p>
      )}
    </section>
  );
}
