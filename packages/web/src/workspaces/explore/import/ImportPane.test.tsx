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
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        },
      },
    },
    {
      kind: 'chart',
      id: 'c2',
      title: 'Top products',
      body: {
        schemaVersion: 2,
        title: 'Top products',
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        },
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
    {
      kind: 'model',
      key: 'sales.yml',
      title: 'sales.yml',
      lands: 'not-imported-yet',
      warnings: [],
    },
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
/** The data sources the user sees, and the folders (T514's Data sources step). */
const HELD = [
  {
    id: 's-emea',
    name: 'emea_replica',
    driver: 'postgres',
    authMethod: 'password',
    folderId: 'sales',
    folderPath: [{ id: 'sales', title: 'Sales' }],
    updatedAt: '2026-09-28T10:00:00Z',
    lastTest: null,
    usedBy: null,
    usedElsewhere: 0,
  },
];
const FOLDERS = [
  { id: 'sales', title: 'Sales', parentId: 'root' },
  { id: 'emea', title: 'EMEA', parentId: 'sales' },
];
const serving = (url: string, init?: RequestInit) =>
  url === '/api/folders/targets'
    ? answer(200, TARGETS)
    : url === '/api/data-sources' && init?.method !== 'POST'
      ? answer(200, HELD)
      : url === '/api/folders'
        ? answer(200, FOLDERS)
        : url === '/api/import/review'
          ? answer(200, REVIEWED)
          : url === `/api/import` && init?.method === 'POST'
            ? answer(201, {
                dashboard: { id: 'new-board', title: 'Revenue overview' },
                created: { dashboards: 1, charts: 2, models: 0, dataSources: 0 },
                target: { id: 'emea', path: ['Sales', 'EMEA'] },
              })
            : answer(404, {});

/** The Data sources step (T514): the file's one mapped to Sales's of its name, then on to Review. */
async function mapReplica(pane: HTMLElement) {
  const next = within(pane).getByRole('button', { name: /Next: Review/ });
  expect((next as HTMLButtonElement).disabled).toBe(true);
  const row = within(pane).getByRole('group', { name: /^emea_replica/ });
  await userEvent.click(within(row).getByRole('radio', { name: 'Map to an existing one' }));
  await userEvent.click(
    await within(row).findByRole('radio', { name: /^emea_replica, Same name/ }),
  );
  await userEvent.click(next);
}

/** Chooses a file, as the button's file picker gives one. */
async function choose(pane: HTMLElement, text: string, name = 'revenue-overview.wechart.json') {
  const input = pane.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File([text], name, { type: 'application/json' })] },
  });
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
    expect(
      within(holds)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      'Revenue overviewDashboard · 1 own chart',
      'Top productsLibrary chart',
      'sales.ymlNot imported yet',
      'emea_replicaPostgreSQL · settings only',
    ]);
    expect(
      within(pane).getByText(/doesn’t take models from a file yet, so sales\.yml stays out/),
    ).toBeTruthy();
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

/**
 * T719 (AC-358; R71): a data source whose name has landed is mapped to the
 * landed one by the import: the Data sources step asks nothing of it,
 * Review says where it is mapped, and Import sends no decision for it.
 */
