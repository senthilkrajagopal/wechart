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
 * T898 / AC-533: … in view mode a bound chart SHALL say "· set by
 * ‹parameter›" beside its title.
 * `Fails when: … a bound chart in view mode lacks "set by" …`
 */
const spec: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'a', 'orders.count': 1 }],
};

describe('a chart that follows a dashboard parameter (T898, AC-533)', () => {
  it('says "· set by Metric to show" beside its title in view mode', () => {
    render(<ChartTile spec={spec} title="Revenue by month" setBy={['Metric to show']} />);
    const head = screen.getByRole('heading', { name: 'Revenue by month' }).parentElement;
    expect(head?.querySelector('.tile-head__set-by')?.textContent).toBe(' · set by Metric to show');
  });

  it('says nothing of it while editing, nor for a chart that follows none', () => {
    const { unmount } = render(
      // While editing, the head names the tile's kind (UX-032).
      <ChartTile
        spec={spec}
        title="Revenue by month"
        setBy={['Metric to show']}
        kind="Chart · Bar"
      />,
    );
    expect(document.querySelector('.tile-head__set-by')).toBeNull();
    unmount();
    render(<ChartTile spec={spec} title="Revenue by month" />);
    expect(document.querySelector('.tile-head__set-by')).toBeNull();
  });
});
