import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildPanel, buildStateOf } from './BuildPanel';
import { JobsPage } from './JobsPage';

/**
 * T155 / AC-149: WHEN the user starts a build for a pre-aggregation, THE
 * SYSTEM SHALL submit it to Cube, show the job token, and poll until the job
 * reports done, missing partition, failure or not found.
 * Fails when: the job's terminal state is never shown, or the token is absent.
 *
 * Followed to a state it will not leave, and no further.
 */
const BUILDABLE = [
  { id: 'monthly_orders.by_status_month', type: 'rollup', partitionGranularity: 'year' },
];

/**
 * The API: each status request answered with the next state in `states`,
 * marked finished as the API marks it (`isFinished`, tested there). A token in
 * `leftOut` is missing from the first answer, as a partial answer would be.
 */
function api(states: string[], tokens: string[], leftOut: string[] = []) {
  const asked: string[] = [];
  let answers = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/preaggregations') return new Response(JSON.stringify(BUILDABLE));
      // The queue's entries, for the Queue tab's count (T376), answered and not counted.
      if (url === '/api/jobs/queue') return Response.json({ entries: [], everyFolder: true });
      // A page of the query log, as the API answers one (T240).
      if (url.startsWith('/api/jobs/queries/page'))
        return new Response(JSON.stringify({ records: [], total: 0 }));
      // The query log's titles (T469), answered and not counted.
      if (url === '/api/meta') return Response.json({ cubes: [] });
      // The Jobs header's own ask (T162), answered and not counted.
      if (url === '/api/cube-health')
        return new Response(JSON.stringify({ cube: 'healthy', worker: 'healthy' }));
      // The API scopes wechart has (T176), all granted: answered and not counted.
      if (url === '/api/cube-scopes')
        return Response.json({
          meta: 'granted',
          data: 'granted',
          sql: 'granted',
          graphql: 'granted',
          jobs: 'granted',
        });
      if (url === '/api/builds') {
        expect(JSON.parse(String(init?.body))).toEqual({
          preAggregation: 'monthly_orders.by_status_month',
        });
        return new Response(JSON.stringify({ tokens }));
      }
      answers += 1;
      const status = states.length > 1 ? (states.shift() as string) : (states[0] as string);
      return new Response(
        JSON.stringify(
          tokens
            .filter((token) => answers > 1 || !leftOut.includes(token))
            .map((token) => ({
              token,
              status,
              finished: !['scheduled', 'processing'].includes(status),
              table: 'prod_pre_aggregations.t_2026',
            })),
        ),
      );
    }),
  );
  return { statusAsks: () => asked.filter((url) => url === '/api/builds/status').length };
}

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function serving(states: string[], tokens = ['78f5612'], leftOut: string[] = []) {
  const served = api(states, tokens, leftOut);
  render(
    <QueryClientProvider client={client()}>
      <BuildPanel pollMs={10} />
    </QueryClientProvider>,
  );
  return served;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a folder’s pre-aggregation (T371, AC-297; §P2.6 D)', () => {
  it('shows it by its short name with its folder, and builds it by its published name', async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/preaggregations')
          return Response.json([
            {
              id: 'fa1__sales.main',
              folderId: 'a1',
              shortName: 'sales',
              folderPath: ['Shared', 'Sales', 'EMEA'],
              type: 'rollup',
            },
          ]);
        if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
        if (url === '/api/builds') {
          sent.push(JSON.parse(String(init?.body)));
          return Response.json({ tokens: ['t1'] });
        }
        return Response.json([]);
      }),
    );
    render(
      <QueryClientProvider client={client()}>
        <BuildPanel pollMs={10} />
      </QueryClientProvider>,
    );
    const name = await screen.findByTestId('preagg-name');
    expect(name.textContent).toBe('sales.main');
    expect(screen.getByTestId('preagg-folder').textContent).toBe('Sales / EMEA');
    expect(screen.queryByText('fa1__sales.main')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Build sales.main in Sales / EMEA' }));
    expect(sent).toEqual([{ preAggregation: 'fa1__sales.main' }]);
  });
});

