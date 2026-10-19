import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChangeText } from './ChangeElement';

/**
 * T884 / AC-520: a Change shows a measure's change against the previous
 * period … as a percentage or an amount, with ▲ or ▼ and its sign, in
 * `status-success` or `status-error` text by its direction setting, Higher
 * is better or Lower is better, or `text-secondary` when Neutral.
 * `Fails when: … a Change lacks its triangle or its sign, or its colour
 * disagrees with its direction setting.`
 */
const FORMATS = { 'orders.revenue': 'currency' as const };
const UP = { current: 1042, previous: 1000, delta: 42, ratio: 0.042 };
const DOWN = { current: 979, previous: 1000, delta: -21, ratio: -0.021 };

function drawn(props: Parameters<typeof ChangeText>[0]) {
  const { container } = render(<ChangeText {...props} />);
  return container.firstElementChild as HTMLElement;
}

describe('a Change (T884, AC-520)', () => {
  it('reads "▲ 4.2%" in status-success when higher is better and it rose', () => {
    const change = drawn({ change: UP, member: 'orders.revenue', formats: FORMATS });
    expect(change.textContent).toBe('▲ 4.2%');
    expect(change.getAttribute('data-tone')).toBe('success');
  });

  it('reads "▼ 2.1%" in status-error when higher is better and it fell', () => {
    const change = drawn({ change: DOWN, member: 'orders.revenue', formats: FORMATS });
    expect(change.textContent).toBe('▼ 2.1%');
    expect(change.getAttribute('data-tone')).toBe('error');
  });

  it('turns the colours round when lower is better, and has none when neutral', () => {
    expect(
      drawn({
        change: DOWN,
        member: 'orders.revenue',
        formats: FORMATS,
        direction: 'lower',
      }).getAttribute('data-tone'),
    ).toBe('success');
    const neutral = drawn({
      change: UP,
      member: 'orders.revenue',
      formats: FORMATS,
      direction: 'neutral',
    });
    expect(neutral.getAttribute('data-tone')).toBe('neutral');
    expect(neutral.textContent).toBe('▲ 4.2%');
  });

  it('reads as an amount in the measure’s format, shortened: "▲ $50K"', () => {
    expect(
      drawn({
        change: { current: 1270000, previous: 1220000, delta: 50000, ratio: 50000 / 1220000 },
        member: 'orders.revenue',
        formats: FORMATS,
        show: 'amount',
      }).textContent,
    ).toBe('▲ $50K');
  });

  it('says "—" with nothing to compare, and nothing up or down for no change', () => {
    expect(drawn({ change: undefined, member: 'orders.revenue' }).textContent).toBe('—');
    const flat = drawn({
      change: { current: 5, previous: 5, delta: 0, ratio: 0 },
      member: 'orders.revenue',
    });
    expect(flat.textContent).toBe('0.0%');
    expect(flat.getAttribute('data-tone')).toBe('neutral');
  });
});
