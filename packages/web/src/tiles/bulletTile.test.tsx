import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * T954 / AC-581, design 23 sheet 8: a saved bullet chart with Target emptied
 * draws, in the tile, "A bullet chart compares each member with a target.
 * Put a measure or a value in Target." with + Target; with a target, the
 * chart itself.
 */
const spec = (options: Record<string, unknown>): RenderSpec =>
  ({
    chartType: 'bullet',
    encoding: { x: ['orders.region'], y: ['orders.revenue'] },
    rows: [
      { 'orders.region': 'EMEA', 'orders.revenue': '412000' },
      { 'orders.region': 'APAC', 'orders.revenue': '221000' },
    ],
    options,
  }) as unknown as RenderSpec;

describe('a bullet chart’s tile (AC-581)', () => {
  it('says what it needs with + Target while Target is empty', async () => {
    const onAddTarget = vi.fn();
    render(<ChartTile spec={spec({})} title="Revenue against target" onAddTarget={onAddTarget} />);
    const empty = screen.getByTestId('bullet-no-target');
    expect(empty.textContent).toContain(
      'A bullet chart compares each member with a target. Put a measure or a value in Target.',
    );
    expect(screen.queryByTestId('chart-canvas')).toBeNull();
    expect(screen.queryByTestId('chart-not-drawable')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+ Target' }));
    expect(onAddTarget).toHaveBeenCalledTimes(1);
  });

  it('says it without + Target where the chart can’t be edited from the tile', () => {
    render(<ChartTile spec={spec({})} title="Revenue against target" />);
    expect(screen.getByTestId('bullet-no-target').textContent).toContain(
      'Put a measure or a value in Target.',
    );
    expect(screen.queryByRole('button', { name: '+ Target' })).toBeNull();
  });

  it('draws the chart once it has a target', () => {
    render(
      <ChartTile
        spec={spec({ bullet: { target: { kind: 'value', value: 300000 } } })}
        title="Revenue against target"
      />,
    );
    expect(screen.getByTestId('chart-canvas').dataset['chartType']).toBe('bullet');
    expect(screen.queryByTestId('bullet-no-target')).toBeNull();
  });
});