describe('building a pre-aggregation', () => {
  it('lists what can be built, starts a build, shows its token and follows it to done', async () => {
    const { statusAsks } = serving(['scheduled', 'processing', 'done']);

    const row = (await screen.findByRole('cell', { name: 'monthly_orders.by_status_month' }))
      .parentElement as HTMLElement;
    expect(within(row).getByText('year')).toBeTruthy();
    await userEvent.click(
      within(row).getByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );

    const job = await screen.findByTestId('job-78f5612');
    expect(within(job).getByTestId('job-token').textContent).toBe('78f5612');
    // The state as Cube reports it, and in words with its icon (T158).
    await vi.waitFor(() => {
      expect(within(job).getByTestId('job-state').getAttribute('data-state')).toBe('done');
    });
    expect(within(job).getByTestId('job-state').textContent).toBe('Done');
    expect(within(job).getByTestId('job-table').textContent).toBe('prod_pre_aggregations.t_2026');

    // Done is final: no more asking.
    const asked = statusAsks();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(statusAsks()).toBe(asked);
    expect(asked).toBe(3);
  });

  it.each([
    ['missing_partition', 'Missing partition'],
    ['failure: relation "orders" does not exist', 'Failed: relation "orders" does not exist'],
    ['not_found', 'Not found'],
  ])('stops following a job that reports %s, and says so in words', async (final, words) => {
    const { statusAsks } = serving(['processing', final]);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );
    await vi.waitFor(() => {
      expect(screen.getByTestId('job-state').getAttribute('data-state')).toBe(final);
    });
    // As the panel shows it, not only as the badge's own test reads it.
    expect(screen.getByTestId('job-state').textContent).toBe(words);
    const asked = statusAsks();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(statusAsks()).toBe(asked);
  });

  /** T273 / AC-245: Data as of › Open in Jobs names the pre-aggregation in the address. */
  it('opens on the pre-aggregation it is asked for', async () => {
    api(['done'], ['78f5612']);
    render(
      <QueryClientProvider client={client()}>
        <BuildPanel pollMs={10} selectedFirst="monthly_orders.by_status_month" />
      </QueryClientProvider>,
    );

    const row = (await screen.findByRole('cell', { name: 'monthly_orders.by_status_month' }))
      .parentElement as HTMLElement;
    expect(row.getAttribute('aria-selected')).toBe('true');
  });

  /**
   * T469, UX-080/UX-081 (the phase-1 re-check): the pane is headed by its
   * name, its actions are small, and "Open in Model" opens the file on its
   * Pre-aggs tab with this pre-aggregation open — by the cube's name as its
   * file declares it, a folder's by its short name.
   */
  it('heads the pane with its name; Open in Model deep-links to it in its file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/preaggregations')
          return Response.json([
            {
              id: 'monthly_orders.by_status_month',
              type: 'rollup',
              fileName: 'cubes/monthly_orders.yml',
            },
            {
              id: 'fa1__sales.main',
              folderId: 'a1',
              shortName: 'sales',
              folderPath: ['Shared', 'Sales'],
              type: 'rollup',
              fileName: 'cubes/sales.yml',
              fileFolderId: 'a1',
            },
          ]);
        if (url === '/api/cube-scopes') return Response.json({ jobs: 'granted' });
        return Response.json([]);
      }),
    );
    render(
      <QueryClientProvider client={client()}>
        <BuildPanel pollMs={10} selectedFirst="monthly_orders.by_status_month" />
      </QueryClientProvider>,
    );
    const pane = await screen.findByRole('complementary', { name: 'Pre-aggregation details' });
    const head = await within(pane).findByTestId('pane-head');
    expect(within(head).getByRole('heading', { level: 2 }).textContent).toBe(
      'monthly_orders.by_status_month',
    );
    expect(within(pane).getByRole('link', { name: 'Open in Model' }).getAttribute('href')).toBe(
      '/model/files/cubes%2Fmonthly_orders.yml?cube=monthly_orders&tab=pre_aggregations&member=by_status_month',
    );
    expect(within(pane).getByRole('button', { name: 'Build now' }).className).toContain('btn-sm');
    // A button, not an underlined link, as the prototype's btn sm (T469's review).
    expect(within(pane).getByRole('link', { name: 'Open in Model' }).className).toBe('btn btn-sm');
    // Its name in the list is plain text; the pane's Open in Model is the way
    // there (the user, 2026-09-28: UX-080, AC-229 amended, R47).
    expect(
      screen.getAllByTestId('preagg-name').map((name) => [name.tagName, name.getAttribute('href')]),
    ).toEqual([
      ['SPAN', null],
      ['SPAN', null],
    ]);

    // A folder's opens its own file in its folder (T530, AC-222).
    await userEvent.click(screen.getByTestId('preagg-folder').closest('tr') as HTMLElement);
    expect(within(pane).getByRole('link', { name: 'Open in Model' }).getAttribute('href')).toBe(
      '/explore/folders/a1/models/cubes%2Fsales.yml?cube=sales&tab=pre_aggregations&member=main',
    );
  });

  it('shows every token of a build, one per partition', async () => {
    serving(['done'], ['aaa111', 'bbb222']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );

    expect(await screen.findByTestId('job-aaa111')).toBeTruthy();
    expect(await screen.findByTestId('job-bbb222')).toBeTruthy();
  });

  it('keeps asking while a token has no answer yet, though the others have finished', async () => {
    // T155's review: the stop rule counted the answers, not the tokens asked.
    serving(['done'], ['aaa111', 'bbb222'], ['bbb222']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );

    await vi.waitFor(() => {
      expect(
        within(screen.getByTestId('job-bbb222'))
          .getByTestId('job-state')
          .getAttribute('data-state'),
      ).toBe('done');
    });
  });

  it('says so, and asks nothing more, when Cube built no partition', async () => {
    const { statusAsks } = serving(['done'], []);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );

    expect((await screen.findByTestId('build-empty')).textContent).toBe(
      'Cube started no job: no partition of monthly_orders.by_status_month was built.',
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statusAsks()).toBe(0);
  });
});

