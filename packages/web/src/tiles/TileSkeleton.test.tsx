import { CHART_TYPES } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TileSkeleton } from './TileSkeleton';

/**
 * T049 / AC-042: WHEN a chart is loading, THE SYSTEM SHALL show a skeleton in
 * the shape of the chart.
 * Fails when: loading shows an empty tile.
 *
 * "In the shape of the chart" is the part with teeth. A single grey rectangle
 * for every type would satisfy "not empty" and satisfy nothing else, so the
 * tests check that the shape actually varies and that nothing draws blank.
 */
const shapeOf = (chartType: (typeof CHART_TYPES)[number]) => {
  const { unmount } = render(<TileSkeleton chartType={chartType} />);
  const shape = screen.getByTestId('tile-skeleton').getAttribute('data-shape');
  unmount();
  return shape;
};

describe('every chart type gets a skeleton', () => {
  for (const chartType of CHART_TYPES) {
    it(`draws one for ${chartType}`, () => {
      render(<TileSkeleton chartType={chartType} />);

      const skeleton = screen.getByTestId('tile-skeleton');
      expect(skeleton.getAttribute('data-shape')).toBeTruthy();
      // Not an empty tile: there is something to look at.
      expect(skeleton.querySelectorAll('rect, circle, polyline').length).toBeGreaterThan(0);
    });
  }
});

describe('the shape follows the chart', () => {
  it('is not the same for every type', () => {
    const shapes = new Set(CHART_TYPES.map(shapeOf));

    // One grey rectangle for everything would pass "not empty" and nothing
    // else. A reader watching a dashboard fill in should be able to tell a
    // bar chart from a pie before either has data.
    expect(shapes.size).toBeGreaterThan(4);
  });

  it('distinguishes the families a reader would', () => {
    expect(shapeOf('bar')).not.toBe(shapeOf('pie'));
    expect(shapeOf('line')).not.toBe(shapeOf('bar'));
    expect(shapeOf('table')).not.toBe(shapeOf('kpi'));
    // A horizontal bar is a different shape from a vertical one, and the
    // whole point is that the tile does not jump when the data lands.
    expect(shapeOf('hbar')).not.toBe(shapeOf('bar'));
  });

  it('gives the same shape to types that genuinely look alike', () => {
    // A stacked bar and a grouped bar are the same silhouette while empty;
    // pretending otherwise would be noise.
    expect(shapeOf('stackedBar')).toBe(shapeOf('bar'));
    expect(shapeOf('donut')).toBe(shapeOf('pie'));
    expect(shapeOf('area')).toBe(shapeOf('line'));
  });
});

describe('assistive technology', () => {
  it('is told the tile is loading, once', () => {
    render(<TileSkeleton chartType="bar" />);

    expect(screen.getByRole('status').textContent).toBe('Loading chart');
  });

  it('does not read the decoration out', () => {
    render(<TileSkeleton chartType="bar" />);

    const svg = screen.getByTestId('tile-skeleton').querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
