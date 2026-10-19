import { membersBrushed } from '@wechart/charts';
import type { ParallelBrush, RenderSpec } from '@wechart/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ParallelSliders } from './ParallelSliders';

/**
 * T984 / AC-600: WHILE a dashboard is in Markings mode, THE SYSTEM SHALL give
 * each parallel-coordinate axis a From and a To slider under the chart
 * (`input type="range"`), named "‹measure› from" and "‹measure› to", setting
 * that axis's brush as a drag does, reached with Tab and moved with ← and →.
 * `Fails when: an axis lacks either slider, or its name; moving a slider
 * marks other members than the same drag would; or a slider can't be reached
 * or moved from the keyboard.`
 */
const PRODUCT = 'products.name';
const REVENUE = 'products.revenue';
const MARGIN = 'products.margin';
const RETURNS = 'products.return_rate';
const MARGINS = [0.22, 0.23, 0.24, 0.25, 0.26, 0.235, 0.1, 0.12, 0.15, 0.18, 0.2, 0.3, 0.32, 0.35];

const spec = (brushes?: readonly ParallelBrush[]): RenderSpec =>
  ({
    chartType: 'parallel',
    encoding: { x: [PRODUCT], y: [REVENUE, MARGIN, RETURNS] },
    rows: MARGINS.map((margin, at) => ({
      [PRODUCT]: `P${String(at + 1)}`,
      [REVENUE]: String(1000 + at * 100),
      [MARGIN]: String(margin),
      [RETURNS]: String((at % 5) / 100),
    })),
    formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [RETURNS]: 'percent' },
    titles: {
      [PRODUCT]: 'Product',
      [REVENUE]: 'Revenue',
      [MARGIN]: 'Margin %',
      [RETURNS]: 'Return rate',
    },
    ...(brushes === undefined ? {} : { parallelBrushes: brushes }),
  }) as unknown as RenderSpec;

describe('parallel coordinates’ sliders (AC-600)', () => {
  it('gives each axis a From and a To slider, named after its measure, at its ends', () => {
    render(<ParallelSliders spec={spec()} onBrush={() => undefined} />);
    for (const title of ['Revenue', 'Margin %', 'Return rate']) {
      const from = screen.getByRole('slider', { name: `${title} from` });
      const to = screen.getByRole('slider', { name: `${title} to` });
      expect(from.getAttribute('type')).toBe('range');
      expect(to.getAttribute('type')).toBe('range');
    }
    const from = screen.getByRole('slider', { name: 'Margin % from' }) as HTMLInputElement;
    const to = screen.getByRole('slider', { name: 'Margin % to' }) as HTMLInputElement;
    expect(Number(from.value)).toBeCloseTo(0.1);
    expect(Number(to.value)).toBeCloseTo(0.35);
    // Said in the measure's own format.
    expect(from.getAttribute('aria-valuetext')).toMatch(/^10(\.0+)?%$/);
  });

  it('sets its axis’s brush as a drag does, adding it to the others', () => {
    const onBrush = vi.fn<(brush: ParallelBrush, add: boolean) => void>();
    const { rerender } = render(<ParallelSliders spec={spec()} onBrush={onBrush} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Margin % from' }), {
      target: { value: '0.22' },
    });
    expect(onBrush).toHaveBeenLastCalledWith({ member: MARGIN, from: 0.22, to: 0.35 }, true);

    rerender(
      <ParallelSliders spec={spec([{ member: MARGIN, from: 0.22, to: 0.35 }])} onBrush={onBrush} />,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Margin % to' }), {
      target: { value: '0.26' },
    });
    const [brush] = onBrush.mock.lastCall ?? [];
    expect(brush).toEqual({ member: MARGIN, from: 0.22, to: 0.26 });
    // The same 6 products a drag over 22–26 % marks.
    expect(membersBrushed(spec(), [brush!])).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });

  it('keeps From at or under To', () => {
    const onBrush = vi.fn<(brush: ParallelBrush, add: boolean) => void>();
    render(
      <ParallelSliders spec={spec([{ member: MARGIN, from: 0.22, to: 0.26 }])} onBrush={onBrush} />,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Margin % from' }), {
      target: { value: '0.3' },
    });
    expect(onBrush).toHaveBeenLastCalledWith({ member: MARGIN, from: 0.26, to: 0.26 }, true);
  });

  it('moves by a hundredth of its axis, so ← and → step through it', () => {
    render(<ParallelSliders spec={spec()} onBrush={() => undefined} />);
    const from = screen.getByRole('slider', { name: 'Margin % from' }) as HTMLInputElement;
    expect(Number(from.step)).toBeCloseTo(0.0025);
    expect(from.tabIndex).toBe(0);
  });
});
