import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildPanel } from './BuildPanel';

/**
 * T155 / AC-149: WHEN the user starts a build for a pre-aggregation, THE
 * SYSTEM SHALL submit it to Cube, show the job token, and poll until the job
 * reports done, missing partition, failure or not found.
 * Fails when: the token is not shown, or polling stops before a terminal
 * state or continues after one.
 */
const BUILDABLE = [
  { id: 'monthly_orders.by_status_month', type: 'rollup', partitionGranularity: 'year' },
];

/** The API: each status request answered with the next state in `states`. */
function serving(states: string[], tokens = ['78f5612']) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/preaggregations') return new Response(JSON.stringify(BUILDABLE));
      if (url === '/api/builds') {
        expect(JSON.parse(String(init?.body))).toEqual({
          preAggregation: 'monthly_orders.by_status_month',
        });
        return new Response(JSON.stringify({ tokens }));
      }
      const status = states.length > 1 ? (states.shift() as string) : (states[0] as string);
      return new Response(
        JSON.stringify(
          tokens.map((token) => ({ token, status, table: 'prod_pre_aggregations.t_2026' })),
        ),
      );
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BuildPanel pollMs={10} />
    </QueryClientProvider>,
  );
  return { statusAsks: () => asked.filter((url) => url === '/api/builds/status').length };
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
    await vi.waitFor(() => {
      expect(within(job).getByTestId('job-state').textContent).toBe('done');
    });
    expect(within(job).getByTestId('job-table').textContent).toBe('prod_pre_aggregations.t_2026');

    // Done is final: no more asking.
    const asked = statusAsks();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(statusAsks()).toBe(asked);
    expect(asked).toBe(3);
  });

  it.each(['missing_partition', 'failure: relation "orders" does not exist', 'not_found'])(
    'stops following a job that reports %s',
    async (final) => {
      const { statusAsks } = serving(['processing', final]);

      await userEvent.click(
        await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
      );
      await vi.waitFor(() => {
        expect(screen.getByTestId('job-state').textContent).toBe(final);
      });
      const asked = statusAsks();
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(statusAsks()).toBe(asked);
    },
  );

  it('shows every token of a build, one per partition', async () => {
    serving(['done'], ['aaa111', 'bbb222']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Build monthly_orders.by_status_month' }),
    );

    expect(await screen.findByTestId('job-aaa111')).toBeTruthy();
    expect(await screen.findByTestId('job-bbb222')).toBeTruthy();
  });
});
