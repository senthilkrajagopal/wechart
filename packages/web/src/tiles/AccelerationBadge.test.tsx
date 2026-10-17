import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { exactOf } from '../shell/formatTime';
import { AccelerationBadge, accelerationOf } from './AccelerationBadge';

/**
 * AC-013: WHEN a result is served from a pre-aggregation, THE SYSTEM SHALL mark
 * the tile as accelerated and show the age of the data; otherwise it SHALL mark
 * the tile as live.
 * Fails when: a result with `usedPreAggregations` shows no accelerated
 * indicator, or a source-database result is labelled accelerated.
 *
 * Both directions matter. Labelling everything "live" hides that a number is
 * an hour old; labelling everything "accelerated" claims a freshness guarantee
 * that is not there. Requirements §4 makes this explicit: volumes vary widely,
 * so the UI has to say which queries are accelerated.
 */
const NOW = new Date('2026-09-19T12:00:00Z');

const accelerated = {
  usedPreAggregations: {
    'orders.main': {
      targetTableName: 'dev_pre_aggregations.orders_main',
      // 2026-09-19T11:20:00Z — forty minutes before NOW.
      lastUpdatedAt: 1789816800000,
    },
  },
};

describe('reading acceleration from a Cube result (AC-013)', () => {
  it('reports accelerated when Cube used a pre-aggregation', () => {
    expect(accelerationOf(accelerated).accelerated).toBe(true);
  });

  it('reports live when it did not', () => {
    expect(accelerationOf({ data: [] }).accelerated).toBe(false);
  });

  it('reports live for an empty usedPreAggregations, not accelerated', () => {
    // Cube sends the key with no entries for a source-database query; treating
    // its presence as proof would label every tile accelerated.
    expect(accelerationOf({ usedPreAggregations: {} }).accelerated).toBe(false);
  });

  it('reads the build time of the pre-aggregation that served the result', () => {
    expect(accelerationOf(accelerated).lastUpdatedAt?.toISOString()).toBe(
      '2026-09-19T11:20:00.000Z',
    );
  });

  it('names the pre-aggregation as the model does, not by its table', () => {
    // As Cube v1.7.42 answers outside dev mode: keyed by the table, with the
    // model's own name alongside (research/cube/pre-aggregations.md §4,
    // "Observed locally").
    const served = {
      usedPreAggregations: {
        'prod_pre_aggregations.monthly_orders_by_status_month': {
          preAggregationId: 'monthly_orders.by_status_month',
          lastUpdatedAt: 1789816800000,
          type: 'rollup',
        },
      },
    };

    expect(accelerationOf(served).preAggregation).toBe('monthly_orders.by_status_month');
    expect(accelerationOf(accelerated).preAggregation).toBe('orders.main');
  });
});

describe('the badge (AC-013)', () => {
  it('marks an accelerated tile and shows the age of the data', () => {
    render(<AccelerationBadge result={accelerated} now={NOW} />);

    const badge = screen.getByTestId('acceleration');
    expect(badge.textContent).toMatch(/accelerated/i);
    expect(badge.textContent).toMatch(/40 minutes ago/i);
  });

  it('marks a source-database tile as live', () => {
    render(<AccelerationBadge result={{ data: [] }} now={NOW} />);

    const badge = screen.getByTestId('acceleration');
    expect(badge.textContent).toMatch(/live/i);
    expect(badge.textContent).not.toMatch(/accelerated/i);
  });

  /** Chart-editor-Q5 (T690, EDI-01): the editor's head says "● Live" or "✓ Pre-agg", as a badge. */
  it('reads "● Live" or "✓ Pre-agg" as the editor head’s badge', () => {
    const { unmount } = render(
      <AccelerationBadge result={{ data: [] }} now={NOW} variant="head" />,
    );
    const live = screen.getByTestId('acceleration');
    expect(live.textContent).toBe('● Live');
    expect(live.classList.contains('badge')).toBe(true);
    unmount();
    render(<AccelerationBadge result={accelerated} now={NOW} variant="head" />);
    const pre = screen.getByTestId('acceleration');
    expect(pre.textContent).toBe('✓ Pre-agg');
    expect(pre.classList.contains('badge')).toBe(true);
    // "by", as Q5 words it (T690's review).
    expect(pre.getAttribute('title')).toMatch(
      /^Served by the pre-aggregation orders\.main, built 40 minutes ago/,
    );
  });

  /**
   * AC-147 as amended by R76 (chart-editor-Q4, Q5; T690): the badge reads
   * "Live", its tooltip says what that means and the rollup-only sentence.
   */
  it('says in its tooltip what Live means, and that rollup-only mode would refuse it', () => {
    render(<AccelerationBadge result={{ data: [] }} now={NOW} />);

    expect(screen.getByTestId('acceleration').getAttribute('title')).toBe(
      'Not served by a pre-aggregation · Cube queried the source database. If Cube runs in rollup-only mode, it would refuse this chart.',
    );
  });

  it('shows the age compactly, as the prototype’s tile badge does, and says it in full', () => {
    /**
     * The prototype's tile head carries "✓ 3m", its words in the tooltip
     * (prototype/dashboard.js). Written out in the head, the badge left a
     * half-width tile's title one letter wide (T014's review). The words stay
     * — for a screen reader, and in the tooltip with the rollup's name.
     */
    render(<AccelerationBadge result={accelerated} now={NOW} />);

    const badge = screen.getByTestId('acceleration');
    expect(badge.querySelector('.acceleration__short')?.textContent).toBe('40m');
    expect(badge.querySelector('.acceleration__short')?.getAttribute('aria-hidden')).toBe('true');
    expect(badge.querySelector('.visually-hidden')?.textContent).toBe(
      'Accelerated · built 40 minutes ago',
    );
    // Its age, then the exact build time with UTC beside it (T477, Q9).
    expect(badge.getAttribute('title')).toBe(
      `Accelerated: served from orders.main, built 40 minutes ago, ${exactOf(new Date(1789816800000))}`,
    );
  });

  it('pairs the state with an icon and a label, never colour alone', () => {
    render(<AccelerationBadge result={accelerated} now={NOW} />);

    expect(screen.getByTestId('acceleration').querySelector('[data-icon]')).toBeTruthy();
  });

  it('says so when an accelerated result carries no build time', () => {
    render(<AccelerationBadge result={{ usedPreAggregations: { 'orders.main': {} } }} now={NOW} />);

    const badge = screen.getByTestId('acceleration');
    expect(badge.textContent).toMatch(/accelerated/i);
    expect(badge.textContent).toMatch(/unknown/i);
  });
});
