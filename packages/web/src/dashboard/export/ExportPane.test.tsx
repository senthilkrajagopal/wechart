import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportPane, type Outline } from './ExportPane';

/**
 * T511 (AC-354, AC-355, AC-360; design 13, screen 1 and states B–F): the
 * Export pane lists what goes with the dashboard, every dependency ticked,
 * each with what uses it; counts, and never names, what it doesn't offer;
 * and gives the file of what is chosen. Hovering over or focusing a
 * dependency outlines the tiles that use it (AC-360, P1).
 */
const OFFERED = {
  dashboard: { id: 'd1', title: 'Revenue overview', version: 7, path: ['Sales', 'EMEA'] },
  fileName: 'revenue-overview.wechart.json',
  ownCharts: [
    { id: 'c1', title: 'Revenue' },
    { id: 'c2', title: 'Orders' },
  ],
  libraryCharts: [
    { id: 'top', title: 'Top products', path: ['Sales'], chartIds: ['top'] },
    { id: 'margin', title: 'Margin trend', path: null, chartIds: ['margin'] },
  ],
  models: [
    { id: 'emea::sales.yml', path: 'sales.yml', folderPath: ['Sales', 'EMEA'], chartIds: ['c1', 'c2', 'top'] },
    { id: 'sales::orders.yml', path: 'orders.yml', folderPath: ['Sales'], chartIds: ['top'] },
  ],
  dataSources: [
    {
      id: 's1',
      name: 'emea_replica',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'pg-replica-1.sales.internal', port: 5432, database: 'sales', user: 'cube_reader', ssl: true },
      description: 'Read replica for EMEA order cubes.',
      folderPath: ['Sales', 'EMEA'],
      boundBy: ['sales.yml'],
      chartIds: ['c1', 'c2', 'top'],
    },
    {
      id: 's2',
      name: 'sales_dw',
      driver: 'snowflake',
      authMethod: 'key-pair',
      fields: { account: 'acme-emea', warehouse: 'REPORTING_WH', database: 'SALES', username: 'CUBE_SVC' },
      description: null,
      folderPath: ['Sales'],
      boundBy: ['orders.yml'],
      chartIds: ['top'],
    },
  ],
  notOffered: { models: 1, dataSources: 1, folders: 1, usedBy: ['Margin trend'] },
  viewOnly: false,
};