describe('the Import pane: a data source whose name is held (T719, AC-358)', () => {
  it('asks nothing of it, says it is mapped, and sends no decision for it', async () => {
    const heldReview = {
      ...REVIEWED,
      items: REVIEWED.items.map((item) =>
        item.kind === 'data-source'
          ? { ...item, mappedTo: { name: 'emea_replica', path: ['Sales'] }, held: true }
          : item,
      ),
    };
    const { fetchMock, onImported } = shown((url, init) =>
      url === '/api/import/review' ? answer(200, heldReview) : serving(url, init),
    );
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Target/ }));
    await userEvent.click(await within(pane).findByRole('treeitem', { name: 'EMEA' }));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Data sources/ }));
    const row = within(pane).getByRole('group', { name: /^emea_replica/ });
    expect((await within(row).findByRole('status')).textContent).toBe('Mapped');
    expect(within(row).queryByRole('radio')).toBeNull();
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Review/ }));
    expect(
      (await within(pane).findByTestId('lands-data-source-emea_replica')).textContent,
    ).toContain('Mapped to emea_replica in Sales');
    await userEvent.click(within(pane).getByRole('button', { name: 'Import to My workspace' }));
    await vi.waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });
    const made = fetchMock.mock.calls.find(
      ([url, init]) => url === `/api/import` && init?.method === 'POST',
    )!;
    expect((JSON.parse(String(made[1]!.body)) as { dataSources: unknown }).dataSources).toEqual([]);
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
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Data sources/ }));
    await mapReplica(pane);

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
    expect(within(pane).getByTestId('lands-model-sales.yml').textContent).toContain(
      'Not imported yet',
    );
    // The last asked, with the decisions (the first asks what is held: T719).
    const reviewed = fetchMock.mock.calls.filter(([url]) => url === '/api/import/review').at(-1)!;
    expect(JSON.parse(String(reviewed[1]!.body))).toEqual({
      file: FILE,
      targetFolderId: 'emea',
      dataSources: [{ name: 'emea_replica', map: 's-emea' }],
    });

    await userEvent.click(within(pane).getByRole('button', { name: 'Import to My workspace' }));
    await vi.waitFor(() => {
      expect(onImported).toHaveBeenCalledWith({
        dashboard: { id: 'new-board', title: 'Revenue overview' },
        created: { dashboards: 1, charts: 2, models: 0, dataSources: 0 },
        target: { id: 'emea', path: ['Sales', 'EMEA'] },
      });
    });
    const sent = fetchMock.mock.calls.find(
      ([url, init]) => url === `/api/import` && init?.method === 'POST',
    )!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({
      file: FILE,
      targetFolderId: 'emea',
      dataSources: [{ name: 'emea_replica', to: 's-emea' }],
    });
  });

  it('says so with sign-in off: everything still lands in My workspace', async () => {
    shown(serving, false);
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    await choose(pane, JSON.stringify(FILE));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Target/ }));
    await userEvent.click(await within(pane).findByRole('treeitem', { name: 'EMEA' }));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Data sources/ }));
    await mapReplica(pane);
    expect((await within(pane).findByTestId('import-where')).textContent).toBe(
      'Sign-in is off. Everything still lands in My workspace as new drafts, with the target Sales / EMEA.',
    );
  });
});

