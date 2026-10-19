import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KpiChange } from './KpiChange';
import { KPI_CSS } from './kpiStyles';

/**
 * T937 / AC-565: WHEN a KPI has Compare to … set, THE SYSTEM SHALL draw …
 * its change as R80's Change element, ▲ or ▼ following the value's
 * direction, a sign and the percentage, coloured by Direction
 * (`status-success` when good, `status-error` when bad, `text-secondary`
 * when Neutral), then "vs ‹period› (‹value›)" in `text-xs` `text-secondary`.
 * `Fails when: … the glyph follows Direction rather than the value, or the
 * colour follows the value rather than Direction …`
 *
 * Design 23 sheet 1: "▲ +2.4% vs Sep 2026 ($1.32M)"; Return rate, Lower is
 * better, "▼ −0.4 pts vs Sep 2026 (2.2%) · lower is better".
 */
const FORMATS = {
  'orders.revenue': 'currency' as const,
  'orders.return_rate': 'percent' as const,
};

function drawn(props: Parameters<typeof KpiChange>[0]) {
  const { container } = render(<KpiChange {...props} />);
  const line = container.querySelector('[data-testid="kpi-change"]');
  if (line === null) throw new Error('no change line');
  return {
    line,
    change: line.querySelector('.text-change') as HTMLElement,
    vs: line.querySelector('.kpi__vs') as HTMLElement,
  };
}

describe('a KPI’s change line (T937, AC-565)', () => {
  it('reads $1.35M against $1.32M, Higher is better, as "▲ +2.4% vs Sep 2026 ($1.32M)" in status-success', () => {
    const { line, change, vs } = drawn({
      current: 1_352_000,
      compared: { value: 1_320_000, against: 'Sep 2026' },
      member: 'orders.revenue',
      formats: FORMATS,
      direction: 'higher',
    });
    expect(line.textContent).toBe('▲ +2.4% vs Sep 2026 ($1.32M)');
    expect(change.textContent).toBe('▲ +2.4%');
    // R80's Change element's own class and tone: its colour (textStyles).
    expect(change.getAttribute('data-tone')).toBe('success');
    expect(vs.textContent).toBe('vs Sep 2026 ($1.32M)');
  });

  it('reads Return rate 1.8 % against 2.2 %, Lower is better, as "▼ −0.4 pts vs Sep 2026 (2.2%) · lower is better" in status-success', () => {
    const { line, change } = drawn({
      current: 0.018,
      compared: { value: 0.022, against: 'Sep 2026' },
      member: 'orders.return_rate',
      formats: FORMATS,
      direction: 'lower',
    });
    expect(line.textContent).toBe('▼ −0.4 pts vs Sep 2026 (2.2%) · lower is better');
    expect(change.getAttribute('data-tone')).toBe('success');
  });

  it('colours a fall status-error when higher is better, and either way text-secondary when Neutral', () => {
    const fell = drawn({
      current: 1_200_000,
      compared: { value: 1_320_000, against: 'Sep 2026' },
      member: 'orders.revenue',
      formats: FORMATS,
      direction: 'higher',
    });
    expect(fell.change.textContent).toBe('▼ −9.1%');
    expect(fell.change.getAttribute('data-tone')).toBe('error');
    const neutral = drawn({
      current: 1_352_000,
      compared: { value: 1_320_000, against: 'Sep 2026' },
      member: 'orders.revenue',
      formats: FORMATS,
      direction: 'neutral',
    });
    expect(neutral.change.textContent).toBe('▲ +2.4%');
    expect(neutral.change.getAttribute('data-tone')).toBe('neutral');
  });

  it('names another measure as what it is against, and a value by itself', () => {
    expect(
      drawn({
        current: 1_352_000,
        compared: { value: 1_320_000, against: 'Revenue last year' },
        member: 'orders.revenue',
        formats: FORMATS,
        direction: 'higher',
      }).line.textContent,
    ).toBe('▲ +2.4% vs Revenue last year ($1.32M)');
    expect(
      drawn({
        current: 1_352_000,
        compared: { value: 1_320_000 },
        member: 'orders.revenue',
        formats: FORMATS,
        direction: 'higher',
      }).line.textContent,
    ).toBe('▲ +2.4% vs $1.32M');
  });

  it('sets "vs …" in text-xs, text-secondary, and the change in the tone’s colour', () => {
    expect(KPI_CSS).toMatch(/\.kpi__change \{[^}]*font-size: var\(--wc-text-xs-size\);[^}]*\}/);
    expect(KPI_CSS).toMatch(/\.kpi__vs \{[^}]*color: var\(--wc-text-secondary\);[^}]*\}/);
  });
});
