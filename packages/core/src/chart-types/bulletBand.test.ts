import { describe, expect, it } from 'vitest';

import { bulletBandOf } from './bullet';

/**
 * T956 / AC-583: … name each bullet "‹member›: ‹value› of ‹target› target
 * (‹p› %), in the ‹band› band" … and give a table view of member, value,
 * target, percentage of target and band.
 * Design 23 sheet 8: bands at 80, 100 and 120 % of each member's own target,
 * their legend "Below 80 % · 80–100 % · 100–120 % of target".
 */
const BANDS = [80, 100, 120];

describe('the band a bullet’s value is in (AC-583)', () => {
  it('names the band of the target the value reaches, by its edges', () => {
    expect(bulletBandOf(412000, 450000, BANDS)).toEqual({ percent: 92, band: '80–100 %' });
    expect(bulletBandOf(538000, 520000, BANDS)).toEqual({ percent: 103, band: '100–120 %' });
    // An edge belongs to the band above it.
    expect(bulletBandOf(100, 100, BANDS)).toEqual({ percent: 100, band: '100–120 %' });
  });

  it('names the lowest band "below" its edge, and past the highest "above" it', () => {
    expect(bulletBandOf(70, 100, BANDS)).toEqual({ percent: 70, band: 'below 80 %' });
    expect(bulletBandOf(130, 100, BANDS)).toEqual({ percent: 130, band: 'above 120 %' });
  });

  it('names no band without a target to be a share of', () => {
    expect(bulletBandOf(70, null, BANDS)).toBeUndefined();
    expect(bulletBandOf(70, 0, BANDS)).toBeUndefined();
    expect(bulletBandOf(null, 100, BANDS)).toBeUndefined();
  });
});
