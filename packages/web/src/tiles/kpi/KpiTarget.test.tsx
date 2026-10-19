import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiTarget } from './KpiTarget';
import { KPI_CSS } from './kpiStyles';

/**
 * T938 / AC-565: WHEN a KPI has … Target … set, THE SYSTEM SHALL draw … its
 * target as R80's bullet graph at the content width × 16 px with "‹p›% of
 * ‹target›".
 * `Fails when: … the target isn't R80's bullet graph … or its words are
 * missing.`
 *
 * Design 23 sheet 1: $1.35M against $1.40M, "97% of $1.40M" in `text-xs`
 * `text-secondary` beside a bullet graph whose ranges are 80, 100 and 120 %
 * of the target.
 */
describe('a KPI’s target (T938, AC-565)', () => {
  const drawn = (width: number) =>
    render(
      <KpiTarget
        value={1_352_000}
        target={1_400_000}
        title="Revenue"
        member="orders.revenue"
        formats={{ 'orders.revenue': 'currency' }}
        width={width}
      />,
    ).container;

  it('draws $1.35M against $1.40M as R80’s BulletGraph, 16 px tall, and "97% of $1.40M"', () => {
    const target = drawn(548).querySelector('[data-testid="kpi-target"]');
    const svg = target?.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('text-bullet');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('height')).toBe('16');
    // The content width, less the words' room beside it.
    expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(400);
    expect(Number(svg?.getAttribute('width'))).toBeLessThan(548);
    // Three ranges, 80, 100 and 120 % of the target, and its rule at 100 %.
    expect(svg?.querySelectorAll('[data-part="range"]')).toHaveLength(3);
    const width = Number(svg?.getAttribute('width'));
    const rule = svg?.querySelector('[data-part="target"]');
    expect(Number(rule?.getAttribute('x')) + 1).toBeCloseTo(width / 1.2, 0);
    expect(target?.querySelector('.kpi__target-of')?.textContent).toBe('97% of $1.40M');
  });

  // T938-2: where the tile has no room for it, its words are still said.
  it('says its words, visually hidden, where the tile has no room for it', () => {
    const { container } = render(
      <KpiTarget
        value={1_352_000}
        target={1_400_000}
        title="Revenue"
        member="orders.revenue"
        formats={{ 'orders.revenue': 'currency' }}
        width={548}
        shown={false}
      />,
    );
    expect(container.querySelector('[data-testid="kpi-target"]')).toBeNull();
    const hidden = container.querySelector('[data-testid="kpi-target-hidden"]');
    expect(hidden?.className).toBe('visually-hidden');
    expect(hidden?.textContent).toBe('Not shown at this size: 97% of $1.40M target.');
  });

  it('sets its words in text-xs, text-secondary', () => {
    expect(KPI_CSS).toMatch(
      /\.kpi__target-of \{[^}]*font-size: var\(--wc-text-xs-size\);[^}]*color: var\(--wc-text-secondary\);[^}]*\}/,
    );
  });
});
