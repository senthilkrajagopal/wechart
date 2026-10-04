import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CubeStorePage } from './CubeStorePage';

/**
 * T536 (AC-384, AC-374; design 15's state H, P5 and Q9): Cube Store's page,
 * its SQL tab alone, against a stubbed API. It runs on Cube Store, which
 * holds every folder's rollups, for SELECT and EXPLAIN only.
 */
type Answer = { status: number; body: unknown };
/** `/api/sql-runs/going` failing, as `going` may say (T548's review). */
const GOING_FAILS = Symbol('going fails');
function serve({
  state = {
    status: 200,
    body: {
      on: true,
      confirmedBy: { name: 'Ada Admin' },
      confirmedAt: '2026-10-02T09:00:00.000Z',
      runs: true,
    },
  } as Answer,
  answers = [] as Answer[],
  going = () => null,
}: {
  state?: Answer;
  answers?: Answer[];
  /** The user's run going, as `/api/sql-runs/going` says it each time it is asked. */
  going?: () => unknown;
} = {}) {
  const asked: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      asked.push({ url, method, body });
      if (url === '/api/cube-store') return Response.json(state.body, { status: state.status });
      if (url === '/api/cube-store/sql') {
        const { status, body: sent } = answers.shift() ?? {
          status: 200,
          body: {
            outcome: 'finished',
            columns: [{ name: 'table_name', type: null }],
            rows: [['orders_main']],
            rowCount: 1,
            truncated: null,
            durationMs: 310,
            statement: 'select',
          },
        };
        return Response.json(sent, { status });
      }
      if (url === '/api/cube-store/sql-runner' && method === 'PUT')
        return Response.json({ on: (body as { on: boolean }).on });
      if (url === '/api/sql-runs/going') {
        const now = going();
        return now === GOING_FAILS
          ? Response.json({ error: 'Boom' }, { status: 500 })
          : Response.json({ going: now });
      }
      if (url.startsWith('/api/sql-runs')) return Response.json({ runs: [] });
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

function open(superAdmin = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['me'], {
    name: superAdmin ? 'Ada Admin' : 'Wanda Writer',
    identity: superAdmin ? 'ada@example.com' : 'wanda@example.com',
    groups: [],
    superAdmin,
    security: 'oidc',
  });
  return render(
    <QueryClientProvider client={client}>
      <CubeStorePage />
    </QueryClientProvider>,
  );
}
const editorView = (container: HTMLElement) =>
  EditorView.findFromDOM(container.querySelector<HTMLElement>('.sql-editor .cm-editor')!)!;
