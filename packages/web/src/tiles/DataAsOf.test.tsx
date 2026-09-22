import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    render(
      <ChartTile
        title="Orders"
        spec={spec([{ 'orders.status': 'shipped', 'orders.count': 3 }])}
        asOf="2026-09-21T10:32:18.000Z"
      />,
    );

    const head = screen.getByTestId('chart-tile').querySelector('.tile-head');
    const asOf = within(head as HTMLElement).getByTestId('data-as-of');
    expect(asOf.tagName).toBe('TIME');
    expect(asOf.getAttribute('datetime')).toBe('2026-09-21T10:32:18.000Z');
    expect(asOf.textContent).toBe(
      `Data as of ${new Date('2026-09-21T10:32:18.000Z').toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })}`,
    );
  });

  it('shows "as of" and the time, the whole sentence for a screen reader and in its tooltip', () => {
    // Room for the chart's title in a half-width tile (T014's review).
    const at = new Date(2026, 8, 21, 22, 32, 18);
    render(<DataAsOf at={at.toISOString()} now={new Date(2026, 8, 21, 23, 0, 0)} />);

    const time = screen.getByTestId('data-as-of');
    const shown = at.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    expect(time.querySelector('.visually-hidden')?.textContent).toBe('Data ');
    expect(time.textContent).toBe(`Data as of ${shown}`);
    expect(time.getAttribute('title')).toBe(`Data as of ${shown}`);
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

    expect(screen.getByTestId('data-as-of').textContent).toBe(
      `Data as of ${at.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })}`,
    );
    expect(screen.getByTestId('data-as-of').textContent).toContain(
      at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    );
  });

  it('is left out when Cube gave no time, or one that is not a time', () => {
    const { rerender } = render(<ChartTile spec={spec([{ 'orders.count': 1 }])} />);
    expect(screen.queryByTestId('data-as-of')).toBeNull();

    rerender(<ChartTile spec={spec([{ 'orders.count': 1 }])} asOf="not a time" />);
    expect(screen.queryByTestId('data-as-of')).toBeNull();
  });
});
