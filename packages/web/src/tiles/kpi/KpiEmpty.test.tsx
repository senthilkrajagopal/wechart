import type { RenderSpec } from '@wechart/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Kpi } from '../Kpi';

/**
 * T939 / AC-566: IF a KPI's Compare to is Previous period or Same period last
 * year and Time is empty, THEN THE SYSTEM SHALL say "Compare to: ‹choice›
 * needs a time dimension in Time." with the Time well as its action; and IF
 * the compared period has no data, THEN the change line SHALL read "— vs
 * ‹period› · No data for the comparison period".
 * `Fails when: a period comparison without Time draws a change, or says
 * nothing; or a period with no data reads as 0 % or as a change.`
 */
const COUNT = 'orders.count';
const AMOUNT = 'orders.total_amount';
const time = { member: 'orders.ordered_at', granularity: 'month' };
const OCT = '2026-10-01T00:00:00.000 - 2026-10-31T23:59:59.999';
const SEP = '2026-09-01T00:00:00.000 - 2026-09-30T23:59:59.999';

const spec = (over: Partial<RenderSpec>): RenderSpec => ({
  chartType: 'kpi',
  encoding: { y: [AMOUNT] },
  rows: [{ [AMOUNT]: '1352000' }],
  ...over,
});

describe('a KPI comparing periods with no Time (T939, AC-566)', () => {
  it('says Previous period needs a time dimension in Time, with a Time action', () => {
    const onAddTime = vi.fn();
    render(
      <Kpi
        spec={spec({ options: { kpi: { compareTo: { kind: 'previousPeriod' } } } })}
        onAddTime={onAddTime}
      />,
    );
    expect(screen.getByTestId('kpi-needs-time').textContent).toContain(
      'Compare to: Previous period needs a time dimension in Time.',
    );
    expect(screen.queryByTestId('kpi-change')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ Time' }));
    expect(onAddTime).toHaveBeenCalledOnce();
    // The value is still drawn.
    expect(screen.getByTestId('kpi-value')).toBeTruthy();
  });

  it('names Same period last year, and offers no action where the tile can’t open its chart', () => {
    render(
      <Kpi spec={spec({ options: { kpi: { compareTo: { kind: 'samePeriodLastYear' } } } })} />,
    );
    expect(screen.getByTestId('kpi-needs-time').textContent).toBe(
      'Compare to: Same period last year needs a time dimension in Time.',
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says nothing of Time for a comparison with another measure or a value', () => {
    render(
      <Kpi spec={spec({ options: { kpi: { compareTo: { kind: 'value', value: 1_000_000 } } } })} />,
    );
    expect(screen.queryByTestId('kpi-needs-time')).toBeNull();
  });
});

describe('a KPI whose compared period has no data (T939, AC-566)', () => {
  const previous = { kpi: { compareTo: { kind: 'previousPeriod' }, time } };

  it('reads "— vs Sep 2026 · No data for the comparison period" where its measure has no value then, and no 0 %', () => {
    render(
      <Kpi
        spec={spec({
          rows: [
            { [AMOUNT]: '1352000', compareDateRange: OCT },
            { [AMOUNT]: null, compareDateRange: SEP },
          ],
          options: previous,
        })}
      />,
    );
    const line = screen.getByTestId('kpi-change');
    expect(line.textContent).toBe('— vs Sep 2026 · No data for the comparison period');
    expect(line.textContent).not.toContain('%');
    expect(line.querySelector('.text-change')?.getAttribute('data-tone')).toBe('neutral');
  });

  it('reads so where a count is 0, Cube’s count of no rows, and where the period has no row at all', () => {
    const { unmount } = render(
      <Kpi
        spec={spec({
          encoding: { y: [COUNT] },
          rows: [
            { [COUNT]: '31', compareDateRange: OCT },
            { [COUNT]: '0', compareDateRange: SEP },
          ],
          measureTypes: { [COUNT]: 'count' },
          options: previous,
        })}
      />,
    );
    expect(screen.getByTestId('kpi-change').textContent).toBe(
      '— vs Sep 2026 · No data for the comparison period',
    );
    unmount();
    render(
      <Kpi
        spec={spec({
          rows: [{ [AMOUNT]: '1352000', compareDateRange: OCT }],
          options: previous,
        })}
      />,
    );
    // The period asked, named from the value's own (October's previous).
    expect(screen.getByTestId('kpi-change').textContent).toBe(
      '— vs Sep 2026 · No data for the comparison period',
    );
  });
});
