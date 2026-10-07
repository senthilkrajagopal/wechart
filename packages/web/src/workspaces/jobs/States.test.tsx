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
  builds = [] as Answer,
  folders = MEMBER as unknown,
  build,
  cancel,
}: {
  preaggregations?: Answer | (() => Answer);
  queue?: Answer | (() => Answer);
  builds?: Answer;
  folders?: unknown;
  build?: () => Response;
  cancel?: () => Response;
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
      if (url === '/api/jobs/folders') return Response.json(folders);
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
        return answered(builds, (records) => ({ records, starters: [], folders: [] }));
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

function shown(search = '') {
  window.history.replaceState(null, '', `/jobs${search}`);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <JobsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  asked.length = 0;
  window.history.replaceState(null, '', '/');
});

const user = () => userEvent.setup({ delay: null });
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
    },
  );
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

    await user().click(within(row).getByRole('button', { name: /^Build orders\.main/ }));

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

    expect(text(await within(pane).findByTestId('not-started'))).toBe(
      `Not started. ${REFUSED.error}`,
    );
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
    const row = within(screen.getByRole('table', { name: 'Pre-aggregations' }))
      .getByText('orders.main', { selector: '[data-testid="preagg-name"]' })
      .closest('tr') as HTMLElement;
    const before = reads();

    await user().click(within(row).getByRole('button', { name: /^Build orders\.main/ }));

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
