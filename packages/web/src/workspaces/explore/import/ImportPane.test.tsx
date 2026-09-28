import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportPane, warningText } from './ImportPane';

/**
 * T513 (AC-356, AC-357, AC-359; design 13, screen 2 and states G–L, R, V, X):
 * the Import pane's File, Target and Review. The file is read first and
 * refused naming each part it can't take; the target is one of the folders
 * the user may write; Review lists what lands as new drafts in My workspace,
 * each with what it may affect, and none of it blocks Import.
 */
const FILE = {
  format: 'wechart-export',
  version: 1,
  exportedAt: '2026-09-28T14:00:00.000Z',
  items: [
    {
      kind: 'dashboard',
      id: 'd1',
      title: 'Revenue overview',
      body: {
        schemaVersion: 1,
        title: 'Revenue overview',
        pages: [{ id: 'p1', items: [{ id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 30 }] }],
        charts: ['c1'],
      },
    },
    {
      kind: 'chart',
      id: 'c1',
      title: 'Revenue',
      dashboardId: 'd1',
      body: {
        schemaVersion: 2,
        title: 'Revenue',
        chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] } },
      },
    },
    {
      kind: 'chart',
      id: 'c2',
      title: 'Top products',
      body: {
        schemaVersion: 2,
        title: 'Top products',
        chart: { source: { cube: 'orders' }, wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] } },
      },
    },
    { kind: 'model', path: 'sales.yml', content: 'cubes: []\n' },
    {
      kind: 'data-source',
      name: 'emea_replica',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
      description: null,
    },
  ],
};
const TARGETS = [
  { id: 'root', path: [] },
  { id: 'sales', path: ['Sales'] },
  { id: 'emea', path: ['Sales', 'EMEA'] },
];
const REVIEWED = {
  target: { id: 'emea', path: ['Sales', 'EMEA'] },
  items: [
    {
      kind: 'dashboard',
      key: 'd1',
      title: 'Revenue overview',
      ownCharts: 1,
      lands: 'draft',
      warnings: [{ kind: 'in-target', version: 4 }],
    },
    {
      kind: 'chart',
      key: 'c2',
      title: 'Top products',
      lands: 'draft',
      warnings: [{ kind: 'in-workspace', targetPath: ['Sales', 'EMEA'] }],
    },
    { kind: 'model', key: 'sales.yml', title: 'sales.yml', lands: 'not-imported-yet', warnings: [] },
    {
      kind: 'data-source',
      key: 'emea_replica',
      title: 'emea_replica',
      driver: 'postgres',
      lands: 'not-imported',
      warnings: [],
    },
  ],
};

const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function shown(serve: (url: string, init?: RequestInit) => Promise<Response>, signedIn = true) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => serve(url, init));
  vi.stubGlobal('fetch', fetchMock);
  const onImported = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportPane signedIn={signedIn} onImported={onImported} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { fetchMock, onImported, onClose };
}
const serving = (url: string, init?: RequestInit) =>
  url === '/api/folders/targets'
    ? answer(200, TARGETS)
    : url === '/api/import/review'
      ? answer(200, REVIEWED)
      : url === `/api/import` && init?.method === 'POST'
        ? answer(201, {
            dashboard: { id: 'new-board', title: 'Revenue overview' },
            created: { dashboards: 1, charts: 2, models: 0, dataSources: 0 },
            target: { id: 'emea', path: ['Sales', 'EMEA'] },
          })
        : answer(404, {});

