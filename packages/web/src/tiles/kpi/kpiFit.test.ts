import { describe, expect, it } from 'vitest';

import { kpiPartsShown, KPI_TARGET_BLOCK_PX, KPI_TREND_BLOCK_PX } from './kpiFit';

/**
 * T938 follow-up (the coordinator, 2026-10-18; decision T938-2): a KPI on a
 * tile too short for all its parts never clips one. Design 23 sheet 1 says
 * nothing of a short tile, so the least important part gives way first: the
 * target, then the trend; what is left out is said in the text alternative.
 */
describe('which of a KPI’s parts fit its tile (T938-2)', () => {
  const both = { trend: true, target: true } as const;

  it('shows the trend and the target where the room holds both', () => {
    expect(kpiPartsShown(KPI_TREND_BLOCK_PX + KPI_TARGET_BLOCK_PX, both)).toEqual(both);
  });

  it('drops the target first', () => {
    expect(kpiPartsShown(KPI_TREND_BLOCK_PX + KPI_TARGET_BLOCK_PX - 1, both)).toEqual({
      trend: true,
      target: false,
    });
  });

  it('then the trend, keeping a target that fits alone', () => {
    expect(kpiPartsShown(KPI_TREND_BLOCK_PX - 1, both)).toEqual({ trend: false, target: true });
    expect(kpiPartsShown(KPI_TARGET_BLOCK_PX - 1, both)).toEqual({ trend: false, target: false });
  });

  it('shows only what the KPI has, and everything while its room is unknown', () => {
    expect(kpiPartsShown(KPI_TARGET_BLOCK_PX, { trend: false, target: true })).toEqual({
      trend: false,
      target: true,
    });
    expect(kpiPartsShown(undefined, both)).toEqual(both);
  });
});
