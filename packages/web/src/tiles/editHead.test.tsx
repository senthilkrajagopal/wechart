import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartTile } from './ChartTile';

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
 * T468, UX-032 (the phase-1 re-check): while editing, a chart tile's head
 * read "● Live · as of 3:48:17 AM" and "Table view", which compete with the
 * grip and the title while arranging. It names the element's kind instead —
 * "Chart · Area" — as a Markdown or Image element's head does.
 */
const area: RenderSpec = {
  chartType: 'area',
  encoding: { x: ['orders.month'], y: ['orders.count'] },
  rows: [
    { 'orders.month': 'Jan', 'orders.count': 1 },
    { 'orders.month': 'Feb', 'orders.count': 2 },
  ],
};
const served = { lastRefreshTime: '2026-09-28T03:48:17.000Z' };

describe('a chart tile’s head while editing (UX-032)', () => {
  it('names its kind, and shows neither the freshness badge nor Table view', () => {
    render(
      <ChartTile
        spec={area}
        title="Orders by month"
        asOf={served.lastRefreshTime}
        kind="Chart · Area"
      />,
    );
    const head = screen.getByTestId('chart-tile').querySelector('.tile-head') as HTMLElement;

    expect(within(head).getByText('Chart · Area')).toBeTruthy();
    expect(within(head).getByRole('heading', { name: 'Orders by month' })).toBeTruthy();
    expect(screen.queryByTestId('tile-freshness')).toBeNull();
    expect(screen.queryByTestId('toggle-table-view')).toBeNull();
  });

  /** T468's review: only the badge and the switch give way; being asked again is still said (AC-177). */
  it('still says it is updating, in words with its icon', () => {
    render(<ChartTile spec={area} title="Orders by month" busy kind="Chart · Area" />);
    const updating = screen.getByTestId('tile-busy');
    expect(updating.textContent).toBe('Updating…');
    expect(updating.querySelector('[data-icon="run"]')).not.toBeNull();
  });

  it('draws the chart, not a table view left on', () => {
    render(<ChartTile spec={area} title="Orders by month" tableView kind="Chart · Area" />);
    expect(screen.queryByTestId('data-table')).toBeNull();
  });

  it('keeps both in view mode', () => {
    // Its answer's facts with its time, as every caller gives them (T681).
    render(
      <ChartTile
        spec={area}
        title="Orders by month"
        asOf={served.lastRefreshTime}
        served={served}
      />,
    );
    expect(screen.getByTestId('tile-freshness')).toBeTruthy();
    expect(screen.getByTestId('toggle-table-view')).toBeTruthy();
  });
});
