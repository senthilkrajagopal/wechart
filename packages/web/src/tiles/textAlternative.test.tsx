import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChartTile } from './ChartTile';

// A drawn chart's canvas watches its own size, which jsdom cannot.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * T958 / AC-585 (direction.md rule 166): a chart whose type has a text
 * alternative (`describeChart`) carries it on the tile, for a screen reader,
 * describing the chart it draws — here a 100 % stacked bar, which names the
 * first colour member's largest and smallest share.
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';

const spec = (options: Record<string, unknown>): RenderSpec =>
  ({
    chartType: 'stackedBar',
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    rows: [
      { [REGION]: 'EMEA', [CHANNEL]: 'Web', [REVENUE]: '60' },
      { [REGION]: 'EMEA', [CHANNEL]: 'Store', [REVENUE]: '40' },
      { [REGION]: 'APAC', [CHANNEL]: 'Web', [REVENUE]: '20' },
      { [REGION]: 'APAC', [CHANNEL]: 'Store', [REVENUE]: '80' },
    ],
    options,
    titles: { [REGION]: 'Region', [CHANNEL]: 'Channel', [REVENUE]: 'Revenue' },
    measureTypes: { [REVENUE]: 'sum' },
  }) as unknown as RenderSpec;

describe('a chart tile’s text alternative (AC-585)', () => {
  it('says a 100 % stack’s sentence with the chart, for a screen reader', () => {
    render(<ChartTile spec={spec({ stack: 'percent' })} title="Revenue mix" />);
    const said = screen.getByTestId('chart-text-alternative');
    expect(said.textContent).toBe(
      '100 % stacked bar of Revenue by Region and Channel. Web’s share is largest in EMEA (60 %) and smallest in APAC (20 %).',
    );
    // Read, not seen: the chart is its picture.
    expect(said.className).toContain('visually-hidden');
    // And named by the chart it describes.
    expect(screen.getByTestId('chart-canvas').getAttribute('aria-describedby')).toBe(said.id);
  });

  it('says nothing of its own for a chart whose type has none', () => {
    render(<ChartTile spec={spec({})} title="Revenue by channel" />);
    expect(screen.queryByTestId('chart-text-alternative')).toBeNull();
  });
});
