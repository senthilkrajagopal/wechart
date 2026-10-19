import { KPI_TARGET_HEIGHT } from './KpiTarget';
import { KPI_TREND_HEIGHT } from './KpiTrend';

/** The trend's and the target's room: each its height and the 10 px above it (kpiStyles). */
export const KPI_TREND_BLOCK_PX = 10 + KPI_TREND_HEIGHT;
export const KPI_TARGET_BLOCK_PX = 10 + KPI_TARGET_HEIGHT;

export interface KpiParts {
  readonly trend: boolean;
  readonly target: boolean;
}

/**
 * Which of a KPI's trend and target its tile has room for under its value
 * and change (decision T938-2): never one clipped; the target gives way
 * first, then the trend. Everything it has while the room isn't known yet.
 */
export function kpiPartsShown(room: number | undefined, has: KpiParts): KpiParts {
  if (room === undefined) return has;
  const trend = has.trend ? KPI_TREND_BLOCK_PX : 0;
  const target = has.target ? KPI_TARGET_BLOCK_PX : 0;
  if (trend + target <= room) return has;
  if (has.trend && trend <= room) return { trend: true, target: false };
  return { trend: false, target: has.target && target <= room };
}
