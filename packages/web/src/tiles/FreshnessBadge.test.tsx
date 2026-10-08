import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { clockOrWhenOf, exactOf } from '../shell/formatTime';
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
