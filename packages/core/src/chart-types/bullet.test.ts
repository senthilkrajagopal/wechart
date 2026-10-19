import { describe, expect, it } from 'vitest';

import {
  BULLET_NO_TARGET,
  bandsRefusal,
  bulletModule,
  bulletOptionsOf,
  DEFAULT_BANDS,
  targetCount,
  withBulletOptions,
} from './bullet';
import { CHART_TYPE_MODULES } from './index';

/**
 * T953 / AC-580, AC-037: THE SYSTEM SHALL offer the bullet chart only while
 * Target holds a measure or a value …; take Metrics, Target, Bands as 2 or 3
 * percentages of the target (80 %, 100 % and 120 % by default), and one
 * dimension; refuse a fourth band, saying "At most 3 bands: R80's three
 * greys, and no fourth without a new colour."; and with Target emptied, say
 * "A bullet chart compares each member with a target. Put a measure or a
 * value in Target." with the Target well as its action.
 * `Fails when: a bullet chart can be drawn with no target; fewer than 2 or
 * more than 3 bands can be set; the defaults differ; or a sentence or action
 * is missing.` And AC-037 (R81): its spec, saved and reopened, is the same.
 */
describe('the bullet chart’s spec (AC-580, AC-037)', () => {
  it('is registered as the bullet chart’s module', () => {
    expect(CHART_TYPE_MODULES.bullet).toBe(bulletModule);
    expect(bulletModule.type).toBe('bullet');
  });

  it('defaults its bands to 80, 100 and 120 % of the target, with no target', () => {
    expect(DEFAULT_BANDS).toEqual([80, 100, 120]);
    expect(bulletModule.parse(undefined)).toEqual({ bands: [80, 100, 120] });
    expect(bulletOptionsOf({})).toEqual({ bands: [80, 100, 120] });
  });

  it('refuses a fourth band, and a single one', () => {
    expect(bandsRefusal([80, 100, 120, 140])).toBe(
      'At most 3 bands: R80’s three greys, and no fourth without a new colour.',
    );
    expect(bandsRefusal([100])).toBe('At least 2 bands: a bullet chart’s bands are 2 or 3.');
    expect(bandsRefusal([90, 110])).toBeUndefined();
    expect(bandsRefusal([80, 100, 120])).toBeUndefined();
    // Low to high, each a percentage above zero.
    expect(bandsRefusal([100, 80])).toBe('Bands run low to high, each above 0 %.');
    expect(bandsRefusal([0, 100])).toBe('Bands run low to high, each above 0 %.');
  });

  it('reads a stored fourth band, or a single one, as the defaults, so neither is ever drawn', () => {
    expect(bulletModule.parse({ bands: [80, 100, 120, 140] }).bands).toEqual([80, 100, 120]);
    expect(bulletModule.parse({ bands: [100] }).bands).toEqual([80, 100, 120]);
  });

  it('saves a target and two bands, and reads them back the same', () => {
    const settings = {
      target: { kind: 'measure', member: 'orders.revenue_target' },
      bands: [90, 110],
    } as const;
    const saved = withBulletOptions({ other: 1 }, settings);
    expect(saved).toEqual({
      other: 1,
      bullet: { target: { kind: 'measure', member: 'orders.revenue_target' }, bands: [90, 110] },
    });
    expect(bulletOptionsOf(JSON.parse(JSON.stringify(saved)))).toEqual(settings);
    const valued = { target: { kind: 'value', value: 450000 }, bands: [80, 100, 120] } as const;
    expect(bulletOptionsOf(withBulletOptions({}, valued))).toEqual(valued);
  });

  it('stores nothing while nothing differs from the defaults', () => {
    expect(
      withBulletOptions({ other: 1, bullet: { bands: [90, 110] } }, { bands: [80, 100, 120] }),
    ).toEqual({
      other: 1,
    });
  });

  it('counts a target towards the chart’s needs only while one is set', () => {
    expect(targetCount({})).toBe(0);
    const valued = { target: { kind: 'value', value: 1 }, bands: [80, 100, 120] } as const;
    expect(targetCount(withBulletOptions({}, valued))).toBe(1);
  });

  it('counts no target whose measure the chart’s cube doesn’t have, as after a change of cube (T953’s review)', () => {
    const options = withBulletOptions(
      {},
      { target: { kind: 'measure', member: 'orders.revenue_target' }, bands: [80, 100, 120] },
    );
    expect(targetCount(options, (member) => member === 'orders.revenue_target')).toBe(1);
    expect(targetCount(options, (member) => member.startsWith('customers.'))).toBe(0);
    // A value is no member, so any cube has it.
    const valued = withBulletOptions(
      {},
      { target: { kind: 'value', value: 1 }, bands: [80, 100, 120] },
    );
    expect(targetCount(valued, () => false)).toBe(1);
  });

  it('says what an empty Target needs, in AC-580’s words', () => {
    expect(BULLET_NO_TARGET).toBe(
      'A bullet chart compares each member with a target. Put a measure or a value in Target.',
    );
  });
});
