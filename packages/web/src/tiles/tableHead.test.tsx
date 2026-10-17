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
 * T683 (AC-352; design 04 pins 3 and 7; DSH-03, DSH-04; R76 dashboard-Q3):
 * a table tile's head says how many rows its answer has and how many it
 * shows, "626 rows · first 100"; a KPI standing alone, on its own page, is
 * drawn at `text-kpi-solo`, where a dashboard's row of KPIs keeps `text-kpi`.
 */
const rows = (n: number) =>
  Array.from({ length: n }, (_, at) => ({ 'orders.id': String(at + 1), 'orders.count': 1 }));
const table = (shown: number, answered: number): RenderSpec => ({
  chartType: 'table',
  encoding: { x: ['orders.id'], y: ['orders.count'] },
  rows: rows(shown),
  answeredRows: rows(answered),
});

describe('a table tile’s row count (DSH-03)', () => {
  it('says how many rows its answer has, and how many it shows where the row limit cut it', () => {
    const { rerender } = render(<ChartTile title="Latest orders" spec={table(100, 626)} />);
    const count = () => screen.getByTestId('tile-row-count');
    expect(count().textContent).toBe('626 rows · first 100');
    // In the head, with the title.
    expect(count().closest('.tile-head')).not.toBeNull();

    rerender(<ChartTile title="Latest orders" spec={table(3, 3)} />);
    expect(count().textContent).toBe('3 rows');
    rerender(<ChartTile title="Latest orders" spec={table(1, 1)} />);
    expect(count().textContent).toBe('1 row');
    // 1,000 and more grouped as every count is.
    rerender(<ChartTile title="Latest orders" spec={table(100, 1250)} />);
    expect(count().textContent).toBe('1,250 rows · first 100');
  });

  // T683's review: where Cube itself cut the answer and said its total, the
  // head counts Cube's total, not what came.
  it('counts Cube’s own total where the query was told it', () => {
    render(<ChartTile title="Latest orders" spec={table(100, 10000)} rowsTotal={10050} />);
    expect(screen.getByTestId('tile-row-count').textContent).toBe('10,050 rows · first 100');
  });

  it('says none for a chart drawn as a chart', () => {
    render(
      <ChartTile
        title="By status"
        spec={{ ...table(3, 3), chartType: 'bar', encoding: { x: ['orders.id'], y: ['orders.count'] } }}
      />,
    );
    expect(screen.queryAllByTestId('tile-row-count').length).toBe(0);
  });
});

describe('a KPI alone (DSH-04)', () => {
  const kpi: RenderSpec = {
    chartType: 'kpi',
    encoding: { y: ['orders.count'] },
    rows: [{ 'orders.count': 626 }],
  };
  it('is drawn solo on its own page, and in the row’s size on a dashboard', () => {
    const { rerender } = render(<ChartTile title="Orders" spec={kpi} kpiSolo />);
    expect(screen.getByTestId('kpi').className).toBe('kpi kpi--solo');
    rerender(<ChartTile title="Orders" spec={kpi} />);
    expect(screen.getByTestId('kpi').className).toBe('kpi');
  });
});
