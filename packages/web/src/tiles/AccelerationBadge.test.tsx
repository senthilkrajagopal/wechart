import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