const typeSql = (container: HTMLElement, text: string) => {
  const view = editorView(container);
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });
};

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cube Store’s page (T536, AC-384; design 15’s state H)', () => {
  it('has its SQL tab alone, under Shared, saying it runs on Cube Store past folder permissions', async () => {
    serve();
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Cube Store' })).toBeTruthy();
    expect(screen.getByText('Read-only SQL')).toBeTruthy();
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent?.replace(/\s+/g, ' '),
    ).toBe('Explore / Shared / Cube Store');
    const tabs = screen.getByRole('tablist', { name: 'Data source' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['SQL']);
    expect(screen.getByTestId('sql-warning').textContent).toBe(
      'This SQL runs on Cube Store directly. It holds every folder’s rollups, and folder permissions and access policies don’t apply.',
    );
    expect(screen.getByTestId('sql-runline').textContent).toBe(
      'Runs on Cube Store, which holds every folder’s rollups',
    );
    // No catalog of Cube Store's to browse: its tables are in information_schema.
    expect(screen.queryByRole('region', { name: /^Tables in/ })).toBeNull();
    expect(container.querySelector('.sql-editor')).not.toBeNull();
  });

  it('runs a SELECT on Cube Store, its columns headed by name alone', async () => {
    const asked = serve();
    const { container } = open();
    await screen.findByRole('heading', { level: 1, name: 'Cube Store' });
    typeSql(container, 'SELECT table_name FROM information_schema.tables LIMIT 1');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('table', { name: 'Result: 1 row, 1 column' });
    expect(
      asked.filter((each) => each.url === '/api/cube-store/sql').map((each) => each.body),
    ).toEqual([{ sql: 'SELECT table_name FROM information_schema.tables LIMIT 1' }]);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      '#',
      'table_name',
    ]);
    // Its own runs, by its page's id.
    expect(asked.some((each) => each.url === '/api/sql-runs?dataSource=cubestore')).toBe(true);
  });

  it('says a command that isn’t SELECT or EXPLAIN wasn’t run, naming it, and that nothing reached Cube Store', async () => {
    serve({
      answers: [
        {
          status: 400,
          body: {
            outcome: 'refused',
            error: 'On Cube Store, only SELECT and EXPLAIN run, one statement at a time.',
            reason: 'Only a SELECT or an EXPLAIN runs on Cube Store: this is a QUEUE command',
            statement: 'queue',
          },
        },
      ],
    });
    const { container } = open();
    await screen.findByRole('heading', { level: 1, name: 'Cube Store' });
    typeSql(container, 'QUEUE LIST');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-note').textContent).toBe(
        'On Cube Store, only SELECT and EXPLAIN run, one statement at a time. This is a QUEUE command. Nothing reached Cube Store.',
      );
    });
  });

  it('offers no Cancel while a run goes: Cube Store has none, and the run stops at 30 seconds', async () => {
    let finish: (answer: Answer) => void = () => undefined;
    const pending = new Promise<Answer>((resolve) => (finish = resolve));
    const endsBy = new Date(2026, 9, 4, 18, 2, 36).toISOString();
    /** The user's last run, once stopped: run on in Cube Store, then ended (T548). */
    let state: 'none' | 'stopping' | 'failing' | 'ended' = 'none';
    serve({
      going: () =>
        state === 'failing'
          ? GOING_FAILS
          : state === 'stopping'
            ? {
                dataSource: null,
                cubeStore: true,
                startedAt: '2026-10-04T18:00:36.000Z',
                stopping: true,
                endsBy,
              }
            : null,
    });
    const fetched = vi.mocked(fetch);
    const answered = fetched.getMockImplementation()!;
    fetched.mockImplementation(async (input, init) =>
      String(input) === '/api/cube-store/sql'
        ? (async () => {
            const { status, body } = await pending;
            return Response.json(body, { status });
          })()
        : answered(input, init),
    );
    const { container } = open();
    await screen.findByRole('heading', { level: 1, name: 'Cube Store' });
    typeSql(container, 'SELECT 1');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByRole('button', { name: 'Running…' });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // And says so (AC-379, amended by R64).
    expect(screen.getByTestId('sql-no-cancel').textContent).toBe(
      'Cube Store can’t stop a query, so there’s no Cancel.',
    );
    state = 'stopping';
    finish({
      status: 422,
      body: {
        outcome: 'timeout',
        error:
          'Stopped at 30 seconds: Cube Store can’t stop a query, so it is still finishing this one.',
        durationMs: 32_004,
        columns: [],
        rows: [],
        rowCount: 0,
        truncated: 'stopped',
        statement: 'select',
        stillRunning: true,
        endsBy,
      },
    });
    // T548 (AC-378, AC-379; R62): said still finishing, until when, and Run held.
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-note').textContent).toBe(
        'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it is still finishing this one, until 18:02:36 at the latest. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
      );
    });
    expect(container.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe(
      'Stopped at 30 seconds. Cube Store is still finishing it, until 18:02:36 at the latest.',
    );
    const held = await screen.findByTestId('sql-going-elsewhere');
    expect(held.textContent).toBe(
      'Cube Store is still finishing your last query, until 18:02:36 at the latest. One run at a time: your next one runs once it has ended.',
    );
    expect(within(held).queryByRole('button')).toBeNull();
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);

    // The page unable to ask: nothing said ended, and Run still held (T548's review).
    let asked = 0;
    state = 'failing';
    const fails = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input) === '/api/sql-runs/going') asked += 1;
      return fails(input, init);
    });
    await waitFor(
      () => {
        expect(asked).toBeGreaterThan(0);
      },
      { timeout: 5_000 },
    );
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it is still finishing this one, until 18:02:36 at the latest. Your next run waits until it has ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
    expect(screen.getByTestId('sql-going-elsewhere').textContent).toBe(
      'Cube Store is still finishing your last query, until 18:02:36 at the latest. One run at a time: your next one runs once it has ended.',
    );
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(true);

    // Ended, as xcube says: Run is offered again, and the result says so.
    state = 'ended';
    await waitFor(
      () => {
        expect(screen.queryByTestId('sql-going-elsewhere')).toBeNull();
      },
      { timeout: 5_000 },
    );
    expect((screen.getByRole('button', { name: 'Run' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId('sql-result-note').textContent).toBe(
      'The run hadn’t finished after 30 seconds, so wechart stopped waiting for it. Cube Store can’t stop a query, so it finished this one on its own: it has since ended. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
    );
  }, 15_000);

  it('is not there for one it isn’t for', async () => {
    serve({
      state: {
        status: 404,
        body: { error: 'There’s no such data source, or it isn’t yours to see.' },
      },
    });
    open();
    expect(
      await screen.findByText('There’s no such data source, or it isn’t yours to see.'),
    ).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('Cube Store’s switch (T536, AC-374; design 15’s Q9)', () => {
  it('turns on for a Super-Admin only once they confirm everyone allowed may read every folder’s rollups', async () => {
    const asked = serve({ state: { status: 200, body: { on: false, runs: false } } });
    open(true);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Turn on the SQL runner for Cube Store…' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Turn on the SQL runner for Cube Store?' });
    expect(dialog.textContent).toContain(
      'Cube Store holds the rollups of every folder. Once it’s on, Super-Admins and everyone who may run SQL on a data source in a folder can read any of them here, past folder permissions and access policies.',
    );
    expect(dialog.textContent).toContain(
      'Cube Store has no logins of its own, so wechart’s check on each command is the only guard.',
    );
    const turnOn = within(dialog).getByRole('button', { name: 'Turn on' });
    expect((turnOn as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(
      within(dialog).getByRole('checkbox', {
        name: 'I confirm that what wechart reaches Cube Store with can only read, and that everyone allowed may read every folder’s rollups.',
      }),
    );
    await userEvent.click(turnOn);
    expect(
      asked.filter((each) => each.url === '/api/cube-store/sql-runner').map((each) => each.body),
    ).toEqual([{ on: true, readOnlyConfirmed: true }]);
  });

  it('turns off from its SQL tab, for a Super-Admin', async () => {
    const asked = serve();
    open(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    expect(
      asked.filter((each) => each.url === '/api/cube-store/sql-runner').map((each) => each.body),
    ).toEqual([{ on: false }]);
  });
});
