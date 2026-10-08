import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JobsPage } from './JobsPage';

/**
 * T560 (AC-399; design 16, state G): Jobs' tabs in every state design 16
 * draws — loading as skeleton rows; an error with Retry and Details; empty
 * in the user's folders; a refusal in the API's words; access lost while
 * open, with "You no longer have access to do this." and the list read
 * again; `?preagg=` out of scope reading Not found as a missing one does;
 * and sign-in off as a Super-Admin sees it.
 */
const ROW = {
  id: 'orders.main',
  type: 'rollup',
  folderId: 'emea',
  folderPath: ['Shared', 'EMEA'],
  state: 'built',
  partitions: null,
  lastBuiltAt: null,
  startedBy: null,
};
const ENTRY = {
  key: 'k-1',
  preAggregation: 'orders.main',
  name: 'orders.main',
  folderId: 'emea',
  folderPath: ['Shared', 'EMEA'],
  partition: null,
  granularity: null,
  state: 'queued',
  addedAt: '2026-10-02T12:00:00.000Z',
  starter: { kind: 'person', key: 'wren', name: 'Wren Writer' },
  token: 't-1',
  runId: 'run-1',
  cancellable: true,
  stoppable: false,
};
const MEMBER = {
  everyFolder: false,
  folders: [{ id: 'emea', path: ['Shared', 'EMEA'], parentId: 'root' }],
};
const REFUSED = {
  error: 'You may build only the pre-aggregations of folders where you have read-write access.',
};

/** How each list answers: rows, an error, or never. */
type Answer = unknown[] | Response | 'pending';
const asked: string[] = [];
function serve({
  preaggregations = [ROW] as Answer | (() => Answer),
  queue = [ENTRY] as Answer | (() => Answer),
  builds = [] as Answer | (() => Answer),
  folders = MEMBER as unknown,
  build,
  cancel,
  me = { name: 'Wren Writer', security: 'oidc' } as unknown,
  record,
}: {
  preaggregations?: Answer | (() => Answer);
  queue?: Answer | (() => Answer);
  builds?: Answer | (() => Answer);
  folders?: unknown;
  build?: () => Response;
  cancel?: () => Response;
  /** Who is signed in, and in which mode: sign-in off is `security: 'off'` (G7). */
  me?: unknown;
  /** One build's record, by its id: none, and the API answers Not found (G6). */
  record?: (id: string) => Response;
} = {}) {
  const answered = (answer: Answer, rows: (list: unknown[]) => unknown) =>
    answer === 'pending'
      ? new Promise<Response>(() => undefined)
      : answer instanceof Response
        ? answer.clone()
        : Response.json(rows(answer));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/jobs/folders')
        return folders instanceof Response ? folders.clone() : Response.json(folders);
      if (url === '/api/me') return Response.json(me);
      const one = /^\/api\/jobs\/builds\/([^/?]+)$/.exec(url)?.[1];
      if (one !== undefined)
        return (
          record?.(decodeURIComponent(one)) ??
          Response.json({ error: 'There’s no build by that id in your folders.' }, { status: 404 })
        );
      if (url === '/api/jobs/summary')
        return Response.json({ building: null, queued: null, failed: null, suspended: null });
      if (url === '/api/preaggregations')
        return answered(
          typeof preaggregations === 'function' ? preaggregations() : preaggregations,
          (list) => list,
        );
      if (url === '/api/jobs/queue/cancel' && init?.method === 'POST')
        return cancel?.() ?? Response.json({ cancelled: true });
      if (url === '/api/jobs/queue')
        return answered(typeof queue === 'function' ? queue() : queue, (entries) => ({
          entries,
          everyFolder: false,
        }));
      if (url.startsWith('/api/jobs/builds'))
        return answered(typeof builds === 'function' ? builds() : builds, (records) => ({
          records,
          starters: [],
          folders: [],
        }));
      if (url === '/api/builds' && init?.method === 'POST')
        return build?.() ?? Response.json({ tokens: ['t1'], runId: 'run-1' });
      if (url.startsWith('/api/jobs/partitions'))
        return Response.json({
          id: 'orders.main',
          name: 'orders.main',
          kind: 'whole',
          granularity: null,
          partitions: [
            { tableName: 't', start: null, end: null, state: 'built', lastBuiltAt: null },
          ],
        });
      if (url === '/api/cube-health') return Response.json({ cube: 'healthy', worker: 'healthy' });
      if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
      return Response.json({ error: 'not here' }, { status: 404 });
    }),
  );
}

