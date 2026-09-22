import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TileViewMenu, csvFileName } from './TileViewMenu';

/**
 * T177 / AC-171: WHEN the user exports a chart, THE SYSTEM SHALL produce a
 * CSV whose rows and columns match what the tile shows.
 *
 * From the tile's ⋯ menu in view mode, as the prototype's is ("Download
 * CSV"): the file is the tile's render spec as CSV (`csvOf`).
 */
const SPEC: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [
    { 'orders.status': 'shipped', 'orders.count': '3' },
    { 'orders.status': 'completed', 'orders.count': '5' },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a tile’s view-mode menu', () => {
  it('downloads the tile’s rows and columns as CSV, named by its chart', async () => {
    const saved: { name: string; text: string }[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="Orders by status"
        spec={SPEC}
        save={(name, text) => {
          saved.push({ name, text });
        }}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Actions for Orders by status' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(saved).toEqual([
      {
        name: 'Orders by status.csv',
        // The tile's table, after the mark telling a spreadsheet it is UTF-8.
        text: '﻿orders.status,orders.count\r\nshipped,3\r\ncompleted,5',
      },
    ]);
    // Closed, and focus back where it was opened.
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('offers no download while the tile’s newest answer is on its way (T177’s review)', async () => {
    const save = vi.fn();
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} asking save={save} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));

    const download = screen.getByRole('button', { name: 'Download CSV' });
    expect((download as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(download);
    expect(save).not.toHaveBeenCalled();
  });

  it('closes on a press elsewhere', async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
  });

  it('closes on Escape, giving focus back to its trigger', async () => {
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Actions for T' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('the CSV file’s name', () => {
  it('is the chart’s title, without characters a file system refuses', () => {
    expect(csvFileName('Sales / region: 2026?')).toBe('Sales - region- 2026-.csv');
    expect(csvFileName('   ')).toBe('chart.csv');
  });
});
