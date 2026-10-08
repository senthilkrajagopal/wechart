import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clockOrWhenOf, exactOf } from '../shell/formatTime';
import { ChartTile } from './ChartTile';
import { FreshnessBadge } from './FreshnessBadge';

/**
 * T681 (AC-352, AC-013; design 04 note 4; DSH-01, DSH-23): a tile's head
 * says where its data came from in one small badge, "● Live" or
 * "✓ Pre-agg · 3m", and nothing else. The time to the second moves into the
 * badge's tooltip ("Live query · as of 11:12:06 · 42 ms · no
 * pre-aggregation"). The badge takes no focus (R76 dashboard-Q9): the menu's
 * Data as of submenu carries that time for the keyboard (DSH-21).
 */
const NOW = new Date('2026-09-19T12:00:00Z');
const ANSWERED_AT = '2026-09-19T11:57:06.000Z';
const seconds = (iso: string) => clockOrWhenOf(new Date(iso), NOW, { seconds: true });
// The tooltip's time, as every tooltip's is: exact, with UTC beside it (T477, Q9).
const exact = (iso: string) => exactOf(new Date(iso));

describe('the tile’s one freshness badge (T681)', () => {
  it('says "Live" alone for a database answer, the time to the second and how long it took in its tooltip', () => {
    render(
      <FreshnessBadge
        served={{ lastRefreshTime: ANSWERED_AT, elapsedMs: 42 }}
        asOf={ANSWERED_AT}
        now={NOW}
      />,
    );
    const badge = screen.getByTestId('tile-freshness');
    // What shows: the dot and the word.
    expect(badge.querySelector('.tile-freshness__label')?.textContent).toBe('Live');
    expect(badge.querySelectorAll('.tile-freshness__dot').length).toBe(1);
    expect(badge.getAttribute('title')).toBe(
      `Live query · as of ${exact(ANSWERED_AT)} · 42 ms · no pre-aggregation`,
    );
    // Not in the tab order (R76 dashboard-Q9).
    expect(badge.getAttribute('tabindex')).toBeNull();
    // Its words for a screen reader reading the tile.
    expect(badge.textContent).toBe(`Live · as of ${seconds(ANSWERED_AT)}`);
  });

  it('says "Pre-agg" with the build’s age for a pre-aggregation’s answer, in the status colour, with the check', () => {
    render(
      <FreshnessBadge
        served={{
          lastRefreshTime: '2026-09-19T11:57:00.000Z',
          elapsedMs: 12,
          usedPreAggregations: {
            'prod.orders_main': {
              preAggregationId: 'orders.main',
              // Three minutes before NOW.
              lastUpdatedAt: new Date('2026-09-19T11:57:00Z').getTime(),
            },
          },
        }}
        asOf="2026-09-19T11:57:00.000Z"
        now={NOW}
      />,
    );
    const badge = screen.getByTestId('tile-freshness');
    expect(badge.className).toBe('tile-freshness is-ok');
    expect(badge.querySelector('.tile-freshness__label')?.textContent).toBe('Pre-agg · 3m');
    expect(badge.querySelectorAll('svg[data-icon="ok"]').length).toBe(1);
    expect(badge.getAttribute('title')).toBe(
      `Pre-aggregation orders.main · as of ${exact('2026-09-19T11:57:00.000Z')} · 12 ms · built 3 minutes ago`,
    );
  });

  it('names the day with the time when the data is not from today (T477; T681’s review)', () => {
    const yesterday = '2026-09-18T11:57:06.000Z';
    render(<FreshnessBadge served={{ lastRefreshTime: yesterday }} asOf={yesterday} now={NOW} />);
    const time = screen.getByTestId('tile-freshness').querySelector('time');
    expect(time?.textContent).toBe(seconds(yesterday));
    // Never the bare clock, which would read as today's.
    expect(/^\d{2}:\d{2}:\d{2}$/.test(time?.textContent ?? '')).toBe(false);
  });

  it('says no time for one that isn’t a time, and still says where the data came from', () => {
    render(<FreshnessBadge served={{ lastRefreshTime: 'not a time' }} asOf="not a time" now={NOW} />);
    const badge = screen.getByTestId('tile-freshness');
    expect(badge.querySelectorAll('time').length).toBe(0);
    expect(badge.textContent).toBe('Live');
    expect(badge.getAttribute('title')).toBe('Live query · no pre-aggregation');
  });

  it('leaves out how long it took where that isn’t known', () => {
    render(<FreshnessBadge served={{ lastRefreshTime: ANSWERED_AT }} asOf={ANSWERED_AT} now={NOW} />);
    expect(screen.getByTestId('tile-freshness').getAttribute('title')).toBe(
      `Live query · as of ${exact(ANSWERED_AT)} · no pre-aggregation`,
    );
  });
});

/**
 * T154 / AC-148 on the tile itself, moved here from `DataAsOf.test.tsx` with
 * the component it tested (T681's follow-up): the head's badge carries the
 * answer's time, to the second, and its exact moment as its datetime.
 */
const spec = (rows: RenderSpec['rows']): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows,
});

describe('when a chart’s data is from, on its tile', () => {
  beforeEach(() => {
    // A drawn chart's canvas watches its own size, which jsdom cannot.
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

  it('is in the tile head, to the second, with the exact time as its datetime', () => {
    // Today's data, so the clock alone (T477): the tile reads the real clock.
    const at = new Date();
    at.setHours(10, 32, 18, 0);
    render(
      <ChartTile
        title="Orders"
        spec={spec([{ 'orders.status': 'shipped', 'orders.count': 3 }])}
        asOf={at.toISOString()}
        served={{ lastRefreshTime: at.toISOString() }}
      />,
    );
    const head = screen.getByTestId('chart-tile').querySelector('.tile-head');
    const badge = within(head as HTMLElement).getByTestId('tile-freshness');
    const asOf = badge.querySelector('time');
    expect(asOf?.getAttribute('datetime')).toBe(at.toISOString());
    // One 24-hour clock (T477; the coordinator's Q10).
    expect(asOf?.textContent).toBe('10:32:18');
    // Its tooltip the exact local time with UTC beside it (T477; Q9).
    expect(badge.getAttribute('title')).toBe(`Live query · as of ${exactOf(at)} · no pre-aggregation`);
  });

  it('is shown for an answer with no rows too — a refresh can come back empty', () => {
    render(
      <ChartTile
        spec={spec([])}
        asOf="2026-09-21T10:32:18.000Z"
        served={{ lastRefreshTime: '2026-09-21T10:32:18.000Z' }}
      />,
    );
    expect(
      screen.getByTestId('tile-freshness').querySelector('time')?.getAttribute('datetime'),
    ).toBe('2026-09-21T10:32:18.000Z');
  });

  it('is left out where there is no answer to say it of', () => {
    render(<ChartTile spec={spec([{ 'orders.count': 1 }])} />);
    expect(screen.queryAllByTestId('tile-freshness').length).toBe(0);
  });
});
