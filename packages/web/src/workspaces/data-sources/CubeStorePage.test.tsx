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
}: { state?: Answer; answers?: Answer[] } = {}) {
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
      if (url === '/api/sql-runs/going') return Response.json({ going: null });
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
    serve();
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
    finish({
      status: 422,
      body: {
        outcome: 'timeout',
        error:
          'Stopped at 30 seconds: xcube stopped waiting for it, and Cube Store ends the query at its own time limit.',
        durationMs: 30_000,
      },
    });
    await waitFor(() => {
      expect(screen.getByTestId('sql-result-note').textContent).toBe(
        'The run hadn’t finished after 30 seconds, so xcube stopped waiting for it, and Cube Store ends the query at its own time limit. Nothing came back. Narrow it with WHERE or LIMIT, or EXPLAIN it to see its plan.',
      );
    });
  });

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
