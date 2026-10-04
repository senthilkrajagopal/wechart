import { describe, expect, it, vi } from 'vitest';

import { requestableChartId, requestCalculation } from './calcRequests';

/**
 * T383's review: a chart added, copied or duplicated on a dashboard being
 * edited is a draft (version 0) until the dashboard is saved, and the API
 * has no chart of its id to carry. So a request is offered on stored charts.
 */
describe('which chart a request can carry (T383, AC-050)', () => {
  it('a stored chart, by its id', () => {
    expect(requestableChartId('c1', 3)).toBe('c1');
  });

  it('none for a draft not yet saved, or one read without its version', () => {
    expect(requestableChartId('c1', 0)).toBeUndefined();
    expect(requestableChartId('c1', undefined)).toBeUndefined();
    expect(requestableChartId(undefined, 2)).toBeUndefined();
  });
});

/**
 * T383 / AC-050: the request is recorded with the chart, the fields in use
 * and the description (`POST /api/calc-requests`).
 */
describe('sending a calculation request (T383, AC-050)', () => {
  const asked = {
    chartId: 'chart-1',
    cube: 'fsales__orders',
    fields: {
      measures: ['fsales__orders.total_amount'],
      dimensions: [],
      timeDimensions: [],
      filters: [],
    },
    description: 'Margin',
  };

  it('posts the chart, its cube, the fields in use and the description', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: 'r-1' }), { status: 201 }),
    ) as unknown as typeof fetch;

    await expect(requestCalculation(asked, fetchImpl)).resolves.toBe('r-1');

    expect(fetchImpl).toHaveBeenCalledWith('/api/calc-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(asked),
    });
  });

  it('throws the API’s reason for a refusal', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'No one to ask.' }), { status: 409 }),
    ) as unknown as typeof fetch;

    await expect(requestCalculation(asked, fetchImpl)).rejects.toThrow('No one to ask.');
  });

  it('says so in its own words when the API gives none', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;

    await expect(requestCalculation(asked, fetchImpl)).rejects.toThrow(
      'The request couldn’t be sent (500). Try again.',
    );
  });
});
