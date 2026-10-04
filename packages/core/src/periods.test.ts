import { describe, expect, it } from 'vitest';

import { periodOf, periodsOf } from './periods';

/**
 * A partition by its period, as Jobs, Run history and the audit trail say it
 * (T374; T505; design 16, B1 and I): one function for the page and the API.
 */
describe('periodOf', () => {
  it('names a partition by its start, as its granularity does', () => {
    expect(
      (
        [
          ['year', '2026-01-01T00:00:00.000'],
          ['quarter', '2026-07-01T00:00:00.000'],
          ['month', '2026-08-01T00:00:00.000'],
          ['week', '2026-09-28T00:00:00.000'],
          ['day', '2026-09-29T00:00:00.000'],
          ['hour', '2026-09-29T14:00:00.000'],
          [null, '2026-09-29T00:00:00.000'],
        ] as const
      ).map(([granularity, start]) => periodOf(start, granularity)),
    ).toEqual([
      '2026',
      'Q3 2026',
      'Aug 2026',
      'Week of 28 Sep 2026',
      '29 Sep 2026',
      '29 Sep 2026, 14:00',
      '29 Sep 2026',
    ]);
  });
});

describe('periodsOf', () => {
  it('says the year once for months of one year, in the order asked', () => {
    expect(periodsOf(['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'], 'month')).toBe(
      'Sep, Aug 2026',
    );
  });

  it('says each month’s year where they span years, and each other period in full', () => {
    expect(periodsOf(['2026-01-01T00:00:00.000', '2025-12-01T00:00:00.000'], 'month')).toBe(
      'Jan 2026, Dec 2025',
    );
    expect(periodsOf(['2026-09-29T00:00:00.000', '2026-09-28T00:00:00.000'], 'day')).toBe(
      '29 Sep 2026, 28 Sep 2026',
    );
  });
});