/** Chooses a file, as the button's file picker gives one. */
async function choose(pane: HTMLElement, text: string, name = 'revenue-overview.wechart.json') {
  const input = pane.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'application/json' })] } });
  await within(pane).findByTestId('import-file');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Import pane: File (T513, AC-359)', () => {
  it('says nothing changes until Import, and waits for a file', () => {
    shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    expect(within(pane).getByRole('button', { name: 'Choose file…' })).toBeTruthy();
    expect(
      within(pane).getByText(
        'Nothing changes until you choose Import at the end. Every part of the file is checked first.',
      ),
    ).toBeTruthy();
    expect(
      (within(pane).getByRole('button', { name: /Next: Target/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('lists what a file it can read holds, and that models stay out for now', async () => {
    shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    expect(within(pane).getByText('Read · every part is one this wechart has')).toBeTruthy();
    const holds = within(pane).getByRole('list', { name: 'What it holds' });
    expect(within(holds).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      'Revenue overviewDashboard · 1 own chart',
      'Top productsLibrary chart',
      'sales.ymlNot imported yet',
      'emea_replicaPostgreSQL · settings only',
    ]);
    expect(within(pane).getByText(/doesn’t take models from a file yet, so sales\.yml stays out/)).toBeTruthy();
  });

  it('refuses a file it can’t read, saying where, and that nothing was imported', async () => {
    shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, '{\n  "format": "wechart-export",\n', 'broken.wechart.json');
    const alert = within(pane).getByRole('alert');
    expect(alert.textContent).toContain('Refused · nothing was imported');
    expect(alert.textContent).toContain('broken.wechart.json can’t be read as a wechart export.');
    expect(alert.textContent).toContain('It ends part-way through, at line 3, column 1.');
    expect(within(pane).getByRole('button', { name: 'Choose another file' })).toBeTruthy();
    expect(within(pane).queryByRole('button', { name: /Next: Target/ })).toBeNull();
  });

  it('refuses a file holding parts this wechart doesn’t have, naming each part and why', async () => {
    shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(
      pane,
      JSON.stringify({ ...FILE, items: [...FILE.items, { kind: 'alert', title: 'Late orders' }] }),
    );
    const alert = within(pane).getByRole('alert');
    expect(alert.textContent).toContain('Refused · 1 part this wechart doesn’t have');
    const parts = within(alert).getAllByRole('listitem');
    expect(parts.map((part) => part.textContent)).toEqual([
      'Item 6, “Late orders”Kind alert: this wechart imports dashboards, charts, models and data sources.',
    ]);
  });
});

describe('the Import pane: Target and Review (T513, AC-356, AC-357)', () => {
  it('lands in a folder the user may write, warns without blocking, and imports as new drafts', async () => {
    const { fetchMock, onImported } = shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Target/ }));
    const tree = await within(pane).findByRole('tree', { name: 'Target folder' });
    await userEvent.click(within(tree).getByRole('treeitem', { name: 'EMEA' }));
    expect(
      within(pane).getByText(
        /Everything in the file lands in My workspace as new drafts with this target\. Nothing in Sales \/ EMEA changes until you propose a draft/,
      ),
    ).toBeTruthy();
    await userEvent.click(within(pane).getByRole('button', { name: /^Next/ }));

    // Review: what lands, with its warnings, counted, and none blocking.
    await within(pane).findByText('2 warnings');
    expect(within(pane).getByTestId('import-summary').textContent).toBe(
      'Revenue overview → Sales / EMEA · 2 new drafts · 2 warnings',
    );
    const board = within(pane).getByTestId('lands-dashboard-d1');
    expect(board.textContent).toContain('Dashboard and 1 own chart');
    expect(board.textContent).toContain('New draft');
    expect(board.textContent).toContain(
      'Sales / EMEA has a dashboard by this name, version 4. Proposed, this draft replaces it once approved.',
    );
    expect(within(pane).getByTestId('lands-chart-c2').textContent).toContain(
      'Your workspace has a draft by this name, also → Sales / EMEA. Both are kept; the second approved replaces the first.',
    );
    expect(within(pane).getByTestId('lands-model-sales.yml').textContent).toContain('Not imported yet');
    const reviewed = fetchMock.mock.calls.find(([url]) => url === '/api/import/review')!;
    expect(JSON.parse(String(reviewed[1]!.body))).toEqual({ file: FILE, targetFolderId: 'emea' });

    await userEvent.click(within(pane).getByRole('button', { name: 'Import to My workspace' }));
    await vi.waitFor(() => {
      expect(onImported).toHaveBeenCalledWith({
        dashboard: { id: 'new-board', title: 'Revenue overview' },
        created: { dashboards: 1, charts: 2, models: 0, dataSources: 0 },
        target: { id: 'emea', path: ['Sales', 'EMEA'] },
      });
    });
    const sent = fetchMock.mock.calls.find(([url, init]) => url === `/api/import` && init?.method === 'POST')!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({ file: FILE, targetFolderId: 'emea' });
  });

  it('says so with sign-in off: everything still lands in My workspace', async () => {
    shown(serving, false);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Target/ }));
    await userEvent.click(await within(pane).findByRole('treeitem', { name: 'EMEA' }));
    await userEvent.click(within(pane).getByRole('button', { name: /^Next/ }));
    expect(
      (await within(pane).findByTestId('import-where')).textContent,
    ).toBe('Sign-in is off. Everything still lands in My workspace as new drafts, with the target Sales / EMEA.');
  });
});

describe('what a same-named draft means (T513, AC-357)', () => {
  it('says the second approved replaces the first only where both go to one folder', () => {
    const item = { kind: 'chart', title: 'Top products' };
    expect(
      warningText({ kind: 'in-workspace', targetPath: ['Sales', 'EMEA'] }, item, 'Sales / EMEA', true),
    ).toBe(
      'Your workspace has a draft by this name, also → Sales / EMEA. Both are kept; the second approved replaces the first.',
    );
    expect(warningText({ kind: 'in-workspace', targetPath: ['Finance'] }, item, 'Sales / EMEA', true)).toBe(
      'Your workspace has a draft by this name, → Finance. Both are kept.',
    );
    expect(warningText({ kind: 'in-workspace', targetPath: null }, item, 'Sales / EMEA', true)).toBe(
      'Your workspace has a draft by this name. Both are kept.',
    );
  });
});

describe('leaving part-way (T513; design 13, state X)', () => {
  it('closes at once before a file is chosen', async () => {
    const { onClose } = shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(within(pane).queryByRole('alertdialog')).toBeNull();
  });

  it('asks before discarding once a file is chosen', async () => {
    const { onClose } = shown(serving);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    await userEvent.click(within(pane).getByRole('button', { name: 'Cancel' }));
    const ask = within(pane).getByRole('alertdialog', { name: 'Discard this import?' });
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(ask).getByRole('button', { name: 'Keep going' }));
    expect(within(pane).queryByRole('alertdialog')).toBeNull();
    fireEvent.keyDown(pane, { key: 'Escape' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
