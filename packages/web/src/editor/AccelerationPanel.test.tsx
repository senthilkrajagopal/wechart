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