function shown(search = '', props: { buildId?: string } = {}) {
  window.history.replaceState(null, '', `/jobs${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <JobsPage {...props} />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
  window.history.replaceState(null, '', '/');
});

const user = () => userEvent.setup({ delay: null });
/** A window narrower than 1,024 px: the pane a sheet over the page (design 16, G8). */
const narrowWindow = () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
};
const text = (element: Element | null | undefined) => element?.textContent ?? '';
const panelOf = (tab: string | RegExp) => screen.getByRole('tabpanel', { name: tab });
const TABS = [
  ['', 'Pre-aggregations', 'preaggregations', 'the pre-aggregations', '/api/preaggregations'],
  ['?tab=history', 'Run history', 'builds', 'Run history', '/api/jobs/builds'],
  ['?tab=queue', /^Queue/, 'queue', 'the queue', '/api/jobs/queue'],
] as const;

describe('G1 · loading, as skeleton rows (T560, AC-399)', () => {
  it.each(TABS)(
    'draws %s’s list as skeleton rows while it is read',
    async (search, tab, list, what) => {
      serve({ [list]: 'pending' });
      shown(search);

      const panel = panelOf(tab);
      await vi.waitFor(() => {
        expect(within(panel).getByTestId('skeleton-rows').children.length).toBeGreaterThanOrEqual(
          3,
        );
      });
      expect(text(within(panel).getByTestId('reading'))).toBe(`Reading ${what}…`);
      // Under the list's own column heads, as G1 draws them (T610).
      expect(
        within(within(panel).getByTestId('skeleton-table'))
          .getAllByRole('columnheader')
          .map((header) => text(header)),
      ).toEqual(COLUMNS[list]);
    },
  );
});

/** Each tab's columns, as its list heads them. */
const COLUMNS: Record<(typeof TABS)[number][2], string[]> = {
  preaggregations: [
    'Pre-aggregation',
    'Folder',
    'Status',
    'Last built',
    'Started by',
    'Trigger',
    'Partitions',
  ],
  builds: [
    'Started',
    'Pre-aggregation',
    'Folder',
    'Partitions',
    'Outcome',
    'Duration',
    'Started by',
  ],
  queue: ['Added', 'Pre-aggregation', 'Folder', 'Partition', 'State', 'Started by', 'Token'],
};

describe('G8 · the tabs below 1,024 px (T612, AC-399)', () => {
  it('names Run history “History”, as the narrow frame does', async () => {
    narrowWindow();
    serve({});
    shown('?tab=history');

    expect(
      within(screen.getByRole('tablist', { name: 'Jobs' }))
        .getAllByRole('tab')
        .map((tab) => text(tab)),
    ).toEqual(['Pre-aggregations', 'History', expect.stringMatching(/^Queue/), 'Queries']);
    expect(panelOf('History').id).toBe(
      screen.getByRole('tab', { name: 'History' }).getAttribute('aria-controls'),
    );
  });
});

describe('G2 · an error, with Retry and Details (T560, AC-399; rule 18)', () => {
  it.each(TABS)(
    'says %s couldn’t be read, with Retry and Details',
    async (search, tab, list, what, path) => {
      serve({ [list]: Response.json({ error: 'xcube didn’t answer.' }, { status: 502 }) });
      shown(search);
      const panel = panelOf(tab);

      const said = await within(panel).findByRole('alert');
      expect(text(within(said).getByTestId('read-error'))).toBe(`Couldn’t read ${what}.`);
      expect(text(said)).toContain('xcube didn’t answer.');
      // Three lines, as G2 draws them: the error with its icon, then what it
      // means as help, then Retry and Details (T612).
      const lines = [...said.children];
      expect(lines.map((line) => line.className)).toEqual([
        'state-line',
        'help',
        'jobs-error__actions',
      ]);
      expect(lines[0]?.querySelector('svg')?.getAttribute('data-icon')).toBe('err');
      expect(text(lines[0])).toBe(`Couldn’t read ${what}.`);
      expect(text(lines[1])).toMatch(/^xcube didn’t answer\./);
      expect(text(within(said).getByText('Details'))).toBe('Details');
      // The status, what was asked, and when it failed (G2; T560's review).
      expect(text(within(said).getByTestId('read-details'))).toMatch(
        new RegExp(`^502 · GET ${path} · \\d{2}:\\d{2}:\\d{2}$`),
      );
      const before = asked.length;
      await user().click(within(said).getByRole('button', { name: 'Retry' }));
      await vi.waitFor(() => {
        expect(asked.length).toBeGreaterThan(before);
      });
    },
  );

  it('says a refusal in the API’s words, with no Retry', async () => {
    serve({
      preaggregations: Response.json(
        { error: 'Jobs and Schedules are for Super-Admins and read-write members of a folder.' },
        { status: 403 },
      ),
    });
    shown();
    const panel = panelOf('Pre-aggregations');

    expect(
      text(
        await within(panel).findByText(
          'Jobs and Schedules are for Super-Admins and read-write members of a folder.',
        ),
      ),
    ).toBe('Jobs and Schedules are for Super-Admins and read-write members of a folder.');
    expect(within(panel).queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('G3 · empty in the user’s folders (T560, AC-399)', () => {
  it('says no pre-aggregation is in their folders, and how one is added', async () => {
    serve({ preaggregations: [] });
    shown();
    const panel = panelOf('Pre-aggregations');

    const empty = await within(panel).findByTestId('list-empty');
    expect(text(empty.querySelector('b'))).toBe('No pre-aggregations in your folders');
    expect(text(empty)).toBe(
      'No pre-aggregations in your foldersNone of the models in the folders where you have read-write access defines one yet. Add one to a model in My workspace and propose it.',
    );
  });
});

describe('G4 · a refusal in the API’s words, and G5 · access lost while open (T560, AC-399)', () => {
  const reads = () => asked.filter((url) => url === '/api/preaggregations').length;

  it('says a refused build in the API’s words, as not started; still listed, nothing is lost', async () => {
    serve({ build: () => Response.json(REFUSED, { status: 403 }) });
    shown();
    const row = (await within(panelOf('Pre-aggregations')).findByText('orders.main')).closest(
      'tr',
    ) as HTMLElement;
    const before = reads();

    // From its pane, a row click only selecting (design 16, J; T611).
    await user().click(row);
    const pane = screen.getByRole('complementary', { name: 'Pre-aggregation details' });
    await user().click(await within(pane).findByRole('button', { name: /^Build now/ }));

    expect(text(await screen.findByTestId('not-started'))).toBe(`Not started. ${REFUSED.error}`);
    // Read again, and still theirs: no word of access lost (T560's review).
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
    expect(screen.queryByText('You no longer have access to do this.')).toBeNull();
  });

  it('says a build refused in the pane in the API’s words, as not started', async () => {
    serve({ build: () => Response.json(REFUSED, { status: 403 }) });
    shown('?preagg=orders.main');
    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });

    await user().click(await within(pane).findByRole('button', { name: /^Build now/ }));

    const notStarted = await within(pane).findByTestId('not-started');
    expect(text(notStarted)).toBe(`Not started. ${REFUSED.error}`);
    // In a bar, "Not started." in bold, as G4 draws it (T612).
    expect(notStarted.classList.contains('notebar')).toBe(true);
    expect(text(notStarted.querySelector('b'))).toBe('Not started.');
  });

  it('reads the list again when access is lost, closes the pane, and says so, as an error', async () => {
    let gone = false;
    serve({
      preaggregations: () => (gone ? [] : [ROW]),
      build: () => {
        gone = true;
        return Response.json(REFUSED, { status: 403 });
      },
    });
    // Opened by its address: a pane not closed would read Not found once its row went.
    shown('?preagg=orders.main');
    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });
    await within(pane).findByTestId('pane-head');
    expect(
      within(screen.getByRole('table', { name: 'Pre-aggregations' })).getByText('orders.main', {
        selector: '[data-testid="preagg-name"]',
      }),
    ).toBeTruthy();
    const before = reads();

    // From its pane, a row click only selecting (design 16, J; T611).
    await user().click(await within(pane).findByRole('button', { name: /^Build now/ }));

    const toast = await screen.findByText('You no longer have access to do this.');
    expect(text(toast)).toBe('You no longer have access to do this.');
    expect(toast.closest('[role="status"]')?.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'err',
    );
    expect(reads()).toBeGreaterThan(before);
    await vi.waitFor(() => {
      expect([
        within(pane).queryByTestId('not-found'),
        text(within(pane).getByText(/^Select a pre-aggregation/)),
      ]).toEqual([
        null,
        'Select a pre-aggregation to see its state, what rebuilds it, and to build it.',
      ]);
    });
  });

  it('says it below 1,024 px from a toast kept where it was, so it is announced (T640’s review)', async () => {
    narrowWindow();
    let gone = false;
    serve({
      preaggregations: () => (gone ? [] : [ROW]),
      build: () => {
        gone = true;
        return Response.json(REFUSED, { status: 403 });
      },
    });
    shown('?preagg=orders.main');
    // A sheet over the page, a modal dialog (T611).
    const pane = await screen.findByRole('dialog', { name: 'Pre-aggregation details' });
    await within(pane).findByTestId('pane-head');
    // Every live region there is as the sheet covers the page.
    const regions = [...document.querySelectorAll('[role="status"]')];

    await user().click(await within(pane).findByRole('button', { name: /^Build now/ }));

    const toast = (await screen.findByText('You no longer have access to do this.')).closest(
      '[role="status"]',
    );
    // The same region, there before what it says: a screen reader reads it as it changes.
    expect(regions).toContain(toast);
  });

  /** T611 (AC-176; T640's call): a sheet is a modal dialog, as the .source-pane sheets are. */
  it('reads its pane below 1,024 px as a modal dialog, and docked as a complementary pane', async () => {
    narrowWindow();
    serve();
    shown('?preagg=orders.main');

    const sheet = await screen.findByRole('dialog', { name: 'Pre-aggregation details' });
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(
      screen.queryAllByRole('complementary', { name: 'Pre-aggregation details' }),
    ).toHaveLength(0);
    // What it starts is said in it, so a reader that honours aria-modal reads it (T611's review).
    await user().click(await within(sheet).findByRole('button', { name: /^Build now/ }));
    const follow = await within(sheet).findByRole('button', { name: 'Follow it in Queue' });
    expect(text(follow.closest('[role="status"]'))).toBe(
      'Building orders.main.Follow it in Queue×',
    );
  });

  it('reads the queue again when a cancel finds access lost, and says so', async () => {
    let gone = false;
    serve({
      queue: () => (gone ? [] : [ENTRY]),
      cancel: () => {
        gone = true;
        return Response.json(
          { error: 'You can cancel only the builds of folders you have read-write access to.' },
          { status: 403 },
        );
      },
    });
    shown('?tab=queue');
    const table = await screen.findByRole('table', { name: 'Build queue' });

    await user().click(within(table).getByRole('button', { name: /^Cancel/ }));

    expect(text(await screen.findByText('You no longer have access to do this.'))).toBe(
      'You no longer have access to do this.',
    );
    await vi.waitFor(() => {
      expect(screen.queryByRole('table', { name: 'Build queue' })).toBeNull();
    });
  });
});

describe('G6 · out of scope, read as Not found (T560, AC-399; rule 67)', () => {
  it.each([['fx__rates.hourly'], ['no_such.rollup']])(
    'says ?preagg=%s isn’t in their folders, whether it is another’s or none',
    async (id) => {
      serve();
      shown(`?preagg=${id}`);
      const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });

      const missing = await within(pane).findByTestId('not-found');
      expect([
        text(within(missing).getByRole('heading', { level: 2 })),
        text(missing.querySelector('p')),
      ]).toEqual(['Not found', 'There’s no pre-aggregation by that name in your folders.']);
      // With the search's icon, as G6 draws it (T613).
      expect(missing.querySelector('.admin-pane__notfound svg')?.getAttribute('data-icon')).toBe(
        'search',
      );
      // Below 1,024 px it is a sheet like any: × goes back to the list (T560's review).
      await user().click(within(missing).getByRole('button', { name: 'Back to the list' }));
      expect(within(pane).queryByTestId('not-found')).toBeNull();
    },
  );
});

describe('G7 · sign-in off, as a Super-Admin sees it (T560, AC-399)', () => {
  it.each(TABS)('offers %s every folder, and no scope note', async (search, tab) => {
    serve({
      folders: { everyFolder: true, folders: [{ id: 'root', path: ['Shared'], parentId: null }] },
    });
    shown(search);
    const panel = panelOf(tab);

    await vi.waitFor(() => {
      expect(
        text(within(panel).getByRole('combobox', { name: 'Folder' }).querySelector('option')),
      ).toBe('All folders');
    });
    expect(within(panel).queryByRole('note', { name: 'Scope' })).toBeNull();
  });
});

/** The API's refusal of every Jobs list to one who writes no folder (T371). */
const NO_JOBS = () =>
  Response.json(
    { error: 'Jobs and Schedules are for Super-Admins and read-write members of a folder.' },
    { status: 403 },
  );
const BUILD = {
  id: 'b-1',
  preAggregation: 'orders.main',
  name: 'orders.main',
  folderId: 'emea',
  folderPath: ['Shared', 'EMEA'],
  partitions: null,
  granularity: null,
  jobs: 1,
  via: 'build-all',
  starter: { kind: 'person', key: 'admin', name: 'admin' },
  startedAt: '2026-10-02T12:05:12.000Z',
  endedAt: '2026-10-02T12:05:53.000Z',
  durationMs: 41_000,
  outcome: 'done',
  failedCount: 0,
  error: null,
  progress: { done: 1, building: 0 },
};

/**
 * T610 (AC-399; design 16, G5b): one whose last read-write folder goes while
 * Jobs is open finds, once a list is read again, that Jobs is for read-write
 * members, and the way to their dashboards.
 */
describe('G5b · no read-write folder left (T610, AC-399)', () => {
  it.each(TABS)(
    'says on %s that Jobs is for read-write members, and opens Explore',
    async (search, tab, list) => {
      let gone = false;
      const rows = { preaggregations: [ROW], queue: [ENTRY], builds: [BUILD] }[list];
      serve({ [list]: () => (gone ? NO_JOBS() : rows) });
      const client = shown(search);
      const panel = panelOf(tab);
      await within(panel).findByRole('table');

      gone = true;
      await client.invalidateQueries();

      // The page's, as G5b draws it: "Jobs is for…", no tab left (T610's review).
      const left = await screen.findByTestId('no-folder-left');
      expect(screen.queryByRole('tablist')).toBeNull();
      expect(panel.isConnected).toBe(false);
      expect(text(screen.getByRole('heading', { level: 1 }))).toBe('Jobs');
      expect([
        text(left.querySelector('b')),
        text(left.querySelector('span')),
        within(left).getByRole('link', { name: 'Open Explore' }).getAttribute('href'),
      ]).toEqual([
        'Jobs is for read-write members of a folder',
        'You no longer have read-write access to any folder, so there’s nothing here for you. Your dashboards are in Explore.',
        '/explore',
      ]);
      expect(left.querySelector('svg')?.getAttribute('data-icon')).toBe('lock');
    },
  );

  it('says so over the Queries tab, and over a tab never opened, once the queue is refused', async () => {
    let gone = false;
    serve({
      queue: () => (gone ? NO_JOBS() : [ENTRY]),
      builds: () => (gone ? NO_JOBS() : [BUILD]),
    });
    const client = shown('?tab=queries');
    await screen.findByRole('tablist');
    await vi.waitFor(() => {
      expect(asked).toContain('/api/jobs/queue');
    });

    gone = true;
    await client.invalidateQueries({ queryKey: ['jobs', 'queue'] });

    expect(text(await screen.findByTestId('no-folder-left'))).toContain(
      'Jobs is for read-write members of a folder',
    );
    // Run history, never opened, is never shown with the API's refusal.
    expect(screen.queryByRole('tab', { name: 'Run history' })).toBeNull();
    expect(asked.some((url) => url.startsWith('/api/jobs/builds'))).toBe(false);
  });
});

/**
 * T610 (AC-399; design 16, G6 and rule 67): Jobs opened by one who writes no
 * folder, and a build's log at `/jobs/builds/…` of another folder or none,
 * render the app's Not found page.
 */
describe('G6 · the app’s Not found page (T610, AC-399; rule 67)', () => {
  const notFound = async () =>
    text(await screen.findByRole('heading', { level: 1, name: 'Not found' }));

  it('is what one who writes no folder sees at /jobs, with no tab', async () => {
    serve({ folders: NO_JOBS(), preaggregations: NO_JOBS(), queue: NO_JOBS() });
    shown();

    expect(await notFound()).toBe('Not found');
    expect(text(screen.getByText('Nothing here matches that address.'))).toBe(
      'Nothing here matches that address.',
    );
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('is what a build’s log of another folder, or of none, reads at its address', async () => {
    serve();
    shown('', { buildId: 'b-theirs' });

    expect(await notFound()).toBe('Not found');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('opens a build’s log of theirs at its address, on Run history', async () => {
    serve({
      builds: [BUILD],
      record: () =>
        Response.json({ ...BUILD, requestId: 'r', answeredAt: BUILD.startedAt, tokens: [] }),
    });
    shown('', { buildId: 'b-1' });

    expect(await screen.findByRole('complementary', { name: 'Build of orders.main' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Run history' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('opens it once: Run history opened again from a pane opens no log (T610’s review)', async () => {
    serve({
      builds: [BUILD],
      record: () =>
        Response.json({ ...BUILD, requestId: 'r', answeredAt: BUILD.startedAt, tokens: [] }),
    });
    shown('', { buildId: 'b-1' });
    await screen.findByRole('complementary', { name: 'Build of orders.main' });

    await user().click(screen.getByRole('tab', { name: 'Pre-aggregations' }));
    await user().click(
      within(await within(panelOf('Pre-aggregations')).findByRole('table')).getByText(
        'orders.main',
      ),
    );
    await user().click(await screen.findByRole('link', { name: 'All its builds in Run history' }));

    const history = panelOf('Run history');
    await within(history).findByRole('table', { name: 'Run history' });
    expect(within(history).queryByRole('complementary', { name: /^Build of/ })).toBeNull();
    expect(text(within(history).getByRole('complementary', { name: 'Build log' }))).toBe(
      'Select a build to see its log.',
    );
  });
});

/**
 * T610 (AC-399; design 16, G7): with sign-in off, the one user's builds name
 * them "You", wherever a starter is named.
 */
describe('G7 · sign-in off: the single user is "You" (T610, AC-399)', () => {
  const SINGLE = { name: 'admin', security: 'off' };
  const ALL = { everyFolder: true, folders: [{ id: 'root', path: ['Shared'], parentId: null }] };

  it('names the single user’s builds "You" on Pre-aggregations, Run history and Queue', async () => {
    serve({
      me: SINGLE,
      folders: ALL,
      preaggregations: [{ ...ROW, startedBy: { kind: 'person', key: 'admin', name: 'admin' } }],
      builds: [BUILD],
      queue: [{ ...ENTRY, starter: { kind: 'person', key: 'admin', name: 'admin' } }],
    });
    shown();
    const starter = async (panel: HTMLElement) => text(await within(panel).findByTestId('starter'));

    await vi.waitFor(async () => {
      expect(await starter(panelOf('Pre-aggregations'))).toBe('You');
    });
    await user().click(screen.getByRole('tab', { name: 'Run history' }));
    await vi.waitFor(async () => {
      expect(await starter(panelOf('Run history'))).toBe('You');
    });
    await user().click(screen.getByRole('tab', { name: /^Queue/ }));
    await vi.waitFor(async () => {
      expect(await starter(panelOf(/^Queue/))).toBe('You');
    });
  });

  it('names a person by name when sign-in is on', async () => {
    serve({
      preaggregations: [{ ...ROW, startedBy: { kind: 'person', key: 'admin', name: 'admin' } }],
    });
    shown();

    expect(text(await within(panelOf('Pre-aggregations')).findByTestId('starter'))).toBe('admin');
  });
});

/**
 * T640 (AC-176; rule 85): Esc closes the pane on a wide window too, where it
 * is docked beside the list, as Esc closes every panel; focus goes back to
 * its row.
 */
describe('Esc in the docked pane (T640, AC-176)', () => {
  it('closes it, and gives focus back to its row', async () => {
    serve();
    shown();
    const row = within(await screen.findByRole('table', { name: 'Pre-aggregations' }))
      .getByText('orders.main', { selector: '[data-testid="preagg-name"]' })
      .closest('tr') as HTMLElement;
    // Its row's name, a button, the row's one stop (T611).
    const name = within(row).getByRole('button', { name: /^orders\.main/ });
    await user().click(name);
    const pane = screen.getByRole('complementary', { name: 'Pre-aggregation details' });
    within(pane).getByRole('heading', { level: 2, name: 'orders.main' }).focus();

    await user().keyboard('{Escape}');

    expect(text(within(pane).getByText(/^Select a pre-aggregation/))).toBe(
      'Select a pre-aggregation to see its state, what rebuilds it, and to build it.',
    );
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(name);
    });
  });
});

describe('J · design 10’s pane note, as design 16 rewords it (T560, AC-399)', () => {
  it('says building and wechart’s schedules need no proposal, and a refresh key does', async () => {
    serve();
    shown('?preagg=orders.main');
    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });

    expect(
      text(await within(pane).findByText(/^Building and wechart schedules need no proposal\./)),
    ).toBe(
      'Building and wechart schedules need no proposal. The refresh key is part of the model: to change it, edit the model in My workspace and propose it.',
    );
  });
});
