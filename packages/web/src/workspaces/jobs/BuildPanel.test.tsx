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
      if (url === '/api/jobs/queries') return new Response(JSON.stringify([]));
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
