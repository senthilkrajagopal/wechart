import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiTrend } from './KpiTrend';

/**
 * T938 / AC-565: WHEN a KPI has … Time set, THE SYSTEM SHALL draw … its
 * trend as R80's sparkline at the tile's content width × 32 px over Time at
 * its granularity.
 * `Fails when: … the sparkline isn't R80's or isn't the content width × 32
 * px …`
 *
 * Design 23 sheet 1: "Revenue by month, last 12: from $1.06M in Nov 2025 to
 * $1.35M in Oct 2026; low $1.02M, high $1.35M" — R80's own words for it.
 */
const MONTHS = [
  1_060_000, 1_040_000, 1_020_000, 1_060_000, 1_100_000, 1_090_000, 1_150_000, 1_140_000, 1_200_000,
  1_210_000, 1_260_000, 1_350_000,
];

describe('a KPI’s trend (T938, AC-565)', () => {
  it('in a tile whose content is 256 px wide, is R80’s Sparkline at 256 × 32 over Ordered at by month', () => {
    const { container } = render(
      <KpiTrend
        values={MONTHS}
        title="Revenue"
        member="orders.revenue"
        formats={{ 'orders.revenue': 'currency' }}
        granularity="month"
        colour="#2a6fdb"
        width={256}
      />,
    );
    const trend = container.querySelector('[data-testid="kpi-trend"]');
    const svg = trend?.querySelector('svg');
    // R80's own: its class, an image, one 2 px line in the measure's colour.
    expect(svg?.getAttribute('class')).toBe('text-sparkline');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('width')).toBe('256');
    expect(svg?.getAttribute('height')).toBe('32');
    const line = svg?.querySelectorAll('path');
    expect(line).toHaveLength(1);
    expect(line?.[0]?.getAttribute('stroke')).toBe('#2a6fdb');
    expect(line?.[0]?.getAttribute('stroke-width')).toBe('2');
    expect(svg?.getAttribute('aria-label')).toBe(
      'Revenue by month, last 12 months: from $1.06M to $1.35M, low $1.02M, high $1.35M',
    );
  });

  it('draws nothing until its width is known, rather than a word-sized line', () => {
    const { container } = render(
      <KpiTrend
        values={MONTHS}
        title="Revenue"
        member="orders.revenue"
        granularity="month"
        colour="#2a6fdb"
        width={0}
      />,
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
