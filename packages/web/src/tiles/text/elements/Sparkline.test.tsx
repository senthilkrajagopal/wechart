import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SparklineNoData, SparklineSvg } from './Sparkline';

/**
 * T885 / AC-521: THE SYSTEM SHALL draw a Sparkline as wechart's own SVG,
 * 64 × 16 px, a 2 px line in the measure's dashboard colour over a time
 * dimension at its granularity for the last ‹n› periods set, with no axes or
 * markers except an optional last point, as an `img` whose text alternative
 * names the measure, the period, the first and last values and the low and
 * high.
 * `Fails when: either is drawn by ECharts, through innerHTML, or at another
 * size; a sparkline shows an axis, or a marker other than the chosen last
 * point; … or a text alternative lacks one of its parts.`
 */
const VALUES = [
  1_000_000, 1_100_000, 950_000, 1_050_000, 1_200_000, 1_150_000, 1_300_000, 1_180_000, 1_220_000,
  1_240_000, 1_260_000, 1_270_000,
];
const props = {
  values: VALUES,
  title: 'Revenue',
  member: 'orders.revenue',
  formats: { 'orders.revenue': 'currency' },
  granularity: 'month',
  colour: '#2f6fde',
};

describe('a Sparkline (T885, AC-521)', () => {
  it('is a 64 × 16 image of one 2 px line in the measure’s colour, with no axis', () => {
    const { container } = render(<SparklineSvg {...props} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('height')).toBe('16');
    const paths = svg?.querySelectorAll('path') ?? [];
    expect(paths).toHaveLength(1);
    expect(paths[0]?.getAttribute('stroke-width')).toBe('2');
    expect(paths[0]?.getAttribute('stroke')).toBe('#2f6fde');
    expect(paths[0]?.getAttribute('fill')).toBe('none');
    expect(svg?.querySelectorAll('line, text, rect, g')).toHaveLength(0);
    expect(svg?.querySelector('circle')).toBeNull();
  });

  it('marks the last point only when chosen', () => {
    const { container } = render(<SparklineSvg {...props} lastPoint />);
    const marks = container.querySelectorAll('circle');
    expect(marks).toHaveLength(1);
    // At the line's end.
    expect(Number(marks[0]?.getAttribute('cx'))).toBeGreaterThan(60);
  });

  it('is named by its measure, period, first and last values, low and high', () => {
    const { container } = render(<SparklineSvg {...props} />);
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Revenue by month, last 12 months: from $1.0M to $1.27M, low $0.95M, high $1.3M',
    );
  });

  it('draws nothing it can’t: a flat line for one value, "—" for none', () => {
    const one = render(<SparklineSvg {...props} values={[5]} />).container;
    expect(one.querySelector('path')).not.toBeNull();
    const none = render(<SparklineSvg {...props} values={[]} />).container;
    expect(none.querySelector('svg')).toBeNull();
    expect(none.textContent).toBe('—');
  });

  // Checkpoint 3 (AC-525): its "—" said nothing of why.
  it('says "No data for these filters" with its "—", as its description', () => {
    const none = render(<SparklineNoData title="Revenue" />).container;
    const dash = none.querySelector<HTMLElement>('[aria-describedby]');
    const said = document.getElementById(dash?.getAttribute('aria-describedby') ?? '');
    expect(dash?.textContent).toBe('—');
    expect(said?.textContent).toBe('Sparkline · Revenue No data for these filters');
  });
});
