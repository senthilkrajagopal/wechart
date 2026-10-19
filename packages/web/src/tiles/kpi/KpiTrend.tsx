import { KPI_TREND_PERIODS, type MemberFormats } from '@wechart/core';

import { SparklineSvg } from '../text/elements/Sparkline';

/** The trend's height (AC-565; 23-Q14 (a)). */
export const KPI_TREND_HEIGHT = 32;

/**
 * A KPI's trend (T938, AC-565; design 23 sheet 1): R80's Sparkline, its own
 * SVG and words, at the tile's content width × 32 px, over Time at its grain,
 * the last 12 periods oldest first. Nothing until the width is known.
 */
export function KpiTrend({
  values,
  title,
  member,
  formats,
  granularity,
  colour,
  width,
  shown = true,
}: {
  /**
   * Whether the tile has room for it (T938-2). Where it hasn't, its words
   * are still said, visually hidden.
   */
  readonly shown?: boolean;
  /** Oldest first. */
  readonly values: readonly (number | null)[];
  readonly title: string;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly granularity: string;
  readonly colour: string;
  /** The tile's content width, in px. */
  readonly width: number;
}) {
  if (width <= 0 || values.every((value) => value === null)) return null;
  const sparkline = (
    <SparklineSvg
      values={values}
      title={title}
      member={member}
      formats={formats}
      granularity={granularity}
      last={KPI_TREND_PERIODS}
      colour={colour}
      width={Math.round(width)}
      height={KPI_TREND_HEIGHT}
    />
  );
  if (!shown)
    return (
      <div className="visually-hidden" data-testid="kpi-trend-hidden">
        Not shown at this size: {sparkline}
      </div>
    );
  return (
    <div className="kpi__trend" data-testid="kpi-trend">
      {sparkline}
    </div>
  );
}