describe('the Jobs workspace (T155’s review)', () => {
  it('keeps a build being followed when the user looks at the Queries tab and back', async () => {
    const { statusAsks } = api(['processing', 'processing', 'processing', 'done'], ['78f5612']);
    render(
      <QueryClientProvider client={client()}>
        <JobsPage pollMs={10} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );
    await screen.findByTestId('job-78f5612');
    await userEvent.click(screen.getByRole('tab', { name: 'Queries' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Pre-aggregations' }));

    await vi.waitFor(() => {
      expect(screen.getByTestId('job-state').getAttribute('data-state')).toBe('done');
    });
    expect(statusAsks()).toBe(4);
  });
});

/**
 * T239 / AC-229: … SHALL show a started build's progress in that row.
 *
 * One state for a build of several partitions: never "Done" while a
 * partition has not answered, or is still waiting (T239's review).
 */
describe('a build as one state, for its row (AC-229)', () => {
  const job = (token: string, status: string) => ({ token, status, finished: status === 'done' });

  it('is done only when every partition is', () => {
    expect(buildStateOf(['a', 'b'], [job('a', 'done'), job('b', 'done')])).toBe('done');
    expect(buildStateOf(['a', 'b'], [job('a', 'done')])).toBe('');
    expect(buildStateOf(['a', 'b'], [job('a', 'done'), job('b', 'scheduled')])).toBe('scheduled');
    expect(buildStateOf(['a', 'b'], [job('a', 'done'), job('b', 'not_found')])).toBe('not_found');
  });

  it('is failed if any partition failed, and processing while any is', () => {
    expect(buildStateOf(['a', 'b'], [job('a', 'failure: timeout'), job('b', 'processing')])).toBe(
      'failure: timeout',
    );
    expect(buildStateOf(['a', 'b'], [job('a', 'done'), job('b', 'processing')])).toBe('processing');
  });
});
