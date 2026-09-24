import type { ChartDocument, RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from './DashboardView';
import type { DashboardDocument } from './model/document';

/**
 * T068 / AC-062: WHEN the user duplicates a chart tile, THE SYSTEM SHALL give
 * the copy its own dashboard-local chart, so editing one tile leaves the other
 * unchanged.
 *
 * On the dashboard: Duplicate in a chart tile's ⋯ menu, in edit mode, puts
 * the copy beside it, drawing the same chart at once — its own chart, drawn
 * from the original's, not "no longer available" for want of a stored one.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'fixed' },
  pages: [
    { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 40 }] },
  ],
};

const CHART: ChartDocument = {
  schemaVersion: 1,
  title: 'By status',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'table',
  },
};

// A table draws in the DOM, so no canvas is measured.
const SPEC: RenderSpec = {
  chartType: 'table',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'shipped', 'orders.count': '3' }],
};

const tiles = () => [...document.querySelectorAll<HTMLElement>('[data-tile]')];

describe('duplicating a chart tile on the dashboard', () => {
  it('puts the copy beside it, drawing the same chart, from its ⋯ menu in edit mode', async () => {
    render(
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ c1: SPEC }}
        documents={{ c1: CHART }}
        onSave={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByTestId('tile-menu-t1'));
    await userEvent.click(screen.getByTestId('duplicate-t1'));

    expect(tiles()).toHaveLength(2);
    const [original, copy] = tiles() as [HTMLElement, HTMLElement];
    expect(copy.getAttribute('data-tile')).not.toBe('t1');
    // Drawn as the original is, from the copy's own chart.
    expect(within(copy).queryByTestId('tile-missing-chart')).toBeNull();
    expect(within(copy).getByRole('table').textContent).toContain('shipped');
    expect(within(original).getByRole('table').textContent).toContain('shipped');

    // Said, and where focus goes, as an inserted tile is (T068's review).
    expect(screen.getByTestId('drag-announcement').textContent).toMatch(/duplicated/);
    await vi.waitFor(() => {
      expect(window.document.activeElement).toBe(copy);
    });
  });

  it('offers no Duplicate before the chart it would copy is at hand', async () => {
    render(<DashboardView dashboardId="d1" document={DOC} specs={{}} loading onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByTestId('tile-menu-t1'));
    expect(screen.queryByTestId('duplicate-t1')).toBeNull();
  });

  /**
   * T223 / AC-205: every tile's edit menu lists Duplicate first — a tile with
   * no chart too, copied as itself beside it (the prototype's Duplicate on
   * every item). T068 offered it on chart tiles only.
   */
  it('duplicates a tile with no chart as itself, beside it', async () => {
    render(
      <DashboardView
        dashboardId="d1"
        document={{
          ...DOC,
          pages: [
            {
              id: 'p1',
              title: 'Page 1',
              items: [{ id: 'm1', kind: 'markdown', w: 6, h: 16, text: 'Notes' }],
            },
          ],
        }}
        specs={{}}
        onSave={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByTestId('tile-menu-m1'));
    await userEvent.click(screen.getByTestId('duplicate-m1'));

    const tiles = screen.getAllByTestId('grid-item');
    expect(tiles).toHaveLength(2);
    expect(tiles[0]?.getAttribute('data-tile')).toBe('m1');
    expect(tiles[1]?.getAttribute('data-tile')).not.toBe('m1');
    expect(tiles[1]?.textContent).toContain('Notes');
  });
});