const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function shown(serve: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => serve(url, init));
  vi.stubGlobal('fetch', fetchMock);
  const onOutline = vi.fn<(outline: Outline | null) => void>();
  const onExported = vi.fn();
  const onClose = vi.fn();
  const save = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ExportPane
        dashboardId="d1"
        title="Revenue overview"
        onOutline={onOutline}
        onExported={onExported}
        onClose={onClose}
        save={save}
      />
    </QueryClientProvider>,
  );
  return { fetchMock, onOutline, onExported, onClose, save };
}
const offering = (url: string, init?: RequestInit) =>
  url === '/api/export/dashboards/d1' && init?.method !== 'POST'
    ? answer(200, OFFERED)
    : url === '/api/export/dashboards/d1'
      ? answer(200, { format: 'wechart-export', version: 1, exportedAt: 'now', items: [] })
      : answer(404, {});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Export pane (T511, AC-354)', () => {
  it('lists the dashboard and its own charts as always going, and every dependency ticked with what uses it', async () => {
    shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    expect(
      await within(pane).findByText('Sales / EMEA · version 7, as the folder has it'),
    ).toBeTruthy();
    const always = within(pane).getByRole('list', { name: 'Always in the file' });
    expect(within(always).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Revenue overviewthe dashboard, as saved',
      '2 own chartsmade on this dashboard',
    ]);

    const library = await within(pane).findByRole('group', { name: 'Library charts it shows' });
    expect(within(library).getByText('2 of 2')).toBeTruthy();
    const top = within(library).getByRole('checkbox', { name: 'Top products' });
    expect((top as HTMLInputElement).checked).toBe(true);
    expect(top.getAttribute('aria-describedby')).not.toBeNull();
    expect(
      pane.querySelector(`#${CSS.escape(top.getAttribute('aria-describedby')!.split(' ')[0]!)}`)
        ?.textContent,
    ).toBe('On the tile Top products');
    // Kept in a folder the user can't see: no folder named (pin 7).
    const margin = within(library).getByRole('checkbox', { name: 'Margin trend' }).closest('li')!;
    expect(margin.textContent).toContain('folder not shown');
    expect(margin.textContent).toContain('On the tile Margin trend · kept in a folder you can’t see');

    const models = within(pane).getByRole('group', { name: 'Models its charts use' });
    const sales = within(models).getByRole('checkbox', { name: 'sales.yml' }).closest('li')!;
    expect(sales.textContent).toContain('Used by 3 charts');
    expect(sales.textContent).toContain('Sales / EMEA');
    const orders = within(models).getByRole('checkbox', { name: 'orders.yml' }).closest('li')!;
    expect(orders.textContent).toContain('Used by Top products');

    const sources = within(pane).getByRole('group', { name: 'Data sources those models bind to' });
    const replica = within(sources).getByRole('checkbox', { name: 'emea_replica' }).closest('li')!;
    expect(replica.textContent).toContain('Settings only · no secrets');
    expect(replica.textContent).toContain('PostgreSQL in Sales / EMEA · bound by sales.yml');
    expect(within(sources).getByRole('note').textContent).toBe(
      'Settings only. Never a password, key or token, nor an encrypted copy of one.',
    );

    expect(within(pane).getByTestId('export-not-offered').textContent).toBe(
      'Not offered: 1 model and 1 data source that Margin trend uses, in a folder you can’t see.',
    );
    expect(within(pane).getByTestId('export-counts').textContent).toBe(
      'In the file: 1 dashboard · 4 charts · 2 models · 2 data sources',
    );
    expect((within(pane).getByLabelText('File name') as HTMLInputElement).value).toBe(
      'revenue-overview.wechart.json',
    );
  });

  it('shows a data source’s Details: the settings that go, and the secrets that never do', async () => {
    shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    const dw = (
      await within(pane).findByRole('checkbox', { name: 'sales_dw' })
    ).closest('li')!;
    await userEvent.click(within(dw).getByRole('button', { name: 'Details' }));
    const goes = within(dw).getByRole('list', { name: 'Goes in the file' });
    expect(goes.textContent).toContain('SnowflakeAccountacme-emea');
    expect(goes.textContent).toContain('Signs in withKey pair, as CUBE_SVC');
    const never = within(dw).getByRole('list', { name: 'Never in the file' });
    expect(within(never).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Private key (PEM)',
      'Key passphrase',
    ]);
  });

  it('counts what is ticked, and None leaves the dashboard and its own charts', async () => {
    shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    await userEvent.click(await within(pane).findByRole('checkbox', { name: 'emea_replica' }));
    const sources = within(pane).getByRole('group', { name: 'Data sources those models bind to' });
    expect(within(sources).getByText('1 of 2')).toBeTruthy();
    const box = within(sources).getByRole('checkbox', {
      name: 'Data sources those models bind to',
    }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(within(pane).getByTestId('export-counts').textContent).toBe(
      'In the file: 1 dashboard · 4 charts · 2 models · 1 data source',
    );

    await userEvent.click(within(pane).getByRole('button', { name: 'None' }));
    expect(within(pane).getByTestId('export-counts').textContent).toBe(
      'In the file: 1 dashboard · 2 charts',
    );
    expect(within(pane).getByText(/Only the dashboard and its own charts\./)).toBeTruthy();
    // A file with no dependencies is a choice, not an error.
    expect(
      (within(pane).getByRole('button', { name: 'Export file' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('exports what is ticked, under the name given, and says what the file holds', async () => {
    const { fetchMock, save, onExported } = shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    await userEvent.click(await within(pane).findByRole('checkbox', { name: 'Margin trend' }));
    await userEvent.click(within(pane).getByRole('checkbox', { name: 'sales_dw' }));
    const name = within(pane).getByLabelText('File name');
    await userEvent.clear(name);
    await userEvent.type(name, 'board.wechart.json');
    await userEvent.click(within(pane).getByRole('button', { name: 'Export file' }));
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledTimes(1);
    });
    const sent = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({
      libraryCharts: ['top'],
      models: ['emea::sales.yml', 'sales::orders.yml'],
      dataSources: ['s1'],
    });
    expect(save.mock.calls[0]![1]).toBe('board.wechart.json');
    expect(JSON.parse(save.mock.calls[0]![0] as string)).toEqual({
      format: 'wechart-export',
      version: 1,
      exportedAt: 'now',
      items: [],
    });
    expect(onExported).toHaveBeenCalledWith(
      'Exported board.wechart.json: 1 dashboard, 3 charts, 2 models and 1 data source, without their secrets.',
    );
  });

  it('names the dashboard among a model’s users where its own filters use it, and counts a chart it can’t offer', async () => {
    shown((url, init) =>
      url === '/api/export/dashboards/d1' && init?.method !== 'POST'
        ? answer(200, {
            ...OFFERED,
            models: [{ ...OFFERED.models[1], byDashboard: true }],
            notOffered: { charts: 1, models: 0, dataSources: 0, folders: 1, usedBy: [] },
          })
        : answer(404, {}),
    );
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    const orders = (await within(pane).findByRole('checkbox', { name: 'orders.yml' })).closest(
      'li',
    )!;
    expect(orders.textContent).toContain('Used by the dashboard and Top products');
    expect(within(pane).getByTestId('export-not-offered').textContent).toBe(
      'Not offered: 1 chart on it, in a folder you can’t see.',
    );
  });

  it('says a reader is offered no model or data source, and why', async () => {
    shown((url, init) =>
      url === '/api/export/dashboards/d1' && init?.method !== 'POST'
        ? answer(200, { ...OFFERED, models: [], dataSources: [], viewOnly: true })
        : answer(404, {}),
    );
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    expect(
      (await within(pane).findByTestId('export-view-only')).textContent,
    ).toBe(
      'Models and data sources aren’t offered. With View only access you see dashboards and the charts on them, not the models or data sources behind them.',
    );
    expect(within(pane).queryByRole('group', { name: 'Models its charts use' })).toBeNull();
    expect(within(pane).queryByTestId('export-not-offered')).toBeNull();
  });

  it('waits for the list, and says why it couldn’t be had, with Retry', async () => {
    shown(() => answer(503, { error: 'wechart could not be reached.' }));
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    expect((await within(pane).findByRole('alert')).textContent).toContain(
      'Couldn’t list what Revenue overview uses. wechart could not be reached.',
    );
    expect(within(pane).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(
      (within(pane).getByRole('button', { name: 'Export file' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('closes on Escape', async () => {
    const { onClose } = shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    fireEvent.keyDown(pane, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('outlining the tiles a dependency is used on (T511, AC-360)', () => {
  it('outlines them while a dependency is hovered over, and stops as the pointer leaves', async () => {
    const { onOutline } = shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    const sales = (await within(pane).findByRole('checkbox', { name: 'sales.yml' })).closest('li')!;
    await userEvent.hover(sales);
    expect(onOutline).toHaveBeenLastCalledWith({ chartIds: ['c1', 'c2', 'top'], label: 'sales.yml' });
    await userEvent.unhover(sales);
    expect(onOutline).toHaveBeenLastCalledWith(null);

    const replica = within(pane).getByRole('checkbox', { name: 'emea_replica' }).closest('li')!;
    await userEvent.hover(replica);
    expect(onOutline).toHaveBeenLastCalledWith({
      chartIds: ['c1', 'c2', 'top'],
      label: 'emea_replica',
    });
  });

  it('keeps the focused dependency’s tiles outlined once the pointer leaves another', async () => {
    const { onOutline } = shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    (await within(pane).findByRole('checkbox', { name: 'Top products' })).focus();
    const sales = within(pane).getByRole('checkbox', { name: 'sales.yml' }).closest('li')!;
    await userEvent.hover(sales);
    expect(onOutline).toHaveBeenLastCalledWith({ chartIds: ['c1', 'c2', 'top'], label: 'sales.yml' });
    await userEvent.unhover(sales);
    expect(onOutline).toHaveBeenLastCalledWith({ chartIds: ['top'], label: 'Top products' });
  });

  it('outlines them while a dependency has focus, and stops as focus leaves it', async () => {
    const { onOutline } = shown(offering);
    const pane = await screen.findByRole('dialog', { name: 'Export dashboard' });
    const top = await within(pane).findByRole('checkbox', { name: 'Top products' });
    top.focus();
    expect(onOutline).toHaveBeenLastCalledWith({ chartIds: ['top'], label: 'Top products' });
    within(pane).getByLabelText('File name').focus();
    expect(onOutline).toHaveBeenLastCalledWith(null);
  });
});
