import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { exactOf } from '../shell/formatTime';
import { ChartTile } from './ChartTile';
import { DataAsOf } from './DataAsOf';

// A drawn chart's canvas watches its own size, which jsdom cannot.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * T154 / AC-148: WHEN the user asks to refresh a chart's data, THE SYSTEM
 * SHALL re-query Cube bypassing wechart's cached result and show the new
 * data-as-of time.
 *
 * Where the time is shown: in the tile's head, as the prototype's tile head
 * carries its data's age as a badge — not over the chart, where it would
 * cover an axis label.
 */
const spec = (rows: RenderSpec['rows']): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows,
});

describe('when a chart’s data is from', () => {
  it('is in the tile head, to the second, with the exact time as its datetime', () => {
    // Today's data: the tile reads the real clock, and data from another day
    // names its day too (below) — so the fixture's time is today's, not a
    // fixed date that stops being today (it did, the day after it was written).
    const at = new Date();
    at.setHours(10, 32, 18, 0);
    render(
      <ChartTile
        title="Orders"
        spec={spec([{ 'orders.status': 'shipped', 'orders.count': 3 }])}
        asOf={at.toISOString()}
      />,
    );

    const head = screen.getByTestId('chart-tile').querySelector('.tile-head');
    const asOf = within(head as HTMLElement).getByTestId('data-as-of');
    expect(asOf.tagName).toBe('TIME');
    expect(asOf.getAttribute('datetime')).toBe(at.toISOString());
    // One 24-hour clock (T477; the coordinator's Q10).
    expect(asOf.textContent).toBe('Data as of 10:32:18');
  });

  it('shows "as of" and the time, the whole sentence for a screen reader and in its tooltip', () => {
    // Room for the chart's title in a half-width tile (T014's review).
    const at = new Date(2026, 8, 21, 22, 32, 18);
    render(<DataAsOf at={at.toISOString()} now={new Date(2026, 8, 21, 23, 0, 0)} />);

    const time = screen.getByTestId('data-as-of');
    expect(time.querySelector('.visually-hidden')?.textContent).toBe('Data ');
    // 24-hour, never "10:32:18 PM" (T477; Q10).
    expect(time.textContent).toBe('Data as of 22:32:18');
    // Its tooltip the exact local time with UTC beside it (T477; Q9).
    expect(time.getAttribute('title')).toBe(`Data as of ${exactOf(at)}`);
  });

  it('is shown for an answer with no rows too — a refresh can come back empty', () => {
    render(<ChartTile spec={spec([])} asOf="2026-09-21T10:32:18.000Z" />);

    expect(screen.getByTestId('data-as-of').getAttribute('datetime')).toBe(
      '2026-09-21T10:32:18.000Z',
    );
  });

  it('names the day too when the data is not from today', () => {
    /**
     * A result Cube kept since yesterday, or a tab left open overnight: the
     * time alone would read as today's (T154's review).
     */
    const at = new Date(2026, 8, 20, 22, 32, 18);
    render(<DataAsOf at={at.toISOString()} now={new Date(2026, 8, 21, 9, 0, 0)} />);

    // As every moment is written (T477; Q8): "Yesterday", else the day first.
    expect(screen.getByTestId('data-as-of').textContent).toBe('Data as of Yesterday 22:32:18');
    render(<DataAsOf at={at.toISOString()} now={new Date(2026, 8, 24, 9, 0, 0)} />);
    expect(screen.getAllByTestId('data-as-of')[1]?.textContent).toBe('Data as of 20 Sep 22:32:18');
  });

  it('is left out when Cube gave no time, or one that is not a time', () => {
    const { rerender } = render(<ChartTile spec={spec([{ 'orders.count': 1 }])} />);
    expect(screen.queryByTestId('data-as-of')).toBeNull();

    rerender(<ChartTile spec={spec([{ 'orders.count': 1 }])} asOf="not a time" />);
    expect(screen.queryByTestId('data-as-of')).toBeNull();
  });
});