describe('a data source created by the import (T514, AC-358)', () => {
  it('is made in My workspace at Import, from its passing test, going to the target, and given as the one chosen', async () => {
    const envelope = { v: 1 as const, kid: 'kid-1', enc: 'enc', ct: 'ct' };
    // Its first test fails and its second passes; the first Import is refused.
    let tests = 0;
    let imports = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      url === '/api/data-sources/test'
        ? ((tests += 1),
          tests === 1
            ? answer(200, {
                ok: false,
                testId: 't-0',
                checks: [
                  { id: 'connect', status: 'failed', error: 'password authentication failed' },
                ],
              })
            : answer(200, {
                ok: true,
                testId: 't-1',
                checks: [{ id: 'connect', status: 'passed' }],
              }))
        : url === `/api/import` && init?.method === 'POST' && (imports += 1) === 1
          ? answer(503, { error: 'wechart could not be reached.' })
          : url === '/api/data-sources' && init?.method === 'POST'
            ? answer(201, { id: 's-new', name: 'emea_replica' })
            : url === '/api/data-sources/s-new' && init?.method === 'PUT'
              ? answer(200, { id: 's-new', description: 'Read replica.' })
              : url === '/api/import/review'
                ? answer(200, {
                    ...REVIEWED,
                    items: REVIEWED.items.map((item) =>
                      item.kind === 'data-source'
                        ? { ...item, title: 'emea_replica', lands: 'draft' }
                        : item,
                    ),
                  })
                : serving(url, init),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onImported = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ImportPane
          signedIn
          onImported={onImported}
          onClose={vi.fn()}
          seal={async () => envelope}
        />
      </QueryClientProvider>,
    );
    const pane = screen.getByRole('dialog', { name: 'Import a dashboard' });
    const described = {
      ...FILE,
      items: FILE.items.map((item) =>
        item.kind === 'data-source' ? { ...item, description: 'Read replica.' } : item,
      ),
    };
    await choose(pane, JSON.stringify(described));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Target/ }));
    await userEvent.click(await within(pane).findByRole('treeitem', { name: 'EMEA' }));
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Data sources/ }));
    const row = within(pane).getByRole('group', { name: /^emea_replica/ });
    await userEvent.click(within(row).getByRole('radio', { name: 'Create it' }));
    // Created under its own name, the file's (T719, R71): Review held none of it.
    expect((within(row).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('emea_replica');
    await userEvent.type(within(row).getByLabelText(/^Password/), 'wrong');
    await userEvent.click(within(row).getByRole('button', { name: 'Test connection' }));
    await within(row).findByText('password authentication failed');
    const password = within(row).getByLabelText(/^Password/);
    await userEvent.clear(password);
    await userEvent.type(password, 'secret');
    await userEvent.click(within(row).getByRole('button', { name: 'Test again' }));
    await within(row).findByText(/Every check passed/);
    await userEvent.click(within(pane).getByRole('button', { name: /Next: Review/ }));
    expect((await within(pane).findByTestId('lands-data-source-emea_replica')).textContent).toMatch(
      /emea_replicaData source, created · test passed \d\d:\d\d:\d\dNew draft/,
    );
    await userEvent.click(within(pane).getByRole('button', { name: 'Import to My workspace' }));
    // The first Import is refused after the data source is made: trying again doesn't make it twice.
    expect((await within(pane).findByRole('alert')).textContent).toContain(
      'wechart could not be reached.',
    );
    expect(onImported).not.toHaveBeenCalled();
    await userEvent.click(within(pane).getByRole('button', { name: 'Import to My workspace' }));
    await vi.waitFor(() => {
      expect(onImported).toHaveBeenCalledTimes(1);
    });

    const posted = (url: string, method = 'POST') =>
      fetchMock.mock.calls
        .filter(([at, init]) => at === url && init?.method === method)
        .map(([, init]) => JSON.parse(String(init!.body)) as unknown);
    expect(posted('/api/data-sources')).toEqual([
      {
        folderId: 'mine',
        name: 'emea_replica',
        driver: 'postgres',
        authMethod: 'password',
        fields:
          FILE.items[4]!.kind === 'data-source'
            ? (FILE.items[4] as { fields: unknown }).fields
            : {},
        sealed: { password: envelope },
        targetFolderId: 'emea',
        testId: 't-1',
        trials: ['t-0'],
      },
    ]);
    expect(posted('/api/data-sources/s-new', 'PUT')).toEqual([{ description: 'Read replica.' }]);
    const importBody = {
      file: described,
      targetFolderId: 'emea',
      dataSources: [{ name: 'emea_replica', to: 's-new' }],
    };
    expect(posted(`/api/import`)).toEqual([importBody, importBody]);
  });
});

// The coordinator's call on T719 (AC-361): a mapping by name warns of another driver too.
describe('what a held data source of another driver means (T719, AC-361)', () => {
  it('names both drivers where its folder is seen, and says only that it differs where not', () => {
    const item = {
      kind: 'data-source',
      title: 'emea_replica',
      driver: 'mysql',
      mappedTo: { name: 'emea_replica', path: ['Sales'] },
    };
    expect(
      warningText({ kind: 'driver-differs', driver: 'postgres' }, item, 'Sales / EMEA', true),
    ).toBe(
      'emea_replica is MySQL in the file, and emea_replica is PostgreSQL: a model written for MySQL’s SQL may not run on PostgreSQL.',
    );
    expect(warningText({ kind: 'driver-differs' }, item, 'Sales / EMEA', true)).toBe(
      'emea_replica is MySQL in the file, and the data source it is mapped to has another driver: a model written for MySQL’s SQL may not run on it.',
    );
  });
});

describe('what a same-named draft means (T513, AC-357)', () => {
  it('says the second approved replaces the first only where both go to one folder', () => {
    const item = { kind: 'chart', title: 'Top products' };
    expect(
      warningText(
        { kind: 'in-workspace', targetPath: ['Sales', 'EMEA'] },
        item,
        'Sales / EMEA',
        true,
      ),
    ).toBe(
      'Your workspace has a draft by this name, also → Sales / EMEA. Both are kept; the second approved replaces the first.',
    );
    expect(
      warningText({ kind: 'in-workspace', targetPath: ['Finance'] }, item, 'Sales / EMEA', true),
    ).toBe('Your workspace has a draft by this name, → Finance. Both are kept.');
    expect(
      warningText({ kind: 'in-workspace', targetPath: null }, item, 'Sales / EMEA', true),
    ).toBe('Your workspace has a draft by this name. Both are kept.');
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
