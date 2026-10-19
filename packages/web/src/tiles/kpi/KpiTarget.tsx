import { DEFAULT_BANDS, type MemberFormats } from '@wechart/core';

import { BulletGraphSvg } from '../text/elements/BulletGraph';
import { kpiShort } from './kpiNumbers';

/** The target's height (AC-565). */
export const KPI_TARGET_HEIGHT = 16;
/** Room beside the graph for "97% of $1.40M" and its gap (design 23 sheet 1). */
const WORDS_PX = 104;
const LEAST_PX = 48;

/**
 * A KPI's target (T938, AC-565; design 23 sheet 1): R80's Bullet graph, 16
 * px tall, across the content width less the room for "‹p›% of ‹target›"
 * beside it in `text-xs` `text-secondary`; its ranges the bullet chart's
 * bands, 80, 100 and 120 % of the target (decision T938-1).
 */
export function KpiTarget({
  value,
  target,
  title,
  member,
  formats,
  width,
  shown = true,
}: {
  /** Whether the tile has room for it (T938-2); its words are said either way. */
  readonly shown?: boolean;
  readonly value: number;
  readonly target: number;
  readonly title: string;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  /** The tile's content width, in px. */
  readonly width: number;
}) {
  const ranges = DEFAULT_BANDS.map((percent) => (percent / 100) * target);
  const share = target === 0 ? undefined : Math.round((value / target) * 100);
  const words =
    share === undefined
      ? `Target ${kpiShort(target, member, formats)}`
      : `${String(share)}% of ${kpiShort(target, member, formats)}`;
  if (!shown)
    return (
      <p className="visually-hidden" data-testid="kpi-target-hidden">
        {`Not shown at this size: ${words} target.`}
      </p>
    );
  return (
    <div className="kpi__target" data-testid="kpi-target">
      {width <= 0 || target <= 0 ? null : (
        <BulletGraphSvg
          value={value}
          target={target}
          ranges={ranges}
          max={Math.max(value, ...ranges)}
          title={title}
          member={member}
          formats={formats}
          width={Math.max(LEAST_PX, Math.round(width - WORDS_PX))}
          height={KPI_TARGET_HEIGHT}
        />
      )}
      <span className="kpi__target-of">{words}</span>
    </div>
  );
}
