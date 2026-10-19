import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LogScaleNote } from './LogScaleNote';

/**
 * T850 (AC-502): a value at or below zero on a combo's log axis isn't drawn,
 * and is counted under the chart, in the page's text (design 20 state E).
 */
const MONTH = 'orders.month';
const SESSIONS = 'web.sessions';
const ORDERS = 'orders.count';
const spec = (orders: readonly number[]): RenderSpec => ({
  chartType: 'combo',
  encoding: { x: [MONTH], y: [SESSIONS, ORDERS] },
  rows: orders.map((value, at) => ({
    [MONTH]: ['Jan', 'Feb', 'Mar', 'Apr'][at],
    [SESSIONS]: 100 * (at + 1),
    [ORDERS]: value,
  })),
  titles: { [SESSIONS]: 'Sessions', [ORDERS]: 'Orders' },
  options: {
    series: { [SESSIONS]: { mark: 'line' }, [ORDERS]: { mark: 'point', axis: 'right' } },
    axes: { y: { log: true } },
  },
});

describe('the values a log axis leaves out (AC-502)', () => {
  it('counts and names them under the chart', () => {
    render(<LogScaleNote spec={spec([0, 0, 0, 12])} />);

    expect(screen.getByTestId('log-scale-omissions').textContent).toBe(
      '3 values not drawn: Orders was 0 in Jan, Feb and Mar, and a log scale has no zero.',
    );
  });

  it('says nothing when every value is drawn', () => {
    const { container } = render(<LogScaleNote spec={spec([1, 2, 3, 12])} />);

    expect(container.innerHTML).toBe('');
  });
});
