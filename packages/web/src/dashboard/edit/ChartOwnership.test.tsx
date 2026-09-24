import type { ChartDocument } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { ChartOwnership, TileChartOwnership } from './ChartOwnership';

/**
 * T133 / AC-127: WHEN the user saves a local chart to a folder, THE SYSTEM
 * SHALL make it a library chart reusable by other dashboards, and say where it
 * was saved.
 * Fails when: the chart stays local, or the confirmation does not name the
 * folder.
 *
 * The prototype's Ownership panel in a chart tile's Properties: a local chart
 * offers "Save to folders…"; chosen, the chart goes to that folder with the
 * dashboard's Save (the user's decision, 2026-09-22), and the panel says where.
 */
const LOCAL: ChartDocument = {
  schemaVersion: 1,
  title: 'By status',
  localToDashboardId: 'd1',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
  },
};
/** The same chart as a library chart's: in a folder, local to no dashboard. */
const IN_SALES: ChartDocument = {
  schemaVersion: 1,
  title: LOCAL.title,
  folderId: 'sales',
  chart: LOCAL.chart,
};
/** As `/api/folders` answers: stored folders only — the top level is no folder of its own. */
const FOLDERS = [{ id: 'sales', title: 'Sales', parentId: 'root' }];

const ownership = (props: Partial<Parameters<typeof ChartOwnership>[0]> = {}) =>
  render(
    <ChartOwnership
      dashboardId="d1"
      chart={LOCAL}
      savingToFolder={false}
      folders={FOLDERS}
      defaultFolderId="sales"
      onSaveToFolder={vi.fn()}
      {...props}
    />,
  );

describe('a chart tile’s ownership', () => {
  it('offers a local chart a folder to be saved to, the dashboard’s own first', async () => {
    const onSaveToFolder = vi.fn();
    ownership({ onSaveToFolder });
    expect(screen.getByText(/Only on this dashboard/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Save to folders…' }));
    const folder = screen.getByRole('combobox', { name: 'Folder' }) as HTMLSelectElement;
    expect(folder.value).toBe('sales');
    // What it will mean, said before it is done.
    expect(screen.getByText(/becomes a shared chart/)).toBeTruthy();

    await userEvent.selectOptions(folder, 'root');
    await userEvent.click(screen.getByRole('button', { name: 'Save to this folder' }));
    expect(onSaveToFolder).toHaveBeenCalledWith('root');
  });

  it('offers the top level too, by name, and on a dashboard there it is what is shown and saved (T133’s review)', async () => {
    const onSaveToFolder = vi.fn();
    ownership({ onSaveToFolder, defaultFolderId: 'root' });
    await userEvent.click(screen.getByRole('button', { name: 'Save to folders…' }));

    const folder = screen.getByRole('combobox', { name: 'Folder' }) as HTMLSelectElement;
    // Both roots, the shared one and My workspace (AC-194), then the folders.
    expect([...folder.options].map((option) => option.textContent)).toEqual([
      'Shared',
      'My workspace',
      'Sales',
    ]);
    expect(folder.selectedOptions[0]?.textContent).toBe('Shared');
    await userEvent.click(screen.getByRole('button', { name: 'Save to this folder' }));
    expect(onSaveToFolder).toHaveBeenCalledWith('root');
  });

  it('takes focus to the folder on opening, and back on cancelling (T133’s review)', async () => {
    ownership();
    await userEvent.click(screen.getByRole('button', { name: 'Save to folders…' }));
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Folder' }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save to folders…' }));
  });

  it('offers nothing for a chart local to another dashboard (T133’s review)', () => {
    ownership({ chart: { ...LOCAL, localToDashboardId: 'd2' } });
    expect(screen.queryByRole('button', { name: 'Save to folders…' })).toBeNull();
  });

  it('holds the offer back while the folders cannot be read, and says so', () => {
    ownership({ folders: 'failed' });
    expect(screen.queryByRole('button', { name: 'Save to folders…' })).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/folders could not be read/);
  });

  it('says where a chart being saved to a folder is going, and when', () => {
    ownership({ chart: IN_SALES, savingToFolder: true, defaultFolderId: 'root' });
    const said = screen.getByRole('status');
    expect(said.textContent).toMatch(/Sales/);
    expect(said.textContent).toMatch(/when the dashboard is saved/);
    expect(said.querySelector('[data-icon]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Save to folders…' })).toBeNull();
  });

  it('names the folder a library chart is in', () => {
    ownership({ chart: IN_SALES, defaultFolderId: 'root' });
    expect(screen.getByText(/Shared · in Sales/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save to folders…' })).toBeNull();
  });
});

describe('saving a tile’s chart to a folder, on the session', () => {
  const DASHBOARD: DashboardDocument = {
    schemaVersion: 1,
    title: 'Sales',
    settings: { width: 'fixed' },
    folderId: 'sales',
    pages: [
      { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6 }] },
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the chart as stored — every field, and its version — and holds it as a library chart’s draft', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        asked.push(String(input));
        if (String(input) === '/api/folders') return new Response(JSON.stringify(FOLDERS));
        // Stored with a field this build does not model: it is kept (T192).
        return new Response(
          JSON.stringify({ version: 7, body: { ...LOCAL, futureField: 'kept' } }),
        );
      }),
    );
    let current = DASHBOARD;
    render(
      <TileChartOwnership
        dashboardId="d1"
        dashboard={DASHBOARD}
        chartId="c1"
        stored={LOCAL}
        drawn={{ error: undefined }}
        onChange={(apply) => {
          current = apply(current);
        }}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save to folders…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save to this folder' }));

    await vi.waitFor(() => {
      expect(current.chartDrafts?.['c1']).toBeDefined();
    });
    const draft = current.chartDrafts?.['c1'];
    expect(asked).toContain('/api/documents/chart/c1');
    expect(draft?.version).toBe(7);
    expect(draft?.wasLocalTo).toBe('d1');
    expect(draft?.document).toEqual({
      schemaVersion: 1,
      title: 'By status',
      chart: LOCAL.chart,
      futureField: 'kept',
      folderId: 'sales',
    });
  });

  it('reads nothing for a chart already drafted in the session: a new one is not stored yet', async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return new Response(JSON.stringify(FOLDERS));
      }),
    );
    let current: DashboardDocument = {
      ...DASHBOARD,
      chartDrafts: { c1: { document: LOCAL, drawn: { error: undefined }, version: 0 } },
    };
    render(
      <TileChartOwnership
        dashboardId="d1"
        dashboard={current}
        chartId="c1"
        stored={undefined}
        drawn={{ error: undefined }}
        onChange={(apply) => {
          current = apply(current);
        }}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save to folders…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save to this folder' }));

    await vi.waitFor(() => {
      expect(current.chartDrafts?.['c1']?.wasLocalTo).toBe('d1');
    });
    expect(asked).toEqual(['/api/folders']);
    expect(current.chartDrafts?.['c1']?.version).toBe(0);
  });
});
