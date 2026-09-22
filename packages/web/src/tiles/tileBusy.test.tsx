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
 * T183 / AC-177: THE SYSTEM SHALL pair every status, validation and job state
 * with an icon and a text label (direction.md rule 3).
 *
 * A tile being asked again keeps what it drew (AC-078), faded — and says so
 * in words with an icon, not by the fade alone.
 */
const spec = (rows: RenderSpec['rows']): RenderSpec => ({
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows,
});

describe('a tile being asked again', () => {
  it.each([
    ['drawn', spec([{ 'orders.status': 'a', 'orders.count': 1 }])],
    ['with no rows', spec([])],
  ])('says it is updating, with an icon, when %s', (_, drawn) => {
    render(<ChartTile spec={drawn} title="By status" busy />);
    const updating = screen.getByTestId('tile-busy');
    expect(updating.textContent).toBe('Updating…');
    expect(updating.querySelector('[data-icon="run"]')).not.toBeNull();
  });

  it('says nothing of it once answered', () => {
    render(<ChartTile spec={spec([])} title="By status" />);
    expect(screen.queryByTestId('tile-busy')).toBeNull();
  });
});
