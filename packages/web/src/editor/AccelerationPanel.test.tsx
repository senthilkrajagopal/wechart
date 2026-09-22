import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccelerationPanel } from './AccelerationPanel';

/**
 * T150 / AC-144: WHEN the user opens a chart's acceleration panel, THE SYSTEM
 * SHALL say whether the chart's query matches a pre-aggregation, and when it
 * does not, name the member that prevents the match.
 * Fails when: the panel reports a match that Cube does not use, or names no
 * reason for a miss.
 *
 * The panel says what the API answers: Cube's own match, or the member that
 * stops the nearest rollup (`/api/acceleration`).
 */
const query = { measures: ['monthly_orders.count'], dimensions: ['monthly_orders.id'] };

function answering(body: unknown) {
  const sent: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/acceleration');
      expect(init?.method).toBe('POST');
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccelerationPanel query={query} />
    </QueryClientProvider>,
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a chart’s acceleration panel', () => {
  it('says which rollup Cube serves the query from', async () => {
    const sent = answering({ matched: 'monthly_orders.by_status_month' });

    const status = await screen.findByTestId('acceleration-matched');
    expect(status.textContent).toBe(
      'Served from the pre-aggregation monthly_orders.by_status_month.',
    );
    expect(sent).toEqual([{ query }]);
  });

  it('on a miss, names the member that stops the nearest rollup, and the rollup', async () => {
    answering({
      matched: null,
      miss: {
        rollup: 'monthly_orders.by_status_month',
        member: 'monthly_orders.id',
        reason: 'monthly_orders.id is not one of the rollup’s dimensions.',
      },
    });

    const miss = await screen.findByTestId('acceleration-miss');
    expect(miss.querySelector('[data-testid="acceleration-member"]')?.textContent).toBe(
      'monthly_orders.id',
    );
    expect(miss.textContent).toBe(
      'Not served from a pre-aggregation; the nearest is monthly_orders.by_status_month. ' +
        'Stopped by monthly_orders.id: monthly_orders.id is not one of the rollup’s dimensions.',
    );
  });

  /**
   * T153 / AC-147: IF a query would fail under rollup-only mode, THEN THE
   * SYSTEM SHALL warn on the chart that it depends on the source database.
   * Fails when: such a chart shows no warning.
   *
   * Under rollup-only mode Cube refuses a query no pre-aggregation serves,
   * rather than falling back to the database (research/cube/
   * pre-aggregations.md §2, "No match") — so a miss is exactly such a chart.
   */
  it('warns that a chart no rollup serves depends on the source database', async () => {
    answering({
      matched: null,
      miss: { rollup: null, member: 'orders.count', reason: 'orders has no pre-aggregations.' },
    });

    const warning = await screen.findByTestId('rollup-only-warning');
    expect(warning.getAttribute('role')).toBe('status');
    expect(warning.querySelector('[data-icon="warning"]')).not.toBeNull();
    expect(warning.textContent).toBe(
      'Depends on the source database: in rollup-only mode, Cube would refuse this chart.',
    );
  });

  it('gives no such warning to a chart a rollup serves', async () => {
    answering({ matched: 'monthly_orders.by_status_month' });

    await screen.findByTestId('acceleration-matched');
    expect(screen.queryByTestId('rollup-only-warning')).toBeNull();
  });

  it('says so when the chart’s cubes have no rollups at all', async () => {
    answering({
      matched: null,
      miss: { rollup: null, member: 'orders.count', reason: 'orders has no pre-aggregations.' },
    });

    const miss = await screen.findByTestId('acceleration-miss');
    expect(miss.textContent).toBe(
      'Not served from a pre-aggregation. Stopped by orders.count: orders has no pre-aggregations.',
    );
  });
});
