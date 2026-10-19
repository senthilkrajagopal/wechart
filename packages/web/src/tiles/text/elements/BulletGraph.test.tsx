import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BulletGraphSvg, rangesProblem } from './BulletGraph';

/**
 * T885 / AC-521: … a Bullet graph, 96 × 16 px, its value bar 4 px in
 * `text-primary`, its target, a fixed value or a measure, a 2 px
 * `text-primary` rule, and up to 3 ranges, low to high, in `bg-subtle`,
 * `border-subtle` and `border-strong`, between a minimum and a maximum, as an
 * `img` whose text alternative names the value, the target and the ranges.
 * `Fails when: … a fourth range can be set; or a text alternative lacks one
 * of its parts.`
 */
const props = {
  value: 0.214,
  target: 0.25,
  ranges: [0.15, 0.2, 0.25],
  title: 'Margin %',
  member: 'orders.margin',
  formats: { 'orders.margin': 'percent' },
};

describe('a Bullet graph (T885, AC-521)', () => {
  it('is a 96 × 16 image: three ranges in three greys, a 4 px value bar and a 2 px target', () => {
    const { container } = render(<BulletGraphSvg {...props} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('width')).toBe('96');
    expect(svg?.getAttribute('height')).toBe('16');
    const ranges = [...(svg?.querySelectorAll('[data-part="range"]') ?? [])];
    expect(ranges.map((range) => (range as SVGElement).style.fill)).toEqual([
      'var(--wc-bg-subtle)',
      'var(--wc-border-subtle)',
      'var(--wc-border-strong)',
    ]);
    const bar = svg?.querySelector('[data-part="value"]') as SVGElement | null;
    expect(bar?.getAttribute('height')).toBe('4');
    expect(bar?.style.fill).toBe('var(--wc-text-primary)');
    const target = svg?.querySelector('[data-part="target"]') as SVGElement | null;
    expect(target?.getAttribute('width')).toBe('2');
    expect(target?.style.fill).toBe('var(--wc-text-primary)');
  });

  it('places the value and target along its scale, from its minimum to its maximum', () => {
    const { container } = render(<BulletGraphSvg {...props} min={0} max={0.5} />);
    const bar = container.querySelector('[data-part="value"]');
    // 0.214 of 0.5 of 96 px.
    expect(Number(bar?.getAttribute('width'))).toBeCloseTo(41.1, 0);
    const target = container.querySelector('[data-part="target"]');
    expect(Number(target?.getAttribute('x'))).toBeCloseTo(48 - 1, 0);
  });

  it('is named by its value, its target and its ranges', () => {
    const { container } = render(<BulletGraphSvg {...props} />);
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Margin % 21.4%, target 25%, ranges 15%, 20% and 25%',
    );
  });

  it('refuses a fourth range, and ranges out of order', () => {
    expect(rangesProblem([1, 2, 3])).toBeUndefined();
    expect(rangesProblem([1, 2, 3, 4])).toBe('A bullet graph holds up to 3 ranges.');
    expect(rangesProblem([2, 1])).toBe('Ranges go from low to high.');
  });
});
